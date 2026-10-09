# Decision log

Format: ID, date, decision, why, status. Append new entries; do not rewrite history (supersede instead).

| ID | Date | Decision | Why | Status |
|---|---|---|---|---|
| D01 | 2026-10-09 | Dataset is VTaC (PhysioNet), 5,037 events, 28.61% true | Real ICU VT alarms with ECG + pulsatile channels | Accepted |
| D02 | 2026-10-09 | Use the official split (`benchmark_data_split.csv`); verify it is patient-level | A patient has up to 5 events; event-level splits leak | Accepted; verification pending |
| D03 | 2026-10-09 | Heavy work (download, preprocess, train, ablate, ONNX export) runs only in Colab; laptop runs backend, frontend, tests | Low-RAM, old-CPU laptop | Accepted |
| D04 | 2026-10-09 | Shared package `src/vtac/` is the only home of preprocessing; installed in Colab from GitHub and used by backend | Prevents train/serve skew | Accepted |
| D05 | 2026-10-09 | Do not assume column names, sampling rates, or channel names; verify and record in `docs/data.md` | Dataset schema must come from the files | Accepted |
| D06 | 2026-10-09 | Missing channels handled by fixed slots + mask, zero-filled, never imputed from other channels | Channels vary by record; explicit absence is safer | Accepted; slot list pending verification |
| D07 | 2026-10-09 | Metrics: PR-AUC, ROC-AUC, TPR, PPV, 2015 Challenge Score `(TP+TN)/(TP+TN+FP+5FN)` | Imbalanced data; missed true alarm costs 5x | Accepted |
| D08 | 2026-10-09 | Threshold tuned on validation for the 1:5 cost, saved to config; test touched once | Avoid test leakage; cost-aware operating point | Accepted |
| D09 | 2026-10-09 | Baseline = neurokit2 HRV/QRS features + XGBoost; main model = 1D-CNN/ResNet1D (PyTorch); ECG-only vs ECG+pulsatile ablation | Interpretable floor + end-to-end model | Accepted |
| D10 | 2026-10-09 | Imbalance via weighted sampling or focal loss (compared in ablation) | 28.6% positives | Accepted |
| D11 | 2026-10-09 | Serve with ONNX via onnxruntime on CPU; no torch in backend | Light laptop deps, low latency | Accepted |
| D12 | 2026-10-09 | Backend: FastAPI with MOCK model mode and per-inference latency logging | Frontend can be built before the real model exists | Accepted |
| D13 | 2026-10-09 | Frontend: Vite + React + TypeScript + Tailwind, uPlot for waveforms | Fast streaming without heavy chart libraries | Accepted |
| D14 | 2026-10-09 | Everything labeled "simulated real-time (replayed recordings)"; no live monitor integration claims | Honesty about scope | Accepted |
| D15 | 2026-10-09 | Checkpoint 2 scope: DVC, MLflow/DagsHub, registry, drift, retrain, Grad-CAM, Docker, CI/CD (Grad-CAM = UI placeholder now) | Keep checkpoint 1 achievable | Accepted |
| D16 | 2026-10-09 | `pyproject.toml` extras: `train` (Colab), `backend` (laptop), `dev` (tests); torch not pinned (Colab provides it) | Keep local installs light | Accepted |
| D17 | 2026-10-09 | Proposed: model slots `[ECG_1, ECG_2, PPG, ABP]`, input `(N, C, T)` + mask `(N, C)`, output logit `(N, 1)` | Fixed contract for ONNX and backend | Proposed; finalize after data verification |
| D18 | 2026-10-09 | Proposed: window = 10 s ending at alarm onset plus a small post-onset margin | A real system only sees data up to (about) alarm time; margin TBD | Open — see open questions |
