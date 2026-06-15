import pandas as pd

from shared.config import RAW
from score.src.predict import predict_score_pd


def test_predict_score_pd_shape_and_ranges():
    biz = pd.read_parquet(RAW / "businesses.parquet").head(200)
    out = predict_score_pd(biz)
    assert list(out.columns) == ["business_score", "pd", "score_band"]
    assert len(out) == len(biz)
    assert out["business_score"].between(300, 850).all()
    assert out["pd"].between(0.0, 1.0).all()
    assert out["score_band"].isin(["D", "C", "B", "A", "AAA"]).all()


def test_predict_score_pd_rank_orders():
    biz = pd.read_parquet(RAW / "businesses.parquet")
    out = predict_score_pd(biz)
    hi = out[out["business_score"] >= out["business_score"].median()]["pd"].mean()
    lo = out[out["business_score"] < out["business_score"].median()]["pd"].mean()
    assert hi < lo
