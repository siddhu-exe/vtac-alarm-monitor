"""Transport state for one replay: pause / resume / speed, with drift-free pacing."""

from __future__ import annotations

import asyncio
import time


class ReplayControl:
    """Paces a replay in simulated time. ``pace`` blocks while paused and never bursts to catch up
    after a pause or a speed change (the schedule is re-based to "now")."""

    def __init__(self, speed: float) -> None:
        self.speed = speed
        self._running = asyncio.Event()
        self._running.set()
        self._due = time.monotonic()

    @property
    def playing(self) -> bool:
        return self._running.is_set()

    def pause(self) -> None:
        self._running.clear()

    def resume(self) -> None:
        self._rebase()
        self._running.set()

    def set_speed(self, speed: float) -> None:
        self.speed = speed
        self._rebase()

    def _rebase(self) -> None:
        self._due = time.monotonic()

    async def pace(self, sim_dt: float) -> None:
        """Wait until ``sim_dt`` seconds of simulated time have elapsed at the current speed."""
        await self._running.wait()
        self._due += sim_dt / self.speed
        delay = self._due - time.monotonic()
        if delay > 0:
            await asyncio.sleep(delay)
