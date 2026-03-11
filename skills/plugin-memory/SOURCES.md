# Sources — plugin-memory skill

| # | Source | Path | Trust | Confidence | Contribution |
|---|--------|------|-------|------------|--------------|
| 1 | Plugin Memory Layer Architecture | `/Users/danish/Repo/plugin-memory/memory-layer-architecture.md` | canonical | high | All API signatures, scope model, storage design, migration strategy, failure modes, security model, use case patterns |

## Coverage matrix

| Dimension | Status | Source |
|-----------|--------|--------|
| API surface and behavior contracts | complete | §9 (all 8 tools: inputs, outputs, guardrails) |
| Configuration/runtime options | complete | §2, §7, §15 (config JSON, WAL, paths, migrations) |
| Common downstream use cases | complete | §3, §12 (read/write discipline, when to write) |
| Known issues/failure modes | complete | §12, §7, §14 (WAL concurrency, secret detection, stale entries, FTS sync) |
| Version/migration variance | complete | §8, §15 (migration runner, user_version, additive-only policy) |

## Stopping rationale

The single canonical source covers all five required integration-documentation dimensions. No upstream public documentation exists (library is in design/development phase). External retrieval would yield no additional content. Further collection is currently low-yield.

## Selected example profile

`documentation-skill.md` — applied fully:
- Happy-path lifecycle example in `common-use-cases.md` (use case 10)
- Secure/robust variant in `common-use-cases.md` (use cases 2, 4 — search-before-write, no-secret rules)
- Anti-pattern + corrected version in `troubleshooting-workarounds.md` (issues 4, 3) and `SKILL.md` anti-patterns table

## Decisions

| Decision | Status | Rationale |
|----------|--------|-----------|
| Class: integration-documentation | adopted | Library integration with typed API surface, runtime config, use cases, failure modes |
| Pattern: Domain Expert (SKILL.md + References) | adopted | Domain too broad for single file; conditional loading keeps context small |
| Three reference files (api-surface, use-cases, troubleshooting) | adopted | Required by integration-documentation class |
| Skill name: `plugin-memory` | adopted | Matches package name exactly; clear trigger match |

## Changelog

| Date | Change |
|------|--------|
| 2026-03-11 | Initial creation from `memory-layer-architecture.md` |
