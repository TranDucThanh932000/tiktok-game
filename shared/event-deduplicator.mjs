// Remembers event ids for a while so a callback fired twice, a reconnect replay or a double click in TEST MODE
// is processed once. Map keeps insertion order, so the oldest ids sit at the front and pruning is cheap.
export class EventDeduplicator {
  constructor({ ttlMs = 10 * 60_000, maxSize = 50_000, now = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.now = now;
    this.seen = new Map();
    this.duplicates = 0;
  }

  // True the first time an id shows up, false for a repeat inside the TTL. Events without an id are accepted.
  accept(id) {
    if (!id) return true;
    const now = this.now();
    this.prune(now);
    const expires = this.seen.get(id);
    if (expires !== undefined && expires > now) {
      this.duplicates++;
      return false;
    }
    this.seen.delete(id);
    this.seen.set(id, now + this.ttlMs);
    if (this.seen.size > this.maxSize) this.seen.delete(this.seen.keys().next().value);
    return true;
  }

  prune(now) {
    for (const [id, expires] of this.seen) {
      if (expires > now) break;
      this.seen.delete(id);
    }
  }

  get size() {
    return this.seen.size;
  }
}
