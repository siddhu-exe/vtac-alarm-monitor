"""The ONLY path from raw signals to model input. Used by Colab notebooks and the backend.

Raw -> slot mapping -> quality/mask -> NaN interpolation -> filter (with lead-in) -> trim to the
window -> per-channel z-score. Missing channels are zero-filled with mask 0.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, replace

import numpy as np

from vtac.channels import BAD, Quality, assess_channel, select_slots
from vtac.config import VtacConfig
from vtac.filters import filter_channel, kind_for_slot
from vtac.windows import window_span


@dataclass(frozen=True)
class ProcessedWindow:
    signals: np.ndarray  # (C, T) float32, normalized; zeros where mask == 0
    mask: np.ndarray  # (C,) float32, 1.0 = usable
    quality: dict[str, Quality]
    sources: dict[str, str | None]  # slot -> source channel name

    @property
    def quality_levels(self) -> dict[str, str]:
        return {s: q.level for s, q in self.quality.items()}


def fill_nans(x: np.ndarray) -> np.ndarray:
    isnan = ~np.isfinite(x)
    if not isnan.any():
        return x.astype(np.float64)
    idx = np.arange(x.size)
    return np.interp(idx, idx[~isnan], x[~isnan])  # edges hold the nearest valid value


def preprocess_slots(
    raw: np.ndarray, cfg: VtacConfig, end_idx: int | None = None
) -> ProcessedWindow:
    """``raw``: (C, L) slot-ordered, NaN-preserving; an absent slot is an all-NaN row."""
    if raw.ndim != 2 or raw.shape[0] != cfg.n_slots:
        raise ValueError(f"raw must be (n_slots={cfg.n_slots}, L); got {raw.shape}")
    span = window_span(cfg, raw.shape[1], end_idx)
    out = np.zeros((cfg.n_slots, cfg.window_samples), dtype=np.float32)
    mask = np.zeros(cfg.n_slots, dtype=np.float32)
    quality: dict[str, Quality] = {}
    for i, slot in enumerate(cfg.channel_slots):
        seg = raw[i, span.ctx_start : span.end].astype(np.float64)
        q = assess_channel(seg[span.start - span.ctx_start :], cfg)
        if q.usable:
            y = filter_channel(fill_nans(seg), kind_for_slot(slot), cfg)
            win = y[span.start - span.ctx_start :]
            std = float(win.std())
            if std < cfg.min_std:
                q = replace(q, level=BAD)
            else:
                out[i] = (win - win.mean()) / std
                mask[i] = 1.0
        quality[slot] = q
    return ProcessedWindow(out, mask, quality, {s: None for s in cfg.channel_slots})


def to_slot_array(
    channels: Mapping[str, np.ndarray], cfg: VtacConfig
) -> tuple[np.ndarray, dict[str, str | None]]:
    """Order named channels into the fixed slots; absent slots become all-NaN rows."""
    sources = select_slots(list(channels), cfg)
    length = max((len(v) for v in channels.values()), default=0)
    raw = np.full((cfg.n_slots, length), np.nan, dtype=np.float32)
    for i, slot in enumerate(cfg.channel_slots):
        name = sources[slot]
        if name is not None:
            raw[i, : len(channels[name])] = channels[name]
    return raw, sources


def preprocess_record(
    channels: Mapping[str, np.ndarray], cfg: VtacConfig, end_idx: int | None = None
) -> ProcessedWindow:
    """Named channels (e.g. straight from WFDB) -> model input."""
    raw, sources = to_slot_array(channels, cfg)
    pw = preprocess_slots(raw, cfg, end_idx)
    return replace(pw, sources=sources)
