import type { TraceKind } from '@/design/tokens';

/** Same rule as backend vtac.filters.kind_for_slot: the modality follows from the slot name. */
export function kindOfSlot(slot: string): TraceKind {
  if (slot.startsWith('ECG')) return 'ecg';
  if (slot === 'PPG') return 'pleth';
  if (slot === 'ABP') return 'abp';
  throw new Error(`unknown channel slot ${JSON.stringify(slot)}`);
}

/** Header units: ECG mV, PLETH NU, ABP mmHg (docs/data.md). */
export const UNIT_BY_KIND: Record<TraceKind, string> = {
  ecg: 'ECG · mV',
  pleth: 'PPG · NU',
  abp: 'mmHg',
};

/** Tailwind classes per modality (tokens only). */
export const TEXT_CLASS_BY_KIND: Record<TraceKind, string> = {
  ecg: 'text-trace-ecg',
  pleth: 'text-trace-pleth',
  abp: 'text-trace-abp',
};

export interface StripSpec {
  slot: string;
  kind: TraceKind;
  /** Source channel name from the record header (II, V, PLETH, ...) or the slot name. */
  label: string;
  unit: string;
  /** Only the first ECG strip shows the heart-rate readout. */
  showsHeartRate: boolean;
}

export function buildStripSpecs(
  slots: readonly string[],
  sources: Readonly<Record<string, string | null>> | undefined,
): StripSpec[] {
  let hrTaken = false;
  return slots.map((slot) => {
    const kind = kindOfSlot(slot);
    const showsHeartRate = kind === 'ecg' && !hrTaken;
    if (showsHeartRate) hrTaken = true;
    return {
      slot,
      kind,
      label: sources?.[slot] ?? slot,
      unit: UNIT_BY_KIND[kind],
      showsHeartRate,
    };
  });
}
