import { useEffect, useMemo } from 'react';
import { envResult, type Env } from '@/config/env';
import { AlarmFeed } from '@/features/alarms/AlarmFeed';
import { AppFooter } from '@/features/status/AppFooter';
import { AppHeader } from '@/features/status/AppHeader';
import { StatusBanner } from '@/features/status/StatusBanner';
import { ModelCard } from '@/features/summary/ModelCard';
import { SessionSummary } from '@/features/summary/SessionSummary';
import { TransportBar, type TransportActions } from '@/features/transport/TransportBar';
import { VerdictCard } from '@/features/verdict/VerdictCard';
import { WaveformPanel } from '@/features/waveforms/WaveformPanel';
import { StoreProvider } from '@/store';
import { ConfigError } from './ConfigError';
import { ErrorBoundary } from './ErrorBoundary';
import { createRuntime, type Runtime } from './runtime';

export function Dashboard({ runtime }: { runtime: Runtime }) {
  const { store, live, controller } = runtime;

  // Connect on mount, tear down on unmount. StrictMode runs this twice in development; the
  // controller ignores the bootstrap that lost the race.
  useEffect(() => {
    void controller.bootstrap();
    return () => {
      controller.dispose();
    };
  }, [controller]);

  const actions = useMemo<TransportActions>(
    () => ({
      prev: () => {
        controller.prev();
      },
      next: () => {
        controller.next();
      },
      togglePlay: () => {
        controller.togglePlay();
      },
      setSpeed: (speed) => {
        controller.setSpeed(speed);
      },
      setAutoAdvance: (on) => {
        store.getState().setAutoAdvance(on);
      },
    }),
    [controller, store],
  );

  return (
    <StoreProvider store={store}>
      <a
        href="#alarm-feed-title"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-10 focus:rounded-button focus:bg-surface-raised focus:px-3 focus:py-2"
      >
        Skip to the alarm feed
      </a>
      <div className="box-border min-h-screen px-6 pb-8 pt-5">
        <div className="mx-auto flex max-w-page flex-col gap-4">
          <AppHeader />
          <StatusBanner
            onRetry={() => {
              controller.retry();
            }}
          />
          <TransportBar actions={actions} live={live} />
          <div className="flex flex-wrap items-start gap-4">
            <main className="flex min-w-0 grow-main shrink basis-main flex-col gap-4">
              <WaveformPanel live={live} />
              <AlarmFeed
                onSelect={(id) => {
                  controller.selectAlarm(id);
                }}
              />
            </main>
            <aside
              aria-label="Verdict and session"
              className="flex min-w-0 grow shrink basis-sidebar flex-col gap-4"
            >
              <VerdictCard />
              <SessionSummary />
              <ModelCard />
            </aside>
          </div>
          <AppFooter />
        </div>
      </div>
    </StoreProvider>
  );
}

export function App({ env }: { env?: Env }) {
  const result = env ? { ok: true as const, env } : envResult;
  const resolvedEnv = result.ok ? result.env : null;
  // One runtime per mounted app; a config error never builds a store.
  const runtime = useMemo(() => (resolvedEnv ? createRuntime(resolvedEnv) : null), [resolvedEnv]);
  if (!result.ok || !runtime) return <ConfigError errors={result.ok ? [] : result.errors} />;
  return (
    <ErrorBoundary>
      <Dashboard runtime={runtime} />
    </ErrorBoundary>
  );
}
