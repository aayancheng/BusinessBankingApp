# Brainstorm STUB — "Decisioning Platform" skill (generalize this app into a reusable skill)

> **Status: BRAINSTORM ONLY — not yet a spec, no code.** Captured 2026-06-17 at end of session.
> **To resume (new session):** open `BusinessBankingApp`, say *"build the decisioning-platform
> skill"*. Read this file, pick the open decisions below, then use `superpowers:writing-skills`
> to author it (after a short `superpowers:brainstorming` pass to lock scope, then a spec +
> plan). Source material: the full `SESSION_LOG.md` (8 sessions) + this app's structure.

## The idea

Turn the method that built this BusinessBankingApp into a skill (or small skill family) for
building **similar business-analytics decisioning apps in ANY domain**, not just credit.

## The generalizable abstraction (the "slot model")

> A shared entity **score-spine** + N **decision apps** that consume it + a **unified portal**,
> built **synthetic-data-first**, **spec-driven**, **subagent-built**, and **metric-gated**.

Credit is just one binding of the slots:

| Generic slot | Credit binding | General meaning |
|---|---|---|
| Score-spine | Business Credit Score (WoE+logistic) | one shared entity score everything reuses |
| Decision app — eligibility/triage | Adjudication (Approve/Refer/Decline) | model + policy/knockout layer → a decision |
| Decision app — economics | Pricing (ROE/RAROC engine) | deterministic engine: score → dollars |
| Decision app — monitoring | Early Warning (deterioration watchlist) | panel model → triggers + tiered watchlist |
| Decision app — next-best-action | Proactive Line Increase | candidate model + amount rules + incremental-economics gate |
| Portal | Dashboard + Customer 360 + lookup/what-if/segments | cross-module KPIs + entity-360 + drill-downs |

Re-binds to: **marketing/CRM** (churn/LTV spine → targeting, offer pricing, churn watchlist,
upsell NBA); **insurance** (risk spine → underwriting, premium, claims EWS, retention);
**supply chain** (supplier-risk spine → onboarding, contract pricing, disruption alerts,
capacity offers); **healthcare/ops/fraud** likewise.

## Hard-won lessons the skill must encode (the non-boilerplate judgment)

1. **Synthetic-data-first DGP discipline.** Leakage deny-list from day 0. And the noise-cap
   rule: **check a synthetic target's oracle-AUC ceiling BEFORE setting a metric gate** (EWS &
   Line-Increase BLOCKs were unreachable gates). The deciding question for fix-data vs.
   honest-gate: **"is this target a pure leaf, or does a downstream module consume it?"**
   (pure leaf → RNG-safe regenerate; consumed → honest gate).
2. **Score-spine reuse contract** — downstream consumes the *saved model's* score/PD, never the
   true DGP label.
3. **Portal conventions** — lifespan caches each module's scored population into `app.state`;
   exactly one service per module (no duplicated logic); testid contracts keep Playwright
   stable; **re-run prior modules' e2e on every nav/shared-surface change** (recurring
   highest-value review).
4. **Governance cadence** — real metric gates; BLOCK-escalate rather than game a gate;
   stop-for-user-review before every `--no-ff` merge.
5. **Subagent economics** — fresh implementer + two-stage review; haiku=transcription,
   sonnet=judgment; combine spec+quality review for exact-transcription tasks; controller-verify
   trivial ones; keep a per-task token tally.
6. **Program harness** — `program_state.json` ledger + `SESSION_LOG.md` narrative + one-phase-
   per-session resume protocol.

## Three skill-architecture options

- **A — One umbrella skill** (`decisioning-platform-builder`): everything in one. Simple entry,
  but huge and duplicates generic build process.
- **B — Small family**: `decisioning-platform-scaffold`, `synthetic-entity-data`,
  `score-spine-module`, `decision-app-module`, `analytics-portal-integration`. Composable but
  more parts.
- **C — RECOMMENDED — thin playbook + scaffold that references superpowers, plus ONE deep
  sub-skill.** Main skill = domain reference architecture (slot model, file conventions, portal
  patterns, governance decision-trees) that **delegates the generic cycle to
  `brainstorming → writing-plans → subagent-driven-development`** instead of re-implementing it.
  The one deep sub-skill = **`synthetic-entity-data`** (the DGP/leakage/noise-cap reasoning —
  highest value, least generic, easiest to get wrong).

## Open decisions to settle next session

1. **Scope:** A / B / C (lean: **C**).
2. **Scaffold vs guide:** generate a working starter repo (templated data generator, config, one
   example decision app, portal shell) vs. pure guidance. (Lean: small generated scaffold for
   the spine + one example app, guidance for the rest.)
3. **Domain parameterization:** config-driven "domain pack" (declare entities, score target,
   which decision apps) vs. freeform per project.
4. **Relationship to existing `analytics-project` skill** + MarketingAnalytics m01–m06 patterns —
   wrap/extend or stand alone.

## Next step when resumed

`superpowers:brainstorming` (lock the 4 decisions) → write a real spec at
`docs/superpowers/specs/YYYY-MM-DD-decisioning-platform-skill-design.md` → `superpowers:writing-skills`.
