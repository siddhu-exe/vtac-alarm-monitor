"""Hand-crafted features for the XGBoost baseline (scipy/numpy only, so it is testable anywhere).

Operates on the SAME preprocessed ``(signals, mask)`` the CNN sees. Features of missing channels
are NaN (XGBoost handles NaN natively) plus a presence flag. neurokit2 HRV/QRS features are layered
on top inside ``02_baseline`` on Colab, where they can be exercised against real data.
"""

from __future__ import annotations

import numpy as np
from scipy import signal as sps
from scipy.stats import kurtosis

from vtac.config import VtacConfig

_PER_CHANNEL = ("rate_bpm", "rr_cv", "n_peaks", "amp_mean", "amp_cv", "hf_ratio", "kurtosis")


def feature_names(cfg: VtacConfig) -> list[str]:
    names = [f"{s}_present" for s in cfg.channel_slots]
    names += [f"{s}_{f}" for s in cfg.channel_slots for f in _PER_CHANNEL]
    names += ["rate_diff_ecg_ppg", "rate_diff_ecg_abp", "rate_diff_ecg1_ecg2"]
    return names


def detect_peaks(x: np.ndarray, fs: int, ecg: bool) -> np.ndarray:
    ref = np.abs(x) if ecg else x
    dist = int(0.2 * fs)  # refractory period; caps detectable rate at ~300 bpm
    height = np.quantile(ref, 0.90) * (0.5 if ecg else 0.3)
    idx, _ = sps.find_peaks(ref, distance=dist, height=height)
    return idx


def _channel_features(x: np.ndarray, ecg: bool, fs: int) -> dict[str, float]:
    idx = detect_peaks(x, fs, ecg)
    f = dict.fromkeys(_PER_CHANNEL, np.nan)
    f["n_peaks"] = float(len(idx))
    if len(idx) >= 3:
        rr = np.diff(idx) / fs
        f["rate_bpm"] = float(60.0 / np.median(rr))
        f["rr_cv"] = float(rr.std() / rr.mean())
        amp = x[idx]
        f["amp_mean"] = float(np.abs(amp).mean())
        f["amp_cv"] = float(amp.std() / (np.abs(amp).mean() + 1e-9))
    freqs, psd = sps.welch(x, fs=fs, nperseg=min(len(x), 2 * fs))
    f["hf_ratio"] = float(psd[freqs >= 20].sum() / (psd.sum() + 1e-12))  # noise proxy
    f["kurtosis"] = float(kurtosis(x))
    return f


def extract_features(signals: np.ndarray, mask: np.ndarray, cfg: VtacConfig) -> dict[str, float]:
    """signals (C,T) preprocessed, mask (C,) -> ordered feature dict (see ``feature_names``)."""
    feats: dict[str, float] = {
        f"{s}_present": float(mask[i]) for i, s in enumerate(cfg.channel_slots)
    }
    rate: dict[str, float] = {}
    for i, slot in enumerate(cfg.channel_slots):
        if mask[i] > 0:
            ch = _channel_features(signals[i], slot.startswith("ECG"), cfg.fs)
        else:
            ch = dict.fromkeys(_PER_CHANNEL, np.nan)
        rate[slot] = ch["rate_bpm"]
        feats.update({f"{slot}_{k}": v for k, v in ch.items()})
    feats["rate_diff_ecg_ppg"] = abs(rate["ECG_1"] - rate["PPG"])
    feats["rate_diff_ecg_abp"] = abs(rate["ECG_1"] - rate["ABP"])
    feats["rate_diff_ecg1_ecg2"] = abs(rate["ECG_1"] - rate["ECG_2"])
    return {k: feats[k] for k in feature_names(cfg)}
