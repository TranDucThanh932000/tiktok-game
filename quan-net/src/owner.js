// Giọng cô Tám (Vbee). Mỗi câu ghép từ các mẩu giọng lưu ở data/tts: lời cố định tạo sẵn lúc bật server, tên người
// chơi và câu có số phút tạo khi cần rồi để dành. Bong bóng chữ hiện đúng lúc cô bắt đầu nói.
import { readableName, speakText } from './spoken.js';

const NAME_SLOT = /(\{name\}|\{target\})/;
const VALUE_SLOT = /\{(seat|minutes|pos|game|code)\}/g;
const HAS_VALUE = /\{(seat|minutes|pos|game|code)\}/;
// Lời của mẹ hiện trong bong bóng của mẹ, cô Tám không đọc.
const SILENT = new Set(['mom', 'momLost', 'fixes', 'speak']);
// Chờ mẩu giọng (tên mới cần một lượt Vbee) tối đa bao lâu, theo mức quan trọng của câu.
const LOAD_MS = [3000, 4000, 6000, 6000];
const GAP_MS = 350;
const WAIT_MS = 6000;
// Trang game cắt khoảng lặng hai đầu mỗi mẩu nên câu thật ngắn hơn file một chút.
const TRIM_MS = 200;

export class OwnerVoice {
  constructor({ voice, lines, emit = () => {}, enabled = () => true, now = Date.now }) {
    Object.assign(this, { voice, lines, emit, enabled, now });
    this.run = 0;
    this.busyUntil = 0;
    this.current = -1;
    this.waiting = null;
  }

  get on() {
    return this.voice.enabled && this.enabled();
  }

  // Số máy, tên game, lệnh: đọc cho đúng, chữ trên màn hình giữ nguyên.
  value(key, value) {
    const text = String(value ?? '');
    if (key === 'seat') return text.replace(/^V(\d+)$/, 'víp $1');
    return this.lines.speak?.[text] ?? text;
  }

  piece(text) {
    return speakText(String(text).replace(/^[\s,.!?:]+/, ''), this.lines.fixes).trim();
  }

  // "Ghi sổ {name} thêm {minutes} phút!" -> ["Ghi sổ", "Lan Anh", "thêm 30 phút!"]. Tên không đọc được thì gọi "bạn".
  fill(template, vars = {}) {
    const line = String(template ?? '').replace(VALUE_SLOT, (slot, key) => (key in vars ? this.value(key, vars[key]) : slot));
    const parts = [];
    for (const piece of line.split(NAME_SLOT)) {
      if (NAME_SLOT.test(piece)) parts.push(readableName(vars[piece.slice(1, -1)] ?? '') || 'bạn');
      else if (this.piece(piece)) parts.push(this.piece(piece));
    }
    return parts;
  }

  // Mẩu dùng chung để tạo sẵn. samples[kind]: các bộ giá trị hay gặp (số phút follow, tên game...);
  // câu còn số chưa biết trước (số phút nạp lẻ, giờ còn lại) thì tạo khi cần.
  staticParts(samples = {}) {
    const out = new Set();
    for (const [kind, list] of Object.entries(this.lines)) {
      if (SILENT.has(kind) || !Array.isArray(list)) continue;
      for (const template of list) {
        for (const vars of samples[kind] ?? [{}]) {
          const line = template.replace(VALUE_SLOT, (slot, key) => (key in vars ? this.value(key, vars[key]) : slot));
          if (HAS_VALUE.test(line)) continue;
          for (const piece of line.split(NAME_SLOT)) if (!NAME_SLOT.test(piece) && this.piece(piece)) out.add(this.piece(piece));
        }
      }
    }
    return [...out];
  }

  // msg từ tiệm: { text, mood, kind, template, vars, priority }. Đang nói câu quan trọng hơn hoặc ngang hàng thì câu mới
  // chờ (chỉ giữ câu mới nhất); quan trọng hơn thì cắt ngang.
  say(msg) {
    const item = { text: msg.text, mood: msg.mood, priority: msg.priority ?? 1, parts: this.on ? this.fill(msg.template ?? msg.text, msg.vars) : [], at: this.now() };
    for (const part of item.parts) this.voice.clip(part, { urgent: true });
    if (this.now() < this.busyUntil && item.priority <= this.current) {
      this.waiting = item;
      return;
    }
    this.play(item);
  }

  async play(item) {
    const run = ++this.run;
    this.current = item.priority;
    let ids = [];
    if (item.parts.length) {
      const limit = LOAD_MS[Math.min(LOAD_MS.length - 1, Math.max(0, item.priority))];
      this.busyUntil = this.now() + limit;
      let timer;
      const timeout = new Promise((resolve) => (timer = setTimeout(resolve, limit, null)));
      const loaded = await Promise.race([Promise.all(item.parts.map((part) => this.voice.clip(part, { urgent: true }))), timeout]);
      clearTimeout(timer);
      if (run !== this.run) return;
      // Thiếu mẩu nào (Vbee chậm, lỗi) thì chỉ hiện chữ, không đọc hụt.
      if (loaded?.every(Boolean)) ids = loaded;
    }
    const ms = ids.length ? ids.reduce((sum, id) => sum + Math.max(150, this.voice.duration(id) - TRIM_MS), 0) : Math.min(4200, Math.max(2600, item.text.length * 75));
    this.busyUntil = this.now() + ms + GAP_MS;
    this.emit({ type: 'say', text: item.text, mood: item.mood, clips: ids.map((id) => ({ id })), ms, cut: true });
  }

  tick() {
    const item = this.waiting;
    if (!item || this.now() < this.busyUntil) return;
    this.waiting = null;
    if (this.now() - item.at <= WAIT_MS) this.play(item);
  }

  // Chế độ an toàn: im ngay.
  stop() {
    this.run++;
    this.waiting = null;
    this.busyUntil = 0;
    this.current = -1;
    this.emit({ type: 'say', text: '', clips: [], ms: 0, cut: true });
  }
}
