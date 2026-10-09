# Roadmap

> Simulated real-time (replayed recordings). Stage gate: no application code until the skeleton
> and docs are reviewed.

## Checkpoint 1 (current)

### Stage 0 — skeleton + docs
- [x] Repo structure, `.gitignore`, `pyproject.toml`, README
- [x] `CLAUDE.md`
- [x] docs: architecture, data, modeling, api, roadmap, decisions, colab-workflow
- [ ] **User review of skeleton/docs** (gate)

### Stage 1 — shared package `src/vtac/`
- [ ] `config.py` (dataclasses; fs, window, channel slots/priority, thresholds — filled from verified data)
- [ ] `io.py` WFDB loading (header-driven channel/fs discovery, no hardcoded names)
- [ ] `filters.py` bandpass (per modality)
- [ ] `windows.py` 10 s window extraction around alarm onset
- [ ] `channels.py` channel selection + missing-channel mask + quality flags
- [ ] `features.py` baseline features (neurokit2, imported lazily; Colab only)
- [ ] `preprocess.py` single entry point raw record -> `(signals, mask)`
- [ ] `metrics.py` PR-AUC, ROC-AUC, TPR, PPV, Challenge Score, threshold tuning
- [ ] pytest on synthetic signals

### Stage 2 — Colab notebooks
- [ ] `01_data_prep`: download, verify (fill `docs/data.md` Findings), preprocess, save `windows.npz`, export ~25-alarm replay sample
- [ ] `02_baseline`: neurokit2 features + XGBoost
- [ ] `03_cnn`: ResNet1D, ECG-only vs ECG+pulsatile, weighted sampling/focal loss, ONNX export, threshold -> `model_config.json`
- [ ] Fill ablation table in `docs/modeling.md`

### Stage 3 — backend
- [ ] App skeleton, config, `/health`, `/patients`, `/alarms`
- [ ] MOCK model mode
- [ ] ONNX model wrapper (onnxruntime CPU) + latency logging
- [ ] `/predict`
- [ ] WebSocket replay (session/chunk/verdict/end)
- [ ] pytest (httpx TestClient, mock mode, synthetic sample)

### Stage 4 — frontend
- [ ] Vite + React + TS + Tailwind scaffold
- [ ] uPlot live waveforms (ECG/PPG/ABP)
- [ ] Alarm feed (verdict, confidence, suppressed/escalated)
- [ ] Per-channel signal-quality badge
- [ ] Summary panel (alarms suppressed, true alarms caught)
- [ ] Grad-CAM placeholder panel
- [ ] "Simulated real-time (replayed recordings)" label visible on every view

### Stage 5 — integrate
- [ ] Swap MOCK -> real ONNX; verify train/serve parity test
- [ ] End-to-end demo on the ~25-alarm sample

## Checkpoint 2 (out of scope for now)

- [ ] Grad-CAM / saliency explanations on the dashboard
- [ ] DVC for data and artifact versioning
- [ ] MLflow / DagsHub experiment tracking
- [ ] Model registry and promotion flow
- [ ] Drift monitoring and retrain triggers
- [ ] Docker (backend + frontend)
- [ ] CI/CD
