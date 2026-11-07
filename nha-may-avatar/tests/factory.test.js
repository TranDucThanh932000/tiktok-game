import test from 'node:test';
import assert from 'node:assert/strict';
import { Factory } from '../src/factory.js';
import { giftQuality, JOB_MS, QUALITY_TIERS, TIMING } from '../public/rules.js';
import { coverRect, makeBeads } from '../public/portrait.js';

let eventId = 0;
const like = (count, userId = 'a', source = 'live') => ({ type: 'like', source, eventId: String(++eventId), userId, nickname: 'Miu', count, avatar: '/avatars/miu.svg' });
const gift = (diamonds = 1, repeatCount = 1, userId = 'a', source = 'live') => ({ ...like(1, userId, source), type: 'gift', diamonds, repeatCount, giftName: 'Gift' });

test('49 individual likes do not draw, the 50th creates exactly one 24x24 portrait', () => {
  const factory = new Factory();
  assert.equal(factory.ingest(like(49)).tickets, 0);
  assert.equal(factory.snapshot().active, null);
  assert.deepEqual(factory.ingest(like(1)), { accepted: true, tickets: 1, remainder: 0 });
  assert.equal(factory.snapshot().active.quality.columns, 24);
  assert.equal(factory.snapshot().stats.likes, 50);
});

test('credits are per account ID, preserve remainders, and do not use room totals', () => {
  const factory = new Factory();
  factory.ingest({ ...like(49), total: 100000 });
  factory.ingest(like(49, 'b'));
  assert.equal(factory.snapshot().active, null);
  factory.ingest(like(102));
  assert.equal(factory.snapshot().pending, 2);
  assert.equal(factory.ingest(like(49)).tickets, 1);
  assert.equal(factory.ingest(like(1, 'b')).tickets, 1);
});

test('one rose combo x10 creates ten 36x36 turns, not a 10-coin quality upgrade', () => {
  let now = 0;
  const factory = new Factory({ now: () => now });
  factory.ingest(gift(1, 10));
  assert.equal(factory.snapshot().pending, 9);
  for (let turn = 0; turn < 10; turn += 1) {
    assert.equal(factory.snapshot().active.quality.columns, 36);
    assert.equal(factory.snapshot().active.batchIndex, turn + 1);
    now += JOB_MS;
    factory.tick();
  }
  assert.equal(factory.snapshot().active, null);
  assert.equal(factory.snapshot().pending, 0);
  assert.equal(factory.snapshot().stats.completed, 10);
  assert.equal(factory.snapshot().stats.gifts, 10);
});

test('gift value selects the exact 1/5/10 coin thresholds including unlisted gifts', () => {
  for (const [coins, columns] of [[1, 36], [4, 36], [5, 52], [9, 52], [10, 72], [100, 72]]) {
    const factory = new Factory();
    factory.ingest(gift(coins));
    assert.equal(factory.snapshot().active.quality.columns, columns);
  }
  assert.equal(giftQuality(0, 'Finger Heart').tier.columns, 52);
  assert.equal(giftQuality(0, 'Heo may mắn').tier.columns, 72);
  const factory = new Factory();
  factory.ingest(gift(0));
  assert.ok(factory.snapshot().activity.some(item => item.kind === 'warning'));
});

test('duplicates add no tickets and unknown identities are explicitly reported', () => {
  const factory = new Factory();
  const event = gift(5, 2);
  factory.ingest(event);
  assert.equal(factory.ingest(event).duplicate, true);
  assert.equal(factory.snapshot().pending, 1);
  assert.equal(factory.snapshot().stats.gifts, 2);
  const result = factory.ingest(like(50, null));
  assert.equal(result.unidentified, true);
  assert.equal(result.tickets, 0);
  assert.equal(factory.snapshot().activity[0].kind, 'warning');
});

test('pausing freezes a portrait and queues interactions without losing time', () => {
  let now = 0;
  const factory = new Factory({ now: () => now });
  factory.ingest(gift(10));
  now = 4000;
  factory.setPaused(true);
  now = 50000;
  factory.ingest(like(50, 'b'));
  factory.tick();
  assert.equal(factory.snapshot().active.elapsedMs, 4000);
  assert.equal(factory.snapshot().pending, 1);
  factory.setPaused(false);
  now += JOB_MS - 4000;
  factory.tick();
  assert.equal(factory.snapshot().stats.completed, 1);
  assert.equal(factory.snapshot().active.viewer.userId, 'b');
});

test('connecting removes only demo work; a new room resets live like remainders, not earned turns', () => {
  const factory = new Factory();
  factory.ingest(gift(10, 2, 'demo:a', 'demo'));
  factory.ingest(like(49, 'real'));
  factory.ingest(gift(5, 2, 'real'));
  factory.clearDemo();
  assert.equal(factory.snapshot().active.viewer.source, 'live');
  assert.equal(factory.snapshot().pending, 1);
  assert.equal(factory.snapshot().stats.gifts, 2);
  factory.newLiveRoom();
  assert.equal(factory.ingest(like(1, 'real')).tickets, 0);
  assert.equal(factory.snapshot().pending, 1);
});

test('bad events fail explicitly rather than creating empty or infinite jobs', () => {
  const factory = new Factory();
  for (const count of [0, -1, Infinity, NaN, 1.5]) assert.throws(() => factory.ingest(like(count)), RangeError);
  assert.throws(() => factory.ingest({ ...like(1), type: 'chat' }), TypeError);
  assert.throws(() => factory.ingest(gift(-1)), RangeError);
  assert.throws(() => factory.setPaused('false'), TypeError);
  assert.equal(factory.snapshot().active, null);
});

test('all qualities produce exactly N squared colored beads and share the same 9-second drawing time', () => {
  assert.equal(TIMING.drawMs, 9000);
  assert.deepEqual(QUALITY_TIERS.map(tier => tier.columns ** 2), [576, 1296, 2704, 5184]);
  for (const tier of QUALITY_TIERS) {
    const pixels = new Uint8ClampedArray(tier.columns ** 2 * 4);
    for (let index = 0; index < pixels.length; index += 4) pixels.set([31, 142, 219, 255], index);
    const beads = makeBeads(pixels, tier.columns);
    assert.equal(beads.length, tier.columns ** 2);
    assert.deepEqual(beads[0].color, [31, 142, 219]);
    assert.ok(beads.every(bead => bead.x > 22 && bead.x < 322 && bead.y > 62 && bead.y < 362));
    assert.equal(beads[0].row, tier.columns - 1);
    assert.equal(beads.at(-1).row, 0);
  }
});

test('image sampling preserves pixel locations, blends transparency and crops without stretching', () => {
  const beads = makeBeads(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0]), 2);
  assert.deepEqual(beads.find(bead => bead.row === 0 && bead.col === 0).color, [255, 0, 0]);
  assert.deepEqual(beads.find(bead => bead.row === 1 && bead.col === 1).color, [250, 250, 250]);
  assert.deepEqual(coverRect(400, 200), { x: 100, y: 0, size: 200 });
  assert.deepEqual(coverRect(200, 400), { x: 0, y: 100, size: 200 });
  assert.throws(() => coverRect(0, 10));
  assert.throws(() => makeBeads([], 72));
});
