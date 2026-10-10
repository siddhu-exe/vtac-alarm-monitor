import { ApiError, type ApiClient } from '@/api/client';
import { computeView, type ViewSpan } from '@/config/view';
import type { AppStore } from '@/store';
import type { AlarmId, ReplaySpeed } from '@/types/domain';
import { ReplayClient, type ConnectionState, type SocketFactory } from './ReplayClient';
import type { ChunkMsg, ServerMsg, SessionMsg } from './schemas';
import { buildReplayUrl } from './url';

/** Receives the high-frequency data. Kept out of React state (see features/waveforms). */
export interface LiveSink {
  /** A replay session started (or restarted after a reconnect): drop old samples, size buffers. */
  reset: (session: SessionMsg, view: ViewSpan) => void;
  chunk: (msg: ChunkMsg) => void;
  /** The selection changed: blank the strips until the next session arrives. */
  clear: () => void;
}

export interface ControllerDeps {
  api: ApiClient;
  store: AppStore;
  live: LiveSink;
  /** VITE_WS_URL ("" = same origin). */
  wsUrl: string;
  location?: Pick<Location, 'protocol' | 'host'>;
  createSocket?: SocketFactory;
  now?: () => number;
  /** Pause between a replay ending and the next one starting (auto-advance). */
  advanceDelayMs?: number;
  random?: () => number;
}

export const STALE_FLOOR_MS = 3000;
const STALE_CHUNK_MULTIPLE = 10;
const STALE_MARGIN_MS = 2000;

/** Silence longer than this while playing means the stream is dead (see ReplayClient watchdog). */
export function staleAfterMs(chunkS: number, speed: number): number {
  const chunkWallMs = (chunkS * 1000) / speed;
  return Math.max(STALE_FLOOR_MS, chunkWallMs * STALE_CHUNK_MULTIPLE + STALE_MARGIN_MS);
}

export class ReplayController {
  private readonly client: ReplayClient;
  private readonly now: () => number;
  private readonly advanceDelayMs: number;
  private advanceTimer: ReturnType<typeof setTimeout> | null = null;
  private view: ViewSpan | null = null;

  constructor(private readonly deps: ControllerDeps) {
    this.now = deps.now ?? Date.now;
    this.advanceDelayMs = deps.advanceDelayMs ?? 1500;
    const loc = deps.location ?? window.location;
    this.client = new ReplayClient(
      {
        buildUrl: (req, speed) => buildReplayUrl(deps.wsUrl, req, speed, loc),
        staleAfterMs: (speed) =>
          staleAfterMs(deps.store.getState().modelInfo?.chunk_s ?? 0.256, speed),
        ...(deps.createSocket ? { createSocket: deps.createSocket } : {}),
        ...(deps.random ? { random: deps.random } : {}),
      },
      {
        onState: (state) => {
          this.onConnection(state);
        },
        onMessage: (msg) => {
          this.onMessage(msg);
        },
        onInvalid: ({ reason, detail }) => {
          if (reason !== 'unknown_type') this.state.noteInvalid(`${reason}: ${detail}`);
        },
      },
    );
  }

  private get state() {
    return this.deps.store.getState();
  }

  async bootstrap(): Promise<void> {
    this.state.setBootstrap({ status: 'loading' });
    try {
      const [model, alarms] = await Promise.all([this.deps.api.model(), this.deps.api.alarms()]);
      this.state.setBootstrapReady(model, alarms);
      const first = alarms[0];
      if (first) this.selectAlarm(first.alarm_id);
    } catch (e) {
      const kind = e instanceof ApiError ? e.kind : 'network';
      const message = e instanceof Error ? e.message : 'Unknown error';
      this.state.setBootstrap({ status: 'error', kind, message });
    }
  }

  selectAlarm(id: AlarmId): void {
    const { modelInfo, byId, playing, speed } = this.state;
    const alarm = byId[id];
    if (!modelInfo || !alarm) return;
    this.cancelAdvance();
    this.view = computeView(modelInfo);
    this.state.select(id);
    this.state.setSession(null);
    this.deps.live.clear();
    this.client.connect(
      { alarmId: id, startS: this.view.startS, endS: this.view.endS },
      { playing, speed },
    );
    if (!this.state.details[id]) {
      this.deps.api
        .alarm(id)
        .then((detail) => {
          this.state.setDetail(detail);
        })
        .catch(() => undefined); // labels fall back to slot names
    }
  }

  next(): void {
    this.step(1);
  }

  prev(): void {
    this.step(-1);
  }

  togglePlay(): void {
    const playing = !this.state.playing;
    this.state.setPlaying(playing);
    const { kind } = this.client.state;
    if (playing && (kind === 'ended' || kind === 'idle') && this.state.selectedId) {
      this.selectAlarm(this.state.selectedId); // replay the alarm from the start
    } else {
      this.client.setPlaying(playing);
      if (!playing) this.cancelAdvance();
    }
  }

  setSpeed(speed: ReplaySpeed): void {
    const max = this.state.modelInfo?.max_speed ?? speed;
    const clamped = Math.min(speed, max) as ReplaySpeed;
    this.state.setSpeed(clamped);
    this.client.setSpeed(clamped);
  }

  /** Recover from whichever failure is on screen. */
  retry(): void {
    if (this.state.bootstrap.status === 'error') void this.bootstrap();
    else this.client.retry();
  }

  dispose(): void {
    this.cancelAdvance();
    this.client.disconnect();
  }

  // ---------------------------------------------------------------------------------------
  private step(delta: 1 | -1): void {
    const { order, selectedId } = this.state;
    if (order.length === 0) return;
    const i = selectedId ? order.indexOf(selectedId) : -1;
    const id = order[(i + delta + order.length) % order.length];
    if (id) this.selectAlarm(id);
  }

  private onConnection(state: ConnectionState): void {
    this.state.setConnection(state);
  }

  private onMessage(msg: ServerMsg): void {
    switch (msg.type) {
      case 'session':
        this.state.setSession(msg);
        if (this.view) this.deps.live.reset(msg, this.view);
        break;
      case 'chunk':
        this.deps.live.chunk(msg);
        break;
      case 'verdict':
        this.state.addVerdict(msg, this.now());
        break;
      case 'end':
        this.scheduleAdvance();
        break;
      case 'state':
      case 'error':
        break; // transport acks need no action; terminal errors arrive as connection state
    }
  }

  private scheduleAdvance(): void {
    this.cancelAdvance();
    if (!this.state.autoAdvance) return;
    this.advanceTimer = setTimeout(() => {
      this.advanceTimer = null;
      const { playing, autoAdvance, order, selectedId, verdicts } = this.state;
      if (!playing || !autoAdvance || !selectedId) return;
      const from = order.indexOf(selectedId);
      const upcoming = [...order.slice(from + 1), ...order.slice(0, from)];
      const nextId = upcoming.find((id) => !(id in verdicts));
      if (nextId) this.selectAlarm(nextId);
    }, this.advanceDelayMs);
  }

  private cancelAdvance(): void {
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
  }
}
