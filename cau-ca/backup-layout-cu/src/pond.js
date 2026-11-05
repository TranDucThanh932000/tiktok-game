// Hồ câu: ai comment "câu" được một chỗ ngồi quanh hồ. Mỗi lần giật cá là một "job" xếp hàng chung,
// vì camera chỉ quay cận một người mỗi lúc. Job bắt đầu thì kết quả đã được gieo, nhưng chỉ được cộng
// vào bảng xếp hạng lúc lộ kết quả (revealAt) để màn hình và bảng điểm khớp nhau.

export const TIERS = ['like', 'small', 'medium', 'large', 'shark'];

// "Câu!!" -> ["câu"]; "cauuu" khớp "cau".
export function matchesWord(text, words) {
  const tokens = String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return tokens.some((token) =>
    words.some((word) => {
      const w = word.normalize('NFC').toLowerCase();
      if (!token.startsWith(w)) return false;
      const rest = token.slice(w.length);
      return rest === '' || [...rest].every((ch) => ch === w.at(-1));
    }),
  );
}

const fold = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Quà theo tên trước (Rose, Finger Heart, Lucky Pig, Gift Box), quà lạ thì theo số xu.
export function giftTier(config, gift) {
  const name = fold(gift.name);
  const named = config.gifts.find((g) => g.names.some((n) => fold(n) === name));
  if (named) return named.tier;
  let tier = null;
  for (const rule of [...config.otherGiftsByCoins].sort((a, b) => a.minCoins - b.minCoins)) {
    if ((gift.coins || 0) >= rule.minCoins) tier = rule.tier;
  }
  return tier;
}

// Quà may mắn (cỏ ba lá): không giật cá, chỉ tăng tỉ lệ thành công trong một lúc.
export function isLuckGift(config, gift) {
  const name = fold(gift.name);
  return Boolean(config.luck?.names?.some((n) => fold(n) === name));
}

const round1 = (n) => Math.round(n * 10) / 10;

export class Pond {
  // ready(job, now): server có thể bắt lượt giật chờ (ví dụ chờ giọng chúc mừng tạo xong).
  constructor(config, { emit = () => {}, random = Math.random, now = Date.now, ready = () => true } = {}) {
    this.ready = ready;
    this.cfg = config;
    this.emit = emit;
    this.random = random;
    this.now = now;
    this.players = new Map();
    this.seats = new Array(config.seats).fill(null);
    this.stats = new Map();
    this.likeBank = new Map();
    this.freeAt = new Map();
    this.luckUntil = new Map();
    this.luckTotal = new Map();
    this.queue = [];
    this.current = null;
    this.seq = 0;
    this.jobSeq = 0;
    // Cá hiếm: đếm mọi con cá đã giật (cả con xổng). Con thứ rare.every là cá hiếm.
    // hooked tăng lúc bắt đầu giật; rareShown là số đã lộ kết quả, dùng cho thanh tiến trình.
    this.hooked = 0;
    this.rareShown = 0;
    // Sự kiện vòng quay đang chạy (effect trong config) và trạng thái riêng của thi câu nhanh, cá mập.
    this.event = null;
    this.sprint = null;
    this.boss = null;
  }

  // ---------- Chỗ ngồi ----------

  busy(id) {
    return this.current?.job.pid === id || this.queue.some((job) => job.pid === id);
  }

  view(p) {
    return { key: p.key, name: p.name, avatar: p.avatar, seat: p.seat, likes: p.likes, luck: this.luckLeft(p.id) };
  }

  // Trả về người chơi đã ngồi, hoặc null khi hồ kín mà ai cũng đang bận giật cá.
  // force: người tặng quà được ưu tiên đẩy người ngồi im lâu nhất ra.
  seat(who, { force = false } = {}) {
    const now = this.now();
    const found = this.players.get(who.id);
    if (found) {
      if (who.name) found.name = who.name;
      if (who.avatar) found.avatar = who.avatar;
      return found;
    }
    const free = this.seats.flatMap((id, i) => (id === null ? [i] : []));
    let seat;
    if (free.length) {
      seat = free[Math.floor(this.random() * free.length)];
    } else {
      // Người ngồi im lâu nhất, không có lượt giật đang chờ, nhường chỗ.
      let quietest = null;
      for (const p of this.players.values()) {
        if (this.busy(p.id)) continue;
        if (!quietest || p.active < quietest.active) quietest = p;
      }
      if (!quietest) return null;
      // Người mới comment "câu" chỉ thay được người đã không giật cá ít nhất 1 phút; quà thì luôn được.
      if (!force && now - quietest.active < 60_000) return null;
      seat = quietest.seat;
      this.leave(quietest.id, 'full');
    }
    const p = { key: ++this.seq, id: who.id, name: who.name, avatar: who.avatar, seat, likes: 0, active: now, seatedAt: now };
    this.players.set(who.id, p);
    this.seats[seat] = who.id;
    this.emit({ type: 'join', player: this.view(p) });
    return p;
  }

  leave(id, why = 'idle') {
    const p = this.players.get(id);
    if (!p) return;
    // Tim đang thả dở được để dành, quay lại thả tiếp đủ likesPerPull vẫn được giật.
    if (p.likes > 0 && why !== 'reset') this.likeBank.set(id, p.likes);
    this.players.delete(id);
    this.seats[p.seat] = null;
    this.emit({ type: 'leave', key: p.key, why });
  }

  // ---------- Sự kiện TikTok ----------

  // Comment chỉ để xuống hồ; muốn ngồi lại lâu thì phải giật cá (xem idleLeaveSeconds).
  comment(who, text) {
    if (!matchesWord(text, this.cfg.joinWords)) return null;
    const known = this.players.has(who.id);
    const p = this.seat(who);
    if (!p) this.emit({ type: 'full', name: who.name });
    return p && !known ? p : null;
  }

  // Cứ đủ likesPerPull tim là một lần giật. Người chưa ngồi thì tim được để dành, đủ thì tự xuống hồ.
  like(who, count) {
    const per = this.event?.likesPerPull ?? this.cfg.likesPerPull;
    let p = this.players.get(who.id);
    if (!p) {
      const banked = (this.likeBank.get(who.id) ?? 0) + count;
      if (banked < per) {
        this.likeBank.delete(who.id);
        this.likeBank.set(who.id, banked);
        if (this.likeBank.size > 5000) this.likeBank.delete(this.likeBank.keys().next().value);
        return 0;
      }
      this.likeBank.delete(who.id);
      p = this.seat(who);
      if (!p) {
        this.likeBank.set(who.id, banked);
        return 0;
      }
      p.likes += banked;
    } else {
      p.likes += count;
    }
    let pulls = Math.floor(p.likes / per);
    p.likes -= pulls * per;
    // Thả tim liên tục không được dồn hàng chờ quá maxLikePullsQueued lượt; phần thừa bỏ đi.
    const queued = this.queue.find((job) => job.pid === p.id && job.tier === 'like')?.count ?? 0;
    pulls = Math.min(pulls, Math.max(0, this.cfg.maxLikePullsQueued - queued));
    if (pulls) this.enqueue(p, 'like', pulls, null);
    this.emit({ type: 'likes', key: p.key, likes: p.likes });
    return pulls;
  }

  // Câu free: follow hoặc share được 1 lần giật cá tạp. Gộp chung cả hai cách, mỗi người tối đa
  // 1 lần mỗi freePullCooldownSeconds để không spam follow/unfollow hay share liên tục.
  // Trả về người chơi khi được giật, null khi còn trong thời gian chờ hoặc hồ kín.
  free(who, kind) {
    const now = this.now();
    const last = this.freeAt.get(who.id);
    if (last !== undefined && now - last < this.cfg.freePullCooldownSeconds * 1000) return null;
    const p = this.seat(who);
    if (!p) {
      this.emit({ type: 'full', name: who.name });
      return null;
    }
    this.freeAt.delete(who.id);
    this.freeAt.set(who.id, now);
    if (this.freeAt.size > 5000) this.freeAt.delete(this.freeAt.keys().next().value);
    this.enqueue(p, 'like', 1, kind === 'share' ? 'Share' : 'Follow');
    this.emit({ type: 'free', key: p.key, name: p.name, kind });
    return p;
  }

  gift(who, gift, count) {
    if (isLuckGift(this.cfg, gift)) return count > 0 && this.luck(who, count) ? 'luck' : null;
    const tier = giftTier(this.cfg, gift);
    if (!tier || count <= 0) return null;
    const p = this.seat(who, { force: true });
    if (!p) return null;
    const label = this.cfg.gifts.find((g) => g.tier === tier)?.label ?? gift.name;
    this.enqueue(p, tier, count, label);
    return tier;
  }

  // Cỏ ba lá: mỗi quà thêm luck.seconds giây tỉ lệ thành công luck.successRate (combo thì cộng dồn).
  // Người xem chỉ thấy "Tăng tỉ lệ câu thành công", con số không gửi xuống trang game.
  luck(who, count) {
    const now = this.now();
    const p = this.seat(who, { force: true });
    if (!p) return null;
    p.active = now;
    const until = Math.max(now, this.luckUntil.get(p.id) ?? 0) + count * this.cfg.luck.seconds * 1000;
    this.luckUntil.set(p.id, until);
    // Vòng đếm ngược trên avatar tính lại từ đầy theo thời gian còn lại mới.
    this.luckTotal.set(p.id, until - now);
    // Lượt đã xếp hàng mà chưa giật cũng được hưởng: lượt hỏng được gieo lại cho đúng tỉ lệ mới.
    const base = this.event?.rate ?? this.cfg.successRate;
    const lifted = base < 1 ? Math.max(0, (this.cfg.luck.successRate - base) / (1 - base)) : 0;
    for (const job of this.queue) {
      if (job.pid !== p.id) continue;
      for (const r of job.results) if (!r.ok && this.random() < lifted) r.ok = true;
    }
    this.emit({ type: 'luck', key: p.key, name: p.name, lucky: true, count, ...this.luckLeft(p.id) });
    return p;
  }

  lucky(id) {
    return (this.luckUntil.get(id) ?? 0) > this.now();
  }

  // Thời gian cỏ ba lá còn lại (ms) cho vòng đếm ngược; không có tỉ lệ thành công.
  luckLeft(id) {
    if (!this.lucky(id)) return null;
    const left = this.luckUntil.get(id) - this.now();
    return { left, total: Math.max(left, this.luckTotal.get(id) ?? left) };
  }

  // Lượt chưa bắt đầu của cùng người, cùng loại cá được gộp: 10 bông hồng là một lần quay cận, giật 10 con.
  enqueue(p, tier, count, gift) {
    p.active = this.now();
    // Kết quả gieo ngay lúc nhận quà/tim để server kịp tạo sẵn giọng chúc mừng trong lúc chờ tới lượt.
    // Vì vậy hiệu ứng sự kiện tính theo lúc nhận quà: quà ở giây cuối đang xếp hàng vẫn được hưởng.
    const event = this.event;
    const base = event?.rate ?? this.cfg.successRate;
    const rate = this.lucky(p.id) ? Math.max(this.cfg.luck.successRate, base) : base;
    const rolls = Array.from({ length: count }, () => this.roll(tier, rate, event?.kgMul ?? 1));
    if (this.sprint && !this.sprint.closeAt) rolls.forEach((r) => this.sprint.rolls.add(r));
    const rareStep = event?.rareStep ?? 1;
    let job = this.queue.find((j) => j.pid === p.id && j.tier === tier);
    if (job) {
      job.count += count;
      job.results.push(...rolls);
      job.rareStep = Math.max(job.rareStep ?? 1, rareStep);
    } else {
      job = { id: ++this.jobSeq, pid: p.id, tier, count, gift, results: rolls, createdAt: this.now(), rareStep };
      this.emit({ type: 'bite', key: p.key });
      this.queue.push(job);
    }
    this.emit({ type: 'queued', id: job.id, name: p.name, tier, results: job.results });
    this.hitBoss(p, tier, count);
    this.emit({ type: 'queue', n: this.queue.length });
  }

  // ---------- Sự kiện vòng quay ----------

  startEvent(effect = {}) {
    this.endEvent();
    if (this.sprint) this.settleSprint();
    // Bản sao riêng: cờ over chỉ thuộc về lần này, không được dính vào effect trong config.
    this.event = { ...effect };
    if (effect.sprint) this.sprint = { tally: new Map(), rolls: new WeakSet(), closeAt: 0, bonus: effect.sprint.bonusKg ?? 0 };
    if (effect.boss) {
      const { hpBase, hpPerPlayer = 0, hpMax = Infinity } = effect.boss;
      const max = Math.min(hpMax, hpBase + hpPerPlayer * this.players.size);
      this.boss = { hp: max, max, hits: new Map(), down: false };
    }
    this.emitLive();
  }

  endEvent() {
    const event = this.event;
    if (!event) return;
    this.event = null;
    if (this.boss) {
      if (!this.boss.down) this.emit({ type: 'boss-end', down: false });
      this.boss = null;
    }
    // Thi câu nhanh: chờ các lượt đã nhận trong giờ thi lộ kết quả rồi mới chốt người thắng.
    if (this.sprint) this.sprint.closeAt = this.now() + (event.sprint?.closeSeconds ?? 20) * 1000;
    this.emitLive();
  }

  // Mỗi lần giật (dù cá có dính hay không) là một phát đánh; quà càng to càng trừ nhiều máu.
  hitBoss(p, tier, count) {
    const boss = this.boss;
    if (!boss || boss.down) return;
    const dmg = (this.event.boss.damage?.[tier] ?? 1) * count;
    boss.hp = Math.max(0, boss.hp - dmg);
    const hit = boss.hits.get(p.id) ?? { id: p.id, name: p.name, avatar: p.avatar, n: 0 };
    hit.n += dmg;
    boss.hits.set(p.id, hit);
    this.emit({ type: 'boss-hit', key: p.key, name: p.name, dmg });
    if (boss.hp === 0) this.downBoss();
    this.emitLive();
  }

  // Cá mập hết máu: người đánh nhiều nhất được kéo một con cá mập con, chắc chắn dính.
  downBoss() {
    const boss = this.boss;
    boss.down = true;
    this.event.over = true;
    const order = [...boss.hits.values()].sort((a, b) => b.n - a.n);
    let winner = null;
    for (const hit of order) {
      winner = this.seat(hit, { force: true });
      if (winner) break;
    }
    if (winner) {
      winner.active = this.now();
      const results = [{ ...this.roll('boss', 1), ok: true }];
      this.queue.unshift({ id: ++this.jobSeq, pid: winner.id, tier: 'boss', count: 1, gift: null, results, createdAt: this.now() });
      this.emit({ type: 'bite', key: winner.key });
    }
    this.emit({ type: 'boss-end', down: true, name: winner?.name ?? null, key: winner?.key ?? null });
  }

  sprintPending() {
    const { rolls } = this.sprint;
    const c = this.current;
    if (c && !c.revealed && c.job.results.some((r) => rolls.has(r))) return true;
    return this.queue.some((job) => job.results.some((r) => rolls.has(r)));
  }

  settleSprint() {
    const { tally, bonus } = this.sprint;
    this.sprint = null;
    const best = [...tally.values()].sort((a, b) => b.kg - a.kg)[0] ?? null;
    if (best) {
      const stat = this.stats.get(best.id);
      if (stat) stat.kg = round1(stat.kg + bonus);
      this.emit({ type: 'board', top: this.board() });
    }
    this.emit({ type: 'sprint-end', name: best?.name ?? null, kg: best?.kg ?? 0, bonus });
    this.emitLive();
  }

  liveView() {
    const top = (list, value) =>
      [...list]
        .sort((a, b) => value(b) - value(a))
        .slice(0, 3)
        .map((x) => ({ name: x.name, avatar: x.avatar, n: value(x) }));
    if (this.boss) return { mode: 'boss', hp: this.boss.hp, max: this.boss.max, top: top(this.boss.hits.values(), (h) => h.n) };
    if (this.sprint) return { mode: 'sprint', closing: Boolean(this.sprint.closeAt), top: top(this.sprint.tally.values(), (t) => t.kg) };
    return { mode: null };
  }

  emitLive() {
    this.emit({ type: 'live', ...this.liveView() });
  }

  // ---------- Giật cá ----------

  roll(tier, rate = this.cfg.successRate, kgMul = 1) {
    const t = this.cfg.tiers[tier];
    const fish = t.fish[Math.floor(this.random() * t.fish.length)];
    const kg = round1((t.minKg + this.random() * (t.maxKg - t.minKg)) * kgMul);
    const ok = this.random() < rate;
    return { ok, kg, fish: fish.name };
  }

  // Lượt giật có chứa con cá thứ rare.every thì được tách: phần trước giật trước, con cá hiếm thành
  // một lượt quay cận riêng, phần còn lại quay về đầu hàng chờ.
  // job.rareStep: mỗi lần giật tính mấy lần vào bộ đếm (sự kiện Săn cá hiếm).
  splitRare(job) {
    const every = this.cfg.rare?.every;
    if (!(every > 0)) return;
    const left = every - (this.hooked % every);
    const reach = Math.ceil(left / (job.rareStep ?? 1)); // lần giật thứ mấy chạm mốc
    const n = job.results.length;
    if (n < reach) return;
    const cut = reach > 1 ? reach - 1 : 1;
    if (n > cut) this.queue.unshift({ ...job, id: ++this.jobSeq, count: n - cut, results: job.results.slice(cut) });
    job.results = job.results.slice(0, cut);
    job.count = cut;
    if (reach === 1) {
      job.tier = 'rare';
      job.results = [this.roll('rare', this.cfg.rare.successRate)];
      if (this.sprint && !this.sprint.closeAt) this.sprint.rolls.add(job.results[0]);
    }
  }

  rareView() {
    const every = this.cfg.rare?.every;
    return every > 0 ? { n: this.rareShown % every, every } : null;
  }

  start(job, now) {
    const p = this.players.get(job.pid);
    if (!p) return;
    // Cá mập thưởng của sự kiện không tính vào bộ đếm cá hiếm.
    if (job.tier !== 'boss') {
      this.splitRare(job);
      // Con cá hiếm luôn đưa bộ đếm về đúng mốc, kể cả khi mỗi lần giật tính nhiều lần.
      const every = this.cfg.rare?.every;
      this.hooked += job.tier === 'rare' ? every - (this.hooked % every) : job.results.length * (job.rareStep ?? 1);
    }
    const results = job.results;
    const rush = this.queue.length >= this.cfg.rushQueue ? this.cfg.rushFocusMs : this.cfg.focusMs;
    // Cá hiếm và cá mập có hiệu ứng riêng nên luôn được quay cận lâu hơn, kể cả khi đông lượt chờ.
    const ms = job.tier === 'rare' || job.tier === 'boss' ? (this.cfg.rare?.focusMs ?? this.cfg.focusMs) : job.tier === 'shark' ? (this.cfg.sharkFocusMs ?? rush) : rush;
    const revealMs = Math.round(ms * 0.62);
    const pull = { type: 'pull', id: job.id, key: p.key, seat: p.seat, name: p.name, avatar: p.avatar, tier: job.tier, gift: job.gift, count: job.count, ms, revealMs, results };
    this.current = { job, p, pull, startAt: now, revealAt: now + revealMs, endAt: now + ms, revealed: false };
    p.active = now;
    this.emit(pull);
    this.emit({ type: 'queue', n: this.queue.length });
  }

  reveal() {
    const { p, pull } = this.current;
    this.current.revealed = true;
    const s = this.stats.get(p.id) ?? { name: p.name, avatar: p.avatar, kg: 0, wins: 0, pulls: 0, best: 0, bestFish: '' };
    s.name = p.name;
    s.avatar = p.avatar || s.avatar;
    let kg = 0;
    let wins = 0;
    let best = null;
    for (const r of pull.results) {
      if (!r.ok) continue;
      kg += r.kg;
      wins++;
      if (!best || r.kg > best.kg) best = r;
    }
    kg = round1(kg);
    s.kg = round1(s.kg + kg);
    s.wins += wins;
    s.pulls += pull.results.length;
    if (best && best.kg > s.best) {
      s.best = best.kg;
      s.bestFish = best.fish;
    }
    this.stats.set(p.id, s);
    if (this.sprint) {
      let got = 0;
      for (const r of pull.results) if (r.ok && this.sprint.rolls.has(r)) got += r.kg;
      if (got > 0) {
        const entry = this.sprint.tally.get(p.id) ?? { id: p.id, name: p.name, avatar: p.avatar, kg: 0 };
        entry.kg = round1(entry.kg + got);
        this.sprint.tally.set(p.id, entry);
        this.emitLive();
      }
    }
    this.emit({ type: 'reveal', id: pull.id, key: p.key, name: p.name, tier: pull.tier, kg, wins, count: pull.results.length, best, total: s.kg });
    this.emit({ type: 'board', top: this.board() });
    this.rareShown = this.hooked;
    if (this.cfg.rare?.every > 0) this.emit({ type: 'rare', ...this.rareView() });
    return { id: pull.id, p, kg, wins, best, tier: pull.tier };
  }

  tick() {
    const now = this.now();
    let revealed = null;
    if (this.current) {
      if (!this.current.revealed && now >= this.current.revealAt) revealed = this.reveal();
      if (now >= this.current.endAt) {
        // Đếm giờ rời hồ tính từ lúc giật xong.
        this.current.p.active = now;
        this.current = null;
      }
    }
    // Người vừa rơi từ trời xuống cần landMs để tiếp đất rồi mới giật cá được.
    while (!this.current && this.queue.length) {
      const p = this.players.get(this.queue[0].pid);
      if (p && now - p.seatedAt < (this.cfg.landMs ?? 1500)) break;
      if (p && !this.ready(this.queue[0], now)) break;
      this.start(this.queue.shift(), now);
    }
    if (this.sprint?.closeAt && (now >= this.sprint.closeAt || !this.sprintPending())) this.settleSprint();
    // Hết giờ cỏ ba lá thì tắt dấu 🍀 trên thẻ tên.
    for (const [id, until] of this.luckUntil) {
      if (until > now) continue;
      this.luckUntil.delete(id);
      this.luckTotal.delete(id);
      const p = this.players.get(id);
      if (p) this.emit({ type: 'luck', key: p.key, name: p.name, lucky: false });
    }
    // Ngồi quá idleLeaveSeconds mà không giật cá lần nào thì tự ra về.
    const idleMs = this.cfg.idleLeaveSeconds * 1000;
    for (const p of [...this.players.values()]) {
      if (now - p.active > idleMs && !this.busy(p.id)) this.leave(p.id, 'idle');
    }
    return revealed;
  }

  // ---------- Bảng xếp hạng ----------

  board() {
    return [...this.stats.values()]
      .filter((s) => s.kg > 0)
      .sort((a, b) => b.kg - a.kg || b.wins - a.wins)
      .slice(0, this.cfg.boardSize)
      .map(({ name, avatar, kg, wins, pulls }) => ({ name, avatar, kg, wins, pulls }));
  }

  snapshot() {
    const now = this.now();
    const c = this.current;
    return {
      players: [...this.players.values()].map((p) => this.view(p)),
      top: this.board(),
      queue: this.queue.length,
      rare: this.rareView(),
      live: this.liveView(),
      pull: c && !c.revealed ? { ...c.pull, elapsed: now - c.startAt } : null,
    };
  }

  exportStats() {
    return [...this.stats.entries()];
  }

  importStats(entries) {
    this.stats = new Map(entries.filter((e) => Array.isArray(e) && e[1] && typeof e[1].kg === 'number'));
  }

  // Đặt bộ đếm cá hiếm (nạp lại khi bật server, hoặc chỉnh từ bảng điều khiển).
  setHooked(n) {
    this.hooked = this.rareShown = Math.max(0, Math.trunc(Number(n)) || 0);
    if (this.cfg.rare?.every > 0) this.emit({ type: 'rare', ...this.rareView() });
  }

  reset() {
    this.stats.clear();
    this.emit({ type: 'board', top: [] });
  }

  clearPond() {
    this.queue.length = 0;
    this.likeBank.clear();
    this.luckUntil.clear();
    this.luckTotal.clear();
    for (const id of [...this.players.keys()]) this.leave(id, 'reset');
    this.emit({ type: 'queue', n: 0 });
  }
}
