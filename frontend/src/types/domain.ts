import type { Action, GroundTruth, VerdictMsg } from '@/stream/schemas';

export type AlarmId = string;

export const REPLAY_SPEEDS = [1, 2, 4] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

/** A verdict as the UI uses it: the server message plus what the client derived from it. */
export interface VerdictRecord {
  msg: VerdictMsg;
  /** p_true >= threshold, computed locally (see features/alarms/verdict.ts). */
  decision: Action;
  /** The server's `action` disagreed with the local mapping: a contract bug, surfaced in dev. */
  actionMismatch: boolean;
  /** Client wall-clock time the verdict arrived (feed column "RECEIVED"). */
  receivedAtMs: number;
}

/** How the model's decision compares with the expert label. */
export type Outcome = 'caught' | 'missed' | 'false_escalated' | 'suppressed_false';

export interface DecisionOutcome {
  decision: Action;
  groundTruth: GroundTruth;
}

export interface Summary {
  /** Alarms replayed so far (those that have a verdict). */
  total: number;
  suppressed: number;
  escalated: number;
  /** True alarms escalated. */
  caught: number;
  /** All true alarms among the replayed ones. */
  trueTotal: number;
  /** True alarms suppressed: the costly error. */
  missed: number;
  /** False alarms still escalated. */
  falseEscalated: number;
  falseTotal: number;
  /** Share of false alarms suppressed, 0-100; null until a false alarm has been replayed. */
  reductionPct: number | null;
}
