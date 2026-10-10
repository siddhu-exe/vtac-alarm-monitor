import type { ReactNode } from 'react';
import { useAppStore } from '@/store';

const NOT_YET = 'not evaluated yet';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="m-0">{children}</dd>
    </>
  );
}

export function ModelCard() {
  const info = useAppStore((s) => s.modelInfo);
  return (
    <section
      aria-labelledby="model-card-title"
      className="flex flex-col gap-2.5 rounded-panel border border-line bg-surface px-4.5 py-4"
    >
      <h2 id="model-card-title" className="m-0 text-title-sm font-semibold">
        Model
      </h2>
      {info ? (
        <dl className="m-0 grid grid-cols-card gap-x-3 gap-y-2 text-caption">
          <Row label="Architecture">{info.architecture ?? 'not available'}</Row>
          <Row label="Runtime">
            <span className="font-mono">{info.runtime}</span>
          </Row>
          <Row label="Version">
            <span className="font-mono">{info.model_version ?? 'none loaded'}</span>
          </Row>
          <Row label="Test PR-AUC">
            <span className="font-mono">{info.metrics.test_pr_auc?.toFixed(3) ?? NOT_YET}</span>
          </Row>
          <Row label="Challenge score">
            <span className="font-mono">{info.metrics.challenge_score?.toFixed(3) ?? NOT_YET}</span>
          </Row>
          <Row label="Baseline">{info.baseline ?? 'not available'}</Row>
        </dl>
      ) : (
        <p className="m-0 text-caption text-fg-muted">Model details are not loaded.</p>
      )}
    </section>
  );
}
