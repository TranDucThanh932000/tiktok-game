export const LIKE_THRESHOLD = 50;
export const TIMING = Object.freeze({ prepareMs: 1000, drawMs: 9000, revealMs: 3500 });
export const JOB_MS = TIMING.prepareMs + TIMING.drawMs + TIMING.revealMs;

export const QUALITY_TIERS = Object.freeze([
  { id: 'like', label: 'Basic', columns: 24, minCoins: 0, color: '#7ebca9' },
  { id: 'rose', label: 'Clear', columns: 36, minCoins: 1, color: '#ee9d9d' },
  { id: 'heart', label: 'Sharp', columns: 52, minCoins: 5, color: '#b39cdb' },
  { id: 'pig', label: 'HD', columns: 72, minCoins: 10, color: '#dca853' },
]);

export const GIFT_PRESETS = Object.freeze([
  { id: 'rose', name: 'Rose', coins: 1, aliases: ['rose', 'hoa hồng'] },
  { id: 'heart', name: 'Heart', coins: 5, aliases: ['heart', 'finger heart', 'bắn tim'] },
  { id: 'pig', name: 'Lucky Pig', coins: 10, aliases: ['lucky pig', 'piggy', 'pig', 'heo', 'heo may mắn'] },
]);

export const DEMO_VIEWERS = Object.freeze([
  { userId: 'demo:miu', nickname: 'Mia', username: 'miu.miu', avatar: '/avatars/miu.svg' },
  { userId: 'demo:an', nickname: 'Alex', username: 'annhien', avatar: '/avatars/an.svg' },
  { userId: 'demo:bao', nickname: 'Milo', username: 'baoboi', avatar: '/avatars/bao.svg' },
]);

export function giftQuality(diamonds, name = '') {
  if (!Number.isFinite(diamonds) || diamonds < 0) throw new RangeError('Invalid gift price.');
  const known = GIFT_PRESETS.find(gift => gift.aliases.includes(name.trim().toLowerCase()));
  const coins = diamonds || known?.coins || 0;
  const tier = [...QUALITY_TIERS].reverse().find(item => item.minCoins <= Math.max(1, coins));
  return { tier, coins, name: known?.name ?? 'Gift', unknownPrice: coins === 0 };
}
