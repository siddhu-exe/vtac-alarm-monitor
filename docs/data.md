# Data: VTaC

> Simulated real-time (replayed recordings). Not for clinical use.

Source: VTaC (Ventricular Tachycardia Alarms from ICU), PhysioNet v1.0, open access
(`https://physionet.org/files/vtac/1.0/`, downloaded by `notebooks/01_data_prep.ipynb`).

**How to read this file.** Every number carries its source in brackets. Sources are files in this
repo: `reports/data_survey.json` (a header survey of all 5,037 records, written by `01_data_prep`),
`models/model_config.json` (written by `03_cnn`), `reports/baseline_metrics_off2.0.json`
(`02_baseline`) and `data/sample/replay_index.json`. Where the repo holds no number the text says
**"not recorded in the repo"**: the Colab printouts were not saved with the notebooks (they have no
stored outputs), and `windows_meta.json` lives only on Google Drive.

## What is verified, and how

| Fact | Value | Source |
|---|---|---|
| Records (alarm events) surveyed | 5,037 | `reports/data_survey.json` (`fs` and `sig_len` counts each sum to 5,037) |
| Sampling rate | 250 Hz in **all** 5,037 records | `reports/data_survey.json` `fs` |
| Samples per record | 90,000 in **all** 5,037 records (= 360 s = 6 min) | `reports/data_survey.json` `sig_len` |
| Alarm onset | sample 75,000 (t = 300 s): 5 min before + 1 min after | PhysioNet VTaC page and the benchmark code (2026-10-09 check); `vtac.io.load_segment` enforces fs and length. The onset index itself is **not** confirmed from the survey; no per-record onset check is saved in the repo |
| True alarms | 1,441 of 5,037 (28.61%) | Figure supplied with the project brief. **Not re-confirmed** in a saved report |
| True rate in validation / test | 141 of 495 (28.48%); 137 of 482 (28.42%) | counts `tp+fn` and `tp+fn+fp+tn` in `models/model_config.json` `extra.val` / `extra.test`; percentages computed from them |
| Label file | `event_labels.csv` columns `record,event,decision`; `decision` is `True`/`False` text, mapped to `y = 1` for True | `vtac.io.load_labels` (raises if a column is missing) |
| Split file | `benchmark_data_split.csv` columns `split,record,event` | `vtac.io.load_split` (raises if a column is missing) |

Not recorded in the repo (they are printed by `01_data_prep` and saved to Drive only): the number of
patients, the train split size, which `split` values the official file contains, whether the
validation set was official or carved out (`val_carved` in Drive `windows_meta.json`), and the count
of events that failed preprocessing (the notebook stops if more than 0.5% fail).

## Channels (all 5,037 headers)

Source: `reports/data_survey.json`. Names come from each `.hea`, never from a hard-coded list.

| Channel | Records containing it | Unit(s) |
|---|---|---|
| II | 4,996 | mV |
| V | 4,775 | mV |
| aVR | 3,147 | mV |
| I | 1,860 | mV |
| III | 1,840 | mV |
| aVL / aVF | 169 / 163 | mV |
| V1 / V2 / V3 / V4 / V5 / V6 | 134 / 105 / 71 / 71 / 81 / 71 | mV |
| MCL | 43 | mV |
| PLETH (photoplethysmogram, "PPG") | 4,681 | NU in 3,326 records, **mV in 1,355** |
| ABP (arterial blood pressure) | 1,837 | mmHg |

Two things to know:

- PLETH has two different units across records. This is harmless here because every window is
  z-scored per channel, but the raw amplitudes are not comparable between records.
- The config priority list names `MCL1` while the data says `MCL`. `MCL` is not in the priority list,
  so it can only be picked by the fallback (first remaining non-pulsatile channel in header order).

## Slots and the missing-channel rule

The model sees four fixed slots `[ECG_1, ECG_2, PPG, ABP]` plus a 0/1 mask
(`vtac.channels`, `vtac.config`).

1. **ECG slots:** the first two available channels in the priority order
   `II, V, aVR, I, III, aVL, aVF, V1, MCL1`; if fewer than two are found, any remaining
   non-pulsatile channel fills in (header order). In the 25-alarm replay sample `ECG_1` is `II` in all
   25 and `ECG_2` is `V` in 24 and `I` in 1 (`data/sample/replay_index.json`).
2. **PPG slot:** a channel named `PLETH` or `PPG`. **ABP slot:** `ABP` or `ART`.
3. A slot is **missing** (mask 0, signal all zeros) when there is no such channel, or when the channel
   in the model window is unusable. Quality is judged on the **raw** window, before filtering:

   | Level | Rule (values from `models/model_config.json`) |
   |---|---|
   | absent | no source channel, or the window is all NaN |
   | bad | NaN fraction > 0.5, **or** flat fraction >= 0.9, **or** zero standard deviation |
   | degraded | NaN fraction > 0.05, **or** a NaN gap > 1.0 s, **or** flat fraction > 0.3 |
   | good | none of the above |

   `absent` and `bad` are masked out. `degraded` is still used (and shown in the UI as "degraded").
   "Flat fraction" = share of consecutive sample pairs with exactly zero change. After filtering, a
   window whose standard deviation is below 1e-6 is also marked bad and masked.
4. Noise level is deliberately **not** a masking criterion: noisy ECG is one of the cues that
   separates false alarms from true ones.
5. A missing channel is never imputed from another channel. Gaps inside a usable channel are filled by
   linear interpolation before filtering (`vtac.preprocess.fill_nans`).

### How often channels are missing (all 5,037 records)

Source: `reports/data_survey.json` `missing_slot_patterns` (slots that have no source channel).

| Missing slots | Records |
|---|---|
| none (all four present) | 1,761 |
| ABP only | 2,877 |
| PPG and ABP | 291 |
| PPG only | 64 |
| ECG_2 and ABP | 31 |
| ECG_2 only | 12 |
| ECG_2, PPG and ABP | 1 |

Totals derived from that table: ABP absent in 3,200 records (63.5%), PPG absent in 356, ECG_2 absent
in 44, and **no record is missing ECG_1**. 292 records have neither PPG nor ABP.

On the test split, 434 windows have at least one usable pulsatile channel and 48 are ECG-only
(`reports/baseline_metrics_off2.0.json` `by_channels`; this counts channels that survived the quality
check, so it differs from the header-based table above).

In the 25-alarm replay sample: ABP is absent in 13 alarms, ECG_2 is masked by the quality check in 1
(`bb7f6d_0965`), and PPG is rated "degraded" in all 25 model windows (`reports/replay_sample_check.json`).
That report does not store which "degraded" condition fired; earlier manual inspection of seven windows
found a high flat-sample fraction (`docs/checkpoint1-signoff.md`).

## Split

- The official split file is used exactly as provided; nothing is re-split randomly
  (`vtac.io.load_split`).
- **Patient-level.** `record` (the part of the event id before the underscore, e.g. `a06fbf` in
  `a06fbf_0500`) identifies the patient; a patient can have up to 5 events. `01_data_prep` calls
  `vtac.splits.check_patient_level` and **asserts** that no patient appears in more than one split,
  before and after carving validation. The notebook ran to completion and produced the Drive
  artifacts, so the assertions passed. The printed check output itself is not saved in the repo.
- **Validation set.** If the official file has no `val` split, validation is carved out of train,
  grouped by patient and stratified by label (`StratifiedGroupKFold`, `val_frac=0.15`, `seed=42`;
  `vtac.splits.add_validation_split`). Test is never touched. Whether the carve-out ran is not
  recorded in the repo.
- **Sizes that are recorded:**

  | Split | Alarms | True | False | Source |
  |---|---|---|---|---|
  | validation | 495 | 141 | 354 | `models/model_config.json` `extra.val` |
  | test | 482 | 137 | 345 | `models/model_config.json` `extra.test` |
  | train | not recorded in the repo | | | Drive `windows_meta.json` |

  (5,037 - 495 - 482 = 4,060 would be the train size only if no event failed preprocessing. That is
  an assumption, not a measurement.)
- Threshold tuning and model selection use validation only. The test set was evaluated once, for the
  final report. Confidence intervals are patient-level bootstrap (500 resamples, seed 42).
- The replay sample is 25 alarms from the test split: 10 true and 15 false, drawn with a fixed seed
  (`01_data_prep`), from 22 patients (`data/sample/replay_index.json`). It over-samples true alarms on
  purpose; it is a demo set, not a performance estimate.

## Preprocessing steps (the only implementation is `src/vtac/`)

`vtac.preprocess.preprocess_slots`, in order, for one alarm. Notebooks and the backend both call it.

1. **Window.** 10 s (2,500 samples) ending at onset + 2.0 s, i.e. t = 292 s to 302 s, which is
   8 s before to 2 s after the alarm onset. A further 10 s of lead-in before the window is used only
   so the filters settle, then trimmed. If the window does not fit the signal the code raises; it
   never shifts the window silently (`vtac.windows`). The +2.0 s offset is a project choice (D18); the
   official benchmark code normalises over the 10 s ending exactly at onset (offset 0.0). Offset 0.0
   was **not run** as an ablation (see `docs/decisions.md`).
2. **Map channels to slots**, then **assess quality** per slot on the raw window (rule above).
3. **Fill NaN gaps** by linear interpolation (only for usable channels).
4. **Filter**, zero-phase (`scipy.signal.sosfiltfilt`), following the benchmark's filter settings
   (the benchmark's own filter direction is unknown):

   | Slot | Filter (`models/model_config.json`) |
   |---|---|
   | ECG | 60 Hz notch (Q 30), 1 Hz high-pass, 30 Hz low-pass, 2nd order |
   | PPG | 60 Hz notch (Q 30), 0.5-5 Hz band-pass, 1st order |
   | ABP | 60 Hz notch (Q 30), 16 Hz low-pass, 2nd order |

5. **Z-score** each channel with the window's own mean and standard deviation.
6. **Mask.** Usable channels get mask 1; missing channels are zeros with mask 0.

Output: `signals (4, 2500)` float32 and `mask (4,)` float32. The ONNX model takes
`(N, 4, 2500)` and `(N, 4)` (`input_shape` in `models/model_config.json`).

The dashboard's HR, pulse-rate and ABP readouts come from `vtac.display`. They are display heuristics
computed on the trailing 8 s of raw signal, are **not** model inputs, and are not clinical
measurements.

## Licensing / privacy

VTaC is open access on PhysioNet; follow its citation and licence terms. Raw waveforms, `.npz`
files and models are never committed (`.gitignore`); the 25-alarm replay sample stays on the local
machine.
