# Viva questions and short answers

Short answers to likely questions.
Numbers come from `models/model_config.json` (M), `reports/baseline_metrics_off2.0.json` (B), `reports/cnn_val_ablation_off2.0.csv` (A), `reports/data_survey.json` (S), `reports/replay_sample_check.json` (R), and `docs/decisions.md` (D-numbers).
If a question asks for something that was not measured, the answer says so.
That is a good answer. Do not guess.

Always remember: **simulated replay, not live, not for clinical use.**

---

## A. The problem and the data

**1. What is ventricular tachycardia (VT)?**
A very fast heartbeat that starts in the lower chambers of the heart.
It can be dangerous, because the heart may not pump blood well.
Bedside monitors watch for it and sound an alarm.

**2. What is a false alarm here?**
The monitor rang for VT, but an expert label says the patient did not have VT.
The files here do not record why each false alarm happened. Noisy signals are one clue the project treats as useful (D27).
In the data, about 71 of every 100 alarms were false (28.61% true, from the project brief).

**3. Why does that matter?**
Too many false alarms cause alarm fatigue.
Staff may react more slowly to all alarms, including real ones.
The aim is to remove false alarms and keep the real ones.

**4. Why did you choose the VTaC dataset?**
It is a public set of real ICU VT alarms, each with a true or false label and several signals (D01).
It has an official train, validation and test split.
It comes with a benchmark whose filter settings I could follow.

**5. How big is it?**
5,037 alarms, each a 6-minute recording at 250 readings per second (S).
The test set has 482 alarms (137 true, 345 false) and the validation set has 495 (141 true, 354 false) (M).

**6. What signals are there?**
ECG: the heart's electrical trace. PPG: a pulse wave from a finger clip. ABP: arterial blood pressure from a line in an artery.
Which ones exist varies by patient.
ABP is missing in 3,200 of 5,037 recordings, 63.5% (S).

**7. Where do the labels come from?**
They are supplied with the dataset (the file `event_labels.csv`, column `decision`).
I used them as given.
I did not label anything myself, and I cannot tell you who labelled them from the files in this repo.

**8. Why a patient-level split?**
One patient can have up to 5 alarms.
If one patient's alarms sit in both training and test, the model can learn the patient instead of the disease.
Then the test score would look better than it really is.
So all alarms of a patient go to the same split.

**9. How do you know the split has no patient overlap?**
The data-prep notebook asserts it in code and would have stopped otherwise.
It finished and produced its outputs, so the assertion passed.
The printed check output was not saved in the repo, so my evidence is the code and the finished run, not a saved log.

**10. Why not split randomly?**
A random split would mix patients across splits and cause the leakage in question 8.
I used the official split as provided.

---

## B. Preparing the signals

**11. Why a 10-second window?**
The model needs a short stretch of signal around the alarm.
10 seconds is 2,500 readings, enough to see several heartbeats.
It is also short enough that a live system could produce a verdict quickly.

**12. Is the window from -10 s to +2 s?**
No. The window is **10 seconds long and ends 2 seconds after the alarm**.
So it runs from **8 seconds before** the alarm to **2 seconds after** it (292 s to 302 s, with the alarm at 300 s) (M).
"-10 to +2" would be 12 seconds, and that is wrong.
The dashboard's chart is wider (about 14 seconds before to 4 seconds after) just to give context, but the model only sees the 10-second part.

**13. Why end the window 2 seconds after the alarm?**
So the window contains the beats that triggered the alarm (D18).
It is my choice.
I did **not** test it against a window ending exactly at the alarm, so I cannot say it is better or worse.
That is a stated limitation.

**14. How do you handle missing channels?**
Four fixed slots: ECG 1, ECG 2, PPG, ABP, plus a 0/1 mask.
A missing or unusable channel is zeros with mask 0.
The model reads the mask, so it knows the channel is missing.
During training of the final model, channels were randomly hidden so it learned to cope.

**15. Why not fill in the missing channels?**
Inventing a signal could mislead the model.
"Missing" is honest information, and it is sometimes useful by itself.

**16. What does "degraded" mean?**
A quality label for a channel that is usable but rough.
It means: more than 5% of values missing, or a gap longer than 1 second, or more than 30% of values flat (`models/model_config.json`).
In the demo set, the PPG channel was rated degraded in all 25 windows (R).
The saved report does not say which of those three rules fired.

**17. Why filter the signals?**
To remove electrical hum and slow drifting, while keeping the heartbeat shape.
I followed the benchmark's settings: for ECG, 1 to 30 Hz; for PPG, 0.5 to 5 Hz; for ABP, below 16 Hz; plus a 60 Hz notch (D27).
I ran the filters forwards and backwards so nothing shifts in time.

**18. Why scale each channel?**
Different channels have different units and sizes.
Scaling each 10-second piece to average 0 and spread 1 puts them on common footing.
One example: PLETH is in two different units across the records (S).

**19. Why do noisy signals still go to the model?**
Because noise is often the reason an alarm is false.
Removing it would hide a useful clue.

---

## C. The models

**20. What is your baseline and why have one?**
XGBoost on hand-made numbers (heart rate, regularity, peak sizes and so on; 31 or 49 numbers).
A baseline shows whether the neural network is actually worth it.
It did beat it: 67 false alarms let through against 137 for the larger baseline, at about the same number of real alarms caught (M and B).

**21. Why a CNN / ResNet?**
It reads the raw signal and can find patterns I would not think to write by hand.
A 1D ResNet is a standard, small, stable choice for signals like this.
The exported model is about 2.1 MB.

**22. How did you handle imbalance (more false than true alarms)?**
I compared two ways: a weighted sampler and focal loss.
Focal loss had higher validation PR-AUC in both comparisons (0.881 against 0.849 for ECG-only; 0.878 against 0.857 for all channels, from A).
The gap is small and from a single run.

**23. What is focal loss?**
A training rule that gives more weight to hard examples and to the rarer class.
It stops the model from getting lazy by always guessing the majority.

**24. What is an ablation? What did you find?**
An ablation changes one thing at a time to see what matters.
Findings (validation, one run each): the CNN beat the baselines; focal loss beat the sampler; adding pulse and blood-pressure channels cut false alarms at the same recall (PPV 0.517 to 0.636) but did not change PR-AUC; ABP helped more than PPG; channel dropout did not clearly help.
All gaps are small, because each was run once on 495 alarms.

**25. How did you pick the final model?**
By a rule written in the notebook before looking at test: the best validation PR-AUC among runs using all four slots.
That was C4, with 0.8863 against 0.8779 for C3 and 0.8567 for C2 (A).

**26. Why only one seed?**
Time. Each configuration was trained once (seed 42).
So I have no estimate of how much results change from run to run.
That is a limitation.

---

## D. Metrics and the threshold

**27. Why PR-AUC and not accuracy?**
Because most alarms are false.
A system that calls everything "false" would have 71.6% accuracy on the test set (345 of 482) and would catch zero real alarms.
Accuracy hides that.
PR-AUC focuses on how well the real alarms are found and how pure the alarms are.

**28. Explain TPR, TNR, PPV.**
TPR: of the real alarms, the share we kept. 132 of 137 = 0.964.
TNR: of the false alarms, the share we silenced. 278 of 345 = 0.806.
PPV: of the alarms we kept, the share that were real. 132 of 199 = 0.663.

**29. What is the Challenge Score and why the 1:5 cost?**
Score = (caught + silenced false) / (caught + silenced false + false escalated + 5 x missed).
A missed real alarm counts as five false ones.
The weighting comes from the PhysioNet/CinC 2015 false-alarm challenge, and I adopted it (D07).
It expresses "missing is worse".
It is a modelling choice and not a measured clinical cost.

**30. Why did you choose the threshold 0.515?**
Two rules, both on validation data only (D20):
(1) keep at least 95% of the real alarms; (2) among those, pick the best Challenge Score.
That gave 0.5148 (M).

**31. Why 95%? Is that a medical standard?**
No. 0.95 is a safety target I set for the project.
I cannot claim it is clinically adequate.

**32. Why not just use 0.5?**
0.5 is only a habit.
I tuned the cutoff to my goal instead of assuming it.
(0.5148 is close to 0.5 by coincidence.)

**33. What about the other threshold, 0.561?**
It maximises the Challenge Score with no safety rule.
It silences more false alarms (294 instead of 278 on test), but misses 12 real alarms instead of 5 (M).
I stored it but did not use it.

**34. Was the test set used to tune anything?**
No. The cutoff and model choice used validation data.
The test set was run once, at the end.

**35. What do the confidence intervals mean?**
They show how much the score might change with different patients.
I resampled patients (500 times) to get them.
The test Challenge Score is 0.817 with a 95% interval of 0.767 to 0.867.
It is wide because the test set has only 137 real alarms.

**36. Is a probability of 0.7 a 70% chance?**
Not necessarily.
I did not measure calibration, so read the number as a score to compare with the cutoff, not as an exact chance.

---

## E. Results, errors, limitations

**37. What are your final results?**
On the 482-alarm test set: 132 of 137 real alarms kept (TPR 0.964), 278 of 345 false alarms silenced (TNR 0.806), PPV 0.663, Challenge Score 0.817, PR-AUC 0.875, ROC-AUC 0.946 (M).

**38. How does it compare with published work?**
I cannot say.
The benchmark uses a window that ends at the alarm, and I used one ending 2 seconds later.
I did not run the 0-second version, and no published scores are stored in this repo.
So: not measured.

**39. What did the model get wrong?**
On the test set: 5 real alarms missed and 67 false alarms escalated (M).
Which specific alarms those were was not saved, so I cannot analyse them.
On the 25-alarm demo set: one miss (`a06fbf_0500`) and three false escalations (`3ba184_0047`, `108c4d_4582`, `79c471_0246`) (R).

**40. Why was `a06fbf_0500` missed?**
I do not know.
What the data shows: the heart rate and pulse rate agree at about 117 per minute until about 297 s.
The change (faster heart rate, pulse gone, pressure falling) starts around 298 to 300 s, in the last few seconds of the 10-second window.
The score was 0.476, which is 0.039 below the cutoff of 0.515.
I built no explanation tool, so I cannot say what the network focused on.

**41. Why was `108c4d_4582` escalated although it is false?**
In its readouts it looks like a true alarm: fast heart rate, no pulse signal, and the blood-pressure reading drops out.
Why the monitor rang, and why the model scored 0.586, I did not investigate.

**42. What are the limitations?**
- Replay of recordings, not live. No clinical validation.
- One dataset, one split, one training run per setup.
- Window offset not tested against the benchmark version.
- Misses happen: 5 of 137 on test.
- Weak or missing channels: ABP absent in 63.5% of records.
- No explanation of verdicts.
- ONNX versus PyTorch could not be re-checked (weights not saved).

**43. Is this safe to use on patients?**
No. It is not a medical device, it has not been clinically validated, and it was only ever run on recorded data.

**44. Does the system page nurses?**
No. It replays recordings and shows a verdict.
There is deliberately no "nurse paged" message.

---

## F. The system

**45. Why Google Colab and the laptop?**
The laptop is old with little memory.
Training and heavy processing ran in Colab (D03).
The laptop runs only the finished model, the backend and the dashboard.

**46. Why ONNX?**
It lets the laptop run the trained model with a small library (onnxruntime) and without PyTorch (D11).
Median time to clean and score one alarm: 40.3 ms, 95th percentile 80.5 ms (R, 250 warm calls).
That does not include the browser, which I did not measure.

**47. What is mock mode and why have it?**
The backend can return fake, hash-based scores instead of using the model.
I built it so the dashboard could be developed before the model existed, and for tests.
It is clearly labelled and is not used in the demo.

**48. How do you avoid train/serve skew?**
All cleaning code lives in one package (`src/vtac`).
The Colab notebooks and the backend both import it.
Tests check that the different input routes give identical model inputs for the same synthetic record.

**49. What does "simulated real-time" mean?**
The server streams a recording at the speed it was recorded, in small chunks, as if live.
The verdict is made only from data up to the end of the window.
It is still a replay of a stored file.

**50. Why a WebSocket?**
It keeps a connection open so the server can send a steady stream of chunks.
Asking for each chunk separately would be clumsier.

**51. Why React with uPlot?**
uPlot draws fast time-series charts with little overhead (D13).
Waveform samples are kept out of React's normal state, so the screen does not stutter.
I have not measured the frame rate in the browser.

**52. How is the code tested?**
Python: 61 tests pass and 4 are skipped (the ONNX versus PyTorch parity tests, which need a file that does not exist).
Dashboard: 231 tests pass.
Linting and type checks are clean.
(Counts from a run on 2026-10-18.)

---

## G. What is not built, and next steps

**53. What is not built?**
Grad-CAM or any explanation of verdicts, drift monitoring, Docker, automatic testing in the cloud (CI/CD), data versioning (DVC), and experiment tracking (MLflow).
They were dropped on purpose to finish the core.
Do not say they exist.

**54. What would you do next if there were more time?**
These are ideas, not things I did:
- Run the 0-second window to compare fairly with published work.
- Train several seeds and report the spread.
- Save the model weights and per-alarm test scores, so errors can be studied.
- Add an explanation method and check it against the 5 missed alarms.
- Test on data from other hospitals.
- Measure browser speed.

**55. If someone asks something you cannot answer from these files?**
Say: "I did not measure that" or "that is not recorded".
Then say what you did measure.
