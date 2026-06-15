import joblib
import pandas as pd
from pathlib import Path
from shared.config import RAW
from score.src.feature_engineering import FEATURE_COLUMNS, compute_features
from score.src.reason_codes import top_reason_codes

def test_reason_codes_shape_and_content():
    sc = joblib.load(Path("score/models/scorecard.pkl"))
    biz = pd.read_parquet(RAW / "businesses.parquet").head(50)
    X = compute_features(biz)[FEATURE_COLUMNS]
    reasons = top_reason_codes(sc, X, k=3)
    assert len(reasons) == 50
    for r in reasons:
        for item in r:
            assert item["feature"] in FEATURE_COLUMNS
            assert item["impact"] > 0
