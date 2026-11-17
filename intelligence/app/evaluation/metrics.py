import numpy as np
from typing import Dict


def compute_error_metrics(actual: np.ndarray, predicted: np.ndarray) -> Dict[str, float]:
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    errors = actual - predicted
    mae = float(np.mean(np.abs(errors)))
    rmse = float(np.sqrt(np.mean(errors ** 2)))

    non_zero = actual > 1e-6
    if np.any(non_zero):
        mape = float(np.mean(np.abs(errors[non_zero] / actual[non_zero])) * 100.0)
    else:
        mape = 0.0

    denom = np.abs(actual) + np.abs(predicted)
    valid = denom > 1e-6
    smape = float(np.mean(2.0 * np.abs(errors[valid]) / denom[valid]) * 100.0) if np.any(valid) else 0.0

    return {
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "mape": round(mape, 2),
        "smape": round(smape, 2),
    }
