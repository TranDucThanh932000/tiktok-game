// MC: quyết định nói gì, nói lúc nào. Mọi câu đều ghép từ các mẩu giọng Vbee có sẵn, nên server biết trước độ dài
// và mỗi lúc chỉ có một câu đang nói. Trang game chỉ việc phát.
// Phần chính (đọc câu hỏi, công bố đáp án, cứu trợ, câu hỏi vàng, kết thúc) giữ nhịp trận: đồng hồ chờ MC đọc xong.
// Phần phụ (chào người lên sàn, cảm ơn quà, giục giờ, mời lên sàn) xếp hàng, chỉ nói khi rảnh; không kịp thì bỏ.
import { readableName, speakText } from './spoken.js';

const PRIORITY = { gift: 5, urge: 4, join: 2, invite: 1 };
const SIDE_GAP_MS = 1200;
const MAX_SIDE_QUEUE = 6;
const VOICE_BACKLOG_LIMIT = 12;
const INVITE_EVERY_MS = 25_000;
// Số được đọc thành mẩu riêng ("Rất tiếc," + "12" + "bạn phải rời sàn thi"), tạo sẵn từ 1 tới chừng này.
const NUMBERS_READY = 60;

export class MC {
  // trimMs: trang game cắt khoảng lặng hai đầu mỗi mẩu; giọng Vbee thật lặng 300-560 ms, chừa lại 100 ms.
  constructor({ voice, lines, emit = () => {}, now = Date.now, rng = Math.random, enabled = () => true, leadMs = 700, trimMs = 200 }) {
    Object.assign(this, { voice, lines, emit, now, rng, enabled, leadMs, trimMs });
    this.game = null;
    this.queue = [];
    this.busyUntil = 0;
    this.lastPick = new Map();
    this.waitingSince = 0;
    this.lastInvite = 0;
    this.urged = false;
  }

  attach(game) {
    this.game = game;
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

  // Tách câu mẫu thành các mẩu: "Chào mừng {name} lên sàn thi!" -> ["Chào mừng", tên, "lên sàn thi!"].
  // Tên không đọc được thì trả về null để bỏ cả câu, không đọc sai.
  fill(template, vars = {}) {
    if (!template) return null;
    const line = template.replace(/\{letter\}/g, vars.letter ?? '');
    const parts = [];
    let text = '';
    for (const piece of line.split(/(\{name\}|\{n\})/)) {
      if (piece === '{name}') {
        const spoken = readableName(vars.name ?? '');
        if (!spoken) return null;
        parts.push(spoken);
        text += vars.name;
      } else if (piece === '{n}') {
        parts.push(String(vars.n));
        text += vars.n;
      } else {
        text += piece;
        const spoken = piece.replace(/^[\s,.!?:]+/, '').trim();
        if (spoken) parts.push(this.say(spoken));
      }
    }
    return { parts, text };
  }

  ready(filled) {
    return Boolean(filled) && filled.parts.every((part) => this.voice.ready(part));
  }

  // ---------- Phát ----------
  lengthOf(ids) {
    return ids.reduce((sum, id) => sum + Math.max(150, this.voice.duration(id) - this.trimMs), 0);
  }

  // clips: [{ say, opt?, sfx? }]. Thiếu mẩu nào thì bỏ mẩu đó. Trả về thời gian nói (mili giây).
  playMain(clips, { delayMs = 0 } = {}) {
    const ready = clips.map((clip) => ({ ...clip, id: this.voice.ready(clip.say) })).filter((clip) => clip.id);
    if (!ready.length) {
      this.busyUntil = 0;
      this.emit({ type: 'say', clips: [], cut: true });
      return 0;
    }
    const ms = delayMs + this.lengthOf(ready.map((clip) => clip.id));
    this.busyUntil = this.now() + ms;
    this.emit({ type: 'say', clips: ready.map(({ id, opt, sfx }) => ({ id, opt, sfx })), cut: true, delayMs });
    return ms;
  }

  // Câu chính chỉ ghép những dòng đã đủ mẩu giọng, để không đọc nửa câu.
  builder() {
    const clips = [];
    return {
      clips,
      add: (filled) => {
        if (!this.ready(filled)) return false;
        filled.parts.forEach((say) => clips.push({ say }));
        return true;
      },
    };
  }

  enqueue(kind, filled, { ttlMs = 15_000 } = {}) {
    if (!this.on || !filled) return;
    const urgent = kind === 'gift';
    if (!urgent && this.queue.length >= MAX_SIDE_QUEUE) return;
    if (!urgent && this.voice.busy() > VOICE_BACKLOG_LIMIT) return;
    filled.parts.forEach((part) => this.voice.clip(part, { urgent }));
    // Hạn tính từ lúc MC rảnh: đang đọc câu hỏi dài thì lời chào không bị hết hạn oan.
    const expires = Math.max(this.now(), this.busyUntil) + ttlMs;
    this.queue.push({ kind, priority: PRIORITY[kind] ?? 1, parts: filled.parts, expires });
  }

  // Câu phụ phải nói xong trước khi phần chính kế tiếp bắt đầu.
  deadline() {
    const game = this.game;
    if (!game) return Infinity;
    // Đang chờ đủ người thì không có hạn.
    if (game.phase === 'lobby' && this.now() >= game.endsAt) return Infinity;
    return game.endsAt;
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
      this.emit({ type: 'say', clips: ids.map((id) => ({ id })), cut: false, delayMs: 0 });
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
    if (question.explain) parts.push(this.say(question.explain));
    return parts;
  }

  prepareUpcoming(count = 2) {
    if (!this.on || !this.game) return;
    for (const question of this.game.questions.peek(count)) {
      this.questionParts(question).forEach((part) => this.voice.clip(part, { urgent: true }));
    }
  }

  prepareName(name) {
    const spoken = readableName(name ?? '');
    if (spoken && this.voice.busy() <= VOICE_BACKLOG_LIMIT) this.voice.clip(spoken);
  }

  // Tất cả các mẩu dùng chung, không gồm câu hỏi và tên.
  staticParts() {
    const out = new Set();
    const add = (template, vars = {}) => {
      const line = template.replace(/\{letter\}/g, vars.letter ?? '');
      for (const piece of line.split(/\{name\}|\{n\}/)) {
        const spoken = piece.replace(/^[\s,.!?:]+/, '').trim();
        if (spoken) out.add(this.say(spoken));
      }
    };
    const { lines } = this;
    for (const [key, value] of Object.entries(lines)) {
      if (key === 'fixes' || key === 'letters' || key === 'answerIs') continue;
      (Array.isArray(value) ? value : [value]).forEach((line) => add(line));
    }
    for (const letter of lines.letters) {
      out.add(this.say(`${letter}.`));
      lines.answerIs.forEach((line) => add(line, { letter }));
    }
    const maxNumber = Math.max(NUMBERS_READY, this.game?.config.maxQuestions ?? 0);
    for (let n = 1; n <= maxNumber; n++) out.add(String(n));
    return [...out];
  }

  // Sắp hỏi câu mới mà giọng câu đó chưa có: chờ một lát, Vbee cần vài giây. Quá lâu thì cứ hỏi, chỉ không đọc câu hỏi.
  holdAsk(limitMs = 12_000) {
    if (!this.on || !this.game) return false;
    const [next] = this.game.questions.peek(1);
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

  // ---------- Phần chính ----------
  asking(question, { mode, no, goldenNo, finalist }) {
    this.urged = false;
    this.queue = this.queue.filter((entry) => entry.kind === 'gift');
    if (!this.on) return 0;
    const { lines } = this;
    const { clips, add } = this.builder();
    if (mode === 'rescue') add(this.fill(this.pick('rescueAsk')));
    else if (mode === 'golden') add(this.fill(lines.goldenAsk, { n: goldenNo }));
    else if (no === 1) {
      add(this.fill(this.pick('welcome')));
      add(this.fill(this.pick('first')));
    } else add(this.fill(lines.number, { n: no }));
    // Giọng câu này chưa kịp có thì mời đọc trên màn hình, không đọc "A, Bê, Xê, Đê" trống không.
    if ([question.text, ...question.options].every((part) => this.voice.ready(this.say(part)))) {
      clips.push({ say: this.say(question.text) });
      question.options.forEach((option, opt) => {
        clips.push({ say: this.say(`${lines.letters[opt]}.`), opt });
        clips.push({ say: this.say(option), opt });
      });
      if (!(mode === 'golden' && add(this.fill(this.pick('goGolden'), { name: finalist })))) add(this.fill(this.pick('go')));
    } else add(this.fill(this.pick('readBoard')));
    const ms = this.playMain(clips, { delayMs: this.leadMs });
    this.prepareUpcoming();
    return ms;
  }

  revealing({ question, result, alive, goldenNo, goldenTotal }) {
    if (!this.on) return 0;
    const { lines } = this;
    const { clips, add } = this.builder();
    const nameOf = (pid) => this.game?.byPid.get(pid)?.name ?? '';
    add(this.fill(this.pick('timeUp')));
    add(this.fill(this.pick('answerIs'), { letter: lines.letters[result.correct] }));
    clips.push({ say: this.say(question.explain || question.options[question.correct]) });
    if (result.mode === 'main') {
      if (result.allWrong) add(this.fill(this.pick('allWrong')));
      else if (!result.out.length) add(this.fill(this.pick('allRight')));
      else if (!add(this.fill(this.pick('out'), { n: result.out.length }))) add(this.fill(this.pick('outSome')));
      const saved = result.saved.map(nameOf).find((name) => readableName(name) && this.voice.ready(readableName(name)));
      if (saved) add(this.fill(this.pick('saved'), { name: saved }));
      if (result.fastest && alive > 1) add(this.fill(this.pick('fastest'), { name: result.fastest.name }));
      if (result.out.length && alive > 1) add(this.fill(lines.remain, { n: alive }));
    } else if (result.mode === 'rescue') {
      if (result.back.length) add(this.fill(this.pick('back'), { n: result.back.length }));
      else add(this.fill(this.pick('backNone')));
    } else if (result.passed) {
      add(this.fill(this.pick('goldenRight')));
      if (goldenNo < goldenTotal) add(this.fill(lines.goldenLeft, { n: goldenTotal - goldenNo }));
    } else add(this.fill(this.pick('goldenWrong')));
    return this.playMain(clips, { delayMs: 400 });
  }

  introducing(mode, finalist, goldenTotal) {
    if (!this.on) return 0;
    const { clips, add } = this.builder();
    if (mode === 'rescue') add(this.fill(this.pick('rescueIntro')));
    else {
      add(this.fill(this.pick('goldenIntro')));
      if (finalist) add(this.fill(this.pick('goldenName'), { name: finalist.name }));
      add(this.fill(this.lines.goldenRule, { n: goldenTotal }));
    }
    return this.playMain(clips, { delayMs: 600 });
  }

  finishing(champion) {
    if (!this.on) return 0;
    const { clips, add } = this.builder();
    const [winner] = champion.winners;
    if (champion.kind === 'bell' || champion.kind === 'fail') add(this.fill(this.pick(champion.kind), { name: winner?.name }));
    else if (champion.kind === 'many') add(this.fill(this.pick('many'), { n: champion.winners.length + champion.moreWinners }));
    else add(this.fill(this.pick('empty')));
    add(this.fill(this.pick('nextMatch')));
    // Đợi tiếng chuông và nhạc kết thúc vang lên trước.
    return this.playMain(clips, { delayMs: champion.kind === 'bell' ? 2600 : 1200 });
  }

  // ---------- Phần phụ ----------
  onEvent(msg) {
    if (msg.type === 'reset') return this.stop();
    if (!this.on) return;
    switch (msg.type) {
      case 'join':
        this.prepareName(msg.player.name);
        this.enqueue('join', this.fill(this.pick('join'), { name: msg.player.name }), { ttlMs: 10_000 });
        break;
      case 'answer':
        this.prepareName(this.game?.byPid.get(msg.pid)?.name);
        break;
      case 'gift': {
        const key = msg.revived ? 'revive' : msg.shields ? 'shield' : 'cheer';
        this.prepareName(msg.name);
        this.enqueue('gift', this.fill(this.pick(key), { name: msg.name }), { ttlMs: 60_000 });
        break;
      }
    }
  }

  // Lúc mở sàn thì mời lên sàn; lúc hỏi thì giục khi sắp hết giờ.
  liven() {
    const game = this.game;
    if (!game) return;
    const t = this.now();
    if (game.phase === 'lobby') {
      if (t - this.lastInvite >= INVITE_EVERY_MS && t >= this.busyUntil && !this.queue.length) {
        this.lastInvite = t;
        this.enqueue('invite', this.fill(this.pick('invite')), { ttlMs: 8000 });
      }
      return;
    }
    if (game.phase !== 'asking' || this.urged || t < game.timerFrom) return;
    if (game.endsAt - t <= 6000) {
      this.urged = true;
      if (game.answers.size < game.eligibleCount()) this.enqueue('urge', this.fill(this.pick('urge')), { ttlMs: 3000 });
    }
  }

  tick() {
    if (!this.on) return;
    this.liven();
    this.pump();
  }
}
