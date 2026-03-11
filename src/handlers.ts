import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { assertSafe } from './sanitise.js'
import type {
  WriteMemoryParams,
  ReadMemoryParams,
  SearchMemoryParams,
  UpdateMemoryParams,
  ForgetMemoryParams,
  ListMemoryScopesParams,
  MemoryEntry,
  WriteResult,
  UpdateResult,
  ForgetResult,
  RebuildResult,
  ScopeInfo,
  RawEntry,
} from './types.js'

interface HandlerOptions {
  projectKey: string
  pluginId: string
  maxContentBytes?: number
}

function deserialise(raw: RawEntry): MemoryEntry {
  return {
    id: raw.id,
    scope: raw.scope as MemoryEntry['scope'],
    pluginId: raw.plugin_id,
    projectKey: raw.project_key,
    type: raw.type as MemoryEntry['type'],
    content: raw.content,
    tags: JSON.parse(raw.tags) as string[],
    source: raw.source,
    confidence: raw.confidence,
    verified: raw.verified === 1,
    deleted: raw.deleted === 1,
    history: JSON.parse(raw.history) as string[],
    data: JSON.parse(raw.data) as Record<string, unknown>,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

export function createHandlers(db: Database.Database, opts: HandlerOptions) {
  const { projectKey, pluginId, maxContentBytes = 8192 } = opts

  // --- writeMemory ---

  function writeMemory(params: WriteMemoryParams): WriteResult {
    const {
      scope, type, content,
      tags = [], source, confidence = 1.0,
      verified = false, data = {},
    } = params

    if (Buffer.byteLength(content, 'utf8') > maxContentBytes) {
      throw new Error(`Content too long: max ${maxContentBytes} bytes allowed`)
    }
    assertSafe(content)

    const id = randomUUID()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO entries
        (id, scope, plugin_id, project_key, type, content, tags, source,
         confidence, verified, deleted, history, data, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', ?, ?, ?)
    `).run(
      id, scope, pluginId, projectKey, type, content,
      JSON.stringify(tags), source ?? null,
      confidence, verified ? 1 : 0,
      JSON.stringify(data), now, now
    )

    return { id, timestamp: now }
  }

  // --- readMemory ---

  function readMemory(params: ReadMemoryParams): MemoryEntry[] {
    const { scope, type, tags, limit = 10 } = params

    let sql = 'SELECT * FROM entries WHERE scope = ? AND project_key = ? AND deleted = 0'
    const bindings: unknown[] = [scope, projectKey]

    if (type) {
      sql += ' AND type = ?'
      bindings.push(type)
    }

    sql += ' ORDER BY updated_at DESC LIMIT ?'
    bindings.push(limit)

    const rows = db.prepare(sql).all(...bindings) as RawEntry[]
    const entries = rows.map(deserialise)

    if (tags && tags.length > 0) {
      return entries.filter(e => tags.every(t => e.tags.includes(t)))
    }
    return entries
  }

  // --- searchMemory ---

  function searchMemory(params: SearchMemoryParams): (MemoryEntry & { snippet: string })[] {
    const { query, scope, type, limit = 10 } = params

    // Sanitise FTS5 query: strip characters with special FTS5 meaning
    const safeQuery = query.replace(/["'*^()]/g, ' ').trim()
    if (!safeQuery) return []

    let sql = `
      SELECT e.*, snippet(entries_fts, 0, '<b>', '</b>', '...', 10) as snippet
      FROM entries_fts
      JOIN entries e ON entries_fts.rowid = e.rowid
      WHERE entries_fts MATCH ?
        AND e.project_key = ?
        AND e.deleted = 0
    `
    const bindings: unknown[] = [safeQuery, projectKey]

    if (scope) {
      sql += ' AND e.scope = ?'
      bindings.push(scope)
    }
    if (type) {
      sql += ' AND e.type = ?'
      bindings.push(type)
    }

    sql += ' ORDER BY rank LIMIT ?'
    bindings.push(limit)

    try {
      const rows = db.prepare(sql).all(...bindings) as (RawEntry & { snippet: string })[]
      return rows.map(r => ({ ...deserialise(r), snippet: r.snippet }))
    } catch {
      return []
    }
  }

  // --- updateMemory ---

  function updateMemory(params: UpdateMemoryParams): UpdateResult {
    const { id, content, tags, confidence, verified } = params

    const existing = db.prepare(
      'SELECT * FROM entries WHERE id = ? AND deleted = 0'
    ).get(id) as RawEntry | undefined

    if (!existing) throw new Error(`Entry not found: ${id}`)

    const now = new Date().toISOString()
    const history = JSON.parse(existing.history) as string[]
    const updates: string[] = ['updated_at = ?']
    const bindings: unknown[] = [now]

    if (content !== undefined) {
      if (Buffer.byteLength(content, 'utf8') > maxContentBytes) {
        throw new Error(`Content too long: max ${maxContentBytes} bytes allowed`)
      }
      assertSafe(content)
      history.push(existing.content)
      updates.push('content = ?', 'history = ?')
      bindings.push(content, JSON.stringify(history))
    }

    if (tags !== undefined) {
      updates.push('tags = ?')
      bindings.push(JSON.stringify(tags))
    }

    if (confidence !== undefined) {
      updates.push('confidence = ?')
      bindings.push(confidence)
    }

    if (verified !== undefined) {
      updates.push('verified = ?')
      bindings.push(verified ? 1 : 0)
    }

    bindings.push(id)
    db.prepare(`UPDATE entries SET ${updates.join(', ')} WHERE id = ?`).run(...bindings)

    return { id, updatedAt: now }
  }

  // --- forgetMemory ---

  function forgetMemory(params: ForgetMemoryParams): ForgetResult {
    const now = new Date().toISOString()
    db.prepare(
      'UPDATE entries SET deleted = 1, updated_at = ? WHERE id = ?'
    ).run(now, params.id)
    return { deleted: true }
  }

  // --- listMemoryScopes ---

  function listMemoryScopes(params?: ListMemoryScopesParams): ScopeInfo[] {
    const pKey = params?.projectKey ?? projectKey
    const rows = db.prepare(`
      SELECT scope, COUNT(*) as entry_count, MAX(updated_at) as last_updated
      FROM entries
      WHERE deleted = 0 AND project_key = ?
      GROUP BY scope
      ORDER BY last_updated DESC
    `).all(pKey) as { scope: string; entry_count: number; last_updated: string }[]

    return rows.map(r => ({
      scope: r.scope as ScopeInfo['scope'],
      entryCount: r.entry_count,
      lastUpdated: r.last_updated,
    }))
  }

  // --- rebuildIndex ---

  function rebuildIndex(): RebuildResult {
    db.exec("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')")
    const { n } = db.prepare(
      'SELECT COUNT(*) as n FROM entries WHERE deleted = 0'
    ).get() as { n: number }
    return { entriesIndexed: n }
  }

  return {
    writeMemory,
    readMemory,
    searchMemory,
    updateMemory,
    forgetMemory,
    listMemoryScopes,
    rebuildIndex,
  }
}
