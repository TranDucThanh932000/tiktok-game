import { communityBonus } from './BuffManager.js';

// The four river-wide events. Each one watches a sliding window of game-clock time, fires once its threshold is
// met, then empties its window and waits out a cooldown, so community buffs never chain or stack without end.
export const COMMUNITY_EVENTS = ['wind', 'tsunami', 'cheer', 'giftStorm'];

class Window {
  constructor() {
    this.items = [];
    this.sum = 0;
    this.users = new Map();
  }

  add(t, amount = 1, userId = null) {
    this.items.push([t, amount, userId]);
    this.sum += amount;
    if (userId) this.users.set(userId, (this.users.get(userId) ?? 0) + 1);
  }

  prune(now, seconds) {
    let i = 0;
    while (i < this.items.length && now - this.items[i][0] > seconds) {
      const [, amount, userId] = this.items[i++];
      this.sum -= amount;
      if (userId) {
        const left = this.users.get(userId) - 1;
        if (left > 0) this.users.set(userId, left);
        else this.users.delete(userId);
      }
    }
    if (i) this.items.splice(0, i);
  }

  clear() {
    this.items = [];
    this.sum = 0;
    this.users.clear();
  }
}

export class CommunityManager {
  constructor() {
    this.windows = Object.fromEntries(COMMUNITY_EVENTS.map((id) => [id, new Window()]));
    this.cooldownUntil = {};
    this.active = [];
    this.milestone = 0;
  }

  reset() {
    for (const w of Object.values(this.windows)) w.clear();
    this.cooldownUntil = {};
    this.active = [];
    this.milestone = 0;
  }

  // Shares only count with a known sharer, since the rule is "5 different people".
  addShare(userId, now) {
    if (userId && !this.windows.wind.users.has(userId)) this.windows.wind.add(now, 1, userId);
  }

  addLikes(count, now) {
    this.windows.tsunami.add(now, count);
  }

  addComment(userId, now) {
    this.windows.cheer.add(now, 1, userId);
  }

  addGifts(count, now) {
    this.windows.giftStorm.add(now, count);
  }

  value(id) {
    return id === 'wind' ? this.windows.wind.users.size : this.windows[id].sum;
  }

  target(id, rules) {
    return { wind: rules.wind.uniqueSharers, tsunami: rules.tsunami.likes, cheer: rules.cheer.comments, giftStorm: rules.giftStorm.gifts }[id];
  }

  ready(id, rules) {
    if (this.value(id) < this.target(id, rules)) return false;
    return id !== 'cheer' || this.windows.cheer.users.size >= rules.cheer.minUsers;
  }

  // Returns what happened this tick: [{ kind: 'trigger', id, rule } | { kind: 'milestone', n }].
  update(now, rules) {
    const out = [];
    this.active = this.active.filter((effect) => effect.endsAt > now);
    for (const id of COMMUNITY_EVENTS) this.windows[id].prune(now, rules[id].windowSeconds);
    const step = rules.tsunami.milestoneLikes;
    const reached = step > 0 ? Math.floor(this.windows.tsunami.sum / step) : 0;
    if (reached > this.milestone && reached * step < rules.tsunami.likes) out.push({ kind: 'milestone', n: reached, likes: reached * step });
    this.milestone = reached;
    if (!rules.enabled) return out;
    for (const id of COMMUNITY_EVENTS) {
      const rule = rules[id];
      if (!rule.enabled || (this.cooldownUntil[id] ?? 0) > now || !this.ready(id, rules)) continue;
      this.windows[id].clear();
      if (id === 'tsunami') this.milestone = 0;
      this.cooldownUntil[id] = now + rule.cooldownSeconds;
      this.active = this.active.filter((effect) => effect.id !== id);
      this.active.push({ id, bonus: rule.bonus, endsAt: now + rule.seconds, startedAt: now });
      out.push({ kind: 'trigger', id, rule });
    }
    return out;
  }

  bonus(balance) {
    return communityBonus(this.active, balance);
  }

  progress(now, rules) {
    return COMMUNITY_EVENTS.map((id) => ({
      id,
      value: this.value(id),
      target: this.target(id, rules),
      users: id === 'cheer' ? this.windows.cheer.users.size : undefined,
      cooldown: Math.max(0, (this.cooldownUntil[id] ?? 0) - now),
      active: Math.max(0, (this.active.find((e) => e.id === id)?.endsAt ?? 0) - now),
      enabled: rules.enabled && rules[id].enabled,
    }));
  }
}
