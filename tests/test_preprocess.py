import numpy as np
import pytest

from vtac.preprocess import preprocess_record, preprocess_slots, to_slot_array


def test_shapes_and_normalisation(cfg, seg_true):
    pw = preprocess_slots(seg_true, cfg)
    assert pw.signals.shape == (4, 2500) and pw.signals.dtype == np.float32
    assert pw.mask.tolist() == [1, 1, 1, 1]
    assert np.allclose(pw.signals.mean(axis=1), 0, atol=1e-4)
    assert np.allclose(pw.signals.std(axis=1), 1, atol=1e-3)


def test_missing_channel_is_zero_and_masked(cfg):
    from vtac.synthetic import make_segment

    raw = make_segment(cfg, False, seed=3, missing=("ABP", "ECG_2"))
    pw = preprocess_slots(raw, cfg)
    assert pw.mask.tolist() == [1, 0, 1, 0]
    assert not pw.signals[1].any() and not pw.signals[3].any()
    assert pw.quality["ABP"].level == "absent"


def test_flat_and_nan_channels_masked(cfg, seg_false):
    raw = seg_false.copy()
    raw[2] = 0.0  # flat PPG
    raw[3, :] = np.nan
    raw[1, 74500:75100] = (
        np.nan
    )  # 2.4 s gap (24% of window) in ECG_2 -> interpolated, degraded but usable
    pw = preprocess_slots(raw, cfg)
    assert pw.mask.tolist() == [1, 1, 0, 0]
    assert pw.quality["PPG"].level == "bad" and pw.quality["ECG_2"].level == "degraded"
    assert np.isfinite(pw.signals).all()


def test_named_record_matches_slot_path(cfg, seg_true):
    named = {"V": seg_true[1], "II": seg_true[0], "PLETH": seg_true[2], "ABP": seg_true[3]}
    a = preprocess_record(named, cfg)
    b = preprocess_slots(seg_true, cfg)
    assert a.sources == {"ECG_1": "II", "ECG_2": "V", "PPG": "PLETH", "ABP": "ABP"}
    np.testing.assert_allclose(a.signals, b.signals, atol=1e-6)
    raw, _ = to_slot_array(named, cfg)
    assert raw.shape == (4, cfg.segment_samples)


def test_window_offset_is_configurable(cfg, seg_true):
    bench = cfg.with_updates(window_end_offset_s=0.0)
    a = preprocess_slots(seg_true, bench)
    b = preprocess_slots(seg_true, cfg)
    assert a.signals.shape == b.signals.shape
    assert not np.allclose(a.signals, b.signals)


def test_explicit_window_with_lead_in_matches_full_segment(cfg, seg_true):
    # serving path: caller passes the raw samples up to window end; end_idx=len
    end = cfg.window_end_index
    full = preprocess_slots(seg_true, cfg)
    cut = preprocess_slots(seg_true[:, :end], cfg, end_idx=end)
    np.testing.assert_allclose(full.signals, cut.signals, atol=1e-5)


def test_too_short_raises(cfg):
    with pytest.raises(ValueError):
        preprocess_slots(np.zeros((4, 1000), dtype=np.float32), cfg, end_idx=1000)
