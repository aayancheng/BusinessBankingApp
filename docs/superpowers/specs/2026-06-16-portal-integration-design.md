# Portal Integration — Design Spec

**Date:** 2026-06-16
**Phase:** `portal_integration` (final phase; Modules 0–4 already merged to `main`)
**Branch:** `build/portal-integration`
**Status:** Approved by user 2026-06-16

## Goal

Tie the five already-built modules (shared Business Credit Score + Adjudication, Pricing,
Early-Warning, Proactive Line Increase) into a single integrated portal experience and a
demo/teaching artifact. Four deliverables:

1. A **cross-module Dashboard** replacing the adjudication-only placeholder.
2. A **`GET /api/customer/{id}` 360 view** aggregating all five modules for one business,
   surfaced as a dedicated **"Customer 360"** nav entry.
3. An **HTML/CSS/JS slide deck** showcasing the full **plan → execute → verify** development
   cycle with Claude (the build *method* is the hero, not just the banking features).
4. **End-to-end Playwright** that walks one business across all modules, **capturing
   screenshots** at each step for a later teaching video.

No new models are trained. This phase is pure integration over the cached populations.

## Key data fact (drives the 360 design)

- `businesses.parquet` = **12,000** applicants. Adjudication scores all of them.
- `portfolio.parquet` = **8,336 booked** accounts — a strict subset of businesses
  (`booked == True`). Pricing, EWS, and Line-Increase operate only on booked accounts.

Therefore for a given `business_id`:
- A **booked** account lights up all five modules.
- An **applicant-only** (non-booked) business has Score + Adjudication only; Pricing / EWS /
  Line-Increase sections are absent and must render a muted "Not an on-book account" state.

Seed/demo id: `BIZ100000` (a known booked account → full 5-module render).

## Backend

### `portal/server/customer_service.py` (new)
Pure aggregation over the four cached populations already in `app.state`
(`pop`, `pricing_pop`, `ews_pop`, `li_pop` — see `portal/server/main.py` lifespan). No model
loads, no new artifacts.

`customer_360(business_id, adj_pop, pricing_pop, ews_pop, li_pop) -> dict | None`
- Returns `None` if `business_id` is not in the adjudication population (not a real business →
  route raises 404).
- Else returns a `Customer360` envelope:
  - `profile`: `business_id`, `industry`, `region`, `annual_revenue`, `booked` (bool)
  - `score`: `business_score` (int), `score_band` (e.g. Poor/Fair/Good/Excellent from existing
    bands)
  - `adjudication`: `decision`, `pd`, `top_reason` (first reason code) — always present
  - `pricing`: `null` if not booked, else `{ quoted_rate, roe, clears_hurdle }`
  - `ews`: `null` if not booked, else `{ risk_tier, deterioration_prob, n_triggers }`
  - `line_increase`: `null` if not booked, else
    `{ eligible, recommended_amount, incremental_roe }`
  - `modules_present`: list[str] of the non-null module keys (UI uses this to decide which
    cards to render fully)

Reuse the existing per-module detail/record helpers in `service.py`, `pricing_service.py`,
`ews_service.py`, `line_increase_service.py` rather than recomputing. Where a module's
`detail_record` returns `None` for a non-booked id, map that to a `null` section (not an
error).

### `portal/server/dashboard_service.py` (new)
`dashboard_summary(adj_pop, pricing_pop, ews_pop, li_pop, metadata) -> dict` returning one
headline number per module for the KPI strip:
- `n_applicants`, `model_auc` (Adjudication)
- `pct_clears_hurdle` (Pricing — share of booked clearing the ROE hurdle)
- `n_high_risk` (EWS — count in the high risk tier)
- `n_eligible_offers` (Line-Increase — count of eligible candidates)
- `status` ("ok")

### Routes (add to `portal/server/main.py`)
- `GET /api/dashboard/summary -> DashboardSummary`
- `GET /api/customer/{business_id} -> Customer360` (404 when id not a real business)

Both read only from `app.state`. Place the `/api/customer/{id}` route so it does not shadow
existing `/api/<module>/{id}` routes (distinct prefix — fine).

### Schemas (`portal/server/schemas.py`)
Add `DashboardSummary`, `Customer360`, and the nested optional blocks
(`Customer360Pricing`, `Customer360Ews`, `Customer360LineIncrease`) with the module sections
as `Optional[...] = None`.

## Frontend

### Dashboard view (`portal/client/src/views/Dashboard.jsx`, rewrite)
Replace the adjudication-only copy. Single call to `/api/dashboard/summary`. Render a KPI
strip with one `StatCard` per module (applicants + AUC, % clearing hurdle, high-risk count,
eligible offers) plus a short "Five modules, one credit spine" architecture card describing
the shared score foundation. Keep `data-testid="view-dashboard"`.

### Customer 360 view (`portal/client/src/views/Customer360View.jsx`, new)
- Business-id input (seeded with `BIZ100000`) + "Load" button → single call to
  `/api/customer/{id}`.
- Renders a profile header (industry, region, revenue, booked badge) + shared Score card,
  then five stacked module cards in pipeline order: Adjudication, Pricing, EWS,
  Line-Increase. Each card reuses the existing badge components where they fit
  (decision badge, pass/fail badge, risk-tier badge).
- Non-booked: Pricing / EWS / Line-Increase cards render a muted "Not an on-book account"
  empty state (use `modules_present`).
- 404 → friendly "No business found for that id" message.
- `data-testid="view-customer360"`; per-card testids `card-360-<module>`.

### Nav (`Sidebar.jsx`, `App.jsx`, `lib/api.js`, `lib/hooks.js`)
- Add a top-level **"Customer 360"** nav entry (sibling of Dashboard, above the four modules).
- Add `useCustomer360()` hook + `getCustomer360(id)` / `getDashboardSummary()` api fns.
- Wire `Customer360View` into `App.jsx` routing. Dashboard already routes via
  `nav.module === 'dashboard'`; add `nav.module === 'customer360'`.
- **Back-compat:** all existing module nav + views unchanged.

## HTML slide deck (`docs/deck/index.html`)
Self-contained single file (inline CSS + vanilla JS, no build step, no external network).
Left/right arrow + on-screen controls to advance slides. Slides:
1. **Title** — "Business Banking, Built with Claude Code" + speed-to-market subtitle.
2. **The problem / the spine** — one synthetic credit score feeding four decisions.
3–7. **One slide per module** with its real headline metrics:
   - Score: AUC 0.818, KS 0.495
   - Adjudication: AUC 0.810, top-20% lift 2.86×
   - Pricing: ROE/RAROC engine, 30.4% of booked clear the 15% hurdle
   - EWS: top-decile capture 2.16×, PR-AUC 0.308
   - Line-Increase: AUC 0.813, cohort PD 0.036 vs book 0.117, incremental ROE 0.215
8. **How it was built — plan → execute → verify** — brainstorm → spec → plan →
   subagent-driven build with two-stage review; ~70 subagent dispatches; the **2 genuine
   BLOCK escalations** (EWS + Line-Increase noise-capped targets) as the governance headline.
9. **Verification** — 97 backend pytest + e2e Playwright + vite build, green on every merge.
10. **Close** — speed-to-market with Claude; fully synthetic data.

Content pulls real numbers from `program_state.json` / `SESSION_LOG.md`. Keep it tasteful and
self-contained so it opens with a double-click.

## End-to-end Playwright + screenshots
- New `portal/client/e2e/customer_360.spec.js`: load Dashboard (assert KPI strip), navigate to
  Customer 360, load `BIZ100000`, assert all five module sections render; load an
  applicant-only id and assert the muted non-booked state.
- **Screenshot capture for teaching video:** add a tiny helper (e.g. `e2e/_shot.js`) that
  saves full-page screenshots to `docs/screenshots/e2e/<module>/NN-<step>.png`. Wire it into
  **all** specs (adjudication, pricing, ews, line_increase, customer_360) at each meaningful
  step (view loaded, lookup result, what-if/simulate result, segments chart). Directory is
  committed so the images are available later.
- Back-compat: the existing 12 specs must still pass.

## Testing / gate
- Backend: `./.venv/bin/pytest -q` stays green (97) **plus** new
  `portal/server/tests/test_customer_api.py` and `test_dashboard_api.py` (360 booked +
  non-booked + 404; dashboard summary fields). Target ≥ ~105 backend tests.
- Frontend: `npm run build` (vite) ok; `npx playwright test` — all specs pass (12 existing +
  customer_360), screenshots written.
- No regression in Modules 0–4 (their tests + e2e unchanged).

## Build method
Subagent-driven, branch `build/portal-integration`, two-stage review per substantive task,
per-task token tally appended to `SESSION_LOG.md`. Tasks:
- **T1** — schemas + `dashboard_service.py` + `customer_service.py` + 2 routes in `main.py`.
- **T2** — backend tests (`test_customer_api.py`, `test_dashboard_api.py`).
- **T3** — Dashboard view rewrite + api/hooks wiring.
- **T4** — Customer 360 view + nav (Sidebar/App/api/hooks).
- **T5** — HTML slide deck.
- **T6** — screenshot helper + `customer_360.spec.js` + wire screenshots into existing specs;
  run full e2e; controller does ledger/tally + status board.

After the gate passes, **stop for user review before the `--no-ff` merge to `main`**, then
write the final session-log entry and the program-complete ledger update.

## Out of scope (YAGNI)
- No what-if / write actions in the 360 view (read-only).
- No new models, no data regeneration.
- No auth, no real PDF/PPTX export (HTML deck only).
