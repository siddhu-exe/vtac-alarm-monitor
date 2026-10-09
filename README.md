# ICU VT False-Alarm Reduction

**AI-Based Continuous Patient Monitoring Dashboard** — classifies ventricular tachycardia (VT)
alarms from ICU bedside monitors as true or false, to cut alarm fatigue while almost never
missing a true alarm.

> Everything shown in the dashboard is **simulated real-time (replayed recordings)** from the
> open VTaC dataset. This project does not integrate with live bedside monitors.

Data: [VTaC on PhysioNet](https://physionet.org/) — 5,037 labeled VT alarm events, 28.61% true.

## Status

Checkpoint 1, stage 0: repo skeleton and docs only. No application code yet.
See [docs/roadmap.md](docs/roadmap.md).

## Layout

| Path | Purpose |
|---|---|
| `src/vtac/` | Shared package: WFDB loading, filtering, windowing, channel mask, features |
| `notebooks/` | Colab notebooks (data prep, baseline, CNN) — all heavy work runs here |
| `backend/` | FastAPI + onnxruntime (CPU): REST + WebSocket replay |
| `frontend/` | Vite + React + TypeScript + Tailwind + uPlot dashboard |
| `data/sample/` | ~25-alarm replay sample (gitignored) |
| `models/` | ONNX model + config artifacts (gitignored) |
| `tests/` | pytest |
| `docs/` | Architecture, data, modeling, API, roadmap, decisions, Colab workflow |

## Docs

[architecture](docs/architecture.md) · [data](docs/data.md) · [modeling](docs/modeling.md) ·
[api](docs/api.md) · [roadmap](docs/roadmap.md) · [decisions](docs/decisions.md) ·
[colab-workflow](docs/colab-workflow.md)

See [CLAUDE.md](CLAUDE.md) for contributor and agent conventions.
