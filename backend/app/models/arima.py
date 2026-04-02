from __future__ import annotations

import warnings
from typing import Dict, List, Tuple

import numpy as np
from statsmodels.tsa.arima.model import ARIMA


def _round_list(values: np.ndarray | List[float]) -> List[float]:
    return [round(float(value), 6) for value in values]


def _fit_best_model(train: np.ndarray) -> Tuple[object, Tuple[int, int, int]]:
    best_result = None
    best_order = None
    best_aic = float('inf')

    for p in range(4):
        for d in range(2):
            for q in range(4):
                if p == 0 and d == 0 and q == 0:
                    continue
                try:
                    with warnings.catch_warnings():
                        warnings.simplefilter('ignore')
                        result = ARIMA(train, order=(p, d, q), enforce_stationarity=False, enforce_invertibility=False).fit()
                    if np.isfinite(result.aic) and result.aic < best_aic:
                        best_aic = float(result.aic)
                        best_result = result
                        best_order = (p, d, q)
                except Exception:
                    continue

    if best_result is None or best_order is None:
        raise RuntimeError('ARIMA could not fit a valid model for this series.')

    return best_result, best_order


def arima_forecast(train: np.ndarray, horizon: int) -> Dict[str, object]:
    result, order = _fit_best_model(train)
    forecast = result.get_forecast(steps=horizon)
    mean = forecast.predicted_mean
    ci_80 = forecast.conf_int(alpha=0.20)
    ci_95 = forecast.conf_int(alpha=0.05)

    return {
        'status': 'ok',
        'order': {'p': order[0], 'd': order[1], 'q': order[2]},
        'mean': _round_list(mean),
        'lo80': _round_list(ci_80[:, 0]),
        'hi80': _round_list(ci_80[:, 1]),
        'lo95': _round_list(ci_95[:, 0]),
        'hi95': _round_list(ci_95[:, 1]),
    }
