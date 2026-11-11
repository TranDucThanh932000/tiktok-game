// Đố chữ xen giữa cuộc đua (bộ từ lấy từ game Đoán Từ): màn hình hiện chủ đề, câu gợi ý và các ô chữ đóng.
// Ai comment đúng thì tỉnh của người đó được cộng điểm (mỗi người một lần mỗi câu). Người chưa chọn tỉnh thì
// điểm được giữ lại, comment tên tỉnh lúc nào thì cộng lúc đó. Không dính gì tới TikTok để test bằng đồng hồ giả.
import { Puzzle } from './words.js';

export const QUIZ_DEFAULTS = {
  enabled: true,
  points: 1,
  wordSeconds: 30,
  afterFirstSeconds: 10,
  hintEverySeconds: 6,
  graceSeconds: 1.5,
  revealSeconds: 7,
  breakSeconds: 5,
  hints: { start: 0, max: 0.5 },
};

export class Quiz {
  constructor(options, { deck, race, emit = () => {}, now = Date.now, rng = Math.random }) {
    this.opt = { ...QUIZ_DEFAULTS, ...options, hints: { ...QUIZ_DEFAULTS.hints, ...options?.hints } };
    Object.assign(this, { deck, race, emit, now, rng });
    const o = this.opt;
    this.ms = {
      word: o.wordSeconds * 1000,
      afterFirst: o.afterFirstSeconds * 1000,
      hintEvery: o.hintEverySeconds * 1000,
      grace: o.graceSeconds * 1000,
      reveal: o.revealSeconds * 1000,
      pause: o.breakSeconds * 1000,
    };
    this.no = 0;
    this.phase = 'idle';
    this.puzzle = null;
    this.solvers = new Map(); // id người xem -> { name, avatar, province, at }
    this.endsAt = 0;
    this.nextLetterAt = 0;
  }

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
    } else if (this.phase === 'reveal' && t >= this.endsAt) this.rest(t);
    else if (this.phase === 'break' && t >= this.endsAt) this.ask(t);
  }

  ask(t = this.now()) {
    const { start, max } = this.opt.hints;
    this.no++;
    this.puzzle = new Puzzle(this.deck.next(), { rng: this.rng, start, max });
    this.solvers = new Map();
    this.askedAt = t;
    this.phase = 'asking';
    this.endsAt = t + this.ms.word;
    this.nextLetterAt = t + this.ms.hintEvery;
    this.emit({ type: 'quiz-ask', ...this.publicWord() });
  }

  publicWord() {
    const p = this.puzzle;
    return { no: this.no, topic: p.topic, hint: p.hint, tiles: p.tiles(), letters: p.letters, left: p.limit - p.shown, endsAt: this.endsAt };
  }

  openLetter() {
    if (this.phase !== 'asking') return false;
    const opened = this.puzzle.openLetter();
    if (!opened) return false;
    this.emit({ type: 'quiz-letter', no: this.no, ...opened, left: this.puzzle.limit - this.puzzle.shown });
    return true;
  }

  // Trả về true nếu comment là đáp án đúng (kể cả người đã trả lời rồi), để server không xử lý thêm như tên tỉnh.
  comment(who, text) {
    if (this.phase !== 'asking' || !this.puzzle.matches(text)) return false;
    if (this.solvers.has(who.id)) return true;
    const t = this.now();
    const first = this.solvers.size === 0;
    const result = this.race.award(who, this.opt.points);
    const province = result.province ?? null;
    this.solvers.set(who.id, { name: who.name, avatar: who.avatar ?? '', province, at: t });
    // Có người trả lời đúng thì chỉ chờ thêm một lúc cho các bạn khác, không bắt cả phòng ngồi đợi hết giờ.
    if (first) this.endsAt = Math.min(this.endsAt, t + this.ms.afterFirst);
    this.emit({
      type: 'quiz-correct',
      no: this.no,
      userId: who.id,
      name: who.name,
      avatar: who.avatar ?? '',
      points: this.opt.points,
      province,
      held: result.held ?? 0,
      ...(province ? this.race.stateOf(province) : {}),
      first,
      count: this.solvers.size,
      endsAt: this.endsAt,
    });
    if (province) this.race.checkLeader();
    return true;
  }

  // Tỉnh có nhiều người trả lời đúng nhất câu này (bằng nhau thì tỉnh có người trả lời trước).
  bestProvince() {
    const counts = new Map();
    for (const { province } of this.solvers.values()) if (province) counts.set(province, (counts.get(province) ?? 0) + 1);
    let best = null;
    for (const [province, count] of counts) if (!best || count > best.count) best = { province, count };
    return best;
  }

  reveal(t = this.now()) {
    this.phase = 'reveal';
    this.endsAt = t + this.ms.reveal;
    this.emit({ type: 'quiz-reveal', ...this.publicReveal() });
  }

  publicReveal() {
    const first = this.solvers.values().next().value;
    const fastest = first
      ? { name: first.name, avatar: first.avatar, province: first.province, seconds: Math.max(1, Math.round((first.at - this.askedAt) / 1000)) }
      : null;
    return { no: this.no, answer: this.puzzle.display, topic: this.puzzle.topic, count: this.solvers.size, fastest, best: this.bestProvince(), endsAt: this.endsAt };
  }

  // Công bố xong thì ẩn ô đố chữ một lúc cho bản đồ thoáng, rồi mới hỏi câu tiếp.
  rest(t = this.now()) {
    if (this.ms.pause <= 0) return this.ask(t);
    this.phase = 'break';
    this.endsAt = t + this.ms.pause;
    this.emit({ type: 'quiz-break', no: this.no, endsAt: this.endsAt });
  }

  // Bảng điều khiển: đang hỏi thì công bố luôn, đang công bố hay đang nghỉ thì sang câu mới ngay.
  skip() {
    const t = this.now();
    if (this.phase === 'asking') this.reveal(t);
    else this.ask(t);
  }

  snapshot() {
    if (!this.puzzle) return null;
    const first = this.solvers.values().next().value;
    return {
      phase: this.phase,
      word: this.publicWord(),
      count: this.solvers.size,
      first: first ? { name: first.name, avatar: first.avatar, province: first.province } : null,
      solvers: [...this.solvers.values()].slice(-6).map(({ name, province }) => ({ name, province })),
      reveal: this.phase === 'reveal' ? this.publicReveal() : null,
    };
  }
}
