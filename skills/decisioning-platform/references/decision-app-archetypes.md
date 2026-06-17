# Decision-App Archetypes (detailed recipes)

Every decision app in a platform is one of these four. Each consumes the shared score-spine
output (predicted score/PD) plus its own leakage-safe features. The generic per-module recipe is:

`feature-engineering → train OR engine → logic layer → reason codes → service → views → e2e → gate`

## 1. Eligibility / Triage

**Purpose:** turn risk into a discrete decision with auditable reasons.
**Shape:** an ML model (default/risk probability) **+ a deterministic policy/knockout layer**.
- Model: gradient boosting on leakage-safe features → probability.
- Policy: hard knockouts (rules that always decline regardless of model), then probability zones
  (low → approve, mid → refer, high → decline), then refer-overrides. Knockouts win; overrides
  only downgrade.
- Reason codes: top adverse SHAP contributions + which policy rules fired.
**Gate:** model AUC ≥ target (set by ceiling), top-decile lift ≥ target; sane decision mix.
**Watch:** the decision mix is often driven by knockout prevalence, not the probability cutoffs —
check which lever actually moves it before "tuning."

## 2. Economics (deterministic engine — no ML)

**Purpose:** turn the score into money (price, margin, ROI) and flag mis-pricing.
**Shape:** a pure, deterministic engine — NOT a model.
- Inputs: score→expected-loss, cost-of-funds/opex/tax assumptions (frozen, overridable),
  exposure.
- Waterfall: revenue − cost-of-funds − expected-loss − opex = pre-tax; net = pre-tax·(1−tax);
  ROE = net/equity; RAROC = pre-tax/equity.
- Closed-form helpers: break-even rate, hurdle-clearing rate, recommended rate; a mispricing flag.
**Gate:** math verified to machine precision by unit tests (deterministic → no statistical gate).
**Watch:** report portfolio-level findings (e.g. "% of book clearing the hurdle") — that's the
headline insight, and it's legitimate even when uncomfortable.

## 3. Monitoring / Early-Warning

**Purpose:** rank the existing book by deterioration risk; explain why; produce a watchlist.
**Shape:** a behavioral-**panel** model + named triggers + tiers.
- Features: per-entity trends from a time panel (drift, volatility, declines, delinquency counts).
  Cache the static panel aggregation (it's recomputed often).
- Model: gradient boosting on the deterioration target + SHAP.
- Triggers: a handful of named, pure rules (e.g. HIGH_UTILIZATION, RISING_TREND, DELINQUENCY).
- Output: calibrated High/Med/Low tiers + a ranked watchlist + per-entity trajectory.
**Gate:** the deterioration target is usually **noise-capped** (see synthetic-entity-data). Expect
an honest gate (top-decile capture ≥ 2× lift, PR-AUC > base rate), AUC reported not gated.

## 4. Next-Best-Action

**Purpose:** proactively pick entities for an action and size it, only when it pays.
**Shape:** a candidate model + action/amount rules + an **incremental-economics gate**.
- Candidate model: probability the action succeeds (e.g. "good line increase") + positive-SHAP
  reasons.
- Amount/action rules: pure functions (e.g. headroom-to-target, capped by limits).
- Incremental-economics gate: price the *incremental* exposure via the Economics engine; only
  offer when incremental ROE ≥ hurdle. Add a risk-appetite ceiling (e.g. PD percentile) so the
  offered cohort is genuinely better than the book.
**Gate:** candidate AUC + lift; AND cohort quality (offered-cohort risk ≪ book, utilization/uptake
> book, aggregate incremental ROE ≥ hurdle).
**Watch:** if the success target is a synthetic **pure leaf**, you may sharpen its DGP rather than
accept a noise-capped gate — see synthetic-entity-data's pure-leaf branch.

## Mapping archetypes to a new domain

| Domain | Eligibility | Economics | Monitoring | Next-Best-Action |
|--------|-------------|-----------|------------|------------------|
| Credit (reference) | Adjudication | Loan pricing (ROE) | Early-warning | Line increase |
| Insurance | Underwriting | Premium/RAROC | Claims watch | Renewal/upsell |
| SaaS / CRM | Lead/qualify | Discount/LTV | Churn watch | Upsell/expansion |
| Supply chain | Vendor onboarding | Contract pricing | Disruption watch | Capacity offer |

Not every platform needs all four — the manifest selects which apply.
