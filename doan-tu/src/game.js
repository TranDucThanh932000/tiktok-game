// Luật chơi, không đụng tới mạng hay file: ai comment đúng từ đang đoán được +1 điểm
// (có lượt x2 thì +2), mỗi người một lần mỗi từ. Bảng điểm cộng dồn cả buổi.
import { Puzzle } from './words.js';

const BOARD_EVERY_MS = 400;
const SAVED_PLAYERS = 5000;
const SOLVER_NAMES = 12;

export class WordGame {
  constructor(config, { deck, emit = () => {}, now = Date.now, rng = Math.random }) {
    this.config = config;
    this.deck = deck;
    this.emit = emit;
    this.now = now;
    this.rng = rng;
    const t = config.timing;
    this.ms = {
      word: t.wordSeconds * 1000,
      afterFirst: t.afterFirstSeconds * 1000,
      hintEvery: t.hintEverySeconds * 1000,
      grace: t.graceSeconds * 1000,
      reveal: t.revealSeconds * 1000,
      socialGap: config.boost.socialGapSeconds * 1000,
    };
    this.tiers = [...config.boost.tiers].sort((a, b) => b.coins - a.coins);
    this.players = new Map(); // id -> { id, key, name, score, reachedAt, look }
    this.boosts = new Map(); // id -> lượt x2 còn lại
    this.patrons = new Map(); // id -> hình quà
    this.socialAt = new Map();
    this.serial = 0;
    this.no = 0;
    this.phase = 'idle';
    this.puzzle = null;
    this.solvers = new Map(); // id -> { name, delta, boosted }
    this.endsAt = 0;
    this.nextLetterAt = 0;
    this.stateDirty = false;
    this.boardDirty = false;
    this.boardSentAt = 0;
  }

  // ---------- Người chơi ----------
  player(who) {
    let player = this.players.get(who.id);
    if (!player) {
      player = { id: who.id, key: `p${++this.serial}`, name: who.name, score: 0, reachedAt: 0, look: lookOf(who.id) };
      this.players.set(who.id, player);
    }
    player.name = who.name;
    // Ảnh TikTok có hạn dùng nên chỉ giữ trong bộ nhớ, không lưu ra file.
    if (who.avatar) player.avatar = who.avatar;
    return player;
  }

  // Bằng điểm thì ai đạt điểm đó trước đứng trên, để thứ hạng không đổi qua đổi lại.
  ranking() {
    return [...this.players.values()]
      .filter((p) => p.score > 0 || this.boosts.has(p.id))
      .sort((a, b) => b.score - a.score || a.reachedAt - b.reachedAt);
  }

  board() {
    return this.ranking()
      .slice(0, this.config.seats)
      .map((p) => {
        const turns = this.boosts.get(p.id) ?? 0;
        return { key: p.key, name: p.name, score: p.score, look: p.look, turns, icon: turns > 0 ? (this.patrons.get(p.id) ?? null) : null };
      });
  }

  sendBoard(t = this.now()) {
    this.boardDirty = false;
    this.boardSentAt = t;
    this.emit({ type: 'board', board: this.board(), players: this.ranking().length });
  }

  // ---------- Vòng đoán ----------
  tick() {
    const t = this.now();
    if (this.phase === 'idle') this.ask(t);
    else if (this.phase === 'asking') {
      if (t >= this.endsAt + this.ms.grace) this.reveal(t);
      // Chưa ai đoán ra thì cứ vài giây mở thêm một chữ.
      else if (!this.solvers.size && this.ms.hintEvery > 0 && t >= this.nextLetterAt && t < this.endsAt) {
        this.nextLetterAt = t + this.ms.hintEvery;
        this.openLetter();
      }
    } else if (this.phase === 'reveal' && t >= this.endsAt) this.ask(t);
    if (this.boardDirty && t - this.boardSentAt >= BOARD_EVERY_MS) this.sendBoard(t);
  }

  ask(t) {
    const { start, max } = this.config.hints;
    this.no++;
    this.puzzle = new Puzzle(this.deck.next(), { rng: this.rng, start, max });
    this.solvers = new Map();
    this.askedAt = t;
    this.phase = 'asking';
    this.endsAt = t + this.ms.word;
    this.nextLetterAt = t + this.ms.hintEvery;
    this.stateDirty = true;
    this.emit({ type: 'word', ...this.publicWord() });
  }

  publicWord() {
    const p = this.puzzle;
    return { no: this.no, topic: p.topic, hint: p.hint, tiles: p.tiles(), letters: p.letters, endsAt: this.endsAt };
  }

  openLetter() {
    if (this.phase !== 'asking') return false;
    const opened = this.puzzle.openLetter();
    if (!opened) return false;
    this.emit({ type: 'letter', ...opened, left: this.puzzle.limit - this.puzzle.shown });
    return true;
  }

  // Trả về true nếu comment là đáp án đúng (kể cả người đã đoán ra rồi), để server không xử lý thêm.
  comment(who, text) {
    if (this.phase !== 'asking' || !this.puzzle.matches(text)) return false;
    if (this.solvers.has(who.id)) return true;
    const t = this.now();
    const player = this.player(who);
    const turns = this.boosts.get(who.id) ?? 0;
    const boosted = turns > 0;
    if (turns > 1) this.boosts.set(who.id, turns - 1);
    else this.boosts.delete(who.id);
    const delta = boosted ? this.config.boost.multiplier : 1;
    player.score += delta;
    player.reachedAt = t;
    const first = this.solvers.size === 0;
    this.solvers.set(who.id, { name: player.name, delta, boosted, at: t });
    // Có người đoán ra thì chỉ chờ thêm một lúc cho các bạn khác, không bắt cả phòng ngồi đợi hết giờ.
    if (first) this.endsAt = Math.min(this.endsAt, t + this.ms.afterFirst);
    this.stateDirty = true;
    this.boardDirty = true;
    this.emit({ type: 'correct', key: player.key, name: player.name, delta, boosted, turns: this.boosts.get(who.id) ?? 0, score: player.score, first, count: this.solvers.size, endsAt: this.endsAt });
    return true;
  }

  reveal(t) {
    this.phase = 'reveal';
    this.endsAt = t + this.ms.reveal;
    this.emit({ type: 'reveal', ...this.publicReveal() });
    this.sendBoard(t);
  }

  // fastest: bạn đoán đúng đầu tiên, màn hình hiện ảnh và tên trong lúc công bố.
  publicReveal() {
    const [firstId, first] = this.solvers.entries().next().value ?? [];
    const player = firstId === undefined ? null : this.players.get(firstId);
    const fastest = player
      ? { name: player.name, avatar: player.avatar ?? '', look: player.look, delta: first.delta, score: player.score, seconds: Math.max(1, Math.round((first.at - this.askedAt) / 1000)) }
      : null;
    return { answer: this.puzzle.display, count: this.solvers.size, endsAt: this.endsAt, fastest };
  }

  // Bảng điều khiển: bỏ qua từ đang đoán (công bố luôn) hoặc sang từ mới ngay khi đang công bố.
  skip() {
    const t = this.now();
    if (this.phase === 'asking') this.reveal(t);
    else this.ask(t);
    return true;
  }

  // ---------- Lượt x2 ----------
  // Quà to tính theo mức gần nhất nhân lên (99 xu = 9 lần mức 10 xu), để quà to không bao giờ được ít hơn quà nhỏ.
  turnsFor(coins) {
    const tier = this.tiers.find((row) => coins >= row.coins);
    return tier ? { turns: tier.turns * Math.floor(coins / tier.coins), icon: tier.icon } : null;
  }

  gift(who, coins, count = 1) {
    const reward = this.turnsFor(coins);
    if (!reward) return null;
    this.patrons.set(who.id, reward.icon);
    return this.addTurns(who, reward.turns * count, { icon: reward.icon });
  }

  // Follow, share: mỗi người tính tối đa một lần mỗi socialGap (dùng chung cho cả hai).
  social(who, kind) {
    const t = this.now();
    if (t - (this.socialAt.get(who.id) ?? -Infinity) < this.ms.socialGap) return null;
    this.socialAt.delete(who.id);
    this.socialAt.set(who.id, t);
    if (this.socialAt.size > 5000) this.socialAt.delete(this.socialAt.keys().next().value);
    return this.addTurns(who, this.config.boost.socialTurns, { kind });
  }

  addTurns(who, added, { icon, kind }) {
    const player = this.player(who);
    const turns = (this.boosts.get(who.id) ?? 0) + added;
    this.boosts.set(who.id, turns);
    this.stateDirty = true;
    this.boardDirty = true;
    this.emit({ type: 'boost', key: player.key, name: player.name, added, turns, icon: icon ?? null, kind: kind ?? null });
    return { added, turns };
  }

  // ---------- Toàn bộ trạng thái ----------
  snapshot() {
    return {
      phase: this.phase,
      word: this.puzzle ? this.publicWord() : null,
      solvers: [...this.solvers.values()].slice(0, SOLVER_NAMES).map(({ name, boosted }) => ({ name, boosted })),
      solved: [...this.solvers.keys()].map((id) => this.players.get(id)?.key).filter(Boolean),
      count: this.solvers.size,
      reveal: this.phase === 'reveal' ? this.publicReveal() : null,
      board: this.board(),
      players: this.ranking().length,
    };
  }

  reset() {
    this.players.clear();
    this.boosts.clear();
    this.patrons.clear();
    this.socialAt.clear();
    this.no = 0;
    this.stateDirty = true;
    this.ask(this.now());
    this.sendBoard();
    this.emit({ type: 'snapshot-game', game: this.snapshot() });
  }

  exportState() {
    const keep = this.ranking().slice(0, SAVED_PLAYERS);
    return {
      no: this.no,
      players: keep.map(({ id, name, score, reachedAt }) => ({ id, name, score, reachedAt })),
      boosts: [...this.boosts].filter(([id]) => this.players.has(id)),
      patrons: [...this.patrons].filter(([id]) => this.boosts.has(id)),
    };
  }

  importState(state) {
    if (!state || typeof state !== 'object') return;
    this.no = Number.isInteger(state.no) && state.no >= 0 ? state.no : 0;
    for (const row of Array.isArray(state.players) ? state.players : []) {
      if (typeof row?.id !== 'string' || typeof row.name !== 'string' || !Number.isInteger(row.score) || row.score < 0) continue;
      const player = this.player({ id: row.id, name: row.name });
      player.score = row.score;
      player.reachedAt = Number(row.reachedAt) || 0;
    }
    for (const [id, turns] of Array.isArray(state.boosts) ? state.boosts : []) {
      if (this.players.has(id) && Number.isInteger(turns) && turns > 0) this.boosts.set(id, turns);
    }
    for (const [id, icon] of Array.isArray(state.patrons) ? state.patrons : []) {
      if (this.boosts.has(id) && typeof icon === 'string') this.patrons.set(id, icon);
    }
  }
}

// Kiểu tóc, màu da của hình chibi: cố định theo người chơi.
export function lookOf(id) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return (h >>> 0) % 360;
}
