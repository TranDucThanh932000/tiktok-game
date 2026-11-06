// Luật lớp học, không dính gì tới TikTok hay trình duyệt để test được bằng đồng hồ giả.
// Vòng chơi: hỏi -> công bố đáp án -> (hết bộ câu thì khen ban cán sự) -> hỏi tiếp.

const OFFICER_TITLES = ['Lớp trưởng', 'Lớp phó học tập', 'Lớp phó học tập'];

// Chỉ nhận chữ a b c d không dấu: "à", "á", "ạ" là tiếng đệm, không phải đáp án.
// Lặp chữ ("aaa") là vì TikTok chặn comment trùng nhau.
const ANSWER = /^(?:(?:đáp án|dap an|chọn|chon|là|la) )?([abcd])\1*(?: (?:nha|nhé|nhe|ạ|nè|ne|ha))?$/u;
const JOIN = /^(?:(?:cho|xin) (?:(?:em|minh|toi|tui|con) )?)?vao(?: lop)?(?: (?:voi|nha|nhe|di|a|ne|thoi))*$/u;

export function parseComment(raw) {
  const plain = String(raw ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().replace(/\s+/g, ' ');
  const answer = plain.match(ANSWER);
  if (answer) return { kind: 'answer', choice: 'abcd'.indexOf(answer[1]) };
  // "vô" phải đổi trước khi bỏ dấu, kẻo "vỏ", "vợ" cũng thành "vo".
  const bare = plain.replace(/(?<!\p{L})vô(?!\p{L})/gu, 'vao').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
  return JOIN.test(bare) ? { kind: 'join' } : null;
}

const hashOf = (text) => Array.from(String(text)).reduce((sum, ch) => (sum * 31 + ch.codePointAt(0)) % 100_000, 7);

export class Classroom {
  // director: cô giáo (không bắt buộc). asking/revealing/recapping trả về số mili giây cô cần nói,
  // để đồng hồ chờ cô đọc xong và câu mới không cắt ngang lời cô.
  constructor(config, { questions, emit = () => {}, now = Date.now, director = null }) {
    this.config = config;
    this.questions = questions;
    this.emit = emit;
    this.now = now;
    this.director = director;
    const { timing } = config;
    this.ms = {
      ask: timing.askSeconds * 1000,
      minAsk: timing.minAskSeconds * 1000,
      earlyClose: timing.earlyCloseSeconds * 1000,
      grace: timing.graceSeconds * 1000,
      reveal: timing.revealSeconds * 1000,
      recap: timing.recapSeconds * 1000,
      newcomer: config.newcomerGraceSeconds * 1000,
      kickGap: config.kickGapSeconds * 1000,
      socialGap: config.boost.socialGapSeconds * 1000,
    };
    this.tiers = [...config.boost.tiers].sort((a, b) => b.coins - a.coins);
    this.stateDirty = false;
    this.clear();
  }

  clear() {
    this.seats = Array(this.config.seats).fill(null);
    this.boosts = new Map(); // id -> số lượt x2 còn lại; giữ cả khi ra khỏi lớp.
    this.waiting = []; // những người đang chờ ngoài cửa, đầu mảng vào trước.
    this.officers = [];
    this.hinted = new Map();
    this.socialAt = new Map(); // id -> lúc follow/share gần nhất được tính.
    this.lastKickAt = -Infinity;
    this.phase = 'idle';
    this.no = 0;
    this.question = null;
    this.answers = new Map();
    this.revealInfo = null;
    this.recapInfo = null;
    this.endsAt = 0;
    this.startedAt = 0;
    this.timerFrom = 0;
  }

  // ---------- Chỗ ngồi ----------
  get count() {
    return this.seats.filter(Boolean).length;
  }

  seatOf(id) {
    return this.seats.findIndex((s) => s?.id === id);
  }

  publicStudent(student) {
    return { name: student.name, score: student.score, look: student.look, turns: this.boosts.get(student.id) ?? 0 };
  }

  // Người bị mời ra: điểm thấp nhất, bằng điểm thì ai im lâu nhất.
  // Không đụng tới ban cán sự, người còn lượt x2, người vừa vào (để ai cũng được thử ít nhất một câu)
  // và người đang chờ kết quả câu vừa trả lời.
  pickVictim(t = this.now()) {
    const officerIds = new Set(this.officers.map((o) => o.id));
    const pool = this.seats.filter(
      (s) =>
        s &&
        !officerIds.has(s.id) &&
        !this.boosts.get(s.id) &&
        t - s.joinedAt >= this.ms.newcomer &&
        !(this.phase === 'asking' && this.answers.has(s.id)),
    );
    pool.sort((a, b) => a.score - b.score || a.lastActive - b.lastActive);
    return pool[0] ?? null;
  }

  admit(who, seat, kicked = null) {
    const t = this.now();
    const student = { id: who.id, name: who.name, score: 0, look: hashOf(who.id), joinedAt: t, lastActive: t, reachedAt: t };
    this.seats[seat] = student;
    this.stateDirty = true;
    this.emit({
      type: 'join',
      seat,
      student: this.publicStudent(student),
      kicked: kicked && { name: kicked.name, score: kicked.score },
      count: this.count,
      waiting: this.waiting.length,
    });
  }

  // Vào ghế trống đầu tiên (hàng trên trước vì hàng cuối hay bị khung comment của TikTok che),
  // lớp đầy thì thay người thấp điểm nhất, cách nhau ít nhất kickGap để lớp không bị xáo tung khi đông người.
  trySeat(who) {
    const t = this.now();
    const empty = this.seats.indexOf(null);
    if (empty >= 0) {
      this.admit(who, empty);
      return true;
    }
    if (t - this.lastKickAt < this.ms.kickGap) return false;
    const victim = this.pickVictim(t);
    if (!victim) return false;
    this.lastKickAt = t;
    this.admit(who, this.seatOf(victim.id), victim);
    return true;
  }

  join(who, { front = false } = {}) {
    const seat = this.seatOf(who.id);
    if (seat >= 0) {
      this.seats[seat].name = who.name;
      this.emit({ type: 'wave', seat });
      return;
    }
    const queued = this.waiting.findIndex((w) => w.id === who.id);
    if (queued >= 0) {
      if (front) this.waiting.unshift(...this.waiting.splice(queued, 1));
      return;
    }
    if (!this.waiting.length && this.trySeat(who)) return;
    if (this.waiting.length >= this.config.maxWaiting && !front) return;
    if (front) this.waiting.unshift(who);
    else this.waiting.push(who);
    this.emit({ type: 'waiting', name: who.name, count: this.waiting.length });
  }

  admitWaiting() {
    // Lấy ra khỏi hàng trước, để tin "đã vào lớp" báo đúng số người còn chờ.
    while (this.waiting.length) {
      const next = this.waiting.shift();
      if (this.trySeat(next)) continue;
      this.waiting.unshift(next);
      break;
    }
  }

  // ---------- Comment ----------
  comment(who, text) {
    const parsed = parseComment(text);
    if (!parsed) return false;
    if (parsed.kind === 'join') this.join(who);
    else this.answer(who, parsed.choice);
    return true;
  }

  hint(who, t) {
    if (t - (this.hinted.get(who.id) ?? -Infinity) < 45_000) return;
    this.hinted.set(who.id, t);
    if (this.hinted.size > 5000) this.hinted.delete(this.hinted.keys().next().value);
    this.emit({ type: 'hint', name: who.name });
  }

  answer(who, choice) {
    const t = this.now();
    const seat = this.seatOf(who.id);
    if (seat < 0) {
      if (!this.waiting.some((w) => w.id === who.id)) this.hint(who, t);
      return;
    }
    const student = this.seats[seat];
    student.lastActive = t;
    student.name = who.name;
    // Chỉ tính đáp án đầu tiên, kẻo comment đủ A B C D là chắc thắng.
    if (this.phase !== 'asking' || this.answers.has(who.id)) return;
    const turns = this.boosts.get(who.id) ?? 0;
    const boosted = turns > 0;
    if (boosted) {
      if (turns > 1) this.boosts.set(who.id, turns - 1);
      else this.boosts.delete(who.id);
    }
    this.answers.set(who.id, { choice, boosted });
    this.stateDirty = true;
    this.emit({ type: 'answer', seat, choice, boosted, turns: this.boosts.get(who.id) ?? 0, tally: this.tally() });
    // Cả lớp trả lời xong thì không bắt mọi người ngồi chờ hết giờ.
    if (this.answers.size >= this.count) {
      const close = Math.max(t + this.ms.earlyClose, this.timerFrom + this.ms.minAsk);
      if (close < this.endsAt) {
        this.endsAt = close;
        this.emit({ type: 'hurry', endsAt: close });
      }
    }
  }

  tally() {
    const counts = [0, 0, 0, 0];
    for (const { choice } of this.answers.values()) counts[choice]++;
    return counts;
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
    return this.addTurns(who, reward.turns * count, { icon: reward.icon, front: true });
  }

  // Follow, share: mỗi người tính tối đa một lần mỗi socialGap (dùng chung cho cả hai).
  // Chưa tới lúc thì bỏ qua trong im lặng, trên màn hình không báo gì.
  social(who, kind) {
    const t = this.now();
    if (t - (this.socialAt.get(who.id) ?? -Infinity) < this.ms.socialGap) return null;
    this.socialAt.delete(who.id);
    this.socialAt.set(who.id, t);
    if (this.socialAt.size > 5000) this.socialAt.delete(this.socialAt.keys().next().value);
    return this.addTurns(who, this.config.boost.socialTurns, { kind });
  }

  addTurns(who, added, { icon, kind, front = false }) {
    const turns = (this.boosts.get(who.id) ?? 0) + added;
    this.boosts.set(who.id, turns);
    this.stateDirty = true;
    // Người chưa vào lớp vẫn được vào ngay, không thì không thấy gì xảy ra.
    if (this.seatOf(who.id) < 0) this.join(who, { front });
    const seat = this.seatOf(who.id);
    if (seat >= 0) this.seats[seat].lastActive = this.now();
    this.emit({ type: 'boost', name: who.name, seat, added, turns, icon, kind });
    return { added, turns };
  }

  // ---------- Ban cán sự ----------
  // Bằng điểm thì ai đạt điểm đó trước đứng trên, để chức không đổi qua đổi lại.
  ranking() {
    return this.seats
      .filter((s) => s && s.score > 0)
      .sort((a, b) => b.score - a.score || a.reachedAt - b.reachedAt);
  }

  computeOfficers() {
    return this.ranking()
      .slice(0, OFFICER_TITLES.length)
      .map((s, rank) => ({ id: s.id, seat: this.seatOf(s.id), name: s.name, score: s.score, rank, title: OFFICER_TITLES[rank] }));
  }

  publicOfficers(list = this.officers) {
    return list.map(({ seat, name, score, rank, title }) => ({ seat, name, score, rank, title }));
  }

  // ---------- Vòng chơi ----------
  tick() {
    const t = this.now();
    if (this.phase === 'idle') return this.director?.holdAsk() ? undefined : this.ask();
    this.admitWaiting();
    if (this.phase === 'asking') {
      if (t >= this.endsAt + this.ms.grace) this.reveal();
      return;
    }
    if (t < this.endsAt) return;
    if (this.phase === 'reveal' && this.no % this.config.setSize === 0 && this.officers.length) return this.recap();
    if (this.director?.holdAsk()) return;
    this.ask();
  }

  publicQuestion() {
    const { subject, text, options } = this.question;
    return { subject, text, options };
  }

  numbering() {
    const { setSize } = this.config;
    return { no: this.no, inSet: ((this.no - 1) % setSize) + 1, setSize };
  }

  ask() {
    const t = this.now();
    this.no++;
    this.question = this.questions.next();
    this.answers = new Map();
    this.revealInfo = null;
    this.recapInfo = null;
    this.phase = 'asking';
    this.startedAt = t;
    // Nhận đáp án ngay từ lúc hiện câu hỏi, nhưng đồng hồ chỉ chạy sau khi cô đọc xong.
    const readMs = this.director?.asking(this.question, this.numbering()) ?? 0;
    this.timerFrom = t + readMs;
    this.endsAt = this.timerFrom + this.ms.ask;
    this.stateDirty = true;
    this.admitWaiting();
    this.emit({ type: 'question', ...this.numbering(), question: this.publicQuestion(), timerFrom: this.timerFrom, endsAt: this.endsAt });
  }

  reveal() {
    const t = this.now();
    const { correct, explain } = this.question;
    const results = [];
    // answers giữ đúng thứ tự comment tới, nên người đúng đầu tiên gặp trong vòng lặp là người nhanh nhất.
    let firstTaken = false;
    for (const [id, { choice, boosted }] of this.answers) {
      const seat = this.seatOf(id);
      if (seat < 0) continue;
      const student = this.seats[seat];
      const ok = choice === correct;
      const first = ok && !firstTaken;
      if (first) firstTaken = true;
      const delta = ok ? (boosted ? this.config.boost.multiplier : 1) * (first ? this.config.firstRightMultiplier : 1) : 0;
      if (delta) {
        student.score += delta;
        student.reachedAt = t;
      }
      student.streak = ok ? (student.streak ?? 0) + 1 : 0;
      results.push({ seat, choice, ok, delta, score: student.score, boosted, first, streak: student.streak });
    }
    // Để cô biết bạn nào lâu không trả lời mà gọi tên.
    for (const student of this.seats) {
      if (!student) continue;
      if (this.answers.has(student.id)) student.missed = 0;
      else {
        student.missed = (student.missed ?? 0) + 1;
        student.streak = 0;
      }
    }
    const before = new Map(this.officers.map((o) => [o.id, o.rank]));
    this.officers = this.computeOfficers();
    const promoted = this.officers.filter((o) => !before.has(o.id) || before.get(o.id) > o.rank).map(({ name, title, rank }) => ({ name, title, rank }));
    this.revealInfo = { correct, explain, results };
    this.phase = 'reveal';
    const talkMs = this.director?.revealing({ question: this.question, results, promoted }) ?? 0;
    this.endsAt = t + Math.max(this.ms.reveal, talkMs + 800);
    this.stateDirty = true;
    this.emit({ type: 'reveal', ...this.revealInfo, tally: this.tally(), officers: this.publicOfficers(), promoted, endsAt: this.endsAt });
  }

  recap() {
    this.recapInfo = {
      officers: this.publicOfficers(),
      others: this.ranking().slice(OFFICER_TITLES.length, OFFICER_TITLES.length + 4).map((s) => ({ name: s.name, score: s.score })),
    };
    this.phase = 'recap';
    const talkMs = this.director?.recapping(this.recapInfo) ?? 0;
    this.endsAt = this.now() + Math.max(this.ms.recap, talkMs + 800);
    this.emit({ type: 'recap', ...this.recapInfo, endsAt: this.endsAt });
  }

  // Bảng điều khiển: bỏ qua phần còn lại của bước đang chạy.
  skip() {
    this.endsAt = this.now() - this.ms.grace;
    this.tick();
  }

  reset() {
    this.clear();
    this.stateDirty = true;
    this.emit({ type: 'snapshot-game', game: this.snapshot() });
    // Lần tick sau tự hỏi câu đầu, sau khi giọng câu đó sẵn sàng.
  }

  // ---------- Trạng thái ----------
  snapshot() {
    return {
      phase: this.phase,
      ...(this.question ? this.numbering() : { no: 0, inSet: 0, setSize: this.config.setSize }),
      question: this.question && this.publicQuestion(),
      timerFrom: this.timerFrom,
      endsAt: this.endsAt,
      seats: this.seats.map((s) => s && this.publicStudent(s)),
      answers: Array.from(this.answers, ([id, a]) => ({ seat: this.seatOf(id), choice: a.choice, boosted: a.boosted })).filter((a) => a.seat >= 0),
      tally: this.tally(),
      officers: this.publicOfficers(),
      count: this.count,
      waiting: this.waiting.length,
      reveal: this.revealInfo,
      recap: this.recapInfo,
    };
  }

  exportState() {
    return { no: this.no, seats: this.seats, boosts: Array.from(this.boosts) };
  }

  importState(state) {
    if (!Array.isArray(state?.seats)) return;
    state.seats.slice(0, this.config.seats).forEach((s, i) => {
      if (s?.id && s.name && Number.isFinite(s.score)) this.seats[i] = s;
    });
    this.boosts = new Map((state.boosts ?? []).filter(([id, turns]) => id && turns > 0));
    this.no = Number.isInteger(state.no) && state.no > 0 ? state.no : 0;
    this.officers = this.computeOfficers();
  }
}
