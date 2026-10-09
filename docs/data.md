# Data: VTaC

Source: VTaC (Ventricular Tachycardia Alarms from ICU), PhysioNet, open access.

## Facts provided by the project owner (taken as given)

- 5,037 labeled VT alarm events; 1,441 true (28.61%) -> ~3.5 false per true alarm.
- Each record is a 10-minute WFDB segment: 5 min before alarm onset, 5 min after.
- At least 2 ECG leads + 1 or more pulsatile channels (PPG/PLETH and/or ABP); channels vary by record.
- Labels in `event_labels.csv`; official split in `benchmark_data_split.csv`.
- One patient can contribute up to 5 events.

## Not yet verified — do NOT hardcode

Everything below is a hypothesis until `01_data_prep` confirms it against real files. Record the
confirmed values in the **Findings** section, then mirror them into `vtac.config`.

| Item | Hypothesis | Status |
|---|---|---|
| Column names in `event_labels.csv` | e.g. an event/record id and a true/false label | unverified |
| Column names in `benchmark_data_split.csv` | e.g. id + train/test (maybe val) | unverified |
| ECG sampling rate | possibly 250 Hz | unverified |
| Pulsatile sampling rate | possibly 125 Hz (differs from ECG) | unverified |
| ECG channel names | e.g. `I`, `II`, `III`, `V`, `aVR`… | unverified |
| Pulsatile channel names | e.g. `PLETH`, `ABP` | unverified |
| Samples per record | 10 min x fs, possibly with small deviations | unverified |
| Alarm onset position | ~300 s into the segment | unverified |
| Units / gain / `NaN` or flat-line encoding for dropout | unknown | unverified |
| Split is patient-level | required | unverified |
| Whether a validation split exists | unknown | unverified |

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

_To be filled in after running `01_data_prep`._

## Missing-channel rule

Channels vary by record, so the model sees a fixed set of slots with a mask
(see `docs/architecture.md`).

1. Fixed slot order: `[ECG_1, ECG_2, PPG, ABP]` (proposed; finalize after verification).
2. **ECG slots:** pick the first two available ECG leads by a fixed priority list defined in
   `vtac.config` (e.g., lead II first). If only one ECG lead exists, `ECG_2` is missing.
3. **PPG / ABP slots:** filled if a channel with a matching name exists, else missing.
4. A slot is **missing** (`mask=0`, signal zero-filled) when the channel is absent from the header
   or is unusable in the window (all-NaN, constant/flat-line, or above a NaN fraction threshold in
   config). Partially-NaN channels: interpolate short gaps up to a config limit, otherwise missing.
5. Never impute a missing channel from another one. The mask is a model input, and models are
   trained with random channel dropout so they handle absences.
6. The per-channel `quality` badge in the UI derives from the same checks (`good`, `degraded`,
   `bad`, `absent`), implemented once in `vtac`.

## Split

- Use `benchmark_data_split.csv` exactly as provided. Do not re-split randomly.
- Verify it is patient-level (checklist above). One patient can have up to 5 events, so an
  event-level split would leak.
- If the official split has only train/test: carve the validation set out of train **grouped by
  patient** (e.g., `GroupKFold` / `GroupShuffleSplit`, fixed seed), stratified where possible.
  Record the seed and the resulting counts here.
- Threshold tuning and model selection use validation only; the test set is touched once, for final
  reporting.
- The replay sample (~25 alarms) is drawn from the **test** split, stratified to include true alarms
  (~roughly the real prevalence, but with enough true alarms to demo), with a fixed seed.

## Licensing / privacy

VTaC is open access on PhysioNet; follow its citation and license terms. Do not commit raw
waveforms (`.gitignore`). The ~25-alarm replay sample stays local.
