"""Smoke/regression checks of the real Colab artifacts. Skipped when they are not downloaded.

Needs ``models/model.onnx``, ``models/model_config.json`` and ``data/sample/replay_sample.npz``
(gitignored; see ``docs/colab-workflow.md``). Runs the backend's own preprocessing + predictor path.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from vtac.config import VtacConfig, load_config
from vtac.preprocess import preprocess_slots

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "models" / "model.onnx"
CONFIG = ROOT / "models" / "model_config.json"
SAMPLE = ROOT / "data" / "sample" / "replay_sample.npz"

pytestmark = pytest.mark.skipif(
    not (MODEL.exists() and CONFIG.exists() and SAMPLE.exists()),
    reason="real model / replay sample not downloaded (docs/colab-workflow.md)",
)


@pytest.fixture(scope="module")
def real_cfg() -> VtacConfig:
    return load_config(CONFIG)


@pytest.fixture(scope="module")
def predictor(real_cfg: VtacConfig):
    pytest.importorskip("onnxruntime")
    from backend.app.model import OnnxPredictor

    return OnnxPredictor(MODEL, real_cfg.model_version, real_cfg.n_slots, real_cfg.window_samples)


@pytest.fixture(scope="module")
def scored(real_cfg: VtacConfig, predictor) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(y, p_true, mask) for every sample alarm via vtac.preprocess_slots -> ONNX."""
    d = np.load(SAMPLE, allow_pickle=False)
    wins = [preprocess_slots(d["raw"][i], real_cfg, None) for i in range(len(d["y"]))]
    signals = np.stack([w.signals for w in wins])
    mask = np.stack([w.mask for w in wins])
    return d["y"].astype(int), predictor.predict(signals, mask), mask


def test_config_is_the_trained_one(real_cfg: VtacConfig) -> None:
    assert real_cfg.model_version != "unset"
    assert 0.0 < real_cfg.threshold < 1.0
    assert real_cfg.threshold == real_cfg.threshold_constrained  # backend uses the constrained one
    assert real_cfg.channel_slots == ("ECG_1", "ECG_2", "PPG", "ABP")


def test_scores_are_probabilities_with_spread(scored) -> None:
    _, p, _ = scored
    assert np.all(np.isfinite(p)) and np.all((p > 0) & (p < 1))
    assert p.std() > 0.05  # not a constant / collapsed output


def test_sample_alarms_are_separable(scored) -> None:
    """Weak sanity bound on 25 alarms: true alarms score higher than false ones on average."""
    y, p, _ = scored
    assert y.sum() > 0 and (1 - y).sum() > 0
    assert p[y == 1].mean() > p[y == 0].mean() + 0.1


def test_every_alarm_keeps_an_ecg_channel(scored) -> None:
    _, _, mask = scored
    assert np.all(mask[:, :2].sum(axis=1) >= 1)


def test_batch_matches_single(real_cfg: VtacConfig, predictor, scored) -> None:
    """ONNX output must not depend on batch composition (dynamic batch axis)."""
    d = np.load(SAMPLE, allow_pickle=False)
    wins = [preprocess_slots(d["raw"][i], real_cfg, None) for i in range(3)]
    sig = np.stack([w.signals for w in wins])
    msk = np.stack([w.mask for w in wins])
    batch = predictor.predict(sig, msk)
    single = np.array([predictor.predict(sig[i : i + 1], msk[i : i + 1])[0] for i in range(3)])
    np.testing.assert_allclose(batch, single, atol=1e-5)
    np.testing.assert_allclose(batch, scored[1][:3], atol=1e-5)
