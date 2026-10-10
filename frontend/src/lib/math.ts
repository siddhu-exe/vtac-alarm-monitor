export type Range = readonly [min: number, max: number];

const FIT_PAD = 0.1;
/** Shrink the range only when the data fills less than this share of it (avoids visual pumping). */
const SHRINK_BELOW = 0.5;
const FLAT_HALF_SPAN = 1;

/**
 * Y range for a strip: grows immediately when the data leaves it, shrinks only when the data
 * occupies well under half of it. Pure; `prev` is the range currently on screen.
 */
export function fitRange(prev: Range | null, dataMin: number, dataMax: number): Range {
  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
    return prev ?? [-FLAT_HALF_SPAN, FLAT_HALF_SPAN];
  }
  let lo = dataMin;
  let hi = dataMax;
  if (hi - lo < Number.EPSILON) {
    lo -= FLAT_HALF_SPAN;
    hi += FLAT_HALF_SPAN;
  }
  const pad = (hi - lo) * FIT_PAD;
  const target: Range = [lo - pad, hi + pad];
  if (!prev) return target;
  if (dataMin < prev[0] || dataMax > prev[1]) {
    return [Math.min(prev[0], target[0]), Math.max(prev[1], target[1])];
  }
  return target[1] - target[0] < SHRINK_BELOW * (prev[1] - prev[0]) ? target : prev;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
