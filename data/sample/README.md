# data/sample

Replay sample for the laptop (about 25 test-split VT alarms), exported by
`notebooks/01_data_prep.ipynb` and copied here from Google Drive.

This directory is gitignored except for this README. Do not commit waveforms.

Expected contents (see `docs/architecture.md` for the exact schema):

- `replay_sample.npz` — raw (unwindowed, unfiltered) 10-minute segments for the sample alarms, plus metadata
- `replay_index.json` — per-alarm metadata (event id, patient id, label, channel names, sampling rates)
