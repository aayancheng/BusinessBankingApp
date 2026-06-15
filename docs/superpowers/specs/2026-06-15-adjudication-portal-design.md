# Adjudication Portal — Design

**Date:** 2026-06-15
**Status:** Approved design → ready for implementation planning
**Parent specs:** `docs/superpowers/specs/2026-06-14-business-banking-app-design.md` (§3 portal
architecture, Module 1 views) + `docs/superpowers/specs/2026-06-15-adjudication-design.md`
(Module 1 backend).
**Scope:** The project's first portal app — a shared FastAPI backend + React/Vite client,
wired for the **Adjudication** module's three views (Lookup / What-If / Segments) plus a
light Dashboard placeholder, with a Playwright gate. Extensible so later modules slot in.

## Decisions (user-confirmed)
- **Portal scope:** Adjudication slice on an extensible scaffold. Sidebar shows Adjudication
  active; later modules (Score, Pricing, EWS, Line-Increase) appear as disabled stubs.
- **Proxy:** Vite-direct — the Vite dev server proxies `/api` → FastAPI `:8100`. No Express
  tier (port 3100 unused). Two processes total.
- **Stack:** FastAPI + Pydantic backend; React 18 + Vite 5 + TailwindCSS 3 + Recharts +
  axios + lucide-react client (JSX, not TypeScript), mirroring the MarketingAnalytics
  `m03_churn` reference patterns.

---

## Architecture

```
Browser ──5180──> Vite (React client)
                    │  proxy /api/*
                    ▼
                  FastAPI :8100  (portal/server/main.py)
                    │  lifespan: load artifacts, score 12k applicants, cache app.state
                    ▼
        score/ + adjudication/ Python packages (reused, no logic duplicated)
```

At startup the FastAPI lifespan loads the scorecard + `adjudication_model.pkl` +
`policy_config.json` **once**, builds features for all ~12,000 applicants, runs the model
PD + policy `decide()` + SHAP reason codes, and caches the resulting DataFrame and a SHAP
`TreeExplainer` in `app.state`. All endpoints read from that cache (fast, deterministic).

**Critical reuse patterns (from MarketingAnalytics CLAUDE.md):** `sys.path` fix at the top
of `main.py` so `shared`/`score`/`adjudication` import; pagination response uses
`items`/`pages`; entity-detail returns prediction fields at the **top level** (not nested);
uvicorn is run from the directory containing the importable packages (the repo root).

---

## Backend — `portal/server/`

### Files
| File | Responsibility |
|------|----------------|
| `portal/server/__init__.py` | package marker |
| `portal/server/main.py` | FastAPI app, lifespan artifact loading + population scoring, routes |
| `portal/server/schemas.py` | Pydantic models |
| `portal/server/service.py` | pure glue: raw/edited applicant row → decision record (reuses Module 1) |
| `portal/server/tests/__init__.py` | marker |
| `portal/server/tests/test_api.py` | FastAPI `TestClient` endpoint tests |

### `service.py`
`score_applicants(df) -> pd.DataFrame` and `decide_one(row_dict) -> dict`:
- builds features via `adjudication.src.feature_engineering.compute_adjudication_features`,
- predicts PD with the loaded LightGBM model,
- runs `adjudication.src.policy.decide` with the persisted `PolicyConfig`,
- attaches reason codes via `adjudication.src.reason_codes` (SHAP adverse + rule hits).
Returns records shaped `{business_id, decision, pd, business_score, score_band,
key_ratios:{dscr,leverage,current_ratio,utilization,debt_to_income},
requested_amount, industry, rule_hits:[...], top_shap_reasons:[{feature,impact}]}`.
No business logic is reimplemented here — `service.py` only orchestrates Module 1 code.

### Endpoints
| Method/Path | Returns |
|-------------|---------|
| `GET /health` | `{status:"ok", n_applicants, model_auc, top20_lift}` (metrics from metadata.json) |
| `GET /api/adjudication/applications?page=&per_page=&decision=` | `PaginatedApplications` (`items`,`page`,`pages`,`total`); each item = `{business_id, industry, business_score, pd, decision, requested_amount}`; optional `decision` filter (Approve/Refer/Decline) |
| `GET /api/adjudication/{id}` | `AdjudicationDetail` — full decision record (prediction fields top-level); 404 if id unknown |
| `POST /api/adjudication/decide` | live recompute from an edited applicant payload → decision record (What-If) |
| `GET /api/adjudication/segments` | `{by_band:[{band, approve, refer, decline, count}], by_industry:[...]}` decision-rate breakdown |

### `schemas.py` (Pydantic)
`ApplicationListItem`, `PaginatedApplications`, `KeyRatios`, `ReasonItem`,
`AdjudicationDetail`, `DecideRequest` (optional-field applicant payload with sensible
defaults), `SegmentRow`, `SegmentsResponse`, `HealthResponse`.

### `tests/test_api.py` (FastAPI TestClient)
- `GET /health` → 200, status ok, n_applicants == 12000.
- `applications` → first page has `items`/`pages`, len ≤ per_page, item has required keys;
  `decision=Decline` filter returns only Decline items.
- `GET /{id}` for a known id → 200 with decision in {Approve,Refer,Decline} and top-level
  `pd`, `business_score`, `key_ratios`; unknown id → 404.
- `POST /decide` → a clearly-bad payload (dscr 0.5) returns Decline with a dscr rule hit; a
  strong payload returns Approve. Confirms What-If recompute path is live.
- `segments` → `by_band` rows sum the three rates to ~1.0 and cover present bands.

---

## Frontend — `portal/client/`

### Build/config files
`package.json` (deps: react, react-dom, axios, recharts, lucide-react; dev:
@vitejs/plugin-react, vite, tailwindcss, autoprefixer, postcss), `vite.config.js`
(port 5180, proxy `/api` → `http://localhost:8100`), `tailwind.config.js`,
`postcss.config.js`, `index.html`, `src/index.css`, `src/main.jsx`, `src/App.jsx`.

### `src/lib/`
- `api.js` — axios (baseURL `''`, so `/api/...` hits the Vite proxy): `fetchApplications`,
  `fetchApplication`, `decide`, `fetchSegments`, `fetchHealth`.
- `hooks.js` — `useApplications`, `useApplication`, `useDecide`, `useSegments`
  (loading/error/data state, mirrors reference `hooks.js`).
- `constants.js` — decision colors, What-If default payload, slider field defs, score-band
  list.

### `src/components/`
`Sidebar` (Adjudication active; other modules disabled stubs), `Card`, `StatCard`,
`DataTable`, `SliderControl`, `DecisionBadge` (Approve=green, Refer=amber, Decline=red),
`ReasonList` (rule hits + SHAP), `LoadingSpinner`, `ErrorBanner`, `ApplicantSelect`.

### `src/views/`
- **`LookupView`** — `ApplicantSelect` → fetch `/{id}`; show `DecisionBadge`, PD + score
  `StatCard`s, key-ratios card, `ReasonList`.
- **`WhatIfView`** — `SliderControl`s + select inputs for the application fields (requested
  amount, term, dscr, leverage, current_ratio, utilization, prior_delinquencies,
  public_records, business_score proxy via the underlying financials) → `POST /decide` (debounced)
  → live `DecisionBadge` + reasons.
- **`SegmentsView`** — Recharts stacked/grouped bars: decision mix by score_band and by
  industry, from `/segments`.
- **`Dashboard`** — light placeholder: total applications, decision-mix donut/bars, gate
  metrics (AUC, lift) from `/health`.

`App.jsx` holds `view` state and renders the active view; Sidebar switches views.

---

## Gate (this session)

1. **API tests** (`portal/server/tests/test_api.py`) pass under `./.venv/bin/pytest`
   (path added to `pytest.ini testpaths`).
2. **`vite build`** completes without error (client compiles).
3. **Playwright smoke** (token-efficient, `browser_snapshot`-first): with FastAPI + Vite
   running, assert (a) Lookup shows a decision badge for a known applicant, (b) a What-If
   slider change flips/updates the decision, (c) Segments renders a chart. Saved under
   `portal/client/e2e/adjudication.spec.{js,ts}` with `playwright.config.js`.

---

## Out of scope (deferred)
- Cross-module Dashboard / `GET /api/customer/{id}` 360 view.
- Score / Pricing / EWS / Line-Increase module views (sidebar stubs only).
- Express proxy tier; executive deck; production build/deploy.

## Success criteria
1. FastAPI serves all five Adjudication endpoints from the cached population; `/health` green.
2. The three views render real data and the What-If view recomputes decisions live.
3. API tests + Playwright smoke pass; `vite build` succeeds.
4. Scaffold is extensible (adding a module = new router + sidebar entry + views) with no
   Adjudication-specific assumptions baked into shared components.
5. No Module 0/1 logic duplicated in the portal; ledger + session log updated; committed.
