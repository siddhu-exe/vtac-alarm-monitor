import type { StateCreator } from 'zustand';
import type { AppState, SelectionSlice } from './types';

export const createSelectionSlice: StateCreator<AppState, [], [], SelectionSlice> = (set) => ({
  selectedId: null,
  select: (selectedId) => {
    set({ selectedId });
  },
});
