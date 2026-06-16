"""Glue for the EWS portal routes: cached scored population, per-account detail with the
24-month trajectory, watchlist, and segments. Reuses ews.src; no logic redefined."""
from __future__ import annotations

import pandas as pd

from shared.config import RAW
from ews.src.watchlist import score_population, watchlist as _watchlist

KEY_METRICS = ["util_recent", "util_drift", "dpd_max", "deposit_decline_pct", "overdraft_recent"]


def load_population() -> pd.DataFrame:
    return score_population()


def _trajectory(business_id: str) -> list[dict]:
    panel = pd.read_parquet(RAW / "panel.parquet")
    g = panel[panel["business_id"] == business_id].sort_values("month_index")
    return [{"month_index": int(r["month_index"]), "utilization": float(r["utilization"]),
             "days_past_due": float(r["days_past_due"]), "balance": float(r["balance"])}
            for _, r in g.iterrows()]


def detail_record(business_id: str, df: pd.DataFrame) -> dict | None:
    if business_id not in df.index:
        return None
    row = df.loc[business_id]
    return {
        "business_id": str(row["business_id"]),
        "industry": str(row["industry"]),
        "prob": float(row["prob"]),
        "risk_tier": str(row["risk_tier"]),
        "triggers": list(row["triggers"]),
        "top_shap_reasons": [{"feature": r["feature"], "impact": r["impact"]}
                             for r in row["top_shap_reasons"]],
        "key_metrics": {k: float(row[k]) for k in KEY_METRICS},
        "trajectory": _trajectory(business_id),
    }


def watchlist(df: pd.DataFrame, limit: int = 100) -> list[dict]:
    return _watchlist(df, top_n=limit)


def segments(df: pd.DataFrame) -> dict:
    def seg(col):
        rows = []
        for key, g in df.groupby(col):
            rate = float((g["risk_tier"] == "High").mean())
            rows.append({"key": str(key), "deterioration_rate": round(rate, 4), "count": int(len(g))})
        return sorted(rows, key=lambda r: r["key"])
    return {"by_band": seg("score_band"), "by_industry": seg("industry")}
