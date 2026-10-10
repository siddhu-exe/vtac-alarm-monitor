import type { Numerics, Quality } from '@/stream/schemas';

const MINUS = '−';
const DASH = '—';

/** Axis label for a time relative to the alarm onset: "0", "+2", "−14". */
export function formatOffset(deltaS: number): string {
  const r = Math.round(deltaS);
  if (r === 0) return '0';
  return r > 0 ? `+${r}` : `${MINUS}${Math.abs(r)}`;
}

/** Signed seconds with one decimal, for the replay clock: "−6.0 s", "+1.5 s". */
export function formatClock(deltaS: number): string {
  const sign = deltaS < 0 ? MINUS : '+';
  return `${sign}${Math.abs(deltaS).toFixed(1)} s`;
}

/** "−8 s → +2 s": the model input window relative to the alarm onset. */
export function formatWindow(startRel: number, endRel: number): string {
  const one = (n: number) => {
    const body = Number.isInteger(n) ? String(Math.abs(n)) : Math.abs(n).toFixed(1);
    return `${n < 0 ? MINUS : '+'}${body}`;
  };
  return `${one(startRel)} s → ${one(endRel)} s`;
}

export function formatPercent(p: number): string {
  return `${Math.round(p * 100)}%`;
}

export function formatReceived(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

export const QUALITY_LABEL: Record<Quality, string> = {
  good: 'Good',
  degraded: 'Noisy',
  bad: 'Poor',
  absent: 'Absent',
};

export interface Readout {
  value: string;
  sub: string;
}

type ReadoutKind = 'hr' | 'pr' | 'abp';

const whole = (n: number) => String(Math.round(n));

/**
 * Big number beside a strip. `null` numerics are shown as a dash with a plain statement of what is
 * missing, never as a guess. A collapsed pulse (PR null) is the key true-VT cue.
 */
export function formatReadout(
  kind: ReadoutKind,
  numerics: Numerics | null,
  recorded: boolean,
): Readout {
  if (!recorded) return { value: DASH, sub: 'not recorded' };
  if (!numerics) return { value: DASH, sub: 'waiting for data' };
  switch (kind) {
    case 'hr':
      return numerics.hr_bpm === null
        ? { value: DASH, sub: 'HR not measurable' }
        : { value: whole(numerics.hr_bpm), sub: 'HR bpm' };
    case 'pr':
      return numerics.pr_bpm === null
        ? { value: DASH, sub: 'pulse not detected' }
        : { value: whole(numerics.pr_bpm), sub: 'PR bpm' };
    case 'abp':
      return numerics.abp_sys === null || numerics.abp_dia === null || numerics.abp_map === null
        ? { value: DASH, sub: 'not measurable' }
        : {
            value: `${whole(numerics.abp_sys)}/${whole(numerics.abp_dia)}`,
            sub: `MAP ${whole(numerics.abp_map)}`,
          };
  }
}
