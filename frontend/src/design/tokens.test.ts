import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/lib/contrast';

const css = readFileSync(resolve(process.cwd(), 'src/design/tokens.css'), 'utf8');
const colors = Object.fromEntries(
  [...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]),
) as Record<string, string>;
const c = (name: string): string => {
  const v = colors[name];
  if (!v) throw new Error(`missing token --color-${name}`);
  return v;
};

const TEXT = ['fg', 'fg-secondary', 'fg-muted'] as const;
const GROUNDS = ['canvas', 'surface', 'surface-sunken', 'surface-raised', 'strip', 'row-selected'];
const ACCENT_TEXT = [
  'escalated',
  'suppressed',
  'ok',
  'warn',
  'link',
  'trace-ecg',
  'trace-pleth',
  'trace-abp',
] as const;

describe('design token contrast (WCAG AA)', () => {
  it.each(TEXT.flatMap((t) => GROUNDS.map((g) => [t, g] as const)))(
    'text %s on %s >= 4.5:1',
    (t, g) => {
      expect(contrastRatio(c(t), c(g))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(ACCENT_TEXT.flatMap((t) => ['canvas', 'surface', 'strip'].map((g) => [t, g] as const)))(
    'accent %s on %s >= 4.5:1',
    (t, g) => {
      expect(contrastRatio(c(t), c(g))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('selected row keeps accent text readable', () => {
    for (const t of ['escalated', 'suppressed', 'warn', 'ok']) {
      expect(contrastRatio(c(t), c('row-selected'))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('button and chip pairings', () => {
    expect(contrastRatio(c('fg-on-light'), c('fg'))).toBeGreaterThanOrEqual(4.5); // play button
    expect(contrastRatio(c('fg-strong'), c('segment-on'))).toBeGreaterThanOrEqual(4.5); // speed on
    expect(contrastRatio(c('fg-muted'), c('segment-off'))).toBeGreaterThanOrEqual(4.5); // speed off
    expect(contrastRatio(c('fg'), c('surface-raised'))).toBeGreaterThanOrEqual(4.5); // icon button
  });

  it('non-text indicators reach 3:1 against the panels they sit on', () => {
    for (const t of ['absent', 'focus', 'onset', 'gradcam', 'ok']) {
      expect(contrastRatio(c(t), c('surface'))).toBeGreaterThanOrEqual(3);
    }
  });

  it('verdict colours are distinguishable from each other', () => {
    expect(c('escalated')).not.toBe(c('suppressed'));
  });
});
