"""Glue for the pricing portal routes. Orchestrates the pricing engine + portfolio over the
cached priced population; no engine logic is redefined here."""
from __future__ import annotations

import pandas as pd

from shared.config import MARKET
from pricing.src.engine import MarketAssumptions, profit_waterfall, price_loan
from pricing.src.portfolio import price_population, portfolio_summary

BASE_MARKET = MarketAssumptions.from_market(MARKET)


def load_population() -> pd.DataFrame:
    df = price_population(BASE_MARKET)
    df.index = df["business_id"]
    return df


def detail_record(business_id: str, df: pd.DataFrame) -> dict | None:
    if business_id not in df.index:
        return None
    row = df.loc[business_id]
    full = price_loan(float(row["pd"]), float(row["ead"]),
                      float(row["quoted_rate"]), BASE_MARKET)
    return {
        "business_id": str(row["business_id"]),
        "industry": str(row["industry"]),
        "pd": float(row["pd"]),
        "ead": float(row["ead"]),
        "quoted_rate": float(row["quoted_rate"]),
        "recommended_rate": full["recommended_rate"],
        "hurdle_clearing_rate": full["hurdle_clearing_rate"],
        "roe_at_quoted": full["roe_at_quoted"],
        "raroc_at_quoted": full["raroc_at_quoted"],
        "roe_at_recommended": full["roe_at_recommended"],
        "clears_hurdle": full["clears_hurdle"],
        "mispriced": full["mispriced"],
        "rate_shortfall": full["rate_shortfall"],
        "waterfall_quoted": full["waterfall_quoted"],
    }


def quote(payload: dict) -> dict:
    overrides = {k: payload[k] for k in
                 ("cost_of_funds", "lgd", "opex_rate", "tax_rate", "capital_ratio", "fee_rate")
                 if payload.get(k) is not None}
    market = BASE_MARKET.replace(**overrides) if overrides else BASE_MARKET
    w = profit_waterfall(float(payload["pd"]), float(payload["ead"]),
                         float(payload["rate"]), market)
    return {
        "roe": w["roe"], "raroc": w["raroc"],
        "clears_hurdle": bool(w["roe"] >= market.roe_hurdle),
        "roe_hurdle": market.roe_hurdle, "waterfall": w,
    }


def portfolio(df: pd.DataFrame) -> dict:
    s = portfolio_summary(df)
    s["roe_hurdle"] = BASE_MARKET.roe_hurdle
    return s
