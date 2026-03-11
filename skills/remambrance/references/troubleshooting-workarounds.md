# Troubleshooting and Workarounds — remembrance

---

## 1. `initMemory()` fails on first call — directory not created

**Symptom**: `ENOENT` or `permission denied` on startup.

**Cause**: Base directory does not exist or user lacks write permission to the platform data path.

**Fix**:

- `initMemory()` creates `<base>/<project-key>/` automatically; ensure the parent platform directory is writable
- On macOS: `~/Library/Application Support/` — should always be writable by the user
- On Linux: `$XDG_DATA_HOME` defaults to `~/.local/share/` — if `XDG_DATA_HOME` is set to a non-writable path, unset it
- On Windows: `%APPDATA%` — verify the environment variable is set and the path is writable

---

## 2. FTS5 search returns no results despite entries existing

**Symptom**: `search_memory` returns `[]` even when content clearly matches.

**Cause**: FTS5 index out of sync with SQLite source — can happen after manual DB edits or failed writes.

**Fix**:

```typescript
await memory.rebuildIndex();
```

Safe at any time. Drops and recreates the FTS5 virtual table from the `entries` source table.

---

## 3. Write rejected — content contains secret pattern

**Symptom**: `write_memory` throws or returns an error referencing secret detection.

**Cause**: Content matched a known credential pattern (API key, token, connection string).

**Fix**: Never write secrets to memory. Summarise the decision without including the credential:

```typescript
// Wrong — will be rejected
content: "Use API key sk-proj-abc123... for OpenAI calls";

// Correct — describe the decision, not the value
content: "OpenAI API key stored in OPENAI_API_KEY env var. Do not hardcode.";
```

---

## 4. Duplicate entries for the same decision

**Symptom**: `search_memory` returns multiple entries covering the same topic with conflicting information.

**Cause**: `write_memory` called without first searching for an existing entry.

**Fix**: Always search before writing:

```typescript
const existing = await memory.searchMemory({
  query: "auth strategy",
  scope: "project",
});
if (existing.length > 0) {
  await memory.updateMemory({ id: existing[0].id, content: newContent });
} else {
  await memory.writeMemory({
    scope: "project",
    type: "decision",
    content: newContent,
  });
}
```

---

## 5. Memory grows unbounded — too many `state` entries

**Symptom**: `list_memory_scopes` shows high entry count; reads return many stale `state` entries.

**Cause**: Session-close `state` entries accumulated without compaction.

**Fix**: When `state` entries exceed 10, merge them:

```typescript
const states = await memory.readMemory({
  scope: "project",
  type: "state",
  limit: 50,
});
// Summarise all into one new entry
await memory.writeMemory({
  scope: "project",
  type: "state",
  content: `Consolidated state as of ${new Date().toISOString()}: ...`,
});
// Archive old ones
for (const s of states) {
  await memory.forgetMemory({ id: s.id });
}
```

---

## 6. `update_memory` throws — entry not found

**Symptom**: `update_memory` throws with ID not found error.

**Cause**: Incorrect ID passed, or entry was already hard-deleted.

**Fix**:

1. Use `search_memory` to find the correct entry and capture its `id`
2. Check if entry was soft-deleted: use `list_memory_scopes` or query SQLite directly
3. If hard-deleted, re-write as a new entry

---

## 7. Schema migration fails on library upgrade

**Symptom**: `initMemory()` throws on startup after updating `remembrance` version.

**Cause**: Migration runner encountered an unexpected schema state.

**Fix**:

1. Check `PRAGMA user_version` in `memory.db` (any SQLite viewer)
2. All migrations are additive — no data should be lost
3. If migration is stuck, run `rebuild_index()` after manual inspection
4. If the DB is corrupt, restore from the JSONL export backup

**Prevention**: Export memory before upgrading the library in production:

```typescript
await memory.exportMemory({ outputPath: "./memory-backup-pre-upgrade.jsonl" });
```

---

## 8. Concurrent write errors — WAL mode not active

**Symptom**: `SQLITE_BUSY` or `database is locked` errors under concurrent access.

**Cause**: WAL mode not enabled, or `busy_timeout` not set.

**Fix**: `initMemory()` enables WAL and sets `busy_timeout=5000` automatically. If errors persist:

1. Verify `initMemory()` is called before any writes
2. Do not open `memory.db` with a separate SQLite process while the library is running
3. WAL mode handles concurrent reads safely; simultaneous writes from two processes are serialised

---

## 9. `export_memory` produces empty file

**Symptom**: Export completes but `entryCount` is 0 or file has no entries.

**Cause**: Scope filter too narrow, or all entries are soft-deleted.

**Fix**:

```typescript
// Export all entries regardless of scope
const result = await memory.exportMemory({ outputPath: "./full-export.jsonl" });

// If still empty, rebuild index and verify entries exist
await memory.rebuildIndex();
const scopes = await memory.listMemoryScopes();
console.log(scopes); // Check entryCount per scope
```

---

## 10. Project key collision — two different projects resolve to the same key

**Symptom**: Entries from one project appear in another project's reads.

**Cause**: Two absolute paths produce identical slugs after normalisation.

**Fix**: Ensure `deriveProjectKey` uses the full absolute path, not a relative or short path:

```typescript
// Wrong — relative paths can collide
deriveProjectKey("my-project");

// Correct — absolute path guarantees uniqueness
deriveProjectKey(path.resolve(process.cwd()));
```

The normalisation rule: `path.toLowerCase().replace(/[^a-z0-9-]/g, '-')` on the full absolute path.

---

## 11. Memory reads return stale entries from 90+ days ago

**Symptom**: Context loaded at session start includes outdated decisions that no longer apply.

**Cause**: Old entries with low confidence and no recent reads accumulating without review.

**Fix**:

- Entries with `verified=false` and `confidence < 0.5` not read in 60 days are candidates for archival
- Surface these to the user: _"This entry is 90 days old and unverified — still accurate?"_
- Use `update_memory` to confirm or `forget_memory` to remove
