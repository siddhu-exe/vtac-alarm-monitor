# How each part works

One short section per part.
Each has: **What it does**, **How**, and **Why I chose this**.
The reasons come from the decision log (`docs/decisions.md`, D-numbers).
Remember: everything is a **simulated replay** of recorded data.

The path of one alarm, start to finish:

```
recording -> clean -> cut 10 s -> mark missing sensors -> model -> probability -> cutoff -> verdict -> dashboard
```

---

## 1. Data preparation

**What it does.**
Turns the public VTaC download into clean model inputs.

**How.**
It runs in Google Colab (`notebooks/01_data_prep`).

- It downloads the recordings and two label files: one with the true/false label, one with the official train/validation/test split.
- It checks the split does not mix patients (see below).
- It reads the header of every recording (5,037) to list channel names, units and sampling rates (`reports/data_survey.json`).
- It runs every alarm through the shared cleaning code and saves the result.
- It picks 25 test alarms (10 true, 15 false) as the demo set.

**The patient-level split.**
One patient can have up to 5 alarms.
If alarms from one patient land in both training and testing, the model could "recognise the patient" and look better than it is.
So the whole patient stays on one side.
The notebook has a hard check that stops if any patient appears in two splits.
It ran to the end, so the check passed.
(The printed output was not saved, so we state this from the code, not from a saved log.)

**Why I chose this.**
The laptop is old and has little memory (D03), so heavy work goes to Colab.
Using the official split makes the test set a fair, untouched exam (D02).

---

## 2. Filtering

**What it does.**
Removes noise from each signal while keeping the heartbeat shape.

**How** (`src/vtac/filters.py`, values in `models/model_config.json`).

- All channels: cut the 60 Hz hum from mains electricity (a "notch" filter).
- ECG (the heart's electrical trace): keep between 1 Hz and 30 Hz.
- PPG (the pulse wave from a finger clip): keep between 0.5 Hz and 5 Hz.
- ABP (arterial blood pressure): keep everything below 16 Hz.
- Filters run forwards and backwards, so waves are not shifted in time.

Then each channel is **scaled** to have average 0 and spread 1, using only its own 10 seconds.
That way a signal measured in millivolts and one in mmHg are on a common scale.

**Why I chose this.**
The settings follow the official benchmark's code for this dataset (D27).
Running them both ways avoids shifting the waveform.
I did not treat noise as "bad data" to throw away.
A noisy ECG is often a clue that an alarm is false, so the model should see it.

---

## 3. Windowing

**What it does.**
Cuts out the 10 seconds the model will look at.

**How** (`src/vtac/windows.py`).
The alarm rings at 300 s into the recording.
The window runs from 292 s to 302 s.
That is **8 seconds before** the alarm and **2 seconds after** it.
That is 2,500 readings at 250 per second.
If the window does not fit, the code raises an error.
It never quietly slides the window.

**Why I chose this.**
A live system only has data up to about the moment of the alarm.
A 2-second margin lets the window include the beats that triggered it (D18).
**Honest note:** the 2-second margin is my choice.
I did not test it against a window ending exactly at the alarm, so I cannot say it is better.

---

## 4. Missing channels and the mask

**What it does.**
Handles patients who lack some sensors.

**How** (`src/vtac/channels.py`).
The model always has four slots: ECG 1, ECG 2, PPG, ABP.
Each slot gets a 0 or 1 flag, called the **mask**.

- No such sensor, or the signal is unusable (for example mostly empty or flat) -> slot is zeros and mask 0.
- Usable -> real signal and mask 1.
- Never copy one channel into another slot.

Each channel also gets a quality label: good, degraded, bad or absent.
The dashboard shows these as text badges.

**Why I chose this.**
Channels differ between patients.
ABP is missing in 63.5% of alarms (`reports/data_survey.json`), so a model that needed it would be useless.
Saying "missing" out loud is safer than inventing numbers (D06).
During training, channels were also randomly hidden, so the model gets used to gaps.

---

## 5. Features (the simpler baseline)

**What it does.**
Turns a signal into a short list of summary numbers.
These feed the baseline model.

**How.**
Examples of summary numbers: the heart rate, how regular the beats are, how big the peaks are, how much high-frequency noise there is, and whether ECG and pulse-wave rates agree.
There are 49 numbers in total in the larger set (35 from our own code, 14 from a library called neurokit2).

A standard method, **XGBoost**, learns from these numbers.
Think of it as a big set of if-then rules.

**Why I chose this.**
It is a fair floor to beat: easy to understand and quick to build (D09).
If a fancy model cannot beat it, the fancy model is not worth it.
Our neural network did beat it: about the same real alarms caught, but about half as many false alarms let through on test (67 against 137 for the larger feature set, `reports/baseline_metrics_off2.0.json` and `models/model_config.json`).

---

## 6. The neural network (CNN)

**What it does.**
Reads the cleaned signals directly and outputs one number: the probability that the alarm is real.

**How, in simple terms** (`notebooks/03_cnn.ipynb`).
A **convolutional neural network** slides small "pattern detectors" along the signal.

- Early detectors pick up tiny shapes, like the sharp tip of a heartbeat.
- Later detectors combine those into bigger patterns, like "fast regular beats" or "scribbly noise".
- At the end, all findings are averaged over the 10 seconds, combined with the mask, and turned into one probability.

Ours is a **ResNet**: it has shortcut links that make deep networks easier to train.
It has 5 blocks.

**How it learned.**
It was shown thousands of past alarms with their true or false label.
After each guess it was nudged to do better.
Real alarms are rarer than false ones (about 29% against 71%).
So I used a "focal loss", which makes the model pay more attention to hard or rare cases.
Training stopped early when the validation score stopped improving.

**Why I chose this.**
It reads the raw signal, so it can find patterns I did not think to write down (D09).
I compared several versions (C0 to C4) and chose the one with the best validation PR-AUC among those using all channels, by a rule fixed before looking at test.
That was run C4 (`reports/cnn_val_ablation_off2.0.csv`).
**Honest note:** I trained each setup once (one random seed), so small differences between versions are within noise.

---

## 7. Why ONNX

**What it does.**
ONNX is a file format for saved models.
It lets a model trained with one tool run in another, with no training software installed.

**How.**
Training used PyTorch in Colab, then the model was exported to `model.onnx` (about 2.1 MB).
On the laptop, a small program called onnxruntime runs it on the CPU.
No PyTorch on the laptop.

**Why I chose this.**
The laptop is old, with little memory (D11).
Installing PyTorch would be heavy.
onnxruntime is light and quick: median 40.3 ms for cleaning plus scoring one alarm (`reports/replay_sample_check.json`).
**Honest note:** I could not compare ONNX against the original PyTorch model in this repo, because the PyTorch weights were not saved.
The training notebook did check them once, but the printed result was not kept.

---

## 8. The backend

**What it does.**
A small server that holds the model and the demo alarms.
It answers questions from the dashboard.

**How** (`backend/app/`, FastAPI).

- `GET /alarms` lists the 25 alarms.
- `GET /model` tells the dashboard the cutoff, the window and the channel order.
- `POST /predict` scores one alarm.
- `GET /metrics` reports timing.
- A WebSocket streams a replay (next section).

Every alarm goes through the same cleaning code the training used (`vtac.preprocess`), then the model.
There is also a **mock mode** that returns fake scores based on a hash of the signal.
It exists so the dashboard could be built before the model was ready, and for tests.
It is clearly labelled "mock", and it is not used in the demo.

**Why I chose this.**
One shared cleaning code for training and serving avoids "train/serve skew", where the model sees slightly different data in real use than in training (D04).
Mock mode let me build the screen first (D12).
The dashboard reads the cutoff from the server, so there is only one place to change it.

---

## 9. The WebSocket replay

**What it does.**
Plays a recording on the screen as if it were arriving live.

**How** (`backend/app/replay.py`).
A WebSocket is a long-lived connection where the server can keep sending.

1. The server sends a short "session" message: which alarm, which channels.
2. Then a stream of "chunks", each about a quarter of a second of signal (0.256 s).
3. About once a second it adds the heart-rate, pulse-rate and blood-pressure readouts.
4. When the replay clock reaches the end of the 10-second window (302 s), it computes **one verdict** from the samples up to that moment and sends it.
5. Then an "end" message.

The dashboard can pause, resume, and change speed (1x, 2x, 4x).

**Why I chose this.**
The verdict is computed only from data available at that moment.
This shows what a live system would do, with no peeking ahead.
A WebSocket is the natural tool for a steady stream.
It is still a replay: the label "simulated real-time (replayed recordings)" is always shown.

---

## 10. The dashboard

**What it does.**
Shows the replay and the model's decision.

**What is on screen.**

- Badge: "SIMULATED REAL-TIME · REPLAYED RECORDINGS". Footer: not for clinical use.
- Alarm feed: the 25 alarms. Click one to replay it.
- Waveform strips: ECG, PPG, ABP, with a marker at the alarm and a shaded model window.
- Quality badges per channel, as words.
- Verdict card: the probability, the cutoff, the decision, then the expert label and whether they agree.
- Summary panel: running counts for this session.
- Model card: model version and runtime. (Some rows say "not available". See the limitations guide.)
- States: loading, offline, reconnecting and error screens all exist.

**How.**
React with TypeScript, and a light chart library (uPlot) for the waveforms.
Waveform samples never go through React's normal state.
They are written straight into fast buffers and drawn once per screen refresh.
Slow information (the verdicts, the connection state) goes through normal state.

**Why I chose this.**
Drawing hundreds of readings per second through normal state would make the screen stutter (D13).
Verdicts are always written as text as well as shown as colour, because colour alone is not enough for everyone.
The expert label stays hidden until the model's verdict arrives, so the demo is fair.
There is deliberately no "nurse paged" message, because the replay pages nobody (D31).
**Honest note:** I have not measured the browser's frame rate.
