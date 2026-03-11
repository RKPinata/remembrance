# Design Spec: plugin-memory Marketplace Plugin

**Date:** 2026-03-11
**Status:** Draft
**Audience:** Plugin developers building memory-enabled Claude plugins

---

## Goal

Publish `plugin-memory` as an installable Claude plugin on the RKPinata marketplace. A developer installs it once and gains:

1. A skill that guides Claude to write correct `initMemory()` integration code
2. An auto-registered MCP server for testing memory tool calls during development
3. A `/memory-status` command to inspect memory state during plugin development

The npm library (`plugin-memory`) is published separately for programmatic import.

---

## Target Audience

**Plugin developers** — engineers building Claude-based plugins who want to add persistent memory. They work with Claude as a coding agent and need it to write correct `initMemory()` integration code on their behalf.

This is not a plugin for end users who want Claude to remember things in general sessions.

---

## Non-Goals

- Auto-injecting session context at startup (no session-start hook)
- Serving end users who want ambient memory in Claude sessions
- Supporting Gemini or Cursor platforms (Claude Code only for v1.0)
- Declaring minimum Claude Code version in marketplace manifest (field not supported by current marketplace schema)

---

## Repository Structure

All changes are additive or restructuring. `src/` and `tests/` are untouched.

```
plugin-memory/                          (repo root)
│
├── .claude-plugin/
│   └── plugin.json                     NEW — manifest + MCP server declaration
│
├── src/                                UNCHANGED
├── tests/                              UNCHANGED
│
├── skills/                             NEW directory (mkdir -p)
│   └── plugin-memory/                  MOVED: from ./plugin-memory/ → ./skills/plugin-memory/
│       ├── SKILL.md                    MODIFIED — developer-first framing (see below)
│       ├── SOURCES.md                  MODIFIED — stale deleted-file reference updated (see below)
│       └── references/                 UNCHANGED
│           ├── api-surface.md
│           ├── common-use-cases.md
│           └── troubleshooting-workarounds.md
│
├── commands/
│   └── memory-status.md                NEW — /memory-status slash command
│
├── package.json                        MODIFIED — version bump + publishing fields + build:server fix
├── README.md                           NEW — canonical source for library documentation
├── LICENSE                             NEW — MIT
└── CHANGELOG.md                        NEW — Keep a Changelog format
```

**No hooks directory.** `plugin.json` `mcpServers` handles MCP registration. Skills and commands are auto-discovered from `skills/` and `commands/` by Claude Code convention — no explicit declaration needed in the manifest.

---

## Plugin Manifest

**`.claude-plugin/plugin.json`** — placed at repo root under `.claude-plugin/`, the path Claude Code reads by convention.

```json
{
  "name": "plugin-memory",
  "description": "SQLite-backed persistent memory layer for Claude-based plugins. Guides correct initMemory() integration, scope model, and memory discipline when building memory-enabled plugins.",
  "version": "1.0.0",
  "mcpServers": {
    "plugin-memory": {
      "command": "npx",
      "args": ["-y", "--package", "plugin-memory@latest", "plugin-memory-server"]
    }
  }
}
```

**Note on `mcpServers` args:** The binary `plugin-memory-server` is declared in the `plugin-memory` package `bin` field, not in a separate package. `npx plugin-memory-server` alone would attempt to install a non-existent package of that name. The `--package plugin-memory@latest` flag tells npx which package provides the binary. The `@latest` suffix ensures npx does not silently use a stale cached version.

---

## npm Package Changes

`package.json` is **modified**, not replaced. All existing fields (`name`, `type`, `main`, `types`, `exports`, `dependencies`, `devDependencies`, `engines`) are preserved unchanged.

### Version bump

`0.1.0` → `1.0.0`. The library is feature-complete with 73 passing tests. This is the initial stable release. Rationale must be stated in `CHANGELOG.md`.

### Fields to add

| Field | Value |
|---|---|
| `license` | `"MIT"` |
| `author` | `{ "name": "RKPinata", "email": "teukutiga@gmail.com" }` |
| `repository` | `{ "type": "git", "url": "https://github.com/RKPinata/plugin-memory.git" }` |
| `keywords` | `["claude", "mcp", "memory", "sqlite", "plugin", "agent"]` |
| `files` | `["dist", "dist-server"]` |
| `bin` | `{ "plugin-memory-server": "./dist-server/server.js" }` |
| `publishConfig` | `{ "access": "public" }` |

**`files` field rationale:** `dist/` contains the library + `dist/migrations/` (copied by build). `dist-server/` contains the server binary + `dist-server/migrations/` (copied by updated build:server — see below). `src/migrations` is NOT listed — the SQL files ship inside `dist/migrations` and `dist-server/migrations`, making the raw source redundant.

### `build:server` script update

`db.ts` resolves migration SQL files relative to `__dirname`, which is determined by `import.meta.url` in the compiled output. Because `tsup` bundles `server.ts` into a single file at `dist-server/server.js`, `__dirname` at runtime is `dist-server/`. Migrations must therefore exist at `dist-server/migrations/`.

Update `build:server`:
```json
"build:server": "tsup src/server.ts --format esm --dts --clean --out-dir dist-server && cp -r src/migrations dist-server/migrations"
```

**`prepublishOnly` script:** Add the following to `package.json` scripts to enforce the build requirement automatically:
```json
"prepublishOnly": "npm run build && npm run build:server"
```
This runs automatically before every `npm publish` and prevents a broken distribution if either build is skipped.

---

## `src/server.ts` Version String

`src/server.ts` contains a hardcoded version: `{ name: 'plugin-memory', version: '0.1.0' }`. Update to `'1.0.0'`.

**Known risk:** This string will drift from `package.json` at future releases if not updated manually. Mitigation: add a `pretest` or CI check that asserts the version in `server.ts` matches `package.json`. For now, document this as a release checklist item: "Update version string in `src/server.ts` to match `package.json`."

---

## Skill Directory Move

**Step 1:** `mkdir -p skills`

**Step 2:** `mv plugin-memory skills/plugin-memory`

The `plugin-memory/` subdirectory at repo root is removed entirely. Its contents become `skills/plugin-memory/`.

---

## `SOURCES.md` Update

`SOURCES.md` references `memory-layer-architecture.md` as the canonical source. That file has been deleted from the repository (git status: `D memory-layer-architecture.md`). Update the reference to point to `README.md`, which becomes the new canonical architecture source once created.

Change the source entry:

| Field | Old value | New value |
|---|---|---|
| Source | Plugin Memory Layer Architecture | plugin-memory README |
| Path | `/Users/danish/Repo/plugin-memory/memory-layer-architecture.md` | `./README.md` |

**Coverage matrix:** The existing coverage matrix references numbered sections (`§2`, `§7`, `§9`, etc.) from `memory-layer-architecture.md`. `README.md` does not use numbered sections. Remove all `§N` section references from the coverage matrix and replace with the section heading names from README.md as defined in the README content specification (e.g., `§ Quick start`, `§ MemoryClient API`, `§ Scope model`). Update the Status column to `complete` for all five dimensions, sourced from the README.

---

## `SKILL.md` Retuning

The current `SKILL.md` opens with a quick-reference task-to-tool table followed by the `initMemory()` snippet. The retuned version restructures for the developer context.

**Required changes:**

1. **Opening paragraph** — insert before any existing content:
   > "You are helping a developer integrate `plugin-memory` into a Claude-based plugin they are building. Your task is to write correct, idiomatic TypeScript integration code."

2. **Lead with `initMemory()`** — move the initialization block to immediately follow the opening paragraph, before the quick-reference table.

3. **Quick-reference table** — the existing table maps tasks to MCP tool names (e.g., "Load context at session start" → `read_memory`). Retitle it **"MCP tool reference (for testing)"** and add a one-line preamble: "These tools are available during development via the auto-registered MCP server. In a shipped plugin, your plugin server calls the `MemoryClient` methods directly."

4. **Anti-patterns table** — append the following row at the end of the existing table:

   | Anti-pattern | Correct approach |
   |---|---|
   | Call `initMemory()` inside a request handler | Call `initMemory()` once at plugin startup and pass the `MemoryClient` to handlers |

5. All other sections (scope model, read/write discipline, entry types, storage path) — unchanged.

---

## `/memory-status` Command

**`commands/memory-status.md`**

```markdown
---
description: Show memory entries stored for this project — scopes, types, and counts
---

Prerequisite: the plugin-memory MCP server must be running and scoped to the current
project directory. If it was started from a different directory, the entries shown
will not match this project.

Steps:
1. Call `list_memory_scopes` with no arguments.
2. For each scope where entryCount > 0, call `read_memory` with `scope` and `limit: 5`.
3. Present results as a Markdown table with columns:
   Scope | Type | Content (truncated to 80 chars) | Verified | Updated At
   Render `verified` as `yes` or `no`.
4. If no scopes have entries, respond: "No memory entries found for this project."

This command is read-only. Do not write, update, or delete any entries.
```

---

## `README.md` Content Specification

The README serves two purposes: npm package listing on npmjs.com and the new canonical architecture reference (replacing `memory-layer-architecture.md` as the SOURCES.md target).

Required sections in order:

1. **Title and one-line description** — `plugin-memory: SQLite-backed persistent memory layer for Claude-based plugins`

2. **Installation** — `npm install plugin-memory`

3. **Quick start** — the complete `initMemory()` lifecycle example from `SKILL.md` (initialization + session read + decision write). Use the existing code block verbatim.

4. **Scope model** — the three-tier hierarchy (`user` → `project` → `plugin:X`) with the same prose and diagram as `SKILL.md`.

5. **MemoryClient API** — table with columns: Method | Description | When to call. Rows: `readMemory`, `writeMemory`, `searchMemory`, `updateMemory`, `forgetMemory`, `listMemoryScopes`, `rebuildIndex`, `exportMemory`. One-line description per method derived from `references/api-surface.md`.

6. **Entry types** — table with columns: Type | Use. The 9 types from `SKILL.md`: `decision`, `adr`, `pattern`, `convention`, `preference`, `summary`, `glossary`, `state`, `constraint`.

7. **Storage paths** — three-line block:
   ```
   macOS:   ~/Library/Application Support/plugin-memory/<project-key>/
   Linux:   ~/.local/share/plugin-memory/<project-key>/
   Windows: %APPDATA%\plugin-memory\<project-key>\
   ```

8. **Claude plugin** — two sub-items:
   - Install: `/plugin install plugin-memory@rkpinata-plugins`
   - What the developer gets: skill (guides Claude to write `initMemory()` integration code), MCP server (auto-registered for testing), `/memory-status` command

9. **License** — `MIT`

---

## Marketplace Registration

Entry added to `rkpinata-plugin/.claude-plugin/marketplace.json` `plugins` array:

```json
{
  "name": "plugin-memory",
  "source": {
    "source": "url",
    "url": "https://github.com/RKPinata/plugin-memory.git"
  },
  "description": "SQLite-backed persistent memory layer for Claude-based plugins. Guides correct initMemory() integration, scope model, and memory discipline.",
  "version": "1.0.0",
  "author": {
    "name": "RKPinata",
    "email": "teukutiga@gmail.com"
  }
}
```

---

## `CHANGELOG.md` Format

Use [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. Initial entry:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-03-11

### Added
- SQLite-backed memory layer with FTS5 full-text search
- Eight MCP tools: read_memory, write_memory, search_memory, update_memory,
  forget_memory, list_memory_scopes, rebuild_index, export_memory
- Three-tier scope hierarchy: user → project → plugin:X
- Schema migration runner with WAL mode
- Secret pattern detection — rejects credentials in content
- JSONL export and Markdown write-through
- Claude Code plugin: skill, /memory-status command, MCP server auto-registration
- 73 tests across 6 files
```

---

## End-to-End Developer Flow

```
Developer installs plugin:
  /plugin install plugin-memory@rkpinata-plugins

Claude Code:
  → registers plugin-memory MCP server (npx --package plugin-memory@latest plugin-memory-server)
  → discovers skill at skills/plugin-memory/SKILL.md
  → discovers /memory-status command

Developer says: "add persistent memory to my plugin"
  → Skill triggers on matching phrase
  → Claude reads SKILL.md: developer-first framing
  → Claude writes correct initMemory() integration code for the developer's plugin

Developer tests their plugin:
  → Memory tools (read_memory, write_memory, etc.) available via registered MCP server
  → /memory-status confirms entries are being written correctly
```

---

## Deliverables Checklist

- [ ] `.claude-plugin/plugin.json` — manifest with `mcpServers` using `--package plugin-memory@latest`
- [ ] `skills/` directory created; `./plugin-memory/` moved to `./skills/plugin-memory/`
- [ ] `skills/plugin-memory/SKILL.md` — developer opening, initMemory() lead, table retitled, anti-pattern added
- [ ] `skills/plugin-memory/SOURCES.md` — path updated from deleted file to `./README.md`
- [ ] `commands/memory-status.md` — read-only inspection command with prerequisite note
- [ ] `package.json` — version `1.0.0`; publishing fields added; `build:server` updated to copy migrations; `prepublishOnly` script added; `exports` preserved
- [ ] `src/server.ts` — version string updated to `'1.0.0'`
- [ ] `README.md` — nine sections per specification above
- [ ] `LICENSE` — MIT
- [ ] `CHANGELOG.md` — Keep a Changelog format, `1.0.0` entry
- [ ] `rkpinata-plugin/.claude-plugin/marketplace.json` — `plugin-memory` entry added to `plugins` array

---

## Open Questions

None. All design decisions resolved.
