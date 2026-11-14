// Luật Đua Trâu: 5 nước, mỗi vòng 60 giây. Comment tên nước +0,1 m, mỗi quà của nước đó +1 m.
// Hết giờ nước đi xa nhất thắng vòng (bằng nhau thì nước tới mức đó trước thắng), rồi nghỉ vài giây và sang vòng mới.
// Điểm lưu bằng đơn vị 0,1 m (số nguyên) để cộng 0,1 nhiều lần không bị lệch số thực.

const MAX_FANS = 50_000;

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const latin = (alias) => /^[a-z0-9 ]+$/.test(alias);
const tenths = (meters) => Math.round(Number(meters) * 10);

export class Race {
  constructor(config, { emit = () => {}, now = Date.now } = {}) {
    this.emit = emit;
    this.now = now;
    this.roundMs = config.roundSeconds * 1000;
    this.resultMs = config.resultSeconds * 1000;
    this.commentUnits = tenths(config.commentMeters);
    this.giftUnits = tenths(config.giftMeters);
    this.otherUnits = tenths(config.otherGiftMeters ?? 0);
    this.nations = config.nations.map((n) => ({
      id: n.id,
      name: n.name,
      color: n.color,
      gift: n.gift,
      aliases: [...new Set([n.id, n.name, ...(n.aliases ?? [])].map(normalize).filter(Boolean))],
      giftIds: (n.gift?.ids ?? []).map(String),
      giftNames: (n.gift?.names ?? []).map(normalize),
    }));
    this.byId = new Map(this.nations.map((n) => [n.id, n]));
    this.fans = new Map();
    this.wins = this.zero();
    this.round = 0;
    this.paused = false;
    this.startRound();
  }

  zero() {
    return Object.fromEntries(this.nations.map((n) => [n.id, 0]));
  }

  // Nước được nhắc sớm nhất trong comment. Tên chữ Latin phải đứng thành từ riêng ("vn" không khớp "vnd"),
  // chữ Thái/Hoa/Khmer viết liền không dấu cách nên chỉ cần có mặt.
  nationOf(text) {
    const norm = normalize(text);
    if (!norm) return null;
    const padded = ` ${norm} `;
    let best = null;
    let bestAt = Infinity;
    for (const n of this.nations) {
      for (const alias of n.aliases) {
        const at = latin(alias) ? padded.indexOf(` ${alias} `) : padded.indexOf(alias);
        if (at >= 0 && at < bestAt) {
          best = n;
          bestAt = at;
        }
      }
    }
    return best;
  }

  nationOfGift({ id, name }) {
    const key = String(id ?? '');
    const norm = normalize(name);
    return this.nations.find((n) => (key && n.giftIds.includes(key)) || (norm && n.giftNames.includes(norm))) ?? null;
  }

  fanOf(who) {
    let fan = this.fans.get(who.id);
    if (!fan) {
      if (this.fans.size >= MAX_FANS) this.fans.delete(this.fans.keys().next().value);
      fan = { id: who.id, name: who.name, avatar: who.avatar ?? '', nation: null };
    } else this.fans.delete(who.id);
    // Đưa lên cuối để người vừa tương tác là người bị quên sau cùng.
    this.fans.set(who.id, fan);
    fan.name = who.name || fan.name;
    if (who.avatar) fan.avatar = who.avatar;
    return fan;
  }

  comment(who, text) {
    const nation = this.nationOf(text);
    if (!nation) return null;
    const fan = this.fanOf(who);
    fan.nation = nation.id;
    return this.add(fan, nation, this.commentUnits, { kind: 'comment' });
  }

  // Quà của một nước luôn cộng cho nước đó; quà khác cộng cho nước người gửi comment gần nhất.
  gift(who, gift, count = 1) {
    const fan = this.fanOf(who);
    const own = this.nationOfGift(gift);
    const nation = own ?? this.byId.get(fan.nation);
    const units = (own ? this.giftUnits : this.otherUnits) * count;
    if (!nation || !(units > 0)) return null;
    const icon = own?.gift?.icon ?? '';
    return this.add(fan, nation, units, { kind: 'gift', count, icon, giftName: gift.name ?? '' });
  }

  add(fan, nation, units, info) {
    const banked = this.phase !== 'race' || this.paused;
    if (banked) this.carry[nation.id] += units;
    else this.score(nation.id, units);
    const key = `${fan.id}|${nation.id}`;
    const mine = this.supporters.get(key) ?? { id: fan.id, name: fan.name, avatar: fan.avatar, nation: nation.id, units: 0 };
    mine.units += units;
    mine.name = fan.name;
    mine.avatar = fan.avatar;
    this.supporters.delete(key);
    this.supporters.set(key, mine);
    if (this.supporters.size > MAX_FANS) this.supporters.delete(this.supporters.keys().next().value);
    this.emit({ type: 'boost', nation: nation.id, units, banked, who: { name: fan.name, avatar: fan.avatar }, ...info, ...this.board() });
    return { nation: nation.id, units, banked };
  }

  score(id, units) {
    this.scores[id] += units;
    this.reached[id] = this.now();
  }

  // Nước dẫn đầu: xa nhất, bằng nhau thì ai tới mức đó trước. Chưa ai chạy thì không có.
  ranking() {
    return [...this.nations]
      .map((n) => n.id)
      .sort((a, b) => this.scores[b] - this.scores[a] || this.reached[a] - this.reached[b]);
  }

  leader() {
    const [first] = this.ranking();
    return this.scores[first] > 0 ? first : null;
  }

  left() {
    if (this.paused) return this.pausedLeft;
    return Math.max(0, this.until - this.now());
  }

  board() {
    return { scores: { ...this.scores }, leader: this.leader(), round: this.round, wins: { ...this.wins } };
  }

  startRound() {
    this.round++;
    this.phase = 'race';
    this.until = this.now() + this.roundMs;
    this.scores = this.zero();
    this.reached = this.zero();
    this.supporters = new Map();
    this.carry ??= this.zero();
    this.applyCarry();
    this.emit({ type: 'round', phase: this.phase, left: this.roundMs, paused: this.paused, ...this.board() });
  }

  applyCarry() {
    for (const n of this.nations) {
      if (this.carry[n.id]) this.score(n.id, this.carry[n.id]);
      this.carry[n.id] = 0;
    }
  }

  finish() {
    const winner = this.leader();
    if (winner) this.wins[winner]++;
    let top = null;
    for (const s of this.supporters.values()) if (s.nation === winner && (!top || s.units > top.units)) top = s;
    this.phase = 'result';
    this.until = this.now() + this.resultMs;
    this.lastResult = { winner, top: top && { name: top.name, avatar: top.avatar, units: top.units }, ranking: this.ranking() };
    this.emit({ type: 'result', phase: this.phase, left: this.resultMs, ...this.lastResult, ...this.board() });
  }

  tick() {
    if (this.paused || this.now() < this.until) return;
    if (this.phase === 'race') this.finish();
    else this.startRound();
  }

  pause(on) {
    on = Boolean(on);
    if (on === this.paused) return this.paused;
    if (on) this.pausedLeft = this.left();
    else {
      this.until = this.now() + this.pausedLeft;
      // Quà gửi lúc tạm dừng giữa vòng được cộng ngay khi chạy lại.
      if (this.phase === 'race') this.applyCarry();
    }
    this.paused = on;
    this.emit({ type: 'pause', paused: this.paused, phase: this.phase, left: this.left(), ...this.board() });
    return this.paused;
  }

  // Bảng điều khiển: kết thúc vòng ngay / bắt đầu vòng mới ngay (bỏ kết quả vòng đang chạy).
  endNow() {
    if (this.phase !== 'race') return false;
    if (this.paused) this.pause(false);
    this.finish();
    return true;
  }

  restart() {
    if (this.paused) this.pause(false);
    if (this.phase === 'race') this.round--;
    this.startRound();
    return true;
  }

  resetWins() {
    this.wins = this.zero();
    this.round = 0;
    if (this.paused) this.pause(false);
    this.startRound();
    return true;
  }

  snapshot() {
    return {
      nations: this.nations.map(({ id, name, color, gift }) => ({ id, name, color, gift: gift && { label: gift.label, icon: gift.icon } })),
      phase: this.phase,
      left: this.left(),
      paused: this.paused,
      result: this.phase === 'result' ? this.lastResult : null,
      units: { comment: this.commentUnits, gift: this.giftUnits },
      ...this.board(),
    };
  }

  toJSON() {
    return {
      round: this.round,
      phase: this.phase,
      left: this.left(),
      paused: this.paused,
      scores: this.scores,
      wins: this.wins,
      carry: this.carry,
      lastResult: this.lastResult ?? null,
      fans: [...this.fans.values()].slice(-5000).filter((f) => f.nation),
    };
  }

  // Khôi phục sau khi tắt/bật server: vòng đang chạy chạy tiếp từ số giây còn lại.
  restore(data) {
    const count = (v) => (Number.isSafeInteger(v) && v > 0 ? v : 0);
    for (const n of this.nations) {
      this.wins[n.id] = count(data?.wins?.[n.id]);
      this.scores[n.id] = count(data?.scores?.[n.id]);
      this.carry[n.id] = count(data?.carry?.[n.id]);
    }
    this.round = Math.max(1, count(data?.round));
    this.phase = data?.phase === 'result' ? 'result' : 'race';
    const total = this.phase === 'race' ? this.roundMs : this.resultMs;
    const left = Math.min(total, Math.max(0, Number(data?.left) || 0));
    this.until = this.now() + left;
    this.paused = Boolean(data?.paused);
    this.pausedLeft = left;
    if (data?.lastResult && this.byId.has(data.lastResult.winner)) this.lastResult = data.lastResult;
    if (this.phase === 'result' && !this.lastResult) this.until = this.now();
    for (const f of Array.isArray(data?.fans) ? data.fans : []) {
      if (f?.id && this.byId.has(f.nation)) this.fans.set(String(f.id), { id: String(f.id), name: String(f.name ?? ''), avatar: String(f.avatar ?? ''), nation: f.nation });
    }
  }
}
