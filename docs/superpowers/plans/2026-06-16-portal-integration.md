# Portal Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tie the five built modules into one portal — a cross-module Dashboard, a `GET /api/customer/{id}` 360 view with its own nav entry, an HTML/CSS/JS demo deck, and end-to-end Playwright that captures screenshots for a teaching video.

**Architecture:** Pure aggregation over the four populations already cached in `app.state` (`pop`, `pricing_pop`, `ews_pop`, `li_pop`). Two new stateless service modules + two new routes; two new/rewritten React views + one nav entry; a self-contained HTML deck; one new e2e spec plus a shared screenshot helper wired into all specs. No new models, no data regeneration.

**Tech Stack:** FastAPI + Pydantic (backend), pytest (backend tests), React + Vite + Tailwind + axios + lucide-react (frontend), Playwright (e2e). Python venv at `./.venv`. Ports: FastAPI 8100, Vite 5180.

**Spec:** `docs/superpowers/specs/2026-06-16-portal-integration-design.md`

**Conventions to follow (already established in this repo):**
- Run pytest from repo root: `./.venv/bin/pytest -q`.
- Backend tests use FastAPI `TestClient` with the app's lifespan (see existing `portal/server/tests/test_*_api.py`).
- API detail records key off a DataFrame indexed by `business_id`.
- Booked accounts (Pricing/EWS/LineIncrease populations) are a strict subset of applicants (Adjudication population). `BIZ100000` is a known booked id.
- Frontend api fns live in `lib/api.js`, hooks in `lib/hooks.js`, views in `src/views/`.

---

## File Structure

**Create:**
- `portal/server/customer_service.py` — 360 aggregation over the 4 cached pops.
- `portal/server/dashboard_service.py` — cross-module KPI summary.
- `portal/server/tests/test_customer_api.py` — 360 endpoint tests.
- `portal/server/tests/test_dashboard_api.py` — dashboard summary tests.
- `portal/client/src/views/Customer360View.jsx` — 360 view.
- `docs/deck/index.html` — self-contained demo deck.
- `portal/client/e2e/_shot.js` — screenshot helper.
- `portal/client/e2e/customer_360.spec.js` — new e2e spec.

**Modify:**
- `portal/server/schemas.py` — add `DashboardSummary`, `Customer360` + nested optional blocks.
- `portal/server/main.py` — add 2 routes.
- `portal/client/src/views/Dashboard.jsx` — rewrite for cross-module KPIs.
- `portal/client/src/lib/api.js` — add `fetchDashboardSummary`, `fetchCustomer360`.
- `portal/client/src/lib/hooks.js` — add `useDashboardSummary`, `useCustomer360`.
- `portal/client/src/components/Sidebar.jsx` — add "Customer 360" nav entry.
- `portal/client/src/App.jsx` — route Dashboard (new hook) + Customer360.
- `portal/client/e2e/{adjudication,pricing,ews,line_increase}.spec.js` — wire screenshot helper.

---

## Task 1: Backend services + schemas + routes

**Files:**
- Create: `portal/server/dashboard_service.py`, `portal/server/customer_service.py`
- Modify: `portal/server/schemas.py`, `portal/server/main.py`

- [ ] **Step 1: Add schemas**

Append to `portal/server/schemas.py` (it already uses `from pydantic import BaseModel` and `Optional`-style typing — check the top of the file and reuse its import style; if it uses `X | None`, use that instead of `Optional`):

```python
class DashboardSummary(BaseModel):
    n_applicants: int
    model_auc: float
    pct_clears_hurdle: float
    n_high_risk: int
    n_eligible_offers: int
    status: str


class Customer360Profile(BaseModel):
    business_id: str
    industry: str
    booked: bool


class Customer360Score(BaseModel):
    business_score: int
    score_band: str


class Customer360Adjudication(BaseModel):
    decision: str
    pd: float
    top_reason: str | None = None


class Customer360Pricing(BaseModel):
    quoted_rate: float
    roe: float
    clears_hurdle: bool


class Customer360Ews(BaseModel):
    risk_tier: str
    deterioration_prob: float
    n_triggers: int


class Customer360LineIncrease(BaseModel):
    eligible: bool
    recommended_amount: float
    incremental_roe: float


class Customer360(BaseModel):
    profile: Customer360Profile
    score: Customer360Score
    adjudication: Customer360Adjudication
    pricing: Customer360Pricing | None = None
    ews: Customer360Ews | None = None
    line_increase: Customer360LineIncrease | None = None
    modules_present: list[str]
```

- [ ] **Step 2: Write `dashboard_service.py`**

```python
"""Cross-module KPI summary for the Dashboard. Pure aggregation over the cached
populations in app.state — no model loads."""
from __future__ import annotations
import pandas as pd

from pricing.src.engine import BASE_MARKET


def dashboard_summary(adj_pop: pd.DataFrame, pricing_pop: pd.DataFrame,
                      ews_pop: pd.DataFrame, li_pop: pd.DataFrame,
                      metadata: dict) -> dict:
    m = metadata["metrics"]
    pct_clears = float((pricing_pop["roe_at_quoted"] >= BASE_MARKET.roe_hurdle).mean())
    n_high_risk = int((ews_pop["risk_tier"] == "High").sum())
    n_eligible = int(li_pop["eligible"].sum())
    return {
        "n_applicants": int(len(adj_pop)),
        "model_auc": float(m["auc"]),
        "pct_clears_hurdle": round(pct_clears, 4),
        "n_high_risk": n_high_risk,
        "n_eligible_offers": n_eligible,
        "status": "ok",
    }
```

Note: confirm the pricing population column for quoted-rate ROE is `roe_at_quoted` (grep `pricing_service.py` / the cached `pricing_pop` builder — `load_population`). If the cached frame instead stores it under a different name, use that name. The EWS tier value is the string `"High"` (see `ews_service.detail_record`). The LineIncrease eligibility flag is the bool column `eligible`.

- [ ] **Step 3: Write `customer_service.py`**

```python
"""360-degree customer view: aggregate Score + Adjudication + Pricing + EWS +
Line-Increase for one business from the four cached populations. No model loads.
A business present in the adjudication population but not booked yields null
Pricing/EWS/LineIncrease sections."""
from __future__ import annotations
import pandas as pd

from portal.server import service, pricing_service, ews_service, line_increase_service


def _top_reason(reasons: list) -> str | None:
    if not reasons:
        return None
    r = reasons[0]
    return r.get("feature") if isinstance(r, dict) else str(r)


def customer_360(business_id: str, adj_pop: pd.DataFrame, pricing_pop: pd.DataFrame,
                 ews_pop: pd.DataFrame, li_pop: pd.DataFrame) -> dict | None:
    if business_id not in adj_pop.index:
        return None
    adj = service.record_to_detail(adj_pop.loc[business_id])
    booked = business_id in pricing_pop.index

    profile = {
        "business_id": business_id,
        "industry": adj["industry"],
        "booked": bool(booked),
    }
    score = {
        "business_score": int(adj["business_score"]),
        "score_band": str(adj["score_band"]),
    }
    adjudication = {
        "decision": adj["decision"],
        "pd": float(adj["pd"]),
        "top_reason": _top_reason(adj.get("top_shap_reasons", [])),
    }

    pricing = None
    pr = pricing_service.detail_record(business_id, pricing_pop)
    if pr is not None:
        pricing = {
            "quoted_rate": float(pr["quoted_rate"]),
            "roe": float(pr["roe_at_quoted"]),
            "clears_hurdle": bool(pr["clears_hurdle"]),
        }

    ews = None
    ew = ews_service.detail_record(business_id, ews_pop)
    if ew is not None:
        ews = {
            "risk_tier": str(ew["risk_tier"]),
            "deterioration_prob": float(ew["prob"]),
            "n_triggers": int(len(ew["triggers"])),
        }

    line_increase = None
    li = line_increase_service.detail_record(business_id, li_pop)
    if li is not None:
        line_increase = {
            "eligible": bool(li["eligible"]),
            "recommended_amount": float(li["recommended_amount"]),
            "incremental_roe": float(li["incremental"]["roe"]),
        }

    modules_present = ["score", "adjudication"]
    if pricing is not None:
        modules_present.append("pricing")
    if ews is not None:
        modules_present.append("ews")
    if line_increase is not None:
        modules_present.append("line_increase")

    return {
        "profile": profile, "score": score, "adjudication": adjudication,
        "pricing": pricing, "ews": ews, "line_increase": line_increase,
        "modules_present": modules_present,
    }
```

- [ ] **Step 4: Add routes to `main.py`**

Add the imports to the existing `from portal.server import ...` block and the `from portal.server.schemas import (...)` block:

```python
from portal.server import customer_service, dashboard_service
```
Add `DashboardSummary, Customer360` to the schemas import tuple.

Add the routes (place `/api/dashboard/summary` and `/api/customer/{business_id}` — distinct prefixes, no shadowing of existing module routes):

```python
@app.get("/api/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary_route():
    return dashboard_service.dashboard_summary(
        app.state.pop, app.state.pricing_pop, app.state.ews_pop,
        app.state.li_pop, app.state.metadata)


@app.get("/api/customer/{business_id}", response_model=Customer360)
def customer_360_route(business_id: str):
    rec = customer_service.customer_360(
        business_id, app.state.pop, app.state.pricing_pop,
        app.state.ews_pop, app.state.li_pop)
    if rec is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": business_id})
    return rec
```

- [ ] **Step 5: Smoke-check imports**

Run: `./.venv/bin/python -c "from portal.server import customer_service, dashboard_service; print('ok')"`
Expected: `ok` (no ImportError). If `roe_at_quoted` is wrong, fix per the grep in Step 2.

- [ ] **Step 6: Commit**

```bash
git add portal/server/customer_service.py portal/server/dashboard_service.py portal/server/schemas.py portal/server/main.py
git commit -m "feat(portal-integration): dashboard summary + customer 360 services and routes"
```

---

## Task 2: Backend tests (TDD-style: write, run, confirm)

**Files:**
- Create: `portal/server/tests/test_dashboard_api.py`, `portal/server/tests/test_customer_api.py`

Look at an existing test (e.g. `portal/server/tests/test_line_increase_api.py`) to copy the exact `TestClient` + lifespan fixture pattern this repo uses (it likely uses `with TestClient(app) as client:` so the lifespan runs). Reuse it verbatim.

- [ ] **Step 1: Write `test_dashboard_api.py`**

```python
from fastapi.testclient import TestClient
from portal.server.main import app


def test_dashboard_summary_fields():
    with TestClient(app) as client:
        r = client.get("/api/dashboard/summary")
        assert r.status_code == 200
        d = r.json()
        for k in ("n_applicants", "model_auc", "pct_clears_hurdle",
                  "n_high_risk", "n_eligible_offers", "status"):
            assert k in d
        assert d["status"] == "ok"
        assert d["n_applicants"] > 0
        assert 0.0 <= d["pct_clears_hurdle"] <= 1.0
        assert d["n_high_risk"] >= 0
        assert d["n_eligible_offers"] >= 0
```

- [ ] **Step 2: Write `test_customer_api.py`**

```python
from fastapi.testclient import TestClient
from portal.server.main import app

BOOKED_ID = "BIZ100000"  # known on-book account → all 5 modules present


def test_customer_360_booked_full():
    with TestClient(app) as client:
        r = client.get(f"/api/customer/{BOOKED_ID}")
        assert r.status_code == 200
        d = r.json()
        assert d["profile"]["business_id"] == BOOKED_ID
        assert d["profile"]["booked"] is True
        assert d["score"]["business_score"] > 0
        assert d["adjudication"]["decision"] in ("Approve", "Refer", "Decline")
        assert d["pricing"] is not None
        assert d["ews"] is not None
        assert d["line_increase"] is not None
        assert set(d["modules_present"]) == {
            "score", "adjudication", "pricing", "ews", "line_increase"}


def test_customer_360_applicant_only_has_null_booked_sections():
    """Find an applicant that is NOT booked and assert booked-only modules are null."""
    with TestClient(app) as client:
        # find a non-booked applicant via the adjudication list
        page = client.get("/api/adjudication/applications",
                          params={"page": 1, "per_page": 500}).json()
        non_booked = None
        for item in page["items"]:
            cid = item["business_id"]
            cand = client.get(f"/api/customer/{cid}").json()
            if not cand["profile"]["booked"]:
                non_booked = cand
                break
        assert non_booked is not None, "expected at least one non-booked applicant"
        assert non_booked["pricing"] is None
        assert non_booked["ews"] is None
        assert non_booked["line_increase"] is None
        assert non_booked["modules_present"] == ["score", "adjudication"]


def test_customer_360_unknown_id_404():
    with TestClient(app) as client:
        r = client.get("/api/customer/BIZ_DOES_NOT_EXIST")
        assert r.status_code == 404
```

If every applicant in the first 500 happens to be booked (unlikely — only 8,336 of 12,000 are booked), widen `per_page` or page through. The booked rate is ~69%, so a non-booked id appears quickly.

- [ ] **Step 3: Run the new tests**

Run: `./.venv/bin/pytest portal/server/tests/test_dashboard_api.py portal/server/tests/test_customer_api.py -v`
Expected: all PASS.

- [ ] **Step 4: Run the full suite (no regression)**

Run: `./.venv/bin/pytest -q`
Expected: previous 97 + new tests all pass (≥ ~101).

- [ ] **Step 5: Commit**

```bash
git add portal/server/tests/test_dashboard_api.py portal/server/tests/test_customer_api.py
git commit -m "test(portal-integration): dashboard + customer 360 API tests"
```

---

## Task 3: Dashboard view rewrite + api/hooks wiring

**Files:**
- Modify: `portal/client/src/lib/api.js`, `portal/client/src/lib/hooks.js`, `portal/client/src/views/Dashboard.jsx`, `portal/client/src/App.jsx`

- [ ] **Step 1: Add api fns** (append to `lib/api.js`)

```javascript
export async function fetchDashboardSummary() {
  return (await api.get('/api/dashboard/summary')).data;
}
export async function fetchCustomer360(id) {
  return (await api.get(`/api/customer/${id}`)).data;
}
```

- [ ] **Step 2: Add hooks** (in `lib/hooks.js` — add the two fns to the existing import from `./api`, then add the hooks)

```javascript
export function useDashboardSummary() {
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    try { setData(await fetchDashboardSummary()); } catch { /* noop */ }
  }, []);
  return { data, load };
}

export function useCustomer360() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const lookup = useCallback(async (id) => {
    if (!id) return;
    setLoading(true); setError(null);
    try { setData(await fetchCustomer360(id)); }
    catch (e) { setData(null); setError(e.response?.data?.detail || { message: 'Request failed' }); }
    finally { setLoading(false); }
  }, []);
  return { data, error, loading, lookup };
}
```
Update the import line at the top of `hooks.js` to include `fetchDashboardSummary, fetchCustomer360`.

- [ ] **Step 3: Rewrite `Dashboard.jsx`**

```javascript
import { useEffect } from 'react';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Dashboard({ hook }) {
  const { data, load } = hook;

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div data-testid="view-dashboard" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Portfolio Dashboard</h2>
        <p className="text-sm text-slate-500">
          One synthetic Business Credit Score feeding four decisions — adjudication,
          pricing, early warning, and proactive line increase.
        </p>
      </div>

      {!data && <LoadingSpinner />}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard label="Applicants Scored" value={data.n_applicants.toLocaleString()}
                      hint="Adjudication population" />
            <StatCard label="Model AUC" value={data.model_auc.toFixed(3)}
                      hint="Adjudication hold-out" />
            <StatCard label="Clears ROE Hurdle" value={`${(data.pct_clears_hurdle * 100).toFixed(1)}%`}
                      hint="Booked loans at quoted rate" />
            <StatCard label="High-Risk Accounts" value={data.n_high_risk.toLocaleString()}
                      hint="Early-warning watchlist (High tier)" />
            <StatCard label="Line-Increase Offers" value={data.n_eligible_offers.toLocaleString()}
                      hint="Eligible proactive offers" />
            <StatCard label="Status" value={data.status === 'ok' ? 'Live' : data.status}
                      hint="Backend health" />
          </div>

          <Card title="Five modules, one credit spine">
            <p className="text-sm text-slate-600 leading-relaxed">
              A shared Business Credit Score (WoE + logistic scorecard) is the foundation. On
              top of it, four gradient-boosted decision apps run the SME lending lifecycle:
              <span className="font-medium text-slate-700"> Adjudication</span> (approve / refer /
              decline), <span className="font-medium text-slate-700">Pricing &amp; Profitability</span>
              {' '}(ROE / RAROC), <span className="font-medium text-slate-700">Early Warning</span>
              {' '}(deterioration triggers), and <span className="font-medium text-slate-700">
              Proactive Line Increase</span> (incremental-ROE-gated offers). Open
              <span className="font-medium text-slate-700"> Customer 360</span> to see all five
              for a single business.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire the new hook in `App.jsx`**

Change the Dashboard wiring to use `useDashboardSummary` instead of `useHealth`:
- Add `useDashboardSummary` (and `useCustomer360`, used in Task 4) to the import from `./lib/hooks`.
- Replace `const health = useHealth();` usage for Dashboard: add `const dashboard = useDashboardSummary();` and change the render line to `{nav.module === 'dashboard' && <Dashboard hook={dashboard} />}`. (Leave `useHealth` import/usage removed if now unused — verify no other consumer.)

- [ ] **Step 5: Build**

Run: `cd portal/client && npm run build`
Expected: build succeeds (no unresolved imports / lint-fatal errors).

- [ ] **Step 6: Commit**

```bash
git add portal/client/src/lib/api.js portal/client/src/lib/hooks.js portal/client/src/views/Dashboard.jsx portal/client/src/App.jsx
git commit -m "feat(portal-integration): cross-module dashboard view"
```

---

## Task 4: Customer 360 view + nav entry

**Files:**
- Create: `portal/client/src/views/Customer360View.jsx`
- Modify: `portal/client/src/components/Sidebar.jsx`, `portal/client/src/App.jsx`

- [ ] **Step 1: Write `Customer360View.jsx`**

Reuse existing components where they fit: `Card`, `DecisionBadge` (adjudication), `PassFailBadge` (pricing clears_hurdle), `RiskTierBadge` (ews). Check each badge's prop name before using (e.g. `DecisionBadge` likely takes `decision`, `PassFailBadge` takes a boolean/`pass` prop, `RiskTierBadge` takes `tier`/`risk_tier` — open the files to confirm exact prop names).

```javascript
import { useEffect, useState } from 'react';
import Card from '../components/Card';
import DecisionBadge from '../components/DecisionBadge';
import PassFailBadge from '../components/PassFailBadge';
import RiskTierBadge from '../components/RiskTierBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorBanner from '../components/ErrorBanner';

const SEED_ID = 'BIZ100000';
const usd = (n) => `$${Math.round(n).toLocaleString()}`;
const pct = (n) => `${(n * 100).toFixed(1)}%`;

function NotBooked({ title }) {
  return (
    <Card title={title}>
      <p className="text-sm text-slate-400 italic">Not an on-book account — module not applicable.</p>
    </Card>
  );
}

export default function Customer360View({ hook }) {
  const { data, error, loading, lookup } = hook;
  const [id, setId] = useState(SEED_ID);

  useEffect(() => { lookup(SEED_ID); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e) => { e.preventDefault(); lookup(id.trim()); };

  return (
    <div data-testid="view-customer360" className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Customer 360</h2>
        <p className="text-sm text-slate-500">
          One business across all five modules — score, adjudication, pricing, early warning, line increase.
        </p>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <input
          data-testid="c360-input"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="Business ID (e.g. BIZ100000)"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button data-testid="c360-load" type="submit"
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Load
        </button>
      </form>

      {loading && <LoadingSpinner />}
      {error && <ErrorBanner message={error.message || 'No business found for that id'} />}

      {data && (
        <div className="space-y-4">
          <Card title="Profile">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-700">
              <span><span className="text-slate-400">ID</span> {data.profile.business_id}</span>
              <span><span className="text-slate-400">Industry</span> {data.profile.industry}</span>
              <span><span className="text-slate-400">On book</span> {data.profile.booked ? 'Yes' : 'No'}</span>
              <span className="ml-auto text-2xl font-bold text-slate-800">
                {data.score.business_score}
                <span className="ml-2 text-sm font-medium text-slate-400">{data.score.score_band}</span>
              </span>
            </div>
          </Card>

          <Card title="Adjudication" data-testid="card-360-adjudication">
            <div className="flex items-center gap-4 text-sm">
              <DecisionBadge decision={data.adjudication.decision} />
              <span className="text-slate-500">PD {pct(data.adjudication.pd)}</span>
              {data.adjudication.top_reason &&
                <span className="text-slate-400">Top driver: {data.adjudication.top_reason}</span>}
            </div>
          </Card>

          {data.pricing ? (
            <Card title="Pricing & Profitability" data-testid="card-360-pricing">
              <div className="flex items-center gap-4 text-sm">
                <PassFailBadge pass={data.pricing.clears_hurdle} />
                <span className="text-slate-500">Quoted {pct(data.pricing.quoted_rate)}</span>
                <span className="text-slate-500">ROE {pct(data.pricing.roe)}</span>
              </div>
            </Card>
          ) : <div data-testid="card-360-pricing"><NotBooked title="Pricing & Profitability" /></div>}

          {data.ews ? (
            <Card title="Early Warning" data-testid="card-360-ews">
              <div className="flex items-center gap-4 text-sm">
                <RiskTierBadge tier={data.ews.risk_tier} />
                <span className="text-slate-500">Deterioration {pct(data.ews.deterioration_prob)}</span>
                <span className="text-slate-500">{data.ews.n_triggers} trigger(s)</span>
              </div>
            </Card>
          ) : <div data-testid="card-360-ews"><NotBooked title="Early Warning" /></div>}

          {data.line_increase ? (
            <Card title="Proactive Line Increase" data-testid="card-360-line_increase">
              <div className="flex items-center gap-4 text-sm">
                <span className={`font-medium ${data.line_increase.eligible ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {data.line_increase.eligible ? 'Offer eligible' : 'Not eligible'}
                </span>
                {data.line_increase.eligible && <>
                  <span className="text-slate-500">+{usd(data.line_increase.recommended_amount)}</span>
                  <span className="text-slate-500">Incr. ROE {pct(data.line_increase.incremental_roe)}</span>
                </>}
              </div>
            </Card>
          ) : <div data-testid="card-360-line_increase"><NotBooked title="Proactive Line Increase" /></div>}
        </div>
      )}
    </div>
  );
}
```

If `Card` does not forward `data-testid`, wrap each card in a `<div data-testid=...>` instead of passing the prop (the non-booked branches already do this). Confirm by reading `Card.jsx`; pick one consistent approach for all five cards so the e2e selectors are stable.

- [ ] **Step 2: Add the nav entry in `Sidebar.jsx`**

Add `Layers` (or another available lucide icon, e.g. `UserSearch`) to the import. Add a Customer 360 button directly under the Dashboard button (its own top-level item, before the Adjudication group):

```javascript
<button
  data-testid="nav-customer360"
  onClick={() => onNavigate?.('customer360', 'customer360')}
  className={itemClass(module === 'customer360')}
>
  <Layers size={17} />
  Customer 360
</button>
```

- [ ] **Step 3: Route it in `App.jsx`**

- Add `import Customer360View from './views/Customer360View';`
- Ensure `useCustomer360` is imported from `./lib/hooks`; add `const customer360 = useCustomer360();`
- Add render line: `{nav.module === 'customer360' && <Customer360View hook={customer360} />}`

- [ ] **Step 4: Build**

Run: `cd portal/client && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add portal/client/src/views/Customer360View.jsx portal/client/src/components/Sidebar.jsx portal/client/src/App.jsx
git commit -m "feat(portal-integration): customer 360 view + nav entry"
```

---

## Task 5: HTML demo deck

**Files:**
- Create: `docs/deck/index.html`

- [ ] **Step 1: Write a self-contained deck**

Single file, inline `<style>` and `<script>`, no external network/CDN. Requirements:
- A `.slide` per section; only the active slide visible. Navigate with ← / → keys and on-screen Prev/Next buttons; show a slide counter (e.g. "3 / 10").
- Tasteful dark title slide; readable light content slides; large metric numbers.
- Slides and their real numbers (pull from `program_state.json` / `SESSION_LOG.md`):
  1. **Title** — "Business Banking, Built with Claude Code" · subtitle "Five decision apps over one synthetic credit score — spec → plan → build → verify."
  2. **The spine** — one Business Credit Score (AUC 0.818, KS 0.495) feeding four decisions; fully synthetic data (12,000 businesses, 24-month panel).
  3. **Adjudication** — LightGBM + policy layer; AUC 0.810, top-20% lift 2.86×; Approve/Refer/Decline with SHAP reason codes.
  4. **Pricing & Profitability** — EL + ROE/RAROC waterfall; only 30.4% of booked loans clear the 15% ROE hurdle at quoted rate.
  5. **Early Warning** — behavioral-panel deterioration model; top-decile capture 2.16×, PR-AUC 0.308; risk-tier watchlist.
  6. **Proactive Line Increase** — candidate model + incremental-ROE gate; AUC 0.813; offered cohort PD 0.036 vs book 0.117; aggregate incremental ROE 0.215.
  7. **Customer 360** — all five modules for one business from a single API call over cached populations.
  8. **How it was built — plan → execute → verify** — brainstorm → spec → plan → subagent-driven build with two-stage review; ~70 subagent dispatches across 7 sessions; the **two genuine BLOCK escalations** (EWS + Line-Increase noise-capped synthetic targets) where subagents refused to game an unreachable metric gate — the governance headline.
  9. **Verification** — 97+ backend pytest, end-to-end Playwright (with screenshots), vite build; green on every `--no-ff` merge to main.
  10. **Close** — speed-to-market with Claude Code, on fully synthetic data; the program ledger (`program_state.json`) as the resumable source of truth.

Keep total under ~400 lines. Use a restrained palette (slate/emerald to match the portal).

- [ ] **Step 2: Sanity check**

Run: `./.venv/bin/python -c "import pathlib,html.parser as h; p=pathlib.Path('docs/deck/index.html').read_text(); assert '<script' in p and 'slide' in p and len(p)>2000; print('deck ok', len(p))"`
Expected: `deck ok <n>`. (Optional manual check: open the file in a browser, arrow through all 10 slides.)

- [ ] **Step 3: Commit**

```bash
git add docs/deck/index.html
git commit -m "docs(portal-integration): HTML demo deck — plan/execute/verify story"
```

---

## Task 6: Screenshot helper + e2e + wire screenshots into all specs

**Files:**
- Create: `portal/client/e2e/_shot.js`, `portal/client/e2e/customer_360.spec.js`
- Modify: `portal/client/e2e/{adjudication,pricing,ews,line_increase}.spec.js`
- Output dir (committed): `docs/screenshots/e2e/<module>/`

First read `portal/client/playwright.config.js` and one existing spec to match the base URL, web-server setup, and selector conventions (testids).

- [ ] **Step 1: Write the screenshot helper `_shot.js`**

```javascript
// Saves full-page screenshots into the committed docs/screenshots/e2e tree so we
// have an ordered image set for a teaching video. Each module gets its own folder.
import path from 'path';

const ROOT = path.resolve(process.cwd(), '../../docs/screenshots/e2e');

export async function shot(page, module, step) {
  const safe = String(step).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  await page.screenshot({
    path: path.join(ROOT, module, `${safe}.png`),
    fullPage: true,
  });
}
```

Note: `process.cwd()` for Playwright is `portal/client`, so `../../docs/...` resolves to repo-root `docs/`. Verify by checking `playwright.config.js` for any `cwd`/`testDir` that would change this; adjust the relative path if needed.

- [ ] **Step 2: Write `customer_360.spec.js`**

```javascript
import { test, expect } from '@playwright/test';
import { shot } from './_shot.js';

const M = 'customer_360';

test('dashboard shows cross-module KPIs', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-dashboard').click();
  await expect(page.getByTestId('view-dashboard')).toBeVisible();
  await expect(page.getByTestId('stat-applicants-scored')).toBeVisible();
  await shot(page, M, '01-dashboard');
});

test('customer 360 renders all five modules for a booked account', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-customer360').click();
  await expect(page.getByTestId('view-customer360')).toBeVisible();
  await shot(page, M, '02-customer360-seed');
  // seeded with BIZ100000 (booked) on mount
  await expect(page.getByTestId('card-360-adjudication')).toBeVisible();
  await expect(page.getByTestId('card-360-pricing')).toBeVisible();
  await expect(page.getByTestId('card-360-ews')).toBeVisible();
  await expect(page.getByTestId('card-360-line_increase')).toBeVisible();
  await shot(page, M, '03-customer360-booked-full');
});
```

(The booked seed `BIZ100000` proves the full 5-module render; the non-booked muted state is covered by the backend test. If you want UI coverage of the non-booked state too, add a third test that types a known applicant-only id — optional.)

- [ ] **Step 3: Wire `shot()` into the existing four specs**

For each of `adjudication.spec.js`, `pricing.spec.js`, `ews.spec.js`, `line_increase.spec.js`: add `import { shot } from './_shot.js';` and insert `await shot(page, '<module>', 'NN-<step>');` after each meaningful assertion (view loaded, lookup/detail result, what-if/simulate result, segments/portfolio chart, watchlist/candidates table). Use the module folder names `adjudication`, `pricing`, `ews`, `line_increase`. Do not change any existing assertions — only add screenshot lines.

- [ ] **Step 4: Add a `.gitkeep` so the dir is tracked even before first run**

```bash
mkdir -p docs/screenshots/e2e
printf '%s\n' 'Playwright e2e screenshots (regenerated by the e2e suite) — kept for the teaching video.' > docs/screenshots/e2e/README.md
```

- [ ] **Step 5: Run the full e2e suite**

Run: `cd portal/client && npx playwright test`
Expected: all specs pass (existing 12 + customer_360's 2). Screenshots appear under `docs/screenshots/e2e/<module>/`.

If the dev server isn't auto-started by `playwright.config.js`, start the backend + vite first (see `verify_main_command` in `program_state.json`): `./.venv/bin/uvicorn portal.server.main:app --port 8100` and `(cd portal/client && npm run dev)`.

- [ ] **Step 6: Verify screenshots were written**

Run: `ls -R docs/screenshots/e2e`
Expected: PNGs under each module folder.

- [ ] **Step 7: Final full backend run (no regression)**

Run: `./.venv/bin/pytest -q`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add portal/client/e2e docs/screenshots/e2e
git commit -m "test(portal-integration): customer 360 e2e + screenshot capture across all specs"
```

---

## Final controller steps (after all tasks pass review)

- Update `program_state.json`: mark `portal_integration` `completed`, set program status to COMPLETE, fill phase metrics/artifacts.
- Append the Session 7 entry to `SESSION_LOG.md` with the subagent token tally.
- **Stop for user review before the `--no-ff` merge to `main`.**

---

## Self-Review (against the spec)

- **Spec coverage:** Dashboard (T3), `/api/customer/{id}` 360 + nav entry (T1/T2/T4), HTML deck (T5), e2e + screenshots across all specs (T6), backend tests incl. booked/non-booked/404 (T2). All covered.
- **Booked subset edge case:** handled — non-booked → null Pricing/EWS/LineIncrease, asserted in T2 and rendered as muted state in T4.
- **No new models / no data regen:** honored (pure aggregation over cached pops).
- **Type consistency:** `roe_at_quoted`→`roe`, `prob`→`deterioration_prob`, `triggers`→`n_triggers`, `incremental.roe`→`incremental_roe` — mapped consistently across service (T1), tests (T2), and view (T4). `modules_present` list used identically in T1 service and T4 view.
- **Verification flag:** `roe_at_quoted` column name on the cached pricing pop is the one runtime risk; Step 2/Task 1 instructs a grep to confirm before relying on it.
