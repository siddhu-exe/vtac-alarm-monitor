# Roadmap

> Simulated real-time (replayed recordings). Not for clinical use.

Status on 2026-10-18: **scope is frozen** (decision D32). Everything below under "Built" exists in
the repo and is covered by tests or by saved reports. Nothing new will be built; what remains is
documentation and the open items listed at the end.

## Built

### Stage 0 - skeleton and docs
- [x] Repo structure, `.gitignore`, `pyproject.toml`, `CLAUDE.md`
- [x] Docs: architecture, data, modeling, api, roadmap, decisions, colab-workflow, demo, sign-off
- [x] User review of the skeleton (gate), approved 2026-10-09

### Stage 1 - shared package `src/vtac/`
- [x] `config.py` (all constants; saved as `model_config.json`)
- [x] `io.py` WFDB/CSV loading (header-driven channel and rate discovery)
- [x] `filters.py` band-pass/notch per modality (zero-phase)
- [x] `windows.py` 10 s window around alarm onset (raises instead of shifting)
- [x] `channels.py` slot mapping, quality levels, missing-channel mask
- [x] `features.py` baseline features (scipy; neurokit2 HRV added in `02_baseline`)
- [x] `preprocess.py` the single raw -> `(signals, mask)` path
- [x] `splits.py` patient-level check and grouped/stratified validation carve-out
- [x] `dataset.py`, `synthetic.py`, `display.py`, `metrics.py`, `provenance.py`
- [x] pytest on synthetic signals

### Stage 2 - Colab notebooks (run 2026-10-12)
- [x] `01_data_prep`: download, label/split checks, header survey of 5,037 records, windows for
  offsets +2.0 s and 0.0 s, 25-alarm replay sample (only the +2.0 s windows were used for training)
- [x] `02_baseline`: neurokit2 + scipy features, XGBoost B0 / B1, thresholds on validation, test once
- [x] `03_cnn`: ResNet1D, C0-C4 and K1-K2 ablations, final C4 chosen by rule, ONNX export,
  `model_config.json` with both thresholds
- [x] Artifacts in `models/`, `data/sample/` and `reports/`; ablation tables in `docs/modeling.md`

### Stage 3 - backend
- [x] FastAPI app: `/health`, `/model`, `/patients`, `/alarms`, `/alarms/{id}`, `/predict`, `/metrics`
- [x] ONNX predictor (onnxruntime CPU) and MOCK predictor, per-inference latency logging
- [x] WebSocket replay: session / chunk / verdict / state / end / error, pause / resume / speed
- [x] pytest with the FastAPI test client (mock mode, synthetic sample) and real-model smoke tests

### Stage 4 - frontend
- [x] Vite + React + TypeScript (strict) + Tailwind (token-only theme) + uPlot + Zustand + Zod
- [x] Live ECG / PPG / ABP strips from ring buffers and a shared animation frame
- [x] Alarm feed, verdict card (text + colour), per-channel quality badges, missing-channel strip
- [x] Session summary (suppressed / escalated, caught / missed, false-alarm reduction)
- [x] Model card, transport bar (pause / resume / speed), auto-advance
- [x] Loading / empty / offline / reconnecting / failed states; keyboard and screen-reader pass
- [x] "SIMULATED REAL-TIME · REPLAYED RECORDINGS" badge and "not for clinical use" footer
- [x] Vitest suite (26 files, 231 tests passing on 2026-10-18)

### Stage 5 - integration and evidence
- [x] Backend in `onnx` mode serves the real model (`resnet1d-C4_all_dropout-off2.0`)
- [x] 25-alarm replay-sample check: 9 of 10 true escalated, 12 of 15 false suppressed
  (`reports/replay_sample_check.json`)
- [x] Latency measured: warm median 40.3 ms, p95 80.5 ms (`docs/api.md`)
- [x] Demo script `docs/demo.md`; sign-off checklist `docs/checkpoint1-signoff.md`
- [x] Plain-language explainers in `docs/explain/`

## Open items (documentation or manual checks only)

- [ ] Manual browser check of the full demo on the target laptop (visual correctness, summary counts,
  frame rate). Not measured so far.
- [ ] Model card gap (D37): the card shows "not available" / "not evaluated yet" for architecture,
  baseline, test PR-AUC and Challenge score because `models/model_config.json` lacks
  `extra.architecture`, `extra.baseline`, `extra.metrics`. Optional fix: add those keys to the
  gitignored file.
- [ ] Parity test: 4 tests in `tests/test_onnx_parity.py` skip because `parity_batch.npz` was never
  exported and the PyTorch weights were not saved (D38).

## Out of scope (not built)

Dropped by decision D32 on 2026-10-18. These do not exist in the repo and must not be claimed.

- Grad-CAM or any attribution / explanation of verdicts (the schema field `verdict.attribution` and
  a "Where the model looked" box exist, but no values are ever computed or sent)
- Drift monitoring (signal-quality drift, prediction drift) and retrain triggers
- Docker images
- GitHub Actions / CI/CD
- DVC (data and artifact versioning)
- MLflow / DagsHub (experiment tracking)
- Model registry and promotion flow
- W0 window ablation (offset 0.0 s): never run
- Multi-seed repeats, external validation, any live monitor integration or clinical validation
