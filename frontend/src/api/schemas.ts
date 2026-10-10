/** Zod mirror of the REST responses in backend/app/schemas.py (docs/api.md). */
import { z } from 'zod';
import { GroundTruthSchema, QualitySchema } from '@/stream/schemas';

export const HealthSchema = z.object({
  status: z.string(),
  model_mode: z.string(),
  model_version: z.string().nullable(),
  n_alarms: z.number().int().nonnegative(),
  synthetic_data: z.boolean(),
  sim: z.literal(true),
  label: z.string(),
});

export const AlarmSchema = z.object({
  alarm_id: z.string(),
  patient_id: z.string(),
  channels: z.array(z.string()),
  duration_s: z.number().positive(),
  alarm_onset_s: z.number(),
  ground_truth: GroundTruthSchema,
  synthetic: z.boolean(),
});

export const AlarmDetailSchema = AlarmSchema.extend({
  fs: z.number().positive(),
  /** slot -> source channel name in the record header, or null when the slot is absent. */
  sources: z.record(z.string(), z.string().nullable()),
  quality: z.record(z.string(), QualitySchema),
});

/** GET /model: tau, window, channel order and model-card fields. Never hard-coded in the UI. */
export const ModelInfoSchema = z.object({
  model_mode: z.enum(['onnx', 'mock']),
  model_version: z.string().nullable(),
  runtime: z.string(),
  architecture: z.string().nullable(),
  baseline: z.string().nullable(),
  metrics: z.object({
    test_pr_auc: z.number().nullable(),
    challenge_score: z.number().nullable(),
  }),
  fs: z.number().positive(),
  window_s: z.number().positive(),
  window_end_offset_s: z.number(),
  alarm_onset_s: z.number(),
  segment_s: z.number().positive(),
  channel_slots: z.array(z.string()).min(1),
  threshold: z.number().min(0).max(1),
  tpr_target: z.number().min(0).max(1),
  chunk_s: z.number().positive(),
  numerics_every_s: z.number().positive(),
  max_speed: z.number().positive(),
  sim: z.literal(true),
  label: z.string(),
});

export const AlarmListSchema = z.array(AlarmSchema);

export type Health = z.infer<typeof HealthSchema>;
export type Alarm = z.infer<typeof AlarmSchema>;
export type AlarmDetail = z.infer<typeof AlarmDetailSchema>;
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
