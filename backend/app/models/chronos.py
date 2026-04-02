from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, List

import numpy as np

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_HF_CACHE = _PROJECT_ROOT / '.hf_cache'
_HF_CACHE.mkdir(exist_ok=True)
os.environ.setdefault('HF_HOME', str(_HF_CACHE))
os.environ.setdefault('HUGGINGFACE_HUB_CACHE', str(_HF_CACHE / 'hub'))
os.environ.setdefault('HF_HUB_OFFLINE', '1')
os.environ.setdefault('TRANSFORMERS_OFFLINE', '1')

_pipeline = None
_MODEL_ID = 'amazon/chronos-bolt-small'


def _round_list(values: List[float]) -> List[float]:
    return [round(float(value), 6) for value in values]


def _get_pipeline():
    global _pipeline
    if _pipeline is None:
        try:
            import torch
            from chronos import BaseChronosPipeline
        except Exception as exc:
            raise RuntimeError(f'Chronos dependencies are unavailable: {exc}') from exc

        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        _pipeline = BaseChronosPipeline.from_pretrained(
            _MODEL_ID,
            device_map=device,
            dtype=torch.float32,
            local_files_only=True,
        )
    return _pipeline


def chronos_forecast(train: np.ndarray, horizon: int) -> Dict[str, object]:
    try:
        import torch
    except Exception as exc:
        raise RuntimeError(f'Torch is unavailable: {exc}') from exc

    pipeline = _get_pipeline()
    inputs = torch.tensor(train, dtype=torch.float32).unsqueeze(0)
    quantile_levels = [0.1, 0.5, 0.9]
    quantiles, _ = pipeline.predict_quantiles(
        context=inputs,
        prediction_length=horizon,
        quantile_levels=quantile_levels,
    )
    series = quantiles[0]
    lo80 = series[:, 0].tolist()
    mean = series[:, 1].tolist()
    hi80 = series[:, 2].tolist()

    scale_95 = 1.96 / 1.282
    lo95 = []
    hi95 = []
    for low, mid, high in zip(lo80, mean, hi80):
        half_80 = (high - low) / 2.0
        half_95 = half_80 * scale_95
        lo95.append(mid - half_95)
        hi95.append(mid + half_95)

    return {
        'status': 'ok',
        'model': _MODEL_ID,
        'mean': _round_list(mean),
        'lo80': _round_list(lo80),
        'hi80': _round_list(hi80),
        'lo95': _round_list(lo95),
        'hi95': _round_list(hi95),
    }
