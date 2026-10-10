import numpy as np
import pytest

from vtac.dataset import load_replay, load_windows, save_replay, save_windows


def test_windows_roundtrip(tmp_path, cfg):
    n = 3
    save_windows(
        tmp_path / "w.npz",
        np.zeros((n, 4, 2500)),
        np.ones((n, 4)),
        [0, 1, 1],
        ["train", "val", "test"],
        ["a_1", "b_1", "c_1"],
        ["a", "b", "c"],
        cfg,
    )
    z = load_windows(tmp_path / "w.npz")
    assert z["signals"].shape == (3, 4, 2500) and z["y"].tolist() == [0, 1, 1]


def test_replay_roundtrip(tmp_path, cfg):
    raw = np.full((2, 4, 100), np.nan, dtype=np.float32)
    srcs = [{"ECG_1": "II", "ECG_2": None, "PPG": None, "ABP": None}] * 2
    save_replay(tmp_path / "r.npz", raw, [1, 0], ["a_1", "b_1"], ["a", "b"], srcs, cfg)
    arrays, index = load_replay(tmp_path / "r.npz")
    assert arrays["raw"].shape == (2, 4, 100) and index["alarms"][0]["ground_truth"] is True


def test_patient_level_check_and_validation_carving():
    pd = pytest.importorskip("pandas")
    pytest.importorskip("sklearn")
    from vtac.splits import add_validation_split, check_patient_level

    rng = np.random.default_rng(0)
    rows = [
        ("train", f"p{i:03d}", f"p{i:03d}_{j}", int(rng.random() < 0.3))
        for i in range(100)
        for j in range(rng.integers(1, 5))
    ]
    rows += [("test", f"t{i:03d}", f"t{i:03d}_0", int(rng.random() < 0.3)) for i in range(20)]
    df = pd.DataFrame(rows, columns=["split", "record", "event", "y"])
    assert check_patient_level(df)["patient_level"]
    out = add_validation_split(df, val_frac=0.2, seed=1)
    assert check_patient_level(out)["patient_level"]
    assert (out.split == "test").sum() == 20 and 0 < (out.split == "val").sum() < len(df)
    leak = df.copy()
    leak.loc[len(leak)] = ["test", df.record[0], "dup_event", 0]  # same patient also in test
    rep = check_patient_level(leak)
    assert not rep["patient_level"] and rep["leaking_patients"] == [df.record[0]]


def test_load_segment_wfdb(tmp_path, cfg):
    wfdb = pytest.importorskip("wfdb")
    from vtac.io import load_segment

    small = cfg.with_updates(segment_samples=500)
    sig = np.random.default_rng(0).normal(size=(500, 2))
    wfdb.wrsamp(
        "rec_0001",
        fs=250,
        units=["mV", "NU"],
        sig_name=["II", "PLETH"],
        p_signal=sig,
        fmt=["16", "16"],
        write_dir=str(tmp_path),
    )
    ch = load_segment(tmp_path / "rec_0001", small)
    assert set(ch) == {"II", "PLETH"} and ch["II"].shape == (500,)
    with pytest.raises(ValueError):
        load_segment(tmp_path / "rec_0001", cfg)  # wrong expected length
