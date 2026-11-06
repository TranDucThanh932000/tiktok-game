// Sổ ghi danh: hàng chờ và lịch viết từng tờ sớ. Server giữ đồng hồ, trang game chỉ vẽ theo các chặng (stages) của tờ đang viết.
// Mỗi người chỉ có 1 tờ đang chờ: quà tiếp theo cộng dồn vào tờ đó và có thể nâng hạng, nên combo không chiếm hết hàng chờ.
// Vắng người thì tự viết cho bộ người có sẵn (demo); có người thật vào hàng chờ là bỏ ngay tờ tự chạy để viết cho họ.

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const lengthOf = (text) => Array.from(String(text)).length;

export class Ledger {
  constructor(config, { emit = () => {}, now = Date.now, random = Math.random, people = [], canDemo = () => true } = {}) {
    this.cfg = config;
    this.tiers = [...config.tiers].sort((a, b) => a.minCoins - b.minCoins);
    this.emit = emit;
    this.now = now;
    this.random = random;
    this.queue = new Map(); // id người xem -> tờ đang chờ
    this.likes = new Map(); // id người xem -> số tim đang tích
    this.job = null;
    this.written = 0;
    this.recent = [];
    this.seq = 0;
    this.paidStreak = 0;
    this.decks = new Map(); // danh sách câu -> các câu chưa dùng
    this.people = people;
    this.canDemo = canDemo;
    this.demoOn = Boolean(config.demo?.enabled && people.length);
    this.demoWritten = 0;
    this.demoAt = null; // lúc được bắt đầu tờ tự chạy tiếp theo
    this.demoStreak = 0;
    this.queueDirty = false;
    this.lastQueueAt = 0;
    this.stateDirty = false;
  }

  get size() {
    return this.queue.size;
  }

  tierIndex(coins) {
    let index = 0;
    this.tiers.forEach((tier, i) => {
      if (coins >= tier.minCoins) index = i;
    });
    return index;
  }

  tierFor(coins) {
    return this.tiers[this.tierIndex(coins)];
  }

  touch() {
    this.queueDirty = true;
    this.stateDirty = true;
  }

  // Trả về { have, need, earned, entry }: earned = tim vừa đủ và đã có tờ mới trong hàng chờ.
  like(who, count) {
    const need = this.cfg.likesForName;
    const have = (this.likes.get(who.id) ?? 0) + count;
    const waiting = this.queue.has(who.id);
    if (have < need) {
      this.setLikes(who.id, have);
      return { have, need, earned: false, waiting };
    }
    // Đang có tờ chờ rồi thì giữ tim ở sát mức đủ: viết xong tờ này, tim tiếp theo là được ghi tiếp.
    if (waiting) {
      this.setLikes(who.id, need - 1);
      return { have: need - 1, need, earned: false, waiting };
    }
    this.setLikes(who.id, have % need);
    return { have: have % need, need, earned: true, waiting, entry: this.add(who, 0, 0) };
  }

  setLikes(id, have) {
    this.likes.delete(id);
    this.likes.set(id, have);
    if (this.likes.size > 20_000) this.likes.delete(this.likes.keys().next().value);
  }

  // Trả về { entry, upgraded }: upgraded = tờ đang chờ vừa được lên hạng cao hơn.
  gift(who, coins, count = 1) {
    const before = this.queue.get(who.id);
    const previousTier = before ? this.tierIndex(before.coins) : -1;
    const entry = this.add(who, Math.max(1, coins) * count, count);
    return { entry, upgraded: Boolean(before) && this.tierIndex(entry.coins) > previousTier };
  }

  add(who, coins, gifts) {
    let entry = this.queue.get(who.id);
    if (entry) {
      entry.coins += coins;
      entry.gifts += gifts;
      entry.name = who.name;
      entry.avatar = who.avatar || entry.avatar;
    } else {
      entry = { id: who.id, name: who.name, avatar: who.avatar, coins, gifts, seq: ++this.seq };
      this.queue.set(who.id, entry);
    }
    this.touch();
    return entry;
  }

  ordered() {
    return [...this.queue.values()].sort((a, b) => this.tierIndex(b.coins) - this.tierIndex(a.coins) || a.seq - b.seq);
  }

  // Tờ có xu viết trước; cứ sau fairEvery tờ có xu thì nhường một lượt cho người thả tim đợi lâu nhất.
  pickNext() {
    const ordered = this.ordered();
    if (!ordered.length) return null;
    const free = ordered.filter((entry) => entry.coins === 0);
    const paid = ordered.filter((entry) => entry.coins > 0);
    if (free.length && (!paid.length || this.paidStreak >= this.cfg.fairEvery)) {
      this.paidStreak = 0;
      return free[0];
    }
    this.paidStreak++;
    return paid[0];
  }

  // Đông người thì viết nhanh lên; tờ chỉ có tên được tăng tốc nhiều hơn tờ có xu.
  speedFor(tier) {
    const { backlog, nameSpeed, paidSpeed } = this.cfg.rush;
    const top = tier.minCoins === 0 ? nameSpeed : paidSpeed;
    return 1 + (top - 1) * clamp(this.queue.size / backlog, 0, 1);
  }

  // Rút như rút bài: hết cả bộ mới xáo lại, và câu đầu bộ mới không trùng câu vừa dùng.
  pick(list) {
    const state = this.decks.get(list) ?? { cards: [], last: null };
    this.decks.set(list, state);
    if (!state.cards.length) {
      const cards = [...list];
      for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
      }
      if (cards.length > 1 && cards.at(-1) === state.last) [cards[0], cards[cards.length - 1]] = [cards.at(-1), cards[0]];
      state.cards = cards;
    }
    state.last = state.cards.pop();
    return state.last;
  }

  stagesFor(entry, tier) {
    const t = this.cfg.timing;
    const speed = this.speedFor(tier);
    const ms = (value) => Math.round(value / speed);
    const line = (text) => ms(clamp(lengthOf(text) * t.lineCharMs, t.lineMinMs, t.lineMaxMs));
    const stages = [{ kind: 'sheet', ms: ms(t.sheetMs) }];
    if (tier.avatar) stages.push({ kind: 'avatar', ms: ms(t.avatarMs) });
    stages.push({ kind: 'name', ms: ms(clamp(lengthOf(entry.name) * t.nameCharMs, t.nameMinMs, t.nameMaxMs)) });
    if (tier.wish) {
      const text = this.pick(this.cfg.wishes);
      stages.push({ kind: 'wish', text, ms: line(text) });
    }
    if (tier.thanks) {
      const text = this.pick(this.cfg.thanks);
      stages.push({ kind: 'thanks', text, ms: line(text) });
    }
    stages.push({ kind: 'seal', ms: ms(t.sealMs) });
    stages.push({ kind: 'hold', ms: ms(tier.holdMs) });
    return stages;
  }

  start(entry, { demo = false, preempted = false } = {}) {
    this.queue.delete(entry.id);
    const tier = this.tierFor(entry.coins);
    const stages = this.stagesFor(entry, tier);
    const startedAt = this.now();
    const total = stages.reduce((sum, stage) => sum + stage.ms, 0);
    this.job = {
      no: this.written + 1,
      id: entry.id,
      name: entry.name,
      spoken: entry.spoken,
      avatar: entry.avatar,
      coins: entry.coins,
      gifts: entry.gifts,
      seq: entry.seq,
      tier: tier.id,
      seal: tier.seal,
      bubble: tier.bubble,
      hasAvatar: Boolean(tier.avatar),
      demo,
      stages,
      total,
      startedAt,
    };
    this.touch();
    this.emit({ type: 'write', job: this.job, serverNow: startedAt, preempted });
  }

  finish() {
    const job = this.job;
    this.job = null;
    this.written = job.no;
    this.recent.unshift({ no: job.no, name: job.name, avatar: job.hasAvatar ? job.avatar : '', tier: job.tier, gifts: job.gifts });
    this.recent.length = Math.min(this.recent.length, 3);
    if (job.demo) this.demoWritten++;
    this.demoAt = this.now() + this.demoDelay(job.demo);
    this.touch();
    this.emit({ type: 'done', no: job.no, recent: this.recent, written: this.written });
  }

  // Sau tờ tự chạy nghỉ ngắn, thỉnh thoảng nghỉ dài để tờ mời ghi danh kịp hiện; sau tờ người thật thì chờ lâu hơn một chút.
  demoDelay(wasDemo) {
    const cfg = this.cfg.demo;
    if (!cfg) return 0;
    if (!wasDemo) {
      this.demoStreak = 0;
      return cfg.idleSeconds * 1000;
    }
    if (++this.demoStreak >= cfg.inviteEvery) {
      this.demoStreak = 0;
      return cfg.inviteSeconds * 1000;
    }
    const [min, max] = cfg.gapSeconds;
    return (min + (max - min) * this.random()) * 1000;
  }

  pickDemoTier() {
    const rows = this.tiers.map((tier) => [tier, this.cfg.demo.weights[tier.id] ?? 0]);
    let roll = this.random() * rows.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [tier, weight] of rows) {
      roll -= weight;
      if (weight > 0 && roll < 0) return tier;
    }
    return rows.find(([, weight]) => weight > 0)[0];
  }

  startDemo() {
    const person = this.pick(this.people);
    const tier = this.pickDemoTier();
    this.start({ id: `demo:${person.name}`, name: person.name, spoken: person.spoken, avatar: person.avatar, coins: tier.minCoins, gifts: 0, seq: 0 }, { demo: true });
  }

  setDemo(on) {
    this.demoOn = Boolean(on && this.people.length);
    this.touch();
  }

  tick() {
    const now = this.now();
    // Có người thật: bỏ ngay tờ tự chạy, tờ dở không tính vào số đã ghi.
    const preempted = Boolean(this.job?.demo && this.queue.size);
    if (preempted) this.job = null;
    if (this.job && now - this.job.startedAt >= this.job.total) this.finish();
    if (!this.job) {
      const next = this.pickNext();
      if (next) this.start(next, { preempted });
      else if (this.demoOn && this.canDemo()) {
        this.demoAt ??= now + this.cfg.demo.idleSeconds * 1000;
        if (now >= this.demoAt) {
          this.demoAt = null;
          this.startDemo();
        }
      }
    }
    if (this.queueDirty && now - this.lastQueueAt >= 250) {
      this.queueDirty = false;
      this.lastQueueAt = now;
      this.emit({ type: 'queue', ...this.view() });
    }
  }

  view() {
    return {
      total: this.queue.size,
      written: this.written,
      demo: { on: this.demoOn, written: this.demoWritten, people: this.people.length },
      next: this.ordered()
        .slice(0, this.cfg.boardNames)
        .map((entry) => ({ name: entry.name, avatar: entry.avatar, tier: this.tierFor(entry.coins).id })),
    };
  }

  snapshot() {
    return { job: this.job, serverNow: this.now(), recent: this.recent, ...this.view() };
  }

  // Xóa hàng chờ; tờ đang viết dở vẫn viết nốt.
  clearQueue() {
    this.queue.clear();
    this.likes.clear();
    this.touch();
  }

  // Tờ đang viết dở được lưu lại như đang chờ, để tắt máy giữa chừng người ta vẫn được viết. Tờ tự chạy thì bỏ.
  exportState() {
    const { job } = this;
    const waiting = [...this.queue.values()];
    const replay = job && !job.demo && !this.queue.has(job.id) ? [{ id: job.id, name: job.name, avatar: job.avatar, coins: job.coins, gifts: job.gifts, seq: job.seq }] : [];
    return { written: this.written, demoWritten: this.demoWritten, seq: this.seq, recent: this.recent, queue: [...replay, ...waiting] };
  }

  importState(state) {
    this.written = Number(state?.written) || 0;
    this.demoWritten = Number(state?.demoWritten) || 0;
    this.seq = Number(state?.seq) || 0;
    this.recent = Array.isArray(state?.recent) ? state.recent.slice(0, 3) : [];
    this.queue.clear();
    for (const entry of Array.isArray(state?.queue) ? state.queue : []) {
      if (entry?.id && entry.name) this.queue.set(entry.id, { avatar: '', coins: 0, gifts: 0, seq: ++this.seq, ...entry });
    }
    this.stateDirty = false;
  }
}
