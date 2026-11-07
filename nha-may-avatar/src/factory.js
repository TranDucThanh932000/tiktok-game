import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { EventDeduplicator } from '../../shared/event-deduplicator.mjs';
import { giftQuality, JOB_MS, LIKE_THRESHOLD, QUALITY_TIERS } from '../public/rules.js';

const clean = (value, max = 40) => Array.from(String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, max).join('');
const positiveCount = value => {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('Count must be a positive safe integer.');
  return value;
};

export class Factory extends EventEmitter {
  constructor({ now = Date.now, id = randomUUID, samples = null, sampleGapMs = 3000, random = Math.random } = {}) {
    super();
    this.now = now;
    this.id = id;
    this.samples = samples;
    this.samplesOn = Boolean(samples);
    this.sampleGapMs = sampleGapMs;
    this.random = random;
    this.idleSince = now();
    this.dedup = new EventDeduplicator({ now });
    this.credits = new Map();
    this.queue = [];
    this.active = null;
    this.history = [];
    this.activity = [];
    this.pausedAt = null;
    this.stats = {
      live: { likes: 0, gifts: 0, completed: 0 },
      demo: { likes: 0, gifts: 0, completed: 0 },
    };
  }

  record(text, kind = 'info', extra = {}) {
    this.activity.unshift({ id: this.id(), text, kind, at: this.now(), ...extra });
    this.activity.length = Math.min(this.activity.length, 12);
    if (kind === 'warning') this.emit('warning', text);
  }

  ingest(event) {
    if (!event || !['like', 'gift'].includes(event.type) || !['live', 'demo'].includes(event.source)) {
      throw new TypeError('Invalid event.');
    }
    const count = positiveCount(event.type === 'like' ? event.count : event.repeatCount);
    const gift = event.type === 'gift' ? giftQuality(event.diamonds, clean(event.giftName)) : null;
    if (!this.dedup.accept(event.eventId)) return { accepted: false, duplicate: true, tickets: 0 };
    this.stats[event.source][event.type === 'like' ? 'likes' : 'gifts'] += count;
    if (!event.userId) {
      this.record(`${count} ${event.type === 'like' ? 'likes' : 'gifts'}: no user ID. No turn added.`, 'warning');
      this.emit('change');
      return { accepted: true, tickets: 0, unidentified: true };
    }

    const key = `${event.source}:${event.userId}`;
    const viewer = {
      userId: clean(event.userId, 100),
      nickname: clean(event.nickname) || clean(event.username) || 'Guest',
      avatar: typeof event.avatar === 'string' ? event.avatar : '',
      source: event.source,
    };
    let tickets;
    let remainder = this.credits.get(key) ?? 0;
    if (event.type === 'like') {
      const accumulated = remainder + count;
      if (!Number.isSafeInteger(accumulated)) throw new RangeError('Like count is too large.');
      tickets = Math.floor(accumulated / LIKE_THRESHOLD);
      remainder = accumulated % LIKE_THRESHOLD;
      this.credits.set(key, remainder);
    } else {
      tickets = count;
      if (gift.unknownPrice) this.record(`${viewer.nickname}: no gift price. Using Rose quality.`, 'warning');
    }

    const quality = gift?.tier ?? QUALITY_TIERS[0];
    if (tickets) {
      this.queue.push({
        id: this.id(), viewer, quality,
        trigger: { type: event.type, name: gift?.name ?? `${LIKE_THRESHOLD} likes`, coins: gift?.coins ?? 0 },
        remaining: tickets, total: tickets,
      });
    }
    this.record(
      `${viewer.nickname} ${event.type === 'like' ? `+${count} likes` : `${gift.name} ×${count}`}`
      + (tickets ? ` · +${tickets} ${tickets === 1 ? 'turn' : 'turns'}` : ` · ${remainder}/${LIKE_THRESHOLD}`),
      event.type,
      { tier: gift?.tier.id, tickets },
    );
    this.startNext();
    this.emit('change');
    return { accepted: true, tickets, remainder };
  }

  startNext() {
    // Real turns never wait for a sample to finish.
    if (this.active?.viewer.source === 'sample' && this.queue.length && this.pausedAt === null) this.active = null;
    if (this.active || this.pausedAt !== null || !this.queue.length) return;
    const batch = this.queue[0];
    this.active = {
      id: this.id(), viewer: batch.viewer, quality: batch.quality, trigger: batch.trigger,
      batchIndex: batch.total - batch.remaining + 1, batchSize: batch.total,
      startedAt: this.now(),
    };
    batch.remaining -= 1;
    if (!batch.remaining) this.queue.shift();
  }

  // Keeps the machine busy in an empty room. A sample is no one's turn: no gift, no stats, no history.
  startSample() {
    if (!this.samplesOn || this.active || this.queue.length || this.pausedAt !== null) return false;
    const account = this.samples?.next();
    if (!account) return false;
    const tiers = QUALITY_TIERS.filter(tier => tier.id !== 'like');
    this.active = {
      id: this.id(), viewer: { ...account, source: 'sample' }, quality: tiers[Math.floor(this.random() * tiers.length)],
      trigger: { type: 'sample', name: 'Sample', coins: 0 },
      batchIndex: 1, batchSize: 1, startedAt: this.now(),
    };
    return true;
  }

  setSamples(on) {
    if (typeof on !== 'boolean') throw new TypeError('Samples must be true or false.');
    this.samplesOn = on && Boolean(this.samples);
    if (!on && this.active?.viewer.source === 'sample') this.active = null;
    this.idleSince = this.now();
    this.emit('change');
  }

  tick() {
    if (this.pausedAt !== null) return;
    if (this.active && this.now() - this.active.startedAt >= JOB_MS) {
      const sample = this.active.viewer.source === 'sample';
      if (!sample) {
        this.history.unshift({ ...this.active, finishedAt: this.now() });
        this.history.length = Math.min(this.history.length, 6);
        this.stats[this.active.viewer.source].completed += 1;
        this.idleSince = this.now();
      }
      this.active = null;
      this.startNext();
      if (sample) this.startSample();
      this.emit('change');
    } else if (!this.active && this.now() - this.idleSince >= this.sampleGapMs && this.startSample()) {
      this.emit('change');
    }
  }

  setPaused(paused) {
    if (typeof paused !== 'boolean') throw new TypeError('Pause must be true or false.');
    if (paused && this.pausedAt === null) this.pausedAt = this.now();
    else if (!paused && this.pausedAt !== null) {
      if (this.active) this.active.startedAt += this.now() - this.pausedAt;
      this.pausedAt = null;
      this.startNext();
    }
    this.emit('change');
  }

  clearDemo() {
    this.queue = this.queue.filter(batch => batch.viewer.source !== 'demo');
    if (this.active?.viewer.source === 'demo') this.active = null;
    this.history = this.history.filter(job => job.viewer.source !== 'demo');
    this.activity = [];
    this.stats.demo = { likes: 0, gifts: 0, completed: 0 };
    for (const key of this.credits.keys()) if (key.startsWith('demo:')) this.credits.delete(key);
    this.startNext();
    this.emit('change');
  }

  newLiveRoom() {
    for (const key of this.credits.keys()) if (key.startsWith('live:')) this.credits.delete(key);
    this.record('New LIVE: likes reset. Saved turns kept.');
    this.emit('change');
  }

  snapshot() {
    const now = this.now();
    const stats = Object.fromEntries(['likes', 'gifts', 'completed'].map(key => [key, this.stats.demo[key] + this.stats.live[key]]));
    return {
      now, paused: this.pausedAt !== null,
      active: this.active ? { ...this.active, elapsedMs: Math.max(0, (this.pausedAt ?? now) - this.active.startedAt) } : null,
      queue: this.queue.slice(0, 6),
      pending: this.queue.reduce((sum, batch) => sum + batch.remaining, 0),
      history: this.history, activity: this.activity, stats,
      samples: { on: this.samplesOn, total: this.samples?.size ?? 0 },
    };
  }
}
