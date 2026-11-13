// Hai MC đám cưới (nam, nữ) đọc bằng Vbee. Lời nói nằm trong mc.json: mỗi tình huống có nhiều cách nói,
// MC chọn ngẫu nhiên và né những cách vừa dùng để đỡ trùng lặp.
// Mỗi câu được cắt thành mẩu cố định ("Xin chúc mừng", "đã trở thành chú rể") và mẩu tên người chơi. Mẩu cố định
// được tạo sẵn lúc bật server, tên thì tạo khi cần, nên câu được đọc gần như ngay.
// Server xếp lời lần lượt (biết độ dài từng mẩu mp3) nên hai MC không bao giờ nói chồng lên nhau.
import { readableName } from './spoken.js';

const SPEAKERS = ['nam', 'nu'];
const JOIN = 0.04; // giây nghỉ giữa các mẩu trong một câu
const TURN = 0.35; // giây nghỉ khi đổi người nói
const WAIT_CLIPS_MS = 7000;
const FALLBACK_NAME = { ten: 'bạn', cu: 'người cũ', chure: 'chú rể', codau: 'cô dâu' };

// Mẩu chỉ có dấu câu ("!", ", ") thì không gửi Vbee; dấu phẩy đầu mẩu cũng bỏ.
const speakable = (text) => {
  const t = text.replace(/^[\s,.;:!?…]+/u, '').trim();
  return /\p{L}/u.test(t) ? t : '';
};

// Câu "nam: ..." -> { speaker, segments }: segments là chữ cố định hoặc { key } cho chỗ cần thay.
export function parseLine(raw) {
  const m = /^\s*(nam|nu)\s*:\s*(.+)$/s.exec(raw);
  const speaker = m ? m[1] : 'nam';
  const text = (m ? m[2] : raw).trim();
  const segments = [];
  let last = 0;
  for (const hit of text.matchAll(/\{(\w+)\}/g)) {
    const before = speakable(text.slice(last, hit.index));
    if (before) segments.push(before);
    segments.push({ key: hit[1] });
    last = hit.index + hit[0].length;
  }
  const tail = speakable(text.slice(last));
  if (tail) segments.push(tail);
  return { speaker, segments, text };
}

export class MC {
  constructor({ lines, voices, emit, now = Date.now, idleMs = 40_000 }) {
    this.voices = voices;
    this.emit = emit;
    this.now = now;
    this.idleMs = idleMs;
    this.lines = {};
    for (const [event, list] of Object.entries(lines)) {
      if (event.startsWith('_') || !Array.isArray(list)) continue;
      this.lines[event] = list.map((v) => (Array.isArray(v) ? v : [v]).map(parseLine));
    }
    this.enabled = SPEAKERS.some((s) => voices[s]?.enabled);
    this.on = this.enabled;
    this.recent = new Map();
    this.queue = [];
    this.busyUntil = 0;
    this.lastSpoke = now();
    this.working = false;
  }

  // Chọn cách nói chưa dùng gần đây (nhớ khoảng nửa số cách nói của tình huống đó).
  pick(event) {
    const list = this.lines[event];
    if (!list?.length) return null;
    const recent = this.recent.get(event) ?? [];
    const fresh = list.map((_, i) => i).filter((i) => !recent.includes(i));
    const pool = fresh.length ? fresh : list.map((_, i) => i);
    const i = pool[Math.floor(Math.random() * pool.length)];
    recent.push(i);
    while (recent.length > Math.max(0, Math.floor(list.length / 2))) recent.shift();
    this.recent.set(event, recent);
    return list[i];
  }

  fill(line, vars) {
    const parts = [];
    for (const seg of line.segments) {
      if (typeof seg === 'string') parts.push({ text: seg });
      else {
        const raw = vars[seg.key];
        const spoken = typeof raw === 'number' ? String(raw) : readableName(String(raw ?? '')).replace(/[️‍]/g, '').trim();
        parts.push({ text: spoken || FALLBACK_NAME[seg.key] || '', dynamic: true });
      }
    }
    const voice = this.voices[line.speaker]?.enabled ? line.speaker : SPEAKERS.find((s) => this.voices[s]?.enabled);
    const text = line.text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? FALLBACK_NAME[k] ?? ''));
    return { speaker: voice, parts: parts.filter((p) => p.text), text };
  }

  // priority: 3 = diễn biến chính (không bỏ), 1 = cảm ơn/xếp hàng (bỏ khi MC đang bận), 0 = nói chuyện lúc vắng.
  say(event, vars = {}, { priority = 1, ttl = 8000 } = {}) {
    if (!this.on) return false;
    if (priority < 3 && (this.queue.length >= 2 || (priority === 0 && (this.queue.length || this.now() < this.busyUntil)))) return false;
    const variant = this.pick(event);
    if (!variant) return false;
    const lines = variant.map((l) => this.fill(l, vars));
    // Tạo trước mẩu tên ngay lúc này để kịp đọc.
    for (const line of lines) for (const p of line.parts) if (p.dynamic) this.voices[line.speaker].clip(p.text, { urgent: true });
    if (priority >= 3) this.queue = this.queue.filter((q) => q.priority >= 3).slice(-2);
    this.queue.push({ event, lines, priority, at: this.now(), expires: this.now() + ttl });
    if (priority > 0) this.lastSpoke = this.now();
    this.pump();
    return true;
  }

  async pump() {
    if (this.working || !this.on) return;
    const now = this.now();
    if (now < this.busyUntil) return;
    this.queue = this.queue.filter((q) => q.expires > now);
    if (!this.queue.length) return;
    this.queue.sort((a, b) => b.priority - a.priority || a.at - b.at);
    const entry = this.queue.shift();
    this.working = true;
    try {
      const clips = [];
      let ms = 0;
      for (const [li, line] of entry.lines.entries()) {
        const voice = this.voices[line.speaker];
        const ids = await Promise.all(line.parts.map((p) => Promise.race([voice.clip(p.text, { urgent: true }), new Promise((r) => setTimeout(() => r(null), WAIT_CLIPS_MS))])));
        // Thiếu mẩu cố định thì bỏ câu; thiếu mẩu tên thì đọc câu không có tên còn hơn im.
        if (line.parts.some((p, i) => !ids[i] && !p.dynamic)) continue;
        line.parts.forEach((p, i) => {
          if (!ids[i]) return;
          const gap = i === line.parts.length - 1 ? (li < entry.lines.length - 1 ? TURN : 0) : JOIN;
          clips.push({ id: ids[i], gap, speaker: line.speaker });
          ms += voice.duration(ids[i]) + gap * 1000;
        });
      }
      if (clips.length && this.on) {
        this.emit({ type: 'say', event: entry.event, clips, lines: entry.lines.map((l) => ({ speaker: l.speaker, text: l.text })) });
        this.busyUntil = this.now() + ms + 500;
        this.lastSpoke = this.now();
      }
    } finally {
      this.working = false;
    }
  }

  tick(state) {
    this.pump();
    // Đang chuẩn bị câu khác (chờ Vbee) hoặc vừa có câu mới xếp hàng thì không chen câu nói chuyện lúc vắng.
    if (!this.on || this.working || this.queue.length || this.now() < this.busyUntil) return;
    if (this.now() - this.lastSpoke < this.idleMs) return;
    this.lastSpoke = this.now();
    const { groom, bride, ceremony } = state;
    if (ceremony) return;
    const event = groom && bride ? 'idle_couple' : groom ? 'idle_groom' : bride ? 'idle_bride' : 'idle_empty';
    this.say(event, { chure: groom?.name, codau: bride?.name }, { priority: 0 });
  }

  setOn(on) {
    this.on = on && this.enabled;
    if (!this.on) {
      this.queue = [];
      this.emit({ type: 'say', clips: [], cut: true });
    }
    return this.on;
  }

  // Mẩu cố định của mọi câu, theo từng giọng, để tạo sẵn lúc bật server.
  fixedTexts() {
    const out = { nam: new Set(), nu: new Set() };
    for (const variants of Object.values(this.lines)) {
      for (const variant of variants) {
        for (const line of variant) {
          const voice = this.voices[line.speaker]?.enabled ? line.speaker : SPEAKERS.find((s) => this.voices[s]?.enabled);
          if (!voice) continue;
          for (const seg of line.segments) if (typeof seg === 'string') out[voice].add(seg);
        }
      }
    }
    return out;
  }
}
