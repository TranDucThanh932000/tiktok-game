// Giọng cô giáo: đọc gợi ý từ mới, mở chữ, khen bạn đoán ra đầu tiên, công bố đáp án.
// Mỗi câu ghép từ các mẩu Vbee đã lưu ở data/tts; mẩu riêng của từng từ được tạo trước vài từ nên đọc được ngay.
import { readableName, speakText } from './spoken.js';

const GAP_MS = 400;
const LOAD_MAIN_MS = 6000;
const LOAD_SIDE_MS = 4000;
const SIDE_QUEUE = 3;
const SIDE_MAX_WAIT_MS = 8000;
const PREPARE_AHEAD = 3;
const HURRY_AT_MS = 6000;
const ENCOURAGE_AT_MS = 28_000;
const FAST_MS = 10_000;

// Mỗi từ luôn dùng cùng một mẫu giới thiệu, để mẩu giọng tạo sẵn khớp với lúc đọc.
function hashOf(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

const flatten = (value) => (typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(flatten) : Object.values(value ?? {}).flatMap(flatten));

export class Teacher {
  constructor({ voice, lines, emit, enabled = () => true, now = Date.now, rng = Math.random }) {
    this.voice = voice;
    this.lines = lines;
    this.emit = emit;
    this.enabled = enabled;
    this.now = now;
    this.rng = rng;
    this.game = null;
    this.deck = null;
    this.queue = [];
    this.busyUntil = 0;
    this.run = 0;
    this.hurriedFor = 0;
    this.encouragedFor = 0;
    this.wordAt = 0;
    this.letters = 0;
    this.lastPick = new Map();
  }

  attach(game, deck) {
    this.game = game;
    this.deck = deck;
  }

  // Không nói lại đúng câu vừa nói của cùng loại.
  pick(key, list = this.lines[key]) {
    if (!Array.isArray(list)) return list;
    if (list.length < 2) return list[0];
    const last = this.lastPick.get(key);
    let i;
    if (last === undefined || last >= list.length) i = Math.floor(this.rng() * list.length);
    else {
      i = Math.floor(this.rng() * (list.length - 1));
      if (i >= last) i++;
    }
    this.lastPick.set(key, i);
    return list[i];
  }

  spoken(text) {
    return speakText(text, this.lines.fixes);
  }

  introText({ topic, hint }) {
    const plainTopic = String(topic).replace(/[^\p{L}\p{N}\s,]/gu, '').trim();
    const plainHint = String(hint).replace(/[.!?\s]+$/, '');
    const templates = [].concat(this.lines.intro);
    const template = templates[hashOf(plainHint) % templates.length];
    return this.spoken(template.replace('{topic}', () => plainTopic).replace('{hint}', () => plainHint));
  }

  answerText(answer) {
    return this.spoken(answer);
  }

  staticParts() {
    const { fixes, intro, ...rest } = this.lines;
    return flatten(rest).map((text) => this.spoken(text));
  }

  // Tạo sẵn giọng gợi ý và đáp án của vài từ sắp hỏi.
  prepare(n = PREPARE_AHEAD) {
    if (!this.voice.enabled || !this.deck) return;
    for (const word of this.deck.peek(n)) {
      this.voice.clip(this.introText(word));
      this.voice.clip(this.answerText(word.text));
    }
  }

  onEvent(msg) {
    const game = this.game;
    if (msg.type === 'word') {
      this.wordAt = this.now();
      this.letters = 0;
      const line = this.pick('newWord');
      this.say([this.spoken(line), this.introText(game.puzzle)], { main: true, text: line });
      this.prepare();
    } else if (msg.type === 'letter') {
      this.letters++;
      this.sayLine(msg.left === 0 ? 'lastLetter' : 'letter');
    } else if (msg.type === 'correct' && msg.first) {
      const name = readableName(msg.name);
      const fast = this.wordAt > 0 && this.letters === 0 && this.now() - this.wordAt <= FAST_MS;
      const tail = this.pick(fast ? 'firstFast' : 'first');
      if (name) this.say([name, this.spoken(tail)], { text: `${msg.name} ${tail}` });
      else this.sayLine('firstNoName');
    } else if (msg.type === 'correct') {
      const milestone = this.lines.milestones?.[msg.count];
      if (milestone) this.sayLine(`milestone${msg.count}`, milestone);
    } else if (msg.type === 'reveal') {
      const end = this.pick(msg.count === 0 ? 'nobody' : msg.count === 1 ? 'one' : msg.count >= 5 ? 'many' : 'some');
      const answerIs = this.pick('answerIs');
      const parts = [this.spoken(answerIs), this.answerText(game.puzzle.answer)];
      let text = `${answerIs} ${msg.answer}.`;
      const name = msg.fastest ? readableName(msg.fastest.name) : '';
      if (name) {
        const fastestIs = this.pick('fastestIs');
        // Tên chưa có giọng sẵn thì chỉ hiện chữ, kẻo câu đọc bị hụt tên.
        if (this.voice.ready(name)) parts.push(this.spoken(fastestIs), name);
        text += ` ${fastestIs} ${msg.fastest.name}!`;
      }
      this.say([...parts, this.spoken(end)], { main: true, text: `${text} ${end}` });
    } else if (msg.type === 'boost') {
      const name = readableName(msg.name);
      const tail = this.pick(msg.kind === 'follow' ? 'boostFollow' : msg.kind === 'share' ? 'boostShare' : 'boost');
      if (name) this.say([name, this.spoken(tail)], { text: `${msg.name} ${tail}` });
    }
  }

  sayLine(key, list) {
    const line = this.pick(key, list);
    this.say([this.spoken(line)], { text: line });
  }

  tick() {
    const game = this.game;
    const t = this.now();
    if (game?.phase === 'asking' && this.hurriedFor !== game.no) {
      const left = game.endsAt - t;
      if (left <= HURRY_AT_MS && left > 2000) {
        this.hurriedFor = game.no;
        this.sayLine('hurry');
      }
    }
    // Giữa từ mà chưa ai ra thì động viên, chỉ khi cô đang rảnh.
    if (game?.phase === 'asking' && this.encouragedFor !== game.no && !game.solvers?.size && t >= this.busyUntil && !this.queue.length) {
      if (t - this.wordAt >= ENCOURAGE_AT_MS && game.endsAt - t > HURRY_AT_MS + 2000) {
        this.encouragedFor = game.no;
        this.sayLine('encourage');
      }
    }
    while (this.queue.length && t >= this.busyUntil) {
      const item = this.queue.shift();
      if (t - item.at <= SIDE_MAX_WAIT_MS) {
        this.play(item);
        break;
      }
    }
  }

  // Lời chính (từ mới, công bố) cắt ngang mọi thứ; lời phụ xếp hàng chờ cô nói xong, chờ lâu quá thì bỏ.
  say(parts, { main = false, text = '' } = {}) {
    const item = { parts: parts.filter(Boolean), main, text, at: this.now() };
    if (main) {
      this.queue = [];
      this.play(item);
    } else if (this.now() < this.busyUntil) {
      this.queue.push(item);
      if (this.queue.length > SIDE_QUEUE) this.queue.shift();
    } else this.play(item);
  }

  async play(item) {
    const run = ++this.run;
    let ids = [];
    if (this.voice.enabled && this.enabled()) {
      const limit = item.main ? LOAD_MAIN_MS : LOAD_SIDE_MS;
      this.busyUntil = this.now() + limit;
      let timer;
      const timeout = new Promise((resolve) => (timer = setTimeout(resolve, limit, null)));
      const loaded = await Promise.race([Promise.all(item.parts.map((part) => this.voice.clip(part, { urgent: true }))), timeout]);
      clearTimeout(timer);
      if (run !== this.run) return;
      ids = loaded ?? [];
      // Lời phụ thiếu một mẩu (ví dụ tên) thì thôi không đọc, chỉ hiện chữ.
      if (!item.main && ids.includes(null)) ids = [];
      ids = ids.filter(Boolean);
    }
    const ms = ids.reduce((sum, id) => sum + this.voice.duration(id) + 40, 0);
    this.busyUntil = this.now() + ms + GAP_MS;
    this.emit({ type: 'say', clips: ids.map((id) => ({ id })), text: item.text, ms, cut: item.main });
  }

  // Chế độ an toàn: im ngay.
  stop() {
    this.run++;
    this.queue = [];
    this.busyUntil = 0;
    this.emit({ type: 'say', clips: [], text: '', ms: 0, cut: true });
  }
}
