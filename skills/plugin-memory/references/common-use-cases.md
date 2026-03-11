# Common Use Cases — plugin-memory

Covered patterns:

1. Session start — load project context
2. Persist an architectural decision
3. Record an observed pattern
4. Search for prior decisions before proposing
5. Correct a stale or wrong entry
6. Close session with pending work
7. Plugin-specific ephemeral state
8. Store user preferences
9. Formal Architecture Decision Record
10. Export memory for backup or migration

---

## 1. Session start — load project context

Load relevant decisions at the start of each session before taking any action.

```typescript
const memory = await initMemory({ projectKey, pluginId: 'my-plugin' })

const decisions = await memory.readMemory({
  scope: 'project',
  type: 'decision',
  limit: 10,
})

// Incorporate into context before reasoning
```

**Pattern**: Read once per session at task start — not on every message. Prefer narrow reads (`type` + `limit`) over broad scope dumps.

---

## 2. Persist an architectural decision

When a meaningful decision is confirmed, write it immediately with `verified=true`.

```typescript
await memory.writeMemory({
  scope: 'project',
  type: 'decision',
  content: 'Use React Query for all server state management. Evaluated SWR and Zustand; React Query won on DX and devtools.',
  tags: ['state-management', 'react-query', 'architecture'],
  confidence: 1.0,
  verified: true,
  source: 'session',
})
```

**When**: User confirms a decision in conversation. Do not write speculatively.

---

## 3. Record an observed pattern

When a pattern is seen twice, write with lower confidence. Promote to `verified=true` when user confirms.

```typescript
await memory.writeMemory({
  scope: 'project',
  type: 'pattern',
  content: 'All API error responses follow { error: string, code: string } shape. Handlers check code field first.',
  tags: ['api', 'error-handling'],
  confidence: 0.7,
  source: 'src/api/handlers.ts',
})
```

---

## 4. Search for prior decisions before proposing

Always search before recommending to avoid contradicting established decisions.

```typescript
const prior = await memory.searchMemory({
  query: 'authentication strategy',
  scope: 'project',
  limit: 5,
})

if (prior.length > 0) {
  // Surface existing decisions to user before proposing alternatives
}
```

**Rule**: Search first, propose second. Never write a new entry on a topic already decided.

---

## 5. Correct a stale or wrong entry

When prior context is superseded or corrected, update in place — do not write a duplicate.

```typescript
// First find the existing entry
const results = await memory.searchMemory({
  query: 'state management approach',
  scope: 'project',
})

// Update it
await memory.updateMemory({
  id: results[0].id,
  content: 'Migrated from Redux to Zustand in March 2026. React Query handles server state.',
  tags: ['state-management', 'zustand', 'migration'],
  confidence: 1.0,
})
```

**Anti-pattern**: Writing a new entry without checking for and updating the existing one creates conflicting memory.

---

## 6. Close session with pending work

At the end of a complex session, write a `state` entry to preserve in-progress context.

```typescript
await memory.writeMemory({
  scope: 'project',
  type: 'state',
  content: 'Auth refactor in progress. Completed: JWT extraction (auth/jwt.ts). Remaining: refresh token rotation, session invalidation endpoint.',
  tags: ['auth', 'refactor', 'in-progress'],
  confidence: 1.0,
})
```

**Maintenance**: Compact when `state` entries exceed 10 — merge into a single updated entry.

---

## 7. Plugin-specific ephemeral state

Use `plugin:X` scope for data that should not be visible to other plugins.

```typescript
await memory.writeMemory({
  scope: 'plugin',  // → becomes 'plugin:my-plugin' internally
  type: 'state',
  content: 'Feature blueprint for dashboard-v2 is in planning phase. Draft at cache/blueprints/dashboard-v2/',
  tags: ['blueprint', 'dashboard'],
})
```

**When**: Internal plugin planning state, not architectural decisions shared across plugins.

---

## 8. Store user preferences

Preferences that apply across all projects go to `user` scope.

```typescript
await memory.writeMemory({
  scope: 'user',
  type: 'preference',
  content: 'Always use bun instead of npm or yarn for package management.',
  tags: ['tooling', 'package-manager'],
  confidence: 1.0,
  verified: true,
})
```

**Note**: Only Claude acting on explicit user instruction should write to `user` scope. Plugins default to `project`.

---

## 9. Formal Architecture Decision Record

For significant decisions, use `adr` type for searchability.

```typescript
await memory.writeMemory({
  scope: 'project',
  type: 'adr',
  content: `ADR-001: Use SQLite + FTS5 as memory backend.
Context: Needed structured, queryable, local-first persistence.
Decision: SQLite with FTS5 extension. Single file, zero server, cross-platform.
Consequences: Human-readable exports required as separate Markdown layer.
Status: Accepted`,
  tags: ['adr', 'storage', 'sqlite'],
  verified: true,
})
```

---

## 10. Export memory for backup or migration

```typescript
const result = await memory.exportMemory({
  outputPath: '~/backups/project-memory-2026-03.jsonl',
})
// result.entryCount → number of entries exported
```

Exported JSONL is one entry per line. Idempotent — safe to re-import via `import_memory`.

---

## Happy-path lifecycle (complete example)

```typescript
// 1. Plugin startup
const memory = await initMemory({
  projectKey: deriveProjectKey(process.cwd()),
  pluginId: 'faah',
})

// 2. Session start: load context
const [decisions, patterns] = await Promise.all([
  memory.readMemory({ scope: 'project', type: 'decision', limit: 10 }),
  memory.readMemory({ scope: 'project', type: 'pattern', limit: 5 }),
])

// 3. Before proposing: check for prior decisions
const prior = await memory.searchMemory({
  query: 'component architecture',
  scope: 'project',
  limit: 3,
})

// 4. Decision confirmed: write immediately
await memory.writeMemory({
  scope: 'project',
  type: 'decision',
  content: 'Use compound component pattern for all complex UI components.',
  tags: ['components', 'architecture', 'pattern'],
  confidence: 1.0,
  verified: true,
})

// 5. Session close: preserve state
await memory.writeMemory({
  scope: 'project',
  type: 'summary',
  content: 'Session 2026-03-11: Established component architecture patterns. Next: implement Button and Modal compounds.',
  tags: ['session-summary'],
})
```
