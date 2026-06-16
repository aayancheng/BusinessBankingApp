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
    model_config = {"protected_namespaces": ()}
    status: str
    n_applicants: int
    model_auc: float
    top20_lift: float


# --- Pricing (Module 2) ---
class WaterfallLine(BaseModel):
    interest_income: float
    cost_of_funds: float
    expected_loss: float
    operating_cost: float
    pre_tax_profit: float
    tax: float
    net_income: float
    allocated_equity: float
    roe: float
    raroc: float


class PricingDetail(BaseModel):
    business_id: str
    industry: str
    pd: float
    ead: float
    quoted_rate: float
    recommended_rate: float
    hurdle_clearing_rate: float
    roe_at_quoted: float
    raroc_at_quoted: float
    roe_at_recommended: float
    clears_hurdle: bool
    mispriced: bool
    rate_shortfall: float
    waterfall_quoted: WaterfallLine


class QuoteRequest(BaseModel):
    pd: float = 0.05
    ead: float = 150000.0
    rate: float = 0.12
    cost_of_funds: float | None = None
    lgd: float | None = None
    opex_rate: float | None = None
    tax_rate: float | None = None
    capital_ratio: float | None = None
    fee_rate: float | None = None


class QuoteResponse(BaseModel):
    roe: float
    raroc: float
    clears_hurdle: bool
    roe_hurdle: float
    waterfall: WaterfallLine


class PricingSegmentRow(BaseModel):
    key: str
    mispriced_rate: float
    count: int


class PricingPortfolio(BaseModel):
    n: int
    n_clears: int
    share_clears: float
    median_roe: float
    mispriced_ead: float
    roe_hurdle: float
    by_band: list[PricingSegmentRow]
    by_industry: list[PricingSegmentRow]


# --- Early Warning (Module 3) ---
class TrajectoryPoint(BaseModel):
    month_index: int
    utilization: float
    days_past_due: float
    balance: float


class EwsDetail(BaseModel):
    business_id: str
    industry: str
    prob: float
    risk_tier: str
    triggers: list[str]
    top_shap_reasons: list[ReasonItem]
    key_metrics: dict
    trajectory: list[TrajectoryPoint]


class WatchlistItem(BaseModel):
    business_id: str
    industry: str
    prob: float
    risk_tier: str
    triggers: list[str]


class EwsSegmentRow(BaseModel):
    key: str
    deterioration_rate: float
    count: int


class EwsSegments(BaseModel):
    by_band: list[EwsSegmentRow]
    by_industry: list[EwsSegmentRow]


# --- Proactive Line Increase (Module 4) ---
class IncrementalRoe(BaseModel):
    incremental_ead: float
    incremental_net_income: float
    roe: float
    clears_hurdle: bool
    hurdle_clearing_rate: float


class LineIncreaseDetail(BaseModel):
    business_id: str
    industry: str
    score_band: str
    pd: float
    prob: float
    eligible: bool
    credit_limit: float
    current_balance: float
    utilization_onbook: float
    recommended_amount: float
    post_increase_utilization: float
    rate: float
    incremental: IncrementalRoe
    waterfall: WaterfallLine
    top_shap_reasons: list[ReasonItem]


class LineIncreaseCandidate(BaseModel):
    business_id: str
    industry: str
    score_band: str
    prob: float
    recommended_amount: float
    incremental_ead: float
    incremental_roe: float
    clears_hurdle: bool


class PaginatedCandidates(BaseModel):
    items: list[LineIncreaseCandidate]
    page: int
    pages: int
    total: int


class SimulateRequest(BaseModel):
    business_id: str
    proposed_amount: float | None = None
    target_util: float | None = None


class SimulateResponse(BaseModel):
    business_id: str
    proposed_amount: float
    incremental: IncrementalRoe
    waterfall: WaterfallLine


class LineIncreaseSegmentRow(BaseModel):
    key: str
    offer_rate: float
    expected_incremental_exposure: float
    count: int


class LineIncreaseSegments(BaseModel):
    by_band: list[LineIncreaseSegmentRow]
    by_industry: list[LineIncreaseSegmentRow]
