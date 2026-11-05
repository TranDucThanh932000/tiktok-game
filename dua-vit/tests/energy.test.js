import test from 'node:test';
import assert from 'node:assert/strict';
import { addComment, addGift, addLikes, addShare, takeTurbo } from '../src/game/EnergyManager.js';
import { baseConfig, player } from './helpers.js';

const energy = baseConfig().balance.energy;

test('10 likes make 1 energy and leftovers carry over', () => {
  const p = player();
  assert.equal(addLikes(p, 9, 0, energy), 0);
  assert.equal(addLikes(p, 1, 0, energy), 1);
  assert.equal(addLikes(p, 105, 0, energy), 10);
  assert.equal(p.likeRemainder, 5);
});

test('likes give at most 20 energy per round', () => {
  const p = player();
  assert.equal(addLikes(p, 10_000, 0, energy), 20);
  assert.equal(addLikes(p, 1000, 0, energy), 0);
  assert.equal(p.energy, 20);
});

test('comment pays 3 energy once per 5 s cooldown', () => {
  const p = player();
  assert.equal(addComment(p, 0, energy).added, 3);
  assert.equal(addComment(p, 2, energy).accepted, false);
  assert.equal(addComment(p, 5, energy).accepted, true);
});

test('comment combo scales the comment reward x1.2 then x1.5 and stays under the 15 cap', () => {
  const p = player();
  const rewards = [0, 6, 12, 18, 24, 30].map((t) => addComment(p, t, energy));
  assert.deepEqual(rewards.map((r) => r.combo), [1, 2, 3, 4, 5, 6]);
  assert.equal(rewards[0].added, 3);
  assert.ok(Math.abs(rewards[1].added - 3.6) < 1e-9);
  assert.ok(Math.abs(rewards[2].added - 4.5) < 1e-9);
  assert.equal(rewards[4].comboTurbo, true);
  assert.equal(p.earned.comment, 15);
});

test('combo resets after the combo window', () => {
  const p = player();
  addComment(p, 0, energy);
  assert.equal(addComment(p, 6, energy).combo, 2);
  assert.equal(addComment(p, 60, energy).combo, 1);
});

test('share pays once per round', () => {
  const p = player();
  assert.equal(addShare(p, 0, energy).added, 10);
  assert.equal(addShare(p, 1, energy).accepted, false);
});

test('energy bar never exceeds max', () => {
  const p = player();
  assert.equal(addGift(p, 80, 0, energy), 80);
  assert.equal(addGift(p, 50, 0, energy), 20);
  assert.equal(p.energy, 100);
});

test('turbo fires the highest reached tier once energy settles, and never twice at once', () => {
  const p = player();
  addGift(p, 60, 10, energy);
  assert.equal(takeTurbo(p, 10.5, energy), null, 'still charging');
  const tier = takeTurbo(p, 12, energy);
  assert.equal(tier.energy, 50);
  assert.equal(tier.bonus, 0.1);
  assert.equal(p.energy, 10);
  addGift(p, 40, 12, energy);
  assert.equal(takeTurbo(p, 14, energy), null, 'a turbo is already running');
  assert.equal(takeTurbo(p, 16.5, energy), null, 'cooldown after the turbo');
  assert.equal(takeTurbo(p, 17.1, energy).energy, 50);
});

test('a full bar fires the 100 tier right away', () => {
  const p = player();
  addGift(p, 100, 0, energy);
  const tier = takeTurbo(p, 0, energy);
  assert.deepEqual([tier.bonus, tier.seconds, p.energy], [0.2, 6, 0]);
});

test('sprint dump spends leftover energy below the first tier', () => {
  const p = player();
  addGift(p, 12, 0, energy);
  assert.equal(takeTurbo(p, 5, energy), null);
  const tier = takeTurbo(p, 5, energy, { sprint: true, dump: true });
  assert.equal(tier.dump, true);
  assert.equal(p.energy, 0);
});
