import { memo, type KeyboardEvent } from 'react';
import type { Alarm } from '@/api/schemas';
import { formatReceived } from '@/lib/format';
import type { VerdictRecord } from '@/types/domain';
import { agrees, decisionChip, labelOf, TONE } from './verdict';

interface Props {
  alarm: Alarm;
  verdict: VerdictRecord | undefined;
  selected: boolean;
  /** Roving tabindex: exactly one row is in the tab order. */
  tabbable: boolean;
  onSelect: (id: string) => void;
  onKeyNav: (e: KeyboardEvent<HTMLDivElement>) => void;
}

const MONO = 'font-mono text-caption';

function Pending() {
  return <span className="text-fg-muted">pending</span>;
}

/**
 * One feed row. Memoised: a verdict arriving for one alarm re-renders that row only, since every
 * prop is a stable reference from the store.
 */
export const AlarmRow = memo(function AlarmRow({
  alarm,
  verdict,
  selected,
  tabbable,
  onSelect,
  onKeyNav,
}: Props) {
  const action = verdict?.decision;
  const tone = action ? TONE[action] : null;
  const p = verdict?.msg.p_true;
  const match = verdict
    ? agrees({ decision: verdict.decision, groundTruth: verdict.msg.ground_truth })
    : null;

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(alarm.alarm_id);
    } else {
      onKeyNav(e);
    }
  };

  return (
    <div
      role="row"
      aria-selected={selected}
      tabIndex={tabbable ? 0 : -1}
      data-alarm-id={alarm.alarm_id}
      onClick={() => {
        onSelect(alarm.alarm_id);
      }}
      onKeyDown={handleKey}
      className={`grid min-h-row cursor-pointer grid-cols-feed items-center gap-3 border-t border-line px-4 py-2 text-body-sm hover:bg-surface-raised ${
        selected ? 'bg-row-selected shadow-row-selected' : ''
      }`}
    >
      <span role="gridcell" className={MONO}>
        {verdict ? formatReceived(verdict.receivedAtMs) : '—'}
      </span>
      <span role="gridcell" className={MONO}>
        {alarm.patient_id}
      </span>
      <span role="gridcell" className={`${MONO} text-fg-secondary`}>
        {alarm.alarm_id}
      </span>
      <span role="gridcell">
        {tone && action ? (
          <span
            className={`inline-block rounded-chip border px-2 py-1 font-mono text-micro font-semibold tracking-chip ${tone.text} ${tone.border}`}
          >
            {decisionChip(action)}
          </span>
        ) : (
          <Pending />
        )}
      </span>
      <span role="gridcell" className="flex items-center gap-2">
        {tone && p !== undefined ? (
          <>
            <span
              aria-hidden="true"
              className="relative inline-block h-bar w-bar-track overflow-hidden rounded-track bg-track"
            >
              <span
                className={`absolute inset-y-0 left-0 ${tone.fill}`}
                style={{ width: `${Math.round(p * 100)}%` }}
              />
            </span>
            <span className={MONO}>{p.toFixed(2)}</span>
          </>
        ) : (
          <span className="text-fg-muted">—</span>
        )}
      </span>
      <span role="gridcell" className={`${MONO} text-fg-secondary`}>
        {verdict ? `${verdict.msg.latency_ms.toFixed(1)} ms` : '—'}
      </span>
      <span role="gridcell" className="text-caption">
        {verdict ? (
          <>
            {labelOf(verdict.msg.ground_truth)}{' '}
            <span className={match ? 'text-fg-muted' : 'text-warn'}>
              · {match ? 'agrees' : 'disagrees'}
            </span>
          </>
        ) : (
          <span className="text-fg-muted">after replay</span>
        )}
      </span>
    </div>
  );
});
