import type Database from 'better-sqlite3'
import { writeFileSync, appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ExportResult, RawEntry } from './types.js'

export async function exportToJsonl(
  db: Database.Database,
  params: { outputPath: string; scope?: string; projectKey: string }
): Promise<ExportResult> {
  const { outputPath, scope, projectKey } = params

  let sql = 'SELECT * FROM entries WHERE deleted = 0 AND project_key = ?'
  const bindings: unknown[] = [projectKey]

  if (scope) {
    sql += ' AND scope = ?'
    bindings.push(scope)
  }

  const rows = db.prepare(sql).all(...bindings) as RawEntry[]

  mkdirSync(dirname(outputPath), { recursive: true })
  const lines = rows.map(r => JSON.stringify(r)).join('\n')
  writeFileSync(outputPath, rows.length > 0 ? lines + '\n' : '', { encoding: 'utf8' })

  return { exportedPath: outputPath, entryCount: rows.length }
}

export async function importFromJsonl(db: Database.Database, inputPath: string): Promise<number> {
  if (!existsSync(inputPath)) {
    throw new Error(`Import file not found: ${inputPath}`)
  }

  const lines = readFileSync(inputPath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO entries
      (id, scope, plugin_id, project_key, type, content, tags, source,
       confidence, verified, deleted, history, data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let count = 0
  db.transaction(() => {
    for (let i = 0; i < lines.length; i++) {
      let r: RawEntry
      try {
        r = JSON.parse(lines[i]) as RawEntry
      } catch (e) {
        throw new Error(`Failed to parse JSONL line ${i + 1}: ${(e as Error).message}`)
      }
      upsert.run(
        r.id, r.scope, r.plugin_id, r.project_key, r.type, r.content,
        r.tags, r.source, r.confidence, r.verified, r.deleted,
        r.history, r.data, r.created_at, r.updated_at
      )
      count++
    }
  })()

  return count
}

export async function appendToMarkdown(params: {
  filePath: string
  type: string
  content: string
  tags: string[]
  timestamp: string
}): Promise<void> {
  const { filePath, type, content, tags, timestamp } = params
  mkdirSync(dirname(filePath), { recursive: true })

  const tagStr = tags.length > 0 ? `\`${tags.join('`, `')}\`` : '_none_'
  const entry = [
    ``,
    `## ${timestamp.slice(0, 10)} — ${type}`,
    ``,
    content,
    ``,
    `**Tags:** ${tagStr}`,
    ``,
    `---`,
    ``,
  ].join('\n')

  appendFileSync(filePath, entry, 'utf8')
}

const MARKDOWN_FILE_MAP: Record<string, string> = {
  decision: 'decisions.md',
  adr: 'adrs/index.md',
  pattern: 'patterns.md',
  convention: 'patterns.md',
  preference: 'preferences.md',
  summary: 'summaries.md',
  glossary: 'glossary.md',
  state: 'state.md',
  constraint: 'constraints.md',
}

export function getMarkdownPath(exportsDir: string, type: string): string {
  return join(exportsDir, MARKDOWN_FILE_MAP[type] ?? 'misc.md')
}
