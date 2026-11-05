import test from 'node:test';
import assert from 'node:assert/strict';
import { metersFromComment, metersFromLikes, metersFromShare } from '../src/game/RewardManager.js';
import { baseConfig, player } from './helpers.js';

const { rewards } = baseConfig().balance;

test('5 likes make 1 metre and leftovers carry over', () => {
  const p = player();
  assert.equal(metersFromLikes(p, 4, rewards), 0);
  assert.equal(metersFromLikes(p, 1, rewards), 1);
  assert.equal(metersFromLikes(p, 52, rewards), 10);
  assert.equal(p.likeRemainder, 2);
});

test('a comment pays once per cooldown', () => {
  const p = player();
  assert.equal(metersFromComment(p, 0, rewards), rewards.commentMeters);
  assert.equal(metersFromComment(p, rewards.commentCooldownSeconds - 0.1, rewards), 0);
  assert.equal(metersFromComment(p, rewards.commentCooldownSeconds, rewards), rewards.commentMeters);
});

test('share pays once per round', () => {
  const p = player();
  assert.equal(metersFromShare(p, rewards), rewards.shareMeters);
  assert.equal(metersFromShare(p, rewards), 0);
});
