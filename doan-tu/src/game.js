// Luật chơi, không đụng tới mạng hay file: ai comment đúng từ đang đoán được +1 điểm
// (có lượt x2 từ follow/share thì +2), mỗi người một lần mỗi từ. Bảng điểm cộng dồn cả buổi.
// Quà không đụng tới điểm: quà nào cũng có cảnh vui trong lớp, góp vào quỹ lớp, và đưa tên người đó lên bảng.
// Bạn ngồi trong lớp mà im lặng mấy từ liền là ngủ gật: thầy giám thị kéo tai ra ngoài (giữ điểm), comment lại là được vào.
import { Puzzle } from './words.js';

const BOARD_EVERY_MS = 400;
const SAVED_PLAYERS = 5000;
const SOLVER_NAMES = 12;
const FUND_THANKS = 3;
// Thầy giám thị: mỗi lần kéo một bạn, màn hình diễn trong PULL_MS (đi vào, mắng, kéo tai ra cửa).
export const PULL_MS = 9000;
const PULL_START_MS = 2500;
const PULL_GAP_MS = 1000;
const PATROL_EVERY_MS = 1000;

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
    this.scenes = [...config.gifts.scenes].sort((a, b) => b.coins - a.coins);
    this.fundGoal = config.gifts.fundGoal;
    // Quà lên ngồi ghế VIP (Tim cam / Heart Me), nhận theo tên hoặc mã quà; người gửi cuối cùng được ngồi.
    const photo = config.gifts.photoGift;
    this.photoNames = new Set(photo.names.map(giftKey));
    this.photoIds = new Set(photo.ids.map(String));
    this.photoIcon = photo.icon;
    this.players = new Map(); // id -> { id, key, name, score, reachedAt, look }
    this.boosts = new Map(); // id -> lượt x2 còn lại (chỉ từ follow, share)
    this.fund = { coins: 0, by: new Map() }; // quỹ lớp: xu góp từ quà; by: id -> { name, coins }
    this.honor = null; // người ngồi ghế VIP: { id, name }
    this.socialAt = new Map();
    // Thầy giám thị (sleepWords 0 là tắt): bạn ngồi trong lớp mà không comment suốt sleepWords từ liền là ngủ gật.
    const monitor = config.monitor ?? {};
    this.sleepWords = monitor.sleepWords ?? 0;
    this.perWord = monitor.perWord ?? 1;
    this.monitorLines = monitor.lines ?? [];
    this.monitorReplies = monitor.replies ?? [];
    this.pull = null; // bạn đang bị kéo ra: { id, key, at, until }
    this.pulls = 0; // số lần thầy vào lớp trong từ đang hỏi
    this.pullFreeAt = 0;
    this.patrolAt = 0;
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
      // seenNo: từ cuối cùng bạn ấy comment (hoặc tặng quà, follow, share). out: bị thầy giám thị kéo ra khỏi lớp.
      player = { id: who.id, key: `p${++this.serial}`, name: who.name, score: 0, reachedAt: 0, look: lookOf(who.id), seenNo: this.no, seenAt: this.now(), out: false };
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

  // Ai đang ngồi trong lớp: top bảng điểm, trừ các bạn đã bị thầy giám thị kéo ra.
  seated() {
    return this.ranking()
      .filter((p) => !p.out)
      .slice(0, this.config.seats);
  }

  board() {
    return this.seated().map((p) => ({ key: p.key, name: p.name, score: p.score, look: p.look, turns: this.boosts.get(p.id) ?? 0, sleepy: this.sleepy(p) }));
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
    this.patrol(t);
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
    this.pulls = 0;
    // Sang từ mới thì ai im lặng từ trước bắt đầu ngủ gật (💤).
    if (this.sleepWords) this.boardDirty = true;
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
  // Comment gì cũng tính là thức: hết ngủ gật, đang ở ngoài thì được vào lớp lại.
  comment(who, text) {
    const known = this.players.get(who.id);
    if (known) this.wake(known);
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

  // ---------- Quà: cảnh vui, quỹ lớp, ghế VIP (không đụng tới điểm) ----------
  // Cảnh theo tổng xu của lần nhận: quà to hơn thì cảnh to hơn.
  sceneFor(coins) {
    return this.scenes.find((row) => coins >= row.coins) ?? null;
  }

  // image: hình quà thật từ TikTok (có thể rỗng), màn hình dùng hình của mức cảnh nếu không có. name, id: tên và mã quà TikTok.
  gift(who, coins, count = 1, { image = '', name = '', id = '' } = {}) {
    const total = coins * count;
    const scene = this.sceneFor(total);
    if (!scene) return null;
    const player = this.player(who);
    this.wake(player);
    const photo = this.photoNames.has(giftKey(name)) || this.photoIds.has(String(id));
    this.emit({ type: 'gift', key: player.key, name: player.name, avatar: player.avatar ?? '', look: player.look, coins: total, count, scene: scene.scene, photo, icon: image || (photo ? this.photoIcon : scene.icon) });
    if (photo) this.hangPhoto(player);
    this.addFund(player, total);
    this.stateDirty = true;
    return { scene: scene.scene, fund: this.fund.coins, photo };
  }

  // Ghế VIP: người gửi Tim cam cuối cùng được ngồi.
  hangPhoto(player) {
    const changed = this.honor?.id !== player.id || this.honor.name !== player.name;
    this.honor = { id: player.id, name: player.name };
    if (changed) this.emit({ type: 'honor', ...this.publicHonor() });
  }

  // Ảnh TikTok chỉ có trong bộ nhớ: bật lại server thì hiện mặt chibi tới khi có người gửi tiếp.
  publicHonor() {
    if (!this.honor) return null;
    const player = this.players.get(this.honor.id);
    return { name: this.honor.name, avatar: player?.avatar ?? '', look: player?.look ?? lookOf(this.honor.id) };
  }

  addFund(player, coins) {
    const fund = this.fund;
    const before = fund.coins;
    fund.coins += coins;
    const mine = fund.by.get(player.id) ?? { name: player.name, coins: 0 };
    mine.name = player.name;
    mine.coins += coins;
    fund.by.set(player.id, mine);
    if (fund.coins < this.fundGoal) {
      this.emit({ type: 'fund', coins: fund.coins, goal: this.fundGoal, near: before < this.fundGoal * 0.9 && fund.coins >= this.fundGoal * 0.9 });
      return;
    }
    this.candy(Math.floor(fund.coins / this.fundGoal));
    // Phần dư sang quỹ mới tính cho người vừa góp.
    if (fund.coins > 0) fund.by.set(player.id, { name: player.name, coins: fund.coins });
  }

  // Quỹ đủ: cô phát kẹo cả lớp. Phần dư sang quỹ mới; quà quá to thì một lần phát kẹo vẫn tính đủ số lần.
  candy(times = 1) {
    const fund = this.fund;
    const thanks = [...fund.by.entries()]
      .sort((a, b) => b[1].coins - a[1].coins)
      .slice(0, FUND_THANKS)
      .map(([id, row]) => ({ name: row.name, avatar: this.players.get(id)?.avatar ?? '', look: this.players.get(id)?.look ?? 0 }));
    fund.coins = Math.max(0, fund.coins - times * this.fundGoal);
    fund.by = new Map();
    this.stateDirty = true;
    this.emit({ type: 'candy', times, thanks, coins: fund.coins, goal: this.fundGoal });
    return true;
  }

  // Follow, share: mỗi người tính tối đa một lần mỗi socialGap (dùng chung cho cả hai).
  social(who, kind) {
    const t = this.now();
    if (t - (this.socialAt.get(who.id) ?? -Infinity) < this.ms.socialGap) return null;
    this.socialAt.delete(who.id);
    this.socialAt.set(who.id, t);
    if (this.socialAt.size > 5000) this.socialAt.delete(this.socialAt.keys().next().value);
    return this.addTurns(who, this.config.boost.socialTurns, kind);
  }

  addTurns(who, added, kind) {
    const player = this.player(who);
    this.wake(player);
    const turns = (this.boosts.get(who.id) ?? 0) + added;
    this.boosts.set(who.id, turns);
    this.stateDirty = true;
    this.boardDirty = true;
    this.emit({ type: 'boost', key: player.key, name: player.name, added, turns, kind });
    return { added, turns };
  }

  // ---------- Thầy giám thị: kéo tai bạn ngủ gật ra khỏi lớp ----------
  // Số từ đã hỏi xong mà bạn ấy không comment gì. Từ 1 là ngủ gật (💤), đủ sleepWords là bị kéo ra.
  missed(player) {
    return this.no - 1 - player.seenNo;
  }

  sleepy(player) {
    return this.sleepWords > 0 && this.missed(player) >= 1;
  }

  wake(player) {
    const was = this.sleepy(player);
    player.seenNo = this.no;
    player.seenAt = this.now();
    if (player.out) {
      player.out = false;
      this.stateDirty = true;
      this.boardDirty = true;
    } else if (was) this.boardDirty = true;
  }

  // Ngủ lâu nhất bị kéo trước; bằng nhau thì theo thứ hạng.
  sleepers() {
    if (!this.sleepWords) return [];
    return this.seated()
      .filter((p) => this.missed(p) >= this.sleepWords)
      .sort((a, b) => a.seenNo - b.seenNo);
  }

  // Mỗi lần một bạn, chỉ lúc đang hỏi (lúc công bố có khung bạn nhanh nhất che giữa màn hình), tối đa perWord bạn mỗi từ.
  patrol(t) {
    if (this.pull) {
      if (t >= this.pull.until) this.endPull(t);
      return;
    }
    if (!this.sleepWords || this.phase !== 'asking' || this.pulls >= this.perWord || t < this.pullFreeAt || t < this.patrolAt) return;
    if (t < this.askedAt + PULL_START_MS || this.endsAt - t < PULL_MS * 0.6) return;
    this.patrolAt = t + PATROL_EVERY_MS;
    const [player] = this.sleepers();
    if (player) this.startPull(player, t);
  }

  startPull(player, t) {
    this.pull = { id: player.id, key: player.key, at: t, until: t + PULL_MS };
    this.pulls++;
    const pick = (list) => list[Math.floor(this.rng() * list.length)] ?? '';
    this.emit({ type: 'monitor', key: player.key, name: player.name, ms: PULL_MS, line: pick(this.monitorLines), reply: pick(this.monitorReplies), first: this.pulls === 1 });
  }

  // Bị kéo ra mà kịp comment thì thầy tha, cho về chỗ.
  endPull(t) {
    const { id, key, at } = this.pull;
    this.pull = null;
    this.pullFreeAt = t + PULL_GAP_MS;
    const player = this.players.get(id);
    if (player?.key !== key) return;
    const woke = player.seenAt > at;
    this.emit({ type: 'expel', key, name: player.name, woke });
    if (woke) return;
    player.out = true;
    this.stateDirty = true;
    this.sendBoard(t);
  }

  // Bảng điều khiển: gọi thầy ngay, kéo bạn ngủ lâu nhất, lớp không ai ngủ thì kéo bạn ngồi cuối bảng.
  summon() {
    if (this.pull) return false;
    const player = this.sleepers()[0] ?? this.seated().at(-1);
    if (!player) return false;
    this.startPull(player, this.now());
    return true;
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
      fund: { coins: this.fund.coins, goal: this.fundGoal },
      honor: this.publicHonor(),
    };
  }

  reset() {
    this.players.clear();
    this.boosts.clear();
    this.socialAt.clear();
    this.fund = { coins: 0, by: new Map() };
    this.honor = null;
    this.no = 0;
    this.pull = null;
    this.stateDirty = true;
    this.ask(this.now());
    this.sendBoard();
    this.emit({ type: 'snapshot-game', game: this.snapshot() });
  }

  exportState() {
    const keep = this.ranking().slice(0, SAVED_PLAYERS);
    return {
      no: this.no,
      players: keep.map(({ id, name, score, reachedAt, out }) => (out ? { id, name, score, reachedAt, out } : { id, name, score, reachedAt })),
      boosts: [...this.boosts].filter(([id]) => this.players.has(id)),
      fund: { coins: this.fund.coins, by: [...this.fund.by].map(([id, row]) => [id, row.name, row.coins]) },
      honor: this.honor && { id: this.honor.id, name: this.honor.name },
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
      // Ai đã bị kéo ra thì vẫn ở ngoài; còn lại tính lại từ lúc bật server, chưa ai ngủ gật.
      player.out = row.out === true;
    }
    for (const [id, turns] of Array.isArray(state.boosts) ? state.boosts : []) {
      if (this.players.has(id) && Number.isInteger(turns) && turns > 0) this.boosts.set(id, turns);
    }
    // Bảng điểm cũ có lượt x2 từ quà (luật trước) thì vẫn giữ cho tới khi dùng hết.
    const fund = state.fund;
    if (Number.isInteger(fund?.coins) && fund.coins >= 0) {
      this.fund.coins = Math.min(fund.coins, this.fundGoal - 1);
      for (const [id, name, coins] of Array.isArray(fund.by) ? fund.by : []) {
        if (typeof id === 'string' && typeof name === 'string' && Number.isInteger(coins) && coins > 0) this.fund.by.set(id, { name, coins });
      }
    }
    const honor = state.honor;
    if (typeof honor?.id === 'string' && typeof honor.name === 'string') this.honor = { id: honor.id, name: honor.name };
  }
}

// So tên quà không phân biệt hoa thường, khoảng trắng.
function giftKey(name) {
  return String(name ?? '').toLowerCase().replace(/\s+/g, '');
}

// Kiểu tóc, màu da của hình chibi: cố định theo người chơi.
export function lookOf(id) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return (h >>> 0) % 360;
}
