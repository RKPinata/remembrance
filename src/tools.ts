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
