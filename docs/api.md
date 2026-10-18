# API

> Simulated real-time (replayed recordings). Not for clinical use.

FastAPI, CPU only (`backend/app/main.py`). Base URL `http://localhost:8000`. All responses and
labels reflect **simulated real-time (replayed recordings)**. WebSocket message schema:
`docs/architecture.md`. The response examples below are real output of the backend in `onnx` mode
with `models/model.onnx` and the 25-alarm sample, captured 2026-10-18.

Config via env vars (`backend/app/settings.py`):

| Var | Default | Meaning |
|---|---|---|
| `VTAC_MODEL_MODE` | `mock` | `mock` (deterministic dummy scores, no model file needed; UI testing only) or `onnx` (needs `models/model.onnx` + `models/model_config.json`; `/health` is `degraded` and `/predict` returns 503 if the file is missing). The demo uses `onnx` |
| `VTAC_MODEL_DIR` | `models/` | contains `model.onnx`, `model_config.json` |
| `VTAC_SAMPLE_DIR` | `data/sample/` | contains `replay_sample.npz`, `replay_index.json` |
| `VTAC_N_SYNTHETIC` | `8` | number of generated demo alarms used **only** when `replay_sample.npz` is absent (`synthetic: true`) |

CORS allows `http://localhost:5173` and `http://127.0.0.1:5173` (the Vite dev server).

## REST

### `GET /health`

```json
{"status": "ok", "model_mode": "onnx", "model_version": "resnet1d-C4_all_dropout-off2.0",
 "n_alarms": 25, "synthetic_data": false, "sim": true,
 "label": "simulated real-time (replayed recordings)"}
```

`status` is `degraded` when the requested model could not be loaded.

### `GET /model`

Everything the UI needs to interpret a verdict. The frontend reads tau, the window and the channel
order from here and never hard-codes them. Works in `degraded` mode too (`model_version` null).

```json
{"model_mode": "onnx", "model_version": "resnet1d-C4_all_dropout-off2.0",
 "runtime": "onnxruntime (CPU)", "architecture": null, "baseline": null,
 "metrics": {"test_pr_auc": null, "challenge_score": null},
 "fs": 250, "window_s": 10.0, "window_end_offset_s": 2.0, "alarm_onset_s": 300.0,
 "segment_s": 360.0, "channel_slots": ["ECG_1", "ECG_2", "PPG", "ABP"],
 "threshold": 0.5148199200630188, "tpr_target": 0.95, "chunk_s": 0.256,
 "numerics_every_s": 1.0, "max_speed": 20.0, "sim": true,
 "label": "simulated real-time (replayed recordings)"}
```

**Known gap.** `architecture`, `baseline` and `metrics` are read from `extra.architecture`,
`extra.baseline` and `extra.metrics.{test_pr_auc,challenge_score}` in `model_config.json`. The file
written by the Colab run does **not** contain those keys (its `extra` holds `final_run`,
`imbalance`, `dropout_aug`, `seed`, `val`, `test`), so they are `null` and the dashboard's Model card
shows "not available" / "not evaluated yet" for architecture, baseline, test PR-AUC and Challenge
score. The real values are in `extra.test.constrained` (`pr_auc` 0.8747448686387853,
`challenge_score` 0.8167330677290837). Nothing in the backend was changed to bridge this.

### `GET /patients`

```json
[{"patient_id": "105bad", "alarm_ids": ["105bad_0007", "105bad_0333"]}]
```

### `GET /alarms`

Optional query: `patient_id`. Returns 25 items with the real sample.

```json
[{"alarm_id": "105bad_0007", "patient_id": "105bad", "channels": ["ECG_1", "ECG_2", "PPG"],
  "duration_s": 360.0, "alarm_onset_s": 300.0, "ground_truth": "true", "synthetic": false}]
```

`ground_truth` is the expert label; it is used only for the summary panel and is never given to
the model.

### `GET /alarms/{alarm_id}`

Same as one item above plus `fs`, `sources` (slot -> source channel name or null) and `quality`
(slot -> `good|degraded|bad|absent` for the model window). `404` if unknown.

```json
{"alarm_id": "a06fbf_0500", "patient_id": "a06fbf",
 "channels": ["ECG_1", "ECG_2", "PPG", "ABP"], "duration_s": 360.0, "alarm_onset_s": 300.0,
 "ground_truth": "true", "synthetic": false, "fs": 250,
 "sources": {"ECG_1": "II", "ECG_2": "V", "PPG": "PLETH", "ABP": "ABP"},
 "quality": {"ECG_1": "good", "ECG_2": "good", "PPG": "degraded", "ABP": "good"}}
```

### `POST /predict`

Predict for a sample alarm (`alarm_id`) **or** for caller-supplied raw samples. In both cases the
backend runs `vtac.preprocess` (the only preprocessing path) and then the model. Exactly one form,
otherwise `422`.

```json
{"alarm_id": "a06fbf_0500"}
```
```json
{"signals": [[0.0, null, 0.1]], "mask": [1, 1, 1, 0], "fs": 250}
```

`signals` is **raw, unfiltered** `(4, L)` in slot order `[ECG_1, ECG_2, PPG, ABP]` with
`L >= 2500` (10 s at 250 Hz); the **last sample is the window end** and any earlier samples are
filter lead-in. `null` = missing sample. `mask` (optional) forces slots to missing (0). `fs` must be
250. The `alarm_id` form scores the window ending at onset + `window_end_offset_s`
(292 s to 302 s).

Response (real, for `a06fbf_0500`, the one missed true alarm in the sample):

```json
{"p_true": 0.47603503973765776, "verdict": "FALSE_ALARM", "action": "suppressed",
 "threshold": 0.5148199200630188, "latency_ms": 56.75, "preprocess_ms": 23.42, "infer_ms": 33.33,
 "model_mode": "onnx", "model_version": "resnet1d-C4_all_dropout-off2.0",
 "quality": {"ECG_1": "good", "ECG_2": "good", "PPG": "degraded", "ABP": "good"},
 "mask": [1, 1, 1, 1]}
```

`verdict` is `TRUE_ALARM` or `FALSE_ALARM`; `action` is `escalated` (when `p_true >= threshold`) or
`suppressed`. In `mock` mode the score is a hash of the window and `model_mode` is `mock`.
`latency_ms` varies from call to call (this one is a single call).

### `GET /metrics`

Rolling inference latency since start (last 1,000 inferences): `count`, `mean_ms`, `p50_ms`,
`p95_ms` and verdict counts. With no inference yet the latency fields are `null`.

```json
{"count": 1, "mean_ms": 56.75, "p50_ms": 56.75, "p95_ms": 56.75,
 "verdicts": {"FALSE_ALARM": 1}, "model_mode": "onnx", "sim": true}
```

## WebSocket

`WS /ws/replay/{alarm_id}?speed=1.0&start_s=286&end_s=304`; message types are `session`, `chunk`,
`verdict`, `state`, `end`, `error` (server -> client) and `control` (client -> server). Full schema:
`docs/architecture.md`; models: `backend/app/ws_schemas.py` (mirrored as Zod schemas in
`frontend/src/stream/schemas.ts`).

| Param | Default | Rule |
|---|---|---|
| `speed` | `1.0` | `0 < speed <= 20` (also the limit for a `speed` control message) |
| `start_s` | onset - 30 s (270 s) | `0 <= start_s <= alarm_onset_s` |
| `end_s` | window end + 30 s (332 s) | must be greater than the window end (302 s) |

The dashboard asks for the span `[window start - 6 s, window end + 2 s]` = 286 s to 304 s, taken from
`GET /model`.

The verdict is computed from samples up to the window end only and sent when simulated time reaches
that point. `verdict.attribution` is part of the schema but is **never populated** (no attribution
method was built).

Errors are sent as an `error` message, then the socket closes: unknown alarm -> code 4404
(`not_found`), bad params -> 4400 (`bad_params`), model not loaded -> 4503. An invalid `control`
message gets an `error` with code `bad_control` and the replay carries on.

## Errors

JSON `{"detail": "..."}` for REST (FastAPI default). Codes: `404` unknown alarm, `422` bad input,
`503` model not loaded (use `VTAC_MODEL_MODE=mock`).

## Latency (measured)

Each inference logs one structured line (`alarm_id`, `model_mode`, `preprocess_ms`, `infer_ms`,
`total_ms`, `verdict`) and is returned in responses and aggregated by `/metrics`.

Measured by `reports/measure_replay_sample.py` on 2026-10-18; raw output
`reports/replay_sample_check.json`. It calls the backend's `InferenceService` (the same code path as
`/predict` and the WebSocket verdict: `vtac.preprocess_slots` then the ONNX model) for each of the 25
sample alarms at the verdict window end. It does **not** include the WebSocket, JSON encoding or the
browser. Machine: Intel Core i3 M 380 @ 2.53 GHz, 4 logical CPUs, 5.7 GB RAM, Python 3.11.17,
onnxruntime CPU with 2 intra-op threads.

| Pass | Calls | Median (ms) | p95 (ms) | Mean (ms) | Max (ms) |
|---|---|---|---|---|---|
| First pass: each alarm once, right after model load (cold effects included) | 25 | 66.2 | 91.4 | 67.5 | 97.9 |
| **Warm: 10 further passes** | 250 | **40.3** | **80.5** | 48.0 | 153.8 |
| Warm, preprocessing part | 250 | 17.9 | 38.4 | 21.7 | 65.3 |
| Warm, ONNX inference part | 250 | 20.8 | 45.7 | 26.3 | 134.7 |

Notes and limits:

- One run on one machine, with other programs possibly running; the spread (p95 about twice the
  median) shows the laptop's timing is noisy. Re-run the script to get fresh numbers.
- Earlier informal figures (a single 63 ms verdict from a backend log; "~240 ms average, max 335 ms"
  from an offline loop) were not reproduced by this measurement; the 240 ms loop was never explained
  and is superseded by the table above.
- End-to-end latency in the browser and the 60 fps rendering claim are **not measured**.
