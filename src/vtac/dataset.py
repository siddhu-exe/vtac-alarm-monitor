"""Read/write the .npz artifacts that travel Colab -> Drive -> laptop (docs/architecture.md)."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from vtac.config import VtacConfig


def save_windows(
    path: str | Path,
    signals: np.ndarray,
    mask: np.ndarray,
    y: np.ndarray,
    split: np.ndarray,
    event_id: np.ndarray,
    patient_id: np.ndarray,
    cfg: VtacConfig,
) -> None:
    """Preprocessed model inputs: signals (N,C,T) f32, mask (N,C) f32, y (N,), ids/split (N,)."""
    n = len(y)
    assert signals.shape[0] == mask.shape[0] == n == len(split) == len(event_id) == len(patient_id)
    np.savez_compressed(
        path,
        signals=signals.astype(np.float32),
        mask=mask.astype(np.float32),
        y=np.asarray(y, dtype=np.int8),
        split=np.asarray(split, dtype=str),
        event_id=np.asarray(event_id, dtype=str),
        patient_id=np.asarray(patient_id, dtype=str),
        config_json=json.dumps(cfg.to_dict()),
    )


def load_windows(path: str | Path) -> dict[str, np.ndarray]:
    with np.load(path, allow_pickle=False) as z:
        return {k: z[k] for k in z.files}


def save_replay(
    path: str | Path,
    raw: np.ndarray,
    y: np.ndarray,
    event_id: np.ndarray,
    patient_id: np.ndarray,
    sources: list[dict[str, str | None]],
    cfg: VtacConfig,
) -> None:
    """Replay sample: slot-ordered RAW segments (N,C,L) with NaN for absent slots.

    ``path`` is the .npz; a sibling ``replay_index.json`` holds per-alarm metadata.
    """
    path = Path(path)
    np.savez_compressed(
        path,
        raw=raw.astype(np.float32),
        y=np.asarray(y, dtype=np.int8),
        event_id=np.asarray(event_id, dtype=str),
        patient_id=np.asarray(patient_id, dtype=str),
    )
    index = [
        {"alarm_id": str(e), "patient_id": str(p), "ground_truth": bool(t), "sources": s}
        for e, p, t, s in zip(event_id, patient_id, y, sources, strict=True)
    ]
    path.with_name("replay_index.json").write_text(
        json.dumps({"config": cfg.to_dict(), "alarms": index}, indent=2)
    )


def load_replay(path: str | Path) -> tuple[dict[str, np.ndarray], dict]:
    path = Path(path)
    with np.load(path, allow_pickle=False) as z:
        arrays = {k: z[k] for k in z.files}
    index = json.loads(path.with_name("replay_index.json").read_text())
    return arrays, index
