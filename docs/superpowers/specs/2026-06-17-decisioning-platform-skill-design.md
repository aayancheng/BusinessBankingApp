# Design Spec — "decisioning-platform" skill (+ `synthetic-entity-data` sub-skill)

**Date:** 2026-06-17 · **Status:** Approved by user 2026-06-17
**Brainstorm:** `docs/superpowers/specs/2026-06-17-decisioning-platform-skill-brainstorm.md`
**Reference implementation:** this repo (BusinessBankingApp)

## Goal

Author a reusable skill that lets Claude build a **multi-module business-analytics decisioning
platform** in *any* domain — a shared entity **score-spine** + N **decision apps** + a **unified
portal**, built **synthetic-data-first, spec-driven, subagent-built, metric-gated** — by
generalizing the method that built BusinessBankingApp.

## Locked decisions

1. **Scope:** Option C — a thin guidance playbook that **delegates the generic build cycle to
   existing superpowers** (`brainstorming → writing-plans → subagent-driven-development`) and adds
   only the domain architecture, per-module recipe, portal conventions, and governance
   decision-trees. Plus **one deep sub-skill** for the synthetic-data judgment.
2. **Delivery:** Guidance + reference implementation (NO code generation). The skill points to
   BusinessBankingApp files as the canonical example to read/replicate — mirroring how
   `analytics-project` references MarketingAnalytics `m01–m06`.
3. **Domain config:** A declared **platform manifest** (entity, score-spine target, chosen
   decision apps from a fixed menu, synthetic flag).
4. **Positioning:** Standalone higher-order skill, sibling to the existing single-model
   `analytics-project` skill. May reference its conventions; does not depend on it.

## Deliverables — two skills under `~/.claude/skills/`

Both as directories (`SKILL.md` + `references/`), matching the superpowers multi-file format.

### A) `decisioning-platform/` (primary, guidance)

`SKILL.md` covers:
- **Trigger/description** — building a multi-module decisioning platform (shared score + decision
  apps + portal) for a business domain; or resuming one. Tuned so it does NOT fire for
  single-model builds (that's `analytics-project`).
- **The slot model** — score-spine + decision-app archetypes + portal.
- **The platform manifest** — schema + how to elicit it up front.
- **Build flow** — program brainstorm → program spec → stand up the `program_state.json` +
  `SESSION_LOG.md` + one-phase-per-session harness → **build order: data → score-spine → each
  decision app → portal integration**; each phase delegates to `writing-plans` +
  `subagent-driven-development`.
- **Per-module recipe** — feature-engineering → train/engine → business-logic layer → reason
  codes → service → views → e2e → **metric gate**.
- **The four decision-app archetypes** (with the BusinessBankingApp file to read for each):
  1. Eligibility/Triage — model + policy/knockout layer → discrete decision (Adjudication).
  2. Economics — deterministic engine: score → dollars/ROI (Pricing).
  3. Monitoring — behavioral-panel model + named triggers + tiered watchlist (Early Warning).
  4. Next-Best-Action — candidate model + action/amount rules + incremental-economics gate
     (Line Increase).
- **Portal conventions** — lifespan caches each module's scored population into `app.state`; one
  service per module (no duplicated logic); testid contracts; **re-run prior modules' e2e on every
  nav/shared-surface change**; dashboard + entity-360 + `/api/examples` endpoints; Vite-direct
  proxy.
- **Governance gates** — leakage deny-list from day 0; honest metric gates with the **oracle-
  ceiling check before gating**; **BLOCK-escalate** rather than game a gate; stop-for-user-review
  before each `--no-ff` merge; per-task subagent token tally; model selection (cheap=transcription,
  standard=judgment); combined spec+quality review for transcription tasks.
- **Reference-implementation index** — a table mapping each pattern → the exact BusinessBankingApp
  path (e.g. engine → `pricing/src/engine.py`; panel model → `ews/src/`; portal lifespan →
  `portal/server/main.py`; entity-360 → `portal/server/customer_service.py`).

`references/` (split out to keep SKILL.md scannable): `platform-manifest.md`,
`decision-app-archetypes.md`, `portal-conventions.md`, `governance-and-gates.md`,
`reference-implementation-map.md`.

### B) `synthetic-entity-data/` (deep sub-skill)

`SKILL.md` covers:
- **Trigger/description** — generating a synthetic dataset (entities + optional behavioral panel +
  targets) for an analytics/ML build that must be leakage-safe and support honest metric gates.
- **DGP design** — entity attributes → latent risk/propensity → observable features → targets.
- **Leakage discipline** — a deny-list of DGP-internal columns; the score-reuse contract
  (downstream consumes the saved model's score/PD, never the true DGP label).
- **The noise-cap rule** — every synthetic target has an oracle-AUC ceiling; **compute it
  (noise-free logit AUC + an oracle model) BEFORE setting any metric gate.**
- **Pure-leaf analysis** — decision tree: is the target consumed by a downstream module? *Pure
  leaf* → safe to RNG-safe-regenerate to sharpen signal; *consumed* → keep an honest gate instead.
- **RNG-safe regeneration** — change one target's logit without perturbing other columns; prove
  bit-identical via per-column hashing.
- **Data dictionary + EDA rank-ordering** sanity check.
- **Reference** — `shared/data_generator.py` + the EWS/Line-Increase BLOCK episodes in
  `SESSION_LOG.md`.

## Authoring process

Use `superpowers:writing-skills` to author both skills (description tuning + structure + the
skill-writing conventions). Author the primary skill first, then the sub-skill, then cross-link.

## Validation / success criteria

- `writing-skills` description-triggering check passes for both (and `decisioning-platform` does
  NOT mis-fire on single-model requests that belong to `analytics-project`).
- A **dry-run walkthrough on a non-credit domain** (e.g. insurance underwriting or SaaS churn):
  produce the platform manifest and the first two phases' plan outline using only the skill text —
  proving the slot model + recipe generalize beyond the reference impl.
- SKILL.md files stay scannable (heavy detail pushed to `references/`).

## Out of scope (YAGNI)

- No code generation / scaffolding templates (delivery = guidance).
- No changes to the existing `analytics-project` skill.
- No new domain example app built now (the non-credit walkthrough is a paper dry-run, not a build).
