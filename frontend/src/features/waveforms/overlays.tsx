import { viewPercent, type ViewSpan } from '@/config/view';
import { formatOffset } from '@/lib/format';

const pct = (v: number) => `${String(v)}%`;

/** Shaded span the model actually saw: [window start, window end]. Static: positions come from config. */
export function InputWindowOverlay({ view }: { view: ViewSpan }) {
  const left = viewPercent(view, view.windowStartS);
  const right = viewPercent(view, view.windowEndS);
  return (
    <div
      data-testid="input-window"
      aria-hidden="true"
      className="absolute inset-y-0 border-x border-dashed border-window-edge bg-window-fill"
      style={{ left: pct(left), width: pct(right - left) }}
    />
  );
}

/** Everything after the window end is outside the model input, so it is dimmed. */
export function TailShade({ view }: { view: ViewSpan }) {
  const left = viewPercent(view, view.windowEndS);
  return (
    <div
      aria-hidden="true"
      className="absolute inset-y-0 right-0 bg-canvas opacity-60"
      style={{ left: pct(left) }}
    />
  );
}

export function OnsetLine({ view }: { view: ViewSpan }) {
  return (
    <div
      data-testid="onset-line"
      aria-hidden="true"
      className="absolute inset-y-0 w-onset bg-onset"
      style={{ left: pct(viewPercent(view, view.onsetS)) }}
    />
  );
}

const HEAT_MAX_OPACITY = 0.6;

/**
 * Grad-CAM attribution over the model input window (checkpoint 2). Render it only when the
 * verdict carried attribution for this channel; `bins` are importances in [0, 1].
 */
export function GradCamOverlay({ bins, view }: { bins: readonly number[]; view: ViewSpan }) {
  const left = viewPercent(view, view.windowStartS);
  const width = viewPercent(view, view.windowEndS) - left;
  if (bins.length === 0) return null;
  const binWidth = width / bins.length;
  return (
    <div data-testid="gradcam" aria-hidden="true">
      {bins.map((v, i) => (
        <div
          // bins are positional and never reorder
          key={i}
          className="absolute inset-y-0 bg-gradcam"
          style={{
            left: pct(left + i * binWidth),
            width: pct(binWidth),
            opacity: HEAT_MAX_OPACITY * v,
          }}
        />
      ))}
    </div>
  );
}

const TICK_STEP_S = 2;

/** Tick positions every TICK_STEP_S seconds relative to the onset, within the view. */
export function axisTicks(view: ViewSpan): { left: number; label: string; isOnset: boolean }[] {
  const ticks: { left: number; label: string; isOnset: boolean }[] = [];
  const first = Math.ceil((view.startS - view.onsetS) / TICK_STEP_S) * TICK_STEP_S;
  for (let d = first; view.onsetS + d <= view.endS + 1e-9; d += TICK_STEP_S) {
    ticks.push({
      left: viewPercent(view, view.onsetS + d),
      label: formatOffset(d),
      isOnset: d === 0,
    });
  }
  return ticks;
}

export function TimeAxis({ view }: { view: ViewSpan | null }) {
  return (
    <div className="flex border-t border-line-subtle">
      <div className="w-label flex-none" />
      <div className="relative h-time-axis min-w-0 flex-auto" data-testid="time-axis">
        {view &&
          axisTicks(view).map((t) => (
            <span
              key={t.label}
              className={`absolute top-2 -translate-x-1/2 font-mono text-micro ${t.isOnset ? 'text-onset' : 'text-fg-muted'}`}
              style={{ left: pct(t.left) }}
            >
              {t.label}
            </span>
          ))}
      </div>
      <div className="w-readout flex-none px-3.5 py-2 text-right text-micro text-fg-muted">
        seconds from onset
      </div>
    </div>
  );
}
