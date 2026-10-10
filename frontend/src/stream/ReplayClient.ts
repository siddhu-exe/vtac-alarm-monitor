import { backoffDelayMs, DEFAULT_BACKOFF, type BackoffOptions } from './backoff';
import { ControlMsgSchema, parseServerMessage, type ControlMsg, type ServerMsg } from './schemas';
import type { ReplayRequest } from './url';

/** Minimal slice of the browser WebSocket that this client uses (so tests can fake it). */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
}
export type SocketFactory = (url: string) => WebSocketLike;

const WS_OPEN = 1;
/** Close codes the server uses for errors that retrying cannot fix (docs/api.md). */
const TERMINAL_CLOSE_CODES: ReadonlySet<number> = new Set([4400, 4404, 4503]);
/** A control error is informational; the replay carries on. */
const NON_TERMINAL_ERROR_CODES: ReadonlySet<string> = new Set(['bad_control']);

export type ConnectionState =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'open' }
  | { kind: 'reconnecting'; attempt: number; retryInMs: number }
  | { kind: 'ended' }
  | { kind: 'failed'; code: string; message: string; retryable: boolean };

export interface InvalidInfo {
  reason: 'malformed' | 'schema' | 'unknown_type';
  detail: string;
}

export interface ReplayHandlers {
  onState(state: ConnectionState): void;
  onMessage(msg: ServerMsg): void;
  onInvalid(info: InvalidInfo): void;
}

export interface ReplayClientOptions {
  buildUrl(req: ReplayRequest, speed: number): string;
  createSocket?: SocketFactory;
  backoff?: BackoffOptions;
  /** Give up (state `failed`, retryable) after this many consecutive failed reconnects. */
  maxAttempts?: number;
  /** How long without any message, while playing, before the stream is declared stale. */
  staleAfterMs(speed: number): number;
  random?: () => number;
}

export interface Transport {
  playing: boolean;
  speed: number;
}

/**
 * One replay stream with reconnect (exponential backoff + jitter) and a heartbeat watchdog.
 *
 * Reconnecting restarts the alarm's replay from `startS` (the server cannot resume mid-stream past
 * the alarm onset), so consumers must reset their buffers on every `session` message. The desired
 * transport (playing / speed) is re-applied after each reconnect.
 */
export class ReplayClient {
  private readonly createSocket: SocketFactory;
  private readonly backoff: BackoffOptions;
  private readonly maxAttempts: number;
  private readonly random: () => number;

  private generation = 0;
  private socket: WebSocketLike | null = null;
  private req: ReplayRequest | null = null;
  private desired: Transport = { playing: true, speed: 1 };
  private attempt = 0;
  private ended = false;
  private terminal: { code: string; message: string } | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private current: ConnectionState = { kind: 'idle' };

  constructor(
    private readonly opts: ReplayClientOptions,
    private readonly handlers: ReplayHandlers,
  ) {
    this.createSocket = opts.createSocket ?? ((url) => new WebSocket(url));
    this.backoff = opts.backoff ?? DEFAULT_BACKOFF;
    this.maxAttempts = opts.maxAttempts ?? 10;
    this.random = opts.random ?? Math.random;
  }

  get state(): ConnectionState {
    return this.current;
  }

  /** Start (or restart) streaming `req`. Any previous stream is dropped. */
  connect(req: ReplayRequest, transport: Transport): void {
    this.teardown();
    this.req = req;
    this.desired = { ...transport };
    this.attempt = 0;
    this.ended = false;
    this.terminal = null;
    this.setState({ kind: 'connecting' });
    this.open();
  }

  /** Manual retry after a `failed` state. */
  retry(): void {
    if (this.req) this.connect(this.req, this.desired);
  }

  disconnect(): void {
    this.teardown();
    this.req = null;
    this.setState({ kind: 'idle' });
  }

  setPlaying(playing: boolean): void {
    this.desired.playing = playing;
    this.sendControl({ type: 'control', action: playing ? 'resume' : 'pause' });
    this.armWatchdog();
  }

  setSpeed(speed: number): void {
    this.desired.speed = speed;
    this.sendControl({ type: 'control', action: 'speed', speed });
    this.armWatchdog();
  }

  // ---------------------------------------------------------------------------------------
  private setState(state: ConnectionState): void {
    this.current = state;
    this.handlers.onState(state);
  }

  private open(): void {
    if (!this.req) return;
    const gen = ++this.generation;
    const socket = this.createSocket(this.opts.buildUrl(this.req, this.desired.speed));
    this.socket = socket;
    socket.onopen = () => {
      if (gen !== this.generation) return;
      this.setState({ kind: 'open' });
      this.armWatchdog();
    };
    socket.onmessage = (ev) => {
      if (gen === this.generation) this.receive(ev.data);
    };
    socket.onclose = (ev) => {
      if (gen === this.generation) this.closed(ev.code);
    };
    socket.onerror = null; // a close event always follows an error
  }

  private receive(raw: unknown): void {
    this.armWatchdog();
    const parsed = parseServerMessage(raw);
    if (!parsed.ok) {
      this.handlers.onInvalid({ reason: parsed.reason, detail: parsed.detail });
      return;
    }
    const msg = parsed.msg;
    if (msg.type === 'session') {
      this.attempt = 0; // a working stream, not just an open socket
      if (!this.desired.playing) this.sendControl({ type: 'control', action: 'pause' });
    } else if (msg.type === 'error' && !NON_TERMINAL_ERROR_CODES.has(msg.code)) {
      this.terminal = { code: msg.code, message: msg.message };
    } else if (msg.type === 'end') {
      this.ended = true;
    }
    this.handlers.onMessage(msg);
    if (msg.type === 'end') {
      this.clearWatchdog();
      this.setState({ kind: 'ended' });
    }
  }

  private closed(code: number): void {
    this.clearWatchdog();
    this.socket = null;
    if (this.ended) return; // normal close after `end`
    if (this.terminal || TERMINAL_CLOSE_CODES.has(code)) {
      const t = this.terminal ?? {
        code: String(code),
        message: `Server closed the stream (${code})`,
      };
      this.setState({ kind: 'failed', code: t.code, message: t.message, retryable: false });
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.attempt += 1;
    if (this.attempt > this.maxAttempts) {
      this.setState({
        kind: 'failed',
        code: 'unreachable',
        message: 'The backend stopped responding.',
        retryable: true,
      });
      return;
    }
    const delay = backoffDelayMs(this.attempt - 1, this.random, this.backoff);
    this.setState({ kind: 'reconnecting', attempt: this.attempt, retryInMs: delay });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
  }

  /** Heartbeat: while playing, silence for longer than `staleAfterMs` means the stream is dead. */
  private armWatchdog(): void {
    this.clearWatchdog();
    if (this.socket?.readyState !== WS_OPEN || !this.desired.playing || this.ended) {
      return;
    }
    this.watchdog = setTimeout(() => {
      this.watchdog = null;
      this.generation += 1; // ignore the dying socket's events
      const dead = this.socket;
      this.socket = null;
      dead?.close();
      this.scheduleReconnect();
    }, this.opts.staleAfterMs(this.desired.speed));
  }

  private clearWatchdog(): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  private sendControl(msg: ControlMsg): void {
    const valid = ControlMsgSchema.parse(msg);
    if (this.socket?.readyState === WS_OPEN) this.socket.send(JSON.stringify(valid));
  }

  private teardown(): void {
    this.generation += 1;
    this.clearWatchdog();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const old = this.socket;
    this.socket = null;
    if (old) {
      old.onopen = old.onmessage = old.onclose = old.onerror = null;
      old.close();
    }
  }
}
