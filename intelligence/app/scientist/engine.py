"""
BizWave Pro Data Scientist & Quantitative Analytics Engine
----------------------------------------------------------
Performs multi-model ensemble forecasting with holdout backtest accuracy (MAPE/RMSE),
OLS trend regression, weekday seasonality decomposition, Pareto 80/20 + HHI concentration,
modified Z-score (MAD) anomaly detection, break-even unit economics, and transparent
formula proofs for SME executive decision making.
"""

from __future__ import annotations

import math
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _safe_div(num: float, den: float, default: float = 0.0) -> float:
    return float(num / den) if den and abs(den) > 1e-9 else default


def _fmt_kes(val: float) -> str:
    return f"KES {round(val):,}"


def _parse_date(d: str) -> date:
    return datetime.strptime(d[:10], "%Y-%m-%d").date()


def _fill_daily_series(daily_sales: List[Dict[str, Any]]) -> Tuple[List[date], np.ndarray, np.ndarray]:
    """Turn sparse daily records into a contiguous daily numpy series."""
    if not daily_sales:
        return [], np.array([], dtype=float), np.array([], dtype=float)
    by_day: Dict[date, Tuple[float, float]] = {}
    for row in daily_sales:
        dt = _parse_date(str(row.get("date", "")))
        rev = max(0.0, float(row.get("revenue", 0.0) or 0.0))
        gp = float(row.get("gross_profit", row.get("grossProfit", 0.0)) or 0.0)
        if dt in by_day:
            by_day[dt] = (by_day[dt][0] + rev, by_day[dt][1] + gp)
        else:
            by_day[dt] = (rev, gp)

    start_d = min(by_day.keys())
    end_d = max(by_day.keys())
    span = min(120, (end_d - start_d).days + 1)
    start_d = end_d - timedelta(days=span - 1)

    dates: List[date] = []
    revs: List[float] = []
    gps: List[float] = []
    cur = start_d
    while cur <= end_d:
        dates.append(cur)
        r, g = by_day.get(cur, (0.0, 0.0))
        revs.append(r)
        gps.append(g)
        cur += timedelta(days=1)
    return dates, np.array(revs, dtype=float), np.array(gps, dtype=float)


def _holt_double_exp_forecast(y: np.ndarray, horizon: int, alpha: float = 0.32, beta: float = 0.12) -> Tuple[np.ndarray, np.ndarray]:
    """Holt linear trend exponential smoothing (returns fitted values & horizon forecast)."""
    n = len(y)
    if n == 0:
        return np.array([]), np.zeros(horizon)
    if n == 1:
        return y.copy(), np.full(horizon, max(0.0, float(y[0])))

    level = float(y[0])
    trend = float(y[1] - y[0])
    fitted = np.zeros(n)
    fitted[0] = level
    for t in range(1, n):
        prev_level = level
        level = alpha * float(y[t]) + (1.0 - alpha) * (level + trend)
        trend = beta * (level - prev_level) + (1.0 - beta) * trend
        fitted[t] = max(0.0, prev_level + trend)

    # Damped trend (phi = 0.92) prevents runaway long-horizon projections
    phi = 0.92
    fc = np.zeros(horizon)
    damp = 0.0
    for h in range(1, horizon + 1):
        damp += phi ** h
        fc[h - 1] = max(0.0, level + damp * trend)
    return fitted, fc


def _seasonal_ols_forecast(dates: List[date], y: np.ndarray, horizon: int) -> Tuple[np.ndarray, np.ndarray, Dict[int, float]]:
    """OLS linear trend + multiplicative weekday seasonality decomposition."""
    n = len(y)
    if n == 0:
        return np.array([]), np.zeros(horizon), {i: 1.0 for i in range(7)}

    x = np.arange(n, dtype=float)
    mean_y = float(np.mean(y))
    if n >= 3 and np.std(x) > 0:
        slope, intercept = np.polyfit(x, y, 1)
    else:
        slope, intercept = 0.0, mean_y

    trend_vals = np.maximum(1.0, intercept + slope * x)

    # Compute weekday seasonal multipliers (shrunk toward 1.0 for small samples)
    factors: Dict[int, float] = {}
    for wd in range(7):
        idxs = [i for i, d in enumerate(dates) if d.weekday() == wd]
        if len(idxs) >= 2:
            raw_ratio = float(np.mean(y[idxs] / trend_vals[idxs]))
            # Bayesian shrinkage toward 1.0 based on observation count
            weight = len(idxs) / (len(idxs) + 2.0)
            factors[wd] = float(np.clip(weight * raw_ratio + (1.0 - weight) * 1.0, 0.55, 1.65))
        else:
            factors[wd] = 1.0

    # Normalize seasonal factors to average 1.0
    avg_f = sum(factors.values()) / 7.0
    factors = {wd: f / avg_f for wd, f in factors.items()}

    fitted = np.array([max(0.0, float(trend_vals[i] * factors[dates[i].weekday()])) for i in range(n)])
    last_d = dates[-1]
    fc = np.zeros(horizon)
    # Damped slope forward
    for h in range(1, horizon + 1):
        fut_d = last_d + timedelta(days=h)
        base = max(0.0, intercept + slope * (n - 1 + h * 0.85))
        fc[h - 1] = max(0.0, base * factors[fut_d.weekday()])
    return fitted, fc, factors


def _wma_momentum_forecast(y: np.ndarray, horizon: int) -> Tuple[np.ndarray, np.ndarray]:
    """Recency-weighted moving average with gentle momentum."""
    n = len(y)
    if n == 0:
        return np.array([]), np.zeros(horizon)
    fitted = np.zeros(n)
    for t in range(n):
        win = y[max(0, t - 7) : t]
        if len(win) == 0:
            fitted[t] = y[t]
        else:
            w = np.linspace(1.0, 2.0, len(win))
            fitted[t] = float(np.sum(win * w) / np.sum(w))
    tail = y[max(0, n - 10) :]
    w = np.linspace(1.0, 2.5, len(tail))
    anchor = float(np.sum(tail * w) / np.sum(w))
    prev_tail = y[max(0, n - 20) : max(1, n - 10)]
    prev_anchor = float(np.mean(prev_tail)) if len(prev_tail) > 0 else anchor
    daily_drift = _safe_div(anchor - prev_anchor, max(7.0, float(len(tail))), 0.0) * 0.25
    fc = np.array([max(0.0, anchor + daily_drift * h) for h in range(1, horizon + 1)])
    return fitted, fc


def _eval_mape_rmse(actual: np.ndarray, pred: np.ndarray) -> Tuple[float, float]:
    mask = actual > 0
    if not np.any(mask):
        return 25.0, float(np.sqrt(np.mean((actual - pred) ** 2))) if len(actual) else 0.0
    a = actual[mask]
    p = pred[mask]
    mape = float(np.mean(np.abs((a - p) / a)) * 100.0)
    rmse = float(np.sqrt(np.mean((a - p) ** 2)))
    return round(mape, 1), round(rmse, 1)


def run_pro_data_scientist_analysis(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Full Data Scientist Suite:
      1. Multi-model ensemble forecasting + holdout MAPE backtest + champion selection
      2. Transparent unit-economics & financial formulas (Break-even, Margins, Stability, Pareto 80/20, HHI)
      3. Weekday seasonality matrix
      4. Modified Z-Score (MAD) anomaly detection
      5. Ready-to-render Pie Charts, Forecast Area Graphs & Bar Charts
      6. Ranked KES-impact action plan (English & Kiswahili)
    """
    daily_sales = payload.get("daily_sales") or []
    products = payload.get("products") or []
    payment_mix = payload.get("payment_mix") or []
    expense_mix = payload.get("expense_mix") or []
    horizon = max(7, min(30, int(payload.get("horizon_days") or 14)))

    total_revenue = float(payload.get("total_revenue", 0.0) or 0.0)
    total_cogs = float(payload.get("total_cogs", 0.0) or 0.0)
    total_expenses = float(payload.get("total_expenses", 0.0) or 0.0)
    total_orders = int(payload.get("total_orders", 0) or 0)
    cash_balance = float(payload.get("cash_balance", 0.0) or 0.0)
    payables = float(payload.get("payables", 0.0) or 0.0)
    receivables = float(payload.get("receivables", 0.0) or 0.0)
    stockout_count = int(payload.get("stockout_count", 0) or 0)
    low_stock_count = int(payload.get("low_stock_count", 0) or 0)
    period_days = max(1, int(payload.get("period_days", 30) or 30))

    dates, y_rev, y_gp = _fill_daily_series(daily_sales)
    n_days = len(y_rev)
    active_days = int(np.sum(y_rev > 0)) if n_days > 0 else 0

    if total_revenue <= 0 and n_days > 0:
        total_revenue = float(np.sum(y_rev))

    # Missing costs are not the same as zero costs. Never infer a margin.
    has_cost_data = payload.get("cost_data_available")
    if has_cost_data is None:
        has_cost_data = total_cogs > 0
    has_expense_data = payload.get("expense_data_available")
    if has_expense_data is None:
        has_expense_data = total_expenses > 0
    gross_profit = total_revenue - total_cogs if has_cost_data else 0.0
    net_profit = gross_profit - total_expenses
    gross_margin_pct = round(_safe_div(gross_profit, total_revenue) * 100.0, 1)
    net_margin_pct = round(_safe_div(net_profit, total_revenue) * 100.0, 1)
    expense_ratio_pct = round(_safe_div(total_expenses, total_revenue) * 100.0, 1)
    aov = round(_safe_div(total_revenue, total_orders), 2)
    avg_daily_rev = round(_safe_div(total_revenue, max(active_days, 1)), 2)
    avg_daily_exp = round(_safe_div(total_expenses, period_days), 2)

    # Break-even daily revenue = Daily Fixed OpEx / Gross Margin Ratio
    gm_ratio = _safe_div(gross_profit, total_revenue) if has_cost_data and gross_profit > 0 else 0.0
    breakeven_daily_rev = round(_safe_div(avg_daily_exp, gm_ratio), 2)
    breakeven_monthly_rev = round(breakeven_daily_rev * 30.0, 2)
    safety_margin_pct = round(_safe_div(avg_daily_rev - breakeven_daily_rev, avg_daily_rev) * 100.0, 1) if avg_daily_rev > 0 else 0.0

    # Trend OLS slope + R^2 + Volatility/Stability
    slope_kes_day = 0.0
    r_squared = 0.0
    cv_pct = 0.0
    stability_score = 50
    momentum_7d_pct = 0.0
    if n_days >= 4 and np.any(y_rev > 0):
        x = np.arange(n_days, dtype=float)
        slope_kes_day, intercept = np.polyfit(x, y_rev, 1)
        y_hat = intercept + slope_kes_day * x
        ss_res = float(np.sum((y_rev - y_hat) ** 2))
        ss_tot = float(np.sum((y_rev - np.mean(y_rev)) ** 2))
        r_squared = round(max(0.0, 1.0 - _safe_div(ss_res, ss_tot, 1.0)), 3)
        nz = y_rev[y_rev > 0]
        if len(nz) >= 2 and np.mean(nz) > 0:
            cv = float(np.std(nz) / np.mean(nz))
            cv_pct = round(cv * 100.0, 1)
            stability_score = int(np.clip(round(100.0 - cv * 80.0), 15, 98))
        if n_days >= 14:
            last7 = float(np.sum(y_rev[-7:]))
            prev7 = float(np.sum(y_rev[-14:-7]))
            momentum_7d_pct = round(_safe_div(last7 - prev7, prev7) * 100.0, 1) if prev7 > 0 else 0.0

    # =========================================================================
    # MULTI-MODEL ENSEMBLE FORECASTING WITH HOLDOUT BACKTEST CHAMPION SELECTION
    # =========================================================================
    model_benchmarks: List[Dict[str, Any]] = []
    forecast_points: List[Dict[str, Any]] = []
    champion_model = "Cold-Start Baseline"
    backtest_accuracy_pct = None  # compatibility field; not a validated accuracy
    selection_mape_pct = None
    holdout_is_valid = False
    forecast_14d_total = 0.0
    forecast_30d_total = 0.0
    weekday_factors: Dict[int, float] = {i: 1.0 for i in range(7)}

    if active_days >= 3:
        holdout = min(7, max(2, n_days // 5)) if n_days >= 10 else 0
        if holdout > 0 and not np.any(y_rev[-holdout:] > 0):
            holdout = 0  # a holdout of only zero sales cannot provide a MAPE
        holdout_is_valid = holdout > 0
        train_dates = dates[:-holdout] if holdout > 0 else dates
        train_y = y_rev[:-holdout] if holdout > 0 else y_rev
        test_y = y_rev[-holdout:] if holdout > 0 else y_rev

        # Fit 3 models on train split to score true out-of-sample MAPE
        h_fit, h_test = _holt_double_exp_forecast(train_y, max(1, holdout))
        s_fit, s_test, _ = _seasonal_ols_forecast(train_dates, train_y, max(1, holdout))
        w_fit, w_test = _wma_momentum_forecast(train_y, max(1, holdout))

        if holdout > 0:
            m1_mape, m1_rmse = _eval_mape_rmse(test_y, h_test)
            m2_mape, m2_rmse = _eval_mape_rmse(test_y, s_test)
            m3_mape, m3_rmse = _eval_mape_rmse(test_y, w_test)
        else:
            m1_mape, m1_rmse = _eval_mape_rmse(train_y, h_fit)
            m2_mape, m2_rmse = _eval_mape_rmse(train_y, s_fit)
            m3_mape, m3_rmse = _eval_mape_rmse(train_y, w_fit)

        # Full-data refit for 30-day forward projection
        h_full_fit, h_fc30 = _holt_double_exp_forecast(y_rev, 30)
        s_full_fit, s_fc30, weekday_factors = _seasonal_ols_forecast(dates, y_rev, 30)
        w_full_fit, w_fc30 = _wma_momentum_forecast(y_rev, 30)

        # Inverse-MAPE weighted Champion Ensemble
        inv1 = 1.0 / max(m1_mape, 3.0)
        inv2 = 1.0 / max(m2_mape, 3.0)
        inv3 = 1.0 / max(m3_mape, 3.0)
        inv_sum = inv1 + inv2 + inv3
        w1, w2, w3 = inv1 / inv_sum, inv2 / inv_sum, inv3 / inv_sum

        ens_fc30 = w1 * h_fc30 + w2 * s_fc30 + w3 * w_fc30
        ens_fit = w1 * h_full_fit + w2 * s_full_fit + w3 * w_full_fit
        ens_test = w1 * h_test + w2 * s_test + w3 * w_test
        ens_mape, ens_rmse = _eval_mape_rmse(test_y if holdout > 0 else y_rev, ens_test if holdout > 0 else ens_fit)

        candidates = [
            ("Weighted Pro Ensemble (Holt + Seasonal OLS + WMA)", ens_mape, ens_rmse, ens_fc30, ens_fit),
            ("Seasonal OLS Decomposition", m2_mape, m2_rmse, s_fc30, s_full_fit),
            ("Holt Damped Exponential Smoothing", m1_mape, m1_rmse, h_fc30, h_full_fit),
            ("Recency-Weighted Momentum MA", m3_mape, m3_rmse, w_fc30, w_full_fit),
        ]
        model_benchmarks = [
            {
                "model": name,
                "mape_pct": mape if holdout_is_valid else None,
                "accuracy_pct": None,
                "rmse_kes": rmse if holdout_is_valid else None,
                "selected": False,
            }
            for name, mape, rmse, _, _ in candidates
        ]
        best_idx = min(range(len(candidates)), key=lambda i: candidates[i][1])
        model_benchmarks[best_idx]["selected"] = True
        champion_model, best_mape, best_rmse, best_fc30, best_fit = candidates[best_idx]
        selection_mape_pct = best_mape if holdout_is_valid else None

        resid = y_rev - best_fit
        sigma = float(np.std(resid[y_rev > 0])) if np.any(y_rev > 0) else max(1.0, avg_daily_rev * 0.15)
        sigma = max(sigma, avg_daily_rev * 0.06)

        # Recent 14 actuals + horizon forecast for unified graph
        hist_slice = min(14, n_days)
        for i in range(n_days - hist_slice, n_days):
            forecast_points.append(
                {
                    "date": dates[i].isoformat(),
                    "actual": round(float(y_rev[i]), 2),
                    "predicted": round(float(best_fit[i]), 2),
                    "lower_80": None,
                    "upper_80": None,
                    "lower_95": None,
                    "upper_95": None,
                    "is_forecast": False,
                }
            )
        last_d = dates[-1]
        for h in range(horizon):
            fut_d = last_d + timedelta(days=h + 1)
            pred_v = float(best_fc30[h])
            spread = sigma * math.sqrt(1.0 + h * 0.12)
            forecast_points.append(
                {
                    "date": fut_d.isoformat(),
                    "actual": None,
                    "predicted": round(pred_v, 2),
                    "lower_80": round(max(0.0, pred_v - 1.28 * spread), 2),
                    "upper_80": round(pred_v + 1.28 * spread, 2),
                    "lower_95": round(max(0.0, pred_v - 1.96 * spread), 2),
                    "upper_95": round(pred_v + 1.96 * spread, 2),
                    "is_forecast": True,
                }
            )
        forecast_14d_total = round(float(np.sum(best_fc30[:14])), 2)
        forecast_30d_total = round(float(np.sum(best_fc30[:30])), 2)

    # =========================================================================
    # WEEKDAY SEASONALITY MATRIX (Mon–Sun)
    # =========================================================================
    weekday_bar: List[Dict[str, Any]] = []
    peak_day_label = None
    slow_day_label = None
    if n_days >= 3:
        wd_avgs = []
        for wd in range(7):
            vals = [float(y_rev[i]) for i, d in enumerate(dates) if d.weekday() == wd and y_rev[i] > 0]
            avg_wd = round(float(np.mean(vals)), 2) if vals else 0.0
            wd_avgs.append((wd, avg_wd))
            weekday_bar.append(
                {
                    "label": WEEKDAY_NAMES[wd],
                    "value": avg_wd,
                    "index": round(weekday_factors.get(wd, 1.0) * 100.0, 0),
                }
            )
        non_zero_wd = [w for w in wd_avgs if w[1] > 0]
        if non_zero_wd:
            peak_day_label = WEEKDAY_NAMES[max(non_zero_wd, key=lambda x: x[1])[0]]
            slow_day_label = WEEKDAY_NAMES[min(non_zero_wd, key=lambda x: x[1])[0]]

    # =========================================================================
    # MODIFIED Z-SCORE (MAD) ANOMALY DETECTION
    # =========================================================================
    anomalies: List[Dict[str, Any]] = []
    nz_indices = [i for i in range(n_days) if y_rev[i] > 0]
    if len(nz_indices) >= 5:
        nz_vals = np.array([y_rev[i] for i in nz_indices])
        med = float(np.median(nz_vals))
        mad = float(np.median(np.abs(nz_vals - med)))
        scale = 1.4826 * mad if mad > 1e-6 else float(np.std(nz_vals))
        if scale > 1e-6:
            for i in nz_indices:
                z = (float(y_rev[i]) - med) / scale
                if abs(z) >= 2.2:
                    direction = "spike" if z > 0 else "drop"
                    pct_diff = round(_safe_div(float(y_rev[i]) - med, med) * 100.0, 1)
                    anomalies.append(
                        {
                            "date": dates[i].isoformat(),
                            "revenue": round(float(y_rev[i]), 2),
                            "baseline_median": round(med, 2),
                            "z_score": round(z, 2),
                            "pct_vs_median": pct_diff,
                            "direction": direction,
                            "severity": "high" if abs(z) >= 3.0 else "medium",
                            "summary": (
                                f"Revenue {direction} of {pct_diff:+.1f}% vs typical day ({_fmt_kes(float(y_rev[i]))} vs median {_fmt_kes(med)})."
                            ),
                        }
                    )
            anomalies = sorted(anomalies, key=lambda a: abs(a["z_score"]), reverse=True)[:5]

    # =========================================================================
    # PARETO 80/20 + HHI CONCENTRATION + PIE CHART DATASETS
    # =========================================================================
    sorted_prods = sorted(products, key=lambda p: float(p.get("revenue", 0) or 0), reverse=True)
    prod_rev_sum = sum(float(p.get("revenue", 0) or 0) for p in sorted_prods)
    hhi = 0.0
    class_a_rev, class_b_rev, class_c_rev = 0.0, 0.0, 0.0
    class_a_count = 0
    cum = 0.0
    abc_products: List[Dict[str, Any]] = []
    for p in sorted_prods:
        r = float(p.get("revenue", 0) or 0)
        share = _safe_div(r, prod_rev_sum)
        hhi += (share * 100.0) ** 2
        prev_cum = cum
        cum += share
        if prev_cum < 0.80:
            cls = "A"
            class_a_rev += r
            class_a_count += 1
        elif prev_cum < 0.95:
            cls = "B"
            class_b_rev += r
        else:
            cls = "C"
            class_c_rev += r
        abc_products.append(
            {
                "name": p.get("name", "Item"),
                "revenue": round(r, 2),
                "share_pct": round(share * 100.0, 1),
                "abc_class": cls,
            }
        )
    hhi_index = round(hhi, 0)
    top_sku_share_pct = abc_products[0]["share_pct"] if abc_products else 0.0

    abc_pareto_pie = [
        {"label": "Class A (Core 80%)", "value": round(class_a_rev, 2)},
        {"label": "Class B (Growth 15%)", "value": round(class_b_rev, 2)},
        {"label": "Class C (Long Tail 5%)", "value": round(class_c_rev, 2)},
    ]
    abc_pareto_pie = [x for x in abc_pareto_pie if x["value"] > 0]

    pay_total = sum(float(x.get("total", x.get("value", 0)) or 0) for x in payment_mix)
    payment_mix_pie = [
        {
            "label": str(x.get("method", x.get("label", "other"))).replace("_", " ").upper(),
            "value": round(float(x.get("total", x.get("value", 0)) or 0), 2),
            "pct": round(_safe_div(float(x.get("total", x.get("value", 0)) or 0), pay_total) * 100.0, 1),
        }
        for x in payment_mix
        if float(x.get("total", x.get("value", 0)) or 0) > 0
    ]

    exp_total_mix = sum(float(x.get("total", x.get("value", 0)) or 0) for x in expense_mix)
    expense_mix_pie = [
        {
            "label": str(x.get("category", x.get("label", "General"))),
            "value": round(float(x.get("total", x.get("value", 0)) or 0), 2),
            "pct": round(_safe_div(float(x.get("total", x.get("value", 0)) or 0), exp_total_mix) * 100.0, 1),
        }
        for x in expense_mix
        if float(x.get("total", x.get("value", 0)) or 0) > 0
    ]

    # Cash runway calculation
    net_daily_flow = _safe_div(net_profit, period_days)
    if net_daily_flow < 0 and cash_balance > 0:
        cash_runway_days: Optional[int] = int(round(cash_balance / abs(net_daily_flow)))
        runway_str = f"{cash_runway_days} days"
        runway_status = "risk" if cash_runway_days < 30 else "watch"
    elif net_daily_flow >= 0 and total_revenue > 0:
        cash_runway_days = None
        runway_str = "Cash-Flow Positive"
        runway_status = "healthy"
    else:
        cash_runway_days = None
        runway_str = "Add cash & daily sales"
        runway_status = "neutral"

    # =========================================================================
    # TRANSPARENT DATA SCIENTIST CALCULATION SHEET (Exact Formulas + Results)
    # =========================================================================
    calculations = [
        {
            "id": "gross_margin",
            "metric": "Gross Profit Margin",
            "value": gross_margin_pct,
            "formatted": f"{gross_margin_pct}%",
            "formula": f"({_fmt_kes(gross_profit)} ÷ {_fmt_kes(total_revenue)}) × 100",
            "interpretation": "Healthy product markup" if gross_margin_pct >= 30 else "Tight margin — review supplier cost or pricing",
            "status": "healthy" if gross_margin_pct >= 30 else ("watch" if gross_margin_pct >= 18 else "risk"),
        },
        {
            "id": "net_margin",
            "metric": "Net Profit Margin",
            "value": net_margin_pct,
            "formatted": f"{net_margin_pct}%",
            "formula": f"({_fmt_kes(gross_profit)} − {_fmt_kes(total_expenses)}) ÷ {_fmt_kes(total_revenue)}",
            "interpretation": "Strong bottom-line profitability" if net_margin_pct >= 15 else ("Positive but narrow cushion" if net_margin_pct > 0 else "Operating at a net loss — cut leaks or lift sales"),
            "status": "healthy" if net_margin_pct >= 15 else ("watch" if net_margin_pct > 0 else "risk"),
        },
        {
            "id": "breakeven_daily",
            "metric": "Daily Break-Even Sales",
            "value": breakeven_daily_rev,
            "formatted": f"{_fmt_kes(breakeven_daily_rev)} / day",
            "formula": f"Daily OpEx ({_fmt_kes(avg_daily_exp)}) ÷ Gross Margin ({round(gm_ratio * 100, 1)}%)",
            "interpretation": (
                f"Margin of safety: {safety_margin_pct:+.1f}% vs current avg {_fmt_kes(avg_daily_rev)}/day"
                if avg_daily_rev > 0
                else "Log daily sales & expenses to compute safety cushion"
            ),
            "status": "healthy" if safety_margin_pct >= 20 else ("watch" if safety_margin_pct >= 0 else "risk"),
        },
        {
            "id": "trend_slope",
            "metric": "Daily Revenue Trend (OLS)",
            "value": round(slope_kes_day, 2),
            "formatted": f"{'+' if slope_kes_day >= 0 else ''}{_fmt_kes(slope_kes_day)} / day",
            "formula": f"Linear Regression slope (R² = {r_squared}, 7d momentum {momentum_7d_pct:+.1f}%)",
            "interpretation": "Upward sales trajectory" if slope_kes_day > 0 else ("Flat trajectory" if abs(slope_kes_day) < 50 else "Downward slope — intervene early"),
            "status": "healthy" if slope_kes_day > 0 else ("watch" if abs(slope_kes_day) < 50 else "risk"),
        },
        {
            "id": "stability",
            "metric": "Revenue Stability Score",
            "value": stability_score,
            "formatted": f"{stability_score} / 100",
            "formula": f"100 − (80 × CV); daily volatility CV = {cv_pct}%",
            "interpretation": f"Peak day: {peak_day_label} · Slowest day: {slow_day_label}",
            "status": "healthy" if stability_score >= 65 else ("watch" if stability_score >= 45 else "risk"),
        },
        {
            "id": "pareto_hhi",
            "metric": "Product Concentration (HHI)",
            "value": hhi_index,
            "formatted": f"HHI {int(hhi_index):,} ({class_a_count} Class-A SKUs)",
            "formula": f"Σ(SKU Share %)² · Top SKU drives {top_sku_share_pct}% of revenue",
            "interpretation": "High dependency on 1–2 items — diversify basket" if top_sku_share_pct >= 45 else "Balanced product revenue mix",
            "status": "watch" if top_sku_share_pct >= 45 else "healthy",
        },
        {
            "id": "cash_runway",
            "metric": "Cash Runway & Liquidity",
            "value": cash_runway_days if cash_runway_days is not None else 999,
            "formatted": runway_str,
            "formula": f"Cash {_fmt_kes(cash_balance)} · Payables {_fmt_kes(payables)} · Receivables {_fmt_kes(receivables)}",
            "interpretation": "Healthy net cash generation" if runway_status == "healthy" else "Monitor supplier bills & accelerate receivables",
            "status": runway_status,
        },
    ]

    # =========================================================================
    # PRIORITIZED DATA SCIENTIST RECOMMENDATIONS (RANKED BY KES IMPACT)
    # =========================================================================
    # Exclude calculations when their source data is missing; an estimate is not
    # presented as a verified profit, margin or break-even figure.
    if not has_cost_data:
        calculations = [c for c in calculations if c["id"] not in {"gross_margin", "net_margin", "breakeven_daily"}]
    elif not has_expense_data:
        calculations = [c for c in calculations if c["id"] not in {"net_margin", "breakeven_daily"}]
    if gross_profit <= 0:
        calculations = [c for c in calculations if c["id"] != "breakeven_daily"]
    if active_days < 4:
        calculations = [c for c in calculations if c["id"] not in {"trend_slope", "stability"}]
    if not products:
        calculations = [c for c in calculations if c["id"] != "pareto_hhi"]
    if not payload.get("liquidity_data_available", False):
        calculations = [c for c in calculations if c["id"] != "cash_runway"]

    recommendations: List[Dict[str, Any]] = []
    if stockout_count > 0 or low_stock_count > 0:
        est_recovery = 0
        recommendations.append(
            {
                "priority": "urgent" if stockout_count > 0 else "high",
                "title": f"Prevent Stockout Loss on {stockout_count + low_stock_count} SKU(s)",
                "estimated_monthly_impact_kes": est_recovery,
                "en": f"Restock {stockout_count} out-of-stock and {low_stock_count} low-stock items and review reorder levels. The financial impact has not been estimated.",
                "sw": f"Agiza haraka bidhaa {stockout_count} zilizoisha na {low_stock_count} zinazokaribia kuisha na kagua viwango vya kuagiza. Athari ya kifedha haijakadiriwa.",
            }
        )
    if expense_ratio_pct > 32 and total_expenses > 0:
        est_save = round(total_expenses * 0.12 * 30 / period_days)
        top_exp = expense_mix_pie[0]["label"] if expense_mix_pie else "operating expenses"
        recommendations.append(
            {
                "priority": "high",
                "title": f"Trim {top_exp} Overhead by 10–15%",
                "estimated_monthly_impact_kes": est_save,
                "en": f"Operating expenses consume {expense_ratio_pct}% of revenue (led by {top_exp}). As an illustrative scenario, a 12% reduction at this rate would save about {_fmt_kes(est_save)} per 30 days; actual savings may differ.",
                "sw": f"Matumizi yanachukua {expense_ratio_pct}% ya mapato (yakiongozwa na {top_exp}). Kwa mfano, kupunguza 12% kwa kiwango hiki kunaweza kuokoa takriban {_fmt_kes(est_save)} kwa siku 30; matokeo yanaweza kutofautiana.",
            }
        )
    if active_days >= 5 and peak_day_label != slow_day_label:
        est_lift = 0
        recommendations.append(
            {
                "priority": "medium",
                "title": f"Run Targeted {slow_day_label} Off-Peak Offer",
                "estimated_monthly_impact_kes": est_lift,
                "en": f"Seasonality math shows {peak_day_label} is your peak while {slow_day_label} lags. Consider a promotion on {slow_day_label}; its impact is not known in advance.",
                "sw": f"Takwimu zinaonyesha {peak_day_label} ndiyo siku ya mauzo mengi huku {slow_day_label} ikiwa chini. Fikiria ofa siku ya {slow_day_label}; athari yake haijulikani mapema.",
            }
        )
    if receivables > 0 and payload.get("liquidity_data_available", False):
        recommendations.append(
            {
                "priority": "medium",
                "title": f"Accelerate {_fmt_kes(receivables)} in Open Receivables",
                "estimated_monthly_impact_kes": round(receivables * 0.6),
                "en": f"Collecting 60% of your {_fmt_kes(receivables)} open customer credit unlocks {_fmt_kes(receivables * 0.6)} in immediate working capital.",
                "sw": f"Kukusanya 60% ya madeni ya wateja ({_fmt_kes(receivables)}) kutaleta {_fmt_kes(receivables * 0.6)} ya mtaji wa haraka.",
            }
        )
    if active_days < 7:
        recommendations.append(
            {
                "priority": "high",
                "title": "Complete Daily Sales Check-Ins for 7+ Days",
                "estimated_monthly_impact_kes": 0,
                "en": f"You currently have {active_days} recorded day(s). Log daily M-Pesa & cash sales for 7+ days to give the forecast more history; forecasts remain uncertain.",
                "sw": f"Una siku {active_days} zilizorekodiwa hadi sasa. Rekodi mauzo ya kila siku kwa siku 7+ ili kuongeza historia; utabiri si wa uhakika.",
            }
        )

    recommendations.sort(key=lambda r: r["estimated_monthly_impact_kes"], reverse=True)

    return {
        "has_sufficient_data": active_days >= 3,
        "recorded_days": active_days,
        "summary": {
            "total_revenue": round(total_revenue, 2),
            "gross_profit": round(gross_profit, 2) if has_cost_data else None,
            "total_expenses": round(total_expenses, 2) if has_expense_data else None,
            "net_profit": round(net_profit, 2) if has_cost_data and has_expense_data else None,
            "gross_margin_pct": gross_margin_pct if has_cost_data else None,
            "net_margin_pct": net_margin_pct if has_cost_data and has_expense_data else None,
            "expense_ratio_pct": expense_ratio_pct if has_expense_data else None,
            "aov": aov,
            "avg_daily_revenue": avg_daily_rev,
            "breakeven_daily_revenue": breakeven_daily_rev if has_cost_data and has_expense_data and gross_profit > 0 else None,
            "breakeven_monthly_revenue": breakeven_monthly_rev if has_cost_data and has_expense_data and gross_profit > 0 else None,
            "safety_margin_pct": safety_margin_pct if has_cost_data and has_expense_data and gross_profit > 0 else None,
            "trend_slope_kes_day": round(slope_kes_day, 2),
            "trend_r_squared": r_squared,
            "momentum_7d_pct": momentum_7d_pct,
            "stability_score": stability_score,
            "peak_day": peak_day_label,
            "slow_day": slow_day_label,
            "hhi_index": hhi_index,
        },
        "forecast": {
            "champion_model": champion_model,
            "backtest_accuracy_pct": backtest_accuracy_pct,
            "selection_mape_pct": selection_mape_pct,
            "has_holdout": holdout_is_valid,
            "last_recorded_date": dates[-1].isoformat() if n_days else None,
            "missing_calendar_days": max(0, n_days - len({str(row.get("date"))[:10] for row in daily_sales if row.get("date")})),
            "projected_14d_revenue": forecast_14d_total,
            "projected_30d_revenue": forecast_30d_total,
            "model_benchmarks": model_benchmarks,
            "series": forecast_points,
        },
        "calculations": calculations,
        "charts": {
            "payment_mix_pie": payment_mix_pie,
            "expense_mix_pie": expense_mix_pie,
            "abc_pareto_pie": abc_pareto_pie,
            "weekday_bar": weekday_bar,
        },
        "anomalies": anomalies,
        "abc_products": abc_products[:10],
        "recommendations": recommendations[:5],
    }
