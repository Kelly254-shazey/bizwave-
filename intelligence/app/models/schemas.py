from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class DailyPoint(BaseModel):
    date: str  # YYYY-MM-DD
    value: float


class SalesForecastRequest(BaseModel):
    tenant_id: str
    branch_id: Optional[str] = None
    series: List[DailyPoint]
    horizon_days: int = Field(default=30, ge=1, le=180)
    confidence_level: float = Field(default=0.90, ge=0.5, le=0.99)


class DemandPoint(BaseModel):
    date: str
    units_sold: float
    was_stockout: bool = False


class DemandForecastRequest(BaseModel):
    tenant_id: str
    product_id: str
    product_name: str
    current_available_stock: float
    lead_time_days: int = Field(default=3, ge=0, le=90)
    horizon_days: int = Field(default=30, ge=1, le=180)
    series: List[DemandPoint]


class ObligationItem(BaseModel):
    due_date: str
    amount: float
    description: str


class CashflowForecastRequest(BaseModel):
    tenant_id: str
    opening_cash_balance: float
    inflows: List[DailyPoint]
    outflows: List[DailyPoint]
    confirmed_payables: List[ObligationItem] = []
    confirmed_receivables: List[ObligationItem] = []
    horizon_days: int = Field(default=30, ge=7, le=180)


class AnomalyDetectRequest(BaseModel):
    tenant_id: str
    metric_name: str = "daily_revenue"
    direction_sensitivity: str = "both"  # both | drop | spike
    series: List[DailyPoint]
    z_threshold: float = Field(default=2.2, ge=1.5, le=5.0)


class CustomerPurchaseRecord(BaseModel):
    customer_id: str
    full_name: str
    days_since_last_purchase: Optional[int]
    total_orders: int
    lifetime_value: float


class RfmRequest(BaseModel):
    tenant_id: str
    customers: List[CustomerPurchaseRecord]


class ForecastValueOut(BaseModel):
    target_date: str
    predicted_value: float
    lower_bound: float
    upper_bound: float
    confidence_level: float
    metadata: Dict[str, Any] = {}
