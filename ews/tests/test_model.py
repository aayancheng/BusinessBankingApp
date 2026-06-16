import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from sklearn.model_selection import train_test_split

from shared.config import RAW, SEED
from ews.src.feature_engineering import EWS_FEATURE_COLUMNS, compute_ews_features
from ews.src.train import top_decile_capture, CAPTURE_GATE, AUC_REPORT_FLOOR
from sklearn.metrics import roc_auc_score, average_precision_score

MODEL = Path("ews/models/ews_model.pkl")
META = Path("ews/models/metadata.json")


@pytest.mark.skipif(not MODEL.exists(), reason="run `python -m ews.src.train` first")
def test_saved_model_clears_gate():
    import joblib
    port = pd.read_parquet(RAW / "portfolio.parquet")
    X = compute_ews_features(port)[EWS_FEATURE_COLUMNS]
    y = port["deterioration_next_6_12mo"].to_numpy()
    _, X_te, _, y_te = train_test_split(X, y, test_size=0.2, random_state=SEED, stratify=y)
    model = joblib.load(MODEL)
    p = model.predict_proba(X_te)[:, 1]
    base = float(y_te.mean())
    assert top_decile_capture(y_te, p) >= CAPTURE_GATE        # >= 2x lift
    assert average_precision_score(y_te, p) > base            # PR-AUC beats baseline
    assert roc_auc_score(y_te, p) >= AUC_REPORT_FLOOR         # sanity floor


@pytest.mark.skipif(not META.exists(), reason="run trainer first")
def test_metadata_and_tiers():
    meta = json.loads(META.read_text())
    assert meta["metrics"]["top_decile_capture"] >= CAPTURE_GATE
    assert meta["metrics"]["pr_auc"] > meta["base_rate"]
    assert meta["tiers"]["t_high"] > meta["tiers"]["t_med"]


def test_watchlist_ranks_and_tiers():
    from ews.src.watchlist import score_population, watchlist
    df = score_population()
    wl = watchlist(df, top_n=20)
    assert len(wl) == 20
    probs = [w["prob"] for w in wl]
    assert probs == sorted(probs, reverse=True)
    assert all(w["risk_tier"] in {"High", "Medium", "Low"} for w in wl)
