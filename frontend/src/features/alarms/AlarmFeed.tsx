import type { KeyboardEvent } from 'react';
import { useAppStore } from '@/store';
import { AlarmRow } from './AlarmRow';

const COLUMNS = [
  'RECEIVED',
  'PATIENT',
  'RECORD',
  'MODEL VERDICT',
  'P(TRUE)',
  'LATENCY',
  'EXPERT LABEL',
] as const;

interface Props {
  onSelect: (id: string) => void;
}

/** Arrow / Home / End move focus between rows; Enter (handled by the row) selects. */
function moveFocus(e: KeyboardEvent<HTMLDivElement>): void {
  const row = e.currentTarget;
  let target: Element | null = null;
  switch (e.key) {
    case 'ArrowDown':
      target = row.nextElementSibling;
      break;
    case 'ArrowUp':
      target = row.previousElementSibling;
      break;
    case 'Home':
      target = row.parentElement?.firstElementChild ?? null;
      break;
    case 'End':
      target = row.parentElement?.lastElementChild ?? null;
      break;
    default:
      return;
  }
  e.preventDefault();
  if (target instanceof HTMLElement && target.getAttribute('role') === 'row') target.focus();
}

export function AlarmFeed({ onSelect }: Props) {
  const order = useAppStore((s) => s.order);
  const byId = useAppStore((s) => s.byId);
  const verdicts = useAppStore((s) => s.verdicts);
  const selectedId = useAppStore((s) => s.selectedId);

  // One row is always reachable with Tab: the selected one, else the first.
  const tabbableId = selectedId && selectedId in byId ? selectedId : order[0];

  return (
    <section
      aria-labelledby="alarm-feed-title"
      className="overflow-hidden rounded-panel border border-line bg-surface"
    >
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2.5 pt-3.5">
        <h2 id="alarm-feed-title" className="m-0 text-title font-semibold">
          Alarm feed
        </h2>
        <span className="text-caption text-fg-muted">Select an alarm to replay it</span>
      </div>
      <div className="overflow-x-auto">
        <div
          role="grid"
          aria-labelledby="alarm-feed-title"
          aria-rowcount={order.length + 1}
          className="min-w-feed"
        >
          <div
            role="row"
            className="grid grid-cols-feed gap-3 border-t border-line px-4 py-2 font-mono text-micro tracking-head text-fg-muted"
          >
            {COLUMNS.map((c) => (
              <span key={c} role="columnheader">
                {c}
              </span>
            ))}
          </div>
          <div role="rowgroup">
            {order.map((id) => {
              const alarm = byId[id];
              return alarm ? (
                <AlarmRow
                  key={id}
                  alarm={alarm}
                  verdict={verdicts[id]}
                  selected={id === selectedId}
                  tabbable={id === tabbableId}
                  onSelect={onSelect}
                  onKeyNav={moveFocus}
                />
              ) : null;
            })}
          </div>
        </div>
        {order.length === 0 && (
          <p className="m-0 border-t border-line px-4 py-6 text-center text-body-sm text-fg-muted">
            No alarms to replay. The backend returned an empty list.
          </p>
        )}
      </div>
    </section>
  );
}
