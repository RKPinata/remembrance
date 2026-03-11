import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { exportToJsonl, importFromJsonl, appendToMarkdown, getMarkdownPath } from '../src/export.js'
import { openDatabase, closeDatabase } from '../src/db.js'
import { createHandlers } from '../src/handlers.js'
import type Database from 'better-sqlite3'
import { rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const testDir = join(tmpdir(), 'remambrance-test-export-' + Math.random().toString(36).slice(2))
let db: Database.Database
let handlers: ReturnType<typeof createHandlers>

beforeEach(() => {
  const result = openDatabase(testDir)
  db = result.db
  handlers = createHandlers(db, { projectKey: 'test', pluginId: 'test' })
})

afterEach(() => {
  closeDatabase(db)
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true })
})

describe('exportToJsonl', () => {
  it('exports entries as JSONL — one JSON object per line', async () => {
    handlers.writeMemory({ scope: 'project', type: 'decision', content: 'Decision A' })
    handlers.writeMemory({ scope: 'project', type: 'pattern', content: 'Pattern B' })

    const outPath = join(testDir, 'export.jsonl')
    const result = await exportToJsonl(db, { outputPath: outPath, projectKey: 'test' })

    expect(result.entryCount).toBe(2)
    expect(existsSync(outPath)).toBe(true)

    const lines = readFileSync(outPath, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0])).toHaveProperty('content')
  })

  it('filters by scope when scope is provided', async () => {
    handlers.writeMemory({ scope: 'project', type: 'decision', content: 'Project decision' })
    handlers.writeMemory({ scope: 'user', type: 'preference', content: 'User preference' })

    const outPath = join(testDir, 'export-project.jsonl')
    const result = await exportToJsonl(db, { outputPath: outPath, projectKey: 'test', scope: 'project' })
    expect(result.entryCount).toBe(1)
  })
})

describe('importFromJsonl', () => {
  it('re-imports entries from a JSONL file', async () => {
    handlers.writeMemory({ scope: 'project', type: 'decision', content: 'To export and reimport' })
    const outPath = join(testDir, 'export.jsonl')
    await exportToJsonl(db, { outputPath: outPath, projectKey: 'test' })

    // Clear and reimport
    db.exec('DELETE FROM entries')
    await importFromJsonl(db, outPath)

    const entries = handlers.readMemory({ scope: 'project', limit: 100 })
    expect(entries).toHaveLength(1)
    expect(entries[0].content).toBe('To export and reimport')
  })

  it('throws for a missing file', async () => {
    await expect(importFromJsonl(db, '/nonexistent/path.jsonl')).rejects.toThrow(/not found/)
  })
})

describe('appendToMarkdown', () => {
  it('appends a formatted entry to a markdown file', async () => {
    const mdPath = join(testDir, 'decisions.md')
    await appendToMarkdown({
      filePath: mdPath,
      type: 'decision',
      content: 'Use SQLite for storage',
      tags: ['architecture', 'storage'],
      timestamp: '2026-03-11T00:00:00.000Z',
    })

    const md = readFileSync(mdPath, 'utf8')
    expect(md).toContain('Use SQLite for storage')
    expect(md).toContain('architecture')
    expect(md).toContain('2026-03-11')
  })

  it('creates parent directories if they do not exist', async () => {
    const mdPath = join(testDir, 'nested', 'dir', 'decisions.md')
    await appendToMarkdown({
      filePath: mdPath,
      type: 'decision',
      content: 'Nested entry',
      tags: [],
      timestamp: '2026-03-11T00:00:00.000Z',
    })
    expect(existsSync(mdPath)).toBe(true)
  })
})

describe('getMarkdownPath', () => {
  it('maps decision type to decisions.md', () => {
    const p = getMarkdownPath('/exports', 'decision')
    expect(p).toContain('decisions.md')
  })

  it('maps unknown type to misc.md', () => {
    const p = getMarkdownPath('/exports', 'unknown-type')
    expect(p).toContain('misc.md')
  })

  it('maps adr type to adrs/index.md', () => {
    expect(getMarkdownPath('/exports', 'adr')).toContain('adrs/index.md')
  })
})
