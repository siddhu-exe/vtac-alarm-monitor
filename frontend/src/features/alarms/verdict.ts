import type { Action, GroundTruth } from '@/stream/schemas';
import type { DecisionOutcome, Outcome, Summary } from '@/types/domain';

/** The decision rule from docs/architecture.md: escalate when p(true alarm) >= tau. */
export function decide(pTrue: number, threshold: number): Action {
  return pTrue >= threshold ? 'escalated' : 'suppressed';
}

export function outcomeOf({ decision, groundTruth }: DecisionOutcome): Outcome {
  if (groundTruth === 'true') return decision === 'escalated' ? 'caught' : 'missed';
  return decision === 'escalated' ? 'false_escalated' : 'suppressed_false';
}

/** True when the model's decision matches the expert label. */
export function agrees(d: DecisionOutcome): boolean {
  const o = outcomeOf(d);
  return o === 'caught' || o === 'suppressed_false';
}

export const EMPTY_SUMMARY: Summary = {
  total: 0,
  suppressed: 0,
  escalated: 0,
  caught: 0,
  trueTotal: 0,
  missed: 0,
  falseEscalated: 0,
  falseTotal: 0,
  reductionPct: null,
};

export function summarize(items: readonly DecisionOutcome[]): Summary {
  const s = { ...EMPTY_SUMMARY };
  for (const item of items) {
    s.total += 1;
    if (item.decision === 'escalated') s.escalated += 1;
    else s.suppressed += 1;
    if (item.groundTruth === 'true') s.trueTotal += 1;
    else s.falseTotal += 1;
    switch (outcomeOf(item)) {
      case 'caught':
        s.caught += 1;
        break;
      case 'missed':
        s.missed += 1;
        break;
      case 'false_escalated':
        s.falseEscalated += 1;
        break;
      case 'suppressed_false':
        break;
    }
  }
  s.reductionPct =
    s.falseTotal === 0
      ? null
      : Math.round(((s.falseTotal - s.falseEscalated) / s.falseTotal) * 100);
  return s;
}

export function labelOf(truth: GroundTruth): string {
  return truth === 'true' ? 'True alarm' : 'False alarm';
}
