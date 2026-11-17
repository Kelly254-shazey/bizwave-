from typing import Dict, Any, List
import numpy as np
import pandas as pd
from app.models.schemas import AnomalyDetectRequest


def detect_anomalies(req: AnomalyDetectRequest) -> Dict[str, Any]:
    if len(req.series) < 10:
        return {
            "status": "insufficient_data",
            "metric_name": req.metric_name,
            "anomalies": [],
            "message": "At least 10 observations are required for reliable anomaly detection.",
        }

    df = pd.DataFrame([{"date": pd.to_datetime(p.date), "value": float(p.value)} for p in req.series])
    df = df.groupby("date", as_index=False)["value"].sum().sort_values("date").reset_index(drop=True)

    # Use robust rolling median & MAD + global IQR hybrid so genuine dips/spikes stand out
    window = min(21, max(7, len(df) // 3))
    rolling_med = df["value"].rolling(window=window, min_periods=5).median().shift(1)
    rolling_std = df["value"].rolling(window=window, min_periods=5).std().shift(1)

    global_med = float(df["value"].median())
    global_iqr = float(df["value"].quantile(0.75) - df["value"].quantile(0.25))
    robust_sigma = max(global_iqr / 1.349, float(df["value"].std()) * 0.5, 1.0)

    anomalies: List[Dict[str, Any]] = []
    for idx, row in df.iterrows():
        if idx < 7:
            continue
        expected = float(rolling_med.iloc[idx]) if pd.notna(rolling_med.iloc[idx]) else global_med
        scale = float(rolling_std.iloc[idx]) if pd.notna(rolling_std.iloc[idx]) and rolling_std.iloc[idx] > 1.0 else robust_sigma
        scale = max(scale, expected * 0.12, 1.0)
        z = (float(row["value"]) - expected) / scale

        if abs(z) < req.z_threshold:
            continue
        if req.direction_sensitivity == "drop" and z > 0:
            continue
        if req.direction_sensitivity == "spike" and z < 0:
            continue

        pct_diff = ((float(row["value"]) - expected) / expected * 100.0) if expected > 0 else 0.0
        if "expense" in req.metric_name:
            a_type = "expense_spike" if z > 0 else "transaction_pattern"
        else:
            a_type = "revenue_drop" if z < 0 else "revenue_spike"

        severity = "critical" if abs(z) >= 3.5 else "high" if abs(z) >= 2.8 else "medium"
        direction_word = "below" if z < 0 else "above"
        anomalies.append({
            "event_date": row["date"].strftime("%Y-%m-%d"),
            "anomaly_type": a_type,
            "severity": severity,
            "metric_name": req.metric_name,
            "expected_value": round(expected, 2),
            "observed_value": round(float(row["value"]), 2),
            "deviation_score": round(float(z), 3),
            "explanation": (
                f"Observed {req.metric_name.replace('_', ' ')} (KES {row['value']:,.0f}) was {abs(pct_diff):.1f}% "
                f"{direction_word} the trailing {window}-day expected baseline (KES {expected:,.0f}, z={z:+.2f})."
            ),
        })

    anomalies.sort(key=lambda x: x["event_date"], reverse=True)
    return {
        "status": "completed",
        "metric_name": req.metric_name,
        "analyzed_from": df["date"].min().strftime("%Y-%m-%d"),
        "analyzed_to": df["date"].max().strftime("%Y-%m-%d"),
        "anomalies_found": len(anomalies),
        "anomalies": anomalies[:20],
    }
