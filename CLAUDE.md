# CLAUDE.md

## Project

ICU VT false-alarm reduction — "AI-Based Continuous Patient Monitoring Dashboard".
Bedside ICU monitors raise many ventricular tachycardia (VT) alarms and most are false (alarm
fatigue). This system replays real ICU waveforms (ECG + PPG/ABP) from the VTaC dataset, classifies
each VT alarm as true/false, and shows the result on a live-style dashboard. Goal: suppress false
alarms while almost never missing a true one (missed true alarm costs 5x a false alarm).

All UI/docs must label the system **"simulated real-time (replayed recordings)"**. Never claim live
monitor integration.

## Hardware constraint — Colab vs laptop

The laptop has low RAM and an old CPU.

| Runs in Google Colab | Runs on the laptop |
|---|---|
| Dataset download, full-dataset preprocessing | FastAPI backend (onnxruntime, CPU) |
| Feature extraction, XGBoost baseline | Frontend (Vite dev server) |
| CNN training, ablations, threshold tuning | pytest on small synthetic fixtures |
| ONNX export | Replaying the ~25-alarm sample |

Artifacts flow Colab -> Google Drive -> laptop (`models/`, `data/sample/`). See
`docs/colab-workflow.md`.

## Repo map

- `src/vtac/` — shared package (config, WFDB loading, bandpass filter, 10 s window extraction,
  channel selection + missing-channel mask, features). Installed in Colab from GitHub AND imported by
  the backend.
- `notebooks/` — `01_data_prep`, `02_baseline`, `03_cnn` (Colab).
- `backend/` — FastAPI app: REST, WebSocket replay, MOCK model mode, latency logging.
- `frontend/` — Vite + React + TypeScript + Tailwind + uPlot.
- `data/sample/` — replay sample (gitignored except README). `models/` — gitignored except the served `model.onnx` + `model_config.json`.
- `tests/` — pytest. `docs/` — architecture, data, modeling, api, roadmap, decisions, colab-workflow.

## Commands

Local (laptop) only; nothing here is heavy.

```bash
uv venv --python 3.11 .venv && source .venv/bin/activate   # Python 3.11 (see .python-version)
uv pip install -e ".[backend,dev]"        # light: no torch, no xgboost, no neurokit2
uv run pytest                             # small synthetic fixtures only
uv run ruff check . && uv run ruff format --check .
VTAC_MODEL_MODE=mock uv run uvicorn backend.app.main:app --reload   # mock is the default for now
cd frontend && pnpm install && pnpm dev    # http://localhost:5173, proxies /api and /ws to :8000
```

Frontend (all from `frontend/`; Node 20.19+ and pnpm):

```bash
pnpm dev          # Vite dev server (backend on 127.0.0.1:8000, override with VTAC_BACKEND_URL)
pnpm test         # Vitest + Testing Library (jsdom)
pnpm typecheck    # tsc, strict
pnpm lint         # ESLint, zero warnings allowed
pnpm format       # Prettier (format:check in CI-style runs)
pnpm build        # typecheck + lint + vite build
pnpm preview      # serve the production build
```

Colab: `pip install "vtac[train] @ git+@<ref>"` (see
`docs/colab-workflow.md`). Commands above are targets; they work once the corresponding code exists.

## Conventions

- Python 3.10+, full type hints on all signatures, `from __future__ import annotations`.
- Small modules with one responsibility; pure functions where possible; no global mutable state.
- Config lives in `src/vtac/config.py` (+ a saved YAML/JSON next to the model); no magic numbers
  inline. Threshold, window length, sampling rate, channel order all come from config.
- Frontend: TypeScript strict (no `any`, no non-null `!`), function components, uPlot for waveforms
  (no other chart lib, no UI kit). See `docs/architecture.md` (Frontend) for the layers.
  - Every REST/WebSocket payload is parsed with Zod in `src/api` / `src/stream/schemas.ts`; the
    schemas mirror `backend/app/ws_schemas.py` and must change together with it.
  - Colours, spacing, radii and type sizes come only from `src/design/tokens.css` via the Tailwind
    theme. No hex values or arbitrary pixel classes in components (ESLint enforces it).
  - Per-sample data never goes through React state or Zustand: it lives in `LiveBuffers` (typed-array
    rings) and is drawn in the shared animation frame. Zustand holds slow state only.
  - The escalate/suppress rule (`p >= tau`), τ, the window and channel order come from the backend
    (`/model` and the verdict), never constants in the UI. Decision logic is in
    `features/alarms/verdict.ts`.
  - UI states are part of the feature: loading, empty, offline, reconnecting, error. Verdicts and
    quality are always text as well as colour; interactive elements are real buttons with
    `aria-pressed` / `aria-label` where needed.
  - Keep the "SIMULATED REAL-TIME · REPLAYED RECORDINGS" badge and the "not for clinical use" footer.
  - No SpO₂, no invented explanations, no "nurse paged" wording.
- Tests: pytest, synthetic signals generated in code; no real VTaC files in the repo.
- Keep local dependencies light. Do not add torch/tensorflow/xgboost/neurokit2 to the backend path.
- Verify, don't assume: column names, sampling rates, and channel names come from the real files
  and are recorded in `docs/data.md`.

## Preprocessing rule

**All preprocessing lives only in `src/vtac/`.** Notebooks and the backend call it; they never
re-implement filtering, windowing, channel selection, masking, normalization, or features. This is
what prevents train/serve skew. If the backend needs a new transform, add it to `src/vtac/` first,
then use it in both places.

## Never do

- Never run training, ablations, full-dataset download/processing, or ONNX export on the laptop.
- Never duplicate or fork preprocessing outside `src/vtac/`.
- Never commit data, `.npz`, other `.onnx`/model weights, or secrets (`.gitignore` covers these).
  The one exception is the served ~2 MB `models/model.onnx` + `model_config.json` (D39).
- Never assume dataset column names, sampling rates, or channel names — verify and document.
- Never split data randomly; use the official split and confirm it is patient-level.
- Never tune the threshold or select models on the test set.
- Never claim live monitor integration or clinical validity; label as simulated replay.
- Never add checkpoint-2 items (DVC, MLflow/DagsHub, registry, drift, retrain, Grad-CAM, Docker,
  CI/CD) during checkpoint 1; Grad-CAM is a UI placeholder only.
- Never write application code before the user approves the skeleton/docs (stage gate).
