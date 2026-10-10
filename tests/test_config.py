from vtac.config import VtacConfig, load_config


def test_benchmark_window_matches_official_slice():
    # ML-Health/VTaC standardize.py uses samples 72500:75000 (10 s ending at alarm onset)
    bench = VtacConfig(window_end_offset_s=0.0)
    assert bench.window_end_index == 75_000
    assert bench.window_end_index - bench.window_samples == 72_500


def test_default_has_post_onset_margin():
    c = VtacConfig()
    assert c.window_samples == 2500
    assert c.window_end_index == 75_500


def test_roundtrip_json(tmp_path):
    c = VtacConfig(threshold=0.31, threshold_constrained=0.31, model_version="x")
    p = tmp_path / "model_config.json"
    c.save(p)
    assert load_config(p) == c
    assert c.to_dict()["input_shape"] == ["N", 4, 2500]


def test_installed_git_ref_falls_back_to_default():
    from vtac.provenance import installed_git_ref

    ref = installed_git_ref("fallback")
    assert ref is None or isinstance(ref, str)  # editable/local install: no VCS info -> default
