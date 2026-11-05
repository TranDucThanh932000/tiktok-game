import { addBuff } from './BuffManager.js';

// Skills are data (balance.skills). They no longer change speed, that is what metres are for:
// SHIELD absorbs one obstacle, WINGS flies over obstacles, the others only change how the duck looks.
export function activateSkill(player, skillId, now, balance) {
  const skill = balance.skills[skillId];
  if (!skill) return { ok: false, reason: 'unknown' };
  if (skillId === 'SHIELD') {
    const { refreshed } = addBuff(player, { id: 'SHIELD', kind: 'shield', seconds: skill.seconds, charges: 1 }, now);
    return { ok: true, refreshed };
  }
  const { refreshed } = addBuff(player, { id: skillId, kind: 'look', seconds: skill.seconds }, now);
  return { ok: true, refreshed };
}

// A random skin, never the one the duck is already wearing, so every gift visibly changes something.
export function pickSkin(currentId, skins, random = Math.random) {
  const others = skins.filter((skin) => skin.id !== currentId);
  const pool = others.length ? others : skins;
  return pool[Math.floor(random() * pool.length)];
}

// The gift from the list on screen that this event is, matched by the name TikTok reports (in any letter case).
export function findListedGift(event, gifts) {
  const name = String(event.giftName ?? '').trim().toLowerCase();
  return name ? (gifts.list ?? []).find((gift) => gift.names.some((n) => n.toLowerCase() === name)) ?? null : null;
}

// Which logical gift tier a real gift belongs to: an explicit gift id mapping first (gifts.byId, filled by the
// streamer from the admin panel), then the list on screen, then the diamond value TikTok reports, then gifts.defaultTier.
export function resolveGiftTier(event, gifts) {
  const byId = gifts.byId?.[event.giftId];
  if (byId && gifts.tiers[byId]) return byId;
  const listed = findListedGift(event, gifts);
  if (listed) return listed.tier;
  if (event.diamonds > 0) {
    const rule = [...(gifts.byDiamonds ?? [])].sort((a, b) => b.min - a.min).find((r) => event.diamonds >= r.min);
    if (rule) return rule.tier;
  }
  return gifts.tiers[gifts.defaultTier] ? gifts.defaultTier : Object.keys(gifts.tiers)[0];
}
