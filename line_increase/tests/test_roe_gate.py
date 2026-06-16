from line_increase.src.amount_rules import (
    incremental_exposure, incremental_roe, _MARKET,
)
from pricing.src.engine import hurdle_clearing_rate


def test_incremental_exposure_draws_at_utilization():
    assert incremental_exposure(50_000, 0.8) == 40_000.0
    assert incremental_exposure(50_000, 1.5) == 50_000.0  # util clipped to 1.0
    assert incremental_exposure(50_000, -0.2) == 0.0       # clipped to 0.0


def test_zero_amount_does_not_clear():
    r = incremental_roe(pd_=0.02, delta_amount=0.0, utilization_onbook=0.8, rate=0.20)
    assert r["incremental_ead"] == 0.0
    assert r["clears_hurdle"] is False
    assert r["incremental_net_income"] == 0.0


def test_high_rate_low_pd_clears_hurdle():
    r = incremental_roe(pd_=0.02, delta_amount=50_000, utilization_onbook=0.8, rate=0.20)
    assert r["incremental_ead"] == 40_000.0
    assert r["clears_hurdle"] is True
    assert r["roe"] >= 0.15


def test_low_rate_does_not_clear():
    r = incremental_roe(pd_=0.05, delta_amount=50_000, utilization_onbook=0.8, rate=0.03)
    assert r["clears_hurdle"] is False


def test_roe_is_ead_invariant():
    # Same pd & rate, different drawdown -> identical ROE ratio (only $ figures scale).
    a = incremental_roe(pd_=0.03, delta_amount=20_000, utilization_onbook=0.5, rate=0.18)
    b = incremental_roe(pd_=0.03, delta_amount=80_000, utilization_onbook=0.9, rate=0.18)
    assert abs(a["roe"] - b["roe"]) < 1e-12
    assert b["incremental_net_income"] > a["incremental_net_income"]
