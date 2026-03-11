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
