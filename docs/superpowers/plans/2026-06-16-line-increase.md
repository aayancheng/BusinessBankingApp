# Proactive Line Increase (Module 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank booked accounts as good line-increase candidates, recommend an increase amount, gate each offer by an incremental-ROE test that reuses the pricing engine, and expose it as the 4th active portal module.

**Architecture:** New `line_increase/` package (feature engineering on `portfolio.parquet` + modeled PD, pure amount-rule + incremental-ROE functions reusing `pricing/src/engine.py`, a LightGBM candidate model, a scored-population/candidates module). Portal gains a `line_increase_service.py`, 4 routes, 3 React views, and a 4th nav group. All on branch `build/line-increase`.

**Tech Stack:** Python (pandas, LightGBM, SHAP, scikit-learn), FastAPI/Pydantic, React + Vite + Tailwind + Recharts, Playwright. Self-contained venv at `./.venv`; run pytest/uvicorn from the workspace root.

**Spec:** `docs/superpowers/specs/2026-06-16-line-increase-design.md`

**Key reuse / invariants (read before coding):**
- Modeled PD comes from `score.src.predict.predict_score_pd(df)` → DataFrame[`business_score`,`pd`,`score_band`]. Never use `pd_default_origination`.
- Pricing engine: `pricing.src.engine.MarketAssumptions.from_market(MARKET)`, `profit_waterfall(pd_, ead, rate, market) -> dict` (raises if `ead<=0`), `hurdle_clearing_rate(pd_, ead, market)`. **ROE/RAROC are EAD-invariant** (depend only on pd & rate).
- Reason codes: `adjudication.src.reason_codes.top_adverse_shap(shap_values, feature_names, k=3)` returns, per row, a list of `{"feature","impact"}` for the **largest positive** SHAP contributions — i.e. the drivers pushing the prediction up. For the line-increase model "up" = more likely a good candidate, so this helper is reused as-is (no new reason-codes file).
- `risk_based_rate` is a `LEAKAGE_COLUMNS` member: it must NOT be a model feature, but it IS the legitimate economic rate charged on the incremental balance (used only in the ROE math), exactly as the pricing module uses it.
- Run all Python from workspace root so `shared/score/pricing/adjudication/line_increase/portal` import cleanly: `./.venv/bin/python -m line_increase.src.train`, `./.venv/bin/pytest -q`.

---

## File Structure

**Create:**
- `line_increase/src/__init__.py`
- `line_increase/src/feature_engineering.py` — `LI_FEATURE_COLUMNS`, `LI_CATEGORICAL`, `compute_line_increase_features(df)`
- `line_increase/src/amount_rules.py` — `recommended_amount`, `incremental_exposure`, `incremental_roe`, `waterfall_or_zero` (pure; reuses pricing engine)
- `line_increase/src/train.py` — LightGBM trainer + gate + metadata + validation report
- `line_increase/src/candidates.py` — `score_population()`, `candidates(df, top_n)`, `segments(df)`
- `line_increase/tests/__init__.py`
- `line_increase/tests/test_amount_rules.py`
- `line_increase/tests/test_roe_gate.py`
- `line_increase/tests/test_model_gate.py`
- `line_increase/docs/validation_report.md` (written by trainer)
- `portal/server/line_increase_service.py` — `load_population`, `detail_record`, `simulate`
- `portal/server/tests/test_line_increase_api.py`
- `portal/client/src/views/line_increase/LineIncreaseLookupView.jsx`
- `portal/client/src/views/line_increase/LineIncreaseCandidatesView.jsx`
- `portal/client/src/views/line_increase/LineIncreaseSegmentsView.jsx`
- `portal/client/e2e/line_increase.spec.js`

**Modify:**
- `shared/config.py` — append `LINE_INCREASE` block
- `portal/server/schemas.py` — append Module 4 models
- `portal/server/main.py` — import service, cache `li_pop` in lifespan, add 4 routes
- `portal/client/src/lib/api.js` — add 4 fetchers
- `portal/client/src/lib/hooks.js` — add 3 hooks
- `portal/client/src/components/Sidebar.jsx` — add `LINE_INCREASE_ITEMS`, drop the disabled stub, update footer
- `portal/client/src/App.jsx` — import + wire 3 views
- `.gitignore` — ensure `line_increase/models/` `.pkl` is ignored

---

## Task 1: Config block

**Files:**
- Modify: `shared/config.py` (append after `EWS_TIERS`, end of file)

- [ ] **Step 1: Append the `LINE_INCREASE` block**

Add to the end of `shared/config.py`:

```python

# Proactive Line Increase (Module 4) — amount rules + incremental-ROE gate.
# target_util: post-increase utilization target the amount rule aims for.
# pct_cap: max increase as a fraction of the current limit.
# revenue_mult_cap: total post-increase limit capped at this multiple of annual revenue.
# round_to: recommended increase rounded to the nearest this many currency units.
# offer_quantile: candidates with predicted prob at/above this population quantile are
#   offer-eligible (re-calibrated at train time and written to metadata.json).
# roe_hurdle: incremental-ROE hurdle (mirrors MARKET['roe_hurdle']).
LINE_INCREASE = {
    "target_util": 0.65,
    "pct_cap": 0.50,
    "revenue_mult_cap": 0.30,
    "round_to": 1000,
    "offer_quantile": 0.75,
    "roe_hurdle": 0.15,
}
```

- [ ] **Step 2: Verify it imports**

Run: `./.venv/bin/python -c "from shared.config import LINE_INCREASE; print(LINE_INCREASE)"`
Expected: prints the dict with `target_util` 0.65.

- [ ] **Step 3: Commit**

```bash
git add shared/config.py
git commit -m "feat(line-increase): add LINE_INCREASE config block"
```

---

## Task 2: Amount rules + incremental-ROE (pure, TDD)

**Files:**
- Create: `line_increase/src/__init__.py` (empty), `line_increase/tests/__init__.py` (empty)
- Create: `line_increase/src/amount_rules.py`
- Test: `line_increase/tests/test_amount_rules.py`, `line_increase/tests/test_roe_gate.py`

- [ ] **Step 1: Create the package `__init__.py` files (empty)**

```bash
mkdir -p line_increase/src line_increase/tests
: > line_increase/src/__init__.py
: > line_increase/tests/__init__.py
```

- [ ] **Step 2: Write the failing tests for `recommended_amount`**

Create `line_increase/tests/test_amount_rules.py`:

```python
import pytest

from line_increase.src.amount_rules import (
    recommended_amount, incremental_exposure, incremental_roe, waterfall_or_zero,
)


def test_amount_targets_utilization_then_rounds():
    # balance 65k, limit 100k, util_target 0.65 -> target_limit 100k -> delta 0 -> no offer
    assert recommended_amount(current_balance=65_000, credit_limit=100_000,
                              annual_revenue=1_000_000) == 0.0


def test_amount_recommends_increase_when_utilized():
    # balance 90k, limit 100k -> target_limit 90k/0.65 = 138.46k -> raw delta 38.46k.
    # pct_cap = 0.50*100k = 50k (not binding); revenue ceiling 0.30*1m - 100k = 200k (not binding).
    # rounds 38_461 -> 38_000.
    amt = recommended_amount(current_balance=90_000, credit_limit=100_000,
                             annual_revenue=1_000_000)
    assert amt == 38_000.0


def test_amount_capped_by_pct_of_limit():
    # very high balance wants a huge increase, but pct_cap binds at 0.50*limit.
    amt = recommended_amount(current_balance=200_000, credit_limit=100_000,
                             annual_revenue=10_000_000)
    assert amt == 50_000.0  # 0.50 * 100k


def test_amount_capped_by_revenue_ceiling():
    # pct cap would allow 50k, but revenue ceiling 0.30*200k - 100k = -40k -> no headroom.
    amt = recommended_amount(current_balance=200_000, credit_limit=100_000,
                             annual_revenue=200_000)
    assert amt == 0.0


def test_amount_zero_for_nonpositive_limit():
    assert recommended_amount(current_balance=10_000, credit_limit=0,
                              annual_revenue=500_000) == 0.0
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `./.venv/bin/pytest line_increase/tests/test_amount_rules.py -q`
Expected: FAIL with `ModuleNotFoundError` / `ImportError` (no `amount_rules`).

- [ ] **Step 4: Implement `amount_rules.py`**

Create `line_increase/src/amount_rules.py`:

```python
"""Pure, deterministic line-increase amount rules + incremental-ROE gate.

The recommended amount is headroom-to-target-utilization, capped by a percentage of the
current limit and a revenue-based ceiling. The incremental-ROE gate prices the incremental
exposure with the shared pricing engine. NOTE: pricing ROE/RAROC are EAD-invariant (depend
only on pd & rate), so the drawdown assumption scales the *dollar* figures, not the ROE
ratio. No ML here; no engine logic redefined."""
from __future__ import annotations

from shared.config import LINE_INCREASE, MARKET
from pricing.src.engine import MarketAssumptions, profit_waterfall, hurdle_clearing_rate

CFG = LINE_INCREASE
_MARKET = MarketAssumptions.from_market(MARKET)

_WATERFALL_KEYS = (
    "interest_income", "cost_of_funds", "expected_loss", "operating_cost",
    "pre_tax_profit", "tax", "net_income", "allocated_equity", "roe", "raroc",
)


def recommended_amount(current_balance: float, credit_limit: float,
                       annual_revenue: float, cfg: dict = CFG) -> float:
    """Increase (Δlimit) that brings utilization to cfg['target_util'], capped by
    cfg['pct_cap']*limit and a revenue ceiling, floored at 0, rounded to cfg['round_to']."""
    if credit_limit <= 0:
        return 0.0
    target_limit = current_balance / cfg["target_util"]
    raw_delta = target_limit - credit_limit
    pct_cap = cfg["pct_cap"] * credit_limit
    revenue_ceiling = cfg["revenue_mult_cap"] * annual_revenue - credit_limit
    delta = min(raw_delta, pct_cap, revenue_ceiling)
    if delta <= 0:
        return 0.0
    rnd = cfg["round_to"]
    return float(round(delta / rnd) * rnd)


def incremental_exposure(delta_amount: float, utilization_onbook: float) -> float:
    """EAD of the incremental limit: drawn at current on-book utilization (clipped 0-1)."""
    util = min(max(float(utilization_onbook), 0.0), 1.0)
    return float(delta_amount) * util


def waterfall_or_zero(pd_: float, ead: float, rate: float,
                      market: MarketAssumptions = _MARKET) -> dict:
    """profit_waterfall when ead > 0, else an all-zero waterfall (engine rejects ead<=0)."""
    if ead > 0:
        return profit_waterfall(pd_, ead, rate, market)
    return {k: 0.0 for k in _WATERFALL_KEYS}


def incremental_roe(pd_: float, delta_amount: float, utilization_onbook: float,
                    rate: float, market: MarketAssumptions = _MARKET) -> dict:
    """Price the incremental exposure. Returns incremental_ead, roe (EAD-invariant),
    clears_hurdle, incremental_net_income, hurdle_clearing_rate, and the waterfall."""
    ead = incremental_exposure(delta_amount, utilization_onbook)
    w = waterfall_or_zero(pd_, ead, rate, market)
    return {
        "incremental_ead": ead,
        "roe": w["roe"],
        "clears_hurdle": bool(ead > 0 and w["roe"] >= market.roe_hurdle),
        "incremental_net_income": w["net_income"],
        "hurdle_clearing_rate": hurdle_clearing_rate(pd_, max(ead, 1.0), market),
        "waterfall": w,
    }
```

- [ ] **Step 5: Run the amount tests to verify they pass**

Run: `./.venv/bin/pytest line_increase/tests/test_amount_rules.py -q`
Expected: 5 passed.

- [ ] **Step 6: Write the failing tests for the ROE gate**

Create `line_increase/tests/test_roe_gate.py`:

```python
from line_increase.src.amount_rules import (
    incremental_exposure, incremental_roe, _MARKET,
)
from pricing.src.engine import hurdle_clearing_rate


def test_incremental_exposure_draws_at_utilization():
    assert incremental_exposure(50_000, 0.8) == 40_000.0
    assert incremental_exposure(50_000, 1.5) == 50_000.0  # util clipped to 1.0
    assert incremental_exposure(50_000, -0.2) == 0.0       # clipped to 0.0


def test_zero_amount_does_not_clear():
    r = incremental_roe(pd_=0.02, delta_amount=0.0, utilization_onbook=0.8, rate=0.20)
    assert r["incremental_ead"] == 0.0
    assert r["clears_hurdle"] is False
    assert r["incremental_net_income"] == 0.0


def test_high_rate_low_pd_clears_hurdle():
    r = incremental_roe(pd_=0.02, delta_amount=50_000, utilization_onbook=0.8, rate=0.20)
    assert r["incremental_ead"] == 40_000.0
    assert r["clears_hurdle"] is True
    assert r["roe"] >= 0.15


def test_low_rate_does_not_clear():
    r = incremental_roe(pd_=0.05, delta_amount=50_000, utilization_onbook=0.8, rate=0.03)
    assert r["clears_hurdle"] is False


def test_roe_is_ead_invariant():
    # Same pd & rate, different drawdown -> identical ROE ratio (only $ figures scale).
    a = incremental_roe(pd_=0.03, delta_amount=20_000, utilization_onbook=0.5, rate=0.18)
    b = incremental_roe(pd_=0.03, delta_amount=80_000, utilization_onbook=0.9, rate=0.18)
    assert abs(a["roe"] - b["roe"]) < 1e-12
    assert b["incremental_net_income"] > a["incremental_net_income"]
```

- [ ] **Step 7: Run the ROE-gate tests to verify they pass**

Run: `./.venv/bin/pytest line_increase/tests/test_roe_gate.py -q`
Expected: 5 passed (implementation already exists from Step 4).

- [ ] **Step 8: Commit**

```bash
git add line_increase/src/__init__.py line_increase/tests/__init__.py \
        line_increase/src/amount_rules.py \
        line_increase/tests/test_amount_rules.py line_increase/tests/test_roe_gate.py
git commit -m "feat(line-increase): amount rules + incremental-ROE gate (pure, tested)"
```

---

## Task 3: Feature engineering

**Files:**
- Create: `line_increase/src/feature_engineering.py`

- [ ] **Step 1: Implement `feature_engineering.py`**

Create `line_increase/src/feature_engineering.py`:

```python
"""Feature engineering for Proactive Line Increase.

On-book behavioral/capacity features from portfolio.parquet + firmographic/financial
fields + the *modeled* PD reused from Module 0 (never pd_default_origination). Categorical
features use pandas 'category' dtype for LightGBM. Guaranteed leakage-free against the
shared LEAKAGE_COLUMNS (which includes the target line_increase_good)."""
import numpy as np
import pandas as pd

from shared.config import LEAKAGE_COLUMNS
from score.src.predict import predict_score_pd

LI_CATEGORICAL = ["industry", "entity_type", "loan_purpose"]

LI_FEATURE_COLUMNS = [
    # on-book behavioral / capacity
    "utilization_onbook", "util_headroom", "credit_limit", "current_balance", "tenure_months",
    # firmographic / capacity
    "years_in_business", "employees", "annual_revenue", "log_revenue",
    # financial ratios
    "dscr", "leverage", "current_ratio",
    # bureau-like
    "credit_history_months", "prior_delinquencies", "trade_lines", "public_records",
    # reused modeled signal from Module 0
    "pd_score",
    # categorical (kept last)
    "industry", "entity_type", "loan_purpose",
]


def compute_line_increase_features(df: pd.DataFrame) -> pd.DataFrame:
    """df = portfolio.parquet rows. Returns a frame carrying LI_FEATURE_COLUMNS plus
    business_id / score_band / pd_score for the service & segments (non-feature)."""
    out = df.copy()
    out["util_headroom"] = (1.0 - out["utilization_onbook"]).clip(lower=0.0).round(4)
    out["log_revenue"] = np.log(np.maximum(out["annual_revenue"], 1.0)).round(4)

    sp = predict_score_pd(df)
    out["pd_score"] = sp["pd"].to_numpy()
    out["business_score"] = sp["business_score"].to_numpy()
    out["score_band"] = sp["score_band"].to_numpy()  # for segments/UI, not a model feature

    for c in LI_FEATURE_COLUMNS:
        if c in LI_CATEGORICAL:
            out[c] = out[c].astype("category")
        else:
            out[c] = pd.to_numeric(out[c], errors="coerce").fillna(0.0)

    leaked = [c for c in LI_FEATURE_COLUMNS if c in LEAKAGE_COLUMNS]
    if leaked:
        raise ValueError(f"Leakage columns in feature set: {leaked}")
    return out
```

- [ ] **Step 2: Verify features build and are leakage-free**

Run:
```bash
./.venv/bin/python -c "
import pandas as pd
from shared.config import RAW
from line_increase.src.feature_engineering import compute_line_increase_features, LI_FEATURE_COLUMNS
port = pd.read_parquet(RAW / 'portfolio.parquet')
feats = compute_line_increase_features(port)
X = feats[LI_FEATURE_COLUMNS]
print('rows', len(X), 'cols', len(LI_FEATURE_COLUMNS))
print('pd_score range', round(float(X.pd_score.min()),4), round(float(X.pd_score.max()),4))
print('util_headroom mean', round(float(X.util_headroom.mean()),4))
"
```
Expected: prints row count (~8,336), 20 cols, a plausible `pd_score` range in [0,1], and a non-trivial mean headroom. No exception.

- [ ] **Step 3: Commit**

```bash
git add line_increase/src/feature_engineering.py
git commit -m "feat(line-increase): leakage-safe candidate features + modeled PD"
```

---

## Task 4: Train the candidate model + gate + report

**Files:**
- Create: `line_increase/src/train.py`
- Create: `line_increase/tests/test_model_gate.py`
- Writes (gitignored): `line_increase/models/line_increase_model.pkl`, `line_increase/models/metadata.json`, `line_increase/docs/validation_report.md`

- [ ] **Step 1: Ensure model artifacts are gitignored**

Run: `grep -nE "line_increase/models|\\*\\.pkl" .gitignore || echo MISSING`

If MISSING (no matching rule), append:
```bash
printf "\nline_increase/models/*.pkl\n" >> .gitignore
```
(If a broad `*.pkl` rule already exists, skip — nothing to do.)

- [ ] **Step 2: Implement `train.py`**

Create `line_increase/src/train.py`:

```python
"""Train the Proactive Line-Increase LightGBM candidate model (target line_increase_good),
calibrate the offer threshold, build the offered cohort with the amount rules + incremental
ROE, persist artifacts + validation report, and enforce the gate:
  AUC >= 0.78, top-20% lift >= 2.0, offered cohort lower mean PD + higher mean utilization
  than the book, and exposure-weighted incremental ROE >= the hurdle."""
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

from shared.config import RAW, SEED, LEAKAGE_COLUMNS, LINE_INCREASE, MARKET
from line_increase.src.feature_engineering import (
    LI_FEATURE_COLUMNS, LI_CATEGORICAL, compute_line_increase_features,
)
from line_increase.src.amount_rules import recommended_amount, incremental_roe
from pricing.src.engine import MarketAssumptions
from adjudication.src.reason_codes import top_adverse_shap

MODELS = Path("line_increase/models")
DOCS = Path("line_increase/docs")
TARGET = "line_increase_good"

AUC_GATE = 0.78
LIFT_GATE = 2.0
_MARKET = MarketAssumptions.from_market(MARKET)


def top_ventile_lift(y_true, prob):
    y = np.asarray(y_true); p = np.asarray(prob)
    cut = np.quantile(p, 0.80)
    base = y.mean()
    return float(y[p >= cut].mean() / base) if base > 0 else 0.0


def main():
    MODELS.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)

    port = pd.read_parquet(RAW / "portfolio.parquet")
    feats = compute_line_increase_features(port)
    X = feats[LI_FEATURE_COLUMNS]
    y = port[TARGET].to_numpy()
    assert set(LI_FEATURE_COLUMNS).isdisjoint(set(LEAKAGE_COLUMNS)), "leakage in features"

    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.2, random_state=SEED, stratify=y)
    model = LGBMClassifier(n_estimators=400, learning_rate=0.03, num_leaves=31,
                           subsample=0.8, colsample_bytree=0.8, random_state=SEED,
                           n_jobs=-1, verbose=-1)
    model.fit(X_tr, y_tr, categorical_feature=LI_CATEGORICAL)

    prob_te = model.predict_proba(X_te)[:, 1]
    auc = float(roc_auc_score(y_te, prob_te))
    lift = top_ventile_lift(y_te, prob_te)

    # offer threshold calibrated to the population prob quantile
    prob_full = model.predict_proba(X)[:, 1]
    threshold = float(round(np.quantile(prob_full, LINE_INCREASE["offer_quantile"]), 4))

    # build the offered cohort (prob >= threshold AND amount > 0 AND incremental ROE clears)
    bal = port["current_balance"].to_numpy(dtype=float)
    lim = port["credit_limit"].to_numpy(dtype=float)
    rev = port["annual_revenue"].to_numpy(dtype=float)
    util = port["utilization_onbook"].to_numpy(dtype=float)
    rate = port["risk_based_rate"].to_numpy(dtype=float)
    pd_score = feats["pd_score"].to_numpy(dtype=float)

    offered = np.zeros(len(port), dtype=bool)
    sum_net_income = 0.0
    sum_equity = 0.0
    for i in range(len(port)):
        if prob_full[i] < threshold:
            continue
        amt = recommended_amount(bal[i], lim[i], rev[i])
        if amt <= 0:
            continue
        r = incremental_roe(pd_score[i], amt, util[i], rate[i], _MARKET)
        if r["clears_hurdle"]:
            offered[i] = True
            sum_net_income += r["incremental_net_income"]
            sum_equity += MARKET["capital_ratio"] * r["incremental_ead"]

    book_pd = float(pd_score.mean())
    book_util = float(util.mean())
    cohort_pd = float(pd_score[offered].mean()) if offered.any() else float("nan")
    cohort_util = float(util[offered].mean()) if offered.any() else float("nan")
    agg_incr_roe = float(sum_net_income / sum_equity) if sum_equity > 0 else 0.0
    n_offered = int(offered.sum())

    # SHAP sanity (small background sample for speed)
    explainer = shap.TreeExplainer(model)
    sv = explainer.shap_values(X_te.iloc[:50])
    sv = sv[1] if isinstance(sv, list) else sv
    _ = top_adverse_shap(sv, LI_FEATURE_COLUMNS, k=3)

    joblib.dump(model, MODELS / "line_increase_model.pkl")
    metadata = {
        "LI_FEATURE_COLUMNS": LI_FEATURE_COLUMNS, "categorical": LI_CATEGORICAL,
        "train_rows": int(len(X_tr)), "test_rows": int(len(X_te)),
        "metrics": {"auc": round(auc, 4), "top20_lift": round(lift, 4)},
        "gate": {"auc_min": AUC_GATE, "lift_min": LIFT_GATE},
        "offer_threshold": threshold,
        "base_rate": round(float(y.mean()), 4),
        "cohort": {
            "n_offered": n_offered,
            "book_pd": round(book_pd, 4), "cohort_pd": round(cohort_pd, 4),
            "book_util": round(book_util, 4), "cohort_util": round(cohort_util, 4),
            "agg_incremental_roe": round(agg_incr_roe, 4),
            "roe_hurdle": MARKET["roe_hurdle"],
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    (MODELS / "metadata.json").write_text(json.dumps(metadata, indent=2))

    report = (
        "# Proactive Line Increase — Validation Report\n\n"
        f"- Train {len(X_tr):,} / Test {len(X_te):,}  | base rate {y.mean():.1%}\n"
        f"- **AUC:** {auc:.4f}  (gate >= {AUC_GATE})\n"
        f"- **Top-20% lift:** {lift:.2f}x  (gate >= {LIFT_GATE})\n"
        f"- Offer threshold (prob quantile {LINE_INCREASE['offer_quantile']}): {threshold}\n\n"
        "## Offered cohort vs book\n\n"
        f"- Offered accounts: {n_offered:,}\n"
        f"- Mean modeled PD: cohort {cohort_pd:.4f} vs book {book_pd:.4f}  (gate cohort < book)\n"
        f"- Mean utilization: cohort {cohort_util:.4f} vs book {book_util:.4f}  (gate cohort > book)\n"
        f"- Exposure-weighted incremental ROE: {agg_incr_roe:.4f}  "
        f"(gate >= {MARKET['roe_hurdle']})\n\n"
        "> Incremental ROE is EAD-invariant (depends only on PD & the rate charged on the "
        "incremental balance); the drawdown assumption (Δlimit × utilization) scales the "
        "reported incremental exposure and net income, not the ROE ratio.\n"
    )
    (DOCS / "validation_report.md").write_text(report)

    print(f"AUC={auc:.4f} lift={lift:.2f}x thr={threshold} offered={n_offered} "
          f"cohort_pd={cohort_pd:.4f}<book_pd={book_pd:.4f} "
          f"cohort_util={cohort_util:.4f}>book_util={book_util:.4f} "
          f"agg_incr_roe={agg_incr_roe:.4f}")

    assert auc >= AUC_GATE, f"GATE FAIL: AUC {auc:.4f} < {AUC_GATE}"
    assert lift >= LIFT_GATE, f"GATE FAIL: lift {lift:.2f} < {LIFT_GATE}"
    assert n_offered > 0, "GATE FAIL: no accounts offered"
    assert cohort_pd < book_pd, f"GATE FAIL: cohort PD {cohort_pd:.4f} !< book {book_pd:.4f}"
    assert cohort_util > book_util, f"GATE FAIL: cohort util {cohort_util:.4f} !> book {book_util:.4f}"
    assert agg_incr_roe >= MARKET["roe_hurdle"], (
        f"GATE FAIL: agg incremental ROE {agg_incr_roe:.4f} < {MARKET['roe_hurdle']}")
    print("GATE PASS")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Train the model and confirm the gate passes**

Run: `./.venv/bin/python -m line_increase.src.train`
Expected: a line ending with metrics, then `GATE PASS`. AUC should be comfortably ≥ 0.78 (strong DGP signal), `cohort_pd < book_pd`, `cohort_util > book_util`, `agg_incr_roe ≥ 0.15`.

> **If any cohort/agg assertion fails** (e.g. the offered cohort doesn't beat the book, or aggregate ROE falls short): this is a genuine BLOCK — do not weaken the gate silently. Report the printed numbers and stop for a controller/user decision (mirrors the Module 3 T4 escalation). The most likely lever is `offer_quantile` / `target_util` in `LINE_INCREASE`, but changing them is a design decision, not an implementer call.

- [ ] **Step 4: Write the model-gate test**

Create `line_increase/tests/test_model_gate.py`:

```python
import json
from pathlib import Path

import pytest

META = Path("line_increase/models/metadata.json")


@pytest.fixture(scope="module")
def meta():
    if not META.exists():
        pytest.skip("model not trained yet; run python -m line_increase.src.train")
    return json.loads(META.read_text())


def test_auc_and_lift_meet_gate(meta):
    assert meta["metrics"]["auc"] >= meta["gate"]["auc_min"]
    assert meta["metrics"]["top20_lift"] >= meta["gate"]["lift_min"]


def test_cohort_is_lower_risk_higher_util(meta):
    c = meta["cohort"]
    assert c["n_offered"] > 0
    assert c["cohort_pd"] < c["book_pd"]
    assert c["cohort_util"] > c["book_util"]


def test_aggregate_incremental_roe_positive(meta):
    c = meta["cohort"]
    assert c["agg_incremental_roe"] >= c["roe_hurdle"]
```

- [ ] **Step 5: Run the model-gate test**

Run: `./.venv/bin/pytest line_increase/tests/test_model_gate.py -q`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add line_increase/src/train.py line_increase/tests/test_model_gate.py \
        line_increase/docs/validation_report.md .gitignore
git commit -m "feat(line-increase): candidate model + cohort/ROE gate + validation report"
```

---

## Task 5: Scored population + candidates + segments

**Files:**
- Create: `line_increase/src/candidates.py`

- [ ] **Step 1: Implement `candidates.py`**

Create `line_increase/src/candidates.py`:

```python
"""Scored line-increase population: candidate probability + recommended amount +
incremental-ROE result + positive SHAP reason codes per account, plus the ranked
candidates list and segment rollups. Reuses the trained model, features, amount rules,
pricing engine, and the shared top-positive SHAP helper."""
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap

from shared.config import RAW, MARKET
from line_increase.src.feature_engineering import (
    LI_FEATURE_COLUMNS, compute_line_increase_features,
)
from line_increase.src.amount_rules import recommended_amount, incremental_roe
from pricing.src.engine import MarketAssumptions
from adjudication.src.reason_codes import top_adverse_shap

MODELS = Path("line_increase/models")
_MARKET = MarketAssumptions.from_market(MARKET)


def _load():
    model = joblib.load(MODELS / "line_increase_model.pkl")
    meta = json.loads((MODELS / "metadata.json").read_text())
    return model, meta


def score_population() -> pd.DataFrame:
    model, meta = _load()
    threshold = meta["offer_threshold"]
    max_pd = meta["offer_max_pd"]  # risk-appetite ceiling (book-median modeled PD)
    port = pd.read_parquet(RAW / "portfolio.parquet")
    feats = compute_line_increase_features(port)
    X = feats[LI_FEATURE_COLUMNS]
    prob = model.predict_proba(X)[:, 1]

    explainer = shap.TreeExplainer(model)
    sv = explainer.shap_values(X)
    sv = sv[1] if isinstance(sv, list) else sv
    reasons = top_adverse_shap(sv, LI_FEATURE_COLUMNS, k=3)

    recs = []
    for i in range(len(port)):
        pd_i = float(feats["pd_score"].iloc[i])
        rate_i = float(port["risk_based_rate"].iloc[i])
        amt = recommended_amount(float(port["current_balance"].iloc[i]),
                                 float(port["credit_limit"].iloc[i]),
                                 float(port["annual_revenue"].iloc[i]))
        r = incremental_roe(pd_i, amt, float(port["utilization_onbook"].iloc[i]),
                            rate_i, _MARKET)
        eligible = bool(prob[i] >= threshold and pd_i <= max_pd
                        and amt > 0 and r["clears_hurdle"])
        recs.append({
            "business_id": str(port["business_id"].iloc[i]),
            "industry": str(port["industry"].iloc[i]),
            "score_band": str(feats["score_band"].iloc[i]),
            "pd": round(pd_i, 4),
            "rate": rate_i,
            "prob": round(float(prob[i]), 4),
            "credit_limit": float(port["credit_limit"].iloc[i]),
            "current_balance": float(port["current_balance"].iloc[i]),
            "utilization_onbook": float(port["utilization_onbook"].iloc[i]),
            "recommended_amount": amt,
            "incremental_ead": round(r["incremental_ead"], 2),
            "incremental_roe": round(r["roe"], 4),
            "incremental_net_income": round(r["incremental_net_income"], 2),
            "clears_hurdle": r["clears_hurdle"],
            "eligible": eligible,
            "top_shap_reasons": reasons[i],
        })
    out = pd.DataFrame(recs)
    out.index = out["business_id"]
    return out


def candidates(df: pd.DataFrame, top_n: int | None = None) -> list[dict]:
    ranked = df[df["eligible"]].sort_values("prob", ascending=False)
    if top_n is not None:
        ranked = ranked.head(top_n)
    return [{"business_id": r["business_id"], "industry": r["industry"],
             "score_band": r["score_band"], "prob": float(r["prob"]),
             "recommended_amount": float(r["recommended_amount"]),
             "incremental_ead": float(r["incremental_ead"]),
             "incremental_roe": float(r["incremental_roe"]),
             "clears_hurdle": bool(r["clears_hurdle"])}
            for _, r in ranked.iterrows()]


def segments(df: pd.DataFrame) -> dict:
    def seg(col):
        rows = []
        for key, g in df.groupby(col):
            rows.append({
                "key": str(key),
                "offer_rate": round(float(g["eligible"].mean()), 4),
                "expected_incremental_exposure": round(
                    float(g.loc[g["eligible"], "incremental_ead"].sum()), 2),
                "count": int(len(g)),
            })
        return sorted(rows, key=lambda r: r["key"])
    return {"by_band": seg("score_band"), "by_industry": seg("industry")}
```

- [ ] **Step 2: Smoke-test the scored population**

Run:
```bash
./.venv/bin/python -c "
from line_increase.src.candidates import score_population, candidates, segments
df = score_population()
print('scored', len(df), 'eligible', int(df.eligible.sum()))
top = candidates(df, top_n=5)
print('top candidate', top[0] if top else 'NONE')
seg = segments(df)
print('bands', [(r['key'], r['offer_rate']) for r in seg['by_band']])
"
```
Expected: prints a scored count (~8,336), a positive eligible count matching the trainer's `n_offered`, a top candidate dict with `recommended_amount > 0` and `incremental_roe >= 0.15`, and per-band offer rates.

- [ ] **Step 3: Commit**

```bash
git add line_increase/src/candidates.py
git commit -m "feat(line-increase): scored population + ranked candidates + segments"
```

---

## Task 6: Portal backend — schemas, service, routes

**Files:**
- Modify: `portal/server/schemas.py` (append Module 4 models)
- Create: `portal/server/line_increase_service.py`
- Modify: `portal/server/main.py` (import, lifespan cache, 4 routes)

- [ ] **Step 1: Append Module 4 schemas**

Add to the end of `portal/server/schemas.py` (reuses the existing `ReasonItem` and `WaterfallLine`):

```python


# --- Proactive Line Increase (Module 4) ---
class IncrementalRoe(BaseModel):
    incremental_ead: float
    incremental_net_income: float
    roe: float
    clears_hurdle: bool
    hurdle_clearing_rate: float


class LineIncreaseDetail(BaseModel):
    business_id: str
    industry: str
    score_band: str
    pd: float
    prob: float
    eligible: bool
    credit_limit: float
    current_balance: float
    utilization_onbook: float
    recommended_amount: float
    post_increase_utilization: float
    rate: float
    incremental: IncrementalRoe
    waterfall: WaterfallLine
    top_shap_reasons: list[ReasonItem]


class LineIncreaseCandidate(BaseModel):
    business_id: str
    industry: str
    score_band: str
    prob: float
    recommended_amount: float
    incremental_ead: float
    incremental_roe: float
    clears_hurdle: bool


class PaginatedCandidates(BaseModel):
    items: list[LineIncreaseCandidate]
    page: int
    pages: int
    total: int


class SimulateRequest(BaseModel):
    business_id: str
    proposed_amount: float | None = None
    target_util: float | None = None


class SimulateResponse(BaseModel):
    business_id: str
    proposed_amount: float
    incremental: IncrementalRoe
    waterfall: WaterfallLine


class LineIncreaseSegmentRow(BaseModel):
    key: str
    offer_rate: float
    expected_incremental_exposure: float
    count: int


class LineIncreaseSegments(BaseModel):
    by_band: list[LineIncreaseSegmentRow]
    by_industry: list[LineIncreaseSegmentRow]
```

- [ ] **Step 2: Implement `line_increase_service.py`**

Create `portal/server/line_increase_service.py`:

```python
"""Glue for the line-increase portal routes: cached scored population, per-account detail
(with post-increase utilization + incremental-ROE waterfall), candidate list, segments, and
a what-if simulate. Reuses line_increase.src + the pricing engine; no logic redefined."""
from __future__ import annotations

import pandas as pd

from shared.config import MARKET, LINE_INCREASE
from line_increase.src.candidates import score_population, candidates as _candidates, segments as _segments
from line_increase.src.amount_rules import recommended_amount, incremental_roe
from pricing.src.engine import MarketAssumptions

_MARKET = MarketAssumptions.from_market(MARKET)


def load_population() -> pd.DataFrame:
    return score_population()


def candidates(df: pd.DataFrame, top_n: int | None = None) -> list[dict]:
    return _candidates(df, top_n=top_n)


def segments(df: pd.DataFrame) -> dict:
    return _segments(df)


def _post_increase_util(current_balance: float, credit_limit: float, amount: float) -> float:
    new_limit = credit_limit + amount
    return round(current_balance / new_limit, 4) if new_limit > 0 else 0.0


def detail_record(business_id: str, df: pd.DataFrame) -> dict | None:
    if business_id not in df.index:
        return None
    row = df.loc[business_id]
    incr = incremental_roe(float(row["pd"]), float(row["recommended_amount"]),
                           float(row["utilization_onbook"]), float(row["rate"]), _MARKET)
    return {
        "business_id": str(row["business_id"]),
        "industry": str(row["industry"]),
        "score_band": str(row["score_band"]),
        "pd": float(row["pd"]),
        "prob": float(row["prob"]),
        "eligible": bool(row["eligible"]),
        "credit_limit": float(row["credit_limit"]),
        "current_balance": float(row["current_balance"]),
        "utilization_onbook": float(row["utilization_onbook"]),
        "recommended_amount": float(row["recommended_amount"]),
        "post_increase_utilization": _post_increase_util(
            float(row["current_balance"]), float(row["credit_limit"]),
            float(row["recommended_amount"])),
        "rate": float(row["rate"]),
        "incremental": {k: incr[k] for k in
                        ("incremental_ead", "incremental_net_income", "roe",
                         "clears_hurdle", "hurdle_clearing_rate")},
        "waterfall": incr["waterfall"],
        "top_shap_reasons": [{"feature": r["feature"], "impact": r["impact"]}
                             for r in row["top_shap_reasons"]],
    }


def simulate(payload: dict, df: pd.DataFrame) -> dict | None:
    business_id = payload["business_id"]
    if business_id not in df.index:
        return None
    row = df.loc[business_id]
    if payload.get("proposed_amount") is not None:
        amount = float(payload["proposed_amount"])
    elif payload.get("target_util") is not None:
        amount = recommended_amount(
            float(row["current_balance"]), float(row["credit_limit"]),
            float(row["annual_revenue"]) if "annual_revenue" in row else 1e18,
            {**LINE_INCREASE, "target_util": float(payload["target_util"])})
    else:
        amount = float(row["recommended_amount"])
    incr = incremental_roe(float(row["pd"]), amount,
                           float(row["utilization_onbook"]), float(row["rate"]), _MARKET)
    return {
        "business_id": str(business_id),
        "proposed_amount": amount,
        "incremental": {k: incr[k] for k in
                        ("incremental_ead", "incremental_net_income", "roe",
                         "clears_hurdle", "hurdle_clearing_rate")},
        "waterfall": incr["waterfall"],
    }
```

> Note: `score_population()` does not carry `annual_revenue` in the scored frame, so the
> `target_util` branch of `simulate` falls back to an effectively-unbounded revenue ceiling
> (1e18) — acceptable for a what-if. The default and `proposed_amount` branches are exact.

- [ ] **Step 3: Wire the service into `main.py`**

In `portal/server/main.py`, add the import alongside the others (after `from portal.server import ews_service`):

```python
from portal.server import line_increase_service
```

Extend the schema import block to include the Module 4 models:

```python
from portal.server.schemas import (
    AdjudicationDetail, DecideRequest, HealthResponse,
    PaginatedApplications, SegmentsResponse,
    PricingDetail, QuoteRequest, QuoteResponse, PricingPortfolio,
    EwsDetail, WatchlistItem, EwsSegments,
    LineIncreaseDetail, PaginatedCandidates, SimulateRequest, SimulateResponse,
    LineIncreaseSegments,
)
```

In `lifespan`, add before `yield`:

```python
    app.state.li_pop = line_increase_service.load_population()
```

Add the four routes after the EWS routes (specific paths BEFORE the `/{business_id}` catch-all):

```python
@app.get("/api/line-increase/candidates", response_model=PaginatedCandidates)
def line_increase_candidates(page: int = Query(1, ge=1),
                             per_page: int = Query(50, ge=1, le=500)):
    items_all = line_increase_service.candidates(app.state.li_pop)
    total = len(items_all)
    pages = max(1, (total + per_page - 1) // per_page)
    start = (page - 1) * per_page
    return {"items": items_all[start:start + per_page],
            "page": page, "pages": pages, "total": total}


@app.get("/api/line-increase/segments", response_model=LineIncreaseSegments)
def line_increase_segments():
    return line_increase_service.segments(app.state.li_pop)


@app.post("/api/line-increase/simulate", response_model=SimulateResponse)
def line_increase_simulate(req: SimulateRequest):
    rec = line_increase_service.simulate(req.model_dump(), app.state.li_pop)
    if rec is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": req.business_id})
    return rec


@app.get("/api/line-increase/{business_id}", response_model=LineIncreaseDetail)
def line_increase_detail(business_id: str):
    rec = line_increase_service.detail_record(business_id, app.state.li_pop)
    if rec is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": business_id})
    return rec
```

- [ ] **Step 4: Verify the app boots and serves the routes**

Run:
```bash
./.venv/bin/python -c "
from fastapi.testclient import TestClient
from portal.server.main import app
with TestClient(app) as c:
    cand = c.get('/api/line-increase/candidates', params={'per_page': 3}).json()
    print('candidates total', cand['total'], 'first', cand['items'][0] if cand['items'] else 'NONE')
    bid = cand['items'][0]['business_id']
    d = c.get(f'/api/line-increase/{bid}').json()
    print('detail keys ok', {'recommended_amount','incremental','waterfall'} <= set(d))
    sim = c.post('/api/line-increase/simulate', json={'business_id': bid, 'proposed_amount': 20000}).json()
    print('simulate roe', sim['incremental']['roe'], 'clears', sim['incremental']['clears_hurdle'])
    seg = c.get('/api/line-increase/segments').json()
    print('bands', [r['key'] for r in seg['by_band']])
    print('404', c.get('/api/line-increase/NOPE').status_code)
"
```
Expected: positive candidates total, a detail dict with the three keys, a simulate ROE value, band keys, and `404`.

- [ ] **Step 5: Commit**

```bash
git add portal/server/schemas.py portal/server/line_increase_service.py portal/server/main.py
git commit -m "feat(line-increase): portal schemas, service, and 4 API routes"
```

---

## Task 7: Backend API tests

**Files:**
- Create: `portal/server/tests/test_line_increase_api.py`

- [ ] **Step 1: Write the API tests**

Create `portal/server/tests/test_line_increase_api.py`:

```python
import pytest
from fastapi.testclient import TestClient

from portal.server.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _a_candidate_id(client):
    items = client.get("/api/line-increase/candidates", params={"per_page": 5}).json()["items"]
    assert items, "expected at least one eligible candidate"
    return items[0]["business_id"]


def test_candidates_shape_and_pagination(client):
    body = client.get("/api/line-increase/candidates", params={"per_page": 10}).json()
    assert set(body) >= {"items", "page", "pages", "total"}
    assert body["total"] > 0
    assert len(body["items"]) <= 10
    row = body["items"][0]
    assert set(row) >= {"business_id", "prob", "recommended_amount", "incremental_roe",
                        "clears_hurdle"}
    assert row["recommended_amount"] > 0
    assert row["clears_hurdle"] is True  # candidates list is eligible-only


def test_detail_known_and_unknown(client):
    bid = _a_candidate_id(client)
    body = client.get(f"/api/line-increase/{bid}").json()
    assert set(body) >= {"recommended_amount", "post_increase_utilization", "incremental",
                         "waterfall", "top_shap_reasons", "eligible"}
    assert body["incremental"]["clears_hurdle"] is True
    assert body["post_increase_utilization"] <= body["utilization_onbook"] + 1e-9
    assert client.get("/api/line-increase/NOPE-NONE").status_code == 404


def test_simulate_amount_changes_exposure(client):
    bid = _a_candidate_id(client)
    small = client.post("/api/line-increase/simulate",
                        json={"business_id": bid, "proposed_amount": 5000}).json()
    big = client.post("/api/line-increase/simulate",
                      json={"business_id": bid, "proposed_amount": 50000}).json()
    # ROE is EAD-invariant; exposure scales with the proposed amount.
    assert big["incremental"]["incremental_ead"] > small["incremental"]["incremental_ead"]
    assert abs(big["incremental"]["roe"] - small["incremental"]["roe"]) < 1e-9
    assert client.post("/api/line-increase/simulate",
                       json={"business_id": "NOPE"}).status_code == 404


def test_segments_shape(client):
    body = client.get("/api/line-increase/segments").json()
    assert set(body) >= {"by_band", "by_industry"}
    row = body["by_band"][0]
    assert set(row) >= {"key", "offer_rate", "expected_incremental_exposure", "count"}
    assert 0.0 <= row["offer_rate"] <= 1.0
```

- [ ] **Step 2: Run the API tests**

Run: `./.venv/bin/pytest portal/server/tests/test_line_increase_api.py -q`
Expected: 4 passed.

- [ ] **Step 3: Run the full backend suite (no regressions)**

Run: `./.venv/bin/pytest -q`
Expected: all prior 80 + the new line-increase tests pass (≈ 80 + 12 = 92 passed). Confirm 0 failures.

- [ ] **Step 4: Commit**

```bash
git add portal/server/tests/test_line_increase_api.py
git commit -m "test(line-increase): API tests for candidates/detail/simulate/segments"
```

---

## Task 8: Frontend wiring — api, hooks, nav, App

**Files:**
- Modify: `portal/client/src/lib/api.js`
- Modify: `portal/client/src/lib/hooks.js`
- Modify: `portal/client/src/components/Sidebar.jsx`
- Modify: `portal/client/src/App.jsx`

- [ ] **Step 1: Add API fetchers**

Append to `portal/client/src/lib/api.js`:

```javascript
export async function fetchLineIncrease(id) {
  return (await api.get(`/api/line-increase/${id}`)).data;
}
export async function fetchCandidates(page = 1, perPage = 100) {
  return (await api.get('/api/line-increase/candidates', { params: { page, per_page: perPage } })).data;
}
export async function lineIncreaseSimulate(payload) {
  return (await api.post('/api/line-increase/simulate', payload)).data;
}
export async function fetchLineIncreaseSegments() {
  return (await api.get('/api/line-increase/segments')).data;
}
```

- [ ] **Step 2: Add hooks**

In `portal/client/src/lib/hooks.js`, extend the import on line 2 to include the new fetchers:

```javascript
import { fetchApplication, fetchApplications, decide, fetchSegments, fetchHealth, fetchPricing, fetchPricingPortfolio, pricingQuote, fetchEws, fetchEwsWatchlist, fetchEwsSegments, fetchLineIncrease, fetchCandidates, lineIncreaseSimulate, fetchLineIncreaseSegments } from './api';
```

Append these hooks to the end of the file:

```javascript

export function useLineIncrease() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sim, setSim] = useState(null);
  const lookup = useCallback(async (id) => {
    if (!id) return;
    setLoading(true); setError(null); setSim(null);
    try { setData(await fetchLineIncrease(id)); }
    catch (e) { setData(null); setError(e.response?.data?.detail || { message: 'Request failed' }); }
    finally { setLoading(false); }
  }, []);
  const runSimulate = useCallback(async (payload) => {
    try { setSim(await lineIncreaseSimulate(payload)); } catch { /* noop */ }
  }, []);
  return { data, error, loading, lookup, sim, runSimulate };
}

export function useCandidates() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData((await fetchCandidates(1, 100)).items || []); } finally { setLoading(false); }
  }, []);
  return { data, loading, load };
}

export function useLineIncreaseSegments() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchLineIncreaseSegments()); } finally { setLoading(false); }
  }, []);
  return { data, loading, load };
}
```

- [ ] **Step 3: Add the nav group and remove the disabled stub**

In `portal/client/src/components/Sidebar.jsx`:

Replace the `EWS_ITEMS`/`DISABLED_ITEMS` block (lines 15-24) with:

```javascript
const EWS_ITEMS = [
  { module: 'ews', view: 'lookup',    testid: 'nav-ews-lookup',    label: 'Lookup',    icon: Search },
  { module: 'ews', view: 'watchlist', testid: 'nav-ews-watchlist', label: 'Watchlist', icon: AlertTriangle },
  { module: 'ews', view: 'segments',  testid: 'nav-ews-segments',  label: 'Segments',  icon: PieChart },
];

const LINE_INCREASE_ITEMS = [
  { module: 'line_increase', view: 'lookup',     testid: 'nav-li-lookup',     label: 'Lookup',     icon: Search },
  { module: 'line_increase', view: 'candidates', testid: 'nav-li-candidates', label: 'Candidates', icon: TrendingUp },
  { module: 'line_increase', view: 'segments',   testid: 'nav-li-segments',   label: 'Segments',   icon: PieChart },
];

const DISABLED_ITEMS = [
  { label: 'Score', icon: Star },
];
```

Add the rendered group after the Early Warning group (after line 84, `{EWS_ITEMS.map(NavButton)}`):

```javascript
        <GroupHeader>Line Increase</GroupHeader>
        {LINE_INCREASE_ITEMS.map(NavButton)}
```

Update the footer text (line 99):

```javascript
        Adjudication + Pricing + Early Warning + Line Increase
```

- [ ] **Step 4: Wire the views in `App.jsx`**

In `portal/client/src/App.jsx`, add view imports after the EWS imports (after line 12):

```javascript
import LineIncreaseLookupView from './views/line_increase/LineIncreaseLookupView';
import LineIncreaseCandidatesView from './views/line_increase/LineIncreaseCandidatesView';
import LineIncreaseSegmentsView from './views/line_increase/LineIncreaseSegmentsView';
```

Extend the hooks import (lines 13-17) to add the three new hooks:

```javascript
import {
  useApplication, useDecide, useSegments, useHealth,
  usePricing, usePricingPortfolio, usePricingQuote,
  useEws, useEwsWatchlist, useEwsSegments,
  useLineIncrease, useCandidates, useLineIncreaseSegments,
} from './lib/hooks';
```

Instantiate the hooks after `const ewsSeg = useEwsSegments();` (line 30):

```javascript
  const lineIncrease = useLineIncrease();
  const candidatesHook = useCandidates();
  const liSeg = useLineIncreaseSegments();
```

Add the view wiring after the EWS lines (after line 48):

```javascript
        {is('line_increase', 'lookup') && <LineIncreaseLookupView hook={lineIncrease} />}
        {is('line_increase', 'candidates') && <LineIncreaseCandidatesView hook={candidatesHook} />}
        {is('line_increase', 'segments') && <LineIncreaseSegmentsView hook={liSeg} />}
```

- [ ] **Step 5: Commit (views still missing — build runs in Task 9)**

```bash
git add portal/client/src/lib/api.js portal/client/src/lib/hooks.js \
        portal/client/src/components/Sidebar.jsx portal/client/src/App.jsx
git commit -m "feat(line-increase): portal api/hooks/nav wiring (4th active module)"
```

---

## Task 9: Frontend views

**Files:**
- Create: `portal/client/src/views/line_increase/LineIncreaseLookupView.jsx`
- Create: `portal/client/src/views/line_increase/LineIncreaseCandidatesView.jsx`
- Create: `portal/client/src/views/line_increase/LineIncreaseSegmentsView.jsx`

Reuses existing components: `Card`, `StatCard`, `ApplicantSelect`, `LoadingSpinner`, `ErrorBanner`, `ReasonList`, `Waterfall`, `PassFailBadge`. The `Waterfall` component takes `rows` of `{label, value, kind}` where `kind ∈ {'add','subtract','total'}`.

- [ ] **Step 1: Create the Lookup view (with what-if amount slider)**

Create `portal/client/src/views/line_increase/LineIncreaseLookupView.jsx`:

```javascript
import { useState, useEffect } from 'react';
import Card from '../../components/Card';
import StatCard from '../../components/StatCard';
import ApplicantSelect from '../../components/ApplicantSelect';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorBanner from '../../components/ErrorBanner';
import ReasonList from '../../components/ReasonList';
import Waterfall from '../../components/Waterfall';
import PassFailBadge from '../../components/PassFailBadge';

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const usd = (x) => `$${Math.round(x).toLocaleString()}`;

function waterfallRows(w) {
  return [
    { label: 'Interest income', value: w.interest_income, kind: 'add' },
    { label: 'Cost of funds', value: w.cost_of_funds, kind: 'subtract' },
    { label: 'Expected loss', value: w.expected_loss, kind: 'subtract' },
    { label: 'Operating cost', value: w.operating_cost, kind: 'subtract' },
    { label: 'Tax', value: w.tax, kind: 'subtract' },
    { label: 'Net income', value: w.net_income, kind: 'total' },
  ];
}

export default function LineIncreaseLookupView({ hook }) {
  const { data, error, loading, lookup, sim, runSimulate } = hook;
  const [id, setId] = useState('');
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    if (data) setAmount(data.recommended_amount);
  }, [data]);

  const view = sim || (data ? { incremental: data.incremental, waterfall: data.waterfall,
                                proposed_amount: data.recommended_amount } : null);

  return (
    <div data-testid="view-li-lookup" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Line Increase Lookup</h2>
        <p className="text-sm text-slate-500">
          Enter a business ID to view its eligibility, recommended increase, and incremental ROE.
        </p>
      </div>

      <Card>
        <ApplicantSelect value={id} onChange={setId} onLookup={() => lookup(id)} />
      </Card>

      <ErrorBanner error={error} />
      {loading && <LoadingSpinner />}

      {data && !loading && view && (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <PassFailBadge pass={data.eligible}
              label={data.eligible ? 'OFFER ELIGIBLE' : 'NOT ELIGIBLE'} />
            <span className="text-sm text-slate-500">
              {data.business_id} · {data.industry} · band {data.score_band}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Recommended Increase" value={usd(data.recommended_amount)} />
            <StatCard label="Current Utilization" value={pct(data.utilization_onbook)} />
            <StatCard label="Post-Increase Utilization" value={pct(data.post_increase_utilization)} />
          </div>

          <Card title="What-if: proposed increase amount">
            <input
              type="range" data-testid="li-amount-slider"
              min={0} max={Math.max(data.recommended_amount * 2, 1000)} step={1000}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              onMouseUp={() => runSimulate({ business_id: data.business_id, proposed_amount: amount })}
              onTouchEnd={() => runSimulate({ business_id: data.business_id, proposed_amount: amount })}
              className="w-full"
            />
            <div className="mt-2 text-sm text-slate-600">Proposed: {usd(amount)}</div>
          </Card>

          <div className="flex flex-wrap items-center gap-4">
            <PassFailBadge pass={view.incremental.clears_hurdle} />
            <span className="text-sm text-slate-500">
              Incremental ROE {pct(view.incremental.roe)} on {usd(view.incremental.incremental_ead)} exposure
            </span>
          </div>

          <Card title="Incremental profit waterfall">
            <Waterfall rows={waterfallRows(view.waterfall)} />
          </Card>

          <Card title="Why this candidate">
            <ReasonList ruleHits={[]} shapReasons={data.top_shap_reasons} />
          </Card>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the Candidates view**

Create `portal/client/src/views/line_increase/LineIncreaseCandidatesView.jsx`:

```javascript
import { useEffect } from 'react';
import Card from '../../components/Card';
import LoadingSpinner from '../../components/LoadingSpinner';

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const usd = (x) => `$${Math.round(x).toLocaleString()}`;

export default function LineIncreaseCandidatesView({ hook }) {
  const { data, loading, load } = hook;
  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="view-li-candidates" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Line Increase Candidates</h2>
        <p className="text-sm text-slate-500">
          Eligible accounts ranked by candidate probability; each offer clears the incremental-ROE hurdle.
        </p>
      </div>

      {loading && <LoadingSpinner />}

      {data && (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2">Business</th><th>Band</th><th className="text-right">Prob</th>
                <th className="text-right">Increase</th><th className="text-right">Incr. Exposure</th>
                <th className="text-right">Incr. ROE</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.business_id} data-testid="app-row" className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-700">{r.business_id}</td>
                  <td className="text-slate-500">{r.score_band}</td>
                  <td className="text-right tabular-nums">{pct(r.prob)}</td>
                  <td className="text-right tabular-nums">{usd(r.recommended_amount)}</td>
                  <td className="text-right tabular-nums">{usd(r.incremental_ead)}</td>
                  <td className="text-right tabular-nums text-emerald-700">{pct(r.incremental_roe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the Segments view**

Create `portal/client/src/views/line_increase/LineIncreaseSegmentsView.jsx`:

```javascript
import { useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Card from '../../components/Card';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function LineIncreaseSegmentsView({ hook }) {
  const { data, loading, load } = hook;
  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="view-li-segments" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Line Increase Segments</h2>
        <p className="text-sm text-slate-500">
          Offer rate and expected incremental exposure by score band.
        </p>
      </div>

      {loading && <LoadingSpinner />}

      {data && (
        <Card title="Offer rate by score band">
          <div data-testid="li-segments-chart" style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={data.by_band}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="key" />
                <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
                <Bar dataKey="offer_rate" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Build the client (catches missing imports / JSX errors)**

Run: `cd portal/client && npm run build`
Expected: `vite build` completes with no errors. (Run from the repo root as `cd portal/client && npm run build` in one command to avoid changing the persistent cwd.)

- [ ] **Step 5: Commit**

```bash
git add portal/client/src/views/line_increase/
git commit -m "feat(line-increase): Lookup / Candidates / Segments views"
```

---

## Task 10: Playwright gate + full suite

**Files:**
- Create: `portal/client/e2e/line_increase.spec.js`

- [ ] **Step 1: Write the Playwright spec**

Create `portal/client/e2e/line_increase.spec.js`:

```javascript
import { test, expect } from '@playwright/test';

test('line-increase lookup shows eligibility + incremental ROE', async ({ page }) => {
  const r = await page.request.get('http://localhost:8100/api/line-increase/candidates?per_page=1');
  const id = (await r.json()).items[0].business_id;
  await page.goto('/');
  await page.getByTestId('nav-li-lookup').click();
  await page.getByTestId('applicant-input').fill(id);
  await page.getByTestId('applicant-lookup').click();
  await expect(page.getByTestId('roe-badge').first()).toBeVisible();
  await expect(page.getByTestId('pricing-waterfall')).toBeVisible();
});

test('line-increase candidates renders ranked rows', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-li-candidates').click();
  await expect(page.getByTestId('view-li-candidates')).toBeVisible();
  await expect(page.getByTestId('app-row').first()).toBeVisible();
});

test('line-increase segments renders a chart', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-li-segments').click();
  await expect(page.getByTestId('li-segments-chart').first()).toBeVisible();
});
```

- [ ] **Step 2: Start the backend and frontend, then run the full e2e suite**

Start the API and the Vite dev server (background), then run Playwright:

```bash
# from repo root
./.venv/bin/uvicorn portal.server.main:app --port 8100 &
UVICORN_PID=$!
(cd portal/client && npm run dev &) ; sleep 4
(cd portal/client && npx playwright test)
kill $UVICORN_PID
```
Expected: **12 passed** (3 adjudication + 3 pricing + 3 ews + 3 line-increase). The 9 prior tests passing proves the 4th-module nav refactor didn't regress shipped modules.

> If `npx playwright test` reports the dev server/port already in use, reuse the running
> instances instead of starting new ones. The goal is a clean 12/12 against a live portal.

- [ ] **Step 3: Capture one screenshot per new view as evidence (optional but preferred)**

Use the Playwright MCP `browser_navigate` + `browser_take_screenshot` against `http://localhost:5180` for the three line-increase views, or rely on Playwright's trace. Save under `portal/client/e2e/` artifacts if generated.

- [ ] **Step 4: Final full backend suite re-run**

Run: `./.venv/bin/pytest -q`
Expected: ≈ 92 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add portal/client/e2e/line_increase.spec.js
git commit -m "test(line-increase): Playwright smoke gate (full suite 12/12)"
```

---

## Completion (controller, after all tasks APPROVED)

Not subagent tasks — the controller does these before stopping for user review:

- [ ] Update `program_state.json`: set `line_increase` phase + all its tasks to done/completed with metrics (AUC, top20_lift, n_offered, cohort_pd/util, agg_incremental_roe, backend_tests_total, playwright_tests_total, vite_build), add `line_increase` to `completed_phases`, set `session_status` + `next_action` to point at `portal_integration` (the final phase), and update `updated_at`.
- [ ] Append a `SESSION_LOG.md` Session 6 entry (built summary, gate results, per-task subagent token tally, program cumulative).
- [ ] Update the auto-memory `business-banking-app-build.md` pointer if the resume instructions changed.
- [ ] STOP for user review before the `--no-ff` merge of `build/line-increase` into `main` (do not merge unprompted).

---

## Self-Review (completed by plan author)

**Spec coverage:** model (T4) ✓, amount rules (T2) ✓, incremental-ROE gate reusing pricing engine (T2/T4) ✓, candidate/uplift-as-propensity (T4, YAGNI note honored — no fake treatment arm) ✓, modeled-PD + positive-SHAP reuse (T3/T5) ✓, leakage discipline incl. `risk_based_rate` as economic-input-only (T3/T2) ✓, 3 portal views Lookup/Candidates/Segments + what-if simulate (T6/T9) ✓, 4th active nav + back-compat re-run (T8/T10) ✓, gate AUC≥0.78 + lift≥2.0 + cohort + aggregate-ROE checks (T4) ✓, full 12/12 Playwright + vite build (T9/T10) ✓.

**Placeholder scan:** no TBD/TODO; every code step has complete code; commands have expected output.

**Type/name consistency:** `LI_FEATURE_COLUMNS`/`LI_CATEGORICAL`/`compute_line_increase_features` (T3) used identically in T4/T5; `recommended_amount`/`incremental_roe`/`incremental_exposure`/`waterfall_or_zero` (T2) used identically in T4/T5/T6; `offer_threshold`/`cohort` metadata keys written in T4 read in T5/T7; service funcs `load_population`/`detail_record`/`candidates`/`segments`/`simulate` (T6) match route calls; schema field names (T6) match service dict keys; React testids (`nav-li-*`, `view-li-*`, `app-row`, `roe-badge`, `pricing-waterfall`, `li-segments-chart`, `li-amount-slider`) consistent between views (T9) and the spec (T10). `Waterfall` reused with its existing `rows` `{label,value,kind}` contract and existing `data-testid="pricing-waterfall"`.

**Known acceptable seams:** `simulate` `target_util` branch lacks `annual_revenue` in the scored frame and falls back to an unbounded revenue ceiling (documented inline); `recommended_amount` rounding can floor a tiny positive delta to 0 (intended — no offer).
