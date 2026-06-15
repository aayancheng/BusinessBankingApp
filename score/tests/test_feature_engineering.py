import pandas as pd
from shared.config import RAW
from score.src.feature_engineering import FEATURE_COLUMNS, compute_features

def _raw():
    return pd.read_parquet(RAW / "businesses.parquet")

def test_feature_columns_present_after_compute():
    X = compute_features(_raw())
    for c in FEATURE_COLUMNS:
        assert c in X.columns, f"missing engineered feature {c}"

def test_no_nan_in_features():
    X = compute_features(_raw())
    assert X[FEATURE_COLUMNS].isna().sum().sum() == 0

def test_deterministic():
    df = _raw()
    a = compute_features(df)[FEATURE_COLUMNS]
    b = compute_features(df)[FEATURE_COLUMNS]
    assert a.equals(b)

def test_leakage_columns_excluded():
    for leak in ["pd_default_origination", "default", "risk_based_rate", "booked"]:
        assert leak not in FEATURE_COLUMNS, f"leakage column {leak} must not be a feature"
