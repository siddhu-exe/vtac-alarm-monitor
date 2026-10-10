"""Inference service: raw slot window -> vtac preprocessing -> predictor -> verdict, with timing."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import numpy as np

from backend.app.latency import LatencyTracker
from backend.app.model import Predictor
from vtac.config import VtacConfig
from vtac.preprocess import preprocess_slots

log = logging.getLogger("vtac.inference")


@dataclass(frozen=True)
class Inference:
    p_true: float
    verdict: str
    action: str
    threshold: float
    preprocess_ms: float
    infer_ms: float
    latency_ms: float
    quality: dict[str, str]
    mask: list[int]
    model_mode: str
    model_version: str


class InferenceService:
    def __init__(self, cfg: VtacConfig, predictor: Predictor, tracker: LatencyTracker) -> None:
        self.cfg, self.predictor, self.tracker = cfg, predictor, tracker

    def infer(self, raw: np.ndarray, end_idx: int | None, tag: str = "-") -> Inference:
        t0 = time.perf_counter()
        pw = preprocess_slots(raw, self.cfg, end_idx)  # the ONLY preprocessing path (vtac)
        t1 = time.perf_counter()
        p = float(self.predictor.predict(pw.signals[None], pw.mask[None])[0])
        t2 = time.perf_counter()
        is_true = p >= self.cfg.threshold
        res = Inference(
            p_true=p,
            verdict="TRUE_ALARM" if is_true else "FALSE_ALARM",
            action="escalated" if is_true else "suppressed",
            threshold=self.cfg.threshold,
            preprocess_ms=(t1 - t0) * 1e3,
            infer_ms=(t2 - t1) * 1e3,
            latency_ms=(t2 - t0) * 1e3,
            quality=pw.quality_levels,
            mask=[int(m) for m in pw.mask],
            model_mode=self.predictor.mode,
            model_version=self.predictor.version,
        )
        self.tracker.record(res.latency_ms, res.verdict)
        log.info(
            "alarm_id=%s model_mode=%s preprocess_ms=%.2f infer_ms=%.2f total_ms=%.2f verdict=%s",
            tag,
            res.model_mode,
            res.preprocess_ms,
            res.infer_ms,
            res.latency_ms,
            res.verdict,
        )
        return res
