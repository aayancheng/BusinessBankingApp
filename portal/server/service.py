"""Glue between the portal API and Module 0/1 code. No business logic is defined here;
this only orchestrates feature engineering + model + policy + reason codes."""
from __future__ import annotations
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap

from shared.config import RAW
from adjudication.src.feature_engineering import (
    ADJ_FEATURE_COLUMNS, compute_adjudication_features,
)
from adjudication.src.policy import PolicyConfig, decide
from adjudication.src.reason_codes import top_adverse_shap

MODELS = Path(__file__).resolve().parent.parent.parent / "adjudication" / "models"
KEY_RATIO_COLS = ["dscr", "leverage", "current_ratio", "utilization", "debt_to_income"]


def load_artifacts():
    model = joblib.load(MODELS / "adjudication_model.pkl")
    config = PolicyConfig.from_dict(json.loads((MODELS / "policy_config.json").read_text()))
    metadata = json.loads((MODELS / "metadata.json").read_text())
    explainer = shap.TreeExplainer(model)
    return model, config, metadata, explainer


def baseline_row() -> dict:
    """Median-ish representative applicant used to fill missing What-If fields."""
    biz = pd.read_parquet(RAW / "businesses.parquet")
    num = biz.median(numeric_only=True).to_dict()
    cat = {c: biz[c].mode().iloc[0] for c in ["industry", "entity_type", "loan_purpose"]}
    return {**num, **cat}


def _shap_values(explainer, X):
    sv = explainer.shap_values(X)
    return sv[1] if isinstance(sv, list) else sv


def score_population(model, config, explainer) -> pd.DataFrame:
    """Score every applicant; return a DataFrame indexed by business_id with the
    decision record columns the API serves."""
    biz = pd.read_parquet(RAW / "businesses.parquet")
    feats = compute_adjudication_features(biz)
    X = feats[ADJ_FEATURE_COLUMNS]
    pd_model = model.predict_proba(X)[:, 1]
    dec = decide(feats, pd_model, config)
    sv = _shap_values(explainer, X)
    shap_reasons = top_adverse_shap(sv, ADJ_FEATURE_COLUMNS, k=3)

    out = pd.DataFrame({
        "business_id": biz["business_id"].astype(str).to_numpy(),
        "industry": biz["industry"].to_numpy(),
        "business_score": feats["business_score"].astype(int).to_numpy(),
        "score_band": feats["score_band"].astype(str).to_numpy(),
        "pd": np.round(pd_model, 4),
        "decision": dec["decision"].to_numpy(),
        "requested_amount": biz["requested_amount"].astype(float).to_numpy(),
        "rule_hits": dec["decision_reasons"].to_list(),
        "top_shap_reasons": shap_reasons,
    })
    for c in KEY_RATIO_COLS:
        out[c] = feats[c].astype(float).round(4).to_numpy()
    out.index = out["business_id"]
    return out


def record_to_detail(row: pd.Series) -> dict:
    return {
        "business_id": str(row["business_id"]),
        "decision": str(row["decision"]),
        "pd": float(row["pd"]),
        "business_score": int(row["business_score"]),
        "score_band": str(row["score_band"]),
        "industry": str(row["industry"]),
        "requested_amount": float(row["requested_amount"]),
        "key_ratios": {c: float(row[c]) for c in KEY_RATIO_COLS},
        "rule_hits": list(row["rule_hits"]),
        "top_shap_reasons": [{"feature": r["feature"], "impact": r["impact"]}
                             for r in row["top_shap_reasons"]],
    }


def decide_one(payload: dict, baseline: dict, model, config, explainer) -> dict:
    """What-If: fill missing fields from baseline, recompute the full decision."""
    row = {**baseline, **{k: v for k, v in payload.items() if v is not None}}
    row.setdefault("business_id", "WHATIF")
    df = pd.DataFrame([row])
    feats = compute_adjudication_features(df)
    X = feats[ADJ_FEATURE_COLUMNS]
    pd_model = model.predict_proba(X)[:, 1]
    dec = decide(feats, pd_model, config)
    sv = _shap_values(explainer, X)
    shap_reasons = top_adverse_shap(sv, ADJ_FEATURE_COLUMNS, k=3)
    rec = pd.Series({
        "business_id": "WHATIF",
        "decision": dec["decision"].iloc[0],
        "pd": round(float(pd_model[0]), 4),
        "business_score": int(feats["business_score"].iloc[0]),
        "score_band": str(feats["score_band"].iloc[0]),
        "industry": str(row["industry"]),
        "requested_amount": float(row["requested_amount"]),
        "rule_hits": dec["decision_reasons"].iloc[0],
        "top_shap_reasons": shap_reasons[0],
        **{c: float(feats[c].iloc[0]) for c in KEY_RATIO_COLS},
    })
    return record_to_detail(rec)


def segments(df: pd.DataFrame) -> dict:
    def _mix(group_col):
        rows = []
        for key, g in df.groupby(group_col):
            vc = g["decision"].value_counts(normalize=True)
            rows.append({
                "key": str(key),
                "approve": round(float(vc.get("Approve", 0.0)), 4),
                "refer": round(float(vc.get("Refer", 0.0)), 4),
                "decline": round(float(vc.get("Decline", 0.0)), 4),
                "count": int(len(g)),
            })
        return sorted(rows, key=lambda r: r["key"])
    return {"by_band": _mix("score_band"), "by_industry": _mix("industry")}
