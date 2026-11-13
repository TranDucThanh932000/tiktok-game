// Luật Đám Cưới Online. Server giữ trạng thái (ai là chú rể, cô dâu, tổng chỉ vàng) và một hàng đợi kịch bản:
// mỗi lúc chỉ một kịch bản chạy, đủ thời gian rồi mới tới kịch bản sau, nên mọi màn hình đang mở thấy cùng một
// diễn biến và mở lại trang giữa chừng vẫn đúng trạng thái. Chỉ vàng không xếp hàng: cộng ngay.

export const ACTIONS = ['become_groom', 'become_bride', 'steal_groom', 'steal_bride', 'cancel_wedding', 'gold'];
export const ROLE_NAME = { groom: 'chú rể', bride: 'cô dâu' };

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9!]+/g, ' ')
    .trim();
}

const roleOf = (action) => (action.endsWith('groom') ? 'groom' : action.endsWith('bride') ? 'bride' : null);
const person = (who, now) => ({ id: who.id, name: who.name, avatar: who.avatar ?? '', since: now });
const pub = (p) => (p ? { id: p.id, name: p.name, avatar: p.avatar, since: p.since } : null);

export class Wedding {
  constructor(config, { emit = () => {}, now = Date.now } = {}) {
    this.emit = emit;
    this.now = now;
    this.timing = config.timing;
    this.queueLimit = config.queueLimit ?? 50;
    this.goals = [...config.goals].sort((a, b) => a - b);
    this.goalStep = config.goalStepAfter ?? 5000;
    this.goldPerCoin = config.goldPerCoin ?? 1;
    this.roles = { groom: null, bride: null };
    this.gold = 0;
    this.coupleSince = 0;
    this.record = null;
    this.queue = [];
    this.current = null;
    this.seq = 0;
    this.paused = false;
    this.waitLimit = config.waitlistLimit ?? 30;
    this.waitlist = { groom: [], bride: [] };
    this.ceremonyCfg = config.ceremony ?? { steps: [] };
    this.ceremony = null;
    this.restartNext = false;
    this.married = 0;
  }

  // Mốc vàng: danh sách cố định, hết danh sách thì mỗi mốc cách nhau goalStep.
  goalAfter(gold) {
    const fixed = this.goals.find((g) => g > gold);
    if (fixed !== undefined) return fixed;
    const last = this.goals.at(-1) ?? 0;
    return last + (Math.floor((gold - last) / this.goalStep) + 1) * this.goalStep;
  }

  goalBefore(gold) {
    const next = this.goalAfter(gold);
    const fixed = this.goals.filter((g) => g < next).at(-1);
    if (next <= (this.goals.at(-1) ?? 0)) return fixed ?? 0;
    return next - this.goalStep;
  }

  progress() {
    return { gold: this.gold, from: this.goalBefore(this.gold), goal: this.goalAfter(this.gold) };
  }

  // ---------------------------------------------------------------- Đầu vào

  // who: { id, name, avatar }. Trả về kết quả để panel/log hiển thị.
  act(who, action, { giftName = '', count = 1, coins = 0 } = {}) {
    if (!ACTIONS.includes(action)) return { ok: false, reason: 'unknown' };
    const gold = Math.max(0, Math.round(coins * count * this.goldPerCoin));
    if (gold > 0) this.addGold(who, gold, giftName, action !== 'gold');
    if (action === 'gold') {
      if (gold === 0) this.addGold(who, Math.max(1, count), giftName);
      return { ok: true, gold: gold || count };
    }
    if (this.queue.length >= this.queueLimit) {
      this.emit({ type: 'dropped', who: { name: who.name }, action });
      return { ok: false, reason: 'queue-full' };
    }
    const item = { seq: ++this.seq, action, who: { id: who.id, name: who.name, avatar: who.avatar ?? '' }, giftName, count, at: this.now() };
    this.queue.push(item);
    this.emit({ type: 'queued', size: this.queue.length, action, who: { name: who.name } });
    this.tick();
    return { ok: true, queued: this.queue.length };
  }

  addGold(who, amount, giftName = '', withAction = false) {
    const before = this.gold;
    this.gold += amount;
    this.emit({ type: 'gold', who: { id: who.id, name: who.name, avatar: who.avatar ?? '' }, amount, giftName, withAction, progress: this.progress(), text: `💰 ${who.name} mừng ${amount.toLocaleString('vi-VN')} chỉ vàng` });
    // Một món quà lớn có thể vượt nhiều mốc: bắn pháo hoa một lần cho mốc cao nhất.
    let reached = 0;
    for (let g = this.goalAfter(before); g <= this.gold; g = this.goalAfter(g)) reached = g;
    if (reached) this.emit({ type: 'goal', goal: reached, progress: this.progress(), text: `🎆 Đủ ${reached.toLocaleString('vi-VN')} chỉ vàng! Bắn pháo hoa mừng cô dâu chú rể` });
  }

  // ---------------------------------------------------------------- Hàng đợi

  speed() {
    const { speedupAt = 3, maxSpeed = 2 } = this.timing;
    const waiting = this.queue.length;
    if (waiting < speedupAt) return 1;
    return Math.min(maxSpeed, 1 + (waiting - speedupAt + 1) * 0.15);
  }

  tick() {
    const now = this.now();
    if (this.current && now >= this.current.endsAt) this.current = null;
    // Hành động không có kịch bản (người đang giữ vai tặng tiếp) chạy ngay rồi lấy cái sau.
    while (!this.paused && !this.current && this.queue.length) this.start(this.queue.shift(), now);
    if (!this.paused && !this.current) this.runCeremony(now);
  }

  // ---------------------------------------------------------------- Nghi lễ cưới
  // Đủ cô dâu và chú rể thì tự làm lễ lần lượt từng nghi thức. Có người đổi vai thì sau màn đá văng, lễ làm lại
  // từ đầu. Làm xong lễ cuối thì cặp đôi rời sân khấu, người đầu hàng chờ lên thay.

  stepInfo(step) {
    const cfg = this.ceremonyCfg;
    if (step >= 0) return cfg.steps[step];
    const { groom, bride } = this.roles;
    const line = this.restartNext ? `Đổi vai rồi! Lễ cưới của ${groom?.name} và ${bride?.name} tổ chức lại từ đầu` : `Mời chú rể ${groom?.name} và cô dâu ${bride?.name} chuẩn bị làm lễ`;
    return { id: 'chuan_bi', title: 'Chuẩn bị làm lễ', ms: cfg.startDelayMs ?? 5000, line };
  }

  runCeremony(now) {
    const steps = this.ceremonyCfg.steps ?? [];
    if (!steps.length) return;
    if (!this.roles.groom || !this.roles.bride) {
      this.ceremony = null;
      return;
    }
    if (!this.ceremony) {
      this.ceremony = { step: -1, stepAt: now };
      this.emitRitual(now);
      return;
    }
    const c = this.ceremony;
    if (now - c.stepAt < this.stepInfo(c.step).ms) return;
    if (c.step + 1 >= steps.length) return this.finishCeremony(now);
    c.step++;
    c.stepAt = now;
    this.restartNext = false;
    this.emitRitual(now);
  }

  ritualView(now) {
    const c = this.ceremony;
    if (!c) return null;
    const info = this.stepInfo(c.step);
    return { step: c.step, total: this.ceremonyCfg.steps.length, id: info.id, title: info.title, line: info.line, duration: info.ms, elapsed: now - c.stepAt, restart: c.step < 0 && this.restartNext };
  }

  emitRitual(now) {
    const view = this.ritualView(now);
    this.emit({ type: 'ritual', ...view, text: `${view.restart ? '🔁' : '💒'} ${view.title}: ${view.line}` });
  }

  finishCeremony(now) {
    const { groom, bride } = this.roles;
    this.ceremony = null;
    this.restartNext = false;
    this.married++;
    this.breakCouple(now);
    this.roles = { groom: null, bride: null };
    this.promoteWaiting(now);
    this.play({ seq: ++this.seq, action: 'married', who: pub(groom), kind: 'farewell', role: null, from: { groom: pub(groom), bride: pub(bride) }, married: this.married, text: `💒 ${groom.name} và ${bride.name} đã nên vợ nên chồng! Trăm năm hạnh phúc` }, this.ceremonyCfg.farewellMs ?? 6500, 1, now);
  }

  // Vai trống: người đầu hàng chờ của mỗi vai lên ngay sau màn đang diễn.
  promoteWaiting(now) {
    for (const r of ['bride', 'groom']) {
      const first = this.waitlist[r].shift();
      if (first) this.queue.unshift({ seq: ++this.seq, action: `become_${r}`, who: first, giftName: 'hàng chờ', count: 1, at: now });
    }
    this.emitWaitlist();
  }

  start(item, now) {
    const { action, who } = item;
    const role = roleOf(action);
    const speed = this.speed();
    const base = { seq: item.seq, action, who, giftName: item.giftName, count: item.count };

    if (role) {
      const holder = this.roles[role];
      if (holder && holder.id === who.id) {
        this.emit({ type: 'cheer', role, action, who, text: `💪 ${who.name} giữ chặt vai ${ROLE_NAME[role]}` });
        return;
      }
      // Đăng ký khi vai đã có người: vào hàng chờ, không đá ai. Đổi vai (steal_*) thì đá văng người đang đứng.
      if (holder && action.startsWith('become_')) {
        this.register(role, who);
        return;
      }
      if (this.unregister(who.id)) this.emitWaitlist();
      const kind = holder ? 'steal' : 'claim';
      if (kind === 'steal' && this.ceremony) {
        this.ceremony = null;
        this.restartNext = true;
      }
      this.breakCouple(now);
      this.roles[role] = person(who, now);
      this.joinCouple(now);
      const text = holder ? `⚡ ${who.name} đổi vai ${ROLE_NAME[role]}, đá văng ${holder.name}!` : `${role === 'groom' ? '🤵' : '👰'} ${who.name} trở thành ${ROLE_NAME[role]}`;
      this.play({ ...base, kind, role, from: pub(holder), text }, kind === 'steal' ? this.timing.stealMs : this.timing.claimMs, speed, now);
      return;
    }

    // cancel_wedding
    const { groom, bride } = this.roles;
    if (!groom && !bride) {
      this.emit({ type: 'cheer', role: null, who, text: `💔 ${who.name} muốn hủy hôn nhưng sân khấu đang trống` });
      return;
    }
    this.breakCouple(now);
    this.roles = { groom: null, bride: null };
    this.ceremony = null;
    this.restartNext = false;
    this.promoteWaiting(now);
    const names = [groom?.name, bride?.name].filter(Boolean).join(' và ');
    this.play({ ...base, kind: 'cancel', role: null, from: { groom: pub(groom), bride: pub(bride) }, text: `💔 ${who.name} đã hủy hôn của ${names}` }, this.timing.cancelMs, speed, now);
  }

  register(role, who) {
    const list = this.waitlist[role];
    let pos = list.findIndex((p) => p.id === who.id) + 1;
    if (!pos) {
      if (list.length >= this.waitLimit) {
        this.emit({ type: 'cheer', role: null, who, text: `📝 Hàng chờ ${ROLE_NAME[role]} đã đầy, ${who.name} thử đổi vai nhé` });
        return;
      }
      // Đăng ký vai kia rồi thì chuyển sang vai này (unregister tạo mảng mới nên đẩy vào this.waitlist[role]).
      this.unregister(who.id);
      this.waitlist[role].push({ id: who.id, name: who.name, avatar: who.avatar ?? '' });
      pos = this.waitlist[role].length;
    }
    this.emit({ type: 'registered', role, who, position: pos, text: `📝 ${who.name} đăng ký làm ${ROLE_NAME[role]} · thứ ${pos} trong hàng chờ` });
    this.emitWaitlist();
  }

  unregister(id) {
    let changed = false;
    for (const r of ['groom', 'bride']) {
      const kept = this.waitlist[r].filter((p) => p.id !== id);
      changed ||= kept.length !== this.waitlist[r].length;
      this.waitlist[r] = kept;
    }
    return changed;
  }

  waitlistView() {
    const view = (list) => ({ count: list.length, first: list.slice(0, 3).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar })) });
    return { groom: view(this.waitlist.groom), bride: view(this.waitlist.bride) };
  }

  emitWaitlist() {
    this.emit({ type: 'waitlist', waitlist: this.waitlistView() });
  }

  play(scene, ms, speed, now) {
    const duration = Math.round(ms / speed);
    this.current = { ...scene, speed, startedAt: now, endsAt: now + duration, duration };
    this.emit({ type: 'scene', ...this.current, groom: pub(this.roles.groom), bride: pub(this.roles.bride), coupleSince: this.coupleSince, record: this.record, waiting: this.queue.length });
  }

  // Thời gian bên nhau tính từ lúc đủ cả chú rể và cô dâu; đổi một người là tính lại.
  joinCouple(now) {
    if (this.roles.groom && this.roles.bride) this.coupleSince = now;
  }

  breakCouple(now) {
    const { groom, bride } = this.roles;
    if (groom && bride && this.coupleSince) {
      const ms = now - this.coupleSince;
      if (!this.record || ms > this.record.ms) this.record = { groom: groom.name, bride: bride.name, ms };
    }
    this.coupleSince = 0;
  }

  // ---------------------------------------------------------------- Điều khiển

  pause(on) {
    this.paused = on;
    this.emit({ type: 'paused', paused: on });
    if (!on && this.ceremony) {
      // Tiếp tục thì diễn lại nghi thức đang dở từ đầu nghi thức đó.
      this.ceremony.stepAt = this.now();
      this.emitRitual(this.ceremony.stepAt);
    }
    if (!on) this.tick();
    return on;
  }

  clearQueue() {
    const n = this.queue.length;
    this.queue = [];
    this.emit({ type: 'queued', size: 0 });
    return n;
  }

  reset() {
    this.roles = { groom: null, bride: null };
    this.gold = 0;
    this.coupleSince = 0;
    this.record = null;
    this.queue = [];
    this.current = null;
    this.waitlist = { groom: [], bride: [] };
    this.ceremony = null;
    this.restartNext = false;
    this.married = 0;
    this.emit({ type: 'reset', snapshot: this.snapshot() });
    return true;
  }

  snapshot() {
    const now = this.now();
    const current = this.current && now < this.current.endsAt ? { ...this.current, elapsed: now - this.current.startedAt } : null;
    return {
      groom: pub(this.roles.groom),
      bride: pub(this.roles.bride),
      coupleSince: this.coupleSince,
      record: this.record,
      progress: this.progress(),
      waiting: this.queue.length,
      waitlist: this.waitlistView(),
      ritual: this.ritualView(now),
      married: this.married,
      paused: this.paused,
      current,
      serverNow: now,
    };
  }

  toJSON() {
    return { roles: this.roles, gold: this.gold, coupleSince: this.coupleSince, record: this.record, queue: this.queue, seq: this.seq, waitlist: this.waitlist, married: this.married, ceremonyStep: this.ceremony?.step ?? null, restartNext: this.restartNext };
  }

  restore(saved) {
    const ok = (p) => p && typeof p.id === 'string' && typeof p.name === 'string';
    this.roles = { groom: ok(saved.roles?.groom) ? saved.roles.groom : null, bride: ok(saved.roles?.bride) ? saved.roles.bride : null };
    this.gold = Number.isFinite(saved.gold) && saved.gold >= 0 ? saved.gold : 0;
    this.coupleSince = this.roles.groom && this.roles.bride ? Number(saved.coupleSince) || this.now() : 0;
    this.record = saved.record && Number.isFinite(saved.record.ms) ? saved.record : null;
    this.queue = Array.isArray(saved.queue) ? saved.queue.filter((q) => ACTIONS.includes(q?.action) && ok(q.who)).slice(0, this.queueLimit) : [];
    this.seq = Number(saved.seq) || 0;
    this.married = Number(saved.married) || 0;
    this.restartNext = !!saved.restartNext;
    // Nghi thức đang dở thì làm lại từ đầu nghi thức đó.
    const step = saved.ceremonyStep;
    if (this.roles.groom && this.roles.bride && Number.isInteger(step) && step >= -1 && step < (this.ceremonyCfg.steps?.length ?? 0)) this.ceremony = { step, stepAt: this.now() };
    for (const r of ['groom', 'bride']) this.waitlist[r] = Array.isArray(saved.waitlist?.[r]) ? saved.waitlist[r].filter(ok).slice(0, this.waitLimit) : [];
  }
}

// Quà → hành động: khớp mã quà trước, rồi tới tên quà (không phân biệt hoa thường, có dấu hay không).
export function giftMatcher(gifts) {
  const byId = new Map();
  const byName = new Map();
  for (const g of gifts) {
    for (const id of g.ids ?? []) byId.set(String(id), g);
    for (const name of [g.giftLabel, ...(g.names ?? [])]) if (name) byName.set(normalize(name), g);
  }
  return ({ giftId, giftName }) => byId.get(String(giftId ?? '')) ?? byName.get(normalize(giftName)) ?? null;
}
