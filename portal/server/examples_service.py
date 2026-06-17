"""Example business-id options (with hints) for the lookup dropdowns. Sampled from
the cached populations so each module's dropdown offers a diverse, valid set —
e.g. a mix of Approve/Refer/Decline, clears/below hurdle, Low/Medium/High risk,
eligible/not-eligible, and on-book/applicant. Deterministic (stable ordering)."""
from __future__ import annotations
import pandas as pd

N_PER = 12


def _diverse(df: pd.DataFrame, cat_col: str, k: int = N_PER) -> list[pd.Series]:
    """Round-robin across the distinct values of cat_col so the sample spans
    every category (deterministic: groups sorted, rows in index order)."""
    groups = [g for _, g in df.sort_index().groupby(cat_col, sort=True)]
    out: list[pd.Series] = []
    depth = 0
    while len(out) < k:
        added = False
        for g in groups:
            if depth < len(g):
                out.append(g.iloc[depth])
                added = True
                if len(out) >= k:
                    break
        if not added:
            break
        depth += 1
    return out


def _opts(rows: list[pd.Series], hint_fn) -> list[dict]:
    return [{"id": str(r["business_id"]), "hint": hint_fn(r)} for r in rows]


def examples(adj_pop: pd.DataFrame, pricing_pop: pd.DataFrame,
             ews_pop: pd.DataFrame, li_pop: pd.DataFrame) -> dict:
    booked_ids = set(pricing_pop.index)

    adjudication = _opts(
        _diverse(adj_pop, "decision"),
        lambda r: f"{r['industry']} · {r['decision']}")

    pricing = _opts(
        _diverse(pricing_pop, "clears_hurdle"),
        lambda r: f"{r['industry']} · {'clears hurdle' if r['clears_hurdle'] else 'below hurdle'}")

    ews = _opts(
        _diverse(ews_pop, "risk_tier"),
        lambda r: f"{r['industry']} · {r['risk_tier']} risk")

    line_increase = _opts(
        _diverse(li_pop, "eligible"),
        lambda r: f"{r['industry']} · {'eligible' if r['eligible'] else 'not eligible'}")

    # Customer 360: mix of on-book and applicant-only businesses.
    adj_with_booked = adj_pop.assign(_booked=adj_pop.index.isin(booked_ids))
    customer360 = _opts(
        _diverse(adj_with_booked, "_booked"),
        lambda r: f"{r['industry']} · {'on book' if r['_booked'] else 'applicant'}")

    return {
        "adjudication": adjudication,
        "pricing": pricing,
        "ews": ews,
        "line_increase": line_increase,
        "customer360": customer360,
    }
