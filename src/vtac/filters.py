"""Per-modality filtering. Mirrors the VTaC benchmark (ML-Health/VTaC preprocessing/filtering.py):

- ECG: 60 Hz notch, 1 Hz high-pass, 30 Hz low-pass (2nd order)
- PPG: 60 Hz notch, 0.5-5 Hz band-pass (1st order)
- ABP: 60 Hz notch, 16 Hz low-pass (2nd order)

Zero-phase (``sosfiltfilt``) is used so waveform morphology is not shifted.
"""

from __future__ import annotations

import numpy as np
from scipy import signal

from vtac.config import VtacConfig

KINDS = ("ecg", "ppg", "abp")


def _notch_sos(cfg: VtacConfig) -> np.ndarray:
    b, a = signal.iirnotch(cfg.notch_hz, cfg.notch_q, fs=cfg.fs)
    return signal.tf2sos(b, a)


def design(kind: str, cfg: VtacConfig) -> np.ndarray:
    """Second-order-sections cascade (notch + modality filter) for ``kind``."""
    if kind == "ecg":
        hp = signal.butter(cfg.ecg_order, cfg.ecg_highpass_hz, "highpass", fs=cfg.fs, output="sos")
        lp = signal.butter(cfg.ecg_order, cfg.ecg_lowpass_hz, "lowpass", fs=cfg.fs, output="sos")
        return np.vstack([_notch_sos(cfg), hp, lp])
    if kind == "ppg":
        bp = signal.butter(cfg.ppg_order, cfg.ppg_band_hz, "bandpass", fs=cfg.fs, output="sos")
        return np.vstack([_notch_sos(cfg), bp])
    if kind == "abp":
        lp = signal.butter(cfg.abp_order, cfg.abp_lowpass_hz, "lowpass", fs=cfg.fs, output="sos")
        return np.vstack([_notch_sos(cfg), lp])
    raise ValueError(f"unknown filter kind {kind!r}; expected one of {KINDS}")


def kind_for_slot(slot: str) -> str:
    if slot.startswith("ECG"):
        return "ecg"
    if slot == "PPG":
        return "ppg"
    if slot == "ABP":
        return "abp"
    raise ValueError(f"cannot infer filter kind for slot {slot!r}")


def filter_channel(x: np.ndarray, kind: str, cfg: VtacConfig) -> np.ndarray:
    """Zero-phase filter a NaN-free 1-D signal. Returns float32 of the same length."""
    sos = design(kind, cfg)
    # sosfiltfilt needs len(x) > padlen; fall back to forward filtering for tiny inputs.
    padlen = 3 * (2 * len(sos) + 1)
    if len(x) > padlen:
        y = signal.sosfiltfilt(sos, x.astype(np.float64))
    else:
        y = signal.sosfilt(sos, x.astype(np.float64))
    return y.astype(np.float32)
