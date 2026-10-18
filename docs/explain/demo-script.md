# Demo script

Total time: about 6 to 8 minutes for four alarms.
This is the "what to click and what to say" version of `docs/demo.md`.
Facts and numbers are from `reports/replay_sample_check.json` and `reports/demo_alarm_numerics.json`.

Signals named below: **ECG** is the heart's electrical trace. **PPG** is the pulse wave from a finger clip. **ABP** is arterial blood pressure. **VT** is ventricular tachycardia, a dangerous fast heartbeat. **τ** (tau) is the cutoff probability.

**Say first, and mean it:** this is a simulated replay of recorded data. It is not live and not for clinical use.

---

## 0. Before you start (5 minutes before)

Terminal 1, from the repo root:

```bash
source .venv/bin/activate
VTAC_MODEL_MODE=onnx uv run uvicorn backend.app.main:app
```

Terminal 2:

```bash
cd frontend && pnpm dev
```

Open http://localhost:5173.

Check these five things:

1. The top badge says **SIMULATED REAL-TIME · REPLAYED RECORDINGS**.
2. The footer says it is not for clinical use.
3. The **Alarm feed** lists 25 alarms.
4. The **Model** card says runtime `onnxruntime (CPU)` and version `resnet1d-C4_all_dropout-off2.0`.
5. Other rows of the Model card read "not available" or "not evaluated yet". That is a known gap. **Do not read numbers off that card.** Use `docs/explain/numbers-explained.md`.

Settings to choose:

- Click **Auto-advance** until it says **OFF**. Otherwise the app jumps to the next alarm by itself when one ends.
- Keep the speed at **1×** for the first alarm, so people can follow. Use **2×** or **4×** later if you are short of time.

Timing: a replay starts about 16 seconds (replay time) before the verdict point, so the verdict takes about 16 seconds at 1×, 8 seconds at 2×, and 4 seconds at 4×.

**A trap to avoid.** When the page loads, the app selects the first alarm in the feed (`105bad_0007`) and starts replaying it.
If its verdict arrives, it counts in the summary at the end (it is a true alarm, and it is escalated).
Either click your first demo alarm within a few seconds, or accept that the summary will include it, and say so.

---

## 1. Opening (30 seconds)

Point at: the badge, then the footer.

Say:

> "ICU monitors raise many alarms for a dangerous fast heartbeat called ventricular tachycardia, and most are false.
> This system reads the signals around each alarm and decides if it is real.
> Everything you will see is a replay of recorded data from a public dataset.
> It is not live, and not for clinical use.
> A missed real alarm is much worse than a false alarm, so the cutoff is set to keep at least 95% of real alarms on validation data."

Point at the verdict card text: "Escalate when p ≥ τ" (τ is the cutoff).

---

## 2. Alarm 1: `8af63e_0504`, a false alarm, correctly suppressed

**Click:** the row `8af63e_0504` in the Alarm feed. Let it play.

**Point at:**

- The ECG strips around the "Monitor alarm onset" marker. The heart-rate readout goes blank for a few seconds (289 to 296 s) and then reads 70 to 103 per minute.
- The pulse-wave and blood-pressure strips. Pulse rate stays 113 to 115 per minute whenever it is detected. Blood pressure stays about 150 over 52.
- The shaded model window (the "Window" stat shows −8 to +2 seconds around the alarm).
- The quality badges: ECG good; PPG and ABP degraded. Say "degraded", not "clean".

**When the verdict appears, point at:**

- The verdict card: **False alarm — suppressed**, p(true) about 0.16, far under the cutoff of 0.51.
- "Expert label: False alarm". "Agrees with expert".

**Say:**

> "The ECG was unreliable here, but the pulse and the blood pressure carried on unchanged.
> That fits a false alarm. The system suppressed it. The expert label agrees."

(p = 0.156 in `reports/replay_sample_check.json`.)

---

## 3. Alarm 2: `8f5f43_0332`, a true alarm, caught

**Click:** the row `8f5f43_0332`.

**Point at:**

- All four strips are present, so there is no "missing channel" strip.
- Around the alarm, the heart-rate readout jumps from about 89 to 250 per minute (at 294 s), then settles at 150 to 170.
- The pulse rate disappears from 297 s.
- Blood pressure falls from about 76 over 68 to about 65 over 58.

**When the verdict appears:**

- **True VT — escalated**, p(true) about 0.86. This is the highest score of any true alarm in the demo set.
- "Expert label: True alarm". "Agrees with expert".

**Say:**

> "A fast heart rate, a pulse that disappears, and falling blood pressure is what a true alarm looks like in these numbers.
> The system escalated it, with high confidence."

(p = 0.857.)

---

## 4. Alarm 3: `108c4d_4582`, a false alarm that was escalated

**Click:** the row `108c4d_4582`.

**Point at:**

- A fast heart-rate readout (119 to 136 per minute in most seconds, with spikes higher).
- No pulse rate in any second.
- The blood-pressure readout drops out at times.

**When the verdict appears:**

- **True VT — escalated**, p(true) about 0.59. That is only 0.07 above the cutoff.
- "Expert label: False alarm". **"Disagrees with expert".**

**Say:**

> "This one fooled the system. The numbers look like a true alarm, so it was escalated, but the expert label says false.
> This is the price of the safe setting.
> On the test set the system silences about 81% of false alarms, 278 of 345, and lets the rest through.
> We chose that on purpose over a higher cutoff that silences more but misses more real alarms.
> I have not worked out why the monitor, or the model, was fooled here."

(p = 0.586.)

---

## 5. Alarm 4: `a06fbf_0500`, the missed true alarm

**Click:** the row `a06fbf_0500`.

**Point at:**

- Until about 297 s, the heart rate and pulse rate agree at about 117 to 118 per minute. Blood pressure sits near 123 to 127 over 57 to 59.
- The change starts around 298 to 300 s: heart rate 155 per minute, the pulse rate disappears, and the pressure falls to about 108 and then drops out.
- The model window ends at 302 s. So the change is only in the last few seconds of what the model sees.

**When the verdict appears:**

- **False alarm — suppressed**, p(true) **0.48**. The cutoff is 0.51.
- "Expert label: **True alarm**". **"Disagrees with expert".**
- In the summary panel, "True alarms missed" goes to 1.

**Say:**

> "This is the mistake the system is built to avoid. It is a real alarm, and the system suppressed it.
> The score was 0.476, just 0.039 below the cutoff of 0.515.
> What I can see in the data is that the first part of the window looks normal, and the change comes at the end.
> Why the model scored it this way, I do not know, because I did not build an explanation tool.
> On the test set it missed 5 of 137 real alarms. So misses happen, and I do not claim this is safe."

**Do not say:** "it was close, so it was nearly right."

---

## 6. Summary panel and close (1 minute)

**Point at:** the **This replay session** panel.

If you only replayed the four demo alarms, it shows:

- Alarms suppressed 2 (alarms 1 and 4), alarms escalated 2 (alarms 2 and 3).
- True alarms caught 1 of 2; true alarms missed 1.
- False alarms escalated 1.
- False-alarm reduction 50%. (One of two false alarms was suppressed. Four alarms is a tiny sample. Do not quote 50%.)

If the page's first alarm `105bad_0007` also finished, add one escalated alarm and one caught true alarm: caught becomes 2 of 3.

**Say:**

> "On four hand-picked alarms I show one of each outcome.
> For real performance, use the test set of 482 alarms: 132 of 137 real alarms kept, 278 of 345 false alarms silenced.
> It is a simulated replay of recorded data, with no live monitor and no clinical validation.
> It does not explain its decisions, and several things were deliberately not built: explanation, drift monitoring, Docker, and automatic testing in the cloud."

---

## 7. Optional extras (if there is time)

- **Pause / Play:** click Pause to freeze the replay. Click Play to continue. It does not jump ahead to catch up.
- **Speed:** click 2× or 4×.
- **Previous alarm / Next alarm:** the arrows next to Play.
- **Keyboard:** the Alarm feed can be moved with Up and Down, and Enter selects.
- **Inference stat:** in the transport bar, "Inference" shows the time for that verdict in milliseconds. In the measured run, the median was 40.3 ms and the 95th percentile 80.5 ms (`docs/api.md`). One reading will be different from those.
- **Spare false-escalated alarms:** `3ba184_0047` (p 0.62) and `79c471_0246` (p 0.54). Both have no ABP. Say you have not looked into them.
- **Contrast for alarm 4:** `a06fbf_0533`, the same patient's false alarm (p 0.21).

---

## 8. If something goes wrong

| Problem | What to do |
|---|---|
| "Offline" or "Reconnecting" banner | The backend stopped. Restart terminal 1. The app reconnects. If a "Try again" button shows, click it. |
| No verdict card yet | The replay has not reached the end of the model window (about 16 s at 1×). Wait, or click 4×. |
| Scores differ from this script | Check that the Model card shows version `resnet1d-C4_all_dropout-off2.0`, and that the backend was started with `VTAC_MODEL_MODE=onnx`. Mock mode shows fake hashed scores. |
| Feed shows only 8 alarms named `syn_...` | The replay sample was not found, so the backend used generated demo alarms. Do not present those as real. Check `data/sample/replay_sample.npz`. |
| The summary count looks off | See the trap in section 0 (the auto-played first alarm). |
| Someone asks about a number you do not have | "I did not measure that." |
