import json
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from shared.config import RAW, SCORE_MIN, SCORE_MAX
from score.src.feature_engineering import compute_features
from score.src.train import score_to_fico

MODELS = Path("score/models")

def test_score_to_fico_clamps_range():
    raw = np.array([-10.0, 0.0, 5.0, 999.0])
    out = score_to_fico(raw, lo=0.0, hi=5.0)
    assert out.min() >= SCORE_MIN and out.max() <= SCORE_MAX

def test_artifacts_exist_after_training():
    assert (MODELS / "scorecard.pkl").exists()
    assert (MODELS / "score_scaling.json").exists()
    assert (MODELS / "metadata.json").exists()

def test_score_range_and_rank_ordering():
    sc = joblib.load(MODELS / "scorecard.pkl")
    scaling = json.loads((MODELS / "score_scaling.json").read_text())
    biz = pd.read_parquet(RAW / "businesses.parquet")
    X = compute_features(biz)
    raw = sc.score(X)
    fico = score_to_fico(raw, scaling["lo"], scaling["hi"])
    assert fico.min() >= SCORE_MIN and fico.max() <= SCORE_MAX
    df = pd.DataFrame({"fico": fico, "default": biz["default"].to_numpy()})
    top = df[df["fico"] > df["fico"].median()]["default"].mean()
    bot = df[df["fico"] <= df["fico"].median()]["default"].mean()
    assert top < bot

def test_metric_gate():
    meta = json.loads((MODELS / "metadata.json").read_text())
    assert meta["metrics"]["auc"] >= 0.75, meta["metrics"]
    assert meta["metrics"]["ks"] >= 0.30, meta["metrics"]
