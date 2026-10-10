import { useEffect, useMemo } from 'react';
import { computeView } from '@/config/view';
import { useAppStore } from '@/store';
import { GradCamOverlay, TimeAxis } from './overlays';
import { createFrameScheduler } from './frameScheduler';
import type { LiveBuffers } from './LiveBuffers';
import { buildStripSpecs } from './slots';
import { WaveformStrip } from './WaveformStrip';

function LegendItem({ children, swatch }: { children: string; swatch: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`inline-block ${swatch}`} />
      {children}
    </span>
  );
}

const PLACEHOLDER_STRIPS = 4;

/** Reserves the panel's height while the backend is unreachable or still loading (no layout jump). */
function WaveformPlaceholder({ failed }: { failed: boolean }) {
  return (
    <section
      aria-label="Waveforms"
      className="overflow-hidden rounded-panel border border-line bg-surface-sunken"
    >
      <div className="px-4 pb-3 pt-3.5">
        <h2 className="m-0 text-title font-semibold">Waveforms</h2>
        <p className="m-0 mt-1 text-caption text-fg-muted">
          {failed
            ? 'Waveforms are unavailable until the backend responds.'
            : 'Waiting for the backend…'}
        </p>
      </div>
      {Array.from({ length: PLACEHOLDER_STRIPS }, (_, i) => (
        <div key={i} className="h-strip border-t border-line-subtle bg-strip" aria-hidden="true" />
      ))}
    </section>
  );
}

export function WaveformPanel({ live }: { live: LiveBuffers }) {
  const modelInfo = useAppStore((s) => s.modelInfo);
  const selectedId = useAppStore((s) => s.selectedId);
  const alarm = useAppStore((s) => (s.selectedId ? s.byId[s.selectedId] : undefined));
  const detail = useAppStore((s) => (s.selectedId ? s.details[s.selectedId] : undefined));
  const session = useAppStore((s) => s.session);
  const attribution = useAppStore((s) =>
    s.selectedId ? s.verdicts[s.selectedId]?.msg.attribution : undefined,
  );

  // One animation-frame loop for all strips; data arrival only requests a frame.
  const scheduler = useMemo(() => createFrameScheduler(), []);
  useEffect(() => {
    const off = live.onData(scheduler.request);
    return () => {
      off();
      scheduler.dispose();
    };
  }, [live, scheduler]);

  const bootstrapFailed = useAppStore((s) => s.bootstrap.status === 'error');

  const view = useMemo(() => (modelInfo ? computeView(modelInfo) : null), [modelInfo]);
  const specs = useMemo(
    () => buildStripSpecs(modelInfo?.channel_slots ?? [], detail?.sources),
    [modelInfo, detail],
  );
  // Prefer the live session; before it arrives the alarm list already says what was recorded.
  const recordedSlots = session?.channels ?? alarm?.channels ?? [];

  if (!modelInfo) return <WaveformPlaceholder failed={bootstrapFailed} />;

  return (
    <section
      aria-label="Waveforms"
      className="overflow-hidden rounded-panel border border-line bg-surface-sunken"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2 px-4 pb-3 pt-3.5">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="m-0 text-title font-semibold">
            {alarm ? `Patient ${alarm.patient_id}` : 'No alarm selected'}
          </h2>
          {selectedId && (
            <span className="font-mono text-caption text-fg-muted">
              Record {selectedId} · monitor call: VT
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-fg-muted">
          <LegendItem swatch="h-swatch-h w-swatch-w border border-dashed border-legend-edge bg-segment-off">
            Model input window
          </LegendItem>
          <LegendItem swatch="h-3 w-onset bg-onset">Monitor alarm onset</LegendItem>
          {attribution && (
            <LegendItem swatch="h-swatch-h w-swatch-w bg-gradcam opacity-60">
              Grad-CAM attribution
            </LegendItem>
          )}
        </div>
      </div>
      {specs.map((spec) => {
        const bins = attribution?.per_channel[spec.slot];
        return (
          <WaveformStrip
            key={spec.slot}
            spec={spec}
            recorded={recordedSlots.includes(spec.slot)}
            live={live}
            scheduler={scheduler}
            view={view}
            overlay={bins && view ? <GradCamOverlay bins={bins} view={view} /> : undefined}
          />
        );
      })}
      <TimeAxis view={view} />
    </section>
  );
}
