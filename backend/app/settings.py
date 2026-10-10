from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


@dataclass(frozen=True)
class Settings:
    model_mode: str = field(default_factory=lambda: _env("VTAC_MODEL_MODE", "mock"))
    model_dir: Path = field(default_factory=lambda: Path(_env("VTAC_MODEL_DIR", "models")))
    sample_dir: Path = field(default_factory=lambda: Path(_env("VTAC_SAMPLE_DIR", "data/sample")))
    n_synthetic: int = field(default_factory=lambda: int(_env("VTAC_N_SYNTHETIC", "8")))
    cors_origins: tuple[str, ...] = ("http://localhost:5173", "http://127.0.0.1:5173")
    replay_lead_s: float = 30.0  # default start = alarm onset - this
    replay_tail_s: float = 30.0  # default end = alarm onset + this
    chunk_s: float = 0.256  # 64 samples at 250 Hz (~250 ms)
