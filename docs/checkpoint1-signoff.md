# Sign-off checklist (final scope)

> Simulated real-time (replayed recordings). Not for clinical use. No live monitor integration.

Status key: [x] verified (with how), [~] done but not fully verified, [ ] open.

Scope was frozen on 2026-10-18 (decision D32): Grad-CAM, drift monitoring, Docker, CI/CD, DVC and
MLflow are not built and not part of this sign-off. Numbers: `docs/modeling.md`, `docs/api.md`.

## 1. What works end to end

- [x] Shared preprocessing `src/vtac/` (load, filter, window, channel mask, quality flags): used by
  both the Colab notebooks and the backend. Verified by pytest (61 passed, 4 skipped on 2026-10-18; the 4 skipped are the parity tests).
- [x] Colab pipeline run: `01_data_prep`, `02_baseline`, `03_cnn` produced `model.onnx`,
  `model_config.json`, `xgb_baseline_off2.0.ubj`, and the replay sample. Verified by the artifacts
  on disk and the metrics inside `model_config.json`.
- [x] Backend in ONNX mode: `VTAC_MODEL_MODE=onnx` served `/model`, `/alarms`, `/alarms/{id}`, and a
  WebSocket replay with a model verdict (user's backend log, 2026-10-12; one verdict: 63 ms total; superseded by the measurement in `docs/api.md`).
- [x] Real model on the 25-alarm sample through the backend's own path: 9/10 true alarms escalated,
  12/15 false alarms suppressed. Verified by `reports/measure_replay_sample.py` (output
  `reports/replay_sample_check.json`, 2026-10-18) and `tests/test_real_model.py` (checks scores,
  separation and channel handling, not exact counts).
- [~] Frontend: connected to the backend and requested the replay (same log). Visual correctness,
  the 60 fps claim and the summary counts were **not** reported back; confirm in the browser.
- [x] Frontend checks re-run on 2026-10-18: `pnpm typecheck` and `pnpm lint` clean, `pnpm test`
  26 files / 231 tests passed. Flaky on this laptop: in 2 of 6 full runs one test (`TransportBar`,
  "has labelled prev / next buttons...") hit Vitest's 5 s default timeout; it passed on rerun.
- [~] Model card: shows runtime and version; architecture, baseline, test PR-AUC and Challenge score
  show "not available" / "not evaluated yet" because `models/model_config.json` lacks
  `extra.architecture`, `extra.baseline`, `extra.metrics` (D37). Numbers for the card are in
  `extra.test`; adding the keys is a one-time edit of the gitignored file.
- [~] Train/serve parity vs PyTorch: test and export cell written (`tests/test_onnx_parity.py`,
  `03_cnn` cell 5); not run on real data yet, see section 5.
- [x] Demo script: `docs/demo.md`.

## 2. Final numbers and their source

Model `resnet1d-C4_all_dropout-off2.0` (ResNet1D, ECG + PPG + ABP slots, focal loss, channel
dropout 0.15, seed 42, window offset +2.0 s). Source: `models/model_config.json` (`extra.val`,
`extra.test`), also tabulated in `docs/modeling.md`. Thresholds were tuned on validation only; test
was applied once.

| Split | Threshold | TPR | TNR | PPV | Challenge Score | PR-AUC | ROC-AUC | Missed true / false escalated |
|---|---|---|---|---|---|---|---|---|
| Val, constrained (TPR >= 0.95) | 0.515 | 0.950 | 0.797 | 0.650 | 0.795 | 0.886 | 0.945 | 7 / 72 |
| **Test, constrained (backend uses this)** | 0.515 | **0.964** | 0.806 | 0.663 | **0.817** (95% CI 0.767-0.867) | 0.875 | 0.946 | 5 / 67 |
| Test, unconstrained (not used) | 0.561 | 0.912 | 0.852 | 0.710 | 0.791 (95% CI 0.710-0.867) | 0.875 | 0.946 | 12 / 51 |

Test counts at the used threshold: 132 true alarms caught of 137; 278 false alarms suppressed of 345.
CIs are patient-level bootstrap (500 resamples).

Replay sample (25 test alarms): 9/10 and 12/15 as above; the missed alarm is `a06fbf_0500`
(p 0.476 vs 0.515). Source: `reports/replay_sample_check.json` (the backend's own predictor); the
dashboard shows the same scores when replayed. This is a demo set, not a performance estimate.

Baselines and ablations (B0/B1, C0-C4, K0-K3) are in `docs/modeling.md`, from `reports/`. On test
the served CNN has about half the false alarms of the best baseline (67 vs 137) at similar recall
(132 vs 133 of 137). W0 (offset 0.0) is not run.

## 3. Known limitations (be upfront about these)

1. **Single model, single seed.** One final run; no seed repeats. The test Challenge Score CI is
   wide (0.77-0.87), and test TPR 0.964 is an estimate, not a guarantee (validation TPR was set to
   exactly 0.95 by construction).
2. **The window offset (+2.0 s, D18) is still a guess.** The W0 vs W1 ablation was not run,
   so results are not directly comparable to published benchmarks that use offset 0.0.
3. **Ablations are single-seed on 495 validation windows.** The pulsatile-channel gain shows up at
   the TPR >= 0.95 operating point (PPV 0.52 -> 0.64), not in PR-AUC, and may partly be threshold
   noise; channel dropout shows no clear val gain. CNN results stratified by channel availability
   are not in the saved reports.
4. **ABP is absent in 13 of the 25 sample alarms**, and PPG was flagged "degraded" (high flat
   fraction) in all 7 windows we inspected (ABP in 3 of the 5 of those that have it). The model is trained to cope with missing
   channels but pulsatile evidence is often weak.
5. **Misses happen.** At the used threshold the test set misses 5 of 137 true alarms; the demo shows
   one. The cost trade-off (5x) is built into the threshold choice; it is not a safety guarantee.
6. **Latency is measured for the backend only.** Warm median 40.3 ms, p95 80.5 ms per verdict
   (250 calls, one run, one laptop; `docs/api.md`). The browser, the WebSocket and the 60 fps claim
   are unmeasured.
7. **PyTorch weights were not saved to Drive** by the original run. Parity vs PyTorch can only be
   checked from the original Colab runtime (section 5). Retraining would produce a different model
   and invalidate every number above.
8. **HR, pulse rate and ABP readouts are display heuristics** (`vtac.display`), not clinical
   measurements and not model inputs.
9. **Replay only.** No live monitor integration, no clinical validation. No explanation of verdicts
   exists (Grad-CAM was dropped); the UI box "Where the model looked" only shows a note. The UI says
   "simulated" in the badge and "not for clinical use" in the footer.
10. The data are one dataset (VTaC), one split; no external validation.

## 4. Open items before sign-off

- [ ] Browser check: waveforms smooth, verdict card, summary counts, missing-channel strip, no
  console errors (see `docs/demo.md`).
- [ ] Parity test (D38): needs `03_cnn` cell 5 from the original training session, which no longer
  exists; accepted as a limitation. `uv run pytest` shows the 4 parity tests as skipped.
- [x] Ablation tables and decisions filled from `reports/`.
- [x] W0 (offset 0.0) run: decided not to run (D35); documented as a limitation.
- [x] Re-run `pnpm test && pnpm typecheck && pnpm lint` in `frontend/` (2026-10-18, all pass).

## 5. The Colab runtime is gone (parity export)

Cell 5 asserts that `final` is in memory. If the runtime was reset, the weights are lost
(`model_state.pt` only exists after cell 5 runs). Do not rerun training to get them: seeded GPU
training is not guaranteed to reproduce the same weights, and a different model would not match
`model.onnx`. In that case the options are: accept the current ONNX-only checks (documented in
limitation 7), or deliberately retrain, re-export everything and redo all numbers.

## 6. Run the demo from a fresh clone

Prerequisites: git with access to the repo, Python 3.11, [uv](https://docs.astral.sh/uv/), Node
20.19+, pnpm. Artifacts are not in git: download from Google Drive (`MyDrive/vtac/`) first.

```bash
git clone git@github.com:siddhu-exe/vtac-alarm-monitor.git
cd vtac-alarm-monitor

# 1. Artifacts from Drive (gitignored): models/ and data/sample/
#    models/model.onnx            <- Drive models/model.onnx
#    models/model_config.json     <- Drive models/model_config.json
#    models/parity_batch.npz      <- optional, for the parity test
#    data/sample/replay_sample.npz, data/sample/replay_index.json  <- Drive replay/

# 2. Backend deps and checks
uv venv --python 3.11 .venv && source .venv/bin/activate
uv pip install -e ".[backend,dev]"
uv run pytest                       # expect all pass; parity tests skip until parity_batch.npz exists
uv run ruff check . && uv run ruff format --check .

# 3. Terminal 1: backend with the real model
VTAC_MODEL_MODE=onnx uv run uvicorn backend.app.main:app
#    check: curl localhost:8000/health   (model_mode "onnx", version resnet1d-C4_all_dropout-off2.0)

# 4. Terminal 2: frontend
cd frontend && pnpm install && pnpm dev
#    open http://localhost:5173 and follow docs/demo.md
```

Without the model, `VTAC_MODEL_MODE=mock` runs the backend with hashed scores (UI only; not a
model). Without the replay sample it also falls back to synthetic alarms.
