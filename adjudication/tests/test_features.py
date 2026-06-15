import pandas as pd

from shared.config import RAW, LEAKAGE_COLUMNS
from adjudication.src.feature_engineering import (
    ADJ_FEATURE_COLUMNS, compute_adjudication_features,
)


def _sample():
    return pd.read_parquet(RAW / "businesses.parquet").head(300)


def test_features_present_and_no_nan():
    X = compute_adjudication_features(_sample())
    for col in ADJ_FEATURE_COLUMNS:
        assert col in X.columns, col
    assert not X[ADJ_FEATURE_COLUMNS].isna().any().any()


def test_features_leakage_free():
    X = compute_adjudication_features(_sample())
    assert set(ADJ_FEATURE_COLUMNS).isdisjoint(set(LEAKAGE_COLUMNS))
    for col in LEAKAGE_COLUMNS:
        assert col not in ADJ_FEATURE_COLUMNS


def test_features_include_score_signal():
    X = compute_adjudication_features(_sample())
    assert "business_score" in ADJ_FEATURE_COLUMNS
    assert "pd_score" in ADJ_FEATURE_COLUMNS
    assert X["business_score"].between(300, 850).all()


def test_features_deterministic():
    a = compute_adjudication_features(_sample())[ADJ_FEATURE_COLUMNS]
    b = compute_adjudication_features(_sample())[ADJ_FEATURE_COLUMNS]
    pd.testing.assert_frame_equal(a, b)
