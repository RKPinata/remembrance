# Remembrance

Persistent project memory for AI plugins.

Remembrance gives plugins a **durable memory layer** so they can remember important knowledge about a project across sessions. Instead of rediscovering the same context every time an agent runs, a plugin can store and retrieve structured knowledge such as:

- architectural decisions
- recurring patterns
- project conventions
- user preferences
- ongoing work state

Remembrance is designed primarily for **AI plugins that repeatedly enter the same project environment** and need reliable context beyond a single session.

---

# Table of Contents

- [Why Remembrance Exists](#why-remembrance-exists)
- [Is Remembrance Right for Your Plugin](#is-remembrance-right-for-your-plugin)
- [Installation](#installation)
- [Two Ways to Set Up Remembrance](#two-ways-to-set-up-remembrance)
  - [Guided Setup (Claude Plugin + Skill)](#guided-setup-claude-plugin--skill)
  - [Direct Library Integration](#direct-library-integration)
- [Mental Model](#mental-model)
- [Typical Plugin Lifecycle](#typical-plugin-lifecycle)
- [Quick Start Example](#quick-start-example)
- [Reading Memory](#reading-memory)
- [Writing Memory](#writing-memory)
- [Searching Memory](#searching-memory)
- [Memory Scopes](#memory-scopes)
- [Storage Model](#storage-model)
- [Exporting Memory](#exporting-memory)
- [Security and Secret Detection](#security-and-secret-detection)
- [Development Tools](#development-tools)
- [Architecture Overview](#architecture-overview)
- [Design Principles](#design-principles)

---

# Why Remembrance Exists

AI plugins typically behave like this:

Plugin starts
↓
Agent receives prompt + environment
↓
Agent performs work
↓
Session ends
↓
All learned context is lost

This creates friction for long-running projects:

- architectural decisions are rediscovered repeatedly
- conventions must be re-explained
- unfinished work loses context
- preferences disappear between sessions

Remembrance introduces **durable project knowledge**.

Plugin starts
↓
Load stored project memory
↓
Agent receives known decisions and patterns
↓
Agent performs work
↓
New knowledge is stored
↓
Session ends

Next time the plugin runs, it begins with **the accumulated knowledge of previous sessions**.

---

# Is Remembrance Right for Your Plugin

Before installing anything, consider how your plugin behaves.

Plugins that benefit from Remembrance usually share a pattern:

Session 1 → plugin learns something
Session 2 → plugin should remember it
Session 3 → plugin builds on it

Examples include:

### Coding assistants

The plugin learns:

- architecture choices
- naming conventions
- project patterns

### Dev workflow agents

The plugin tracks:

- ongoing refactors
- project constraints
- technical decisions

### Long-running assistants

The plugin accumulates:

- domain knowledge
- team preferences
- project history

---

Plugins that **usually do not need Remembrance** include:

- stateless tools
- one-off automation scripts
- prompt-only assistants
- plugins that already maintain their own durable project store
- tools designed to run once and exit

Remembrance stores **structured knowledge**, not chat transcripts and not vector embeddings.

---

# Installation

Install the library:

```bash
npm install remembrance

Remembrance runs entirely locally using SQLite. No external services are required.

⸻

Two Ways to Set Up Remembrance

Remembrance can be integrated in two different ways depending on how you build plugins.

⸻

Guided Setup (Claude Plugin + Skill)

The repository includes a Claude plugin integration and a bundled skill designed to help plugin authors integrate Remembrance correctly.

The skill helps Claude guide you through:
	•	initializing memory
	•	choosing scopes
	•	deciding when memory should be read
	•	deciding when knowledge should be written
	•	avoiding common mistakes

Typical guided setup flow:

Install plugin
↓
Use the Remembrance skill
↓
Claude generates correct integration
↓
Memory initialized in plugin startup
↓
Plugin reads memory at session start
↓
Plugin writes memory when new knowledge appears
↓
Use /memory-status to inspect stored memory

This path is recommended if you want guided integration during development.

⸻

Direct Library Integration

If you prefer integrating the library yourself, the process is simple.

Typical integration flow:

Install library
↓
Initialize memory during plugin startup
↓
Read memory when the plugin begins work
↓
Write memory when durable knowledge is discovered
↓
Search memory when recalling context

The next sections walk through these steps.

⸻

Mental Model

Think of Remembrance as a project notebook for your plugin.

The notebook contains small entries describing stable knowledge.

Examples:

Type	Example
decision	Use compound components for UI
pattern	Forms follow controlled pattern
preference	Use camelCase for API fields
constraint	Must support offline mode
state	Auth refactor in progress

Each entry is:
	•	searchable
	•	persistent
	•	scoped
	•	tagged
	•	versioned

Your plugin reads from the notebook when it starts and adds to it when it learns something durable.

⸻

Typical Plugin Lifecycle

A typical session with Remembrance looks like this:

User opens project
↓
Plugin starts
↓
Initialize memory
↓
Load project memory
↓
Agent performs work
↓
Plugin records new knowledge
↓
Session ends

Next session:

Plugin starts
↓
Project memory is loaded again

The plugin now begins with the knowledge accumulated so far.

⸻

Quick Start Example

Initialize Remembrance during plugin startup.

import { initMemory, deriveProjectKey } from "remembrance"

const projectKey = deriveProjectKey(process.cwd())

const memory = await initMemory({
  projectKey
})

This creates (or loads) the project’s memory database.

⸻

Reading Memory

Plugins usually read memory during startup to provide context to the agent.

const entries = await memory.readMemory({
  scope: "project"
})

Typical uses:
	•	loading architectural decisions
	•	retrieving conventions
	•	restoring unfinished work state

⸻

Writing Memory

When the plugin discovers something durable, store it.

await memory.writeMemory({
  type: "decision",
  content: "Use compound components for forms",
  tags: ["architecture"]
})

Memory entries should represent stable knowledge, not temporary observations.

⸻

Searching Memory

To recall previously stored knowledge:

const results = await memory.searchMemory({
  query: "forms architecture"
})

Search uses SQLite full-text indexing.

⸻

Memory Scopes

Remembrance separates knowledge into scopes.

Scope	Description
user	preferences shared across projects
project	project-specific knowledge
plugin:<name>	plugin-private memory

Example layout:

user
  preferences

project
  decisions
  patterns
  state

plugin:lint
  internal state

Scopes prevent knowledge from leaking between projects or plugins.

⸻

Storage Model

Remembrance stores memory locally.

Example layout:

~/.remembrance/

projects/
  <projectKey>/
    memory.db
    exports/

The database uses:
	•	SQLite
	•	full-text search indexing
	•	history tracking

⸻

Exporting Memory

Memory can be exported for inspection.

await memory.exportMemory()

Exports include:

decisions.md
patterns.md
preferences.md
state.md

This allows humans to review stored knowledge.

⸻

Security and Secret Detection

Remembrance prevents sensitive data from being stored.

Entries resembling secrets are automatically rejected, including:
	•	API keys
	•	AWS credentials
	•	JWT tokens
	•	passwords
	•	credential URLs

This reduces the risk of accidental secret leakage.

⸻

Development Tools

Remembrance includes a development server that exposes memory operations as tools.

Examples:

read_memory
write_memory
search_memory
export_memory

Start the server:

remembrance-server

This is useful for inspecting memory during plugin development.

⸻

Architecture Overview

Core components:

Remembrance
├ MemoryClient
├ SQLite storage
├ FTS search index
├ scope system
├ export system
└ MCP server

Database tables:

entries
history
fts_index


⸻

Design Principles

Remembrance follows a few core guidelines.

Store knowledge, not conversations

Memory entries should represent durable facts.

⸻

Prefer small atomic entries

Better:

Decision: Use compound components

Worse:

Large paragraph describing entire architecture


⸻

Avoid speculative information

Only write memory when information is confirmed or stable.

⸻

Never store secrets

Sensitive information should never enter memory.

⸻

Summary

Remembrance provides a persistent knowledge layer for plugins that repeatedly interact with the same project.

Instead of starting from zero every session, a plugin can:
	•	remember decisions
	•	reuse patterns
	•	track ongoing work
	•	respect project conventions

Over time the plugin builds a living knowledge base for the project.

