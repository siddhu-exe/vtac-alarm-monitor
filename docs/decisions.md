# Decision log

Format: ID, date, decision, why, status. Append new entries; do not rewrite history (supersede instead).

| ID | Date | Decision | Why | Status |
|---|---|---|---|---|
| D01 | 2026-10-09 | Dataset is VTaC (PhysioNet), 5,037 events, 28.61% true | Real ICU VT alarms with ECG + pulsatile channels | Accepted |
| D02 | 2026-10-09 | Use the official split (`benchmark_data_split.csv`, columns `split,record,event`); verify it is patient-level (`record` = patient). If it has no validation set, carve one from train grouped by patient and stratified by label (seed 42, 15%) | A patient has up to 5 events; event-level splits leak | Accepted; verification pending in `01_data_prep` |
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
| D17 | 2026-10-09 | Model slots `[ECG_1, ECG_2, PPG, ABP]` (PPG and ABP separate, with a mask), input `(N, 4, 2500)` + mask `(N, 4)`, output logit `(N, 1)` | Matches the benchmark's channel layout; enables ECG-only / +PPG / +ABP ablation | Accepted (user, 2026-10-09) |
| D18 | 2026-10-09 | Window = 10 s ending at alarm onset + `window_end_offset_s` (default 2.0 s, configurable in `VtacConfig`) | A live system only sees data up to about alarm time; a small margin lets the window contain the alarm-triggering beats | Accepted (user); the 2.0 s default is a guess pending ablation W0 vs W1 |
| D19 | 2026-10-09 | Checked the official VTaC benchmark code: its normalization window is samples 72500:75000, i.e. 10 s ending exactly at onset (offset 0). Our default differs only by the +2 s margin, so run offset 0.0 as ablation W0 for comparability with published results; record the outcome below | User asked for comparability | Accepted; ablation pending. Caveat: the benchmark's tensor-building code was not in the repo, so its training window is inferred |
| D20 | 2026-10-09 | Threshold: hard constraint validation TPR >= 0.95, then maximise Challenge Score; report and store both constrained and unconstrained thresholds; the backend uses the constrained one | Missing a true alarm is the dangerous error | Accepted (user) |
| D21 | 2026-10-09 | **Segments are 6 minutes (5 min pre + 1 min post), 250 Hz, 90,000 samples, onset at t=300 s**, not 10 minutes as in the original brief | Real `.hea` header + PhysioNet page | Accepted; re-verify across all records |
| D22 | 2026-10-09 | Public repo `github.com/siddhu-exe/vtac-alarm-monitor`; no data or models committed | Colab installs `vtac` from GitHub | Accepted (user) |
| D23 | 2026-10-09 | Local env: Python 3.11 via `uv` (`.python-version`); `requires-python >= 3.10` kept for Colab | System Python 3.14 lacks wheels for some deps | Accepted (user) |
| D24 | 2026-10-09 | Backend layout `backend/app/main:app`; MOCK mode is the default until a trained ONNX model exists | Frontend can be built first | Accepted |
| D25 | 2026-10-09 | Parent `projects/` repo ignores `AIH/` via `projects/.gitignore`; AIH has its own git repo | Avoid nested-repo conflicts | Accepted (user); parent `.gitignore` edit left uncommitted |
| D26 | 2026-10-09 | `pyproject` core deps are numpy + scipy only; wfdb/pandas/neurokit2/xgboost in `train`, FastAPI/onnxruntime in `backend` | The backend never reads WFDB (replay sample is `.npz`) | Accepted |
| D27 | 2026-10-09 | Filters follow the benchmark (ECG 1-30 Hz + 60 Hz notch, PPG 0.5-5 Hz, ABP LP 16 Hz) but zero-phase; per-window per-channel z-score; noise is NOT a masking criterion | Noisy ECG is a false-alarm cue; benchmark filter direction unknown | Accepted; revisit if parity with benchmark matters |
| D28 | 2026-10-09 | Replay sample stores slot-ordered RAW segments `(N, 4, 90000)` (NaN = absent), so the backend uses the same `vtac.preprocess_slots` path as training | Prevents train/serve skew | Accepted |
| D29 | 2026-10-10 | Frontend contract additions: `GET /model` (τ, window, channel order, model-card fields), WS `control` (pause/resume/speed) + `state` ack, `chunk.numerics` (HR, **pulse rate from PLETH**, ABP sys/dia/MAP, from `vtac.display`), optional `verdict.attribution` (schema only; not populated until checkpoint 2) | UI must not hard-code τ/offsets; transport needs server-side pause/speed; HR/ABP via client code would fork preprocessing; pulse collapse next to a fast ECG rate is the key true-VT cue; attribution in the contract now avoids a checkpoint-2 contract change | Accepted (user) |
| D30 | 2026-10-10 | SpO₂ is not shown; PLETH readout is pulse rate. Display peak detection is separate from the feature detector (`vtac.display`), with an autocorrelation gate so a collapsed (noise-only) pulse reports "—", not a spurious rate | No SpO₂ source in the data; baseline features must not change under the dashboard | Accepted |
| D31 | 2026-10-10 | Frontend choices: fixed-axis sweep; view span and model window derived from `/model` (the mock-up's "−10 → +2 s" was inconsistent with the real −8 → +2 s); feed keeps a stable order and shows RECEIVED (client arrival time), PATIENT and RECORD (= alarm_id); expert label hidden until the verdict arrives; "Alarms suppressed" (a suppressed true alarm is not a "false alarm suppressed"); no "nurse paged" wording (the replay pages nobody); auto-advance on by default | Mock-up details that would be wrong or misleading with real data; a demo must not claim clinical actions | Accepted (user, items 2-3; rest by implementation) |

## Ablation outcomes

| Date | Ablation | Result | Decision |
|---|---|---|---|
| _pending_ | W0 (offset 0.0, benchmark window) vs W1 (offset +2.0 s) | | |
