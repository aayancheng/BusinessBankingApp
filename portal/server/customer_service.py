"""360-degree customer view: aggregate Score + Adjudication + Pricing + EWS +
Line-Increase for one business from the four cached populations. No model loads."""
from __future__ import annotations
import pandas as pd

from portal.server import service, pricing_service, ews_service, line_increase_service


def _top_reason(reasons: list) -> str | None:
    if not reasons:
        return None
    r = reasons[0]
    return r.get("feature") if isinstance(r, dict) else str(r)


def customer_360(business_id, adj_pop, pricing_pop, ews_pop, li_pop) -> dict | None:
    if business_id not in adj_pop.index:
        return None
    adj = service.record_to_detail(adj_pop.loc[business_id])
    booked = business_id in pricing_pop.index
    profile = {"business_id": business_id, "industry": adj["industry"], "booked": bool(booked)}
    score = {"business_score": int(adj["business_score"]), "score_band": str(adj["score_band"])}
    adjudication = {"decision": adj["decision"], "pd": float(adj["pd"]),
                    "top_reason": _top_reason(adj.get("top_shap_reasons", []))}
    pricing = None
    pr = pricing_service.detail_record(business_id, pricing_pop)
    if pr is not None:
        pricing = {"quoted_rate": float(pr["quoted_rate"]), "roe": float(pr["roe_at_quoted"]),
                   "clears_hurdle": bool(pr["clears_hurdle"])}
    ews = None
    ew = ews_service.detail_record(business_id, ews_pop)
    if ew is not None:
        ews = {"risk_tier": str(ew["risk_tier"]), "deterioration_prob": float(ew["prob"]),
               "n_triggers": int(len(ew["triggers"]))}
    line_increase = None
    li = line_increase_service.detail_record(business_id, li_pop)
    if li is not None:
        line_increase = {"eligible": bool(li["eligible"]),
                         "recommended_amount": float(li["recommended_amount"]),
                         "incremental_roe": float(li["incremental"]["roe"])}
    modules_present = ["score", "adjudication"]
    if pricing is not None: modules_present.append("pricing")
    if ews is not None: modules_present.append("ews")
    if line_increase is not None: modules_present.append("line_increase")
    return {"profile": profile, "score": score, "adjudication": adjudication,
            "pricing": pricing, "ews": ews, "line_increase": line_increase,
            "modules_present": modules_present}
