import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { verdict } from '@/test/fixtures';
import { readyStore, renderWithStore } from '@/test/render';
import { AlarmFeed } from './AlarmFeed';

const rows = () => screen.getAllByRole('row').slice(1); // first row is the header
const rowAt = (i: number): HTMLElement => {
  const row = rows()[i];
  if (!row) throw new Error(`no row at ${i}`);
  return row;
};

describe('AlarmFeed', () => {
  it('lists every alarm with its columns; verdict columns are pending until replayed', () => {
    renderWithStore(<AlarmFeed onSelect={vi.fn()} />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'RECEIVED',
      'PATIENT',
      'RECORD',
      'MODEL VERDICT',
      'P(TRUE)',
      'LATENCY',
      'EXPERT LABEL',
    ]);
    expect(rows()).toHaveLength(3);
    const first = within(rowAt(0));
    expect(first.getByText('p1')).toBeInTheDocument(); // patient
    expect(first.getByText('a1')).toBeInTheDocument(); // record = alarm_id
    expect(first.getByText('pending')).toBeInTheDocument();
    expect(first.getByText('after replay')).toBeInTheDocument(); // the label is not leaked early
  });

  it('shows the verdict as text, with probability, latency and agreement, once it arrives', () => {
    const store = readyStore();
    renderWithStore(<AlarmFeed onSelect={vi.fn()} />, store);
    act(() => {
      store
        .getState()
        .addVerdict(
          verdict({ alarm_id: 'a1', p_true: 0.07, threshold: 0.5, latency_ms: 11.2 }),
          new Date(2024, 0, 1, 2, 41, 12).getTime(),
        );
      store.getState().addVerdict(
        verdict({
          alarm_id: 'a2',
          p_true: 0.3,
          threshold: 0.5,
          action: 'suppressed',
          ground_truth: 'true',
        }),
        new Date(2024, 0, 1, 2, 42, 0).getTime(),
      );
    });
    const [a1, a2] = rows().map((r) => within(r));
    expect(a1?.getByText('FALSE · SUPPRESSED')).toBeInTheDocument();
    expect(a1?.getByText('02:41:12')).toBeInTheDocument();
    expect(a1?.getByText('0.07')).toBeInTheDocument();
    expect(a1?.getByText('11.2 ms')).toBeInTheDocument();
    expect(a1?.getByText(/False alarm/)).toBeInTheDocument();
    expect(a1?.getByText('· agrees')).toBeInTheDocument();
    // a missed true alarm is called out in words, not just colour
    expect(a2?.getByText('· disagrees')).toBeInTheDocument();
  });

  it('marks the selected row and keeps only that row in the tab order', () => {
    const store = readyStore();
    store.getState().select('a2');
    renderWithStore(<AlarmFeed onSelect={vi.fn()} />, store);
    const [a1, a2, a3] = rows();
    expect(a2).toHaveAttribute('aria-selected', 'true');
    expect(a1).toHaveAttribute('aria-selected', 'false');
    expect([a1, a2, a3].map((r) => r?.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('falls back to the first row in the tab order when nothing is selected', () => {
    renderWithStore(<AlarmFeed onSelect={vi.fn()} />);
    expect(rows().map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  });

  it('selects an alarm on click', async () => {
    const onSelect = vi.fn();
    renderWithStore(<AlarmFeed onSelect={onSelect} />);
    await userEvent.click(rowAt(1));
    expect(onSelect).toHaveBeenCalledWith('a2');
  });

  it('moves with the arrow keys, jumps with Home/End, and selects with Enter or Space', async () => {
    const onSelect = vi.fn();
    renderWithStore(<AlarmFeed onSelect={onSelect} />);
    const [a1, a2, a3] = rows();
    a1?.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(a2).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(a3).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}'); // no wrap past the end
    expect(a3).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(a2).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(a1).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(a3).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled(); // moving is not selecting
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('a3');
    await userEvent.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('says so when there are no alarms', () => {
    renderWithStore(<AlarmFeed onSelect={vi.fn()} />, readyStore([]));
    expect(screen.getByText(/No alarms to replay/)).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
  });
});
