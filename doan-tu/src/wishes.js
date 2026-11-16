// Dịp 20/11: thỉnh thoảng một bạn đang ngồi trong lớp (top bảng điểm) chạy lên tặng hoa, chúc cô; cô cảm ơn.
// Chỉ chen vào giữa lượt đoán, lúc cô không đọc lời chính (từ mới, công bố) và còn đủ giờ để cô cảm ơn xong trước khi công bố.
// Màn hình cho bạn chạy tới cô trong khoảng REPLY_MS, cô đáp lời lúc bạn đứng trước mặt (đang nói dở câu khác thì nói ngay sau).

export const REPLY_MS = 3200;
const LEFT_AT_LEAST_MS = 8000;
const RETRY_MS = 10_000;

export class Wishes {
  // everyMs: khoảng cách trung bình giữa hai lần chúc (0 là tắt). lines: câu chúc của học sinh (chỉ hiện chữ).
  constructor({ game, teacher, emit, everyMs = 0, lines = [], now = Date.now, rng = Math.random, later = setTimeout }) {
    this.game = game;
    this.teacher = teacher;
    this.emit = emit;
    this.everyMs = everyMs;
    this.lines = lines;
    this.now = now;
    this.rng = rng;
    this.later = later;
    this.lastKey = null;
    this.lastLine = -1;
    this.nextAt = now() + everyMs * 0.5;
  }

  get enabled() {
    return this.everyMs > 0 && this.lines.length > 0;
  }

  tick() {
    if (!this.enabled || this.now() < this.nextAt || !this.quiet()) return;
    this.fire();
  }

  quiet() {
    const { game, teacher } = this;
    const t = this.now();
    const mainTalking = teacher.current?.main && t < teacher.busyUntil;
    return game.phase === 'asking' && game.endsAt - t >= LEFT_AT_LEAST_MS && !mainTalking;
  }

  // Trả về người được chọn, hoặc null nếu lớp chưa có ai. Bảng điều khiển gọi thẳng để thử, bỏ qua điều kiện "rảnh".
  fire() {
    const t = this.now();
    // Bạn đang ngủ gật hoặc đang bị thầy giám thị kéo ra thì không lên chúc.
    const board = this.game.board().filter((p) => !p.sleepy && p.key !== this.game.pull?.key);
    if (!board.length) {
      this.nextAt = t + RETRY_MS;
      return null;
    }
    const pool = board.length > 1 ? board.filter((p) => p.key !== this.lastKey) : board;
    const player = pool[Math.floor(this.rng() * pool.length)];
    this.lastKey = player.key;
    this.nextAt = t + this.everyMs * (0.75 + this.rng() * 0.5);
    const text = this.pickLine();
    this.emit({ type: 'wish', key: player.key, name: player.name, text, replyMs: REPLY_MS });
    this.later(() => this.teacher.thankWish(player), REPLY_MS);
    return player;
  }

  pickLine() {
    let i = Math.floor(this.rng() * this.lines.length);
    if (this.lines.length > 1 && i === this.lastLine) i = (i + 1) % this.lines.length;
    this.lastLine = i;
    return this.lines[i];
  }
}
