// ============================================
// BOUNDED RING BUFFER
// ============================================
// A fixed-capacity buffer that overwrites its oldest entry when full, so a live
// feed can run for days without the heap growing. Reads return a plain array in
// insertion order (oldest first), which is the order every consumer wants.

export class RingBuffer<T> {
  private readonly buffer: (T | undefined)[];
  private readonly capacity: number;
  private nextIndex = 0;
  private filled = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('RingBuffer capacity must be a positive integer');
    }
    this.capacity = capacity;
    this.buffer = new Array<T | undefined>(capacity);
  }

  get size(): number {
    return this.filled;
  }

  push(item: T): void {
    this.buffer[this.nextIndex] = item;
    this.nextIndex = (this.nextIndex + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled += 1;
  }

  /** Everything held, oldest first. */
  toArray(): T[] {
    const out: T[] = [];
    const start = this.filled === this.capacity ? this.nextIndex : 0;
    for (let i = 0; i < this.filled; i += 1) {
      const value = this.buffer[(start + i) % this.capacity];
      if (value !== undefined) out.push(value);
    }
    return out;
  }

  /** The newest `count` items, oldest first. */
  last(count: number): T[] {
    if (count <= 0) return [];
    const all = this.toArray();
    return count >= all.length ? all : all.slice(all.length - count);
  }

  clear(): void {
    this.buffer.fill(undefined);
    this.nextIndex = 0;
    this.filled = 0;
  }
}
