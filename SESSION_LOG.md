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
