"""FastAPI app. Run: ``uvicorn backend.app.main:app --reload`` (VTAC_MODEL_MODE=mock by default)."""

from __future__ import annotations

import logging

import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from backend.app.latency import LatencyTracker
from backend.app.model import build_predictor
from backend.app.replay import replay
from backend.app.schemas import (
    SIM_LABEL,
    AlarmDetailOut,
    AlarmOut,
    HealthOut,
    PatientOut,
    PredictIn,
    PredictOut,
)
from backend.app.service import InferenceService
from backend.app.settings import Settings
from backend.app.store import Alarm, AlarmStore
from vtac.preprocess import preprocess_slots

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    store = AlarmStore.load(settings)
    predictor = build_predictor(settings, store.cfg)
    tracker = LatencyTracker()
    svc = InferenceService(store.cfg, predictor, tracker) if predictor else None

    app = FastAPI(title="ICU VT false-alarm reduction", description=SIM_LABEL, version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def need_svc() -> InferenceService:
        if svc is None:
            raise HTTPException(503, "model not loaded; set VTAC_MODEL_MODE=mock")
        return svc

    def alarm_out(a: Alarm) -> dict:
        return dict(
            alarm_id=a.alarm_id,
            patient_id=a.patient_id,
            channels=a.channels,
            duration_s=store.cfg.segment_samples / store.cfg.fs,
            alarm_onset_s=store.cfg.alarm_onset_s,
            ground_truth="true" if a.ground_truth else "false",
            synthetic=a.synthetic,
        )

    @app.get("/health", response_model=HealthOut)
    def health() -> HealthOut:
        return HealthOut(
            status="ok" if svc else "degraded",
            model_mode=settings.model_mode,
            model_version=predictor.version if predictor else None,
            n_alarms=len(store),
            synthetic_data=store.synthetic,
        )

    @app.get("/patients", response_model=list[PatientOut])
    def patients() -> list[PatientOut]:
        return [PatientOut(patient_id=p, alarm_ids=ids) for p, ids in store.patients().items()]

    @app.get("/alarms", response_model=list[AlarmOut])
    def alarms(patient_id: str | None = None) -> list[dict]:
        return [alarm_out(a) for a in store.all() if patient_id in (None, a.patient_id)]

    @app.get("/alarms/{alarm_id}", response_model=AlarmDetailOut)
    def alarm_detail(alarm_id: str) -> dict:
        a = store.get(alarm_id)
        if a is None:
            raise HTTPException(404, f"unknown alarm {alarm_id}")
        pw = preprocess_slots(a.raw(), store.cfg)
        return {
            **alarm_out(a),
            "fs": store.cfg.fs,
            "sources": a.sources,
            "quality": pw.quality_levels,
        }

    @app.post("/predict", response_model=PredictOut)
    def predict(req: PredictIn) -> dict:
        s = need_svc()
        cfg = store.cfg
        if req.alarm_id is not None:
            a = store.get(req.alarm_id)
            if a is None:
                raise HTTPException(404, f"unknown alarm {req.alarm_id}")
            res = s.infer(a.raw(), None, a.alarm_id)
        else:
            if req.fs != cfg.fs:
                raise HTTPException(422, f"fs must be {cfg.fs}")
            raw = np.array(
                [[np.nan if v is None else v for v in row] for row in req.signals or []],
                dtype=np.float32,
            )
            if raw.ndim != 2 or raw.shape[0] != cfg.n_slots or raw.shape[1] < cfg.window_samples:
                raise HTTPException(
                    422,
                    f"signals must be ({cfg.n_slots}, L>={cfg.window_samples}); got {raw.shape}",
                )
            if req.mask is not None:
                if len(req.mask) != cfg.n_slots:
                    raise HTTPException(422, f"mask must have {cfg.n_slots} entries")
                raw[[i for i, m in enumerate(req.mask) if not m]] = np.nan
            res = s.infer(raw, raw.shape[1], "adhoc")
        return res.__dict__

    @app.get("/metrics")
    def metrics() -> dict:
        return {**tracker.summary(), "model_mode": settings.model_mode, "sim": True}

    @app.websocket("/ws/replay/{alarm_id}")
    async def ws_replay(
        ws: WebSocket,
        alarm_id: str,
        speed: float = 1.0,
        start_s: float | None = None,
        end_s: float | None = None,
    ) -> None:
        await ws.accept()
        cfg = store.cfg
        a = store.get(alarm_id)
        if a is None or svc is None:
            code, msg = (
                ("not_found", f"unknown alarm {alarm_id}")
                if a is None
                else ("model_unavailable", "model not loaded")
            )
            await ws.send_json({"type": "error", "code": code, "message": msg})
            await ws.close(code=4404 if a is None else 4503)
            return
        vend = cfg.window_end_index / cfg.fs
        start = cfg.alarm_onset_s - settings.replay_lead_s if start_s is None else start_s
        end = vend + settings.replay_tail_s if end_s is None else end_s
        if not (0 < speed <= 20) or not (0 <= start <= cfg.alarm_onset_s) or end <= vend:
            await ws.send_json(
                {
                    "type": "error",
                    "code": "bad_params",
                    "message": f"need 0<speed<=20, 0<=start_s<=onset, end_s>{vend}",
                }
            )
            await ws.close(code=4400)
            return
        try:
            await replay(
                ws,
                a,
                svc,
                speed=speed,
                start_s=start,
                end_s=end,
                chunk_s=settings.chunk_s,
                model_mode=predictor.mode,
            )
            await ws.close()
        except WebSocketDisconnect:
            pass

    return app


app = create_app()
