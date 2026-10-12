# Roadmap

> Simulated real-time (replayed recordings). Stage gate: no application code until the skeleton
> and docs are reviewed.

## Checkpoint 1 (current)

### Stage 0 — skeleton + docs
- [x] Repo structure, `.gitignore`, `pyproject.toml`, README
- [x] `CLAUDE.md`
- [x] docs: architecture, data, modeling, api, roadmap, decisions, colab-workflow
- [x] **User review of skeleton/docs** (gate) — approved 2026-10-09

### Stage 1 — shared package `src/vtac/`
- [x] `config.py` (dataclasses; fs, window, channel slots/priority, thresholds — filled from verified data)
- [x] `io.py` WFDB loading (header-driven channel/fs discovery, no hardcoded names)
- [x] `filters.py` bandpass (per modality)
- [x] `windows.py` 10 s window extraction around alarm onset
- [x] `channels.py` channel selection + missing-channel mask + quality flags
- [x] `features.py` baseline features (neurokit2, imported lazily; Colab only) _(scipy features only; neurokit2 HRV is added in `02_baseline`)_
- [x] `preprocess.py` single entry point raw record -> `(signals, mask)`
- [x] `splits.py` patient-level check + grouped/stratified validation carve-out; `dataset.py` npz I/O; `synthetic.py` demo/test signals
- [x] `metrics.py` PR-AUC, ROC-AUC, TPR, PPV, Challenge Score, threshold tuning
- [x] pytest on synthetic signals — 36 passed, 0 skipped on 2026-10-09 (incl. wfdb I/O, split carving, ONNX loader)

### Stage 2 — Colab notebooks
- [ ] Before `01_data_prep`: window ablation plan W0 (offset 0.0) vs W1 (default) is in `docs/modeling.md`
- [x] `01_data_prep` **run on Colab 2026-10-12**: download, verify (fill `docs/data.md` Findings), preprocess both offsets, export ~25-alarm replay sample
- [x] `02_baseline` **run on Colab**: neurokit2 + vtac features, XGBoost, B0/B1
- [x] `03_cnn` **run on Colab** (final: C4 `resnet1d-C4_all_dropout-off2.0`, focal loss, dropout 0.15): ResNet1D, C0-C4 + K1/K2 ablations, ONNX export + parity check, thresholds -> `model_config.json`
- [x] Run all three on Colab; artifacts copied to `models/` and `data/sample/`
- [ ] Fill the remaining `docs/modeling.md` tables (B0/B1, C0-C3, K, W0/W1) from the Drive `reports/` files; only C4 is filled from `model_config.json`

### Stage 3 — backend
- [x] App skeleton, config, `/health`, `/patients`, `/alarms`
- [x] MOCK model mode
- [x] ONNX model wrapper (`OnnxPredictor`, onnxruntime CPU) + latency logging — loader written; its test needs `onnx` installed; tested against the real C4 model (`tests/test_real_model.py`; skipped when the artifacts are absent)
- [x] `/predict`
- [x] WebSocket replay (session/chunk/verdict/end)
- [x] pytest (httpx TestClient, mock mode, synthetic sample) — passing

### Stage 4 — frontend
- [x] Vite + React + TS + Tailwind scaffold (pnpm; tokens-only theme; strict ESLint incl. jsx-a11y)
- [x] Backend contract for the UI: `GET /model`, WS pause/resume/speed, `chunk.numerics`, optional `verdict.attribution` (D29, D30)
- [x] uPlot live waveforms (ECG/PPG/ABP): ring buffers, one instance per strip, shared rAF loop
- [x] Alarm feed (verdict, confidence, suppressed/escalated), keyboard-navigable
- [x] Per-channel signal-quality badge; missing-channel strip
- [x] Summary panel (alarms suppressed/escalated, true alarms caught/missed, false-alarm reduction)
- [x] Grad-CAM placeholder panel (renders real attribution as soon as the backend sends it)
- [x] "Simulated real-time (replayed recordings)" label always visible; footer disclaimer
- [x] Loading / empty / offline / reconnecting / failed states; accessibility pass
- [x] Tests: ring buffer, verdict mapping, Zod parsing, reconnect logic, VerdictCard, AlarmFeed, missing-channel strip, App integration
- [ ] Manual check in a real browser on the target laptop (60 fps claim is by design + a CPU probe, not yet measured in-browser)

### Stage 5 — integrate
- [x] Swap MOCK -> real ONNX: backend runs with `VTAC_MODEL_MODE=onnx` (2026-10-12; first verdict ~63 ms total, preprocess ~37 ms + infer ~26 ms)
- [x] Offline sample check on all 25 alarms: 9/10 true escalated, 12/15 false suppressed (one missed: `a06fbf_0500`, p=0.476 vs thr 0.515)
- [ ] Train/serve parity: compare torch vs ONNX scores on a fixed batch saved from the `03_cnn` notebook (only a loose sanity test exists in the repo)
- [ ] End-to-end demo on the ~25-alarm sample

## Checkpoint 2 (out of scope for now)

- [ ] Grad-CAM / saliency explanations on the dashboard
- [ ] DVC for data and artifact versioning
- [ ] MLflow / DagsHub experiment tracking
- [ ] Model registry and promotion flow
- [ ] Drift monitoring and retrain triggers
- [ ] Docker (backend + frontend)
- [ ] CI/CD
