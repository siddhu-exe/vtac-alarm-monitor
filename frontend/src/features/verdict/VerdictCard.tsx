import type { ReactNode } from 'react';
import { agrees, decisionNote, decisionTitle, labelOf, TONE } from '@/features/alarms/verdict';
import { useAppStore } from '@/store';
import { AttributionBars } from './AttributionBars';
import { describeChannelsUsed } from './channels';

const EYEBROW = 'font-mono text-micro tracking-badge text-fg-muted';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-micro text-fg-muted">{label}</dt>
      <dd className="m-0 mt-0.5 text-body">{children}</dd>
    </div>
  );
}

export function VerdictCard() {
  const selectedId = useAppStore((s) => s.selectedId);
  const record = useAppStore((s) => (s.selectedId ? s.verdicts[s.selectedId] : undefined));
  const detail = useAppStore((s) => (s.selectedId ? s.details[s.selectedId] : undefined));
  const modelInfo = useAppStore((s) => s.modelInfo);

  if (!selectedId) {
    return (
      <section
        aria-label="Model verdict"
        className="rounded-panel border border-line bg-surface p-4.5"
      >
        <h2 className={`m-0 font-normal ${EYEBROW}`}>MODEL VERDICT</h2>
        <p className="m-0 mt-3 text-body text-fg-muted">No alarm selected.</p>
      </section>
    );
  }

  const tau = record?.msg.threshold ?? modelInfo?.threshold;
  const pTrue = record?.msg.p_true;
  const tone = record ? TONE[record.decision] : null;
  const match = record
    ? agrees({ decision: record.decision, groundTruth: record.msg.ground_truth })
    : null;
  const windowS = modelInfo?.window_s;

  return (
    <section
      aria-label="Model verdict"
      className={`flex flex-col gap-3.5 rounded-panel border bg-surface px-4.5 pb-4 pt-4.5 ${
        tone ? tone.panel : 'border-line'
      }`}
    >
      <h2 className={`m-0 font-normal ${EYEBROW}`}>MODEL VERDICT · RECORD {selectedId}</h2>
      <div aria-live="polite">
        {record && tone ? (
          <>
            <div className={`text-display font-semibold leading-tight ${tone.text}`}>
              {decisionTitle(record.decision)}
            </div>
            <div className="mt-1.5 text-body text-fg-secondary">
              {decisionNote(record.decision)}
            </div>
          </>
        ) : (
          <>
            <div className="text-display font-semibold leading-tight text-fg-muted">
              Waiting for the model
            </div>
            <div className="mt-1.5 text-body text-fg-secondary">
              {windowS
                ? `The verdict is computed once the ${windowS} s input window has been replayed.`
                : 'The verdict arrives when the input window has been replayed.'}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between font-mono text-caption text-fg-muted">
          <span>
            p(true alarm){' '}
            <span className="text-fg">{pTrue === undefined ? '—' : pTrue.toFixed(2)}</span>
          </span>
          <span>
            threshold τ <span className="text-fg">{tau === undefined ? '—' : tau.toFixed(2)}</span>
          </span>
        </div>
        <div
          role="meter"
          aria-label="Probability of a true alarm"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={pTrue ?? 0}
          aria-valuetext={pTrue === undefined ? 'not available yet' : pTrue.toFixed(2)}
          className="relative h-bar-lg rounded-bar bg-track"
        >
          {tone && pTrue !== undefined && (
            <div
              className={`absolute inset-y-0 left-0 rounded-bar ${tone.fill}`}
              style={{ width: `${Math.round(pTrue * 100)}%` }}
            />
          )}
          {tau !== undefined && (
            <div
              className="absolute -inset-y-1 w-onset bg-fg"
              style={{ left: `${Math.round(tau * 100)}%` }}
            />
          )}
        </div>
        <p className="m-0 text-micro text-fg-muted">
          {modelInfo?.model_mode === 'onnx'
            ? `Escalate when p ≥ τ. τ was tuned on validation for TPR ≥ ${modelInfo.tpr_target}.`
            : 'Escalate when p ≥ τ. Mock mode: τ and scores are placeholders, not tuned.'}
        </p>
      </div>

      <dl className="m-0 grid grid-cols-2 gap-3 border-t border-line pt-3.5">
        <Field label="Expert label">{record ? labelOf(record.msg.ground_truth) : '—'}</Field>
        <Field label="Agreement">
          {match === null ? (
            '—'
          ) : (
            <span className={match ? 'text-ok' : 'text-warn'}>
              {match ? 'Agrees with expert' : 'Disagrees with expert'}
            </span>
          )}
        </Field>
        <Field label="Inference latency">
          <span className="font-mono">
            {record ? `${record.msg.latency_ms.toFixed(1)} ms` : '—'}
          </span>
        </Field>
        <Field label="Channels used">
          {record && modelInfo
            ? describeChannelsUsed(modelInfo.channel_slots, record.msg.mask)
            : '—'}
        </Field>
      </dl>

      <AttributionBars
        slots={modelInfo?.channel_slots ?? []}
        attribution={record?.msg.attribution}
        sources={detail?.sources}
      />
    </section>
  );
}
