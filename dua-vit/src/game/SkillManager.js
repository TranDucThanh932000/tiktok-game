import { addBuff } from './BuffManager.js';

// Skills are data (balance.skills); this module only knows the three shapes they come in:
// SHIELD → a one-hit shield, WINGS → speed plus flying over obstacles, anything with a bonus → a speed buff.
export function activateSkill(player, skillId, now, balance) {
  const skill = balance.skills[skillId];
  if (!skill) return { ok: false, reason: 'unknown' };
  const readyAt = player.cooldowns[skillId] ?? 0;
  if (readyAt > now) return { ok: false, reason: 'cooldown', wait: readyAt - now };
  if (skill.cooldownSeconds > 0) player.cooldowns[skillId] = now + skill.cooldownSeconds;
  if (skillId === 'SHIELD') {
    const { refreshed } = addBuff(player, { id: 'SHIELD', kind: 'shield', seconds: skill.seconds, charges: 1 }, now);
    return { ok: true, refreshed };
  }
  const { refreshed } = addBuff(player, { id: skillId, kind: 'speed', bonus: skill.bonus ?? 0, seconds: skill.seconds }, now);
  return { ok: true, refreshed };
}

// Which logical gift tier a real gift belongs to: an explicit gift id mapping first (gifts.byId, filled by the
// streamer from the admin panel), then the diamond value TikTok reports, then gifts.defaultTier.
export function resolveGiftTier(event, gifts) {
  const byId = gifts.byId?.[event.giftId];
  if (byId && gifts.tiers[byId]) return byId;
  if (event.diamonds > 0) {
    const rule = [...(gifts.byDiamonds ?? [])].sort((a, b) => b.min - a.min).find((r) => event.diamonds >= r.min);
    if (rule) return rule.tier;
  }
  return gifts.tiers[gifts.defaultTier] ? gifts.defaultTier : Object.keys(gifts.tiers)[0];
}
