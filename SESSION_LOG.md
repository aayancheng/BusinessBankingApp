# Business Banking App — Session Log

Append one entry per working session. Newest at the bottom.
Source of truth for task state is `program_state.json`; this file is the human-readable narrative.

**To resume in a new session:** open the `BusinessBankingApp` workspace and say
*"resume the business banking build"*. Claude reads `program_state.json` + the latest
entry below, prints a status board, and continues from `next_action`.

---

## Session 1 — 2026-06-14 — Planning

- **Completed:**
  - Brainstormed and locked program decisions (unified portal + shared backend, shared
    Business Credit Score foundation, fully synthetic data, lean/skip-MRM,
    self-contained venv, build order Score → Adjudication → Pricing → EWS → Line Increase).
  - Pricing scope expanded to a **risk-adjusted profitability engine** (ROE/RAROC with
    cost-of-funds, expected loss, opex, tax; ROE hurdle = 15% as success criterion).
  - Wrote program spec: `docs/superpowers/specs/2026-06-14-business-banking-app-design.md`.
  - Stood up the project memory/management system: `program_state.json` (task ledger)
    + this `SESSION_LOG.md` + session protocol (documented in spec §7).
- **Decisions / deviations:** none beyond the above.
- **Verification:** spec self-review complete; awaiting user review of spec before build.
- **Next:** Phase 0 — scaffold workspace + build synthetic SME data generator.
- **Resume:** open `BusinessBankingApp` and say "resume the business banking build".

---

## Session 2 — 2026-06-14 — Phase 0 Foundation (build)

Executed subagent-driven (streamlined: 1 implementer/task, cheap model; consolidated
review at phase boundary) on branch `build/phase0-score`.

- **Completed (Tasks 0.1–0.7):**
  - venv (Python 3.13.5) + `requirements.txt` (5 pins relaxed to cp313-compatible versions).
  - Package scaffold + `shared/config.py` (seed, sizes, MARKET assumptions, ports) + `pytest.ini`.
  - `shared/data_generator.py`: `generate_businesses` (PD DGP) + `generate_portfolio_and_panel`
    (24-mo behavioral panel, EWS + line-increase targets) + `main()` entrypoint.
  - Generated data: **12,000** applicants (default 16.7%, booked 69.5%), **8,336** on-book
    accounts (deterioration 18.0%, line-increase 22.9%), **200,064** panel rows (24 months).
  - Data dictionary + runnable EDA cell-script (rank-ordering confirmed: DSCR↓, util/lev↑).
  - **8/8 tests pass.**
- **Review:** consolidated Phase 0 review = APPROVED_WITH_NITS, **no must-fix**.
- **Carry-forward for Score:** exclude leakage columns `pd_default_origination`,
  `risk_based_rate`, `default`, **and `booked`** from features. (`cash_flow` not persisted;
  extract a shared rate helper before Pricing — logged for later phases.)
- **Token spend (subagents):** ~226k total across 7 dispatches (6 implementers + 1 review).
- **Next:** Phase Score — feature engineering + WoE/Logistic scorecard (gate AUC≥0.75, KS≥0.30).
- **Resume:** open `BusinessBankingApp` and say "resume the business banking build".

---

## Session 2 (cont.) — 2026-06-14 — Module 0 Business Credit Score (build)

- **Completed (Tasks 1.1–1.5):**
  - `score/src/feature_engineering.py`: `FEATURE_COLUMNS` (15 features, leakage-safe — excludes
    pd_default_origination, default, risk_based_rate, booked) + `compute_features`.
  - `score/src/train.py`: `optbinning` WoE+Logistic scorecard, raw points rescaled to 300–850
    (FICO-like, high score = low risk), PD, stratified split, AUC/KS, score-band table, artifacts.
  - `score/src/reason_codes.py`: exact WoE×coefficient adverse reason codes (not SHAP — exact for
    a linear WoE model).
  - **Metrics (test split): AUC = 0.8176, KS = 0.4946** (gate ≥0.75/≥0.30 cleared). Bands monotonic
    D=28.2% → AAA=2.1%. Score↔default corr = −0.433.
  - **17/17 tests pass.** Added `tabulate==0.10.0` to requirements (reproducibility).
- **Review:** consolidated Score review = APPROVED_WITH_NITS, **no must-fix**. Verified leakage-free,
  correct score direction, correct reason-code sign logic.
- **Carry-forward for Adjudication:** add a shared `LEAKAGE_COLUMNS` deny-list to `shared/config.py`
  (downstream leak cols are larger: deterioration_next_6_12mo, line_increase_good). Route score/PD
  reuse through saved `scorecard.pkl` (never the true DGP `pd_default_origination`). Logged nits:
  `score_to_fico` degenerate branch dtype; matmul overflow warnings on full-set scoring (revisit
  before the API/portal phase).
- **Token spend (subagents):** Score phase ~117k (3 implementer/combined + 1 review); session
  cumulative ~400k across 10 subagent dispatches.
- **Next:** Phase Adjudication (Module 1).
- **Resume:** open `BusinessBankingApp` and say "resume the business banking build".

---

## ⏸️ PAUSED — 2026-06-14 (resume 2026-06-15, fresh session)

**Milestone merged to `main`** (merge commit `fce144a`): Phase 0 Foundation + Module 0
Business Credit Score — both complete, reviewed (APPROVED_WITH_NITS, no must-fix), 17/17 tests green.

**To resume tomorrow:** open the `BusinessBankingApp` workspace and say
**"resume the business banking build"**. Claude will read `program_state.json`
(`completed_phases: [foundation, score]`, `next_action` = Phase Adjudication), print the
status board, and start Module 1.

**First steps for Adjudication (Module 1):**
1. Add a shared `LEAKAGE_COLUMNS` deny-list to `shared/config.py` (pd_default_origination,
   default, risk_based_rate, booked, deterioration_next_6_12mo, line_increase_good).
2. Write the Adjudication sub-spec + plan (LightGBM default model + policy decision layer
   Approve/Refer/Decline + reason codes), then build subagent-driven on a new branch
   `build/adjudication`.

---

## Session 3 — 2026-06-15 — Module 1 Loan Adjudication (BACKEND)

**Scope (user-confirmed):** backend only — LightGBM default model + SHAP + policy
decision layer (Approve/Refer/Decline) + reason codes + metric gate + tests. Portal
(FastAPI + React 3-view UI) and Playwright deferred to a follow-up session.

**Process:** brainstorming → sub-spec → implementation plan → **subagent-driven
development** on branch `build/adjudication` (8 tasks; per task: 1 implementer + 1
combined spec+quality reviewer; cheap model for mechanical tasks, standard for
integration/trainer).

**Built:**
- `shared/config.py`: `LEAKAGE_COLUMNS` deny-list + `ADJ_POLICY` seed thresholds.
- `score/src/predict.py`: reusable `predict_score_pd` (modeled score/PD for downstream
  modules; np.errstate guard fixed the carried-over matmul-overflow nit).
- `adjudication/src/feature_engineering.py`: 21 leakage-free features (app + ratios +
  bureau + reused business_score/pd_score), leakage assertion.
- `adjudication/src/policy.py`: `PolicyConfig` + vectorized `decide()` — hard knockouts →
  PD zones → refer overrides; knockouts always win; overrides only downgrade Approve.
- `adjudication/src/reason_codes.py`: top adverse SHAP + policy rule hits → `explain()`.
- `adjudication/src/train.py`: LightGBM, PD-zone calibration, artifacts, **gate assert**.

**Metrics (test split):** **AUC = 0.8096** (gate ≥0.78), **top-20% lift = 2.86×**
(gate ≥2.0) — passed on the first run, no tuning. PD zones t_low=0.0955, t_high=0.4943.
Decision mix: Approve 30.8% / Refer 36.8% / Decline 32.4%. **40/40 tests pass**
(added `adjudication/tests` to `pytest.ini testpaths`).

**Carry-forward:** the conservative decision mix is driven by hard knockouts
(`dscr<1.0` fires on ~21% of synthetic applicants; `public_records>0` ~8%), NOT the PD
calibration — moving t_low/t_high shifts the mix <2pp. To better match the ~70%
historical book intent in a future iteration, regenerate the synthetic DGP with lower
`dscr<1.0` prevalence (~8–10%) or make knockouts configurable. Out of scope for the
backend phase. `leverage>6.0` knockout never fires on this data (candidate to drop/retune).

**Subagent token tally (this session) — for evaluating the subagent design:**

| Task | Role | Model | Tokens | Outcome |
|------|------|-------|-------:|---------|
| 1 config | impl | haiku | 26,815 | DONE → APPROVED |
| 1 config | review | haiku | 26,196 | APPROVED |
| 2 predict.py | impl | sonnet | 27,440 | DONE |
| 2 predict.py | review | sonnet | 30,364 | CHANGES REQ (overflow guard, unused import) |
| 3 features | impl | sonnet | 26,210 | DONE → APPROVED |
| 3 features | review | sonnet | 32,968 | APPROVED |
| 4 policy | impl | haiku | 27,129 | DONE → APPROVED |
| 4 policy | review | haiku | 41,066 | APPROVED |
| 5 reason codes | impl | haiku | 22,539 | DONE → APPROVED |
| 5 reason codes | review | haiku | 30,105 | APPROVED |
| 6 trainer+gate | impl | sonnet | 29,838 | DONE → APPROVED (gate pass 1st run) |
| 6 trainer+gate | review | sonnet | 34,738 | APPROVED (decision-mix analysis) |
| 7 gate test | impl | haiku | 27,009 | DONE → APPROVED |
| 7 gate test | review | haiku | 24,812 | APPROVED |

- **Total: 407,229 tokens across 14 dispatches** (7 impl 186,980 + 7 review 220,249).
- By model: haiku 225,671 (8 dispatches), sonnet 181,558 (6 dispatches).
- 13/14 dispatches clean; 1 changes-requested (Task 2) fixed by controller inline (2-line
  edit — too small to justify a re-dispatch; verified with `-W error::RuntimeWarning`).
- Observations for future automation: (a) reviews cost more than implementations here
  (220k vs 187k) because the plan shipped complete code, making implementers near-
  transcription; consider lighter review for full-code-spec tasks. (b) Combined spec+
  quality review (vs two separate dispatches) ~halved review count with no quality loss.
  (c) The one high-value review catch (Task 6 decision-mix root-cause) came from the
  trainer task — spend review budget where there's genuine judgment, not on transcription.

**Status:** Backend complete, **awaiting user review before merge to `main`** (mirrors the
Phase 0/Score review→merge flow). Branch `build/adjudication`.

**Resume:** open `BusinessBankingApp` and say "resume the business banking build".

---

## Session 3 (cont.) — 2026-06-15 — Module 1 Adjudication PORTAL

**Scope (user-confirmed):** Adjudication slice on an extensible portal scaffold; **Vite-direct
proxy** (no Express). Brainstorm → sub-spec → plan → subagent-driven build (7 tasks P1–P7),
one implementer + one combined spec+quality reviewer per task.

**Built:**
- **Backend `portal/server/`** — FastAPI with a lifespan that loads the scorecard +
  adjudication model + policy config once, scores all 12k applicants (incl. SHAP reason
  codes) into `app.state`. 5 routes: `/health`, `/api/adjudication/applications`
  (paginated items/pages, decision filter), `/api/adjudication/{id}` (detail, fields
  top-level), `POST /api/adjudication/decide` (live What-If), `/api/adjudication/segments`.
  `service.py` only orchestrates Module 1 code (no logic duplicated). **6 API tests.**
- **Frontend `portal/client/`** — Vite + React + Tailwind + Recharts. 10 presentational
  components (Sidebar with other modules as disabled stubs, DecisionBadge, SliderControl,
  ReasonList, …), 4 views (Lookup / What-If / Segments / Dashboard), data layer (api/hooks/
  constants). Vite proxies `/api` → FastAPI:8100.
- **Playwright gate** — `playwright.config.js` boots uvicorn + Vite via `webServer`; 3
  headless smoke tests (lookup shows a decision badge; What-If `slider-dscr`→0.4 flips to
  Decline; Segments renders a chart). Runs as a single `npx playwright test`.

**Gates:** **46/46 backend pytest** (40 prior + 6 API), **3/3 Playwright**, **`vite build` ok**.

**Subagent token tally (portal phase) — for evaluating the subagent design:**

| Task | Role | Model | Tokens | Outcome |
|------|------|-------|-------:|---------|
| P1 backend | impl | sonnet | 43,814 | DONE → APPROVED (+3 controller fixes) |
| P1 backend | review | sonnet | 60,534 | APPROVED (3 minor: pydantic ns, abs path, stale file) |
| P2 API tests | impl | sonnet | 38,553 | DONE → APPROVED |
| P2 API tests | review | haiku | 43,700 | APPROVED |
| P3 client scaffold | impl | sonnet | 41,244 | DONE → APPROVED |
| P3 client scaffold | review | haiku | 48,974 | APPROVED |
| P4 components | impl | sonnet | 48,641 | DONE → APPROVED (+3 controller fixes) |
| P4 components | review | sonnet | 31,376 | APPROVED (3 minor robustness) |
| P5 views + App | impl | sonnet | 52,685 | DONE |
| P5 views + App | review | sonnet | 49,159 | CHANGES REQ → controller-fixed (debounce cleanup, testid) |
| P6 Playwright | impl | sonnet | 39,593 | DONE → APPROVED |
| P6 Playwright | review | sonnet | 36,524 | APPROVED (independently re-ran gate, 3 passed) |

- **Portal total: 534,797 tokens / 12 dispatches** (impl 264,530 + review 270,267).
- By model: sonnet 442,123 (10), haiku 92,674 (2).
- 11/12 clean; 1 changes-requested (P5) fixed inline by the controller. Two APPROVED tasks
  also got small controller-applied review nits (P1, P4) — all trivial, well-specified.
- **Combined session total (backend + portal): 942,026 tokens / 26 dispatches.**
- **Design takeaways:** (a) front-end tasks ran more expensive than the backend ML tasks —
  reviews that actually compile/boot the app (P1, P5, P6 re-running the gate) cost the most
  but caught the only real CHANGES-REQUESTED items, so the spend tracked value. (b) Using
  haiku for transcription-heavy review (P2, P3) saved ~40% vs sonnet with no quality loss.
  (c) Shipping complete backend code + config in the plan but only contracts+testids for the
  React layer worked well: implementers adapted the m03_churn reference for idiomatic UI
  while the testid contracts kept the Playwright gate stable across the component/view split.

**Status:** Module 1 fully complete (backend + portal). **Awaiting user review before merge to
`main`** (mirrors prior phases). Branch `build/adjudication`.

**Resume:** open `BusinessBankingApp` and say "resume the business banking build".

---

## Session 4 — 2026-06-15 — Module 2 Pricing & Profitability (engine + portal)

**Scope (user-confirmed):** engine + portal in one session; EAD = requested_amount, quoted
rate = risk_based_rate (DGP), PD from the Module 0 scorecard. Brainstorm → sub-spec → plan →
subagent-driven build (8 tasks T1–T8), one implementer + one combined spec+quality reviewer
per task. (Module 1 was merged to `main` via merge commit f6d4918 at the start of the session.)

**Built:**
- **Engine `pricing/src/engine.py`** — `MarketAssumptions` (frozen, overridable) + profit
  waterfall (interest − COF − EL − opex = pre-tax; net = pre-tax·(1−tax); ROE = net/equity,
  RAROC = pre-tax/equity) + closed-form `break_even_rate` / `hurdle_clearing_rate` /
  `recommended_rate` (= hurdle-clearing + base_margin) + `price_loan` (mispricing flag).
  Pure, deterministic; **9 tests, math independently verified to machine precision**.
- **Portfolio `pricing/src/portfolio.py`** — prices the 8,336 booked loans (PD via scorecard),
  `portfolio_summary`, validation report.
- **Portal backend** — `pricing_service.py` + 3 routes (`/api/pricing/{id}`, `/portfolio`,
  `POST /quote`); lifespan caches the priced population (~3.8s startup, no adjudication
  regression). 4 API tests.
- **Portal frontend** — Waterfall + PassFailBadge components; **Sidebar/App nav refactor to a
  two-module layout** (Adjudication + Pricing groups) that PRESERVES the existing adjudication
  testids (back-compat proven by re-running the adjudication e2e); 3 pricing views.
- **Playwright** — `pricing.spec.js` (3 tests); full gate runs **6/6** (3 adjudication + 3
  pricing).

**Gates:** **61/61 backend pytest**, **6/6 Playwright**, **vite build ok**.

**Finding (in the validation report):** only **30.4%** of booked loans clear the 15% ROE
hurdle at their quoted rate (median ROE 10.9%, **$1.28B mispriced EAD**). This is a legitimate
result — it reflects the modeled scorecard PD vs the DGP-set rates, exactly the mispricing the
engine is built to surface. Worst-priced bands are AAA (80%) and A (73%): prime loans get low
quoted rates that miss the ~6.9% capital-charge floor.

**Subagent token tally (Module 2) — for evaluating the subagent design:**

| Task | Role | Model | Tokens | Outcome |
|------|------|-------|-------:|---------|
| T1 engine | impl | sonnet | 41,091 | DONE → APPROVED |
| T1 engine | review | sonnet | 49,005 | APPROVED (math verified to machine precision) |
| T2 portfolio | impl | sonnet | 40,868 | DONE → APPROVED (+2 controller nits) |
| T2 portfolio | review | sonnet | 49,054 | APPROVED (30.4% clear-rate verified legit) |
| T3 backend routes | impl | sonnet | 47,300 | DONE → APPROVED |
| T3 backend routes | review | sonnet | 52,833 | APPROVED (3.8s startup, no adj regression) |
| T4 API tests | impl | haiku | 46,002 | DONE → APPROVED |
| T4 API tests | review | haiku | 43,225 | APPROVED |
| T5 data + nav | impl | sonnet | 61,882 | DONE → APPROVED |
| T5 data + nav | review | sonnet | 56,404 | APPROVED (adj e2e back-compat proven) |
| T6 views | impl | sonnet | 41,152 | DONE → APPROVED |
| T6 views | review | sonnet | 55,093 | APPROVED (API field names correct) |
| T7 playwright | impl | sonnet | 50,708 | DONE → APPROVED (6/6 e2e) |
| T7 playwright | review | haiku | 38,963 | APPROVED (re-ran 6/6) |

- **Module 2 total: 673,580 tokens / 14 dispatches** (impl 329,003 + review 344,577).
- By model: sonnet 545,390 (11), haiku 128,190 (3).
- **14/14 dispatches clean** — zero CHANGES-REQUESTED this module (the complete-code plan +
  machine-verifiable engine made implementers near-exact). T2 got 2 trivial controller-applied
  nits (unused import, path anchoring).
- **Program cumulative: ~1,615,606 tokens** across Adjudication backend (407k) + Adjudication
  portal (535k) + Pricing (674k); 40 subagent dispatches total.
- **Design takeaways:** (a) analytical/deterministic modules are the cheapest and cleanest to
  drive — the engine review verified correctness to 1e-16 in one pass, no iteration. (b) The
  most valuable review this module was T5 (nav refactor): re-running the *existing* adjudication
  e2e proved the refactor didn't regress a shipped feature — spend review budget on changes that
  touch already-merged surfaces. (c) Reviews again cost ≈ implementations (345k vs 329k); for
  full-code-spec tasks a lighter review tier is defensible, but the back-compat and math
  verifications justified the spend here.

**Status:** Module 2 complete (engine + portal). **Awaiting user review before merge to `main`.**
Branch `build/pricing`.

**Resume:** open `BusinessBankingApp` and say "resume the business banking build".

---

## Session 5 — 2026-06-15 — Module 3 Portfolio & Early Warning (EWS)

**Scope (user-confirmed):** backend + portal in one session; full 24-mo panel as observation
history. Subagent-driven, 9 tasks (T1–T9), one implementer + one combined spec+quality
reviewer per task. (Modules 1+2 merged to main via f6d4918, 70b4461 earlier in the program.)

**Built:**
- **Panel features `ews/src/feature_engineering.py`** — per-account behavioral trends from the
  24-mo panel (util drift/volatility, deposit decline, DPD counts, overdrafts) + on-book +
  modeled score/PD. `lru_cache` on the static panel aggregation (after a perf review).
- **Triggers `ews/src/triggers.py`** — 5 named rules (HIGH_UTILIZATION, RISING_UTILIZATION,
  DELINQUENCY, DEPOSIT_DECLINE, FREQUENT_OVERDRAFTS), pure/vectorized.
- **Model `ews/src/train.py` + watchlist** — LightGBM on deterioration_next_6_12mo + SHAP;
  risk tiers (High/Med/Low, calibrated) + ranked watchlist; reuses `top_adverse_shap`.
- **Portal** — `ews_service.py` + 3 routes (`/api/ews/{id}` with the 24-mo trajectory,
  `/watchlist`, `/segments`); lifespan caches the scored population. RiskTrajectory (Recharts
  line) + RiskTierBadge components; 3 views; **three-module nav** (Adjudication + Pricing +
  Early Warning). API tests.
- **Playwright** `ews.spec.js` (3) — full gate runs **9/9** (3 adj + 3 pricing + 3 ews).

**Gate decision (Option B):** the trainer hit a genuine BLOCK — the synthetic
`deterioration_next_6_12mo` label is noise-capped (logit noise + Bernoulli draw → verified
oracle ceiling ~0.70 AUC), so AUC>=0.75 / capture>=3x are unreachable on the current data.
Per user direction, the gate was set to what the data honestly supports: **top-decile capture
>= 2x lift and PR-AUC > base rate**, AUC reported (not gated). Result: **capture 21.6% (2.16x
lift), PR-AUC 0.308 (base 0.180), AUC 0.662.** A signal-sharpening enhancement (Option A —
reduce DGP noise + regenerate, verified safe for already-merged modules) is documented in
`ews/docs/enhancement_notes.md` for the model-whitepaper agent; deferred, not executed.

**Gates:** **80/80 backend pytest**, **9/9 Playwright**, **vite build ok**.

**Subagent token tally (Module 3) — for evaluating the subagent design:**

| Task | Role | Model | Tokens | Outcome |
|------|------|-------|-------:|---------|
| T1 config | impl | haiku | 42,935 | DONE; controller-reviewed (trivial append) |
| T2 panel features | impl | sonnet | 42,850 | DONE → APPROVED (+controller perf cache) |
| T2 panel features | review | sonnet | 58,676 | APPROVED (agg math bit-exact; flagged perf) |
| T3 triggers | impl | haiku | 40,132 | DONE → APPROVED |
| T3 triggers | review | haiku | 35,989 | APPROVED |
| T4 trainer + watchlist | impl | sonnet | 73,187 | **BLOCKED** (gate unreachable) → controller resolved Option B |
| T4 trainer + watchlist | review | sonnet | 63,395 | APPROVED (honest gate; +docstring fix) |
| T5 EWS routes | impl | sonnet | 50,025 | DONE → APPROVED |
| T5 EWS routes | review | sonnet | 53,460 | APPROVED (no adj/pricing regression) |
| T6 API tests | impl | haiku | 43,559 | DONE; controller-verified |
| T7 three-module nav | impl | sonnet | 49,447 | DONE → APPROVED |
| T7 three-module nav | review | sonnet | 57,642 | APPROVED (adj+pricing back-compat proven) |
| T8 EWS views | impl | sonnet | 39,007 | DONE → APPROVED |
| T8 EWS views | review | sonnet | 31,496 | APPROVED (API field names exact) |
| T9 Playwright | impl | sonnet | 30,833 | DONE (9/9 e2e); controller did ledger/tally |

- **Module 3 total: 712,633 tokens / 15 dispatches** (impl 411,975 + review 300,658).
- By model: sonnet 550,018 (11), haiku 162,615 (4).
- **1 genuine BLOCK** (T4): the subagent correctly escalated a data-signal ceiling rather than
  gaming the gate — the highest-value escalation of the program. The controller resolved it via
  a user decision (Option B) + an enhancement note. 2 tasks were controller-reviewed/verified
  (T1 trivial config, T6 test transcription) to save ~2 review dispatches.
- **Program cumulative: ~2,328,239 tokens** across 5 build sessions (adj backend 407k + adj
  portal 535k + pricing 674k + ews 713k), ~55 subagent dispatches.
- **Design takeaways:** (a) the BLOCK is the headline data point — subagents will (and should)
  escalate when a metric gate is mathematically unreachable; that judgment is worth more than a
  silently-weakened pass. (b) The panel-feature perf review paid off: caching the static
  aggregation cut repeated calls from ~2.4s to ~0, which matters once the lifespan + test
  fixtures call it many times. (c) The third nav refactor again proved its worth by re-running
  the prior modules' e2e — back-compat verification is the recurring high-value review.

**Status:** Module 3 complete. **Awaiting user review before merge to `main`.** Branch
`build/ews`.

**Resume:** open `BusinessBankingApp` and say "resume the business banking build".
