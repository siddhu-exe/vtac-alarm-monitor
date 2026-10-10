"""Single source of truth for every preprocessing and decision constant.

Values verified against PhysioNet VTaC v1.0 (headers + ML-Health/VTaC benchmark code) are marked
``verified``; the rest are defaults to be confirmed in ``01_data_prep`` (see ``docs/data.md``).
``model_config.json`` written by the CNN notebook is just ``VtacConfig.to_dict()``, so the backend
reads the exact settings the model was trained with.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field, fields, replace
from pathlib import Path
from typing import Any

SLOTS: tuple[str, ...] = ("ECG_1", "ECG_2", "PPG", "ABP")


@dataclass(frozen=True)
class VtacConfig:
    # --- signal layout -------------------------------------------------------------------
    fs: int = 250  # verified: all VTaC signals are 250 Hz
    segment_samples: int = 90_000  # verified from .hea: 6 min (5 min pre + 1 min post alarm)
    alarm_onset_s: float = 300.0  # verified: onset at the 5-minute mark
    channel_slots: tuple[str, ...] = SLOTS

    # --- window (configurable offset; see docs/decisions.md D18/D19) ---------------------
    window_s: float = 10.0
    # Window END relative to alarm onset. 0.0 == the official benchmark window
    # (samples 72500:75000, i.e. the 10 s ending at onset). Default adds a small post-onset margin.
    window_end_offset_s: float = 2.0
    context_s: float = 10.0  # extra lead-in before the window so filters settle; trimmed after

    # --- channel naming (unverified beyond the examples seen: II, aVR, V, PLETH) ---------
    ecg_priority: tuple[str, ...] = ("II", "V", "aVR", "I", "III", "aVL", "aVF", "V1", "MCL1")
    ppg_names: tuple[str, ...] = ("PLETH", "PPG")
    abp_names: tuple[str, ...] = ("ABP", "ART")

    # --- filters (verified from ML-Health/VTaC preprocessing/filtering.py) ---------------
    notch_hz: float = 60.0
    notch_q: float = 30.0
    ecg_highpass_hz: float = 1.0
    ecg_lowpass_hz: float = 30.0
    ecg_order: int = 2
    ppg_band_hz: tuple[float, float] = (0.5, 5.0)
    ppg_order: int = 1
    abp_lowpass_hz: float = 16.0
    abp_order: int = 2

    # --- quality / missing-channel rules (defaults; tune after data verification) --------
    max_nan_frac: float = 0.5  # above this the channel is unusable -> masked out
    degraded_nan_frac: float = 0.05
    max_gap_s: float = 1.0  # NaN gaps longer than this mark the channel "degraded"
    flat_diff_frac: float = 0.9  # fraction of zero-diff samples above which a channel is flat
    degraded_flat_frac: float = 0.3
    min_std: float = 1e-6  # std below this after filtering == flat line

    # --- display numerics (vtac.display; shown next to the waveforms, never fed to the model) --
    numerics_window_s: float = 8.0  # trailing window the HR / pulse rate / ABP numerics use
    numerics_every_s: float = 1.0  # simulated-time interval between numerics updates
    numerics_min_beats: int = 3  # fewer detected beats than this -> numeric is unknown (None)
    numerics_rate_bounds_bpm: tuple[float, float] = (20.0, 300.0)  # outside -> None
    numerics_abp_bounds_mmhg: tuple[float, float] = (10.0, 300.0)  # outside -> None
    numerics_ecg_min_rr_s: float = 0.2  # refractory period (caps ECG rate at 300 bpm)
    numerics_ecg_height_frac: float = 0.5  # QRS peak must exceed this x the 99th pct of |ECG|
    numerics_pulse_min_rr_s: float = 0.25  # refractory period for PPG / ABP (caps rate at 240)
    numerics_pulse_prominence_frac: float = 0.3  # of the channel's 5-95th percentile range
    numerics_pulse_min_autocorr: float = 0.4  # self-similarity one beat later; noise is ~0

    # --- decision threshold (filled by notebook 03_cnn; see docs/modeling.md) ------------
    tpr_target: float = 0.95
    threshold: float = 0.5  # operating point used for verdicts (constrained one when available)
    threshold_constrained: float | None = None  # max Challenge Score s.t. TPR >= tpr_target
    threshold_unconstrained: float | None = None  # max Challenge Score, no constraint

    # --- provenance ----------------------------------------------------------------------
    model_version: str = "unset"
    vtac_git_ref: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    # ------------------------------------------------------------------------------------
    @property
    def n_slots(self) -> int:
        return len(self.channel_slots)

    @property
    def window_samples(self) -> int:
        return round(self.window_s * self.fs)

    @property
    def context_samples(self) -> int:
        return round(self.context_s * self.fs)

    @property
    def window_end_index(self) -> int:
        """Exclusive sample index of the window end, for a full segment."""
        return round((self.alarm_onset_s + self.window_end_offset_s) * self.fs)

    def with_updates(self, **kw: Any) -> VtacConfig:
        return replace(self, **kw)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["input_shape"] = ["N", self.n_slots, self.window_samples]
        return d

    def save(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps(self.to_dict(), indent=2))

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> VtacConfig:
        known = {f.name for f in fields(cls)}
        kw = {k: v for k, v in d.items() if k in known}
        for k, v in kw.items():  # JSON lists -> tuples for tuple-typed fields
            if isinstance(v, list):
                kw[k] = tuple(v)
        return cls(**kw)


def load_config(path: str | Path | None = None) -> VtacConfig:
    """Load ``model_config.json`` if given, else defaults."""
    if path is None:
        return VtacConfig()
    return VtacConfig.from_dict(json.loads(Path(path).read_text()))
