import type { LiveBuffers } from '@/features/waveforms/LiveBuffers';
import { useLive } from '@/features/waveforms/useLive';
import { formatClock, formatWindow } from '@/lib/format';
import { useAppStore } from '@/store';
import { REPLAY_SPEEDS, type ReplaySpeed } from '@/types/domain';
import { ChevronLeft, ChevronRight, PauseIcon, PlayIcon } from '@/ui/icons';

export interface TransportActions {
  prev: () => void;
  next: () => void;
  togglePlay: () => void;
  setSpeed: (speed: ReplaySpeed) => void;
  setAutoAdvance: (on: boolean) => void;
}

interface Props {
  actions: TransportActions;
  live: LiveBuffers;
}

const SQUARE_BUTTON =
  'inline-flex h-control min-w-control-min items-center justify-center rounded-button border border-line-strong bg-surface-raised text-fg hover:bg-segment-on disabled:cursor-not-allowed disabled:opacity-50';

export function TransportBar({ actions, live }: Props) {
  const playing = useAppStore((s) => s.playing);
  const speed = useAppStore((s) => s.speed);
  const autoAdvance = useAppStore((s) => s.autoAdvance);
  const ended = useAppStore((s) => s.connection.kind === 'ended');
  const modelInfo = useAppStore((s) => s.modelInfo);
  const hasAlarms = useAppStore((s) => s.order.length > 0);
  const latencyMs = useAppStore((s) =>
    s.selectedId ? s.verdicts[s.selectedId]?.msg.latency_ms : undefined,
  );
  const clockS = useLive(live, (l) => (l.view ? l.getClockS() : null));

  const showPause = playing && !ended;
  const playLabel = showPause ? 'Pause' : ended ? 'Replay' : 'Play';
  const speeds = REPLAY_SPEEDS.filter((s) => !modelInfo || s <= modelInfo.max_speed);
  const onset = modelInfo?.alarm_onset_s ?? 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Previous alarm"
          className={SQUARE_BUTTON}
          disabled={!hasAlarms}
          onClick={actions.prev}
        >
          <ChevronLeft />
        </button>
        <button
          type="button"
          className="inline-flex h-control min-w-play-min items-center justify-center gap-2 rounded-button bg-fg text-body-sm font-semibold text-fg-on-light hover:bg-fg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasAlarms}
          onClick={actions.togglePlay}
        >
          {showPause ? <PauseIcon /> : <PlayIcon />}
          {playLabel}
        </button>
        <button
          type="button"
          aria-label="Next alarm"
          className={SQUARE_BUTTON}
          disabled={!hasAlarms}
          onClick={actions.next}
        >
          <ChevronRight />
        </button>
        <div
          role="group"
          aria-label="Replay speed"
          className="ml-1.5 inline-flex overflow-hidden rounded-button border border-line-strong"
        >
          {speeds.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === speed}
              className={`h-control-sm min-w-speed-min font-mono text-caption font-medium ${
                s === speed
                  ? 'bg-segment-on text-fg-strong'
                  : 'bg-segment-off text-fg-muted hover:text-fg'
              }`}
              onClick={() => {
                actions.setSpeed(s);
              }}
            >
              {s}×
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={autoAdvance}
          className={`inline-flex h-control-sm items-center gap-2 rounded-button border px-3 text-caption ${
            autoAdvance
              ? 'border-line-strong bg-segment-on text-fg-strong'
              : 'border-line-strong bg-segment-off text-fg-muted hover:text-fg'
          }`}
          onClick={() => {
            actions.setAutoAdvance(!autoAdvance);
          }}
        >
          Auto-advance
          <span className="font-mono text-micro">{autoAdvance ? 'ON' : 'OFF'}</span>
        </button>
      </div>
      <dl className="m-0 flex flex-wrap gap-x-4.5 gap-y-1.5 font-mono text-caption text-fg-muted">
        <Stat label="Replay clock" value={clockS === null ? '—' : formatClock(clockS - onset)} />
        <Stat
          label="Window"
          value={
            modelInfo
              ? formatWindow(
                  modelInfo.window_end_offset_s - modelInfo.window_s,
                  modelInfo.window_end_offset_s,
                )
              : '—'
          }
        />
        <Stat
          label="Inference"
          value={latencyMs === undefined ? '—' : `${latencyMs.toFixed(1)} ms`}
        />
      </dl>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt>{label}</dt>
      <dd className="m-0 text-fg">{value}</dd>
    </div>
  );
}
