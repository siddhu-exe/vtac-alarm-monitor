import type { ModelInfo } from '@/api/schemas';

/** Seconds of context drawn before the model input window starts / after it ends. */
export const VIEW_LEAD_S = 6;
export const VIEW_TAIL_S = 2;

/** Everything the waveform panel needs to place the x axis and overlays (all in segment seconds). */
export interface ViewSpan {
  startS: number;
  endS: number;
  onsetS: number;
  /** Model input window: [windowStartS, windowEndS]. */
  windowStartS: number;
  windowEndS: number;
}

type ViewConfig = Pick<ModelInfo, 'alarm_onset_s' | 'window_s' | 'window_end_offset_s'>;

/** Derived from the backend's model config, never hard-coded. */
export function computeView(cfg: ViewConfig): ViewSpan {
  const windowEndS = cfg.alarm_onset_s + cfg.window_end_offset_s;
  const windowStartS = windowEndS - cfg.window_s;
  return {
    startS: windowStartS - VIEW_LEAD_S,
    endS: windowEndS + VIEW_TAIL_S,
    onsetS: cfg.alarm_onset_s,
    windowStartS,
    windowEndS,
  };
}

/** Position of `t` along the view, 0-100 (for CSS percentages). */
export function viewPercent(view: ViewSpan, t: number): number {
  return ((t - view.startS) / (view.endS - view.startS)) * 100;
}
