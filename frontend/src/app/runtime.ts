import { createApiClient } from '@/api/client';
import type { Env } from '@/config/env';
import { LiveBuffers } from '@/features/waveforms/LiveBuffers';
import { createAppStore, type AppStore } from '@/store';
import { ReplayController, type ControllerDeps } from '@/stream/controller';

/** Everything the app owns for its lifetime. Nothing here is module-level state. */
export interface Runtime {
  store: AppStore;
  live: LiveBuffers;
  controller: ReplayController;
}

/** Seams for tests: a fake API and socket. Production passes none. */
export type RuntimeOverrides = Partial<Pick<ControllerDeps, 'api' | 'createSocket' | 'location'>>;

export function createRuntime(env: Env, overrides: RuntimeOverrides = {}): Runtime {
  const store = createAppStore();
  const live = new LiveBuffers();
  const controller = new ReplayController({
    api: overrides.api ?? createApiClient(env.apiUrl),
    store,
    live,
    wsUrl: env.wsUrl,
    ...(overrides.createSocket ? { createSocket: overrides.createSocket } : {}),
    ...(overrides.location ? { location: overrides.location } : {}),
  });
  return { store, live, controller };
}
