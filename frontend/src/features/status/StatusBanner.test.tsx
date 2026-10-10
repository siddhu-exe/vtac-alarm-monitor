import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createAppStore } from '@/store';
import { readyStore, renderWithStore } from '@/test/render';
import { StatusBanner } from './StatusBanner';

describe('StatusBanner', () => {
  it('is silent when everything is fine', () => {
    renderWithStore(<StatusBanner onRetry={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says it is connecting while the first requests are in flight', () => {
    const store = createAppStore();
    store.getState().setBootstrap({ status: 'loading' });
    renderWithStore(<StatusBanner onRetry={vi.fn()} />, store);
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to the replay backend');
  });

  it('explains an unreachable backend and offers a retry', async () => {
    const onRetry = vi.fn();
    const store = createAppStore();
    store.getState().setBootstrap({ status: 'error', kind: 'network', message: 'x' });
    renderWithStore(<StatusBanner onRetry={onRetry} />, store);
    expect(screen.getByRole('alert')).toHaveTextContent('The backend is not reachable');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows the server message for a contract or HTTP error', () => {
    const store = createAppStore();
    store.getState().setBootstrap({ status: 'error', kind: 'schema', message: 'Bad /model reply' });
    renderWithStore(<StatusBanner onRetry={vi.fn()} />, store);
    expect(screen.getByRole('alert')).toHaveTextContent('Bad /model reply');
  });

  it('reports reconnecting politely, without a retry button the user does not need', () => {
    const store = readyStore();
    renderWithStore(<StatusBanner onRetry={vi.fn()} />, store);
    act(() => {
      store.getState().setConnection({ kind: 'reconnecting', attempt: 3, retryInMs: 800 });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting');
    expect(screen.getByRole('status')).toHaveTextContent('Attempt 3');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers a retry only when retrying can help', () => {
    const store = readyStore();
    renderWithStore(<StatusBanner onRetry={vi.fn()} />, store);
    act(() => {
      store.getState().setConnection({
        kind: 'failed',
        code: 'unreachable',
        message: 'The backend stopped responding.',
        retryable: true,
      });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('The replay stopped');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    act(() => {
      store.getState().setConnection({
        kind: 'failed',
        code: 'not_found',
        message: 'unknown alarm a1',
        retryable: false,
      });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('This alarm cannot be replayed');
    expect(screen.getByRole('alert')).toHaveTextContent('unknown alarm a1');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
