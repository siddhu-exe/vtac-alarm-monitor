import { useAppStore } from '@/store';

interface StatProps {
  label: string;
  value: string | number;
  className?: string;
}

function Stat({ label, value, className = '' }: StatProps) {
  return (
    <div>
      <dd className={`m-0 font-mono text-stat font-medium ${className}`}>{value}</dd>
      <dt className="text-caption text-fg-muted">{label}</dt>
    </div>
  );
}

/** Running totals over the alarms replayed so far in this browser session. */
export function SessionSummary() {
  const s = useAppStore((state) => state.summary);
  const total = useAppStore((state) => state.order.length);
  return (
    <section
      aria-labelledby="session-summary-title"
      className="rounded-panel border border-line bg-surface px-4.5 py-4"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="session-summary-title" className="m-0 text-title-sm font-semibold">
          This replay session
        </h2>
        <span className="text-micro text-fg-muted">
          {s.total} of {total} replayed
        </span>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-3.5">
        <Stat label="Alarms suppressed" value={s.suppressed} className="text-suppressed" />
        <Stat label="Alarms escalated" value={s.escalated} className="text-escalated" />
        <Stat label="True alarms caught" value={`${s.caught} / ${s.trueTotal}`} />
        <Stat label="True alarms missed" value={s.missed} />
        <Stat
          label="False-alarm reduction"
          value={s.reductionPct === null ? '—' : `${s.reductionPct}%`}
        />
        <Stat label="False alarms escalated" value={s.falseEscalated} />
      </dl>
    </section>
  );
}
