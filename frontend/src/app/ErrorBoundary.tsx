import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/** A render bug should leave a readable message and a way back, not a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI crashed', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mx-auto max-w-page px-6 py-8">
        <div role="alert" className="rounded-panel border border-warn bg-surface p-4">
          <p className="m-0 text-body-sm font-semibold">Something went wrong in the display</p>
          <p className="mb-0 mt-1 text-caption text-fg-secondary">
            The replay is unaffected on the server. Reload the page to start again.
          </p>
          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
            className="mt-3 h-control-sm rounded-button border border-line-strong bg-surface-raised px-4 text-body-sm font-medium hover:bg-segment-on"
          >
            Reload
          </button>
        </div>
      </main>
    );
  }
}
