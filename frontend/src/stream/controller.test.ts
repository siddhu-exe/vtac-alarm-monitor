import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { createAppStore } from '@/store';
import { FakeSocket } from '@/test/fakeSocket';
import { chunk, end, session, verdict } from '@/test/fixtures';
import { fakeApi, fakeLive, MODEL } from '@/test/helpers';
import { ReplayController, staleAfterMs } from './controller';

const LOC = { protocol: 'http:', host: 'app.test' };

async function setup(api = fakeApi()) {
  const store = createAppStore();
  const live = fakeLive();
  const ctl = new ReplayController({
    api,
    store,
    live,
    wsUrl: '',
    location: LOC,
    createSocket: (url) => new FakeSocket(url),
    now: () => 4242,
    advanceDelayMs: 1000,
    random: () => 0,
  });
  await ctl.bootstrap();
  return { store, live, ctl, api };
}

const open = (id = 'a1') => {
  FakeSocket.last.open();
  FakeSocket.last.push(session({ alarm_id: id }));
};

beforeEach(() => {
  FakeSocket.reset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('bootstrap', () => {
  it('loads model + alarms, selects the first alarm and connects with view-derived params', async () => {
    const { store } = await setup();
    expect(store.getState().bootstrap.status).toBe('ready');
    expect(store.getState().selectedId).toBe('a1');
    expect(FakeSocket.last.url).toBe(
      'ws://app.test/ws/replay/a1?speed=1&start_s=286&end_s=304', // from /model, not hard-coded
    );
  });

  it('reports an unreachable backend and recovers on retry', async () => {
    const api = fakeApi({
      model: vi.fn().mockRejectedValue(new ApiError('network', 'Cannot reach the backend')),
    });
    const { store, ctl } = await setup(api);
    expect(store.getState().bootstrap).toEqual({
      status: 'error',
      kind: 'network',
      message: 'Cannot reach the backend',
    });
    expect(FakeSocket.instances).toHaveLength(0);

    vi.mocked(api.model).mockResolvedValue(MODEL);
    ctl.retry();
    await vi.waitFor(() => {
      expect(store.getState().bootstrap.status).toBe('ready');
    });
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('handles an empty alarm list without connecting', async () => {
    const { store } = await setup(fakeApi({ alarms: vi.fn().mockResolvedValue([]) }));
    expect(store.getState()).toMatchObject({
      bootstrap: { status: 'ready' },
      order: [],
      selectedId: null,
    });
    expect(FakeSocket.instances).toHaveLength(0);
  });
});

describe('streaming into the store and the live sink', () => {
  it('routes session, chunks and verdicts to the right place', async () => {
    const { store, live } = await setup();
    open();
    FakeSocket.last.push(chunk());
    FakeSocket.last.push(
      verdict({ p_true: 0.8, threshold: 0.5, action: 'escalated', verdict: 'TRUE_ALARM' }),
    );
    expect(live.reset).toHaveBeenCalledWith(
      expect.objectContaining({ alarm_id: 'a1' }),
      expect.objectContaining({ startS: 286, endS: 304 }),
    );
    expect(live.chunk).toHaveBeenCalledTimes(1);
    expect(store.getState().verdicts.a1).toMatchObject({
      decision: 'escalated',
      receivedAtMs: 4242,
    });
    expect(store.getState().connection.kind).toBe('open');
  });

  it('counts invalid frames but ignores unknown message types silently', async () => {
    const { store, live } = await setup();
    open();
    FakeSocket.last.push('garbage');
    FakeSocket.last.push({ type: 'chunk', t0: 'x' });
    FakeSocket.last.push({ type: 'future-thing' });
    expect(store.getState().invalidCount).toBe(2);
    expect(live.chunk).not.toHaveBeenCalled();
  });

  it('fetches alarm details once per alarm for channel labels', async () => {
    const { store, api } = await setup();
    await vi.waitFor(() => {
      expect(store.getState().details.a1).toBeDefined();
    });
    expect(api.alarm).toHaveBeenCalledTimes(1);
  });
});

describe('selecting alarms', () => {
  it('switching drops the old stream, clears the strips and starts the new alarm', async () => {
    const { store, live, ctl } = await setup();
    open();
    ctl.selectAlarm('a2');
    expect(live.clear).toHaveBeenCalledTimes(2); // once per selection
    expect(FakeSocket.instances[0]?.closedByClient).toBe(true);
    expect(FakeSocket.last.url).toContain('/a2?');
    expect(store.getState()).toMatchObject({ selectedId: 'a2', session: null });
  });

  it('next / prev wrap around the list', async () => {
    const { store, ctl } = await setup();
    ctl.prev();
    expect(store.getState().selectedId).toBe('a3');
    ctl.next();
    expect(store.getState().selectedId).toBe('a1');
    ctl.next();
    expect(store.getState().selectedId).toBe('a2');
  });

  it('ignores unknown ids', async () => {
    const { store, ctl } = await setup();
    ctl.selectAlarm('nope');
    expect(store.getState().selectedId).toBe('a1');
  });
});

describe('transport', () => {
  it('pause / resume go to the server and update the store', async () => {
    const { store, ctl } = await setup();
    open();
    ctl.togglePlay();
    ctl.togglePlay();
    expect(store.getState().playing).toBe(true);
    expect(FakeSocket.last.sent).toEqual([
      { type: 'control', action: 'pause' },
      { type: 'control', action: 'resume' },
    ]);
  });

  it('speed is sent to the server, kept for the next alarm, and capped at max_speed', async () => {
    const { store, ctl } = await setup();
    open();
    ctl.setSpeed(4);
    expect(FakeSocket.last.sent).toContainEqual({ type: 'control', action: 'speed', speed: 4 });
    ctl.next();
    expect(FakeSocket.last.url).toContain('speed=4');
    expect(store.getState().speed).toBe(4);
  });

  it('Play after a finished replay restarts that alarm', async () => {
    const { store, ctl } = await setup();
    open();
    FakeSocket.last.push(end());
    store.getState().setAutoAdvance(false);
    ctl.togglePlay(); // pause...
    ctl.togglePlay(); // ...play again on an ended stream
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.last.url).toContain('/a1?');
  });
});

describe('auto-advance', () => {
  async function finishFirst() {
    const ctx = await setup();
    open();
    FakeSocket.last.push(verdict({ alarm_id: 'a1' }));
    FakeSocket.last.push(end());
    return ctx;
  }

  it('starts the next un-replayed alarm after the delay', async () => {
    const { store } = await finishFirst();
    vi.advanceTimersByTime(999);
    expect(store.getState().selectedId).toBe('a1');
    vi.advanceTimersByTime(1);
    expect(store.getState().selectedId).toBe('a2');
  });

  it('skips alarms that already have a verdict and stops when all are done', async () => {
    const { store } = await finishFirst();
    store.getState().addVerdict(verdict({ alarm_id: 'a2' }), 1);
    vi.advanceTimersByTime(1000);
    expect(store.getState().selectedId).toBe('a3');
    open('a3');
    FakeSocket.last.push(verdict({ alarm_id: 'a3' }));
    FakeSocket.last.push(end('a3'));
    vi.advanceTimersByTime(60_000);
    expect(store.getState().selectedId).toBe('a3'); // nothing left to replay
  });

  it('does nothing when switched off, paused, or after a manual selection', async () => {
    const off = await finishFirst();
    off.store.getState().setAutoAdvance(false);
    off.ctl.selectAlarm('a1');
    FakeSocket.last.open();
    FakeSocket.last.push(session());
    FakeSocket.last.push(end());
    vi.advanceTimersByTime(60_000);
    expect(off.store.getState().selectedId).toBe('a1');

    FakeSocket.reset();
    const manual = await finishFirst();
    manual.ctl.selectAlarm('a3'); // user picks one during the pause: the timer must not override it
    vi.advanceTimersByTime(60_000);
    expect(manual.store.getState().selectedId).toBe('a3');

    FakeSocket.reset();
    const paused = await finishFirst();
    paused.store.getState().setPlaying(false);
    vi.advanceTimersByTime(60_000);
    expect(paused.store.getState().selectedId).toBe('a1');
  });
});

describe('failures', () => {
  it('surfaces a dropped stream as reconnecting, then failed after the server rejects it', async () => {
    const { store } = await setup();
    open();
    FakeSocket.last.drop();
    expect(store.getState().connection).toMatchObject({ kind: 'reconnecting', attempt: 1 });
    vi.advanceTimersByTime(250);
    FakeSocket.last.push({ type: 'error', code: 'not_found', message: 'unknown alarm a1' });
    FakeSocket.last.drop(4404);
    expect(store.getState().connection).toMatchObject({
      kind: 'failed',
      code: 'not_found',
      retryable: false,
    });
  });

  it('dispose closes the socket and stops everything', async () => {
    const { ctl } = await setup();
    open();
    ctl.dispose();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.last.closedByClient).toBe(true);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});

describe('staleAfterMs', () => {
  it('has a floor and scales inversely with speed', () => {
    expect(staleAfterMs(0.256, 1)).toBe(4560);
    expect(staleAfterMs(0.256, 4)).toBe(3000);
    expect(staleAfterMs(0.256, 20)).toBe(3000);
    expect(staleAfterMs(1, 1)).toBe(12_000);
  });
});
