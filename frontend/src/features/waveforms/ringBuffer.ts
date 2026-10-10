/**
 * Fixed-capacity ring of samples in a Float32Array. Lives outside React: pushing a chunk never
 * allocates and never triggers a render. NaN marks a missing sample.
 */
export class RingBuffer {
  private readonly data: Float32Array;
  private written = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
    }
    this.data = new Float32Array(capacity);
  }

  /** Samples currently stored (never more than `capacity`). */
  get length(): number {
    return Math.min(this.written, this.capacity);
  }

  /** Samples pushed since the last clear (including ones already overwritten). */
  get totalWritten(): number {
    return this.written;
  }

  /** Absolute index (since clear) of the oldest stored sample; 0 until the ring wraps. */
  get firstIndex(): number {
    return this.written - this.length;
  }

  push(values: readonly (number | null)[]): void {
    const { data, capacity } = this;
    let w = this.written;
    for (const v of values) {
      data[w % capacity] = v ?? Number.NaN;
      w++;
    }
    this.written = w;
  }

  /** Fill with missing samples until `totalWritten === index` (no-op if already past it). */
  padTo(index: number): void {
    const { data, capacity } = this;
    let w = this.written;
    // more than a full ring of padding is indistinguishable from clearing it
    if (index - w >= capacity) {
      data.fill(Number.NaN);
      this.written = index;
      return;
    }
    for (; w < index; w++) data[w % capacity] = Number.NaN;
    this.written = Math.max(this.written, index);
  }

  /**
   * Copy the stored samples, oldest first, into `out` (NaN becomes null, which is how uPlot draws a
   * gap) and fill the rest of `out` with null. `out` must hold at least `capacity` entries.
   * Returns the number of stored samples.
   */
  copyTo(out: (number | null)[]): number {
    const { data, capacity } = this;
    const len = this.length;
    const start = this.written > capacity ? this.written % capacity : 0;
    for (let i = 0; i < len; i++) {
      const v = data[(start + i) % capacity] ?? Number.NaN;
      out[i] = Number.isNaN(v) ? null : v;
    }
    for (let i = len; i < capacity; i++) out[i] = null;
    return len;
  }

  clear(): void {
    this.written = 0;
  }
}
