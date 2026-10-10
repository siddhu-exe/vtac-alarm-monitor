import { describe, expect, it } from 'vitest';
import type { BootstrapState } from '@/store/types';
import type { ConnectionState } from '@/stream/ReplayClient';
import { streamStatus } from './streamStatus';

const READY: BootstrapState = { status: 'ready' };
const status = (c: ConnectionState, playing = true, speed = 1, b: BootstrapState = READY) =>
  streamStatus(b, c, playing, speed);

describe('streamStatus', () => {
  it('shows streaming with the speed, or paused', () => {
    expect(status({ kind: 'open' }, true, 4)).toEqual({ label: 'STREAMING 4×', tone: 'live' });
    expect(status({ kind: 'open' }, false)).toEqual({ label: 'PAUSED', tone: 'paused' });
  });

  it('says what is wrong when the connection is not healthy', () => {
    expect(status({ kind: 'reconnecting', attempt: 2, retryInMs: 800 }).label).toBe('RECONNECTING');
    expect(status({ kind: 'connecting' }).tone).toBe('busy');
    expect(status({ kind: 'failed', code: 'unreachable', message: 'x', retryable: true })).toEqual({
      label: 'STREAM FAILED',
      tone: 'problem',
    });
    expect(status({ kind: 'ended' }).label).toBe('REPLAY ENDED');
  });

  it('a failed bootstrap wins over the (idle) stream state', () => {
    const err: BootstrapState = { status: 'error', kind: 'network', message: 'down' };
    expect(status({ kind: 'idle' }, true, 1, err)).toEqual({
      label: 'BACKEND OFFLINE',
      tone: 'problem',
    });
    expect(status({ kind: 'idle' }, true, 1, { status: 'loading' }).label).toBe('CONNECTING');
  });
});
