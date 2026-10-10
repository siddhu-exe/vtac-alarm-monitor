import type { StateCreator } from 'zustand';
import type { AppState, StreamSlice } from './types';

export const createStreamSlice: StateCreator<AppState, [], [], StreamSlice> = (set) => ({
  connection: { kind: 'idle' },
  session: null,
  invalidCount: 0,
  lastInvalid: null,
  setConnection: (connection) => {
    set({ connection });
  },
  setSession: (session) => {
    set({ session });
  },
  noteInvalid: (detail) => {
    set((s) => ({ invalidCount: s.invalidCount + 1, lastInvalid: detail }));
  },
});
