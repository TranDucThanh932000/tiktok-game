import { metersFromComment, metersFromLikes } from './RewardManager.js';

// House ducks, so the river is never empty on a quiet LIVE. They live only inside the game: nothing is ever sent to
// TikTok, and they stay out of the room's goal, the statistics and the champions table. Like a viewer, a bot only earns
// metres through the free rules (likes and comments); it never shares, sends gifts or wears a skin.

export const botEvent = (name, index) => ({ userId: `bot:${index}`, username: name, nickname: name, avatar: null, source: 'bot' });

// `count` different names in random order; if the list runs out, names come back with a number.
export function pickBotNames(names, count, random = Math.random) {
  const pool = [...names];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return Array.from({ length: count }, (_, i) => (i < pool.length ? pool[i] : `${pool[i % pool.length]} ${Math.floor(i / pool.length) + 1}`));
}

const between = (min, max, random) => min + random() * (max - min);

// Nothing about a bot is fixed, so no two rounds play out alike. The whole round has a mood (some rounds the bots are
// keen, some they are lazy), and every bot gets its own keenness, its own taste for comments over likes and its own
// idea of how close to dare behind the leading viewer.
export const roundMood = (rules, random = Math.random) => between(rules.moodMin, rules.moodMax, random);

export const newBotState = (rules, now, mood = 1, random = Math.random) => ({
  zeal: between(rules.zealMin, rules.zealMax, random) * mood,
  commentChance: between(rules.commentChanceMin, rules.commentChanceMax, random),
  marginMeters: between(rules.marginMin, rules.marginMax, random),
  nextAt: now + between(0.2, rules.gapSeconds * 3, random),
});

// Nobody taps at a steady beat: mostly an ordinary pause, sometimes a quick burst, sometimes a long silence.
function nextPause(random) {
  const roll = random();
  if (roll < 0.2) return between(0.15, 0.4, random);
  if (roll < 0.85) return between(0.6, 1.6, random);
  return between(2, 5, random);
}

// When its time has come, the bot taps a random number of likes or writes a comment. Returns the metres earned, which
// is 0 most ticks, and also when a comment comes too soon after the last one, as for any viewer.
export function botAct(player, now, { rules, rewards, alone }, random = Math.random) {
  const bot = player.bot;
  if (now < bot.nextAt) return 0;
  const zeal = bot.zeal * (alone ? rules.aloneBoost : 1);
  bot.nextAt = now + nextPause(random) * (rules.gapSeconds / zeal);
  if (random() < bot.commentChance) return metersFromComment(player, now, rewards);
  return metersFromLikes(player, 1 + Math.floor(random() * 30), rewards);
}
