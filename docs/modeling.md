# Modeling

> Simulated real-time (replayed recordings). Not for clinical use.

All training ran in Google Colab (2026-10-12). Preprocessing is shared via `src/vtac` (see
`docs/architecture.md` and `docs/data.md`).

**Sources.** Every number below comes from one of: `models/model_config.json` (final CNN, both
splits), `reports/baseline_metrics_off2.0.json` (XGBoost, `02_baseline`),
`reports/cnn_val_ablation_off2.0.csv` (CNN validation ablations, `03_cnn`),
`reports/replay_sample_check.json` (25-alarm replay sample, measured on the laptop by
`reports/measure_replay_sample.py`), or `reports/data_survey.json`. Anything not in those files is
marked **not recorded** or **not measured**. The notebooks have no stored outputs, so printouts
(epoch counts, feature importances, split sizes beyond val/test) are not available.

## Task

Binary classification per alarm: **true VT** (positive) vs **false alarm**. One 10 s window per
alarm. Prevalence in validation 141 of 495 (28.5%) and in test 137 of 482 (28.4%)
(`models/model_config.json`). Missing a true alarm is the dangerous error.

## Metrics

Reported on validation (used for tuning) and on test (once, at the end).

- **PR-AUC** (average precision): area under the precision-recall curve, threshold-free. Main
  summary because positives are only about 28% of alarms.
- **ROC-AUC**: threshold-free ranking quality.
- **TPR** (sensitivity, recall of true alarms): the safety metric.
- **TNR** (specificity): share of false alarms suppressed. The dashboard's "False-alarm reduction"
  is this number on the alarms replayed so far (`frontend/src/features/alarms/verdict.ts`).
- **PPV** (precision): share of escalated alarms that are truly VT.
- **Challenge Score** = `(TP + TN) / (TP + TN + FP + 5*FN)`, the PhysioNet/CinC 2015 weighting:
  a missed true alarm (FN) costs 5 false alarms (`vtac.metrics.challenge_score`).
- 95% confidence intervals: patient-level bootstrap (patients resampled, not events), 500
  resamples, seed 42.

## Baseline (`02_baseline`): features + XGBoost

- **Features** (`notebooks/02_baseline.ipynb`, `vtac.features`), computed on the same preprocessed
  windows and mask the CNN sees:
  - From `vtac.features` (scipy): per slot a presence flag; per channel the rate (median
    peak-to-peak), RR coefficient of variation, peak count, mean peak amplitude, amplitude
    variation, high-frequency (>= 20 Hz) power ratio and kurtosis; and the rate differences
    ECG-vs-PPG, ECG-vs-ABP and ECG1-vs-ECG2. 35 features.
  - From neurokit2, per ECG slot: R-peak count and six HRV time-domain statistics (MeanNN, SDNN,
    RMSSD, MedianNN, CVNN, MadNN). 14 features.
  - Features of a missing channel are NaN (XGBoost handles NaN).
  - **B0** uses the 31 ECG-derived features; **B1** uses all 49. (Counts derived from the code in
    this repo; the notebook's own printout is not saved.)
- **Model:** `XGBClassifier`, up to 1500 trees, learning rate 0.03, depth 4, subsample 0.8,
  column subsample 0.8, `min_child_weight` 2, `scale_pos_weight` = (train false)/(train true) (the
  value is not recorded), `eval_metric=aucpr`, early stopping 60 rounds on validation, seed 42.
- Purpose: an interpretable floor and a pipeline sanity check. Saved as `xgb_baseline_off2.0.ubj`
  (B1). Feature importances were printed in the notebook; not saved.

## CNN (`03_cnn`): ResNet1D

Architecture (`notebooks/03_cnn.ipynb`, class `ResNet1D`, width 32):

1. **Input:** `signals (N, 4, 2500)` multiplied by the mask, concatenated with the mask broadcast
   over time as extra channels (8 input channels), so an absent channel is explicit.
2. **Stem:** 1D convolution, kernel 15, stride 2, 32 filters, batch norm, ReLU.
3. **Five residual blocks** (two convolutions of kernel 7 each, batch norm, skip connection):
   32->32, 32->64 (stride 2), 64->64, 64->128 (stride 2), 128->128.
4. **Global average pool** over time (128 values).
5. **Head:** dropout 0.3, concatenate the 4 mask values (132 values), one linear layer -> a single
   **logit**. `p_true = sigmoid(logit)`.

The exported ONNX file (`models/model.onnx`, 2,132,919 bytes, opset 17, dynamic batch axis) stores
531,365 values in its initializers (weights and batch-norm statistics; this is not a
trainable-parameter count).

Training setup (one function, `train_run`, used by every CNN run):

| Setting | Value |
|---|---|
| Optimizer | AdamW, learning rate 1e-3, weight decay 1e-2 |
| Schedule | OneCycleLR, max learning rate 1e-3 |
| Epochs / batch | at most 30 epochs, batch size 64 |
| Early stopping | validation PR-AUC, patience 7; the best epoch's weights are restored |
| Seed | 42, **one seed per configuration** |
| Hardware | Colab GPU runtime (the device string was printed, not recorded) |
| Epochs actually run for the final model | not recorded |

**Class imbalance** (two strategies, compared in the ablation):

- `sampler`: each epoch draws examples with inverse-class-frequency weights, plain binary
  cross-entropy.
- `focal`: focal loss, gamma 2, class weight `alpha = 1 - prevalence` of the training set.

**Channel dropout** (`aug 0.15`, run C4): during training each non-`ECG_1` channel (signal and mask)
is dropped with probability 0.15; `ECG_1` is always kept. This trains the network to cope with missing
channels. It is different from the 0.3 dropout in the head.

**Final model choice (rule in the notebook):** the best validation PR-AUC among the runs that use all
four slots (C2, C3, C4). That is **C4**, `resnet1d-C4_all_dropout-off2.0` (val PR-AUC 0.8863 vs 0.8779
for C3 and 0.8567 for C2; `reports/cnn_val_ablation_off2.0.csv`). Its settings: focal loss, channel
dropout 0.15, seed 42, window offset +2.0 s (`models/model_config.json` `extra`).

**Export:** `torch.onnx.export` (opset 17, inputs `signals`, `mask`, output `logit`, dynamic batch).
The notebook asserts max |PyTorch - ONNX| logit difference below 1e-3 on 64 test windows; the printed
value was not saved. `tests/test_onnx_parity.py` would repeat the check on a saved batch but is
**skipped** because `parity_batch.npz` was never exported (the PyTorch weights were not saved to
Drive). So the PyTorch-vs-ONNX agreement is asserted in the notebook but not independently
re-verified in this repo.

## Ablation results

### Validation, at the constrained operating point

Constrained point = the threshold with validation TPR >= 0.95 that maximises the Challenge Score (see
"Threshold method"). Validation has 141 true and 354 false alarms (495 total). PR-AUC and ROC-AUC do
not depend on the threshold. One seed, offset +2.0 s. Sources: B0/B1 from
`reports/baseline_metrics_off2.0.json`; C0-C4 and K1-K2 from `reports/cnn_val_ablation_off2.0.csv`
(stored with 4 decimals).

| ID | Model | Channels | Imbalance | Aug | PR-AUC | ROC-AUC | TPR | PPV | Challenge Score | Thr | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| B0 | XGBoost | ECG features | scale_pos_weight | - | 0.802 | 0.903 | 0.957 | 0.513 | 0.696 | 0.223 | |
| B1 | XGBoost | ECG + pulsatile features | scale_pos_weight | - | 0.825 | 0.916 | 0.965 | 0.496 | 0.683 | 0.139 | |
| C0 | ResNet1D | ECG only | weighted sampler | - | 0.849 | 0.925 | 0.957 | 0.529 | 0.711 | 0.259 | |
| C1 | ResNet1D | ECG only | focal | - | 0.881 | 0.942 | 0.972 | 0.517 | 0.710 | 0.111 | = K0 |
| C2 | ResNet1D | all four slots | weighted sampler | - | 0.857 | 0.947 | 0.950 | 0.644 | 0.792 | 0.023 | |
| C3 | ResNet1D | all four slots | focal | - | 0.878 | 0.947 | 0.965 | 0.636 | 0.800 | 0.456 | = K3 |
| C4 | ResNet1D | all four slots | focal | channel dropout 0.15 | 0.886 | 0.945 | 0.950 | 0.650 | 0.795 | 0.515 | **final (served)** |

Unconstrained Challenge Score on validation: B0 0.714, B1 0.751 (JSON); C0 0.725, C1 0.781, C2 0.793,
C3 0.800, C4 0.813 (CSV `score_u`).

### Channel ablation (validation, constrained point)

Each K run is a **separately trained** model on that channel subset (focal loss, no dropout
augmentation); it is not one model with the mask changed at test time. "ECG" = both ECG slots.

| ID | Channels | PR-AUC | ROC-AUC | TPR | PPV | Challenge Score | Note |
|---|---|---|---|---|---|---|---|
| K0 | ECG | 0.881 | 0.942 | 0.972 | 0.517 | 0.710 | = C1 |
| K1 | ECG + PPG | 0.852 | 0.930 | 0.950 | 0.598 | 0.761 | |
| K2 | ECG + ABP | 0.878 | 0.950 | 0.950 | 0.638 | 0.788 | |
| K3 | ECG + PPG + ABP | 0.878 | 0.947 | 0.965 | 0.636 | 0.800 | = C3 |

### Window ablation

| ID | Window end offset | Status |
|---|---|---|
| W1 | +2.0 s (project default, D18) | **the only offset trained**: C4 numbers above |
| W0 | 0.0 s (official benchmark window, D19) | **not run** (no `off0.0` reports). Results are therefore not directly comparable with published VTaC results, and +2.0 s was never shown to be better or worse than 0.0 s |

### Test comparison (evaluated once)

Thresholds tuned on validation, applied once to the test set (137 true, 345 false alarms). Sources:
`reports/baseline_metrics_off2.0.json` (B0, B1) and `models/model_config.json` `extra.test` (C4).
Only the final CNN (C4) was evaluated on test; the other CNN runs were not.

| Model | TP / FN | TN / FP | TPR | TNR | PPV | Challenge Score (95% CI) | PR-AUC | ROC-AUC |
|---|---|---|---|---|---|---|---|---|
| B0 XGBoost, ECG features | 130 / 7 | 214 / 131 | 0.949 | 0.620 | 0.498 | 0.675 (0.609-0.733) | 0.704 | 0.879 |
| B1 XGBoost, all features | 133 / 4 | 208 / 137 | 0.971 | 0.603 | 0.493 | 0.685 (0.616-0.746) | 0.742 | 0.899 |
| **C4 ResNet1D (served)** | 132 / 5 | 278 / 67 | 0.964 | 0.806 | 0.663 | **0.817 (0.767-0.867)** | 0.875 | 0.946 |

B0 reaches only 0.949 TPR on test: the validation constraint (TPR >= 0.95) is not guaranteed to carry
over. Baseline PR-AUC CIs: B0 0.604-0.803, B1 0.636-0.823 (JSON). A PR-AUC CI for C4 was not saved.

### What the ablations show (validation, one seed)

Single-seed results on 495 validation windows: small gaps are within noise.

1. **The CNN beats the feature baselines.** Validation PR-AUC 0.886 (C4) vs 0.825 (B1) and 0.802 (B0).
   On test at the constrained threshold, C4 keeps about the same recall as B1 (132 vs 133 of 137 true
   alarms) with about half the false alarms (67 vs 137), and C4's Challenge Score interval
   (0.767-0.867) sits above B1's (0.616-0.746).
2. **Focal loss beat the weighted sampler** in both pairs (ECG-only PR-AUC 0.881 vs 0.849; all
   channels 0.878 vs 0.857), so focal was used for C4, K1 and K2.
3. **Pulsatile channels help at the safety operating point, not in PR-AUC.** C1 (ECG-only) and C3
   (all) have almost the same PR-AUC (0.881 vs 0.878), but at TPR >= 0.95 PPV rises from 0.517 to
   0.636 and the Challenge Score from 0.710 to 0.800 (unconstrained: 0.781 vs 0.800, a smaller gap).
   Part of the constrained gap may be threshold-selection noise.
4. **ABP carries more than PPG here:** K2 (ECG + ABP) 0.878 PR-AUC / 0.788 score vs K1 (ECG + PPG)
   0.852 / 0.761; adding PPG on top of ABP (K3) changes little. But ABP is absent in 3,200 of 5,037
   records (63.5%, `reports/data_survey.json`).
5. **Channel dropout (C4 vs C3) is not a clear win:** PR-AUC 0.886 vs 0.878, Challenge 0.795 vs 0.800.
   C4 was chosen by the notebook's rule. Its purpose is robustness to missing channels, which none
   of the saved validation numbers measures separately.
6. **By channel availability (baselines only, test):** B1 PR-AUC 0.744 with a usable pulsatile channel
   (n = 434) vs 0.767 ECG-only (n = 48); B0 0.692 vs 0.795. The ECG-only group is too small to
   conclude anything. CNN results by channel availability were printed in the notebook but are not
   saved.

## Threshold method

Goal: minimise cost where a missed true alarm costs 5 false alarms, under a **hard safety
constraint: validation TPR >= 0.95** (decision D20).

1. Train on the train split; compute `p_true` on validation.
2. Sweep every distinct validation score as a candidate threshold (`vtac.metrics.threshold_sweep`);
   rule: predict TRUE when `p_true >= threshold`.
3. **Constrained threshold (the one the backend uses):** among thresholds with validation TPR >= 0.95,
   take the one with the highest Challenge Score; ties go to the higher TPR, then the lower
   threshold (safer: more alarms kept). Predicting everything TRUE always has TPR 1.0, so a feasible
   point always exists.
4. **Unconstrained threshold:** the highest Challenge Score with no TPR condition. Computed and stored,
   **not used**.
5. Both are saved in `models/model_config.json`: `threshold_constrained` 0.5148199200630188,
   `threshold_unconstrained` 0.5606065988540649, and `threshold` = the constrained one.
6. The test set was evaluated once with these thresholds and never used to tune anything.

## Final model and test metrics

Model `resnet1d-C4_all_dropout-off2.0` (vtac git ref `6d30bd26a7e2e7dc149b069c0c111d701fc66325`),
from `models/model_config.json`.

| Split | Threshold | TP | FN | FP | TN | TPR | TNR | PPV | Challenge Score | PR-AUC | ROC-AUC |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Validation, constrained (TPR >= 0.95) | 0.515 | 134 | 7 | 72 | 282 | 0.950 | 0.797 | 0.650 | 0.795 | 0.886 | 0.945 |
| Validation, unconstrained | 0.561 | 130 | 11 | 46 | 308 | 0.922 | 0.870 | 0.739 | 0.813 | 0.886 | 0.945 |
| **Test, constrained (used by the backend)** | 0.515 | 132 | 5 | 67 | 278 | 0.964 | 0.806 | 0.663 | 0.817 (0.767-0.867) | 0.875 | 0.946 |
| Test, unconstrained (not used) | 0.561 | 125 | 12 | 51 | 294 | 0.912 | 0.852 | 0.710 | 0.791 (0.710-0.867) | 0.875 | 0.946 |

At the served threshold on the test set: 132 of 137 true alarms are escalated (5 missed) and 278 of
345 false alarms are suppressed (67 still escalated). The unconstrained threshold suppresses more
false alarms (294) but misses 7 more true ones (12 vs 5), so it is not used. Test TPR is an
estimate, not a guarantee: validation TPR is 0.950 by construction and the Challenge Score interval
is wide (0.767-0.867).

## Failure cases

### On the test set (482 alarms)

At the served threshold the model makes **5 missed true alarms** and **67 false-alarm escalations**
(`models/model_config.json`). Which alarms they were is **not recorded**: per-alarm test scores were
not saved. So no systematic analysis of the test errors (by channel availability, by patient) can be
made from this repo.

### On the 25-alarm replay sample

Measured on the laptop on 2026-10-18 by `reports/measure_replay_sample.py` through the backend's own
inference path; output `reports/replay_sample_check.json`. Threshold 0.5148. Result: **9 of 10 true
alarms escalated, 12 of 15 false alarms suppressed**. These 25 alarms are a hand-built demo set
(true alarms are over-represented): use the test table above for performance.

| Alarm | Expert label | p(true) | Model action | Error | ABP in the model window |
|---|---|---|---|---|---|
| `a06fbf_0500` | true | 0.476 | suppressed | **missed true alarm** (0.039 below the threshold) | present, good |
| `3ba184_0047` | false | 0.623 | escalated | false alarm escalated | absent |
| `108c4d_4582` | false | 0.586 | escalated | false alarm escalated | present, degraded |
| `79c471_0246` | false | 0.541 | escalated | false alarm escalated | absent |

What the dashboard readouts show for two of them (`reports/demo_alarm_numerics.json`, produced by
`reports/demo_alarm_numerics.py` with `vtac.display`; these are display heuristics over the trailing
8 s, so they lag the signal, and they are not model inputs):

- **`a06fbf_0500` (missed).** From 286 s to 297 s the ECG heart rate and the PPG pulse rate agree
  (about 117-118/min) and ABP stays at about 123-127 / 57-59 mmHg. The readouts change from about 298 s:
  heart rate 125.5 at 298, 133.9 at 299, 155.4 at 300; pulse rate not measurable from 300 s; systolic
  ABP 109 at 299, 108 at 300, then not measurable at 301-302. The model window is 292-302 s, so the
  abnormal part is its last few seconds. The same patient's false alarm `a06fbf_0533` scored 0.213.
  This is what the data shows; **why the model scored 0.476 is not known** (no attribution method was
  built).
- **`108c4d_4582` (false alarm escalated).** Heart rate 119-136/min in most seconds, with excursions
  to 155-214/min at 288-289 s and 293-294 s, no PPG pulse rate in any second from 286 to 304 s, and ABP
  not measurable at 292-294 s and 299-304 s. In these readouts it resembles a true alarm. Why the monitor alarmed and why the
  model scored it 0.586 were not examined.
- `3ba184_0047` and `79c471_0246` were **not examined** beyond their scores and missing ABP.

Other limits that shape errors:

- PPG is rated "degraded" in all 25 sample windows and ABP is absent in 13 of 25
  (`reports/replay_sample_check.json`), so pulsatile evidence is often weak.
- ECG_2 of `bb7f6d_0965` is masked as bad by the quality rule; that alarm was still scored correctly
  (false, p 0.333).

## Latency

Per-verdict preprocessing + inference on the laptop, measured by
`reports/measure_replay_sample.py` (details and numbers in `docs/api.md`): warm median 40.3 ms, p95
80.5 ms (250 calls; `reports/replay_sample_check.json`).

## Reproducibility and what was not done

- Fixed seed 42 for the split carve-out, training and bootstrap; the `vtac` git ref is stored in
  `models/model_config.json` and `reports/baseline_metrics_off2.0.json`.
- **One seed per configuration.** No repeats, so there is no variance estimate across training runs.
- **W0 (offset 0.0 s) was not run.**
- **PyTorch weights were not saved**, so the parity test is skipped and the model cannot be
  re-evaluated or explained (no Grad-CAM) without retraining, which would produce a different model.
- No external validation set; one dataset, one official split.
- Experiment tracking (MLflow/DVC) was not used: the ablations live in `reports/` and this document.
