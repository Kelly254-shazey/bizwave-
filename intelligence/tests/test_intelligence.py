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


def test_pro_data_scientist_ensemble_calculations_and_charts():
    start = date(2026, 9, 1)
    daily = []
    for i in range(35):
        dt = start + timedelta(days=i)
        # Weekend surge + steady growth + 1 anomaly spike
        base = 22000 + i * 250 + (9000 if dt.weekday() in (4, 5) else 0)
        if i == 20:
            base = 88000
        daily.append({"date": dt.isoformat(), "revenue": base, "gross_profit": base * 0.38})

    res = client.post("/v1/scientist/analyze", json={
        "daily_sales": daily,
        "products": [
            {"name": "Maize Flour 2kg", "revenue": 420000},
            {"name": "Cooking Oil 2L", "revenue": 280000},
            {"name": "Sugar 2kg", "revenue": 140000},
            {"name": "Tea Leaves 500g", "revenue": 60000},
        ],
        "payment_mix": [
            {"method": "mpesa", "total": 620000},
            {"method": "cash", "total": 240000},
            {"method": "card", "total": 40000},
        ],
        "expense_mix": [
            {"category": "Rent", "total": 85000},
            {"category": "Utilities", "total": 28000},
            {"category": "Staff", "total": 95000},
        ],
        "total_revenue": 900000,
        "total_cogs": 558000,
        "total_expenses": 208000,
        "total_orders": 600,
        "cash_balance": 180000,
        "payables": 60000,
        "receivables": 45000,
        "stockout_count": 2,
        "low_stock_count": 4,
        "period_days": 35,
        "horizon_days": 14,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["has_sufficient_data"] is True
    assert len(body["forecast"]["model_benchmarks"]) == 4
    assert any(m["selected"] for m in body["forecast"]["model_benchmarks"])
    assert body["forecast"]["backtest_accuracy_pct"] is None
    assert body["forecast"]["has_holdout"] is True
    assert body["forecast"]["selection_mape_pct"] >= 0
    assert body["forecast"]["projected_14d_revenue"] > 0
    assert len(body["calculations"]) >= 6
    assert len(body["charts"]["payment_mix_pie"]) == 3
    assert len(body["charts"]["expense_mix_pie"]) == 3
    assert len(body["charts"]["weekday_bar"]) == 7
    assert len(body["anomalies"]) >= 1


def test_pro_data_scientist_handles_empty_cold_start():
    res = client.post("/v1/scientist/analyze", json={"daily_sales": []})
    assert res.status_code == 200
    body = res.json()
    assert body["has_sufficient_data"] is False
    assert len(body["recommendations"]) >= 1


def test_website_analyzer_blocks_ssrf_localhost_and_private_ips():
    for bad in ["http://127.0.0.1:4000/api/v1/health", "http://localhost:5432", "http://169.254.169.254/latest/meta-data/"]:
        res = client.post("/v1/scientist/website-analyze", json={"url": bad})
        assert res.status_code == 400


def test_website_html_catalog_extraction_and_pricing_audit():
    from app.scientist.website_analyzer import analyze_html_snapshot

    sample_html = """
    <html>
      <head>
        <title>Kileleshwa Fresh Roasters Nairobi</title>
        <meta name="description" content="Specialty Kenyan coffee beans & pastries delivered across Nairobi." />
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            "itemListElement": [
              {"@type": "Product", "name": "AA Nyeri Coffee 500g", "sku": "NYR-500", "category": "Coffee", "offers": {"price": "1450", "priceCurrency": "KES"}},
              {"@type": "Product", "name": "Peaberry Espresso 1kg", "sku": "PBR-1KG", "category": "Coffee", "offers": {"price": "2800", "priceCurrency": "KES"}},
              {"@type": "Product", "name": "Artisan Croissant Box", "sku": "CRS-BOX", "category": "Bakery", "offers": {"price": "950", "priceCurrency": "KES"}}
            ]
          }
        </script>
      </head>
      <body>
        <p>Order on WhatsApp <a href="https://wa.me/254712345678">+254712345678</a> or email orders@freshroasters.co.ke</p>
        <div class="card"><h3>Cold Brew Bottle 500ml</h3><span>KES 450</span></div>
      </body>
    </html>
    """
    out = analyze_html_snapshot("https://freshroasters.co.ke", sample_html)
    assert out["business_profile"]["has_whatsapp_link"] is True
    assert out["pricing_stats"]["total_items_found"] == 4
    assert out["pricing_stats"]["median_price"] > 0
    assert len(out["charts"]["category_pie"]) >= 2
    assert len(out["charts"]["price_tier_pie"]) >= 2




def test_scientist_does_not_invent_costs_or_claim_short_series_accuracy():
    sample = [{"date": f"2026-09-0{d}", "revenue": 1000, "gross_profit": 1000} for d in (1, 3, 4)]
    res = client.post("/v1/scientist/analyze", json={"daily_sales": sample, "total_revenue": 3000,
        "total_orders": 3, "total_cogs": 0, "cost_data_available": False, "expense_data_available": False})
    body = res.json()
    assert res.status_code == 200
    assert body["summary"]["gross_profit"] is None
    assert body["summary"]["net_profit"] is None
    assert not {"gross_margin", "net_margin", "breakeven_daily"} & {x["id"] for x in body["calculations"]}
    assert body["forecast"]["selection_mape_pct"] is None
    assert body["forecast"]["missing_calendar_days"] == 1
    assert body["forecast"]["last_recorded_date"] == "2026-09-04"


def test_scientist_preserves_loss_and_never_clamps_margin():
    res = client.post("/v1/scientist/analyze", json={"daily_sales": [{"date": "2026-09-01", "revenue": 100}],
        "total_revenue": 100, "total_cogs": 140, "total_orders": 1,
        "total_expenses": 10, "cost_data_available": True, "expense_data_available": True})
    body = res.json()
    assert body["summary"]["gross_profit"] == -40
    assert body["summary"]["net_profit"] == -50
    assert body["summary"]["breakeven_daily_revenue"] is None
    assert "breakeven_daily" not in {x["id"] for x in body["calculations"]}


def test_scientist_mape_is_not_capped():
    import numpy as np
    from app.scientist.engine import _eval_mape_rmse
    mape, _ = _eval_mape_rmse(np.array([100.0]), np.array([400.0]))
    assert mape == 300.0


def test_website_prices_require_explicit_currency_and_do_not_mix():
    from app.scientist.website_analyzer import analyze_html_snapshot, _extract_from_csv_text
    csv_items = _extract_from_csv_text('name,price,currency\nUnknown,100,\nLocal,200,KES\nForeign,25,USD\n')
    assert [item['currency'] for item in csv_items] == [None, 'KES', 'USD']
    out = analyze_html_snapshot('https://example.org/catalog.csv', '<html></html>', csv_items)
    assert out['pricing_stats']['priced_items_count'] == 3
    assert out['pricing_stats']['currency'] is None
    assert out['pricing_stats']['median_price'] is None
    assert out['charts']['price_tier_pie'] == []


def test_website_fetch_pins_verified_dns_and_preserves_host_tls(monkeypatch):
    import socket
    import httpx
    from app.scientist.website_analyzer import _safe_fetch
    calls = []
    monkeypatch.setattr(socket, 'getaddrinfo', lambda host, port, type=None: [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('93.184.216.34', port))])
    def handler(request):
        calls.append((request.url.host, request.headers['host'], request.extensions.get('sni_hostname')))
        return httpx.Response(200, headers={'content-type': 'text/plain'}, stream=httpx.ByteStream(b'public data'))
    with httpx.Client(transport=httpx.MockTransport(handler), trust_env=False) as client:
        response, error = _safe_fetch(client, 'https://example.org/a')
    assert error is None and response.text == 'public data'
    assert str(response.url) == 'https://example.org/a'
    assert calls == [('93.184.216.34', 'example.org', 'example.org')]


def test_website_fetch_blocks_private_redirect_and_large_content(monkeypatch):
    import socket
    import httpx
    import pytest
    from app.scientist.website_analyzer import _safe_fetch, UnsafeUrlError, MAX_BYTES
    def resolver(host, port, type=None):
        address = '127.0.0.1' if host == 'internal.example' else '93.184.216.34'
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, '', (address, port))]
    monkeypatch.setattr(socket, 'getaddrinfo', resolver)
    with httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(302, headers={'location': 'http://internal.example/private'})), trust_env=False) as client:
        with pytest.raises(UnsafeUrlError):
            _safe_fetch(client, 'https://example.org/')
    with httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(200, content=b'x' * (MAX_BYTES + 1))), trust_env=False) as client:
        response, error = _safe_fetch(client, 'https://example.org/large')
    assert response is None and '2 MB' in error


def test_website_price_parsing_does_not_truncate_or_guess():
    from app.scientist.website_analyzer import _parse_price, analyze_html_snapshot
    assert _parse_price('KES 12,345.50') == 12345.5
    assert _parse_price('12345') == 12345
    for invalid in ['12.345', '1,23', '-100', '100-200', 'call 100', '1e4', 'NaN']:
        assert _parse_price(invalid) is None, invalid
    html = '<article><h3>Sample</h3><p>KES 12345</p></article>'
    result = analyze_html_snapshot('https://example.com', html)
    assert result['products'][0]['price'] == 12345
    assert result['products'][0]['currency'] == 'KES'
    assert result['insights_sw']
    assert analyze_html_snapshot('https://example.com', '<article><h3>Bad</h3><p>KES 12.345</p></article>')['products'] == []
