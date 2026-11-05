// FIFO between the event sources and the game loop. The game drains a fixed budget per tick so a flood of events
// never freezes the simulation. Likes from the same viewer that are still waiting are merged into one event,
// which keeps the queue short during like storms without losing a single like.
export class EventQueue {
  constructor({ maxSize = 10_000 } = {}) {
    this.maxSize = maxSize;
    this.items = [];
    this.head = 0;
    this.pendingLikes = new Map();
    this.stats = { pushed: 0, merged: 0, dropped: 0 };
  }

  get size() {
    return this.items.length - this.head;
  }

  push(event) {
    this.stats.pushed++;
    if (event.type === 'like') {
      const key = event.userId ?? '';
      const pending = this.pendingLikes.get(key);
      if (pending) {
        pending.count += event.count;
        this.stats.merged++;
        return true;
      }
    }
    // Gifts are real money and are never dropped; everything else gives way when the queue is full.
    if (this.size >= this.maxSize && event.type !== 'gift') {
      this.stats.dropped++;
      return false;
    }
    const item = event.type === 'like' ? { ...event } : event;
    if (item.type === 'like') this.pendingLikes.set(item.userId ?? '', item);
    this.items.push(item);
    return true;
  }

  drain(max = Infinity) {
    const end = Math.min(this.items.length, this.head + max);
    const out = this.items.slice(this.head, end);
    this.head = end;
    for (const event of out) {
      if (event.type === 'like' && this.pendingLikes.get(event.userId ?? '') === event) this.pendingLikes.delete(event.userId ?? '');
    }
    if (this.head > 1024 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return out;
  }

  clear() {
    this.items = [];
    this.head = 0;
    this.pendingLikes.clear();
  }
}
