import type { StateCreator } from 'zustand';
import { decide, EMPTY_SUMMARY, summarize } from '@/features/alarms/verdict';
import type { AlarmsSlice, AppState } from './types';

export const createAlarmsSlice: StateCreator<AppState, [], [], AlarmsSlice> = (set) => ({
  bootstrap: { status: 'idle' },
  modelInfo: null,
  order: [],
  byId: {},
  details: {},
  verdicts: {},
  summary: EMPTY_SUMMARY,
  setBootstrap: (bootstrap) => {
    set({ bootstrap });
  },
  setBootstrapReady: (modelInfo, alarms) => {
    set({
      bootstrap: { status: 'ready' },
      modelInfo,
      order: alarms.map((a) => a.alarm_id),
      byId: Object.fromEntries(alarms.map((a) => [a.alarm_id, a])),
      details: {},
      verdicts: {},
      summary: EMPTY_SUMMARY,
    });
  },
  setDetail: (detail) => {
    set((s) => ({ details: { ...s.details, [detail.alarm_id]: detail } }));
  },
  addVerdict: (msg, receivedAtMs) => {
    set((s) => {
      const decision = decide(msg.p_true, msg.threshold);
      const record = { msg, decision, actionMismatch: decision !== msg.action, receivedAtMs };
      const verdicts = { ...s.verdicts, [msg.alarm_id]: record };
      const items = Object.values(verdicts).flatMap((v) => {
        const alarm = s.byId[v.msg.alarm_id];
        return alarm ? [{ decision: v.decision, groundTruth: v.msg.ground_truth }] : [];
      });
      return { verdicts, summary: summarize(items) };
    });
  },
});
