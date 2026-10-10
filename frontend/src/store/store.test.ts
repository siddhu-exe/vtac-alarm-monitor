import { describe, expect, it } from 'vitest';
import { verdict } from '@/test/fixtures';
import { alarm, detail, MODEL } from '@/test/helpers';
import { createAppStore } from './index';

function ready() {
  const store = createAppStore();
  store.getState().setBootstrapReady(MODEL, [alarm('a1', 'false'), alarm('a2', 'true')]);
  return store;
}

describe('app store', () => {
  it('starts idle, playing at 1x with auto-advance on', () => {
    const s = createAppStore().getState();
    expect(s.bootstrap.status).toBe('idle');
    expect(s).toMatchObject({ playing: true, speed: 1, autoAdvance: true, selectedId: null });
  });

  it('bootstrap fills the alarm order and resets verdicts', () => {
    const store = ready();
    store.getState().addVerdict(verdict({ alarm_id: 'a1' }), 1);
    store.getState().setBootstrapReady(MODEL, [alarm('a9')]);
    expect(store.getState()).toMatchObject({
      order: ['a9'],
      verdicts: {},
      bootstrap: { status: 'ready' },
    });
  });

  it('derives the decision locally and keeps the receive time', () => {
    const store = ready();
    store.getState().addVerdict(
      verdict({
        alarm_id: 'a1',
        p_true: 0.7,
        threshold: 0.31,
        action: 'escalated',
        verdict: 'TRUE_ALARM',
      }),
      1234,
    );
    const rec = store.getState().verdicts.a1;
    expect(rec).toMatchObject({ decision: 'escalated', actionMismatch: false, receivedAtMs: 1234 });
  });

  it('flags a server action that disagrees with p vs tau', () => {
    const store = ready();
    store
      .getState()
      .addVerdict(
        verdict({ alarm_id: 'a1', p_true: 0.9, threshold: 0.5, action: 'suppressed' }),
        1,
      );
    expect(store.getState().verdicts.a1).toMatchObject({
      decision: 'escalated',
      actionMismatch: true,
    });
  });

  it('updates the session summary as verdicts arrive and on a repeat replay', () => {
    const store = ready();
    const { addVerdict } = store.getState();
    addVerdict(verdict({ alarm_id: 'a1', p_true: 0.1, ground_truth: 'false' }), 1);
    addVerdict(verdict({ alarm_id: 'a2', p_true: 0.1, ground_truth: 'true' }), 2); // missed
    expect(store.getState().summary).toMatchObject({
      total: 2,
      suppressed: 2,
      missed: 1,
      reductionPct: 100,
    });
    addVerdict(verdict({ alarm_id: 'a2', p_true: 0.9, ground_truth: 'true' }), 3); // replayed
    expect(store.getState().summary).toMatchObject({ total: 2, missed: 0, caught: 1 });
  });

  it('ignores verdicts for alarms it does not know in the summary', () => {
    const store = ready();
    store.getState().addVerdict(verdict({ alarm_id: 'ghost' }), 1);
    expect(store.getState().summary.total).toBe(0);
  });

  it('caches alarm details and counts invalid frames', () => {
    const store = ready();
    store.getState().setDetail(detail('a1'));
    store.getState().noteInvalid('schema: chunk');
    store.getState().noteInvalid('malformed');
    expect(store.getState().details.a1?.sources.ECG_1).toBe('II');
    expect(store.getState()).toMatchObject({ invalidCount: 2, lastInvalid: 'malformed' });
  });
});
