import type { WebSocketLike } from '@/stream/ReplayClient';

/** Scriptable WebSocket stand-in. */
export class FakeSocket implements WebSocketLike {
  static instances: FakeSocket[] = [];
  static reset(): void {
    FakeSocket.instances = [];
  }
  static get last(): FakeSocket {
    const s = FakeSocket.instances.at(-1);
    if (!s) throw new Error('no socket created yet');
    return s;
  }

  readyState = 0;
  sent: unknown[] = [];
  closedByClient = false;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.closedByClient = true;
    this.readyState = 3;
  }

  // --- test controls ---
  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }
  push(msg: unknown): void {
    this.onmessage?.(
      new MessageEvent('message', { data: typeof msg === 'string' ? msg : JSON.stringify(msg) }),
    );
  }
  drop(code = 1006): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code }));
  }
}
