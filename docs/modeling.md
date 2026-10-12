# Modeling

All training happens in Colab. Preprocessing is shared via `src/vtac` (see `docs/architecture.md`).

## Task

Binary classification per alarm event: **true VT** (positive) vs **false alarm**. Positive class
prevalence ~28.6%. Missing a true alarm is the dangerous error.

## Metrics

Report on validation (for tuning) and test (final, once):

- **PR-AUC** (average precision) — primary threshold-free metric given class imbalance.
- **ROC-AUC**.
- **TPR** (sensitivity / recall of true alarms) — safety metric.
- **PPV** (precision of "true" calls).
- Also: TNR (false-alarm suppression rate), confusion matrix, count of suppressed false alarms vs
  missed true alarms.
- **PhysioNet/CinC 2015 Challenge Score** = `(TP + TN) / (TP + TN + FP + 5*FN)`.
  Positive = true alarm. FN = true alarm suppressed (cost 5x). Bootstrap 95% CIs over **patients**
  (not events) since events cluster by patient.

## Baseline (`02_baseline`)

- Features via `vtac.features` (neurokit2 under the hood): QRS/R-peak detection, heart-rate and
  HRV statistics, QRS width / amplitude proxies, inter-lead agreement, pulsatile-signal features
  (peak count/rate, amplitude variability, agreement of PPG/ABP rate with ECG rate), and
  signal-quality indices. Features for missing channels are NaN + a presence flag.
- Model: XGBoost (handles NaN natively), `scale_pos_weight` for imbalance, early stopping on
  validation.
- Purpose: an interpretable floor and a sanity check on the pipeline, plus feature importances.

## CNN (`03_cnn`)

- PyTorch 1D-CNN / ResNet1D on raw windows `(C, T)` plus channel mask.
- Handling the mask: multiply signals by the mask and also feed the mask (e.g., broadcast as extra
  channels or concatenate to the pooled features). Train with random channel dropout.
- Imbalance: weighted sampling **or** focal loss (pick one per run; compare in the ablation).
- Variants: **ECG-only** vs **ECG + pulsatile (fusion)**. Early vs late fusion if time permits.
- Optimizer/schedule/seed: fixed and logged; multiple seeds for the final configuration.
- Export: `torch.onnx.export` with dynamic batch axis, then verify onnxruntime output matches
  PyTorch within tolerance on a held-out batch. Write `model.onnx` + `model_config.json`
  (threshold included).

## Ablation table template

Fill with validation numbers during development; the final row set is re-run on test once.

| ID | Model | Channels | Imbalance | Aug | PR-AUC | ROC-AUC | TPR | PPV | Challenge Score | Thr | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| B0 | XGBoost | ECG feats | scale_pos_weight | – | | | | | | | |
| B1 | XGBoost | ECG + pulsatile feats | scale_pos_weight | – | | | | | | | |
| C0 | ResNet1D | ECG-only | weighted sampler | – | | | | | | | |
| C1 | ResNet1D | ECG-only | focal loss | – | | | | | | | |
| C2 | ResNet1D | ECG + pulsatile | weighted sampler | – | | | | | | | |
| C3 | ResNet1D | ECG + pulsatile | focal loss | – | | | | | | | |
| C4 | best of C2/C3 (focal) | ECG + pulsatile | focal loss | channel dropout 0.15 | 0.886 | 0.945 | 0.950 | 0.650 | 0.795 | 0.515 | val, constrained thr; `model_config.json`, seed 42 |

**Channel ablation** (same model, mask changes; PPG and ABP are separate slots):

| ID | Channels in mask | PR-AUC | ROC-AUC | TPR | PPV | Challenge Score | Notes |
|---|---|---|---|---|---|---|---|
| K0 | ECG only | | | | | | |
| K1 | ECG + PPG | | | | | | |
| K2 | ECG + ABP | | | | | | |
| K3 | ECG + PPG + ABP | | | | | | |

**Window ablation** (`window_end_offset_s`; every other setting fixed):

| ID | Offset | Meaning | PR-AUC | ROC-AUC | TPR | PPV | Challenge Score | Notes |
|---|---|---|---|---|---|---|---|---|
| W0 | 0.0 s | official benchmark window (10 s ending at onset); comparable to published results | | | | | | |
| W1 | +2.0 s | project default (D18) | | | | | | |

Also report performance stratified by channel availability (ECG-only records vs with-pulsatile
records) — fusion gains should show up where pulsatile channels exist.

## Threshold method

Goal: minimise cost where a missed true alarm costs 5 false alarms (Challenge Score weighting),
under a **hard safety constraint: validation TPR >= 0.95** (decided 2026-10-09, D20).

1. Fit on train; get validation probabilities `p_true`.
2. Sweep every distinct score as a candidate threshold (`vtac.metrics.threshold_sweep`).
3. **Unconstrained threshold:** maximise the Challenge Score. Tie-break toward higher TPR.
4. **Constrained threshold (the one the backend uses):** among thresholds with TPR >= 0.95, maximise
   the Challenge Score. Predicting everything true always has TPR 1.0, so a feasible point exists.
5. **Report both** (`vtac.metrics.tune_thresholds` returns both with full metrics) and store both in
   `model_config.json` (`threshold_constrained`, `threshold_unconstrained`); `threshold` is set to the
   constrained one.
6. Optional smoothing: `plateau_tol` > 0 picks the median threshold of the near-optimal plateau
   instead of a single noisy argmax.
7. Apply to the test set once and report; **never** retune on test. Report test TPR as an estimate,
   not a guarantee, with patient-level bootstrap CIs (`group_bootstrap_ci`).

## Reproducibility

Fixed seeds; log `vtac` git ref, data version, split seed, hyperparameters, and metrics to a JSON
saved beside the model on Drive. (Full experiment tracking is checkpoint 2.)

## Results so far (final model, offset +2.0 s)

Model `resnet1d-C4_all_dropout-off2.0`, from `models/model_config.json`. Thresholds were tuned on
validation only; test was applied once.

| Split | Threshold | TP | FN | FP | TN | TPR | TNR | PPV | Challenge Score | PR-AUC | ROC-AUC |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Val, constrained (TPR >= 0.95) | 0.515 | 134 | 7 | 72 | 282 | 0.950 | 0.797 | 0.650 | 0.795 | 0.886 | 0.945 |
| Val, unconstrained | 0.561 | 130 | 11 | 46 | 308 | 0.922 | 0.870 | 0.739 | 0.813 | 0.886 | 0.945 |
| **Test, constrained (used by backend)** | 0.515 | 132 | 5 | 67 | 278 | 0.964 | 0.806 | 0.663 | 0.817 (95% CI 0.767-0.867) | 0.875 | 0.946 |
| Test, unconstrained | 0.561 | 125 | 12 | 51 | 294 | 0.912 | 0.852 | 0.710 | 0.791 (95% CI 0.710-0.867) | 0.875 | 0.946 |

Reading: at the constrained threshold, about 81% of false alarms are suppressed while 96% of true
alarms are kept. The unconstrained threshold suppresses more false alarms but misses 7 more true
ones, so it is not used. Test TPR is an estimate, not a guarantee (the CI is wide).

Not yet filled: B0/B1, C0-C3, K0-K3, W0/W1. Copy them from `reports/` on Drive.

## Replay-sample check (laptop, 25 test alarms)

`tests/test_real_model.py` and an offline run through the backend's own predictor: 9 of 10 true
alarms escalated, 12 of 15 false alarms suppressed (the one missed true alarm has p=0.476 against
a threshold of 0.515). One verdict observed in the backend log took 63 ms (preprocess ~37 ms, inference ~26 ms) on the
target laptop; an offline loop over the 25 alarms averaged ~240 ms per alarm (max 335 ms), which
includes cold-start effects and was not reconciled with the log. Treat latency as "well under a
second", not a precise figure. 25 alarms are too few to estimate performance; use the test table above.
