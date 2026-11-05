// Timed states live on player.activeBuffs as { id, kind, slow, startedAt, endsAt, charges }.
//   kind 'look'   – only changes how the duck is drawn, or lets it fly (WINGS)
//   kind 'slow'   – an obstacle hit, subtracts `slow` from the speed multiplier
//   kind 'shield' – absorbs one obstacle (charges)
// Times are game-clock seconds. Re-applying a buff with the same id refreshes it instead of stacking it.

export function addBuff(player, { id, kind = 'look', slow = 0, seconds, charges = 0 }, now) {
  const existing = player.activeBuffs.find((b) => b.id === id);
  if (existing) {
    existing.endsAt = Math.max(existing.endsAt, now + seconds);
    existing.slow = Math.max(existing.slow, slow);
    existing.charges = Math.max(existing.charges, charges);
    return { buff: existing, refreshed: true };
  }
  const buff = { id, kind, slow, startedAt: now, endsAt: now + seconds, charges };
  player.activeBuffs.push(buff);
  return { buff, refreshed: false };
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

// Slows do not stack: only the worst one applies.
export const worstSlow = (player) => player.activeBuffs.reduce((worst, b) => (b.kind === 'slow' ? Math.max(worst, b.slow) : worst), 0);

export function communityBonus(effects, balance) {
  const sum = effects.reduce((total, effect) => total + effect.bonus, 0);
  return Math.min(sum, balance.maxCommunityBonus);
}

// Swimming speed before any dash: baseSpeed × (1 + community + current − slow), never below minSpeedMultiplier.
export function speedMultiplier({ slow = 0, community = 0, current = 0 }, balance) {
  return Math.max(balance.minSpeedMultiplier, 1 + community + current - slow);
}
