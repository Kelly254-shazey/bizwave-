from fastapi import APIRouter
from pydantic import BaseModel
from app.models.schemas import (
    SalesForecastRequest,
    DemandForecastRequest,
    CashflowForecastRequest,
    AnomalyDetectRequest,
    RfmRequest,
)
from app.forecasting.engine import (
    run_sales_forecast,
    run_demand_forecast,
    run_cashflow_forecast,
)
from app.anomaly_detection.detector import detect_anomalies
from app.segmentation.rfm import compute_rfm_segments
from app.advisor.engine import compute_business_diagnostics, simulate_what_if

router = APIRouter(prefix="/v1", tags=["intelligence"])


class DiagnosticsRequest(BaseModel):
    current_revenue: float = 0.0
    previous_revenue: float = 0.0
    current_orders: int = 0
    previous_orders: int = 0
    gross_profit: float = 0.0
    expenses: float = 0.0
    cash_balance: float = 0.0
    payables: float = 0.0
    receivables: float = 0.0
    stockout_count: int = 0
    low_stock_count: int = 0
    total_products: int = 0
    active_customers: int = 0
    churn_risk_customers: int = 0


class WhatIfRequest(BaseModel):
    monthly_revenue: float = 0.0
    monthly_cogs: float = 0.0
    monthly_expenses: float = 0.0
    price_change_pct: float = 0.0
    volume_change_pct: float = 0.0
    expense_change_pct: float = 0.0
    stockout_recovery_pct: float = 0.0
    price_elasticity: float = -0.35


@router.post("/forecasts/sales")
def forecast_sales(payload: SalesForecastRequest):
    return run_sales_forecast(payload)


@router.post("/forecasts/demand")
def forecast_demand(payload: DemandForecastRequest):
    return run_demand_forecast(payload)


@router.post("/forecasts/cashflow")
def forecast_cashflow(payload: CashflowForecastRequest):
    return run_cashflow_forecast(payload)


@router.post("/anomalies/detect")
def anomalies(payload: AnomalyDetectRequest):
    return detect_anomalies(payload)


@router.post("/segmentation/rfm")
def segmentation_rfm(payload: RfmRequest):
    return compute_rfm_segments(payload)


@router.post("/advisor/diagnose")
def advisor_diagnose(payload: DiagnosticsRequest):
    return compute_business_diagnostics(payload.model_dump())


@router.post("/advisor/simulate")
def advisor_simulate(payload: WhatIfRequest):
    return simulate_what_if(payload.model_dump())
