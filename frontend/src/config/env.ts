import { z } from 'zod';

const httpOrPath = z
  .string()
  .refine(
    (v) => v.startsWith('/') || /^https?:\/\//.test(v),
    'must be a path ("/api") or http(s) URL',
  );
const wsOrigin = z
  .string()
  .refine(
    (v) => v === '' || /^wss?:\/\/[^/]+\/?$/.test(v),
    'must be empty or a ws(s):// origin without a path',
  );

const EnvSchema = z.object({
  VITE_API_URL: httpOrPath.default('/api'),
  VITE_WS_URL: wsOrigin.default(''),
});

export interface Env {
  /** REST base without a trailing slash. */
  apiUrl: string;
  /** WebSocket origin without a trailing slash; empty = same origin as the page. */
  wsUrl: string;
}

export type EnvResult = { ok: true; env: Env } | { ok: false; errors: string[] };

export function parseEnv(raw: Record<string, unknown>): EnvResult {
  const parsed = EnvSchema.safeParse({
    VITE_API_URL: raw.VITE_API_URL === '' ? undefined : raw.VITE_API_URL, // empty = unset
    VITE_WS_URL: raw.VITE_WS_URL,
  });
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }
  const { VITE_API_URL, VITE_WS_URL } = parsed.data;
  return {
    ok: true,
    env: { apiUrl: VITE_API_URL.replace(/\/+$/, ''), wsUrl: VITE_WS_URL.replace(/\/+$/, '') },
  };
}

export const envResult: EnvResult = parseEnv(import.meta.env);
