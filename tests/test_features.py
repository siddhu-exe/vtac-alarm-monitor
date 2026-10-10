import numpy as np

from vtac.features import extract_features, feature_names
from vtac.preprocess import preprocess_slots


def test_features_on_synthetic_alarms(cfg, seg_true, seg_false):
    ft = extract_features(*_pw(seg_true, cfg), cfg)
    ff = extract_features(*_pw(seg_false, cfg), cfg)
    assert list(ft) == feature_names(cfg)
    assert 150 < ft["ECG_1_rate_bpm"] < 230  # VT-like
    assert 150 < ft["PPG_rate_bpm"] < 230
    # the false alarm's ECG window is dominated by the artifact burst, its PPG stays regular
    assert 60 < ff["PPG_rate_bpm"] < 100
    assert ff["ECG_1_hf_ratio"] > ft["ECG_1_hf_ratio"]  # artifact = more high-frequency power
    assert ft["ECG_1_present"] == 1.0


def test_missing_channel_features_are_nan(cfg):
    from vtac.synthetic import make_segment

    pw = preprocess_slots(make_segment(cfg, True, 5, missing=("PPG",)), cfg)
    f = extract_features(pw.signals, pw.mask, cfg)
    assert (
        f["PPG_present"] == 0.0 and np.isnan(f["PPG_rate_bpm"]) and np.isnan(f["rate_diff_ecg_ppg"])
    )


def _pw(seg, cfg):
    pw = preprocess_slots(seg, cfg)
    return pw.signals, pw.mask
