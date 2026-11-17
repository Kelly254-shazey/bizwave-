from typing import Any, Dict, List


def compute_business_diagnostics(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes an objective 0-100 BizWave Executive Health Score and multi-factor
    root-cause diagnostics across revenue momentum, margin, stock, cash, and retention.
    """
    curr_rev = max(0.0, float(payload.get("current_revenue", 0.0)))
    prev_rev = max(0.0, float(payload.get("previous_revenue", 0.0)))
    curr_orders = max(0, int(payload.get("current_orders", 0)))
    prev_orders = max(0, int(payload.get("previous_orders", 0)))
    gross_profit = float(payload.get("gross_profit", 0.0))
    expenses = max(0.0, float(payload.get("expenses", 0.0)))
    cash_balance = float(payload.get("cash_balance", 0.0))
    payables = max(0.0, float(payload.get("payables", 0.0)))
    receivables = max(0.0, float(payload.get("receivables", 0.0)))
    stockout_count = max(0, int(payload.get("stockout_count", 0)))
    low_stock_count = max(0, int(payload.get("low_stock_count", 0)))
    total_products = max(0, int(payload.get("total_products", 0)))
    active_customers = max(0, int(payload.get("active_customers", 0)))
    churn_risk_customers = max(0, int(payload.get("churn_risk_customers", 0)))

    rev_delta_pct = ((curr_rev - prev_rev) / prev_rev * 100.0) if prev_rev > 0 else (100.0 if curr_rev > 0 else 0.0)
    curr_aov = (curr_rev / curr_orders) if curr_orders > 0 else 0.0
    prev_aov = (prev_rev / prev_orders) if prev_orders > 0 else 0.0
    aov_delta_pct = ((curr_aov - prev_aov) / prev_aov * 100.0) if prev_aov > 0 else 0.0
    vol_delta_pct = ((curr_orders - prev_orders) / prev_orders * 100.0) if prev_orders > 0 else 0.0

    net_profit = gross_profit - expenses
    gross_margin_pct = (gross_profit / curr_rev * 100.0) if curr_rev > 0 else 0.0
    net_margin_pct = (net_profit / curr_rev * 100.0) if curr_rev > 0 else 0.0
    expense_ratio_pct = (expenses / curr_rev * 100.0) if curr_rev > 0 else 0.0
    daily_burn = expenses / 30.0 if expenses > 0 else 0.0
    cash_runway_days = int(round(cash_balance / daily_burn)) if daily_burn > 0 and cash_balance > 0 else (90 if cash_balance > 0 else 0)

    # Sub-scores (0-100 each)
    growth_score = max(15, min(100, int(round(65 + rev_delta_pct * 1.1)))) if (curr_rev > 0 or prev_rev > 0) else 50
    margin_score = max(10, min(100, int(round(45 + net_margin_pct * 1.8)))) if curr_rev > 0 else 50
    if total_products > 0:
        healthy_ratio = max(0.0, (total_products - stockout_count - 0.5 * low_stock_count) / total_products)
        stock_score = max(10, min(100, int(round(healthy_ratio * 100))))
    else:
        stock_score = 50
    cash_coverage = (cash_balance + receivables) / max(1.0, payables + expenses * 0.5)
    cash_score = max(15, min(100, int(round(min(cash_coverage, 2.0) * 50)))) if (cash_balance > 0 or expenses > 0) else 50
    if active_customers + churn_risk_customers > 0:
        retention_ratio = active_customers / (active_customers + churn_risk_customers)
        retention_score = max(15, min(100, int(round(retention_ratio * 100))))
    else:
        retention_score = 50

    overall_score = int(
        round(
            0.25 * growth_score
            + 0.25 * margin_score
            + 0.20 * stock_score
            + 0.15 * cash_score
            + 0.15 * retention_score
        )
    )

    drivers: List[Dict[str, Any]] = []
    if curr_rev > 0 and prev_rev > 0:
        if rev_delta_pct < -5:
            primary_cause = (
                "order volume declined" if abs(vol_delta_pct) >= abs(aov_delta_pct) else "average order value softened"
            )
            drivers.append(
                {
                    "area": "revenue",
                    "severity": "high" if rev_delta_pct < -15 else "medium",
                    "headline": f"Revenue shifted {rev_delta_pct:+.1f}% vs prior period",
                    "detail": f"Primary driver: {primary_cause} (orders {vol_delta_pct:+.1f}%, AOV {aov_delta_pct:+.1f}%).",
                }
            )
        elif rev_delta_pct >= 5:
            drivers.append(
                {
                    "area": "revenue",
                    "severity": "positive",
                    "headline": f"Revenue grew {rev_delta_pct:+.1f}% vs prior period",
                    "detail": f"Orders changed {vol_delta_pct:+.1f}% and average ticket moved {aov_delta_pct:+.1f}%.",
                }
            )

    if stockout_count > 0 or low_stock_count > 0:
        drivers.append(
            {
                "area": "inventory",
                "severity": "high" if stockout_count > 0 else "medium",
                "headline": f"{stockout_count} out-of-stock & {low_stock_count} low-stock SKUs detected",
                "detail": "Stockouts directly suppress repeat sales and lower average basket size.",
            }
        )

    if curr_rev > 0 and expense_ratio_pct > 45:
        drivers.append(
            {
                "area": "expenses",
                "severity": "high" if net_margin_pct < 5 else "medium",
                "headline": f"Operating expenses consume {expense_ratio_pct:.1f}% of revenue",
                "detail": f"Net margin stands at {net_margin_pct:.1f}% ({net_profit:,.0f} KES). Trimming top cost leaks by 10% adds {expenses * 0.10:,.0f} KES.",
            }
        )

    if payables > cash_balance and payables > 0:
        drivers.append(
            {
                "area": "cashflow",
                "severity": "high",
                "headline": f"Payables ({payables:,.0f} KES) exceed recorded cash ({cash_balance:,.0f} KES)",
                "detail": f"Prioritize collecting {receivables:,.0f} KES in receivables and staggering supplier payouts.",
            }
        )

    if churn_risk_customers > 0:
        drivers.append(
            {
                "area": "customers",
                "severity": "medium",
                "headline": f"{churn_risk_customers} previously active customers show churn risk",
                "detail": "Targeted WhatsApp/SMS check-ins via BizWave Connect typically recover 15–25% of dormant buyers.",
            }
        )

    grade = (
        "Excellent" if overall_score >= 80 else "Healthy" if overall_score >= 65 else "Needs Attention" if overall_score >= 45 else "Critical"
    )

    return {
        "overall_health_score": overall_score,
        "grade": grade,
        "pillars": {
            "growth": growth_score,
            "margin": margin_score,
            "inventory": stock_score,
            "cashflow": cash_score,
            "retention": retention_score,
        },
        "decomposition": {
            "revenue_delta_pct": round(rev_delta_pct, 1),
            "order_volume_delta_pct": round(vol_delta_pct, 1),
            "aov_delta_pct": round(aov_delta_pct, 1),
            "gross_margin_pct": round(gross_margin_pct, 1),
            "net_margin_pct": round(net_margin_pct, 1),
            "expense_ratio_pct": round(expense_ratio_pct, 1),
            "cash_runway_days": cash_runway_days,
        },
        "drivers": drivers,
    }


def simulate_what_if(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deterministic What-If Financial Scenario Simulator for SME decision making.
    Models price adjustments (with conservative elasticity), volume lift, expense trims,
    and stockout recovery into projected 30-day revenue, net profit, and margin delta.
    """
    base_rev = max(0.0, float(payload.get("monthly_revenue", 0.0)))
    base_cogs = max(0.0, float(payload.get("monthly_cogs", 0.0)))
    base_exp = max(0.0, float(payload.get("monthly_expenses", 0.0)))

    price_change_pct = float(payload.get("price_change_pct", 0.0))
    volume_change_pct = float(payload.get("volume_change_pct", 0.0))
    expense_change_pct = float(payload.get("expense_change_pct", 0.0))
    stockout_recovery_pct = max(0.0, float(payload.get("stockout_recovery_pct", 0.0)))
    price_elasticity = float(payload.get("price_elasticity", -0.35))

    # Mild demand elasticity when increasing prices without offsetting value
    elastic_volume_effect = price_change_pct * price_elasticity if price_change_pct > 0 else 0.0
    effective_vol_factor = max(0.2, 1.0 + (volume_change_pct + stockout_recovery_pct + elastic_volume_effect) / 100.0)
    price_factor = max(0.2, 1.0 + price_change_pct / 100.0)

    proj_rev = base_rev * price_factor * effective_vol_factor
    proj_cogs = base_cogs * effective_vol_factor
    proj_exp = base_exp * max(0.1, 1.0 + expense_change_pct / 100.0)

    base_gross = base_rev - base_cogs
    base_net = base_gross - base_exp
    proj_gross = proj_rev - proj_cogs
    proj_net = proj_gross - proj_exp

    base_margin = (base_net / base_rev * 100.0) if base_rev > 0 else 0.0
    proj_margin = (proj_net / proj_rev * 100.0) if proj_rev > 0 else 0.0

    return {
        "baseline": {
            "monthly_revenue": round(base_rev, 2),
            "monthly_gross_profit": round(base_gross, 2),
            "monthly_expenses": round(base_exp, 2),
            "monthly_net_profit": round(base_net, 2),
            "net_margin_pct": round(base_margin, 1),
        },
        "projected": {
            "monthly_revenue": round(proj_rev, 2),
            "monthly_gross_profit": round(proj_gross, 2),
            "monthly_expenses": round(proj_exp, 2),
            "monthly_net_profit": round(proj_net, 2),
            "net_margin_pct": round(proj_margin, 1),
        },
        "impact": {
            "revenue_delta": round(proj_rev - base_rev, 2),
            "net_profit_delta": round(proj_net - base_net, 2),
            "annualized_profit_delta": round((proj_net - base_net) * 12.0, 2),
            "margin_delta_pp": round(proj_margin - base_margin, 1),
            "effective_volume_change_pct": round((effective_vol_factor - 1.0) * 100.0, 1),
        },
        "assumptions": {
            "price_change_pct": price_change_pct,
            "volume_change_pct": volume_change_pct,
            "expense_change_pct": expense_change_pct,
            "stockout_recovery_pct": stockout_recovery_pct,
            "price_elasticity": price_elasticity,
        },
    }
