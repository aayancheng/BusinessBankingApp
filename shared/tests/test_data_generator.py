import numpy as np
from shared.data_generator import generate_businesses

def test_generate_businesses_shape_and_columns():
    df = generate_businesses(n=2000, seed=42)
    assert len(df) == 2000
    for col in [
        "business_id", "industry", "region", "entity_type", "years_in_business",
        "employees", "annual_revenue", "net_income", "total_debt", "current_ratio",
        "dscr", "leverage", "credit_history_months", "prior_delinquencies",
        "trade_lines", "utilization", "public_records", "requested_amount",
        "term_months", "loan_purpose", "collateral_flag",
        "pd_default_origination", "default", "risk_based_rate", "booked",
    ]:
        assert col in df.columns, f"missing {col}"

def test_default_rate_is_plausible():
    df = generate_businesses(n=8000, seed=42)
    rate = df["default"].mean()
    assert 0.05 <= rate <= 0.30, f"default rate {rate:.3f} out of plausible range"

def test_pd_rank_orders_default():
    df = generate_businesses(n=8000, seed=42)
    hi = df[df["pd_default_origination"] > df["pd_default_origination"].median()]["default"].mean()
    lo = df[df["pd_default_origination"] <= df["pd_default_origination"].median()]["default"].mean()
    assert hi > lo, "higher PD half should default more than lower PD half"

def test_determinism():
    a = generate_businesses(n=1000, seed=42)
    b = generate_businesses(n=1000, seed=42)
    assert a.equals(b)

def test_business_ids_unique():
    df = generate_businesses(n=5000, seed=42)
    assert df["business_id"].is_unique
