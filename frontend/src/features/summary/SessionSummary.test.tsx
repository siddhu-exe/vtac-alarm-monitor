import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { verdict } from '@/test/fixtures';
import { renderWithStore } from '@/test/render';
import { SessionSummary } from './SessionSummary';

describe('SessionSummary', () => {
  it('starts empty, with the reduction shown as a dash rather than 0%', () => {
    renderWithStore(<SessionSummary />);
    expect(screen.getByText('0 of 3 replayed')).toBeInTheDocument();
    expect(screen.getByText('False-alarm reduction').previousSibling).toHaveTextContent('—');
    expect(screen.getByText('True alarms caught').previousSibling).toHaveTextContent('0 / 0');
  });

  it('counts decisions against the expert labels as verdicts arrive', () => {
    const { store } = renderWithStore(<SessionSummary />);
    act(() => {
      const add = store.getState().addVerdict;
      add(verdict({ alarm_id: 'a1', p_true: 0.1, threshold: 0.5, ground_truth: 'false' }), 1);
      add(verdict({ alarm_id: 'a2', p_true: 0.2, threshold: 0.5, ground_truth: 'true' }), 2);
      add(verdict({ alarm_id: 'a3', p_true: 0.9, threshold: 0.5, ground_truth: 'false' }), 3);
    });
    const value = (label: string) => screen.getByText(label).previousSibling;
    expect(value('Alarms suppressed')).toHaveTextContent('2'); // a1 and the missed a2
    expect(value('Alarms escalated')).toHaveTextContent('1');
    expect(value('True alarms missed')).toHaveTextContent('1'); // the costly error
    expect(value('True alarms caught')).toHaveTextContent('0 / 1');
    expect(value('False alarms escalated')).toHaveTextContent('1');
    expect(value('False-alarm reduction')).toHaveTextContent('50%');
    expect(screen.getByText('3 of 3 replayed')).toBeInTheDocument();
  });
});
