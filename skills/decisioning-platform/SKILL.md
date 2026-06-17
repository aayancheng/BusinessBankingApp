---
name: decisioning-platform
description: Use when building or resuming a multi-module business-analytics decisioning platform in any domain — a shared entity score plus several decision apps (eligibility/triage, pricing/economics, monitoring/early-warning, next-best-action) and a unified portal, typically on synthetic data. For a single standalone model app, use analytics-project instead.
---

# Decisioning Platform

## Overview

A decisioning platform is **one shared entity score-spine + N decision apps that consume it + a
unified portal**, built **synthetic-data-first, spec-driven, subagent-built, and metric-gated.**
Pick the entity (customer, supplier, patient, business, policyholder…), build one shared score,
then hang decision apps off it. This skill is the *architecture and governance playbook*; it
delegates the generic build cycle to the superpowers skills below.

## When to use / not use

- **Use** when the ask spans several decisions over one entity population (e.g. "who to approve,
  what to charge, who to watch, who to make an offer to").
- **Don't use** for a single standalone model/app → that's `analytics-project`. The tell:
  decisioning-platform always produces a *shared score reused by multiple apps* + a *cross-module
  portal*.

## Step 1 — Elicit the platform manifest

Before any building, write down the manifest (it parameterizes everything):

- **entity** — the unit scored (customer / supplier / patient / business / policy…).
- **score-spine target** — the one shared risk/propensity everything reuses (default, churn,
  loss, fraud, deterioration…).
- **decision apps** — choose from the four archetypes below.
- **synthetic?** — default yes → **REQUIRED SUB-SKILL: synthetic-entity-data** for the data phase.

## Step 2 — Build flow (delegate the generic cycle)

Program brainstorm → program spec → stand up the resume harness (`program_state.json` ledger +
`SESSION_LOG.md` + one-phase-per-session, status board, checkpoint→commit→STOP) → build in this
order: **data → score-spine → each decision app → portal integration.**

Each phase is a normal spec→plan→build:
- **REQUIRED: superpowers:brainstorming** (lock the phase scope)
- **REQUIRED: superpowers:writing-plans** (bite-size tasks)
- **REQUIRED: superpowers:subagent-driven-development** (fresh implementer + two-stage review per
  task; cheap model for transcription, standard for judgment; keep a per-task token tally)

## Step 3 — The four decision-app archetypes

Each decision app is one of these. Detail + the per-module recipe is in
`references/decision-app-archetypes.md`.

| Archetype | Shape | Output |
|-----------|-------|--------|
| **Eligibility / Triage** | model + policy/knockout layer | discrete decision (approve/refer/decline) + reason codes |
| **Economics** | deterministic engine (no ML) over score → $ | price/ROI + pass/fail vs a hurdle |
| **Monitoring** | behavioral-panel model + named triggers | tiered watchlist + trajectory |
| **Next-Best-Action** | candidate model + action/amount rules + incremental-economics gate | ranked offers |

Per-module recipe (every app): `feature-engineering (leakage-safe) → train OR engine → logic
layer → reason codes → service → views → e2e → metric gate`.

## Step 4 — Portal conventions

- FastAPI lifespan **caches each module's scored population into `app.state`** once at startup;
  routes read the cache (no re-scoring per request).
- **Exactly one service per module** — the portal orchestrates module code, never re-implements it.
- React + Vite-direct (proxy `/api` to FastAPI; no Express). **testid contracts** keep e2e stable.
- Cross-module surfaces: **Dashboard** (one KPI per module), **Entity-360** (`GET
  /api/<entity>/{id}` aggregating all apps for one entity; null sections when an app doesn't apply),
  and **`/api/examples`** (diverse seeded IDs + hints for lookup dropdowns).

## Step 5 — Governance gates (non-negotiable)

- **Leakage deny-list from day 0**; downstream consumes the *saved score model's* output, never the
  DGP truth. (See synthetic-entity-data.)
- **Honest metric gates** — set each gate *below the measured achievable ceiling* (synthetic-
  entity-data's oracle-ceiling rule). If a gate is unreachable, **BLOCK and escalate to the human**
  — never silently weaken a gate or silently regenerate data.
- **Back-compat is the highest-value review:** on any nav/shared-surface change, **re-run all prior
  modules' e2e** before approving.
- **Stop for user review before each `--no-ff` merge** to main.

## Reference implementation

BusinessBankingApp is the canonical worked example (credit binding of the slots). Map each pattern
to its file via `references/reference-implementation-map.md` — read the referenced file when
building the matching piece.

## Common mistakes

- Building apps as silos with no shared score-spine, or duplicating logic in the portal instead of
  one-service-per-module.
- Skipping the manifest → inconsistent entity/score definitions across apps.
- Setting metric gates before measuring the synthetic ceiling (the #1 stall — see
  synthetic-entity-data).
- Changing nav/shared surfaces without re-running prior modules' e2e.
- Treating "synthetic data" as a checkbox rather than a discipline (leakage, pure-leaf, honest gates).
