import { createContext, createElement, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createAlarmsSlice } from './alarms';
import { createPlaybackSlice } from './playback';
import { createSelectionSlice } from './selection';
import { createStreamSlice } from './stream';
import type { AppState } from './types';

export type AppStore = StoreApi<AppState>;

/** A fresh store per app instance / test: there is no module-level mutable state. */
export function createAppStore(): AppStore {
  return createStore<AppState>()((...a) => ({
    ...createStreamSlice(...a),
    ...createAlarmsSlice(...a),
    ...createSelectionSlice(...a),
    ...createPlaybackSlice(...a),
  }));
}

const StoreContext = createContext<AppStore | null>(null);

export function StoreProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  return createElement(StoreContext.Provider, { value: store }, children);
}

export function useAppStoreApi(): AppStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useAppStore must be used inside <StoreProvider>');
  return store;
}

/** Subscribe to a slice of state; re-renders only when the selected value changes. */
export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useStore(useAppStoreApi(), selector);
}

export type { AppState } from './types';
