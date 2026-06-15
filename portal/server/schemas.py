"""Pydantic models for the Adjudication portal API."""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


class ReasonItem(BaseModel):
    feature: str
    impact: float


class KeyRatios(BaseModel):
    dscr: float
    leverage: float
    current_ratio: float
    utilization: float
    debt_to_income: float


class ApplicationListItem(BaseModel):
    business_id: str
    industry: str
    business_score: int
    pd: float
    decision: str
    requested_amount: float


class PaginatedApplications(BaseModel):
    items: list[ApplicationListItem]
    page: int
    pages: int
    total: int


class AdjudicationDetail(BaseModel):
    business_id: str
    decision: str
    pd: float
    business_score: int
    score_band: str
    industry: str
    requested_amount: float
    key_ratios: KeyRatios
    rule_hits: list[str]
    top_shap_reasons: list[ReasonItem]


class DecideRequest(BaseModel):
    # All optional; missing fields fall back to a baseline applicant. These are the raw
    # fields the score + adjudication pipelines consume to recompute the decision.
    industry: Optional[str] = None
    entity_type: Optional[str] = None
    loan_purpose: Optional[str] = None
    years_in_business: Optional[float] = None
    employees: Optional[float] = None
    annual_revenue: Optional[float] = None
    net_income: Optional[float] = None
    total_debt: Optional[float] = None
    current_ratio: Optional[float] = None
    dscr: Optional[float] = None
    leverage: Optional[float] = None
    credit_history_months: Optional[float] = None
    prior_delinquencies: Optional[float] = None
    trade_lines: Optional[float] = None
    utilization: Optional[float] = None
    public_records: Optional[float] = None
    requested_amount: Optional[float] = None
    term_months: Optional[float] = None
    collateral_flag: Optional[float] = None


class SegmentRow(BaseModel):
    key: str
    approve: float
    refer: float
    decline: float
    count: int


class SegmentsResponse(BaseModel):
    by_band: list[SegmentRow]
    by_industry: list[SegmentRow]


class HealthResponse(BaseModel):
    status: str
    n_applicants: int
    model_auc: float
    top20_lift: float
