# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-03-11

### Initial Release as Remambrance
- Renamed project from `plugin-memory` to `remambrance`
- SQLite-backed memory layer with FTS5 full-text search
- Eight MCP tools: read_memory, write_memory, search_memory, update_memory,
  forget_memory, list_memory_scopes, rebuild_index, export_memory
- Three-tier scope hierarchy: user → project → plugin:X
- Schema migration runner with WAL mode
- Secret pattern detection — rejects credentials in content
- JSONL export and Markdown write-through
- Claude Code plugin: skill, /memory-status command, MCP server auto-registration
- 73 tests across 6 files
