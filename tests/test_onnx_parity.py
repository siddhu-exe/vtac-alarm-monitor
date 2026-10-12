"""ONNX vs PyTorch parity on a fixed batch exported by ``notebooks/03_cnn`` (cell 5).

Needs ``models/parity_batch.npz`` next to ``models/model.onnx`` (both gitignored; see
``docs/colab-workflow.md``). Skipped when either is absent.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from vtac.config import VtacConfig, load_config

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "models" / "model.onnx"
CONFIG = ROOT / "models" / "model_config.json"
BATCH = ROOT / "models" / "parity_batch.npz"

pytestmark = pytest.mark.skipif(
    not (MODEL.exists() and CONFIG.exists() and BATCH.exists()),
    reason="model.onnx / parity_batch.npz not downloaded (docs/colab-workflow.md)",
)

MAX_ABS_DIFF = 1e-4


@pytest.fixture(scope="module")
def cfg() -> VtacConfig:
    return load_config(CONFIG)


@pytest.fixture(scope="module")
def batch() -> dict[str, np.ndarray]:
    d = np.load(BATCH, allow_pickle=False)
    return {k: d[k] for k in d.files}


@pytest.fixture(scope="module")
def onnx_p(cfg: VtacConfig, batch: dict[str, np.ndarray]) -> np.ndarray:
    pytest.importorskip("onnxruntime")
    from backend.app.model import OnnxPredictor

    pred = OnnxPredictor(MODEL, cfg.model_version, cfg.n_slots, cfg.window_samples)
    return pred.predict(batch["signals"], batch["mask"])


def test_batch_belongs_to_this_model(cfg: VtacConfig, batch: dict[str, np.ndarray]) -> None:
    assert str(batch["model_version"]) == cfg.model_version
    assert float(batch["threshold"]) == pytest.approx(cfg.threshold)
    assert batch["signals"].shape[1:] == (cfg.n_slots, cfg.window_samples)


def test_batch_covers_masked_channels_and_both_classes(batch: dict[str, np.ndarray]) -> None:
    assert len(batch["y"]) >= 16
    assert (batch["mask"].min(axis=1) == 0).any()  # at least one masked-channel window
    assert 0 < batch["y"].sum() < len(batch["y"])


def test_onnx_matches_pytorch_scores(onnx_p: np.ndarray, batch: dict[str, np.ndarray]) -> None:
    diff = np.abs(onnx_p - batch["torch_p"])
    assert diff.max() < MAX_ABS_DIFF, f"max abs diff {diff.max():.2e} >= {MAX_ABS_DIFF:.0e}"


def test_same_decisions_at_the_threshold(
    cfg: VtacConfig, onnx_p: np.ndarray, batch: dict[str, np.ndarray]
) -> None:
    assert ((onnx_p >= cfg.threshold) == (batch["torch_p"] >= cfg.threshold)).all()
