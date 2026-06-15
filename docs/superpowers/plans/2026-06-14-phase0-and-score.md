# Phase 0 (Foundation) + Module 0 (Business Credit Score) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the self-contained workspace, generate one coherent synthetic SME population (applicants + 24-month behavioral panel + on-book portfolio with all downstream targets), then build the shared Business Credit Score (FICO-like 300–850 + PD + reason codes) on top of it.

**Architecture:** A single deterministic synthetic data generator writes Parquet files to `shared/data/raw/`. All modules read those files. The Score is a WoE + Logistic **scorecard** (`optbinning.Scorecard`) whose raw points are linearly rescaled to a 300–850 FICO-like range; PD comes from the calibrated logistic; reason codes are the exact per-feature WoE×coefficient contributions to the log-odds (for a linear WoE model this is the precise contribution, cleaner than SHAP).

**Tech Stack:** Python 3.12 (own `.venv`), numpy, pandas, pyarrow, scikit-learn, optbinning, scipy, matplotlib, joblib, pytest. (lightgbm/shap/fastapi installed now for later phases.)

**Working directory for all paths below:** `/Users/aayan/zzLearnAndCreate/BusinessBankingApp/`

**Conventions:**
- Run Python via `./.venv/bin/python` and `./.venv/bin/pytest`.
- `random_state`/seed = `42` everywhere (from `shared/config.py`).
- Every commit message ends with the `Co-Authored-By` trailer shown in the steps.
- Do **not** write anything under `/Users/aayan/zzLearnAndCreate/MarketingAnalytics/` (read-only reference; blocked by `.claude/settings.json`).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `requirements.txt` | Consolidated deps for all phases |
| `shared/__init__.py` | Make `shared` importable |
| `shared/config.py` | Paths, seed, population sizes, market assumptions, score scaling params |
| `shared/data_generator.py` | `generate_businesses()`, `generate_portfolio_and_panel()`, `main()` → Parquet |
| `shared/tests/test_data_generator.py` | Invariants: shapes, columns, label rates, determinism, referential integrity |
| `shared/data/raw/businesses.parquet` | Applicant-level: features + `pd_default_origination` + `default` + `risk_based_rate` + `booked` |
| `shared/data/raw/portfolio.parquet` | Booked account-level: exposure, limit, utilization, tenure + `line_increase_good` + `deterioration_next_6_12mo` |
| `shared/data/raw/panel.parquet` | Long monthly behavioral panel (24 months × booked accounts) |
| `score/__init__.py` | Make `score` importable |
| `score/src/__init__.py` | package marker |
| `score/src/feature_engineering.py` | `FEATURE_COLUMNS`, `compute_features(df)` |
| `score/src/train.py` | Fit scorecard, scale to 300–850, reason codes, save artifacts + metadata + validation report |
| `score/src/reason_codes.py` | `top_reason_codes(scorecard, X, k)` shared by train + future API |
| `score/tests/test_feature_engineering.py` | Column presence, no-NaN, determinism |
| `score/tests/test_scorecard.py` | Score range [300,850], rank-ordering (PD decreases as score rises) |
| `score/models/` | `scorecard.pkl`, `score_scaling.json`, `metadata.json` |
| `score/notebooks/01_eda_score.py` | Cell-script EDA (`# %%` markers; runnable + convertible to .ipynb) |
| `score/docs/data_dictionary.md` | Raw + engineered columns + targets |
| `score/docs/validation_report.md` | Auto-generated metrics (AUC, KS, band table) |

---

# PHASE 0 — FOUNDATION

### Task 0.1: Create venv, requirements, install

**Files:**
- Create: `requirements.txt`

- [ ] **Step 1: Write `requirements.txt`**

```text
numpy==1.26.4
pandas==2.2.2
pyarrow==16.1.0
scikit-learn==1.4.2
optbinning==0.19.0
scipy==1.13.1
matplotlib==3.9.0
joblib==1.4.2
pytest==8.2.2
lightgbm==4.3.0
shap==0.45.1
fastapi==0.111.0
uvicorn==0.30.1
pydantic==2.7.4
```

- [ ] **Step 2: Create the venv**

Run: `python3 -m venv .venv`
Expected: a `.venv/` directory is created (already gitignored).

- [ ] **Step 3: Install dependencies**

Run: `./.venv/bin/pip install --upgrade pip && ./.venv/bin/pip install -r requirements.txt`
Expected: ends with `Successfully installed ... optbinning-0.19.0 ...` and no error. (If `optbinning` resolves a different patch version, that is acceptable — pin whatever installs cleanly.)

- [ ] **Step 4: Verify key imports**

Run: `./.venv/bin/python -c "import numpy,pandas,pyarrow,sklearn,optbinning,lightgbm,shap; print('imports ok')"`
Expected: `imports ok`

- [ ] **Step 5: Commit**

```bash
git add requirements.txt
git commit -m "build: add consolidated requirements + venv for business banking app

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 0.2: Scaffold packages + shared config

**Files:**
- Create: `shared/__init__.py`, `shared/tests/__init__.py`, `score/__init__.py`, `score/src/__init__.py`, `score/tests/__init__.py`
- Create: `shared/config.py`
- Create: `pytest.ini`

- [ ] **Step 1: Create empty package markers + data dirs**

Run:
```bash
mkdir -p shared/tests score/src score/tests score/models score/notebooks score/docs shared/data/raw shared/data/processed
touch shared/__init__.py shared/tests/__init__.py score/__init__.py score/src/__init__.py score/tests/__init__.py
```
Expected: directories and empty `__init__.py` files exist.

- [ ] **Step 2: Write `pytest.ini`** (so `pytest` resolves the workspace root as import base)

```ini
[pytest]
pythonpath = .
testpaths = shared/tests score/tests
```

- [ ] **Step 3: Write `shared/config.py`**

```python
"""Central configuration: paths, seed, population sizes, market assumptions."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "shared" / "data" / "raw"
PROCESSED = ROOT / "shared" / "data" / "processed"

SEED = 42

# Population
N_BUSINESSES = 12_000        # applicants
PANEL_MONTHS = 24            # months of on-book behavioral history

# Market assumptions (used by Pricing in a later phase; stored here as the single source)
MARKET = {
    "cost_of_funds": 0.035,  # COF / FTP rate
    "lgd": 0.45,             # loss given default
    "opex_rate": 0.010,      # operating cost as a rate on EAD
    "tax_rate": 0.25,
    "capital_ratio": 0.12,   # allocated equity = capital_ratio * EAD (simplified RWA=EAD)
    "base_margin": 0.020,    # target margin baked into reference pricing
    "roe_hurdle": 0.15,
}

# Score scaling (FICO-like target band)
SCORE_MIN = 300
SCORE_MAX = 850

# Ports (for later app phases)
PORTS = {"fastapi": 8100, "express": 3100, "vite": 5180}

RAW.mkdir(parents=True, exist_ok=True)
PROCESSED.mkdir(parents=True, exist_ok=True)
```

- [ ] **Step 4: Verify config imports**

Run: `./.venv/bin/python -c "from shared.config import RAW, SEED, MARKET; print(SEED, MARKET['roe_hurdle'], RAW.exists())"`
Expected: `42 0.15 True`

- [ ] **Step 5: Commit**

```bash
git add shared score pytest.ini
git commit -m "chore: scaffold shared/score packages + central config

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 0.3: Applicant generator (`generate_businesses`)

**Files:**
- Create: `shared/data_generator.py`
- Test: `shared/tests/test_data_generator.py`

- [ ] **Step 1: Write the failing test**

```python
# shared/tests/test_data_generator.py
import numpy as np
from shared.data_generator import generate_businesses

def test_generate_businesses_shape_and_columns():
    df = generate_businesses(n=2000, seed=42)
    assert len(df) == 2000
    for col in [
        "business_id", "industry", "region", "entity_type", "years_in_business",
        "employees", "annual_revenue", "net_income", "total_debt", "current_ratio",
        "dscr", "leverage", "credit_history_months", "prior_delinquencies",
        "trade_lines", "utilization", "public_records", "requested_amount",
        "term_months", "loan_purpose", "collateral_flag",
        "pd_default_origination", "default", "risk_based_rate", "booked",
    ]:
        assert col in df.columns, f"missing {col}"

def test_default_rate_is_plausible():
    df = generate_businesses(n=8000, seed=42)
    rate = df["default"].mean()
    assert 0.05 <= rate <= 0.30, f"default rate {rate:.3f} out of plausible range"

def test_pd_rank_orders_default():
    df = generate_businesses(n=8000, seed=42)
    hi = df[df["pd_default_origination"] > df["pd_default_origination"].median()]["default"].mean()
    lo = df[df["pd_default_origination"] <= df["pd_default_origination"].median()]["default"].mean()
    assert hi > lo, "higher PD half should default more than lower PD half"

def test_determinism():
    a = generate_businesses(n=1000, seed=42)
    b = generate_businesses(n=1000, seed=42)
    assert a.equals(b)

def test_business_ids_unique():
    df = generate_businesses(n=5000, seed=42)
    assert df["business_id"].is_unique
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./.venv/bin/pytest shared/tests/test_data_generator.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'shared.data_generator'` (or import error).

- [ ] **Step 3: Implement `generate_businesses` in `shared/data_generator.py`**

```python
"""Synthetic SME population generator. Deterministic given seed."""
import numpy as np
import pandas as pd

from shared.config import N_BUSINESSES, PANEL_MONTHS, SEED, MARKET, RAW

INDUSTRIES = ["Retail", "Construction", "Professional Services", "Manufacturing",
              "Hospitality", "Healthcare", "Transport", "Wholesale", "Technology",
              "Agriculture"]
REGIONS = ["Northeast", "Southeast", "Midwest", "Southwest", "West"]
ENTITY_TYPES = ["LLC", "Sole Proprietor", "Corporation", "Partnership"]
PURPOSES = ["Working Capital", "Equipment", "Expansion", "Refinance",
            "Inventory", "Real Estate"]


def _z(x: np.ndarray) -> np.ndarray:
    """Standardize to mean 0 / std 1 (guard against zero std)."""
    s = x.std()
    return (x - x.mean()) / (s if s > 0 else 1.0)


def generate_businesses(n: int = N_BUSINESSES, seed: int = SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    business_id = np.array([f"BIZ{100000 + i}" for i in range(n)])
    industry = rng.choice(INDUSTRIES, n)
    region = rng.choice(REGIONS, n)
    entity_type = rng.choice(ENTITY_TYPES, n, p=[0.45, 0.20, 0.25, 0.10])

    years_in_business = np.clip(rng.gamma(3.0, 3.0, n), 0.5, 40.0).round(1)
    employees = np.clip(rng.lognormal(2.0, 1.0, n).round(), 1, 500).astype(int)
    annual_revenue = np.clip(rng.lognormal(13.0, 1.0, n), 5e4, 5e7).round(-3)
    profit_margin = np.clip(rng.normal(0.08, 0.06, n), -0.20, 0.40)
    net_income = (annual_revenue * profit_margin).round(-2)
    total_debt = np.clip(annual_revenue * rng.uniform(0.05, 0.80, n), 0, None).round(-3)
    current_ratio = np.clip(rng.normal(1.5, 0.6, n), 0.2, 5.0).round(2)
    dscr = np.clip(rng.normal(1.4, 0.5, n), 0.1, 5.0).round(2)
    leverage = np.clip(total_debt / np.maximum(annual_revenue, 1.0), 0, 5).round(2)
    credit_history_months = np.clip(rng.gamma(4.0, 12.0, n), 3, 360).round().astype(int)
    prior_delinquencies = rng.poisson(0.6, n).astype(int)
    trade_lines = np.clip(rng.poisson(6, n), 0, 40).astype(int)
    utilization = np.clip(rng.beta(2.0, 3.0, n), 0.0, 1.0).round(3)
    public_records = rng.binomial(1, 0.08, n).astype(int)

    requested_amount = np.clip(annual_revenue * rng.uniform(0.05, 0.50, n), 1e4, 5e6).round(-3)
    term_months = rng.choice([12, 24, 36, 48, 60, 84], n,
                             p=[0.10, 0.20, 0.30, 0.20, 0.15, 0.05])
    loan_purpose = rng.choice(PURPOSES, n)
    collateral_flag = rng.binomial(1, 0.5, n).astype(int)

    # --- PD data-generating process (latent logit -> probability -> sampled default) ---
    logit = (
        -2.2
        - 0.60 * _z(np.log(years_in_business))
        - 0.50 * _z(np.log(annual_revenue))
        - 0.70 * _z(dscr)
        - 0.40 * _z(current_ratio)
        + 0.60 * _z(leverage)
        + 0.55 * _z(utilization)
        + 0.50 * _z(prior_delinquencies.astype(float))
        + 0.70 * public_records
        - 0.40 * _z(np.log(credit_history_months))
        - 1.50 * profit_margin
        + rng.normal(0.0, 0.5, n)
    )
    pd_true = 1.0 / (1.0 + np.exp(-logit))
    default = rng.binomial(1, pd_true).astype(int)

    # --- reference risk-based rate (used later by Pricing) ---
    risk_based_rate = (
        MARKET["cost_of_funds"]
        + pd_true * MARKET["lgd"]
        + MARKET["opex_rate"]
        + MARKET["base_margin"]
        + rng.normal(0.0, 0.003, n)
    ).round(4)

    # --- booking decision (lower PD => more likely booked) ---
    approve_logit = 2.0 - 6.0 * pd_true + rng.normal(0.0, 0.5, n)
    booked = rng.binomial(1, 1.0 / (1.0 + np.exp(-approve_logit))).astype(int)

    return pd.DataFrame({
        "business_id": business_id,
        "industry": industry, "region": region, "entity_type": entity_type,
        "years_in_business": years_in_business, "employees": employees,
        "annual_revenue": annual_revenue, "net_income": net_income,
        "total_debt": total_debt, "current_ratio": current_ratio, "dscr": dscr,
        "leverage": leverage, "credit_history_months": credit_history_months,
        "prior_delinquencies": prior_delinquencies, "trade_lines": trade_lines,
        "utilization": utilization, "public_records": public_records,
        "requested_amount": requested_amount, "term_months": term_months,
        "loan_purpose": loan_purpose, "collateral_flag": collateral_flag,
        "pd_default_origination": pd_true.round(4), "default": default,
        "risk_based_rate": risk_based_rate, "booked": booked,
    })
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `./.venv/bin/pytest shared/tests/test_data_generator.py -q`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add shared/data_generator.py shared/tests/test_data_generator.py
git commit -m "feat(data): synthetic SME applicant generator with PD DGP

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 0.4: Portfolio + 24-month behavioral panel generator

**Files:**
- Modify: `shared/data_generator.py` (add `generate_portfolio_and_panel`)
- Modify: `shared/tests/test_data_generator.py` (add panel/portfolio tests)

- [ ] **Step 1: Write the failing tests (append)**

```python
# append to shared/tests/test_data_generator.py
from shared.data_generator import generate_businesses, generate_portfolio_and_panel

def test_portfolio_and_panel_integrity():
    biz = generate_businesses(n=4000, seed=42)
    portfolio, panel = generate_portfolio_and_panel(biz, panel_months=24, seed=42)
    booked_ids = set(biz[biz["booked"] == 1]["business_id"])
    # portfolio only contains booked businesses
    assert set(portfolio["business_id"]).issubset(booked_ids)
    assert len(portfolio) == len(booked_ids)
    # panel has exactly panel_months rows per booked account
    counts = panel.groupby("business_id")["month_index"].count()
    assert (counts == 24).all()
    # referential integrity
    assert set(panel["business_id"]) == set(portfolio["business_id"])

def test_portfolio_targets_present_and_plausible():
    biz = generate_businesses(n=6000, seed=42)
    portfolio, _ = generate_portfolio_and_panel(biz, panel_months=24, seed=42)
    for col in ["credit_limit", "current_balance", "utilization_onbook",
                "tenure_months", "line_increase_good", "deterioration_next_6_12mo"]:
        assert col in portfolio.columns, f"missing {col}"
    assert 0.03 <= portfolio["deterioration_next_6_12mo"].mean() <= 0.35
    assert 0.05 <= portfolio["line_increase_good"].mean() <= 0.60

def test_panel_columns():
    biz = generate_businesses(n=2000, seed=42)
    _, panel = generate_portfolio_and_panel(biz, panel_months=24, seed=42)
    for col in ["business_id", "month_index", "balance", "utilization",
                "days_past_due", "deposit_inflow", "overdraft_count"]:
        assert col in panel.columns, f"missing {col}"
```

- [ ] **Step 2: Run to verify failure**

Run: `./.venv/bin/pytest shared/tests/test_data_generator.py -q`
Expected: FAIL — `ImportError: cannot import name 'generate_portfolio_and_panel'`.

- [ ] **Step 3: Implement `generate_portfolio_and_panel` (append to `shared/data_generator.py`)**

```python
def generate_portfolio_and_panel(businesses: pd.DataFrame,
                                 panel_months: int = PANEL_MONTHS,
                                 seed: int = SEED):
    """Build on-book portfolio (account-level) and a long monthly behavioral panel
    for the BOOKED subset. Returns (portfolio_df, panel_df)."""
    rng = np.random.default_rng(seed + 1)
    book = businesses[businesses["booked"] == 1].reset_index(drop=True).copy()
    m = len(book)

    credit_limit = book["requested_amount"].to_numpy().astype(float)
    tenure_months = np.minimum(book["credit_history_months"].to_numpy(),
                               rng.integers(6, 60, m)).astype(int)
    start_util = np.clip(book["utilization"].to_numpy() + rng.normal(0, 0.05, m), 0.02, 0.98)
    pd_true = book["pd_default_origination"].to_numpy()

    # Behavioral panel via per-account random walk on utilization, with a risk-linked drift.
    months = np.arange(panel_months)
    drift = (pd_true - pd_true.mean()) * 0.015  # higher-risk accounts drift up in utilization
    rows = []
    util_path = np.zeros((m, panel_months))
    for t in months:
        step = rng.normal(0, 0.03, m) + drift
        cur = np.clip(start_util + step * t, 0.0, 1.2)
        util_path[:, t] = cur
        balance = (cur * credit_limit).round(-1)
        dpd_lambda = np.clip(pd_true * 30 * (1 + 0.5 * (cur > 0.9)), 0, None)
        days_past_due = rng.poisson(dpd_lambda * 0.1).astype(int)
        deposit_inflow = np.clip(book["annual_revenue"].to_numpy() / 12.0
                                 * rng.uniform(0.6, 1.2, m)
                                 * (1 - 0.3 * (cur > 0.95)), 0, None).round(-1)
        overdraft_count = rng.poisson(np.clip(cur - 0.8, 0, None) * 3).astype(int)
        rows.append(pd.DataFrame({
            "business_id": book["business_id"].to_numpy(),
            "month_index": t,
            "balance": balance,
            "utilization": cur.round(3),
            "days_past_due": days_past_due,
            "deposit_inflow": deposit_inflow,
            "overdraft_count": overdraft_count,
        }))
    panel = pd.concat(rows, ignore_index=True)

    # End-state behavioral signals drive the EWS target.
    util_last3 = util_path[:, -3:].mean(axis=1)
    util_trend = util_path[:, -1] - util_path[:, 0]
    det_logit = (
        -2.4
        + 3.0 * pd_true
        + 2.0 * np.clip(util_last3 - 0.85, 0, None)
        + 1.5 * np.clip(util_trend, 0, None)
        + 0.4 * _z(book["leverage"].to_numpy())
        + rng.normal(0, 0.4, m)
    )
    deterioration = rng.binomial(1, 1.0 / (1.0 + np.exp(-det_logit))).astype(int)

    # Line-increase "good candidate": low risk + high utilization headroom demand + capacity.
    li_logit = (
        -1.0
        - 4.0 * pd_true
        + 2.5 * np.clip(util_last3 - 0.6, 0, None)
        + 0.5 * _z(np.log(book["annual_revenue"].to_numpy()))
        - 1.0 * deterioration
        + rng.normal(0, 0.4, m)
    )
    line_increase_good = rng.binomial(1, 1.0 / (1.0 + np.exp(-li_logit))).astype(int)

    portfolio = book.copy()
    portfolio["credit_limit"] = credit_limit.round(-3)
    portfolio["current_balance"] = (util_last3 * credit_limit).round(-1)
    portfolio["utilization_onbook"] = util_last3.round(3)
    portfolio["tenure_months"] = tenure_months
    portfolio["deterioration_next_6_12mo"] = deterioration
    portfolio["line_increase_good"] = line_increase_good

    return portfolio, panel
```

- [ ] **Step 4: Run to verify it passes**

Run: `./.venv/bin/pytest shared/tests/test_data_generator.py -q`
Expected: PASS (8 passed).

- [ ] **Step 5: Commit**

```bash
git add shared/data_generator.py shared/tests/test_data_generator.py
git commit -m "feat(data): on-book portfolio + 24mo behavioral panel with EWS & line-increase targets

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 0.5: `main()` entrypoint — write Parquet files

**Files:**
- Modify: `shared/data_generator.py` (add `main()` + `__main__`)

- [ ] **Step 1: Append `main()` to `shared/data_generator.py`**

```python
def main():
    biz = generate_businesses()
    portfolio, panel = generate_portfolio_and_panel(biz)
    biz.to_parquet(RAW / "businesses.parquet", index=False)
    portfolio.to_parquet(RAW / "portfolio.parquet", index=False)
    panel.to_parquet(RAW / "panel.parquet", index=False)
    print(f"businesses: {len(biz):,} rows, default rate {biz['default'].mean():.3f}, "
          f"booked {biz['booked'].mean():.3f}")
    print(f"portfolio:  {len(portfolio):,} accounts, "
          f"deterioration {portfolio['deterioration_next_6_12mo'].mean():.3f}, "
          f"line_increase_good {portfolio['line_increase_good'].mean():.3f}")
    print(f"panel:      {len(panel):,} rows ({panel['month_index'].nunique()} months)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the generator**

Run: `./.venv/bin/python -m shared.data_generator`
Expected: three printed summary lines; default rate within ~0.10–0.20, booked ~0.7–0.85.

- [ ] **Step 3: Verify the Parquet files exist and load**

Run:
```bash
./.venv/bin/python -c "import pandas as pd; from shared.config import RAW; \
print(pd.read_parquet(RAW/'businesses.parquet').shape, \
pd.read_parquet(RAW/'portfolio.parquet').shape, \
pd.read_parquet(RAW/'panel.parquet').shape)"
```
Expected: e.g. `(12000, 25) (~9000, 31) (~216000, 7)` (exact booked count varies but is deterministic).

- [ ] **Step 4: Commit**

```bash
git add shared/data_generator.py
git commit -m "feat(data): generator entrypoint writes businesses/portfolio/panel parquet

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 0.6: Data dictionary + EDA cell-script

**Files:**
- Create: `score/docs/data_dictionary.md`
- Create: `score/notebooks/01_eda_score.py`

- [ ] **Step 1: Write `score/docs/data_dictionary.md`**

```markdown
# Data Dictionary — Synthetic SME Population

Generated by `shared/data_generator.py` (seed=42). All data is synthetic.

## businesses.parquet (applicant-level, 12,000 rows)
| Column | Type | Meaning |
|--------|------|---------|
| business_id | str | Stable key across all files (BIZ100000…) |
| industry, region, entity_type | str | Firmographics |
| years_in_business | float | Age of business in years |
| employees | int | Headcount |
| annual_revenue | float | Annual revenue |
| net_income | float | Net income |
| total_debt | float | Total outstanding debt |
| current_ratio | float | Current assets / current liabilities |
| dscr | float | Debt service coverage ratio |
| leverage | float | total_debt / annual_revenue |
| credit_history_months | int | Length of credit history |
| prior_delinquencies | int | Count of past delinquencies |
| trade_lines | int | Number of trade lines |
| utilization | float | Revolving utilization (0–1) at application |
| public_records | int | 1 if public derogatory record |
| requested_amount, term_months, loan_purpose, collateral_flag | mixed | Application |
| pd_default_origination | float | TRUE latent PD from the DGP (not a feature) |
| default | int | Sampled 12-month default outcome (Score/Adjudication target) |
| risk_based_rate | float | Reference APR (Pricing input) |
| booked | int | 1 if loan was originated (on-book subset) |

## portfolio.parquet (booked accounts)
Adds to the applicant columns:
| Column | Type | Meaning |
|--------|------|---------|
| credit_limit | float | Approved limit |
| current_balance | float | Recent average balance |
| utilization_onbook | float | Recent average utilization (0–1+) |
| tenure_months | int | Months on book |
| deterioration_next_6_12mo | int | EWS target (deteriorates/defaults in horizon) |
| line_increase_good | int | Line-increase target (good candidate) |

## panel.parquet (long monthly behavioral panel)
| Column | Type | Meaning |
|--------|------|---------|
| business_id | str | Account key |
| month_index | int | 0–23 |
| balance | float | Month-end balance |
| utilization | float | Month-end utilization |
| days_past_due | int | DPD in month |
| deposit_inflow | float | Deposits that month |
| overdraft_count | int | Overdraft events that month |
```

- [ ] **Step 2: Write `score/notebooks/01_eda_score.py`** (cell-script; runnable directly, convertible to `.ipynb` via `jupytext` later)

```python
# %% [markdown]
# # EDA — Synthetic SME Population (Business Credit Score)
# %%
import pandas as pd
import matplotlib.pyplot as plt
from shared.config import RAW

biz = pd.read_parquet(RAW / "businesses.parquet")
print("rows:", len(biz), "| default rate:", round(biz["default"].mean(), 3))

# %% [markdown]
# ## Target balance
# %%
print(biz["default"].value_counts(normalize=True))

# %% [markdown]
# ## Numeric feature summary
# %%
num_cols = ["years_in_business", "annual_revenue", "dscr", "current_ratio",
            "leverage", "utilization", "credit_history_months",
            "prior_delinquencies"]
print(biz[num_cols].describe().T)

# %% [markdown]
# ## Default rate by DSCR / utilization deciles (rank-order sanity)
# %%
for col in ["dscr", "utilization", "leverage"]:
    q = pd.qcut(biz[col], 10, duplicates="drop")
    print(f"\n--- default rate by {col} decile ---")
    print(biz.groupby(q, observed=True)["default"].mean().round(3))

# %% [markdown]
# ## Save a couple of charts
# %%
fig, ax = plt.subplots(1, 2, figsize=(11, 4))
biz["pd_default_origination"].hist(bins=40, ax=ax[0]); ax[0].set_title("True PD distribution")
biz.groupby(pd.qcut(biz["dscr"], 10, duplicates="drop"), observed=True)["default"].mean().plot(
    kind="bar", ax=ax[1]); ax[1].set_title("Default rate by DSCR decile")
plt.tight_layout()
fig.savefig("score/docs/eda_overview.png", dpi=110)
print("saved score/docs/eda_overview.png")
```

- [ ] **Step 3: Run the EDA script end-to-end**

Run: `./.venv/bin/python score/notebooks/01_eda_score.py`
Expected: prints summaries; default rate by decile is **monotone-ish** (lower DSCR → higher default; higher utilization/leverage → higher default); writes `score/docs/eda_overview.png`.

- [ ] **Step 4: Commit**

```bash
git add score/docs/data_dictionary.md score/notebooks/01_eda_score.py score/docs/eda_overview.png
git commit -m "docs(data): data dictionary + EDA cell-script for SME population

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 0.7: Checkpoint — mark Foundation complete

**Files:**
- Modify: `program_state.json`
- Modify: `SESSION_LOG.md`

- [ ] **Step 1: Update `program_state.json`** — set the `foundation` phase `status` to `"completed"`, every task `done: true`, fill `completed_at` with today's date, set `artifacts` to `["shared/data/raw/businesses.parquet","shared/data/raw/portfolio.parquet","shared/data/raw/panel.parquet"]`, record `metrics` (default_rate, booked_rate, deterioration_rate, line_increase_rate from the generator output), bump `updated_at`, and set `next_action` to `"Phase Score — feature engineering + scorecard training"`.

- [ ] **Step 2: Append a Session Log entry** to `SESSION_LOG.md` summarizing Foundation completion (data shapes + rates) and the next action.

- [ ] **Step 3: Run the full test suite (regression check)**

Run: `./.venv/bin/pytest -q`
Expected: all data-generator tests pass.

- [ ] **Step 4: Commit**

```bash
git add program_state.json SESSION_LOG.md
git commit -m "chore: checkpoint — Phase 0 Foundation complete

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

# PHASE SCORE — MODULE 0: BUSINESS CREDIT SCORE

### Task 1.1: Feature engineering + `FEATURE_COLUMNS`

**Files:**
- Create: `score/src/feature_engineering.py`
- Test: `score/tests/test_feature_engineering.py`

- [ ] **Step 1: Write the failing test**

```python
# score/tests/test_feature_engineering.py
import pandas as pd
from shared.config import RAW
from score.src.feature_engineering import FEATURE_COLUMNS, compute_features

def _raw():
    return pd.read_parquet(RAW / "businesses.parquet")

def test_feature_columns_present_after_compute():
    X = compute_features(_raw())
    for c in FEATURE_COLUMNS:
        assert c in X.columns, f"missing engineered feature {c}"

def test_no_nan_in_features():
    X = compute_features(_raw())
    assert X[FEATURE_COLUMNS].isna().sum().sum() == 0

def test_deterministic():
    df = _raw()
    a = compute_features(df)[FEATURE_COLUMNS]
    b = compute_features(df)[FEATURE_COLUMNS]
    assert a.equals(b)

def test_leakage_columns_excluded():
    # The true PD and the outcome must never be features.
    assert "pd_default_origination" not in FEATURE_COLUMNS
    assert "default" not in FEATURE_COLUMNS
    assert "risk_based_rate" not in FEATURE_COLUMNS
```

- [ ] **Step 2: Run to verify failure**

Run: `./.venv/bin/pytest score/tests/test_feature_engineering.py -q`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `score/src/feature_engineering.py`**

```python
"""Feature engineering for the Business Credit Score scorecard.

Mix of raw and derived ratios. Categorical features are kept as strings;
optbinning's BinningProcess handles WoE encoding for both numeric and categorical.
"""
import numpy as np
import pandas as pd

# Shared with the API in later phases.
FEATURE_COLUMNS = [
    # numeric
    "years_in_business", "annual_revenue", "dscr", "current_ratio", "leverage",
    "utilization", "credit_history_months", "prior_delinquencies", "trade_lines",
    "public_records", "debt_to_income", "revenue_per_employee", "profit_margin",
    # categorical
    "industry", "entity_type",
]

CATEGORICAL = ["industry", "entity_type"]


def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["debt_to_income"] = (out["total_debt"] / np.maximum(out["net_income"].abs(), 1.0)).clip(0, 50).round(3)
    out["revenue_per_employee"] = (out["annual_revenue"] / np.maximum(out["employees"], 1)).round(0)
    out["profit_margin"] = (out["net_income"] / np.maximum(out["annual_revenue"], 1.0)).clip(-1, 1).round(4)
    # Ensure no NaN in modeling columns.
    for c in FEATURE_COLUMNS:
        if c not in CATEGORICAL:
            out[c] = pd.to_numeric(out[c], errors="coerce").fillna(0.0)
        else:
            out[c] = out[c].astype(str)
    return out
```

- [ ] **Step 4: Run to verify it passes**

Run: `./.venv/bin/pytest score/tests/test_feature_engineering.py -q`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add score/src/feature_engineering.py score/tests/test_feature_engineering.py
git commit -m "feat(score): feature engineering + FEATURE_COLUMNS

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 1.2: Reason-codes helper (WoE × coefficient contributions)

**Files:**
- Create: `score/src/reason_codes.py`
- Test: covered in Task 1.4 after the scorecard exists (no standalone unit test — it needs a fitted scorecard).

- [ ] **Step 1: Implement `score/src/reason_codes.py`**

```python
"""Adverse reason codes for the WoE+Logistic scorecard.

For a linear-in-WoE model, each feature's contribution to the log-odds of default
is exactly WoE(feature) * coefficient(feature). The features with the largest
positive contribution (pushing PD up) are the adverse reason codes.
"""
import numpy as np
import pandas as pd


def feature_contributions(scorecard, X: pd.DataFrame) -> pd.DataFrame:
    """Return a DataFrame (rows aligned to X) of per-feature logit contributions."""
    bp = scorecard.binning_process_
    woe = bp.transform(X, metric="woe")           # DataFrame of WoE values
    coef = scorecard.estimator_.coef_[0]          # one coef per binned feature
    names = list(woe.columns)
    contrib = woe.to_numpy() * coef
    return pd.DataFrame(contrib, columns=names, index=X.index)


def top_reason_codes(scorecard, X: pd.DataFrame, k: int = 3):
    """List (per row) of the top-k features increasing default risk."""
    contrib = feature_contributions(scorecard, X)
    reasons = []
    cols = np.array(contrib.columns)
    arr = contrib.to_numpy()
    for i in range(arr.shape[0]):
        order = np.argsort(arr[i])[::-1][:k]      # largest positive contributions
        reasons.append([{"feature": str(cols[j]), "impact": round(float(arr[i, j]), 4)}
                        for j in order if arr[i, j] > 0])
    return reasons
```

- [ ] **Step 2: Commit**

```bash
git add score/src/reason_codes.py
git commit -m "feat(score): WoE x coefficient reason-code helper

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 1.3: Train the scorecard + scale to 300–850

**Files:**
- Create: `score/src/train.py`
- Test: `score/tests/test_scorecard.py`

- [ ] **Step 1: Write the failing test**

```python
# score/tests/test_scorecard.py
import json
import joblib
import numpy as np
import pandas as pd
from shared.config import RAW, SCORE_MIN, SCORE_MAX
from score.src.feature_engineering import compute_features
from score.src.train import score_to_fico

MODELS = __import__("pathlib").Path("score/models")

def test_score_to_fico_clamps_range():
    raw = np.array([-10.0, 0.0, 5.0, 999.0])
    out = score_to_fico(raw, lo=0.0, hi=5.0)
    assert out.min() >= SCORE_MIN and out.max() <= SCORE_MAX

def test_artifacts_exist_after_training():
    assert (MODELS / "scorecard.pkl").exists()
    assert (MODELS / "score_scaling.json").exists()
    assert (MODELS / "metadata.json").exists()

def test_score_range_and_rank_ordering():
    sc = joblib.load(MODELS / "scorecard.pkl")
    scaling = json.loads((MODELS / "score_scaling.json").read_text())
    biz = pd.read_parquet(RAW / "businesses.parquet")
    X = compute_features(biz)
    raw = sc.score(X)
    fico = score_to_fico(raw, scaling["lo"], scaling["hi"])
    assert fico.min() >= SCORE_MIN and fico.max() <= SCORE_MAX
    # Higher score => lower observed default rate (rank ordering).
    df = pd.DataFrame({"fico": fico, "default": biz["default"].to_numpy()})
    top = df[df["fico"] > df["fico"].median()]["default"].mean()
    bot = df[df["fico"] <= df["fico"].median()]["default"].mean()
    assert top < bot, "high-score half should default less than low-score half"

def test_metric_gate():
    meta = json.loads((MODELS / "metadata.json").read_text())
    assert meta["metrics"]["auc"] >= 0.75, meta["metrics"]
    assert meta["metrics"]["ks"] >= 0.30, meta["metrics"]
```

- [ ] **Step 2: Run to verify failure**

Run: `./.venv/bin/pytest score/tests/test_scorecard.py -q`
Expected: FAIL — `score.src.train` not importable / artifacts missing.

- [ ] **Step 3: Implement `score/src/train.py`**

```python
"""Train the Business Credit Score scorecard (WoE + Logistic), scale to 300-850,
compute metrics, and persist artifacts + validation report."""
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from optbinning import BinningProcess, Scorecard
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

from shared.config import RAW, SCORE_MIN, SCORE_MAX, SEED
from score.src.feature_engineering import FEATURE_COLUMNS, CATEGORICAL, compute_features

MODELS = Path("score/models")
DOCS = Path("score/docs")


def score_to_fico(raw_scores, lo, hi):
    """Linearly map raw scorecard points (in [lo, hi]) to [SCORE_MIN, SCORE_MAX], clamped."""
    raw = np.asarray(raw_scores, dtype=float)
    if hi <= lo:
        return np.full_like(raw, (SCORE_MIN + SCORE_MAX) / 2.0)
    scaled = SCORE_MIN + (raw - lo) / (hi - lo) * (SCORE_MAX - SCORE_MIN)
    return np.clip(scaled, SCORE_MIN, SCORE_MAX).round().astype(int)


def ks_statistic(y_true, y_score):
    order = np.argsort(y_score)
    y = np.asarray(y_true)[order]
    cum_bad = np.cumsum(y) / max(y.sum(), 1)
    cum_good = np.cumsum(1 - y) / max((1 - y).sum(), 1)
    return float(np.max(np.abs(cum_bad - cum_good)))


def main():
    MODELS.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)

    biz = pd.read_parquet(RAW / "businesses.parquet")
    X_all = compute_features(biz)
    X = X_all[FEATURE_COLUMNS]
    y = biz["default"].to_numpy()

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=SEED, stratify=y)

    binning_process = BinningProcess(
        variable_names=FEATURE_COLUMNS,
        categorical_variables=CATEGORICAL,
    )
    estimator = LogisticRegression(solver="lbfgs", max_iter=1000)
    scorecard = Scorecard(
        binning_process=binning_process,
        estimator=estimator,
        scaling_method="pdo_odds",
        scaling_method_params={"pdo": 50, "odds": 20, "scorepoints": 600},
        reverse_scorecard=True,   # higher points => lower risk (FICO-like)
    )
    scorecard.fit(X_train, y_train)

    # Calibrate the FICO rescale using the TRAIN raw-score 1st/99th percentiles.
    raw_train = scorecard.score(X_train)
    lo, hi = np.percentile(raw_train, 1), np.percentile(raw_train, 99)

    # Metrics on test.
    pd_test = scorecard.predict_proba(X_test)[:, 1]
    auc = float(roc_auc_score(y_test, pd_test))
    ks = ks_statistic(y_test, pd_test)

    # Score-band table (rank-ordering evidence).
    fico_test = score_to_fico(scorecard.score(X_test), lo, hi)
    bands = pd.cut(fico_test, bins=[300, 580, 640, 700, 750, 850],
                   labels=["D", "C", "B", "A", "AAA"], include_lowest=True)
    band_tbl = (pd.DataFrame({"band": bands, "default": y_test})
                .groupby("band", observed=True)["default"]
                .agg(["count", "mean"]).round(4))

    # Persist artifacts.
    joblib.dump(scorecard, MODELS / "scorecard.pkl")
    (MODELS / "score_scaling.json").write_text(json.dumps({"lo": float(lo), "hi": float(hi)}))
    metadata = {
        "FEATURE_COLUMNS": FEATURE_COLUMNS,
        "categorical": CATEGORICAL,
        "train_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "metrics": {"auc": round(auc, 4), "ks": round(ks, 4)},
        "score_range": [SCORE_MIN, SCORE_MAX],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    (MODELS / "metadata.json").write_text(json.dumps(metadata, indent=2))

    # Validation report.
    band_md = band_tbl.to_markdown()
    report = (
        "# Business Credit Score — Validation Report\n\n"
        f"- Train rows: {len(X_train):,}  Test rows: {len(X_test):,}\n"
        f"- **AUC:** {auc:.4f}  |  **KS:** {ks:.4f}\n\n"
        "## Default rate by score band (test)\n\n"
        f"{band_md}\n"
    )
    (DOCS / "validation_report.md").write_text(report)

    print(f"AUC={auc:.4f} KS={ks:.4f} | scaling lo={lo:.2f} hi={hi:.2f}")
    print(band_tbl)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run training**

Run: `./.venv/bin/python -m score.src.train`
Expected: prints `AUC=0.7x.. KS=0.3x..` and a band table where the default-rate column **decreases** from band D → AAA. (If AUC < 0.75 or KS < 0.30, the DGP signal is too weak — increase the DGP coefficient magnitudes in `generate_businesses` by ~20% and regenerate before proceeding. The defaults above are tuned to clear the gate.)

- [ ] **Step 5: Run the scorecard tests**

Run: `./.venv/bin/pytest score/tests/test_scorecard.py -q`
Expected: PASS (4 passed) — artifacts exist, scores in [300,850], rank-ordering holds, metric gate met.

- [ ] **Step 6: Commit**

```bash
git add score/src/train.py score/tests/test_scorecard.py score/models/metadata.json score/models/score_scaling.json score/docs/validation_report.md
git commit -m "feat(score): WoE+Logistic scorecard, 300-850 scaling, metric gate (AUC/KS)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
(Note: `score/models/scorecard.pkl` is gitignored by `**/models/*.pkl`; metadata/scaling JSON and the report are tracked.)

---

### Task 1.4: Reason-codes sanity test

**Files:**
- Test: `score/tests/test_reason_codes.py`

- [ ] **Step 1: Write the test**

```python
# score/tests/test_reason_codes.py
import joblib
import pandas as pd
from pathlib import Path
from shared.config import RAW
from score.src.feature_engineering import FEATURE_COLUMNS, compute_features
from score.src.reason_codes import top_reason_codes

def test_reason_codes_shape_and_content():
    sc = joblib.load(Path("score/models/scorecard.pkl"))
    biz = pd.read_parquet(RAW / "businesses.parquet").head(50)
    X = compute_features(biz)[FEATURE_COLUMNS]
    reasons = top_reason_codes(sc, X, k=3)
    assert len(reasons) == 50
    # Each reason entry references a real feature and has a positive impact.
    for r in reasons:
        for item in r:
            assert item["feature"] in FEATURE_COLUMNS
            assert item["impact"] > 0
```

- [ ] **Step 2: Run the test**

Run: `./.venv/bin/pytest score/tests/test_reason_codes.py -q`
Expected: PASS. (If `bp.transform(..., metric="woe")` column names differ from `FEATURE_COLUMNS`, adjust the assertion to map binned column names back to base feature names — optbinning preserves the original variable names by default, so this should pass as written.)

- [ ] **Step 3: Commit**

```bash
git add score/tests/test_reason_codes.py
git commit -m "test(score): reason-code sanity checks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 1.5: Checkpoint — mark Score complete

**Files:**
- Modify: `program_state.json`
- Modify: `SESSION_LOG.md`

- [ ] **Step 1: Run the FULL test suite**

Run: `./.venv/bin/pytest -q`
Expected: all tests pass (data generator + feature engineering + scorecard + reason codes).

- [ ] **Step 2: Update `program_state.json`** — set the `score` phase `status: "completed"`, all tasks `done: true`, `completed_at` = today, `metrics` = `{auc, ks}` from `score/models/metadata.json`, `artifacts` = `["score/models/scorecard.pkl","score/models/metadata.json","score/models/score_scaling.json","score/docs/validation_report.md"]`, bump `updated_at`, set `next_action` to `"Phase Adjudication — LightGBM default model + policy decision layer + portal module"`.

- [ ] **Step 3: Append a Session Log entry** to `SESSION_LOG.md`: Score complete with AUC/KS, artifacts list, next action, and the resume reminder.

- [ ] **Step 4: Commit**

```bash
git add program_state.json SESSION_LOG.md
git commit -m "chore: checkpoint — Module 0 Business Credit Score complete

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review (completed)

**Spec coverage:**
- Spec §3.1 workspace layout → Tasks 0.1, 0.2 (venv, scaffold, config).
- Spec §4 shared synthetic data model (population, feature groups, targets) → Tasks 0.3, 0.4, 0.5; downstream targets `deterioration_next_6_12mo` and `line_increase_good` generated now so later phases reuse them.
- Spec §5 Module 0 (WoE+Logistic scorecard, 300–850, PD, reason codes, AUC≥0.75/KS≥0.30, views) → Tasks 1.1–1.5. *Views (Lookup/What-If/Segments) are part of the Portal phase, not this plan — the model + artifacts + metric gate are delivered here, which is the dependency the portal needs.*
- Spec §7 memory/management (checkpoint protocol) → Tasks 0.7 and 1.5 update `program_state.json` + `SESSION_LOG.md` and commit.

**Deviations from spec (intentional):**
- Reason codes use exact WoE×coefficient contributions instead of SHAP. For a linear WoE scorecard this is the precise per-feature contribution and is the credit-industry standard; SHAP is reserved for the LightGBM modules (Adjudication, EWS, Line Increase). Noted in the plan header.
- EDA is a runnable cell-script (`01_eda_score.py`) rather than a hand-authored `.ipynb`, to keep it testable/fast; it is `jupytext`-convertible. Equivalent content to the spec's "EDA notebook".

**Placeholder scan:** none — every code/test step contains complete content.

**Type consistency:** `FEATURE_COLUMNS` and `CATEGORICAL` defined in `feature_engineering.py` and imported everywhere; `compute_features`, `score_to_fico`, `top_reason_codes`, `generate_businesses`, `generate_portfolio_and_panel` signatures are consistent across all referencing tasks.
