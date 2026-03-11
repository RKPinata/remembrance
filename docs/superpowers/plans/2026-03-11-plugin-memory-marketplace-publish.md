# plugin-memory Marketplace Plugin Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `plugin-memory` as an installable Claude plugin on the RKPinata marketplace, including all structural changes, file additions, npm publishing preparation, and marketplace registration.

**Architecture:** Restructure the repo to meet Claude Code plugin conventions (skills/ and commands/ directories), add a minimal `.claude-plugin/plugin.json` manifest with MCP server declaration, update package.json for npm publishing, and register the plugin in the RKPinata marketplace.

**Tech Stack:** TypeScript/Node 20+, tsup, npm, Claude Code plugin format.

**Spec:** `docs/superpowers/specs/2026-03-11-plugin-memory-marketplace-plugin-design.md`

---

## Chunk 1: Structural changes and new plugin files

### Task 1: Move skill directory and create commands directory

**Files:**
- Move: `./plugin-memory/` → `./skills/plugin-memory/`
- Create: `./commands/` (empty directory, populated in Task 4)

- [ ] **Step 1: Verify current state**

  ```bash
  ls plugin-memory/
  ```
  Expected: `SKILL.md  SOURCES.md  references/`

- [ ] **Step 2: Create skills directory and move**

  ```bash
  mkdir -p skills
  mv plugin-memory skills/plugin-memory
  ```

- [ ] **Step 3: Verify move**

  ```bash
  ls skills/plugin-memory/
  ```
  Expected: `SKILL.md  SOURCES.md  references/`

- [ ] **Step 4: Create commands directory**

  ```bash
  mkdir -p commands
  ```

- [ ] **Step 5: Run existing tests to confirm nothing broke**

  ```bash
  npm test
  ```
  Expected: all 73 tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add skills/ commands/ && git rm -r plugin-memory
  git commit -m "refactor: move skill to skills/plugin-memory, add commands dir"
  ```

---

### Task 2: Create plugin manifest

**Files:**
- Create: `.claude-plugin/plugin.json`

- [ ] **Step 1: Create directory**

  ```bash
  mkdir -p .claude-plugin
  ```

- [ ] **Step 2: Create plugin.json**

  Create `.claude-plugin/plugin.json` with the following content exactly:

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

- [ ] **Step 3: Validate JSON**

  ```bash
  node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json', 'utf8')); console.log('valid')"
  ```
  Expected: `valid`

- [ ] **Step 4: Commit**

  ```bash
  git add .claude-plugin/plugin.json
  git commit -m "feat: add plugin.json manifest with MCP server declaration"
  ```

---

### Task 3: Update SKILL.md for developer-first framing

**Files:**
- Modify: `skills/plugin-memory/SKILL.md`

The current SKILL.md opens with the quick-reference table. Read the file first, then apply the changes below.

- [ ] **Step 1: Read the current file**

  Read `skills/plugin-memory/SKILL.md` to understand the current structure before editing.

- [ ] **Step 2: Insert developer framing paragraph**

  Insert the following as the very first content after the YAML frontmatter (the `---` closing line):

  ```markdown
  You are helping a developer integrate `plugin-memory` into a Claude-based plugin they are building. Your task is to write correct, idiomatic TypeScript integration code.
  ```

- [ ] **Step 3: Move initMemory() block above the quick-reference table**

  The `## Initialization` section (containing the `initMemory()` code block and `deriveProjectKey` snippet) currently appears after the quick-reference table. Move it to immediately follow the developer framing paragraph, so the order becomes:

  1. Developer framing paragraph
  2. Initialization / `initMemory()` block
  3. Quick-reference table (retitled — see Step 4)
  4. All remaining sections unchanged

- [ ] **Step 4: Retitle quick-reference table**

  Change the table heading from `## Quick reference` to `## MCP tool reference (for testing)`.

  Add the following preamble immediately after the new heading, before the table itself:

  ```markdown
  These tools are available during development via the auto-registered MCP server. In a shipped plugin, your plugin server calls the `MemoryClient` methods directly — not these tools.
  ```

- [ ] **Step 5: Append anti-pattern row**

  Find the anti-patterns table. Append the following row at the end:

  | Anti-pattern | Correct approach |
  |---|---|
  | Call `initMemory()` inside a request handler | Call `initMemory()` once at plugin startup and pass the `MemoryClient` to handlers |

- [ ] **Step 6: Verify frontmatter trigger phrases still present**

  Confirm the YAML frontmatter still contains the `description:` field with trigger phrases. These must not be removed.

- [ ] **Step 7: Commit**

  ```bash
  git add skills/plugin-memory/SKILL.md
  git commit -m "feat: retune SKILL.md for developer-first integration context"
  ```

---

### Task 4: Update SOURCES.md and create /memory-status command

**Files:**
- Modify: `skills/plugin-memory/SOURCES.md`
- Create: `commands/memory-status.md`

- [ ] **Step 1: Update SOURCES.md source path**

  In `skills/plugin-memory/SOURCES.md`, find the Sources table row that references `memory-layer-architecture.md`. Apply these changes:

  - Change "Source" column value from `Plugin Memory Layer Architecture` to `plugin-memory README`
  - Change "Path" column value from `/Users/danish/Repo/plugin-memory/memory-layer-architecture.md` to `./README.md`
  - Change "Trust" to `canonical`
  - Change "Confidence" to `high`
  - Update "Contribution" to: `All API signatures, scope model, storage design, migration strategy, failure modes, security model, use case patterns`

- [ ] **Step 2: Update SOURCES.md coverage matrix section references**

  The Coverage matrix table contains references to numbered sections (e.g., `§9`, `§2`, `§7`). Replace each `§N` reference with the corresponding README section heading name:

  | Old reference | New reference |
  |---|---|
  | `§9` | `§ MemoryClient API` |
  | `§2`, `§7`, `§15` | `§ Storage paths`, `§ Quick start` |
  | `§3`, `§12` | `§ Quick start`, `§ MemoryClient API` |
  | `§12`, `§7`, `§14` | `§ MemoryClient API`, `§ Quick start` |
  | `§8`, `§15` | `§ MemoryClient API` |

  Update the Status column for all five dimensions to `complete`.

- [ ] **Step 3: Create commands/memory-status.md**

  Create `commands/memory-status.md` with the following content exactly:

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

- [ ] **Step 4: Commit**

  ```bash
  git add skills/plugin-memory/SOURCES.md commands/memory-status.md
  git commit -m "feat: update SOURCES.md references, add memory-status command"
  ```

---

## Chunk 2: Content files — README, LICENSE, CHANGELOG

### Task 5: Create README.md

**Files:**
- Create: `README.md`

The README is the npm listing page and the new canonical architecture reference.

- [ ] **Step 1: Create README.md**

  Create `README.md` with the following content exactly:

  ```markdown
  # plugin-memory

  SQLite-backed persistent memory layer for Claude-based plugins.

  ## Installation

  ```bash
  npm install plugin-memory
  ```

  ## Quick start

  Call `initMemory()` once at plugin startup. It handles directory creation, schema
  migration, WAL mode, and FTS5 initialization automatically.

  ```typescript
  import { initMemory, deriveProjectKey } from 'plugin-memory'

  const memory = await initMemory({
    projectKey: deriveProjectKey(process.cwd()),
    pluginId: 'my-plugin',
  })

  // Session start — load context
  const decisions = await memory.readMemory({
    scope: 'project',
    type: 'decision',
    limit: 10,
  })

  // Decision confirmed — persist it
  await memory.writeMemory({
    scope: 'project',
    type: 'decision',
    content: 'Use compound component pattern for all complex UI components.',
    tags: ['components', 'architecture'],
    confidence: 1.0,
    verified: true,
  })
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

  | Method | Description | When to call |
  |---|---|---|
  | `readMemory` | Retrieve entries by scope, type, or tags | Session start, before architectural decisions |
  | `writeMemory` | Store a new persistent entry | Decision confirmed, pattern identified, session closing |
  | `searchMemory` | Full-text search via SQLite FTS5 | Finding prior decisions, exploring patterns |
  | `updateMemory` | Update an existing entry (non-destructive) | Entry superseded or corrected |
  | `forgetMemory` | Soft-delete an entry (hard-deleted after 30 days) | Entry wrong or outdated |
  | `listMemoryScopes` | Enumerate scopes and entry counts | Session orientation, debugging |
  | `rebuildIndex` | Reconstruct FTS5 index from source of truth | After manual DB edits, suspected corruption |
  | `exportMemory` | Export all entries to JSONL | Backup, migration between machines |

  ## Entry types

  | Type | Use |
  |---|---|
  | `decision` | An architectural or technical decision |
  | `adr` | Formal Architecture Decision Record |
  | `pattern` | Recurring code or design pattern |
  | `convention` | Coding convention or style rule |
  | `preference` | User tool or communication preference |
  | `summary` | Compressed session summary |
  | `glossary` | Domain term definition |
  | `state` | Ongoing incomplete work |
  | `constraint` | Explicit boundary condition |

  ## Storage paths

  ```
  macOS:   ~/Library/Application Support/plugin-memory/<project-key>/
  Linux:   ~/.local/share/plugin-memory/<project-key>/
  Windows: %APPDATA%\plugin-memory\<project-key>\
  ```

  Each project directory contains `memory.db`, `memory.config.json`, and `exports/`.

  ## Claude plugin

  Install the Claude Code plugin from the RKPinata marketplace to get:
  - A skill that guides Claude to write correct `initMemory()` integration code
  - An auto-registered MCP server for testing memory tools during development
  - A `/memory-status` command to inspect stored entries

  ```
  /plugin install plugin-memory@rkpinata-plugins
  ```

  ## License

  MIT
  ```

- [ ] **Step 2: Verify no placeholder text remains**

  Check that the README contains no `TODO`, `[placeholder]`, or `...` markers.

- [ ] **Step 3: Commit**

  ```bash
  git add README.md
  git commit -m "docs: add README as canonical library documentation"
  ```

---

### Task 6: Create LICENSE and CHANGELOG.md

**Files:**
- Create: `LICENSE`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Create LICENSE**

  Create `LICENSE` with the following content. Replace `[YEAR]` with `2026` and `[NAME]` with `RKPinata`:

  ```
  MIT License

  Copyright (c) 2026 RKPinata

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
  ```

- [ ] **Step 2: Create CHANGELOG.md**

  Create `CHANGELOG.md` with the following content exactly:

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

- [ ] **Step 3: Commit**

  ```bash
  git add LICENSE CHANGELOG.md
  git commit -m "docs: add MIT license and changelog"
  ```

---

## Chunk 3: Package changes, build verification, and server version

### Task 7: Update package.json

**Files:**
- Modify: `package.json`

Read `package.json` before editing. Preserve all existing fields. Add only the fields listed below.

- [ ] **Step 1: Read current package.json**

  Read `package.json` to confirm current field values before editing.

- [ ] **Step 2: Apply all changes**

  Make the following changes to `package.json`:

  1. Change `"version"` from `"0.1.0"` to `"1.0.0"`

  2. Add the following fields at the top level (order: after `"description"`, before `"type"`):
     ```json
     "license": "MIT",
     "author": {
       "name": "RKPinata",
       "email": "teukutiga@gmail.com"
     },
     "repository": {
       "type": "git",
       "url": "https://github.com/RKPinata/plugin-memory.git"
     },
     "keywords": ["claude", "mcp", "memory", "sqlite", "plugin", "agent"],
     ```

  3. Add `"bin"` field (after `"exports"`):
     ```json
     "bin": {
       "plugin-memory-server": "./dist-server/server.js"
     },
     ```

  4. Add `"files"` field (after `"bin"`):
     ```json
     "files": ["dist", "dist-server"],
     ```

  5. Add `"publishConfig"` field (after `"engines"`):
     ```json
     "publishConfig": {
       "access": "public"
     },
     ```

  6. Update `"build:server"` script to copy migrations:
     ```json
     "build:server": "tsup src/server.ts --format esm --dts --clean --out-dir dist-server && cp -r src/migrations dist-server/migrations",
     ```

  7. Add `"prepublishOnly"` script (after `"typecheck"`):
     ```json
     "prepublishOnly": "npm run build && npm run build:server"
     ```

- [ ] **Step 3: Validate JSON**

  ```bash
  node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8')); console.log('valid')"
  ```
  Expected: `valid`

- [ ] **Step 4: Run full build and verify migration output**

  ```bash
  npm run build && npm run build:server
  ```
  Expected: both complete without errors.

  ```bash
  ls dist/migrations/ && ls dist-server/migrations/
  ```
  Expected both commands return: `001_initial.sql  002_fts5.sql`

- [ ] **Step 5: Run tests to confirm nothing broke**

  ```bash
  npm test
  ```
  Expected: all 73 tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add package.json
  git commit -m "chore: bump to 1.0.0, add npm publishing config and prepublishOnly"
  ```

---

### Task 8: Update server.ts version string and verify build

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Read current server.ts**

  Read `src/server.ts` to locate the hardcoded version string.

- [ ] **Step 2: Update version string**

  Find the line containing `version: '0.1.0'` (inside the server `{ name: 'plugin-memory', version: '...' }` object). Change it to `version: '1.0.0'`.

- [ ] **Step 3: Run typecheck**

  ```bash
  npm run typecheck
  ```
  Expected: no errors.

- [ ] **Step 4: Run full build**

  ```bash
  npm run build && npm run build:server
  ```
  Expected: both complete without errors.

- [ ] **Step 5: Run tests one final time**

  ```bash
  npm test
  ```
  Expected: all 73 tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add src/server.ts
  git commit -m "chore: update server version string to 1.0.0"
  ```

---

## Chunk 4: npm publish and marketplace registration

### Task 9: Publish to npm

**Files:** None — runtime publish step.

> **Note:** This task requires Lord Roti's npm credentials. Steps 1–2 require manual action. Rialita executes Steps 3–5.

- [ ] **Step 1: Create npm account (if not already done)**

  If you do not have an npm account, create one at https://www.npmjs.com/signup.

- [ ] **Step 2: Login to npm**

  Run the following and enter your credentials when prompted:

  ```bash
  npm login
  ```

  Verify login succeeded:

  ```bash
  npm whoami
  ```
  Expected: your npm username.

- [ ] **Step 3: Dry-run publish to inspect what will be shipped**

  ```bash
  npm publish --dry-run
  ```

  Confirm the output includes all of the following:
  - `dist/index.js`, `dist/index.d.ts`
  - `dist/migrations/001_initial.sql`, `dist/migrations/002_fts5.sql`
  - `dist-server/server.js`
  - `dist-server/migrations/001_initial.sql`, `dist-server/migrations/002_fts5.sql`
  - `README.md`, `LICENSE`, `CHANGELOG.md`, `package.json`

  Confirm the output does NOT include:
  - `src/` source files
  - `tests/` directory
  - `node_modules/`
  - `.git/`

- [ ] **Step 4: Publish**

  ```bash
  npm publish
  ```
  Expected: `+ plugin-memory@1.0.0` in output.

- [ ] **Step 5: Verify on npm registry**

  ```bash
  npm view plugin-memory
  ```
  Expected: package metadata showing version `1.0.0`.

---

### Task 10: Register in RKPinata marketplace

**Files:**
- Modify: `rkpinata-plugin/.claude-plugin/marketplace.json` (in the `rkpinata-plugin` repo — clone it first if not present locally)

- [ ] **Step 1: Clone marketplace repo (if not already local)**

  ```bash
  gh repo clone RKPinata/rkpinata-plugin /tmp/rkpinata-plugin
  ```

- [ ] **Step 2: Read current marketplace.json**

  Read `/tmp/rkpinata-plugin/.claude-plugin/marketplace.json` to see the current plugins array.

- [ ] **Step 3: Add plugin-memory entry**

  In the `plugins` array, append the following entry (after the existing `faah` entry):

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

- [ ] **Step 4: Validate JSON**

  ```bash
  node -e "JSON.parse(require('fs').readFileSync('/tmp/rkpinata-plugin/.claude-plugin/marketplace.json', 'utf8')); console.log('valid')"
  ```
  Expected: `valid`

- [ ] **Step 5: Commit and push**

  ```bash
  cd /tmp/rkpinata-plugin
  git add .claude-plugin/marketplace.json
  git commit -m "feat: add plugin-memory to marketplace"
  git push
  ```

- [ ] **Step 6: Verify installation works (Lord Roti — manual step)**

  In a Claude Code session:

  ```
  /plugin marketplace update rkpinata-plugins
  /plugin install plugin-memory@rkpinata-plugins
  ```

  Expected: plugin installs without errors. Verify MCP server is registered and `/memory-status` command is available.

---

## Release checklist note

At every future release, update these three locations to keep versions in sync:
1. `package.json` → `"version"`
2. `src/server.ts` → version string in server info object
3. `.claude-plugin/plugin.json` → `"version"`
