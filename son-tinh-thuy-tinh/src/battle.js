// Luật Sơn Tinh – Thủy Tinh, không dính gì tới TikTok hay trình duyệt để test được bằng đồng hồ giả.
// Một trận: chọn phe -> các hiệp (mỗi hiệp tối đa roundSeconds) -> phe thắng đủ winsToMarry hiệp trước rước Mị Nương
// -> trận mới, mọi người chọn phe lại.
// Trong hiệp hai phe cùng đoán một từ. Người đoán đúng đầu tiên làm phe kia mất wordDamage + quà của phe mình.
// Quà cộng vào sức mỗi từ của phe ứng với quà, chỉ trong hiệp đang đấu; quà gửi lúc nghỉ tính cho hiệp kế tiếp.
import { Puzzle, sideMatcher } from './words.js';

export const SIDES = ['son', 'thuy'];
const other = (side) => (side === 'son' ? 'thuy' : 'son');
const pair = (value) => ({ son: value, thuy: value });
const hashOf = (text) => Array.from(String(text)).reduce((sum, ch) => (sum * 31 + ch.codePointAt(0)) % 100_000, 7);

const MAX_PLAYERS = 5000;
// Hết giờ chọn phe mà còn thiếu người: đủ người rồi thì chờ thêm chừng này mới vào hiệp.
const LAST_CALL_MS = 5000;
// Nhắc người chưa chọn phe: mỗi người một lần mỗi phút, cả phòng cách nhau ít nhất 4 giây.
const NUDGE_EACH_MS = 60_000;
const NUDGE_GAP_MS = 4000;

export class Battle {
  constructor(config, { deck, emit = () => {}, now = Date.now, rng = Math.random }) {
    this.config = config;
    this.deck = deck;
    this.emit = emit;
    this.now = now;
    this.rng = rng;
    const t = config.timing;
    this.ms = {
      lobby: t.lobbySeconds * 1000,
      round: t.roundSeconds * 1000,
      word: t.wordSeconds * 1000,
      hint: t.hintEverySeconds * 1000,
      solved: t.solvedSeconds * 1000,
      roundEnd: t.roundEndSeconds * 1000,
      matchEnd: t.matchEndSeconds * 1000,
    };
    this.sideOf = sideMatcher(config.sides);
    this.gifts = config.gifts.map((g) => ({
      ...g,
      idSet: new Set((g.ids ?? []).map(String)),
      nameSet: new Set((g.names ?? []).map((name) => String(name).trim().toLowerCase())),
    }));
    this.bonus = pair(0);
    this.nudged = new Map();
    this.lastNudge = -Infinity;
    this.stateDirty = false;
    this.newMatch();
  }

  newMatch() {
    this.players = new Map(); // id người xem -> { pid, name, side, look, at, words, wordsAt }
    this.count = pair(0);
    this.nextPid = 1;
    this.wins = pair(0);
    this.round = 0;
    this.hp = pair(this.config.hp);
    this.word = null;
    this.wordNo = 0;
    this.roundHits = new Map();
    this.result = null;
    this.champion = null;
    this.phase = 'lobby';
    this.endsAt = this.now() + this.ms.lobby;
  }

  // ---------- Trạng thái gửi xuống màn hình ----------
  damageOf(side) {
    return this.config.wordDamage + this.bonus[side];
  }

  ready() {
    return SIDES.every((side) => this.count[side] >= this.config.minPlayersPerSide);
  }

  publicPlayer({ pid, name, side, look, at, words }) {
    return { pid, name, side, look, at, words };
  }

  publicWord() {
    const w = this.word;
    if (!w) return null;
    return {
      no: w.no,
      topic: w.puzzle.topic,
      // Chỉ lộ cả từ khi đã có người đoán ra hoặc hết giờ.
      tiles: w.done ? [...w.puzzle.chars] : w.puzzle.tiles(),
      startedAt: w.startedAt,
      endsAt: w.endsAt,
      done: w.done && { kind: w.done.kind, name: w.done.name ?? '', side: w.done.side ?? null, damage: w.done.damage ?? 0 },
    };
  }

  state() {
    return {
      phase: this.phase,
      round: this.round,
      endsAt: this.endsAt,
      wins: { ...this.wins },
      hp: { ...this.hp },
      bonus: { ...this.bonus },
      damage: { son: this.damageOf('son'), thuy: this.damageOf('thuy') },
      counts: { ...this.count },
      word: this.publicWord(),
      result: this.result,
      champion: this.champion,
    };
  }

  snapshot() {
    return { ...this.state(), players: [...this.players.values()].map((p) => this.publicPlayer(p)) };
  }

  send(type, fields = {}) {
    this.stateDirty = true;
    this.emit({ type, ...fields, state: this.state() });
  }

  // ---------- Vòng chơi ----------
  tick() {
    const t = this.now();
    if (this.phase === 'lobby') {
      if (t >= this.endsAt && this.ready()) this.startRound();
    } else if (this.phase === 'round') {
      if (t >= this.endsAt) this.finishRound('time');
      else this.tickWord(t);
    } else if (this.phase === 'roundEnd') {
      if (t >= this.endsAt) this.afterRound();
    } else if (this.phase === 'matchEnd' && t >= this.endsAt) this.reset();
  }

  startRound() {
    const t = this.now();
    this.round++;
    this.phase = 'round';
    this.hp = pair(this.config.hp);
    this.endsAt = t + this.ms.round;
    this.result = null;
    this.roundHits = new Map();
    this.nextWord(t, false);
    this.send('round-start', { round: this.round });
  }

  nextWord(t, announce = true) {
    const { start, max } = this.config.hints;
    this.wordNo++;
    this.word = {
      no: this.wordNo,
      puzzle: new Puzzle(this.deck.next(), { rng: this.rng, start, max }),
      startedAt: t,
      endsAt: t + this.ms.word,
      nextHintAt: t + this.ms.hint,
      done: null,
    };
    if (announce) this.send('word');
  }

  tickWord(t) {
    const w = this.word;
    if (!w) return this.nextWord(t);
    if (w.done) {
      if (t >= w.done.until) this.nextWord(t);
      return;
    }
    if (t >= w.endsAt) return this.closeWord('timeout');
    if (this.ms.hint > 0 && t >= w.nextHintAt) {
      w.nextHintAt = t + this.ms.hint;
      const hint = w.puzzle.hint();
      if (hint) this.send('hint', hint);
    }
  }

  closeWord(kind) {
    const w = this.word;
    w.done = { kind, until: this.now() + this.ms.solved };
    this.send('timeout', { kind, answer: w.puzzle.display });
  }

  finishRound(reason) {
    const { son, thuy } = this.hp;
    const winner = son === thuy ? null : son > thuy ? 'son' : 'thuy';
    if (winner) this.wins[winner]++;
    const w = this.word;
    const mvp = [...this.roundHits.values()].sort((a, b) => b.words - a.words || a.at - b.at)[0];
    this.result = {
      round: this.round,
      winner,
      reason,
      hp: { ...this.hp },
      answer: w && !w.done ? w.puzzle.display : '',
      mvp: mvp ? { name: mvp.name, side: mvp.side, words: mvp.words } : null,
    };
    this.phase = 'roundEnd';
    this.endsAt = this.now() + this.ms.roundEnd;
    this.word = null;
    // Quà chỉ có tác dụng trong hiệp vừa đấu.
    this.bonus = pair(0);
    this.send('round-end', this.result);
  }

  afterRound() {
    const side = SIDES.find((s) => this.wins[s] >= this.config.winsToMarry);
    if (!side) return this.startRound();
    this.phase = 'matchEnd';
    this.endsAt = this.now() + this.ms.matchEnd;
    this.champion = { side, wins: { ...this.wins }, top: this.topPlayers(3) };
    this.send('match-end', this.champion);
  }

  // Bằng số từ thì ai đạt số đó trước đứng trên.
  topPlayers(n) {
    return [...this.players.values()]
      .filter((p) => p.words > 0)
      .sort((a, b) => b.words - a.words || a.wordsAt - b.wordsAt)
      .slice(0, n)
      .map(({ name, side, words }) => ({ name, side, words }));
  }

  // hard: xóa cả quà đang chờ (bảng điều khiển). Trận mới tự mở sau Mị Nương thì giữ quà gửi lúc ăn mừng.
  reset({ hard = false } = {}) {
    if (hard) this.bonus = pair(0);
    this.newMatch();
    this.send('reset');
  }

  // ---------- Người xem ----------
  comment(who, text) {
    const t = this.now();
    const player = this.players.get(who.id);
    if (!player) {
      const side = this.sideOf(text);
      if (side) return this.join(who, side) ? 'join' : null;
      if (this.phase === 'lobby' || this.phase === 'round') return this.nudge(who, t) ? 'nudge' : null;
      return null;
    }
    player.name = who.name;
    const w = this.word;
    if (this.phase === 'round' && w && !w.done && w.puzzle.matches(text)) {
      this.solve(player, t);
      return 'hit';
    }
    // Đã có phe thì không đổi được tới hết trận; comment tên phe chỉ làm lính của mình vẫy tay.
    if (this.sideOf(text)) {
      player.at = t;
      this.emit({ type: 'wave', pid: player.pid });
      return 'wave';
    }
    return null;
  }

  join(who, side) {
    if (this.players.size >= MAX_PLAYERS) return null;
    const t = this.now();
    const player = { pid: this.nextPid++, name: who.name, side, look: hashOf(who.id), at: t, words: 0, wordsAt: 0 };
    this.players.set(who.id, player);
    this.count[side]++;
    if (this.phase === 'lobby' && t >= this.endsAt && this.ready()) this.endsAt = t + LAST_CALL_MS;
    this.send('join', { player: this.publicPlayer(player) });
    return player;
  }

  nudge(who, t) {
    if (t - this.lastNudge < NUDGE_GAP_MS) return false;
    if (t - (this.nudged.get(who.id) ?? -Infinity) < NUDGE_EACH_MS) return false;
    this.nudged.delete(who.id);
    this.nudged.set(who.id, t);
    if (this.nudged.size > 5000) this.nudged.delete(this.nudged.keys().next().value);
    this.lastNudge = t;
    this.emit({ type: 'nudge', name: who.name });
    return true;
  }

  solve(player, t) {
    const w = this.word;
    const { side } = player;
    const target = other(side);
    const damage = this.damageOf(side);
    this.hp[target] = Math.max(0, this.hp[target] - damage);
    player.at = t;
    player.words++;
    player.wordsAt = t;
    const hits = this.roundHits.get(player.pid) ?? { name: player.name, side, words: 0, at: t };
    hits.name = player.name;
    hits.words++;
    hits.at = t;
    this.roundHits.set(player.pid, hits);
    w.done = { kind: 'solved', name: player.name, side, damage, until: t + this.ms.solved };
    this.send('hit', { pid: player.pid, name: player.name, side, target, damage, answer: w.puzzle.display });
    if (this.hp[target] <= 0) this.finishRound('ko');
  }

  // ---------- Quà ----------
  findGift({ id, name }) {
    const key = String(id ?? '').trim();
    const label = String(name ?? '').trim().toLowerCase();
    return (key && this.gifts.find((g) => g.idSet.has(key))) || (label && this.gifts.find((g) => g.nameSet.has(label))) || null;
  }

  // count: số quà mới (combo đã được tính phần tăng thêm ở server).
  gift(who, info, count = 1) {
    const gift = this.findGift(info);
    if (!gift) return null;
    const n = Math.max(1, Math.trunc(count) || 1);
    const added = gift.bonus * n;
    this.bonus[gift.side] += added;
    // Người chưa chọn phe gửi quà của phe nào thì vào phe đó; đã có phe thì giữ nguyên phe.
    const player = this.players.get(who.id) ?? this.join(who, gift.side);
    if (player) {
      player.name = who.name;
      player.at = this.now();
    }
    this.send('gift', { side: gift.side, name: who.name, pid: player?.pid ?? null, label: gift.label, icon: gift.icon ?? '', count: n, added, later: this.phase !== 'round' });
    return { side: gift.side, added };
  }

  // ---------- Bảng điều khiển ----------
  advance() {
    if (this.phase === 'lobby') this.startRound();
    else if (this.phase === 'roundEnd') this.afterRound();
    else if (this.phase === 'matchEnd') this.reset();
    else return false;
    return true;
  }

  revealMore() {
    const w = this.word;
    if (this.phase !== 'round' || !w || w.done) return false;
    const hint = w.puzzle.hint();
    if (!hint) return false;
    w.nextHintAt = this.now() + this.ms.hint;
    this.send('hint', hint);
    return true;
  }

  skipWord() {
    const w = this.word;
    if (this.phase !== 'round' || !w || w.done) return false;
    this.closeWord('skip');
    return true;
  }

  endRound() {
    if (this.phase !== 'round') return false;
    this.finishRound('time');
    return true;
  }

  answerText() {
    const w = this.word;
    return this.phase === 'round' && w && !w.done ? w.puzzle.answer : '';
  }

  // ---------- Lưu và nạp lại ----------
  exportState() {
    return {
      v: 1,
      over: this.phase === 'matchEnd' || SIDES.some((side) => this.wins[side] >= this.config.winsToMarry),
      // Hiệp đang dở thì lần sau đấu lại từ đầu hiệp đó.
      round: this.round - (this.phase === 'round' ? 1 : 0),
      wins: this.wins,
      bonus: this.bonus,
      nextPid: this.nextPid,
      players: [...this.players],
    };
  }

  importState(state) {
    if (state?.v !== 1 || state.over) return;
    for (const [id, p] of state.players ?? []) {
      if (!id || !SIDES.includes(p?.side) || !Number.isInteger(p.pid) || this.players.has(id)) continue;
      this.players.set(id, { pid: p.pid, name: String(p.name ?? ''), side: p.side, look: Number(p.look) || 0, at: Number(p.at) || 0, words: Math.max(0, p.words | 0), wordsAt: Number(p.wordsAt) || 0 });
      this.count[p.side]++;
    }
    this.nextPid = Math.max(Number(state.nextPid) || 1, ...[...this.players.values()].map((p) => p.pid + 1));
    for (const side of SIDES) {
      this.wins[side] = Math.max(0, state.wins?.[side] | 0);
      this.bonus[side] = Math.max(0, state.bonus?.[side] | 0);
    }
    this.round = Math.max(0, state.round | 0);
    // Cho người mới thêm thời gian chọn phe rồi đấu tiếp.
    this.phase = 'lobby';
    this.endsAt = this.now() + this.ms.lobby;
  }
}
