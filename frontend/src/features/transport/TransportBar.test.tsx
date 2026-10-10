import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LiveBuffers } from '@/features/waveforms/LiveBuffers';
import { computeView } from '@/config/view';
import { chunk, session, verdict } from '@/test/fixtures';
import { MODEL } from '@/test/helpers';
import { readyStore, renderWithStore } from '@/test/render';
import { TransportBar, type TransportActions } from './TransportBar';

function setup(store = readyStore()) {
  const actions: TransportActions = {
    prev: vi.fn(),
    next: vi.fn(),
    togglePlay: vi.fn(),
    setSpeed: vi.fn(),
    setAutoAdvance: vi.fn(),
  };
  const live = new LiveBuffers();
  renderWithStore(<TransportBar actions={actions} live={live} />, store);
  return { actions, live, store };
}

describe('TransportBar', () => {
  it('has labelled prev / next buttons and a play button that says what it will do', async () => {
    const { actions } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Previous alarm' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next alarm' }));
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(actions.prev).toHaveBeenCalledOnce();
    expect(actions.next).toHaveBeenCalledOnce();
    expect(actions.togglePlay).toHaveBeenCalledOnce();
  });

  it('offers Play when paused and Replay once the stream has ended', () => {
    const store = readyStore();
    store.getState().setPlaying(false);
    setup(store);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    act(() => {
      store.getState().setPlaying(true);
      store.getState().setConnection({ kind: 'ended' });
    });
    expect(screen.getByRole('button', { name: 'Replay' })).toBeInTheDocument();
  });

  it('exposes speed as a pressed-state toggle group, capped at the backend maximum', async () => {
    const { actions } = setup();
    const group = screen.getByRole('group', { name: 'Replay speed' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '2×' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: '4×' }));
    expect(actions.setSpeed).toHaveBeenCalledWith(4);
  });

  it('hides speeds the server would refuse', () => {
    const store = readyStore(undefined, { ...MODEL, max_speed: 2 });
    setup(store);
    expect(screen.queryByRole('button', { name: '4×' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2×' })).toBeInTheDocument();
  });

  it('toggles auto-advance and shows the state in text', async () => {
    const { actions } = setup();
    const toggle = screen.getByRole('button', { name: /Auto-advance/ });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveTextContent('ON');
    await userEvent.click(toggle);
    expect(actions.setAutoAdvance).toHaveBeenCalledWith(false);
  });

  it('disables transport when there are no alarms', () => {
    setup(readyStore([]));
    expect(screen.getByRole('button', { name: 'Next alarm' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
  });

  it('shows the model window from /model and dashes for what has not arrived yet', () => {
    setup();
    expect(screen.getByText('−8 s → +2 s')).toBeInTheDocument();
    expect(screen.getByText('Replay clock').nextSibling).toHaveTextContent('—');
    expect(screen.getByText('Inference').nextSibling).toHaveTextContent('—');
  });

  it('follows the replay clock relative to the onset, and the verdict latency', () => {
    vi.useFakeTimers();
    const store = readyStore();
    store.getState().select('a1');
    const { live } = setup(store);
    act(() => {
      live.reset(session(), computeView(MODEL));
      live.chunk(chunk({ t0: 286, channels: { ECG_1: new Array<number>(250 * 4).fill(0) } }));
      vi.advanceTimersByTime(300);
      store.getState().addVerdict(verdict({ latency_ms: 12.34 }), 1);
    });
    expect(screen.getByText('Replay clock').nextSibling).toHaveTextContent('−10.0 s');
    expect(screen.getByText('Inference').nextSibling).toHaveTextContent('12.3 ms');
    vi.useRealTimers();
  });
});
