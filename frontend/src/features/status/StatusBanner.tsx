import type { ReactNode } from 'react';
import { useAppStore } from '@/store';

interface Props {
  onRetry: () => void;
}

interface Notice {
  tone: 'busy' | 'problem';
  title: string;
  detail?: string;
  retry?: boolean;
}

/**
 * One calm line that says what is going on and what can be done about it. Rendered above the
 * dashboard, never instead of it: the last good data stays on screen.
 */
export function StatusBanner({ onRetry }: Props) {
  const bootstrap = useAppStore((s) => s.bootstrap);
  const connection = useAppStore((s) => s.connection);

  let notice: Notice | null = null;
  if (bootstrap.status === 'error') {
    notice = {
      tone: 'problem',
      title: 'Cannot load the alarm list',
      detail:
        bootstrap.kind === 'network'
          ? 'The backend is not reachable. Start it and try again.'
          : bootstrap.message,
      retry: true,
    };
  } else if (bootstrap.status === 'loading' || bootstrap.status === 'idle') {
    notice = { tone: 'busy', title: 'Connecting to the replay backend…' };
  } else if (connection.kind === 'reconnecting') {
    notice = {
      tone: 'busy',
      title: 'Connection lost. Reconnecting…',
      detail: `Attempt ${connection.attempt}. The replay of this alarm restarts when the link is back.`,
    };
  } else if (connection.kind === 'failed') {
    notice = {
      tone: 'problem',
      title: connection.retryable ? 'The replay stopped' : 'This alarm cannot be replayed',
      detail: connection.message,
      retry: connection.retryable,
    };
  }
  if (!notice) return null;

  return (
    <Banner tone={notice.tone}>
      <div className="min-w-0">
        <div className="text-body-sm font-semibold">{notice.title}</div>
        {notice.detail && <div className="text-caption text-fg-secondary">{notice.detail}</div>}
      </div>
      {notice.retry && (
        <button
          type="button"
          onClick={onRetry}
          className="h-control-sm flex-none rounded-button border border-line-strong bg-surface-raised px-4 text-body-sm font-medium hover:bg-segment-on"
        >
          Try again
        </button>
      )}
    </Banner>
  );
}

function Banner({ tone, children }: { tone: Notice['tone']; children: ReactNode }) {
  return (
    <div
      role={tone === 'problem' ? 'alert' : 'status'}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-panel border bg-surface px-4 py-2.5 ${
        tone === 'problem' ? 'border-warn' : 'border-line-strong'
      }`}
    >
      {children}
    </div>
  );
}
