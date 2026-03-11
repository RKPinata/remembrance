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
