"""WFDB / CSV loading. Heavy deps (wfdb, pandas) are imported lazily; Colab / data-prep only."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from vtac.config import VtacConfig


def load_segment(stem: str | Path, cfg: VtacConfig) -> dict[str, np.ndarray]:
    """Read one VTaC event (path WITHOUT extension) -> {channel name: float32 array, NaN = invalid}.

    Channel names come from the header, never hardcoded. Raises if fs/length disagree with cfg so
    schema surprises surface in data prep instead of silently corrupting windows.
    """
    import wfdb

    rec = wfdb.rdrecord(str(stem))
    if round(rec.fs) != cfg.fs:
        raise ValueError(f"{stem}: fs={rec.fs}, expected {cfg.fs}")
    if rec.sig_len != cfg.segment_samples:
        raise ValueError(f"{stem}: {rec.sig_len} samples, expected {cfg.segment_samples}")
    out: dict[str, np.ndarray] = {}
    for i, name in enumerate(rec.sig_name):
        key = name if name not in out else f"{name}_{i}"
        out[key] = rec.p_signal[:, i].astype(np.float32)  # wfdb maps invalid ADC values to NaN
    return out


def load_labels(path: str | Path) -> Any:
    """event_labels.csv (record, event, decision) -> DataFrame with int ``y`` (1 = true alarm)."""
    import pandas as pd

    df = pd.read_csv(path)
    _require(df, {"record", "event", "decision"}, path)
    df["y"] = df["decision"].astype(str).str.strip().str.lower().eq("true").astype("int8")
    return df


def load_split(path: str | Path) -> Any:
    """benchmark_data_split.csv (split, record, event). ``record`` is the patient-level unit."""
    import pandas as pd

    df = pd.read_csv(path)
    _require(df, {"split", "record", "event"}, path)
    return df


def _require(df: Any, cols: set[str], path: str | Path) -> None:
    missing = cols - set(df.columns)
    if missing:
        raise ValueError(f"{path}: missing columns {sorted(missing)}; found {list(df.columns)}")
