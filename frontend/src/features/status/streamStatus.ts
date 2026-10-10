import type { BootstrapState } from '@/store/types';
import type { ConnectionState } from '@/stream/ReplayClient';

export type StatusTone = 'live' | 'paused' | 'busy' | 'problem';

export interface StreamStatus {
  label: string;
  tone: StatusTone;
}

/** The one-line stream state for the header badge. Text always carries the meaning. */
export function streamStatus(
  bootstrap: BootstrapState,
  connection: ConnectionState,
  playing: boolean,
  speed: number,
): StreamStatus {
  if (bootstrap.status === 'error') return { label: 'BACKEND OFFLINE', tone: 'problem' };
  if (bootstrap.status === 'loading') return { label: 'CONNECTING', tone: 'busy' };
  switch (connection.kind) {
    case 'idle':
      return { label: 'IDLE', tone: 'paused' };
    case 'connecting':
      return { label: 'CONNECTING', tone: 'busy' };
    case 'open':
      return playing
        ? { label: `STREAMING ${speed}×`, tone: 'live' }
        : { label: 'PAUSED', tone: 'paused' };
    case 'reconnecting':
      return { label: 'RECONNECTING', tone: 'busy' };
    case 'ended':
      return { label: 'REPLAY ENDED', tone: 'paused' };
    case 'failed':
      return { label: 'STREAM FAILED', tone: 'problem' };
  }
}
