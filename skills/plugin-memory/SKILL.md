---
name: plugin-memory
description: >
  Guides correct integration with the plugin-memory library — SQLite-backed persistent memory
  for Claude-based plugins. Use when calling initMemory, reading or writing memory entries,
  searching memory, using scopes, integrating plugin-memory into a plugin, adding persistent
  memory to an agent, or implementing the memory tool interface. Trigger phrases: use
  plugin-memory, read memory, write memory, search memory, initMemory, store a decision to
  memory, load memory at session start, persist this to memory, add memory to my plugin,
  plugin-memory integration.
---

# plugin-memory Integration

`plugin-memory` is a local-first persistent memory library for Claude-based plugins. It exposes memory as explicit tool calls backed by SQLite + FTS5. No network calls. No daemons. No cloud.

## Quick reference

| Task | Tool | Scope |
|------|------|-------|
| Load context at session start | `read_memory` | `project` |
| Persist a decision | `write_memory` | `project` |
| Find prior art by keyword | `search_memory` | `project` |
| Correct a stale entry | `update_memory` | — (by id) |
| Remove a wrong entry | `forget_memory` | — (by id) |
| Inspect available scopes | `list_memory_scopes` | — |
| Rebuild FTS index | `rebuild_index` | — |
| Export to JSONL | `export_memory` | any |

## Reference loading guide

| Task | Load |
|------|------|
| API signatures and guardrails | `references/api-surface.md` |
| Integration patterns and lifecycle examples | `references/common-use-cases.md` |
| Errors, failure modes, workarounds | `references/troubleshooting-workarounds.md` |

Load only the reference required for the current task.

---

## Initialization

Call `initMemory()` once at plugin startup. It handles directory creation, schema migration, WAL mode, and FTS5 initialization automatically.

```typescript
import { initMemory } from 'plugin-memory'

const memory = await initMemory({
  projectKey: deriveProjectKey(process.cwd()), // slug derived from absolute CWD
  pluginId: 'my-plugin',
})
```

`deriveProjectKey(path)` — lowercase, replace non-alphanumeric with `-`:
```typescript
path.toLowerCase().replace(/[^a-z0-9-]/g, '-')
```

---

## Scope model

```
user        ← cross-project preferences, global conventions
  └── project   ← decisions, patterns, ADRs for this codebase (default write scope)
        └── plugin:X  ← plugin-internal state only
```

**Default write scope**: `project`. Use `plugin:X` only for data that must not bleed across plugins. Use `user` only for persistent user preferences valid on every project.

---

## Read/write discipline

| Trigger | Action |
|---------|--------|
| Session or task start | `read_memory(scope='project', type='decision', limit=10)` |
| Decision confirmed | `write_memory(type='decision', verified=true, confidence=1.0)` |
| Pattern observed twice | `write_memory(type='pattern', confidence=0.7)` |
| Prior entry superseded | `update_memory(id, content=...)` |
| Session closes with open work | `write_memory(type='state')` |
| Entry wrong or outdated | `forget_memory(id)` |

**Never write speculatively.** Surface candidate entries to the user: *"This appears to be a standing pattern — shall I record it to memory?"*

**Never write secrets, tokens, or credentials.** The library will reject entries matching common secret patterns.

---

## Entry types

| Type | Use |
|------|-----|
| `decision` | An architectural or technical decision |
| `adr` | Formal Architecture Decision Record |
| `pattern` | Recurring code or design pattern |
| `convention` | Coding convention or style rule |
| `preference` | User tool/communication preference |
| `summary` | Compressed session summary |
| `glossary` | Domain term definition |
| `state` | Ongoing incomplete work |
| `constraint` | Explicit boundary condition |

---

## Anti-patterns

| Anti-pattern | Correct approach |
|--------------|-----------------|
| Write on every message | Write at decision boundaries only |
| Write raw session transcripts | Write compressed `summary` entries |
| Write credentials or tokens | Library rejects; never attempt |
| Read entire database at session start | Read by `scope` + `type` + `limit` |
| Search without scoping | Always pass `scope` to `search_memory` |
| Skip `initMemory()` | Must be called before any tool use |
| Use `plugin:X` for cross-plugin data | Promote to `project` scope instead |

---

## Storage path (runtime)

```
macOS:   ~/Library/Application Support/plugin-memory/<project-key>/
Linux:   ~/.local/share/plugin-memory/<project-key>/
Windows: %APPDATA%\plugin-memory\<project-key>\
```

Each project directory contains `memory.db`, `memory.config.json`, and `exports/`.
