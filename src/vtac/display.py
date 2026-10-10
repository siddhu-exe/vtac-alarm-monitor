"""Bedside-style numerics for the dashboard readouts (HR, pulse rate, ABP sys/dia/MAP).

Display only: these numbers are never fed to the model. They live here, not in the backend or the
frontend, so that peak detection and filtering stay in one place (CLAUDE.md "Preprocessing rule").
Every numeric is ``None`` when its channel is absent/unusable or too few beats were detected; we
never report a number we cannot support.

Pulse rate (PLETH) next to heart rate (ECG) matters clinically: in a true VT the ECG rate is fast
while the pulse collapses or disappears; in a false alarm the pulse stays regular.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
from scipy import signal as sps

from vtac.channels import assess_channel
from vtac.config import VtacConfig
from vtac.filters import filter_channel, kind_for_slot
from vtac.preprocess import fill_nans

_FILTER_LEAD_IN_S = 2.0  # extra samples before the window so the zero-phase filter settles


@dataclass(frozen=True)
class Numerics:
    hr_bpm: float | None  # from the first usable ECG slot
    pr_bpm: float | None  # pulse rate from PPG
    abp_sys: float | None
    abp_dia: float | None
    abp_map: float | None  # dia + (sys - dia) / 3

    def to_dict(self) -> dict[str, float | None]:
        return asdict(self)


def _filtered_tail(raw: np.ndarray, slot_idx: int, end: int, cfg: VtacConfig) -> np.ndarray | None:
    """Filtered trailing window of one slot, or None if the channel is unusable there."""
    n_win = round(cfg.numerics_window_s * cfg.fs)
    lead = round(_FILTER_LEAD_IN_S * cfg.fs)
    seg = raw[slot_idx, max(0, end - n_win - lead) : end].astype(np.float64)
    if seg.size < n_win // 2 or not assess_channel(seg[-n_win:], cfg).usable:
        return None
    y = filter_channel(fill_nans(seg), kind_for_slot(cfg.channel_slots[slot_idx]), cfg)
    return y[-n_win:]


def _ecg_beats(x: np.ndarray, cfg: VtacConfig) -> np.ndarray:
    ref = np.abs(x)
    height = cfg.numerics_ecg_height_frac * np.quantile(ref, 0.99)
    idx, _ = sps.find_peaks(ref, distance=round(cfg.numerics_ecg_min_rr_s * cfg.fs), height=height)
    return idx


def _beat_autocorr(x: np.ndarray, beat_samples: float) -> float:
    """Peak normalised autocorrelation within +-10% of one beat interval (about 1 for a pulse)."""
    x = x - x.mean()
    energy = float(x @ x)
    if energy == 0.0:
        return 0.0
    lags = range(max(1, int(0.9 * beat_samples)), min(len(x) - 1, int(1.1 * beat_samples)) + 1)
    return max(float(x[:-k] @ x[k:]) / energy for k in lags)


def _pulse_beats(x: np.ndarray, cfg: VtacConfig) -> np.ndarray:
    """Pulse peaks (PPG / ABP). Empty unless the signal is periodic (a collapsed pulse is noise)."""
    lo, hi = np.quantile(x, [0.05, 0.95])
    idx, _ = sps.find_peaks(
        x,
        distance=round(cfg.numerics_pulse_min_rr_s * cfg.fs),
        prominence=cfg.numerics_pulse_prominence_frac * (hi - lo),
    )
    if len(idx) < cfg.numerics_min_beats:
        return idx
    if _beat_autocorr(x, float(np.median(np.diff(idx)))) < cfg.numerics_pulse_min_autocorr:
        return idx[:0]
    return idx


def _rate_bpm(peaks: np.ndarray, cfg: VtacConfig) -> float | None:
    if len(peaks) < cfg.numerics_min_beats:
        return None
    bpm = float(60.0 / np.median(np.diff(peaks) / cfg.fs))
    lo, hi = cfg.numerics_rate_bounds_bpm
    return round(bpm, 1) if lo <= bpm <= hi else None


def _abp_levels(
    abp: np.ndarray, cfg: VtacConfig
) -> tuple[float | None, float | None, float | None]:
    peaks = _pulse_beats(abp, cfg)
    if len(peaks) < cfg.numerics_min_beats:
        return None, None, None
    sys_ = float(np.median(abp[peaks]))
    dia = float(np.median([abp[a:b].min() for a, b in zip(peaks[:-1], peaks[1:], strict=True)]))
    lo, hi = cfg.numerics_abp_bounds_mmhg
    if not (lo <= dia < sys_ <= hi):
        return None, None, None
    return round(sys_, 1), round(dia, 1), round(dia + (sys_ - dia) / 3.0, 1)


def compute_numerics(raw: np.ndarray, cfg: VtacConfig, end_idx: int | None = None) -> Numerics:
    """Numerics from the trailing ``cfg.numerics_window_s`` of slot-ordered raw ``(C, L)``.

    Uses only samples before ``end_idx`` (exclusive; default = end of ``raw``), so it can be called
    mid-replay without looking ahead.
    """
    if raw.ndim != 2 or raw.shape[0] != cfg.n_slots:
        raise ValueError(f"raw must be (n_slots={cfg.n_slots}, L); got {raw.shape}")
    end = raw.shape[1] if end_idx is None else min(end_idx, raw.shape[1])
    slot = {s: i for i, s in enumerate(cfg.channel_slots)}

    hr = None
    for name in (s for s in cfg.channel_slots if s.startswith("ECG")):
        ecg = _filtered_tail(raw, slot[name], end, cfg)
        if ecg is not None:
            hr = _rate_bpm(_ecg_beats(ecg, cfg), cfg)
            break
    ppg = _filtered_tail(raw, slot["PPG"], end, cfg) if "PPG" in slot else None
    pr = _rate_bpm(_pulse_beats(ppg, cfg), cfg) if ppg is not None else None
    abp = _filtered_tail(raw, slot["ABP"], end, cfg) if "ABP" in slot else None
    sys_, dia, mean = _abp_levels(abp, cfg) if abp is not None else (None, None, None)
    return Numerics(hr_bpm=hr, pr_bpm=pr, abp_sys=sys_, abp_dia=dia, abp_map=mean)
