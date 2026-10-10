import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createAppStore } from '@/store';
import { MODEL } from '@/test/helpers';
import { readyStore, renderWithStore } from '@/test/render';
import { ModelCard } from './ModelCard';

describe('ModelCard', () => {
  it('reports what the backend says and says plainly what is not there yet', () => {
    renderWithStore(<ModelCard />);
    expect(screen.getByText('mock predictor (dummy scores)')).toBeInTheDocument();
    expect(screen.getByText('Architecture').nextSibling).toHaveTextContent('not available');
    expect(screen.getByText('Test PR-AUC').nextSibling).toHaveTextContent('not evaluated yet');
    expect(screen.getByText('Challenge score').nextSibling).toHaveTextContent('not evaluated yet');
  });

  it('shows real metrics and architecture once the ONNX model is loaded', () => {
    const store = readyStore(undefined, {
      ...MODEL,
      model_mode: 'onnx',
      architecture: 'ResNet1D',
      baseline: 'XGBoost',
      metrics: { test_pr_auc: 0.8123, challenge_score: 0.61 },
    });
    renderWithStore(<ModelCard />, store);
    expect(screen.getByText('ResNet1D')).toBeInTheDocument();
    expect(screen.getByText('0.812')).toBeInTheDocument();
    expect(screen.getByText('0.610')).toBeInTheDocument();
    expect(screen.getByText('XGBoost')).toBeInTheDocument();
  });

  it('copes with the model info not being loaded', () => {
    renderWithStore(<ModelCard />, createAppStore());
    expect(screen.getByText('Model details are not loaded.')).toBeInTheDocument();
  });
});
