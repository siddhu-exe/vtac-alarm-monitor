import { describe, expect, it } from 'vitest';
import { clamp, fitRange } from './math';

describe('fitRange', () => {
  it('starts from the data plus padding', () => {
    const [lo, hi] = fitRange(null, 0, 10);
    expect(lo).toBeCloseTo(-1);
    expect(hi).toBeCloseTo(11);
  });
  it('grows immediately when data leaves the range', () => {
    const prev = fitRange(null, 0, 10);
    const next = fitRange(prev, -5, 20);
    expect(next[0]).toBeLessThanOrEqual(-5);
    expect(next[1]).toBeGreaterThanOrEqual(20);
  });
  it('keeps the range for small fluctuations (no visual pumping)', () => {
    const prev = fitRange(null, 0, 10);
    expect(fitRange(prev, 1, 9)).toBe(prev);
  });
  it('shrinks only when the data fills well under half of the range', () => {
    const prev = fitRange(null, 0, 100);
    const next = fitRange(prev, 40, 50);
    expect(next[1] - next[0]).toBeLessThan((prev[1] - prev[0]) / 2);
  });
  it('copes with a flat line and with no data', () => {
    const flat = fitRange(null, 5, 5);
    expect(flat[1] - flat[0]).toBeGreaterThan(0);
    expect(fitRange(null, Number.NaN, Number.NaN)).toEqual([-1, 1]);
    const prev = fitRange(null, 0, 1);
    expect(fitRange(prev, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)).toBe(prev);
  });
});

describe('clamp', () => {
  it('limits to the range', () => {
    expect([clamp(5, 0, 3), clamp(-1, 0, 3), clamp(2, 0, 3)]).toEqual([3, 0, 2]);
  });
});
