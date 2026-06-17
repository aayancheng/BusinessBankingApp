# Reference Implementation Map — BusinessBankingApp

BusinessBankingApp is the canonical worked example: the **credit** binding of the slot model
(entity = business; score-spine = Business Credit Score; apps = Adjudication / Pricing /
Early-Warning / Line-Increase; portal = Dashboard + Customer 360). When building the matching
piece in a new domain, read the referenced file for the proven pattern, then re-bind to your
entity.

> Paths are relative to the BusinessBankingApp repo root. If you don't have that repo, the
> patterns are fully described in this skill + `decision-app-archetypes.md`; the repo is the
> living example, not a dependency.

## Spine, data, config

| Pattern | File |
|---------|------|
| Synthetic DGP (entity + 24-mo panel + targets) | `shared/data_generator.py` |
| Central config, leakage deny-list, market assumptions | `shared/config.py` |
| Score-spine: WoE + logistic scorecard, reason codes | `score/src/{feature_engineering,train,reason_codes}.py` |
| Score reuse for downstream modules (saved model, not DGP truth) | `score/src/predict.py` |

## Decision apps (one per archetype)

| Archetype | Module | Key files |
|-----------|--------|-----------|
| Eligibility/Triage | Adjudication | `adjudication/src/{feature_engineering,policy,reason_codes,train}.py` |
| Economics (engine) | Pricing | `pricing/src/{engine,portfolio}.py` (+ `tests/test_engine.py` — machine-precision) |
| Monitoring (panel) | Early-Warning | `ews/src/{feature_engineering,triggers,train,watchlist}.py` |
| Next-Best-Action | Line-Increase | `line_increase/src/{feature_engineering,amount_rules,train,candidates}.py` |

## Portal

| Pattern | File |
|---------|------|
| Lifespan caches each module's scored population into `app.state` | `portal/server/main.py` |
| One service per module (orchestrates module code, no logic dup) | `portal/server/{service,pricing_service,ews_service,line_increase_service}.py` |
| Entity-360 aggregation (all apps for one entity, null when N/A) | `portal/server/customer_service.py` |
| Cross-module dashboard summary | `portal/server/dashboard_service.py` |
| Example IDs + hints for lookup dropdowns | `portal/server/examples_service.py` |
| React views + testid contracts | `portal/client/src/views/`, `portal/client/src/components/` |
| Playwright e2e (incl. back-compat re-runs) | `portal/client/e2e/` |

## Governance / process artifacts

| Pattern | File |
|---------|------|
| Resume harness: task ledger | `program_state.json` |
| Resume harness: narrative + per-task token tallies | `SESSION_LOG.md` |
| Per-phase design specs | `docs/superpowers/specs/` |
| Per-phase implementation plans | `docs/superpowers/plans/` |
| The two noise-capped-target escalations (honest-gate vs pure-leaf sharpen) | `SESSION_LOG.md` (Sessions 5 & 6) |
