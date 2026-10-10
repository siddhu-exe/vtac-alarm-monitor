"""Window geometry around the alarm onset. Pure index arithmetic, no signal processing."""

from __future__ import annotations

from dataclasses import dataclass

from vtac.config import VtacConfig


@dataclass(frozen=True)
class WindowSpan:
    ctx_start: int  # first sample of the filter lead-in (may equal start if no room)
    start: int  # first sample of the model window
    end: int  # exclusive end of the model window

    @property
    def length(self) -> int:
        return self.end - self.start


def window_span(cfg: VtacConfig, length: int, end_idx: int | None = None) -> WindowSpan:
    """Locate the model window inside a signal of ``length`` samples.

    ``end_idx`` is the exclusive window end. ``None`` means "alarm onset + configured offset" for
    a full segment. Raises instead of clamping: silently shifting the window would cause
    train/serve skew.
    """
    end = cfg.window_end_index if end_idx is None else end_idx
    start = end - cfg.window_samples
    if start < 0 or end > length:
        raise ValueError(
            f"window [{start}, {end}) does not fit in a signal of {length} samples "
            f"(need {cfg.window_samples} samples ending at {end})"
        )
    return WindowSpan(ctx_start=max(0, start - cfg.context_samples), start=start, end=end)
