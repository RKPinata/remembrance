import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initMemory } from '../src/index.js'
import { rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const testBaseDir = join(tmpdir(), 'plugin-memory-integration')
let memory: Awaited<ReturnType<typeof initMemory>>

beforeAll(async () => {
  memory = await initMemory({
    projectKey: 'integration-test',
    pluginId: 'test-plugin',
    baseDir: testBaseDir,
    markdownExport: false,
  })
})

afterAll(async () => {
  memory?.close()
  if (existsSync(testBaseDir)) {
    rmSync(testBaseDir, { recursive: true, force: true })
  }
})

describe('Full lifecycle via initMemory', () => {
  it('writes and reads a decision entry', () => {
    const { id } = memory.writeMemory({
      scope: 'project',
      type: 'decision',
      content: 'Use SQLite for persistent memory storage',
      tags: ['architecture', 'storage'],
      confidence: 1.0,
    })
    expect(id).toBeTruthy()

    const entries = memory.readMemory({ scope: 'project', type: 'decision' })
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.some(e => e.id === id)).toBe(true)
    const entry = entries.find(e => e.id === id)!
    expect(entry.content).toContain('SQLite')
    expect(entry.tags).toContain('architecture')
  })

  it('searches by keyword and returns relevant results', () => {
    memory.writeMemory({
      scope: 'project',
      type: 'pattern',
      content: 'Use camelCase for TypeScript variable naming',
      tags: ['convention', 'typescript'],
    })

    const results = memory.searchMemory({ query: 'camelCase TypeScript' })
    expect(results.length).toBeGreaterThan(0)
  })

  it('updates an entry and preserves history', () => {
    const { id } = memory.writeMemory({
      scope: 'project',
      type: 'decision',
      content: 'Original decision text',
    })

    memory.updateMemory({ id, content: 'Revised decision text', verified: true })

    const entries = memory.readMemory({ scope: 'project', limit: 50 })
    const updated = entries.find(e => e.id === id)!
    expect(updated.content).toBe('Revised decision text')
    expect(updated.history).toContain('Original decision text')
    expect(updated.verified).toBe(true)
  })

  it('forgets an entry via soft delete', () => {
    const { id } = memory.writeMemory({
      scope: 'project',
      type: 'state',
      content: 'Temporary state entry to forget',
    })

    memory.forgetMemory({ id })

    const entries = memory.readMemory({ scope: 'project', limit: 100 })
    expect(entries.find(e => e.id === id)).toBeUndefined()
  })

  it('lists scopes with entry counts', () => {
    const scopes = memory.listMemoryScopes()
    expect(scopes.some(s => s.scope === 'project')).toBe(true)
    const projectScope = scopes.find(s => s.scope === 'project')!
    expect(projectScope.entryCount).toBeGreaterThan(0)
  })

  it('rebuilds the search index', () => {
    const result = memory.rebuildIndex()
    expect(typeof result.entriesIndexed).toBe('number')
    expect(result.entriesIndexed).toBeGreaterThan(0)
  })

  it('exports memory to JSONL', async () => {
    const result = await memory.exportMemory({
      outputPath: join(testBaseDir, 'test-export.jsonl'),
    })
    expect(result.entryCount).toBeGreaterThan(0)
    expect(existsSync(result.exportedPath)).toBe(true)
  })

  it('refuses to write secrets', () => {
    expect(() => memory.writeMemory({
      scope: 'project',
      type: 'decision',
      content: 'ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456',
    })).toThrow(/secret/)
  })
})
