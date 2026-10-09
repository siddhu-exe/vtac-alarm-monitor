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
| C4 | best of C2/C3 | ECG + pulsatile | best | channel dropout | | | | | | | |

Also report performance stratified by channel availability (ECG-only records vs with-pulsatile
records) — fusion gains should show up where pulsatile channels exist.

## Threshold method

Goal: minimize the cost where a missed true alarm costs 5 false alarms (the 2015 Challenge Score
weighting).

1. Fit the model on train; get validation probabilities `p_true`.
2. Sweep candidate thresholds over the validation set; at each compute TP/TN/FP/FN.
3. Choose the threshold that **maximizes the Challenge Score** `(TP+TN)/(TP+TN+FP+5*FN)`
   (equivalently minimizes `FP + 5*FN`). Tie-break toward higher TPR.
4. Optional safety constraint: require validation TPR >= a target (e.g., 0.95+) and pick the best
   score subject to it; document the target in `docs/decisions.md`.
5. Smooth the choice (bootstrap / pick the center of a near-optimal plateau) to avoid overfitting a
   single noisy optimum.
6. Save `threshold` into `model_config.json` (and `vtac.config` default). The backend reads it from
   the config, never hardcodes it.
7. Apply once to the test set and report; **never** retune on test.

## Reproducibility

Fixed seeds; log `vtac` git ref, data version, split seed, hyperparameters, and metrics to a JSON
saved beside the model on Drive. (Full experiment tracking is checkpoint 2.)
