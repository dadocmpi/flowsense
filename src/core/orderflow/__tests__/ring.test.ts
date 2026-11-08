import { describe, expect, it } from 'vitest';
import { RingBuffer } from '../ring';

describe('RingBuffer', () => {
  it('reads back in insertion order while it is filling', () => {
    const ring = new RingBuffer<number>(5);
    ring.push(1);
    ring.push(2);
    ring.push(3);
    expect(ring.size).toBe(3);
    expect(ring.toArray()).toEqual([1, 2, 3]);
  });

  it('overwrites the oldest entry once full, so memory is bounded', () => {
    const ring = new RingBuffer<number>(3);
    for (let i = 1; i <= 10; i += 1) ring.push(i);
    expect(ring.size).toBe(3);
    expect(ring.toArray()).toEqual([8, 9, 10]);
  });

  it('returns the newest N oldest-first', () => {
    const ring = new RingBuffer<number>(10);
    for (let i = 1; i <= 7; i += 1) ring.push(i);
    expect(ring.last(3)).toEqual([5, 6, 7]);
    expect(ring.last(100)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(ring.last(0)).toEqual([]);
  });

  it('rejects a non-positive capacity', () => {
    expect(() => new RingBuffer<number>(0)).toThrow();
  });

  it('clears back to empty', () => {
    const ring = new RingBuffer<number>(3);
    ring.push(1);
    ring.clear();
    expect(ring.size).toBe(0);
    expect(ring.toArray()).toEqual([]);
  });
});
