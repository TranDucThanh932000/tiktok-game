import { EventAdapter } from './EventAdapter.js';
import { createTikTokNormalizer } from './EventNormalizer.js';

// TEST MODE source. It builds payloads shaped like tiktok-live-connector's messages and feeds them through the
// same normalizer as the real adapter, so gift streaks, like totals and dedup are exercised exactly as on LIVE.
// Every event it produces carries source: 'mock' and ids prefixed "mock:", and is shown with a TEST tag.
export const MOCK_NAMES = [
  'minh123', 'lananh', 'hoang', 'tuankiet', 'ngocmai', 'baochau', 'ducanh', 'thuytien', 'khanhvy', 'quanghuy',
  'phuonglinh', 'giabao', 'myduyen', 'vietanh', 'haiyen', 'thanhdat', 'kimngan', 'trungkien', 'yennhi', 'minhthu',
];

export const MOCK_GIFTS = {
  small: { id: 'mock-small', name: 'Quà thử nhỏ', diamondCount: 1, type: 1 },
  medium: { id: 'mock-medium', name: 'Quà thử vừa', diamondCount: 30, type: 1 },
  large: { id: 'mock-large', name: 'Quà thử lớn', diamondCount: 199, type: 2 },
  special: { id: 'mock-special', name: 'Quà thử đặc biệt', diamondCount: 1000, type: 2 },
};

export function mockUser(nameOrIndex) {
  const name = typeof nameOrIndex === 'number' ? `${MOCK_NAMES[nameOrIndex % MOCK_NAMES.length]}${nameOrIndex >= MOCK_NAMES.length ? Math.floor(nameOrIndex / MOCK_NAMES.length) : ''}` : String(nameOrIndex);
  const clean = name.trim().replace(/^@/, '').slice(0, 24) || 'khachthu';
  return { id: `mock-${clean.toLowerCase()}`, displayId: clean, nickname: clean, avatarThumb: { urlList: [] } };
}

export class MockAdapter extends EventAdapter {
  constructor() {
    super('mock');
    this.normalizer = createTikTokNormalizer({ source: 'mock' });
    this.seq = 0;
    // The first like total only sets the normalizer's baseline, so prime it before any test like arrives.
    this.likeTotal = 1;
    this.normalizer.like({ count: 0, total: '1' });
    this.recent = [];
    this.outageUntil = 0;
    this.timers = new Set();
    this.setStatus(true, 'Mock Adapter sẵn sàng');
  }

  common() {
    return { msgId: `m${Date.now().toString(36)}${(++this.seq).toString(36)}`, createTime: String(Date.now()) };
  }

  // kind: 'comment' | 'like' | 'share' | 'gift'; raw: a connector-shaped payload.
  deliver(kind, raw) {
    if (Date.now() < this.outageUntil) return false;
    this.recent.push([kind, raw]);
    if (this.recent.length > 20) this.recent.shift();
    this.publish(this.normalizer[kind](raw));
    return true;
  }

  like(user, count = 1) {
    this.likeTotal += count;
    return this.deliver('like', { common: this.common(), user, count, total: String(this.likeTotal) });
  }

  // Likes that TikTok reports only through the room total (no user attached).
  anonymousLikes(count) {
    this.likeTotal += count;
    return this.deliver('like', { common: this.common(), user: undefined, count: 0, total: String(this.likeTotal) });
  }

  comment(user, text) {
    return this.deliver('comment', { common: this.common(), user, content: text });
  }

  share(user) {
    return this.deliver('share', { common: this.common(), user, shareType: '1' });
  }

  // A combo gift (type 1) arrives as several messages with a growing repeatCount, then a repeatEnd message.
  gift(user, gift, repeat = 1, { groupId = `g${++this.seq}`, repeatEnd = 1 } = {}) {
    return this.deliver('gift', { common: this.common(), user, giftId: gift.id, gift, repeatCount: repeat, repeatEnd, groupId });
  }

  giftStreak(user, gift, steps = [1, 3, 6, 10], everyMs = 300) {
    const groupId = `g${++this.seq}`;
    steps.forEach((repeat, i) => this.later(i * everyMs, () => this.gift(user, gift, repeat, { groupId, repeatEnd: 0 })));
    this.later(steps.length * everyMs, () => this.gift(user, gift, steps.at(-1), { groupId, repeatEnd: 1 }));
  }

  // Sends the last few payloads again with their original ids, as a flaky callback would.
  replay(count = 5) {
    const batch = this.recent.slice(-count);
    for (const [kind, raw] of batch) this.publish(this.normalizer[kind](raw));
    return batch.length;
  }

  // Mimics a dropped LIVE connection: events in the gap are lost, then the source reconnects and
  // re-delivers its last messages, which the deduplicator must ignore.
  disconnect(seconds = 8) {
    this.outageUntil = Date.now() + seconds * 1000;
    this.setStatus(false, `Mock: mất kết nối giả lập ${seconds} giây`);
    this.later(seconds * 1000, () => {
      this.setStatus(true, 'Mock: đã kết nối lại');
      this.replay(5);
    });
  }

  later(ms, fn) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
    return timer;
  }

  stop() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }
}
