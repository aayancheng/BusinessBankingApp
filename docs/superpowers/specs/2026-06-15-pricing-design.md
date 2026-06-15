# Module 2 — Pricing & Profitability (ROE/RAROC engine) — Design

**Date:** 2026-06-15
**Status:** Approved design → ready for implementation planning
**Parent specs:** `docs/superpowers/specs/2026-06-14-business-banking-app-design.md` (§Module 2,
§3 portal architecture) + the Adjudication portal design (the scaffold this extends).
**Scope:** An analytical expected-loss pricing + ROE/RAROC profitability engine (no ML
training), plus its portal module (3 views) added to the existing portal. Built in one
session because the engine is deterministic math and the portal is already scaffolded.

## Decisions (user-confirmed)
- **Scope:** engine + portal this session.
- **EAD** = `requested_amount`. **Quoted (actual) rate** = `risk_based_rate` from the data
  (DGP-generated, median 10.65%), used as each loan's booked price for mispricing detection.
  **PD** = the modeled Module 0 scorecard PD via `score.src.predict.predict_score_pd`
  (consistent with Adjudication; never the DGP `pd_default_origination`). Note: for an
  *analytical* engine, consuming `risk_based_rate` is legitimate (it is a known price input,
  not a predicted target) — it is not leakage in this non-ML context.
- **RAROC** = pre-tax risk-adjusted return / equity; **ROE** = post-tax / equity (distinct).
- **Nav:** the Sidebar/App get a small refactor to host two active modules (Adjudication +
  Pricing), each with its own view triad.

---

## 1. The pricing engine — `pricing/src/engine.py` (pure functions)

`MarketAssumptions` is a frozen dataclass seeded from `shared.config.MARKET`
(`cost_of_funds`, `lgd`, `opex_rate`, `tax_rate`, `capital_ratio`, `base_margin`,
`roe_hurdle`) plus an optional `fee_rate` (default 0.0); every field is overridable so the
What-If view can vary assumptions.

### Profit waterfall (annualized; rates × EAD)
```
Interest income   = rate·EAD + fee_rate·EAD
− Cost of funds   = cost_of_funds·EAD
− Expected Loss   = pd·lgd·EAD
− Operating cost  = opex_rate·EAD
= Pre-tax profit
− Tax             = tax_rate · Pre-tax profit
= Net income
Allocated equity  = capital_ratio·EAD          (RWA = EAD, simplified per config)
ROE   = Net income  / Allocated equity
RAROC = Pre-tax profit / Allocated equity
```

### Functions
- `profit_waterfall(pd, ead, rate, market) -> dict` — every line item above + `roe`, `raroc`.
- `hurdle_clearing_rate(pd, ead, market) -> float` — the rate where `roe == roe_hurdle`:
  `r = cost_of_funds + pd·lgd + opex_rate + roe_hurdle·capital_ratio/(1−tax_rate) − fee_rate`.
- `break_even_rate(pd, ead, market) -> float` — the rate where `roe == 0`
  (`= cost_of_funds + pd·lgd + opex_rate − fee_rate`); used as a floor reference.
- `recommended_rate(pd, ead, market) -> float` = `hurdle_clearing_rate + base_margin`.
- `price_loan(pd, ead, quoted_rate, market) -> dict` — combines:
  `recommended_rate`, `quoted_rate`, the waterfall at the recommended rate, the waterfall at
  the quoted rate, `roe_at_recommended`, `roe_at_quoted`, `raroc_at_quoted`,
  `clears_hurdle` (roe_at_quoted ≥ hurdle), `mispriced` (not clears_hurdle), and
  `rate_shortfall` (max(0, hurdle_clearing_rate − quoted_rate)).

EAD is a positive scale factor; ROE/RAROC are ratios independent of EAD magnitude (it
cancels), so the engine is well-defined for any `ead > 0`. Guard `ead <= 0` → raise.

---

## 2. Portfolio — `pricing/src/portfolio.py`

`price_population() -> pd.DataFrame` scores the **booked** loans (`booked == True`) — PD via
the scorecard, EAD = requested_amount, quoted = risk_based_rate — and applies `price_loan`
to each. Returns a frame with business_id, industry, score_band, ead, quoted_rate,
recommended_rate, roe_at_quoted, raroc_at_quoted, clears_hurdle, mispriced.

`portfolio_summary(df) -> dict` — count + share above/below the hurdle, median ROE,
total/mispriced EAD, and mispriced-rate segments `by_band` and `by_industry`. The trainer-
equivalent script writes `pricing/docs/validation_report.md` (no model artifacts to persist).

---

## 3. Components / file structure

| File | Responsibility |
|------|----------------|
| `pricing/__init__.py`, `pricing/src/__init__.py`, `pricing/tests/__init__.py` | package markers |
| `pricing/src/engine.py` | `MarketAssumptions`, waterfall, rate solvers, `price_loan` |
| `pricing/src/portfolio.py` | `price_population`, `portfolio_summary`, report writer |
| `pricing/tests/test_engine.py` | waterfall identity, hurdle-clearing, monotonicity, mispricing, RAROC≥ROE |
| `pricing/tests/test_portfolio.py` | population shape, summary keys, segment rates in [0,1] |
| `pricing/docs/validation_report.md` | auto-generated portfolio stats |
| `portal/server/pricing_service.py` | glue: row → pricing record; population caching helpers |
| `portal/server/main.py` (modify) | + lifespan caches priced population; + 3 pricing routes |
| `portal/server/schemas.py` (modify) | + pricing Pydantic models |
| `portal/server/tests/test_pricing_api.py` | pricing endpoint tests |
| `portal/client/src/lib/{api,hooks,constants}.js` (modify) | + pricing calls/hooks/defaults |
| `portal/client/src/components/{Waterfall,PassFailBadge}.jsx` | new presentational components |
| `portal/client/src/components/Sidebar.jsx` (modify) | grouped two-module nav |
| `portal/client/src/App.jsx` (modify) | `{module, view}` state |
| `portal/client/src/views/pricing/{PricingLookupView,PricingWhatIfView,PricingPortfolioView}.jsx` | 3 views |
| `portal/client/e2e/pricing.spec.js` | Playwright smoke for the pricing views |

---

## 4. API (added to the single portal backend)

| Method/Path | Returns |
|-------------|---------|
| `GET /api/pricing/{business_id}` | pricing detail: recommended/quoted rates, both waterfalls, ROE/RAROC, clears_hurdle, mispriced, rate_shortfall; 404 unknown |
| `GET /api/pricing/portfolio` | `portfolio_summary` (above/below hurdle counts+shares, median ROE, mispriced EAD, by_band/by_industry segments) |
| `POST /api/pricing/quote` | What-If: body = `{pd, ead, rate, market overrides...}` (missing fields from defaults) → full waterfall + roe/raroc + clears_hurdle |

Pricing detail/quote return numeric fields at the top level (portal convention).

---

## 5. Frontend

**Nav refactor:** `App` holds `{ module, view }` (default `{adjudication, lookup}`). `Sidebar`
renders Dashboard plus two groups — **Adjudication** (Lookup/What-If/Segments) and **Pricing**
(Lookup/What-If/Portfolio) — each item `data-testid="nav-<module>-<view>"`; the remaining
modules stay disabled stubs. Existing Adjudication views keep working unchanged.

**New components:** `Waterfall({ rows })` — line-item table (label, value, +/− sign styling);
`PassFailBadge({ pass, label })` — green PASS / red FAIL pill, `data-testid="roe-badge"`.

**Views (`src/views/pricing/`):**
- `PricingLookupView` — pick a business id → `PassFailBadge` (ROE vs hurdle), StatCards
  (ROE, RAROC, recommended vs quoted rate), `Waterfall` at quoted, mispriced note. Container
  `data-testid="view-pricing-lookup"`.
- `PricingWhatIfView` — sliders for rate, cost_of_funds, lgd, capital_ratio, opex_rate,
  tax_rate, fee_rate (+ a pd and ead input) → debounced `POST /quote` → live `Waterfall` +
  `PassFailBadge`. Seeds on mount. `data-testid="view-pricing-whatif"`; rate slider
  `data-testid="slider-rate"`.
- `PricingPortfolioView` — Recharts: ROE distribution / above-vs-below hurdle, and mispriced
  rate by industry. Wrapper `data-testid="pricing-portfolio-chart"`; container
  `data-testid="view-pricing-portfolio"`.

---

## 6. Validation & gate (this session)

No AUC — correctness instead:
1. **Engine tests:** (a) waterfall identity (pre_tax = income − cof − el − opex; net =
   pre_tax·(1−tax)); (b) ROE at `recommended_rate` ≥ hurdle (clears by the base_margin
   cushion); (c) ROE at `hurdle_clearing_rate` ≈ hurdle (±1e-6); (d) **monotonicity** —
   higher PD ⇒ higher recommended_rate; (e) mispricing: a loan quoted below its
   hurdle_clearing_rate is flagged `mispriced`; (f) RAROC ≥ ROE for positive pre-tax profit.
2. **API tests** pass (added to `pytest.ini` testpaths).
3. **Playwright** smoke (boots both servers): pricing Lookup shows the ROE badge; What-If
   rate slider down → badge flips to FAIL; Portfolio chart renders. Plus the existing
   Adjudication gate still passes.
4. `vite build` succeeds.

A portfolio summary (share of booked loans clearing the hurdle at their quoted rate,
mispriced segments) is written to the validation report and surfaced in the Portfolio view.

---

## Out of scope (deferred)
- Acceptance/price-elasticity what-if (spec marks optional — YAGNI).
- Cross-module Dashboard / `GET /api/customer/{id}` 360 view.
- Other modules' portal views (EWS, Line-Increase) — still disabled stubs.

## Success criteria
1. The engine reproduces the waterfall exactly and its `recommended_rate` clears the ROE
   hurdle for every loan; `hurdle_clearing_rate` is exact (ROE == hurdle).
2. Mispriced (below-hurdle) loans are correctly flagged against their quoted rate.
3. Recommended rate is monotonically increasing in PD.
4. The three pricing views render real data; What-If recomputes ROE live.
5. Engine + API tests + Playwright (pricing & adjudication) pass; `vite build` succeeds.
6. No Module 0/1/2 logic duplicated in the portal; ledger + session log updated; committed.
