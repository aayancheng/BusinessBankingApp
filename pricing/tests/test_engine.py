import math
import pytest

from shared.config import MARKET
from pricing.src.engine import (
    MarketAssumptions, profit_waterfall, break_even_rate,
    hurdle_clearing_rate, recommended_rate, price_loan,
)

M = MarketAssumptions.from_market(MARKET)


def test_waterfall_identity():
    w = profit_waterfall(pd_=0.05, ead=100_000, rate=0.12, market=M)
    assert math.isclose(
        w["pre_tax_profit"],
        w["interest_income"] - w["cost_of_funds"] - w["expected_loss"] - w["operating_cost"],
        rel_tol=1e-9, abs_tol=1e-6,
    )
    assert math.isclose(w["net_income"], w["pre_tax_profit"] * (1 - M.tax_rate),
                        rel_tol=1e-9, abs_tol=1e-6)
    assert math.isclose(w["allocated_equity"], M.capital_ratio * 100_000,
                        rel_tol=1e-9, abs_tol=1e-6)
    assert math.isclose(w["roe"], w["net_income"] / w["allocated_equity"],
                        rel_tol=1e-9, abs_tol=1e-9)


def test_hurdle_clearing_rate_gives_exact_hurdle():
    r = hurdle_clearing_rate(pd_=0.05, ead=250_000, market=M)
    w = profit_waterfall(pd_=0.05, ead=250_000, rate=r, market=M)
    assert math.isclose(w["roe"], M.roe_hurdle, rel_tol=0, abs_tol=1e-6)


def test_break_even_rate_gives_zero_roe():
    r = break_even_rate(pd_=0.08, ead=120_000, market=M)
    w = profit_waterfall(pd_=0.08, ead=120_000, rate=r, market=M)
    assert math.isclose(w["roe"], 0.0, abs_tol=1e-6)


def test_recommended_rate_clears_hurdle():
    r = recommended_rate(pd_=0.10, ead=80_000, market=M)
    w = profit_waterfall(pd_=0.10, ead=80_000, rate=r, market=M)
    assert w["roe"] >= M.roe_hurdle  # base_margin cushion keeps it above


def test_recommended_rate_monotonic_in_pd():
    rates = [recommended_rate(pd_=p, ead=100_000, market=M)
             for p in (0.01, 0.05, 0.10, 0.20, 0.35)]
    assert all(b > a for a, b in zip(rates, rates[1:]))


def test_raroc_ge_roe_for_positive_pretax():
    w = profit_waterfall(pd_=0.03, ead=100_000, rate=0.15, market=M)
    assert w["pre_tax_profit"] > 0
    assert w["raroc"] >= w["roe"]


def test_price_loan_flags_mispriced():
    # quoted well below the hurdle-clearing rate → mispriced, clears_hurdle False
    hc = hurdle_clearing_rate(pd_=0.15, ead=100_000, market=M)
    res = price_loan(pd_=0.15, ead=100_000, quoted_rate=hc - 0.05, market=M)
    assert res["mispriced"] is True
    assert res["clears_hurdle"] is False
    assert res["rate_shortfall"] > 0
    # a generously-priced loan clears
    res2 = price_loan(pd_=0.05, ead=100_000, quoted_rate=hc + 0.10, market=M)
    assert res2["clears_hurdle"] is True
    assert res2["mispriced"] is False


def test_ead_must_be_positive():
    with pytest.raises(ValueError):
        profit_waterfall(pd_=0.05, ead=0, rate=0.1, market=M)


def test_market_overrides():
    m2 = M.replace(roe_hurdle=0.25)
    assert m2.roe_hurdle == 0.25 and M.roe_hurdle != 0.25  # original unchanged
