import test from 'node:test';
import assert from 'node:assert/strict';
import { EventDeduplicator } from '../src/events/EventDeduplicator.js';
import { EventQueue } from '../src/events/EventQueue.js';
import { createTikTokNormalizer } from '../src/events/EventNormalizer.js';
import { resolveGiftTier } from '../src/game/SkillManager.js';
import { baseConfig } from './helpers.js';

const user = { id: '7001', displayId: 'minh123', nickname: 'Minh', avatarThumb: { urlList: ['https://p16.example/a.heic', 'https://p16.example/a.webp'] } };
let msg = 0;
const common = () => ({ msgId: String(++msg), createTime: String(Date.now()) });

test('deduplicator accepts an id once inside the TTL', () => {
  let now = 0;
  const d = new EventDeduplicator({ ttlMs: 1000, now: () => now });
  assert.equal(d.accept('a'), true);
  assert.equal(d.accept('a'), false);
  assert.equal(d.duplicates, 1);
  now = 1500;
  assert.equal(d.accept('a'), true);
});

test('deduplicator stays bounded', () => {
  const d = new EventDeduplicator({ maxSize: 100 });
  for (let i = 0; i < 1000; i++) d.accept(`id${i}`);
  assert.equal(d.size, 100);
});

test('queue merges waiting likes per user and never drops gifts', () => {
  const q = new EventQueue({ maxSize: 2 });
  q.push({ type: 'like', userId: 'a', count: 5 });
  q.push({ type: 'like', userId: 'a', count: 7 });
  q.push({ type: 'comment', userId: 'b' });
  assert.equal(q.push({ type: 'comment', userId: 'c' }), false);
  assert.equal(q.push({ type: 'gift', userId: 'd' }), true);
  const out = q.drain();
  assert.deepEqual(out.map((e) => e.type), ['like', 'comment', 'gift']);
  assert.equal(out[0].count, 12);
  q.push({ type: 'like', userId: 'a', count: 1 });
  assert.equal(q.drain()[0].count, 1, 'a drained like is not merged into');
});

test('normalizer maps users and refuses to invent identities', () => {
  const n = createTikTokNormalizer();
  const [e] = n.comment({ common: common(), user, content: 'Vịt ơi' });
  assert.deepEqual([e.type, e.userId, e.username, e.nickname, e.avatar], ['comment', '7001', 'minh123', 'Minh', 'https://p16.example/a.webp']);
  const [anon] = n.share({ common: common(), user: undefined });
  assert.equal(anon.userId, null);
});

test('normalizer counts only the increase of a gift streak', () => {
  const n = createTikTokNormalizer();
  const gift = { id: 5655, name: 'Rose', diamondCount: 1, type: 1 };
  const counts = [1, 3, 6, 6].map((repeat, i, all) =>
    n.gift({ common: common(), user, giftId: 5655, gift, repeatCount: repeat, repeatEnd: i === all.length - 1 ? 1 : 0, groupId: 'g1' }).reduce((s, e) => s + e.repeatCount, 0),
  );
  assert.deepEqual(counts, [1, 2, 3, 0]);
});

test('normalizer takes repeatCount as-is for non-combo gifts', () => {
  const n = createTikTokNormalizer();
  const [e] = n.gift({ common: common(), user, giftId: 1, gift: { name: 'Lion', diamondCount: 29999, type: 2 }, repeatCount: 2, repeatEnd: 1 });
  assert.equal(e.repeatCount, 2);
  assert.equal(e.diamonds, 29999);
});

test('like totals: the first total is a baseline, later gaps go to the community', () => {
  const n = createTikTokNormalizer();
  assert.deepEqual(n.like({ common: common(), user, count: 5, total: '1000' }).map((e) => [e.userId, e.count]), [['7001', 5]]);
  assert.deepEqual(n.like({ common: common(), user, count: 5, total: '1100' }).map((e) => [e.userId, e.count]), [['7001', 5], [null, 95]]);
  assert.deepEqual(n.like({ common: common(), user, count: 3, total: '1050' }).map((e) => [e.userId, e.count]), [['7001', 3]], 'an out-of-order total adds nothing');
});

test('the same payload delivered twice gets the same id', () => {
  const n = createTikTokNormalizer();
  const raw = { common: common(), user, content: 'GO' };
  const d = new EventDeduplicator();
  assert.equal(d.accept(n.comment(raw)[0].eventId), true);
  assert.equal(d.accept(n.comment(raw)[0].eventId), false);
  const noId = { user, content: 'GO', common: { createTime: '123' } };
  assert.equal(n.comment(noId)[0].eventId, n.comment(noId)[0].eventId);
});

test('gift tiers come from the id mapping first, then the diamond value', () => {
  const gifts = structuredClone(baseConfig().gifts);
  assert.equal(resolveGiftTier({ giftId: 'x', diamonds: 1 }, gifts), 'small');
  assert.equal(resolveGiftTier({ giftId: 'x', diamonds: 5 }, gifts), 'medium');
  assert.equal(resolveGiftTier({ giftId: 'x', diamonds: 98 }, gifts), 'large');
  assert.equal(resolveGiftTier({ giftId: 'x', diamonds: 5000 }, gifts), 'special');
  gifts.byId.x = 'large';
  assert.equal(resolveGiftTier({ giftId: 'x', diamonds: 1 }, gifts), 'large');
  assert.equal(resolveGiftTier({ giftId: 'y', diamonds: 0 }, gifts), 'small');
});
