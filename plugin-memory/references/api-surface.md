# API Surface — plugin-memory

All tools are accessed via the `MemoryClient` returned by `initMemory()`.

---

## `read_memory`

Retrieve entries from memory by scope, type, or tags.

**Signature**
```typescript
memory.readMemory({
  scope: 'user' | 'project' | 'plugin',
  type?: EntryType,
  tags?: string[],
  limit?: number,        // default: 10
  projectKey?: string,   // defaults to current project
}): Promise<MemoryEntry[]>
```

**Returns**
```typescript
{
  id: string,
  scope: string,
  type: string,
  content: string,
  tags: string[],
  source?: string,
  confidence: number,
  verified: boolean,
  createdAt: string,   // ISO 8601
  updatedAt: string,
}[]
```

**Guardrails**: Limit defaults to 10. No wildcard reads of entire database.

**When to call**: At session start, before architectural decisions, when task context is needed.

---

## `write_memory`

Store a new persistent memory entry.

**Signature**
```typescript
memory.writeMemory({
  scope: 'user' | 'project' | 'plugin',
  type: EntryType,
  content: string,       // max 8 KB (8192 bytes)
  tags?: string[],
  source?: string,       // file path, URL, or 'session'
  confidence?: number,   // 0.0–1.0, default: 1.0
  verified?: boolean,    // default: false
}): Promise<{ id: string, timestamp: string }>
```

**Guardrails**:
- Content must not contain credentials, API keys, or tokens
- Max content length: 8192 bytes
- Library sanitises content and aborts if secret patterns detected

**When to call**: Decision confirmed, pattern identified, preference established, ADR agreed, session closing with open work.

---

## `search_memory`

Full-text search across memory content using SQLite FTS5.

**Signature**
```typescript
memory.searchMemory({
  query: string,
  scope?: 'user' | 'project' | 'plugin',
  type?: EntryType,
  limit?: number,   // default: 10
}): Promise<SearchResult[]>
```

**Returns**
```typescript
{
  id: string,
  scope: string,
  type: string,
  content: string,
  tags: string[],
  snippet: string,    // FTS5 highlighted excerpt
  rank: number,
}[]
```

**Guardrails**: FTS5 query is sanitised. Returns empty array on no match — never throws.

**When to call**: Exploring prior decisions, finding relevant patterns, orienting on unfamiliar territory.

---

## `update_memory`

Update an existing entry. Non-destructive — prior content stored in `history`.

**Signature**
```typescript
memory.updateMemory({
  id: string,
  content?: string,
  tags?: string[],
  confidence?: number,
}): Promise<{ id: string, updatedAt: string }>
```

**Guardrails**: Prior versions preserved in `history` JSON column. ID must exist.

**When to call**: Entry is superseded, corrected, or clarified.

---

## `forget_memory`

Delete a memory entry. Soft-delete first; hard-delete after 30-day retention window.

**Signature**
```typescript
memory.forgetMemory({
  id: string,
}): Promise<{ deleted: true }>
```

**Behavior**: Sets `deleted=true` immediately. Hard-deleted during next `rebuild_index` after 30-day retention window. User can inspect soft-deleted entries in that window.

**When to call**: Entry is wrong, outdated, or user explicitly requests deletion.

---

## `list_memory_scopes`

Enumerate available scopes and their entry counts.

**Signature**
```typescript
memory.listMemoryScopes({
  projectKey?: string,
}): Promise<ScopeInfo[]>
```

**Returns**
```typescript
{
  scope: string,
  entryCount: number,
  lastUpdated: string,
}[]
```

**When to call**: Session start orientation, debugging memory state.

---

## `rebuild_index`

Reconstruct the FTS5 search index from the SQLite source of truth.

**Signature**
```typescript
memory.rebuildIndex(): Promise<{ entriesIndexed: number }>
```

**Guardrails**: Safe at any time. Runs in a transaction. Also hard-deletes entries past the 30-day soft-delete retention window.

**When to call**: After manual DB edits, after import, on suspected index corruption.

---

## `export_memory`

Export all memory entries to a portable JSONL file.

**Signature**
```typescript
memory.exportMemory({
  outputPath?: string,   // defaults to exports/ in project data dir
  scope?: string,
}): Promise<{ exportedPath: string, entryCount: number }>
```

**Guardrails**: Exported file written to user-specified path only.

**When to call**: Backup, migration between machines, sharing project context.

---

## MCP tool schema (write_memory example)

```typescript
export const writeMemoryTool = {
  name: 'write_memory',
  description: 'Store a persistent memory entry scoped to the current project.',
  inputSchema: {
    type: 'object',
    properties: {
      scope:      { type: 'string', enum: ['user', 'project', 'plugin'] },
      type:       { type: 'string', enum: ['decision', 'adr', 'pattern', 'convention',
                    'preference', 'summary', 'glossary', 'state', 'constraint'] },
      content:    { type: 'string', maxLength: 8192 },
      tags:       { type: 'array', items: { type: 'string' } },
      source:     { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['scope', 'type', 'content'],
  },
}
```

---

## Tag conventions

- Short, reusable tokens: `['auth', 'pattern']` not `['authentication-pattern-for-login']`
- Established type values cover domain classification; tags add cross-cutting facets
- Consistency across plugins enables cross-scope retrieval
