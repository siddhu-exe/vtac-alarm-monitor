import type { ChunkMsg, ServerMsg, SessionMsg, VerdictMsg } from '@/stream/schemas';

export const session = (over: Partial<SessionMsg> = {}): SessionMsg => ({
  type: 'session',
  alarm_id: 'a1',
  patient_id: 'p1',
  fs: { ECG_1: 250, ECG_2: 250, PPG: 250 },
  channels: ['ECG_1', 'ECG_2', 'PPG'],
  alarm_onset_s: 300,
  window_end_s: 302,
  duration_s: 360,
  start_s: 286,
  end_s: 304,
  speed: 1,
  model_mode: 'mock',
  synthetic: true,
  sim: true,
  label: 'simulated real-time (replayed recordings)',
  ...over,
});

export const chunk = (over: Partial<ChunkMsg> = {}): ChunkMsg => ({
  type: 'chunk',
  t0: 286,
  channels: { ECG_1: [0.1, null, 0.3], PPG: [1, 2, 3] },
  quality: { ECG_1: 'good', PPG: 'degraded' },
  ...over,
});

export const verdict = (over: Partial<VerdictMsg> = {}): VerdictMsg => ({
  type: 'verdict',
  alarm_id: 'a1',
  t: 302,
  p_true: 0.07,
  verdict: 'FALSE_ALARM',
  action: 'suppressed',
  threshold: 0.31,
  latency_ms: 11.2,
  quality: { ECG_1: 'good', ECG_2: 'good', PPG: 'good', ABP: 'absent' },
  mask: [1, 1, 1, 0],
  ground_truth: 'false',
  model_mode: 'mock',
  model_version: 'mock-0',
  ...over,
});

export const end = (alarmId = 'a1'): ServerMsg => ({ type: 'end', alarm_id: alarmId });
