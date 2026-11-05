// Vòng quay sự kiện: cứ everySeconds giây quay một lần, ô trúng đổi luật cả hồ trong eventSeconds giây.
// Server chốt kết quả ngay lúc bắt đầu quay, trang game chỉ diễn hoạt cảnh dừng đúng ô đó.
// Luôn tự chạy miễn phí: quà và tim không mua được lượt quay. Người tặng nhiều nhất chỉ được ghi tên
// là người quay; đủ tim thì lần sau là vòng vàng (toàn ô mạnh), nhưng kết quả vẫn do server bốc.

const publicSlot = ({ id, label, icon, text, color }) => ({ id, label, icon, text, color });

export class Wheel {
  // startEvent/endEvent(slot): áp và gỡ hiệu ứng. eventOver(): sự kiện kết thúc sớm (cá mập đã bị hạ).
  // players(): số người đang ngồi; hồ vắng thì chưa quay.
  constructor(cfg, { emit = () => {}, random = Math.random, now = Date.now, players = () => 1, startEvent = () => {}, endEvent = () => {}, eventOver = () => false } = {}) {
    this.slots = cfg.slots;
    this.everyMs = cfg.everySeconds * 1000;
    this.warnMs = cfg.warnSeconds * 1000;
    this.spinMs = cfg.spinSeconds * 1000;
    this.eventMs = cfg.eventSeconds * 1000;
    this.minPlayers = cfg.minPlayers ?? 1;
    this.goal = cfg.goldenLikes ?? 0;
    this.emit = emit;
    this.random = random;
    this.now = now;
    this.players = players;
    this.startEvent = startEvent;
    this.endEvent = endEvent;
    this.eventOver = eventOver;
    this.auto = cfg.enabled !== false;
    this.phase = 'idle';
    this.waiting = false;
    this.nextAt = now() + this.everyMs;
    this.phaseEnd = 0;
    this.spinInfo = null;
    this.slot = null;
    this.lastId = null;
    this.likes = 0;
    this.goldDirty = false;
    this.goldAt = 0;
    this.coins = new Map();
  }

  // ---------- Người xem góp vào lần quay tới ----------

  addLikes(count) {
    if (!(this.goal > 0) || this.likes >= this.goal) return;
    this.likes = Math.min(this.goal, this.likes + count);
    this.goldDirty = true;
  }

  addCoins(who, coins) {
    if (!(coins > 0)) return;
    const entry = this.coins.get(who.id) ?? { name: who.name, avatar: who.avatar, coins: 0 };
    entry.name = who.name;
    entry.avatar = who.avatar || entry.avatar;
    entry.coins += coins;
    this.coins.set(who.id, entry);
  }

  // ---------- Vòng đời một lần quay ----------

  // Bốc theo trọng số, không trùng ô vừa ra (nếu còn ô khác).
  pick(list, key) {
    const pool = list.length > 1 ? list.filter((s) => s.id !== this.lastId) : list;
    let x = this.random() * pool.reduce((sum, s) => sum + s[key], 0);
    for (const s of pool) {
      if ((x -= s[key]) < 0) return s;
    }
    return pool.at(-1);
  }

  // Trả về false khi đang quay dở. Đang có sự kiện thì sự kiện đó dừng để quay lần mới.
  // Từ bảng điều khiển có thể chỉ định slotId hoặc vòng vàng.
  spin({ slotId = null, golden = null } = {}) {
    if (this.phase === 'spin') return false;
    if (this.phase === 'event') this.finish();
    const now = this.now();
    const forced = slotId ? this.slots.find((s) => s.id === slotId) : null;
    if (slotId && !forced) return false;
    let isGold = golden ?? (this.goal > 0 && this.likes >= this.goal);
    if (isGold && !this.slots.some((s) => s.goldWeight > 0)) isGold = false;
    if (forced && isGold && !(forced.goldWeight > 0)) isGold = false;
    const key = isGold ? 'goldWeight' : 'weight';
    const list = this.slots.filter((s) => s[key] > 0 || s === forced);
    const slot = forced ?? this.pick(list, key);
    const sum = list.reduce((n, s) => n + (s[key] || 0), 0);
    const spinner = [...this.coins.values()].sort((a, b) => b.coins - a.coins)[0] ?? null;
    this.coins.clear();
    if (isGold) {
      this.likes = 0;
      this.goldDirty = true;
    }
    this.slot = slot;
    this.lastId = slot.id;
    this.spinInfo = {
      slots: list.map((s) => ({ ...publicSlot(s), share: sum > 0 ? (s[key] || 0) / sum : 1 / list.length })),
      index: list.indexOf(slot),
      golden: isGold,
      spinner: spinner && { name: spinner.name, avatar: spinner.avatar },
    };
    this.spinAt = now;
    this.phase = 'spin';
    this.phaseEnd = now + this.spinMs;
    this.nextAt = now + this.everyMs;
    this.waiting = false;
    this.announce('spin');
    return true;
  }

  begin() {
    const now = this.now();
    this.phase = 'event';
    this.phaseEnd = now + this.eventMs;
    this.startEvent(this.slot);
    this.announce('start');
  }

  finish() {
    const slot = this.slot;
    this.phase = 'idle';
    this.slot = null;
    this.spinInfo = null;
    this.endEvent(slot);
    this.announce('end');
  }

  setAuto(on) {
    if (this.auto === on) return;
    this.auto = on;
    this.waiting = false;
    if (on) this.nextAt = this.now() + this.everyMs;
    if (this.phase === 'warn') this.phase = 'idle';
    this.announce();
  }

  tick() {
    const now = this.now();
    if (this.phase === 'spin' && now >= this.phaseEnd) this.begin();
    if (this.phase === 'event' && (now >= this.phaseEnd || this.eventOver())) this.finish();
    if (this.auto && this.phase === 'idle' && this.nextAt - now <= this.warnMs) {
      if (this.players() < this.minPlayers) {
        // Hồ vắng: giữ nguyên ở mốc báo trước tới khi có người xuống hồ.
        this.nextAt = now + this.warnMs;
        if (!this.waiting) {
          this.waiting = true;
          this.announce();
        }
      } else {
        this.waiting = false;
        this.phase = 'warn';
        this.announce('warn');
      }
    }
    if (this.auto && this.phase === 'warn' && now >= this.nextAt) this.spin();
    if (this.goldDirty && now - this.goldAt >= 1000) {
      this.goldDirty = false;
      this.goldAt = now;
      this.emit({ type: 'wheel-gold', ...this.goldView() });
    }
  }

  // ---------- Dữ liệu gửi xuống trang game ----------

  goldView() {
    return { likes: this.likes, goal: this.goal, ready: this.goal > 0 && this.likes >= this.goal };
  }

  // Không gửi tỉ lệ thành công (effect): người xem chỉ thấy câu mô tả.
  view() {
    const now = this.now();
    const effect = this.slot?.effect ?? {};
    return {
      phase: this.phase,
      auto: this.auto,
      waiting: this.waiting,
      nextIn: this.auto ? Math.max(0, this.nextAt - now) : null,
      gold: this.goldView(),
      spin: this.phase === 'spin' ? { ...this.spinInfo, ms: this.spinMs, elapsed: now - this.spinAt } : null,
      event:
        this.phase === 'event'
          ? {
              ...publicSlot(this.slot),
              left: Math.max(0, this.phaseEnd - now),
              total: this.eventMs,
              likesPerPull: effect.likesPerPull ?? null,
              rareStep: effect.rareStep ?? null,
            }
          : null,
    };
  }

  // just: bước vừa chuyển sang (warn, spin, start, end), để trang game phát âm thanh đúng một lần.
  announce(just = null) {
    this.emit({ type: 'wheel', just, ...this.view() });
  }
}
