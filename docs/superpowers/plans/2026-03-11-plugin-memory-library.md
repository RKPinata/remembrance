# plugin-memory Library Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `plugin-memory` — a reusable, SQLite-backed memory library for Claude-based plugin ecosystems, exposing eight MCP-compatible tools via a typed `MemoryClient` API.

**Architecture:** SQLite (`better-sqlite3`) as the source of truth with FTS5 full-text search, write-through Markdown exports for human readability, and an `initMemory()` factory that returns a typed `MemoryClient`. Three-tier scope hierarchy (`user` → `project` → `plugin:X`) with migration-driven schema versioning.

**Tech Stack:** TypeScript/Node 20+, `better-sqlite3`, `vitest`, `tsup`. MCP server via `@modelcontextprotocol/sdk`.

**Spec:** `memory-layer-architecture.md` in repo root — consult for all architectural decisions.

---

## File Map

| File | Responsibility |
|---|---|
| `src/types.ts` | All shared TypeScript interfaces and type aliases |
| `src/paths.ts` | XDG/platform base directory resolution |
| `src/db.ts` | SQLite connection, WAL setup, migration runner |
| `src/sanitise.ts` | Secret pattern detection — refuses credentials in content |
| `src/handlers.ts` | Implementations of all 8 memory tool handlers |
| `src/export.ts` | JSONL export/import and Markdown write-through |
| `src/tools.ts` | MCP tool schema definitions (JSON Schema) |
| `src/server.ts` | Standalone MCP server entry (registers tools with MCP SDK) |
| `src/index.ts` | Public API: `initMemory()` → `MemoryClient` |
| `src/migrations/001_initial.sql` | Core `entries` table + `schema_migrations` table + indexes |
| `src/migrations/002_fts5.sql` | FTS5 virtual table + insert/update/delete triggers |
| `tests/paths.test.ts` | Unit tests for path resolution |
| `tests/db.test.ts` | Unit tests for DB init, migrations, WAL |
| `tests/sanitise.test.ts` | Unit tests for secret detection |
| `tests/handlers.test.ts` | Unit tests for all 8 handlers |
| `tests/export.test.ts` | Unit tests for JSONL and Markdown export |
| `tests/integration.test.ts` | End-to-end: initMemory → write → read → search → forget |
| `package.json` | Package manifest, scripts, dependencies |
| `tsconfig.json` | TypeScript compiler config |
| `vitest.config.ts` | Vitest configuration |

---

## Chunk 1: Project Foundation

### Task 1: Package Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "plugin-memory",
  "version": "0.1.0",
  "description": "SQLite-backed reusable memory layer for Claude-based plugin ecosystems",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean && cp -r src/migrations dist/migrations",
    "build:server": "tsup src/server.ts --format esm --dts --clean --out-dir dist/server",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "better-sqlite3": "^9.4.3"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
  },
})
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, `package-lock.json` written. No errors.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts package-lock.json
git commit -m "chore: scaffold package with TypeScript, vitest, and tsup"
```

---

### Task 2: TypeScript Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write `src/types.ts`**

```typescript
// Scope hierarchy: user → project → plugin:X
export type Scope = 'user' | 'project' | `plugin:${string}`

export type EntryType =
  | 'decision'
  | 'adr'
  | 'pattern'
  | 'convention'
  | 'preference'
  | 'summary'
  | 'glossary'
  | 'state'
  | 'constraint'

export interface MemoryEntry {
  id: string
  scope: Scope
  pluginId: string | null
  projectKey: string
  type: EntryType
  content: string
  tags: string[]           // stored as JSON in SQLite
  source: string | null
  confidence: number       // 0.0–1.0
  verified: boolean
  deleted: boolean
  history: string[]        // prior content versions (JSON array)
  data: Record<string, unknown>  // plugin-specific payload
  createdAt: string        // ISO 8601
  updatedAt: string        // ISO 8601
}

export interface WriteMemoryParams {
  scope: Scope
  type: EntryType
  content: string
  tags?: string[]
  source?: string
  confidence?: number
  verified?: boolean
  data?: Record<string, unknown>
}

export interface ReadMemoryParams {
  scope: Scope
  type?: EntryType
  tags?: string[]
  limit?: number
  projectKey?: string
}

export interface SearchMemoryParams {
  query: string
  scope?: Scope
  type?: EntryType
  limit?: number
}

export interface UpdateMemoryParams {
  id: string
  content?: string
  tags?: string[]
  confidence?: number
  verified?: boolean
}

export interface ForgetMemoryParams {
  id: string
}

export interface ListMemoryScopesParams {
  projectKey?: string
}

export interface ExportMemoryParams {
  outputPath?: string
  scope?: Scope
}

export interface ScopeInfo {
  scope: Scope
  entryCount: number
  lastUpdated: string
}

export interface WriteResult {
  id: string
  timestamp: string
}

export interface UpdateResult {
  id: string
  updatedAt: string
}

export interface ForgetResult {
  deleted: true
}

export interface RebuildResult {
  entriesIndexed: number
}

export interface ExportResult {
  exportedPath: string
  entryCount: number
}

export interface InitMemoryOptions {
  projectKey: string
  pluginId: string
  baseDir?: string        // override platform default
  markdownExport?: boolean
  maxContentBytes?: number
}

export interface MemoryClient {
  readMemory(params: ReadMemoryParams): MemoryEntry[]
  writeMemory(params: WriteMemoryParams): WriteResult
  searchMemory(params: SearchMemoryParams): (MemoryEntry & { snippet: string })[]
  updateMemory(params: UpdateMemoryParams): UpdateResult
  forgetMemory(params: ForgetMemoryParams): ForgetResult
  listMemoryScopes(params?: ListMemoryScopesParams): ScopeInfo[]
  rebuildIndex(): RebuildResult
  exportMemory(params?: ExportMemoryParams): Promise<ExportResult>
  close(): void
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add TypeScript type definitions for memory entries and tool params"
```

---

### Task 3: Platform Paths Module

**Files:**
- Create: `src/paths.ts`
- Create: `tests/paths.test.ts`

- [ ] **Step 1: Write failing test `tests/paths.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { getMemoryBaseDir, deriveProjectKey, resolveProjectDir } from '../src/paths.js'

describe('getMemoryBaseDir', () => {
  it('returns a non-empty string', () => {
    const dir = getMemoryBaseDir()
    expect(typeof dir).toBe('string')
    expect(dir.length).toBeGreaterThan(0)
  })

  it('returns a path ending in plugin-memory', () => {
    const dir = getMemoryBaseDir()
    expect(dir).toMatch(/plugin-memory$/)
  })

  it('accepts a baseDir override', () => {
    const dir = getMemoryBaseDir('/tmp/custom')
    expect(dir).toBe('/tmp/custom')
  })
})

describe('deriveProjectKey', () => {
  it('lowercases the path', () => {
    const key = deriveProjectKey('/Users/Alice/MyProject')
    expect(key).toBe(key.toLowerCase())
  })

  it('replaces non-alphanumeric characters with hyphens', () => {
    const key = deriveProjectKey('/Users/alice/my project')
    expect(key).not.toContain(' ')
  })

  it('strips leading slash so key does not start with a hyphen', () => {
    const key = deriveProjectKey('/home/user/repo')
    expect(key).not.toMatch(/^-/)
  })

  it('produces stable output for the same input', () => {
    const key1 = deriveProjectKey('/Users/danish/Repo/plugin-memory')
    const key2 = deriveProjectKey('/Users/danish/Repo/plugin-memory')
    expect(key1).toBe(key2)
  })

  it('produces a non-empty key', () => {
    const key = deriveProjectKey('/Users/danish/Repo/plugin-memory')
    expect(key.length).toBeGreaterThan(0)
  })
})

describe('resolveProjectDir', () => {
  it('joins baseDir and projectKey', () => {
    const dir = resolveProjectDir('my-key', '/tmp/base')
    expect(dir).toBe('/tmp/base/my-key')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- tests/paths.test.ts
```

Expected: FAIL — `Cannot find module '../src/paths.js'`

- [ ] **Step 3: Write `src/paths.ts`**

```typescript
import { platform } from 'node:process'
import { join } from 'node:path'
import { homedir } from 'node:os'

const APP_NAME = 'plugin-memory'

export function getMemoryBaseDir(override?: string): string {
  if (override) return override

  if (platform === 'win32') {
    const appData = process.env.APPDATA
    if (!appData) throw new Error('APPDATA environment variable not set')
    return join(appData, APP_NAME)
  }

  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', APP_NAME)
  }

  // Linux / other POSIX: XDG Base Directory spec
  const xdgData = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share')
  return join(xdgData, APP_NAME)
}

export function deriveProjectKey(absolutePath: string): string {
  return absolutePath
    .replace(/^\//, '')            // strip leading slash
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // replace non-alphanumeric runs with single hyphen
    .replace(/^-+|-+$/g, '')      // strip leading/trailing hyphens
}

export function resolveProjectDir(projectKey: string, baseDir: string): string {
  return join(baseDir, projectKey)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- tests/paths.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/paths.ts tests/paths.test.ts
git commit -m "feat: add platform path resolution with XDG/macOS/Windows support"
```

---

### Task 4: Migration SQL Files

**Files:**
- Create: `src/migrations/001_initial.sql`
- Create: `src/migrations/002_fts5.sql`

Note: Pragmas (`journal_mode`, `foreign_keys`, `busy_timeout`) are set by `db.ts` before migrations run. Do NOT include pragmas in migration files — they cannot execute inside a transaction.

- [ ] **Step 1: Create `src/migrations/001_initial.sql`**

```sql
-- 001_initial.sql
-- Core entries table, schema_migrations table, and indexes.
-- Pragmas are omitted — set by db.ts before migrations run.

CREATE TABLE IF NOT EXISTS entries (
  id           TEXT    PRIMARY KEY,
  scope        TEXT    NOT NULL,
  plugin_id    TEXT,
  project_key  TEXT    NOT NULL,
  type         TEXT    NOT NULL,
  content      TEXT    NOT NULL,
  tags         TEXT    NOT NULL DEFAULT '[]',
  source       TEXT,
  confidence   REAL    NOT NULL DEFAULT 1.0,
  verified     INTEGER NOT NULL DEFAULT 0,
  deleted      INTEGER NOT NULL DEFAULT 0,
  history      TEXT    NOT NULL DEFAULT '[]',
  data         TEXT    NOT NULL DEFAULT '{}',
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_scope        ON entries(scope);
CREATE INDEX IF NOT EXISTS idx_entries_project_key  ON entries(project_key);
CREATE INDEX IF NOT EXISTS idx_entries_type         ON entries(type);
CREATE INDEX IF NOT EXISTS idx_entries_deleted      ON entries(deleted);
CREATE INDEX IF NOT EXISTS idx_entries_updated_at   ON entries(updated_at);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT    NOT NULL
);
```

- [ ] **Step 2: Create `src/migrations/002_fts5.sql`**

```sql
-- 002_fts5.sql
-- FTS5 virtual table for full-text search over content and tags.
-- Triggers keep the index automatically in sync with the entries table.

CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
  content,
  tags,
  content='entries',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS entries_ai
  AFTER INSERT ON entries
BEGIN
  INSERT INTO entries_fts(rowid, content, tags)
    VALUES (new.rowid, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS entries_ad
  AFTER DELETE ON entries
BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, content, tags)
    VALUES ('delete', old.rowid, old.content, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS entries_au
  AFTER UPDATE ON entries
BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, content, tags)
    VALUES ('delete', old.rowid, old.content, old.tags);
  INSERT INTO entries_fts(rowid, content, tags)
    VALUES (new.rowid, new.content, new.tags);
END;
```

- [ ] **Step 3: Commit**

```bash
git add src/migrations/
git commit -m "feat: add SQLite migration SQL files (001 core schema, 002 FTS5)"
```

---

### Task 5: Database Module

**Files:**
- Create: `src/db.ts`
- Create: `tests/db.test.ts`

- [ ] **Step 1: Write failing test `tests/db.test.ts`**

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { openDatabase, closeDatabase } from '../src/db.js'
import { rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const testDir = join(tmpdir(), 'plugin-memory-test-db')

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true })
  }
})

describe('openDatabase', () => {
  it('creates the directory and memory.db file', () => {
    const { db } = openDatabase(testDir)
    closeDatabase(db)
    expect(existsSync(join(testDir, 'memory.db'))).toBe(true)
  })

  it('creates the entries table', () => {
    const { db } = openDatabase(testDir)
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='entries'"
    ).get()
    closeDatabase(db)
    expect(row).toBeTruthy()
  })

  it('creates the entries_fts virtual table', () => {
    const { db } = openDatabase(testDir)
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='entries_fts'"
    ).get()
    closeDatabase(db)
    expect(row).toBeTruthy()
  })

  it('enables WAL mode', () => {
    const { db } = openDatabase(testDir)
    const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
    closeDatabase(db)
    expect(row.journal_mode).toBe('wal')
  })

  it('records both migrations in schema_migrations', () => {
    const { db } = openDatabase(testDir)
    const rows = db.prepare(
      'SELECT version FROM schema_migrations ORDER BY version'
    ).all() as { version: number }[]
    closeDatabase(db)
    expect(rows.map(r => r.version)).toEqual([1, 2])
  })

  it('is idempotent — calling openDatabase twice does not fail', () => {
    const { db: db1 } = openDatabase(testDir)
    closeDatabase(db1)
    const { db: db2 } = openDatabase(testDir)
    closeDatabase(db2)
    // No error = pass
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- tests/db.test.ts
```

Expected: FAIL — `Cannot find module '../src/db.js'`

- [ ] **Step 3: Write `src/db.ts`**

```typescript
import Database from 'better-sqlite3'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const MIGRATIONS: { version: number; file: string }[] = [
  { version: 1, file: 'migrations/001_initial.sql' },
  { version: 2, file: 'migrations/002_fts5.sql' },
]

export function openDatabase(projectDir: string): { db: Database.Database } {
  mkdirSync(projectDir, { recursive: true, mode: 0o700 })

  const dbPath = join(projectDir, 'memory.db')
  const db = new Database(dbPath, { fileMustExist: false })

  // Safety and performance settings
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  runMigrations(db)

  return { db }
}

export function closeDatabase(db: Database.Database): void {
  db.close()
}

function runMigrations(db: Database.Database): void {
  // Bootstrap: ensure schema_migrations exists before we check versions
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT    NOT NULL
    )
  `)

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[])
      .map(r => r.version)
  )

  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)'
  )

  for (const { version, file } of MIGRATIONS) {
    if (applied.has(version)) continue

    const sqlPath = join(__dirname, file)
    const sql = readFileSync(sqlPath, 'utf8')

    db.transaction(() => {
      db.exec(sql)
      insertMigration.run(version, new Date().toISOString())
    })()
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- tests/db.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db.ts tests/db.test.ts
git commit -m "feat: add SQLite database module with WAL setup and migration runner"
```

---

## Chunk 2: Core Tool Handlers

### Task 6: Sanitisation Module

**Files:**
- Create: `src/sanitise.ts`
- Create: `tests/sanitise.test.ts`

- [ ] **Step 1: Write failing test `tests/sanitise.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { detectSecrets, assertSafe } from '../src/sanitise.js'

describe('detectSecrets', () => {
  it('returns false for plain architectural text', () => {
    expect(detectSecrets('Use React Query for all server state management')).toBe(false)
  })

  it('detects AWS access key format', () => {
    expect(detectSecrets('key: AKIAIOSFODNN7EXAMPLE')).toBe(true)
  })

  it('detects a Bearer JWT token', () => {
    expect(detectSecrets('Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.abc.def')).toBe(true)
  })

  it('detects a database connection string with password', () => {
    expect(detectSecrets('postgresql://user:secretpassword@localhost/db')).toBe(true)
  })

  it('detects a PEM private key header', () => {
    expect(detectSecrets('-----BEGIN RSA PRIVATE KEY-----')).toBe(true)
  })

  it('detects a GitHub personal access token', () => {
    expect(detectSecrets('ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456')).toBe(true)
  })

  it('detects a generic api_key assignment', () => {
    expect(detectSecrets('api_key=sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ12345678')).toBe(true)
  })

  it('detects password assignment', () => {
    expect(detectSecrets('password=mysecretpassword123')).toBe(true)
  })
})

describe('assertSafe', () => {
  it('does not throw for safe content', () => {
    expect(() => assertSafe('A safe architectural decision about state management')).not.toThrow()
  })

  it('throws for content containing an AWS key', () => {
    expect(() => assertSafe('AKIAIOSFODNN7EXAMPLE')).toThrow(/secret/)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- tests/sanitise.test.ts
```

Expected: FAIL — `Cannot find module '../src/sanitise.js'`

- [ ] **Step 3: Write `src/sanitise.ts`**

```typescript
// Common secret patterns. Refuses entries that appear to contain credentials.
const SECRET_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/,                                          // AWS Access Key ID
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY/,                       // PEM private key
  /ghp_[a-zA-Z0-9]{36}/,                                      // GitHub personal access token
  /ghs_[a-zA-Z0-9]{36}/,                                      // GitHub app token
  /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,      // JWT
  /(?:api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*\S{16,}/i,  // generic API key assignment
  /(?:password|passwd|pwd)\s*[:=]\s*\S{4,}/i,                  // password assignment
  /(?:postgresql|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/,       // DB connection string with password
  /sk-[a-zA-Z0-9]{32,}/,                                       // OpenAI-style secret key
]

export function detectSecrets(content: string): boolean {
  return SECRET_PATTERNS.some(pattern => pattern.test(content))
}

export function assertSafe(content: string): void {
  if (detectSecrets(content)) {
    throw new Error(
      'Content appears to contain a secret or credential. ' +
      'Memory entries must not contain API keys, tokens, passwords, or private keys.'
    )
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- tests/sanitise.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sanitise.ts tests/sanitise.test.ts
git commit -m "feat: add secret detection utility to prevent credential storage in memory"
```

---

### Task 7: All Eight Tool Handlers

**Files:**
- Create: `src/handlers.ts`
- Create: `tests/handlers.test.ts`

- [ ] **Step 1: Write failing test `tests/handlers.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- tests/handlers.test.ts
```

Expected: FAIL — `Cannot find module '../src/handlers.js'`

- [ ] **Step 3: Write `src/handlers.ts`**

```typescript
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { assertSafe } from './sanitise.js'
import type {
  WriteMemoryParams,
  ReadMemoryParams,
  SearchMemoryParams,
  UpdateMemoryParams,
  ForgetMemoryParams,
  ListMemoryScopesParams,
  MemoryEntry,
  WriteResult,
  UpdateResult,
  ForgetResult,
  RebuildResult,
  ScopeInfo,
} from './types.js'

interface HandlerOptions {
  projectKey: string
  pluginId: string
  maxContentBytes?: number
}

// Raw SQLite row shape (all integers, no booleans, JSON as strings)
interface RawEntry {
  id: string
  scope: string
  plugin_id: string | null
  project_key: string
  type: string
  content: string
  tags: string
  source: string | null
  confidence: number
  verified: number
  deleted: number
  history: string
  data: string
  created_at: string
  updated_at: string
}

function deserialise(raw: RawEntry): MemoryEntry {
  return {
    id: raw.id,
    scope: raw.scope as MemoryEntry['scope'],
    pluginId: raw.plugin_id,
    projectKey: raw.project_key,
    type: raw.type as MemoryEntry['type'],
    content: raw.content,
    tags: JSON.parse(raw.tags) as string[],
    source: raw.source,
    confidence: raw.confidence,
    verified: raw.verified === 1,
    deleted: raw.deleted === 1,
    history: JSON.parse(raw.history) as string[],
    data: JSON.parse(raw.data) as Record<string, unknown>,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

export function createHandlers(db: Database.Database, opts: HandlerOptions) {
  const { projectKey, pluginId, maxContentBytes = 8192 } = opts

  // --- writeMemory ---

  function writeMemory(params: WriteMemoryParams): WriteResult {
    const {
      scope, type, content,
      tags = [], source, confidence = 1.0,
      verified = false, data = {},
    } = params

    if (Buffer.byteLength(content, 'utf8') > maxContentBytes) {
      throw new Error(`Content too long: max ${maxContentBytes} bytes allowed`)
    }
    assertSafe(content)

    const id = randomUUID()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO entries
        (id, scope, plugin_id, project_key, type, content, tags, source,
         confidence, verified, deleted, history, data, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', ?, ?, ?)
    `).run(
      id, scope, pluginId, projectKey, type, content,
      JSON.stringify(tags), source ?? null,
      confidence, verified ? 1 : 0,
      JSON.stringify(data), now, now
    )

    return { id, timestamp: now }
  }

  // --- readMemory ---

  function readMemory(params: ReadMemoryParams): MemoryEntry[] {
    const { scope, type, tags, limit = 10 } = params

    let sql = 'SELECT * FROM entries WHERE scope = ? AND project_key = ? AND deleted = 0'
    const bindings: unknown[] = [scope, projectKey]

    if (type) {
      sql += ' AND type = ?'
      bindings.push(type)
    }

    sql += ' ORDER BY updated_at DESC LIMIT ?'
    bindings.push(limit)

    const rows = db.prepare(sql).all(...bindings) as RawEntry[]
    const entries = rows.map(deserialise)

    if (tags && tags.length > 0) {
      return entries.filter(e => tags.every(t => e.tags.includes(t)))
    }
    return entries
  }

  // --- searchMemory ---

  function searchMemory(params: SearchMemoryParams): (MemoryEntry & { snippet: string })[] {
    const { query, scope, type, limit = 10 } = params

    // Sanitise FTS5 query: strip characters with special FTS5 meaning
    const safeQuery = query.replace(/["'*^()]/g, ' ').trim()
    if (!safeQuery) return []

    let sql = `
      SELECT e.*, snippet(entries_fts, 0, '<b>', '</b>', '...', 10) as snippet
      FROM entries_fts
      JOIN entries e ON entries_fts.rowid = e.rowid
      WHERE entries_fts MATCH ?
        AND e.project_key = ?
        AND e.deleted = 0
    `
    const bindings: unknown[] = [safeQuery, projectKey]

    if (scope) {
      sql += ' AND e.scope = ?'
      bindings.push(scope)
    }
    if (type) {
      sql += ' AND e.type = ?'
      bindings.push(type)
    }

    sql += ' ORDER BY rank LIMIT ?'
    bindings.push(limit)

    try {
      const rows = db.prepare(sql).all(...bindings) as (RawEntry & { snippet: string })[]
      return rows.map(r => ({ ...deserialise(r), snippet: r.snippet }))
    } catch {
      return []
    }
  }

  // --- updateMemory ---

  function updateMemory(params: UpdateMemoryParams): UpdateResult {
    const { id, content, tags, confidence, verified } = params

    const existing = db.prepare(
      'SELECT * FROM entries WHERE id = ? AND deleted = 0'
    ).get(id) as RawEntry | undefined

    if (!existing) throw new Error(`Entry not found: ${id}`)

    const now = new Date().toISOString()
    const history = JSON.parse(existing.history) as string[]
    const updates: string[] = ['updated_at = ?']
    const bindings: unknown[] = [now]

    if (content !== undefined) {
      if (Buffer.byteLength(content, 'utf8') > maxContentBytes) {
        throw new Error(`Content too long: max ${maxContentBytes} bytes allowed`)
      }
      assertSafe(content)
      history.push(existing.content)
      updates.push('content = ?', 'history = ?')
      bindings.push(content, JSON.stringify(history))
    }

    if (tags !== undefined) {
      updates.push('tags = ?')
      bindings.push(JSON.stringify(tags))
    }

    if (confidence !== undefined) {
      updates.push('confidence = ?')
      bindings.push(confidence)
    }

    if (verified !== undefined) {
      updates.push('verified = ?')
      bindings.push(verified ? 1 : 0)
    }

    bindings.push(id)
    db.prepare(`UPDATE entries SET ${updates.join(', ')} WHERE id = ?`).run(...bindings)

    return { id, updatedAt: now }
  }

  // --- forgetMemory ---

  function forgetMemory(params: ForgetMemoryParams): ForgetResult {
    const now = new Date().toISOString()
    db.prepare(
      'UPDATE entries SET deleted = 1, updated_at = ? WHERE id = ?'
    ).run(now, params.id)
    return { deleted: true }
  }

  // --- listMemoryScopes ---

  function listMemoryScopes(params?: ListMemoryScopesParams): ScopeInfo[] {
    const pKey = params?.projectKey ?? projectKey
    const rows = db.prepare(`
      SELECT scope, COUNT(*) as entry_count, MAX(updated_at) as last_updated
      FROM entries
      WHERE deleted = 0 AND project_key = ?
      GROUP BY scope
      ORDER BY last_updated DESC
    `).all(pKey) as { scope: string; entry_count: number; last_updated: string }[]

    return rows.map(r => ({
      scope: r.scope as ScopeInfo['scope'],
      entryCount: r.entry_count,
      lastUpdated: r.last_updated,
    }))
  }

  // --- rebuildIndex ---

  function rebuildIndex(): RebuildResult {
    db.exec("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')")
    const { n } = db.prepare(
      'SELECT COUNT(*) as n FROM entries WHERE deleted = 0'
    ).get() as { n: number }
    return { entriesIndexed: n }
  }

  return {
    writeMemory,
    readMemory,
    searchMemory,
    updateMemory,
    forgetMemory,
    listMemoryScopes,
    rebuildIndex,
  }
}
```

- [ ] **Step 4: Run all handler tests**

```bash
npm test -- tests/handlers.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/handlers.ts tests/handlers.test.ts
git commit -m "feat: implement all 8 memory tool handlers (write/read/search/update/forget/list/rebuild)"
```

---

## Chunk 3: Integration Surface

### Task 8: Export Module

**Files:**
- Create: `src/export.ts`
- Create: `tests/export.test.ts`

- [ ] **Step 1: Write failing test `tests/export.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { exportToJsonl, importFromJsonl, appendToMarkdown, getMarkdownPath } from '../src/export.js'
import { openDatabase, closeDatabase } from '../src/db.js'
import { createHandlers } from '../src/handlers.js'
import type Database from 'better-sqlite3'
import { rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const testDir = join(tmpdir(), 'plugin-memory-test-export')
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
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- tests/export.test.ts
```

Expected: FAIL — `Cannot find module '../src/export.js'`

- [ ] **Step 3: Write `src/export.ts`**

```typescript
import type Database from 'better-sqlite3'
import { writeFileSync, appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ExportResult } from './types.js'

interface RawEntry {
  id: string
  scope: string
  plugin_id: string | null
  project_key: string
  type: string
  content: string
  tags: string
  source: string | null
  confidence: number
  verified: number
  deleted: number
  history: string
  data: string
  created_at: string
  updated_at: string
}

export async function exportToJsonl(
  db: Database.Database,
  params: { outputPath: string; scope?: string; projectKey: string }
): Promise<ExportResult> {
  const { outputPath, scope, projectKey } = params

  let sql = 'SELECT * FROM entries WHERE deleted = 0 AND project_key = ?'
  const bindings: unknown[] = [projectKey]

  if (scope) {
    sql += ' AND scope = ?'
    bindings.push(scope)
  }

  const rows = db.prepare(sql).all(...bindings) as RawEntry[]

  mkdirSync(dirname(outputPath), { recursive: true })
  const lines = rows.map(r => JSON.stringify(r)).join('\n')
  writeFileSync(outputPath, lines + '\n', { encoding: 'utf8' })

  return { exportedPath: outputPath, entryCount: rows.length }
}

export async function importFromJsonl(db: Database.Database, inputPath: string): Promise<number> {
  if (!existsSync(inputPath)) {
    throw new Error(`Import file not found: ${inputPath}`)
  }

  const lines = readFileSync(inputPath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO entries
      (id, scope, plugin_id, project_key, type, content, tags, source,
       confidence, verified, deleted, history, data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let count = 0
  db.transaction(() => {
    for (const line of lines) {
      const r = JSON.parse(line) as RawEntry
      upsert.run(
        r.id, r.scope, r.plugin_id, r.project_key, r.type, r.content,
        r.tags, r.source, r.confidence, r.verified, r.deleted,
        r.history, r.data, r.created_at, r.updated_at
      )
      count++
    }
  })()

  return count
}

export async function appendToMarkdown(params: {
  filePath: string
  type: string
  content: string
  tags: string[]
  timestamp: string
}): Promise<void> {
  const { filePath, type, content, tags, timestamp } = params
  mkdirSync(dirname(filePath), { recursive: true })

  const tagStr = tags.length > 0 ? `\`${tags.join('`, `')}\`` : '_none_'
  const entry = [
    ``,
    `## ${timestamp.slice(0, 10)} — ${type}`,
    ``,
    content,
    ``,
    `**Tags:** ${tagStr}`,
    ``,
    `---`,
    ``,
  ].join('\n')

  appendFileSync(filePath, entry, 'utf8')
}

const MARKDOWN_FILE_MAP: Record<string, string> = {
  decision: 'decisions.md',
  adr: 'adrs/index.md',
  pattern: 'patterns.md',
  convention: 'patterns.md',
  preference: 'preferences.md',
  summary: 'summaries.md',
  glossary: 'glossary.md',
  state: 'state.md',
  constraint: 'constraints.md',
}

export function getMarkdownPath(exportsDir: string, type: string): string {
  return join(exportsDir, MARKDOWN_FILE_MAP[type] ?? 'misc.md')
}
```

- [ ] **Step 4: Run export tests**

```bash
npm test -- tests/export.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/export.ts tests/export.test.ts
git commit -m "feat: add JSONL export/import and Markdown write-through export module"
```

---

### Task 9: MCP Tool Schemas

**Files:**
- Create: `src/tools.ts`

No tests needed — this is a data-only module (plain JSON Schema objects). It is exercised by the integration test.

- [ ] **Step 1: Write `src/tools.ts`**

```typescript
// MCP tool definitions for the plugin-memory tool surface.
// These are registered with an MCP server via @modelcontextprotocol/sdk.
// Kept as const to preserve literal types for tooling.

export const MEMORY_TOOLS = [
  {
    name: 'read_memory',
    description:
      'Retrieve persistent memory entries by scope, type, or tags. ' +
      'Call at session start and before major task steps.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'Memory scope: user, project, or plugin:<id>',
        },
        type: {
          type: 'string',
          enum: ['decision', 'adr', 'pattern', 'convention', 'preference',
                 'summary', 'glossary', 'state', 'constraint'],
        },
        tags: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number', minimum: 1, maximum: 100, default: 10 },
        projectKey: { type: 'string' },
      },
      required: ['scope'],
    },
  },
  {
    name: 'write_memory',
    description:
      'Store a new persistent memory entry. Call when a decision is made, ' +
      'a pattern is identified, or a preference is confirmed. ' +
      'Never write secrets, tokens, or credentials.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'Memory scope: user, project, or plugin:<id>. Default: project.',
        },
        type: {
          type: 'string',
          enum: ['decision', 'adr', 'pattern', 'convention', 'preference',
                 'summary', 'glossary', 'state', 'constraint'],
        },
        content: { type: 'string', maxLength: 8192 },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string', description: 'File path, URL, or "session"' },
        confidence: { type: 'number', minimum: 0, maximum: 1, default: 1.0 },
        verified: { type: 'boolean', default: false },
      },
      required: ['scope', 'type', 'content'],
    },
  },
  {
    name: 'search_memory',
    description:
      'Full-text search across memory entries. ' +
      'Use when exploring prior decisions or looking for specific context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword search terms' },
        scope: { type: 'string' },
        type: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100, default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'update_memory',
    description:
      'Update an existing memory entry. Prior content is preserved in history. ' +
      'Use when an entry is superseded or corrected.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entry UUID from write_memory or read_memory' },
        content: { type: 'string', maxLength: 8192 },
        tags: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        verified: { type: 'boolean' },
      },
      required: ['id'],
    },
  },
  {
    name: 'forget_memory',
    description:
      'Soft-delete a memory entry. Entry is hidden from reads immediately ' +
      'and permanently purged after 30 days.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_memory_scopes',
    description: 'List all available memory scopes and their entry counts.',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string' },
      },
    },
  },
  {
    name: 'rebuild_index',
    description:
      'Reconstruct the FTS5 full-text search index from the SQLite source. ' +
      'Safe to run at any time. Use after import or suspected index corruption.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'export_memory',
    description:
      'Export all memory entries to a portable JSONL file for backup or migration.',
    inputSchema: {
      type: 'object',
      properties: {
        outputPath: { type: 'string', description: 'Absolute path for the output file' },
        scope: { type: 'string', description: 'Filter by scope (optional)' },
      },
    },
  },
] as const
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools.ts
git commit -m "feat: add MCP tool schema definitions for all 8 memory tools"
```

---

### Task 10: Public API — initMemory

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write `src/index.ts`**

```typescript
import { getMemoryBaseDir, deriveProjectKey, resolveProjectDir } from './paths.js'
import { openDatabase, closeDatabase } from './db.js'
import { createHandlers } from './handlers.js'
import { exportToJsonl, appendToMarkdown, getMarkdownPath } from './export.js'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type {
  InitMemoryOptions,
  MemoryClient,
  WriteMemoryParams,
  ExportMemoryParams,
  ExportResult,
} from './types.js'

// Re-export everything consumers need
export * from './types.js'
export * from './tools.js'
export { deriveProjectKey, getMemoryBaseDir } from './paths.js'

export async function initMemory(options: InitMemoryOptions): Promise<MemoryClient> {
  const {
    projectKey,
    pluginId,
    baseDir: baseDirOverride,
    markdownExport = false,
    maxContentBytes = 8192,
  } = options

  const baseDir = getMemoryBaseDir(baseDirOverride)
  const projectDir = resolveProjectDir(projectKey, baseDir)
  const exportsDir = join(projectDir, 'exports')

  mkdirSync(exportsDir, { recursive: true, mode: 0o700 })

  const { db } = openDatabase(projectDir)
  const handlers = createHandlers(db, { projectKey, pluginId, maxContentBytes })

  const client: MemoryClient = {
    readMemory: handlers.readMemory,
    searchMemory: handlers.searchMemory,
    updateMemory: handlers.updateMemory,
    forgetMemory: handlers.forgetMemory,
    listMemoryScopes: handlers.listMemoryScopes,
    rebuildIndex: handlers.rebuildIndex,

    writeMemory(params: WriteMemoryParams) {
      const result = handlers.writeMemory(params)

      if (markdownExport) {
        const mdPath = getMarkdownPath(exportsDir, params.type)
        // Non-fatal: Markdown export failure must never break the write
        appendToMarkdown({
          filePath: mdPath,
          type: params.type,
          content: params.content,
          tags: params.tags ?? [],
          timestamp: result.timestamp,
        }).catch(err => {
          console.error('[plugin-memory] Markdown export failed:', err)
        })
      }

      return result
    },

    async exportMemory(params?: ExportMemoryParams): Promise<ExportResult> {
      const outputPath = params?.outputPath ?? join(exportsDir, 'memory-export.jsonl')
      return exportToJsonl(db, {
        outputPath,
        scope: params?.scope as string | undefined,
        projectKey,
      })
    },

    close() {
      closeDatabase(db)
    },
  }

  return client
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add public initMemory API factory returning MemoryClient"
```

---

### Task 11: MCP Server Entrypoint

**Files:**
- Create: `src/server.ts`

- [ ] **Step 1: Write `src/server.ts`**

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { initMemory, deriveProjectKey, MEMORY_TOOLS } from './index.js'
import { cwd } from 'node:process'

async function main() {
  const projectKey =
    process.env.PLUGIN_MEMORY_PROJECT_KEY ?? deriveProjectKey(cwd())
  const pluginId = process.env.PLUGIN_MEMORY_PLUGIN_ID ?? 'core'
  const baseDir = process.env.PLUGIN_MEMORY_BASE_DIR

  const memory = await initMemory({ projectKey, pluginId, baseDir, markdownExport: true })

  const server = new Server(
    { name: 'plugin-memory', version: '0.1.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...MEMORY_TOOLS],
  }))

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args = {} } = request.params
    try {
      let result: unknown

      switch (name) {
        case 'read_memory':
          result = memory.readMemory(args as Parameters<typeof memory.readMemory>[0])
          break
        case 'write_memory':
          result = memory.writeMemory(args as Parameters<typeof memory.writeMemory>[0])
          break
        case 'search_memory':
          result = memory.searchMemory(args as Parameters<typeof memory.searchMemory>[0])
          break
        case 'update_memory':
          result = memory.updateMemory(args as Parameters<typeof memory.updateMemory>[0])
          break
        case 'forget_memory':
          result = memory.forgetMemory(args as Parameters<typeof memory.forgetMemory>[0])
          break
        case 'list_memory_scopes':
          result = memory.listMemoryScopes(args as Parameters<typeof memory.listMemoryScopes>[0])
          break
        case 'rebuild_index':
          result = memory.rebuildIndex()
          break
        case 'export_memory':
          result = await memory.exportMemory(args as Parameters<typeof memory.exportMemory>[0])
          break
        default:
          throw new Error(`Unknown tool: ${name}`)
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors (or fix any type errors in the switch arms).

- [ ] **Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat: add standalone MCP server entry with stdio transport"
```

---

### Task 12: Integration Test

**Files:**
- Create: `tests/integration.test.ts`

- [ ] **Step 1: Write `tests/integration.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run integration test**

```bash
npm test -- tests/integration.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration.test.ts
git commit -m "test: add end-to-end integration test for full initMemory lifecycle"
```

---

### Task 13: Full Test Suite and Build Verification

- [ ] **Step 1: Run the complete test suite**

```bash
npm test
```

Expected: All tests across `paths`, `db`, `sanitise`, `handlers`, `export`, and `integration` PASS. Zero failures.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: No TypeScript errors.

- [ ] **Step 3: Build the library**

```bash
npm run build
```

Expected: `dist/index.js` and `dist/index.d.ts` created. No build errors.

- [ ] **Step 4: Verify the built output is importable**

```bash
node -e "import('./dist/index.js').then(m => { console.log(Object.keys(m).join(', ')); process.exit(0); })"
```

Expected: Prints `initMemory, deriveProjectKey, getMemoryBaseDir, MEMORY_TOOLS, ...` (all public exports).

- [ ] **Step 5: Create `.gitignore` (do not commit `dist/`)**

```
node_modules/
dist/
*.db
*.db-shm
*.db-wal
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore
git commit -m "build: verify library builds and all tests pass"
```

---

## Summary of Deliverables

| Deliverable | Status |
|---|---|
| `src/types.ts` | All TypeScript interfaces |
| `src/paths.ts` | XDG path resolution |
| `src/db.ts` | SQLite + WAL + migration runner |
| `src/sanitise.ts` | Secret detection |
| `src/handlers.ts` | All 8 tool handlers |
| `src/export.ts` | JSONL + Markdown export/import |
| `src/tools.ts` | MCP tool schemas |
| `src/server.ts` | Standalone MCP server |
| `src/index.ts` | `initMemory()` public API |
| `src/migrations/001_initial.sql` | Core schema |
| `src/migrations/002_fts5.sql` | FTS5 + triggers |
| 6 test files | Unit + integration coverage |
| Build verified | `dist/` artifact ready |

---

_Plan authored by Rialita | Counsellor to Lord Roti | 2026-03-11_
