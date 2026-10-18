# Architecture

> Simulated real-time (replayed recordings). No live monitor integration.

## Components

```
        Google Colab                         Google Drive                    Laptop
 ┌───────────────────────────┐          ┌──────────────────┐        ┌─────────────────────────┐
 │ 01_data_prep              │  .npz    │ processed/       │        │ backend (FastAPI+ORT)   │
 │ 02_baseline (XGBoost)     ├─────────►│ replay/          ├───────►│  REST + WebSocket       │
 │ 03_cnn (PyTorch→ONNX)     │  .onnx   │ models/          │ manual │  ONNX (served) or MOCK  │
 │  └ imports src/vtac       │          │  model.onnx      │ copy   │  └ imports src/vtac     │
 └───────────────────────────┘          │  model_config.json│       └───────────┬─────────────┘
          ▲  pip install from GitHub    │ reports/          │                   │ ws/http
          └──────────── src/vtac ───────┴──────────────────┴───────────────────┤
                                                                       ┌────────▼────────────┐
                                                                       │ frontend (React+uPlot)│
                                                                       └──────────────────────┘
```

Final components (everything below exists and is exercised by the tests):

1. **`src/vtac/`** — single source of truth for preprocessing and the decision config:
   `config.py` (all constants, saved as `model_config.json`), `io.py` (WFDB/CSV loading, Colab
   only), `channels.py` (slot mapping, quality, mask), `filters.py`, `windows.py`, `preprocess.py`
   (the only raw -> model-input path), `features.py` (baseline features), `metrics.py` (PR-AUC,
   ROC-AUC, Challenge Score, threshold tuning, patient-level bootstrap), `splits.py`, `dataset.py`
   (npz I/O), `display.py` (dashboard HR / pulse / ABP readouts, never model inputs),
   `synthetic.py` (test and fallback signals), `provenance.py`.
2. **Colab notebooks** — `01_data_prep`, `02_baseline`, `03_cnn`: heavy work; produce the windows
   `.npz`, the replay sample, the ONNX model, the metrics and the tuned threshold.
3. **Backend** (`backend/app/`) — see "Backend" below.
4. **Frontend** (`frontend/`) — live ECG/PPG/ABP waveforms (uPlot), alarm feed, verdict card,
   signal-quality badges, session summary, model card, transport controls. Details below.
5. **Tests** — `tests/` (pytest, synthetic signals, plus real-model smoke tests that skip when the
   artifacts are absent) and `frontend/src/**/*.test.*` (Vitest).

**Not built** (dropped from scope, see `docs/roadmap.md`): Grad-CAM or any attribution, drift
monitoring, Docker, CI/CD, DVC, MLflow, model registry.

## Data flow (Colab -> Drive -> laptop)

1. `01_data_prep` (Colab): download VTaC, check the labels and split (patient-level assertion), survey
   every header, preprocess every event with `vtac` for offsets +2.0 s and 0.0 s, write
   `processed/windows_off{2.0,0.0}.npz` and `windows_meta.json`, `reports/data_survey.json`, and
   export 25 test alarms (10 true, 15 false) as raw slot-ordered segments to
   `replay/replay_sample.npz` + `replay_index.json`. (Only the +2.0 s windows were used for
   training.)
2. `02_baseline` / `03_cnn` (Colab): read `processed/windows_off2.0.npz`, train on the train split,
   early-stop and tune the threshold on validation, evaluate on test once, and write
   `reports/baseline_metrics_off2.0.json`, `reports/cnn_val_ablation_off2.0.csv`,
   `models/model.onnx` and `models/model_config.json`.
3. Laptop: copy `model.onnx` and `model_config.json` into `models/`, the replay sample into
   `data/sample/`, and the reports into `reports/`. `uv pip install -e ".[backend,dev]"`, run the
   backend and the frontend. No raw data and no training on the laptop.

## Model I/O contract

The backend reads every value below from `models/model_config.json` (written by `03_cnn` as
`VtacConfig.to_dict()`); nothing is hard-coded in the backend or the UI.

**Segments (verified for all 5,037 records, `reports/data_survey.json`):** 90,000 samples at 250 Hz
= 360 s (5 min before alarm onset + 1 min after); onset at sample 75,000 (t = 300 s). All channels
are at 250 Hz.

**Window:** `window_s = 10` s ending at `alarm_onset_s + window_end_offset_s` = 300 + 2.0 s, so the
model sees t = 292 s to 302 s (8 s before to 2 s after onset), `T = 2500` samples. The offset is
configurable (`vtac.config.VtacConfig`); offset `0.0` reproduces the official benchmark window
(samples 72,500:75,000) but was not trained (D18/D19, `docs/decisions.md`). The verdict is produced
at onset + offset in the replay, from samples up to that point only.

**Input**

| Name | Shape | dtype | Notes |
|---|---|---|---|
| `signals` | `(N, 4, 2500)` | float32 | filtered, per-channel z-scored; zeros where the channel is missing |
| `mask` | `(N, 4)` | float32 | 1.0 = channel present and usable, 0.0 = missing |

**Channel order (slots, fixed):** `[ECG_1, ECG_2, PPG, ABP]`. This matches the layout the official
benchmark code uses (indices 0,1 = ECG, 2 = PPG, 3 = ABP). PPG and ABP are separate slots so the
ECG-only / +PPG / +ABP ablation is just a mask. Source channel names come from each record header and
are mapped to slots in `vtac.channels.select_slots`.

All preprocessing (filters, interpolation, window, z-score, mask) is `vtac.preprocess`; the ONNX
graph takes already-processed input.

**Output**

| Name | Shape | Notes |
|---|---|---|
| `logit` | `(N, 1)` | raw score; `p_true = sigmoid(logit)` |

Verdict = `TRUE_ALARM` if `p_true >= threshold` else `FALSE_ALARM`; `threshold` comes from
`model_config.json` (the TPR-constrained operating point, see `docs/modeling.md`). The export uses
ONNX opset 17 and a dynamic batch axis; the backend scores one window per call (batch of 1).

`model_config.json` (written by `03_cnn`; abridged, the file also holds every filter, quality and
display-readout constant of `VtacConfig`). Real values from `models/model_config.json`:

```json
{
  "model_version": "resnet1d-C4_all_dropout-off2.0",
  "fs": 250, "segment_samples": 90000, "alarm_onset_s": 300.0,
  "window_s": 10.0, "window_end_offset_s": 2.0,
  "channel_slots": ["ECG_1", "ECG_2", "PPG", "ABP"],
  "input_shape": ["N", 4, 2500],
  "tpr_target": 0.95,
  "threshold": 0.5148199200630188,
  "threshold_constrained": 0.5148199200630188,
  "threshold_unconstrained": 0.5606065988540649,
  "vtac_git_ref": "6d30bd26a7e2e7dc149b069c0c111d701fc66325",
  "extra": {"final_run": "C4_all_dropout", "imbalance": "focal", "dropout_aug": 0.15, "seed": 42,
            "val": {"constrained": {}, "unconstrained": {}},
            "test": {"constrained": {}, "unconstrained": {}}}
}
```

`extra.val` / `extra.test` hold the full confusion counts and metrics at both thresholds (tabulated in
`docs/modeling.md`). `extra.architecture`, `extra.baseline` and `extra.metrics`, which `GET /model`
reads for the Model card, are **not present** (see `docs/api.md`, "Known gap").

## WebSocket message schema

Endpoint: `WS /ws/replay/{alarm_id}?speed=1.0&start_s=&end_s=` (params in `docs/api.md`). All
messages are JSON with a `type` field; the `session` message carries `sim: true` and the label
"simulated real-time (replayed recordings)". Times are seconds relative to segment start
(`t`); alarm onset is at `alarm_onset_s` = 300 s, the segment is 360 s long.

Server -> client:

```jsonc
// 1. once, on connect
{"type": "session", "alarm_id": "…", "patient_id": "…", "fs": {"ECG_1": 250, "PPG": 250},
 "channels": ["ECG_1","ECG_2","PPG"], "alarm_onset_s": 300.0, "window_end_s": 302.0,
 "duration_s": 360.0, "start_s": 270.0, "end_s": 332.0, "speed": 1.0,
 "model_mode": "onnx|mock", "synthetic": false, "sim": true,
 "label": "simulated real-time (replayed recordings)"}

// 2. repeated, ~every 250 ms of simulated time. `numerics` (display-only readouts from
//    vtac.display, over the trailing numerics_window_s) is present on the first chunk and about
//    once per numerics_every_s after that; a null value means "not measurable right now".
{"type": "chunk", "t0": 12.0, "channels": {"ECG_1": [/* floats or null */], "PPG": [/* … */]},
 "quality": {"ECG_1": "good|degraded|bad|absent", "PPG": "good"},
 "numerics": {"hr_bpm": 84.0, "pr_bpm": 83.5, "abp_sys": 118.0, "abp_dia": 72.0, "abp_map": 87.3}}

// 3. once, right after the chunk that reaches the window end (onset + window_end_offset_s);
//    computed only from samples up to that point. `attribution` is OPTIONAL and is never sent
//    (no attribution method was built; the schema and the UI can render it if one is ever added):
//    per_channel[slot] = one importance in [0,1] per equal time bin over [t - window_s, t], same
//    bin count for every slot; channel_share sums to 1.
{"type": "verdict", "alarm_id": "…", "t": 302.0, "p_true": 0.07, "verdict": "FALSE_ALARM",
 "action": "suppressed|escalated", "threshold": 0.31, "latency_ms": 11.2,
 "quality": {"ECG_1": "good"}, "mask": [1, 1, 1, 0],
 "ground_truth": "true|false", "model_mode": "onnx|mock", "model_version": "…",
 "attribution": {"method": "gradcam", "per_channel": {"ECG_1": [0.1, 0.9]},
                 "channel_share": {"ECG_1": 1.0}}}

// 3b. acknowledgement of every valid control message (the replay starts out playing)
{"type": "state", "playing": true, "speed": 2.0}

// 4. end of recording
{"type": "end", "alarm_id": "…"}

// errors
{"type": "error", "code": "…", "message": "…"}
```

`ground_truth` is included only for the demo/summary panel (to show suppressed vs caught); the
model never sees it.

Client -> server (transport control; each valid message is answered with a `state` message, an
invalid one with a non-terminal `error` of code `bad_control`):

```jsonc
{"type": "control", "action": "pause"}
{"type": "control", "action": "resume"}
{"type": "control", "action": "speed", "speed": 2.0}   // 0 < speed <= max_speed (GET /model)
```

Pausing stops the stream (no messages, including no chunks, until `resume`); resuming re-bases the
pacing, so there is never a catch-up burst. `seek` is not supported. The message models live in
`backend/app/ws_schemas.py` (Pydantic) and are mirrored in the frontend as Zod schemas.

Full REST and schema details: `docs/api.md`.

## Frontend

`frontend/` — Vite, React 18, TypeScript (strict), Tailwind 3.4, uPlot, Zustand, Zod. Design source:
`docs/design/live-monitor/` (dark clinical theme; the page always says it is a simulated replay).

**Layers (data flows one way, top to bottom):**

| Layer | Where | Job |
|---|---|---|
| Boundary | `src/api`, `src/stream/schemas.ts` | Every REST response and WebSocket frame is parsed with Zod. `parseServerMessage` never throws: a bad frame is counted and dropped, an unknown `type` is ignored (forward compatible). |
| Stream | `src/stream` | `ReplayClient`: one socket per alarm, reconnect with exponential backoff + jitter (max 10 attempts, then a manual retry), a heartbeat watchdog that is off while paused, no retry for terminal errors (4400/4404/4503), pause/speed re-applied after a reconnect. `ReplayController` wires it to the store and the live buffers, and does auto-advance. |
| State | `src/store` | Zustand slices (stream, alarms, selection, playback), one store per app instance via a provider (no module-level state). Holds only slow data: connection, alarm list, verdicts, summary, transport. |
| Live data | `src/features/waveforms` | `LiveBuffers`: typed-array ring buffers (Float32, NaN = missing), quality, numerics and the replay clock, **outside React**. |
| View | `src/features/*`, `src/app` | Components. Samples never go through React state. |

**Performance model.** A chunk (about 4 per simulated second per channel) is written into a ring
buffer and requests a frame; one shared `requestAnimationFrame` loop then calls `setData` on each
strip's single uPlot instance, and only when something arrived. React re-renders only for slow
events: a verdict, a connection change, and readouts/quality (throttled to 4 Hz). Feed rows are
memoised, so a verdict re-renders one row. The display is a fixed-axis sweep, so the x-axis does
not move while the trace fills in.

**Window and axis come from `GET /model`**, never constants: the visible span is
`[window start − 6 s, window end + 2 s]` (with the defaults 286–304 s, i.e. −14…+4 s around the
onset), the model input window is `[onset + offset − window_s, onset + offset]` (−8…+2 s). The
stream request uses the same span as `start_s`/`end_s`.

**Decision logic** lives in `features/alarms/verdict.ts` and is pure: escalate when
`p_true >= threshold` (inclusive; the threshold comes with each verdict). The summary counts
decisions against the expert label; the expert label is shown only after the verdict has arrived.

**Design tokens.** All colours, spacing, radii and type sizes are CSS variables in
`src/design/tokens.css`, exposed through a token-only Tailwind theme (the default palette and scale
are replaced, so an off-token class does not exist). ESLint rejects hex colours and arbitrary pixel
values outside the token files. uPlot colours are read from the same variables at runtime. A unit
test checks the WCAG contrast of the text/background token pairs.

**States.** Loading, empty, offline, reconnecting and failed are shown as a calm banner above the
dashboard (the layout stays; waveform panel height is reserved), with a *Try again* button only when
retrying can help. A render crash shows a message and a reload button instead of a blank page.

**Accessibility.** Real buttons; `aria-pressed` on speed and auto-advance; icon buttons have an
`aria-label`; the feed is an ARIA grid with a roving tabindex (Up/Down/Home/End move, Enter or Space
selects); visible focus rings; every verdict, quality level and connection state is also written as
text; skip link; `prefers-reduced-motion` stops the live-dot pulse.

**Environment.** `VITE_API_URL` (default `/api`) and `VITE_WS_URL` (an origin; empty = same
origin) are validated at start-up. The dev server proxies `/api` and `/ws` to
`VTAC_BACKEND_URL` (default `http://127.0.0.1:8000`).

**Not in the UI (on purpose).** SpO₂ (no source in the data; the PLETH readout is pulse rate), a
free-text "reason" for a verdict (nothing in the model produces one), and any claim that a nurse
was paged. The verdict card has a "Where the model looked" box; because no attribution is computed
it shows a plain note instead of numbers. That note currently says attribution is "planned for
checkpoint 2"; the plan was dropped (the wording lives in
`frontend/src/features/verdict/AttributionBars.tsx` and was not changed).

**Model card.** It shows architecture, runtime, version, test PR-AUC, Challenge score and baseline
from `GET /model`. With the current `model_config.json` only runtime and version are filled; the
other four show "not available" / "not evaluated yet" (`docs/api.md`, "Known gap").

## Backend

`backend/app/` (FastAPI, onnxruntime CPU, no torch):

| Module | Job |
|---|---|
| `main.py` | App factory and all routes: `/health`, `/model`, `/patients`, `/alarms`, `/alarms/{id}`, `/predict`, `/metrics`, `WS /ws/replay/{id}` |
| `settings.py` | Env-var config (`VTAC_MODEL_MODE`, `VTAC_MODEL_DIR`, `VTAC_SAMPLE_DIR`, `VTAC_N_SYNTHETIC`), chunk size 0.256 s |
| `store.py` | Loads `model_config.json` (via `vtac.config`) and the replay sample; falls back to generated synthetic alarms when the sample is absent |
| `model.py` | `OnnxPredictor` (checks input/output names and shapes against the config) and `MockPredictor` (hash-based dummy scores, labelled `mock`) |
| `service.py` | `InferenceService`: raw slot window -> `vtac.preprocess_slots` -> predictor -> verdict, with timing and a log line |
| `replay.py`, `control.py` | Simulated real-time stream: paced chunks, numerics once a second, one verdict at the window end; pause / resume / speed with drift-free pacing |
| `latency.py` | Rolling latency tracker behind `/metrics` |
| `schemas.py`, `ws_schemas.py` | Pydantic models for REST and WebSocket; `extra="forbid"` on every wire message |

Mock mode exists so the UI could be built before the model, and for tests. The demo uses `onnx`.

## Train/serve skew control

`vtac.preprocess` is the only code path from raw WFDB signal to model input. Tests assert that the
named-channel path (notebooks), the slot-array path (replay sample) and the explicit-window path
(`POST /predict` with raw samples) produce identical tensors for the same synthetic record
(`tests/test_preprocess.py`).
