# Colab workflow

Heavy jobs run in Colab, never on the laptop. The same `src/vtac` code is used in both places.

## 1. Setup cell (top of every notebook)

```python
# Mount Drive (artifacts persist here)
from google.colab import drive
drive.mount("/content/drive")

# Install the shared package from GitHub, pinned to a ref (tag/commit) for reproducibility
VTAC_REF = "main"   # replace with a tag/commit once stable
!pip -q install "vtac[train] @ git+https://github.com/siddhu-exe/vtac-alarm-monitor.git@{VTAC_REF}"

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
    windows_off2.0.npz  # project-default window (end offset +2.0 s): signals, mask, y, split, ids
    windows_off0.0.npz  # official-benchmark window (offset 0.0 s) for ablation W0
    windows_meta.json   # counts, seeds, offsets, vtac ref, data version
    baseline_features_off*.pkl
  replay/
    replay_sample.npz   # ~25 test alarms, raw segments for the laptop
    replay_index.json
  models/
    xgb_baseline.*      # optional
    model.onnx
    model_config.json   # = VtacConfig.to_dict(): both thresholds, slots, input shape, metrics, vtac ref
    parity_batch.npz    # planned (not produced): ~32 fixed test windows + PyTorch scores, for tests/test_onnx_parity.py
    model_state.pt      # planned (not produced): PyTorch weights of the final model; they were never saved
  reports/              # figures, metrics tables
```

## 3. Per notebook

| Notebook | Reads | Writes |
|---|---|---|
| `01_data_prep` | PhysioNet download | `processed/windows_off{2.0,0.0}.npz`, `windows_meta.json`, `replay/*`, `reports/data_survey.json` (paste into `docs/data.md`) |
| `02_baseline` | `processed/windows_off*.npz` | `reports/baseline_metrics_off*.json`, feature importances |
| `03_cnn` | `processed/windows_off*.npz` | `models/model.onnx`, `models/model_config.json`, `reports/cnn_val_ablation_off*.csv` |

Use a GPU runtime for `03_cnn` only. Save intermediate checkpoints to Drive so a disconnect does
not lose work. Run long cells in chunks; write results incrementally.

## 4. Exporting to the laptop

1. Download from Drive (web UI, `rclone`, or Drive desktop sync):
   - `models/model.onnx`, `models/model_config.json` -> repo `models/` (`parity_batch.npz` does not exist, see D38)
   - `replay/replay_sample.npz`, `replay/replay_index.json` -> repo `data/sample/`
2. Files are gitignored; do not commit them.
3. Start the backend (`VTAC_MODEL_MODE=onnx`); `/health` should report the model version `resnet1d-C4_all_dropout-off2.0`.
4. Never copy `windows_off*.npz` or raw data to the laptop; it is large and not needed to serve.

## 5. Rules

- Preprocessing code is imported from `vtac`; do not paste/duplicate it in notebooks.
- Fix random seeds (`SEED = 42`) and log them in `windows_meta.json` / `model_config.json`.
- Only `OFFSET = 2.0` was run for `02_baseline` and `03_cnn`. The `OFFSET = 0.0` run (ablation W0) was not done (D35); it would overwrite `model.onnx` and `model_config.json`, so back up Drive `models/` first.
- The three notebooks were run on Colab on 2026-10-12. Their stored outputs were cleared, so the printed
  results are not in the repo; the saved files in `reports/` and `models/model_config.json` are the record.
  (The "not yet executed" status lines inside the notebooks are stale.)
- Notebooks must run top-to-bottom from a fresh runtime (clear outputs before committing).
- Large notebook outputs/figures go to `reports/` on Drive, not the repo.
