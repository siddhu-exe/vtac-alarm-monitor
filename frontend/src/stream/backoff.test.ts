import { describe, expect, it } from 'vitest';
import { backoffDelayMs } from './backoff';
import { buildReplayUrl } from './url';

describe('backoffDelayMs', () => {
  it('doubles per attempt (random = 0 gives the floor of the jitter band)', () => {
    expect([0, 1, 2, 3].map((a) => backoffDelayMs(a, () => 0))).toEqual([250, 500, 1000, 2000]);
  });
  it('adds up to the same amount again as jitter', () => {
    expect(backoffDelayMs(0, () => 0.999)).toBeCloseTo(500, -1);
    expect(backoffDelayMs(2, () => 0.5)).toBe(1500);
  });
  it('caps the delay', () => {
    expect(backoffDelayMs(50, () => 0.999)).toBeLessThanOrEqual(10_000);
    expect(backoffDelayMs(50, () => 0)).toBe(5000);
  });
});

describe('buildReplayUrl', () => {
  const req = { alarmId: 'syn 1', startS: 286, endS: 304 };
  it('uses the page origin when no ws origin is configured', () => {
    expect(buildReplayUrl('', req, 2, { protocol: 'http:', host: 'localhost:5173' })).toBe(
      'ws://localhost:5173/ws/replay/syn%201?speed=2&start_s=286&end_s=304',
    );
    expect(buildReplayUrl('', req, 1, { protocol: 'https:', host: 'x.org' })).toMatch(
      /^wss:\/\/x\.org\//,
    );
  });
  it('uses the configured origin', () => {
    expect(buildReplayUrl('ws://h:8000', req, 1, { protocol: 'http:', host: 'ignored' })).toMatch(
      /^ws:\/\/h:8000\/ws\/replay\//,
    );
  });
});
