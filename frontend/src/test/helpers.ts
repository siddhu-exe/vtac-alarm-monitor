import { vi } from 'vitest';
import type { Alarm, AlarmDetail, ModelInfo } from '@/api/schemas';
import type { ApiClient } from '@/api/client';
import type { LiveSink } from '@/stream/controller';

export const MODEL: ModelInfo = {
  model_mode: 'mock',
  model_version: 'mock-0',
  runtime: 'mock predictor (dummy scores)',
  architecture: null,
  baseline: null,
  metrics: { test_pr_auc: null, challenge_score: null },
  fs: 250,
  window_s: 10,
  window_end_offset_s: 2,
  alarm_onset_s: 300,
  segment_s: 360,
  channel_slots: ['ECG_1', 'ECG_2', 'PPG', 'ABP'],
  threshold: 0.5,
  tpr_target: 0.95,
  chunk_s: 0.256,
  numerics_every_s: 1,
  max_speed: 20,
  sim: true,
  label: 'simulated real-time (replayed recordings)',
};

export const alarm = (id: string, truth: 'true' | 'false' = 'false', patient = 'p1'): Alarm => ({
  alarm_id: id,
  patient_id: patient,
  channels: ['ECG_1', 'ECG_2', 'PPG', 'ABP'],
  duration_s: 360,
  alarm_onset_s: 300,
  ground_truth: truth,
  synthetic: true,
});

export const detail = (id: string): AlarmDetail => ({
  ...alarm(id),
  fs: 250,
  sources: { ECG_1: 'II', ECG_2: 'V', PPG: 'PLETH', ABP: null },
  quality: { ECG_1: 'good', ECG_2: 'good', PPG: 'good', ABP: 'absent' },
});

export function fakeApi(over: Partial<ApiClient> = {}): ApiClient {
  return {
    health: vi.fn<ApiClient['health']>(),
    model: vi.fn<ApiClient['model']>().mockResolvedValue(MODEL),
    alarms: vi
      .fn<ApiClient['alarms']>()
      .mockResolvedValue([alarm('a1', 'false'), alarm('a2', 'true'), alarm('a3')]),
    alarm: vi.fn<ApiClient['alarm']>((id) => Promise.resolve(detail(id))),
    ...over,
  };
}

export function fakeLive() {
  return {
    reset: vi.fn<LiveSink['reset']>(),
    chunk: vi.fn<LiveSink['chunk']>(),
    clear: vi.fn<LiveSink['clear']>(),
  };
}
