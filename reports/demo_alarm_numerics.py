"""Dashboard readouts (HR, pulse rate, ABP) for the four demo alarms, second by second.

Run from the repo root (laptop only):

    PYTHONPATH=.:src uv run python reports/demo_alarm_numerics.py

Calls ``vtac.display.compute_numerics`` on the replay sample at each whole second of the dashboard
view (window start - 6 s to window end + 2 s), exactly as the WebSocket replay does, and writes
``reports/demo_alarm_numerics.json``. These are display heuristics, not model inputs and not
clinical measurements.
"""

from __future__ import annotations

import json
from pathlib import Path

from backend.app.settings import Settings
from backend.app.store import AlarmStore

from vtac.display import compute_numerics

DEMO_ALARMS = ("8af63e_0504", "8f5f43_0332", "108c4d_4582", "a06fbf_0500")
OUT = Path("reports/demo_alarm_numerics.json")


def main() -> None:
    store = AlarmStore.load(Settings())
    if store.synthetic:
        raise SystemExit("data/sample/replay_sample.npz not found")
    cfg = store.cfg
    window_end_s = cfg.window_end_index / cfg.fs
    first = int(window_end_s - cfg.window_s - 6)
    last = int(window_end_s + 2)
    out: dict[str, object] = {
        "window_end_s": window_end_s,
        "alarm_onset_s": cfg.alarm_onset_s,
        "numerics_window_s": cfg.numerics_window_s,
        "alarms": {},
    }
    for alarm_id in DEMO_ALARMS:
        a = store.get(alarm_id)
        if a is None:
            raise SystemExit(f"{alarm_id} not in the replay sample")
        raw = a.raw()
        rows = {
            str(t): compute_numerics(raw, cfg, t * cfg.fs).to_dict() for t in range(first, last + 1)
        }
        out["alarms"][alarm_id] = {
            "ground_truth": "true" if a.ground_truth else "false",
            "sources": a.sources,
            "numerics_by_second": rows,
        }
    OUT.write_text(json.dumps(out, indent=1))
    print("saved", OUT)


if __name__ == "__main__":
    main()
