#!/usr/bin/env node

// src/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

// src/paths.ts
import { platform } from "process";
import { join } from "path";
import { homedir } from "os";
var APP_NAME = "remambrance";
function getMemoryBaseDir(override) {
  if (override) return override;
  if (platform === "win32") {
    const appData = process.env.APPDATA;
    if (!appData) throw new Error("APPDATA environment variable not set");
    return join(appData, APP_NAME);
  }
  if (platform === "darwin") {
    return join(homedir(), "Library", "Application Support", APP_NAME);
  }
  const xdgData = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return join(xdgData, APP_NAME);
}
function deriveProjectKey(absolutePath) {
  if (!absolutePath || absolutePath.trim() === "/" || absolutePath.trim() === "") {
    throw new Error(`Cannot derive project key from empty or root path: "${absolutePath}"`);
  }
  const segments = absolutePath.replace(/\\/g, "/").split("/").filter(Boolean).map(
    (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    // strip leading/trailing hyphens within segment
  ).filter(Boolean);
  if (segments.length === 0) {
    throw new Error(`Cannot derive project key from path: "${absolutePath}"`);
  }
  return segments.join("--");
}
function resolveProjectDir(projectKey, baseDir) {
  return join(baseDir, projectKey);
}

// src/db.ts
import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "fs";
import { join as join2, dirname } from "path";
import { fileURLToPath } from "url";
var __dirname = dirname(fileURLToPath(import.meta.url));
var MIGRATIONS = [
  { version: 1, file: "migrations/001_initial.sql" },
  { version: 2, file: "migrations/002_fts5.sql" }
];
function openDatabase(projectDir) {
  mkdirSync(projectDir, { recursive: true, mode: 448 });
  const dbPath = join2(projectDir, "memory.db");
  const db = new Database(dbPath, { fileMustExist: false });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  runMigrations(db);
  return { db };
}
function closeDatabase(db) {
  db.close();
}
function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT    NOT NULL
    )
  `);
  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((r) => r.version)
  );
  const insertMigration = db.prepare(
    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)"
  );
  for (const { version, file } of MIGRATIONS) {
    if (applied.has(version)) continue;
    const sqlPath = join2(__dirname, file);
    let sql;
    try {
      sql = readFileSync(sqlPath, "utf8");
    } catch {
      throw new Error(
        `Migration file not found: ${sqlPath}
Ensure the build step copied src/migrations/ to dist/migrations/ (run: npm run build)`
      );
    }
    db.transaction(() => {
      db.exec(sql);
      insertMigration.run(version, (/* @__PURE__ */ new Date()).toISOString());
    })();
  }
  if (MIGRATIONS.length > 0) {
    const highestVersion = MIGRATIONS[MIGRATIONS.length - 1].version;
    db.pragma(`user_version = ${highestVersion}`);
  }
}

// src/handlers.ts
import { randomUUID } from "crypto";

// src/sanitise.ts
var SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,
  // AWS Access Key ID
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY/,
  // PEM private key
  /ghp_[a-zA-Z0-9]{32,}/,
  // GitHub personal access token
  /ghs_[a-zA-Z0-9]{32,}/,
  // GitHub app token
  /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
  // JWT
  /(?:api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*\S{16,}/i,
  // generic API key assignment
  /(?:password|passwd|pwd)\s*[:=]\s*\S{4,}/i,
  // password assignment
  /(?:postgresql|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/,
  // DB connection string with password
  /sk-[a-zA-Z0-9]{32,}/
  // OpenAI-style secret key
];
function detectSecrets(content) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(content));
}
function assertSafe(content) {
  if (detectSecrets(content)) {
    throw new Error(
      "Content appears to contain a secret or credential. Memory entries must not contain API keys, tokens, passwords, or private keys."
    );
  }
}

// src/handlers.ts
function deserialise(raw) {
  return {
    id: raw.id,
    scope: raw.scope,
    pluginId: raw.plugin_id,
    projectKey: raw.project_key,
    type: raw.type,
    content: raw.content,
    tags: JSON.parse(raw.tags),
    source: raw.source,
    confidence: raw.confidence,
    verified: raw.verified === 1,
    deleted: raw.deleted === 1,
    history: JSON.parse(raw.history),
    data: JSON.parse(raw.data),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at
  };
}
function createHandlers(db, opts) {
  const { projectKey, pluginId, maxContentBytes = 8192 } = opts;
  function writeMemory(params) {
    const {
      scope,
      type,
      content,
      tags = [],
      source,
      confidence = 1,
      verified = false,
      data = {}
    } = params;
    if (Buffer.byteLength(content, "utf8") > maxContentBytes) {
      throw new Error(`Content too long: max ${maxContentBytes} bytes allowed`);
    }
    assertSafe(content);
    const id = randomUUID();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
      INSERT INTO entries
        (id, scope, plugin_id, project_key, type, content, tags, source,
         confidence, verified, deleted, history, data, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', ?, ?, ?)
    `).run(
      id,
      scope,
      pluginId,
      projectKey,
      type,
      content,
      JSON.stringify(tags),
      source ?? null,
      confidence,
      verified ? 1 : 0,
      JSON.stringify(data),
      now,
      now
    );
    return { id, timestamp: now };
  }
  function readMemory(params) {
    const { scope, type, tags, limit = 10 } = params;
    let sql = "SELECT * FROM entries WHERE scope = ? AND project_key = ? AND deleted = 0";
    const bindings = [scope, projectKey];
    if (type) {
      sql += " AND type = ?";
      bindings.push(type);
    }
    sql += " ORDER BY updated_at DESC LIMIT ?";
    bindings.push(limit);
    const rows = db.prepare(sql).all(...bindings);
    const entries = rows.map(deserialise);
    if (tags && tags.length > 0) {
      return entries.filter((e) => tags.every((t) => e.tags.includes(t)));
    }
    return entries;
  }
  function searchMemory(params) {
    const { query, scope, type, limit = 10 } = params;
    const safeQuery = query.replace(/["'*^()]/g, " ").trim();
    if (!safeQuery) return [];
    let sql = `
      SELECT e.*, snippet(entries_fts, 0, '<b>', '</b>', '...', 10) as snippet
      FROM entries_fts
      JOIN entries e ON entries_fts.rowid = e.rowid
      WHERE entries_fts MATCH ?
        AND e.project_key = ?
        AND e.deleted = 0
    `;
    const bindings = [safeQuery, projectKey];
    if (scope) {
      sql += " AND e.scope = ?";
      bindings.push(scope);
    }
    if (type) {
      sql += " AND e.type = ?";
      bindings.push(type);
    }
    sql += " ORDER BY rank LIMIT ?";
    bindings.push(limit);
    try {
      const rows = db.prepare(sql).all(...bindings);
      return rows.map((r) => ({ ...deserialise(r), snippet: r.snippet }));
    } catch {
      return [];
    }
  }
  function updateMemory(params) {
    const { id, content, tags, confidence, verified } = params;
    const existing = db.prepare(
      "SELECT * FROM entries WHERE id = ? AND deleted = 0"
    ).get(id);
    if (!existing) throw new Error(`Entry not found: ${id}`);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const history = JSON.parse(existing.history);
    const updates = ["updated_at = ?"];
    const bindings = [now];
    if (content !== void 0) {
      if (Buffer.byteLength(content, "utf8") > maxContentBytes) {
        throw new Error(`Content too long: max ${maxContentBytes} bytes allowed`);
      }
      assertSafe(content);
      history.push(existing.content);
      updates.push("content = ?", "history = ?");
      bindings.push(content, JSON.stringify(history));
    }
    if (tags !== void 0) {
      updates.push("tags = ?");
      bindings.push(JSON.stringify(tags));
    }
    if (confidence !== void 0) {
      updates.push("confidence = ?");
      bindings.push(confidence);
    }
    if (verified !== void 0) {
      updates.push("verified = ?");
      bindings.push(verified ? 1 : 0);
    }
    bindings.push(id);
    db.prepare(`UPDATE entries SET ${updates.join(", ")} WHERE id = ?`).run(...bindings);
    return { id, updatedAt: now };
  }
  function forgetMemory(params) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(
      "UPDATE entries SET deleted = 1, updated_at = ? WHERE id = ?"
    ).run(now, params.id);
    return { deleted: true };
  }
  function listMemoryScopes(params) {
    const pKey = params?.projectKey ?? projectKey;
    const rows = db.prepare(`
      SELECT scope, COUNT(*) as entry_count, MAX(updated_at) as last_updated
      FROM entries
      WHERE deleted = 0 AND project_key = ?
      GROUP BY scope
      ORDER BY last_updated DESC
    `).all(pKey);
    return rows.map((r) => ({
      scope: r.scope,
      entryCount: r.entry_count,
      lastUpdated: r.last_updated
    }));
  }
  function rebuildIndex() {
    db.exec("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')");
    const { n } = db.prepare(
      "SELECT COUNT(*) as n FROM entries WHERE deleted = 0"
    ).get();
    return { entriesIndexed: n };
  }
  return {
    writeMemory,
    readMemory,
    searchMemory,
    updateMemory,
    forgetMemory,
    listMemoryScopes,
    rebuildIndex
  };
}

// src/export.ts
import { writeFileSync, appendFileSync, mkdirSync as mkdirSync2, readFileSync as readFileSync2, existsSync } from "fs";
import { dirname as dirname2, join as join3 } from "path";
async function exportToJsonl(db, params) {
  const { outputPath, scope, projectKey } = params;
  let sql = "SELECT * FROM entries WHERE deleted = 0 AND project_key = ?";
  const bindings = [projectKey];
  if (scope) {
    sql += " AND scope = ?";
    bindings.push(scope);
  }
  const rows = db.prepare(sql).all(...bindings);
  mkdirSync2(dirname2(outputPath), { recursive: true });
  const lines = rows.map((r) => JSON.stringify(r)).join("\n");
  writeFileSync(outputPath, rows.length > 0 ? lines + "\n" : "", { encoding: "utf8" });
  return { exportedPath: outputPath, entryCount: rows.length };
}
async function appendToMarkdown(params) {
  const { filePath, type, content, tags, timestamp } = params;
  mkdirSync2(dirname2(filePath), { recursive: true });
  const tagStr = tags.length > 0 ? `\`${tags.join("`, `")}\`` : "_none_";
  const entry = [
    ``,
    `## ${timestamp.slice(0, 10)} \u2014 ${type}`,
    ``,
    content,
    ``,
    `**Tags:** ${tagStr}`,
    ``,
    `---`,
    ``
  ].join("\n");
  appendFileSync(filePath, entry, "utf8");
}
var MARKDOWN_FILE_MAP = {
  decision: "decisions.md",
  adr: "adrs/index.md",
  pattern: "patterns.md",
  convention: "patterns.md",
  preference: "preferences.md",
  summary: "summaries.md",
  glossary: "glossary.md",
  state: "state.md",
  constraint: "constraints.md"
};
function getMarkdownPath(exportsDir, type) {
  return join3(exportsDir, MARKDOWN_FILE_MAP[type] ?? "misc.md");
}

// src/index.ts
import { mkdirSync as mkdirSync3 } from "fs";
import { join as join4 } from "path";

// src/tools.ts
var MEMORY_TOOLS = [
  {
    name: "read_memory",
    description: "Retrieve persistent memory entries by scope, type, or tags. Call at session start and before major task steps.",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          description: "Memory scope: user, project, or plugin:<id>"
        },
        type: {
          type: "string",
          enum: [
            "decision",
            "adr",
            "pattern",
            "convention",
            "preference",
            "summary",
            "glossary",
            "state",
            "constraint"
          ]
        },
        tags: { type: "array", items: { type: "string" } },
        limit: { type: "number", minimum: 1, maximum: 100, default: 10 },
        projectKey: { type: "string" }
      },
      required: ["scope"]
    }
  },
  {
    name: "write_memory",
    description: "Store a new persistent memory entry. Call when a decision is made, a pattern is identified, or a preference is confirmed. Never write secrets, tokens, or credentials.",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          description: "Memory scope: user, project, or plugin:<id>. Default: project."
        },
        type: {
          type: "string",
          enum: [
            "decision",
            "adr",
            "pattern",
            "convention",
            "preference",
            "summary",
            "glossary",
            "state",
            "constraint"
          ]
        },
        content: { type: "string", maxLength: 8192 },
        tags: { type: "array", items: { type: "string" } },
        source: { type: "string", description: 'File path, URL, or "session"' },
        confidence: { type: "number", minimum: 0, maximum: 1, default: 1 },
        verified: { type: "boolean", default: false }
      },
      required: ["scope", "type", "content"]
    }
  },
  {
    name: "search_memory",
    description: "Full-text search across memory entries. Use when exploring prior decisions or looking for specific context.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keyword search terms" },
        scope: { type: "string" },
        type: { type: "string" },
        limit: { type: "number", minimum: 1, maximum: 100, default: 10 }
      },
      required: ["query"]
    }
  },
  {
    name: "update_memory",
    description: "Update an existing memory entry. Prior content is preserved in history. Use when an entry is superseded or corrected.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Entry UUID from write_memory or read_memory" },
        content: { type: "string", maxLength: 8192 },
        tags: { type: "array", items: { type: "string" } },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        verified: { type: "boolean" }
      },
      required: ["id"]
    }
  },
  {
    name: "forget_memory",
    description: "Soft-delete a memory entry. Entry is hidden from reads immediately and permanently purged after 30 days.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" }
      },
      required: ["id"]
    }
  },
  {
    name: "list_memory_scopes",
    description: "List all available memory scopes and their entry counts.",
    inputSchema: {
      type: "object",
      properties: {
        projectKey: { type: "string" }
      }
    }
  },
  {
    name: "rebuild_index",
    description: "Reconstruct the FTS5 full-text search index from the SQLite source. Safe to run at any time. Use after import or suspected index corruption.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "export_memory",
    description: "Export all memory entries to a portable JSONL file for backup or migration.",
    inputSchema: {
      type: "object",
      properties: {
        outputPath: { type: "string", description: "Absolute path for the output file" },
        scope: { type: "string", description: "Filter by scope (optional)" }
      }
    }
  }
];

// src/index.ts
async function initMemory(options) {
  const {
    projectKey,
    pluginId,
    baseDir: baseDirOverride,
    markdownExport = false,
    maxContentBytes = 8192
  } = options;
  const baseDir = getMemoryBaseDir(baseDirOverride);
  const projectDir = resolveProjectDir(projectKey, baseDir);
  const exportsDir = join4(projectDir, "exports");
  mkdirSync3(exportsDir, { recursive: true, mode: 448 });
  const { db } = openDatabase(projectDir);
  const handlers = createHandlers(db, { projectKey, pluginId, maxContentBytes });
  const client = {
    readMemory: handlers.readMemory,
    searchMemory: handlers.searchMemory,
    updateMemory: handlers.updateMemory,
    forgetMemory: handlers.forgetMemory,
    listMemoryScopes: handlers.listMemoryScopes,
    rebuildIndex: handlers.rebuildIndex,
    writeMemory(params) {
      const result = handlers.writeMemory(params);
      if (markdownExport) {
        const mdPath = getMarkdownPath(exportsDir, params.type);
        appendToMarkdown({
          filePath: mdPath,
          type: params.type,
          content: params.content,
          tags: params.tags ?? [],
          timestamp: result.timestamp
        }).catch((err) => {
          console.error("[remambrance] Markdown export failed:", err);
        });
      }
      return result;
    },
    async exportMemory(params) {
      const outputPath = params?.outputPath ?? join4(exportsDir, "memory-export.jsonl");
      return exportToJsonl(db, {
        outputPath,
        scope: params?.scope,
        projectKey
      });
    },
    close() {
      closeDatabase(db);
    }
  };
  return client;
}

// src/server.ts
import { cwd } from "process";
async function main() {
  const projectKey = process.env.REMAMBRANCE_PROJECT_KEY ?? deriveProjectKey(cwd());
  const pluginId = process.env.REMAMBRANCE_PLUGIN_ID ?? "core";
  const baseDir = process.env.REMAMBRANCE_BASE_DIR;
  const memory = await initMemory({ projectKey, pluginId, baseDir, markdownExport: true });
  const server = new Server(
    { name: "remambrance", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...MEMORY_TOOLS]
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    try {
      let result;
      switch (name) {
        case "read_memory":
          result = memory.readMemory(args);
          break;
        case "write_memory":
          result = memory.writeMemory(args);
          break;
        case "search_memory":
          result = memory.searchMemory(args);
          break;
        case "update_memory":
          result = memory.updateMemory(args);
          break;
        case "forget_memory":
          result = memory.forgetMemory(args);
          break;
        case "list_memory_scopes":
          result = memory.listMemoryScopes(args);
          break;
        case "rebuild_index":
          result = memory.rebuildIndex();
          break;
        case "export_memory":
          result = await memory.exportMemory(args);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch(console.error);
