import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import type { Env } from '@/config/env';
import { FakeSocket } from '@/test/fakeSocket';
import { chunk, end, session, verdict } from '@/test/fixtures';
import { fakeApi, MODEL } from '@/test/helpers';
import { Dashboard } from './App';
import { ConfigError } from './ConfigError';
import { createRuntime } from './runtime';

vi.mock('uplot', () => ({
  default: class {
    setData = vi.fn();
    setSize = vi.fn();
    destroy = vi.fn();
  },
}));

const ENV: Env = { apiUrl: '/api', wsUrl: '' };

function mount(api = fakeApi()) {
  const runtime = createRuntime(ENV, {
    api,
    createSocket: (url) => new FakeSocket(url),
    location: { protocol: 'http:', host: 'app.test' },
  });
  const view = render(<Dashboard runtime={runtime} />);
  return { runtime, api, ...view };
}

const startStream = (id = 'a1') => {
  act(() => {
    FakeSocket.last.open();
    FakeSocket.last.push(session({ alarm_id: id }));
  });
};

beforeEach(() => {
  FakeSocket.reset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Dashboard', () => {
  it('boots from /model + /alarms, selects the first alarm and connects its stream', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'Patient p1' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3 alarms
    expect(FakeSocket.last.url).toContain('/ws/replay/a1?');
    // the permanent labels
    expect(screen.getByText('SIMULATED REAL-TIME · REPLAYED RECORDINGS')).toBeInTheDocument();
    expect(screen.getByText(/not for clinical use/)).toBeInTheDocument();
    expect(screen.getByText('MODEL: MOCK')).toBeInTheDocument();
  });

  it('shows the verdict, feed row, summary and header state as the replay runs', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Patient p1' });
    startStream();
    expect(screen.getByText('STREAMING 1×')).toBeInTheDocument();
    act(() => {
      FakeSocket.last.push(chunk());
      FakeSocket.last.push(verdict({ p_true: 0.07, threshold: 0.5 }));
      FakeSocket.last.push(end());
    });
    const card = screen.getByRole('region', { name: 'Model verdict' });
    expect(within(card).getByText('False alarm — suppressed')).toBeInTheDocument();
    expect(screen.getByText('REPLAY ENDED')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 replayed')).toBeInTheDocument();
    expect(
      within(screen.getByRole('row', { selected: true })).getByText('FALSE · SUPPRESSED'),
    ).toBeInTheDocument();
  });

  it('switches alarm from the keyboard and starts a new stream', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Patient p1' });
    startStream();
    const rows = screen.getAllByRole('row').slice(1);
    rows[0]?.focus();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(await screen.findByText('Record a2 · monitor call: VT')).toBeInTheDocument();
    expect(FakeSocket.last.url).toContain('/a2?');
    expect(FakeSocket.instances[0]?.closedByClient).toBe(true);
  });

  it('survives an unreachable backend with a banner, and recovers on Try again', async () => {
    const api = fakeApi({
      model: vi.fn().mockRejectedValueOnce(new ApiError('network', 'Cannot reach the backend')),
    });
    vi.mocked(api.model).mockResolvedValue(MODEL);
    mount(api);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot load the alarm list');
    expect(screen.getByText('BACKEND OFFLINE')).toBeInTheDocument();
    // the page is not blank: layout, labels and disabled transport are all there
    expect(screen.getByText('SIMULATED REAL-TIME · REPLAYED RECORDINGS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next alarm' })).toBeDisabled();
    expect(screen.getByText('The alarm list could not be loaded.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Patient p1' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a reconnecting banner when the stream drops', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Patient p1' });
    startStream();
    act(() => {
      FakeSocket.last.drop();
    });
    expect(screen.getByText('RECONNECTING')).toBeInTheDocument();
    expect(screen.getByText('Connection lost. Reconnecting…')).toBeInTheDocument();
  });

  it('tears the stream down on unmount', async () => {
    const { unmount } = mount();
    await screen.findByRole('heading', { name: 'Patient p1' });
    await waitFor(() => {
      expect(FakeSocket.instances).toHaveLength(1);
    });
    unmount();
    expect(FakeSocket.last.closedByClient).toBe(true);
  });
});

describe('ConfigError', () => {
  it('lists what is wrong with the environment', () => {
    render(<ConfigError errors={['VITE_WS_URL: must be empty or a ws(s):// origin']} />);
    expect(screen.getByRole('alert')).toHaveTextContent('misconfigured');
    expect(screen.getByText(/VITE_WS_URL/)).toBeInTheDocument();
  });
});
