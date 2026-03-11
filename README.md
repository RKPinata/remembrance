# remembrance

SQLite-backed persistent memory layer for Claude-based plugins.

## Installation

```bash
npm install remembrance
```

## Quick start

Call `initMemory()` once at plugin startup. It handles directory creation, schema
migration, WAL mode, and FTS5 initialization automatically.

```typescript
import { initMemory, deriveProjectKey } from "remembrance";

const memory = await initMemory({
  projectKey: deriveProjectKey(process.cwd()),
  pluginId: "my-plugin",
});

// Session start — load context
const decisions = await memory.readMemory({
  scope: "project",
  type: "decision",
  limit: 10,
});

// Decision confirmed — persist it
await memory.writeMemory({
  scope: "project",
  type: "decision",
  content: "Use compound component pattern for all complex UI components.",
  tags: ["components", "architecture"],
  confidence: 1.0,
  verified: true,
});
```

`deriveProjectKey` is exported from the package. Import it directly — do not reimplement it.

## Scope model

```
user        ← cross-project preferences, global conventions
  └── project   ← decisions, patterns, ADRs for this codebase (default write scope)
        └── plugin:X  ← plugin-internal state only
```

**Default write scope:** `project`. Use `plugin:X` only for data that must not bleed
across plugins. Use `user` only for persistent preferences valid on every project.

## MemoryClient API

| Method             | Description                                       | When to call                                            |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------- |
| `readMemory`       | Retrieve entries by scope, type, or tags          | Session start, before architectural decisions           |
| `writeMemory`      | Store a new persistent entry                      | Decision confirmed, pattern identified, session closing |
| `searchMemory`     | Full-text search via SQLite FTS5                  | Finding prior decisions, exploring patterns             |
| `updateMemory`     | Update an existing entry (non-destructive)        | Entry superseded or corrected                           |
| `forgetMemory`     | Soft-delete an entry (hard-deleted after 30 days) | Entry wrong or outdated                                 |
| `listMemoryScopes` | Enumerate scopes and entry counts                 | Session orientation, debugging                          |
| `rebuildIndex`     | Reconstruct FTS5 index from source of truth       | After manual DB edits, suspected corruption             |
| `exportMemory`     | Export all entries to JSONL                       | Backup, migration between machines                      |

## Entry types

| Type         | Use                                    |
| ------------ | -------------------------------------- |
| `decision`   | An architectural or technical decision |
| `adr`        | Formal Architecture Decision Record    |
| `pattern`    | Recurring code or design pattern       |
| `convention` | Coding convention or style rule        |
| `preference` | User tool or communication preference  |
| `summary`    | Compressed session summary             |
| `glossary`   | Domain term definition                 |
| `state`      | Ongoing incomplete work                |
| `constraint` | Explicit boundary condition            |

## Storage paths

```
macOS:   ~/Library/Application Support/remembrance/<project-key>/
Linux:   ~/.local/share/remembrance/<project-key>/
Windows: %APPDATA%\\remembrance\\<project-key>\\
```

Each project directory contains `memory.db`, `memory.config.json`, and `exports/`.

## Claude plugin

Install the Claude Code plugin from the RKPinata marketplace to get:

- A skill that guides Claude to write correct `initMemory()` integration code
- An auto-registered MCP server for testing memory tools during development
- A `/memory-status` command to inspect stored entries

```
/plugin install remembrance@rkpinata-plugins
```

## License

MIT
