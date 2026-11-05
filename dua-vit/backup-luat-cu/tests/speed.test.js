import test from 'node:test';
import assert from 'node:assert/strict';
import { addBuff, communityBonus, expireBuffs, personalBonus, speedMultiplier } from '../src/game/BuffManager.js';
import { activateSkill } from '../src/game/SkillManager.js';
import { baseConfig, player } from './helpers.js';

const balance = baseConfig().balance;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} should be ${b}`);

test('finalSpeed = base x (1 + personal + community)', () => {
  close(speedMultiplier({ boost: 0.12, community: 0.03 }, balance), 1.15);
  close(speedMultiplier({}, balance), 1);
});

test('total bonus is capped and slows never drop below the floor', () => {
  close(speedMultiplier({ boost: 0.25, community: 0.08 }, balance), 1.3);
  close(speedMultiplier({ slow: 0.9 }, balance), balance.minSpeedMultiplier);
});

test('different speed buffs stack with diminishing returns and a personal cap', () => {
  const p = player();
  addBuff(p, { id: 'TURBO', bonus: 0.12, seconds: 5 }, 0);
  close(personalBonus(p, balance).boost, 0.12);
  addBuff(p, { id: 'WINGS', bonus: 0.08, seconds: 5 }, 0);
  close(personalBonus(p, balance).boost, 0.16);
  addBuff(p, { id: 'SUPER_TURBO', bonus: 0.18, seconds: 5 }, 0);
  addBuff(p, { id: 'RAINBOW_BOOST', bonus: 0.2, seconds: 6 }, 0);
  close(personalBonus(p, balance).boost, balance.maxPersonalBonus);
});

test('the same buff refreshes instead of stacking', () => {
  const p = player();
  addBuff(p, { id: 'TURBO', bonus: 0.12, seconds: 5 }, 0);
  const { refreshed } = addBuff(p, { id: 'TURBO', bonus: 0.12, seconds: 5 }, 3);
  assert.equal(refreshed, true);
  assert.equal(p.activeBuffs.length, 1);
  assert.equal(p.activeBuffs[0].endsAt, 8);
  close(personalBonus(p, balance).boost, 0.12);
});

test('only the worst slow applies', () => {
  const p = player();
  addBuff(p, { id: 'SLOW', kind: 'slow', slow: 0.25, seconds: 1 }, 0);
  addBuff(p, { id: 'SLOW2', kind: 'slow', slow: 0.15, seconds: 1 }, 0);
  close(personalBonus(p, balance).slow, 0.25);
});

test('buffs expire on time and a used shield disappears', () => {
  const p = player();
  activateSkill(p, 'TURBO', 0, balance);
  activateSkill(p, 'SHIELD', 0, balance);
  assert.deepEqual(expireBuffs(p, 4.9), []);
  assert.deepEqual(expireBuffs(p, 5), ['TURBO']);
  p.activeBuffs[0].charges = 0;
  assert.deepEqual(expireBuffs(p, 6), ['SHIELD']);
});

test('community bonus never exceeds 8%', () => {
  const effects = [{ bonus: 0.03 }, { bonus: 0.05 }, { bonus: 0.03 }, { bonus: 0.03 }];
  close(communityBonus(effects, balance), 0.08);
});

test('skill cooldown blocks a second Rainbow Boost', () => {
  const p = player();
  assert.equal(activateSkill(p, 'RAINBOW_BOOST', 0, balance).ok, true);
  const again = activateSkill(p, 'RAINBOW_BOOST', 10, balance);
  assert.deepEqual([again.ok, again.reason], [false, 'cooldown']);
  assert.equal(activateSkill(p, 'RAINBOW_BOOST', 20, balance).ok, true);
});
