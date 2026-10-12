# Demo script (checkpoint 1)

> Simulated real-time (replayed recordings). Not for clinical use. Say this at the start.

Four alarms from the 25-alarm replay sample, in this order. All four are test-split alarms, so none
was seen in training. Threshold tau = 0.515 (the constrained one: it keeps validation TPR >= 0.95).
Scores below are from `models/model.onnx` through the backend's own preprocessing path; the HR,
pulse-rate and ABP numbers are the dashboard's numerics (`vtac.display.compute_numerics`).

The model scores the 10 s window 292-302 s (alarm onset is 300 s, `window_end_offset_s` = +2.0). The
verdict card hides the expert label until the verdict arrives.

| # | Alarm | Expert label | p(true) | Model action | Outcome |
|---|---|---|---|---|---|
| 1 | `8af63e_0504` | false | 0.16 | suppressed | false alarm correctly suppressed |
| 2 | `8f5f43_0332` | true | 0.86 | escalated | true alarm caught |
| 3 | `108c4d_4582` | false | 0.59 | escalated | false alarm still escalated |
| 4 | `a06fbf_0500` | true | 0.48 | suppressed | **true alarm missed** |

Spare false-escalated alarms if needed: `3ba184_0047` (p 0.62), `79c471_0246` (p 0.54). Both lack ABP.
Spare contrast for alarm 4: `a06fbf_0533`, the same patient's false alarm (p 0.21).

## Before you start

Two terminals, started by the presenter (see the sign-off checklist for the full commands):

1. Backend with `VTAC_MODEL_MODE=onnx`.
2. Frontend with `pnpm dev`, then open http://localhost:5173.

Check first: the header shows the **SIMULATED REAL-TIME · REPLAYED RECORDINGS** badge, the model card
shows version `resnet1d-C4_all_dropout-off2.0`, and the alarm feed lists 25 alarms.

## Opening (30 s)

Point at: the badge, then the footer ("not for clinical use"). One sentence: bedside monitors raise
many VT alarms, most are false; the model sorts each alarm into true/false, and the cost of a missed
true alarm is five times a false one, so the threshold is set to keep at least 95% of true alarms.

## 1. `8af63e_0504` - a false alarm, correctly suppressed

Select it in the alarm feed and let it replay.

Point at:
- The **ECG** strips around the onset marker ("Monitor alarm onset"): the dashboard cannot derive a
  steady heart rate from the ECG here (HR shows no value before onset; about 95-103/min after).
- The **PPG/ABP** strips: the pulse rate stays near 113-115/min (when detected) and ABP stays near 150/52 throughout.
- The verdict card: **suppressed**, p(true) about 0.16, well under tau.
- Then the expert label: **False alarm**, agreement shown.

Say: the ECG was unreliable but the pulse and blood pressure carried on unchanged, which is the
pattern of a false alarm. Quality badges: ECG good, PPG and ABP flagged degraded (a high share of
flat samples), so say "degraded" if asked; do not call the signals clean.

## 2. `8f5f43_0332` - a true alarm, caught

Point at:
- All four slots present (no missing-channel strip).
- The numerics around onset: HR jumps to about 150-240/min, the PPG pulse rate is gone by
  300 s, and ABP falls from about 76/68 to about 65/58.
- The verdict card: **escalated**, p(true) about 0.86, the highest of any true alarm in the sample.
- Expert label **True alarm**, agreement.

Say: fast ECG rate with the pulse signal lost and blood pressure falling is what a true VT alarm
looks like in these numbers. PPG and ABP are flagged degraded here too.

## 3. `108c4d_4582` - a false alarm that was escalated

Point at:
- Fast ECG rate (HR about 125-130/min) and no PPG pulse rate; ABP numerics disappear after about
  300 s. In the numbers this looks like a true alarm.
- Verdict: **escalated**, p(true) about 0.59, only 0.07 above tau.
- Expert label **False alarm**; the card shows disagreement and the summary counts it under false
  alarms escalated.

Say: this is the price of the safety setting. At tau = 0.515 the test set suppresses about 81% of
false alarms (278 of 345) and lets the rest through. We chose that on purpose over a higher
threshold that suppresses more but misses more true alarms (see `docs/modeling.md`). We have not
explained why the model, or the monitor, was fooled here; the numbers alone do not show it.

## 4. `a06fbf_0500` - the missed true alarm

Point at:
- The window: HR and pulse rate agree at about 117/min before onset, and ABP sits near 124/57.
  The change (HR about 155/min, no PPG pulse rate, ABP falling to about 108/56 and then no ABP
  numeric) only appears after about 295 s, in the second half of the scored window.
- The verdict card: **suppressed**, p(true) 0.476, which is **0.039 below** tau (0.515).
- Expert label **True alarm**; disagreement. The summary shows one true alarm missed.

**One honest line on why:** in the scored window the first part still looks like a normal, perfused
rhythm (ECG rate matching the pulse rate, steady blood pressure) and the change to a fast rate with
a falling pulse starts only in its second half, and the score landed just under the threshold. That is
what the data shows; it does not prove why the model scored it that way.

Then: this is the error the system is built to avoid, which is why the threshold is conservative
(test TPR 0.96; 5 of 137 true alarms missed on the test set) and why the test confidence interval
is wide. A miss like this is expected, not a surprise. Do not claim it is a clinical-grade safety
guarantee.

## Close (30 s)

Point at the **summary panel** after all four: 2 escalated, 2 suppressed; 1 true alarm
caught, 1 missed, 1 false alarm escalated, 1 false alarm suppressed. Repeat: simulated replay of recorded data,
not connected to any monitor, not for clinical use. The Grad-CAM panel ("Where the model looked") is a
placeholder for checkpoint 2.

## If something goes wrong

- Offline or reconnecting banner: the backend stopped; restart it and the app reconnects.
- No verdict card: the alarm needs to replay past the decision point (about 2 s after onset).
- Verdicts differ from this table: check the model version on the model card and that
  `VTAC_MODEL_MODE=onnx` is set (mock mode shows hashed scores).
