"""Central configuration: paths, seed, population sizes, market assumptions."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "shared" / "data" / "raw"
PROCESSED = ROOT / "shared" / "data" / "processed"

SEED = 42

# Population
N_BUSINESSES = 12_000        # applicants
PANEL_MONTHS = 24            # months of on-book behavioral history

# Market assumptions (used by Pricing in a later phase; stored here as the single source)
MARKET = {
    "cost_of_funds": 0.035,  # COF / FTP rate
    "lgd": 0.45,             # loss given default
    "opex_rate": 0.010,      # operating cost as a rate on EAD
    "tax_rate": 0.25,
    "capital_ratio": 0.12,   # allocated equity = capital_ratio * EAD (simplified RWA=EAD)
    "base_margin": 0.020,    # target margin baked into reference pricing
    "roe_hurdle": 0.15,
}

# Score scaling (FICO-like target band)
SCORE_MIN = 300
SCORE_MAX = 850

# Ports (for later app phases)
PORTS = {"fastapi": 8100, "express": 3100, "vite": 5180}

RAW.mkdir(parents=True, exist_ok=True)
PROCESSED.mkdir(parents=True, exist_ok=True)

# Columns that must never enter any model's feature matrix (target / post-decision /
# downstream-module leakage). Single source of truth for all modules.
LEAKAGE_COLUMNS = [
    "pd_default_origination",     # DGP ground-truth PD
    "default",                    # adjudication target
    "risk_based_rate",            # priced from the true PD
    "booked",                     # funding decision (post-adjudication)
    "deterioration_next_6_12mo",  # downstream EWS target
    "line_increase_good",         # downstream line-increase target
]

# Adjudication policy-layer defaults (PD zones, hard knockouts, refer overrides).
# t_low / t_high are re-calibrated from the model PD distribution at train time and
# written to adjudication/models/policy_config.json; these are the seed values.
ADJ_POLICY = {
    "t_low": 0.10,          # pd <= t_low  -> Approve zone
    "t_high": 0.35,         # pd >= t_high -> Decline zone
    "dscr_floor": 1.0,      # dscr < floor -> hard Decline
    "dscr_refer_hi": 1.2,   # approve-zone pd but dscr in [floor, refer_hi) -> Refer
    "public_records_cap": 0,   # public_records > cap -> hard Decline
    "prior_delinq_cap": 3,     # prior_delinquencies >= cap -> hard Decline
    "leverage_cap": 6.0,    # leverage > cap -> hard Decline
    "req_to_rev_cap": 0.75, # requested_amount / annual_revenue > cap -> Refer
    "score_floor": 600,     # approve-zone pd but business_score < floor -> Refer
}

# Early-Warning trigger thresholds (Module 3) — named behavioral rules.
EWS_TRIGGERS = {
    "high_utilization": 0.90,    # util_recent > this
    "rising_utilization": 0.15,  # util_drift > this
    "dpd_severe": 30,            # dpd_max >= this (or dpd_recent > 0)
    "deposit_decline": 0.30,     # deposit_decline_pct > this
    "overdraft_recent": 3,       # overdraft_recent >= this
}

# Early-Warning risk-tier cutoffs on predicted deterioration probability.
# Seed values; re-calibrated from the score distribution at train time.
EWS_TIERS = {"t_high": 0.40, "t_med": 0.20}

# Proactive Line Increase (Module 4) — amount rules + incremental-ROE gate.
# target_util: post-increase utilization target the amount rule aims for.
# pct_cap: max increase as a fraction of the current limit.
# revenue_mult_cap: total post-increase limit capped at this multiple of annual revenue.
# round_to: recommended increase rounded to the nearest this many currency units.
# offer_quantile: candidates with predicted prob at/above this population quantile are
#   offer-eligible (re-calibrated at train time and written to metadata.json).
# roe_hurdle: incremental-ROE hurdle (mirrors MARKET['roe_hurdle']).
LINE_INCREASE = {
    "target_util": 0.65,
    "pct_cap": 0.50,
    "revenue_mult_cap": 0.30,
    "round_to": 1000,
    "offer_quantile": 0.75,
    "roe_hurdle": 0.15,
}
