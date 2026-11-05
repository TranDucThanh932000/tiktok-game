import test from 'node:test';
import assert from 'node:assert/strict';
import { addBuff, communityBonus, expireBuffs, speedMultiplier, worstSlow } from '../src/game/BuffManager.js';
import { activateSkill } from '../src/game/SkillManager.js';
import { baseConfig, player } from './helpers.js';

const balance = baseConfig().balance;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} should be ${b}`);

test('swimming speed = base x (1 + community + current - slow)', () => {
  close(speedMultiplier({}, balance), 1);
  close(speedMultiplier({ community: 0.03, current: 0.02 }, balance), 1.05);
  close(speedMultiplier({ slow: 0.25 }, balance), 0.75);
});

test('slows never drop below the floor', () => {
  close(speedMultiplier({ slow: 0.9 }, balance), balance.minSpeedMultiplier);
});

test('the same buff refreshes instead of stacking', () => {
  const p = player();
  addBuff(p, { id: 'SUPER_TURBO', seconds: 5 }, 0);
  const { refreshed } = addBuff(p, { id: 'SUPER_TURBO', seconds: 5 }, 3);
  assert.equal(refreshed, true);
  assert.equal(p.activeBuffs.length, 1);
  assert.equal(p.activeBuffs[0].endsAt, 8);
});

test('only the worst slow applies', () => {
  const p = player();
  addBuff(p, { id: 'SLOW', kind: 'slow', slow: 0.25, seconds: 1 }, 0);
  addBuff(p, { id: 'SLOW2', kind: 'slow', slow: 0.15, seconds: 1 }, 0);
  close(worstSlow(p), 0.25);
});

test('buffs expire on time and a used shield disappears', () => {
  const p = player();
  activateSkill(p, 'SUPER_TURBO', 0, balance);
  activateSkill(p, 'SHIELD', 0, balance);
  assert.deepEqual(expireBuffs(p, balance.skills.SUPER_TURBO.seconds - 0.1), []);
  assert.deepEqual(expireBuffs(p, balance.skills.SUPER_TURBO.seconds), ['SUPER_TURBO']);
  p.activeBuffs[0].charges = 0;
  assert.deepEqual(expireBuffs(p, balance.skills.SUPER_TURBO.seconds + 1), ['SHIELD']);
});

test('community bonus never exceeds its cap', () => {
  const effects = [{ bonus: 0.03 }, { bonus: 0.05 }, { bonus: 0.03 }, { bonus: 0.03 }];
  close(communityBonus(effects, balance), balance.maxCommunityBonus);
});
