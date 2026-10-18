# The numbers, explained

Every final number in the project, in plain words.
Each row says where the number comes from.
If a number was not recorded, the row says **not recorded** or **not measured**.
Nothing here is rounded up.

Sources used:

- **M** = `models/model_config.json` (the final model, written by the Colab run)
- **S** = `reports/data_survey.json` (a survey of all 5,037 recording headers)
- **B** = `reports/baseline_metrics_off2.0.json` (the simpler XGBoost models)
- **A** = `reports/cnn_val_ablation_off2.0.csv` (neural-network comparison runs, validation data)
- **R** = `reports/replay_sample_check.json` (the 25-alarm demo set, run on the laptop)
- **P** = the project brief (a number given to us, not re-checked in a saved file)

Signals named below: **ECG** is the heart's electrical trace. **PPG** is the pulse wave from a finger clip. **ABP** is arterial blood pressure.

Words used below:

- **True alarm** = the patient really had the dangerous fast heartbeat.
- **False alarm** = the monitor rang, but it was not real.
- **Escalate** = the system says "keep this alarm". **Suppress** = "probably false".
- **Caught** = a true alarm that was escalated. **Missed** = a true alarm that was suppressed.

---

## 1. The data

| Number | Value | Source | In plain words | Why it matters |
|---|---|---|---|---|
| Alarms in the dataset | 5,037 | S | The number of recorded VT alarms. | Big enough to train on, small enough to run in Colab. |
| True alarms | 1,441 (28.61%) | P | About 29 of every 100 alarms were real. Not re-confirmed in a saved report. | Most alarms are false, which is the whole problem. |
| False alarms | about 71% | derived from 100% - 28.61% | About 71 of every 100 alarms were not real. | This is the alarm fatigue. |
| Recording length | 360 s (6 min), 90,000 samples | S | Each recording is 5 minutes before the alarm and 1 minute after. | We always know where the alarm is: at 300 s. |
| Sampling rate | 250 Hz | S | The machine took 250 readings every second. | Fast enough to see the shape of each heartbeat. |
| Model input window | 10 s = 2,500 samples | M | The model looks at 10 seconds only. | A short window is what a live system could realistically use. |
| Window position | from 292 s to 302 s, so 8 s before to 2 s after the alarm | M (alarm at 300 s, +2.0 s offset) | The window ends 2 seconds after the alarm rang. | The model only uses data that would exist 2 seconds after the alarm. The 2-second margin is our own choice and was not tested against 0 s. |
| Validation set | 495 alarms (141 true, 354 false) | M | The set used to tune the cutoff and choose models. | Keeps the test set clean. |
| Test set | 482 alarms (137 true, 345 false) | M | The set used once, at the end, for the final score. | The honest score. The model never saw it while learning or tuning. |
| Training set | **not recorded** | - | The remaining alarms. Its size was printed in Colab but not saved. | We do not state a number we cannot show. |
| Replay sample | 25 alarms (10 true, 15 false), from 22 patients | R, `data/sample/replay_index.json` | The small demo set shown on the dashboard. | It contains extra true alarms on purpose, so it is **not** a score. |
| Alarms with no blood-pressure signal (ABP) | 3,200 of 5,037 (63.5%) | S | Most patients have no arterial blood-pressure line. | The model must work without it. |
| Alarms with no pulse-wave signal (PPG) | 356 of 5,037 | S (291 + 64 + 1) | A few patients lack the finger sensor. | Same: missing is normal. |

---

## 2. The final model

| Number | Value | Source | In plain words | Why it matters |
|---|---|---|---|---|
| Model name | `resnet1d-C4_all_dropout-off2.0` | M | A small 1D ResNet, run number C4, using all four signal slots. | The exact model that runs in the demo. |
| Stored values in the model file | 531,365 | the ONNX file | Roughly half a million numbers describe the model. | It is small, so it runs on an old laptop. |
| Model file size | 2,132,919 bytes (about 2.1 MB) | `models/model.onnx` | The file is about two megabytes. | Easy to copy and load. |
| Threshold τ (tau) | 0.5148 (shown as 0.51 or 0.515) | M | The cutoff: escalate if the probability is at least this. | The single knob that trades missed alarms against false alarms. |
| Other threshold (not used) | 0.5606 | M | A cutoff tuned for cost only, with no safety rule. On validation it scored a little higher (0.813 against 0.795), but on test it missed 12 real alarms against 5. | We rejected it on purpose, because safety comes first. |
| Safety target | 0.95 | M | On validation data, keep at least 95% of true alarms. | Our own safety rule (decision D20). It is a project choice, not a medical standard. |
| Cost of a miss | 5 | `vtac/metrics.py` | One missed true alarm counts as five false alarms. | Puts the "missing is worse" idea into the score. |

---

## 3. Test results (the final score)

All from M, test set of 482 alarms, at τ = 0.5148.

| Number | Value | In plain words | Why it matters |
|---|---|---|---|
| True alarms caught | 132 of 137 | The system escalated 132 of the 137 real alarms. | This is the safety number. |
| **TPR** (true positive rate, also called sensitivity or recall) | 0.964 | 96.4% of real alarms were kept. Same thing as 132 / 137. | A high number means few real alarms are lost. |
| True alarms missed | 5 | 5 real alarms were suppressed. | Each one is a potential harm. This is why we never call it safe. |
| False alarms suppressed | 278 of 345 | The system silenced 278 of the 345 false alarms. | This is the benefit: fewer needless alarms. |
| **TNR** (true negative rate, also called specificity) | 0.806 | 80.6% of false alarms were silenced. Same thing as 278 / 345. | The dashboard calls this "False-alarm reduction". |
| False alarms still escalated | 67 | 67 false alarms still got through. | The cost of being careful. |
| **PPV** (positive predictive value, also called precision) | 0.663 | Of the 199 alarms the system escalated, 132 were real: 66.3%. | If you hear an escalated alarm, about 2 in 3 are real. |
| PPV with no model (all alarms escalated) | 137 of 482 = 0.284 | Without the model, only 28.4% of alarms are real. | Shows what the model improves on. Derived from M's counts. |
| Alarms shown to staff | 199 instead of 482 | 132 + 67 = 199 escalated, out of 482. | 283 fewer alarms (about 59% fewer). |
| **Challenge Score** | 0.817 (95% CI 0.767 to 0.867) | A single score where a miss costs 5 false alarms. Higher is better. 1.0 is perfect. | Matches the "missing is worse" rule. |
| **PR-AUC** (precision-recall area) | 0.875 | How well the model ranks real alarms above false ones, focusing on the real ones. 1.0 is perfect. | Better than plain accuracy when real alarms are rare. |
| **ROC-AUC** | 0.946 | If you pick one real and one false alarm at random, the model gives the real one the higher score 94.6% of the time. | A threshold-free measure of how well the scores separate the two groups. |
| 95% confidence interval | Challenge 0.767 to 0.867 | If we repeated the study on other patients, the score would likely land in this range. It is a patient-level bootstrap with 500 resamples. | A wide range means we should not trust the second decimal place. |

**Worked example of the Challenge Score.**
Challenge Score = (caught + suppressed false) / (caught + suppressed false + false escalated + 5 x missed).
= (132 + 278) / (132 + 278 + 67 + 5 x 5)
= 410 / 502
= 0.817.

**Why a high TPR on test is not a promise.**
On validation, TPR was 0.950 because we forced it to be.
On test it came out at 0.964.
With only 137 real alarms in the test set, a different set could easily give a different value.
So: "an estimate", never "a guarantee".

---

## 4. Validation results (used for tuning)

From M, validation set of 495 alarms (141 true, 354 false).

| Number | Value | In plain words |
|---|---|---|
| True alarms caught | 134 of 141 (TPR 0.950) | Just above our 95% safety target, as the rule demands. |
| False alarms suppressed | 282 of 354 (TNR 0.797) | About 80% silenced. |
| PPV | 0.650 | About 2 in 3 escalated alarms were real. |
| Challenge Score | 0.795 | Cost-weighted score on validation. |
| PR-AUC / ROC-AUC | 0.886 / 0.945 | Ranking quality on validation. |

---

## 5. Comparison with simpler models (test set)

From B (simple models) and M (our neural network). Same test set, same rule for picking the cutoff.

| Model | True alarms caught | False alarms suppressed | Challenge Score (95% CI) |
|---|---|---|---|
| XGBoost, ECG features only (B0) | 130 of 137 | 214 of 345 | 0.675 (0.609 to 0.733) |
| XGBoost, all features (B1) | 133 of 137 | 208 of 345 | 0.685 (0.616 to 0.746) |
| Neural network (served, C4) | 132 of 137 | 278 of 345 | 0.817 (0.767 to 0.867) |

Plain reading: about the same number of real alarms caught, but the neural network lets through about half as many false alarms (67 against 137 for B1).
"XGBoost" is a standard method that works from hand-made summary numbers instead of the raw signal.

---

## 6. Speed (latency)

From `reports/replay_sample_check.json`, measured on the demo laptop (Intel Core i3 M 380).
"Latency" means the time to produce one verdict (cleaning the signal, then running the model).
It does not include the network, the screen, or the browser.

| Number | Value | In plain words |
|---|---|---|
| Median (warm) | 40.3 ms | Half of all verdicts took less than this. |
| 95th percentile, p95 (warm) | 80.5 ms | 19 out of 20 verdicts took less than this. |
| First pass (cold) median / p95 | 66.2 ms / 91.4 ms | The first time through is a bit slower. |
| Calls in the warm measurement | 250 | 25 alarms x 10 passes. |
| Browser speed, screen frame rate | **not measured** | We have not measured the dashboard's frame rate. Do not quote one. |

ms = milliseconds, one thousandth of a second. 40.3 ms is about 4 hundredths of a second.

One run, one laptop, other programs possibly running: the spread is real.
Old figures like "63 ms" or "240 ms" are replaced by this table.

---

## 7. The demo set (25 alarms)

From R. Not a score.

| Number | Value | In plain words |
|---|---|---|
| True alarms escalated | 9 of 10 | One real alarm was missed: `a06fbf_0500`. |
| False alarms suppressed | 12 of 15 | Three false alarms still got through. |
| Missed alarm score | p = 0.476 against τ = 0.515 | It was 0.039 below the cutoff. Close, but still a miss. |
| Alarms with no ABP signal | 13 of 25 | Roughly half of the demo alarms have no blood-pressure line. |
| PPG rated "degraded" | 25 of 25 | The pulse-wave channel looked rough in every demo window. The saved report does not say which test triggered it. |

---

## 8. Which numbers to quote

Quote: the test-set numbers in section 3, with the words "held-out test set of 482 alarms".
Do not quote: the demo-set numbers as performance.
Do not quote: any frame rate, any browser timing, or any number for the untried 0 s window.
The dashboard's Model card shows "not available" for some rows (a known gap), so read numbers from this file, not from that card.
