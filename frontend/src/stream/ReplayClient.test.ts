import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSocket } from '@/test/fakeSocket';
import { chunk, end, session } from '@/test/fixtures';
import {
  ReplayClient,
  type ConnectionState,
  type InvalidInfo,
  type ReplayClientOptions,
} from './ReplayClient';
import type { ServerMsg } from './schemas';

const REQ = { alarmId: 'a1', startS: 286, endS: 304 };
const STALE_MS = 3000;

function setup(over: Partial<ReplayClientOptions> = {}) {
  const states: ConnectionState[] = [];
  const messages: ServerMsg[] = [];
  const invalid: InvalidInfo[] = [];
  const client = new ReplayClient(
    {
      buildUrl: (req, speed) => `ws://test/ws/replay/${req.alarmId}?speed=${speed}`,
      createSocket: (url) => new FakeSocket(url),
      random: () => 0, // delays are the floor of the jitter band: 250, 500, 1000, ...
      staleAfterMs: () => STALE_MS,
      ...over,
    },
    {
      onState: (s) => states.push(s),
      onMessage: (m) => messages.push(m),
      onInvalid: (i) => invalid.push(i),
    },
  );
  const kinds = () => states.map((s) => s.kind);
  return { client, states, messages, invalid, kinds };
}

beforeEach(() => {
  FakeSocket.reset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('connecting and receiving', () => {
  it('moves connecting -> open and forwards validated messages', () => {
    const { client, kinds, messages } = setup();
    client.connect(REQ, { playing: true, speed: 2 });
    expect(FakeSocket.last.url).toBe('ws://test/ws/replay/a1?speed=2');
    FakeSocket.last.open();
    FakeSocket.last.push(session());
    FakeSocket.last.push(chunk());
    expect(kinds()).toEqual(['connecting', 'open']);
    expect(messages.map((m) => m.type)).toEqual(['session', 'chunk']);
  });

  it('reports invalid frames and keeps streaming', () => {
    const { client, messages, invalid } = setup();
    client.connect(REQ, { playing: true, speed: 1 });
    FakeSocket.last.open();
    FakeSocket.last.push('{broken');
    FakeSocket.last.push({ type: 'verdict', alarm_id: 'a1' });
    FakeSocket.last.push({ type: 'telemetry' });
    FakeSocket.last.push(chunk());
    expect(invalid.map((i) => i.reason)).toEqual(['malformed', 'schema', 'unknown_type']);
    expect(messages.map((m) => m.type)).toEqual(['chunk']);
  });

  it('ends cleanly: `end` then a normal close does not reconnect', () => {
    const { client, kinds } = setup();
    client.connect(REQ, { playing: true, speed: 1 });
    FakeSocket.last.open();
    FakeSocket.last.push(session());
    FakeSocket.last.push(end());
    FakeSocket.last.drop(1000);
    vi.advanceTimersByTime(60_000);
    expect(kinds()).toEqual(['connecting', 'open', 'ended']);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});

describe('reconnect with backoff', () => {
  it('retries after a drop with growing delays and re-enters open', () => {
    const { client, states, kinds } = setup();
    client.connect(REQ, { playing: true, speed: 1 });
    FakeSocket.last.open();
    FakeSocket.last.drop();
    expect(states.at(-1)).toEqual({ kind: 'reconnecting', attempt: 1, retryInMs: 250 });

    vi.advanceTimersByTime(249);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);

    FakeSocket.last.drop(); // the retry fails before any session message
    expect(states.at(-1)).toEqual({ kind: 'reconnecting', attempt: 2, retryInMs: 500 });
    vi.advanceTimersByTime(500);
    FakeSocket.last.open();
    expect(kinds().at(-1)).toBe('open');
  });

  it('resets the attempt counter only once a session message arrives', () => {
    const { client, states } = setup();
    client.connect(REQ, { playing: true, speed: 1 });
    FakeSocket.last.open();
    FakeSocket.last.drop();
    vi.advanceTimersByTime(250);
    FakeSocket.last.open(); // socket opens but sends nothing useful
    FakeSocket.last.drop();
    expect(states.at(-1)).toMatchObject({ kind: 'reconnecting', attempt: 2 });

    vi.advanceTimersByTime(500);
    FakeSocket.last.open();
    FakeSocket.last.push(session());
    FakeSocket.last.drop();
    expect(states.at(-1)).toMatchObject({ kind: 'reconnecting', attempt: 1, retryInMs: 250 });
  });

  it('gives up after maxAttempts with a retryable failure, and retry() starts over', () => {
    const { client, states } = setup({ maxAttempts: 2 });
    client.connect(REQ, { playing: true, speed: 1 });
    FakeSocket.last.drop();
    vi.advanceTimersByTime(250);
    FakeSocket.last.drop();
    vi.advanceTimersByTime(500);
    FakeSocket.last.drop();
    expect(states.at(-1)).toMatchObject({ kind: 'failed', code: 'unreachable', retryable: true });
    const n = FakeSocket.instances.length;
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(n); // no more automatic attempts

    client.retry();
    expect(FakeSocket.instances).toHaveLength(n + 1);
    expect(states.at(-1)).toEqual({ kind: 'connecting' });
  });

  it('re-applies the latest speed and a paused transport after reconnecting', () => {
    const { client } = setup();
    client.connect(REQ, { playing: true, speed: 1 });
    FakeSocket.last.open();
    client.setSpeed(4);
    client.setPlaying(false);
    FakeSocket.last.drop();
    vi.advanceTimersByTime(250);
    expect(FakeSocket.last.url).toContain('speed=4');
    FakeSocket.last.open();
    FakeSocket.last.push(session({ speed: 4 }));
    expect(FakeSocket.last.sent).toEqual([{ type: 'control', action: 'pause' }]);
  });
});

describe('terminal failures (no retry)', () => {
  it.each([4404, 4400, 4503])('close code %i is not retried', (code) => {
    const { client, states } = setup();
    client.connect(REQ, { playing: true, speed: 1 });
    FakeSocket.last.open();
    FakeSocket.last.drop(code);
    vi.advanceTimersByTime(60_000);
    expect(states.at(-1)).toMatchObject({ kind: 'failed', retryable: false, code: String(code) });
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('uses the server error message when one precedes the close', () => {
    const { client, states } = setup();
    client.connect(REQ, { playing: true, speed: 1 });
    FakeSocket.last.open();
    FakeSocket.last.push({ type: 'error', code: 'not_found', message: 'unknown alarm a1' });
    FakeSocket.last.drop(4404);
    expect(states.at(-1)).toEqual({
      kind: 'failed',
      code: 'not_found',
      message: 'unknown alarm a1',
      retryable: false,
    });
  });

  it('a bad_control error is informational and does not poison the stream', () => {
    const { client, kinds, messages } = setup();
    client.connect(REQ, { playing: true, speed: 1 });
    FakeSocket.last.open();
    FakeSocket.last.push({ type: 'error', code: 'bad_control', message: 'speed must be <= 20' });
    FakeSocket.last.drop(); // a later network drop is still a normal reconnect
    expect(messages.map((m) => m.type)).toEqual(['error']);
    expect(kinds().at(-1)).toBe('reconnecting');
  });
});

describe('heartbeat watchdog', () => {
  it('treats silence while playing as a dead stream and reconnects', () => {
    const { client, kinds } = setup();
    client.connect(REQ, { playing: true, speed: 1 });
    const first = FakeSocket.last;
    first.open();
    vi.advanceTimersByTime(STALE_MS - 1);
    expect(kinds().at(-1)).toBe('open');
    vi.advanceTimersByTime(1);
    expect(kinds().at(-1)).toBe('reconnecting');
    expect(first.closedByClient).toBe(true);
    first.drop(); // the dying socket's late close must not double-schedule
    vi.advanceTimersByTime(250);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('every message pushes the deadline back', () => {
    const { client, kinds } = setup();
    client.connect(REQ, { playing: true, speed: 1 });
    FakeSocket.last.open();
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(STALE_MS - 100);
      FakeSocket.last.push(chunk());
    }
    expect(kinds().at(-1)).toBe('open');
  });

  it('is suspended while paused and re-armed on resume', () => {
    const { client, kinds } = setup();
    client.connect(REQ, { playing: true, speed: 1 });
    FakeSocket.last.open();
    client.setPlaying(false);
    vi.advanceTimersByTime(10 * STALE_MS);
    expect(kinds().at(-1)).toBe('open');
    client.setPlaying(true);
    vi.advanceTimersByTime(STALE_MS);
    expect(kinds().at(-1)).toBe('reconnecting');
  });

  it('scales the deadline with the replay speed through staleAfterMs', () => {
    const { client, kinds } = setup({ staleAfterMs: (speed) => 8000 / speed });
    client.connect(REQ, { playing: true, speed: 4 });
    FakeSocket.last.open();
    vi.advanceTimersByTime(1999);
    expect(kinds().at(-1)).toBe('open');
    vi.advanceTimersByTime(1);
    expect(kinds().at(-1)).toBe('reconnecting');
  });
});

describe('control messages', () => {
  it('sends validated pause / resume / speed while open', () => {
    const { client } = setup();
    client.connect(REQ, { playing: true, speed: 1 });
    FakeSocket.last.open();
    client.setPlaying(false);
    client.setPlaying(true);
    client.setSpeed(2);
    expect(FakeSocket.last.sent).toEqual([
      { type: 'control', action: 'pause' },
      { type: 'control', action: 'resume' },
      { type: 'control', action: 'speed', speed: 2 },
    ]);
  });

  it('does not send while disconnected, but remembers the choice', () => {
    const { client } = setup();
    client.connect(REQ, { playing: true, speed: 1 });
    client.setSpeed(4); // socket still connecting
    expect(FakeSocket.last.sent).toEqual([]);
    FakeSocket.last.drop();
    vi.advanceTimersByTime(250);
    expect(FakeSocket.last.url).toContain('speed=4');
  });

  it('rejects an invalid speed before it reaches the wire', () => {
    const { client } = setup();
    client.connect(REQ, { playing: true, speed: 1 });
    FakeSocket.last.open();
    expect(() => {
      client.setSpeed(0);
    }).toThrow();
    expect(FakeSocket.last.sent).toEqual([]);
  });
});

describe('disconnect and switching alarms', () => {
  it('disconnect stops reconnecting and ignores late events', () => {
    const { client, kinds, messages } = setup();
    client.connect(REQ, { playing: true, speed: 1 });
    const s = FakeSocket.last;
    s.open();
    client.disconnect();
    s.push(chunk());
    s.drop();
    vi.advanceTimersByTime(60_000);
    expect(kinds().at(-1)).toBe('idle');
    expect(messages).toEqual([]);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('connecting to another alarm drops the first socket and its pending retry', () => {
    const { client } = setup();
    client.connect(REQ, { playing: true, speed: 1 });
    FakeSocket.last.drop(); // retry pending for a1
    client.connect({ ...REQ, alarmId: 'a2' }, { playing: true, speed: 1 });
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances.map((s) => s.url.includes('a2'))).toEqual([false, true]);
  });
});
