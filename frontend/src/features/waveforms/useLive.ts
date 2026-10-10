import { useSyncExternalStore } from 'react';
import type { LiveBuffers } from './LiveBuffers';

/**
 * Read a value that lives in LiveBuffers. `select` must return a stable reference (or a primitive)
 * until the underlying value changes; LiveBuffers' getters already do.
 */
export function useLive<T>(live: LiveBuffers, select: (live: LiveBuffers) => T): T {
  return useSyncExternalStore(live.subscribeValues, () => select(live));
}
