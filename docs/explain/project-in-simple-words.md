# The project in simple words

This is a plain-language guide for presenting.
It uses short sentences on purpose.
The technical version is in `docs/architecture.md` and `docs/modeling.md`.

**One rule before anything else.**
This system is a **simulated replay**.
It plays back recordings that were made earlier.
It is **not** connected to a real patient or a real monitor.
It is **not** for clinical use.
Say this early, every time.

Where a number comes from, the file is named next to it.

---

## 1. The problem: alarm fatigue

Think of a smoke alarm that goes off every time someone makes toast.
At first, you run to check.
After a hundred false alarms, you stop running.
Then one day it is a real fire.

Intensive care units (ICUs) have the same problem.

- Every patient is wired to a bedside monitor.
- The monitor watches the heart.
- When it sees a pattern that looks like a dangerous fast heartbeat, it sounds an alarm.
- That dangerous heartbeat is called **ventricular tachycardia**, or **VT** for short.

The monitor is built to be cautious.
It would rather ring too often than miss a real one.
So it rings a lot, and many rings are false.

In the dataset used here, 5,037 VT alarms were recorded (`reports/data_survey.json`).
About 28.61% were real (the project brief gives 28.61%).
That means roughly 71 of every 100 alarms were false.

Nurses hear all of them.
After many false ones, people start to tune alarms out.
This is called **alarm fatigue**.
It is dangerous, because a real alarm can get less attention.

## 2. What this system does

It acts like a **second opinion** on each VT alarm.

- It looks at the few seconds of signal around the alarm.
- It answers one question: "Is this alarm real?"
- It gives a probability, a number from 0 to 1.
- If the probability is high enough, the alarm is **escalated** (kept as it is).
- If it is low, the alarm is **suppressed** (marked as probably false).

A dashboard shows this on screen, with the live-looking waveforms.

The goal has two parts, and they pull against each other:

1. Silence as many false alarms as possible.
2. Almost never silence a real one.

Missing a real alarm is far worse than a false alarm.
So the system is tuned to be careful about the second part.

## 3. How it works, step by step

1. **Real recordings.**
   The data comes from VTaC, a public set of ICU recordings on PhysioNet.
   Each alarm is a 6-minute recording: 5 minutes before the alarm, 1 minute after.
   Signals are sampled 250 times per second (`reports/data_survey.json`).
2. **Expert labels.**
   Each alarm in the dataset is labelled true or false.
   The model learns from these labels.
3. **Clean the signal.**
   Raw signals have electrical noise and slow drifting.
   We filter them, then scale each one to a standard size.
4. **Cut out the right 10 seconds.**
   The model sees 10 seconds: from 8 seconds before the alarm to 2 seconds after it.
5. **Handle missing sensors.**
   Not every patient has every sensor.
   Missing ones are marked as missing.
   We never make up data to fill the gap.
6. **The model decides.**
   It is a small neural network, trained on past alarms.
   It reads the signals and outputs a probability.
7. **Apply the cutoff.**
   If the probability is at least 0.515, escalate.
   Otherwise, suppress.
   (The exact cutoff is 0.5148, from `models/model_config.json`.)
8. **Show it.**
   A server replays the recording like a live feed.
   The dashboard draws the waveforms and shows the verdict.

Heavy work (training) was done on Google Colab, a free cloud computer.
The laptop only runs the finished model and the dashboard.

## 4. How we picked the cutoff

We did not pick 0.5 by habit.

- Rule 1: the cutoff must keep at least 95% of the real alarms (on validation data).
- Rule 2: among cutoffs that pass rule 1, pick the one with the best score, where a missed real alarm counts as 5 false alarms.

The cutoff was chosen on a separate **validation** set.
The final **test** set was used once, at the end.
That keeps the final result honest.

## 5. What we found

On the held-out test set of 482 alarms (`models/model_config.json`):

- 137 were real. The system kept 132 of them. It missed 5.
- 345 were false. The system silenced 278 of them. 67 still got through.

So about 96 of every 100 real alarms are kept.
And about 81 of every 100 false alarms are silenced.

The nurse would see 199 alarms instead of 482.
That is 283 fewer, about 59% fewer.
(199 = 132 + 67. 283 = 278 + 5. Both from the same file.)

Not perfect.
5 real alarms were missed.
That is exactly why we do not call it safe or clinical.

## 6. What this is not

- Not live. It replays recordings.
- Not tested on patients.
- Not a medical device.
- Does not page anyone.
- Does not explain why it decided (that feature was not built).

---

## Say it out loud: the 30-second version

> ICU monitors raise a lot of alarms for a dangerous fast heartbeat, and most of them are false.
> That wears nurses down, and it is called alarm fatigue.
> I built a system that looks at the signals around each alarm and decides if it is real.
> On held-out test data, it kept 132 of 137 real alarms and silenced 278 of 345 false ones.
> It is a simulated replay of recorded data, not a live system, and not for clinical use.

(About 30 seconds at a normal speaking pace.)

## Say it out loud: the 2-minute version

> ICU monitors watch the heart all day.
> When they see something that looks like ventricular tachycardia, a dangerous fast heartbeat, they sound an alarm.
> The monitors are built to be careful, so they ring a lot.
> In the public dataset I used, 5,037 alarms were recorded, and only about 29% were real.
> So most alarms are false, and staff get tired of them.
> That is called alarm fatigue, and it is a safety problem.
>
> My project adds a second opinion.
> For each alarm, it takes 10 seconds of the patient's signals, from 8 seconds before the alarm to 2 seconds after.
> It cleans the signals, marks any missing sensors as missing, and gives them to a small neural network.
> The network outputs the chance that the alarm is real.
> If that chance is at least 0.515, the alarm is escalated.
> If not, it is suppressed.
>
> I chose that cutoff carefully.
> A missed real alarm is much worse than a false one, so I counted it as five false alarms.
> I also required that at least 95% of real alarms be kept on validation data.
> I tuned all this on a validation set, and I used the test set only once, at the end.
>
> On the test set of 482 alarms, the system kept 132 of 137 real alarms, and silenced 278 of 345 false ones.
> That is about 96% and 81%.
> A simpler method, using hand-made features and a standard model, silenced only about 60 to 62% of false alarms at similar recall.
> But the system still missed 5 real alarms, and I show one of them in the demo.
>
> The dashboard replays recordings in real time, draws the waveforms, and shows each verdict.
> I want to be clear about the limits.
> This is a simulated replay of recorded data.
> It is not connected to any monitor, it has no clinical validation, and it is not for clinical use.
> It also gives no explanation for its decisions.

(About 2 minutes at a normal speaking pace.)

Numbers used above come from `models/model_config.json` (CNN), `reports/baseline_metrics_off2.0.json` (the simpler method: 214 and 208 of 345 false alarms suppressed, so 62% and 60%), and `reports/data_survey.json`.
