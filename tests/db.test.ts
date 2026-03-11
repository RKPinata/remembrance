import { describe, it, expect, afterEach } from "vitest";
import { openDatabase, closeDatabase } from "../src/db.js";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "remembrance-test-db");

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe("openDatabase", () => {
  it("creates the directory and memory.db file", () => {
    const { db } = openDatabase(testDir);
    closeDatabase(db);
    expect(existsSync(join(testDir, "memory.db"))).toBe(true);
  });

  it("creates the entries table", () => {
    const { db } = openDatabase(testDir);
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='entries'",
      )
      .get();
    closeDatabase(db);
    expect(row).toBeTruthy();
  });

  it("creates the entries_fts virtual table", () => {
    const { db } = openDatabase(testDir);
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='entries_fts'",
      )
      .get();
    closeDatabase(db);
    expect(row).toBeTruthy();
  });

  it("enables WAL mode", () => {
    const { db } = openDatabase(testDir);
    const row = db.prepare("PRAGMA journal_mode").get() as {
      journal_mode: string;
    };
    closeDatabase(db);
    expect(row.journal_mode).toBe("wal");
  });

  it("records both migrations in schema_migrations", () => {
    const { db } = openDatabase(testDir);
    const rows = db
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all() as { version: number }[];
    closeDatabase(db);
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
  });

  it("is idempotent — calling openDatabase twice does not fail", () => {
    const { db: db1 } = openDatabase(testDir);
    closeDatabase(db1);
    const { db: db2 } = openDatabase(testDir);
    closeDatabase(db2);
    // No error = pass
  });

  it("sets user_version to the highest migration version", () => {
    const { db } = openDatabase(testDir);
    const row = db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    closeDatabase(db);
    expect(row.user_version).toBe(2);
  });
});
