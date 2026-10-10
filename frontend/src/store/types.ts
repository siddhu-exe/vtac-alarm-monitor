import type { Alarm, AlarmDetail, ModelInfo } from '@/api/schemas';
import type { ConnectionState } from '@/stream/ReplayClient';
import type { SessionMsg, VerdictMsg } from '@/stream/schemas';
import type { AlarmId, ReplaySpeed, Summary, VerdictRecord } from '@/types/domain';

export type BootstrapState =
  | { status: 'idle' | 'loading' | 'ready' }
  | { status: 'error'; kind: 'network' | 'http' | 'schema'; message: string };

export interface StreamSlice {
  connection: ConnectionState;
  /** The session message of the replay currently on screen (null before the first one). */
  session: SessionMsg | null;
  /** Frames dropped because they failed validation (malformed or schema). */
  invalidCount: number;
  lastInvalid: string | null;
  setConnection: (state: ConnectionState) => void;
  setSession: (session: SessionMsg | null) => void;
  noteInvalid: (detail: string) => void;
}

export interface AlarmsSlice {
  bootstrap: BootstrapState;
  modelInfo: ModelInfo | null;
  order: AlarmId[];
  byId: Record<AlarmId, Alarm>;
  details: Record<AlarmId, AlarmDetail>;
  verdicts: Record<AlarmId, VerdictRecord>;
  /** Recomputed whenever a verdict arrives. */
  summary: Summary;
  setBootstrap: (state: BootstrapState) => void;
  setBootstrapReady: (model: ModelInfo, alarms: readonly Alarm[]) => void;
  setDetail: (detail: AlarmDetail) => void;
  addVerdict: (msg: VerdictMsg, receivedAtMs: number) => void;
}

export interface SelectionSlice {
  selectedId: AlarmId | null;
  select: (id: AlarmId | null) => void;
}

export interface PlaybackSlice {
  playing: boolean;
  speed: ReplaySpeed;
  /** After a replay ends, start the next alarm that has not been replayed yet. */
  autoAdvance: boolean;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: ReplaySpeed) => void;
  setAutoAdvance: (on: boolean) => void;
}

export type AppState = StreamSlice & AlarmsSlice & SelectionSlice & PlaybackSlice;
