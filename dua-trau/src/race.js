// Luật Đua Trâu: 5 con trâu mang số báo danh, mỗi vòng 60 giây. Người xem comment số (vd "3", "số 3", "trâu 3")
// để chọn trâu của mình. Trong vòng đua, mỗi người thả đủ 30 tim thì trâu của người đó đi thêm 0,1 m;
// quà riêng của trâu nào cộng 1 m cho trâu đó, quà khác cộng cho trâu người tặng đã chọn.
// Hết giờ trâu đi xa nhất thắng vòng (bằng nhau thì trâu tới mức đó trước thắng), rồi nghỉ vài giây và sang vòng mới.
// Điểm lưu bằng đơn vị 0,1 m (số nguyên) để cộng 0,1 nhiều lần không bị lệch số thực.

const MAX_FANS = 50_000;
const CROWD = 4;

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Một từ là số báo danh, có thể dính chữ đứng trước: "3", "#3", "so3", "trau3", "no3", "sbd3".
const PICK = /^(?:so|trau|con|no|num|number|sbd)?(\d{1,2})$/;
const tenths = (meters) => Math.round(Number(meters) * 10);

export class Race {
  constructor(config, { emit = () => {}, now = Date.now } = {}) {
    this.emit = emit;
    this.now = now;
    this.roundMs = config.roundSeconds * 1000;
    this.resultMs = config.resultSeconds * 1000;
    this.commentUnits = tenths(config.commentMeters ?? 0);
    this.likesPerStep = config.likesPerStep ?? 30;
    this.likeUnits = tenths(config.likeMeters ?? 0);
    this.giftUnits = tenths(config.giftMeters);
    this.otherUnits = tenths(config.otherGiftMeters ?? 0);
    this.buffaloes = config.buffaloes.map((b) => ({
      id: String(b.id),
      name: b.name,
      color: b.color,
      sprite: b.sprite ?? String(b.id),
      gift: b.gift,
      giftIds: (b.gift?.ids ?? []).map(String),
      giftNames: (b.gift?.names ?? []).map(normalize),
    }));
    this.byId = new Map(this.buffaloes.map((b) => [b.id, b]));
    this.fans = new Map();
    // Đội cổ vũ: số người đã chọn từng trâu và vài người vừa tương tác gần nhất (hiện ảnh đại diện trên làn).
    this.teams = new Map(this.buffaloes.map((b) => [b.id, { count: 0, recent: [] }]));
    // Tổng số mét mỗi người tiếp sức từ đầu buổi live (Xóa số vòng thắng thì đếm lại).
    this.session = new Map();
    this.wins = this.zero();
    this.round = 0;
    this.paused = false;
    this.startRound();
  }

  zero() {
    return Object.fromEntries(this.buffaloes.map((b) => [b.id, 0]));
  }

  // Số báo danh đầu tiên đứng thành từ riêng trong comment ("12" không phải trâu 1, "01" là trâu 1).
  buffaloOf(text) {
    for (const word of normalize(text).split(' ')) {
      const m = PICK.exec(word);
      const buffalo = m && this.byId.get(String(Number(m[1])));
      if (buffalo) return buffalo;
    }
    return null;
  }

  buffaloOfGift({ id, name }) {
    const key = String(id ?? '');
    const norm = normalize(name);
    return this.buffaloes.find((b) => (key && b.giftIds.includes(key)) || (norm && b.giftNames.includes(norm))) ?? null;
  }

  fanOf(who) {
    let fan = this.fans.get(who.id);
    if (!fan) {
      if (this.fans.size >= MAX_FANS) {
        const oldest = this.fans.keys().next().value;
        this.leaveTeam(this.fans.get(oldest));
        this.fans.delete(oldest);
      }
      fan = { id: who.id, name: who.name, avatar: who.avatar ?? '', buffalo: null };
    } else this.fans.delete(who.id);
    // Đưa lên cuối để người vừa tương tác là người bị quên sau cùng.
    this.fans.set(who.id, fan);
    fan.name = who.name || fan.name;
    if (who.avatar) fan.avatar = who.avatar;
    return fan;
  }

  leaveTeam(fan) {
    const team = fan?.buffalo && this.teams.get(fan.buffalo);
    if (!team) return;
    team.count = Math.max(0, team.count - 1);
    team.recent = team.recent.filter((r) => r.id !== fan.id);
  }

  // Trả về true nếu người này vừa vào đội mới (chọn lần đầu hoặc đổi trâu).
  joinTeam(fan, id) {
    if (fan.buffalo === id) return false;
    this.leaveTeam(fan);
    fan.buffalo = id;
    this.teams.get(id).count++;
    return true;
  }

  // Người trong đội vừa tương tác thì đưa ảnh đại diện lên đầu hàng cổ vũ.
  cheer(fan, id) {
    const team = this.teams.get(id);
    if (!team || fan.buffalo !== id) return;
    team.recent = [{ id: fan.id, name: fan.name, avatar: fan.avatar }, ...team.recent.filter((r) => r.id !== fan.id)].slice(0, CROWD);
  }

  teamsView() {
    return Object.fromEntries(
      this.buffaloes.map((b) => {
        const team = this.teams.get(b.id);
        return [b.id, { count: team.count, recent: team.recent.map(({ name, avatar }) => ({ name, avatar })) }];
      }),
    );
  }

  sessionTop(n) {
    return [...this.session.values()].sort((a, b) => b.units - a.units).slice(0, n).map(({ name, avatar, units }) => ({ name, avatar, units }));
  }

  // Comment số báo danh để chọn (hoặc đổi) trâu. commentMeters > 0 thì comment còn cộng mét như luật cũ.
  comment(who, text) {
    const buffalo = this.buffaloOf(text);
    if (!buffalo) return null;
    const fan = this.fanOf(who);
    const joined = this.joinTeam(fan, buffalo.id);
    if (this.commentUnits > 0) return this.add(fan, buffalo, this.commentUnits, { kind: 'comment', joined });
    this.cheer(fan, buffalo.id);
    this.emit({ type: 'pick', buffalo: buffalo.id, joined, who: { name: fan.name, avatar: fan.avatar }, ...this.board() });
    return { buffalo: buffalo.id, units: 0, banked: false, joined };
  }

  // Tim chỉ tính trong lúc đang đua và cho người đã chọn trâu. Mỗi người dồn tim riêng trong vòng,
  // cứ đủ likesPerStep tim thì trâu của họ đi likeMeters.
  like(who, count = 1) {
    count = Math.trunc(Number(count));
    if (!(count > 0) || this.phase !== 'race' || this.paused) return null;
    const known = this.fans.get(who.id);
    const buffalo = known && this.byId.get(known.buffalo);
    if (!buffalo) return null;
    const fan = this.fanOf(who);
    const before = this.likes.get(fan.id) ?? 0;
    const after = before + count;
    this.likes.delete(fan.id);
    this.likes.set(fan.id, after);
    if (this.likes.size > MAX_FANS) this.likes.delete(this.likes.keys().next().value);
    const steps = Math.floor(after / this.likesPerStep) - Math.floor(before / this.likesPerStep);
    if (steps > 0 && this.likeUnits > 0) return this.add(fan, buffalo, steps * this.likeUnits, { kind: 'like', likes: count });
    this.cheer(fan, buffalo.id);
    this.emit({ type: 'like', buffalo: buffalo.id, count, who: { name: fan.name, avatar: fan.avatar }, teams: this.teamsView() });
    return { buffalo: buffalo.id, units: 0, banked: false };
  }

  // Quà riêng của một trâu luôn cộng cho trâu đó; quà khác cộng cho trâu người tặng đã chọn.
  gift(who, gift, count = 1) {
    const fan = this.fanOf(who);
    const own = this.buffaloOfGift(gift);
    const buffalo = own ?? this.byId.get(fan.buffalo);
    const units = (own ? this.giftUnits : this.otherUnits) * count;
    if (!buffalo || !(units > 0)) return null;
    const icon = own?.gift?.icon ?? '';
    return this.add(fan, buffalo, units, { kind: 'gift', count, icon, giftName: gift.name ?? '' });
  }

  add(fan, buffalo, units, info) {
    const banked = this.phase !== 'race' || this.paused;
    if (banked) this.carry[buffalo.id] += units;
    else this.score(buffalo.id, units);
    const key = `${fan.id}|${buffalo.id}`;
    const mine = this.supporters.get(key) ?? { id: fan.id, name: fan.name, avatar: fan.avatar, buffalo: buffalo.id, units: 0 };
    mine.units += units;
    mine.name = fan.name;
    mine.avatar = fan.avatar;
    this.supporters.delete(key);
    this.supporters.set(key, mine);
    if (this.supporters.size > MAX_FANS) this.supporters.delete(this.supporters.keys().next().value);
    const total = this.session.get(fan.id) ?? { name: fan.name, avatar: fan.avatar, units: 0 };
    total.units += units;
    total.name = fan.name;
    total.avatar = fan.avatar;
    this.session.delete(fan.id);
    this.session.set(fan.id, total);
    if (this.session.size > MAX_FANS) this.session.delete(this.session.keys().next().value);
    this.cheer(fan, buffalo.id);
    this.emit({ type: 'boost', buffalo: buffalo.id, units, banked, who: { name: fan.name, avatar: fan.avatar }, ...info, ...this.board() });
    return { buffalo: buffalo.id, units, banked };
  }

  score(id, units) {
    this.scores[id] += units;
    this.reached[id] = this.now();
  }

  // Trâu dẫn đầu: xa nhất, bằng nhau thì trâu tới mức đó trước. Chưa trâu nào chạy thì không có.
  ranking() {
    return [...this.buffaloes]
      .map((b) => b.id)
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
    return { scores: { ...this.scores }, leader: this.leader(), round: this.round, wins: { ...this.wins }, teams: this.teamsView() };
  }

  startRound() {
    this.round++;
    this.phase = 'race';
    this.until = this.now() + this.roundMs;
    this.scores = this.zero();
    this.reached = this.zero();
    this.supporters = new Map();
    this.likes = new Map();
    this.carry ??= this.zero();
    this.applyCarry();
    this.emit({ type: 'round', phase: this.phase, left: this.roundMs, paused: this.paused, ...this.board() });
  }

  applyCarry() {
    for (const b of this.buffaloes) {
      if (this.carry[b.id]) this.score(b.id, this.carry[b.id]);
      this.carry[b.id] = 0;
    }
  }

  // Kết quả vòng: trâu thắng, top 3 người tiếp sức cho trâu đó (bục vinh danh), số người trong đội thắng,
  // và top 5 bảng vàng cả buổi live.
  finish() {
    const winner = this.leader();
    if (winner) this.wins[winner]++;
    // Sắp xếp ổn định: bằng mét thì người có mặt trong danh sách trước (tiếp sức sớm hơn) đứng trên.
    const podium = [...this.supporters.values()]
      .filter((s) => s.buffalo === winner)
      .sort((a, b) => b.units - a.units)
      .slice(0, 3)
      .map(({ name, avatar, units }) => ({ name, avatar, units }));
    this.phase = 'result';
    this.until = this.now() + this.resultMs;
    this.lastResult = {
      winner,
      top: podium[0] ?? null,
      podium,
      team: winner ? this.teams.get(winner).count : 0,
      session: this.sessionTop(5),
      ranking: this.ranking(),
    };
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
    this.session.clear();
    if (this.paused) this.pause(false);
    this.startRound();
    return true;
  }

  snapshot() {
    return {
      buffaloes: this.buffaloes.map(({ id, name, color, sprite, gift }) => ({ id, name, color, sprite, gift: gift && { label: gift.label, icon: gift.icon } })),
      phase: this.phase,
      left: this.left(),
      resultMs: this.resultMs,
      paused: this.paused,
      result: this.phase === 'result' ? this.lastResult : null,
      units: { comment: this.commentUnits, like: this.likeUnits, likesPerStep: this.likesPerStep, gift: this.giftUnits },
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
      fans: [...this.fans.values()].slice(-5000).filter((f) => f.buffalo),
      session: [...this.session].sort(([, a], [, b]) => b.units - a.units).slice(0, 500).map(([id, s]) => ({ id, ...s })),
    };
  }

  // Khôi phục sau khi tắt/bật server: vòng đang chạy chạy tiếp từ số giây còn lại.
  restore(data) {
    const count = (v) => (Number.isSafeInteger(v) && v > 0 ? v : 0);
    for (const b of this.buffaloes) {
      this.wins[b.id] = count(data?.wins?.[b.id]);
      this.scores[b.id] = count(data?.scores?.[b.id]);
      this.carry[b.id] = count(data?.carry?.[b.id]);
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
      if (!f?.id || !this.byId.has(f.buffalo) || this.fans.has(String(f.id))) continue;
      const fan = { id: String(f.id), name: String(f.name ?? ''), avatar: String(f.avatar ?? ''), buffalo: null };
      this.fans.set(fan.id, fan);
      this.joinTeam(fan, f.buffalo);
      // Danh sách lưu theo thứ tự cũ → mới, nên người tương tác sau cùng đứng đầu hàng cổ vũ.
      this.cheer(fan, f.buffalo);
    }
    // Lưu theo thứ tự nhiều → ít; nạp ngược lại để khi đầy thì người ít mét bị quên trước.
    for (const s of Array.isArray(data?.session) ? [...data.session].reverse() : []) {
      if (s?.id && count(s.units)) this.session.set(String(s.id), { name: String(s.name ?? ''), avatar: String(s.avatar ?? ''), units: s.units });
    }
  }
}
