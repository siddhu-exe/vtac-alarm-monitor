"""WebSocket message models (contract: docs/architecture.md). The frontend mirrors these in Zod.

``wire()`` serializes a message: every field is sent, except a message's declared ``omit_if_none``
fields (``numerics`` between updates, ``attribution`` until checkpoint 2), which are left out when
``None``. A ``None`` nested inside a sent object (e.g. an unmeasurable ``hr_bpm``) stays ``null``.
"""

from __future__ import annotations

from typing import Any, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, model_validator

from backend.app.schemas import SIM_LABEL, Action, Verdict

QualityLevel = Literal["good", "degraded", "bad", "absent"]
MAX_SPEED = 20.0


class WireMsg(BaseModel):
    model_config = ConfigDict(extra="forbid")

    omit_if_none: ClassVar[tuple[str, ...]] = ()

    def wire(self) -> dict[str, Any]:
        out = self.model_dump(mode="json")
        for name in self.omit_if_none:
            if out.get(name) is None:
                out.pop(name, None)
        return out


class SessionMsg(WireMsg):
    type: Literal["session"] = "session"
    alarm_id: str
    patient_id: str
    fs: dict[str, int]
    channels: list[str]
    alarm_onset_s: float
    window_end_s: float
    duration_s: float
    start_s: float
    end_s: float
    speed: float
    model_mode: str
    synthetic: bool
    sim: Literal[True] = True
    label: str = SIM_LABEL


class Numerics(WireMsg):
    """Display-only readouts from ``vtac.display``; ``None`` = not measurable right now."""

    hr_bpm: float | None
    pr_bpm: float | None
    abp_sys: float | None
    abp_dia: float | None
    abp_map: float | None


class ChunkMsg(WireMsg):
    type: Literal["chunk"] = "chunk"
    t0: float
    channels: dict[str, list[float | None]]
    quality: dict[str, QualityLevel]
    numerics: Numerics | None = None  # sent about once per ``cfg.numerics_every_s``
    omit_if_none = ("numerics",)


class Attribution(WireMsg):
    """Per-channel importance over the model input window (checkpoint 2, Grad-CAM).

    ``per_channel[slot]`` has one value in [0, 1] per equal time bin spanning the model input window
    ``[t - window_s, t]`` (``t`` = the verdict's window end); all slots share one bin count.
    ``channel_share`` sums to 1 over the slots the model used. Not populated in checkpoint 1.
    """

    method: str
    per_channel: dict[str, list[float]]
    channel_share: dict[str, float]

    @model_validator(mode="after")
    def _consistent(self) -> Attribution:
        lengths = {len(v) for v in self.per_channel.values()}
        if len(lengths) > 1:
            raise ValueError("per_channel arrays must all have the same number of bins")
        if any(not 0.0 <= x <= 1.0 for v in self.per_channel.values() for x in v):
            raise ValueError("per_channel values must be in [0, 1]")
        if any(not 0.0 <= x <= 1.0 for x in self.channel_share.values()):
            raise ValueError("channel_share values must be in [0, 1]")
        return self


class VerdictMsg(WireMsg):
    type: Literal["verdict"] = "verdict"
    alarm_id: str
    t: float
    p_true: float
    verdict: Verdict
    action: Action
    threshold: float
    latency_ms: float
    quality: dict[str, QualityLevel]
    mask: list[int]
    ground_truth: Literal["true", "false"]
    model_mode: str
    model_version: str
    attribution: Attribution | None = None
    omit_if_none = ("attribution",)


class EndMsg(WireMsg):
    type: Literal["end"] = "end"
    alarm_id: str


class ErrorMsg(WireMsg):
    type: Literal["error"] = "error"
    code: str
    message: str


class StateMsg(WireMsg):
    """Acknowledges a control message: the replay's current transport state."""

    type: Literal["state"] = "state"
    playing: bool
    speed: float


class ControlIn(BaseModel):
    """Client -> server. ``speed`` is required for (and only valid with) ``action == "speed"``."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["control"]
    action: Literal["pause", "resume", "speed"]
    speed: float | None = None

    @model_validator(mode="after")
    def _speed_rules(self) -> ControlIn:
        if (self.action == "speed") != (self.speed is not None):
            raise ValueError("speed is required with action 'speed' and not allowed otherwise")
        if self.speed is not None and not 0 < self.speed <= MAX_SPEED:
            raise ValueError(f"speed must satisfy 0 < speed <= {MAX_SPEED:g}")
        return self
