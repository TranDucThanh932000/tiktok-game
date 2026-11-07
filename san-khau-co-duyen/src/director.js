// Điều phối hai MC. Mỗi lúc chỉ một giọng; máy chủ biết độ dài từng câu nên trang game chỉ việc phát.
// Lời thoại lấy từ lines.json và chỉ đọc dữ liệu đã khóa trong Game; Director không đổi điểm, người hay đồng hồ.
import { speakable, spokenName } from './text.js';
import { PHASE } from './game.js';

const LINE_GAP_MS = 250;
const MIN_LINE_MS = 900;
const MS_PER_CHAR = 57; // Đo từ giọng Vbee thật: khoảng 17,4 ký tự/giây.
const CLIP_GAP_MS = 40;
const REPEAT_LOCK_MS = 180_000;
const REMINDER_EVERY_MS = 60_000;
const IDLE_GAP_MS = [12_000, 20_000];
const NAME_WAIT_MS = 2500;
const BATCH_MS = 4000;
const THANK_GAP_MS = 12_000;
// Những cảnh dẫn được phép dừng giữa hai câu để cảm ơn người gửi lời chúc.
const THANKS_CAN_JOIN = new Set(['intro', 'cheer']);
const CHEER_WINDOW_MS = 5000;
const CHEER_BURST = 5;

// Số nhỏ nói trước. Phần dẫn chính có scene riêng; lời cảm ơn và chào hỏi nhường chỗ.
const PRIORITY = {
  pausedConnection: 1, pausedOperator: 1, withdrawn: 1, removed: 1, reconfirm: 1, resumedEmpty: 1, reconfirmEnd: 1, demoYield: 1,
  guide: 2, matched: 2, mismatch: 2, noresponse: 2,
  invite: 3, nextReady: 3, nextWait: 3, intro: 3, cheer: 3, opening: 3,
  share: 4, milestone: 5, gift: 5, burst: 5, card: 6, join: 6, idle: 7,
};

export class Director {
  // voices: { duy, linh } là thư viện giọng; thiếu giọng thì chỉ hiện phụ đề, thời lượng ước theo số chữ.
  constructor({ lines, voices, emit = () => {}, now = Date.now, rng = Math.random, enabled = () => true, trimMs = 200, bigGiftScore = 100 }) {
    Object.assign(this, { lines, voices, emitRaw: emit, now, rng, enabled, trimMs, bigGiftScore });
    this.game = null;
    this.queue = [];
    this.current = null;
    this.busyUntil = 0;
    this.timed = [];
    this.lastPlayed = new Map();
    this.lastReminder = 0;
    this.nextIdle = 0;
    this.cooldowns = new Map();
    this.joinBatch = [];
    this.giftBatch = [];
    this.cheers = [];
    this.batchAt = 0;
    this.paused = null; // Cảnh dẫn đang nhường chỗ cho lời cảm ơn.
    this.trimScene = false;
  }

  attach(game) {
    this.game = game;
  }

  // ---------- Dữ liệu điền vào câu thoại ----------
  #vars() {
    const pair = this.game?.pair;
    const name = (side, fallback) => {
      const display = pair?.[side]?.name ?? '';
      return { show: display, speak: spokenName(display) || fallback };
    };
    return {
      TEN_NAM: name('male', 'bạn hàng Nam'),
      TEN_NU: name('female', 'bạn hàng Nữ'),
      DIEM: pair ? { show: String(pair.score), speak: String(pair.score) } : null,
      SO_CAP_MOI: { show: String((this.game?.pairNo ?? 0) + 1), speak: String((this.game?.pairNo ?? 0) + 1) },
    };
  }

  // Tách câu thành các mẩu giọng: phần chữ cố định dùng lại được, phần tên tạo riêng từng người.
  #parts(text, vars) {
    const pieces = String(text).split(/(\{[A-Z_]+\})/);
    const caption = [];
    const spoken = [];
    for (const piece of pieces) {
      const match = piece.match(/^\{([A-Z_]+)\}$/);
      if (!match) {
        if (piece) {
          caption.push(piece);
          const clean = speakable(piece).replace(/^[\s,.!?;:]+/, '');
          if (clean) spoken.push(clean);
        }
        continue;
      }
      const value = vars[match[1]];
      caption.push(value?.show ?? '');
      if (value?.speak) spoken.push(value.speak);
    }
    return { caption: caption.join('').replace(/\s+/g, ' ').trim(), spoken };
  }

  // Mọi mẩu chữ cố định, để tạo sẵn lúc bật server.
  staticParts() {
    const out = { duy: new Set(), linh: new Set() };
    const add = ([who, text]) => this.#parts(text, {}).spoken.forEach((part) => out[who]?.add(part));
    for (const [key, value] of Object.entries(this.lines)) {
      if (key === 'idle' || key === 'wishes') Object.values(value).flat(1).forEach((cluster) => cluster.forEach(add));
      else if (key === 'decide') value.forEach((row) => add([row.who, row.text]));
      else value.forEach(add);
    }
    for (const mark of this.game?.milestones ?? []) out.duy.add(String(mark));
    // Tên diễn viên được gọi trong cặp diễn mẫu, tạo sẵn như lời thoại.
    for (const { male, female } of this.game?.config?.demo?.pairs ?? []) {
      for (const name of [male, female]) {
        const spoken = spokenName(name);
        if (spoken) {
          out.duy.add(spoken);
          out.linh.add(spoken);
        }
      }
    }
    return { duy: [...out.duy], linh: [...out.linh] };
  }

  prepareName(name) {
    const spoken = spokenName(name);
    if (!spoken) return;
    this.voices.duy?.clip(spoken, { urgent: true });
    this.voices.linh?.clip(spoken, { urgent: true });
  }

  // ---------- Hàng đợi ----------
  #enqueue(key, rows, { prio = 6, scope, vars, hold = false, expiresIn, then = null, gifts = null } = {}) {
    if (!rows?.length) return;
    const cluster = {
      key,
      rows: rows.map(([who, text]) => ({ who, text })),
      then,
      gifts,
      total: rows.length,
      prio,
      scope: scope ?? null,
      vars: vars ?? {},
      holdUntil: hold ? this.now() + NAME_WAIT_MS : 0,
      expires: expiresIn ? this.now() + expiresIn : 0,
      isScene: prio <= 4,
    };
    if (hold) this.#requestClips(cluster);
    this.queue.push(cluster);
    this.queue.sort((a, b) => a.prio - b.prio);
  }

  #requestClips(cluster) {
    const vars = { ...this.#vars(), ...cluster.vars };
    for (const { who, text } of cluster.rows) for (const part of this.#parts(text, vars).spoken) this.voices[who]?.clip(part, { urgent: true });
  }

  #clipsReady(cluster) {
    const vars = { ...this.#vars(), ...cluster.vars };
    return cluster.rows.every(({ who, text }) => this.#parts(text, vars).spoken.every((part) => !this.voices[who]?.enabled || this.voices[who].ready(part)));
  }

  // Sang cảnh mới: bỏ câu đùa và lời cảm ơn đang chờ, câu đang nói được nói hết (trừ khi có stop()).
  scene(name) {
    this.#keepUnthanked();
    this.queue = [];
    this.current = null;
    this.paused = null;
    this.trimScene = false;
    this.timed = [];
    if (name === 'decide') return this.#startCountdown();
    const scope = this.game?.pair?.id ?? null;
    const prio = PRIORITY[name] ?? 3;
    let rows = this.#sceneRows(name);
    let vars;
    // Hết lượt mà còn lời chúc chưa kịp cảm ơn: cảm ơn trước khi sang cặp mới.
    if ((name === 'nextReady' || name === 'nextWait') && this.giftBatch.length) {
      vars = { TEN_KHAN_GIA: this.#donorVar(this.#topGift(this.giftBatch)) };
      rows = [...this.lines.wishLate, ...rows];
      this.giftBatch = [];
    }
    // Tên người vừa đăng ký có thể chưa kịp tạo giọng: chờ một nhịp ngắn trước khi mời.
    this.#enqueue(name, rows, { prio, scope: prio === 1 ? null : scope, then: this.#sceneFollowUp(name), hold: name === 'invite', vars });
    if (['matched', 'mismatch', 'noresponse'].includes(name)) this.busyUntil = 0; // "Hết giờ!" đúng mốc đóng cửa.
  }

  #sceneRows(name) {
    if (name === 'mismatch' && this.game?.pair?.score >= this.bigGiftScore) return [...this.lines.mismatch, ...this.lines.mismatchBigGifts];
    return this.lines[name] ?? [];
  }

  // Phần chọn lúc MC nói tới, theo dữ liệu mới nhất chứ không theo lúc vào cảnh.
  #sceneFollowUp(name) {
    if (name === 'intro') {
      return () => {
        const pair = this.game?.pair;
        return pair && !pair.shared.male && !pair.shared.female ? this.lines.noShare : [];
      };
    }
    if (name === 'cheer') {
      return () => {
        const score = this.game?.pair?.score ?? 0;
        if (!score) return this.lines.scoreQuiet;
        const hasNumber = !this.voices.duy?.enabled || this.voices.duy.ready(String(score));
        this.voices.duy?.clip(String(score));
        return hasNumber ? this.lines.scoreUp : this.lines.scoreUpNoNumber;
      };
    }
    return null;
  }

  sceneBusy() {
    // Đã cảm ơn chen vào cảnh này: tới giờ thì sang cảnh sau, bỏ phần dẫn còn lại để vòng chơi không dài ra.
    // Lượt cảm ơn đang nói thì nói cho hết, để không mất câu chúc phúc.
    if (this.trimScene && this.now() >= (this.game?.phaseEnd ?? Infinity)) {
      return this.now() < this.busyUntil || Boolean(this.current?.gifts && this.current.rows.length);
    }
    if (this.now() < this.busyUntil && (this.current?.isScene || this.paused)) return true;
    if (this.timed.length || this.paused) return true;
    return Boolean(this.current?.isScene && (this.current.rows.length || this.current.then)) || this.queue.some((cluster) => cluster.isScene);
  }

  // Lời cảm ơn chưa kịp nói không bị mất khi đổi cảnh; quà của cặp đã qua thì không cảm ơn nhầm sang cặp mới.
  #keepUnthanked() {
    const waiting = [this.current, ...this.queue].flatMap((cluster) => cluster?.gifts && cluster.rows.length === cluster.total ? cluster.gifts : []);
    const pairId = this.game?.pair?.id;
    this.giftBatch = [...waiting, ...this.giftBatch].filter((gift) => gift.pairId === pairId);
  }

  // Dừng ngay câu đang nói: chỉ dùng cho dừng khẩn cấp hoặc người chơi rút lui.
  stop() {
    this.#keepUnthanked();
    this.queue = [];
    this.current = null;
    this.paused = null;
    this.trimScene = false;
    this.timed = [];
    this.busyUntil = 0;
    this.emitRaw({ type: 'say-stop' });
  }

  #startCountdown() {
    const open = this.now();
    this.timed = this.lines.decide.map((row) => ({ ...row, due: open + row.at }));
  }

  // ---------- Phản ứng theo sự kiện ----------
  onEvent(message) {
    switch (message.type) {
      case 'viewer-in':
        this.joinBatch.push(message.viewer);
        break;
      case 'gift':
        if (message.state === 'counted' || message.state === 'pending') {
          this.giftBatch.push({ ...message, pairId: this.game?.pair?.id });
          this.prepareName(message.name); // Để tới lượt cảm ơn là gọi được tên ngay.
        }
        break;
      case 'cheer':
        if (message.counted) this.cheers.push(this.now());
        break;
      case 'milestone':
        this.#enqueue('milestone', this.lines.milestone, {
          prio: PRIORITY.milestone,
          scope: this.game?.pair?.id,
          vars: { MOC_DIEM: { show: message.mark.toLocaleString('vi-VN'), speak: String(message.mark) } },
        });
        break;
      case 'share': {
        const pair = this.game?.pair;
        if (!pair) break;
        this.#enqueue('share', message.side === 'male' ? this.lines.shareMale : this.lines.shareFemale, {
          prio: PRIORITY.share,
          scope: pair.id,
          vars: { Y_NGAN: { show: message.text, speak: speakable(message.text) } },
          hold: true,
        });
        break;
      }
      case 'card':
        if (message.kind === 'queued') {
          this.prepareName(message.name);
          this.nextIdle = Math.min(this.nextIdle, this.now() + 1500);
          if (this.game && this.game.queues[message.side].length >= 5 && this.#cooled('longQueue', 120_000)) this.#enqueue('longQueue', this.lines.longQueue, { prio: PRIORITY.card, expiresIn: 15_000 });
        }
        if (message.kind === 'already' && this.#cooled('already', 20_000)) this.#enqueue('alreadyQueued', this.lines.alreadyQueued, { prio: PRIORITY.card, expiresIn: 10_000 });
        break;
      default:
    }
  }

  #cooled(key, ms) {
    const t = this.now();
    if (t - (this.cooldowns.get(key) ?? -Infinity) < ms) return false;
    this.cooldowns.set(key, t);
    return true;
  }

  // Trong cửa 10 giây và lúc hướng dẫn không chèn đọc tên hay chào người mới.
  get #quiet() {
    const phase = this.game?.phase;
    return phase === PHASE.DECIDE || phase === PHASE.GUIDE || phase === PHASE.PAUSED || phase === PHASE.RECONFIRM || phase === PHASE.OPENING || phase === PHASE.TRANSITION;
  }

  #flushBatches() {
    const t = this.now();
    if (!this.batchAt || t - this.batchAt < BATCH_MS) {
      if (!this.batchAt) this.batchAt = t;
      return;
    }
    this.batchAt = t;
    const joins = this.joinBatch.splice(0);
    while (this.cheers.length && t - this.cheers[0] > CHEER_WINDOW_MS) this.cheers.shift();
    if (this.#quiet) return; // Quà vẫn nằm trong đợt chờ, sẽ được cảm ơn khi hết phần cần yên lặng.

    const pairId = this.game?.pair?.id;
    this.giftBatch = this.giftBatch.filter((gift) => gift.pairId === pairId);
    // Quà lớn được cảm ơn ngay, không chờ hết khoảng nghỉ giữa hai lượt cảm ơn.
    const big = this.giftBatch.some((gift) => gift.points >= this.bigGiftScore);
    if (this.giftBatch.length && pairId && this.#cooled('gift', big ? 0 : THANK_GAP_MS)) this.#thank(this.giftBatch.splice(0), pairId);
    if (this.cheers.length >= CHEER_BURST && pairId && this.#cooled('burst', 45_000)) {
      this.#enqueue('burst', this.lines.cheerBurst, { prio: PRIORITY.burst, scope: pairId });
    }
    if (joins.length && this.#cooled('join', 25_000)) {
      if (joins.length >= 3) this.#enqueue('joinMany', this.lines.joinMany, { prio: PRIORITY.join, expiresIn: 12_000 });
      else {
        const name = joins.at(-1).name;
        const spoken = spokenName(name);
        if (spoken) this.#enqueue('joinOne', this.lines.joinOne, { prio: PRIORITY.join, hold: true, expiresIn: 12_000, vars: { TEN_KHAN_GIA: { show: name, speak: spoken } } });
      }
    }
  }

  #topGift(gifts) {
    return [...gifts].sort((a, b) => b.points - a.points)[0];
  }

  #donorVar(gift) {
    return { show: gift.name, speak: spokenName(gift.name) || 'bạn' };
  }

  // Mỗi món quà là một lời chúc: một MC cảm ơn người gửi, MC kia chúc phúc cho hai bạn.
  // Dồn dập thì gộp một lượt cảm ơn, gọi tên người gửi món lớn nhất; điểm đã được Game cộng đủ.
  #thank(gifts, pairId) {
    const gift = this.#topGift(gifts);
    const senders = new Set(gifts.map((row) => row.by));
    let kind = 'plain';
    if (senders.size >= 3) kind = 'group';
    else if (['rose', 'heart', 'box'].includes(gift.key)) kind = gift.key;
    else if (gift.known) kind = 'other'; // Tên quà chỉ đọc khi đã ánh xạ đúng danh mục.
    const picked = this.#leastRecent(kind);
    const vars = { TEN_KHAN_GIA: this.#donorVar(gift), TEN_QUA: { show: gift.label, speak: gift.label } };
    this.#enqueue(`wish:${kind}`, picked, { prio: PRIORITY.gift, scope: pairId, vars, hold: true, gifts });
  }

  // Câu chúc lâu chưa nói nhất, để lời cảm ơn liên tiếp không lặp một kiểu.
  #leastRecent(kind) {
    const pool = this.lines.wishes[kind];
    let best = 0;
    let oldest = Infinity;
    pool.forEach((rows, index) => {
      const at = this.lastPlayed.get(`wish:${kind}:${index}`) ?? -Infinity;
      if (at < oldest) {
        oldest = at;
        best = index;
      }
    });
    this.lastPlayed.set(`wish:${kind}:${best}`, this.now());
    return pool[best];
  }

  // ---------- Giao lưu lúc chờ ----------
  #pickIdle() {
    const t = this.now();
    const { male = [], female = [] } = this.game?.queues ?? {};
    let reminderPool = this.lines.idle.remindEmpty;
    if (male.length && !female.length) reminderPool = this.lines.idle.remindFemale;
    if (female.length && !male.length) reminderPool = this.lines.idle.remindMale;
    const free = (pool, tag) => pool.map((rows, index) => ({ rows, key: `${tag}:${index}` })).filter(({ key }) => t - (this.lastPlayed.get(key) ?? -Infinity) >= REPEAT_LOCK_MS);

    const remindDue = t - this.lastReminder >= REMINDER_EVERY_MS;
    if (remindDue) {
      // Hướng dẫn bắt buộc được phép lặp, nên hết cụm mới thì lấy lại cụm cũ.
      const pool = free(reminderPool, 'remind').length ? free(reminderPool, 'remind') : reminderPool.map((rows, index) => ({ rows, key: `remind:${index}` }));
      this.lastReminder = t;
      return this.#choice(pool);
    }
    const talk = [...free(this.lines.idle.banter, 'banter')];
    if (!male.length && !female.length) talk.push(...free(this.lines.idle.empty, 'empty'));
    return talk.length ? this.#choice(talk) : null;
  }

  #choice(pool) {
    return pool[Math.floor(this.rng() * pool.length)];
  }

  #queueIdle() {
    const t = this.now();
    if (t < this.nextIdle) return;
    const [low, high] = IDLE_GAP_MS;
    this.nextIdle = t + low + this.rng() * (high - low);
    const picked = this.#pickIdle();
    if (!picked) return;
    this.lastPlayed.set(picked.key, t);
    this.#enqueue(picked.key, picked.rows, { prio: PRIORITY.idle, expiresIn: 8000 });
  }

  // ---------- Phát ----------
  tick() {
    const t = this.now();
    this.#flushBatches();
    if (this.timed.length && t >= this.timed[0].due) {
      const row = this.timed.shift();
      this.#speak(row.who, row.text, {});
      return;
    }
    if (this.timed.length || t < this.busyUntil) return;
    if (this.game?.phase === PHASE.DECIDE) return;
    if (this.game?.phase === PHASE.WAITING && !this.queue.length && !this.current?.rows.length) this.#queueIdle();

    // Giữa hai câu dẫn: có lời cảm ơn đang chờ thì nói trước, xong quay lại cảnh dẫn.
    if (this.current?.isScene && !this.paused && THANKS_CAN_JOIN.has(this.current.key)) {
      const thanks = this.#takeThanks(t);
      if (thanks) {
        this.paused = this.current;
        this.current = thanks;
        this.trimScene = true;
      }
    }
    this.#runFollowUp();
    if (!this.current?.rows.length) {
      if (this.paused) {
        // Các lượt cảm ơn nối liền nhau rồi mới quay lại cảnh dẫn.
        const thanks = this.#takeThanks(t);
        this.current = thanks ?? this.paused;
        if (!thanks) this.paused = null;
      } else {
        this.current = this.#nextCluster();
      }
      this.#runFollowUp();
    }
    const cluster = this.current;
    if (!cluster?.rows.length) return;
    if (cluster.scope && cluster.scope !== this.game?.pair?.id) {
      this.current = null;
      return;
    }
    const row = cluster.rows.shift();
    // Hết thời gian chờ mà tên chưa có giọng: mời chung, tên hai bạn đã hiện to trên màn hình.
    const nameless = cluster.key === 'invite' && row.text === this.lines.invite[0][1] && !this.#rowReady(row);
    this.#speak(row.who, nameless ? this.lines.inviteNoName[0][1] : row.text, cluster.vars);
  }

  #takeThanks(t) {
    const index = this.queue.findIndex((cluster) => cluster.prio === PRIORITY.gift && (t >= cluster.holdUntil || this.#clipsReady(cluster)));
    return index < 0 ? null : this.queue.splice(index, 1)[0];
  }

  #runFollowUp() {
    if (this.current && !this.current.rows.length && this.current.then) {
      this.current.rows = this.current.then().map(([who, text]) => ({ who, text }));
      this.current.then = null;
    }
  }

  #rowReady({ who, text }) {
    const voice = this.voices[who];
    if (!voice?.enabled) return true;
    return this.#parts(text, this.#vars()).spoken.every((part) => voice.ready(part));
  }

  #nextCluster() {
    const t = this.now();
    this.queue = this.queue.filter((cluster) => (!cluster.expires || t < cluster.expires) && (!cluster.scope || cluster.scope === this.game?.pair?.id));
    const index = this.queue.findIndex((cluster) => t >= cluster.holdUntil || this.#clipsReady(cluster));
    return index < 0 ? null : this.queue.splice(index, 1)[0];
  }

  #speak(who, text, extraVars) {
    const vars = { ...this.#vars(), ...extraVars };
    const { caption, spoken } = this.#parts(text, vars);
    const on = this.enabled();
    const voice = on ? this.voices[who] : null;
    const clips = [];
    let audioMs = 0;
    for (const part of spoken) {
      const id = voice?.ready(part);
      if (id) {
        clips.push(id);
        audioMs += Math.max(100, voice.duration(id) - this.trimMs) + CLIP_GAP_MS;
      } else {
        voice?.clip(part, { urgent: true });
      }
    }
    // Đủ giọng thì lấy độ dài thật. Thiếu một mẩu thì chỉ hiện phụ đề, không đọc câu mất chữ.
    const complete = clips.length > 0 && clips.length === spoken.length;
    const ms = complete ? Math.max(MIN_LINE_MS, audioMs) : Math.max(MIN_LINE_MS, Array.from(caption).length * MS_PER_CHAR);
    this.busyUntil = this.now() + ms + LINE_GAP_MS;
    this.emitRaw({ type: 'say', who, text: caption, clips: complete ? clips : [], ms });
  }
}
