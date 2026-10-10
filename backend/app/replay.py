"""Simulated real-time replay of a recorded segment over a WebSocket (schema: docs/architecture.md).

The verdict is computed only from samples up to the window end (alarm onset + configured offset),
exactly as a live system would, then emitted when simulated time reaches that point. While
streaming, the client may send ``control`` messages (pause / resume / speed); each is acknowledged
with a ``state`` message.
"""

from __future__ import annotations

import asyncio
import json
import math

import numpy as np
from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from backend.app.control import ReplayControl
from backend.app.service import InferenceService
from backend.app.store import Alarm
from backend.app.ws_schemas import (
    ChunkMsg,
    ControlIn,
    EndMsg,
    ErrorMsg,
    Numerics,
    SessionMsg,
    StateMsg,
    VerdictMsg,
    WireMsg,
)
from vtac.channels import assess_channel
from vtac.config import VtacConfig
from vtac.display import compute_numerics


def _to_list(x: np.ndarray) -> list[float | None]:
    arr = np.round(x.astype(np.float64), 3).astype(object)
    arr[~np.isfinite(x)] = None
    return arr.tolist()


class _Sender:
    """Serializes sends: the streamer and the control listener share one socket."""

    def __init__(self, ws: WebSocket) -> None:
        self._ws, self._lock = ws, asyncio.Lock()

    async def __call__(self, msg: WireMsg) -> None:
        async with self._lock:
            await self._ws.send_json(msg.wire())


def _numerics_due(prev_end_s: float | None, end_s: float, every_s: float) -> bool:
    """True for the first chunk and whenever a ``every_s`` boundary was crossed since the last."""
    return prev_end_s is None or math.floor(end_s / every_s) > math.floor(prev_end_s / every_s)


async def _listen(ws: WebSocket, ctl: ReplayControl, send: _Sender) -> None:
    """Apply client control messages until the client disconnects (raises WebSocketDisconnect)."""
    while True:
        try:
            ctrl = ControlIn.model_validate(json.loads(await ws.receive_text()))
        except (ValueError, ValidationError) as e:  # bad JSON or schema -> report, keep streaming
            await send(ErrorMsg(code="bad_control", message=str(e).splitlines()[0][:200]))
            continue
        if ctrl.action == "pause":
            ctl.pause()
        elif ctrl.action == "resume":
            ctl.resume()
        elif ctrl.speed is not None:
            ctl.set_speed(ctrl.speed)
        await send(StateMsg(playing=ctl.playing, speed=ctl.speed))


async def _stream(
    send: _Sender,
    ctl: ReplayControl,
    alarm: Alarm,
    svc: InferenceService,
    *,
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
    present = [i for i, s in enumerate(cfg.channel_slots) if alarm.sources[s]]
    await send(
        SessionMsg(
            alarm_id=alarm.alarm_id,
            patient_id=alarm.patient_id,
            fs={cfg.channel_slots[i]: fs for i in present},
            channels=[cfg.channel_slots[i] for i in present],
            alarm_onset_s=cfg.alarm_onset_s,
            window_end_s=verdict_idx / fs,
            duration_s=n / fs,
            start_s=start_s,
            end_s=end_s,
            speed=ctl.speed,
            model_mode=model_mode,
            synthetic=alarm.synthetic,
        )
    )
    step = max(1, round(chunk_s * fs))
    chunk_s = step / fs  # pace on the real chunk duration
    i0, i1 = round(start_s * fs), min(round(end_s * fs), n)
    verdict_sent = False
    prev_end_s: float | None = None
    for a in range(i0, i1, step):
        b = min(a + step, i1)
        q_lo = max(0, b - cfg.window_samples)
        numerics = None
        if _numerics_due(prev_end_s, b / fs, cfg.numerics_every_s):
            numerics = Numerics(
                **(await asyncio.to_thread(compute_numerics, raw, cfg, b)).to_dict()
            )
        prev_end_s = b / fs
        await send(
            ChunkMsg(
                t0=a / fs,
                channels={cfg.channel_slots[i]: _to_list(raw[i, a:b]) for i in present},
                quality={
                    cfg.channel_slots[i]: assess_channel(raw[i, q_lo:b], cfg).level for i in present
                },
                **({"numerics": numerics} if numerics is not None else {}),
            )
        )
        if not verdict_sent and b >= verdict_idx:
            res = await asyncio.to_thread(svc.infer, raw, verdict_idx, alarm.alarm_id)
            await send(
                VerdictMsg(
                    alarm_id=alarm.alarm_id,
                    t=verdict_idx / fs,
                    p_true=res.p_true,
                    verdict=res.verdict,
                    action=res.action,
                    threshold=res.threshold,
                    latency_ms=res.latency_ms,
                    quality=res.quality,
                    mask=res.mask,
                    ground_truth="true" if alarm.ground_truth else "false",
                    model_mode=res.model_mode,
                    model_version=res.model_version,
                )
            )
            verdict_sent = True
        await ctl.pace(chunk_s)
    await send(EndMsg(alarm_id=alarm.alarm_id))


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
    """Stream ``alarm`` and serve control messages until the replay ends or the client leaves."""
    ctl, send = ReplayControl(speed), _Sender(ws)
    stream = asyncio.create_task(
        _stream(
            send,
            ctl,
            alarm,
            svc,
            start_s=start_s,
            end_s=end_s,
            chunk_s=chunk_s,
            model_mode=model_mode,
        )
    )
    listener = asyncio.create_task(_listen(ws, ctl, send))
    try:
        done, _ = await asyncio.wait({stream, listener}, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()  # re-raise (a client disconnect ends the listener -> WebSocketDisconnect)
    finally:
        for task in (stream, listener):
            task.cancel()
        await asyncio.gather(stream, listener, return_exceptions=True)


__all__ = ["replay", "WebSocketDisconnect"]
