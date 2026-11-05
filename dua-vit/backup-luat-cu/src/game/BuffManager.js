// Personal buffs live on player.activeBuffs as { id, kind, bonus, slow, startedAt, endsAt, charges }.
//   kind 'speed'  – adds `bonus` to the speed multiplier
//   kind 'slow'   – an obstacle hit, subtracts `slow`
//   kind 'shield' – absorbs one obstacle (charges)
// Times are game-clock seconds. Re-applying a buff with the same id refreshes it instead of stacking it, and the
// sum of different speed buffs has diminishing returns plus a hard cap, so nobody can buy unlimited speed.

export function addBuff(player, { id, kind = 'speed', bonus = 0, slow = 0, seconds, charges = 0 }, now) {
  const existing = player.activeBuffs.find((b) => b.id === id);
  if (existing) {
    existing.endsAt = Math.max(existing.endsAt, now + seconds);
    existing.bonus = Math.max(existing.bonus, bonus);
    existing.slow = Math.max(existing.slow, slow);
    existing.charges = Math.max(existing.charges, charges);
    return { buff: existing, refreshed: true };
  }
  const buff = { id, kind, bonus, slow, startedAt: now, endsAt: now + seconds, charges };
  player.activeBuffs.push(buff);
  return { buff, refreshed: false };
}

export function removeBuff(player, id) {
  const i = player.activeBuffs.findIndex((b) => b.id === id);
  if (i >= 0) player.activeBuffs.splice(i, 1);
}

export const hasBuff = (player, id) => player.activeBuffs.some((b) => b.id === id);

// Drops expired buffs; returns the ids that ended so the renderer can fade them out.
export function expireBuffs(player, now) {
  const ended = [];
  player.activeBuffs = player.activeBuffs.filter((b) => {
    const alive = b.endsAt > now && (b.kind !== 'shield' || b.charges > 0);
    if (!alive) ended.push(b.id);
    return alive;
  });
  return ended;
}

// Strongest speed buff counts fully, every other one at `secondBuffWeight`; the total stops at maxPersonalBonus.
// Slows do not stack either: only the worst one applies.
export function personalBonus(player, balance) {
  const bonuses = player.activeBuffs.filter((b) => b.kind === 'speed').map((b) => b.bonus).sort((a, b) => b - a);
  const weight = balance.secondBuffWeight ?? 0.5;
  const raw = bonuses.reduce((sum, bonus, i) => sum + (i === 0 ? bonus : bonus * weight), 0);
  const slow = player.activeBuffs.reduce((worst, b) => (b.kind === 'slow' ? Math.max(worst, b.slow) : worst), 0);
  return { boost: Math.min(raw, balance.maxPersonalBonus), slow };
}

export function communityBonus(effects, balance) {
  const sum = effects.reduce((total, effect) => total + effect.bonus, 0);
  return Math.min(sum, balance.maxCommunityBonus);
}

// finalSpeed = baseSpeed × multiplier, with
// multiplier = 1 + min(personal + community, maxTotalBonus) + current − slow, clamped to [minSpeedMultiplier, 1 + maxTotalBonus].
export function speedMultiplier({ boost = 0, slow = 0, community = 0, current = 0 }, balance) {
  const bonus = Math.min(boost + community, balance.maxTotalBonus);
  const multiplier = 1 + bonus + current - slow;
  return Math.min(1 + balance.maxTotalBonus, Math.max(balance.minSpeedMultiplier, multiplier));
}
