import { describe, expect, it } from 'vitest';
import { RingBuffer } from './ringBuffer';

const dump = (rb: RingBuffer) => {
  const out = new Array<number | null>(rb.capacity).fill(-1);
  const n = rb.copyTo(out);
  return { n, out };
};

describe('RingBuffer', () => {
  it('stores samples in order and fills the rest with null', () => {
    const rb = new RingBuffer(5);
    rb.push([1, 2, 3]);
    expect(rb).toMatchObject({ length: 3, totalWritten: 3, firstIndex: 0 });
    expect(dump(rb)).toEqual({ n: 3, out: [1, 2, 3, null, null] });
  });

  it('turns missing samples (null / NaN) into gaps', () => {
    const rb = new RingBuffer(4);
    rb.push([1, null, Number.NaN, 4]);
    expect(dump(rb).out).toEqual([1, null, null, 4]);
  });

  it('overwrites the oldest samples once full and reports the new first index', () => {
    const rb = new RingBuffer(4);
    rb.push([1, 2, 3, 4]);
    rb.push([5, 6]);
    expect(rb).toMatchObject({ length: 4, totalWritten: 6, firstIndex: 2 });
    expect(dump(rb).out).toEqual([3, 4, 5, 6]);
    rb.push([7, 8, 9, 10, 11]); // more than a whole ring in one go
    expect(dump(rb).out).toEqual([8, 9, 10, 11]);
  });

  it('padTo leaves a gap for dropped samples and never moves backwards', () => {
    const rb = new RingBuffer(6);
    rb.push([1, 2]);
    rb.padTo(4);
    rb.push([5]);
    expect(dump(rb).out).toEqual([1, 2, null, null, 5, null]);
    rb.padTo(1);
    expect(rb.totalWritten).toBe(5);
  });

  it('padTo across more than a full ring just blanks it', () => {
    const rb = new RingBuffer(3);
    rb.push([1, 2, 3]);
    rb.padTo(100);
    rb.push([9]);
    expect(rb).toMatchObject({ totalWritten: 101, firstIndex: 98 });
    expect(dump(rb).out).toEqual([null, null, 9]);
  });

  it('clear forgets everything', () => {
    const rb = new RingBuffer(3);
    rb.push([1, 2, 3, 4]);
    rb.clear();
    expect(rb).toMatchObject({ length: 0, totalWritten: 0, firstIndex: 0 });
    expect(dump(rb).out).toEqual([null, null, null]);
  });

  it('rejects an invalid capacity', () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError);
    expect(() => new RingBuffer(2.5)).toThrow(RangeError);
  });

  it('handles a real-size strip (18 s at 250 Hz) fed in 64-sample chunks', () => {
    const rb = new RingBuffer(4500);
    const chunk = Array.from({ length: 64 }, (_, i) => i);
    for (let i = 0; i < 70; i++) rb.push(chunk);
    expect(rb.length).toBe(4480);
    expect(rb.firstIndex).toBe(0);
  });
});
