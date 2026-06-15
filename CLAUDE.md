# CLAUDE.md — BusinessBankingApp Workspace

Guidance for Claude Code when working anywhere in this repository.

## Artifact storage rule (IMPORTANT)

- **All code, data, models, notebooks, docs, and any other artifacts for this project
  MUST be written under `/Users/aayan/zzLearnAndCreate/BusinessBankingApp/` only.**
- **`/Users/aayan/zzLearnAndCreate/MarketingAnalytics/` is READ-ONLY reference.** Read
  its patterns (build conventions, FastAPI/React structure, notebook formats) but
  **never create, write, or modify any file there.** A hard `deny` rule in
  `.claude/settings.json` blocks Write/Edit to that path as a backstop.

## What this project is

Prototype **business banking app** showcasing speed-to-market with Claude Code using
**only synthetic data** (no internal/proprietary data). Unified portal + shared FastAPI
backend over a shared Business Credit Score, plus 4 apps: Adjudication; Pricing &
Profitability (ROE/RAROC engine); Portfolio/Early-Warning; Proactive Line Increase.

Full design: `docs/superpowers/specs/2026-06-14-business-banking-app-design.md`

## Resuming across sessions (daily token limit)

The build spans multiple sessions. **Source of truth for progress is
`program_state.json`** (task ledger); narrative is `SESSION_LOG.md`.

On session start: read `program_state.json` + the latest `SESSION_LOG.md` entry, print a
status board (✓/→/·), and continue from `next_action`. One phase per session; at each
phase end: update the ledger, append a session-log entry, commit, print the resume
command, and STOP.

## Conventions

- **Self-contained venv** at `./.venv` (not the MarketingAnalytics venv).
- **Ports:** FastAPI 8100, Express 3100, Vite 5180.
- Reuse MarketingAnalytics code patterns (see its CLAUDE.md): `sys.path` fix in
  `main.py`; `PaginatedResponse` uses `items`/`pages`; entity detail returns prediction
  fields at top level; `app/server/package.json` has `"type": "module"`; run uvicorn
  from the directory containing `src/`.
