import { describe, expect, it } from 'vitest';
import { MODEL } from '@/test/helpers';
import { computeView, viewPercent } from './view';

describe('computeView', () => {
  it('derives the axis and the model window from the backend config', () => {
    const v = computeView(MODEL);
    expect(v).toEqual({ startS: 286, endS: 304, onsetS: 300, windowStartS: 292, windowEndS: 302 });
  });
  it('follows a different offset (benchmark window: offset 0)', () => {
    const v = computeView({ ...MODEL, window_end_offset_s: 0 });
    expect(v).toMatchObject({ windowStartS: 290, windowEndS: 300, startS: 284, endS: 302 });
  });
  it('places times as percentages along the view', () => {
    const v = computeView(MODEL);
    expect(viewPercent(v, 286)).toBe(0);
    expect(viewPercent(v, 304)).toBe(100);
    expect(viewPercent(v, 300)).toBeCloseTo(77.78, 2); // the onset line, as in the design
  });
});
