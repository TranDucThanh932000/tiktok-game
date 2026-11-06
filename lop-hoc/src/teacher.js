// Cô giáo: quyết định nói gì, nói lúc nào. Mọi câu đều ghép từ các mẩu giọng có sẵn, nên server biết trước độ dài
// và mỗi lúc chỉ có một câu đang nói. Trang game chỉ việc phát.
// Phần chính (đọc câu hỏi, công bố đáp án, tổng kết) giữ nhịp cho vòng chơi: đồng hồ chờ cô đọc xong mới chạy.
// Phần phụ (chào, khen nhanh, gọi tên...) xếp hàng, chỉ nói khi đang rảnh; không kịp thì bỏ, trừ lời cảm ơn.
import { readableName, speakText } from './spoken.js';

const PRIORITY = { gift: 5, urge: 4, swap: 3, first: 3, social: 2, reply: 2, join: 2, hint: 2, callout: 1, invite: 1 };
const SIDE_GAP_MS = 1500;
const MAX_SIDE_QUEUE = 6;
const VOICE_BACKLOG_LIMIT = 12;

const plainText = (text) =>
  String(text ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();

export class Teacher {
  // trimMs: trang game cắt khoảng lặng hai đầu mỗi mẩu; đo giọng Vbee thật thấy lặng 300-560 ms, chừa lại 100 ms.
  constructor({ voice, lines, emit = () => {}, now = Date.now, rng = Math.random, enabled = () => true, tiers = [], subjects = [], leadMs = 900, trimMs = 200 }) {
    Object.assign(this, { voice, lines, emit, now, rng, enabled, tiers, subjects, leadMs, trimMs });
    this.room = null;
    this.queue = [];
    this.busyUntil = 0;
    this.lastPick = new Map();
    this.replied = new Map();
    this.lastSubject = null;
    this.waitingSince = 0;
    this.q = {};
  }

  attach(room) {
    this.room = room;
  }

  get on() {
    return this.voice.enabled && this.enabled();
  }

  say(text) {
    return speakText(text, this.lines.fixes);
  }

  // Chọn ngẫu nhiên nhưng không lặp câu vừa nói.
  pick(key) {
    const list = this.lines[key];
    if (!Array.isArray(list)) return list;
    const last = this.lastPick.get(key);
    const pool = list.length > 1 ? list.filter((line) => line !== last) : list;
    const line = pool[Math.floor(this.rng() * pool.length)];
    this.lastPick.set(key, line);
    return line;
  }

  // Tách câu mẫu thành các mẩu: "Chào em {name}, vào đi" -> ["Chào em", tên, "vào đi"].
  // Tên không đọc được thì trả về null để bỏ cả câu, không đọc sai.
  fill(template, vars = {}) {
    const line = template.replace(/\{(letter|subject|n)\}/g, (_, key) => vars[key]);
    const parts = [];
    let text = '';
    for (const piece of line.split(/(\{name2?\})/)) {
      if (piece === '{name}' || piece === '{name2}') {
        const name = vars[piece.slice(1, -1)];
        const spoken = readableName(name ?? '');
        if (!spoken) return null;
        parts.push(spoken);
        text += name;
      } else {
        text += piece;
        const spoken = piece.replace(/^[\s,.!?:]+/, '').trim();
        if (spoken) parts.push(this.say(spoken));
      }
    }
    return { parts, text };
  }

  // ---------- Phát ----------
  lengthOf(ids) {
    return ids.reduce((sum, id) => sum + Math.max(150, this.voice.duration(id) - this.trimMs), 0);
  }

  // clips: [{ say, opt?, sfx? }]. Thiếu mẩu nào thì bỏ mẩu đó. Trả về thời gian nói (mili giây).
  playMain(clips, { delayMs = 0, text = '' } = {}) {
    const ready = clips.map((clip) => ({ ...clip, id: this.voice.ready(clip.say) })).filter((clip) => clip.id);
    if (!ready.length) {
      this.busyUntil = 0;
      this.emit({ type: 'say', clips: [], cut: true });
      return 0;
    }
    const ms = delayMs + this.lengthOf(ready.map((clip) => clip.id));
    this.busyUntil = this.now() + ms;
    this.emit({ type: 'say', clips: ready.map(({ id, opt, sfx }) => ({ id, opt, sfx })), cut: true, delayMs, text });
    return ms;
  }

  enqueue(kind, filled, { ttlMs = 15_000, sfx } = {}) {
    if (!this.on || !filled) return;
    const urgent = kind === 'gift';
    if (!urgent && this.queue.length >= MAX_SIDE_QUEUE) return;
    if (!urgent && this.voice.busy() > VOICE_BACKLOG_LIMIT) return;
    filled.parts.forEach((part) => this.voice.clip(part, { urgent }));
    // Hạn tính từ lúc cô rảnh: đang đọc câu hỏi dài thì câu chào không bị hết hạn oan.
    const expires = Math.max(this.now(), this.busyUntil) + ttlMs;
    this.queue.push({ kind, priority: PRIORITY[kind] ?? 1, parts: filled.parts, text: filled.text, expires, sfx });
  }

  // Thời điểm câu phụ phải nói xong, kẻo bị phần chính cắt ngang.
  deadline() {
    const room = this.room;
    return room ? room.endsAt : Infinity;
  }

  pump() {
    const t = this.now();
    if (t < this.busyUntil) return;
    this.queue = this.queue.filter((entry) => entry.expires > t);
    const order = [...this.queue].sort((a, b) => b.priority - a.priority);
    for (const entry of order) {
      const ids = entry.parts.map((part) => this.voice.ready(part));
      if (ids.some((id) => !id)) continue;
      const ms = this.lengthOf(ids);
      if (t + ms > this.deadline()) continue;
      this.queue.splice(this.queue.indexOf(entry), 1);
      this.busyUntil = t + ms + SIDE_GAP_MS;
      this.emit({ type: 'say', clips: ids.map((id, i) => ({ id, sfx: i === 0 ? entry.sfx : undefined })), cut: false, delayMs: 0, text: entry.text });
      return;
    }
  }

  stop() {
    this.queue = [];
    this.busyUntil = 0;
    this.emit({ type: 'say', clips: [], cut: true });
  }

  // ---------- Chuẩn bị giọng ----------
  questionParts(question) {
    const parts = [this.say(question.text), ...question.options.map((option) => this.say(option))];
    if (question.explain !== question.options[question.correct]) parts.push(this.say(question.explain));
    return parts;
  }

  prepareUpcoming(count = 2) {
    if (!this.on) return;
    for (const question of this.room.questions.peek(count)) {
      this.questionParts(question).forEach((part) => this.voice.clip(part, { urgent: true }));
    }
  }

  // Tất cả các mẩu dùng chung, không gồm câu hỏi và tên.
  staticParts() {
    const out = new Set();
    const add = (template, vars) => {
      for (const piece of template.replace(/\{(letter|subject|n)\}/g, (_, key) => vars?.[key] ?? '').split(/\{name2?\}/)) {
        const spoken = piece.replace(/^[\s,.!?:]+/, '').trim();
        if (spoken) out.add(this.say(spoken));
      }
    };
    const { lines } = this;
    for (const key of ['start', 'intro', 'go', 'readBoard', 'timeUp', 'praisePre', 'praisePost', 'allRight', 'fewRight', 'noneRight', 'noAnswer', 'wrongOne', 'firstRight', 'doubled', 'promoteLeader', 'promoteDeputy', 'recapStart', 'recapEnd', 'join', 'swap', 'social', 'hint', 'first', 'urge', 'callout', 'invite']) {
      lines[key].forEach((line) => add(line));
    }
    for (const line of [lines.praiseOthers, lines.recapLeader, lines.recapDeputy]) add(line);
    for (const letter of lines.letters) {
      out.add(this.say(`${letter}.`));
      lines.answerIs.forEach((line) => add(line, { letter }));
    }
    this.subjects.forEach((subject) => add(lines.subject, { subject }));
    for (const n of [3, 4, 5, 6]) lines.streak.forEach((line) => add(line, { n }));
    for (const { turns } of this.tiers) {
      [...lines.gift, lines.giftAnon].forEach((line) => add(line, { n: turns }));
    }
    lines.replies.forEach((reply) => reply.say.forEach((line) => add(line)));
    return [...out];
  }

  // Bắt đầu câu mới mà giọng câu đó chưa có: chờ một lát, Vbee cần vài giây. Quá lâu thì cứ hỏi, chỉ không có tiếng.
  holdAsk(limitMs = 12_000) {
    if (!this.on) return false;
    const [next] = this.room.questions.peek(1);
    const parts = this.questionParts(next);
    if (parts.every((part) => this.voice.ready(part))) {
      this.waitingSince = 0;
      return false;
    }
    parts.forEach((part) => this.voice.clip(part, { urgent: true }));
    const t = this.now();
    this.waitingSince ||= t;
    if (t - this.waitingSince < limitMs) return true;
    this.waitingSince = 0;
    return false;
  }

  // ---------- Vòng chơi ----------
  asking(question, { inSet }) {
    this.q = {};
    this.queue = this.queue.filter((entry) => entry.kind === 'gift');
    if (!this.on) return 0;
    const { lines } = this;
    const clips = [];
    const subjectChanged = question.subject !== this.lastSubject;
    this.lastSubject = question.subject;
    if (inSet === 1) clips.push({ say: this.say(this.pick('start')) });
    else if (subjectChanged) clips.push({ say: this.say(lines.subject.replace('{subject}', question.subject)) });
    else clips.push({ say: this.say(this.pick('intro')) });
    // Giọng câu này chưa kịp có thì bảo đọc trên bảng, không đọc "A, Bê, Xê, Đê" trống không.
    if ([question.text, ...question.options].every((part) => this.voice.ready(this.say(part)))) {
      clips.push({ say: this.say(question.text) });
      question.options.forEach((option, opt) => {
        clips.push({ say: this.say(`${lines.letters[opt]}.`), opt });
        clips.push({ say: this.say(option), opt });
      });
      clips.push({ say: this.say(this.pick('go')) });
    } else {
      clips.push({ say: this.say(this.pick('readBoard')) });
    }
    const ms = this.playMain(clips, { delayMs: this.leadMs });
    this.prepareUpcoming();
    return ms;
  }

  revealing({ question, results, promoted }) {
    if (!this.on) return 0;
    const clips = [];
    const add = (filled) => filled?.parts.forEach((say) => clips.push({ say }));
    const { lines } = this;
    const letter = lines.letters[question.correct];
    add(this.fill(this.pick('timeUp')));
    add(this.fill(this.pick('answerIs'), { letter }));
    clips.push({ say: this.say(question.explain) });

    const nameOf = (r) => this.room.seats[r.seat]?.name ?? '';
    const right = results.filter((r) => r.ok);
    const wrong = results.filter((r) => !r.ok);
    const speakable = (list) => list.map(nameOf).filter((name) => this.voice.ready(readableName(name)));
    let text = '';
    const remark = (filled) => {
      if (!filled) return;
      add(filled);
      text = filled.text;
    };

    if (!results.length) {
      if (this.room.count > 0) remark(this.fill(this.pick('noAnswer')));
    } else if (!right.length) {
      remark(this.fill(this.pick('noneRight')));
      const [name] = speakable(wrong);
      if (name && results.length <= 3) remark(this.fill(this.pick('wrongOne'), { name }));
    } else if (results.length >= 3 && right.length / results.length >= 0.8) {
      remark(this.fill(this.pick('allRight')));
    } else {
      // Ưu tiên gọi tên bạn có chuỗi đúng dài và bạn được nhân đôi.
      const ranked = [...right].sort((a, b) => b.streak - a.streak || b.delta - a.delta);
      const names = speakable(ranked);
      if (names.length) {
        const pre = this.pick('praisePre');
        add(this.fill(pre));
        const shown = names.slice(0, 3);
        shown.forEach((name) => clips.push({ say: readableName(name) }));
        const others = right.length > shown.length;
        if (others) add(this.fill(lines.praiseOthers));
        // Có người lên chức thì đã có lời chúc mừng ở cuối, không kéo dài thêm.
        if (!promoted.length) add(this.fill(this.pick('praisePost')));
        text = `${pre} ${shown.join(', ')}${others ? ` ${lines.praiseOthers}` : '!'}`;
      }
      if (results.length >= 4 && right.length / results.length < 0.3) add(this.fill(this.pick('fewRight')));
    }

    const fastest = right.find((r) => r.first);
    if (fastest && speakable([fastest]).length) remark(this.fill(this.pick('firstRight'), { name: nameOf(fastest) }));

    const hot = right.filter((r) => r.streak >= 3).sort((a, b) => b.streak - a.streak)[0];
    if (hot && speakable([hot]).length) remark(this.fill(this.pick('streak'), { name: nameOf(hot), n: hot.streak }));
    else {
      const doubled = right.find((r) => r.boosted && !r.first);
      if (doubled && speakable([doubled]).length) remark(this.fill(this.pick('doubled'), { name: nameOf(doubled) }));
    }

    // Lên chức là chuyện lớn nhất của câu này, nói sau cùng, kèm tiếng vỗ tay.
    const top = promoted.find((p) => this.voice.ready(readableName(p.name)));
    if (top) {
      const filled = this.fill(this.pick(top.rank === 0 ? 'promoteLeader' : 'promoteDeputy'), { name: top.name });
      if (filled) {
        filled.parts.forEach((say, i) => clips.push({ say, sfx: i === 0 ? 'applause' : undefined }));
        text = filled.text;
      }
    }
    return this.playMain(clips, { delayMs: 500, text });
  }

  recapping({ officers }) {
    if (!this.on) return 0;
    const clips = [];
    const add = (filled, sfx) => filled?.parts.forEach((say, i) => clips.push({ say, sfx: i === 0 ? sfx : undefined }));
    add(this.fill(this.pick('recapStart')));
    for (const officer of officers) add(this.fill(officer.rank === 0 ? this.lines.recapLeader : this.lines.recapDeputy, { name: officer.name }));
    add(this.fill(this.pick('recapEnd')), 'applause');
    return this.playMain(clips, { delayMs: 300 });
  }

  // ---------- Các câu phụ ----------
  onEvent(msg) {
    if (!this.on) return;
    const room = this.room;
    switch (msg.type) {
      case 'join':
        if (msg.kicked) this.enqueue('swap', this.fill(this.pick('swap'), { name: msg.kicked.name, name2: msg.student.name }));
        else this.enqueue('join', this.fill(this.pick('join'), { name: msg.student.name }));
        // Giọng tên chuẩn bị sẵn để lúc công bố đáp án gọi tên được ngay.
        this.prepareName(msg.student.name);
        break;
      case 'boost': {
        if (msg.kind) {
          this.enqueue('social', this.fill(this.pick('social'), { name: msg.name }));
          break;
        }
        const filled = this.fill(this.pick('gift'), { name: msg.name, n: msg.added }) ?? this.fill(this.lines.giftAnon, { n: msg.added });
        this.enqueue('gift', filled, { ttlMs: 60_000, sfx: 'boost' });
        break;
      }
      case 'hint':
        this.enqueue('hint', this.fill(this.pick('hint'), { name: msg.name }));
        break;
      case 'answer': {
        const name = room.seats[msg.seat]?.name;
        this.prepareName(name);
        if (!this.q.first && name) {
          this.q.first = true;
          this.enqueue('first', this.fill(this.pick('first'), { name }), { ttlMs: 6000 });
        }
        break;
      }
    }
  }

  prepareName(name) {
    const spoken = readableName(name ?? '');
    if (spoken && this.voice.busy() <= VOICE_BACKLOG_LIMIT) this.voice.clip(spoken);
  }

  // Comment không phải đáp án: cô đáp lại theo từ khóa. Không bao giờ đọc lại nội dung comment của người xem.
  reply(who, text) {
    if (!this.on) return false;
    const plain = plainText(text);
    if (!plain) return false;
    const found = this.lines.replies.find((reply) => reply.match.some((word) => ` ${plain} `.includes(` ${word} `)));
    if (!found) return false;
    const t = this.now();
    if (t - (this.replied.get(who.id) ?? -Infinity) < 60_000) return false;
    this.replied.set(who.id, t);
    if (this.replied.size > 5000) this.replied.delete(this.replied.keys().next().value);
    const list = found.say;
    this.enqueue('reply', this.fill(list[Math.floor(this.rng() * list.length)], { name: who.name }), { ttlMs: 10_000 });
    return true;
  }

  // Trong lúc chờ trả lời: nhắc vào lớp, gọi bạn im lâu, giục khi sắp hết giờ.
  liven() {
    const room = this.room;
    if (room?.phase !== 'asking') return;
    const t = this.now();
    if (t < room.timerFrom) return;
    const left = room.endsAt - t;
    if (!this.q.invited) {
      this.q.invited = true;
      const notFull = room.count < room.config.seats;
      if (room.count === 0 || (notFull && room.count < room.config.seats / 2 && this.rng() < 0.5)) {
        this.enqueue('invite', this.fill(this.pick('invite')), { ttlMs: 8000 });
      }
    }
    if (!this.q.called && t >= room.timerFrom + 4000) {
      this.q.called = true;
      const dozing = room.seats.filter((s) => s && (s.missed ?? 0) >= 2 && !room.answers.has(s.id) && readableName(s.name));
      if (dozing.length && this.rng() < 0.4) {
        const student = dozing[Math.floor(this.rng() * dozing.length)];
        this.enqueue('callout', this.fill(this.pick('callout'), { name: student.name }), { ttlMs: 6000 });
      }
    }
    if (!this.q.urged && left <= 7000 && room.count > 0 && room.answers.size < room.count) {
      this.q.urged = true;
      this.enqueue('urge', this.fill(this.pick('urge')), { ttlMs: 4000 });
    }
  }

  tick() {
    if (!this.on) return;
    this.liven();
    this.pump();
  }
}
