// Luật tiệm net, không đụng tới mạng hay file.
// Thời gian tính bằng "phút net": 1 phút net = clock.secondsPerMinute giây thật. Ngồi máy là trừ giờ và cày điểm
// (số phút đã chơi, nhân hệ số lên đồ / VIP / giờ vàng). Hết giờ vẫn ngồi được, chỉ bị mời ra khi có người chờ máy.
import { buildCommands, lookOf, parseCommand } from './text.js';

const TIMES_EVERY_MS = 1000;
const BOARD_EVERY_MS = 2000;
const BOARD_SIZE = 10;
const QUEUE_SHOWN = 12;
const MAX_QUEUE = 300;
const SAVED_PLAYERS = 5000;
const TALK_MS = 3200;
const CHECK_GAP_MS = 8000;
const BUZZ_GAP_MS = 20_000;
const RAGE_GAP_MS = 15_000;
const RETRY_EVENT_MS = 20_000;
// Mẹ bỏ đi (hoặc xách tai con đi) trong lúc này rồi mới hết chuyện.
const SCENE_MS = 4000;
const EVENTS = ['golden', 'blackout', 'mom'];

const fillLine = (template, vars = {}) => template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));

export class NetCafe {
  constructor(config, { emit = () => {}, now = Date.now, rng = Math.random, lines = {} } = {}) {
    this.config = config;
    this.emit = emit;
    this.now = now;
    this.rng = rng;
    this.lines = lines;
    this.commands = buildCommands(config);
    this.tiers = config.gifts.map((tier, index) => ({ ...tier, index })).sort((a, b) => b.coins - a.coins);
    this.msPerMinute = config.clock.secondsPerMinute * 1000;
    const time = config.time;
    this.ms = {
      commentGap: time.commentGapSeconds * 1000,
      shareGap: time.shareGapSeconds * 1000,
      kick: time.kickSeconds * 1000,
      idle: time.idleKickMinutes * 60_000,
    };
    const { rows, cols, vip } = config.room;
    this.seats = [
      ...Array.from({ length: vip }, (_, i) => ({ index: i, vip: true, label: `V${i + 1}`, id: null })),
      ...Array.from({ length: rows * cols }, (_, i) => ({ index: vip + i, vip: false, label: String(i + 1), id: null })),
    ];
    this.players = new Map();
    this.queue = [];
    this.serial = 0;
    this.safe = false;
    this.golden = null;
    this.blackout = null;
    this.mom = null;
    this.boss = null;
    this.lastGolden = null;
    const t = now();
    this.openedAt = t;
    this.lastTick = t;
    this.timesAt = 0;
    this.boardAt = 0;
    this.boardDirty = true;
    this.stateDirty = false;
    this.talk = { until: 0, priority: -1 };
    this.lastLine = new Map();
    this.nextChatter = t + config.chatterSeconds * 1000;
    this.nextEvent = {};
    for (const kind of EVENTS) this.schedule(kind, t);
  }

  // ---------- Người chơi ----------
  player(who) {
    let p = this.players.get(who.id);
    if (!p) {
      const games = this.config.games;
      const order = ++this.serial;
      p = {
        id: who.id,
        key: `p${order}`,
        order,
        name: who.name,
        look: lookOf(who.id),
        game: games[lookOf(`${who.id}:game`) % games.length].code,
        balance: 0,
        score: 0,
        boost: 0,
        vip: 0,
        vipAt: 0,
        rig: false,
        paid: false,
        followed: false,
        seat: null,
        queuedAt: null,
        state: 'play',
        outAt: 0,
        active: 0,
        likes: 0,
        item: null,
        itemLeft: 0,
        commentAt: -Infinity,
        shareAt: -Infinity,
        checkAt: -Infinity,
        buzzAt: -Infinity,
        rageAt: -Infinity,
      };
      this.players.set(who.id, p);
    }
    if (who.name) p.name = who.name;
    // Ảnh TikTok có hạn dùng nên chỉ giữ trong bộ nhớ.
    if (who.avatar) p.avatar = who.avatar;
    return p;
  }

  seated() {
    return this.seats.filter((seat) => seat.id !== null).map((seat) => ({ seat, p: this.players.get(seat.id) }));
  }

  rate(p, seat = p.seat === null ? null : this.seats[p.seat]) {
    const r = this.config.rates;
    let rate = 1;
    if (p.boost > 0) rate += r.boost - 1;
    if (seat?.vip && p.vip > 0) rate += r.vip - 1;
    if (this.golden && p.game === this.golden.code) rate += r.golden - 1;
    return rate;
  }

  publicPlayer(p) {
    const seat = p.seat === null ? null : this.seats[p.seat];
    return {
      key: p.key,
      name: p.name,
      look: p.look,
      game: p.game,
      out: p.state === 'out',
      minutes: Math.ceil(p.balance),
      rate: this.rate(p, seat),
      boost: p.boost > 0,
      vip: Boolean(seat?.vip && p.vip > 0),
      rig: p.rig,
      item: p.item,
      boss: this.boss?.key === p.key,
    };
  }

  publicSeat(seat) {
    const p = seat.id === null ? null : this.players.get(seat.id);
    return { index: seat.index, label: seat.label, vip: seat.vip, player: p ? this.publicPlayer(p) : null };
  }

  publicQueue() {
    const list = this.queue.slice(0, QUEUE_SHOWN).map((id) => {
      const p = this.players.get(id);
      return { key: p.key, name: p.name, look: p.look, paid: p.paid };
    });
    return { list, total: this.queue.length };
  }

  ranking() {
    return [...this.players.values()].filter((p) => p.score >= 1).sort((a, b) => b.score - a.score || a.order - b.order);
  }

  board() {
    return this.ranking()
      .slice(0, BOARD_SIZE)
      .map((p) => ({ key: p.key, name: p.name, look: p.look, score: Math.floor(p.score) }));
  }

  sendBoard(t = this.now()) {
    this.boardDirty = false;
    this.boardAt = t;
    this.emit({ type: 'board', board: this.board(), players: this.ranking().length });
  }

  clock() {
    const [h, m] = String(this.config.clock.start).split(':').map(Number);
    return { start: ((h || 0) * 60 + (m || 0)) % 1440, openedAt: this.openedAt, msPerMinute: this.msPerMinute, now: this.now() };
  }

  snapshot() {
    return {
      seats: this.seats.map((seat) => this.publicSeat(seat)),
      queue: this.publicQueue(),
      board: this.board(),
      players: this.ranking().length,
      clock: this.clock(),
      golden: this.golden,
      blackout: this.blackout,
      mom: this.publicMom(),
      boss: this.boss,
    };
  }

  // ---------- Comment ----------
  comment(who, text) {
    const command = parseCommand(this.commands, text);
    const t = this.now();
    const known = this.players.get(who.id);
    if (known) {
      known.active = t;
      if (who.name) known.name = who.name;
      // Ngồi máy mà nói chuyện thì được thêm chút giờ, mỗi người tối đa một lần mỗi commentGap.
      const bonus = this.config.time.commentMinutes;
      if (bonus > 0 && known.seat !== null && known.state === 'play' && t - known.commentAt >= this.ms.commentGap) {
        known.commentAt = t;
        this.topup(known, bonus, 'comment');
      }
    }
    if (!command) return null;
    if (command.kind === 'join') return this.join(this.player(who), command.seat ?? null);
    if (command.kind === 'game') return this.switchGame(this.player(who), command.code);
    if (!known) {
      if (command.kind === 'check') this.say('checkNone', { name: who.name }, { priority: 0 });
      return null;
    }
    if (command.kind === 'leave') return this.goHome(known);
    if (command.kind === 'check') return this.check(known);
    if (command.kind === 'buzz') return this.buzz(known);
    if (command.kind === 'rage') return this.rage(known);
    if (command.kind === 'hide') return this.hide(known);
    return null;
  }

  join(p, prefer = null) {
    if (p.seat !== null) {
      this.say(p.state === 'out' ? 'alreadyOut' : 'already', { name: p.name, seat: this.seats[p.seat].label }, { priority: 0 });
      return { kind: 'already', seat: p.seat };
    }
    if (p.queuedAt !== null) {
      const pos = this.queuePos(p);
      this.say('queue', { name: p.name, pos }, { priority: 0 });
      return { kind: 'queued', pos };
    }
    // Ngồi vào là có sẵn freeMinutes; ai còn giờ nạp từ trước thì dùng giờ đó.
    p.balance = Math.max(p.balance, this.config.time.freeMinutes);
    return this.admit(p, { prefer });
  }

  // Vào tiệm: có giờ VIP thì vào phòng VIP, còn máy trống thì ngồi, không thì xếp hàng.
  admit(p, { prefer = null, quiet = false } = {}) {
    if (p.vip > 0) {
      const seat = this.vipSeatFor();
      if (seat) {
        this.takeVip(p, seat, { quiet });
        return { kind: 'seat', seat: p.seat };
      }
    }
    const seat = this.queue.length ? null : this.freeSeat(prefer);
    if (seat) {
      this.place(p, seat, 'door');
      if (!quiet) this.say('sit', { name: p.name, seat: seat.label, minutes: Math.ceil(p.balance) });
      return { kind: 'seat', seat: seat.index };
    }
    if (this.queue.length >= MAX_QUEUE) return { kind: 'full' };
    this.enqueue(p);
    const pos = this.queuePos(p);
    if (!quiet) this.say('queue', { name: p.name, pos }, { priority: 0 });
    return { kind: 'queued', pos };
  }

  freeSeat(prefer = null) {
    const free = this.seats.filter((seat) => !seat.vip && seat.id === null);
    if (!free.length) return null;
    const wanted = prefer !== null && free.find((seat) => seat.label === String(prefer));
    return wanted || free[Math.floor(this.rng() * free.length)];
  }

  // from: 'door' (đi từ cửa vào), 'queue' (từ hàng chờ) hoặc số ghế cũ (đổi chỗ).
  place(p, seat, from) {
    const queued = p.queuedAt !== null;
    if (queued) this.dequeue(p);
    seat.id = p.id;
    p.seat = seat.index;
    p.state = p.balance > 0 ? 'play' : 'out';
    p.outAt = this.now();
    this.stateDirty = true;
    this.emit({ type: 'seat', seat: seat.index, player: this.publicPlayer(p), from: queued ? 'queue' : from });
    if (queued) this.emitQueue();
  }

  // reason: home (tự về), kick (hết giờ nhường máy), idle (ngủ gật), mom (mẹ xách về), move (đổi ghế), requeue (ra hàng chờ).
  vacate(p, reason) {
    const seat = this.seats[p.seat];
    seat.id = null;
    p.seat = null;
    p.state = 'play';
    this.stateDirty = true;
    this.emit({ type: 'leave', seat: seat.index, key: p.key, name: p.name, reason });
    if (this.mom?.phase === 'come' && this.mom.id === p.id) this.endMom(reason === 'home' ? 'home' : 'done');
    return seat;
  }

  fillSeats() {
    while (this.queue.length) {
      const seat = this.freeSeat();
      if (!seat) break;
      const p = this.players.get(this.queue[0]);
      this.place(p, seat, 'queue');
      this.say('sit', { name: p.name, seat: seat.label, minutes: Math.ceil(p.balance) }, { priority: 0 });
    }
  }

  // ---------- Hàng chờ: ai đã tặng quà đứng trước, còn lại ai tới trước vào trước ----------
  enqueue(p, front = false) {
    const first = this.queue.reduce((min, id) => Math.min(min, this.players.get(id).queuedAt), this.now());
    p.queuedAt = front ? first - 1 : this.now();
    this.queue.push(p.id);
    this.sortQueue();
    this.emitQueue();
  }

  sortQueue() {
    this.queue.sort((a, b) => {
      const A = this.players.get(a);
      const B = this.players.get(b);
      return Number(B.paid) - Number(A.paid) || A.queuedAt - B.queuedAt;
    });
  }

  dequeue(p) {
    const i = this.queue.indexOf(p.id);
    if (i >= 0) this.queue.splice(i, 1);
    p.queuedAt = null;
  }

  queuePos(p) {
    return this.queue.indexOf(p.id) + 1;
  }

  emitQueue() {
    this.emit({ type: 'queue', ...this.publicQueue() });
  }

  // ---------- Phòng VIP ----------
  vipSeatFor() {
    const vips = this.seats.filter((seat) => seat.vip);
    return vips.find((seat) => seat.id === null) ?? vips.find((seat) => this.players.get(seat.id).vip <= 0) ?? null;
  }

  // Ghế VIP đang có người hết giờ VIP thì người đó nhường: về ghế thường cũ của người mới, sang ghế trống,
  // hoặc đứng đầu hàng chờ.
  takeVip(p, seat, { quiet = false } = {}) {
    const sitter = seat.id === null ? null : this.players.get(seat.id);
    const back = p.seat === null ? null : this.seats[p.seat];
    const dest = sitter ? (back ?? this.freeSeat()) : null;
    if (sitter) this.vacate(sitter, dest ? 'move' : 'requeue');
    if (back) this.vacate(p, 'move');
    this.place(p, seat, back ? back.index : 'door');
    if (sitter) {
      if (dest) this.place(sitter, dest, seat.index);
      else this.enqueue(sitter, true);
    }
    if (!quiet) this.say('vip', { name: p.name }, { mood: 'vui', priority: 1 });
  }

  reconcileVip() {
    // Hết giờ VIP thì sang ghế thường còn trống.
    for (const seat of this.seats) {
      if (!seat.vip || seat.id === null) continue;
      const p = this.players.get(seat.id);
      if (p.vip > 0) continue;
      const free = this.freeSeat();
      if (!free) break;
      this.vacate(p, 'move');
      this.place(p, free, seat.index);
    }
    if (!this.vipSeatFor()) return;
    const waiting = [...this.players.values()]
      .filter((p) => p.vip > 0 && (p.queuedAt !== null || (p.seat !== null && !this.seats[p.seat].vip)))
      .sort((a, b) => a.vipAt - b.vipAt);
    for (const p of waiting) {
      const seat = this.vipSeatFor();
      if (!seat) break;
      this.takeVip(p, seat);
    }
  }

  // ---------- Thời gian ----------
  tick() {
    const t = this.now();
    const dt = Math.min(1000, Math.max(0, t - this.lastTick));
    this.lastTick = t;
    // Cúp điện thì không trừ giờ, cũng không cày được.
    if (dt > 0 && !this.blackout) this.play(dt / this.msPerMinute, t);
    this.housekeeping(t);
    this.runEvents(t);
    if (!this.safe && t >= this.nextChatter) {
      this.nextChatter = t + this.config.chatterSeconds * 1000 * (0.8 + 0.4 * this.rng());
      if (this.seated().length && t >= this.talk.until + 6000) this.say('idle', {}, { priority: 0 });
    }
    if (t - this.timesAt >= TIMES_EVERY_MS) {
      this.timesAt = t;
      this.emit({ type: 'times', list: this.seated().map(({ seat, p }) => [seat.index, this.publicPlayer(p)]) });
    }
    if (this.boardDirty && t - this.boardAt >= BOARD_EVERY_MS) this.sendBoard(t);
  }

  play(minutes, t) {
    for (const seat of this.seats) {
      if (seat.id === null) continue;
      const p = this.players.get(seat.id);
      if (p.state !== 'play') continue;
      p.score += minutes * this.rate(p, seat);
      p.balance = Math.max(0, p.balance - minutes);
      p.boost = Math.max(0, p.boost - minutes);
      if (seat.vip) p.vip = Math.max(0, p.vip - minutes);
      if (p.item && (p.itemLeft -= minutes) <= 0) {
        p.item = null;
        p.itemLeft = 0;
      }
      this.boardDirty = true;
      this.stateDirty = true;
      // Cộng trừ số lẻ từng 100 ms nên có thể còn dư một chút xíu.
      if (p.balance < 1e-6) {
        p.balance = 0;
        this.expire(p, t);
      }
    }
  }

  expire(p, t) {
    p.state = 'out';
    p.outAt = t;
    this.emit({ type: 'expire', seat: p.seat, key: p.key, name: p.name });
    this.say('expire', { name: p.name, seat: this.seats[p.seat].label }, { mood: 'la' });
  }

  revive(p) {
    if (p.seat === null || p.state !== 'out' || p.balance <= 0) return;
    p.state = 'play';
    this.emit({ type: 'revive', seat: p.seat, key: p.key });
  }

  housekeeping(t) {
    // Hết giờ quá kickSeconds mà có người chờ thì nhường máy, người hết giờ lâu nhất đi trước.
    const out = this.seated()
      .filter(({ seat, p }) => !seat.vip && p.state === 'out' && t - p.outAt >= this.ms.kick)
      .sort((a, b) => a.p.outAt - b.p.outAt)
      .slice(0, this.queue.length);
    for (const { p } of out) {
      this.vacate(p, 'kick');
      this.say('kick', { name: p.name }, { mood: 'la' });
    }
    // Hết giờ rồi ngồi im quá lâu thì cô Tám tắt máy, kể cả lúc không ai chờ.
    for (const { seat, p } of this.seated()) {
      if (p.state === 'out' && t - Math.max(p.active, p.outAt) >= this.ms.idle) {
        this.vacate(p, 'idle');
        this.say('idleLeave', { name: p.name, seat: seat.label }, { priority: 0 });
      }
    }
    this.reconcileVip();
    this.fillSeats();
    if (this.boss && t >= this.boss.until) {
      this.boss = null;
      this.emit({ type: 'boss', boss: null });
    }
  }

  topup(p, minutes, reason) {
    p.balance += minutes;
    this.stateDirty = true;
    this.revive(p);
    this.emit({ type: 'topup', key: p.key, name: p.name, seat: p.seat, minutes, reason });
  }

  // ---------- Thả tim, follow, share ----------
  // Chỉ tính cho người đang ngồi hoặc đang chờ máy.
  like(who, count = 1) {
    const p = this.players.get(who.id);
    if (!p || (p.seat === null && p.queuedAt === null)) return 0;
    p.active = this.now();
    p.likes += Math.max(1, Math.trunc(count) || 1);
    const per = this.config.time.likesPerMinute;
    const minutes = Math.floor(p.likes / per);
    if (!minutes) return 0;
    p.likes -= minutes * per;
    this.topup(p, minutes, 'like');
    return minutes;
  }

  // Giờ được ghi vào tài khoản, chưa ngồi máy thì để dành.
  social(who, kind) {
    const t = this.now();
    const p = this.player(who);
    if (kind === 'follow') {
      if (p.followed) return 0;
      p.followed = true;
    } else {
      if (t - p.shareAt < this.ms.shareGap) return 0;
      p.shareAt = t;
    }
    const minutes = kind === 'follow' ? this.config.time.followMinutes : this.config.time.shareMinutes;
    if (!minutes) return 0;
    p.active = t;
    this.topup(p, minutes, kind);
    this.say(kind, { name: p.name, minutes }, { mood: 'vui' });
    return minutes;
  }

  // ---------- Quà: mỗi xu minutesPerCoin phút, thêm món theo mức quà ----------
  gift(who, coins, count = 1) {
    coins = Math.trunc(Number(coins) || 0);
    count = Math.max(1, Math.trunc(Number(count) || 1));
    const tier = this.tiers.find((row) => coins >= row.coins);
    if (!tier) return null;
    // Quà to tính theo mức gần nhất nhân lên (99 xu = 3 lần mức 30 xu).
    const units = Math.floor(coins / tier.coins) * count;
    const t = this.now();
    const p = this.player(who);
    const wasPaid = p.paid;
    p.active = t;
    p.paid = true;
    const minutes = coins * count * this.config.minutesPerCoin;
    p.balance += minutes;
    if (tier.boostMinutes) p.boost += tier.boostMinutes * units;
    if (tier.vipMinutes) {
      if (p.vip <= 0) p.vipAt = t;
      p.vip += tier.vipMinutes * units;
    }
    if (tier.rig) p.rig = true;
    if (tier.item) {
      p.item = tier.item;
      p.itemLeft = Math.max(p.itemLeft, this.config.time.itemMinutes);
    }
    this.stateDirty = true;
    this.boardDirty = true;
    let vipWait = false;
    // Tặng quà là vào tiệm luôn, khỏi gõ ngoi.
    if (p.seat === null && p.queuedAt === null) {
      p.balance = Math.max(p.balance, this.config.time.freeMinutes);
      this.admit(p, { quiet: true });
    } else if (p.queuedAt !== null && !wasPaid) {
      this.sortQueue();
      this.emitQueue();
    }
    if (p.vip > 0 && (p.seat === null || !this.seats[p.seat].vip)) {
      const seat = this.vipSeatFor();
      if (seat) this.takeVip(p, seat, { quiet: true });
      else vipWait = Boolean(tier.vipMinutes);
    }
    this.revive(p);
    this.emit({
      type: 'gift',
      key: p.key,
      name: p.name,
      seat: p.seat,
      tier: tier.index,
      tierCoins: tier.coins,
      label: tier.label,
      icon: tier.icon,
      coins,
      count,
      minutes,
      item: tier.item ?? null,
      boost: Boolean(tier.boostMinutes),
      vip: Boolean(tier.vipMinutes),
      rig: Boolean(tier.rig),
    });
    const big = tier.coins >= 100;
    if (tier.everyoneMinutes) this.treat(p, tier.everyoneMinutes * units);
    if (tier.bossSeconds) this.crown(p, tier.bossSeconds * 1000 * units);
    const vars = { name: p.name, minutes: tier.everyoneMinutes ? tier.everyoneMinutes * units : minutes };
    const kind = tier.bossSeconds ? 'boss' : tier.everyoneMinutes ? 'treat' : tier.vipMinutes ? (vipWait ? 'vipWait' : 'vip') : tier.rig ? 'rig' : tier.boostMinutes ? 'boost' : tier.item ? 'mi' : 'gift';
    this.say(kind, vars, { mood: 'vui', priority: big ? 2 : 1 });
    this.fillSeats();
    return { minutes, seat: p.seat, pos: this.queuePos(p) };
  }

  // Bao net: ai đang ngồi hoặc đang chờ cũng được thêm giờ.
  treat(giver, minutes) {
    const seats = [];
    for (const { seat, p } of this.seated()) {
      p.balance += minutes;
      this.revive(p);
      seats.push(seat.index);
    }
    for (const id of this.queue) this.players.get(id).balance += minutes;
    this.stateDirty = true;
    this.emit({ type: 'treat', key: giver.key, name: giver.name, minutes, seats });
  }

  // Mua lại tiệm: bảng hiệu đổi tên một lúc.
  crown(p, ms) {
    const t = this.now();
    const from = this.boss?.key === p.key ? this.boss.until : t;
    this.boss = { key: p.key, name: p.name, until: from + ms };
    this.emit({ type: 'boss', boss: this.boss });
  }

  // ---------- Lệnh ----------
  goHome(p) {
    if (p.seat !== null) {
      const seat = this.seats[p.seat];
      this.vacate(p, 'home');
      this.say('leave', { name: p.name, seat: seat.label }, { priority: 0 });
      this.fillSeats();
      return { kind: 'home' };
    }
    if (p.queuedAt !== null) {
      this.dequeue(p);
      this.emitQueue();
      this.say('leaveQueue', { name: p.name }, { priority: 0 });
      return { kind: 'unqueue' };
    }
    return null;
  }

  check(p) {
    const t = this.now();
    if (t - p.checkAt < CHECK_GAP_MS) return null;
    p.checkAt = t;
    const pos = this.queuePos(p);
    const minutes = Math.ceil(p.balance);
    const out = p.seat !== null && p.state === 'out';
    this.emit({ type: 'check', key: p.key, name: p.name, seat: p.seat, minutes, pos, out });
    if (p.seat !== null) this.say(out ? 'checkOut' : 'check', { name: p.name, minutes, seat: this.seats[p.seat].label }, { priority: 0 });
    else if (pos) this.say('checkQueue', { name: p.name, pos }, { priority: 0 });
    else this.say('checkNone', { name: p.name }, { priority: 0 });
    return { minutes, pos };
  }

  // Gõ tên game: đang ngồi thì đổi game, chưa ngồi thì vào máy chơi game đó luôn.
  switchGame(p, code) {
    p.game = code;
    if (p.seat === null && p.queuedAt === null) return this.join(p);
    if (p.seat !== null) this.emit({ type: 'game', seat: p.seat, key: p.key, code });
    return { kind: 'game', code };
  }

  buzz(p) {
    const t = this.now();
    if (p.seat === null || t - p.buzzAt < BUZZ_GAP_MS) return null;
    const others = this.seated().filter(({ p: other }) => other !== p);
    if (!others.length) return null;
    p.buzzAt = t;
    const target = others[Math.floor(this.rng() * others.length)].p;
    this.emit({ type: 'buzz', from: p.seat, to: target.seat, name: p.name, target: target.name });
    this.say('buzz', { name: p.name, target: target.name }, { priority: 0 });
    return { to: target.seat };
  }

  rage(p) {
    const t = this.now();
    if (p.seat === null || t - p.rageAt < RAGE_GAP_MS) return null;
    p.rageAt = t;
    this.emit({ type: 'rage', seat: p.seat, key: p.key, name: p.name });
    this.say('rage', { name: p.name }, { mood: 'la', priority: 0 });
    return true;
  }

  // ---------- Chuyện trong tiệm ----------
  schedule(kind, t, delay) {
    const every = (this.config.events[kind]?.everySeconds ?? 0) * 1000;
    this.nextEvent[kind] = every > 0 ? t + (delay ?? every * (0.75 + 0.5 * this.rng())) : Infinity;
  }

  runEvents(t) {
    if (this.golden && t >= this.golden.endsAt) {
      this.golden = null;
      this.emit({ type: 'golden', golden: null });
      this.say('goldenEnd', {}, { priority: 0 });
    }
    if (this.blackout && t >= this.blackout.endsAt) {
      this.blackout = null;
      this.emit({ type: 'blackout', blackout: null });
      this.say('blackoutEnd', {}, { mood: 'vui', priority: 2 });
    }
    if (this.mom && t >= this.mom.endsAt) this.momTimeUp(t);
    if (this.safe) return;
    for (const kind of EVENTS) {
      if (t < this.nextEvent[kind]) continue;
      this.schedule(kind, t, this.startEvent(kind, t) ? undefined : RETRY_EVENT_MS);
    }
  }

  startEvent(kind, t = this.now()) {
    if (kind === 'golden') return this.startGolden(t);
    if (kind === 'blackout') return this.startBlackout(t);
    if (kind === 'mom') return this.startMom(t);
    return false;
  }

  // Giờ vàng: chơi đúng game được cộng hệ số, người xem gõ tên game để đổi.
  startGolden(t) {
    if (this.golden || !this.seated().length) return false;
    const others = this.config.games.filter((game) => game.code !== this.lastGolden);
    const games = others.length ? others : this.config.games;
    const game = games[Math.floor(this.rng() * games.length)];
    this.lastGolden = game.code;
    this.golden = { code: game.code, label: game.label, endsAt: t + this.config.events.golden.seconds * 1000 };
    this.emit({ type: 'golden', golden: this.golden });
    this.say('golden', { game: game.label, code: game.code }, { mood: 'vui', priority: 2 });
    return true;
  }

  startBlackout(t) {
    if (this.blackout || this.mom || !this.seated().length) return false;
    this.blackout = { endsAt: t + this.config.events.blackout.seconds * 1000 };
    this.emit({ type: 'blackout', blackout: this.blackout });
    this.say('blackout', {}, { mood: 'la', priority: 2 });
    return true;
  }

  // Mẹ tới kiếm: chọn một bạn chưa tặng quà đang chơi ở ghế thường, gõ "trốn" kịp thì thoát và được thêm giờ.
  startMom(t) {
    const cfg = this.config.events.mom;
    const seated = this.seated();
    if (this.mom || this.blackout || seated.length < cfg.minPlayers) return false;
    const pool = seated.filter(({ seat, p }) => !seat.vip && p.state === 'play' && !p.paid && p.boost <= 0);
    if (!pool.length) return false;
    const { seat, p } = pool[Math.floor(this.rng() * pool.length)];
    this.mom = { id: p.id, key: p.key, name: p.name, seat: seat.index, phase: 'come', endsAt: t + cfg.seconds * 1000, text: this.line('mom', { name: p.name }) };
    this.emit({ type: 'mom', mom: this.publicMom() });
    this.say('momCome', { name: p.name }, { mood: 'la', priority: 2 });
    return true;
  }

  publicMom() {
    if (!this.mom) return null;
    const { id, ...rest } = this.mom;
    return rest;
  }

  hide(p) {
    if (this.mom?.phase !== 'come' || this.mom.id !== p.id) return null;
    this.mom.phase = 'hide';
    this.mom.endsAt = this.now() + SCENE_MS;
    this.mom.text = this.line('momLost', {});
    this.emit({ type: 'mom', mom: this.publicMom() });
    const bonus = this.config.events.mom.hideMinutes;
    if (bonus) this.topup(p, bonus, 'hide');
    this.say('momHide', { name: p.name }, { mood: 'vui', priority: 3 });
    return true;
  }

  // home: bạn đó tự về trước; done: bạn đó đã rời ghế vì chuyện khác.
  endMom(phase) {
    if (phase === 'done') {
      this.mom = null;
      this.emit({ type: 'mom', mom: null });
      return;
    }
    this.mom.phase = phase;
    this.mom.endsAt = this.now() + SCENE_MS;
    this.emit({ type: 'mom', mom: this.publicMom() });
    this.say('momHome', { name: this.mom.name }, { priority: 3 });
  }

  momTimeUp(t) {
    if (this.mom.phase !== 'come') {
      this.mom = null;
      this.emit({ type: 'mom', mom: null });
      return;
    }
    const p = this.players.get(this.mom.id);
    this.mom.phase = 'drag';
    this.mom.endsAt = t + SCENE_MS;
    this.emit({ type: 'mom', mom: this.publicMom() });
    this.vacate(p, 'mom');
    this.say('momDrag', { name: p.name }, { mood: 'la', priority: 3 });
    this.fillSeats();
  }

  setSafe(on) {
    this.safe = Boolean(on);
    const t = this.now();
    if (!this.safe) for (const kind of EVENTS) this.schedule(kind, t);
  }

  // ---------- Cô Tám nói ----------
  pickLine(kind) {
    const list = this.lines[kind];
    if (!Array.isArray(list) || !list.length) return '';
    let i = Math.floor(this.rng() * list.length);
    if (list.length > 1 && i === this.lastLine.get(kind)) i = (i + 1) % list.length;
    this.lastLine.set(kind, i);
    return list[i];
  }

  line(kind, vars) {
    return fillLine(this.pickLine(kind), vars);
  }

  // Đang nói câu quan trọng hơn hoặc ngang hàng thì bỏ câu mới, để bong bóng không nhảy liên tục.
  // Gửi kèm câu mẫu và các giá trị để phần giọng đọc ghép mẩu.
  say(kind, vars = {}, { mood = 'thuong', priority = 1 } = {}) {
    const t = this.now();
    if (t < this.talk.until && priority <= this.talk.priority) return false;
    const template = this.pickLine(kind);
    if (!template) return false;
    this.talk = { until: t + TALK_MS, priority };
    this.emit({ type: 'say', kind, template, vars, text: fillLine(template, vars), mood, priority });
    return true;
  }

  // ---------- Lưu, xóa ----------
  reset() {
    for (const seat of this.seats) seat.id = null;
    this.players.clear();
    this.queue = [];
    this.golden = null;
    this.blackout = null;
    this.mom = null;
    this.boss = null;
    const t = this.now();
    for (const kind of EVENTS) this.schedule(kind, t);
    this.stateDirty = true;
    this.boardDirty = true;
    this.emit({ type: 'snapshot-game', game: this.snapshot() });
  }

  exportState() {
    const round = (value) => Math.round(value * 100) / 100;
    const keep = [...this.players.values()]
      .filter((p) => p.score >= 1 || p.balance > this.config.time.freeMinutes || p.vip > 0 || p.boost > 0 || p.paid)
      .sort((a, b) => b.score - a.score)
      .slice(0, SAVED_PLAYERS);
    return {
      players: keep.map((p) => ({ id: p.id, name: p.name, score: round(p.score), balance: round(p.balance), boost: round(p.boost), vip: round(p.vip), rig: p.rig, paid: p.paid, followed: p.followed, game: p.game })),
    };
  }

  importState(state) {
    const rows = Array.isArray(state?.players) ? state.players : [];
    const num = (value) => (Number.isFinite(value) && value > 0 ? value : 0);
    const codes = new Set(this.config.games.map((game) => game.code));
    for (const row of rows) {
      if (typeof row?.id !== 'string' || typeof row.name !== 'string') continue;
      const p = this.player({ id: row.id, name: row.name });
      p.score = num(row.score);
      p.balance = num(row.balance);
      p.boost = num(row.boost);
      p.vip = num(row.vip);
      p.rig = row.rig === true;
      p.paid = row.paid === true;
      p.followed = row.followed === true;
      if (codes.has(row.game)) p.game = row.game;
    }
    this.boardDirty = true;
  }
}
