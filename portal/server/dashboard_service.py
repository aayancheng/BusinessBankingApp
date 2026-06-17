"""Cross-module KPI summary for the Dashboard. Pure aggregation over the cached
populations in app.state — no model loads."""
from __future__ import annotations

from portal.server.pricing_service import BASE_MARKET


def dashboard_summary(adj_pop, pricing_pop, ews_pop, li_pop, metadata: dict) -> dict:
    m = metadata["metrics"]
    pct_clears = float((pricing_pop["roe_at_quoted"] >= BASE_MARKET.roe_hurdle).mean())
    n_high_risk = int((ews_pop["risk_tier"] == "High").sum())
    n_eligible = int(li_pop["eligible"].sum())
    return {
        "n_applicants": int(len(adj_pop)),
        "model_auc": float(m["auc"]),
        "pct_clears_hurdle": round(pct_clears, 4),
        "n_high_risk": n_high_risk,
        "n_eligible_offers": n_eligible,
        "status": "ok",
    }
