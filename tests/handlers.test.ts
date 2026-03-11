import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDatabase, closeDatabase } from '../src/db.js'
import { createHandlers } from '../src/handlers.js'
import type Database from 'better-sqlite3'
import { rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const testDir = join(tmpdir(), 'plugin-memory-test-handlers')
let db: Database.Database
let handlers: ReturnType<typeof createHandlers>

beforeEach(() => {
  const result = openDatabase(testDir)
  db = result.db
  handlers = createHandlers(db, { projectKey: 'test-project', pluginId: 'test-plugin' })
})

afterEach(() => {
  closeDatabase(db)
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true })
})

// --- writeMemory ---

describe('writeMemory', () => {
  it('returns an id (UUID) and timestamp', () => {
    const result = handlers.writeMemory({
      scope: 'project',
      type: 'decision',
      content: 'Use React Query for state management',
    })
    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  it('persists the entry to the database', () => {
    const { id } = handlers.writeMemory({
      scope: 'project',
      type: 'decision',
      content: 'Use React Query',
    })
    const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as Record<string, unknown>
    expect(row).toBeTruthy()
    expect(row['content']).toBe('Use React Query')
  })

  it('stores tags as a JSON array', () => {
    const { id } = handlers.writeMemory({
      scope: 'project',
      type: 'decision',
      content: 'Tagged entry',
      tags: ['react', 'state'],
    })
    const row = db.prepare('SELECT tags FROM entries WHERE id = ?').get(id) as { tags: string }
    expect(JSON.parse(row.tags)).toEqual(['react', 'state'])
  })

  it('throws when content contains a secret', () => {
    expect(() => handlers.writeMemory({
      scope: 'project',
      type: 'decision',
      content: 'api_key=sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789',
    })).toThrow(/secret/)
  })

  it('throws when content exceeds maxContentBytes', () => {
    expect(() => handlers.writeMemory({
      scope: 'project',
      type: 'decision',
      content: 'a'.repeat(9000),
    })).toThrow(/too long/)
  })
})

// --- readMemory ---

describe('readMemory', () => {
  it('returns entries matching scope', () => {
    handlers.writeMemory({ scope: 'project', type: 'decision', content: 'Decision A' })
    handlers.writeMemory({ scope: 'user', type: 'preference', content: 'Preference B' })
    const results = handlers.readMemory({ scope: 'project' })
    expect(results).toHaveLength(1)
    expect(results[0].content).toBe('Decision A')
  })

  it('filters by type', () => {
    handlers.writeMemory({ scope: 'project', type: 'decision', content: 'Decision' })
    handlers.writeMemory({ scope: 'project', type: 'pattern', content: 'Pattern' })
    const results = handlers.readMemory({ scope: 'project', type: 'decision' })
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('decision')
  })

  it('excludes soft-deleted entries', () => {
    const { id } = handlers.writeMemory({ scope: 'project', type: 'decision', content: 'To delete' })
    handlers.forgetMemory({ id })
    const results = handlers.readMemory({ scope: 'project' })
    expect(results).toHaveLength(0)
  })

  it('respects the limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      handlers.writeMemory({ scope: 'project', type: 'decision', content: `Decision ${i}` })
    }
    const results = handlers.readMemory({ scope: 'project', limit: 3 })
    expect(results).toHaveLength(3)
  })

  it('returns tags as parsed arrays', () => {
    handlers.writeMemory({ scope: 'project', type: 'decision', content: 'Tagged', tags: ['a', 'b'] })
    const results = handlers.readMemory({ scope: 'project' })
    expect(results[0].tags).toEqual(['a', 'b'])
  })

  it('returns verified as a boolean', () => {
    handlers.writeMemory({ scope: 'project', type: 'decision', content: 'Verified', verified: true })
    const results = handlers.readMemory({ scope: 'project' })
    expect(results[0].verified).toBe(true)
  })
})

// --- searchMemory ---

describe('searchMemory', () => {
  it('returns matching entries', () => {
    handlers.writeMemory({ scope: 'project', type: 'decision', content: 'Use React Query for state management' })
    handlers.writeMemory({ scope: 'project', type: 'decision', content: 'Use PostgreSQL for the database' })
    const results = handlers.searchMemory({ query: 'React Query' })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].content).toContain('React Query')
  })

  it('returns empty array for no match', () => {
    handlers.writeMemory({ scope: 'project', type: 'decision', content: 'Something unrelated' })
    const results = handlers.searchMemory({ query: 'xyzzy-no-match-at-all' })
    expect(results).toEqual([])
  })

  it('returns empty array for dangerous FTS5 query characters', () => {
    const results = handlers.searchMemory({ query: '"' })
    expect(results).toEqual([])
  })

  it('includes a snippet field on each result', () => {
    handlers.writeMemory({ scope: 'project', type: 'decision', content: 'React is a UI library for building interfaces' })
    const results = handlers.searchMemory({ query: 'React' })
    if (results.length > 0) {
      expect(typeof results[0].snippet).toBe('string')
    }
  })
})

// --- updateMemory ---

describe('updateMemory', () => {
  it('updates content and preserves prior content in history', () => {
    const { id } = handlers.writeMemory({ scope: 'project', type: 'decision', content: 'Original content' })
    handlers.updateMemory({ id, content: 'Updated content' })
    const [entry] = handlers.readMemory({ scope: 'project' })
    expect(entry.content).toBe('Updated content')
    expect(entry.history).toContain('Original content')
  })

  it('updates tags without altering content', () => {
    const { id } = handlers.writeMemory({ scope: 'project', type: 'decision', content: 'Content', tags: ['old'] })
    handlers.updateMemory({ id, tags: ['new'] })
    const [entry] = handlers.readMemory({ scope: 'project' })
    expect(entry.tags).toEqual(['new'])
    expect(entry.content).toBe('Content')
  })

  it('updates verified flag', () => {
    const { id } = handlers.writeMemory({ scope: 'project', type: 'decision', content: 'Unverified' })
    handlers.updateMemory({ id, verified: true })
    const [entry] = handlers.readMemory({ scope: 'project' })
    expect(entry.verified).toBe(true)
  })

  it('throws for an unknown id', () => {
    expect(() => handlers.updateMemory({ id: 'nonexistent-id', content: 'New' })).toThrow()
  })
})

// --- forgetMemory ---

describe('forgetMemory', () => {
  it('soft-deletes the entry (not visible via readMemory)', () => {
    const { id } = handlers.writeMemory({ scope: 'project', type: 'decision', content: 'To forget' })
    const result = handlers.forgetMemory({ id })
    expect(result.deleted).toBe(true)
    const entries = handlers.readMemory({ scope: 'project' })
    expect(entries.find(e => e.id === id)).toBeUndefined()
  })

  it('sets deleted=1 in the database (entry still physically present)', () => {
    const { id } = handlers.writeMemory({ scope: 'project', type: 'decision', content: 'Soft deleted' })
    handlers.forgetMemory({ id })
    const row = db.prepare('SELECT deleted FROM entries WHERE id = ?').get(id) as { deleted: number }
    expect(row.deleted).toBe(1)
  })
})

// --- listMemoryScopes ---

describe('listMemoryScopes', () => {
  it('returns scope info with correct entry counts', () => {
    handlers.writeMemory({ scope: 'project', type: 'decision', content: 'Decision A' })
    handlers.writeMemory({ scope: 'project', type: 'pattern', content: 'Pattern B' })
    handlers.writeMemory({ scope: 'user', type: 'preference', content: 'Preference C' })
    const scopes = handlers.listMemoryScopes()
    const projectScope = scopes.find(s => s.scope === 'project')
    expect(projectScope?.entryCount).toBe(2)
  })

  it('excludes soft-deleted entries from count', () => {
    const { id } = handlers.writeMemory({ scope: 'project', type: 'decision', content: 'To delete' })
    handlers.writeMemory({ scope: 'project', type: 'decision', content: 'Kept' })
    handlers.forgetMemory({ id })
    const scopes = handlers.listMemoryScopes()
    const projectScope = scopes.find(s => s.scope === 'project')
    expect(projectScope?.entryCount).toBe(1)
  })
})

// --- rebuildIndex ---

describe('rebuildIndex', () => {
  it('returns the count of non-deleted indexed entries', () => {
    handlers.writeMemory({ scope: 'project', type: 'decision', content: 'Entry A' })
    handlers.writeMemory({ scope: 'project', type: 'decision', content: 'Entry B' })
    const result = handlers.rebuildIndex()
    expect(result.entriesIndexed).toBe(2)
  })

  it('does not throw when called on an empty database', () => {
    expect(() => handlers.rebuildIndex()).not.toThrow()
  })
})
