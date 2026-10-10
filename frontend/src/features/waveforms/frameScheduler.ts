export interface FrameScheduler {
  /** Ask for a draw on the next animation frame (coalesces repeated requests). */
  request: () => void;
  /** Register a draw callback; returns its unregister function. */
  add: (draw: () => void) => () => void;
  dispose: () => void;
}

/**
 * One requestAnimationFrame loop shared by every strip: data arrival only marks work as pending,
 * and all uPlot `setData` calls happen together inside the frame. Idle when nothing arrives.
 */
export function createFrameScheduler(
  raf: (cb: FrameRequestCallback) => number = (cb) => requestAnimationFrame(cb),
  caf: (id: number) => void = (id) => {
    cancelAnimationFrame(id);
  },
): FrameScheduler {
  const drawers = new Set<() => void>();
  let pending: number | null = null;
  return {
    request: () => {
      if (pending !== null) return;
      pending = raf(() => {
        pending = null;
        for (const draw of drawers) draw();
      });
    },
    add: (draw) => {
      drawers.add(draw);
      return () => {
        drawers.delete(draw);
      };
    },
    dispose: () => {
      if (pending !== null) caf(pending);
      pending = null;
      drawers.clear();
    },
  };
}
