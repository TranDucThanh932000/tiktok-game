// Luật game: hàng chờ, điểm đẹp đôi, cửa quyết định 10 giây, kết quả, tạm dừng.
// Mọi quyết định nằm ở đây và chỉ dựa vào đồng hồ máy chủ; giọng MC hay hoạt ảnh chậm không làm đổi kết quả.
import { normalize, safeName, safeShare } from './text.js';

export const PHASE = {
  OPENING: 'opening',
  WAITING: 'waiting',
  INVITE: 'invite',
  INTRO: 'intro',
  CHEER: 'cheer',
  GUIDE: 'guide',
  DECIDE: 'decide',
  RESULT: 'result',
  TRANSITION: 'transition',
  PAUSED: 'paused',
  RECONFIRM: 'reconfirm',
};

// Cố định theo luật chương trình, không đặt trong config để không ai vô tình kéo dài cửa quyết định.
export const DECIDE_MS = 10_000;

const SIDES = ['male', 'female'];
const other = (side) => (side === 'male' ? 'female' : 'male');
const BEFORE_DECIDE = new Set([PHASE.INVITE, PHASE.INTRO, PHASE.CHEER, PHASE.GUIDE]);
const MAX_VIEWERS = 3000;
const MAX_SEEN = 20_000;

const idleDirector = { scene() {}, sceneBusy: () => false, onEvent() {}, stop() {} };

export class Game {
  constructor({ config, catalog, director = idleDirector, emit = () => {}, now = Date.now }) {
    Object.assign(this, { config, catalog, director, now });
    this.emitRaw = emit;
    this.timing = config.timing;
    this.milestones = [...(config.milestones ?? [])].sort((a, b) => a - b);
    this.bannedWords = config.bannedWords ?? [];
    this.demoOn = config.demo?.enabled === true;
    this.demoTurn = 0;
    this.queueTouched = 0;
    this.#clear();
    this.director.scene('opening');
  }

  #clear() {
    this.viewers = new Map();
    this.queues = { male: [], female: [] };
    this.banned = new Set();
    this.seen = new Set();
    this.streaks = new Map();
    this.pair = null;
    this.pairNo = 0;
    this.history = [];
    this.pending = [];
    this.pendingSeq = 0;
    this.paused = null;
    this.deadline = 0;
    this.joinEvents = 0;
    this.stateDirty = true;
    this.#setPhase(PHASE.OPENING, 0);
  }

  emit(message) {
    this.emitRaw(message);
    this.director.onEvent(message);
  }

  #setPhase(phase, ms) {
    this.phase = phase;
    this.phaseAt = this.now();
    this.phaseEnd = this.now() + ms;
    this.stateDirty = true;
  }

  // ---------- Người xem ----------
  // Một tài khoản chỉ có một nhân vật; sự kiện gửi lại không tạo thêm người.
  #viewer(user) {
    const id = String(user.id);
    let viewer = this.viewers.get(id);
    const isNew = !viewer;
    if (isNew) {
      viewer = { id, name: safeName(user.name, this.bannedWords), avatar: user.avatar ?? '' };
      this.viewers.set(id, viewer);
      if (this.viewers.size > MAX_VIEWERS) this.#forgetOldest();
      this.emit({ type: 'viewer-in', viewer });
    } else if (user.avatar && !viewer.avatar) {
      // Sự kiện đầu có thể chưa kèm ảnh: có ảnh lúc nào thì đổi đầu nhân vật lúc đó.
      viewer.avatar = user.avatar;
      this.emit({ type: 'viewer-update', viewer });
    }
    return viewer;
  }

  #forgetOldest() {
    for (const id of this.viewers.keys()) {
      if (this.#sideOf(id) || this.#queueOf(id)) continue;
      this.viewers.delete(id);
      return;
    }
  }

  // Người vào phòng: chỉ bước vào khán đài, không đăng ký hẹn hò.
  join(user) {
    this.joinEvents++;
    this.#viewer(user);
  }

  #duplicate(eventId) {
    if (!eventId) return false;
    if (this.seen.has(eventId)) return true;
    this.seen.add(eventId);
    if (this.seen.size > MAX_SEEN) this.seen.delete(this.seen.values().next().value);
    return false;
  }

  #sideOf(id) {
    const pair = this.pair;
    if (!pair || pair.closed) return null;
    return SIDES.find((side) => pair[side].id === id) ?? null;
  }

  #queueOf(id) {
    return SIDES.find((side) => this.queues[side].some((v) => v.id === id)) ?? null;
  }

  // Cửa nhận điểm: mở từ lúc tạo cặp đến hết phần kết quả.
  get openPair() {
    return this.pair?.scoreOpen ? this.pair : null;
  }

  // ---------- Bình luận ----------
  comment({ eventId, user, text }) {
    if (this.#duplicate(eventId)) return;
    const viewer = this.#viewer(user);
    const said = normalize(text);
    const side = this.#sideOf(viewer.id);
    if (said === 'rời hàng') return this.#leave(viewer, side);
    if (side && (said === 'đồng ý' || said === 'không đồng ý')) return this.#choose(side, said);
    if (side && said === 'tiếp tục') return this.#confirm(side);
    if (said === 'đẹp đôi') return this.#cheer(viewer);
    if (side && (this.phase === PHASE.INTRO || this.phase === PHASE.CHEER)) this.#share(side, text);
  }

  #cheer(viewer) {
    const pair = this.openPair;
    if (pair) {
      pair.comments++;
      this.#addScore(pair, 1, { kind: 'cheer', by: viewer.id });
    }
    this.emit({ type: 'cheer', by: viewer.id, counted: Boolean(pair) });
  }

  #share(side, text) {
    const pair = this.pair;
    if (pair.shared[side]) return;
    const clean = safeShare(text, this.bannedWords);
    if (!clean) return;
    pair.shared[side] = clean;
    this.stateDirty = true;
    this.emit({ type: 'share', side, text: clean });
    this.#changed();
  }

  // ---------- Quyết định ----------
  // bắt đầu <= lúc nhận < bắt đầu + 10 giây. Không phụ thuộc nhịp tick: lệnh đến đúng mốc đóng là muộn.
  #choose(side, said) {
    const pair = this.pair;
    if (this.phase === PHASE.DECIDE && this.now() < this.deadline) {
      pair.choices[side] = said === 'đồng ý' ? 'yes' : 'no';
      this.stateDirty = true;
      this.emit({ type: 'chosen', side });
      this.#changed();
      return;
    }
    if (BEFORE_DECIDE.has(this.phase)) this.emit({ type: 'choice-note', side, note: 'early' });
    else if (this.phase === PHASE.DECIDE || this.phase === PHASE.RESULT) this.emit({ type: 'choice-note', side, note: 'late' });
  }

  #lockChoices() {
    const pair = this.pair;
    const { male, female } = pair.choices;
    pair.locked = true;
    pair.result = !male || !female ? 'noresponse' : male === 'yes' && female === 'yes' ? 'matched' : 'mismatch';
    this.#setPhase(PHASE.RESULT, this.timing.resultSeconds * 1000);
    this.emit({ type: 'reveal', result: pair.result });
    this.director.scene(pair.result);
    this.#changed();
  }

  // ---------- Quà ----------
  gift({ eventId, user, gift, repeatCount = 1, combo = false, groupId = '', repeatEnd = false }) {
    if (this.#duplicate(eventId)) return;
    const viewer = this.#viewer(user);
    const info = this.catalog.resolve(gift);
    const { count, pairId } = this.#giftGain({ viewer, gift, repeatCount, combo, groupId, repeatEnd });
    if (count <= 0) return;

    const pair = this.openPair;
    const onDemo = Boolean(pair?.demo);
    // Quà thật không bao giờ tính cho cặp diễn mẫu.
    const credited = pair && !onDemo && pair.id === pairId ? pair : null;
    if (credited && info.coins === null) this.#addPending(credited, viewer, info, count);
    else if (credited) {
      credited.coins += info.coins * count;
      this.#addScore(credited, info.coins * count, { kind: 'gift', by: viewer.id });
    }
    this.emit({
      type: 'gift',
      by: viewer.id,
      name: viewer.name,
      key: info.key,
      label: info.label,
      known: info.known,
      image: gift.image ?? '',
      // Quà gửi trong lúc có cặp là một lời chúc tới hai bạn; lúc sân khấu trống thì chưa có ai để chúc.
      wish: credited ? this.#nextWish(info.key) : '',
      count,
      points: credited && info.coins !== null ? info.coins * count : 0,
      state: onDemo ? 'demo' : !credited ? 'nopair' : info.coins === null ? 'pending' : 'counted',
    });
    if (info.registers) this.#register(viewer, info.registers);
  }

  #nextWish(key) {
    const wishes = this.config.giftWishes ?? {};
    const pool = wishes[key] ?? wishes.other ?? [];
    if (!pool.length) return '';
    this.wishTurn = (this.wishTurn ?? 0) + 1;
    return pool[this.wishTurn % pool.length];
  }

  // Combo báo số lũy kế: chỉ phần mới tăng được tính, và combo giữ mã cặp từ lúc bắt đầu.
  #giftGain({ viewer, gift, repeatCount, combo, groupId, repeatEnd }) {
    const repeat = Math.max(1, Number(repeatCount) || 1);
    if (!combo) return { count: repeat, pairId: this.openPair?.id ?? null };
    const key = `${viewer.id}:${gift.id ?? gift.name}:${groupId}`;
    let streak = this.streaks.get(key);
    if (!streak || repeat < streak.last) streak = { pairId: this.openPair?.id ?? null, last: 0 };
    const count = repeat - streak.last;
    streak.last = repeat;
    if (repeatEnd) this.streaks.delete(key);
    else this.streaks.set(key, streak);
    if (this.streaks.size > 2000) this.streaks.delete(this.streaks.keys().next().value);
    return { count, pairId: streak.pairId };
  }

  #addPending(pair, viewer, info, count) {
    pair.pendingCount++;
    this.pending.push({ id: ++this.pendingSeq, pairId: pair.id, pairNo: pair.no, by: viewer.name, label: info.label, count, at: this.now() });
    this.stateDirty = true;
    this.#changed();
  }

  // Đối soát quà chờ giá: chỉ cộng vào đúng cặp đã gắn, không sang cặp đang diễn ra.
  reconcile(pendingId, coins) {
    const index = this.pending.findIndex((entry) => entry.id === Number(pendingId));
    if (index < 0) return false;
    const [entry] = this.pending.splice(index, 1);
    const record = this.pair?.id === entry.pairId ? this.pair : this.history.find((row) => row.id === entry.pairId);
    if (record) {
      const points = Math.max(0, Math.trunc(Number(coins)) || 0) * entry.count;
      record.pendingCount = Math.max(0, record.pendingCount - 1);
      record.coins += points;
      record.score += points;
      if (record === this.pair) this.emit({ type: 'score', pairId: record.id, score: record.score, delta: points, kind: 'reconcile' });
    }
    this.stateDirty = true;
    this.#changed();
    return true;
  }

  #addScore(pair, delta, { kind, by }) {
    const before = pair.score;
    pair.score += delta;
    this.stateDirty = true;
    this.emit({ type: 'score', pairId: pair.id, score: pair.score, delta, kind, by });
    // Mỗi mốc báo một lần; vượt nhiều mốc một lúc thì chỉ đọc mốc cao nhất.
    const crossed = this.milestones.filter((mark) => before < mark && pair.score >= mark && !pair.marks.includes(mark));
    if (crossed.length) {
      pair.marks.push(...crossed);
      this.emit({ type: 'milestone', mark: crossed.at(-1) });
    }
  }

  // ---------- Hàng chờ ----------
  #register(viewer, side) {
    if (this.banned.has(viewer.id)) return;
    if (this.#sideOf(viewer.id)) return this.#card(viewer, 'onstage', side);
    const current = this.#queueOf(viewer.id);
    if (current === side) return this.#card(viewer, 'already', side);
    if (current) return this.#card(viewer, 'other', current);
    this.queues[side].push(viewer);
    this.queueTouched = this.now();
    this.stateDirty = true;
    this.#card(viewer, 'queued', side);
    this.#changed();
  }

  #card(viewer, kind, side) {
    const position = this.queues[side].findIndex((v) => v.id === viewer.id) + 1;
    this.emit({ type: 'card', kind, side, position, id: viewer.id, name: viewer.name });
  }

  #leave(viewer, side) {
    if (side) return this.#stopTurn(side);
    const queue = this.#queueOf(viewer.id);
    if (!queue) return;
    this.queues[queue] = this.queues[queue].filter((v) => v.id !== viewer.id);
    this.queueTouched = this.now();
    this.stateDirty = true;
    this.#card(viewer, 'left', queue);
    this.#changed();
  }

  // Lấy một người mỗi hàng trong cùng một thao tác, nên không ai bị ghép vào hai lượt.
  #takeNext() {
    const [male, female] = [this.queues.male[0], this.queues.female[0]];
    if (!male || !female || male.id === female.id) return null;
    this.queues.male.shift();
    this.queues.female.shift();
    return { male, female };
  }

  #newPair({ male, female }, { demo = false } = {}) {
    const no = demo ? 0 : ++this.pairNo;
    this.pair = {
      id: `${this.now().toString(36)}-${demo ? `demo${++this.demoTurn}` : no}`,
      no,
      demo,
      male,
      female,
      score: 0,
      comments: 0,
      coins: 0,
      pendingCount: 0,
      scoreOpen: true,
      closed: false,
      locked: false,
      choices: { male: null, female: null },
      shared: { male: '', female: '' },
      marks: [],
      result: null,
      status: 'playing',
      confirm: { male: false, female: false },
      startedAt: this.now(),
    };
    this.stateDirty = true;
    return this.pair;
  }

  #tryInvite() {
    if (this.paused || this.pair) return false;
    const people = this.#takeNext();
    if (!people) return false;
    this.#newPair(people);
    this.#setPhase(PHASE.INVITE, this.timing.inviteSeconds * 1000);
    this.director.scene('invite');
    this.#changed();
    return true;
  }

  // ---------- Cặp diễn mẫu ----------
  // Chỉ diễn khi cả hai hàng đều trống: bot chỉ ghép với bot, người thật không bao giờ bị ghép với bot.
  #tryDemo() {
    const settings = this.config.demo;
    if (!this.demoOn || !settings?.pairs?.length || this.paused || this.pair) return;
    if (this.queues.male.length || this.queues.female.length) return;
    const since = Math.max(this.phaseAt, this.queueTouched);
    if (this.now() < since + settings.idleSeconds * 1000) return;
    const names = settings.pairs[this.demoTurn % settings.pairs.length];
    const actor = (name) => ({ id: `demo:${name}`, name, avatar: `/api/sim-avatar?seed=${encodeURIComponent(name)}`, demo: true });
    const pair = this.#newPair({ male: actor(names.male), female: actor(names.female) }, { demo: true });
    const roll = Math.random();
    const answers = roll < 0.5 ? ['yes', 'yes'] : roll < 0.7 ? ['yes', 'no'] : roll < 0.85 ? ['no', 'yes'] : ['yes', null];
    pair.plan = {
      male: { value: answers[0], after: 1500 + Math.random() * 6000 },
      female: { value: answers[1], after: 1500 + Math.random() * 6000 },
      share: settings.shares?.[this.demoTurn % settings.shares.length] ?? '',
    };
    this.#setPhase(PHASE.INVITE, settings.inviteSeconds * 1000);
    this.director.scene('demoInvite');
    this.#changed();
  }

  // Đủ hai người thật thì cặp mẫu xuống ngay, không để người thật phải chờ bot diễn xong.
  #yieldDemo() {
    const pair = this.pair;
    pair.scoreOpen = false;
    pair.closed = true;
    pair.endedAt = this.now();
    this.#setPhase(PHASE.TRANSITION, this.config.demo.yieldSeconds * 1000);
    this.director.stop();
    this.director.scene('demoYield');
    this.#changed();
  }

  #playDemo(t) {
    const pair = this.pair;
    const plan = pair.plan;
    if (this.phase === PHASE.INTRO && plan.share && !pair.shared.male && t >= this.phaseAt + 2500) {
      pair.shared.male = plan.share;
      this.#changed();
    }
    if (this.phase !== PHASE.DECIDE) return;
    for (const side of SIDES) {
      const choice = plan[side];
      if (!choice.value || pair.choices[side] || t < this.phaseAt + choice.after) continue;
      pair.choices[side] = choice.value;
      this.emit({ type: 'chosen', side });
      this.#changed();
    }
  }

  setDemo(on) {
    this.demoOn = on === true;
    this.#changed();
  }

  // ---------- Vòng chơi ----------
  tick() {
    const t = this.now();
    if (this.pair?.demo && !this.pair.closed) {
      if (this.queues.male.length && this.queues.female.length) return this.#yieldDemo();
      this.#playDemo(t);
    }
    switch (this.phase) {
      case PHASE.OPENING:
        if (!this.#tryInvite() && !this.director.sceneBusy()) {
          this.#setPhase(PHASE.WAITING, 0);
          this.#changed();
        }
        break;
      case PHASE.WAITING:
        if (!this.#tryInvite()) this.#tryDemo();
        break;
      case PHASE.INVITE:
        if (this.#sceneDone(t)) this.#toIntro();
        break;
      case PHASE.INTRO:
        if (this.#sceneDone(t)) {
          if (this.pair.demo) this.#toGuide();
          else this.#toCheer();
        }
        break;
      case PHASE.CHEER:
        if (this.#sceneDone(t)) this.#toGuide();
        break;
      case PHASE.GUIDE:
        // MC đọc xong hướng dẫn mới mở đồng hồ, không có giới hạn ép qua.
        if (t >= this.phaseEnd && !this.director.sceneBusy()) this.#openDecision();
        break;
      case PHASE.DECIDE:
        if (t >= this.deadline) this.#lockChoices();
        break;
      case PHASE.RESULT:
        // Đúng thời lượng phần kết quả, không kéo dài theo lượng quà.
        if (t >= this.phaseEnd) this.#toTransition();
        break;
      case PHASE.TRANSITION:
        if (t >= this.phaseEnd) this.#release();
        break;
      case PHASE.RECONFIRM:
        if (t >= this.phaseEnd) this.#endReconfirm();
        break;
      default:
    }
  }

  #sceneDone(t) {
    if (t < this.phaseEnd) return false;
    return !this.director.sceneBusy() || t >= this.phaseEnd + this.timing.sceneOverrunSeconds * 1000;
  }

  #toIntro() {
    const demo = this.pair.demo;
    this.#setPhase(PHASE.INTRO, (demo ? this.config.demo.introSeconds : this.timing.introSeconds) * 1000);
    this.director.scene(demo ? 'demoIntro' : 'intro');
    this.#changed();
  }

  #toCheer() {
    this.#setPhase(PHASE.CHEER, this.timing.cheerSeconds * 1000);
    this.director.scene('cheer');
    this.#changed();
  }

  #toGuide() {
    this.#setPhase(PHASE.GUIDE, this.timing.guideMinSeconds * 1000);
    this.director.scene('guide');
    this.#changed();
  }

  #openDecision() {
    this.deadline = this.now() + DECIDE_MS;
    this.#setPhase(PHASE.DECIDE, DECIDE_MS);
    this.director.scene('decide');
    this.emit({ type: 'bell' });
    this.#changed();
  }

  // Dừng lượt ngay: người chơi rút lui hoặc moderator loại. Đóng nhận điểm, không công bố lựa chọn nào.
  #stopTurn(side, kind = 'withdrawn') {
    const pair = this.pair;
    if (this.phase === PHASE.PAUSED || this.phase === PHASE.RECONFIRM) return this.#leaveAfterFault(side);
    if (this.phase === PHASE.RESULT) return this.#toTransition(); // Đáp án đã mở, chỉ rút ngắn phần còn lại.
    pair.scoreOpen = false;
    pair.result = kind;
    pair.stoppedBy = side;
    this.#setPhase(PHASE.RESULT, this.timing.stoppedSeconds * 1000);
    this.director.stop();
    this.director.scene(kind);
    this.#changed();
  }

  #finish(status) {
    const pair = this.pair;
    pair.scoreOpen = false;
    pair.closed = true;
    pair.status = status;
    pair.endedAt = this.now();
    // Cặp diễn mẫu không vào lịch sử, không có số cặp.
    if (!pair.demo) this.history.push(pair);
    if (this.history.length > 200) this.history.shift();
    this.stateDirty = true;
  }

  #toTransition() {
    this.#finish('done');
    const ready = this.queues.male.length > 0 && this.queues.female.length > 0;
    this.#setPhase(PHASE.TRANSITION, this.timing.transitionSeconds * 1000);
    this.director.scene(ready ? 'nextReady' : 'nextWait');
    this.emit({ type: 'memory', card: this.memoryCard() });
    this.#changed();
  }

  memoryCard() {
    const pair = this.pair;
    if (pair?.result !== 'matched' || pair.demo) return null;
    return { no: pair.no, male: pair.male.name, female: pair.female.name, score: pair.score, tentative: pair.pendingCount > 0 };
  }

  // Sân khấu giải phóng: hai người về khán đài, không tự vào lại hàng.
  #release() {
    this.pair = null;
    this.#setPhase(PHASE.WAITING, 0);
    if (!this.#tryInvite()) this.#changed();
  }

  // ---------- Tạm dừng và khôi phục ----------
  pause(reason = 'connection') {
    if (this.paused) return;
    if (this.pair?.demo) this.pair = null; // Cặp diễn mẫu không có gì phải đối soát hay hỏi lại.
    const pair = this.pair;
    if (pair && !pair.closed && this.phase === PHASE.RESULT) this.#finish('done'); // Đáp án đã công bố thì giữ nguyên.
    else if (pair && !pair.closed && pair.status !== 'aborted') {
      // Hủy lượt, không công bố từ chối; điểm cũ giữ trong bản ghi để đối soát.
      pair.scoreOpen = false;
      pair.status = 'aborted';
      pair.unreconciled = true;
      pair.result = 'aborted';
      this.history.push(pair);
    }
    this.paused = { reason, restored: false, resumeWith: pair && pair.status === 'aborted' ? pair : null };
    if (pair?.closed) this.pair = null;
    this.#setPhase(PHASE.PAUSED, 0);
    this.director.stop();
    this.director.scene(reason === 'connection' ? 'pausedConnection' : 'pausedOperator');
    this.#changed();
  }

  // Kết nối lại rồi vẫn chờ thấy sự kiện thật mới mở lại.
  connectionRestored() {
    if (!this.paused || this.paused.reason !== 'connection') return;
    this.paused.restored = true;
    this.#changed();
  }

  eventReceived() {
    if (this.paused?.reason === 'connection' && this.paused.restored) this.resume();
  }

  resume() {
    if (!this.paused) return;
    const affected = this.paused.resumeWith;
    this.paused = null;
    const left = affected && SIDES.find((side) => affected.confirm[side] === 'left');
    if (left && this.pair === affected) {
      // Có người đã rút trong lúc tạm dừng: không hỏi lại, người còn lại giữ quyền tham gia.
      if (affected.confirm[other(left)] !== 'left') this.queues[other(left)].unshift(affected[other(left)]);
      this.#closeAborted();
    } else if (affected && this.pair === affected) {
      affected.confirm = { male: false, female: false };
      this.#setPhase(PHASE.RECONFIRM, this.timing.reconfirmSeconds * 1000);
      this.director.scene('reconfirm');
    } else {
      this.#setPhase(PHASE.WAITING, 0);
      this.director.scene('resumedEmpty');
    }
    this.#changed();
  }

  #confirm(side) {
    if (this.phase !== PHASE.RECONFIRM) return;
    const pair = this.pair;
    pair.confirm[side] = true;
    this.stateDirty = true;
    this.emit({ type: 'confirmed', side });
    if (pair.confirm[other(side)]) {
      // Lượt mới hoàn toàn: điểm và lựa chọn của lượt lỗi không chuyển sang.
      pair.closed = true;
      pair.endedAt = this.now();
      this.#newPair({ male: pair.male, female: pair.female });
      this.#toGuide();
      return;
    }
    this.#changed();
  }

  #leaveAfterFault(side) {
    const pair = this.pair;
    if (this.phase === PHASE.PAUSED) {
      pair.confirm[side] = 'left';
      this.#changed();
      return;
    }
    // Người còn lại giữ quyền tham gia, không phải đăng ký lại.
    const keep = other(side);
    this.queues[keep].unshift(pair[keep]);
    this.#closeAborted();
  }

  #endReconfirm() {
    const pair = this.pair;
    for (const side of SIDES) if (pair.confirm[side] === true) this.queues[side].unshift(pair[side]);
    this.#closeAborted();
  }

  #closeAborted() {
    this.pair.closed = true;
    this.pair.endedAt = this.now();
    this.#setPhase(PHASE.TRANSITION, this.timing.transitionSeconds * 1000);
    this.director.stop();
    this.director.scene('reconfirmEnd');
    this.stateDirty = true;
    this.#changed();
  }

  // ---------- Kiểm duyệt ----------
  removePlayer(id, { ban = false } = {}) {
    const key = String(id);
    if (ban) this.banned.add(key);
    const side = this.#sideOf(key);
    if (side) this.#stopTurn(side, 'removed');
    for (const queue of SIDES) this.queues[queue] = this.queues[queue].filter((v) => v.id !== key);
    this.stateDirty = true;
    this.#changed();
  }

  // Vào LIVE thật: xóa mọi người giả của chế độ thử, để người thật không bao giờ bị ghép với bot.
  purgeSimulated() {
    const fake = (viewer) => String(viewer?.id).startsWith('sim:');
    const pair = this.pair;
    if (pair && (fake(pair.male) || fake(pair.female))) {
      for (const side of SIDES) if (!fake(pair[side]) && !pair.closed) this.queues[side].unshift(pair[side]);
      this.pair = null;
      this.director.stop();
      if (this.phase !== PHASE.PAUSED) this.#setPhase(PHASE.WAITING, 0);
      if (this.paused) this.paused.resumeWith = null;
    }
    for (const side of SIDES) this.queues[side] = this.queues[side].filter((viewer) => !fake(viewer));
    for (const viewer of [...this.viewers.values()]) {
      if (!fake(viewer)) continue;
      this.viewers.delete(viewer.id);
      this.emitRaw({ type: 'viewer-out', id: viewer.id });
    }
    this.history = this.history.filter((row) => !fake(row.male) && !fake(row.female));
    const kept = new Set(this.history.map((row) => row.id));
    this.pending = this.pending.filter((entry) => kept.has(entry.pairId) || entry.pairId === this.pair?.id);
    this.streaks.clear();
    this.stateDirty = true;
    this.#changed();
  }

  // Phiên LIVE mới: người xếp hàng ở phiên trước không còn ở đây để lên sân khấu.
  newSession() {
    this.queues = { male: [], female: [] };
    this.stateDirty = true;
    this.#changed();
  }

  reset() {
    this.#clear();
    this.director.stop();
    this.director.scene('opening');
    this.#changed();
  }

  // ---------- Dữ liệu cho màn hình ----------
  #changed() {
    this.emitRaw({ type: 'state', game: this.snapshot() });
  }

  // Lựa chọn chỉ rời khỏi máy chủ sau khi đã khóa; trước đó chỉ biết "đã chọn" hay chưa.
  pairView(pair = this.pair) {
    if (!pair) return null;
    return {
      id: pair.id,
      no: pair.no,
      demo: pair.demo,
      male: pair.male,
      female: pair.female,
      score: pair.score,
      pendingCount: pair.pendingCount,
      scoreOpen: pair.scoreOpen,
      closed: pair.closed,
      status: pair.status,
      result: pair.result,
      chosen: { male: Boolean(pair.choices.male), female: Boolean(pair.choices.female) },
      choices: pair.locked ? pair.choices : null,
      shared: pair.shared,
      confirm: pair.confirm,
    };
  }

  historyRow(pair) {
    return {
      no: pair.no,
      male: pair.male.name,
      female: pair.female.name,
      score: pair.score,
      comments: pair.comments,
      coins: pair.coins,
      pendingCount: pair.pendingCount,
      result: pair.result,
      status: pair.status,
      unreconciled: Boolean(pair.unreconciled),
    };
  }

  snapshot() {
    const t = this.now();
    return {
      phase: this.phase,
      phaseLeft: Math.max(0, this.phaseEnd - t),
      decideLeft: this.phase === PHASE.DECIDE ? Math.max(0, this.deadline - t) : 0,
      pair: this.pairView(),
      memory: this.phase === PHASE.TRANSITION ? this.memoryCard() : null,
      queues: { male: this.queues.male, female: this.queues.female },
      paused: this.paused ? { reason: this.paused.reason, restored: this.paused.restored } : null,
      guide: this.catalog.guide(),
      demoOn: this.demoOn,
      viewerCount: this.viewers.size,
      joinEvents: this.joinEvents,
      pending: this.pending.slice(-30),
      history: this.history.slice(-20).map((pair) => this.historyRow(pair)),
    };
  }

  // Người xem gần nhất, cho trang vừa mở dựng lại khán đài.
  recentViewers(limit = 150) {
    return [...this.viewers.values()].slice(-limit);
  }

  // ---------- Lưu trạng thái: server khởi động lại không làm mất suất đã đăng ký ----------
  exportState() {
    const pair = this.pair && !this.pair.closed && !this.pair.demo ? this.pair : null;
    return {
      pairNo: this.pairNo,
      queues: this.queues,
      banned: [...this.banned],
      history: this.history,
      pending: this.pending,
      pendingSeq: this.pendingSeq,
      // Cặp đang trên sân khấu lúc tắt server: lượt đó không còn hiệu lực, hai người được về đầu hàng.
      interrupted: pair ? { male: pair.male, female: pair.female } : null,
    };
  }

  importState(state) {
    this.pairNo = state.pairNo ?? 0;
    this.queues = state.queues ?? { male: [], female: [] };
    this.banned = new Set(state.banned ?? []);
    this.history = state.history ?? [];
    this.pending = state.pending ?? [];
    this.pendingSeq = state.pendingSeq ?? 0;
    if (state.interrupted) {
      this.queues.male.unshift(state.interrupted.male);
      this.queues.female.unshift(state.interrupted.female);
    }
    for (const side of SIDES) for (const viewer of this.queues[side]) this.viewers.set(viewer.id, viewer);
    this.stateDirty = false;
  }
}
