import { describe, expect, it, vi } from 'vitest';
import { createFrameScheduler } from './frameScheduler';

function fakeRaf() {
  let next = 1;
  const queue = new Map<number, FrameRequestCallback>();
  return {
    raf: (cb: FrameRequestCallback) => {
      queue.set(next, cb);
      return next++;
    },
    caf: (id: number) => {
      queue.delete(id);
    },
    flush: () => {
      const cbs = [...queue.values()];
      queue.clear();
      cbs.forEach((cb) => {
        cb(0);
      });
    },
    pending: () => queue.size,
  };
}

describe('frame scheduler', () => {
  it('coalesces many requests into one frame that runs every drawer', () => {
    const f = fakeRaf();
    const s = createFrameScheduler(f.raf, f.caf);
    const a = vi.fn();
    const b = vi.fn();
    s.add(a);
    s.add(b);
    for (let i = 0; i < 100; i++) s.request();
    expect(f.pending()).toBe(1);
    f.flush();
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 1]);
  });

  it('is idle until asked again', () => {
    const f = fakeRaf();
    const s = createFrameScheduler(f.raf, f.caf);
    const draw = vi.fn();
    s.add(draw);
    s.request();
    f.flush();
    expect(f.pending()).toBe(0);
    s.request();
    f.flush();
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('unregistered drawers are not called; dispose cancels the pending frame', () => {
    const f = fakeRaf();
    const s = createFrameScheduler(f.raf, f.caf);
    const draw = vi.fn();
    const off = s.add(draw);
    off();
    s.request();
    f.flush();
    expect(draw).not.toHaveBeenCalled();
    s.request();
    s.dispose();
    expect(f.pending()).toBe(0);
  });
});
