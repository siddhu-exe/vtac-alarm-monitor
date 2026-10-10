import { describe, expect, it } from 'vitest';
import { chunk, end, session, verdict } from '@/test/fixtures';
import { ControlMsgSchema, parseServerMessage } from './schemas';

const parse = (m: unknown) => parseServerMessage(typeof m === 'string' ? m : JSON.stringify(m));

describe('parseServerMessage: valid messages', () => {
  it('accepts every server message type', () => {
    for (const m of [
      session(),
      chunk(),
      verdict(),
      { type: 'state', playing: false, speed: 2 },
      end(),
      { type: 'error', code: 'not_found', message: 'unknown alarm x' },
    ]) {
      const r = parse(m);
      expect(r.ok, JSON.stringify(m)).toBe(true);
    }
  });

  it('keeps null samples and nullable numerics', () => {
    const r = parse(
      chunk({
        numerics: { hr_bpm: null, pr_bpm: 70, abp_sys: null, abp_dia: null, abp_map: null },
      }),
    );
    expect(r.ok && r.msg.type === 'chunk' && r.msg.channels.ECG_1).toEqual([0.1, null, 0.3]);
    expect(r.ok && r.msg.type === 'chunk' && r.msg.numerics?.pr_bpm).toBe(70);
  });

  it('treats numerics and attribution as optional', () => {
    const c = parse(chunk());
    const v = parse(verdict());
    expect(c.ok && c.msg.type === 'chunk' && c.msg.numerics).toBeUndefined();
    expect(v.ok && v.msg.type === 'verdict' && v.msg.attribution).toBeUndefined();
  });

  it('accepts a well-formed attribution (checkpoint 2)', () => {
    const r = parse(
      verdict({
        attribution: {
          method: 'gradcam',
          per_channel: { ECG_1: [0.1, 0.9], PPG: [0.4, 0.6] },
          channel_share: { ECG_1: 0.7, PPG: 0.3 },
        },
      }),
    );
    expect(r.ok && r.msg.type === 'verdict' && r.msg.attribution?.method).toBe('gradcam');
  });
});

describe('parseServerMessage: invalid messages', () => {
  it.each([
    ['p_true above 1', verdict({ p_true: 1.5 })],
    ['negative latency', verdict({ latency_ms: -1 })],
    ['unknown quality level', chunk({ quality: { ECG_1: 'excellent' as never } })],
    ['unknown verdict label', verdict({ verdict: 'MAYBE' as never })],
    ['sim flag false', session({ sim: false as never })],
    ['non-numeric sample', chunk({ channels: { ECG_1: ['x' as never] } })],
    ['mask entry other than 0/1', verdict({ mask: [1, 2] as never })],
    [
      'ragged attribution bins',
      verdict({
        attribution: {
          method: 'g',
          per_channel: { a: [0.1], b: [0.1, 0.2] },
          channel_share: {},
        },
      }),
    ],
    [
      'attribution value out of range',
      verdict({ attribution: { method: 'g', per_channel: { a: [1.5] }, channel_share: {} } }),
    ],
  ])('rejects %s', (_name, msg) => {
    const r = parse(msg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('schema');
  });

  it('rejects a message missing a required field and names it', () => {
    const broken: Record<string, unknown> = { ...verdict() };
    delete broken.alarm_id;
    const r = parse(broken);
    expect(r).toMatchObject({ ok: false, reason: 'schema' });
    if (!r.ok) expect(r.detail).toContain('alarm_id');
  });

  it('flags malformed frames without throwing', () => {
    expect(parse('not json')).toMatchObject({ ok: false, reason: 'malformed' });
    expect(parse('[1,2]')).toMatchObject({ ok: false, reason: 'malformed' });
    expect(parse('{"no":"type"}')).toMatchObject({ ok: false, reason: 'malformed' });
    expect(parseServerMessage(new ArrayBuffer(4))).toMatchObject({
      ok: false,
      reason: 'malformed',
    });
  });

  it('ignores unknown message types for forward compatibility', () => {
    expect(parse({ type: 'telemetry', x: 1 })).toMatchObject({
      ok: false,
      reason: 'unknown_type',
      detail: 'telemetry',
    });
  });
});

describe('ControlMsgSchema (outgoing)', () => {
  it('accepts the three control actions', () => {
    for (const m of [
      { type: 'control', action: 'pause' },
      { type: 'control', action: 'resume' },
      { type: 'control', action: 'speed', speed: 4 },
    ]) {
      expect(ControlMsgSchema.safeParse(m).success).toBe(true);
    }
  });
  it('rejects a speed message without a positive speed', () => {
    expect(ControlMsgSchema.safeParse({ type: 'control', action: 'speed' }).success).toBe(false);
    expect(ControlMsgSchema.safeParse({ type: 'control', action: 'speed', speed: 0 }).success).toBe(
      false,
    );
    expect(ControlMsgSchema.safeParse({ type: 'control', action: 'seek', t: 1 }).success).toBe(
      false,
    );
  });
});
