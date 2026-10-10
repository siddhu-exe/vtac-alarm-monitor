# API

FastAPI, CPU only. Base URL `http://localhost:8000`. All responses/labels reflect **simulated
real-time (replayed recordings)**. WebSocket message schema: `docs/architecture.md`.

Config via env vars:

| Var | Default | Meaning |
|---|---|---|
| `VTAC_MODEL_MODE` | `mock` | `mock` (dummy predictions; no model file needed) or `onnx` (needs `models/model.onnx` + `model_config.json`; `/health` is `degraded` and `/predict` 503 if the file is missing) |
| `VTAC_N_SYNTHETIC` | `8` | number of synthetic demo alarms when `data/sample/replay_sample.npz` is absent |
| `VTAC_MODEL_DIR` | `models/` | contains `model.onnx`, `model_config.json` |
| `VTAC_SAMPLE_DIR` | `data/sample/` | replay sample |

## REST

### `GET /health`

```json
{"status": "ok", "model_mode": "mock", "model_version": "mock-0", "n_alarms": 8,
 "synthetic_data": true, "sim": true, "label": "simulated real-time (replayed recordings)"}
```

### `GET /model`

Everything the UI needs to interpret a verdict. The frontend reads τ, window offsets and channel
order from here and never hard-codes them. Works in `degraded` mode too (`model_version` null).

```json
{"model_mode": "mock", "model_version": "mock-0", "runtime": "mock predictor (dummy scores)",
 "architecture": null, "baseline": null,
 "metrics": {"test_pr_auc": null, "challenge_score": null},
 "fs": 250, "window_s": 10.0, "window_end_offset_s": 2.0, "alarm_onset_s": 300.0,
 "segment_s": 360.0, "channel_slots": ["ECG_1", "ECG_2", "PPG", "ABP"],
 "threshold": 0.5, "tpr_target": 0.95, "chunk_s": 0.256, "numerics_every_s": 1.0,
 "max_speed": 20.0, "sim": true, "label": "simulated real-time (replayed recordings)"}
```

`architecture`, `baseline` and `metrics` come from `model_config.json` under `extra`
(`extra.architecture`, `extra.baseline`, `extra.metrics.{test_pr_auc,challenge_score}`) and are
`null` until `03_cnn` writes them.

### `GET /patients`

```json
[{"patient_id": "p001", "alarm_ids": ["a001", "a002"]}]
```

### `GET /alarms`

Optional query: `patient_id`.

```json
[{"alarm_id": "a001", "patient_id": "p001", "channels": ["ECG_1","ECG_2","PPG"],
  "duration_s": 360.0, "alarm_onset_s": 300.0, "ground_truth": "false"}]
```

### `GET /alarms/{alarm_id}`

Same as one item above plus `fs`, `sources` (slot -> source channel name or null) and `quality`
(slot -> `good|degraded|bad|absent` for the model window). `404` if unknown. Items also carry
`synthetic: true|false` (true = generated demo alarm, not a real recording).

### `POST /predict`

Predict for a sample alarm (`alarm_id`) **or** for caller-supplied raw samples. In both cases the
backend runs `vtac.preprocess` (the only preprocessing path) and then the model.

Request (exactly one form, otherwise `422`):

```json
{"alarm_id": "a001"}
```
```json
{"signals": [[0.0, null, 0.1]], "mask": [1, 1, 1, 0], "fs": 250}
```

`signals` is **raw, unfiltered** `(4, L)` in slot order `[ECG_1, ECG_2, PPG, ABP]` with
`L >= window_samples` (2500 at 250 Hz); the **last sample is the window end** and any earlier
samples are filter lead-in (up to `context_s`). `null` = missing sample. `mask` (optional) forces
slots to missing (0). `fs` must equal the config `fs`. `alarm_id` form uses the window
`[onset + window_end_offset_s - window_s, onset + window_end_offset_s)`.

Response:

```json
{"p_true": 0.07, "verdict": "FALSE_ALARM", "action": "suppressed", "threshold": 0.31,
 "latency_ms": 11.2, "preprocess_ms": 8.1, "infer_ms": 3.1, "model_mode": "onnx",
 "model_version": "cnn-ecg-ppg-v1", "quality": {"ECG_1": "good", "ECG_2": "good", "PPG": "good",
 "ABP": "absent"}, "mask": [1, 1, 1, 0]}
```

`verdict` in `{TRUE_ALARM, FALSE_ALARM}`; `action` in `{escalated, suppressed}`.
In `mock` mode the score is deterministic from `alarm_id`/signal hash, and the response carries
`"model_mode": "mock"`.

### `GET /metrics` (optional, small)

Rolling inference latency (count, mean, p50, p95) and verdict counts since start.

## WebSocket

`WS /ws/replay/{alarm_id}?speed=1.0&start_s=270&end_s=332` — see `docs/architecture.md` for
message types (`session`, `chunk`, `verdict`, `state`, `end`, `error`) and the client `control`
messages (`pause`, `resume`, `speed`).

| Param | Default | Rule |
|---|---|---|
| `speed` | `1.0` | `0 < speed <= 20` (also the limit for a `speed` control message) |
| `start_s` | onset - 30 s | `0 <= start_s <= alarm_onset_s` (replaying all 5 pre-alarm minutes is rarely useful) |
| `end_s` | window end + 30 s | must be greater than the window end (onset + offset) |

Errors are sent as an `error` message, then the socket closes: unknown alarm -> code 4404
(`not_found`), bad params -> 4400 (`bad_params`), model not loaded -> 4503. An invalid `control`
message gets an `error` with code `bad_control` and the replay carries on (non-terminal).

## Errors

JSON `{"detail": "…"}` for REST (FastAPI default). Codes: `404` unknown alarm, `422` bad input,
`503` model not loaded (use `VTAC_MODEL_MODE=mock`).

## Logging

Each inference logs one structured line: `alarm_id`, `model_mode`, `preprocess_ms`, `infer_ms`,
`total_ms`. Latency is also returned in responses and aggregated by `/metrics`.
