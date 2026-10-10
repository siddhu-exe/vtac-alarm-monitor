import { useAppStore } from '@/store';
import { Logo } from '@/ui/icons';
import { streamStatus, type StatusTone } from './streamStatus';

const BADGE =
  'inline-flex items-center gap-2 rounded-chip border border-line-strong px-2.5 py-1.5 font-mono text-micro tracking-badge';

const DOT: Record<StatusTone, string> = {
  live: 'size-dot-lg rounded-full bg-ok animate-live',
  paused: 'size-dot-lg rounded-hair bg-fg-muted',
  busy: 'size-dot-lg rounded-full bg-warn',
  problem: 'size-dot-lg rounded-hair bg-warn',
};

export function AppHeader() {
  const modelInfo = useAppStore((s) => s.modelInfo);
  const bootstrap = useAppStore((s) => s.bootstrap);
  const connection = useAppStore((s) => s.connection);
  const playing = useAppStore((s) => s.playing);
  const speed = useAppStore((s) => s.speed);
  const status = streamStatus(bootstrap, connection, playing, speed);

  const mode = modelInfo?.model_mode;
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3.5">
      <div className="flex items-center gap-3.5">
        <Logo />
        <div>
          <h1 className="m-0 text-heading font-semibold tracking-title">VT Alarm Monitor</h1>
          <p className="m-0 text-caption text-fg-muted">
            ICU ventricular-tachycardia false-alarm reduction · VTaC replay
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${BADGE} text-fg`}>SIMULATED REAL-TIME · REPLAYED RECORDINGS</span>
        <span className={`${BADGE} ${mode === 'onnx' ? 'text-ok' : 'text-warn'}`}>
          MODEL: {mode ? mode.toUpperCase() : '—'}
        </span>
        <span className={BADGE} role="status">
          <span aria-hidden="true" className={`inline-block ${DOT[status.tone]}`} />
          {status.label}
        </span>
      </div>
    </header>
  );
}
