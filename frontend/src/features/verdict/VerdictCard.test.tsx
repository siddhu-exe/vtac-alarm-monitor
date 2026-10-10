import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { verdict } from '@/test/fixtures';
import { detail } from '@/test/helpers';
import { readyStore, renderWithStore } from '@/test/render';
import { VerdictCard } from './VerdictCard';

function setup(selected: string | null = 'a1') {
  const store = readyStore();
  if (selected) store.getState().select(selected);
  renderWithStore(<VerdictCard />, store);
  return { store };
}

describe('VerdictCard', () => {
  it('asks for a selection when there is none', () => {
    setup(null);
    expect(screen.getByText('No alarm selected.')).toBeInTheDocument();
  });

  it('waits for the model before inventing a verdict', () => {
    setup();
    expect(screen.getByText('Waiting for the model')).toBeInTheDocument();
    expect(screen.getByText(/10 s input window/)).toBeInTheDocument();
    expect(screen.getByText('MODEL VERDICT · RECORD a1')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', 'not available yet');
    expect(screen.getByText('threshold τ')).toHaveTextContent('0.50'); // from /model
    expect(screen.getByText('Expert label').nextSibling).toHaveTextContent('—'); // not leaked early
  });

  it('shows a suppressed false alarm that the expert agrees with', () => {
    const { store } = setup();
    act(() => {
      store.getState().addVerdict(verdict({ p_true: 0.07, threshold: 0.31, latency_ms: 11.2 }), 1);
    });
    expect(screen.getByText('False alarm — suppressed')).toBeInTheDocument();
    expect(screen.getByText('Suppressed · logged for review')).toBeInTheDocument();
    expect(screen.getByText('Agrees with expert')).toBeInTheDocument();
    expect(screen.getByText('11.2 ms')).toBeInTheDocument();
    expect(screen.getByText('ECG ×2 + PLETH')).toBeInTheDocument(); // mask [1,1,1,0]
    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '0.07');
    expect(screen.getByText('threshold τ')).toHaveTextContent('0.31'); // verdict's τ
  });

  it('shows an escalated true alarm', () => {
    const { store } = setup('a2');
    act(() => {
      store.getState().addVerdict(
        verdict({
          alarm_id: 'a2',
          p_true: 0.94,
          threshold: 0.5,
          action: 'escalated',
          verdict: 'TRUE_ALARM',
          ground_truth: 'true',
          mask: [1, 1, 1, 1],
        }),
        1,
      );
    });
    expect(screen.getByText('True VT — escalated')).toBeInTheDocument();
    expect(screen.getByText('Alarm kept at full priority')).toBeInTheDocument();
    expect(screen.getByText('True alarm')).toBeInTheDocument();
    expect(screen.getByText('ECG ×2 + PLETH + ABP')).toBeInTheDocument();
  });

  it('says in words when the model and the expert disagree', () => {
    const { store } = setup();
    act(() => {
      store
        .getState()
        .addVerdict(
          verdict({ p_true: 0.9, threshold: 0.5, action: 'escalated', ground_truth: 'false' }),
          1,
        );
    });
    expect(screen.getByText('Disagrees with expert')).toBeInTheDocument();
  });

  it('shows an honest placeholder instead of invented Grad-CAM numbers', () => {
    const { store } = setup();
    act(() => {
      store.getState().addVerdict(verdict(), 1);
    });
    expect(screen.getByText('Where the model looked')).toBeInTheDocument();
    expect(screen.getByText(/planned for checkpoint 2/)).toBeInTheDocument();
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('renders attribution bars when the backend sends them', () => {
    const { store } = setup();
    act(() => {
      store.getState().setDetail(detail('a1'));
      store.getState().addVerdict(
        verdict({
          attribution: {
            method: 'gradcam',
            per_channel: { ECG_1: [0.5], PPG: [0.5] },
            channel_share: { ECG_1: 0.7, PPG: 0.3 },
          },
        }),
        1,
      );
    });
    const list = screen.getByRole('list');
    expect(within(list).getByText('ECG II')).toBeInTheDocument();
    expect(within(list).getByText('70%')).toBeInTheDocument();
    expect(within(list).getByText('PLETH')).toBeInTheDocument();
    expect(within(list).getByText('30%')).toBeInTheDocument();
    expect(screen.queryByText(/planned for checkpoint 2/)).not.toBeInTheDocument();
  });
});
