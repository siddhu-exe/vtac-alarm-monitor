/**
 * Zod mirror of backend/app/ws_schemas.py (contract: docs/architecture.md, docs/api.md).
 * Every inbound message goes through `parseServerMessage`; nothing downstream sees unvalidated data.
 *
 * Channel slot names are plain strings: the allowed set and order come from GET /model, never from
 * this file.
 */
import { z } from 'zod';

export const QualitySchema = z.enum(['good', 'degraded', 'bad', 'absent']);
export const ModelModeSchema = z.enum(['onnx', 'mock']);
export const VerdictLabelSchema = z.enum(['TRUE_ALARM', 'FALSE_ALARM']);
export const ActionSchema = z.enum(['escalated', 'suppressed']);
export const GroundTruthSchema = z.enum(['true', 'false']);

const slotted = <T extends z.ZodType>(value: T) => z.record(z.string(), value);
const probability = z.number().min(0).max(1);

export const SessionMsgSchema = z.object({
  type: z.literal('session'),
  alarm_id: z.string(),
  patient_id: z.string(),
  fs: slotted(z.number().positive()),
  channels: z.array(z.string()),
  alarm_onset_s: z.number(),
  window_end_s: z.number(),
  duration_s: z.number().positive(),
  start_s: z.number(),
  end_s: z.number(),
  speed: z.number().positive(),
  model_mode: ModelModeSchema,
  synthetic: z.boolean(),
  sim: z.literal(true),
  label: z.string(),
});

/** Display-only readouts; `null` = not measurable right now. */
export const NumericsSchema = z.object({
  hr_bpm: z.number().nullable(),
  pr_bpm: z.number().nullable(),
  abp_sys: z.number().nullable(),
  abp_dia: z.number().nullable(),
  abp_map: z.number().nullable(),
});

export const ChunkMsgSchema = z.object({
  type: z.literal('chunk'),
  t0: z.number().nonnegative(),
  /** null = missing sample (stored as NaN so uPlot draws a gap). */
  channels: slotted(z.array(z.number().nullable())),
  quality: slotted(QualitySchema),
  numerics: NumericsSchema.optional(),
});

/** Checkpoint 2 (Grad-CAM). Optional: the UI renders attribution only when this is present. */
export const AttributionSchema = z
  .object({
    method: z.string(),
    per_channel: slotted(z.array(probability)),
    channel_share: slotted(probability),
  })
  .refine((a) => new Set(Object.values(a.per_channel).map((v) => v.length)).size <= 1, {
    message: 'per_channel arrays must have the same number of bins',
  });

export const VerdictMsgSchema = z.object({
  type: z.literal('verdict'),
  alarm_id: z.string(),
  t: z.number(),
  p_true: probability,
  verdict: VerdictLabelSchema,
  action: ActionSchema,
  threshold: probability,
  latency_ms: z.number().nonnegative(),
  quality: slotted(QualitySchema),
  mask: z.array(z.union([z.literal(0), z.literal(1)])),
  ground_truth: GroundTruthSchema,
  model_mode: ModelModeSchema,
  model_version: z.string(),
  attribution: AttributionSchema.optional(),
});

export const StateMsgSchema = z.object({
  type: z.literal('state'),
  playing: z.boolean(),
  speed: z.number().positive(),
});

export const EndMsgSchema = z.object({ type: z.literal('end'), alarm_id: z.string() });

export const ErrorMsgSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
});

export const ServerMsgSchema = z.discriminatedUnion('type', [
  SessionMsgSchema,
  ChunkMsgSchema,
  VerdictMsgSchema,
  StateMsgSchema,
  EndMsgSchema,
  ErrorMsgSchema,
]);

/** Client -> server. */
export const ControlMsgSchema = z.discriminatedUnion('action', [
  z.object({ type: z.literal('control'), action: z.literal('pause') }),
  z.object({ type: z.literal('control'), action: z.literal('resume') }),
  z.object({ type: z.literal('control'), action: z.literal('speed'), speed: z.number().gt(0) }),
]);

export type Quality = z.infer<typeof QualitySchema>;
export type ModelMode = z.infer<typeof ModelModeSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type GroundTruth = z.infer<typeof GroundTruthSchema>;
export type SessionMsg = z.infer<typeof SessionMsgSchema>;
export type Numerics = z.infer<typeof NumericsSchema>;
export type ChunkMsg = z.infer<typeof ChunkMsgSchema>;
export type Attribution = z.infer<typeof AttributionSchema>;
export type VerdictMsg = z.infer<typeof VerdictMsgSchema>;
export type StateMsg = z.infer<typeof StateMsgSchema>;
export type EndMsg = z.infer<typeof EndMsgSchema>;
export type ErrorMsg = z.infer<typeof ErrorMsgSchema>;
export type ServerMsg = z.infer<typeof ServerMsgSchema>;
export type ControlMsg = z.infer<typeof ControlMsgSchema>;

export const KNOWN_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  'session',
  'chunk',
  'verdict',
  'state',
  'end',
  'error',
]);

export type ParseResult =
  | { ok: true; msg: ServerMsg }
  | { ok: false; reason: 'malformed' | 'schema'; detail: string }
  /** A well-formed message of a type this client does not know: ignored for forward compatibility. */
  | { ok: false; reason: 'unknown_type'; detail: string };

/** Parse one raw WebSocket text frame. Never throws. */
export function parseServerMessage(raw: unknown): ParseResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'malformed', detail: 'non-text frame' };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'malformed', detail: 'invalid JSON' };
  }
  if (typeof json !== 'object' || json === null || !('type' in json)) {
    return { ok: false, reason: 'malformed', detail: 'missing "type"' };
  }
  const type = json.type;
  if (typeof type !== 'string' || !KNOWN_MESSAGE_TYPES.has(type)) {
    return { ok: false, reason: 'unknown_type', detail: String(type) };
  }
  const parsed = ServerMsgSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue ? issue.path.join('.') || '(root)' : '(unknown)';
    return {
      ok: false,
      reason: 'schema',
      detail: `${type}: ${where}: ${issue?.message ?? 'invalid'}`,
    };
  }
  return { ok: true, msg: parsed.data };
}
