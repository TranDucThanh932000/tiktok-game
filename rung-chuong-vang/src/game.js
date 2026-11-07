// Luật Rung Chuông Vàng, không dính gì tới TikTok hay trình duyệt để test được bằng đồng hồ giả.
// Một trận: mở sàn (comment VÀO) -> các câu hỏi loại trực tiếp -> (cứu trợ khi sàn còn ít người)
// -> còn đúng một người thì vào các câu hỏi vàng -> đúng hết là rung chuông vàng -> trận mới.
//
// phase: lobby (mở sàn) | intro (màn giới thiệu cứu trợ / câu hỏi vàng) | asking | reveal | end
// mode:  main (câu thường, người trên sàn trả lời) | rescue (người đã rời sàn trả lời) | golden (chỉ người cuối cùng)

// Chỉ nhận chữ a b c d không dấu: "à", "á", "ạ" là tiếng đệm, không phải đáp án.
// Lặp chữ ("aaa") là vì TikTok chặn comment trùng nhau.
const ANSWER = /^(?:(?:đáp án|dap an|chọn|chon|là|la|câu|cau) )?([abcd])\1*(?: (?:nha|nhé|nhe|ạ|nè|ne|ha|luôn|luon))?$/u;
const JOIN = /^(?:(?:cho|xin) (?:(?:em|minh|toi|tui|con|tao) )?)?(?:vao|tham gia|join|len san)(?: (?:san|choi|thi|voi|nha|nhe|di|a|ne|thoi|luon|game))*$/u;

export function parseComment(raw) {
  const plain = String(raw ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().replace(/\s+/g, ' ');
  if (!plain) return null;
  const answer = plain.match(ANSWER);
  if (answer) return { kind: 'answer', choice: 'abcd'.indexOf(answer[1]) };
  // "vô" phải đổi trước khi bỏ dấu, kẻo "vỏ", "vợ" cũng thành "vo".
  const bare = plain.replace(/(?<!\p{L})vô(?!\p{L})/gu, 'vao').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
  return JOIN.test(bare) ? { kind: 'join' } : null;
}

const MAX_PLAYERS = 3000;
// Hết giờ mở sàn mà chưa đủ người: đủ người rồi thì chờ thêm chừng này mới hỏi câu 1.
const LAST_CALL_MS = 5000;
// Nhắc người chưa lên sàn: mỗi người một lần mỗi phút, cả phòng cách nhau ít nhất 4 giây.
const NUDGE_EACH_MS = 60_000;
const NUDGE_GAP_MS = 4000;

export class Game {
  // director: MC (không bắt buộc). asking/revealing/introducing/finishing trả về số mili giây MC cần nói,
  // để đồng hồ chờ MC đọc xong; holdAsk() trả true khi muốn chờ thêm cho giọng câu hỏi kịp tạo.
  constructor(config, { questions, emit = () => {}, now = Date.now, director = null }) {
    this.config = config;
    this.questions = questions;
    this.emit = emit;
    this.now = now;
    this.director = director;
    const t = config.timing;
    this.ms = {
      lobby: t.lobbySeconds * 1000,
      intro: t.introSeconds * 1000,
      ask: t.askSeconds * 1000,
      earlyClose: t.earlyCloseSeconds * 1000,
      reveal: t.revealSeconds * 1000,
      end: t.endSeconds * 1000,
    };
    // Bậc quà theo giá xu, bậc cao nhất mà quà với tới được dùng.
    this.tiers = [...config.gifts].sort((a, b) => b.coins - a.coins);
    this.nudged = new Map();
    this.lastNudge = -Infinity;
    this.newMatch();
  }

  newMatch() {
    this.players = new Map(); // id người xem -> người chơi
    this.byPid = new Map();
    this.nextPid = 1;
    this.phase = 'lobby';
    this.mode = 'main';
    this.endsAt = this.now() + this.ms.lobby;
    // Lúc đồng hồ trả lời bắt đầu chạy (sau khi MC đọc xong câu hỏi).
    this.timerFrom = 0;
    this.questionNo = 0;
    this.goldenNo = 0;
    this.rescuesUsed = 0;
    this.question = null;
    this.answers = new Map(); // id -> { choice, ms }, giữ thứ tự comment tới
    this.result = null;
    this.finalist = null;
    this.champion = null;
  }

  // ---------- Đếm ----------
  get aliveCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.alive) n++;
    return n;
  }

  eligible(player) {
    if (this.mode === 'golden') return player.pid === this.finalist;
    if (this.mode === 'rescue') return !player.alive;
    return player.alive;
  }

  eligibleCount() {
    let n = 0;
    for (const p of this.players.values()) if (this.eligible(p)) n++;
    return n;
  }

  joinOpen() {
    return this.phase === 'lobby' || (this.phase === 'asking' && this.mode === 'main' && this.questionNo <= this.config.joinUntilQuestion);
  }

  rescueLimit() {
    return Math.max(1, Math.floor((this.players.size * this.config.rescue.alivePercent) / 100));
  }

  // ---------- Trạng thái gửi xuống màn hình ----------
  publicPlayer({ id, pid, name, avatar, alive, shields, correct, at }) {
    return { pid, name, avatar, alive, shields, correct, at, answered: this.phase === 'asking' && this.answers.has(id) };
  }

  publicQuestion() {
    const q = this.question;
    if (!q) return null;
    // Đáp án đúng chỉ lộ khi đã công bố.
    const shown = this.phase === 'reveal';
    return { subject: q.subject, text: q.text, options: q.options, correct: shown ? q.correct : null, explain: shown ? q.explain : '' };
  }

  state() {
    const alive = this.aliveCount;
    return {
      phase: this.phase,
      mode: this.mode,
      endsAt: this.endsAt,
      timerFrom: this.phase === 'asking' ? this.timerFrom : 0,
      questionNo: this.questionNo,
      maxQuestions: this.config.maxQuestions,
      goldenNo: this.goldenNo,
      goldenTotal: this.config.goldenQuestions,
      rescuesLeft: Math.max(0, this.config.rescue.maxTimes - this.rescuesUsed),
      minPlayers: this.config.minPlayers,
      total: this.players.size,
      alive,
      out: this.players.size - alive,
      answered: this.phase === 'asking' ? this.answers.size : 0,
      eligible: this.phase === 'asking' ? this.eligibleCount() : 0,
      question: this.publicQuestion(),
      result: this.phase === 'reveal' ? this.result : null,
      finalist: this.finalist,
      champion: this.champion,
    };
  }

  snapshot() {
    return { ...this.state(), players: [...this.players.values()].map((p) => this.publicPlayer(p)) };
  }

  send(type, fields = {}) {
    this.emit({ type, ...fields, state: this.state() });
  }

  // ---------- Vòng chơi ----------
  hold() {
    return Boolean(this.director?.holdAsk?.());
  }

  tick() {
    const t = this.now();
    if (t < this.endsAt) return;
    if (this.phase === 'lobby') {
      if (this.aliveCount >= this.config.minPlayers && !this.hold()) this.start();
    } else if (this.phase === 'intro') {
      if (!this.hold()) this.ask(this.mode);
    } else if (this.phase === 'asking') this.reveal();
    else if (this.phase === 'reveal') this.afterReveal();
    else if (this.phase === 'end') this.reset();
  }

  start() {
    this.send('start');
    this.ask('main');
  }

  ask(mode) {
    const t = this.now();
    this.mode = mode;
    if (mode === 'main') this.questionNo++;
    if (mode === 'golden') this.goldenNo++;
    this.question = { ...this.questions.next(), startedAt: t };
    this.answers = new Map();
    this.result = null;
    this.phase = 'asking';
    // Người xem trả lời được ngay khi câu hiện lên, nhưng 15 giây chỉ bắt đầu đếm khi MC đọc xong.
    const readMs = this.director?.asking(this.question, { mode, no: this.questionNo, goldenNo: this.goldenNo, finalist: this.byPid.get(this.finalist)?.name ?? '' }) ?? 0;
    this.timerFrom = t + readMs;
    this.endsAt = this.timerFrom + this.ms.ask;
    this.send('ask');
  }

  reveal() {
    const q = this.question;
    const counts = [0, 0, 0, 0];
    const right = [];
    const wrong = [];
    const picks = [];
    for (const p of this.players.values()) {
      if (!this.eligible(p)) continue;
      const a = this.answers.get(p.id);
      if (a) {
        counts[a.choice]++;
        picks.push([p.pid, a.choice]);
      }
      if (a?.choice === q.correct) right.push({ p, ms: a.ms });
      else wrong.push(p);
    }
    for (const { p } of right) p.correct++;
    const first = right.sort((a, b) => a.ms - b.ms)[0];
    const result = {
      mode: this.mode,
      correct: q.correct,
      answer: q.options[q.correct],
      counts,
      picks,
      right: right.length,
      fastest: first ? { pid: first.p.pid, name: first.p.name, ms: first.ms } : null,
      out: [],
      saved: [],
      back: [],
      allWrong: false,
      passed: false,
    };
    if (this.mode === 'main') {
      // Cả sàn cùng sai (hoặc không ai trả lời) thì không loại ai, kẻo trận kết thúc không có người thắng.
      if (!right.length) result.allWrong = wrong.length > 0;
      else {
        for (const p of wrong) {
          if (p.shields > 0) {
            p.shields--;
            result.saved.push(p.pid);
          } else {
            p.alive = false;
            p.outAt = this.questionNo;
            result.out.push(p.pid);
          }
        }
      }
    } else if (this.mode === 'rescue') {
      for (const { p } of right) {
        p.alive = true;
        result.back.push(p.pid);
      }
    } else {
      result.passed = right.length > 0;
    }
    this.result = result;
    this.phase = 'reveal';
    const talk = this.director?.revealing({ question: q, result, alive: this.aliveCount, goldenNo: this.goldenNo, goldenTotal: this.config.goldenQuestions }) ?? 0;
    this.endsAt = this.now() + Math.max(this.ms.reveal, talk + 1200);
    this.send('reveal', { result });
  }

  // force: bảng điều khiển bấm sang bước tiếp thì không chờ giọng câu hỏi.
  afterReveal(force = false) {
    const alive = this.aliveCount;
    if (this.mode === 'golden') {
      if (!this.result.passed) return this.finish('fail');
      if (this.goldenNo >= this.config.goldenQuestions) return this.finish('bell');
      if (!force && this.hold()) return;
      return this.ask('golden');
    }
    if (alive === 0) return this.finish('empty');
    if (this.canRescue(alive)) return this.intro('rescue');
    if (alive === 1) return this.intro('golden');
    if (this.questionNo >= this.config.maxQuestions) return this.finish('many');
    if (!force && this.hold()) return;
    this.ask('main');
  }

  canRescue(alive) {
    const { rescue } = this.config;
    return (
      this.mode !== 'rescue' &&
      this.rescuesUsed < rescue.maxTimes &&
      this.questionNo >= rescue.minQuestion &&
      // Sau câu thường cuối cùng thì không cứu trợ nữa, kẻo người quay lại sàn được tính là cùng về đích.
      this.questionNo < this.config.maxQuestions &&
      alive < this.players.size &&
      alive <= this.rescueLimit()
    );
  }

  intro(mode) {
    this.mode = mode;
    this.phase = 'intro';
    this.question = null;
    this.result = null;
    if (mode === 'rescue') this.rescuesUsed++;
    if (mode === 'golden') {
      this.goldenNo = 0;
      this.finalist = [...this.players.values()].find((p) => p.alive)?.pid ?? null;
    }
    const finalist = mode === 'golden' && this.finalist ? this.byPid.get(this.finalist) : null;
    const talk = this.director?.introducing(mode, finalist, this.config.goldenQuestions) ?? 0;
    this.endsAt = this.now() + Math.max(this.ms.intro, talk + 800);
    this.send('intro', { mode, finalist: finalist ? this.publicPlayer(finalist) : null });
  }

  // kind: bell (rung chuông) | fail (người cuối cùng trả lời sai câu hỏi vàng) | many (hết số câu, nhiều người cùng về đích)
  //       | empty (sàn trống)
  finish(kind) {
    const winners = kind === 'bell' || kind === 'fail' ? [this.byPid.get(this.finalist)].filter(Boolean) : [...this.players.values()].filter((p) => p.alive);
    this.champion = {
      kind,
      goldenNo: this.goldenNo,
      winners: winners.slice(0, 12).map((p) => ({ pid: p.pid, name: p.name, avatar: p.avatar, correct: p.correct })),
      moreWinners: Math.max(0, winners.length - 12),
      top: this.topPlayers(3),
      questions: this.questionNo,
    };
    this.phase = 'end';
    this.question = null;
    this.result = null;
    const talk = this.director?.finishing(this.champion) ?? 0;
    this.endsAt = this.now() + Math.max(this.ms.end, talk + 1500);
    this.send('end', { champion: this.champion });
  }

  // Bằng số câu đúng thì ai trụ trên sàn lâu hơn đứng trên.
  topPlayers(n) {
    return [...this.players.values()]
      .filter((p) => p.correct > 0)
      .sort((a, b) => b.correct - a.correct || (b.alive ? Infinity : b.outAt) - (a.alive ? Infinity : a.outAt) || a.pid - b.pid)
      .slice(0, n)
      .map(({ name, avatar, correct }) => ({ name, avatar, correct }));
  }

  reset() {
    this.newMatch();
    this.send('reset');
  }

  // ---------- Người xem ----------
  touch(player, who) {
    player.name = who.name;
    if (who.avatar) player.avatar = who.avatar;
    player.at = this.now();
  }

  comment(who, text) {
    const parsed = parseComment(text);
    if (!parsed) return null;
    let player = this.players.get(who.id);
    if (player) this.touch(player, who);
    if (parsed.kind === 'join') {
      if (player) return null;
      if (this.joinOpen()) return this.join(who) ? 'join' : null;
      return this.nudge(who, 'closed') ? 'nudge' : null;
    }
    if (this.phase !== 'asking') {
      if (!player && this.phase === 'lobby') return this.nudge(who, 'lobby') ? 'nudge' : null;
      return null;
    }
    if (!player) {
      if (!this.joinOpen()) return this.nudge(who, 'closed') ? 'nudge' : null;
      player = this.join(who);
      if (!player) return null;
    }
    if (!this.eligible(player) || this.answers.has(who.id)) return null;
    // Chỉ tính đáp án đầu tiên, kẻo comment đủ A B C D là chắc đúng.
    const t = this.now();
    this.answers.set(who.id, { choice: parsed.choice, ms: Math.max(0, t - this.question.startedAt) });
    const eligible = this.eligibleCount();
    // Mọi người đã trả lời thì đóng sớm, nhưng vẫn để MC đọc xong câu hỏi.
    if (this.answers.size >= eligible) this.endsAt = Math.min(this.endsAt, Math.max(t, this.timerFrom) + this.ms.earlyClose);
    this.send('answer', { pid: player.pid });
    return 'answer';
  }

  join(who) {
    if (this.players.size >= MAX_PLAYERS) return null;
    const t = this.now();
    const player = { pid: this.nextPid++, id: who.id, name: who.name, avatar: who.avatar ?? '', alive: true, shields: 0, correct: 0, outAt: 0, at: t };
    this.players.set(who.id, player);
    this.byPid.set(player.pid, player);
    if (this.phase === 'lobby' && t >= this.endsAt && this.aliveCount >= this.config.minPlayers) this.endsAt = t + LAST_CALL_MS;
    this.send('join', { player: this.publicPlayer(player) });
    return player;
  }

  nudge(who, reason) {
    const t = this.now();
    if (t - this.lastNudge < NUDGE_GAP_MS) return false;
    if (t - (this.nudged.get(who.id) ?? -Infinity) < NUDGE_EACH_MS) return false;
    this.nudged.delete(who.id);
    this.nudged.set(who.id, t);
    if (this.nudged.size > 5000) this.nudged.delete(this.nudged.keys().next().value);
    this.lastNudge = t;
    this.emit({ type: 'nudge', name: who.name, reason });
    return true;
  }

  // ---------- Quà ----------
  tierOf(coins) {
    const value = Number(coins) || 0;
    return this.tiers.find((g) => value >= g.coins) ?? null;
  }

  // Lúc đang hỏi câu vàng hay đang ăn mừng thì không ai lên sàn được nữa.
  sealed() {
    return this.phase === 'end' || (this.mode === 'golden' && this.phase !== 'lobby');
  }

  // count: số quà mới (combo đã được tính phần tăng thêm ở server).
  gift(who, { coins, name = '' } = {}, count = 1) {
    const tier = this.tierOf(coins);
    if (!tier) return null;
    const n = Math.max(1, Math.trunc(count) || 1);
    let player = this.players.get(who.id) ?? null;
    if (player) this.touch(player, who);
    let effect = tier.effect;
    let shields = 0;
    let entered = false;
    if (effect === 'revive' && this.sealed()) effect = 'cheer';
    if (effect === 'shield' && !player && !this.joinOpen()) effect = 'cheer';

    if (!player && (effect !== 'cheer' || this.joinOpen())) {
      player = this.join(who);
      // Mở sàn thì ai cũng lên được, chỉ khi sàn đã đóng thì quà mới là vé lên sàn.
      entered = Boolean(player) && effect === 'revive' && !this.joinOpen();
      if (!player && effect !== 'cheer') effect = 'cheer';
    } else if (player && effect === 'revive' && !player.alive) {
      player.alive = true;
      entered = true;
    }
    if (player && effect !== 'cheer') {
      shields = effect === 'shield' ? n * (tier.shields ?? 1) : (n - (entered ? 1 : 0)) * (tier.shields ?? 1);
      player.shields += shields;
    }
    this.send('gift', {
      effect,
      name: who.name,
      pid: player?.pid ?? null,
      label: tier.label,
      icon: tier.icon ?? '',
      giftName: name,
      count: n,
      shields,
      revived: entered,
    });
    return { effect, shields, revived: entered };
  }

  // ---------- Bảng điều khiển ----------
  advance() {
    if (this.phase === 'lobby') {
      if (!this.aliveCount) return false;
      this.start();
    } else if (this.phase === 'intro') this.ask(this.mode);
    else if (this.phase === 'asking') this.reveal();
    else if (this.phase === 'reveal') this.afterReveal(true);
    else this.reset();
    return true;
  }

  // Câu hỏi lỗi hay quá khó: bỏ, không loại ai, hỏi câu khác cùng loại.
  skip() {
    if (this.phase !== 'asking') return false;
    const answer = this.question.options[this.question.correct];
    if (this.mode === 'main') this.questionNo--;
    if (this.mode === 'golden') this.goldenNo--;
    this.send('skip', { answer });
    this.ask(this.mode);
    return true;
  }

  stop() {
    if (this.phase === 'lobby' || this.phase === 'end') return false;
    this.finish(this.mode === 'golden' ? 'fail' : this.aliveCount ? 'many' : 'empty');
    return true;
  }

  correctChoice() {
    return this.phase === 'asking' ? this.question.correct : null;
  }

  answerText() {
    return this.phase === 'asking' ? this.question.options[this.question.correct] : '';
  }
}
