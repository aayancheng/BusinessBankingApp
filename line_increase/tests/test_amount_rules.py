import pytest

from line_increase.src.amount_rules import (
    recommended_amount, incremental_exposure, incremental_roe, waterfall_or_zero,
)


def test_amount_targets_utilization_then_rounds():
    # balance 65k, limit 100k, util_target 0.65 -> target_limit 100k -> delta 0 -> no offer
    assert recommended_amount(current_balance=65_000, credit_limit=100_000,
                              annual_revenue=1_000_000) == 0.0


def test_amount_recommends_increase_when_utilized():
    # balance 90k, limit 100k -> target_limit 90k/0.65 = 138.46k -> raw delta 38.46k.
    # pct_cap = 0.50*100k = 50k (not binding); revenue ceiling 0.30*1m - 100k = 200k (not binding).
    # rounds 38_461 -> 38_000.
    amt = recommended_amount(current_balance=90_000, credit_limit=100_000,
                             annual_revenue=1_000_000)
    assert amt == 38_000.0


def test_amount_capped_by_pct_of_limit():
    # very high balance wants a huge increase, but pct_cap binds at 0.50*limit.
    amt = recommended_amount(current_balance=200_000, credit_limit=100_000,
                             annual_revenue=10_000_000)
    assert amt == 50_000.0  # 0.50 * 100k


def test_amount_capped_by_revenue_ceiling():
    # pct cap would allow 50k, but revenue ceiling 0.30*200k - 100k = -40k -> no headroom.
    amt = recommended_amount(current_balance=200_000, credit_limit=100_000,
                             annual_revenue=200_000)
    assert amt == 0.0


def test_amount_zero_for_nonpositive_limit():
    assert recommended_amount(current_balance=10_000, credit_limit=0,
                              annual_revenue=500_000) == 0.0
