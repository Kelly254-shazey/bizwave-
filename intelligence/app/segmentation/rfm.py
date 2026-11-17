from typing import Dict, Any, List
import numpy as np
from app.models.schemas import RfmRequest


def compute_rfm_segments(req: RfmRequest) -> Dict[str, Any]:
    if not req.customers:
        return {"status": "completed", "customer_count": 0, "segment_counts": {}, "customers": []}

    recencies = [c.days_since_last_purchase if c.days_since_last_purchase is not None else 999 for c in req.customers]
    freqs = [c.total_orders for c in req.customers]
    monetaries = [c.lifetime_value for c in req.customers]

    f_p66 = float(np.percentile(freqs, 66)) if len(freqs) >= 3 else 3.0
    m_p66 = float(np.percentile(monetaries, 66)) if len(monetaries) >= 3 else 10000.0

    results: List[Dict[str, Any]] = []
    counts: Dict[str, int] = {}

    for c, rec in zip(req.customers, recencies):
        r_score = 5 if rec <= 7 else 4 if rec <= 14 else 3 if rec <= 30 else 2 if rec <= 45 else 1
        f_score = 5 if c.total_orders >= max(f_p66 * 1.5, 5) else 4 if c.total_orders >= max(f_p66, 3) else 3 if c.total_orders >= 2 else 1
        m_score = 5 if c.lifetime_value >= max(m_p66 * 1.4, 20000) else 4 if c.lifetime_value >= max(m_p66, 8000) else 3 if c.lifetime_value >= 2500 else 1

        if rec >= 45 and c.total_orders > 0:
            segment = "churn_risk"
            churn_prob = min(0.95, round(0.55 + (rec - 45) / 100.0, 2))
        elif r_score >= 4 and f_score >= 4 and m_score >= 4:
            segment = "champions"
            churn_prob = 0.08
        elif r_score >= 3 and f_score >= 3:
            segment = "loyal"
            churn_prob = 0.18
        elif c.total_orders <= 1 and rec <= 21:
            segment = "new_customers"
            churn_prob = 0.35
        else:
            segment = "needs_attention"
            churn_prob = 0.42

        counts[segment] = counts.get(segment, 0) + 1
        results.append({
            "customer_id": c.customer_id,
            "full_name": c.full_name,
            "segment": segment,
            "rfm": {"r": r_score, "f": f_score, "m": m_score},
            "days_since_last_purchase": None if rec == 999 else rec,
            "total_orders": c.total_orders,
            "lifetime_value": round(c.lifetime_value, 2),
            "churn_probability": churn_prob,
        })

    results.sort(key=lambda x: (-x["churn_probability"], -x["lifetime_value"]))
    return {
        "status": "completed",
        "customer_count": len(results),
        "segment_counts": counts,
        "customers": results,
    }
