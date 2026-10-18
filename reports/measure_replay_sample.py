"""Measure the served model on the 25-alarm replay sample (run from the repo root, laptop only).

Runs the backend's own path (``InferenceService``: ``vtac.preprocess_slots`` -> ONNX) for every
alarm at the same window end the WebSocket replay uses, and writes
``reports/replay_sample_check.json``: per-alarm scores, verdicts and channel quality, plus latency
(median, p95) over repeated passes.

    VTAC_MODEL_MODE=onnx PYTHONPATH=.:src uv run python reports/measure_replay_sample.py

Measures preprocess + inference per verdict only (no WebSocket, no browser). Not a performance
estimate for the model: 25 alarms are a demo set (see docs/modeling.md for the test-set numbers).
"""

from __future__ import annotations

import json
import platform
import time
from pathlib import Path

import numpy as np
from backend.app.latency import LatencyTracker
from backend.app.model import build_predictor
from backend.app.service import InferenceService
from backend.app.settings import Settings
from backend.app.store import AlarmStore

WARM_PASSES = 10
OUT = Path("reports/replay_sample_check.json")


def _cpu_name() -> str:
    try:
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.startswith("model name"):
                return line.split(":", 1)[1].strip()
    except OSError:
        pass
    return platform.processor() or "unknown"


def _stats(ms: list[float]) -> dict[str, float | int]:
    v = np.asarray(ms)
    return {
        "count": int(v.size),
        "mean_ms": float(v.mean()),
        "median_ms": float(np.percentile(v, 50)),
        "p95_ms": float(np.percentile(v, 95)),
        "max_ms": float(v.max()),
    }


def main() -> None:
    settings = Settings()
    if settings.model_mode != "onnx":
        raise SystemExit("set VTAC_MODEL_MODE=onnx (this script measures the real model)")
    store = AlarmStore.load(settings)
    if store.synthetic:
        raise SystemExit(
            "data/sample/replay_sample.npz not found: refusing to measure synthetic data"
        )
    cfg = store.cfg
    predictor = build_predictor(settings, cfg)
    if predictor is None:
        raise SystemExit("models/model.onnx not found")
    svc = InferenceService(cfg, predictor, LatencyTracker())
    end_idx = cfg.window_end_index

    alarms = store.all()
    first_pass: list[dict] = []
    for a in alarms:
        r = svc.infer(a.raw(), end_idx, a.alarm_id)
        first_pass.append(
            {
                "alarm_id": a.alarm_id,
                "patient_id": a.patient_id,
                "ground_truth": "true" if a.ground_truth else "false",
                "p_true": r.p_true,
                "verdict": r.verdict,
                "action": r.action,
                "correct": (r.action == "escalated") == a.ground_truth,
                "margin_to_threshold": r.p_true - r.threshold,
                "mask": r.mask,
                "quality": r.quality,
                "sources": a.sources,
                "preprocess_ms": r.preprocess_ms,
                "infer_ms": r.infer_ms,
                "total_ms": r.latency_ms,
            }
        )

    warm_total: list[float] = []
    warm_pre: list[float] = []
    warm_inf: list[float] = []
    for _ in range(WARM_PASSES):
        for a in alarms:
            r = svc.infer(a.raw(), end_idx, a.alarm_id)
            warm_total.append(r.latency_ms)
            warm_pre.append(r.preprocess_ms)
            warm_inf.append(r.infer_ms)

    gt_true = [x for x in first_pass if x["ground_truth"] == "true"]
    gt_false = [x for x in first_pass if x["ground_truth"] == "false"]
    report = {
        "what": "backend InferenceService (preprocess_slots + OnnxPredictor) on the replay sample",
        "measured_at_unix": time.time(),
        "model_version": predictor.version,
        "threshold": cfg.threshold,
        "window_end_index": end_idx,
        "host": {
            "cpu": _cpu_name(),
            "platform": platform.platform(),
            "python": platform.python_version(),
        },
        "onnxruntime_intra_op_threads": 2,
        "sample": {
            "n_alarms": len(first_pass),
            "n_true": len(gt_true),
            "n_false": len(gt_false),
            "true_escalated": sum(x["action"] == "escalated" for x in gt_true),
            "false_suppressed": sum(x["action"] == "suppressed" for x in gt_false),
        },
        "latency": {
            "method": (
                f"first_pass = each of the {len(alarms)} alarms once, right after model load "
                f"(includes cold-start effects); warm = {WARM_PASSES} further passes over the same "
                f"alarms ({WARM_PASSES * len(alarms)} calls). "
                "Per-call time = preprocess + inference."
            ),
            "first_pass_total": _stats([x["total_ms"] for x in first_pass]),
            "warm_total": _stats(warm_total),
            "warm_preprocess": _stats(warm_pre),
            "warm_infer": _stats(warm_inf),
        },
        "alarms": first_pass,
    }
    OUT.write_text(json.dumps(report, indent=2))
    print(json.dumps({k: report[k] for k in ("sample", "latency")}, indent=2))
    print("saved", OUT)


if __name__ == "__main__":
    main()
