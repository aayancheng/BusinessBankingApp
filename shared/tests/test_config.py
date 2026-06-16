from shared.config import LEAKAGE_COLUMNS, ADJ_POLICY


def test_leakage_columns_complete():
    expected = {
        "pd_default_origination", "default", "risk_based_rate", "booked",
        "deterioration_next_6_12mo", "line_increase_good",
    }
    assert expected.issubset(set(LEAKAGE_COLUMNS))


def test_adj_policy_defaults_present():
    for key in ("t_low", "t_high", "leverage_cap", "dscr_floor",
                "dscr_refer_hi", "prior_delinq_cap", "req_to_rev_cap", "score_floor"):
        assert key in ADJ_POLICY
    assert 0.0 < ADJ_POLICY["t_low"] < ADJ_POLICY["t_high"] < 1.0


def test_ews_config_present():
    from shared.config import EWS_TRIGGERS, EWS_TIERS
    for k in ("high_utilization", "rising_utilization", "dpd_severe",
              "deposit_decline", "overdraft_recent"):
        assert k in EWS_TRIGGERS
    assert EWS_TIERS["t_high"] > EWS_TIERS["t_med"] > 0
