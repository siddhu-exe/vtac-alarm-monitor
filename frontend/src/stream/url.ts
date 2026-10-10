export interface ReplayRequest {
  alarmId: string;
  /** Seconds from segment start. The server requires start_s <= alarm onset. */
  startS: number;
  endS: number;
}

/**
 * `wsOrigin` is VITE_WS_URL ("" = same origin as the page, which the dev server proxies at /ws).
 */
export function buildReplayUrl(
  wsOrigin: string,
  req: ReplayRequest,
  speed: number,
  loc: Pick<Location, 'protocol' | 'host'>,
): string {
  const origin = wsOrigin || `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}`;
  const q = new URLSearchParams({
    speed: String(speed),
    start_s: String(req.startS),
    end_s: String(req.endS),
  });
  return `${origin}/ws/replay/${encodeURIComponent(req.alarmId)}?${q.toString()}`;
}
