from __future__ import annotations

from typing import List

import numpy as np


def naive_forecast(train: np.ndarray, horizon: int) -> List[float]:
    last_value = float(train[-1])
    return [last_value] * horizon
