import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client';

const MODEL = {
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('api client', () => {
  it('parses GET /model (the real backend payload) and calls the base URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json(MODEL));
    const api = createApiClient('/api', fetchFn);
    const m = await api.model();
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/model');
    expect(m.threshold).toBe(0.5);
    expect(m.channel_slots).toEqual(['ECG_1', 'ECG_2', 'PPG', 'ABP']);
  });

  it('url-encodes alarm ids', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({}));
    await createApiClient('/api', fetchFn as unknown as typeof fetch)
      .alarm('a/b c')
      .catch(() => undefined);
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/alarms/a%2Fb%20c');
  });

  it('reports an unreachable backend as a network error', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      createApiClient('/api', fetchFn as unknown as typeof fetch).health(),
    ).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('reports non-2xx answers with their status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ detail: 'nope' }, 404));
    const err = await createApiClient('/api', fetchFn as unknown as typeof fetch)
      .alarm('x')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ kind: 'http', status: 404 });
  });

  it('rejects a response that breaks the contract', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ ...MODEL, threshold: 7 }));
    await expect(
      createApiClient('/api', fetchFn as unknown as typeof fetch).model(),
    ).rejects.toMatchObject({
      kind: 'schema',
    });
    const notJson = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(
      createApiClient('/api', notJson as unknown as typeof fetch).health(),
    ).rejects.toMatchObject({
      kind: 'schema',
    });
  });

  it('lets an abort through untouched', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    const fetchFn = vi.fn().mockRejectedValue(abort);
    await expect(createApiClient('/api', fetchFn as unknown as typeof fetch).alarms()).rejects.toBe(
      abort,
    );
  });
});
