# Adjudication Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the project's first portal app — a FastAPI backend + React/Vite client — wired for the Adjudication module's Lookup / What-If / Segments views plus a light Dashboard, with a headless Playwright gate.

**Architecture:** One FastAPI app (`portal/server/`, port 8100) loads the scorecard + adjudication model + policy config at startup, scores all ~12k applicants, and caches the result in `app.state`. A Vite React client (port 5180) proxies `/api` directly to FastAPI (no Express). The portal reuses Module 0/1 Python code via `service.py` (no logic duplicated). Frontend components/views adapt the proven MarketingAnalytics `m03_churn` reference patterns.

**Tech Stack:** FastAPI + Pydantic + uvicorn (existing venv); React 18 + Vite 5 + TailwindCSS 3 + Recharts + axios + lucide-react (JSX); `@playwright/test` for the gate.

**Working directory for all paths below:** `/Users/aayan/zzLearnAndCreate/BusinessBankingApp/`

**Reference to ADAPT (read-only — never write there):** `/Users/aayan/zzLearnAndCreate/MarketingAnalytics/m03_churn/` — `src/api/main.py` (lifespan, endpoints, helpers), `app/client/src/` (components, views, lib, configs). Adapt structure/idioms; do not copy domain logic. Do NOT modify anything under MarketingAnalytics.

**Conventions:**
- Python via `./.venv/bin/python`, tests via `./.venv/bin/pytest`. Seed 42.
- Run uvicorn from the repo root so `shared`/`score`/`adjudication`/`portal` import.
- Node: client uses `"type": "module"`. Commit messages end with the `Co-Authored-By` trailer shown in steps.
- Branch: `build/adjudication` (continue on it).

**Specs:** `docs/superpowers/specs/2026-06-15-adjudication-portal-design.md` (+ parent design + Module 1 backend spec).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `portal/__init__.py`, `portal/server/__init__.py`, `portal/server/tests/__init__.py` | package markers |
| `portal/server/schemas.py` | Pydantic request/response models |
| `portal/server/service.py` | raw/edited applicant → decision record (reuses Module 1; no logic dup) |
| `portal/server/main.py` | FastAPI app, lifespan loads artifacts + scores population, 5 routes |
| `portal/server/tests/test_api.py` | FastAPI `TestClient` endpoint tests |
| `portal/client/package.json` + `vite.config.js` + `tailwind.config.js` + `postcss.config.js` + `index.html` | client build/config |
| `portal/client/src/{main.jsx,App.jsx,index.css}` | app shell |
| `portal/client/src/lib/{api.js,hooks.js,constants.js}` | data layer |
| `portal/client/src/components/*.jsx` | Sidebar, Card, StatCard, DataTable, SliderControl, DecisionBadge, ReasonList, LoadingSpinner, ErrorBanner, ApplicantSelect |
| `portal/client/src/views/*.jsx` | LookupView, WhatIfView, SegmentsView, Dashboard |
| `portal/client/playwright.config.js` + `portal/client/e2e/adjudication.spec.js` | headless gate |
| `pytest.ini` | add `portal/server/tests` to testpaths |

---

# TASKS

### Task 1: Backend — schemas, service, FastAPI app

**Files:**
- Create: `portal/__init__.py`, `portal/server/__init__.py` (empty)
- Create: `portal/server/schemas.py`, `portal/server/service.py`, `portal/server/main.py`

- [ ] **Step 1: Package markers**

```bash
mkdir -p portal/server/tests
touch portal/__init__.py portal/server/__init__.py portal/server/tests/__init__.py
```

- [ ] **Step 2: Write `portal/server/schemas.py`**

```python
"""Pydantic models for the Adjudication portal API."""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


class ReasonItem(BaseModel):
    feature: str
    impact: float


class KeyRatios(BaseModel):
    dscr: float
    leverage: float
    current_ratio: float
    utilization: float
    debt_to_income: float


class ApplicationListItem(BaseModel):
    business_id: str
    industry: str
    business_score: int
    pd: float
    decision: str
    requested_amount: float


class PaginatedApplications(BaseModel):
    items: list[ApplicationListItem]
    page: int
    pages: int
    total: int


class AdjudicationDetail(BaseModel):
    business_id: str
    decision: str
    pd: float
    business_score: int
    score_band: str
    industry: str
    requested_amount: float
    key_ratios: KeyRatios
    rule_hits: list[str]
    top_shap_reasons: list[ReasonItem]


class DecideRequest(BaseModel):
    # All optional; missing fields fall back to a baseline applicant. These are the raw
    # fields the score + adjudication pipelines consume to recompute the decision.
    industry: Optional[str] = None
    entity_type: Optional[str] = None
    loan_purpose: Optional[str] = None
    years_in_business: Optional[float] = None
    employees: Optional[float] = None
    annual_revenue: Optional[float] = None
    net_income: Optional[float] = None
    total_debt: Optional[float] = None
    current_ratio: Optional[float] = None
    dscr: Optional[float] = None
    leverage: Optional[float] = None
    credit_history_months: Optional[float] = None
    prior_delinquencies: Optional[float] = None
    trade_lines: Optional[float] = None
    utilization: Optional[float] = None
    public_records: Optional[float] = None
    requested_amount: Optional[float] = None
    term_months: Optional[float] = None
    collateral_flag: Optional[float] = None


class SegmentRow(BaseModel):
    key: str
    approve: float
    refer: float
    decline: float
    count: int


class SegmentsResponse(BaseModel):
    by_band: list[SegmentRow]
    by_industry: list[SegmentRow]


class HealthResponse(BaseModel):
    status: str
    n_applicants: int
    model_auc: float
    top20_lift: float
```

- [ ] **Step 3: Write `portal/server/service.py`**

```python
"""Glue between the portal API and Module 0/1 code. No business logic is defined here;
this only orchestrates feature engineering + model + policy + reason codes."""
from __future__ import annotations
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap

from shared.config import RAW
from adjudication.src.feature_engineering import (
    ADJ_FEATURE_COLUMNS, compute_adjudication_features,
)
from adjudication.src.policy import PolicyConfig, decide
from adjudication.src.reason_codes import top_adverse_shap

MODELS = Path("adjudication/models")
KEY_RATIO_COLS = ["dscr", "leverage", "current_ratio", "utilization", "debt_to_income"]


def load_artifacts():
    model = joblib.load(MODELS / "adjudication_model.pkl")
    config = PolicyConfig.from_dict(json.loads((MODELS / "policy_config.json").read_text()))
    metadata = json.loads((MODELS / "metadata.json").read_text())
    explainer = shap.TreeExplainer(model)
    return model, config, metadata, explainer


def baseline_row() -> dict:
    """Median-ish representative applicant used to fill missing What-If fields."""
    biz = pd.read_parquet(RAW / "businesses.parquet")
    num = biz.median(numeric_only=True).to_dict()
    cat = {c: biz[c].mode().iloc[0] for c in ["industry", "entity_type", "loan_purpose"]}
    return {**num, **cat}


def _shap_values(explainer, X):
    sv = explainer.shap_values(X)
    return sv[1] if isinstance(sv, list) else sv


def score_population(model, config, explainer) -> pd.DataFrame:
    """Score every applicant; return a DataFrame indexed by business_id with the
    decision record columns the API serves."""
    biz = pd.read_parquet(RAW / "businesses.parquet")
    feats = compute_adjudication_features(biz)
    X = feats[ADJ_FEATURE_COLUMNS]
    pd_model = model.predict_proba(X)[:, 1]
    dec = decide(feats, pd_model, config)
    sv = _shap_values(explainer, X)
    shap_reasons = top_adverse_shap(sv, ADJ_FEATURE_COLUMNS, k=3)

    out = pd.DataFrame({
        "business_id": biz["business_id"].astype(str).to_numpy(),
        "industry": biz["industry"].to_numpy(),
        "business_score": feats["business_score"].astype(int).to_numpy(),
        "score_band": feats["score_band"].astype(str).to_numpy(),
        "pd": np.round(pd_model, 4),
        "decision": dec["decision"].to_numpy(),
        "requested_amount": biz["requested_amount"].astype(float).to_numpy(),
        "rule_hits": dec["decision_reasons"].to_list(),
        "top_shap_reasons": shap_reasons,
    })
    for c in KEY_RATIO_COLS:
        out[c] = feats[c].astype(float).round(4).to_numpy()
    out.index = out["business_id"]
    return out


def record_to_detail(row: pd.Series) -> dict:
    return {
        "business_id": str(row["business_id"]),
        "decision": str(row["decision"]),
        "pd": float(row["pd"]),
        "business_score": int(row["business_score"]),
        "score_band": str(row["score_band"]),
        "industry": str(row["industry"]),
        "requested_amount": float(row["requested_amount"]),
        "key_ratios": {c: float(row[c]) for c in KEY_RATIO_COLS},
        "rule_hits": list(row["rule_hits"]),
        "top_shap_reasons": [{"feature": r["feature"], "impact": r["impact"]}
                             for r in row["top_shap_reasons"]],
    }


def decide_one(payload: dict, baseline: dict, model, config, explainer) -> dict:
    """What-If: fill missing fields from baseline, recompute the full decision."""
    row = {**baseline, **{k: v for k, v in payload.items() if v is not None}}
    row.setdefault("business_id", "WHATIF")
    df = pd.DataFrame([row])
    scored = score_population.__wrapped__ if hasattr(score_population, "__wrapped__") else None  # noqa
    feats = compute_adjudication_features(df)
    X = feats[ADJ_FEATURE_COLUMNS]
    pd_model = model.predict_proba(X)[:, 1]
    dec = decide(feats, pd_model, config)
    sv = _shap_values(explainer, X)
    shap_reasons = top_adverse_shap(sv, ADJ_FEATURE_COLUMNS, k=3)
    rec = pd.Series({
        "business_id": "WHATIF",
        "decision": dec["decision"].iloc[0],
        "pd": round(float(pd_model[0]), 4),
        "business_score": int(feats["business_score"].iloc[0]),
        "score_band": str(feats["score_band"].iloc[0]),
        "industry": str(row["industry"]),
        "requested_amount": float(row["requested_amount"]),
        "rule_hits": dec["decision_reasons"].iloc[0],
        "top_shap_reasons": shap_reasons[0],
        **{c: float(feats[c].iloc[0]) for c in KEY_RATIO_COLS},
    })
    return record_to_detail(rec)


def segments(df: pd.DataFrame) -> dict:
    def _mix(group_col):
        rows = []
        for key, g in df.groupby(group_col):
            vc = g["decision"].value_counts(normalize=True)
            rows.append({
                "key": str(key),
                "approve": round(float(vc.get("Approve", 0.0)), 4),
                "refer": round(float(vc.get("Refer", 0.0)), 4),
                "decline": round(float(vc.get("Decline", 0.0)), 4),
                "count": int(len(g)),
            })
        return sorted(rows, key=lambda r: r["key"])
    return {"by_band": _mix("score_band"), "by_industry": _mix("industry")}
```

NOTE: remove the dead `scored = ...` line if it confuses you — it is a no-op guard; the real path is the `feats = compute_adjudication_features(df)` below it. Cleaner: delete that line entirely. (Kept here only to flag the controller's note; the implementer SHOULD delete it.)

- [ ] **Step 4: Write `portal/server/main.py`**

```python
"""Adjudication portal FastAPI app. Loads Module 0/1 artifacts at startup, scores the
whole applicant population, caches it in app.state, and serves the Adjudication API."""
from __future__ import annotations
import os
import sys
from contextlib import asynccontextmanager

# Make shared/score/adjudication/portal importable when run from anywhere.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from portal.server import service
from portal.server.schemas import (
    AdjudicationDetail, DecideRequest, HealthResponse,
    PaginatedApplications, SegmentsResponse,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    model, config, metadata, explainer = service.load_artifacts()
    app.state.model = model
    app.state.config = config
    app.state.metadata = metadata
    app.state.explainer = explainer
    app.state.baseline = service.baseline_row()
    app.state.pop = service.score_population(model, config, explainer)
    yield


app = FastAPI(title="Adjudication Portal", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health", response_model=HealthResponse)
def health():
    m = app.state.metadata["metrics"]
    return HealthResponse(status="ok", n_applicants=int(len(app.state.pop)),
                          model_auc=float(m["auc"]), top20_lift=float(m["top20_lift"]))


@app.get("/api/adjudication/applications", response_model=PaginatedApplications)
def applications(page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=500),
                 decision: str | None = None):
    df = app.state.pop
    if decision:
        df = df[df["decision"] == decision]
    total = len(df)
    pages = max(1, (total + per_page - 1) // per_page)
    start = (page - 1) * per_page
    sl = df.iloc[start:start + per_page]
    items = [{"business_id": r["business_id"], "industry": r["industry"],
              "business_score": int(r["business_score"]), "pd": float(r["pd"]),
              "decision": r["decision"], "requested_amount": float(r["requested_amount"])}
             for _, r in sl.iterrows()]
    return {"items": items, "page": page, "pages": pages, "total": total}


@app.get("/api/adjudication/segments", response_model=SegmentsResponse)
def segments():
    return service.segments(app.state.pop)


@app.get("/api/adjudication/{business_id}", response_model=AdjudicationDetail)
def detail(business_id: str):
    df = app.state.pop
    if business_id not in df.index:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": business_id})
    return service.record_to_detail(df.loc[business_id])


@app.post("/api/adjudication/decide", response_model=AdjudicationDetail)
def decide_endpoint(req: DecideRequest):
    return service.decide_one(req.model_dump(), app.state.baseline,
                              app.state.model, app.state.config, app.state.explainer)
```

IMPORTANT: route ordering — `/api/adjudication/segments` MUST be declared BEFORE `/api/adjudication/{business_id}` so "segments" isn't captured as an id. (It is, above. Keep it that way.)

- [ ] **Step 5: Smoke-run the app**

Run (background): `./.venv/bin/uvicorn portal.server.main:app --port 8100 &` then after ~8s:
`curl -s localhost:8100/health` → expect `{"status":"ok","n_applicants":12000,...}`.
`curl -s 'localhost:8100/api/adjudication/applications?per_page=2'` → expect items/pages/total.
Then kill the uvicorn process. If imports fail, confirm you launched from the repo root.

- [ ] **Step 6: Commit**

```bash
git add portal/__init__.py portal/server/__init__.py portal/server/tests/__init__.py \
  portal/server/schemas.py portal/server/service.py portal/server/main.py
git commit -m "feat(portal): Adjudication FastAPI backend (lifespan scoring + 5 routes)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Backend API tests

**Files:**
- Create: `portal/server/tests/test_api.py`
- Modify: `pytest.ini` (add `portal/server/tests` to testpaths)

- [ ] **Step 1: Write `portal/server/tests/test_api.py`**

```python
import pytest
from fastapi.testclient import TestClient

from portal.server.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:  # triggers lifespan (loads + scores population)
        yield c


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["n_applicants"] == 12000


def test_applications_pagination_shape(client):
    r = client.get("/api/adjudication/applications", params={"per_page": 10})
    assert r.status_code == 200
    body = r.json()
    assert set(body) >= {"items", "page", "pages", "total"}
    assert len(body["items"]) <= 10
    item = body["items"][0]
    assert set(item) >= {"business_id", "industry", "business_score", "pd",
                         "decision", "requested_amount"}


def test_applications_decision_filter(client):
    r = client.get("/api/adjudication/applications",
                   params={"decision": "Decline", "per_page": 25})
    assert r.status_code == 200
    assert all(i["decision"] == "Decline" for i in r.json()["items"])


def test_detail_known_and_unknown(client):
    first = client.get("/api/adjudication/applications",
                       params={"per_page": 1}).json()["items"][0]
    bid = first["business_id"]
    r = client.get(f"/api/adjudication/{bid}")
    assert r.status_code == 200
    body = r.json()
    assert body["decision"] in {"Approve", "Refer", "Decline"}
    assert "pd" in body and "business_score" in body and "key_ratios" in body
    assert set(body["key_ratios"]) >= {"dscr", "leverage", "current_ratio",
                                       "utilization", "debt_to_income"}
    assert client.get("/api/adjudication/NOPE-NONE").status_code == 404


def test_decide_flips_with_inputs(client):
    bad = client.post("/api/adjudication/decide",
                      json={"dscr": 0.5, "requested_amount": 100000}).json()
    assert bad["decision"] == "Decline"
    assert any("dscr" in h.lower() for h in bad["rule_hits"])
    good = client.post("/api/adjudication/decide", json={
        "dscr": 3.0, "leverage": 0.5, "current_ratio": 2.5, "utilization": 0.1,
        "prior_delinquencies": 0, "public_records": 0, "annual_revenue": 5_000_000,
        "net_income": 800_000, "total_debt": 400_000, "requested_amount": 100_000,
    }).json()
    assert good["decision"] in {"Approve", "Refer"}


def test_segments_shape(client):
    body = client.get("/api/adjudication/segments").json()
    assert "by_band" in body and "by_industry" in body
    row = body["by_band"][0]
    assert abs(row["approve"] + row["refer"] + row["decline"] - 1.0) < 0.02
```

- [ ] **Step 2: Add the test path** — edit `pytest.ini` line `testpaths = ...` to append ` portal/server/tests`.

- [ ] **Step 3: Run the API tests**

Run: `./.venv/bin/pytest portal/server/tests/test_api.py -v`
Expected: 6 passed. (First run loads + scores the population once via the fixture — a few seconds.)

- [ ] **Step 4: Commit**

```bash
git add portal/server/tests/test_api.py pytest.ini
git commit -m "test(portal): Adjudication API endpoint tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Client scaffold + data layer + build smoke

**Files:** create the client build/config files, `src/main.jsx`, `src/index.css`, `src/lib/{api,constants,hooks}.js`. (Components/views are stubbed minimally so `vite build` passes; full UI lands in Tasks 4–5.)

- [ ] **Step 1: `portal/client/package.json`**

```json
{
  "name": "adjudication-portal-client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": {
    "axios": "^1.8.2",
    "lucide-react": "^0.475.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.15.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "vite": "^5.4.14"
  }
}
```

- [ ] **Step 2: `portal/client/vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: { '/api': { target: 'http://localhost:8100', changeOrigin: true } },
  },
});
```

- [ ] **Step 3: `portal/client/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 4: `portal/client/postcss.config.js`**

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 5: `portal/client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Adjudication Portal</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 6: `portal/client/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: `portal/client/src/main.jsx`**

```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')).render(<App />);
```

- [ ] **Step 8: `portal/client/src/lib/api.js`**

```js
import axios from 'axios';

// Relative baseURL → Vite dev server proxies /api to FastAPI:8100.
const api = axios.create({ baseURL: '' });

export async function fetchHealth() {
  return (await api.get('/health')).data;
}
export async function fetchApplications(page = 1, perPage = 50, decision = null) {
  const params = { page, per_page: perPage };
  if (decision) params.decision = decision;
  return (await api.get('/api/adjudication/applications', { params })).data;
}
export async function fetchApplication(id) {
  return (await api.get(`/api/adjudication/${id}`)).data;
}
export async function decide(payload) {
  return (await api.post('/api/adjudication/decide', payload)).data;
}
export async function fetchSegments() {
  return (await api.get('/api/adjudication/segments')).data;
}
```

- [ ] **Step 9: `portal/client/src/lib/constants.js`**

```js
export const DECISION_COLORS = {
  Approve: { bg: 'bg-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500' },
  Refer:   { bg: 'bg-amber-100',   text: 'text-amber-800',   dot: 'bg-amber-500' },
  Decline: { bg: 'bg-rose-100',    text: 'text-rose-800',    dot: 'bg-rose-500' },
};

export const SCORE_BANDS = ['D', 'C', 'B', 'A', 'AAA'];

// What-If sliders: [key, label, min, max, step]
export const WHATIF_FIELDS = [
  ['requested_amount', 'Requested Amount', 10000, 1000000, 5000],
  ['dscr', 'DSCR', 0.2, 4.0, 0.05],
  ['leverage', 'Leverage', 0.1, 8.0, 0.1],
  ['current_ratio', 'Current Ratio', 0.2, 4.0, 0.05],
  ['utilization', 'Utilization', 0.0, 1.0, 0.01],
  ['prior_delinquencies', 'Prior Delinquencies', 0, 6, 1],
  ['public_records', 'Public Records', 0, 3, 1],
  ['annual_revenue', 'Annual Revenue', 100000, 10000000, 50000],
];

export const WHATIF_DEFAULT = {
  requested_amount: 150000, dscr: 1.5, leverage: 2.0, current_ratio: 1.4,
  utilization: 0.4, prior_delinquencies: 0, public_records: 0, annual_revenue: 1200000,
};
```

- [ ] **Step 10: `portal/client/src/lib/hooks.js`**

```js
import { useCallback, useState } from 'react';
import { fetchApplication, fetchApplications, decide, fetchSegments, fetchHealth } from './api';

function asError(e) {
  return e.response?.data?.detail || { error: 'unknown', message: 'Request failed' };
}

export function useApplication() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const lookup = useCallback(async (id) => {
    if (!id) return;
    setLoading(true); setError(null);
    try { setData(await fetchApplication(id)); }
    catch (e) { setData(null); setError(asError(e)); }
    finally { setLoading(false); }
  }, []);
  return { data, error, loading, lookup };
}

export function useApplications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (decision = null) => {
    setLoading(true);
    try { setItems((await fetchApplications(1, 100, decision)).items || []); }
    finally { setLoading(false); }
  }, []);
  return { items, loading, load };
}

export function useDecide() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const run = useCallback(async (payload) => {
    setLoading(true);
    try { setData(await decide(payload)); }
    finally { setLoading(false); }
  }, []);
  return { data, loading, run };
}

export function useSegments() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchSegments()); }
    finally { setLoading(false); }
  }, []);
  return { data, loading, load };
}

export function useHealth() {
  const [data, setData] = useState(null);
  const load = useCallback(async () => { try { setData(await fetchHealth()); } catch { /* noop */ } }, []);
  return { data, load };
}
```

- [ ] **Step 11: Temporary minimal `src/App.jsx`** (replaced in Task 5; lets the build pass now)

```jsx
export default function App() {
  return <div className="p-8 text-slate-700">Adjudication Portal — scaffolding…</div>;
}
```

- [ ] **Step 12: Install deps + build smoke**

Run: `cd portal/client && npm install` (then back to repo root for git).
Run: `cd portal/client && npm run build` → expect a successful `dist/` build, then return to repo root.
If `npm` network install is unavailable in the sandbox, report DONE_WITH_CONCERNS noting the build step could not run, but ensure all files are written correctly.

- [ ] **Step 13: Ensure `portal/client/.gitignore`** contains `node_modules/` and `dist/` (repo root `.gitignore` already ignores both globally — verify; only add a local one if needed).

- [ ] **Step 14: Commit** (do NOT commit node_modules/dist)

```bash
git add portal/client/package.json portal/client/package-lock.json portal/client/vite.config.js \
  portal/client/tailwind.config.js portal/client/postcss.config.js portal/client/index.html \
  portal/client/src/main.jsx portal/client/src/index.css portal/client/src/App.jsx \
  portal/client/src/lib
git commit -m "feat(portal): client scaffold + data layer (Vite/React/Tailwind)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Components

**Files:** `portal/client/src/components/{Sidebar,Card,StatCard,DataTable,SliderControl,DecisionBadge,ReasonList,LoadingSpinner,ErrorBanner,ApplicantSelect}.jsx`

**Approach:** ADAPT the equivalent components from the reference
`/Users/aayan/zzLearnAndCreate/MarketingAnalytics/m03_churn/app/client/src/components/`
(read them). Keep them presentational and module-agnostic. Tailwind for styling, `lucide-react` for icons. Each component is a default export.

**Required contracts + `data-testid`s (Playwright depends on these — do not rename):**

- `Card({ title, children })` — titled white rounded card.
- `StatCard({ label, value, hint })` — big value; `data-testid="stat-<label-kebab>"` optional.
- `DecisionBadge({ decision })` — pill using `DECISION_COLORS[decision]`; render text = decision; **`data-testid="decision-badge"`**.
- `ReasonList({ ruleHits = [], shapReasons = [] })` — two short lists: "Policy rule hits" (strings) and "Top risk drivers" (feature + impact). Empty-state text when both empty.
- `SliderControl({ label, value, min, max, step, onChange })` — range input + numeric readout; **the `<input type="range">` must have `data-testid="slider-<key>"`** where the parent passes `testid`. So signature is `SliderControl({ testid, label, value, min, max, step, onChange })` and render `<input type="range" data-testid={testid} .../>`.
- `DataTable({ columns, rows, onRowClick })` — simple table; each row `data-testid="app-row"`.
- `ApplicantSelect({ value, onChange, onLookup })` — text input + "Look up" button; input `data-testid="applicant-input"`, button `data-testid="applicant-lookup"`.
- `Sidebar({ activeView, onNavigate })` — nav with items: Dashboard, Lookup, What-If, Segments (each a button calling `onNavigate('dashboard'|'lookup'|'whatif'|'segments')`, `data-testid="nav-<view>"`), plus DISABLED stub entries: Score, Pricing, Early Warning, Line Increase (rendered greyed, not clickable).
- `LoadingSpinner()` and `ErrorBanner({ error })` — trivial.

- [ ] **Step 1:** Write all ten components per the contracts above, adapting reference idioms.
- [ ] **Step 2:** Type-check by building: `cd portal/client && npm run build` → must succeed (App.jsx still the stub; components compile when imported in Task 5, but ensure no syntax errors by importing none yet — a clean build here just confirms no broken files). If a component is unused it won't be in the bundle; that's fine.
- [ ] **Step 3: Commit**

```bash
git add portal/client/src/components
git commit -m "feat(portal): presentational component library

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Views + App wiring

**Files:** `portal/client/src/views/{LookupView,WhatIfView,SegmentsView,Dashboard}.jsx` and rewrite `portal/client/src/App.jsx`.

**Adapt** the reference `m03_churn/app/client/src/views/` + `App.jsx` idioms.

- [ ] **Step 1: `LookupView`** — props `{ hook }` (a `useApplication()` result). Renders `ApplicantSelect` (calls `hook.lookup(id)`), `LoadingSpinner` while loading, `ErrorBanner` on error, and on data: `DecisionBadge`, `StatCard`s for PD and business_score (+ score_band, industry), a key-ratios `Card`, and `ReasonList`. Container `data-testid="view-lookup"`. Provide a hint that a valid id exists by also loading the first page of applications and showing a couple of clickable example ids (optional but nice).

- [ ] **Step 2: `WhatIfView`** — props `{ hook }` (a `useDecide()` result). Local state seeded from `WHATIF_DEFAULT`; render a `SliderControl` per `WHATIF_FIELDS` entry (pass `testid={`slider-${key}`}`); on any change update state and call `hook.run(state)` (debounce ~250ms). Show `DecisionBadge` + `ReasonList` from `hook.data`. Container `data-testid="view-whatif"`. On mount, call `hook.run(WHATIF_DEFAULT)` once so a decision shows immediately.

- [ ] **Step 3: `SegmentsView`** — props `{ hook }` (a `useSegments()` result). On mount `hook.load()`. Render two Recharts `BarChart`s (decision mix by score_band, by industry) using `approve`/`refer`/`decline` series with the decision colors. Container `data-testid="view-segments"`; ensure the chart wrapper has `data-testid="segments-chart"`.

- [ ] **Step 4: `Dashboard`** — props `{ hook }` (a `useHealth()` result). On mount `hook.load()`. Show `StatCard`s: total applicants (`n_applicants`), model AUC, top-20% lift, and a small note. Container `data-testid="view-dashboard"`.

- [ ] **Step 5: Rewrite `App.jsx`** to mirror the reference: `view` state (default `'lookup'`), instantiate the hooks, render `Sidebar` + the active view. Example:

```jsx
import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './views/Dashboard';
import LookupView from './views/LookupView';
import WhatIfView from './views/WhatIfView';
import SegmentsView from './views/SegmentsView';
import { useApplication, useDecide, useSegments, useHealth } from './lib/hooks';

export default function App() {
  const [view, setView] = useState('lookup');
  const application = useApplication();
  const decideHook = useDecide();
  const segments = useSegments();
  const health = useHealth();
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar activeView={view} onNavigate={setView} />
      <main className="flex-1 md:ml-56 p-6 md:p-8 max-w-5xl">
        {view === 'dashboard' && <Dashboard hook={health} />}
        {view === 'lookup' && <LookupView hook={application} />}
        {view === 'whatif' && <WhatIfView hook={decideHook} />}
        {view === 'segments' && <SegmentsView hook={segments} />}
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Build** — `cd portal/client && npm run build` → must succeed (now all views/components are imported and compiled).
- [ ] **Step 7: Commit**

```bash
git add portal/client/src/views portal/client/src/App.jsx
git commit -m "feat(portal): Lookup / What-If / Segments / Dashboard views

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Playwright gate (headless, boots both servers)

**Files:** `portal/client/playwright.config.js`, `portal/client/e2e/adjudication.spec.js`

- [ ] **Step 1: `portal/client/playwright.config.js`** — boot FastAPI + Vite via `webServer`, run chromium headless.

```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: { baseURL: 'http://localhost:5180' },
  webServer: [
    {
      command: 'cd ../.. && ./.venv/bin/uvicorn portal.server.main:app --port 8100',
      url: 'http://localhost:8100/health',
      timeout: 60000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5180',
      timeout: 60000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

- [ ] **Step 2: `portal/client/e2e/adjudication.spec.js`**

```js
import { test, expect } from '@playwright/test';

async function firstId(page) {
  const r = await page.request.get('http://localhost:8100/api/adjudication/applications?per_page=1');
  const body = await r.json();
  return body.items[0].business_id;
}

test('lookup shows a decision badge', async ({ page }) => {
  const id = await firstId(page);
  await page.goto('/');
  await page.getByTestId('nav-lookup').click();
  await page.getByTestId('applicant-input').fill(id);
  await page.getByTestId('applicant-lookup').click();
  await expect(page.getByTestId('decision-badge')).toBeVisible();
  await expect(page.getByTestId('decision-badge')).toHaveText(/Approve|Refer|Decline/);
});

test('what-if updates a decision when a slider changes', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-whatif').click();
  await expect(page.getByTestId('decision-badge')).toBeVisible();
  const slider = page.getByTestId('slider-dscr');
  await slider.fill('0.4');           // force unaffordable → Decline
  await expect(page.getByTestId('decision-badge')).toHaveText(/Decline/, { timeout: 5000 });
});

test('segments renders a chart', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-segments').click();
  await expect(page.getByTestId('segments-chart').first()).toBeVisible();
});
```

- [ ] **Step 3: Install the browser + run**

Run: `cd portal/client && npx playwright install chromium` (downloads the browser).
Run: `cd portal/client && npx playwright test` → expect 3 passed. Playwright boots uvicorn + Vite automatically.
If sliders are debounced, the What-If assertion uses a 5s timeout; if it flakes, ensure `WhatIfView` fires `hook.run` on slider `input`/`change`.
If the sandbox blocks the browser download or binding ports, report DONE_WITH_CONCERNS with the exact failure; the controller will run the gate.

- [ ] **Step 4: Commit** (playwright report/test-results are gitignored already)

```bash
git add portal/client/playwright.config.js portal/client/e2e/adjudication.spec.js
git commit -m "test(portal): Playwright smoke gate for the three views

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Full regression + ledger/log + tally

**Files:** `program_state.json`, `SESSION_LOG.md`

- [ ] **Step 1: Backend regression** — `./.venv/bin/pytest -q` → all pass (includes the 6 portal API tests now in testpaths).
- [ ] **Step 2: Confirm gates** — note the API test count, `vite build` success, and Playwright `3 passed` (or the controller-run result).
- [ ] **Step 3: Update `program_state.json`** — set `adjudication.tasks` `portal`=true and `gate`=true (Playwright done); set `adjudication.status`="completed"; append `"adjudication-portal"` to `completed_phases`; record portal artifacts + the API/Playwright counts in metrics; update `next_action` to "Phase Pricing (Module 2) — OR backfill Score module views into the portal; confirm with user"; bump `updated_at`/`session_status`.
- [ ] **Step 4: Append a Session entry to `SESSION_LOG.md`** — scope (Adjudication portal), endpoints, views, gate results, and the **per-task subagent token tally table** (the controller supplies the numbers), plus the resume command.
- [ ] **Step 5: Commit**

```bash
git add program_state.json SESSION_LOG.md
git commit -m "chore(portal): Adjudication portal complete — API+UI+Playwright, ledger updated

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: Stop and report** — status board, gate results, token tally; await user review before merge to `main` (mirror the prior phases).

---

## Self-Review notes
- **Spec coverage:** 5 endpoints (Task 1) ✓; lifespan population scoring + app.state cache (Task 1) ✓; items/pages pagination + top-level prediction fields (Tasks 1–2) ✓; API tests (Task 2) ✓; Vite-direct proxy, no Express (Task 3) ✓; component library + 3 views + Dashboard (Tasks 4–5) ✓; What-If live recompute (Tasks 1,5) ✓; Segments by band+industry (Tasks 1,5) ✓; Playwright gate booting both servers (Task 6) ✓; testpaths + ledger (Tasks 2,7) ✓. Cross-module 360 view / other modules deferred (spec "out of scope").
- **No logic duplication:** `service.py` only orchestrates Module 1 (`compute_adjudication_features`, `decide`, `top_adverse_shap`). The controller flagged the dead `scored = ...` line in `decide_one` for deletion.
- **Testid contracts:** the Playwright spec (Task 6) depends only on testids defined in Tasks 4–5 (`decision-badge`, `applicant-input/lookup`, `nav-*`, `slider-dscr`, `segments-chart`). Consistent.
- **Route ordering:** `/segments` before `/{business_id}` (Task 1) so it isn't captured as an id.
- **Reuse over rebuild:** components/views adapt the `m03_churn` reference (read-only) rather than being invented from scratch.
