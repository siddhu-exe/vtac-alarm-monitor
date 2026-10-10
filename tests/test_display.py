import numpy as np
import pytest

from vtac.display import compute_numerics
from vtac.synthetic import make_segment


def _idx(cfg, t_s: float) -> int:
    return round(t_s * cfg.fs)


def test_normal_rhythm_numerics(cfg, seg_false):
    n = compute_numerics(seg_false, cfg, _idx(cfg, 200.0))  # well before the artifact burst
    assert n.hr_bpm is not None and 65 < n.hr_bpm < 85
    assert n.pr_bpm is not None and 65 < n.pr_bpm < 85
    assert n.abp_sys is not None and 105 < n.abp_sys < 135
    assert n.abp_dia is not None and 70 < n.abp_dia < 90
    assert n.abp_dia < n.abp_map < n.abp_sys


def test_vt_numerics_show_fast_ecg_rate(cfg, seg_true):
    n = compute_numerics(seg_true, cfg, cfg.window_end_index)
    assert n.hr_bpm is not None and 150 < n.hr_bpm < 230
    assert n.abp_sys is not None  # synthetic pressure drops but stays measurable


def test_missing_channels_give_none(cfg):
    seg = make_segment(cfg, False, 3, missing=("PPG", "ABP"))
    n = compute_numerics(seg, cfg, _idx(cfg, 200.0))
    assert n.hr_bpm is not None
    assert n.pr_bpm is None and n.abp_sys is None and n.abp_dia is None and n.abp_map is None


def test_hr_falls_back_to_second_ecg_slot(cfg):
    seg = make_segment(cfg, False, 3, missing=("ECG_1",))
    assert compute_numerics(seg, cfg, _idx(cfg, 200.0)).hr_bpm is not None


def test_too_little_history_gives_none(cfg, seg_false):
    n = compute_numerics(seg_false, cfg, _idx(cfg, 0.5))  # <3 beats, <half a window of samples
    assert n.to_dict() == dict.fromkeys(n.to_dict())


def test_flat_line_is_not_reported(cfg, seg_false):
    flat = seg_false.copy()
    flat[:, :] = 1.0
    n = compute_numerics(flat, cfg, _idx(cfg, 200.0))
    assert all(v is None for v in n.to_dict().values())


def test_never_looks_past_end_idx(cfg, seg_true):
    end = _idx(cfg, 250.0)
    a = compute_numerics(seg_true, cfg, end)
    poisoned = seg_true.copy()
    poisoned[:, end:] = np.nan
    assert compute_numerics(poisoned, cfg, end) == a


def test_shape_validation(cfg):
    with pytest.raises(ValueError):
        compute_numerics(np.zeros((2, 100), dtype=np.float32), cfg)


def test_collapsed_pulse_is_not_reported_as_a_rate(cfg, seg_false):
    seg = seg_false.copy()
    ppg = cfg.channel_slots.index("PPG")
    seg[ppg] = np.random.default_rng(0).normal(0, 0.01, seg.shape[1])  # no pulse, just noise
    n = compute_numerics(seg, cfg, _idx(cfg, 200.0))
    assert n.hr_bpm is not None and n.pr_bpm is None
