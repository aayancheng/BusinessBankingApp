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
