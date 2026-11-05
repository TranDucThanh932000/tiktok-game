import test from 'node:test';
import assert from 'node:assert/strict';
import { CommunityManager } from '../src/game/CommunityManager.js';
import { baseConfig } from './helpers.js';

const { balance } = baseConfig();
const rules = balance.community;
const triggers = (out) => out.filter((h) => h.kind === 'trigger').map((h) => h.id);

test('wind needs 5 different sharers inside 30 s', () => {
  const c = new CommunityManager();
  ['a', 'b', 'c', 'd', 'd', 'd'].forEach((u, i) => c.addShare(u, i));
  assert.deepEqual(triggers(c.update(6, rules)), [], 'the same sharer counts once');
  c.addShare('e', 7);
  assert.deepEqual(triggers(c.update(7, rules)), ['wind']);
});

test('shares older than the window do not count', () => {
  const c = new CommunityManager();
  ['a', 'b', 'c', 'd'].forEach((u) => c.addShare(u, 0));
  c.addShare('e', 31);
  assert.deepEqual(triggers(c.update(31, rules)), []);
});

test('tsunami fires at 5000 likes, with milestones on the way', () => {
  const c = new CommunityManager();
  c.addLikes(2500, 1);
  assert.deepEqual(c.update(1, rules).map((h) => [h.kind, h.n]), [['milestone', 2]]);
  c.addLikes(2500, 2);
  assert.deepEqual(triggers(c.update(2, rules)), ['tsunami']);
  assert.equal(c.value('tsunami'), 0, 'the window restarts after firing');
});

test('cheer needs 100 comments from enough different accounts', () => {
  const c = new CommunityManager();
  for (let i = 0; i < 120; i++) c.addComment(`u${i % 5}`, 1);
  assert.deepEqual(triggers(c.update(1, rules)), [], 'only 5 accounts');
  for (let i = 0; i < 10; i++) c.addComment(`v${i}`, 2);
  assert.deepEqual(triggers(c.update(2, rules)), ['cheer']);
});

test('gift storm fires at the configured gift count', () => {
  const c = new CommunityManager();
  c.addGifts(rules.giftStorm.gifts - 1, 1);
  assert.deepEqual(triggers(c.update(1, rules)), []);
  c.addGifts(1, 2);
  assert.deepEqual(triggers(c.update(2, rules)), ['giftStorm']);
});

test('community events have a cooldown and a lifetime', () => {
  const c = new CommunityManager();
  c.addGifts(100, 0);
  assert.deepEqual(triggers(c.update(0, rules)), ['giftStorm']);
  c.addGifts(100, 1);
  assert.deepEqual(triggers(c.update(1, rules)), [], 'cooling down');
  assert.equal(c.active.length, 1);
  c.update(rules.giftStorm.seconds + 0.01, rules);
  assert.equal(c.active.length, 0, 'expired');
});

test('all four together stay under the 8% community cap', () => {
  const c = new CommunityManager();
  ['a', 'b', 'c', 'd', 'e'].forEach((u) => c.addShare(u, 0));
  c.addLikes(5000, 0);
  for (let i = 0; i < 100; i++) c.addComment(`u${i % 20}`, 0);
  c.addGifts(100, 0);
  assert.equal(triggers(c.update(0, rules)).length, 4);
  assert.equal(c.bonus(balance), balance.maxCommunityBonus);
});

test('disabled community events never fire', () => {
  const c = new CommunityManager();
  c.addGifts(100, 0);
  assert.deepEqual(triggers(c.update(0, { ...rules, enabled: false })), []);
});
