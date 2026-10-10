# Data: VTaC

Source: VTaC (Ventricular Tachycardia Alarms from ICU), PhysioNet, open access.

## Facts provided by the project owner (taken as given)

- 5,037 labeled VT alarm events; 1,441 true (28.61%) -> ~3.5 false per true alarm.
- ~~Each record is a 10-minute WFDB segment (5 + 5 min).~~ **Corrected 2026-10-09:** a real `.hea` shows
  90,000 samples at 250 Hz = **6 minutes** (5 min before alarm onset + 1 min after). See Findings.
- At least 2 ECG leads + 1 or more pulsatile channels (PPG/PLETH and/or ABP); channels vary by record.
- Labels in `event_labels.csv`; official split in `benchmark_data_split.csv`.
- One patient can contribute up to 5 events.

## Not yet verified — do NOT hardcode

Everything below is a hypothesis until `01_data_prep` confirms it against real files. Record the
confirmed values in the **Findings** section, then mirror them into `vtac.config`.

| Item | Evidence so far | Status |
|---|---|---|
| Column names, `event_labels.csv` | `record,event,decision`; `decision` is `True`/`False` text | seen in file head; confirm full file |
| Column names, `benchmark_data_split.csv` | `split,record,event` | seen in file head; confirm the set of `split` values (is there a `val`/`validation`?) |
| Sampling rate | 250 Hz for all channels (dataset resampled) | verified in 1 header + dataset page + benchmark code; confirm across all records |
| Samples per record | 90,000 (6 min) | verified in 1 header; confirm across all records |
| Alarm onset position | sample 75,000 (t = 300 s) | inferred from dataset page ("5 min before") and benchmark window `72500:75000`; confirm with plots |
| ECG channel names | seen: `II`, `aVR`, `V` | partial; collect the full set |
| Pulsatile channel names | seen: `PLETH`; ABP name not yet seen | partial; collect the full set |
| Units / gain / NaN encoding | PLETH unit `NU`, ECG `mV`; wfdb maps invalid ADC value to NaN | partial |
| Patient identifier | `record` (folder per patient, up to 5 events) | assumed; verify the split is patient-level |
| Validation split exists | unknown | unverified |

## Verification checklist (run in `01_data_prep`, Colab)

- [ ] Download via `wfdb.dl_database` / PhysioNet; record dataset version and download date.
- [ ] Print `event_labels.csv` and `benchmark_data_split.csv` columns, dtypes, head, row counts.
- [ ] Confirm 5,037 events and 1,441 true (28.61%); report any discrepancy.
- [ ] Join labels and split on the event/record id; assert 1:1, no missing, no duplicates.
- [ ] Read every `.hea`: collect the set of channel names, units, sampling rates (per channel),
      `sig_len`, `n_sig`. Tabulate frequency of each distinct channel set.
- [ ] Confirm all records have >= 2 ECG leads and >= 1 pulsatile channel; list exceptions.
- [ ] Find the patient id (from record name/header/metadata). **Verify the split is patient-level:**
      no patient id appears in more than one of train/val/test. If patient id is not exposed,
      document how it was inferred; if the split leaks patients, stop and raise it.
- [ ] Class balance per split (true rate in train/val/test).
- [ ] Inspect missing values: NaN, flat lines, saturation per channel; fraction per record.
- [ ] Plot ~10 random true and ~10 false alarms to sanity check onset position and signal scale.
- [ ] Confirm alarm onset sample index (expected near 5 min) and whether it is constant across records.
- [ ] Write findings below and update `vtac.config`.

## Findings

Verified from outside the full dataset on 2026-10-09 (PhysioNet VTaC v1.0 page, one `.hea`, one
`.csv` head each, and the benchmark repo `github.com/ML-Health/VTaC`). Not yet confirmed over all
5,037 records; `01_data_prep` must re-check and overwrite this section with measured values.

- **Record length / rate:** 4 signals, 250 Hz, 90,000 samples = 360 s. 5 min before + 1 min after
  alarm onset. (The original brief said 10 min; that was wrong.)
- **Example header (003c13_0115):** channels `II`, `aVR`, `V`, `PLETH`; 16-bit; units mV / NU.
- **Benchmark window (official code):** `standardize.py` computes per-event statistics on samples
  `72500:75000`, i.e. **10 s ending exactly at alarm onset** (75000 = 300 s x 250 Hz). The data
  loader that builds the tensors was not in the repo, so the exact training window of the published
  models is inferred, not confirmed. The README mentions `realtime` and `retrospective` experiment
  folders; their exact definitions are not documented in the files we could read.
- **Benchmark channel layout:** index 0,1 = ECG, 2 = PPG, 3 = ABP; a missing channel is all zeros
  (the code tests `sample.sum() != 0` for availability). Our slots match this layout.
- **Benchmark filters:** ECG 60 Hz notch (Q=30) + 1 Hz high-pass + 30 Hz low-pass (order 2);
  PPG notch + 0.5-5 Hz band-pass (order 1); ABP notch + 16 Hz low-pass (order 2). Per-event,
  per-channel z-score on the 2500-sample window. We replicate these in `vtac.filters` /
  `vtac.preprocess` (zero-phase here; the benchmark's filter direction is unknown).
- **Window decision:** default end offset +2 s past onset (D18), configurable; offset 0 equals the
  benchmark window and is run as an ablation (D19).

## Missing-channel rule

Channels vary by record, so the model sees a fixed set of slots with a mask
(see `docs/architecture.md`).

1. Fixed slot order: `[ECG_1, ECG_2, PPG, ABP]` (proposed; finalize after verification).
2. **ECG slots:** pick the first two available ECG leads by a fixed priority list defined in
   `vtac.config` (e.g., lead II first). If only one ECG lead exists, `ECG_2` is missing.
3. **PPG / ABP slots:** filled if a channel with a matching name exists, else missing.
4. A slot is **missing** (`mask=0`, signal zero-filled) when the channel is absent from the header
   or is unusable in the window: NaN fraction above `max_nan_frac` (0.5), flat line (>= 90% zero
   sample-to-sample change), or zero std after filtering. Otherwise NaNs are linearly interpolated;
   the channel is flagged `degraded` if NaN fraction > 5%, a gap > 1 s, or > 30% flat samples.
   Noise level is deliberately NOT a masking criterion (noisy ECG is a false-alarm cue).
5. Never impute a missing channel from another one. The mask is a model input, and models are
   trained with random channel dropout so they handle absences.
6. The per-channel `quality` badge in the UI derives from the same checks (`good`, `degraded`,
   `bad`, `absent`), implemented once in `vtac`.

## Split

- Use `benchmark_data_split.csv` exactly as provided. Do not re-split randomly.
- Verify it is patient-level (checklist above). One patient can have up to 5 events, so an
  event-level split would leak.
- If the official split has no validation set (decided 2026-10-09): carve it out of train **grouped
  by patient and stratified by label** (`vtac.splits.add_validation_split`, `StratifiedGroupKFold`,
  `val_frac=0.15`, `seed=42`). Record the seed and resulting counts here.
- Threshold tuning and model selection use validation only; the test set is touched once, for final
  reporting.
- The replay sample (~25 alarms) is drawn from the **test** split with a fixed seed, over-sampling
  true alarms enough to demo (about 8-10 true), and including records with a missing pulsatile channel.

## Licensing / privacy

VTaC is open access on PhysioNet; follow its citation and license terms. Do not commit raw
waveforms (`.gitignore`). The ~25-alarm replay sample stays local.
