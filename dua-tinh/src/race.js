// Luật đua, không dính gì tới TikTok hay trình duyệt để test được bằng đồng hồ giả.
// - Comment tên tỉnh: người đó thuộc về tỉnh ấy, tỉnh +commentPoints. Mỗi người chỉ được tính một lần,
//   comment sau (kể cả tên tỉnh khác) không cộng thêm và không đổi tỉnh.
// - Quà: điểm theo tên quà trong config.gifts, quà khác tính theo số xu. Điểm cộng cho tỉnh của người gửi.
//   Người chưa comment tên tỉnh thì điểm quà được giữ lại, comment tên tỉnh lúc nào thì cộng lúc đó.
// - Bảng xếp hạng: điểm cao đứng trên; bằng điểm thì tỉnh đạt mức điểm đó trước đứng trên.
import { BY_ID, PROVINCES, findProvince } from './provinces.js';

const PLATE = new Map(PROVINCES.map((p) => [p.id, p.plates[0]]));
const LIKE_GAP_MS = 250;
const MAX_PENDING = 5000;

const fresh = () => ({ people: 0, gift: 0, score: 0, at: 0 });

export class Race {
  constructor(config, { emit = () => {}, now = Date.now } = {}) {
    this.config = config;
    this.emit = emit;
    this.now = now;
    this.commentPoints = config.commentPoints ?? 1;
    this.pointsPerCoin = config.pointsPerCoin ?? 1;
    this.gifts = (config.gifts ?? []).map((gift) => ({ ...gift, keys: new Set((gift.names ?? []).map((name) => String(name).trim().toLowerCase())) }));
    this.stateDirty = false;
    this.lastAt = 0;
    this.clear();
  }

  clear() {
    this.startedAt = this.now();
    this.tally = new Map(PROVINCES.map((p) => [p.id, fresh()]));
    this.members = new Map(); // id người xem -> id tỉnh
    this.pending = new Map(); // id người xem -> { points, name, at }: quà gửi trước khi chọn tỉnh
    this.likeAt = new Map();
    this.leader = null;
    this.giftTotal = 0;
  }

  reset() {
    this.clear();
    this.stateDirty = true;
    this.emit({ type: 'reset', race: this.snapshot() });
  }

  // ---------- Xếp hạng ----------
  ranking() {
    return [...this.tally]
      .filter(([, t]) => t.score > 0)
      .sort(([a, x], [b, y]) => y.score - x.score || x.at - y.at || PLATE.get(a) - PLATE.get(b))
      .map(([id, t]) => ({ id, ...t }));
  }

  rankOf(id) {
    return this.ranking().findIndex((row) => row.id === id) + 1;
  }

  stateOf(id) {
    const { people, gift, score, at } = this.tally.get(id);
    return { people, gift, score, at };
  }

  add(id, { people = 0, gift = 0 }) {
    const t = this.tally.get(id);
    t.people += people;
    t.gift += gift;
    t.score += people * this.commentPoints + gift;
    // TikTok gửi nhiều tin trong cùng một gói, xử lý trong cùng một mili giây. Mốc thời gian phải tăng dần,
    // để hai tỉnh bằng điểm vẫn xếp đúng ai tới trước, không rơi xuống so biển số.
    this.lastAt = Math.max(this.now(), this.lastAt + 0.001);
    t.at = this.lastAt;
    this.giftTotal += gift;
    this.stateDirty = true;
  }

  checkLeader() {
    const id = this.ranking()[0]?.id ?? null;
    if (id === this.leader) return;
    const previous = this.leader;
    this.leader = id;
    if (id) this.emit({ type: 'lead', province: id, previous });
  }

  // ---------- Người xem ----------
  provinceOf(userId) {
    return this.members.get(userId) ?? null;
  }

  // Trả về tỉnh vừa được tính, hoặc null nếu comment không có tên tỉnh hay người này đã được tính rồi.
  comment(who, text) {
    if (this.members.has(who.id)) return null;
    const province = findProvince(text);
    if (!province) return null;
    const held = this.pending.get(who.id)?.points ?? 0;
    this.pending.delete(who.id);
    this.members.set(who.id, province.id);
    this.add(province.id, { people: 1, gift: held });
    this.emit({
      type: 'join',
      province: province.id,
      userId: who.id,
      name: who.name,
      avatar: who.avatar ?? '',
      points: this.commentPoints + held,
      held,
      members: this.members.size,
      ...this.stateOf(province.id),
    });
    this.checkLeader();
    return province;
  }

  giftInfo(gift) {
    const name = String(gift.name ?? '').trim().toLowerCase();
    const coins = Math.max(0, Number(gift.coins) || 0);
    const known = (name && this.gifts.find((g) => g.keys.has(name))) || this.gifts.find((g) => g.coins === coins && !name);
    const points = known ? known.points : Math.round(coins * this.pointsPerCoin);
    return { points, icon: known?.icon ?? '', label: known?.label ?? gift.name ?? '' };
  }

  // count: số quà mới (combo đã được tính phần tăng thêm ở server).
  gift(who, gift, count = 1) {
    const info = this.giftInfo(gift);
    const points = info.points * Math.max(1, Math.trunc(count));
    if (points <= 0) return null;
    const base = { userId: who.id, name: who.name, avatar: who.avatar ?? '', points, count, icon: info.icon, label: info.label };
    const id = this.members.get(who.id);
    if (!id) {
      const held = this.pending.get(who.id) ?? { points: 0, name: who.name, at: 0 };
      held.points += points;
      held.at = this.now();
      this.pending.delete(who.id);
      this.pending.set(who.id, held);
      if (this.pending.size > MAX_PENDING) this.pending.delete(this.pending.keys().next().value);
      this.stateDirty = true;
      this.emit({ type: 'pending', ...base, held: held.points });
      return { pending: true, points };
    }
    this.add(id, { gift: points });
    this.emit({ type: 'gift', province: id, ...base, ...this.stateOf(id) });
    this.checkLeader();
    return { province: id, points };
  }

  // Thả tim chỉ làm sinh động bản đồ (tim bay lên ở tỉnh của người đó), không cộng điểm.
  like(who, count = 1) {
    const id = this.members.get(who.id);
    if (!id) return;
    const t = this.now();
    if (t - (this.likeAt.get(id) ?? -Infinity) < LIKE_GAP_MS) return;
    this.likeAt.set(id, t);
    this.emit({ type: 'like', province: id, n: Math.min(3, Math.max(1, Math.trunc(count))) });
  }

  // ---------- Trạng thái ----------
  snapshot() {
    return {
      startedAt: this.startedAt,
      members: this.members.size,
      giftTotal: this.giftTotal,
      pending: this.pending.size,
      leader: this.leader,
      tally: this.ranking(),
    };
  }

  exportState() {
    return {
      v: 1,
      startedAt: this.startedAt,
      tally: this.ranking(),
      members: [...this.members],
      pending: [...this.pending],
      giftTotal: this.giftTotal,
    };
  }

  importState(state) {
    if (state?.v !== 1) return;
    this.clear();
    this.startedAt = Number(state.startedAt) || this.now();
    for (const row of state.tally ?? []) {
      if (!this.tally.has(row.id)) continue;
      this.tally.set(row.id, { people: row.people | 0, gift: row.gift | 0, score: row.score | 0, at: Number(row.at) || 0 });
    }
    for (const [userId, id] of state.members ?? []) if (BY_ID.has(id)) this.members.set(userId, id);
    for (const [userId, held] of state.pending ?? []) if (held?.points > 0) this.pending.set(userId, { points: held.points | 0, name: String(held.name ?? ''), at: Number(held.at) || 0 });
    this.giftTotal = state.giftTotal | 0;
    this.lastAt = Math.max(this.lastAt, ...[...this.tally.values()].map((t) => t.at));
    this.leader = this.ranking()[0]?.id ?? null;
  }
}
