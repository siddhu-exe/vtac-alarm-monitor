/** Runtime access to design tokens for code that cannot use CSS (uPlot draws on a canvas). */

export function cssVar(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

export type TraceKind = 'ecg' | 'pleth' | 'abp';

export interface PlotColors {
  trace: Record<TraceKind, string>;
  grid: string;
  axis: string;
}

export function readPlotColors(): PlotColors {
  return {
    trace: {
      ecg: cssVar('--color-trace-ecg'),
      pleth: cssVar('--color-trace-pleth'),
      abp: cssVar('--color-trace-abp'),
    },
    grid: cssVar('--color-line-subtle'),
    axis: cssVar('--color-fg-muted'),
  };
}

/** Number of CSS pixels a length token resolves to (e.g. `--layout-trace-w: 1.5px` -> 1.5). */
export function cssPx(name: string): number {
  return Number.parseFloat(cssVar(name));
}
