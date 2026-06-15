import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

from shared.config import RAW, SEED
from adjudication.src.feature_engineering import (
    ADJ_FEATURE_COLUMNS, compute_adjudication_features,
)
from adjudication.src.train import top_ventile_lift, AUC_GATE, LIFT_GATE

MODEL = Path("adjudication/models/adjudication_model.pkl")
META = Path("adjudication/models/metadata.json")


@pytest.mark.skipif(not MODEL.exists(), reason="run `python -m adjudication.src.train` first")
def test_saved_model_clears_gate():
    biz = pd.read_parquet(RAW / "businesses.parquet")
    X = compute_adjudication_features(biz)[ADJ_FEATURE_COLUMNS]
    y = biz["default"].to_numpy()
    _, X_te, _, y_te = train_test_split(
        X, y, test_size=0.2, random_state=SEED, stratify=y)
    model = joblib.load(MODEL)
    p = model.predict_proba(X_te)[:, 1]
    assert roc_auc_score(y_te, p) >= AUC_GATE
    assert top_ventile_lift(y_te, p) >= LIFT_GATE


@pytest.mark.skipif(not META.exists(), reason="run trainer first")
def test_metadata_records_gate_pass():
    meta = json.loads(META.read_text())
    assert meta["metrics"]["auc"] >= AUC_GATE
    assert meta["metrics"]["top20_lift"] >= LIFT_GATE
    assert set(meta["decision_mix_test"]).issubset({"Approve", "Refer", "Decline"})
