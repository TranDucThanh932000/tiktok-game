// Luật Sút Penalty: người xem comment tên đội để vào đội, mỗi quà đổi ra lượt sút cho cầu thủ của đội mình.
// Lượt sút xếp hàng theo từng đội và được bắn lần lượt xoay vòng giữa các đội; hàng chờ càng dài sút càng nhanh.

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const MAX_FANS = 50_000;

export class Game {
  constructor(config, { emit = () => {}, rng = Math.random, now = Date.now } = {}) {
    this.emit = emit;
    this.rng = rng;
    this.now = now;
    this.saveChance = config.saveChance;
    this.timing = config.timing;
    this.otherRate = config.otherGiftShotsPerCoin ?? 0;
    this.likesPerShot = config.likesPerShot ?? 0;
    this.gifts = [...config.gifts].sort((a, b) => a.coins - b.coins);
    this.teams = config.teams.map(({ id, name, number, aliases }) => ({ id, name, number, aliases: [id, name, ...(aliases ?? [])].map(normalize).filter(Boolean) }));
    this.fans = new Map();
    this.queues = new Map(this.teams.map((t) => [t.id, []]));
    this.pending = Object.fromEntries(this.teams.map((t) => [t.id, 0]));
    this.fanCount = Object.fromEntries(this.teams.map((t) => [t.id, 0]));
    this.stats = Object.fromEntries(this.teams.map((t) => [t.id, { goals: 0, saved: 0 }]));
    this.leaders = [];
    this.turn = 0;
    this.nextAt = 0;
    this.paused = false;
    this.shotNo = 0;
  }

  // Một comment chỉ tính khi nhắc đúng một đội, "MU hơn Real" thì bỏ qua.
  teamOf(text) {
    const padded = ` ${normalize(text)} `;
    const found = this.teams.filter((t) => t.aliases.some((alias) => padded.includes(` ${alias} `)));
    return found.length === 1 ? found[0] : null;
  }

  fanOf(who) {
    let fan = this.fans.get(who.id);
    if (!fan) {
      if (this.fans.size >= MAX_FANS) this.forgetIdleFan();
      fan = { id: who.id, name: who.name, avatar: who.avatar ?? '', team: null, goals: 0, shots: 0, likes: 0 };
      this.fans.set(who.id, fan);
    }
    fan.name = who.name || fan.name;
    if (who.avatar) fan.avatar = who.avatar;
    return fan;
  }

  // Người chưa từng sút và không còn lượt chờ thì quên được.
  forgetIdleFan() {
    const queued = new Set([...this.queues.values()].flat().map((entry) => entry.id));
    for (const [id, fan] of this.fans) {
      if (!fan.shots && !queued.has(id)) {
        if (fan.team) this.fanCount[fan.team]--;
        this.fans.delete(id);
        return;
      }
    }
  }

  setTeam(fan, team) {
    if (fan.team) this.fanCount[fan.team]--;
    fan.team = team;
    this.fanCount[team]++;
  }

  comment(who, text) {
    const team = this.teamOf(text);
    if (!team) return null;
    const fan = this.fanOf(who);
    if (fan.team === team.id) return { team: team.id, already: true };
    const from = fan.team;
    this.setTeam(fan, team.id);
    this.emit({ type: 'join', fan: publicFan(fan), team: team.id, from, auto: false, board: this.board() });
    return { team: team.id, from };
  }

  shotsFor(coins) {
    const tier = this.gifts.find((g) => g.coins === coins);
    return tier ? tier.shots : Math.floor(coins * this.otherRate);
  }

  emptiestTeam() {
    const least = Math.min(...this.teams.map((t) => this.fanCount[t.id]));
    const options = this.teams.filter((t) => this.fanCount[t.id] === least);
    return options[Math.floor(this.rng() * options.length)].id;
  }

  gift(who, { coins, name }, count = 1) {
    const shots = this.shotsFor(coins) * count;
    if (!(shots > 0)) return null;
    const fan = this.fanOf(who);
    const auto = this.addShots(fan, shots);
    this.emit({ type: 'gift', fan: publicFan(fan), team: fan.team, shots, giftName: name ?? '', coins, count, auto, board: this.board() });
    return { team: fan.team, shots, auto };
  }

  // Tim cộng dồn theo từng người, đủ likesPerShot tim thì được 1 lượt sút, phần lẻ để dành lần sau.
  like(who, count) {
    if (!(this.likesPerShot > 0) || !(count > 0)) return null;
    const fan = this.fanOf(who);
    fan.likes = (fan.likes ?? 0) + count;
    const shots = Math.floor(fan.likes / this.likesPerShot);
    fan.likes -= shots * this.likesPerShot;
    if (!shots) return { team: fan.team, shots: 0, likes: fan.likes };
    const auto = this.addShots(fan, shots);
    this.emit({ type: 'likes', fan: publicFan(fan), team: fan.team, shots, likes: shots * this.likesPerShot, auto, board: this.board() });
    return { team: fan.team, shots, auto, likes: fan.likes };
  }

  // Người chưa chọn đội được xếp vào đội ít fan nhất; trả về true khi vừa tự xếp.
  addShots(fan, shots) {
    const auto = !fan.team;
    if (auto) {
      this.setTeam(fan, this.emptiestTeam());
      this.emit({ type: 'join', fan: publicFan(fan), team: fan.team, from: null, auto: true, board: this.board() });
    }
    const queue = this.queues.get(fan.team);
    const last = queue.at(-1);
    if (last?.id === fan.id) last.left += shots;
    else queue.push({ id: fan.id, name: fan.name, avatar: fan.avatar, left: shots });
    this.pending[fan.team] += shots;
    return auto;
  }

  totalPending() {
    return Object.values(this.pending).reduce((sum, n) => sum + n, 0);
  }

  interval(pending) {
    const { shotMs, fastestShotMs, speedupEvery } = this.timing;
    return Math.max(fastestShotMs, Math.round(shotMs / (1 + pending / speedupEvery)));
  }

  tick() {
    if (this.paused) return;
    const now = this.now();
    if (now < this.nextAt || !this.totalPending()) return;
    const n = this.teams.length;
    for (let i = 0; i < n; i++) {
      const team = this.teams[(this.turn + i) % n];
      if (!this.pending[team.id]) continue;
      this.turn = (this.turn + i + 1) % n;
      const gap = this.interval(this.totalPending() - 1);
      this.nextAt = now + gap;
      this.shoot(team, gap);
      return;
    }
  }

  shoot(team, gap) {
    const queue = this.queues.get(team.id);
    const head = queue[0];
    head.left--;
    this.pending[team.id]--;
    if (!head.left) queue.shift();
    const shooter = this.fans.get(head.id) ?? this.fanOf({ id: head.id, name: head.name, avatar: head.avatar });

    const saved = this.rng() < this.saveChance;
    const r = this.rng();
    const side = r < 0.4 ? -1 : r < 0.6 ? 0 : 1;
    // tx: -1 cột trái .. 1 cột phải; ty: 0 sát cỏ .. 1 xà ngang.
    const tx = side === 0 ? (this.rng() - 0.5) * 0.4 : side * (0.45 + this.rng() * 0.45);
    const ty = 0.08 + this.rng() * 0.78;
    let dive = side;
    if (!saved) dive = side === 0 ? (this.rng() < 0.5 ? -1 : 1) : this.rng() < 0.75 ? -side : 0;

    const stat = this.stats[team.id];
    shooter.shots++;
    if (saved) stat.saved++;
    else {
      stat.goals++;
      shooter.goals++;
      this.lead(shooter);
    }
    this.shotNo++;
    this.emit({
      type: 'shot',
      no: this.shotNo,
      team: team.id,
      shooter: publicFan(shooter),
      saved,
      tx: Math.round(tx * 1000) / 1000,
      ty: Math.round(ty * 1000) / 1000,
      dive,
      gap,
      board: this.board(),
    });
  }

  // Bàn thắng chỉ tăng nên chỉ cần chen người vừa ghi bàn vào top 3.
  lead(fan) {
    const list = this.leaders.filter((f) => f.id !== fan.id);
    list.push(fan);
    list.sort((a, b) => b.goals - a.goals);
    this.leaders = list.slice(0, 3);
  }

  board() {
    return {
      stats: structuredClone(this.stats),
      pending: { ...this.pending },
      fans: { ...this.fanCount },
      heads: Object.fromEntries(this.teams.map((t) => {
        const head = this.queues.get(t.id)[0];
        return [t.id, head ? { name: head.name, avatar: head.avatar, left: head.left } : null];
      })),
      leaders: this.leaders.map(publicFan),
      paused: this.paused,
    };
  }

  snapshot() {
    return { teams: this.teams.map(({ id, name, number }) => ({ id, name, number })), saveChance: this.saveChance, board: this.board() };
  }

  // Trận mới: tỉ số về 0, fan vẫn ở đội cũ, lượt sút đã tặng mà chưa sút vẫn giữ nguyên.
  reset() {
    for (const t of this.teams) this.stats[t.id] = { goals: 0, saved: 0 };
    for (const fan of this.fans.values()) {
      fan.goals = 0;
      fan.shots = 0;
    }
    this.leaders = [];
    this.emit({ type: 'reset', board: this.board() });
    return true;
  }

  clearQueue() {
    for (const t of this.teams) {
      this.queues.set(t.id, []);
      this.pending[t.id] = 0;
    }
    this.emit({ type: 'board', board: this.board() });
    return true;
  }

  pause(on) {
    this.paused = Boolean(on);
    this.emit({ type: 'board', board: this.board() });
    return this.paused;
  }

  toJSON() {
    return {
      stats: this.stats,
      fans: [...this.fans.values()],
      queues: Object.fromEntries(this.queues),
    };
  }

  // Khôi phục sau khi tắt/bật server; dữ liệu hỏng hay đội đã đổi tên thì bỏ phần đó.
  restore(data) {
    const known = new Set(this.teams.map((t) => t.id));
    const count = (v) => (Number.isSafeInteger(v) && v > 0 ? v : 0);
    for (const [id, s] of Object.entries(data?.stats ?? {})) {
      if (known.has(id)) this.stats[id] = { goals: count(s?.goals), saved: count(s?.saved) };
    }
    for (const f of Array.isArray(data?.fans) ? data.fans : []) {
      if (!f?.id || this.fans.has(f.id)) continue;
      const fan = { id: String(f.id), name: String(f.name ?? ''), avatar: String(f.avatar ?? ''), team: null, goals: count(f.goals), shots: count(f.shots), likes: count(f.likes) };
      this.fans.set(fan.id, fan);
      if (known.has(f.team)) this.setTeam(fan, f.team);
      if (fan.goals) this.lead(fan);
    }
    for (const [id, list] of Object.entries(data?.queues ?? {})) {
      if (!known.has(id) || !Array.isArray(list)) continue;
      const queue = list.filter((e) => e?.id && count(e.left)).map((e) => ({ id: String(e.id), name: String(e.name ?? ''), avatar: String(e.avatar ?? ''), left: e.left }));
      this.queues.set(id, queue);
      this.pending[id] = queue.reduce((sum, e) => sum + e.left, 0);
    }
  }
}

function publicFan(fan) {
  return { id: fan.id, name: fan.name, avatar: fan.avatar, team: fan.team, goals: fan.goals };
}
