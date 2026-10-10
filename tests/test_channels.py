import numpy as np

from vtac.channels import ABSENT, BAD, DEGRADED, GOOD, assess_channel, select_slots


def test_select_slots_header_example(cfg):
    # header seen in VTaC record 003c13_0115
    s = select_slots(["II", "aVR", "V", "PLETH"], cfg)
    assert s == {"ECG_1": "II", "ECG_2": "V", "PPG": "PLETH", "ABP": None}


def test_select_slots_abp_only_and_single_ecg(cfg):
    s = select_slots(["aVR", "ABP"], cfg)
    assert s == {"ECG_1": "aVR", "ECG_2": None, "PPG": None, "ABP": "ABP"}


def test_select_slots_case_insensitive_and_fallback(cfg):
    s = select_slots(["ecgx", "ecgy", "pleth"], cfg)
    assert s["ECG_1"] == "ecgx" and s["ECG_2"] == "ecgy" and s["PPG"] == "pleth"


def test_quality_levels(cfg):
    rng = np.random.default_rng(0)
    n = 2500
    x = rng.normal(size=n)
    assert assess_channel(x, cfg).level == GOOD
    assert assess_channel(None, cfg).level == ABSENT
    assert assess_channel(np.full(n, np.nan), cfg).level == ABSENT
    assert assess_channel(np.zeros(n), cfg).level == BAD
    y = x.copy()
    y[: n // 2 + 10] = np.nan
    assert assess_channel(y, cfg).level == BAD
    z = x.copy()
    z[100 : 100 + 400] = np.nan  # 1.6 s gap, 16% NaN
    assert assess_channel(z, cfg).level == DEGRADED
