# Colab workflow

Heavy jobs run in Colab, never on the laptop. The same `src/vtac` code is used in both places.

## 1. Setup cell (top of every notebook)

```python
# Mount Drive (artifacts persist here)
from google.colab import drive
drive.mount("/content/drive")

# Install the shared package from GitHub, pinned to a ref (tag/commit) for reproducibility
VTAC_REF = "main"   # replace with a tag/commit once stable
!pip -q install "vtac[train] @ git+https://github.com/<user>/<repo>.git@{VTAC_REF}"

import vtac, subprocess
print("vtac", vtac.__version__)
```

- Private repo: use a fine-grained read-only token stored in Colab Secrets
  (`google.colab.userdata`), not pasted in the notebook.
- After pushing changes to `src/vtac`, restart the Colab runtime and reinstall (or install with
  `--force-reinstall --no-deps`) so the new code loads.
- Record the exact ref in the output metadata (`vtac_git_ref` in `model_config.json`).

## 2. Drive layout

```
MyDrive/vtac/
  raw/                  # downloaded VTaC (optional cache; large)
  processed/
    windows.npz         # windows, mask, labels, split, event/patient ids (compressed)
    windows_meta.json   # shapes, fs, channel slots, vtac ref, data version, seeds
  replay/
    replay_sample.npz   # ~25 test alarms, raw segments for the laptop
    replay_index.json
  models/
    xgb_baseline.*      # optional
    model.onnx
    model_config.json   # threshold, channel slots, input shape, metrics, vtac ref
  reports/              # figures, metrics tables
```

## 3. Per notebook

| Notebook | Reads | Writes |
|---|---|---|
| `01_data_prep` | PhysioNet download | `processed/windows.npz`, `windows_meta.json`, `replay/*`, findings for `docs/data.md` |
| `02_baseline` | `processed/windows.npz` | baseline metrics, feature importances |
| `03_cnn` | `processed/windows.npz` | `models/model.onnx`, `models/model_config.json`, metrics, ablation rows |

Use a GPU runtime for `03_cnn` only. Save intermediate checkpoints to Drive so a disconnect does
not lose work. Run long cells in chunks; write results incrementally.

## 4. Exporting to the laptop

1. Download from Drive (web UI, `rclone`, or Drive desktop sync):
   - `models/model.onnx`, `models/model_config.json` -> repo `models/`
   - `replay/replay_sample.npz`, `replay/replay_index.json` -> repo `data/sample/`
2. Files are gitignored; do not commit them.
3. Start the backend (`VTAC_MODEL_MODE=onnx`); `/health` should report the model version.
4. Never copy `windows.npz` or raw data to the laptop; it is large and not needed to serve.

## 5. Rules

- Preprocessing code is imported from `vtac`; do not paste/duplicate it in notebooks.
- Fix random seeds and log them in `windows_meta.json` / `model_config.json`.
- Notebooks must run top-to-bottom from a fresh runtime (clear outputs before committing).
- Large notebook outputs/figures go to `reports/` on Drive, not the repo.
