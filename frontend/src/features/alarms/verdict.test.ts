import { describe, expect, it } from 'vitest';
import type { DecisionOutcome } from '@/types/domain';
import { agrees, decide, outcomeOf, summarize } from './verdict';

describe('decide (p vs tau -> escalated / suppressed)', () => {
  it('escalates at or above the threshold and suppresses below it', () => {
    expect(decide(0.31, 0.31)).toBe('escalated'); // boundary is inclusive, as in the backend
    expect(decide(0.3099, 0.31)).toBe('suppressed');
    expect(decide(0.94, 0.22)).toBe('escalated');
    expect(decide(0.07, 0.22)).toBe('suppressed');
  });
  it('handles the extremes', () => {
    expect(decide(0, 0)).toBe('escalated');
    expect(decide(1, 1)).toBe('escalated');
    expect(decide(0, 0.5)).toBe('suppressed');
  });
});

describe('outcome and agreement with the expert label', () => {
  const cases: [DecisionOutcome, string, boolean][] = [
    [{ decision: 'escalated', groundTruth: 'true' }, 'caught', true],
    [{ decision: 'suppressed', groundTruth: 'true' }, 'missed', false],
    [{ decision: 'escalated', groundTruth: 'false' }, 'false_escalated', false],
    [{ decision: 'suppressed', groundTruth: 'false' }, 'suppressed_false', true],
  ];
  it.each(cases)('%j -> %s (agrees: %s)', (d, outcome, agree) => {
    expect(outcomeOf(d)).toBe(outcome);
    expect(agrees(d)).toBe(agree);
  });
});

describe('summarize', () => {
  const E = 'escalated';
  const S = 'suppressed';
  it('matches the design mock numbers for its 8 alarms (tau 0.22)', () => {
    // p: .07 .94 .12 .31 .88 .04 .71 .09  truth: f t f f t f t f
    const rows: DecisionOutcome[] = [
      { decision: S, groundTruth: 'false' },
      { decision: E, groundTruth: 'true' },
      { decision: S, groundTruth: 'false' },
      { decision: E, groundTruth: 'false' }, // 0.31 >= 0.22: a false alarm escalated
      { decision: E, groundTruth: 'true' },
      { decision: S, groundTruth: 'false' },
      { decision: E, groundTruth: 'true' },
      { decision: S, groundTruth: 'false' },
    ];
    expect(summarize(rows)).toEqual({
      total: 8,
      suppressed: 4,
      escalated: 4,
      caught: 3,
      trueTotal: 3,
      missed: 0,
      falseEscalated: 1,
      falseTotal: 5,
      reductionPct: 80,
    });
  });
  it('counts a missed true alarm', () => {
    const s = summarize([{ decision: S, groundTruth: 'true' }]);
    expect(s).toMatchObject({ caught: 0, missed: 1, trueTotal: 1, reductionPct: null });
  });
  it('is empty-safe: no reduction percentage until a false alarm exists', () => {
    expect(summarize([])).toMatchObject({ total: 0, reductionPct: null });
  });
  it('rounds the reduction to whole percent', () => {
    const rows: DecisionOutcome[] = [
      { decision: S, groundTruth: 'false' },
      { decision: S, groundTruth: 'false' },
      { decision: E, groundTruth: 'false' },
    ];
    expect(summarize(rows).reductionPct).toBe(67);
  });
});
