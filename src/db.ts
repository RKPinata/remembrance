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

  // Safety and performance settings — pragmas run outside migrations
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
  // Bootstrap: ensure schema_migrations exists before we check versions.
  // 001_initial.sql also creates it with IF NOT EXISTS — this is intentional
  // double-creation to handle the first-run case before the migration file runs.
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
    let sql: string
    try {
      sql = readFileSync(sqlPath, 'utf8')
    } catch {
      throw new Error(
        `Migration file not found: ${sqlPath}\n` +
        `Ensure the build step copied src/migrations/ to dist/migrations/ (run: npm run build)`
      )
    }

    db.transaction(() => {
      db.exec(sql)
      insertMigration.run(version, new Date().toISOString())
    })()
  }

  // Keep PRAGMA user_version in sync with schema_migrations for external tooling
  if (MIGRATIONS.length > 0) {
    const highestVersion = MIGRATIONS[MIGRATIONS.length - 1].version
    db.pragma(`user_version = ${highestVersion}`)
  }
}
