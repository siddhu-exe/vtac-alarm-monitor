import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { Alarm, ModelInfo } from '@/api/schemas';
import { createAppStore, StoreProvider, type AppStore } from '@/store';
import { alarm, MODEL } from './helpers';

/** A store already bootstrapped with a model and an alarm list (a1 false, a2 true, a3 false). */
export function readyStore(
  alarms: readonly Alarm[] = [alarm('a1', 'false', 'p1'), alarm('a2', 'true', 'p2'), alarm('a3')],
  model: ModelInfo = MODEL,
): AppStore {
  const store = createAppStore();
  store.getState().setBootstrapReady(model, alarms);
  return store;
}

export function renderWithStore(ui: ReactElement, store: AppStore = readyStore()) {
  return { store, ...render(<StoreProvider store={store}>{ui}</StoreProvider>) };
}
