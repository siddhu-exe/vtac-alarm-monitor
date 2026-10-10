export interface BackoffOptions {
  baseMs: number;
  capMs: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 500, capMs: 10_000 };

/**
 * Exponential backoff with "equal jitter": half the exponential delay is fixed, half is random,
 * so a restarted backend is not hit by every client at the same instant.
 * `attempt` is 0 for the first retry. `random` must return a value in [0, 1).
 */
export function backoffDelayMs(
  attempt: number,
  random: () => number,
  { baseMs, capMs }: BackoffOptions = DEFAULT_BACKOFF,
): number {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt));
  return Math.round(exp / 2 + random() * (exp / 2));
}
