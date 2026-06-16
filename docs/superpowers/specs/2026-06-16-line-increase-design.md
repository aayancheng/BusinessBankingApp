# Module 4 — Proactive Line Increase (design)

**Date:** 2026-06-16
**Status:** Approved (brainstorm) — pending implementation plan
**Branch:** `build/line-increase`
**Master spec:** `docs/superpowers/specs/2026-06-14-business-banking-app-design.md` (§ Module 4)

The last of the four apps. Ranks on-book accounts as good line-increase candidates,
recommends an increase amount, and **only surfaces the offer when the incremental
exposure is ROE-accretive** — reusing the credit score (modeled PD), the pricing engine,
and the SHAP reason-code pattern.

---

## 1. Goal & success criteria

**Goal:** for each booked account, answer three questions — *is this a good
line-increase candidate?*, *how much should we offer?*, and *is lending that extra
exposure ROE-accretive?* — and present a ranked, gated offer list.

**Success criteria (model gate, logged to `program_state.json`):**
- **AUC ≥ 0.78** on the held-out test split (target `line_increase_good`, base ~22.9%).
- **Top-20% lift ≥ 2.0** (candidate-probability ranking vs. base rate).
- **Cohort checks:** the recommended (offered + ROE-passing) cohort has **lower mean
  modeled PD** and **higher mean utilization** than the book average.
- **Aggregate incremental exposure is ROE-positive** (the offered book's
  exposure-weighted incremental ROE ≥ the hurdle).

> **Build note (2026-06-16) — DGP sharpened (Option A).** The *original* `line_increase_good`
> target was Bernoulli-noise-capped just like the EWS deterioration target: the noise-free DGP
> logit reached only AUC 0.71 and an oracle LightGBM (with leakage drivers) only 0.66, so
> AUC ≥ 0.78 was unreachable. Because `line_increase_good` is a **pure leaf** (no module
> consumes it as a feature) and is the **last stochastic draw** in `generate_portfolio_and_panel`,
> its logit coefficients + noise were re-tuned to lean on the *observable* drivers (on-book
> utilization, revenue) with reduced Bernoulli noise — lifting the achievable AUC to ~0.84 —
> **without changing the RNG call structure**, so `businesses.parquet`, `panel.parquet`, and
> every other `portfolio.parquet` column are bit-identical (verified by per-column hash; the
> 80 Modules 0–3 tests stay green). New base rate ≈ 0.222 (was 0.229).
>
> **Build note (2026-06-16) — risk-appetite PD ceiling added.** Because the sharpened target
> leans on utilization (which drifts upward with PD in the panel), a purely utilization-gated
> offer set skewed marginally *higher* PD than the book. To honor the "recommended cohort is
> lower-risk / within risk appetite" criterion, offer-eligibility gained a **modeled-PD ceiling**
> (`LINE_INCREASE['max_pd_quantile']` = 0.50, calibrated at train time to `offer_max_pd` in
> metadata): proactive increases go only to accounts at/below the book-median modeled PD that
> are also high-utilization and ROE-accretive. Result at gate: cohort PD 0.036 ≪ book 0.117,
> cohort util 0.837 > 0.471, agg incremental ROE 0.215, AUC 0.813, top-20% lift 2.66×.

---

## 2. The target and its DGP (for leakage discipline)

`line_increase_good` (in `shared/data_generator.py`) is a Bernoulli draw on the **sharpened**
logit (see Build note above):

```
li_logit = -2.1
           - 3.0 * pd_true                      # lower risk  -> better candidate
           + 7.0 * clip(util_last3 - 0.5, 0)    # high utilization -> needs headroom (observable)
           + 1.2 * z(log annual_revenue)        # capacity (observable)
           - 0.4 * deterioration                # not deteriorating
           + N(0, 0.18)
```

Three of the four drivers are **leakage columns** the model must NOT consume as features:
`pd_default_origination` (true PD), `deterioration_next_6_12mo` (EWS target), and the
target itself. The fair, production-honest analogs are the **modeled PD** from
`score/src/predict.predict_score_pd` and the **observable behavioral features**
(utilization, revenue, tenure). This mirrors Modules 1–3: predict from modeled signals,
never from the DGP ground truth.

---

## 3. Architecture & components

```
line_increase/
  src/
    feature_engineering.py   # candidate features (leakage-safe) + modeled PD
    amount_rules.py          # recommended Δlimit (headroom-to-target, capped) + ROE gate
    train.py                 # LightGBM classifier + SHAP + metric gate
    reason_codes.py          # top POSITIVE SHAP drivers ("why a good candidate")
  models/
    line_increase_model.pkl  # gitignored
    metadata.json            # metrics, gate results, feature list, config
  tests/
    test_amount_rules.py
    test_roe_gate.py
    test_model_gate.py
  docs/
    validation_report.md
```

### 3.1 `feature_engineering.py`
Builds the candidate feature matrix from `portfolio.parquet`:
- Behavioral / capacity: `utilization_onbook`, utilization headroom (`1 - utilization_onbook`,
  clipped), `credit_limit`, `current_balance`, `tenure_months`, `log(annual_revenue)`.
- Risk: **modeled PD** via `score/src/predict.predict_score_pd` (NOT `pd_default_origination`),
  plus firmographic/financial features already used upstream (leverage, current_ratio, dscr,
  years_in_business, prior_delinquencies, etc.).
- **Leakage-safe:** exclude every column in `shared/config.LEAKAGE_COLUMNS`. In particular
  `line_increase_good` (target), `deterioration_next_6_12mo`, `pd_default_origination`,
  `default`, `risk_based_rate`, `booked` are never features.
- Exposes `FEATURE_COLUMNS` (the frozen training feature list) for reuse by the service.

### 3.2 `train.py`
- LightGBM binary classifier on `line_increase_good`. Train/test split consistent with
  Adjudication (same seed/ratio convention).
- Computes AUC, top-20% lift, decision/threshold diagnostics.
- SHAP values persisted-enough to drive reason codes at scoring time.
- **Applies the gate** (§1); writes `metadata.json` with metrics + gate pass/fail + the
  candidate-probability threshold used for "offer eligible".
- Writes `docs/validation_report.md`.

### 3.3 `reason_codes.py`
- Adapts `adjudication/src/reason_codes.top_adverse_shap`: here we surface the **top
  positive** SHAP contributors — the reasons an account *is* a good candidate (high
  headroom, strong revenue, low modeled PD). Same shape/return contract as the adjudication
  helper so the portal can render it identically.

### 3.4 `amount_rules.py` (amount + incremental-ROE gate)
Pure, deterministic. Two responsibilities:

**(a) Recommended amount — headroom-to-target utilization, capped.**
```
target_limit   = current_balance / TARGET_UTIL          # TARGET_UTIL ~ 0.65
raw_delta      = target_limit - credit_limit
delta          = min(raw_delta,
                     PCT_CAP * credit_limit,             # PCT_CAP ~ 0.50
                     revenue_ceiling - credit_limit)     # revenue-based ceiling
delta          = max(0, round_to_increment(delta))       # floor at 0; round to e.g. 1000
```
An offer is **eligible** only when candidate probability ≥ threshold **and** `delta > 0`.
All knobs (`TARGET_UTIL`, `PCT_CAP`, revenue-multiple, rounding increment, prob threshold)
live in `shared/config.py` under a `LINE_INCREASE` block.

**(b) Incremental-ROE gate — reuses `pricing/src/engine.py`.**
- Incremental EAD = `delta * clip(utilization_onbook, 0, 1)` — the account is assumed to
  draw new headroom at its existing behavioral utilization rate.
- Price the increment with the pricing engine `profit_waterfall` at **modeled PD** and the
  **account's rate** (`risk_based_rate` — used here as a real economic input, the rate the
  customer pays on the incremental balance, not as a model feature).
- **Require incremental ROE ≥ `roe_hurdle` (0.15).**

> **Design note — ROE is EAD-invariant.** Per the pricing engine docstring, ROE and RAROC
> depend only on PD and rate, not on exposure size. So the incremental-ROE *ratio* is
> identical regardless of the drawdown assumption; the gate reduces to "does the account's
> rate clear the hurdle at its modeled PD." The drawdown assumption (`delta × utilization`)
> drives the **dollar** figures we report — incremental exposure and incremental net income —
> **not** the ROE ratio. The spec states this explicitly so the "incremental ROE" number is
> never mistaken for something the EAD scales. (The aggregate cohort check in §1 is
> exposure-weighted, so the drawdown assumption does matter there.)

---

## 4. Portal

### 4.1 Backend — `portal/server/line_increase_service.py`
- Scores the booked population once (candidate prob + recommended amount + incremental-ROE
  result), cached in the FastAPI `lifespan` (same pattern as pricing/EWS services).
- Three routes added to `portal/server/main.py`:
  - `GET  /api/line-increase/{id}` — eligibility, recommended amount, incremental-ROE
    waterfall, positive reason codes, the account's current limit/balance/utilization.
  - `GET  /api/line-increase/candidates` — ranked, paginated offer list (eligible +
    ROE-passing), using the shared `PaginatedResponse` shape (`items`/`pages`).
  - `POST /api/line-increase/simulate` — what-if: caller supplies an account id + a proposed
    amount (or target utilization); returns the recomputed incremental EAD, incremental ROE,
    pass/fail, and waterfall.
- Pydantic models added to `portal/server/schemas.py`.

### 4.2 Frontend — `portal/client/src/views/line_increase/`
Three views (mirrors the per-module trio of Modules 1–3):
- **`LineIncreaseLookupView`** — single account: eligibility badge, recommended amount,
  current vs. post-increase utilization, the incremental-ROE `Waterfall` + `PassFailBadge`,
  positive reason codes, **and a what-if amount slider** that calls `/simulate` and
  re-renders the incremental ROE live.
- **`LineIncreaseCandidatesView`** — ranked offer table (account, score band, recommended
  amount, incremental exposure, incremental ROE, pass/fail), paginated.
- **`LineIncreaseSegmentsView`** — offer rate and expected incremental exposure by score
  band / risk segment.

Reuses existing `Waterfall` and `PassFailBadge` components.

### 4.3 Navigation
Promote the disabled **"Line Increase"** stub from `DISABLED_ITEMS` in
`portal/client/src/components/Sidebar.jsx` to the active nav — the **4th active module**.
Wire routes/views in `App.jsx`. **Back-compat is a hard requirement:** re-run the existing
adjudication + pricing + EWS Playwright specs and confirm they still pass after the nav
change (this has been the highest-value review in each prior module).

---

## 5. Verification strategy

1. **Model gate** (§1) — AUC ≥ 0.78, top-20% lift ≥ 2.0, cohort + aggregate-ROE checks;
   results written to `program_state.json` and `validation_report.md`.
2. **Backend tests** — new pytest for `amount_rules` (caps, flooring, rounding, eligibility),
   `roe_gate` (incremental EAD, hurdle pass/fail, EAD-invariance property), `model_gate`
   (metrics meet thresholds), and the 3 new API routes. Total backend pytest grows past the
   current 80.
3. **Build gate** — `npm run build` passes.
4. **Playwright gate** — `line_increase.spec.js` (3 views) added; full suite runs **12/12**
   (3 adjudication + 3 pricing + 3 ews + 3 line-increase). One screenshot per new view.

---

## 6. Reuse map (what Module 4 leans on)

| Reused | From | How |
|--------|------|-----|
| Modeled PD | `score/src/predict.predict_score_pd` | candidate feature + incremental-ROE PD |
| Pricing engine | `pricing/src/engine.py` (`profit_waterfall`, `hurdle_clearing_rate`) | incremental-ROE gate |
| Reason codes | `adjudication/src/reason_codes.top_adverse_shap` | adapted to top **positive** drivers |
| Leakage list | `shared/config.LEAKAGE_COLUMNS` | feature exclusion |
| Service/lifespan pattern | `portal/server/{pricing,ews}_service.py` | cached scored population |
| `Waterfall`, `PassFailBadge` | `portal/client/src/components/` | incremental-ROE display |
| Paginated shape | shared `PaginatedResponse` (`items`/`pages`) | candidates list |

---

## 7. Out of scope (YAGNI)

- **True causal uplift modeling** — the synthetic data has no treatment/control assignment,
  so this is an observational **propensity / "good candidate" classifier**, not a causal
  uplift model. We do not fabricate a treatment arm.
- **Regenerating the data** — Module 4 uses the existing `portfolio.parquet` as-is.
- **Cross-module 360 dashboard / exec deck** — deferred to the `portal_integration` phase.

---

## 8. Execution

Branch `build/line-increase`. Subagent-driven (one implementer + one reviewer per task,
two-stage review), per-task token tally kept as in Modules 1–3. On completion: update the
ledger, append a `SESSION_LOG.md` entry, **stop for user review before a `--no-ff` merge to
`main`.**
