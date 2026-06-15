# Module 1 — Loan Adjudication (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the loan-adjudication decision engine — a LightGBM probability-of-default model on the synthetic applicant population, wrapped in a transparent policy layer that turns model PD + affordability + bureau signals into an Approve/Refer/Decline decision with reason codes (adverse SHAP + rule hits).

**Architecture:** Adjudication is a second layer on top of Module 0. `score/src/predict.py` reuses the saved scorecard to supply `business_score`/`pd` as decision-time features. A LightGBM classifier predicts `default`; SHAP gives adverse contributions. A pure, vectorized `policy.decide()` applies hard knockouts → PD zones → refer overrides. All thresholds live in `shared/config.py` / `policy_config.json` so decisions are auditable.

**Tech Stack:** Python 3.13 (`./.venv`), pandas, numpy, lightgbm 4.3.0, shap 0.45.1, scikit-learn, joblib, optbinning (via the saved scorecard), pytest.

**Working directory for all paths below:** `/Users/aayan/zzLearnAndCreate/BusinessBankingApp/`

**Conventions:**
- Run Python via `./.venv/bin/python` and tests via `./.venv/bin/pytest`.
- `random_state`/seed = `42` from `shared.config.SEED` everywhere.
- Every commit message ends with the `Co-Authored-By` trailer shown in the steps.
- Branch: `build/adjudication` (already created).
- Do **not** write under `/Users/aayan/zzLearnAndCreate/MarketingAnalytics/`.

**Spec:** `docs/superpowers/specs/2026-06-15-adjudication-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `shared/config.py` | + `LEAKAGE_COLUMNS`, + `ADJ_POLICY` defaults (thresholds, caps) |
| `score/src/predict.py` | `predict_score_pd(df)` — reusable score/PD inference from saved scorecard |
| `score/tests/test_predict.py` | predict shape, range, leakage-safe, matches training direction |
| `adjudication/__init__.py`, `adjudication/src/__init__.py`, `adjudication/tests/__init__.py` | package markers |
| `adjudication/src/feature_engineering.py` | `ADJ_FEATURE_COLUMNS`, `ADJ_CATEGORICAL`, `compute_adjudication_features(df)` |
| `adjudication/src/train.py` | Fit LightGBM, metrics, SHAP background, save model + metadata + report, enforce gate |
| `adjudication/src/policy.py` | `PolicyConfig`, `decide(df, pd_model, config)` decision layer |
| `adjudication/src/reason_codes.py` | `top_adverse_shap(...)`, `explain(...)` combining SHAP + rule hits |
| `adjudication/models/` | `adjudication_model.pkl` (gitignored), `metadata.json`, `policy_config.json` |
| `adjudication/docs/validation_report.md` | Auto-generated metrics + decision mix |
| `adjudication/tests/test_features.py` | column presence, no-NaN, leakage-free, determinism |
| `adjudication/tests/test_policy.py` | knockouts → Decline; PD zones; overrides only downgrade; determinism |
| `adjudication/tests/test_reason_codes.py` | shape, sign, rule-hit pass-through |
| `adjudication/tests/test_model.py` | gate: AUC ≥ 0.78, top-20% lift ≥ 2.0× (runs against saved artifacts) |

**Note on `pd`:** the variable name `pd` collides with the pandas alias. In all code below, the pandas module is `import pandas as pd`, and the model probability-of-default is named `pd_model` / `pd_hat` / column `"pd"` (string). Never bind a local variable named `pd` to a probability.

---

# TASKS

### Task 1: Shared config — leakage deny-list + policy defaults

**Files:**
- Modify: `shared/config.py`
- Test: `shared/tests/test_config.py` (create)

- [ ] **Step 1: Write the failing test**

Create `shared/tests/test_config.py`:

```python
from shared.config import LEAKAGE_COLUMNS, ADJ_POLICY


def test_leakage_columns_complete():
    expected = {
        "pd_default_origination", "default", "risk_based_rate", "booked",
        "deterioration_next_6_12mo", "line_increase_good",
    }
    assert expected.issubset(set(LEAKAGE_COLUMNS))


def test_adj_policy_defaults_present():
    for key in ("t_low", "t_high", "leverage_cap", "dscr_floor",
                "dscr_refer_hi", "prior_delinq_cap", "req_to_rev_cap", "score_floor"):
        assert key in ADJ_POLICY
    assert 0.0 < ADJ_POLICY["t_low"] < ADJ_POLICY["t_high"] < 1.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/bin/pytest shared/tests/test_config.py -v`
Expected: FAIL with `ImportError: cannot import name 'LEAKAGE_COLUMNS'`.

- [ ] **Step 3: Add to `shared/config.py`** (append after the `MARKET` dict)

```python
# Columns that must never enter any model's feature matrix (target / post-decision /
# downstream-module leakage). Single source of truth for all modules.
LEAKAGE_COLUMNS = [
    "pd_default_origination",     # DGP ground-truth PD
    "default",                    # adjudication target
    "risk_based_rate",            # priced from the true PD
    "booked",                     # funding decision (post-adjudication)
    "deterioration_next_6_12mo",  # downstream EWS target
    "line_increase_good",         # downstream line-increase target
]

# Adjudication policy-layer defaults (PD zones, hard knockouts, refer overrides).
# t_low / t_high are re-calibrated from the model PD distribution at train time and
# written to adjudication/models/policy_config.json; these are the seed values.
ADJ_POLICY = {
    "t_low": 0.10,          # pd <= t_low  -> Approve zone
    "t_high": 0.35,         # pd >= t_high -> Decline zone
    "dscr_floor": 1.0,      # dscr < floor -> hard Decline
    "dscr_refer_hi": 1.2,   # approve-zone pd but dscr in [floor, refer_hi) -> Refer
    "public_records_cap": 0,   # public_records > cap -> hard Decline
    "prior_delinq_cap": 3,     # prior_delinquencies >= cap -> hard Decline
    "leverage_cap": 6.0,    # leverage > cap -> hard Decline
    "req_to_rev_cap": 0.75, # requested_amount / annual_revenue > cap -> Refer
    "score_floor": 600,     # approve-zone pd but business_score < floor -> Refer
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/bin/pytest shared/tests/test_config.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add shared/config.py shared/tests/test_config.py
git commit -m "feat(config): add LEAKAGE_COLUMNS deny-list + ADJ_POLICY defaults

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Score inference helper (`score/src/predict.py`)

Reuses the saved scorecard to produce decision-time score/PD for any applicant frame. Guards inputs to avoid the logged matmul-overflow warning.

**Files:**
- Create: `score/src/predict.py`
- Test: `score/tests/test_predict.py`

- [ ] **Step 1: Write the failing test**

Create `score/tests/test_predict.py`:

```python
import pandas as pd

from shared.config import RAW
from score.src.predict import predict_score_pd


def test_predict_score_pd_shape_and_ranges():
    biz = pd.read_parquet(RAW / "businesses.parquet").head(200)
    out = predict_score_pd(biz)
    assert list(out.columns) == ["business_score", "pd", "score_band"]
    assert len(out) == len(biz)
    assert out["business_score"].between(300, 850).all()
    assert out["pd"].between(0.0, 1.0).all()
    assert out["score_band"].isin(["D", "C", "B", "A", "AAA"]).all()


def test_predict_score_pd_rank_orders():
    # higher score should correspond to lower mean PD
    biz = pd.read_parquet(RAW / "businesses.parquet")
    out = predict_score_pd(biz)
    hi = out[out["business_score"] >= out["business_score"].median()]["pd"].mean()
    lo = out[out["business_score"] < out["business_score"].median()]["pd"].mean()
    assert hi < lo
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/bin/pytest score/tests/test_predict.py -v`
Expected: FAIL with `ModuleNotFoundError`/`ImportError` for `score.src.predict`.

- [ ] **Step 3: Write `score/src/predict.py`**

```python
"""Reusable Business Credit Score inference: load the saved scorecard and produce
business_score (300-850), pd, and score_band for any applicant DataFrame.

Used by downstream modules (e.g. Adjudication) so they consume the *modeled* score/PD,
never the DGP ground truth (pd_default_origination).
"""
import json
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from shared.config import SCORE_MIN, SCORE_MAX
from score.src.feature_engineering import FEATURE_COLUMNS, compute_features
from score.src.train import score_to_fico

MODELS = Path("score/models")
_BANDS_BINS = [300, 580, 640, 700, 750, 850]
_BANDS_LABELS = ["D", "C", "B", "A", "AAA"]


@lru_cache(maxsize=1)
def _load():
    scorecard = joblib.load(MODELS / "scorecard.pkl")
    scaling = json.loads((MODELS / "score_scaling.json").read_text())
    return scorecard, scaling["lo"], scaling["hi"]


def predict_score_pd(df: pd.DataFrame) -> pd.DataFrame:
    """Return DataFrame[business_score, pd, score_band] aligned to df.index."""
    scorecard, lo, hi = _load()
    X = compute_features(df)[FEATURE_COLUMNS]
    pd_hat = scorecard.predict_proba(X)[:, 1]
    fico = score_to_fico(scorecard.score(X), lo, hi)
    band = pd.cut(fico, bins=_BANDS_BINS, labels=_BANDS_LABELS, include_lowest=True)
    return pd.DataFrame(
        {
            "business_score": np.asarray(fico, dtype=int),
            "pd": np.clip(pd_hat, 0.0, 1.0),
            "score_band": band.astype(str),
        },
        index=df.index,
    )
```

Note: `score_to_fico` already clips raw scores into `[SCORE_MIN, SCORE_MAX]` and returns int; reusing it keeps direction identical to training. The `optbinning` Scorecard's WoE transform avoids the raw-matmul overflow path that the standalone reason-code matmul hit.

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/bin/pytest score/tests/test_predict.py -v`
Expected: PASS (2 passed). If `scorecard.pkl` is missing, first run `./.venv/bin/python -m score.src.train`.

- [ ] **Step 5: Commit**

```bash
git add score/src/predict.py score/tests/test_predict.py
git commit -m "feat(score): reusable predict_score_pd inference helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Adjudication package + feature engineering

**Files:**
- Create: `adjudication/__init__.py`, `adjudication/src/__init__.py`, `adjudication/tests/__init__.py` (all empty)
- Create: `adjudication/src/feature_engineering.py`
- Test: `adjudication/tests/test_features.py`

- [ ] **Step 1: Create the three empty package markers**

```bash
mkdir -p adjudication/src adjudication/tests adjudication/models adjudication/docs
touch adjudication/__init__.py adjudication/src/__init__.py adjudication/tests/__init__.py
```

- [ ] **Step 2: Write the failing test**

Create `adjudication/tests/test_features.py`:

```python
import pandas as pd

from shared.config import RAW, LEAKAGE_COLUMNS
from adjudication.src.feature_engineering import (
    ADJ_FEATURE_COLUMNS, compute_adjudication_features,
)


def _sample():
    return pd.read_parquet(RAW / "businesses.parquet").head(300)


def test_features_present_and_no_nan():
    X = compute_adjudication_features(_sample())
    for col in ADJ_FEATURE_COLUMNS:
        assert col in X.columns, col
    assert not X[ADJ_FEATURE_COLUMNS].isna().any().any()


def test_features_leakage_free():
    X = compute_adjudication_features(_sample())
    assert set(ADJ_FEATURE_COLUMNS).isdisjoint(set(LEAKAGE_COLUMNS))
    for col in LEAKAGE_COLUMNS:
        assert col not in ADJ_FEATURE_COLUMNS


def test_features_include_score_signal():
    X = compute_adjudication_features(_sample())
    assert "business_score" in ADJ_FEATURE_COLUMNS
    assert "pd_score" in ADJ_FEATURE_COLUMNS
    assert X["business_score"].between(300, 850).all()


def test_features_deterministic():
    a = compute_adjudication_features(_sample())[ADJ_FEATURE_COLUMNS]
    b = compute_adjudication_features(_sample())[ADJ_FEATURE_COLUMNS]
    pd.testing.assert_frame_equal(a, b)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `./.venv/bin/pytest adjudication/tests/test_features.py -v`
Expected: FAIL with `ImportError` for `adjudication.src.feature_engineering`.

- [ ] **Step 4: Write `adjudication/src/feature_engineering.py`**

```python
"""Feature engineering for Loan Adjudication.

Application fields + affordability ratios + the *modeled* business_score / pd reused
from Module 0 (decision-time signals, not leakage). Categorical features use pandas
'category' dtype for LightGBM. Guaranteed leakage-free against shared LEAKAGE_COLUMNS.
"""
import numpy as np
import pandas as pd

from shared.config import LEAKAGE_COLUMNS
from score.src.predict import predict_score_pd

ADJ_CATEGORICAL = ["industry", "entity_type", "loan_purpose"]

ADJ_FEATURE_COLUMNS = [
    # application / firmographic
    "years_in_business", "employees", "annual_revenue", "requested_amount",
    "term_months", "collateral_flag",
    # affordability / financial ratios
    "dscr", "leverage", "current_ratio", "debt_to_income", "utilization", "profit_margin",
    # bureau-like
    "credit_history_months", "prior_delinquencies", "trade_lines", "public_records",
    # reused modeled signals from Module 0
    "business_score", "pd_score",
    # categorical (kept last)
    "industry", "entity_type", "loan_purpose",
]


def compute_adjudication_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    # derived ratios (same formulas as the scorecard's feature engineering)
    out["debt_to_income"] = (
        out["total_debt"] / np.maximum(out["net_income"].abs(), 1.0)
    ).clip(0, 50).round(3)
    out["profit_margin"] = (
        out["net_income"] / np.maximum(out["annual_revenue"], 1.0)
    ).clip(-1, 1).round(4)

    # reuse modeled score/PD from Module 0
    sp = predict_score_pd(df)
    out["business_score"] = sp["business_score"].to_numpy()
    out["pd_score"] = sp["pd"].to_numpy()
    out["score_band"] = sp["score_band"].to_numpy()  # kept for the policy layer (not a model feature)

    # dtypes
    for c in ADJ_FEATURE_COLUMNS:
        if c in ADJ_CATEGORICAL:
            out[c] = out[c].astype("category")
        else:
            out[c] = pd.to_numeric(out[c], errors="coerce").fillna(0.0)

    leaked = [c for c in ADJ_FEATURE_COLUMNS if c in LEAKAGE_COLUMNS]
    if leaked:
        raise ValueError(f"Leakage columns in feature set: {leaked}")
    return out
```

- [ ] **Step 5: Run test to verify it passes**

Run: `./.venv/bin/pytest adjudication/tests/test_features.py -v`
Expected: PASS (4 passed).

- [ ] **Step 6: Commit**

```bash
git add adjudication/__init__.py adjudication/src adjudication/tests/__init__.py adjudication/tests/test_features.py
git commit -m "feat(adjudication): package + leakage-free feature engineering

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Policy decision layer (`policy.py`)

Pure, vectorized Approve/Refer/Decline. Tested with synthetic frames (no model needed).

**Files:**
- Create: `adjudication/src/policy.py`
- Test: `adjudication/tests/test_policy.py`

- [ ] **Step 1: Write the failing test**

Create `adjudication/tests/test_policy.py`:

```python
import numpy as np
import pandas as pd

from shared.config import ADJ_POLICY
from adjudication.src.policy import PolicyConfig, decide


def _frame(**over):
    base = dict(
        dscr=2.0, leverage=1.0, public_records=0, prior_delinquencies=0,
        requested_amount=50_000, annual_revenue=1_000_000, business_score=720,
        score_band="A",
    )
    base.update(over)
    return pd.DataFrame([base])


CFG = PolicyConfig.from_dict(ADJ_POLICY)


def test_low_pd_clean_file_approves():
    out = decide(_frame(), np.array([0.02]), CFG)
    assert out["decision"].iloc[0] == "Approve"


def test_high_pd_declines():
    out = decide(_frame(), np.array([0.50]), CFG)
    assert out["decision"].iloc[0] == "Decline"


def test_mid_pd_refers():
    out = decide(_frame(), np.array([0.20]), CFG)
    assert out["decision"].iloc[0] == "Refer"


def test_knockout_dscr_forces_decline_despite_low_pd():
    out = decide(_frame(dscr=0.8), np.array([0.01]), CFG)
    assert out["decision"].iloc[0] == "Decline"
    assert any("dscr" in r.lower() for r in out["decision_reasons"].iloc[0])


def test_knockout_public_records_forces_decline():
    out = decide(_frame(public_records=1), np.array([0.01]), CFG)
    assert out["decision"].iloc[0] == "Decline"


def test_knockout_prior_delinquencies_forces_decline():
    out = decide(_frame(prior_delinquencies=3), np.array([0.01]), CFG)
    assert out["decision"].iloc[0] == "Decline"


def test_knockout_leverage_forces_decline():
    out = decide(_frame(leverage=7.0), np.array([0.01]), CFG)
    assert out["decision"].iloc[0] == "Decline"


def test_override_thin_dscr_downgrades_approve_to_refer():
    out = decide(_frame(dscr=1.1), np.array([0.02]), CFG)
    assert out["decision"].iloc[0] == "Refer"


def test_override_low_score_downgrades_approve_to_refer():
    out = decide(_frame(business_score=550, score_band="D"), np.array([0.02]), CFG)
    assert out["decision"].iloc[0] == "Refer"


def test_override_large_request_downgrades_approve_to_refer():
    out = decide(_frame(requested_amount=900_000, annual_revenue=1_000_000),
                 np.array([0.02]), CFG)
    assert out["decision"].iloc[0] == "Refer"


def test_override_never_upgrades_decline():
    # high pd + thin dscr: stays Decline, not Refer
    out = decide(_frame(dscr=1.1), np.array([0.50]), CFG)
    assert out["decision"].iloc[0] == "Decline"


def test_deterministic():
    f = _frame()
    p = np.array([0.20])
    a = decide(f, p, CFG)["decision"].iloc[0]
    b = decide(f, p, CFG)["decision"].iloc[0]
    assert a == b
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/bin/pytest adjudication/tests/test_policy.py -v`
Expected: FAIL with `ImportError` for `adjudication.src.policy`.

- [ ] **Step 3: Write `adjudication/src/policy.py`**

```python
"""Adjudication policy decision layer: model PD + affordability + bureau signals ->
Approve / Refer / Decline, with rule-hit reason strings. Pure and vectorized.

Decision order:
  1. Hard knockouts -> force Decline (record every rule that fires).
  2. PD zones: pd<=t_low -> Approve, pd>=t_high -> Decline, else Refer.
  3. Refer overrides: only downgrade an Approve to Refer (never upgrade a Decline).
"""
from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class PolicyConfig:
    t_low: float
    t_high: float
    dscr_floor: float
    dscr_refer_hi: float
    public_records_cap: int
    prior_delinq_cap: int
    leverage_cap: float
    req_to_rev_cap: float
    score_floor: float

    @classmethod
    def from_dict(cls, d: dict) -> "PolicyConfig":
        return cls(**{f: d[f] for f in cls.__dataclass_fields__})

    def to_dict(self) -> dict:
        return {f: getattr(self, f) for f in self.__dataclass_fields__}


def decide(df: pd.DataFrame, pd_model, config: PolicyConfig) -> pd.DataFrame:
    """Return DataFrame[decision, decision_reasons, pd] aligned to df.index."""
    n = len(df)
    pd_model = np.asarray(pd_model, dtype=float)
    reasons = [[] for _ in range(n)]

    g = lambda col, default=0.0: (
        pd.to_numeric(df[col], errors="coerce").fillna(default).to_numpy()
        if col in df.columns else np.full(n, default)
    )
    dscr = g("dscr"); lev = g("leverage")
    pubrec = g("public_records"); delinq = g("prior_delinquencies")
    score = g("business_score", config.score_floor)
    req = g("requested_amount"); rev = np.maximum(g("annual_revenue"), 1.0)

    # --- 1. hard knockouts ---
    knockout = np.zeros(n, dtype=bool)
    def fire(mask, msg):
        for i in np.nonzero(mask)[0]:
            reasons[i].append(msg)
    m = dscr < config.dscr_floor; fire(m, f"dscr<{config.dscr_floor}"); knockout |= m
    m = pubrec > config.public_records_cap; fire(m, "public_records present"); knockout |= m
    m = delinq >= config.prior_delinq_cap; fire(m, f"prior_delinquencies>={config.prior_delinq_cap}"); knockout |= m
    m = lev > config.leverage_cap; fire(m, f"leverage>{config.leverage_cap}"); knockout |= m

    # --- 2. PD zones ---
    decision = np.where(pd_model <= config.t_low, "Approve",
               np.where(pd_model >= config.t_high, "Decline", "Refer")).astype(object)

    # --- 3. refer overrides (only on current Approve) ---
    appr = decision == "Approve"
    thin_dscr = appr & (dscr >= config.dscr_floor) & (dscr < config.dscr_refer_hi)
    fire(thin_dscr, "thin affordability margin (dscr)")
    low_score = appr & (score < config.score_floor)
    fire(low_score, "weak credit score")
    big_req = appr & (req / rev > config.req_to_rev_cap)
    fire(big_req, "large request vs revenue")
    decision[thin_dscr | low_score | big_req] = "Refer"

    # knockouts win over everything
    decision[knockout] = "Decline"

    return pd.DataFrame(
        {"decision": decision, "decision_reasons": reasons, "pd": pd_model},
        index=df.index,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/bin/pytest adjudication/tests/test_policy.py -v`
Expected: PASS (12 passed).

- [ ] **Step 5: Commit**

```bash
git add adjudication/src/policy.py adjudication/tests/test_policy.py
git commit -m "feat(adjudication): policy decision layer (knockouts + PD zones + overrides)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Reason codes (adverse SHAP + rule hits)

**Files:**
- Create: `adjudication/src/reason_codes.py`
- Test: `adjudication/tests/test_reason_codes.py`

- [ ] **Step 1: Write the failing test**

Create `adjudication/tests/test_reason_codes.py`:

```python
import numpy as np
import pandas as pd

from adjudication.src.reason_codes import top_adverse_shap


def test_top_adverse_shap_shape_and_sign():
    # 3 rows, 4 features; SHAP values where feature 'b' is most adverse for row 0
    feature_names = ["a", "b", "c", "d"]
    shap_values = np.array([
        [0.1, 0.9, -0.5, 0.0],
        [-0.2, 0.0, 0.3, 0.1],
        [0.0, 0.0, 0.0, 0.0],
    ])
    out = top_adverse_shap(shap_values, feature_names, k=2)
    assert len(out) == 3
    # row 0 top adverse feature is 'b'
    assert out[0][0]["feature"] == "b"
    # only positive (adverse) contributions are returned
    for row in out:
        for item in row:
            assert item["impact"] > 0
    # row 2 (all zeros) yields no adverse reasons
    assert out[2] == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/bin/pytest adjudication/tests/test_reason_codes.py -v`
Expected: FAIL with `ImportError` for `adjudication.src.reason_codes`.

- [ ] **Step 3: Write `adjudication/src/reason_codes.py`**

```python
"""Adjudication reason codes: top adverse SHAP contributions (features pushing PD up)
combined with policy rule hits into one explanation object per applicant."""
import numpy as np
import pandas as pd


def top_adverse_shap(shap_values, feature_names, k: int = 3):
    """Per-row list of the top-k features with the largest positive SHAP value
    (largest push toward default). Non-positive contributions are dropped."""
    arr = np.asarray(shap_values, dtype=float)
    names = np.asarray(feature_names, dtype=object)
    out = []
    for i in range(arr.shape[0]):
        order = np.argsort(arr[i])[::-1][:k]
        out.append([
            {"feature": str(names[j]), "impact": round(float(arr[i, j]), 4)}
            for j in order if arr[i, j] > 0
        ])
    return out


def explain(decision_df: pd.DataFrame, shap_reasons: list) -> list:
    """Combine the policy decision frame with SHAP reasons into per-applicant dicts."""
    records = []
    for pos, (_, row) in enumerate(decision_df.iterrows()):
        records.append({
            "decision": row["decision"],
            "pd": round(float(row["pd"]), 4),
            "rule_hits": list(row["decision_reasons"]),
            "top_shap_reasons": shap_reasons[pos] if pos < len(shap_reasons) else [],
        })
    return records
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/bin/pytest adjudication/tests/test_reason_codes.py -v`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
git add adjudication/src/reason_codes.py adjudication/tests/test_reason_codes.py
git commit -m "feat(adjudication): adverse-SHAP + rule-hit reason codes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Trainer — LightGBM model, calibrate PD zones, artifacts, gate

**Files:**
- Create: `adjudication/src/train.py`
- (writes `adjudication/models/{adjudication_model.pkl,metadata.json,policy_config.json}` + `adjudication/docs/validation_report.md`)

- [ ] **Step 1: Write `adjudication/src/train.py`**

```python
"""Train the Loan Adjudication LightGBM default model, calibrate PD-zone thresholds,
run the policy layer over the test split, persist artifacts + validation report, and
enforce the metric gate (AUC >= 0.78, top-20% lift >= 2.0x)."""
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap
from lightgbm import LGBMClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

from shared.config import RAW, SEED, ADJ_POLICY, LEAKAGE_COLUMNS
from adjudication.src.feature_engineering import (
    ADJ_FEATURE_COLUMNS, ADJ_CATEGORICAL, compute_adjudication_features,
)
from adjudication.src.policy import PolicyConfig, decide
from adjudication.src.reason_codes import top_adverse_shap

MODELS = Path("adjudication/models")
DOCS = Path("adjudication/docs")

AUC_GATE = 0.78
LIFT_GATE = 2.0


def top_ventile_lift(y_true, pd_hat):
    y = np.asarray(y_true); p = np.asarray(pd_hat)
    cut = np.quantile(p, 0.80)
    top = y[p >= cut]
    base = y.mean()
    return float(top.mean() / base) if base > 0 else 0.0


def main():
    MODELS.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)

    biz = pd.read_parquet(RAW / "businesses.parquet")
    X_all = compute_adjudication_features(biz)
    X = X_all[ADJ_FEATURE_COLUMNS]
    y = biz["default"].to_numpy()

    assert set(ADJ_FEATURE_COLUMNS).isdisjoint(set(LEAKAGE_COLUMNS)), "leakage in features"

    X_tr, X_te, y_tr, y_te, idx_tr, idx_te = train_test_split(
        X, y, np.arange(len(X)), test_size=0.2, random_state=SEED, stratify=y)

    model = LGBMClassifier(
        n_estimators=400, learning_rate=0.03, num_leaves=31,
        subsample=0.8, colsample_bytree=0.8, random_state=SEED, n_jobs=-1, verbose=-1,
    )
    model.fit(X_tr, y_tr, categorical_feature=ADJ_CATEGORICAL)

    pd_te = model.predict_proba(X_te)[:, 1]
    auc = float(roc_auc_score(y_te, pd_te))
    lift = top_ventile_lift(y_te, pd_te)

    # --- calibrate PD zones from the model PD distribution (seed values in ADJ_POLICY) ---
    policy_d = dict(ADJ_POLICY)
    pd_full = model.predict_proba(X)[:, 1]
    policy_d["t_low"] = float(round(np.quantile(pd_full, 0.55), 4))   # ~lower 55% approve-eligible
    policy_d["t_high"] = float(round(np.quantile(pd_full, 0.90), 4))  # ~top 10% decline-eligible
    config = PolicyConfig.from_dict(policy_d)

    # decision mix on the test split (feature frame carries score_band etc.)
    dec = decide(X_all.iloc[idx_te], pd_te, config)
    mix = dec["decision"].value_counts(normalize=True).round(3).to_dict()
    knockouts = int(dec["decision_reasons"].apply(lambda r: len(r) > 0).sum())

    # SHAP sanity (background sample for speed)
    explainer = shap.TreeExplainer(model)
    sv = explainer.shap_values(X_te.iloc[:50])
    sv = sv[1] if isinstance(sv, list) else sv
    _ = top_adverse_shap(sv, ADJ_FEATURE_COLUMNS, k=3)

    # --- persist ---
    joblib.dump(model, MODELS / "adjudication_model.pkl")
    (MODELS / "policy_config.json").write_text(json.dumps(config.to_dict(), indent=2))
    metadata = {
        "ADJ_FEATURE_COLUMNS": ADJ_FEATURE_COLUMNS,
        "categorical": ADJ_CATEGORICAL,
        "train_rows": int(len(X_tr)), "test_rows": int(len(X_te)),
        "metrics": {"auc": round(auc, 4), "top20_lift": round(lift, 4)},
        "gate": {"auc_min": AUC_GATE, "lift_min": LIFT_GATE},
        "decision_mix_test": mix,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    (MODELS / "metadata.json").write_text(json.dumps(metadata, indent=2))

    report = (
        "# Loan Adjudication — Validation Report\n\n"
        f"- Train rows: {len(X_tr):,}  Test rows: {len(X_te):,}\n"
        f"- **AUC:** {auc:.4f}  (gate ≥ {AUC_GATE})\n"
        f"- **Top-20% lift:** {lift:.2f}×  (gate ≥ {LIFT_GATE})\n\n"
        "## PD-zone thresholds (calibrated)\n\n"
        f"- t_low (Approve ≤): {config.t_low}\n- t_high (Decline ≥): {config.t_high}\n\n"
        "## Decision mix (test split)\n\n"
        + "\n".join(f"- {k}: {v:.1%}" for k, v in sorted(mix.items()))
        + f"\n\n- Files with ≥1 policy rule hit: {knockouts:,}\n"
    )
    (DOCS / "validation_report.md").write_text(report)

    print(f"AUC={auc:.4f} lift={lift:.2f}x | t_low={config.t_low} t_high={config.t_high} | mix={mix}")

    assert auc >= AUC_GATE, f"GATE FAIL: AUC {auc:.4f} < {AUC_GATE}"
    assert lift >= LIFT_GATE, f"GATE FAIL: lift {lift:.2f} < {LIFT_GATE}"
    print("GATE PASS")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the trainer**

Run: `./.venv/bin/python -m adjudication.src.train`
Expected: prints `AUC=0.8x.. lift=...x ... GATE PASS`. If `scorecard.pkl` is missing, run `./.venv/bin/python -m score.src.train` first.

- [ ] **Step 3: Verify artifacts exist**

Run: `ls -1 adjudication/models adjudication/docs`
Expected: `adjudication_model.pkl`, `metadata.json`, `policy_config.json`, `validation_report.md`.

- [ ] **Step 4: Commit** (model pkl is gitignored by `**/models/*.pkl`)

```bash
git add adjudication/src/train.py adjudication/models/metadata.json adjudication/models/policy_config.json adjudication/docs/validation_report.md
git commit -m "feat(adjudication): LightGBM trainer + PD-zone calibration + gate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Gate test against saved artifacts

**Files:**
- Test: `adjudication/tests/test_model.py`

- [ ] **Step 1: Write the test**

Create `adjudication/tests/test_model.py`:

```python
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

from shared.config import RAW, SEED
from adjudication.src.feature_engineering import (
    ADJ_FEATURE_COLUMNS, compute_adjudication_features,
)
from adjudication.src.train import top_ventile_lift, AUC_GATE, LIFT_GATE

MODEL = Path("adjudication/models/adjudication_model.pkl")
META = Path("adjudication/models/metadata.json")


@pytest.mark.skipif(not MODEL.exists(), reason="run `python -m adjudication.src.train` first")
def test_saved_model_clears_gate():
    biz = pd.read_parquet(RAW / "businesses.parquet")
    X = compute_adjudication_features(biz)[ADJ_FEATURE_COLUMNS]
    y = biz["default"].to_numpy()
    _, X_te, _, y_te = train_test_split(
        X, y, test_size=0.2, random_state=SEED, stratify=y)
    model = joblib.load(MODEL)
    p = model.predict_proba(X_te)[:, 1]
    assert roc_auc_score(y_te, p) >= AUC_GATE
    assert top_ventile_lift(y_te, p) >= LIFT_GATE


@pytest.mark.skipif(not META.exists(), reason="run trainer first")
def test_metadata_records_gate_pass():
    meta = json.loads(META.read_text())
    assert meta["metrics"]["auc"] >= AUC_GATE
    assert meta["metrics"]["top20_lift"] >= LIFT_GATE
    assert set(meta["decision_mix_test"]).issubset({"Approve", "Refer", "Decline"})
```

- [ ] **Step 2: Run the full adjudication + score suite**

Run: `./.venv/bin/pytest adjudication score/tests/test_predict.py shared/tests/test_config.py -v`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add adjudication/tests/test_model.py
git commit -m "test(adjudication): gate test against saved artifacts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Full regression + ledger/log update

**Files:**
- Modify: `program_state.json`, `SESSION_LOG.md`

- [ ] **Step 1: Run the entire test suite**

Run: `./.venv/bin/pytest -q`
Expected: all tests pass (score 17 + predict 2 + config 2 + adjudication features 4 + policy 12 + reason_codes 1 + model 2, plus foundation 8).

- [ ] **Step 2: Update `program_state.json`**
- Set `adjudication.status` = `"completed"`, mark tasks `subspec/model/policy` done; leave `portal`/`gate` (Playwright) `false` with a note that backend is done and portal is deferred.
- Fill `adjudication.metrics` with `{auc, top20_lift, decision_mix, tests_passed}` from `metadata.json`.
- Fill `adjudication.artifacts` with the created files.
- Append `"adjudication-backend"` to `completed_phases`.
- Update `next_action` to: "Adjudication portal (FastAPI endpoints + React 3-view UI + Playwright), OR Phase Pricing — confirm with user."
- Bump `updated_at` / `session_status`.

- [ ] **Step 3: Append a Session entry to `SESSION_LOG.md`** summarizing: scope (backend only), metrics, decision mix, files, carry-forward (portal deferred), and the resume command.

- [ ] **Step 4: Commit**

```bash
git add program_state.json SESSION_LOG.md
git commit -m "chore(adjudication): backend complete — model+policy+reason codes, ledger updated

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Stop and report** — print status board, metrics, and the resume command. Do not merge to `main` until the user has reviewed (mirror the Phase 0/Score review→merge flow).

---

## Self-Review notes

- **Spec coverage:** model (Task 6) ✓; SHAP (Tasks 5–6) ✓; policy layer w/ knockouts+zones+overrides (Task 4) ✓; reason codes = SHAP + rule hits (Task 5) ✓; leakage deny-list (Task 1) + asserted (Tasks 3,6) ✓; score/PD reuse (Task 2) ✓; gate AUC≥0.78 & lift≥2.0× (Tasks 6–7) ✓; tests for all (Tasks 1–7) ✓. Portal/Playwright explicitly deferred (spec "Out of scope") — not planned here.
- **`pd` naming:** model PD is `pd_model`/`pd_hat`/`pd_te`/`pd_full` and the score-derived feature is `pd_score`; pandas stays `pd`. No collisions.
- **Type consistency:** `PolicyConfig.from_dict`/`to_dict`, `decide(df, pd_model, config) -> [decision, decision_reasons, pd]`, `top_adverse_shap(values, names, k)`, `predict_score_pd -> [business_score, pd, score_band]`, `compute_adjudication_features` adds `business_score`/`pd_score`/`score_band` — all referenced consistently across tasks.
- **Gate risk:** if lift/AUC underperform with default LGBM params, tune `n_estimators`/`learning_rate`/`num_leaves` (Task 6) before relaxing the gate — the gate is the success criterion, not a knob.
```
