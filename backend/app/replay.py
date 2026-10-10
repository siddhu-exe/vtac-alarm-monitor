"""Simulated real-time replay of a recorded segment over a WebSocket (schema: docs/architecture.md).

The verdict is computed only from samples up to the window end (alarm onset + configured offset),
exactly as a live system would, then emitted when simulated time reaches that point.
"""

from __future__ import annotations

import asyncio
import time

import numpy as np
from fastapi import WebSocket, WebSocketDisconnect

from backend.app.schemas import SIM_LABEL
from backend.app.service import InferenceService
from backend.app.store import Alarm
from vtac.channels import assess_channel
from vtac.config import VtacConfig


def _to_list(x: np.ndarray) -> list[float | None]:
    arr = np.round(x.astype(np.float64), 3).astype(object)
    arr[~np.isfinite(x)] = None
    return arr.tolist()


async def replay(
    ws: WebSocket,
    alarm: Alarm,
    svc: InferenceService,
    *,
    speed: float,
    start_s: float,
    end_s: float,
    chunk_s: float,
    model_mode: str,
) -> None:
    cfg: VtacConfig = svc.cfg
    fs = cfg.fs
    raw = alarm.raw()
    n = raw.shape[1]
    verdict_idx = cfg.window_end_index
    present = [i for i, s in enumerate(cfg.channel_slots) if alarm.sources[cfg.channel_slots[i]]]
    await ws.send_json(
        {
            "type": "session",
            "alarm_id": alarm.alarm_id,
            "patient_id": alarm.patient_id,
            "fs": {cfg.channel_slots[i]: fs for i in present},
            "channels": [cfg.channel_slots[i] for i in present],
            "alarm_onset_s": cfg.alarm_onset_s,
            "window_end_s": verdict_idx / fs,
            "duration_s": n / fs,
            "start_s": start_s,
            "end_s": end_s,
            "speed": speed,
            "model_mode": model_mode,
            "synthetic": alarm.synthetic,
            "sim": True,
            "label": SIM_LABEL,
        }
    )
    step = max(1, round(chunk_s * fs))
    chunk_s = step / fs  # pace on the real chunk duration
    i0, i1 = round(start_s * fs), min(round(end_s * fs), n)
    verdict_sent = False
    t_wall = time.monotonic()
    for k, a in enumerate(range(i0, i1, step)):
        b = min(a + step, i1)
        q_lo = max(0, b - cfg.window_samples)
        await ws.send_json(
            {
                "type": "chunk",
                "t0": a / fs,
                "channels": {cfg.channel_slots[i]: _to_list(raw[i, a:b]) for i in present},
                "quality": {
                    cfg.channel_slots[i]: assess_channel(raw[i, q_lo:b], cfg).level for i in present
                },
            }
        )
        if not verdict_sent and b >= verdict_idx:
            res = await asyncio.to_thread(svc.infer, raw, verdict_idx, alarm.alarm_id)
            await ws.send_json(
                {
                    "type": "verdict",
                    "alarm_id": alarm.alarm_id,
                    "t": verdict_idx / fs,
                    "p_true": res.p_true,
                    "verdict": res.verdict,
                    "action": res.action,
                    "threshold": res.threshold,
                    "latency_ms": res.latency_ms,
                    "quality": res.quality,
                    "mask": res.mask,
                    "ground_truth": "true" if alarm.ground_truth else "false",
                    "model_mode": res.model_mode,
                    "model_version": res.model_version,
                }
            )
            verdict_sent = True
        await asyncio.sleep(max(0.0, t_wall + (k + 1) * chunk_s / speed - time.monotonic()))
    await ws.send_json({"type": "end", "alarm_id": alarm.alarm_id})


__all__ = ["replay", "WebSocketDisconnect"]
