from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, model_validator

Verdict = Literal["TRUE_ALARM", "FALSE_ALARM"]
Action = Literal["escalated", "suppressed"]
SIM_LABEL = "simulated real-time (replayed recordings)"


class HealthOut(BaseModel):
    status: str
    model_mode: str
    model_version: str | None
    n_alarms: int
    synthetic_data: bool
    sim: bool = True
    label: str = SIM_LABEL


class PatientOut(BaseModel):
    patient_id: str
    alarm_ids: list[str]


class AlarmOut(BaseModel):
    alarm_id: str
    patient_id: str
    channels: list[str]
    duration_s: float
    alarm_onset_s: float
    ground_truth: Literal["true", "false"]
    synthetic: bool


class AlarmDetailOut(AlarmOut):
    fs: int
    sources: dict[str, str | None]
    quality: dict[str, str]


class PredictIn(BaseModel):
    alarm_id: str | None = None
    # raw slot-ordered (C, L) samples; the LAST sample is the window end. null = missing sample.
    signals: list[list[float | None]] | None = None
    mask: list[int] | None = None
    fs: int | None = None

    @model_validator(mode="after")
    def _one_form(self) -> PredictIn:
        if (self.alarm_id is None) == (self.signals is None):
            raise ValueError("provide exactly one of alarm_id or signals")
        if self.signals is not None and self.fs is None:
            raise ValueError("fs is required with signals")
        return self


class PredictOut(BaseModel):
    p_true: float
    verdict: Verdict
    action: Action
    threshold: float
    latency_ms: float
    preprocess_ms: float
    infer_ms: float
    model_mode: str
    model_version: str
    quality: dict[str, str]
    mask: list[int]
