// MC cuộc đua: chỉ lên tiếng khi có quà, khi đổi ngôi đầu, và thỉnh thoảng bình luận cho cuộc đua thêm hấp dẫn.
// Mọi câu đều ghép từ các mẩu giọng có sẵn (tên tỉnh, các đoạn lời trong mc.json, tên người gửi quà), nên server
// biết trước độ dài và mỗi lúc chỉ có một câu đang nói. Trang game chỉ việc phát và hiện phụ đề.
import { readableName, speakText } from './spoken.js';
import { BY_ID, PROVINCES, spokenName } from './provinces.js';

const PRIORITY = { thanks: 5, lead: 4, reset: 4, rising: 3, talk: 1 };
const GAP_MS = 1200;
const RISING_GAP_MS = 30_000;
const VOICE_BACKLOG_LIMIT = 12;
const SLOT = /(\{name\}|\{province2?\})/;
const LINE_KEYS = ['thanks', 'thanksBig', 'thanksAnon', 'thanksPending', 'thanksPendingAnon', 'leadFirst', 'lead', 'leading', 'close', 'farAhead', 'chase', 'rising', 'invite', 'empty', 'reset'];

export class Commentator {
  // trimMs: trang game cắt khoảng lặng hai đầu mỗi mẩu, nên độ dài thật ngắn hơn file một chút.
  constructor({ voice, lines, options = {}, emit = () => {}, now = Date.now, rng = Math.random, enabled = () => true, trimMs = 200 }) {
    Object.assign(this, { voice, lines, emit, now, rng, enabled, trimMs });
    this.opt = { enabled: true, bigGiftPoints: 50, thanksSettleMs: 2500, nameWaitMs: 8000, maxThanks: 4, talkEverySeconds: [40, 75], leadGapSeconds: 20, ...options };
    this.race = null;
    this.queue = [];
    this.thanks = new Map(); // id người gửi -> quà đang gom (combo gửi liên tục chỉ cảm ơn một lần)
    this.busyUntil = 0;
    this.lastPick = new Map();
    this.leadSaid = null;
    this.leadSaidAt = -Infinity;
    this.top3 = new Set();
    this.risingAt = -Infinity;
    this.nextTalkAt = this.now() + this.talkDelay();
  }

  attach(race) {
    this.race = race;
    this.leadSaid = race.leader;
    this.top3 = new Set(race.ranking().slice(0, 3).map((row) => row.id));
  }

  get on() {
    return this.opt.enabled !== false && this.voice.enabled && this.enabled();
  }

  talkDelay() {
    const [min, max] = this.opt.talkEverySeconds;
    return (min + this.rng() * (max - min)) * 1000;
  }

  say(text) {
    return speakText(text, this.lines.fixes);
  }

  // Chọn ngẫu nhiên nhưng không lặp câu vừa nói.
  pick(key) {
    const list = this.lines[key] ?? [];
    const last = this.lastPick.get(key);
    const pool = list.length > 1 ? list.filter((line) => line !== last) : list;
    const line = pool[Math.floor(this.rng() * pool.length)] ?? '';
    this.lastPick.set(key, line);
    return line;
  }

  // "Cảm ơn {name} đã tiếp sức cho {province}!" -> ["Cảm ơn", tên, "đã tiếp sức cho", tên tỉnh].
  // Tên không đọc được thì trả về null để chọn câu không có tên, không đọc sai.
  fill(template, vars = {}) {
    if (!template) return null;
    const parts = [];
    let text = '';
    for (const piece of template.split(SLOT)) {
      if (piece === '{name}') {
        const spoken = readableName(vars.name ?? '');
        if (!spoken) return null;
        parts.push(spoken);
        text += vars.name;
      } else if (piece === '{province}' || piece === '{province2}') {
        const province = BY_ID.get(vars[piece.slice(1, -1)]);
        if (!province) return null;
        parts.push(spokenName(province.id));
        text += province.name;
      } else {
        text += piece;
        const spoken = piece.replace(/^[\s,.!?:]+/, '').trim();
        if (spoken) parts.push(this.say(spoken));
      }
    }
    return { parts, text: text.trim() };
  }

  // Tất cả các mẩu dùng chung: lời trong mc.json và tên 63 tỉnh. Tên người xem tạo khi cần.
  staticParts() {
    const out = new Set();
    for (const key of LINE_KEYS) {
      for (const line of this.lines[key] ?? []) {
        for (const piece of line.split(SLOT)) {
          if (SLOT.test(piece)) continue;
          const spoken = piece.replace(/^[\s,.!?:]+/, '').trim();
          if (spoken) out.add(this.say(spoken));
        }
      }
    }
    for (const p of PROVINCES) out.add(spokenName(p.id));
    return [...out];
  }

  // ---------- Phát ----------
  lengthOf(ids) {
    return ids.reduce((sum, id) => sum + Math.max(150, this.voice.duration(id) - this.trimMs), 0);
  }

  enqueue(kind, filled, { ttlMs = 10_000, points = 0, province = null } = {}) {
    if (!this.on || !filled) return false;
    const urgent = kind === 'thanks';
    if (!urgent && this.voice.busy() > VOICE_BACKLOG_LIMIT) return false;
    filled.parts.forEach((part) => this.voice.clip(part, { urgent }));
    const expires = Math.max(this.now(), this.busyUntil) + ttlMs;
    this.queue.push({ kind, priority: PRIORITY[kind] ?? 1, parts: filled.parts, text: filled.text, expires, points, province });
    // Quà dồn dập thì bỏ bớt lời cảm ơn nhỏ nhất; màn hình vẫn hiện đủ.
    const thanks = this.queue.filter((entry) => entry.kind === 'thanks');
    if (thanks.length > this.opt.maxThanks) {
      const smallest = thanks.reduce((a, b) => (b.points < a.points ? b : a));
      this.queue.splice(this.queue.indexOf(smallest), 1);
    }
    return true;
  }

  pump() {
    const t = this.now();
    if (t < this.busyUntil) return;
    this.queue = this.queue.filter((entry) => entry.expires > t && !this.staleLead(entry));
    const order = [...this.queue].sort((a, b) => b.priority - a.priority);
    for (const entry of order) {
      const ids = entry.parts.map((part) => this.voice.ready(part));
      if (ids.some((id) => !id)) continue;
      this.queue.splice(this.queue.indexOf(entry), 1);
      this.busyUntil = t + this.lengthOf(ids) + GAP_MS;
      // Vừa nói xong thì nghỉ một lúc mới bình luận tiếp, để MC không nói liên tục.
      this.nextTalkAt = Math.max(this.nextTalkAt, this.busyUntil + 10_000);
      // Chỉ tính là đã báo ngôi đầu khi câu thật sự được đọc; câu hết hạn hay bị bỏ thì lần sau báo lại.
      if (entry.kind === 'lead') {
        this.leadSaid = entry.province;
        this.leadSaidAt = t;
      }
      this.emit({ type: 'say', kind: entry.kind, clips: ids.map((id) => ({ id })), text: entry.text });
      return;
    }
  }

  // Câu báo ngôi đầu đang chờ mà ngôi đầu đã đổi chủ lần nữa thì không đọc thông tin cũ.
  staleLead(entry) {
    return entry.kind === 'lead' && entry.province !== this.race?.leader;
  }

  stop() {
    this.queue = [];
    this.thanks.clear();
    this.busyUntil = 0;
    this.emit({ type: 'say', clips: [], cut: true });
  }

  // ---------- Sự kiện của cuộc đua ----------
  onEvent(msg) {
    switch (msg.type) {
      case 'gift':
      case 'pending':
        this.noteGift(msg);
        if (msg.type === 'gift') this.noteRank();
        break;
      case 'join': {
        // Người gửi quà trước rồi mới comment tên tỉnh: lời cảm ơn đang chờ được nói kèm tên tỉnh.
        const waiting = msg.held ? this.thanks.get(msg.userId) : null;
        if (waiting) waiting.province = msg.province;
        this.noteRank();
        break;
      }
      case 'reset':
        this.queue = [];
        this.thanks.clear();
        this.leadSaid = null;
        this.leadSaidAt = -Infinity;
        this.top3.clear();
        this.enqueue('reset', this.fill(this.pick('reset')));
        break;
    }
  }

  noteGift(msg) {
    if (!this.on) return;
    const t = this.now();
    const entry = this.thanks.get(msg.userId) ?? { points: 0, first: t, province: null };
    entry.points += msg.points;
    entry.last = t;
    entry.name = msg.name;
    entry.province = msg.province ?? entry.province;
    this.thanks.delete(msg.userId);
    this.thanks.set(msg.userId, entry);
    // Tạo sẵn giọng tên trong lúc combo còn chạy, để cảm ơn được ngay khi combo dừng.
    const spoken = readableName(msg.name ?? '');
    if (spoken) this.voice.clip(spoken, { urgent: true });
  }

  // Combo dừng (không có quà mới trong thanksSettleMs) thì mới cảm ơn, một lần cho cả combo.
  settleThanks() {
    const t = this.now();
    for (const [userId, entry] of this.thanks) {
      if (t - entry.last < this.opt.thanksSettleMs) continue;
      const spoken = readableName(entry.name ?? '');
      const nameReady = Boolean(spoken && this.voice.ready(spoken));
      // Tên mới cần vài giây để Vbee tạo giọng; chờ có giới hạn rồi cảm ơn không tên.
      if (spoken && !nameReady && t - entry.first < this.opt.nameWaitMs) continue;
      this.thanks.delete(userId);
      const big = entry.points >= this.opt.bigGiftPoints;
      let filled = null;
      if (entry.province) {
        if (nameReady) filled = this.fill(this.pick(big ? 'thanksBig' : 'thanks'), { name: entry.name, province: entry.province });
        filled ??= this.fill(this.pick('thanksAnon'), { province: entry.province });
      } else {
        if (nameReady) filled = this.fill(this.pick('thanksPending'), { name: entry.name });
        filled ??= this.fill(this.pick('thanksPendingAnon'));
      }
      this.enqueue('thanks', filled, { ttlMs: 45_000, points: entry.points });
    }
  }

  // Một tỉnh mới chen vào top 3 (đẩy tỉnh khác ra) thì thỉnh thoảng MC nhắc tới.
  noteRank() {
    if (!this.race) return;
    const ranking = this.race.ranking();
    const top = new Set(ranking.slice(0, 3).map((row) => row.id));
    const t = this.now();
    if (this.on && ranking.length >= 5 && this.top3.size >= 3 && t - this.risingAt >= RISING_GAP_MS) {
      // Tỉnh nhảy thẳng lên hạng 1 đã có câu báo ngôi đầu. Sự kiện tới trước khi cuộc đua cập nhật tỉnh dẫn đầu,
      // nên lấy hạng 1 từ bảng xếp hạng vừa tính chứ không dùng race.leader.
      const newcomer = [...top].find((id) => !this.top3.has(id) && id !== ranking[0].id);
      if (newcomer && this.enqueue('rising', this.fill(this.pick('rising'), { province: newcomer }), { ttlMs: 8000 })) this.risingAt = t;
    }
    this.top3 = top;
  }

  // Bình luận theo tình hình: ai đang dẫn, có sát nút không, có bỏ xa không, hay mời điểm danh.
  talk() {
    if (!this.race) return false;
    const [a, b] = this.race.ranking();
    let key = 'leading';
    let vars = {};
    if (!a) key = 'empty';
    else if (this.rng() < 0.25) key = 'invite';
    else if (!b) vars = { province: a.id };
    else {
      vars = { province: a.id, province2: b.id };
      if (a.score - b.score <= Math.max(2, a.score * 0.1)) key = 'close';
      else if (a.score >= 10 && a.score >= 2 * b.score) key = 'farAhead';
      else key = this.rng() < 0.5 ? 'leading' : 'chase';
    }
    return this.enqueue('talk', this.fill(this.pick(key), vars));
  }

  // Bảng điều khiển bấm "MC bình luận ngay".
  talkNow() {
    this.queue = this.queue.filter((entry) => entry.kind !== 'talk');
    return this.talk();
  }

  liven() {
    const race = this.race;
    if (!race) return;
    const t = this.now();
    // Đổi ngôi đầu: nói ngay nếu đã đủ lâu từ lần trước; trong lúc chờ mà ngôi đầu đổi qua lại thì chỉ nói kết quả cuối.
    this.queue = this.queue.filter((entry) => !this.staleLead(entry));
    const waiting = this.queue.some((entry) => entry.kind === 'lead');
    if (race.leader && race.leader !== this.leadSaid && !waiting && t - this.leadSaidAt >= this.opt.leadGapSeconds * 1000) {
      const previous = this.leadSaid && BY_ID.has(this.leadSaid) ? this.leadSaid : null;
      const filled = previous ? this.fill(this.pick('lead'), { province: race.leader, province2: previous }) : this.fill(this.pick('leadFirst'), { province: race.leader });
      this.enqueue('lead', filled, { ttlMs: 8000, province: race.leader });
    }
    if (t >= this.nextTalkAt) {
      this.nextTalkAt = t + this.talkDelay();
      if (!this.queue.length && t >= this.busyUntil) this.talk();
    }
  }

  tick() {
    if (!this.on) return;
    this.settleThanks();
    this.liven();
    this.pump();
  }
}
