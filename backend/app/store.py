"""Alarm store: the real ~25-alarm replay sample, else lazily generated synthetic alarms."""

from __future__ import annotations

import functools
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from backend.app.settings import Settings
from vtac.config import VtacConfig, load_config
from vtac.dataset import load_replay
from vtac.synthetic import make_segment

# (is_true, slots missing) cycled for synthetic demo alarms
_SYNTH_SPECS = [
    (True, ()),
    (False, ()),
    (False, ("ABP",)),
    (True, ("PPG",)),
    (False, ()),
    (False, ("ECG_2",)),
    (False, ("ABP",)),
    (True, ()),
]


@dataclass
class Alarm:
    alarm_id: str
    patient_id: str
    ground_truth: bool
    sources: dict[str, str | None]
    synthetic: bool
    _raw: np.ndarray | None = field(default=None, repr=False)
    _make: object = field(default=None, repr=False)

    def raw(self) -> np.ndarray:
        """Slot-ordered raw segment (C, L) with NaN for absent slots."""
        if self._raw is not None:
            return self._raw
        return self._make()  # type: ignore[operator]

    @property
    def channels(self) -> list[str]:
        return [s for s, src in self.sources.items() if src is not None]


class AlarmStore:
    def __init__(self, cfg: VtacConfig, alarms: list[Alarm], synthetic: bool) -> None:
        self.cfg = cfg
        self.synthetic = synthetic
        self._alarms = {a.alarm_id: a for a in alarms}

    def get(self, alarm_id: str) -> Alarm | None:
        return self._alarms.get(alarm_id)

    def all(self) -> list[Alarm]:
        return list(self._alarms.values())

    def patients(self) -> dict[str, list[str]]:
        out: dict[str, list[str]] = {}
        for a in self._alarms.values():
            out.setdefault(a.patient_id, []).append(a.alarm_id)
        return out

    def __len__(self) -> int:
        return len(self._alarms)

    # ------------------------------------------------------------------------------------
    @classmethod
    def load(cls, settings: Settings) -> AlarmStore:
        cfg_path = Path(settings.model_dir) / "model_config.json"
        cfg = load_config(cfg_path if cfg_path.exists() else None)
        npz = Path(settings.sample_dir) / "replay_sample.npz"
        if npz.exists():
            return cls._from_replay(npz, cfg)
        return cls._synthetic(cfg, settings.n_synthetic)

    @classmethod
    def _from_replay(cls, npz: Path, cfg: VtacConfig) -> AlarmStore:
        arrays, index = load_replay(npz)
        alarms = [
            Alarm(
                m["alarm_id"],
                m["patient_id"],
                bool(m["ground_truth"]),
                m["sources"],
                False,
                _raw=arrays["raw"][i],
            )
            for i, m in enumerate(index["alarms"])
        ]
        return cls(cfg, alarms, synthetic=False)

    @classmethod
    def _synthetic(cls, cfg: VtacConfig, n: int) -> AlarmStore:
        alarms = []
        for i in range(n):
            is_true, missing = _SYNTH_SPECS[i % len(_SYNTH_SPECS)]
            sources = {s: (None if s in missing else s) for s in cfg.channel_slots}
            make = functools.lru_cache(maxsize=2)(
                functools.partial(make_segment, cfg, is_true, 1000 + i, tuple(missing))
            )
            alarms.append(
                Alarm(
                    f"syn_{i + 1:04d}", f"syn_p{i // 2 + 1:02d}", is_true, sources, True, _make=make
                )
            )
        return cls(cfg, alarms, synthetic=True)
