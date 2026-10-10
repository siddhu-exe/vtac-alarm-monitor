import { useEffect, useRef, useState, type ReactNode } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { ViewSpan } from '@/config/view';
import { cssPx, readPlotColors } from '@/design/tokens';
import { formatReadout } from '@/lib/format';
import { fitRange, type Range } from '@/lib/math';
import type { LiveBuffers } from './LiveBuffers';
import { OnsetLine, InputWindowOverlay, TailShade } from './overlays';
import { QualityBadge } from './QualityBadge';
import type { FrameScheduler } from './frameScheduler';
import { TEXT_CLASS_BY_KIND, type StripSpec } from './slots';
import { useLive } from './useLive';

interface Props {
  spec: StripSpec;
  /** The channel exists in this record. When false no chart is drawn. */
  recorded: boolean;
  live: LiveBuffers;
  scheduler: FrameScheduler;
  view: ViewSpan | null;
  /** Grad-CAM overlay; passed only when the verdict carried attribution for this slot. */
  overlay?: ReactNode;
}

export function MissingChannelNotice() {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-4 text-center font-mono text-caption text-fg-muted">
      Channel not recorded · masked in model input
    </div>
  );
}

/**
 * One waveform strip. Samples never pass through React: the uPlot instance is created once (the
 * first time the channel is recorded), fed from LiveBuffers inside the shared animation frame, and
 * resized with a ResizeObserver.
 */
export function WaveformStrip({ spec, recorded, live, scheduler, view, overlay }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Latch: once a chart exists it is kept (hidden) when a later alarm lacks this channel.
  const [armed, setArmed] = useState(recorded);
  if (recorded && !armed) setArmed(true); // latch during render (no effect round-trip)

  const quality = useLive(live, (l) => l.getQualityMap()[spec.slot]);
  const numerics = useLive(live, (l) => l.getNumerics());
  const readout = formatReadout(
    spec.kind === 'ecg' ? 'hr' : spec.kind === 'pleth' ? 'pr' : 'abp',
    numerics,
    recorded,
  );
  const showReadout = spec.kind !== 'ecg' || spec.showsHeartRate || !recorded;

  useEffect(() => {
    const host = hostRef.current;
    if (!armed || !host) return;
    const colors = readPlotColors();
    const height = cssPx('--layout-strip-h');
    let yRange: Range | null = null;
    let xRange: Range = [0, 1];
    let bound: object | null = null;
    let xs: number[] = [];
    let ys: (number | null)[] = [];
    let drawnVersion = -1;
    let drawnEpoch = -1;
    let drawnFirst = -1;

    const plot = new uPlot(
      {
        width: Math.max(1, host.clientWidth),
        height,
        legend: { show: false },
        cursor: { show: false },
        padding: [0, 0, 0, 0],
        scales: {
          x: { time: false, range: () => [xRange[0], xRange[1]] },
          y: {
            range: (_u, min, max) => {
              yRange = fitRange(yRange, min, max);
              return [yRange[0], yRange[1]];
            },
          },
        },
        axes: [{ show: false }, { show: false }],
        series: [
          {},
          {
            stroke: colors.trace[spec.kind],
            width: cssPx('--layout-trace-w'),
            points: { show: false },
            spanGaps: false,
          },
        ],
      },
      [[], []],
      host,
    );

    const draw = () => {
      const ch = live.channel(spec.slot);
      if (!ch) {
        if (drawnEpoch !== live.epoch) {
          drawnEpoch = live.epoch;
          drawnVersion = -1;
          bound = null;
          yRange = null;
          plot.setData([[], []]);
        }
        return;
      }
      if (ch.ring !== bound) {
        bound = ch.ring;
        xs = new Array<number>(ch.ring.capacity).fill(0);
        ys = new Array<number | null>(ch.ring.capacity).fill(null);
        drawnFirst = -1;
        yRange = null;
      }
      if (ch.version === drawnVersion && live.epoch === drawnEpoch) return;
      const first = ch.ring.firstIndex;
      if (first !== drawnFirst) {
        // the ring has wrapped: slide the time axis along with it
        for (let i = 0; i < xs.length; i++) xs[i] = ch.startS + (first + i) / ch.fs;
        xRange = [xs[0] ?? 0, (xs[0] ?? 0) + ch.ring.capacity / ch.fs];
        drawnFirst = first;
      }
      ch.ring.copyTo(ys);
      plot.setData([xs, ys]);
      drawnVersion = ch.version;
      drawnEpoch = live.epoch;
    };

    if (view) xRange = [view.startS, view.endS];
    const unregister = scheduler.add(draw);
    scheduler.request();
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) plot.setSize({ width: w, height });
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
      unregister();
      plot.destroy();
    };
  }, [armed, live, scheduler, spec.kind, spec.slot, view]);

  return (
    <div className="flex border-t border-line-subtle" data-testid={`strip-${spec.slot}`}>
      <div className="flex w-label flex-none flex-col gap-1 px-3 py-2.5">
        <span className={`font-mono text-body-sm font-semibold ${TEXT_CLASS_BY_KIND[spec.kind]}`}>
          {spec.label}
        </span>
        <span className="text-micro text-fg-muted">{spec.unit}</span>
        <QualityBadge quality={recorded ? quality : 'absent'} />
      </div>
      <div className="relative h-strip min-w-0 flex-auto bg-strip">
        {view && recorded && <InputWindowOverlay view={view} />}
        {recorded && overlay}
        <div
          ref={hostRef}
          className={`absolute inset-0 ${recorded ? '' : 'invisible'}`}
          aria-hidden="true"
        />
        {view && <TailShade view={view} />}
        {view && <OnsetLine view={view} />}
        {!recorded && <MissingChannelNotice />}
      </div>
      <div className="flex w-readout flex-none flex-col justify-center gap-0.5 px-3.5 py-2 text-right">
        {showReadout && (
          <>
            <span
              className={`font-mono text-display font-medium leading-none ${TEXT_CLASS_BY_KIND[spec.kind]}`}
              data-testid="readout-value"
            >
              {readout.value}
            </span>
            <span className="text-micro text-fg-muted">{readout.sub}</span>
          </>
        )}
      </div>
    </div>
  );
}
