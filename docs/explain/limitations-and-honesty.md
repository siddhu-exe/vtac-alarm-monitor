# Limitations and honesty

Read this before you present.
Its job is simple: you never claim something that is not there.

---

## 1. The three sentences to say first

1. This is a **simulated replay of recorded data**. It is not live.
2. It is **not a medical device** and **not for clinical use**.
3. It was tested on one public dataset, with one training run per setup.

The dashboard says the same in its top badge ("SIMULATED REAL-TIME · REPLAYED RECORDINGS") and in its footer.

---

## 2. What it is, and what it is not

| It is | It is not |
|---|---|
| A replay of real ICU recordings from the public VTaC dataset | Connected to any bedside monitor |
| A model that scores each alarm from 10 seconds of recorded signal | A live system that watches a patient |
| Evaluated on a held-out test set of 482 alarms | Clinically validated |
| A demo that shows a verdict next to the expert label | Something that pages a nurse or acts on a patient |
| A research prototype | A medical device |

---

## 3. Misses are real

On the 482-alarm test set the system **missed 5 of 137 real alarms** (`models/model_config.json`).
That is TPR 0.964.
It is an estimate, not a guarantee.

- On validation, TPR was 0.950 because the rule forced it.
- The test Challenge Score is 0.817, but its 95% interval is 0.767 to 0.867.
- With only 137 real alarms, another set of patients could give a noticeably different result.

### The missed alarm in the demo: `a06fbf_0500`

What is **measured** (`reports/replay_sample_check.json`, `reports/demo_alarm_numerics.json`):

- It is a true alarm.
- The system gave it a score of 0.476. The cutoff is 0.515. So it was suppressed, 0.039 below the line.
- All four channels were present. ECG was good. PPG was rated degraded. ABP was good.
- The heart-rate and pulse-rate readouts agree at about 117 to 118 per minute until about 297 s.
- The change starts around 298 to 300 s: heart rate 155 at 300 s, pulse rate gone from 300 s, systolic pressure 109 at 299 s and 108 at 300 s, then no pressure readout at 301 and 302 s.
- The model's window ends at 302 s, so the change is only in the last few seconds of its 10 seconds.
- The same patient's false alarm (`a06fbf_0533`) scored 0.213.

What is **not known**:

- *Why* the model scored it 0.476. No explanation tool was built, so I cannot say what the network focused on.
- Whether the late change is the reason. It is a plausible reading of the data, not a finding.

How to talk about it: "This is exactly the error the system is built to avoid. The cutoff is set to make it rare, but it still happens: 5 times in 137 on the test set."

Never say: "it was close, so it's basically right." A miss is a miss.

---

## 4. What was not built

Say "not built" for each of these, and do not hint that they exist.

| Item | Status |
|---|---|
| Grad-CAM, or any explanation of why the model decided | **Not built.** A box on the verdict card ("Where the model looked") exists, but it only shows a note that no attribution is computed. No numbers are ever shown in it. |
| Drift monitoring and automatic retraining | **Not built.** |
| Docker | **Not built.** |
| CI/CD (automatic testing in the cloud) | **Not built.** Tests are run by hand. |
| DVC (data versioning) | **Not built.** |
| MLflow / DagsHub (experiment tracking) | **Not built.** Results are in `reports/` and `docs/modeling.md`. |
| Model registry | **Not built.** |

These were dropped on purpose so the core could be finished (decision D32).

**A wording slip to know about.** The "Where the model looked" box in the dashboard still says the feature is "planned for checkpoint 2".
That plan was dropped.
If someone reads it, say: "That text is out of date. It is not planned."

---

## 5. Other things not done, or not known

- **The 0-second window was not tested.** The model sees a window ending 2 seconds after the alarm. That was my choice. The official benchmark window ends exactly at the alarm. I never compared them, so I cannot say which is better, and my numbers are not directly comparable with published ones.
- **One training run per setup.** Small differences between versions are within noise.
- **One dataset, one split.** No data from another hospital.
- **The ONNX versus PyTorch check cannot be repeated.** The PyTorch weights were not saved. 4 tests are skipped for this reason. The notebook checked it once, but the printed result was not kept.
- **The test-set errors cannot be studied.** The per-alarm test scores were not saved. I know there were 5 misses and 67 false escalations, but not which alarms.
- **Calibration was not measured.** Do not tell anyone a score of 0.7 means "70% chance".
- **Training set size, patient counts and the 1,441-true figure are not recorded in the repo.** The 28.61% figure comes from the project brief. If asked: "from the brief; I did not save a re-count".
- **Browser speed was not measured.** The only timing is the backend's: median 40.3 ms, p95 80.5 ms for one verdict (`reports/replay_sample_check.json`), on one laptop in one run.
- **The Model card is partly empty.** In the dashboard it shows "not available" or "not evaluated yet" for architecture, baseline, test PR-AUC and Challenge score. The cause: `models/model_config.json` lacks the keys the card reads. It is a known gap, not a bug in the numbers. Do not read figures off that card.
- **The notebooks' stored outputs were cleared.** The saved files in `reports/` and `models/model_config.json` are the record.

---

## 6. The demo set is not a score

The 25 demo alarms were picked on purpose: 10 true and 15 false (`data/sample/replay_index.json`), with extra true alarms.
Results there (9 of 10 true kept, 12 of 15 false silenced) are for the demo only.
For performance, always use the test-set numbers (132 of 137 and 278 of 345).

---

## 7. Display numbers are not measurements

The heart rate, pulse rate and blood pressure shown next to the waveforms are **display estimates** made by simple peak detection (`vtac.display`) over the last 8 seconds.

- They lag the signal.
- They are not fed to the model.
- They are not clinical measurements.
- Sometimes they show nothing, on purpose, when the signal is too poor.

---

## 8. Say this / do not say this

| Do say | Do not say |
|---|---|
| "Simulated replay of recorded ICU data." | "Real-time monitoring of patients." |
| "On the held-out test set it kept 132 of 137 real alarms." | "It never misses a real alarm." / "It is safe." |
| "It silenced 278 of 345 false alarms, about 81%." | "It removes 81% of alarms." (it removed 278 false ones; 5 real ones were also lost) |
| "I chose the cutoff on validation data so that at least 95% of real alarms are kept." | "95% is the medical standard." |
| "It beat the simpler model: about half as many false alarms let through." | "It beats published methods." (not compared) |
| "I did not build an explanation feature." | "It explains its decisions." / "It uses Grad-CAM." |
| "The 2-second window margin is my choice and untested." | "The window is optimal." |
| "I did not measure that." | A number you are not sure of. |
| "It runs on a small CPU-only laptop; a verdict takes a median of 40 ms in the backend." | "It runs at 60 frames per second." (not measured) |
| "The model card has a known gap." | "The model card shows the results." |
| "No nurse is paged; this is a replay." | "It alerts clinicians." |

---

## 9. If you are not sure

1. Check the source file named in `docs/explain/numbers-explained.md`.
2. If the number is not there, it was not recorded. Say so.
3. Prefer "I did not measure that" over any guess.
