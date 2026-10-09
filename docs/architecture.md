# Architecture

> Simulated real-time (replayed recordings). No live monitor integration.

## Components

```
        Google Colab                         Google Drive                    Laptop
 ┌───────────────────────────┐          ┌──────────────────┐        ┌─────────────────────────┐
 │ 01_data_prep              │  .npz    │ vtac/windows.npz │        │ backend (FastAPI+ORT)   │
 │ 02_baseline (XGBoost)     ├─────────►│ vtac/replay_*    ├───────►│  REST + WebSocket       │
 │ 03_cnn (PyTorch→ONNX)     │  .onnx   │ vtac/models/     │ manual │  MOCK or ONNX model     │
 │  └ imports src/vtac       │          │  model.onnx      │ copy   │  └ imports src/vtac     │
 └───────────────────────────┘          │  model_config.*  │        └───────────┬─────────────┘
          ▲  pip install from GitHub    └──────────────────┘                    │ ws/http
          └──────────── src/vtac ──────────────────────────────────────────────┤
                                                                       ┌────────▼────────────┐
                                                                       │ frontend (React+uPlot)│
                                                                       └──────────────────────┘
```

1. **`src/vtac/`** — single source of truth for preprocessing: config, WFDB loading, bandpass
   filtering, window extraction, channel selection + mask, feature extraction.
2. **Colab notebooks** — heavy work; produce windows `.npz`, replay sample, ONNX model, metrics,
   and the tuned threshold.
3. **Backend** — loads ONNX with onnxruntime (CPU), replays recordings in simulated real time,
   runs `vtac` preprocessing on the alarm window, returns verdicts, logs per-inference latency.
4. **Frontend** — live ECG/PPG/ABP waveforms (uPlot), alarm feed, signal-quality badges, summary
   panel, Grad-CAM placeholder.

## Data flow (Colab -> Drive -> laptop)

1. `01_data_prep` (Colab): download VTaC, verify schema, preprocess via `vtac`, write
   `windows.npz` (windows, labels, split, ids) to Drive; export ~25 test alarms as a replay sample.
2. `02_baseline` / `03_cnn` (Colab): read `windows.npz` from Drive, train, evaluate on the official
   split, tune threshold on validation, export `model.onnx` + `model_config.json` to Drive.
3. Laptop: download `model.onnx`, `model_config.json` into `models/` and the replay sample into
   `data/sample/`. `pip install -e ".[backend,dev]"`, run backend + frontend.

## Model I/O contract

Values marked **TBD** are fixed after data verification (`docs/data.md`) and then written to
`model_config.json`; the backend reads that file rather than hardcoding.

**Window:** 10 s centered/anchored around alarm onset per `config` (default: the 10 s ending at
alarm onset + `post_onset_s` TBD; decided in `01_data_prep` and recorded in `docs/decisions.md`).

**Input**

| Name | Shape | dtype | Notes |
|---|---|---|---|
| `signals` | `(N, C, T)` | float32 | `C` = fixed channel slots, `T = window_s * fs` (TBD after verification) |
| `mask` | `(N, C)` | float32 | 1.0 = channel present and usable, 0.0 = missing |

**Channel order (slots, fixed):** `[ECG_1, ECG_2, PPG, ABP]` — proposed. Exact source channel names
are mapped to these slots in `vtac.config` after verification (record names vary across records).
Missing channels are zero-filled and masked; they are never silently imputed.

Per-channel normalization (e.g., robust z-score per window) is applied in `vtac`, before the model;
the ONNX graph takes already-normalized input.

**Output**

| Name | Shape | Notes |
|---|---|---|
| `logit` | `(N, 1)` | raw score; `p_true = sigmoid(logit)` |

Verdict = `TRUE_ALARM` if `p_true >= threshold` else `FALSE_ALARM`; `threshold` comes from
`model_config.json` (tuned for the 1:5 cost). Opset and dynamic batch axis set at export.

`model_config.json` (written by `03_cnn`):

```json
{
  "model_version": "cnn-ecg-ppg-v1",
  "fs": null,
  "window_s": 10,
  "channel_slots": ["ECG_1", "ECG_2", "PPG", "ABP"],
  "input_shape": ["N", 4, null],
  "threshold": null,
  "metrics": {"val": {}, "test": {}},
  "vtac_git_ref": null
}
```

## WebSocket message schema

Endpoint: `WS /ws/replay/{alarm_id}?speed=1.0`. All messages are JSON with a `type` field and a
`sim` flag making the simulated nature explicit. Times are seconds relative to segment start
(`t`), where alarm onset is at `alarm_onset_s` (5 min = 300 s expected; verify).

Server -> client:

```jsonc
// 1. once, on connect
{"type": "session", "alarm_id": "…", "patient_id": "…", "fs": {"ECG_1": 250, "PPG": 125},
 "channels": ["ECG_1","ECG_2","PPG"], "alarm_onset_s": 300.0, "duration_s": 600.0,
 "speed": 1.0, "model_mode": "onnx|mock", "sim": true,
 "label": "simulated real-time (replayed recordings)"}

// 2. repeated, ~every 250 ms of simulated time
{"type": "chunk", "t0": 12.0, "channels": {"ECG_1": [/* floats */], "PPG": [/* floats */]},
 "quality": {"ECG_1": "good|degraded|bad|absent", "PPG": "good"}}

// 3. once when replay time reaches alarm onset (+ the data needed for the window)
{"type": "verdict", "alarm_id": "…", "t": 305.0, "p_true": 0.07, "verdict": "FALSE_ALARM",
 "action": "suppressed|escalated", "threshold": 0.31, "latency_ms": 11.2,
 "ground_truth": "true|false", "model_mode": "onnx|mock"}

// 4. end of recording
{"type": "end", "alarm_id": "…"}

// errors
{"type": "error", "code": "…", "message": "…"}
```

`ground_truth` is included only for the demo/summary panel (to show suppressed vs caught); the
model never sees it. Client -> server: `{"type": "control", "action": "pause|resume|seek", "t": 0}`
(optional in checkpoint 1; `speed` query param is the minimum).

Full REST and schema details: `docs/api.md`.

## Train/serve skew control

`vtac.preprocess` is the only code path from raw WFDB signal to model input. Tests assert that
the backend path and the notebook path produce identical tensors for the same synthetic record.
