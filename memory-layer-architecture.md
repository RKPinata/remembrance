# Plugin Memory Layer Architecture
## A Reusable Memory Layer for Claude-Based Plugin Ecosystems

_Authored by Rialita | 2026-03-09_

---

## 1. Executive Recommendation

**Recommended architecture**: SQLite as the structured source of truth, paired with human-readable Markdown artefacts for inspectable outputs, and an MCP-compatible tool interface as the integration surface.

**Default stack**:

| Layer | Choice |
|---|---|
| Interface | MCP tools (or direct function calls if MCP is unavailable) |
| Persistence | SQLite via `better-sqlite3` (Node) or `sqlite3` (Python) |
| Human layer | Markdown files in a well-known local directory |
| Search | SQLite FTS5 (built-in full-text search — no extra dependency) |
| Config | Single JSON file per project |
| Schema versioning | SQLite `user_version` pragma + migration runner |

**Why this wins**: SQLite is a single file, zero-server, cross-platform, inspectable, battle-tested, and natively supported on every OS. It handles concurrent reads, transactional writes, and full-text search without any daemon. Markdown files give the user a human-readable window into stored knowledge. The MCP tool surface gives Claude a clean, typed interface to memory without hardcoding plugin logic.

---

## 2. Recommended Stack

### Transport / Interface Layer

**Mandatory**: Expose memory as a set of named tools. Use MCP tool protocol if the plugin ecosystem already uses MCP. If not, expose as plain async functions with the same signatures.

**Avoided**: Do not use HTTP servers, sockets, or any process-local IPC. Memory access must be in-process or via a local MCP server — never a remote call.

### Runtime / Language

**Mandatory**: Match the runtime of the host plugin. If the plugin is TypeScript/Node, use `better-sqlite3`. If Python, use the stdlib `sqlite3` module. Do not add a foreign runtime dependency.

### Local Persistence Layer

**Mandatory**: SQLite (`memory.db`) — single file, zero-config, supports transactions, FTS5, WAL mode.

**Optional**: Write-through Markdown exports for user-facing artefacts (decisions, summaries, glossary).

**Avoided**: PostgreSQL, Redis, MongoDB, LevelDB. All require a running process. Unacceptable for local-first design.

### Storage Format

| What | Format |
|---|---|
| Structured records | SQLite tables |
| Human-readable summaries | Markdown (`.md`) |
| Config | JSON (`.json`) |
| Exports | JSONL or Markdown |

### Indexing / Search

**Mandatory**: SQLite FTS5 virtual table for full-text search over memory content. No extra binary required — FTS5 ships with SQLite on all major platforms.

**Optional**: For semantic search, `sqlite-vss` (SQLite vector extension) — but treat this as optional and additive. Do not make the base memory layer depend on it.

### Schema Format

SQLite schema, versioned via `PRAGMA user_version`. Migrations stored as numbered SQL files in the package. Migration runner executes them in sequence on first use and on upgrades.

### Packaging / Distribution

The memory layer is a single importable library — `plugin-memory` or equivalent. Plugin authors add it as a dependency and call `initMemory(config)`. No global daemon, no install script.

### Configuration

Single `memory.config.json` per project workspace:

```json
{
  "schemaVersion": 3,
  "projectKey": "my-project",
  "memoryDir": "~/.claude/plugins/local/my-plugin/memory/my-project",
  "plugins": ["faah", "core"],
  "fts": true,
  "markdownExport": true
}
```

### Migration / Versioning

On `initMemory()`, the library:
1. Reads `PRAGMA user_version` from `memory.db`
2. Compares against the package's `CURRENT_SCHEMA_VERSION`
3. Runs any pending numbered migration SQL files in order
4. Updates `user_version`

No destructive migrations. Additive only. Deprecated columns are tombstoned, not dropped.

---

## 3. Anthropic-Aligned Design

### Tool-Based Memory

Anthropic's model for long-running agents externalises memory as explicit tool calls rather than relying on the context window. This design follows that pattern exactly: Claude never reads memory implicitly. Every memory access is a named tool call with explicit inputs and outputs. The model reasons about what to read or write.

### Explicit Externalisation

Working context (the current session's notes, intermediate reasoning) is kept in the context window. Persistent memory is written explicitly to the store via `write_memory`. The separation is strict: nothing persists unless Claude or the plugin calls a write tool.

### Long-Running Agent Context Handling

For long agent runs, the plugin calls `read_memory` at the start of each major step to load relevant context, rather than accumulating all prior context in the window. This compresses the effective context footprint and keeps the window clean for reasoning.

### Separation of Working Context vs Persistent Memory

| Type | Location | Lifetime |
|---|---|---|
| Active reasoning | Context window | Session only |
| Interim scratchpad | Tool output, in-window | Session only |
| Decisions, patterns, ADRs | SQLite + Markdown | Permanent |
| Summaries | Markdown export | Permanent |

### Memory Read/Write Patterns

- **Read first**: Before starting a task, call `read_memory` with relevant scope and tags
- **Write on decision**: When a meaningful decision, preference, or pattern is established, call `write_memory` immediately
- **Summarise on close**: At end of complex sessions, call `write_memory` with a summary entry

### Safety and User Control

- All memory is local files the user can inspect, edit, and delete
- `forget_memory` is a first-class tool — it is never harder to delete than to write
- No entry is written without an explicit tool call — no background auto-capture

---

## 4. Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Claude (LLM)                         │
│                                                           │
│  Reasons about task → calls memory tools explicitly      │
└───────────────────────┬───────────────────────────────────┘
                        │ MCP tool calls
                        ▼
┌─────────────────────────────────────────────────────────┐
│                  Memory Tool Interface                    │
│                                                           │
│  read_memory | write_memory | search_memory              │
│  update_memory | forget_memory | list_scopes             │
│  export_memory | rebuild_index                           │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│               Memory Library (plugin-memory)             │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  SQLite DB   │  │  Markdown    │  │  Config       │  │
│  │  memory.db   │  │  Exports     │  │  memory.      │  │
│  │  (FTS5)      │  │  *.md        │  │  config.json  │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
┌────────────────────┐  ┌────────────────────────┐
│   Plugin A (faah)  │  │   Plugin B (other)     │
│   Reads/writes to  │  │   Reads/writes to      │
│   its own scope    │  │   its own scope        │
│   + shared scope   │  │   + shared scope       │
└────────────────────┘  └────────────────────────┘
```

### Data Flow: Write

```
Claude calls write_memory(scope="project", type="decision", content="...", tags=["auth"])
  → Memory library receives call
  → Inserts record into SQLite: entries table
  → FTS5 index updated automatically via SQLite trigger
  → If markdownExport=true: appends to decisions.md in export dir
  → Returns { id, timestamp, scope }
```

### Data Flow: Read

```
Claude calls read_memory(scope="project", type="decision", limit=5)
  → Memory library queries SQLite: SELECT * FROM entries WHERE scope=? AND type=? ORDER BY updated_at DESC LIMIT ?
  → Returns array of entry objects
  → Claude incorporates into context window
```

### Data Flow: Search

```
Claude calls search_memory(query="authentication pattern", scope="project")
  → Memory library runs FTS5 query: SELECT * FROM entries_fts WHERE entries_fts MATCH ? AND scope=?
  → Returns ranked results with snippets
  → Claude selects relevant entries
```

### How Plugins Integrate Without Tight Coupling

Each plugin uses the same `plugin-memory` library instance but operates in its own scope namespace (`plugin:faah`, `plugin:core`). The shared `project` scope is available to all plugins. Plugins do not call each other's scoped memory directly. Cross-plugin shared knowledge is promoted to the `project` scope explicitly.

---

## 5. Reusable Plugin Memory Framework

### Standard Tool Interface (MCP tool definitions)

```typescript
// Minimal integration contract for any plugin
import { initMemory, MemoryClient } from 'plugin-memory'

const memory: MemoryClient = await initMemory({
  projectKey: 'my-project',
  pluginId: 'my-plugin',
  baseDir: getMemoryBaseDir(), // resolves XDG/platform path
})

// Plugin now has access to all memory tools scoped to its plugin + project
```

### Minimal Integration Contract

A plugin author must provide:
1. `pluginId` — a stable string identifier
2. `projectKey` — derived from project root (absolute path → slug)
3. A call to `initMemory()` at plugin startup

That is all. The library handles directory creation, schema migration, and index initialisation.

### Conventions for Plugin Authors

- Write memory at natural decision boundaries, not on every message
- Tag entries consistently: `["auth", "pattern"]` not `["authentication-pattern-for-login"]`
- Use established `type` values: `decision`, `pattern`, `convention`, `summary`, `preference`, `glossary`, `adr`
- Never write secrets, tokens, or credentials to memory
- Promote cross-plugin relevant knowledge to `project` scope

### Extensible Schema Without Fragmentation

Each entry has a `data` JSON column for plugin-specific fields. The core schema (id, scope, plugin_id, type, content, tags, timestamps) is stable. Plugin-specific fields go in `data` and are opaque to the core library. This prevents schema fragmentation — core queries always work; plugin-specific queries filter on `plugin_id` and parse `data`.

---

## 6. Recommended Local Storage Design

### Recommendation: SQLite + Markdown (dual-layer)

| Layer | Role | Why |
|---|---|---|
| `memory.db` (SQLite) | Source of truth | Structured, queryable, transactional, single file |
| `*.md` (Markdown) | Human-readable export | User can inspect and edit without tooling |
| `memory.config.json` | Configuration | Readable, editable, portable |

### What Should Be in SQLite

- All memory entries (structured records)
- Full-text search index (FTS5 virtual table)
- Schema version (`user_version` pragma)
- Plugin scope metadata
- Timestamps, provenance, tags

### What Should Be Markdown

- Exported decisions log
- Exported patterns / conventions
- Exported ADRs
- Glossary

These are write-through exports — SQLite is authoritative; Markdown is a view. If user edits Markdown, it can be re-ingested via `rebuild_index`.

### What Should Be Cached / Derived

- FTS5 index (derived from content — rebuilt automatically)
- Tag frequency tables (optional, derived)

### What Should Not Be Stored

- Raw session transcripts (too large, low signal)
- Temporary reasoning steps
- Credentials, secrets, tokens
- Binary assets

---

## 7. Filesystem and OS-Agnostic Setup

### Path Handling

Use the XDG Base Directory specification as the canonical strategy:

| Platform | Base path |
|---|---|
| Linux | `$XDG_DATA_HOME` or `~/.local/share` |
| macOS | `~/Library/Application Support` |
| Windows | `%APPDATA%` |

Library function `getMemoryBaseDir()`:

```typescript
import { env, platform } from 'process'
import { join } from 'path'
import { homedir } from 'os'

function getMemoryBaseDir(): string {
  if (platform === 'win32') return join(env.APPDATA!, 'plugin-memory')
  if (platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'plugin-memory')
  return join(env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'plugin-memory')
}
```

Use `path.join()` everywhere. Never hardcode separators.

### App Data Directory Strategy

```
<base>/
  <project-key>/
    memory.db
    memory.config.json
    exports/
      decisions.md
      patterns.md
      glossary.md
      adrs/
```

### File Locking / Concurrency

SQLite in WAL (Write-Ahead Logging) mode handles concurrent reads safely. Enable with:

```sql
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
```

If multiple Claude sessions could write simultaneously (unlikely in practice), WAL mode serialises writes correctly without corruption. No application-level lock files needed.

### Case Sensitivity

- Project keys must be lowercased and slug-normalised before use as directory names
- Never rely on case-insensitive filesystem behaviour
- Use `projectPath.toLowerCase().replace(/[^a-z0-9-]/g, '-')` to produce stable, portable keys

### Unicode / Path Normalisation

- Normalise all user-provided paths to NFC before storage
- Avoid non-ASCII characters in directory and file names
- Use `path.normalize()` after construction

### Permissions

- Directory created with mode `0o700` (user-only) on Unix
- `memory.db` created with mode `0o600`
- No world-readable or group-readable files

### Backup / Export / Import

- `export_memory` produces a JSONL file: one entry per line, human-readable, portable
- `import_memory` reads JSONL and upserts by entry ID — idempotent
- The single `memory.db` file is itself a portable backup — can be copied between machines

---

## 8. Recommended Setup Flow

### Plugin Author (one-time)

1. Add `plugin-memory` as a dependency
2. Call `initMemory({ projectKey, pluginId, baseDir })` at plugin startup
3. Define which memory tool calls the plugin makes and when
4. Register memory tools with the MCP server or expose as plugin functions

### End User (one-time)

1. Install the plugin (memory library is a transitive dependency — no separate install)
2. Run any plugin command — `initMemory` creates directories and initialises the database on first call
3. No manual setup required

### First Run Initialisation

On `initMemory()`:

```
1. Resolve base directory (XDG / platform path)
2. Create <base>/<project-key>/ if absent
3. Open (or create) memory.db
4. Execute PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
5. Read PRAGMA user_version
6. Run any pending migrations (0 → current schema version)
7. Create exports/ directory if absent
8. Write memory.config.json
9. Return MemoryClient
```

### Project / Workspace Creation

Each unique project root path produces a unique project key. No user action required — key is derived automatically from the absolute path of the project root.

### Memory Refresh / Rebuild

```
memory.rebuild_index()
  → Drops and recreates FTS5 virtual table
  → Re-indexes all entries from SQLite source
  → Safe to run at any time
```

### Upgrade / Migration

On library update:
1. `initMemory()` detects `user_version` < `CURRENT_SCHEMA_VERSION`
2. Runs numbered migration files: `001.sql`, `002.sql`, etc.
3. Each migration is additive — no data is dropped
4. `user_version` is updated after all migrations complete

---

## 9. Minimal Tool / API Surface

### `read_memory`

| Field | Value |
|---|---|
| **Purpose** | Retrieve entries from memory by scope, type, or tags |
| **Inputs** | `scope`, `type?`, `tags?`, `limit?`, `projectKey?` |
| **Outputs** | Array of entry objects: `{ id, scope, type, content, tags, createdAt, updatedAt }` |
| **When** | Start of task, before making architectural decisions, when context is needed |
| **Guardrails** | Limit defaults to 10. No wildcard reads of entire database. |

### `write_memory`

| Field | Value |
|---|---|
| **Purpose** | Store a new memory entry |
| **Inputs** | `scope`, `type`, `content`, `tags?`, `source?`, `confidence?` |
| **Outputs** | `{ id, timestamp }` |
| **When** | Decision made, pattern identified, preference confirmed, ADR agreed |
| **Guardrails** | Content must not contain credentials. Max content length enforced (8 KB). |

### `search_memory`

| Field | Value |
|---|---|
| **Purpose** | Full-text search across memory content |
| **Inputs** | `query`, `scope?`, `type?`, `limit?` |
| **Outputs** | Ranked array with `snippet` field |
| **When** | User asks about past decisions, unclear context, exploring prior art |
| **Guardrails** | FTS5 query sanitised. Returns empty array on no match — never errors. |

### `update_memory`

| Field | Value |
|---|---|
| **Purpose** | Update an existing memory entry |
| **Inputs** | `id`, `content?`, `tags?`, `confidence?` |
| **Outputs** | `{ id, updatedAt }` |
| **When** | Prior entry is superseded, corrected, or clarified |
| **Guardrails** | Updates are non-destructive — prior content stored in `history` JSON column. |

### `forget_memory`

| Field | Value |
|---|---|
| **Purpose** | Delete a memory entry permanently |
| **Inputs** | `id` |
| **Outputs** | `{ deleted: true }` |
| **When** | Entry is wrong, outdated, or user requests deletion |
| **Guardrails** | Soft-delete first (marks as `deleted=true`) for 30 days, then hard-delete on next `rebuild_index`. User can inspect deleted entries in that window. |

### `list_memory_scopes`

| Field | Value |
|---|---|
| **Purpose** | Enumerate available scopes and entry counts |
| **Inputs** | `projectKey?` |
| **Outputs** | Array of `{ scope, entryCount, lastUpdated }` |
| **When** | Orienting at session start, debugging memory state |
| **Guardrails** | Read-only. |

### `rebuild_index`

| Field | Value |
|---|---|
| **Purpose** | Reconstruct FTS5 search index from SQLite source |
| **Inputs** | None |
| **Outputs** | `{ entriesIndexed: number }` |
| **When** | After import, after manual DB edits, on suspected index corruption |
| **Guardrails** | Safe at any time. Runs in a transaction. |

### `export_memory`

| Field | Value |
|---|---|
| **Purpose** | Export all memory entries to a portable JSONL file |
| **Inputs** | `outputPath?`, `scope?` |
| **Outputs** | `{ exportedPath, entryCount }` |
| **When** | Backup, migration to new machine, sharing project context |
| **Guardrails** | Exported file is written to user-specified path only. |

---

## 10. Memory Model and Scope

### Three-Tier Scope Hierarchy

```
user                    ← cross-project preferences, global conventions
  └── project           ← decisions, ADRs, patterns for this codebase
        └── plugin:X    ← plugin-specific memory (faah, core, etc.)
```

### Scope Tradeoffs

| Scope | Visibility | Use case |
|---|---|---|
| `user` | All projects, all plugins | Persistent preferences, communication style, global patterns |
| `project` | All plugins in this project | Architecture decisions, conventions, domain knowledge |
| `plugin:X` | Only plugin X | Plugin-internal state, ephemeral planning data |

### Default Scope Recommendation

**Default scope for writes: `project`.**

Most knowledge worth persisting is project-specific. The `plugin:X` scope is for data that should not bleed across plugins (planning state, feature-specific notes). The `user` scope is for preferences the user would want on every project (communication style, tool preferences). Plugin authors should default to writing to `project` scope unless data is explicitly plugin-internal.

### Cross-Plugin Sharing

Plugins share the `project` scope without any coordination. Each plugin can read all `project` scope entries regardless of which plugin wrote them. This is the intended mechanism for cross-plugin knowledge sharing — no direct plugin-to-plugin calls.

---

## 11. Data Model

### Core Schema

```sql
CREATE TABLE entries (
  id           TEXT PRIMARY KEY,          -- UUID v4
  scope        TEXT NOT NULL,             -- "user" | "project" | "plugin:X"
  plugin_id    TEXT,                      -- which plugin wrote this (nullable for user scope)
  project_key  TEXT NOT NULL,             -- project slug
  type         TEXT NOT NULL,             -- see type taxonomy below
  content      TEXT NOT NULL,             -- human-readable text
  tags         TEXT NOT NULL DEFAULT '[]',-- JSON array of strings
  source       TEXT,                      -- file path, URL, or "session"
  confidence   REAL DEFAULT 1.0,         -- 0.0 to 1.0
  verified     INTEGER DEFAULT 0,         -- boolean: manually confirmed by user
  deleted      INTEGER DEFAULT 0,         -- soft-delete flag
  history      TEXT DEFAULT '[]',         -- JSON array of prior content versions
  data         TEXT DEFAULT '{}',         -- plugin-specific JSON payload
  created_at   TEXT NOT NULL,             -- ISO 8601
  updated_at   TEXT NOT NULL              -- ISO 8601
);

CREATE VIRTUAL TABLE entries_fts USING fts5(
  content,
  tags,
  content='entries',
  content_rowid='rowid'
);

CREATE TABLE schema_migrations (
  version      INTEGER PRIMARY KEY,
  applied_at   TEXT NOT NULL
);
```

### Type Taxonomy

| Type | Description |
|---|---|
| `decision` | An architectural or technical decision made |
| `adr` | Architecture Decision Record (formal) |
| `pattern` | A recurring code or design pattern in this project |
| `convention` | A coding convention or style rule |
| `preference` | A user preference (tool choice, communication style) |
| `summary` | A compressed summary of prior session activity |
| `glossary` | Domain term definition |
| `state` | Ongoing project state (incomplete work, pending tasks) |
| `constraint` | An explicit constraint or boundary condition |

### Metadata and Provenance

Every entry carries:
- `source`: where the knowledge came from (file path, session, URL)
- `plugin_id`: which plugin wrote it
- `confidence`: Claude's confidence in the entry (lowered when speculative)
- `verified`: set to `1` when user explicitly confirms the entry
- `history`: prior versions on update

---

## 12. Read/Write Strategy

### When to Write

| Trigger | Action |
|---|---|
| User confirms a decision | `write_memory` with `type=decision`, `verified=1` |
| Pattern observed twice | `write_memory` with `type=pattern`, `confidence=0.7` |
| User corrects a prior entry | `update_memory` on existing entry |
| Session closes with open work | `write_memory` with `type=state` |
| ADR formally agreed | `write_memory` with `type=adr`, `verified=1` |

### When to Auto-Suggest

When Claude identifies a likely-persistent pattern or decision, it should surface it for the user: *"This appears to be a standing pattern — shall I record it to memory?"* Never write speculatively without acknowledgement.

### When to Refresh

Call `read_memory` at the start of each session and at the start of each major task step. Do not reload on every message — once per task boundary is sufficient.

### When to Compact

When `type=state` entries accumulate (more than 10), summarise them into a single updated state entry and archive the old ones. Run as part of session close.

### When to Deprecate / Archive

Entries with `verified=0` and `confidence < 0.5` that have not been read in 60 days are candidates for archival. Present to user for confirmation before archiving.

### Avoiding Common Failure Modes

| Problem | Prevention |
|---|---|
| Memory bloat | Enforce max 8 KB per entry. Summarise on session close. |
| Stale memory | Track `updated_at`. Surface entries >90 days old for review. |
| Duplicate memory | Search before writing: `search_memory` first, then check similarity. |
| Over-reliance on recall | Always verify retrieved context against current source of truth. |
| Hidden persistence | All writes are explicit tool calls. No background writing. |

---

## 13. Existing Tools and Libraries

Use these — do not reinvent them:

| Need | Tool | Notes |
|---|---|---|
| SQLite (Node) | `better-sqlite3` | Synchronous API, excellent performance, well-maintained |
| SQLite (Python) | stdlib `sqlite3` | Built-in, zero dependency |
| Platform paths | `env-paths` (Node) or `platformdirs` (Python) | Correct XDG / macOS / Windows paths |
| UUID generation | `crypto.randomUUID()` (Node 16+) or `uuid` package | For entry IDs |
| Path handling | `node:path` or `pathlib` (Python) | Cross-platform joins |
| File system | `node:fs/promises` or `pathlib.Path` | Standard |
| Config file | Plain JSON — no library needed | Read with `JSON.parse`, write with `JSON.stringify` |
| JSONL export | Plain file write, one `JSON.stringify` per line | No library needed |
| MCP protocol | `@modelcontextprotocol/sdk` | Official Anthropic MCP SDK |
| Markdown export | Template literal strings | No library needed for simple exports |
| Optional: vector search | `sqlite-vss` | Adds semantic recall on top of FTS5 — additive |

**Avoid**: `chroma`, `pinecone`, `weaviate`, `qdrant` (all hosted or heavy). Avoid `lancedb` in v1 (good but adds complexity). Avoid `electron-store`, `conf`, `lowdb` (not needed when SQLite is present).

---

## 14. Security and Privacy

### Local-Only Guarantees

The library makes no network calls. All data remains in the user's local filesystem. No telemetry, no sync, no cloud backup by default.

### User Inspection and Deletion

Every entry is readable in the `memory.db` file (any SQLite viewer) or via `export_memory`. The user can delete the entire `<base>/<project-key>/` directory to wipe all memory for a project. `forget_memory` provides programmatic deletion.

### Plugin Permission Boundaries

Plugins may read/write their own `plugin:X` scope freely. Plugins may read/write the `project` scope. Plugins may not read other plugins' scoped memory directly. The `user` scope is read-only from plugins by default — only Claude (acting on explicit user instruction) can write to `user` scope.

### Encryption at Rest

**Not required by default.** The memory directory already inherits the user's OS-level encryption (FileVault on macOS, LUKS on Linux). Application-level encryption adds operational complexity without proportionate benefit for local dev tooling. If the use case involves highly sensitive material (credentials, proprietary IP), enable SQLite encryption via `SQLCipher` — this is an optional upgrade, not a default.

### Handling Sensitive Context

- Plugin authors are responsible for not writing secrets to memory
- The library should provide a `sanitise(content)` utility that detects and refuses entries matching common secret patterns (API keys, tokens, connection strings)
- Default: warn and abort if the content matches known secret patterns

### Safe Defaults

- All directories created `0o700`
- `memory.db` created `0o600`
- No world-readable exports
- Soft-delete before hard-delete
- No write without explicit tool call

---

## 15. Reference Implementation Proposal

### Language / Runtime

TypeScript / Node 20+. Reason: most Claude Code plugins and the MCP SDK are TypeScript-native. Python variant follows the same interface.

### Package Structure

```
plugin-memory/
  src/
    index.ts          ← public API: initMemory, MemoryClient
    db.ts             ← SQLite connection, WAL setup, migration runner
    tools.ts          ← tool definitions (MCP tool schema)
    handlers.ts       ← tool handler implementations
    paths.ts          ← XDG / platform path resolution
    sanitise.ts       ← secret detection utility
    export.ts         ← JSONL and Markdown export/import
    migrations/
      001_initial.sql
      002_fts5.sql
      003_history.sql
  package.json
  README.md
```

### Directory Layout (runtime)

```
<base>/                                     ← platform data dir
  plugin-memory/
    <project-key>/
      memory.db                             ← SQLite source of truth
      memory.config.json                    ← project config
      exports/
        decisions.md
        patterns.md
        glossary.md
        adrs/
          2026-03-09-use-sqlite-memory.md
```

### Sample Config

```json
{
  "schemaVersion": 3,
  "projectKey": "repo-my-project",
  "plugins": ["faah", "core"],
  "fts": true,
  "markdownExport": true,
  "softDeleteRetentionDays": 30,
  "maxContentBytes": 8192
}
```

### Sample Tool Definition (MCP)

```typescript
export const writeMemoryTool = {
  name: 'write_memory',
  description: 'Store a persistent memory entry scoped to the current project.',
  inputSchema: {
    type: 'object',
    properties: {
      scope:      { type: 'string', enum: ['user', 'project', 'plugin'] },
      type:       { type: 'string', enum: ['decision', 'adr', 'pattern', 'convention', 'preference', 'summary', 'glossary', 'state', 'constraint'] },
      content:    { type: 'string', maxLength: 8192 },
      tags:       { type: 'array', items: { type: 'string' } },
      source:     { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 1 }
    },
    required: ['scope', 'type', 'content']
  }
}
```

### Sample Lifecycle

```typescript
// Plugin startup
import { initMemory } from 'plugin-memory'

const memory = await initMemory({
  projectKey: deriveProjectKey(process.cwd()),
  pluginId: 'faah',
})

// Session start: load relevant context
const context = await memory.readMemory({
  scope: 'project',
  type: 'decision',
  limit: 10,
})

// Decision made: persist it
await memory.writeMemory({
  scope: 'project',
  type: 'decision',
  content: 'Use React Query for all server state management. Context: evaluated SWR and Zustand; React Query won on DX and devtools.',
  tags: ['state-management', 'react-query', 'architecture'],
  confidence: 1.0,
  verified: true,
})
```

### Migration SQL Example

```sql
-- 001_initial.sql
CREATE TABLE IF NOT EXISTS entries (
  id           TEXT PRIMARY KEY,
  scope        TEXT NOT NULL,
  plugin_id    TEXT,
  project_key  TEXT NOT NULL,
  type         TEXT NOT NULL,
  content      TEXT NOT NULL,
  tags         TEXT NOT NULL DEFAULT '[]',
  source       TEXT,
  confidence   REAL DEFAULT 1.0,
  verified     INTEGER DEFAULT 0,
  deleted      INTEGER DEFAULT 0,
  history      TEXT DEFAULT '[]',
  data         TEXT DEFAULT '{}',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- 002_fts5.sql
CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
  content,
  tags,
  content='entries',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, content, tags) VALUES('delete', old.rowid, old.content, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, content, tags) VALUES('delete', old.rowid, old.content, old.tags);
  INSERT INTO entries_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
END;
```

---

## 16. Tradeoffs and Alternatives

### Option A: Pure Filesystem / Markdown (no database)

Markdown files in a well-known directory. Human-readable, zero dependencies, trivial setup.

**Wins**: Maximum simplicity, maximum inspectability, zero new dependencies.

**Loses**: No structured queries, no full-text search, no transactional writes, no schema versioning. Concurrency issues on simultaneous writes. Fragile parsing if content is complex.

**Verdict**: Acceptable for a personal scratchpad. Unacceptable as a shared, queryable memory layer for a plugin ecosystem.

### Option B: Pure SQLite (no Markdown export)

Single `memory.db` file, all data in SQLite, no human-readable layer.

**Wins**: Maximum query power, clean schema, full transactional safety.

**Loses**: User cannot inspect memory without a SQLite viewer. Unfriendly for manual edits, audit, or Git tracking of decisions.

**Verdict**: Correct engine choice. Insufficient as the only layer — Markdown exports must exist for user visibility.

### Option C: SQLite + Local Vector Index (e.g. `sqlite-vss`)

Adds semantic search on top of the recommended stack.

**Wins**: Semantic recall — finds relevant entries even without exact keyword match.

**Loses**: Requires embedding generation (CPU cost or API call), adds a binary extension dependency, increases setup complexity, potentially requires an API key for embedding.

**Verdict**: Correct upgrade path for v2. Wrong default for v1. FTS5 keyword search covers the practical need at zero additional cost. Promote to optional extension once core is stable.

### Recommended Option: SQLite + Markdown (dual-layer) — this design

**Wins over A**: Structured queries, FTS5 search, transactional safety, schema versioning, concurrency handling.

**Wins over B**: Human-readable exports, user can inspect decisions in any text editor or Git diff.

**Wins over C**: Zero additional dependencies, no embedding API needed, lower operational overhead.

---

## 17. Final Recommendation

### Exact Stack

| Layer | Choice |
|---|---|
| Source of truth | SQLite via `better-sqlite3` (Node) or stdlib `sqlite3` (Python) |
| Journaling | WAL mode, `busy_timeout=5000` |
| Search | FTS5 (built-in, zero dependency) |
| Human layer | Markdown write-through exports |
| Config | `memory.config.json` per project |
| Path resolution | `env-paths` (Node) / `platformdirs` (Python) |
| MCP interface | `@modelcontextprotocol/sdk` |
| Schema versioning | Numbered SQL migrations + `PRAGMA user_version` |

### Default Setup

```
~/.local/share/plugin-memory/<project-key>/   (Linux)
~/Library/Application Support/plugin-memory/<project-key>/   (macOS)
%APPDATA%\plugin-memory\<project-key>\   (Windows)
```

Three-tier scope: `user` → `project` → `plugin:X`. Default write scope: `project`.

### Minimum Viable Implementation

1. `db.ts`: open SQLite, run migrations, return connection
2. `paths.ts`: resolve platform data directory
3. `handlers.ts`: implement `read_memory`, `write_memory`, `search_memory`, `forget_memory`
4. `tools.ts`: MCP tool definitions for those four tools
5. `001_initial.sql`: core `entries` table
6. `002_fts5.sql`: FTS5 virtual table and triggers
7. `index.ts`: `initMemory()` → returns the four tool handlers

Eight files. One dependency (`better-sqlite3`). Complete in a single working day.

### Future-Proof Upgrade Path

| Phase | Addition |
|---|---|
| v1 | SQLite + FTS5 + Markdown exports |
| v2 | `sqlite-vss` for semantic recall — additive, no schema break |
| v3 | Optional sync layer (CRDT merge, rsync) for multi-machine use |
| v4 | Web UI for memory inspection (read-only viewer over `memory.db`) |

Each phase is additive. No migration burden. The `memory.db` file from v1 remains valid in v4.

---

_Authored by Rialita | Counsellor to Lord Roti | 2026-03-09_
