// Bộ não của Virtual Dance Club: chạy trên server, là nguồn sự thật duy nhất.
// Gồm: CharacterManager/Spawner (slot + hàng chờ FIFO), GiftResolver (gộp combo),
// DanceTierResolver, ChoreographySelector, GiftPriorityQueue và DanceSessionManager.
// Trình duyệt chỉ hiển thị theo snapshot + các sự kiện phát ra từ đây.

export const STATES = ['chill', 'preparing', 'performing', 'finale', 'returning'];

// Chống cộng trùng quà combo của TikTok: mỗi msgId chỉ tính một lần,
// combo gửi tổng dồn (repeatCount) nên chỉ cộng phần chênh lệch.
export class GiftCounter {
  constructor() {
    this.streaks = new Map();
    this.seen = new Set();
  }

  count({ msgId, userId, giftId, groupId, repeatCount, repeatEnd, combo }) {
    if (msgId) {
      if (this.seen.has(msgId)) return 0;
      this.seen.add(msgId);
      if (this.seen.size > 5000) this.seen.delete(this.seen.values().next().value);
    }
    const repeat = Math.max(1, Number(repeatCount) || 1);
    if (!combo) return repeat;
    const key = `${userId}:${giftId}:${groupId}`;
    const previous = this.streaks.get(key) ?? 0;
    const count = repeat >= previous ? repeat - previous : repeat;
    if (repeatEnd) this.streaks.delete(key);
    else this.streaks.set(key, Math.max(previous, repeat));
    if (this.streaks.size > 2000) this.streaks.delete(this.streaks.keys().next().value);
    return count;
  }
}

export function tierFor(tiers, coins) {
  let found = tiers[0];
  for (const tier of tiers) if (coins >= tier.minCoins) found = tier;
  return found;
}

export function matchesKeyword(text, keywords) {
  const tokens = String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return tokens.some((token) =>
    keywords.some((kw) => {
      const k = kw.toLowerCase();
      if (!token.startsWith(k)) return false;
      // "heyyy" vẫn tính là "hey".
      return [...token.slice(k.length)].every((c) => c === k.at(-1));
    }),
  );
}

export function validateConfig(cfg) {
  const errors = [];
  const tiers = cfg.tiers ?? [];
  if (!tiers.length) errors.push('Thiếu tiers');
  tiers.forEach((t, i) => {
    if (i > 0 && t.minCoins <= tiers[i - 1].minCoins) errors.push(`tier ${t.tier}: minCoins phải tăng dần`);
    if (!(t.seconds > 0)) errors.push(`tier ${t.tier}: seconds phải > 0`);
  });
  for (const t of tiers) {
    if (!cfg.choreographies.some((c) => c.tier === t.tier)) errors.push(`tier ${t.tier} chưa có choreography nào`);
  }
  for (const c of cfg.choreographies) {
    const sum = c.phases.reduce((s, p) => s + p.share, 0);
    if (Math.abs(sum - 1) > 0.02) errors.push(`${c.id}: tổng share các phase = ${sum.toFixed(2)}, cần = 1`);
    if (!c.phases.some((p) => p.phase === 'finale')) errors.push(`${c.id}: thiếu phase finale`);
    if (c.phases.some((p) => !p.moves?.length)) errors.push(`${c.id}: có phase không có move`);
    if (c.cameraPreset && !cfg.cameraPresets[c.cameraPreset]) errors.push(`${c.id}: không có camera ${c.cameraPreset}`);
    if (c.crowdReactionPreset && !cfg.crowdReactionPresets[c.crowdReactionPreset]) errors.push(`${c.id}: không có crowd preset ${c.crowdReactionPreset}`);
    if (c.lightingPreset && !cfg.lightingPresets[c.lightingPreset]) errors.push(`${c.id}: không có lighting preset ${c.lightingPreset}`);
  }
  return errors;
}

export class Club {
  constructor(config, { now = () => Date.now(), random = Math.random } = {}) {
    this.cfg = config;
    this.now = now;
    this.random = random;
    this.tiers = [...config.tiers].sort((a, b) => a.minCoins - b.minCoins);
    this.choreos = new Map();
    for (const c of config.choreographies) {
      if (!this.choreos.has(c.tier)) this.choreos.set(c.tier, []);
      this.choreos.get(c.tier).push(c);
    }
    this.listeners = new Set();
    this.board = new Map();
    this.boardSeq = 0;
    // Ngoại hình đã đổi bằng quà đổi nhân vật (giữ cả khi rời sàn rồi quay lại).
    this.looks = new Map();
    this.reset(false);
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type, data = {}) {
    for (const listener of this.listeners) listener(type, data);
  }

  changed() {
    this.emit('changed');
  }

  reset(notify = true) {
    const t = this.now();
    this.slots = new Array(this.cfg.floor.maxDancers).fill(null);
    this.dancers = new Map();
    this.waitlist = [];
    this.pending = new Map();
    this.queue = [];
    this.seq = 0;
    this.session = null;
    this.chillSince = -Infinity;
    this.lastChoreo = new Map();
    this.tokens = this.cfg.floor.spawnPerSecond;
    this.tokenAt = t;
    this.lastCleanup = t;
    this.stats = { gifts: 0, coins: 0, performances: 0, dropped: 0 };
    if (notify) this.changed();
  }

  // ---------- Roster ----------

  touch(id) {
    const d = this.dancers.get(id);
    if (d) d.lastActive = this.now();
    const w = this.waitlist.find((x) => x.id === id);
    if (w) w.lastActive = this.now();
  }

  freeSlot() {
    return this.slots.indexOf(null);
  }

  admit(who) {
    const slot = this.freeSlot();
    if (slot < 0) return null;
    const t = this.now();
    const dancer = {
      id: who.id,
      name: who.name,
      avatar: who.avatar ?? '',
      slot,
      joinedAt: t,
      lastActive: t,
      coins: 0,
      performances: 0,
      status: 'chill',
      cooldownUntil: 0,
      look: this.looks.get(who.id) ?? 0,
    };
    this.slots[slot] = who.id;
    this.dancers.set(who.id, dancer);
    this.waitlist = this.waitlist.filter((w) => w.id !== who.id);
    this.emit('joined', { id: dancer.id, name: dancer.name, slot });
    this.changed();
    return dancer;
  }

  leave(dancer, reason) {
    if (!this.dancers.has(dancer.id)) return;
    this.slots[dancer.slot] = null;
    this.dancers.delete(dancer.id);
    this.emit('left', { id: dancer.id, name: dancer.name, reason });
    this.changed();
  }

  // Người tặng quà luôn được lên sàn: nếu đầy thì mời người đứng im lâu nhất ra hàng chờ (đầu hàng).
  makeRoom() {
    let victim = null;
    for (const d of this.dancers.values()) {
      if (d.status !== 'chill' || this.hasRequest(d.id)) continue;
      const score = d.lastActive - (d.coins > 0 ? 3_600_000 : 0);
      if (!victim || score < victim.score) victim = { d, score };
    }
    if (!victim) return false;
    const d = victim.d;
    this.leave(d, 'make-room');
    this.waitlist.unshift({ id: d.id, name: d.name, avatar: d.avatar, since: this.now(), lastActive: d.lastActive });
    return true;
  }

  join(who, { priority = false } = {}) {
    const existing = this.dancers.get(who.id);
    if (existing) {
      existing.lastActive = this.now();
      return { result: 'on-floor', dancer: existing };
    }
    const waiting = this.waitlist.findIndex((w) => w.id === who.id);
    if (priority) {
      if (this.freeSlot() < 0 && !this.makeRoom()) return { result: 'full' };
      return { result: 'joined', dancer: this.admit(who) };
    }
    if (waiting >= 0) {
      this.waitlist[waiting].lastActive = this.now();
      return { result: 'waiting', position: waiting + 1 };
    }
    // FIFO: chỉ vào thẳng khi không có ai chờ trước và còn lượt spawn.
    if (this.freeSlot() >= 0 && this.waitlist.length === 0 && this.tokens >= 1) {
      this.tokens -= 1;
      return { result: 'joined', dancer: this.admit(who) };
    }
    if (this.waitlist.length >= this.cfg.floor.maxWaitlist) return { result: 'full' };
    const t = this.now();
    this.waitlist.push({ id: who.id, name: who.name, avatar: who.avatar ?? '', since: t, lastActive: t });
    this.emit('waiting', { id: who.id, name: who.name, position: this.waitlist.length });
    this.changed();
    return { result: 'waiting', position: this.waitlist.length };
  }

  comment(who, text) {
    const isJoin = matchesKeyword(text, this.cfg.join.keywords);
    const dancer = this.dancers.get(who.id);
    if (dancer) {
      dancer.lastActive = this.now();
      if (isJoin) this.emit('wave', { id: dancer.id });
      return { result: 'on-floor' };
    }
    if (!isJoin) {
      this.touch(who.id);
      return { result: 'ignored' };
    }
    return this.join(who);
  }

  like(who) {
    const dancer = this.dancers.get(who.id);
    if (dancer) dancer.lastActive = this.now();
  }

  // ---------- Gifts ----------

  hasRequest(id) {
    return this.pending.has(id) || this.queue.some((r) => r.id === id) || this.session?.performerId === id;
  }

  // Quà đổi nhân vật (mặc định quà "TikTok"): nhận theo tên hoặc giftId trong config.swapGift.
  isSwapGift(giftName, giftId) {
    const s = this.cfg.swapGift;
    if (!s?.enabled) return false;
    const name = String(giftName ?? '').trim().toLowerCase();
    if (name && (s.names ?? []).some((n) => String(n).trim().toLowerCase() === name)) return true;
    return giftId != null && giftId !== '' && (s.giftIds ?? []).map(String).includes(String(giftId));
  }

  swapLook(id, name) {
    const look = (this.looks.get(id) ?? 0) + 1;
    this.looks.set(id, look);
    if (this.looks.size > 5000) this.looks.delete(this.looks.keys().next().value);
    const dancer = this.dancers.get(id);
    if (dancer) dancer.look = look;
    this.emit('swapped', { id, name, look });
    return look;
  }

  gift(who, { coins, units = 1, giftName = '', giftId = null }) {
    const unitValue = coins > 0 ? coins : this.cfg.gifts.unknownCoinValue;
    const value = unitValue * Math.max(1, units);
    const swap = this.isSwapGift(giftName, giftId);
    this.stats.gifts += units;
    this.stats.coins += value;
    this.emit('gift', { id: who.id, name: who.name, giftName, units, coins: value, swap });
    const fan = this.board.get(who.id) ?? { id: who.id, name: who.name, avatar: '', coins: 0, at: 0 };
    fan.name = who.name;
    if (who.avatar) fan.avatar = who.avatar;
    fan.coins += value;
    fan.at = ++this.boardSeq;
    this.board.set(who.id, fan);

    const joined = this.join(who, { priority: true });
    const dancer = joined.dancer ?? this.dancers.get(who.id);
    if (dancer) {
      dancer.coins += value;
      dancer.lastActive = this.now();
    }

    if (swap) {
      const look = this.swapLook(who.id, who.name);
      if (!this.cfg.swapGift.alsoPerform) {
        this.changed();
        return { result: 'swapped', look };
      }
    }

    // Đã có lượt chờ chưa diễn: cộng dồn vào lượt đó (có thể lên tier).
    const queued = this.queue.find((r) => r.id === who.id);
    if (queued) {
      const before = queued.tier;
      queued.coins += value;
      queued.tier = tierFor(this.tiers, queued.coins).tier;
      if (queued.tier !== before) this.emit('upgraded', { id: who.id, name: who.name, tier: queued.tier, coins: queued.coins });
      this.changed();
      return { result: 'merged', request: queued };
    }

    const t = this.now();
    const p = this.pending.get(who.id) ?? { id: who.id, name: who.name, coins: 0, firstAt: t, lastAt: t };
    p.name = who.name;
    p.coins += value;
    p.lastAt = t;
    this.pending.set(who.id, p);
    if (!(this.cfg.gifts.comboWindowMs > 0)) this.flushPending(true);
    this.changed();
    return { result: 'pending', coins: p.coins };
  }

  flushPending(force = false) {
    const t = this.now();
    for (const p of [...this.pending.values()]) {
      if (!force && t - p.lastAt < this.cfg.gifts.comboWindowMs) continue;
      this.pending.delete(p.id);
      this.enqueue({ id: p.id, name: p.name, coins: p.coins });
    }
  }

  priority(req, t = this.now()) {
    return req.tier + (t - req.at) / 1000 / this.cfg.gifts.agingSecondsPerTier;
  }

  enqueue({ id, name, coins }) {
    const t = this.now();
    const req = { seq: ++this.seq, id, name, coins, tier: tierFor(this.tiers, coins).tier, at: t };
    if (this.queue.length >= this.cfg.gifts.maxQueue) {
      // Hàng đầy: bỏ lượt có độ ưu tiên thấp nhất (mới nhất nếu bằng điểm).
      let lowest = null;
      for (const r of this.queue) {
        if (!lowest || this.priority(r, t) < this.priority(lowest, t) || (this.priority(r, t) === this.priority(lowest, t) && r.seq > lowest.seq)) lowest = r;
      }
      if (this.priority(req, t) > this.priority(lowest, t)) {
        this.queue = this.queue.filter((r) => r !== lowest);
        this.stats.dropped++;
        this.emit('dropped', { id: lowest.id, name: lowest.name, tier: lowest.tier });
      } else {
        this.stats.dropped++;
        this.emit('dropped', { id: req.id, name: req.name, tier: req.tier });
        return null;
      }
    }
    this.queue.push(req);
    this.emit('queued', { id, name, tier: req.tier, coins, position: this.orderedQueue().indexOf(req) + 1 });
    this.changed();
    return req;
  }

  orderedQueue(t = this.now()) {
    return [...this.queue].sort((a, b) => this.priority(b, t) - this.priority(a, t) || a.seq - b.seq);
  }

  // ---------- Session ----------

  pickChoreography(tier) {
    const list = this.choreos.get(tier) ?? [];
    const last = this.lastChoreo.get(tier);
    const options = list.length > 1 ? list.filter((c) => c.id !== last) : list;
    const choreo = options[Math.floor(this.random() * options.length)] ?? list[0];
    this.lastChoreo.set(tier, choreo.id);
    return choreo;
  }

  start(req) {
    const t = this.now();
    const g = this.cfg.gifts;
    const joined = this.join({ id: req.id, name: req.name }, { priority: true });
    const dancer = joined.dancer ?? this.dancers.get(req.id);
    if (!dancer) return false;
    const tier = this.tiers.find((x) => x.tier === req.tier);
    const choreo = this.pickChoreography(req.tier);
    const rush = this.queue.length >= g.rushQueueLength && req.tier <= g.rushMaxTier;
    const ms = tier.seconds * 1000 * (rush ? g.rushScale : 1);
    const finaleShare = choreo.phases.filter((p) => p.phase === 'finale').reduce((s, p) => s + p.share, 0);
    const performingAt = t + g.preparingMs;
    const finaleAt = performingAt + ms * (1 - finaleShare);
    const returningAt = finaleAt + ms * finaleShare;
    this.session = {
      id: req.seq,
      performerId: dancer.id,
      name: dancer.name,
      avatar: dancer.avatar,
      slot: dancer.slot,
      tier: req.tier,
      coins: req.coins,
      choreoId: choreo.id,
      rush,
      state: 'preparing',
      startedAt: t,
      performingAt,
      finaleAt,
      returningAt,
      endAt: returningAt + g.returningMs,
    };
    dancer.status = 'performing';
    dancer.performances++;
    this.stats.performances++;
    this.emit('perform', { ...this.session });
    this.changed();
    return true;
  }

  stateAt(s, t) {
    if (t < s.performingAt) return 'preparing';
    if (t < s.finaleAt) return 'performing';
    if (t < s.returningAt) return 'finale';
    return 'returning';
  }

  finish() {
    const s = this.session;
    const dancer = this.dancers.get(s.performerId);
    if (dancer) {
      dancer.status = 'cooldown';
      dancer.cooldownUntil = this.now() + this.cfg.floor.cooldownMs;
      dancer.lastActive = this.now();
    }
    this.session = null;
    this.chillSince = this.now();
    this.emit('session-end', { id: s.id, performerId: s.performerId });
    this.changed();
  }

  // Nút C: kết thúc màn đang diễn, về Chill.
  forceChill() {
    const s = this.session;
    if (!s || s.state === 'returning') return false;
    const t = this.now();
    s.performingAt = Math.min(s.performingAt, t);
    s.finaleAt = Math.min(s.finaleAt, t);
    s.returningAt = t;
    s.endAt = t + this.cfg.gifts.returningMs;
    s.state = 'returning';
    this.changed();
    return true;
  }

  // Top người tặng nhiều xu nhất; bằng xu thì ai đạt mốc đó trước đứng trên.
  leaderboard(n = 5) {
    return [...this.board.values()]
      .sort((a, b) => b.coins - a.coins || a.at - b.at)
      .slice(0, n)
      .map((f, i) => ({ rank: i + 1, id: f.id, name: f.name, avatar: f.avatar, coins: f.coins }));
  }

  resetBoard() {
    this.board.clear();
    this.changed();
  }

  clearQueue() {
    this.queue = [];
    this.pending.clear();
    this.changed();
  }

  tick() {
    const t = this.now();
    const f = this.cfg.floor;

    // Giới hạn tốc độ spawn: tối đa spawnPerSecond người/giây.
    this.tokens = Math.min(f.spawnPerSecond, this.tokens + ((t - this.tokenAt) / 1000) * f.spawnPerSecond);
    this.tokenAt = t;
    while (this.waitlist.length && this.freeSlot() >= 0 && this.tokens >= 1) {
      this.tokens -= 1;
      this.admit(this.waitlist[0]);
    }

    for (const d of this.dancers.values()) {
      if (d.status === 'cooldown' && t >= d.cooldownUntil) {
        d.status = 'chill';
        this.changed();
      }
    }

    this.flushPending();

    if (this.session) {
      if (t >= this.session.endAt) this.finish();
      else {
        const state = this.stateAt(this.session, t);
        if (state !== this.session.state) {
          this.session.state = state;
          this.changed();
        }
      }
    }
    if (!this.session && this.queue.length && t - this.chillSince >= this.cfg.gifts.minChillMs) {
      const [next] = this.orderedQueue(t);
      this.queue = this.queue.filter((r) => r !== next);
      if (!this.start(next)) this.changed();
    }

    if (t - this.lastCleanup >= 5000) {
      this.lastCleanup = t;
      this.cleanup(t);
    }
  }

  cleanup(t) {
    const f = this.cfg.floor;
    const leaveMs = f.idleLeaveMinutes * 60_000;
    const roomMs = f.makeRoomIdleMinutes * 60_000;
    for (const d of [...this.dancers.values()]) {
      if (d.status !== 'chill' || this.hasRequest(d.id)) continue;
      const idle = t - d.lastActive;
      if (idle > leaveMs || (this.waitlist.length > 0 && idle > roomMs)) this.leave(d, 'idle');
    }
    const before = this.waitlist.length;
    this.waitlist = this.waitlist.filter((w) => t - w.lastActive <= leaveMs);
    if (this.waitlist.length !== before) this.changed();
  }

  snapshot() {
    const t = this.now();
    return {
      now: t,
      maxDancers: this.cfg.floor.maxDancers,
      dancers: [...this.dancers.values()].map((d) => ({ id: d.id, name: d.name, avatar: d.avatar, slot: d.slot, status: d.status, coins: d.coins, look: d.look ?? 0 })),
      waitlist: { count: this.waitlist.length, next: this.waitlist.slice(0, 5).map((w) => w.name) },
      queue: this.orderedQueue(t)
        .slice(0, 8)
        .map((r) => ({ id: r.id, name: r.name, tier: r.tier, coins: r.coins })),
      queueLength: this.queue.length,
      pending: [...this.pending.values()].map((p) => ({ id: p.id, name: p.name, coins: p.coins })),
      session: this.session ? { ...this.session } : null,
      stats: { ...this.stats },
      leaderboard: this.leaderboard(5),
    };
  }
}
