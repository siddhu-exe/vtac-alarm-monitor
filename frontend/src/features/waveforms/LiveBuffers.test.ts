import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeView } from '@/config/view';
import { chunk, session } from '@/test/fixtures';
import { MODEL } from '@/test/helpers';
import { LiveBuffers } from './LiveBuffers';

const view = computeView(MODEL); // 286 .. 304 s, 18 s
const SESSION = session({ channels: ['ECG_1', 'PPG'], fs: { ECG_1: 250, PPG: 250 } });

const read = (live: LiveBuffers, slot: string) => {
  const ch = live.channel(slot);
  if (!ch) throw new Error(`no channel ${slot}`);
  const out = new Array<number | null>(ch.ring.capacity).fill(-1);
  ch.ring.copyTo(out);
  return out;
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('LiveBuffers', () => {
  it('allocates one ring per recorded channel sized to the view (18 s x 250 Hz)', () => {
    const live = new LiveBuffers();
    live.reset(SESSION, view);
    expect(live.recordedSlots).toEqual(['ECG_1', 'PPG']);
    expect(live.channel('ECG_1')?.ring.capacity).toBe(4500);
    expect(live.channel('ABP')).toBeUndefined();
  });

  it('writes a chunk at the right index for its t0', () => {
    const live = new LiveBuffers();
    live.reset(SESSION, view);
    live.chunk(chunk({ t0: 286, channels: { ECG_1: [1, 2, 3], PPG: [4, 5, 6] } }));
    live.chunk(chunk({ t0: 286 + 3 / 250, channels: { ECG_1: [7, null], PPG: [8, 9] } }));
    expect(read(live, 'ECG_1').slice(0, 6)).toEqual([1, 2, 3, 7, null, null]);
    expect(read(live, 'PPG').slice(0, 6)).toEqual([4, 5, 6, 8, 9, null]);
  });

  it('leaves a gap when chunks were dropped and ignores duplicates', () => {
    const live = new LiveBuffers();
    live.reset(SESSION, view);
    live.chunk(chunk({ t0: 286, channels: { ECG_1: [1, 2] } }));
    live.chunk(chunk({ t0: 286 + 4 / 250, channels: { ECG_1: [5, 6] } })); // samples 2,3 lost
    live.chunk(chunk({ t0: 286, channels: { ECG_1: [1, 2] } })); // replayed duplicate
    live.chunk(chunk({ t0: 286 + 1 / 250, channels: { ECG_1: [2, 99, 100] } })); // overlaps
    expect(read(live, 'ECG_1').slice(0, 8)).toEqual([1, 2, null, null, 5, 6, null, null]);
  });

  it('a new session replaces the buffers (reconnect restarts the replay)', () => {
    const live = new LiveBuffers();
    live.reset(SESSION, view);
    live.chunk(chunk({ t0: 286, channels: { ECG_1: [1, 2, 3] } }));
    const epoch = live.epoch;
    live.reset(SESSION, view);
    expect(live.epoch).toBe(epoch + 1);
    expect(live.channel('ECG_1')?.ring.length).toBe(0);
    expect(live.getNumerics()).toBeNull();
  });

  it('clear drops everything', () => {
    const live = new LiveBuffers();
    live.reset(SESSION, view);
    live.clear();
    expect(live.recordedSlots).toEqual([]);
    expect(live.view).toBeNull();
  });

  it('keeps quality and numerics snapshots referentially stable until they change', () => {
    const live = new LiveBuffers();
    live.reset(SESSION, view);
    const nums = { hr_bpm: 80, pr_bpm: null, abp_sys: null, abp_dia: null, abp_map: null };
    live.chunk(chunk({ quality: { ECG_1: 'good' }, numerics: nums }));
    const q1 = live.getQualityMap();
    const n1 = live.getNumerics();
    live.chunk(chunk({ t0: 287, quality: { ECG_1: 'good' } })); // no numerics, same quality
    expect(live.getQualityMap()).toBe(q1);
    expect(live.getNumerics()).toBe(n1);
    live.chunk(chunk({ t0: 288, quality: { ECG_1: 'bad' } }));
    expect(live.getQualityMap()).not.toBe(q1);
    expect(live.getQualityMap().ECG_1).toBe('bad');
  });

  it('tracks the replay clock in segment seconds', () => {
    const live = new LiveBuffers();
    live.reset(SESSION, view);
    expect(live.getClockS()).toBe(286);
    live.chunk(chunk({ t0: 286, channels: { ECG_1: new Array<number>(250).fill(0) } }));
    expect(live.getClockS()).toBe(287);
  });

  it('notifies data listeners on every chunk but value listeners at most every 250 ms', () => {
    const live = new LiveBuffers();
    live.reset(SESSION, view);
    const onData = vi.fn();
    const onValues = vi.fn();
    live.onData(onData);
    live.subscribeValues(onValues);
    for (let i = 0; i < 10; i++) live.chunk(chunk({ t0: 286 + i * 0.1 }));
    expect(onData).toHaveBeenCalledTimes(10);
    expect(onValues).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(onValues).toHaveBeenCalledTimes(1);
    live.clear(); // structural changes are not throttled
    expect(onValues).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe and dispose stop notifications', () => {
    const live = new LiveBuffers();
    const l = vi.fn();
    const off = live.onData(l);
    off();
    live.reset(SESSION, view);
    expect(l).not.toHaveBeenCalled();
    live.dispose();
  });
});
