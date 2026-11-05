// Energy bookkeeping for one player. Every function returns how much energy was really added, after the
// per-round free caps (like / comment / share / pickup) and the 0..max bar are applied.

function gain(player, amount, now, energy) {
  const room = Math.max(0, energy.max - player.energy);
  const added = Math.max(0, Math.min(amount, room));
  if (added > 0) {
    player.energy += added;
    player.lastEnergyAt = now;
  }
  return added;
}

function capped(player, source, amount, cap, now, energy) {
  const left = Math.max(0, cap - player.earned[source]);
  const added = gain(player, Math.min(amount, left), now, energy);
  player.earned[source] += added;
  return added;
}

// 10 likes = 1 energy (likesPerEnergy); leftover likes carry over to the next batch.
export function addLikes(player, count, now, energy) {
  player.likeRemainder += count;
  const whole = Math.floor(player.likeRemainder / energy.likesPerEnergy);
  player.likeRemainder -= whole * energy.likesPerEnergy;
  return whole > 0 ? capped(player, 'like', whole, energy.freeCaps.like, now, energy) : 0;
}

// A valid comment pays once per cooldown. Comments that land within comboWindow of the previous one build a combo:
// the multiplier only scales the comment reward (still under the comment cap), and every turboComboAt-th comment
// asks for a Turbo Combo, which the skill cooldown keeps from repeating too fast.
export function addComment(player, now, energy) {
  const rule = energy.comment;
  if (now - player.lastCommentAt < rule.cooldownSeconds) return { accepted: false, added: 0, combo: player.combo.count, comboTurbo: false };
  player.lastCommentAt = now;
  player.combo.count = now - player.combo.lastAt <= rule.comboWindowSeconds ? player.combo.count + 1 : 1;
  player.combo.lastAt = now;
  const step = [...rule.combo].sort((a, b) => b.count - a.count).find((c) => player.combo.count >= c.count);
  const multiplier = step?.multiplier ?? 1;
  const added = capped(player, 'comment', rule.amount * multiplier, energy.freeCaps.comment, now, energy);
  const comboTurbo = rule.turboComboAt > 0 && player.combo.count % rule.turboComboAt === 0;
  return { accepted: true, added, combo: player.combo.count, multiplier, comboTurbo };
}

// Only the first share of a round pays.
export function addShare(player, now, energy) {
  if (player.shared) return { accepted: false, added: 0 };
  player.shared = true;
  return { accepted: true, added: capped(player, 'share', energy.share.amount, energy.freeCaps.share, now, energy) };
}

export const addGift = (player, amount, now, energy) => gain(player, amount, now, energy);

export const addPickup = (player, amount, now, energy) => capped(player, 'pickup', amount, energy.pickupCap, now, energy);

// Decides whether the bar should fire an energy Turbo now. It fires the highest tier the bar has reached, after the
// bar has been quiet for chargeDelaySeconds (so a burst of gifts lands as one big Turbo), or right away when full or
// in the sprint. Never while an energy Turbo is running or cooling down. Returns the tier and consumes its energy.
export function takeTurbo(player, now, energy, { sprint = false, dump = false } = {}) {
  if (player.turboUntil > now || player.turboReadyAt > now) return null;
  const tiers = [...energy.turboTiers].sort((a, b) => b.energy - a.energy);
  let tier = tiers.find((t) => player.energy >= t.energy);
  if (!tier && dump && player.energy >= energy.sprintDump.minEnergy) {
    tier = { energy: player.energy, bonus: energy.sprintDump.bonus, seconds: energy.sprintDump.seconds, dump: true };
  }
  if (!tier) return null;
  const full = player.energy >= energy.max;
  const settled = now - player.lastEnergyAt >= energy.chargeDelaySeconds;
  if (!tier.dump && !full && !settled && !sprint) return null;
  player.energy = Math.max(0, player.energy - tier.energy);
  player.turboUntil = now + tier.seconds;
  player.turboReadyAt = player.turboUntil + energy.turboCooldownSeconds;
  return tier;
}
