"""Channel -> slot mapping, per-channel quality assessment and the missing-channel mask.

Rules (see docs/data.md "Missing-channel rule"):
- Fixed slots ``[ECG_1, ECG_2, PPG, ABP]``.
- A slot is missing (mask 0, signal zeros) if no source channel exists OR the channel is unusable
  (NaN fraction above ``max_nan_frac``, flat line). Missing channels are never imputed from others.
- Quality levels: ``absent`` < ``bad`` < ``degraded`` < ``good``. Only structural problems (NaN,
  flat, long gaps) are judged here; noise level is a model feature, not a masking criterion,
  because noisy ECG is exactly what distinguishes many false alarms.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from vtac.config import VtacConfig

ABSENT, BAD, DEGRADED, GOOD = "absent", "bad", "degraded", "good"


def select_slots(available: Sequence[str], cfg: VtacConfig) -> dict[str, str | None]:
    """Map each slot to a source channel name (or None). Case-insensitive, deterministic."""
    by_lower = {n.lower(): n for n in available}
    ppg_l = {n.lower() for n in cfg.ppg_names}
    abp_l = {n.lower() for n in cfg.abp_names}

    def first(names: Sequence[str]) -> str | None:
        for n in names:
            if n.lower() in by_lower:
                return by_lower[n.lower()]
        return None

    ecg = [by_lower[p.lower()] for p in cfg.ecg_priority if p.lower() in by_lower]
    # Fallback: any remaining non-pulsatile channel, in header order.
    rest = [n for n in available if n not in ecg and n.lower() not in ppg_l | abp_l]
    ecg += rest
    out: dict[str, str | None] = {s: None for s in cfg.channel_slots}
    for slot, name in zip(("ECG_1", "ECG_2"), ecg, strict=False):
        out[slot] = name
    out["PPG"] = first(cfg.ppg_names)
    out["ABP"] = first(cfg.abp_names)
    return {s: out.get(s) for s in cfg.channel_slots}


@dataclass(frozen=True)
class Quality:
    level: str  # absent | bad | degraded | good
    nan_frac: float = 0.0
    flat_frac: float = 0.0
    max_gap_s: float = 0.0

    @property
    def usable(self) -> bool:
        return self.level in (GOOD, DEGRADED)


def _max_nan_run(isnan: np.ndarray) -> int:
    if not isnan.any():
        return 0
    padded = np.concatenate([[0], isnan.astype(np.int8), [0]])
    edges = np.flatnonzero(np.diff(padded))
    return int((edges[1::2] - edges[0::2]).max())


def assess_channel(x: np.ndarray | None, cfg: VtacConfig) -> Quality:
    """Judge a RAW (pre-filter, NaN-preserving) 1-D window."""
    if x is None or x.size == 0:
        return Quality(ABSENT)
    isnan = ~np.isfinite(x)
    nan_frac = float(isnan.mean())
    if nan_frac >= 1.0:
        return Quality(ABSENT, nan_frac=1.0)
    good = x[~isnan]
    # flatness: share of consecutive-sample pairs with zero change (also catches all-zero fill)
    flat_frac = float((np.diff(good) == 0).mean()) if good.size > 1 else 1.0
    gap_s = _max_nan_run(isnan) / cfg.fs
    if nan_frac > cfg.max_nan_frac or flat_frac >= cfg.flat_diff_frac or float(good.std()) == 0.0:
        return Quality(BAD, nan_frac, flat_frac, gap_s)
    if (
        nan_frac > cfg.degraded_nan_frac
        or gap_s > cfg.max_gap_s
        or flat_frac > cfg.degraded_flat_frac
    ):
        return Quality(DEGRADED, nan_frac, flat_frac, gap_s)
    return Quality(GOOD, nan_frac, flat_frac, gap_s)
