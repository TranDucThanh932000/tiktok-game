// MC cuộc đua: chỉ lên tiếng khi có quà, khi đổi ngôi đầu, và thỉnh thoảng bình luận cho cuộc đua thêm hấp dẫn.
// Mỗi câu trong mc.json được chia thành vài đoạn đọc liền một hơi (segmentsOf). Đoạn có tên tỉnh được Vbee tạo sẵn
// cho đủ 63 tỉnh, nên câu nghe trôi chảy như đọc một lần; chỉ tên người gửi quà là mẩu riêng, tạo khi cần.
// Đoạn đầy đủ chưa kịp tạo thì tạm ghép từ các mẩu nhỏ (cụm lời, tên tỉnh) để MC không bị im.
// Server biết trước độ dài và mỗi lúc chỉ có một câu đang nói. Trang game chỉ việc phát và hiện phụ đề.
import { readableName, speakText } from './spoken.js';
import { BY_ID, PROVINCES, spokenName } from './provinces.js';

const PRIORITY = { thanks: 5, lead: 4, reset: 4, rising: 3, talk: 1 };
const GAP_MS = 1200;
const RISING_GAP_MS = 30_000;
const VOICE_BACKLOG_LIMIT = 12;
// Chờ đoạn câu đầy đủ tối đa ngần này rồi mới tạm ghép từ mẩu nhỏ.
const FULL_WAIT_MS = 5000;
// Khoảng nghỉ giữa hai đoạn (giây): có dấu câu thì nghỉ như người đọc, không có thì nối liền.
const PAUSE = 0.22;
const JOIN = 0.04;
const SLOT = /(\{name\}|\{province2?\})/;
const PROVINCE_SLOT = /\{province2?\}/g;
const CLAUSE_BREAK = /(?<=[,.!?;:])\s+/;
const LEAD_PUNCT = /^[\s,.!?;:]+/;
const LINE_KEYS = ['thanks', 'thanksBig', 'thanksAnon', 'thanksPending', 'thanksPendingAnon', 'leadFirst', 'lead', 'leading', 'close', 'farAhead', 'chase', 'rising', 'invite', 'empty', 'reset'];

const slotsIn = (text) => new Set(text.match(PROVINCE_SLOT) ?? []);

// "Cảm ơn {name}! Bạn vừa tiếp sức cho {province}!" -> ["Cảm ơn", "{name}", "! Bạn vừa tiếp sức cho {province}!"].
// Tên người luôn đứng riêng. Mỗi đoạn còn lại chứa nhiều nhất một loại chỗ trống tỉnh, để chỉ cần tạo sẵn 63 bản.
export function segmentsOf(template) {
  const out = [];
  let cur = '';
  const flush = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = '';
  };
  const add = (text) => {
    if (!text.trim()) return;
    const merged = cur ? `${cur} ${text}` : text;
    if (slotsIn(merged).size <= 1) {
      cur = merged;
      return;
    }
    if (slotsIn(text).size <= 1) {
      flush();
      cur = text;
      return;
    }
    // Một vế có cả hai tỉnh: cắt ngay trước chỗ trống tỉnh thứ hai.
    const matches = [...text.matchAll(PROVINCE_SLOT)];
    const second = matches.find((m) => m[0] !== matches[0][0]);
    add(text.slice(0, second.index));
    flush();
    add(text.slice(second.index));
  };
  for (const clause of template.split(CLAUSE_BREAK)) {
    const at = clause.indexOf('{name}');
    if (at < 0) {
      add(clause);
      continue;
    }
    add(clause.slice(0, at));
    flush();
    out.push('{name}');
    add(clause.slice(at + '{name}'.length));
  }
  flush();
  return out;
}

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

  // Lời đọc của một đoạn: điền tên tỉnh (cách đọc), bỏ dấu câu ở đầu đoạn.
  spokenSegment(segment, vars) {
    const filled = segment.replace(PROVINCE_SLOT, (slot) => spokenName(vars[slot.slice(1, -1)]));
    return this.say(filled.replace(LEAD_PUNCT, '').trim());
  }

  // Cách cũ: cụm lời và tên tỉnh là các mẩu riêng. Dùng tạm khi đoạn đầy đủ chưa có giọng.
  pieces(segment, vars) {
    const out = [];
    for (const piece of segment.split(SLOT)) {
      if (piece === '{province}' || piece === '{province2}') out.push(spokenName(vars[piece.slice(1, -1)]));
      else {
        const spoken = piece.replace(LEAD_PUNCT, '').trim();
        if (spoken) out.push(this.say(spoken));
      }
    }
    return out;
  }

  segments(template) {
    this.segmentCache ??= new Map();
    if (!this.segmentCache.has(template)) this.segmentCache.set(template, segmentsOf(template));
    return this.segmentCache.get(template);
  }

  // "Cảm ơn {name}! Bạn vừa tiếp sức cho {province}!" -> các đoạn [{ text: "Cảm ơn" }, { text: tên }, { text: "Bạn vừa tiếp sức cho Nam Định!" }].
  // Tên không đọc được thì trả về null để chọn câu không có tên, không đọc sai.
  fill(template, vars = {}) {
    if (!template) return null;
    for (const slot of template.match(PROVINCE_SLOT) ?? []) if (!BY_ID.has(vars[slot.slice(1, -1)])) return null;
    const segments = this.segments(template);
    const parts = [];
    segments.forEach((segment, i) => {
      const next = segments[i + 1] ?? '';
      const gap = /[,.!?;:]$/.test(segment) || LEAD_PUNCT.test(next) ? PAUSE : JOIN;
      if (segment === '{name}') {
        parts.push({ text: readableName(vars.name ?? ''), gap });
        return;
      }
      const text = this.spokenSegment(segment, vars);
      if (text) parts.push({ text, fallback: this.pieces(segment, vars), gap });
      else if (parts.length) parts.at(-1).gap = PAUSE;
    });
    if (parts.some((part) => !part.text)) return null;
    const text = template.replace(/\{name\}/g, vars.name ?? '').replace(PROVINCE_SLOT, (slot) => BY_ID.get(vars[slot.slice(1, -1)]).name);
    return { parts, text: text.trim() };
  }

  // Các mẩu dùng chung, tạo sẵn một lần: trước là mẩu nhỏ (cụm lời, tên 63 tỉnh) để MC dùng được ngay,
  // sau là các đoạn đầy đủ cho từng tỉnh, lời cảm ơn trước. Tên người xem tạo khi cần.
  staticParts() {
    const small = new Set(PROVINCES.map((p) => spokenName(p.id)));
    const full = new Set();
    for (const key of LINE_KEYS) {
      for (const line of this.lines[key] ?? []) {
        for (const segment of this.segments(line)) {
          if (segment === '{name}') continue;
          for (const piece of this.pieces(segment, {})) if (piece) small.add(piece);
          const slot = segment.match(PROVINCE_SLOT)?.[0];
          const ids = slot ? PROVINCES.map((p) => p.id) : [null];
          for (const id of ids) {
            const text = this.spokenSegment(segment, slot ? { [slot.slice(1, -1)]: id } : {});
            if (text) full.add(text);
          }
        }
      }
    }
    for (const text of small) full.delete(text);
    return [...small, ...full];
  }

  // ---------- Phát ----------
  lengthOf(clips) {
    return clips.reduce((sum, clip) => sum + Math.max(150, this.voice.duration(clip.id) - this.trimMs) + clip.gap * 1000, 0);
  }

  // Các mẩu sẽ phát, hoặc null nếu chưa đủ giọng. withFallback: đoạn đầy đủ chưa có thì ghép tạm từ mẩu nhỏ.
  resolve(parts, withFallback) {
    const clips = [];
    for (const part of parts) {
      const id = this.voice.ready(part.text);
      if (id) {
        clips.push({ id, gap: part.gap });
        continue;
      }
      if (!withFallback || !part.fallback?.length) return null;
      const ids = part.fallback.map((piece) => this.voice.ready(piece));
      if (ids.some((piece) => !piece)) return null;
      ids.forEach((piece, k) => clips.push({ id: piece, gap: k === ids.length - 1 ? part.gap : JOIN }));
    }
    return clips;
  }

  enqueue(kind, filled, { ttlMs = 10_000, points = 0, province = null, giver = null } = {}) {
    if (!this.on || !filled) return false;
    const urgent = kind === 'thanks';
    // Lúc Vbee còn đang tạo sẵn cả nghìn đoạn thì vẫn cho nói nếu ghép tạm được ngay.
    if (!urgent && this.voice.busy() > VOICE_BACKLOG_LIMIT && !this.resolve(filled.parts, true)) return false;
    // Câu đã nhận thì cần đọc ngay: đưa các đoạn của nó lên trước việc tạo sẵn.
    for (const part of filled.parts) {
      this.voice.clip(part.text, { urgent: true });
      if (!this.voice.ready(part.text)) part.fallback?.forEach((piece) => this.voice.clip(piece, { urgent: true }));
    }
    const t = this.now();
    const expires = Math.max(t, this.busyUntil) + ttlMs;
    this.queue.push({ kind, priority: PRIORITY[kind] ?? 1, parts: filled.parts, text: filled.text, expires, points, province, giver, at: t });
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
      const clips = this.resolve(entry.parts, t - entry.at >= FULL_WAIT_MS);
      if (!clips) continue;
      this.queue.splice(this.queue.indexOf(entry), 1);
      this.busyUntil = t + this.lengthOf(clips) + GAP_MS;
      // Vừa nói xong thì nghỉ một lúc mới bình luận tiếp, để MC không nói liên tục.
      this.nextTalkAt = Math.max(this.nextTalkAt, this.busyUntil + 10_000);
      // Chỉ tính là đã báo ngôi đầu khi câu thật sự được đọc; câu hết hạn hay bị bỏ thì lần sau báo lại.
      if (entry.kind === 'lead') {
        this.leadSaid = entry.province;
        this.leadSaidAt = t;
      }
      const say = { type: 'say', kind: entry.kind, clips, text: entry.text };
      // Màn hình đưa camera tới tỉnh vừa được tiếp sức và hiện người tặng trong lúc MC nói.
      if (entry.kind === 'thanks' && entry.province) Object.assign(say, { province: entry.province, giver: entry.giver });
      this.emit(say);
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
    entry.avatar = msg.avatar || entry.avatar || '';
    entry.icon = msg.icon || entry.icon || '';
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
      // giver: người tặng, để màn hình hiện tên và ảnh đại diện đúng người MC đang đọc.
      const giver = { name: entry.name, avatar: entry.avatar, icon: entry.icon, points: entry.points };
      this.enqueue('thanks', filled, { ttlMs: 45_000, points: entry.points, province: entry.province, giver });
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
