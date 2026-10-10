"""Predictors. MOCK returns deterministic dummy scores; ONNX arrives with the trained model."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Protocol

import numpy as np

from backend.app.settings import Settings
from vtac.config import VtacConfig


class Predictor(Protocol):
    mode: str
    version: str

    def predict(self, signals: np.ndarray, mask: np.ndarray) -> np.ndarray:
        """signals (N,C,T) float32, mask (N,C) float32 -> p_true (N,)."""


class MockPredictor:
    """Dummy scores, a deterministic hash of the input window. NOT a model; labelled as mock."""

    mode = "mock"
    version = "mock-0"

    def predict(self, signals: np.ndarray, mask: np.ndarray) -> np.ndarray:
        out = np.empty(len(signals), dtype=np.float64)
        for i in range(len(signals)):
            h = hashlib.sha256(signals[i].astype(np.float16).tobytes() + mask[i].tobytes())
            out[i] = int.from_bytes(h.digest()[:8], "big") / 2**64
        return out


class OnnxPredictor:
    """onnxruntime (CPU) wrapper: inputs ``signals``, ``mask``; output ``logit``."""

    mode = "onnx"

    def __init__(
        self, model_path: Path, version: str, n_slots: int, window_samples: int, threads: int = 2
    ) -> None:
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = threads
        self._sess = ort.InferenceSession(str(model_path), opts, providers=["CPUExecutionProvider"])
        self.version = version
        ins = {i.name: i.shape for i in self._sess.get_inputs()}
        if set(ins) != {"signals", "mask"} or [o.name for o in self._sess.get_outputs()] != [
            "logit"
        ]:
            raise ValueError(
                f"{model_path}: expected inputs signals,mask and output logit; got {ins}"
            )
        sig = ins["signals"]
        if sig[1] != n_slots or (isinstance(sig[2], int) and sig[2] != window_samples):
            raise ValueError(
                f"{model_path}: model input {sig} != config ({n_slots}, {window_samples})"
            )

    def predict(self, signals: np.ndarray, mask: np.ndarray) -> np.ndarray:
        logit = self._sess.run(
            ["logit"], {"signals": signals.astype(np.float32), "mask": mask.astype(np.float32)}
        )[0]
        return 1.0 / (1.0 + np.exp(-logit[:, 0].astype(np.float64)))


def build_predictor(settings: Settings, cfg: VtacConfig) -> Predictor | None:
    """Return a predictor, or None when the requested model is not available (-> HTTP 503)."""
    if settings.model_mode == "mock":
        return MockPredictor()
    if settings.model_mode == "onnx":
        path = Path(settings.model_dir) / "model.onnx"
        if not path.exists():
            return None  # not downloaded yet; /health reports "degraded", use VTAC_MODEL_MODE=mock
        return OnnxPredictor(path, cfg.model_version, cfg.n_slots, cfg.window_samples)
    raise ValueError(f"VTAC_MODEL_MODE must be 'mock' or 'onnx', got {settings.model_mode!r}")
