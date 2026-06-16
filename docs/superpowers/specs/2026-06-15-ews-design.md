# Module 3 — Portfolio Management & Early Warning Signal (EWS) — Design

**Date:** 2026-06-15
**Status:** Approved design → ready for implementation planning
**Parent specs:** `docs/superpowers/specs/2026-06-14-business-banking-app-design.md` (§Module 3,
§3 portal) + the Adjudication design (ML→portal pattern) + the Pricing design (two-module nav
this extends to three).
**Scope:** A LightGBM deterioration model on the 24-month behavioral panel + named trigger
flags + watchlist, plus its portal module (Lookup / Watchlist / Segments), in one session.

## Decisions (user-confirmed)
- **Scope:** backend + portal this session.
- **Panel features:** the full 24-month behavioral panel is the account's observed history;
  the target `deterioration_next_6_12mo` is a separate forward-looking DGP label, so the
  panel is not future data. PD/score reused from the Module 0 scorecard (modeled, never the
  DGP `pd_default_origination`). All `LEAKAGE_COLUMNS` excluded.
- **Trigger flags** are a rule layer surfaced alongside the model probability (mirroring
  Adjudication's policy layer).
- **Trajectory chart** pulls the per-account 24-month panel via the EWS detail route.

---

## 1. Data & target
- Train table: `shared/data/raw/portfolio.parquet` (8,336 booked accounts). Target:
  `deterioration_next_6_12mo` (1 = on-book default/serious delinquency in the 6–12mo horizon;
  base rate ≈ 18.0%).
- Behavioral panel: `shared/data/raw/panel.parquet` — 200,064 rows = 8,336 accounts × 24
  months; columns `business_id, month_index, balance, utilization, days_past_due,
  deposit_inflow, overdraft_count`.
- Split: stratified train/test, `random_state = SEED (42)`.

---

## 2. Panel feature engineering — `ews/src/feature_engineering.py`

`compute_panel_features(panel) -> DataFrame` (one row per business_id), aggregating the 24
months:
- **Recent levels:** `util_recent` (mean util last 3mo), `balance_recent` (mean last 3mo),
  `deposit_recent` (mean last 3mo).
- **Trends/drift:** `util_drift` (mean util last 6mo − first 6mo), `deposit_decline_pct`
  ((first6 mean − last6 mean)/max(first6 mean,1)), `balance_trend` (last6 − first6 mean),
  `util_volatility` (std of util over all months).
- **DPD:** `dpd_months` (count of months days_past_due > 0), `dpd_max` (max days_past_due),
  `dpd_recent` (max days_past_due last 3mo).
- **Overdrafts:** `overdraft_total` (sum), `overdraft_recent` (sum last 6mo).

`compute_ews_features(portfolio) -> DataFrame` joins the panel aggregates +
`predict_score_pd` (business_score, pd_score) + selected on-book/firmographic columns, and
exposes `EWS_FEATURE_COLUMNS` / `EWS_CATEGORICAL`:
- panel features above,
- on-book: `utilization_onbook`, `current_balance`, `credit_limit`, `tenure_months`,
- financial/bureau: `dscr`, `leverage`, `current_ratio`, `prior_delinquencies`,
- modeled: `business_score`, `pd_score`,
- categorical: `industry`, `entity_type`.
Raises if any `EWS_FEATURE_COLUMNS` member is in `LEAKAGE_COLUMNS`.

---

## 3. Model — `ews/src/train.py`
- LightGBM binary classifier on `deterioration_next_6_12mo`; `shap.TreeExplainer`.
- **Gate (both required):**
  - **top-decile capture ≥ 3×** — at least 30% of all deteriorations fall in the top 10% of
    accounts ranked by predicted probability (= top-decile lift ≥ 3.0).
  - **AUC ≥ 0.75.** PR-AUC (average precision) is computed and reported (must beat the base
    rate, i.e. PR-AUC > 0.18).
- Persists `ews/models/{ews_model.pkl (gitignored), metadata.json}` + writes
  `ews/docs/validation_report.md` (AUC, PR-AUC, top-decile capture, tier mix). Trainer asserts
  the gate (non-zero exit on failure).

---

## 4. Trigger flags — `ews/src/triggers.py`
`EWS_TRIGGERS` config (thresholds) + `flag_triggers(features) -> list[list[str]]` producing
named early-warning rules per account:
- `HIGH_UTILIZATION` — `util_recent > 0.90`
- `RISING_UTILIZATION` — `util_drift > 0.15`
- `DELINQUENCY` — `dpd_max >= 30` or `dpd_recent > 0`
- `DEPOSIT_DECLINE` — `deposit_decline_pct > 0.30`
- `FREQUENT_OVERDRAFTS` — `overdraft_recent >= 3`
Vectorized, pure. Thresholds live in `shared/config.py` (`EWS_TRIGGERS`) so they're auditable.

---

## 5. Risk tier + watchlist + reason codes — `ews/src/watchlist.py`
- `risk_tier(prob)` → `High` (prob ≥ `t_high`) / `Medium` (≥ `t_med`) / `Low`; thresholds
  calibrated from the predicted-probability distribution (e.g. ~ top decile = High) and stored
  in `ews/models/metadata.json`.
- `score_population()` → DataFrame indexed by business_id with prob, risk_tier, triggers,
  top adverse SHAP, and the key behavioral metrics, for the portal cache.
- `watchlist(df, top_n)` → the High-tier (or top-N) accounts ranked by prob.
- Reason codes reuse the adverse-SHAP helper pattern (`top_adverse_shap`).

---

## 6. Components / file structure

| File | Responsibility |
|------|----------------|
| `ews/__init__.py`, `ews/src/__init__.py`, `ews/tests/__init__.py` | markers |
| `ews/src/feature_engineering.py` | `compute_panel_features`, `compute_ews_features`, `EWS_FEATURE_COLUMNS`, `EWS_CATEGORICAL` |
| `ews/src/triggers.py` | `EWS_TRIGGERS` (in shared/config), `flag_triggers` |
| `ews/src/train.py` | LightGBM + SHAP + gate + artifacts/report |
| `ews/src/watchlist.py` | `risk_tier`, `score_population`, `watchlist` |
| `ews/models/` | `ews_model.pkl` (gitignored), `metadata.json` |
| `ews/docs/validation_report.md` | auto-generated |
| `ews/tests/test_features.py` | panel aggregates, leakage-free, determinism |
| `ews/tests/test_triggers.py` | each trigger fires on the right condition |
| `ews/tests/test_model.py` | gate against saved artifacts |
| `shared/config.py` (modify) | + `EWS_TRIGGERS`, + `EWS_TIERS` thresholds |
| `portal/server/ews_service.py` | row→record glue + population/watchlist caching + panel series |
| `portal/server/schemas.py` (modify) | + EWS models |
| `portal/server/main.py` (modify) | + lifespan caching + 3 EWS routes |
| `portal/server/tests/test_ews_api.py` | endpoint tests |
| `portal/client/src/lib/{api,hooks,constants}.js` (modify) | + EWS |
| `portal/client/src/components/{RiskTrajectory,RiskTierBadge}.jsx` | new |
| `portal/client/src/components/Sidebar.jsx` (modify) | promote Early Warning group |
| `portal/client/src/App.jsx` (modify) | + EWS module/views |
| `portal/client/src/views/ews/{EwsLookupView,EwsWatchlistView,EwsSegmentsView}.jsx` | 3 views |
| `portal/client/e2e/ews.spec.js` | Playwright smoke |
| `pytest.ini` (modify) | + `ews/tests` |

---

## 7. API (added to the single portal backend)

| Method/Path | Returns |
|-------------|---------|
| `GET /api/ews/watchlist?limit=` | ranked at-risk accounts: `[{business_id, industry, prob, risk_tier, triggers}]` (High-tier or top-N) |
| `GET /api/ews/segments` | deterioration/High-tier rate by `score_band`, `industry`, `tenure_vintage` |
| `GET /api/ews/{business_id}` | detail: prob, risk_tier, triggers, top_shap_reasons, key behavioral metrics, **`trajectory`** = list of `{month_index, utilization, days_past_due, balance}`; 404 unknown |

`/watchlist` and `/segments` declared before `/{business_id}`. Prediction fields top-level.

---

## 8. Frontend (third active module)

**Nav:** Sidebar promotes the **Early Warning** group (Lookup / Watchlist / Segments) with
testids `nav-ews-lookup` / `nav-ews-watchlist` / `nav-ews-segments`; existing Adjudication and
Pricing testids unchanged. App gains the EWS module/views in its `{module,view}` switch.

**New components:** `RiskTrajectory({ series })` — Recharts `LineChart` of utilization &
days_past_due (and balance) over `month_index`, wrapper `data-testid="ews-trajectory"`.
`RiskTierBadge({ tier })` — High=rose / Medium=amber / Low=emerald pill,
`data-testid="risk-tier-badge"`.

**Views (`src/views/ews/`):**
- `EwsLookupView` — pick account → `RiskTierBadge`, deterioration-probability StatCard,
  trigger-flag chips, `RiskTrajectory`, adverse-SHAP `ReasonList`. Container
  `data-testid="view-ews-lookup"`.
- `EwsWatchlistView` — `DataTable` of ranked at-risk accounts (business_id, industry, prob,
  tier, triggers); container `data-testid="view-ews-watchlist"`, table rows `app-row`.
- `EwsSegmentsView` — Recharts bars of deterioration rate by band & industry; wrapper
  `data-testid="ews-segments-chart"`, container `data-testid="view-ews-segments"`.

---

## 9. Gate (this session)
1. **Model:** trainer asserts top-decile capture ≥ 3× and AUC ≥ 0.75 (PR-AUC reported).
2. **API tests** pass (added to testpaths).
3. **Playwright** smoke (boots both servers): EWS Lookup shows the tier badge + a trajectory
   chart; Watchlist renders ranked rows; Segments renders a chart. The Adjudication (3) and
   Pricing (3) e2e specs must still pass → full suite 9 e2e.
4. `vite build` succeeds.

---

## Out of scope (deferred)
- Cross-module Dashboard / `GET /api/customer/{id}` 360 view.
- Module 4 (Proactive Line Increase) — its sidebar stub stays disabled.
- Explicit windowed observation/performance split (using the full panel per the decision).

## Success criteria
1. Model clears the gate (top-decile capture ≥ 3×, AUC ≥ 0.75).
2. Features provably leakage-free (asserted + tested).
3. Trigger flags fire correctly on their conditions; each account carries a risk tier +
   triggers + adverse-SHAP reasons.
4. The three EWS views render real data; the trajectory chart shows the per-account 24-mo
   panel; Adjudication & Pricing e2e still pass.
5. Model + API tests + Playwright pass; `vite build` succeeds.
6. No Module 0/1/2/3 logic duplicated in the portal; ledger + session log updated; committed.
