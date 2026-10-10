import numpy as np

from vtac.filters import filter_channel


def _gain(f_hz: float, kind: str, cfg) -> float:
    t = np.arange(0, 20, 1 / cfg.fs)
    x = np.sin(2 * np.pi * f_hz * t)
    y = filter_channel(x, kind, cfg)
    mid = slice(len(t) // 4, 3 * len(t) // 4)
    return float(np.abs(y[mid]).max())


def test_ecg_band(cfg):
    assert _gain(10, "ecg", cfg) > 0.8
    assert _gain(0.1, "ecg", cfg) < 0.1
    assert _gain(60, "ecg", cfg) < 0.05  # notch
    assert _gain(100, "ecg", cfg) < 0.05


def test_ppg_and_abp(cfg):
    assert _gain(1.5, "ppg", cfg) > 0.6  # zero-phase doubles the order-1 band-pass roll-off
    assert _gain(0.05, "ppg", cfg) < 0.1
    assert _gain(2, "abp", cfg) > 0.9
    assert _gain(60, "abp", cfg) < 0.05
