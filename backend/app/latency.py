from __future__ import annotations

import threading
from collections import Counter, deque

import numpy as np


class LatencyTracker:
    """Rolling per-inference latency (ms) and verdict counts."""

    def __init__(self, maxlen: int = 1000) -> None:
        self._ms: deque[float] = deque(maxlen=maxlen)
        self._verdicts: Counter[str] = Counter()
        self._lock = threading.Lock()

    def record(self, total_ms: float, verdict: str) -> None:
        with self._lock:
            self._ms.append(total_ms)
            self._verdicts[verdict] += 1

    def summary(self) -> dict:
        with self._lock:
            v = np.array(self._ms)
            counts = dict(self._verdicts)
        if v.size == 0:
            return {"count": 0, "mean_ms": None, "p50_ms": None, "p95_ms": None, "verdicts": counts}
        return {
            "count": int(v.size),
            "mean_ms": float(v.mean()),
            "p50_ms": float(np.percentile(v, 50)),
            "p95_ms": float(np.percentile(v, 95)),
            "verdicts": counts,
        }
