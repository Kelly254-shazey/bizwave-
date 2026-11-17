from datetime import date, timedelta
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"


def test_sales_forecast_insufficient_data_does_not_fabricate():
    start = date(2026, 10, 1)
    series = [{"date": (start + timedelta(days=i)).isoformat(), "value": 15000.0} for i in range(6)]
    res = client.post("/v1/forecasts/sales", json={"tenant_id": "t1", "series": series, "horizon_days": 14})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "insufficient_data"
    assert body["values"] == []


def test_sales_forecast_backtesting_and_reproducibility():
    start = date(2026, 8, 1)
    series = []
    for i in range(60):
        d = start + timedelta(days=i)
        weekend_boost = 1.45 if d.weekday() in (4, 5) else 1.0
        val = (18000.0 + i * 95.0) * weekend_boost
        series.append({"date": d.isoformat(), "value": round(val, 2)})

    r1 = client.post("/v1/forecasts/sales", json={"tenant_id": "t1", "series": series, "horizon_days": 14})
    r2 = client.post("/v1/forecasts/sales", json={"tenant_id": "t1", "series": series, "horizon_days": 14})
    assert r1.status_code == 200
    b1, b2 = r1.json(), r2.json()
    assert b1["status"] == "completed"
    assert len(b1["values"]) == 14
    assert "selected_model" in b1["evaluation_metrics"]
    assert "baseline_seasonal_naive" in b1["evaluation_metrics"]
    # Reproducibility check
    assert b1["values"][0]["predicted_value"] == b2["values"][0]["predicted_value"]
    assert b1["values"][0]["lower_bound"] <= b1["values"][0]["predicted_value"] <= b1["values"][0]["upper_bound"]


def test_demand_forecast_stockout_awareness():
    start = date(2026, 9, 1)
    series = []
    for i in range(30):
        d = start + timedelta(days=i)
        # 5 stockout days with 0 sales should NOT pull demand down to 0
        is_out = i in (10, 11, 20, 21, 22)
        series.append({"date": d.isoformat(), "units_sold": 0.0 if is_out else 10.0, "was_stockout": is_out})

    res = client.post("/v1/forecasts/demand", json={
        "tenant_id": "t1",
        "product_id": "p1",
        "product_name": "Highland Fresh Milk 1L",
        "current_available_stock": 20.0,
        "lead_time_days": 3,
        "horizon_days": 14,
        "series": series,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "completed"
    assert body["evaluation_metrics"]["stockout_days_imputed"] == 5
    # Imputed daily demand should remain ~10 units/day, NOT diluted to ~8.3
    assert body["summary"]["estimated_daily_demand"] >= 9.5
    assert body["summary"]["predicted_days_until_stockout"] <= 2
    assert body["summary"]["stockout_risk_level"] == "critical"


def test_cashflow_separates_confirmed_obligations_from_estimates():
    start = date(2026, 9, 1)
    inflows = [{"date": (start + timedelta(days=i)).isoformat(), "value": 25000.0} for i in range(30)]
    outflows = [{"date": (start + timedelta(days=i)).isoformat(), "value": 12000.0} for i in range(30)]
    due_dt = (date.today() + timedelta(days=5)).isoformat()

    res = client.post("/v1/forecasts/cashflow", json={
        "tenant_id": "t1",
        "opening_cash_balance": 100000.0,
        "inflows": inflows,
        "outflows": outflows,
        "confirmed_payables": [{"due_date": due_dt, "amount": 85000.0, "description": "Rent"}],
        "confirmed_receivables": [{"due_date": due_dt, "amount": 20000.0, "description": "Corporate Invoice"}],
        "horizon_days": 30,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "completed"
    assert body["summary"]["confirmed_obligations_total"] == 85000.0
    assert body["summary"]["confirmed_receivables_total"] == 20000.0


def test_anomaly_detection_flags_sharp_revenue_drop():
    start = date(2026, 9, 1)
    series = []
    for i in range(35):
        val = 4500.0 if i == 32 else 22000.0 + ((i % 3) * 400.0)
        series.append({"date": (start + timedelta(days=i)).isoformat(), "value": val})

    res = client.post("/v1/anomalies/detect", json={
        "tenant_id": "t1",
        "metric_name": "daily_revenue",
        "series": series,
        "z_threshold": 2.2,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["anomalies_found"] >= 1
    assert any(a["anomaly_type"] == "revenue_drop" for a in body["anomalies"])


def test_rfm_segmentation():
    res = client.post("/v1/segmentation/rfm", json={
        "tenant_id": "t1",
        "customers": [
            {"customer_id": "c1", "full_name": "Champion", "days_since_last_purchase": 2, "total_orders": 15, "lifetime_value": 55000},
            {"customer_id": "c2", "full_name": "Churner", "days_since_last_purchase": 62, "total_orders": 6, "lifetime_value": 18000},
        ],
    })
    assert res.status_code == 200
    body = res.json()
    segs = {c["customer_id"]: c["segment"] for c in body["customers"]}
    assert segs["c1"] == "champions"
    assert segs["c2"] == "churn_risk"


def test_sales_forecast_zero_variance_flat_series_remains_stable():
    start = date(2026, 9, 1)
    series = [{"date": (start + timedelta(days=i)).isoformat(), "value": 10000.0} for i in range(30)]
    res = client.post("/v1/forecasts/sales", json={"tenant_id": "t1", "series": series, "horizon_days": 7})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "completed"
    assert len(body["values"]) == 7
    for pt in body["values"]:
        assert pt["predicted_value"] >= 0
        assert pt["lower_bound"] <= pt["predicted_value"] <= pt["upper_bound"]


def test_anomaly_detection_flags_expense_spike():
    start = date(2026, 9, 1)
    series = []
    for i in range(32):
        val = 48000.0 if i == 29 else 6000.0 + ((i % 4) * 150.0)
        series.append({"date": (start + timedelta(days=i)).isoformat(), "value": val})
    res = client.post("/v1/anomalies/detect", json={
        "tenant_id": "t1",
        "metric_name": "daily_expenses",
        "series": series,
        "z_threshold": 2.5,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["anomalies_found"] >= 1


def test_rfm_empty_customer_list_handled_gracefully():
    res = client.post("/v1/segmentation/rfm", json={"tenant_id": "t1", "customers": []})
    assert res.status_code == 200
    body = res.json()
    assert body["customers"] == []


def test_sales_forecast_validation_rejects_invalid_horizon():
    res = client.post("/v1/forecasts/sales", json={"tenant_id": "t1", "series": [], "horizon_days": 9999})
    assert res.status_code == 422


def test_advisor_diagnostics_and_health_score():
    res = client.post("/v1/advisor/diagnose", json={
        "current_revenue": 420000,
        "previous_revenue": 500000,
        "current_orders": 350,
        "previous_orders": 410,
        "gross_profit": 168000,
        "expenses": 145000,
        "cash_balance": 95000,
        "payables": 120000,
        "receivables": 65000,
        "stockout_count": 3,
        "low_stock_count": 5,
        "total_products": 40,
        "active_customers": 85,
        "churn_risk_customers": 18,
    })
    assert res.status_code == 200
    body = res.json()
    assert 0 <= body["overall_health_score"] <= 100
    assert body["decomposition"]["revenue_delta_pct"] == -16.0
    assert len(body["drivers"]) >= 3


def test_advisor_what_if_scenario_simulation():
    res = client.post("/v1/advisor/simulate", json={
        "monthly_revenue": 500000,
        "monthly_cogs": 300000,
        "monthly_expenses": 120000,
        "price_change_pct": 8,
        "volume_change_pct": 5,
        "expense_change_pct": -10,
        "stockout_recovery_pct": 4,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["projected"]["monthly_net_profit"] > body["baseline"]["monthly_net_profit"]
    assert body["impact"]["net_profit_delta"] > 0


