---
description: Show memory entries stored for this project — scopes, types, and counts
---

Prerequisite: the remembrance MCP server must be running and scoped to the current
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
