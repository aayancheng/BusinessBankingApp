# Module 1 — Loan Adjudication (backend) — Design

**Date:** 2026-06-15
**Status:** Approved design → ready for implementation planning
**Parent spec:** `docs/superpowers/specs/2026-06-14-business-banking-app-design.md` (Module 1)
**Scope of this session:** Backend only — LightGBM default model + SHAP + policy decision
layer (Approve/Refer/Decline) + reason codes + metric gate + tests. The portal
(FastAPI endpoints + React 3-view UI) and Playwright gate are **deferred** to a
follow-up session.

---

## Goal

Build the loan-adjudication decision engine: a LightGBM probability-of-default model
trained on the synthetic applicant population, wrapped in a transparent, auditable
**policy layer** that turns a model PD plus affordability and bureau signals into an
**Approve / Refer / Decline** decision with human-readable reason codes.

Adjudication is a *second layer on top of the Business Credit Score* (Module 0): the
saved scorecard supplies `business_score` and `pd` as decision-time inputs, and the
LightGBM model adds incremental signal from the raw application fields.

---

## Data & target

- **Training table:** `shared/data/raw/businesses.parquet` (all 12,000 applicants).
  We model default at application across the whole applicant pool, not just booked
  loans — adjudication runs at decision time, and the synthetic data provides the
  counterfactual `default` label for every applicant.
- **Target:** `default` (1 = default within 12 months of origination). Base rate ≈ 16.7%.
- **Split:** stratified train/test, `random_state = SEED (42)`.

### Leakage deny-list

Add `LEAKAGE_COLUMNS` to `shared/config.py` as the single source of truth:

```
pd_default_origination   # DGP ground-truth PD
default                  # the target itself
risk_based_rate          # priced from the true PD
booked                   # funding decision, post-adjudication
deterioration_next_6_12mo  # downstream EWS target
line_increase_good         # downstream line-increase target
```

The trainer asserts that **no** column in the feature matrix is in `LEAKAGE_COLUMNS`.

---

## Model

- **Engine:** LightGBM binary classifier (`lightgbm.LGBMClassifier`).
- **Explainability:** SHAP (`shap.TreeExplainer`) for per-applicant adverse contributions.
- **Features (`ADJ_FEATURE_COLUMNS`):**
  - **Application / firmographic:** `industry`, `entity_type`, `years_in_business`,
    `employees`, `annual_revenue`, `requested_amount`, `term_months`, `loan_purpose`,
    `collateral_flag`.
  - **Affordability / financial ratios:** `dscr`, `leverage`, `current_ratio`,
    `debt_to_income`, `utilization`, `profit_margin`.
  - **Bureau-like:** `credit_history_months`, `prior_delinquencies`, `trade_lines`,
    `public_records`.
  - **From Module 0 (reused, not leakage):** `business_score` (300–850) and `pd`
    produced by the saved scorecard via `score/src/predict.py`.
  - Derived ratios (`debt_to_income`, `profit_margin`, etc.) reuse the same formulas as
    `score/src/feature_engineering.py` to stay consistent.
  - Categorical features (`industry`, `entity_type`, `loan_purpose`) passed to LightGBM
    as pandas `category` dtype.
- **Score/PD reuse:** `score/src/predict.py` exposes
  `predict_score_pd(df) -> DataFrame[business_score, pd, score_band]` by loading
  `score/models/scorecard.pkl` + `score_scaling.json`. It clips/guards inputs to avoid
  the previously-logged matmul-overflow warning when scoring the full unclipped set.
- **Gate (must pass before phase is declared complete):**
  - test-split **AUC ≥ 0.78**
  - **top-20% lift ≥ 2.0×** (default rate in the highest-PD ventile ÷ overall default rate)

---

## Policy decision layer

`adjudication/src/policy.py` exposes `decide(df, pd_array, config) -> DataFrame` with
columns `decision` (Approve/Refer/Decline), `decision_reasons` (list of rule hits), and
the driving `pd`. Behavior is governed by a `PolicyConfig` serialized to
`adjudication/models/policy_config.json` so thresholds are transparent and tunable.

**Decision order (first match wins for hard rules, then PD zones, then overrides):**

1. **Hard knockouts → force Decline** (regardless of model PD):
   - `dscr < 1.0` (cannot service the debt)
   - `public_records > 0`
   - `prior_delinquencies >= 3`
   - `leverage > leverage_cap` (extreme leverage; default cap e.g. 6.0)
   Each fired rule is recorded in `decision_reasons`.
2. **PD zones** (model probability of default):
   - `pd <= t_low`  → **Approve**
   - `pd >= t_high` → **Decline**
   - otherwise       → **Refer**
   `t_low` / `t_high` are calibrated from the PD distribution so the resulting
   Approve / Refer / Decline mix is sensible (Approve broadly in line with the ~70%
   historical booked rate; small Decline tail). Final values are recorded in
   `policy_config.json` and the validation report.
3. **Override → Refer** for borderline / conflicting signals (only downgrades an
   Approve, never upgrades a Decline):
   - Approve-zone PD but `dscr` in `[1.0, 1.2)` (thin affordability margin)
   - weak `score_band` (e.g. score below a configurable floor) while PD is approve-zone
   - `requested_amount` large relative to `annual_revenue`
     (`requested_amount / annual_revenue > req_to_rev_cap`)

**Reason codes (`adjudication/src/reason_codes.py`):**
- **Model side:** top-k **adverse SHAP** contributors (largest positive push toward
  default) per applicant, mapped to readable feature labels.
- **Policy side:** the `decision_reasons` rule hits from the policy layer.
- Combined into one explanation object per applicant: `{decision, pd, business_score,
  key_ratios, rule_hits, top_shap_reasons}`.

---

## Components / file structure

| File | Responsibility |
|------|----------------|
| `shared/config.py` | + `LEAKAGE_COLUMNS`, + `ADJ_POLICY` defaults (thresholds, caps) |
| `score/src/predict.py` | `predict_score_pd(df)` — reusable score/PD inference from saved scorecard |
| `adjudication/__init__.py`, `adjudication/src/__init__.py` | package markers |
| `adjudication/src/feature_engineering.py` | `ADJ_FEATURE_COLUMNS`, `compute_adjudication_features(df)` (joins score/PD, derived ratios, leakage assertion) |
| `adjudication/src/train.py` | Fit LightGBM, SHAP, save model + metadata + validation report, enforce gate |
| `adjudication/src/policy.py` | `PolicyConfig`, `decide(df, pd, config)` decision layer |
| `adjudication/src/reason_codes.py` | `top_adverse_shap(...)`, `explain(...)` combining SHAP + rule hits |
| `adjudication/models/` | `adjudication_model.pkl` (gitignored), `metadata.json`, `policy_config.json` |
| `adjudication/docs/validation_report.md` | Auto-generated metrics (AUC, lift, decision mix, knockout counts) |
| `adjudication/tests/test_features.py` | column presence, no-NaN, leakage-free, determinism |
| `adjudication/tests/test_model.py` | gate: AUC ≥ 0.78, top-20% lift ≥ 2.0× |
| `adjudication/tests/test_policy.py` | knockouts force Decline; PD-zone boundaries; overrides only downgrade; determinism |
| `adjudication/tests/test_reason_codes.py` | shape, sign (adverse contributions push toward default), rule-hit pass-through |

---

## Data flow

```
businesses.parquet
   │
   ├─ score/src/predict.py ──► business_score, pd(score), score_band
   │
   ▼
compute_adjudication_features(df)         # app fields + ratios + score/pd
   │   (assert no LEAKAGE_COLUMNS)
   ▼
LGBMClassifier.predict_proba ──► pd_model
   │
   ├─ reason_codes: top adverse SHAP
   ▼
policy.decide(df, pd_model, config)
   │   hard knockouts → Decline
   │   PD zones → Approve / Refer / Decline
   │   overrides → Refer
   ▼
{decision, decision_reasons, pd, business_score, key_ratios, top_shap_reasons}
```

---

## Testing & error handling

- All tests run under `./.venv/bin/pytest`; deterministic via `SEED = 42`.
- Trainer fails loudly (non-zero exit) if the gate is not met, so the phase cannot be
  declared complete on a weak model.
- Feature builder raises if any `LEAKAGE_COLUMNS` member is present in the matrix.
- `predict_score_pd` guards against overflow/NaN by clipping inputs before the WoE matmul.
- Policy layer is pure/vectorized over a DataFrame; given identical inputs + config it
  returns identical decisions.

---

## Out of scope (this session)

- FastAPI endpoints (`/api/adjudication/{id}`, `/applications`, `POST /decide`).
- React portal module (Lookup / What-If / Segments views).
- Playwright end-to-end gate.

These are deferred to a follow-up session and tracked in `program_state.json`.

---

## Success criteria

1. LightGBM model clears the gate (AUC ≥ 0.78, top-20% lift ≥ 2.0×).
2. Feature matrix provably leakage-free (asserted + tested).
3. Policy layer produces a sensible Approve/Refer/Decline mix; hard knockouts always
   force Decline; overrides only downgrade Approve→Refer.
4. Every decision carries reason codes (adverse SHAP + rule hits).
5. All tests pass; artifacts + validation report written; ledger/log updated; committed.
