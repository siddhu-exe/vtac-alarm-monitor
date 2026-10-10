import type { ViewSpan } from '@/config/view';
import type { LiveSink } from '@/stream/controller';
import type { ChunkMsg, Numerics, Quality, SessionMsg } from '@/stream/schemas';
import { RingBuffer } from './ringBuffer';

/** Readouts and quality badges change slowly; re-render subscribers at most this often. */
const VALUE_NOTIFY_MS = 250;
const CLOCK_RESOLUTION = 10; // clock snapshot is rounded to 0.1 s

export interface ChannelBuffer {
  readonly ring: RingBuffer;
  readonly fs: number;
  /** Segment time of absolute sample index 0. */
  readonly startS: number;
  /** Bumped on every write; strips redraw when it changes. */
  version: number;
}

/**
 * Per-session sample store for the waveform strips: typed-array rings, quality, numerics and the
 * replay clock. It is plain mutable state outside React; React only sees the slow `subscribeValues`
 * notifications and the strips only see `onData` (coalesced into animation frames).
 */
export class LiveBuffers implements LiveSink {
  /** Bumped on reset / clear so strips know to drop what they have drawn. */
  epoch = 0;
  view: ViewSpan | null = null;

  private readonly channels = new Map<string, ChannelBuffer>();
  private qualityBySlot: Readonly<Record<string, Quality>> = {};
  private latestNumerics: Numerics | null = null;
  private clockS = 0;

  private readonly dataListeners = new Set<() => void>();
  private readonly valueListeners = new Set<() => void>();
  private valueTimer: ReturnType<typeof setTimeout> | null = null;

  // --- LiveSink ----------------------------------------------------------------------------
  reset = (session: SessionMsg, view: ViewSpan): void => {
    this.channels.clear();
    const span = view.endS - view.startS;
    for (const slot of session.channels) {
      const fs = session.fs[slot];
      if (!fs) continue;
      this.channels.set(slot, {
        ring: new RingBuffer(Math.max(1, Math.round(span * fs))),
        fs,
        startS: view.startS,
        version: 0,
      });
    }
    this.view = view;
    this.qualityBySlot = {};
    this.latestNumerics = null;
    this.clockS = view.startS;
    this.epoch += 1;
    this.emitData();
    this.emitValues(true);
  };

  chunk = (msg: ChunkMsg): void => {
    for (const [slot, values] of Object.entries(msg.channels)) {
      const ch = this.channels.get(slot);
      if (!ch) continue;
      const first = Math.round((msg.t0 - ch.startS) * ch.fs);
      const written = ch.ring.totalWritten;
      if (first + values.length <= written) continue; // already have all of it
      if (first > written) ch.ring.padTo(first); // dropped samples show as a gap
      ch.ring.push(first < written ? values.slice(written - first) : values);
      ch.version += 1;
      this.clockS = Math.max(this.clockS, ch.startS + ch.ring.totalWritten / ch.fs);
    }
    if (this.qualityChanged(msg.quality)) this.qualityBySlot = { ...msg.quality };
    if (msg.numerics) this.latestNumerics = msg.numerics;
    this.emitData();
    this.emitValues(false);
  };

  clear = (): void => {
    this.channels.clear();
    this.view = null;
    this.qualityBySlot = {};
    this.latestNumerics = null;
    this.epoch += 1;
    this.emitData();
    this.emitValues(true);
  };

  // --- reads -------------------------------------------------------------------------------
  channel(slot: string): ChannelBuffer | undefined {
    return this.channels.get(slot);
  }

  /** Slots that have a buffer (i.e. were recorded) in the current session. */
  get recordedSlots(): string[] {
    return [...this.channels.keys()];
  }

  /** Stable until quality actually changes, so it is safe as a useSyncExternalStore snapshot. */
  getQualityMap = (): Readonly<Record<string, Quality>> => this.qualityBySlot;

  getNumerics = (): Numerics | null => this.latestNumerics;

  /** Replay clock in segment seconds, rounded to 0.1 s. */
  getClockS = (): number => Math.round(this.clockS * CLOCK_RESOLUTION) / CLOCK_RESOLUTION;

  // --- subscriptions -----------------------------------------------------------------------
  /** Fires synchronously on every change; the frame scheduler coalesces it. */
  onData = (listener: () => void): (() => void) => {
    this.dataListeners.add(listener);
    return () => {
      this.dataListeners.delete(listener);
    };
  };

  /** Throttled (<= 4 Hz) notifications for React readouts. */
  subscribeValues = (listener: () => void): (() => void) => {
    this.valueListeners.add(listener);
    return () => {
      this.valueListeners.delete(listener);
    };
  };

  dispose(): void {
    if (this.valueTimer) clearTimeout(this.valueTimer);
    this.valueTimer = null;
    this.dataListeners.clear();
    this.valueListeners.clear();
  }

  // ---------------------------------------------------------------------------------------
  private qualityChanged(next: Readonly<Record<string, Quality>>): boolean {
    const keys = Object.keys(next);
    return (
      keys.length !== Object.keys(this.qualityBySlot).length ||
      keys.some((k) => next[k] !== this.qualityBySlot[k])
    );
  }

  private emitData(): void {
    for (const l of this.dataListeners) l();
  }

  private emitValues(immediate: boolean): void {
    if (immediate) {
      if (this.valueTimer) clearTimeout(this.valueTimer);
      this.valueTimer = null;
      for (const l of this.valueListeners) l();
      return;
    }
    if (this.valueTimer) return;
    this.valueTimer = setTimeout(() => {
      this.valueTimer = null;
      for (const l of this.valueListeners) l();
    }, VALUE_NOTIFY_MS);
  }
}
