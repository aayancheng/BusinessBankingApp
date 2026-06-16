"""Glue for the line-increase portal routes: cached scored population, per-account detail
(with post-increase utilization + incremental-ROE waterfall), candidate list, segments, and
a what-if simulate. Reuses line_increase.src + the pricing engine; no logic redefined."""
from __future__ import annotations

import pandas as pd

from shared.config import MARKET, LINE_INCREASE
from line_increase.src.candidates import score_population, candidates as _candidates, segments as _segments
from line_increase.src.amount_rules import recommended_amount, incremental_roe
from pricing.src.engine import MarketAssumptions

_MARKET = MarketAssumptions.from_market(MARKET)


def load_population() -> pd.DataFrame:
    return score_population()


def candidates(df: pd.DataFrame, top_n: int | None = None) -> list[dict]:
    return _candidates(df, top_n=top_n)


def segments(df: pd.DataFrame) -> dict:
    return _segments(df)


def _post_increase_util(current_balance: float, credit_limit: float, amount: float) -> float:
    new_limit = credit_limit + amount
    return round(current_balance / new_limit, 4) if new_limit > 0 else 0.0


def detail_record(business_id: str, df: pd.DataFrame) -> dict | None:
    if business_id not in df.index:
        return None
    row = df.loc[business_id]
    incr = incremental_roe(float(row["pd"]), float(row["recommended_amount"]),
                           float(row["utilization_onbook"]), float(row["rate"]), _MARKET)
    return {
        "business_id": str(row["business_id"]),
        "industry": str(row["industry"]),
        "score_band": str(row["score_band"]),
        "pd": float(row["pd"]),
        "prob": float(row["prob"]),
        "eligible": bool(row["eligible"]),
        "credit_limit": float(row["credit_limit"]),
        "current_balance": float(row["current_balance"]),
        "utilization_onbook": float(row["utilization_onbook"]),
        "recommended_amount": float(row["recommended_amount"]),
        "post_increase_utilization": _post_increase_util(
            float(row["current_balance"]), float(row["credit_limit"]),
            float(row["recommended_amount"])),
        "rate": float(row["rate"]),
        "incremental": {k: incr[k] for k in
                        ("incremental_ead", "incremental_net_income", "roe",
                         "clears_hurdle", "hurdle_clearing_rate")},
        "waterfall": incr["waterfall"],
        "top_shap_reasons": [{"feature": r["feature"], "impact": r["impact"]}
                             for r in row["top_shap_reasons"]],
    }


def simulate(payload: dict, df: pd.DataFrame) -> dict | None:
    business_id = payload["business_id"]
    if business_id not in df.index:
        return None
    row = df.loc[business_id]
    if payload.get("proposed_amount") is not None:
        amount = float(payload["proposed_amount"])
    elif payload.get("target_util") is not None:
        amount = recommended_amount(
            float(row["current_balance"]), float(row["credit_limit"]),
            float(row["annual_revenue"]) if "annual_revenue" in row else 1e18,
            {**LINE_INCREASE, "target_util": float(payload["target_util"])})
    else:
        amount = float(row["recommended_amount"])
    incr = incremental_roe(float(row["pd"]), amount,
                           float(row["utilization_onbook"]), float(row["rate"]), _MARKET)
    return {
        "business_id": str(business_id),
        "proposed_amount": amount,
        "incremental": {k: incr[k] for k in
                        ("incremental_ead", "incremental_net_income", "roe",
                         "clears_hurdle", "hurdle_clearing_rate")},
        "waterfall": incr["waterfall"],
    }
