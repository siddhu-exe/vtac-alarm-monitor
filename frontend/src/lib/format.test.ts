import { describe, expect, it } from 'vitest';
import type { Numerics } from '@/stream/schemas';
import { formatClock, formatOffset, formatPercent, formatReadout, formatReceived } from './format';

const NUMS: Numerics = { hr_bpm: 183.6, pr_bpm: null, abp_sys: 62.2, abp_dia: 48.9, abp_map: 53.4 };

describe('formatters', () => {
  it('formats axis offsets with a real minus sign', () => {
    expect([-14, -2, 0, 2, 4].map(formatOffset)).toEqual(['−14', '−2', '0', '+2', '+4']);
  });
  it('formats the replay clock', () => {
    expect(formatClock(-6)).toBe('−6.0 s');
    expect(formatClock(1.54)).toBe('+1.5 s');
  });
  it('formats percentages and the received time', () => {
    expect(formatPercent(0.074)).toBe('7%');
    expect(formatReceived(new Date(2026, 9, 10, 2, 5, 9).getTime())).toBe('02:05:09');
  });
});

describe('formatReadout', () => {
  it('shows rounded values', () => {
    expect(formatReadout('hr', NUMS, true)).toEqual({ value: '184', sub: 'HR bpm' });
    expect(formatReadout('abp', NUMS, true)).toEqual({ value: '62/49', sub: 'MAP 53' });
  });
  it('shows a collapsed pulse as a dash with a plain statement, not a number', () => {
    expect(formatReadout('pr', NUMS, true)).toEqual({ value: '—', sub: 'pulse not detected' });
  });
  it('says so when the channel was not recorded or nothing has arrived', () => {
    expect(formatReadout('abp', NUMS, false).sub).toBe('not recorded');
    expect(formatReadout('hr', null, true).sub).toBe('waiting for data');
  });
  it('treats a partly missing ABP reading as not measurable', () => {
    expect(formatReadout('abp', { ...NUMS, abp_dia: null }, true).sub).toBe('not measurable');
  });
});
