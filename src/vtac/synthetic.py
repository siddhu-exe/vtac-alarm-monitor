"""Synthetic ECG/PPG/ABP generator for tests and the backend demo (no real data needed).

NOT physiologically validated; it only needs to be plausible enough to exercise the pipeline and
make the dashboard demo-able before the real replay sample exists.
"""

from __future__ import annotations

import numpy as np

from vtac.config import VtacConfig


def _train(beats_s: np.ndarray, template: np.ndarray, n: int, fs: int) -> np.ndarray:
    out = np.zeros(n + len(template), dtype=np.float64)
    for t in beats_s:
        i = int(t * fs)
        if 0 <= i < n:
            out[i : i + len(template)] += template
    return out[:n]


def _beat_times(start: float, stop: float, bpm: float, rng: np.random.Generator) -> np.ndarray:
    rr = 60.0 / bpm
    t = np.arange(start, stop, rr)
    return t + rng.normal(0, 0.01 * rr, t.size)


def make_segment(
    cfg: VtacConfig, is_true: bool, seed: int = 0, missing: tuple[str, ...] = ()
) -> np.ndarray:
    """Slot-ordered raw segment (C, segment_samples) float32; absent slots are all-NaN.

    True alarm: from 25 s before onset the rhythm becomes fast (~190 bpm) with wide QRS and PPG/ABP
    follow it. False alarm: normal ~75 bpm rhythm with a burst of ECG motion artifact around onset
    while the pulsatile channels stay regular.
    """
    rng = np.random.default_rng(seed)
    fs, n = cfg.fs, cfg.segment_samples
    dur, onset = n / fs, cfg.alarm_onset_s
    tt = np.arange(n) / fs
    vt0 = onset - 25.0

    def tmpl(width_s: float, amp: float) -> np.ndarray:
        x = np.arange(-int(4 * width_s * fs), int(4 * width_s * fs))
        return amp * np.exp(-0.5 * (x / (width_s * fs)) ** 2)

    if is_true:
        beats = np.r_[_beat_times(0, vt0, 75, rng), _beat_times(vt0, dur, 190, rng)]
        qrs = _train(_beat_times(0, vt0, 75, rng), tmpl(0.012, 1.0), n, fs) + _train(
            _beat_times(vt0, dur, 190, rng), tmpl(0.035, 1.4), n, fs
        )
    else:
        beats = _beat_times(0, dur, 75, rng)
        qrs = _train(beats, tmpl(0.012, 1.0), n, fs)
    wander = 0.15 * np.sin(2 * np.pi * 0.25 * tt + rng.uniform(0, 6.28))
    ecg1 = qrs + wander + rng.normal(0, 0.02, n)
    ecg2 = 0.7 * qrs - wander + rng.normal(0, 0.02, n)
    if not is_true:
        a, b = int((onset - 8) * fs), int((onset + 4) * fs)
        burst = rng.normal(0, 0.6, b - a) * np.hanning(b - a)
        ecg1[a:b] += burst
        ecg2[a:b] += 0.8 * rng.normal(0, 0.6, b - a) * np.hanning(b - a)

    pulse_t = beats
    if is_true:
        pulse_t = np.r_[_beat_times(0, vt0, 75, rng), _beat_times(vt0, dur, 190, rng)] + 0.2
    ppg = _train(pulse_t, tmpl(0.06, 1.0), n, fs) + rng.normal(0, 0.01, n)
    abp = 80 + 40 * _train(pulse_t, tmpl(0.07, 1.0), n, fs) + rng.normal(0, 0.5, n)
    if is_true:  # pressure drops during VT
        abp[int(vt0 * fs) :] -= 25
    sig = {"ECG_1": ecg1, "ECG_2": ecg2, "PPG": ppg, "ABP": abp}
    out = np.full((cfg.n_slots, n), np.nan, dtype=np.float32)
    for i, slot in enumerate(cfg.channel_slots):
        if slot not in missing:
            out[i] = sig[slot]
    return out
