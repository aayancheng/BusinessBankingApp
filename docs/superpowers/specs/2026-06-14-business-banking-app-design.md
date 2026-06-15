# Business Banking App — Program Spec

**Date:** 2026-06-14
**Status:** Approved design → ready for implementation planning
**Workspace:** `/Users/aayan/zzLearnAndCreate/BusinessBankingApp/`

---

## 1. Goal & Framing

Build a prototype **business banking app** that showcases how much of a credit lifecycle
can be built **without any internal/proprietary training data** — using only synthetic
(AI-generated) data and open-domain knowledge. The headline message is **speed-to-market
with Claude Code**: a coherent, multi-module banking product stood up fast.

The product is a **unified portal** covering four sub-apps, all sitting on a shared
**Business Credit Score** foundation:

1. **Business Loan Adjudication**
2. **Loan Pricing & Profitability**
3. **Portfolio Management & Early Warning Signal (EWS)**
4. **Proactive Line Increase**

### Non-goals (explicitly out of scope for the demo)
- Model Risk Management / SR 11-7 governance artifacts, formal validation packages.
- Fair-lending / adverse-action regulatory compliance depth (reason codes are included
  for UX/explainability, not for compliance certification).
- Real or internal data of any kind. **All data is synthetic.**
- Production hardening (auth, persistence, multi-tenant, CI/CD).

---

## 2. The Unifying Idea

One **shared synthetic SME population** flows through every module. The *same business*
appears as:
- an **applicant** (Adjudication),
- receives a **risk-based, ROE-tested rate** (Pricing),
- **books a loan** and is **monitored on-book** over 24 months (Portfolio/EWS),
- later becomes a **candidate for a credit line increase** (Line Increase).

A single **Business Credit Score** (FICO-like, 300–850 + PD) is the spine that all four
apps consume. This cross-module coherence is the core of the demo: a customer 360° view
shows one business across all five lenses.

---

## 3. Architecture

### 3.1 Workspace layout (self-contained)
```
BusinessBankingApp/
├── .venv/                      ← own Python venv (not shared with MarketingAnalytics)
├── requirements.txt
├── CLAUDE.md                   ← workspace conventions (ports, patterns, resume protocol)
├── README.md
├── program_state.json          ← session checkpoint / task ledger (see §7)
├── SESSION_LOG.md              ← append-only per-session narrative log (see §7)
├── shared/
│   └── data/
│       ├── raw/                ← generated SME panel (one coherent population)
│       ├── processed/
│       └── synthetic/          ← generator scripts + intermediate frames
├── docs/superpowers/specs/     ← this spec + per-module sub-specs
├── score/                      ← Module 0: Business Credit Score (built FIRST)
│   └── {notebooks, src, models, docs}
├── app1_adjudication/          ← Module 1
│   └── {notebooks, src, models, docs}
├── app2_pricing/               ← Module 2
│   └── {notebooks, src, models, docs}
├── app3_portfolio_ews/         ← Module 3
│   └── {notebooks, src, models, docs}
├── app4_line_increase/         ← Module 4
│   └── {notebooks, src, models, docs}
└── portal/
    ├── server/                 ← single FastAPI (loads ALL artifacts) + Express proxy
    └── client/                 ← single React + Vite app, sidebar nav across modules
```

### 3.2 Ports (new range; no clash with MarketingAnalytics m01–m06)
| Service | Port |
|---------|------|
| FastAPI (portal backend) | **8100** |
| Express proxy | **3100** |
| Vite dev server | **5180** |

### 3.3 Stack (reuse MarketingAnalytics patterns)
- **Backend:** one FastAPI app in `portal/server/` that, at startup (lifespan), loads the
  score + 4 model artifacts, scores the whole population, and caches results in
  `app.state`. Express proxy forwards `/api/*` → FastAPI.
- **Frontend:** one React + Vite + TailwindCSS app with the existing component library
  (Card, DataTable, ShapChart, StatCard, SliderControl, Sidebar, etc.) and Recharts.
- **ML pipelines:** per module — `data_pipeline.py`, `feature_engineering.py`
  (exports a `FEATURE_COLUMNS` constant), `train.py` (split, train, SHAP, save to
  `models/` with `metadata.json`).
- **Critical patterns** (carried over from MarketingAnalytics CLAUDE.md): `sys.path`
  fix in `main.py`; `PaginatedResponse` uses `items`/`pages`; entity detail returns
  prediction fields at top level (not nested); `app/server/package.json` has
  `"type": "module"`; run uvicorn from the directory containing `src/`.

### 3.4 API namespacing (single backend)
```
GET  /health
GET  /api/customer/{id}                 ← 360° view across all modules
GET  /api/score/{id} | /api/score/segments | POST /api/score/predict
GET  /api/adjudication/{id} | /applications | POST /api/adjudication/decide
GET  /api/pricing/{id} | /portfolio | POST /api/pricing/quote   (ROE engine)
GET  /api/portfolio/{id} | /watchlist | /segments               (EWS)
GET  /api/line-increase/{id} | /candidates | POST /api/line-increase/simulate
```

### 3.5 Frontend navigation
Sidebar → **Dashboard** + 5 modules. Each module reuses the
**Lookup / What-If / Segments** view triad, adapted to its domain (some modules add a
portfolio/scatter or watchlist view).

---

## 4. Shared Synthetic Data Model (the SME panel)

Generated **once** into `shared/data/`, consumed by all modules. Deterministic
(`random_state=42`). A logistic/statistical data-generating process (DGP) creates labels
so models are learnable and correlations are realistic.

### 4.1 Population
- ~**12,000 businesses** (applicants). A **booked subset** (~7,000) becomes the on-book
  portfolio with **24 months** of monthly behavioral performance.
- Stable `business_id` shared across all module datasets so a customer maps end-to-end.

### 4.2 Feature groups
| Group | Examples |
|-------|----------|
| Firmographics | industry (NAICS-like), years_in_business, region, employees, entity_type |
| Financials | annual_revenue, net_income, total_debt, current_ratio, DSCR, cash_flow, leverage |
| Bureau-like | credit_history_months, prior_delinquencies, trade_lines, utilization, public_records |
| Application | requested_amount, term_months, loan_purpose, collateral_flag |
| Behavioral (on-book, monthly) | balance, utilization, days_past_due, deposit_inflows, overdraft_count, trend deltas |

### 4.3 Synthetic targets (DGP-generated)
| Target | Used by | Definition |
|--------|---------|------------|
| `pd_default_origination` | Score, Adjudication | default within 12mo of origination (binary) |
| `risk_based_rate` | Pricing | derived analytically; market rate noise added |
| `deterioration_next_6_12mo` | Portfolio/EWS | on-book default/serious delinquency in horizon (binary) |
| `line_increase_good` | Line Increase | low-risk + high-utilization + capacity → good candidate (binary) |

A shared `LGD`, `EAD`, and market-assumption set (cost of funds, capital ratio, tax rate,
opex) are stored as configurable defaults for the Pricing engine.

---

## 5. Module Specifications

All modules: synthetic-data trained, **SHAP** for explainability, standard 3-view UI,
metric-threshold gate before a phase is declared complete.

### Module 0 — Business Credit Score (foundation, built first)
- **Engine:** WoE binning (`optbinning`) + Logistic Regression scorecard, scaled to a
  **300–850** points range; outputs **PD** and **reason codes** (top adverse WoE
  contributions).
- **Inputs:** firmographics + financials + bureau-like features.
- **Outputs:** `business_score` (300–850), `pd`, `score_band` (e.g., AAA…D), `reason_codes`.
- **Consumed by:** all four apps (score/PD/EAD feed downstream).
- **Success criteria:** AUC ≥ 0.75, KS ≥ 0.30, monotonic score bands, sensible
  rank-ordering of PD by band.
- **Views:** Lookup (score gauge + reason codes), What-If (feature sliders → live score),
  Segments (band distribution, PD by band).

### Module 1 — Business Loan Adjudication
- **Engine:** LightGBM classifier (default at application) **+ a policy/decision layer**.
- **Inputs:** score/PD + application fields + affordability ratios (DSCR, leverage).
- **Decision layer:** policy rules on PD + score + affordability →
  **Approve / Refer / Decline**, with reason codes (SHAP + rule hits).
- **Success criteria:** AUC ≥ 0.78, top-20% lift ≥ 2.0×, clean reason codes,
  explainable decisions.
- **Views:** Lookup (decision + reason codes + key ratios), What-If (change application
  inputs → decision flips), Segments (approval/decline rates by band/industry).

### Module 2 — Pricing & Profitability (ROE engine)
- **Engine:** analytical **expected-loss pricing + ROE/RAROC profitability engine**
  (transparent, no opaque regression), plus an optional acceptance/elasticity what-if.
- **Profitability waterfall (per loan):**
  ```
  Interest income (rate × EAD) + fees
    − Cost of funds      (COF/FTP × EAD)
    − Expected Loss      (PD × LGD × EAD)
    − Operating cost     (opex allocation)
    = Pre-tax profit
    − Tax                (× tax_rate)
    = Net income
  ROE = Net income / Allocated equity   (capital_ratio × RWA, or × EAD)
  ```
- **Inputs:** PD & EAD from Score; market assumptions LGD, COF, capital_ratio, opex,
  tax_rate, fees (defaults + adjustable).
- **Outputs:** recommended rate (clears ROE hurdle, then risk-based margin), ROE, RAROC,
  full profit waterfall, **pass/fail vs ROE hurdle** (default hurdle 15%).
- **Success criteria:** recommended price reliably clears the ROE hurdle; engine
  correctly flags **mispriced** (below-hurdle) loans; what-if recomputes ROE live.
- **Views:** Lookup (waterfall + ROE pass/fail for a loan), What-If (rate/COF/LGD/
  capital/opex/tax/fees sliders → live ROE), Portfolio (distribution of loans above/
  below hurdle, mispriced segments).

### Module 3 — Portfolio Management & Early Warning Signal
- **Engine:** LightGBM classifier on the **24-month behavioral panel** predicting
  deterioration/default in the next 6–12 months.
- **Inputs:** behavioral trends (utilization drift, DPD, deposit decline, overdrafts) +
  current score/PD + financials.
- **Outputs:** EWS risk tier, **trigger flags** (named early-warning rules), watchlist
  membership, predicted deterioration probability.
- **Success criteria:** early-default capture rate in top decile ≥ 3×, PR-AUC competitive
  vs baseline, interpretable trigger flags.
- **Views:** Lookup (account trajectory + triggers), Watchlist (ranked at-risk accounts),
  Segments (deterioration rates by band/industry/vintage).

### Module 4 — Proactive Line Increase
- **Engine:** LightGBM classifier/uplift for "good candidate" + **amount rules**,
  gated by an **incremental ROE** check.
- **Inputs:** behavioral capacity (utilization headroom), risk (score/PD/EWS), tenure.
- **Outputs:** eligibility flag, recommended increase amount (£/$), **only recommended
  when the incremental exposure is ROE-accretive and within risk appetite**.
- **Success criteria:** recommended cohort is lower-risk + higher-utilization than book
  average; incremental exposure is ROE-positive; sensible amount distribution.
- **Views:** Lookup (eligibility + recommended increase + incremental ROE), Candidates
  (ranked offer list), Segments (offer rates / expected incremental exposure by band).

---

## 6. Verification Strategy

Per module, before marking its phase complete:
1. **Model gate:** training metrics meet the module's success criteria (logged to
   `program_state.json`).
2. **API smoke:** `/health` + key endpoints return well-formed responses.
3. **Build gate:** `npm run build` passes for the portal client.
4. **Playwright gate** (via Playwright MCP, already connecting): drive the module's views
   in the running portal — lookup loads a real entity, what-if recomputes, segments/
   watchlist render. One screenshot per passing view as evidence.
5. **Visual confirmation** (Claude Preview / browser MCP) for the unified UI.

Token-efficient Playwright: prefer `browser_snapshot` for state checks; use
`browser_take_screenshot` only as final per-view evidence.

---

## 7. Project Memory & Management System (resume across sessions)

The full build **will not fit in one daily token session**. Two artifacts make the work
**checkpointed and resumable**, plus a strict session protocol.

### 7.1 `program_state.json` — the task ledger (source of truth)
Machine-readable state read at the start of every session.

```json
{
  "program": "business-banking-app",
  "workspace": "/Users/aayan/zzLearnAndCreate/BusinessBankingApp",
  "created_at": "2026-06-14",
  "updated_at": "2026-06-14",
  "ports": { "fastapi": 8100, "express": 3100, "vite": 5180 },
  "decisions": {
    "architecture": "unified portal, shared backend",
    "credit_score": "shared foundation module",
    "data": "fully synthetic",
    "governance": "lean (skip MRM)",
    "venv": "self-contained",
    "roe_hurdle": 0.15
  },
  "next_action": "Phase 0 — scaffold workspace + synthetic data generator",
  "phases": [
    {
      "id": "foundation",
      "title": "Workspace scaffold + shared synthetic SME data",
      "status": "pending",
      "tasks": [
        { "id": "venv",        "desc": "Create .venv + requirements.txt", "done": false },
        { "id": "scaffold",    "desc": "Create folder tree + CLAUDE.md + README", "done": false },
        { "id": "datagen",     "desc": "Synthetic SME panel generator (12k businesses, 24mo panel)", "done": false },
        { "id": "eda",         "desc": "EDA notebook + data dictionary", "done": false }
      ],
      "metrics": {}, "artifacts": [], "completed_at": null
    },
    {
      "id": "score",
      "title": "Module 0 — Business Credit Score (WoE + Logistic scorecard)",
      "status": "pending",
      "tasks": [
        { "id": "subspec",   "desc": "Write score sub-spec + plan", "done": false },
        { "id": "features",  "desc": "feature_engineering.py + FEATURE_COLUMNS", "done": false },
        { "id": "train",     "desc": "train.py: WoE binning, logistic scorecard, scaling, SHAP", "done": false },
        { "id": "artifacts", "desc": "models/ artifacts + metadata.json", "done": false },
        { "id": "gate",      "desc": "Metric gate: AUC>=0.75, KS>=0.30", "done": false }
      ],
      "metrics": {}, "artifacts": [], "completed_at": null
    },
    {
      "id": "adjudication",
      "title": "Module 1 — Loan Adjudication (LightGBM + policy layer)",
      "status": "pending",
      "tasks": [
        { "id": "subspec",  "desc": "Write adjudication sub-spec + plan", "done": false },
        { "id": "model",    "desc": "LightGBM default model + SHAP", "done": false },
        { "id": "policy",   "desc": "Decision layer (Approve/Refer/Decline) + reason codes", "done": false },
        { "id": "portal",   "desc": "Adjudication module views in portal", "done": false },
        { "id": "gate",     "desc": "Metric gate + Playwright", "done": false }
      ],
      "metrics": {}, "artifacts": [], "completed_at": null
    },
    {
      "id": "pricing",
      "title": "Module 2 — Pricing & Profitability (ROE engine)",
      "status": "pending",
      "tasks": [
        { "id": "subspec",  "desc": "Write pricing sub-spec + plan", "done": false },
        { "id": "engine",   "desc": "EL pricing + ROE/RAROC waterfall engine", "done": false },
        { "id": "hurdle",   "desc": "ROE hurdle test + mispricing detection", "done": false },
        { "id": "portal",   "desc": "Pricing module views (waterfall, what-if, portfolio)", "done": false },
        { "id": "gate",     "desc": "Engine validation + Playwright", "done": false }
      ],
      "metrics": {}, "artifacts": [], "completed_at": null
    },
    {
      "id": "portfolio_ews",
      "title": "Module 3 — Portfolio Management & Early Warning",
      "status": "pending",
      "tasks": [
        { "id": "subspec",  "desc": "Write EWS sub-spec + plan", "done": false },
        { "id": "panel",    "desc": "Behavioral panel features (trends)", "done": false },
        { "id": "model",    "desc": "LightGBM deterioration model + trigger flags", "done": false },
        { "id": "portal",   "desc": "EWS module views (trajectory, watchlist, segments)", "done": false },
        { "id": "gate",     "desc": "Metric gate + Playwright", "done": false }
      ],
      "metrics": {}, "artifacts": [], "completed_at": null
    },
    {
      "id": "line_increase",
      "title": "Module 4 — Proactive Line Increase (uplift + ROE gate)",
      "status": "pending",
      "tasks": [
        { "id": "subspec",  "desc": "Write line-increase sub-spec + plan", "done": false },
        { "id": "model",    "desc": "Candidate model + amount rules", "done": false },
        { "id": "roe",      "desc": "Incremental ROE gate (ties to Pricing engine)", "done": false },
        { "id": "portal",   "desc": "Line-increase module views (candidates, simulate)", "done": false },
        { "id": "gate",     "desc": "Metric gate + Playwright", "done": false }
      ],
      "metrics": {}, "artifacts": [], "completed_at": null
    },
    {
      "id": "portal_integration",
      "title": "Portal integration, 360° view, exec deck, end-to-end Playwright",
      "status": "pending",
      "tasks": [
        { "id": "dashboard", "desc": "Cross-module Dashboard + /api/customer/{id} 360 view", "done": false },
        { "id": "e2e",       "desc": "End-to-end Playwright across all 5 modules", "done": false },
        { "id": "deck",      "desc": "Executive deck + README", "done": false }
      ],
      "metrics": {}, "artifacts": [], "completed_at": null
    }
  ]
}
```

**Rules:**
- `status` ∈ `pending | in_progress | completed | blocked`.
- A task is checked off by setting `done: true`. A phase is `completed` only when **all
  tasks done AND its metric gate passes**.
- `next_action` always points at the very next thing to do (one line).
- `updated_at` bumped on every write.

### 7.2 `SESSION_LOG.md` — append-only narrative
Human-readable companion. One entry per session:
```
## Session N — YYYY-MM-DD — <phase id>
- Completed: <tasks checked off, with key metrics>
- Decisions / deviations: <any>
- Verification: <gate results, screenshots>
- Next: <next_action>
- Resume: open BusinessBankingApp and say "resume the business banking build"
```

### 7.3 Session Protocol (mandatory, every session)
1. **Start:** read `program_state.json` + the latest `SESSION_LOG.md` entry. Print a
   status board (✓ completed / → in_progress / · pending per phase) and the `next_action`.
2. **Work:** execute the current phase. Use **parallel subagents** for independent work
   (research / data / modeling / app-building) per the analytics-project pattern. Check
   off tasks in `program_state.json` as they finish.
3. **Hard breakpoint (one phase per session by default):** when a phase completes (or the
   session is running low on budget), (a) update `program_state.json` (statuses, `done`
   flags, metrics, artifacts, `next_action`, `updated_at`), (b) append a `SESSION_LOG.md`
   entry, (c) print the resume command, and **STOP**.
   - *Exception:* Phase 0 (Foundation) may continue into Phase 1 (Score) if budget allows.
4. **Resume:** a new session re-enters at step 1 and continues from `next_action`.

### 7.4 Optional surfacing
- A tiny `make status` / `python scripts/status.py` can pretty-print the ledger.
- The portal Dashboard can read `program_state.json` to show a build-progress widget
  (nice-to-have, demo flourish).

---

## 8. Build Sequence (sessions)

| Session | Phase | Output |
|---------|-------|--------|
| 1 | Foundation (+ Score if budget) | venv, scaffold, synthetic SME panel, EDA |
| 2 | Score | scorecard model, artifacts, score views |
| 3 | Adjudication | model + policy layer + portal module |
| 4 | Pricing & Profitability | ROE engine + portal module |
| 5 | Portfolio / EWS | behavioral model + watchlist module |
| 6 | Line Increase | candidate model + ROE-gated offers module |
| 7 | Portal integration | Dashboard, 360° view, exec deck, e2e Playwright |

Each session: parallel subagents → checkpoint → stop.

---

## 9. Assumptions & Risks

- **No git repo** currently in the workspace — checkpointing relies on
  `program_state.json` + `SESSION_LOG.md` (git can be initialized later if desired).
- Synthetic DGP must encode realistic correlations or models will be trivially perfect;
  the EDA gate in Phase 0 checks label rates and feature relationships look plausible.
- Pricing is analytical, so its "validation" is scenario correctness (waterfall reconciles,
  ROE monotonic in rate), not a held-out ML metric.
- Self-contained venv means a fresh dependency install in Phase 0 (xgboost-free; uses
  lightgbm, optbinning, shap, scikit-learn, fastapi, etc.).
