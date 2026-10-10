import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('defaults to the dev proxy', () => {
    expect(parseEnv({})).toEqual({ ok: true, env: { apiUrl: '/api', wsUrl: '' } });
  });
  it('accepts absolute URLs and strips trailing slashes', () => {
    expect(parseEnv({ VITE_API_URL: 'http://h:8000/', VITE_WS_URL: 'ws://h:8000/' })).toEqual({
      ok: true,
      env: { apiUrl: 'http://h:8000', wsUrl: 'ws://h:8000' },
    });
  });
  it('treats an empty API url as unset', () => {
    expect(parseEnv({ VITE_API_URL: '' })).toMatchObject({ ok: true, env: { apiUrl: '/api' } });
  });
  it('rejects malformed values with readable errors', () => {
    const r = parseEnv({ VITE_API_URL: 'localhost:8000', VITE_WS_URL: 'http://h/ws' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(/VITE_API_URL[\s\S]*VITE_WS_URL/);
  });
});
