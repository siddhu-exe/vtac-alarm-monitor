# API

FastAPI, CPU only. Base URL `http://localhost:8000`. All responses/labels reflect **simulated
real-time (replayed recordings)**. WebSocket message schema: `docs/architecture.md`.

Config via env vars:

| Var | Default | Meaning |
|---|---|---|
| `VTAC_MODEL_MODE` | `onnx` | `onnx` or `mock` (dummy predictions; no model file needed) |
| `VTAC_MODEL_DIR` | `models/` | contains `model.onnx`, `model_config.json` |
| `VTAC_SAMPLE_DIR` | `data/sample/` | replay sample |

## REST

### `GET /health`

```json
{"status": "ok", "model_mode": "mock", "model_version": "mock-0", "n_alarms": 25, "sim": true}
```

### `GET /patients`

```json
[{"patient_id": "p001", "alarm_ids": ["a001", "a002"]}]
```

### `GET /alarms`

Optional query: `patient_id`.

```json
[{"alarm_id": "a001", "patient_id": "p001", "channels": ["ECG_1","ECG_2","PPG"],
  "duration_s": 600.0, "alarm_onset_s": 300.0, "ground_truth": "false"}]
```

### `GET /alarms/{alarm_id}`

Same as one item above plus per-channel `fs` and `quality` summary. `404` if unknown.

### `POST /predict`

Predict for one already-extracted window **or** reference a sample alarm (the backend then extracts
the window with `vtac`).

Request (either form):

```json
{"alarm_id": "a001"}
```
```json
{"signals": [[0.0]], "mask": [1, 1, 1, 0], "fs": 250}
```

`signals` shape is `(C, T)` raw (unnormalized) channel-slot order from `model_config.json`; the
backend applies `vtac` preprocessing. Validation: shape/mask length must match config -> `422`.

Response:

```json
{"p_true": 0.07, "verdict": "FALSE_ALARM", "action": "suppressed", "threshold": 0.31,
 "latency_ms": 11.2, "model_mode": "onnx", "model_version": "cnn-ecg-ppg-v1"}
```

`verdict` in `{TRUE_ALARM, FALSE_ALARM}`; `action` in `{escalated, suppressed}`.
In `mock` mode the score is deterministic from `alarm_id`/signal hash, and the response carries
`"model_mode": "mock"`.

### `GET /metrics` (optional, small)

Rolling inference latency (count, mean, p50, p95) and verdict counts since start.

## WebSocket

`WS /ws/replay/{alarm_id}?speed=1.0` — see `docs/architecture.md` for message types
(`session`, `chunk`, `verdict`, `end`, `error`). `speed` in `(0, 20]`. Unknown alarm -> `error`
then close with code 4404.

## Errors

JSON `{"detail": "…"}` for REST (FastAPI default). Codes: `404` unknown alarm, `422` bad input,
`503` model not loaded (use `VTAC_MODEL_MODE=mock`).

## Logging

Each inference logs one structured line: `alarm_id`, `model_mode`, `preprocess_ms`, `infer_ms`,
`total_ms`. Latency is also returned in responses and aggregated by `/metrics`.
