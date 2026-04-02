from __future__ import annotations

from datetime import datetime
from typing import Any, Callable, Dict, Iterable, List

import numpy as np
import pandas as pd

from app.models.arima import arima_forecast
from app.models.chronos import chronos_forecast
from app.models.naive import naive_forecast
from app.services.data_service import extract_time_series


def _make_log_entry(step_index: int, message: str) -> Dict[str, Any]:
    return {
        'stepIndex': step_index,
        'timestamp': datetime.now().strftime('%I:%M:%S %p'),
        'message': message,
    }


def _log(logs: List[Dict[str, Any]] | None, step_index: int, message: str, callback: Callable[[int, str], None] | None = None) -> None:
    if logs is not None:
        logs.append(_make_log_entry(step_index, message))
    if callback is not None:
        callback(step_index, message)


def _round_list(values: Iterable[float]) -> List[float]:
    return [round(float(value), 6) for value in values]


def compute_metrics(actual: np.ndarray, forecast: Iterable[float]) -> Dict[str, float | None]:
    actual_arr = np.asarray(actual, dtype=float)
    forecast_arr = np.asarray(list(forecast), dtype=float)
    mae = float(np.mean(np.abs(actual_arr - forecast_arr)))
    rmse = float(np.sqrt(np.mean((actual_arr - forecast_arr) ** 2)))
    with np.errstate(divide='ignore', invalid='ignore'):
        percent_errors = np.abs((actual_arr - forecast_arr) / actual_arr) * 100
    mape = float(np.nanmean(percent_errors)) if np.isfinite(np.nanmean(percent_errors)) else float('nan')
    return {
        'mae': round(mae, 4),
        'rmse': round(rmse, 4),
        'mape': None if np.isnan(mape) else round(mape, 4),
    }


def _normalize_model_payload(name: str, actual: np.ndarray, payload: Dict[str, Any]) -> Dict[str, Any]:
    mean = payload.get('mean', [])
    return {
        **payload,
        'name': name,
        'metrics': compute_metrics(actual, mean) if mean else None,
    }


def _run_model_metrics(
    train: np.ndarray,
    actual: np.ndarray,
    horizon: int,
    logs: List[Dict[str, Any]] | None = None,
    *,
    log_callback: Callable[[int, str], None] | None = None,
    log_prefix: str = '',
) -> Dict[str, Any]:
    prefix = f'{log_prefix} ' if log_prefix else ''
    _log(logs, 2, f"{prefix}Running naive baseline over {horizon} holdout period(s).", log_callback)
    naive_payload = {
        'status': 'ok',
        'mean': _round_list(naive_forecast(train, horizon)),
        'lo80': None,
        'hi80': None,
        'lo95': None,
        'hi95': None,
    }
    _log(logs, 2, f'{prefix}Naive baseline completed successfully.', log_callback)

    _log(logs, 3, f'{prefix}Fitting ARIMA candidates and selecting the best order by AIC.', log_callback)
    arima_payload = arima_forecast(train, horizon)
    order = arima_payload.get('order')
    if order:
        _log(logs, 3, f"{prefix}ARIMA completed with order ({order['p']},{order['d']},{order['q']}).", log_callback)
    else:
        _log(logs, 3, f'{prefix}ARIMA completed successfully.', log_callback)

    try:
        _log(logs, 4, f'{prefix}Loading Chronos-Bolt from the local cache and generating quantile forecasts.', log_callback)
        chronos_payload = chronos_forecast(train, horizon)
        _log(
            logs,
            4,
            f"{prefix}Chronos completed successfully using model {chronos_payload.get('model', 'chronos')}.",
            log_callback,
        )
    except Exception as exc:
        chronos_payload = {
            'status': 'error',
            'error': str(exc),
            'mean': [],
            'lo80': None,
            'hi80': None,
            'lo95': None,
            'hi95': None,
        }
        _log(logs, 4, f'{prefix}Chronos failed: {exc}', log_callback)

    return {
        'naive': _normalize_model_payload('Naive', actual, naive_payload),
        'arima': _normalize_model_payload('ARIMA', actual, arima_payload),
        'chronos': _normalize_model_payload('Chronos', actual, chronos_payload),
    }


def _best_model_name(model_map: Dict[str, Any]) -> str | None:
    candidates = []
    for model_name, payload in model_map.items():
        metrics = payload.get('metrics')
        if metrics:
            candidates.append((metrics['mae'], payload['name']))
    if not candidates:
        return None
    return min(candidates, key=lambda item: item[0])[1]


def run_forecast_suite(series_payload: Dict[str, Any]) -> Dict[str, Any]:
    train = series_payload['train']
    actual = series_payload['actual']
    history = np.asarray(series_payload['history'], dtype=float)
    labels = series_payload['labels']
    holdout_labels = series_payload['holdoutLabels']
    horizon = len(actual)
    logs: List[Dict[str, Any]] = []

    _log(logs, 0, 'Backend received single-firm forecast request.')
    _log(logs, 1, f"Prepared series '{series_payload['seriesName']}' for entity '{series_payload['entity']}' with {len(history)} observation(s).")
    model_map = _run_model_metrics(train, actual, horizon, logs)
    _log(logs, 5, 'Computed holdout metrics and assembled the comparison payload.')
    return {
        'series': {
            'name': series_payload['seriesName'],
            'entity': series_payload['entity'],
            'history': _round_list(history),
            'labels': labels,
            'holdoutLabels': holdout_labels,
            'actual': _round_list(actual),
            'holdout': horizon,
        },
        'models': model_map,
        'executionLogs': logs,
    }


def run_all_firms_forecast_suite(
    df,
    *,
    target_column: str,
    holdout: int,
    date_column: str | None = None,
    entity_column: str,
    log_callback: Callable[[int, str], None] | None = None,
) -> Dict[str, Any]:
    entity_series = df[entity_column].dropna().astype(str)
    entity_values = entity_series.unique().tolist()
    rows: List[Dict[str, Any]] = []
    processed_entities = 0
    skipped_entities = 0
    logs: List[Dict[str, Any]] = []

    _log(logs, 0, 'Backend received all-firms forecast request.', log_callback)
    _log(logs, 1, f"Preparing {len(entity_values)} firm series using '{entity_column}' as the grouping field.", log_callback)

    def _cell(row, column: str):
        if column not in firm_rows.columns:
            return None
        value = row[column]
        return None if pd.isna(value) else str(value)

    for entity_value in entity_values:
        firm_rows = df[df[entity_column].astype(str) == entity_value]
        firm_info = firm_rows.iloc[0]
        display_name = _cell(firm_info, 'tic') or _cell(firm_info, 'conm') or entity_value
        row_base = {
            'entityValue': entity_value,
            'gvkey': _cell(firm_info, 'gvkey'),
            'tic': _cell(firm_info, 'tic'),
            'conm': _cell(firm_info, 'conm'),
        }

        try:
            _log(
                logs,
                1,
                f"[{processed_entities + skipped_entities + 1}/{len(entity_values)}] Preparing firm '{display_name}'.",
                log_callback,
            )
            series_payload = extract_time_series(
                df,
                target_column=target_column,
                holdout=holdout,
                date_column=date_column,
                entity_column=entity_column,
                entity_value=entity_value,
            )
            actual = series_payload['actual']
            train = series_payload['train']
            model_map = _run_model_metrics(
                train,
                actual,
                len(actual),
                None,
                log_callback=log_callback,
                log_prefix=f"[{display_name}]",
            )
            processed_entities += 1
            best_model = _best_model_name(model_map)
            _log(
                logs,
                4,
                f"[{processed_entities}/{len(entity_values)}] Finished firm '{display_name}' with best model {best_model or 'n/a'}.",
                log_callback,
            )
            rows.append(
                {
                    **row_base,
                    'status': 'ok',
                    'observations': len(series_payload['history']),
                    'bestModel': best_model,
                    'models': {
                        key: value.get('metrics') for key, value in model_map.items()
                    },
                }
            )
        except Exception as exc:
            skipped_entities += 1
            _log(
                logs,
                4,
                f"[{processed_entities + skipped_entities}/{len(entity_values)}] Skipped firm '{display_name}': {exc}",
                log_callback,
            )
            rows.append(
                {
                    **row_base,
                    'status': 'skipped',
                    'observations': int(len(firm_rows)),
                    'bestModel': None,
                    'models': {
                        'naive': None,
                        'arima': None,
                        'chronos': None,
                    },
                    'note': str(exc),
                }
            )

    _log(logs, 2, 'Naive baseline pass completed for all eligible firms.')
    _log(logs, 3, 'ARIMA benchmark pass completed for all eligible firms.')
    _log(logs, 4, 'Chronos-Bolt pass completed for all eligible firms.')
    _log(logs, 5, f'Batch metrics assembled. Processed {processed_entities} firm(s), skipped {skipped_entities}.')

    return {
        'summary': {
            'entityColumn': entity_column,
            'targetColumn': target_column,
            'holdout': holdout,
            'totalEntities': len(entity_values),
            'processedEntities': processed_entities,
            'skippedEntities': skipped_entities,
        },
        'rows': rows,
        'executionLogs': logs,
    }


def summarize_gretl(actual: np.ndarray, forecast: np.ndarray, labels: List[str]) -> Dict[str, Any]:
    return {
        'name': 'Gretl',
        'status': 'ok',
        'labels': labels,
        'actual': _round_list(actual),
        'forecast': _round_list(forecast),
        'metrics': compute_metrics(actual, forecast),
    }
