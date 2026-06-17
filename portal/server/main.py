"""Adjudication portal FastAPI app. Loads Module 0/1 artifacts at startup, scores the
whole applicant population, caches it in app.state, and serves the Adjudication API."""
from __future__ import annotations
import os
import sys
from contextlib import asynccontextmanager

# Make shared/score/adjudication/portal importable when run from anywhere.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pandas as pd

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from shared.config import RAW
from portal.server import service
from portal.server import pricing_service
from portal.server import ews_service
from portal.server import line_increase_service
from portal.server import customer_service, dashboard_service
from portal.server.schemas import (
    AdjudicationDetail, DecideRequest, HealthResponse,
    PaginatedApplications, SegmentsResponse,
    PricingDetail, QuoteRequest, QuoteResponse, PricingPortfolio,
    EwsDetail, WatchlistItem, EwsSegments,
    LineIncreaseDetail, PaginatedCandidates, SimulateRequest, SimulateResponse,
    LineIncreaseSegments,
    DashboardSummary, Customer360,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    model, config, metadata, explainer = service.load_artifacts()
    app.state.model = model
    app.state.config = config
    app.state.metadata = metadata
    app.state.explainer = explainer
    app.state.baseline = service.baseline_row()
    app.state.pop = service.score_population(model, config, explainer)
    app.state.pricing_pop = pricing_service.load_population()
    app.state.ews_pop = ews_service.load_population()
    app.state.li_pop = line_increase_service.load_population()
    app.state.profiles = pd.read_parquet(
        RAW / "businesses.parquet", columns=["business_id", "region", "annual_revenue"]
    ).set_index("business_id")
    yield


app = FastAPI(title="Adjudication Portal", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health", response_model=HealthResponse)
def health():
    m = app.state.metadata["metrics"]
    return HealthResponse(status="ok", n_applicants=int(len(app.state.pop)),
                          model_auc=float(m["auc"]), top20_lift=float(m["top20_lift"]))


@app.get("/api/adjudication/applications", response_model=PaginatedApplications)
def applications(page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=500),
                 decision: str | None = None):
    df = app.state.pop
    if decision:
        df = df[df["decision"] == decision]
    total = len(df)
    pages = max(1, (total + per_page - 1) // per_page)
    start = (page - 1) * per_page
    sl = df.iloc[start:start + per_page]
    items = [{"business_id": r["business_id"], "industry": r["industry"],
              "business_score": int(r["business_score"]), "pd": float(r["pd"]),
              "decision": r["decision"], "requested_amount": float(r["requested_amount"])}
             for _, r in sl.iterrows()]
    return {"items": items, "page": page, "pages": pages, "total": total}


@app.get("/api/adjudication/segments", response_model=SegmentsResponse)
def segments():
    return service.segments(app.state.pop)


@app.get("/api/adjudication/{business_id}", response_model=AdjudicationDetail)
def detail(business_id: str):
    df = app.state.pop
    if business_id not in df.index:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": business_id})
    return service.record_to_detail(df.loc[business_id])


@app.post("/api/adjudication/decide", response_model=AdjudicationDetail)
def decide_endpoint(req: DecideRequest):
    return service.decide_one(req.model_dump(), app.state.baseline,
                              app.state.model, app.state.config, app.state.explainer)


@app.get("/api/pricing/portfolio", response_model=PricingPortfolio)
def pricing_portfolio():
    return pricing_service.portfolio(app.state.pricing_pop)


@app.post("/api/pricing/quote", response_model=QuoteResponse)
def pricing_quote(req: QuoteRequest):
    return pricing_service.quote(req.model_dump())


@app.get("/api/pricing/{business_id}", response_model=PricingDetail)
def pricing_detail(business_id: str):
    rec = pricing_service.detail_record(business_id, app.state.pricing_pop)
    if rec is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": business_id})
    return rec


@app.get("/api/ews/watchlist", response_model=list[WatchlistItem])
def ews_watchlist(limit: int = 100):
    return ews_service.watchlist(app.state.ews_pop, limit=limit)


@app.get("/api/ews/segments", response_model=EwsSegments)
def ews_segments():
    return ews_service.segments(app.state.ews_pop)


@app.get("/api/ews/{business_id}", response_model=EwsDetail)
def ews_detail(business_id: str):
    rec = ews_service.detail_record(business_id, app.state.ews_pop)
    if rec is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": business_id})
    return rec


@app.get("/api/line-increase/candidates", response_model=PaginatedCandidates)
def line_increase_candidates(page: int = Query(1, ge=1),
                             per_page: int = Query(50, ge=1, le=500)):
    items_all = line_increase_service.candidates(app.state.li_pop)
    total = len(items_all)
    pages = max(1, (total + per_page - 1) // per_page)
    start = (page - 1) * per_page
    return {"items": items_all[start:start + per_page],
            "page": page, "pages": pages, "total": total}


@app.get("/api/line-increase/segments", response_model=LineIncreaseSegments)
def line_increase_segments():
    return line_increase_service.segments(app.state.li_pop)


@app.post("/api/line-increase/simulate", response_model=SimulateResponse)
def line_increase_simulate(req: SimulateRequest):
    rec = line_increase_service.simulate(req.model_dump(), app.state.li_pop)
    if rec is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": req.business_id})
    return rec


@app.get("/api/line-increase/{business_id}", response_model=LineIncreaseDetail)
def line_increase_detail(business_id: str):
    rec = line_increase_service.detail_record(business_id, app.state.li_pop)
    if rec is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": business_id})
    return rec


@app.get("/api/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary_route():
    return dashboard_service.dashboard_summary(
        app.state.pop, app.state.pricing_pop, app.state.ews_pop,
        app.state.li_pop, app.state.metadata)


@app.get("/api/customer/{business_id}", response_model=Customer360)
def customer_360_route(business_id: str):
    rec = customer_service.customer_360(
        business_id, app.state.pop, app.state.pricing_pop,
        app.state.ews_pop, app.state.li_pop, app.state.profiles)
    if rec is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": business_id})
    return rec
