import type { z } from 'zod';
import {
  AlarmDetailSchema,
  AlarmListSchema,
  HealthSchema,
  ModelInfoSchema,
  type Alarm,
  type AlarmDetail,
  type Health,
  type ModelInfo,
} from './schemas';

/** `network`: backend unreachable. `http`: non-2xx. `schema`: response did not match the contract. */
export type ApiErrorKind = 'network' | 'http' | 'schema';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClient {
  health(signal?: AbortSignal): Promise<Health>;
  model(signal?: AbortSignal): Promise<ModelInfo>;
  alarms(signal?: AbortSignal): Promise<Alarm[]>;
  alarm(id: string, signal?: AbortSignal): Promise<AlarmDetail>;
}

export function createApiClient(baseUrl: string, fetchFn: typeof fetch = fetch): ApiClient {
  async function get<S extends z.ZodType>(
    path: string,
    schema: S,
    signal?: AbortSignal,
  ): Promise<z.infer<S>> {
    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}${path}`, {
        signal: signal ?? null,
        headers: { accept: 'application/json' },
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      throw new ApiError('network', 'Cannot reach the backend');
    }
    if (!res.ok)
      throw new ApiError('http', `Backend answered ${res.status} for ${path}`, res.status);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new ApiError('schema', `${path}: response is not JSON`, res.status);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(
        'schema',
        `${path}: ${issue?.path.join('.') ?? ''} ${issue?.message ?? 'does not match the contract'}`,
        res.status,
      );
    }
    return parsed.data;
  }

  return {
    health: (signal) => get('/health', HealthSchema, signal),
    model: (signal) => get('/model', ModelInfoSchema, signal),
    alarms: (signal) => get('/alarms', AlarmListSchema, signal),
    alarm: (id, signal) => get(`/alarms/${encodeURIComponent(id)}`, AlarmDetailSchema, signal),
  };
}
