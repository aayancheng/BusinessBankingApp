import pandas as pd

from shared.config import RAW, LEAKAGE_COLUMNS
from ews.src.feature_engineering import (
    EWS_FEATURE_COLUMNS, compute_panel_features, compute_ews_features,
)


def test_panel_features_one_row_per_account():
    panel = pd.read_parquet(RAW / "panel.parquet")
    pf = compute_panel_features(panel)
    assert pf["business_id"].is_unique
    assert len(pf) == panel["business_id"].nunique()
    for c in ["util_recent", "util_drift", "deposit_decline_pct", "dpd_max",
              "overdraft_recent", "util_volatility"]:
        assert c in pf.columns


def test_ews_features_present_no_nan_leakage_free():
    port = pd.read_parquet(RAW / "portfolio.parquet").head(400)
    X = compute_ews_features(port)
    for c in EWS_FEATURE_COLUMNS:
        assert c in X.columns, c
    assert not X[EWS_FEATURE_COLUMNS].isna().any().any()
    assert set(EWS_FEATURE_COLUMNS).isdisjoint(set(LEAKAGE_COLUMNS))


def test_ews_features_include_panel_and_score():
    port = pd.read_parquet(RAW / "portfolio.parquet").head(200)
    X = compute_ews_features(port)
    assert "util_drift" in EWS_FEATURE_COLUMNS
    assert "business_score" in EWS_FEATURE_COLUMNS and "pd_score" in EWS_FEATURE_COLUMNS
    assert X["business_score"].between(300, 850).all()


def test_ews_features_deterministic():
    port = pd.read_parquet(RAW / "portfolio.parquet").head(200)
    a = compute_ews_features(port)[EWS_FEATURE_COLUMNS]
    b = compute_ews_features(port)[EWS_FEATURE_COLUMNS]
    pd.testing.assert_frame_equal(a, b)
