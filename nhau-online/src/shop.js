// Luật chơi Quán Cô Ba: chỉ chứa trạng thái và quy tắc, không biết gì về TikTok hay trình duyệt.
// Thời gian và số ngẫu nhiên được truyền vào để kiểm thử được.
import { TABLES, AISLE_X, runnerPath, pathLength, homeRideDelay, table as tableById } from '../public/layout.js';
import { line, numberWord } from './lines.js';

// "Vào Quán!" -> "vao quan", để so lệnh có dấu hay không dấu đều được.
export const normalize = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// "vào bàn 3", "Vào bàn số 3", "vao ban: 3" -> 3; vẫn nhận các lệnh đổi bàn cũ.
export function tableCommand(text) {
  const match = /^(vao|doi|chuyen|qua|sang) ban (so )?(\d{1,2})$/.exec(normalize(text));
  return match ? Number(match[3]) : null;
}

export const isJoinCommand = (text) => /^(vao|vo)( (quan|nha|nhe|day|di|thoi|lien|nao|co ba))?$/.test(normalize(text));

// "dô", "Dô dô dô!", "dzô", "zô", "1 2 3 dô" -> góp một lượt cụng ly. ("vô" là lệnh vào quán nên không tính.)
export const isToastCommand = (text) => /^((mot|1) (hai|2) (ba|3) )?(do|dzo|zo|yo)( (do|dzo|zo|yo)){0,5}( (nao|di|thoi|luon|ne|ca quan))?$/.test(normalize(text));

// "về", "Về nha cô Ba", "đi về", "ve thoi" -> ra về.
export const isLeaveCommand = (text) => /^(di |xin phep )?ve( (thoi|nha|nhe|day|di|lien|ngu))?( co ba)?$/.test(normalize(text));

// Chỗ Dì Năm, vợ khách... đứng nói chuyện với một khách: sát mép trước bàn (hàng dưới cùng khỏi bị bảng hướng dẫn che).
// Khách ngồi sau bàn thì đứng ngay trước mặt (đầu chỉ che tới bụng khách); khách ngồi đầu bàn thì đứng lùi vào phía bàn.
const standNear = (tb, seat) => ({ x: seat.side === 'back' ? seat.x : seat.x + (seat.side === 'left' ? 80 : -80), y: tb.y + 70 });

const BIG_EVENTS = new Set(['b1g2', 'wheel', 'match']);
const AMBIENT = ['rain', 'cat', 'nearMiss', 'karaoke', 'vendor', 'wife', 'blackout'];
const WHEEL_SPIN_MS = 7000;
const MATCH_INTRO_MS = 7000;
const MATCH_OUTRO_MS = 6000;

// TikTok gửi combo dưới dạng nhiều bản cập nhật với tổng dồn; chỉ phần tăng thêm là quà mới.
export class GiftCounter {
  constructor() {
    this.streaks = new Map();
    this.seen = new Set();
  }

  count({ msgId, userId, giftId, groupId, repeatCount, repeatEnd, combo }) {
    if (msgId) {
      if (this.seen.has(msgId)) return 0;
      this.seen.add(msgId);
      if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value);
    }
    const repeat = Math.max(1, Number(repeatCount) || 1);
    if (!combo) return repeat;
    const key = `${userId}:${giftId}:${groupId}`;
    const previous = this.streaks.get(key) ?? 0;
    const count = repeat >= previous ? repeat - previous : repeat;
    if (repeatEnd) this.streaks.delete(key);
    else this.streaks.set(key, Math.max(previous, repeat));
    return count;
  }
}

export class Shop {
  constructor(config, { now = () => Date.now(), random = Math.random } = {}) {
    this.cfg = config;
    this.now = now;
    this.random = random;
    this.listeners = new Set();
    this.menu = new Map(config.menu.map((m) => [m.gift.toLowerCase(), m]));
    this.customers = new Map();
    this.seats = new Map();
    this.waitlist = [];
    this.orders = [];
    this.orderSeq = 0;
    this.runner = null;
    this.promo = null;
    this.stage = null;
    this.queue = [];
    this.ambient = { rain: null, cat: null, karaoke: null, crash: null, vendor: null, toast: null, wife: null, blackout: null, nearMiss: false };
    this.unmapped = [];
    this.likes = new Map();
    this.lastHint = 0;
    this.hinted = new Map();
    this.safeMode = false;
    this.stats = { served: 0, gifts: 0 };
    this.startShift(false);
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type, data = {}) {
    for (const listener of this.listeners) listener(type, data);
  }

  changed() {
    this.emit('changed');
  }

  say(who, key, values, delay = 0) {
    this.emit('say', { who, text: line(key, values, this.random), delay });
  }

  pick(list) {
    return list[Math.floor(this.random() * list.length)];
  }

  // ---------- Khách ----------

  freeSeats() {
    const free = [];
    for (const t of TABLES) {
      const used = t.seats.filter((_, i) => this.seats.has(`${t.id}-${i}`)).length;
      t.seats.forEach((_, i) => {
        if (!this.seats.has(`${t.id}-${i}`)) free.push({ table: t.id, index: i, used });
      });
    }
    return free;
  }

  // Ưu tiên bàn vắng nhất để quán trông đông đều, chọn ngẫu nhiên trong các ghế ngang nhau.
  chooseSeat(tableId) {
    const free = this.freeSeats();
    if (!free.length) return null;
    const wanted = free.filter((s) => s.table === tableId);
    if (wanted.length) {
      const seat = this.pick(wanted);
      return { table: seat.table, index: seat.index };
    }
    const least = Math.min(...free.map((s) => s.used));
    const best = free.filter((s) => s.used === least);
    const seat = this.pick(best);
    return { table: seat.table, index: seat.index };
  }

  seat(customer, seat) {
    customer.seat = seat;
    customer.seatedAt = this.now();
    this.seats.set(`${seat.table}-${seat.index}`, customer.id);
    // Vừa ngồi xuống là Tí tự bưng ly nước lã ra (đổi bàn thì ly nước đi theo khách).
    if (!customer.water.has && !customer.needsWater) {
      customer.needsWater = 'serve';
      customer.waterAskedAt = this.now();
    }
  }

  // Ly nước lã vơi dần mỗi waterSipMs một ngụm (4 ngụm một ly); uống cạn thì Tí tự mang ly mới.
  waterSipMs() {
    return ((this.cfg.water?.glassMinutes ?? 3) * 60_000) / 4;
  }

  // Trả về khách (đang ngồi hoặc đang chờ ghế). Mỗi ID tài khoản chỉ có một nhân vật.
  admit(who, { quiet = false, front = false, table } = {}) {
    const existing = this.customers.get(who.id);
    if (existing) {
      existing.name = who.name;
      if (who.avatar) existing.avatar = who.avatar;
      return existing;
    }
    const now = this.now();
    const customer = {
      id: who.id,
      name: who.name,
      avatar: who.avatar ?? '',
      seat: null,
      joinedAt: now,
      lastActive: now,
      water: { has: false, level: 0 },
      needsWater: null,
      waterAskedAt: 0,
      stacks: [],
      consume: {},
      beers: 0,
      drank: false,
      spent: 0,
      soberAt: 0,
      vomitAt: null,
      lastVomit: -Infinity,
      look: Math.floor(this.random() * 1e6),
    };
    this.customers.set(who.id, customer);
    const seat = this.chooseSeat(table);
    if (seat) {
      this.seat(customer, seat);
      this.emit('join', { id: customer.id, name: customer.name, table: seat.table, index: seat.index });
      if (!quiet) this.say('coba', 'welcome', { name: customer.name, table: numberWord(seat.table) });
    } else {
      if (front) this.waitlist.unshift(customer.id);
      else this.waitlist.push(customer.id);
      this.emit('wait', { id: customer.id, name: customer.name });
      if (!quiet) this.say('coba', 'full', { name: customer.name });
    }
    this.changed();
    return customer;
  }

  leave(customer, reason) {
    if (customer.seat) this.seats.delete(`${customer.seat.table}-${customer.seat.index}`);
    this.customers.delete(customer.id);
    this.waitlist = this.waitlist.filter((id) => id !== customer.id);
    this.emit('leave', { id: customer.id, name: customer.name, seat: customer.seat, look: customer.look, reason, drunk: reason === 'home' && customer.drank && !this.safeMode });
    this.changed();
  }

  // Khách gõ "về": ra đầu hẻm lấy xe. Đã từng uống sinh tố lúa mạch thì bị công an chặn, giữ xe (màn hình vẽ cảnh này).
  // Còn món đang làm hoặc đang bưng ra thì giữ lại cho nhận xong, không để mất quà.
  goHome(customer) {
    if (!customer.seat) {
      this.leave(customer, 'home');
      return { result: 'home-waiting' };
    }
    const cooking = this.orders.some((o) => o.customerId === customer.id) || Boolean(this.runner && !this.runner.delivered && this.runner.orders.some((o) => o.customerId === customer.id));
    if (cooking) {
      this.emit('notice', { id: customer.id, text: 'Món đang ra, nhận xong rồi về nha!' });
      return { result: 'home-pending' };
    }
    const drunk = customer.drank && !this.safeMode;
    const ride = homeRideDelay(customer.seat.table, customer.seat.index);
    this.leave(customer, 'home');
    this.say('coba', drunk ? 'byeDrunk' : 'bye', { name: customer.name });
    if (drunk) {
      // Ngoài đường đang có cảnh công an giữ xe thì hoãn vụ đụng xe cho khỏi chồng lên nhau.
      this.streetBusyUntil = Math.max(this.streetBusyUntil ?? 0, this.now() + ride + 16_000);
      // Khớp mốc cảnh trên màn hình: chú công an khuyên xong, dắt xe đi.
      this.say('chutu', 'caughtTu', {}, ride + 9600);
      this.say('coba', 'caughtBa', { name: customer.name }, ride + 11_200);
    }
    return { result: drunk ? 'home-drunk' : 'home' };
  }

  // Bình luận: "vào" khi chưa có nhân vật thì vào quán; bình luận khác của khách trong quán chỉ hiện bong bóng thoại
  // (nước lã Tí tự mang, không cần comment).
  comment(who, text) {
    const customer = this.customers.get(who.id);
    if (isToastCommand(text)) return this.toastVote(who, customer, text);
    const wanted = tableCommand(text);
    if (!customer) {
      // Người chưa vào quán gõ "vào bàn 3" thì cho vào thẳng bàn 3 (nếu còn ghế).
      if (isJoinCommand(text) || (wanted && this.validTable(wanted))) {
        const full = wanted != null && !this.freeSeats().some((s) => s.table === wanted);
        const joined = this.admit(who, { table: wanted ?? undefined, quiet: full });
        if (full) {
          this.emit('notice', { id: joined.id, text: `Bàn ${wanted} đã đầy rồi!` });
          if (joined.seat) this.say('coba', 'moveFullJoin', { name: joined.name, table: numberWord(wanted), seat: numberWord(joined.seat.table) });
          else this.say('coba', 'full', { name: joined.name });
        }
        return { result: full ? 'join-full' : 'join' };
      }
      this.hint(who);
      return { result: 'hint' };
    }
    customer.name = who.name;
    customer.lastActive = this.now();
    if (isLeaveCommand(text)) return this.goHome(customer);
    if (!customer.seat) return { result: 'waiting' };
    if (wanted != null) return this.changeTable(customer, wanted);
    this.emit('chat', { id: customer.id, text: this.cleanChat(text) });
    this.changed();
    return { result: 'chat' };
  }

  validTable(id) {
    return TABLES.some((t) => t.id === id);
  }

  // Đổi bàn: giữ nguyên món và đơn đang chờ (món đi theo khách), chỉ đổi chỗ ngồi.
  changeTable(customer, tableId) {
    const now = this.now();
    const values = { name: customer.name, table: numberWord(tableId), max: TABLES.length };
    if (!this.validTable(tableId)) {
      this.say('coba', 'moveBad', values);
      return { result: 'move-bad' };
    }
    if (customer.seat.table === tableId) {
      this.say('coba', 'moveSame', values);
      return { result: 'move-same' };
    }
    if (now - (customer.movedAt ?? 0) < 10_000) return { result: 'move-cooldown' };
    const free = this.freeSeats().filter((s) => s.table === tableId);
    if (!free.length) {
      // Báo ngay trên đầu khách để người gõ lệnh thấy liền, Cô Ba nói thêm ở bếp.
      this.emit('notice', { id: customer.id, text: `Bàn ${tableId} đã đầy rồi!` });
      this.say('coba', 'moveFull', values);
      return { result: 'move-full' };
    }
    const target = this.pick(free);
    const from = customer.seat;
    this.seats.delete(`${from.table}-${from.index}`);
    this.seat(customer, { table: target.table, index: target.index });
    customer.movedAt = now;
    if (this.ambient.cat?.id === customer.id) this.ambient.cat = null;
    this.emit('move', { id: customer.id, name: customer.name, from, to: customer.seat });
    this.say('coba', 'moveOk', values);
    this.changed();
    return { result: 'move', table: tableId };
  }

  hint(who) {
    const now = this.now();
    if (this.safeMode || now - this.lastHint < 15_000 || now - (this.hinted.get(who.id) ?? 0) < 120_000) return;
    this.lastHint = now;
    this.hinted.set(who.id, now);
    if (this.hinted.size > 500) this.hinted.delete(this.hinted.keys().next().value);
    this.say('coba', 'hint', { name: who.name });
  }

  cleanChat(text) {
    const max = this.cfg.chat?.maxLength ?? 40;
    let clean = String(text ?? '')
      .replace(/https?:\/\/\S+|www\.\S+/gi, '')
      .replace(/[\u0000-\u001f​-‏‪-‮]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const lower = clean.toLowerCase().normalize('NFC');
    const banned = (this.cfg.chat?.bannedWords ?? []).some((word) => {
      const escaped = word.toLowerCase().normalize('NFC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(lower);
    });
    if (banned || !clean) return '';
    const chars = Array.from(clean);
    if (chars.length > max) clean = `${chars.slice(0, max - 1).join('')}…`;
    return clean;
  }

  // ---------- Quà và đơn ----------

  menuEntry(giftName) {
    return this.menu.get(String(giftName ?? '').toLowerCase());
  }

  // Ưu đãi đang áp dụng cho một quà (chỉ một chương trình tại một thời điểm).
  offerFor(giftName) {
    const promo = this.promo;
    if (!promo || this.now() >= promo.endAt) return null;
    if (!promo.gifts.some((g) => g.toLowerCase() === String(giftName).toLowerCase())) return null;
    return promo;
  }

  describeOffer(entry, promo) {
    const item = this.cfg.items[entry.item];
    const base = entry.perGift;
    if (!promo) return { text: `${base} ${item.unit} ${item.name}`, base, bonus: 0, total: base };
    if (promo.effect === 'multiply') {
      const total = base * promo.multiplier;
      return { text: `${base} + ${total - base} tặng = ${total} ${item.unit} ${item.name}`, base, bonus: total - base, total };
    }
    if (promo.effect === 'side') return { text: `${base} ${item.unit} ${item.name} + 1 đĩa đậu phộng`, base, bonus: 0, total: base, side: 1 };
    if (promo.effect === 'large') return { text: `${base} ${item.unit} ${item.name} phần lớn`, base, bonus: 0, total: base, large: true };
    return { text: `${base} ${item.unit} ${item.name}`, base, bonus: 0, total: base };
  }

  gift(who, giftName, units, coins = 0) {
    units = Math.max(1, Math.trunc(units) || 1);
    const entry = this.menuEntry(giftName);
    this.stats.gifts += units;
    if (!entry) {
      const record = { at: this.now(), name: who.name, gift: giftName, units, coins };
      this.unmapped.unshift(record);
      this.unmapped.length = Math.min(this.unmapped.length, 20);
      this.emit('unmapped', record);
      const customer = this.customers.get(who.id);
      if (customer) customer.lastActive = this.now();
      if (!this.safeMode) this.say('coba', 'thanks', { name: who.name });
      return null;
    }
    let customer = this.customers.get(who.id);
    if (!customer) {
      if (!this.cfg.seating?.autoAdmitOnGift) {
        const record = { at: this.now(), name: who.name, gift: giftName, units, coins, reason: 'chưa vào quán' };
        this.unmapped.unshift(record);
        this.emit('unmapped', record);
        return null;
      }
      customer = this.admit(who, { front: true });
    }
    customer.lastActive = this.now();
    customer.spent += units;
    // Ưu đãi được chốt ngay lúc nhận quà; chờ phục vụ không làm đổi quyền lợi.
    return this.placeOrder(customer, entry, units, this.offerFor(entry.gift));
  }

  // Thả tim: cứ đủ likes.per tim (cộng dồn theo từng người) thì được likes.qty phần likes.item. Không áp ưu đãi.
  like(who, count) {
    const rule = this.cfg.likes;
    count = Math.max(0, Math.trunc(count) || 0);
    if (!rule?.per || !count || !this.cfg.items[rule.item]) return null;
    const before = this.likes.get(who.id) ?? 0;
    const after = before + count;
    this.likes.delete(who.id);
    this.likes.set(who.id, after);
    if (this.likes.size > 20_000) this.likes.delete(this.likes.keys().next().value);
    const units = Math.floor(after / rule.per) - Math.floor(before / rule.per);
    if (units <= 0) return null;
    let customer = this.customers.get(who.id);
    if (!customer) {
      if (!this.cfg.seating?.autoAdmitOnGift) return null;
      customer = this.admit(who, { front: true });
    }
    customer.lastActive = this.now();
    const entry = { gift: '__likes', label: `${rule.per} tim`, icon: rule.icon ?? '/gifts/heart.svg', item: rule.item, perGift: rule.qty ?? 1 };
    return this.placeOrder(customer, entry, units, null);
  }

  placeOrder(customer, entry, units, promo) {
    const offer = this.describeOffer(entry, promo);
    const order = {
      id: ++this.orderSeq,
      customerId: customer.id,
      name: customer.name,
      gift: entry.gift,
      giftLabel: entry.label,
      icon: entry.icon,
      units,
      item: entry.item,
      base: units * offer.base,
      bonus: units * offer.bonus,
      qty: units * offer.total,
      side: units * (offer.side ?? 0),
      large: Boolean(offer.large),
      big: Boolean(entry.big),
      promo: promo ? { kind: promo.kind, label: promo.short } : null,
      receivedAt: this.now(),
    };
    this.orders.push(order);
    const item = this.cfg.items[order.item];
    const table = customer.seat ? numberWord(customer.seat.table) : 'chờ';
    this.emit('order', { ...order, table: customer.seat?.table ?? null, unit: item.unit, itemName: item.name });
    const values = { qty: numberWord(order.qty), unit: item.unit, item: item.name, name: customer.name, table, bonus: numberWord(offer.bonus), gift: entry.label };
    // Tí đáp sau khi khách gọi xong (giọng khách dài khoảng 1,5 giây).
    const reply = 1600;
    if (order.big) this.say('ti', 'orderBig', values, reply);
    else if (promo?.effect === 'multiply' && units === 1 && entry.perGift === 1) {
      if (this.random() < 0.5) this.say('ti', 'orderPromoTi', values, reply);
      else this.say('coba', 'orderPromoCoBa', values);
    }
    else if (order.side) this.say('coba', 'orderSide', values);
    else if (order.large) this.say('coba', 'orderLarge', values);
    else this.say('ti', 'order', values, reply);
    this.changed();
    return order;
  }

  // ---------- Tí chạy bàn ----------

  pendingByTable() {
    const tables = new Map();
    const add = (customer, at) => {
      if (!customer?.seat) return;
      const entry = tables.get(customer.seat.table) ?? { table: customer.seat.table, oldest: Infinity };
      entry.oldest = Math.min(entry.oldest, at);
      tables.set(customer.seat.table, entry);
    };
    for (const order of this.orders) add(this.customers.get(order.customerId), order.receivedAt);
    for (const customer of this.customers.values()) if (customer.needsWater) add(customer, customer.waterAskedAt);
    return [...tables.values()].sort((a, b) => a.oldest - b.oldest);
  }

  dispatch(now) {
    const next = this.pendingByTable()[0];
    if (!next) return;
    const tableCustomers = [...this.customers.values()].filter((c) => c.seat?.table === next.table);
    const ids = new Set(tableCustomers.map((c) => c.id));
    const orders = this.orders.filter((o) => ids.has(o.customerId));
    const waters = tableCustomers.filter((c) => c.needsWater).map((c) => ({ id: c.id, kind: c.needsWater }));
    this.orders = this.orders.filter((o) => !ids.has(o.customerId));
    for (const c of tableCustomers) c.needsWater = null;

    let detour = null;
    if (this.ambient.nearMiss) {
      this.ambient.nearMiss = false;
      const others = TABLES.filter((t) => t.id !== next.table);
      detour = this.pick(others).id;
    }
    const points = runnerPath(next.table, detour);
    const busy = this.pendingByTable().length >= 2 || Boolean(this.promo);
    const speed = busy ? 620 : 480;
    const out = (pathLength(points) / speed) * 1000 + (detour ? 900 : 0);
    const dwell = 900;
    const big = orders.some((o) => o.big);
    this.runner = {
      table: next.table,
      startAt: now,
      arriveAt: now + out,
      endAt: now + out + dwell + (pathLength(points) / speed) * 1000,
      points,
      detour,
      speed,
      big,
      tray: orders.reduce((n, o) => n + o.qty + o.side, 0) + waters.length,
      items: orders.map((o) => ({ item: o.item, qty: o.qty, large: o.large })),
      orders,
      waters,
      delivered: false,
    };
    if (detour) this.emit('nearMiss', { table: next.table, detour });
    if (big) this.emit('bigTray', { table: next.table });
    this.changed();
  }

  deliver(now) {
    const trip = this.runner;
    trip.delivered = true;
    const servedIds = new Set();
    const handed = [];
    for (const order of trip.orders) {
      const customer = this.customers.get(order.customerId);
      if (!customer) continue;
      this.addStack(customer, order.item, order.qty, order.large, now);
      if (order.item === 'beer') this.drink(customer, order.qty, now);
      if (order.side) this.addStack(customer, 'peanut', order.side, false, now);
      handed.push({ id: customer.id, item: order.item, qty: order.qty, side: order.side, large: order.large });
      this.stats.served += order.qty + order.side;
      servedIds.add(customer.id);
    }
    for (const water of trip.waters) {
      const customer = this.customers.get(water.id);
      if (!customer) continue;
      customer.water = { has: true, level: 1, nextSip: now + this.waterSipMs() };
      servedIds.add(customer.id);
    }
    if (trip.waters.length && !trip.orders.length) {
      const first = this.customers.get(trip.waters[0].id);
      // Tí tự châm nước liên tục nên chỉ thỉnh thoảng mới nói, cho đỡ ồn.
      if (first && this.random() < 0.2) {
        if (this.random() < 0.6) this.say('ti', 'waterTi', { name: first.name });
        else this.say('coba', 'waterCoBa', {});
      }
    }
    if (trip.detour) this.say('ti', 'nearMiss', { table: numberWord(trip.table) });
    this.emit('delivered', { table: trip.table, ids: [...servedIds], handed, items: trip.items, waters: trip.waters.map((w) => w.id), big: trip.big });
    this.changed();
  }

  addStack(customer, item, qty, large, now) {
    if (qty <= 0) return;
    const stack = customer.stacks.find((s) => s.item === item && s.large === large);
    if (stack) stack.qty += qty;
    else customer.stacks.push({ item, qty, large });
    if (!customer.consume[item]) customer.consume[item] = now + this.consumeMs(item, large);
  }

  // Mỗi cốc sinh tố lúa mạch làm mặt đỏ thêm; uống tới cốc thứ vomitAtCup (và mỗi vomitAtCup cốc sau đó) thì nôn,
  // cô lao công chạy tới dọn. Để lâu không uống thì tỉnh dần (mỗi soberMinutes bớt một cốc).
  drunkCfg() {
    return { vomitAtCup: 2, vomitDelaySeconds: 4, cooldownSeconds: 30, soberMinutes: 3, ...this.cfg.drunk };
  }

  drink(customer, cups, now) {
    const cfg = this.drunkCfg();
    const before = customer.beers;
    customer.beers += cups;
    customer.drank = true;
    customer.soberAt = now + cfg.soberMinutes * 60_000;
    const every = Math.max(1, cfg.vomitAtCup);
    const crossed = Math.floor(before / every) < Math.floor(customer.beers / every);
    if (crossed && customer.vomitAt == null && !this.safeMode && now - customer.lastVomit >= cfg.cooldownSeconds * 1000) {
      customer.vomitAt = now + cfg.vomitDelaySeconds * 1000;
    }
  }

  drunkTick(now) {
    let changed = false;
    const soberMs = this.drunkCfg().soberMinutes * 60_000;
    for (const customer of this.customers.values()) {
      if (customer.vomitAt != null && now >= customer.vomitAt) {
        customer.vomitAt = null;
        if (customer.seat && !this.safeMode) {
          customer.lastVomit = now;
          this.emit('vomit', { id: customer.id, name: customer.name, table: customer.seat.table, index: customer.seat.index, beers: customer.beers });
        }
      }
      if (customer.beers > 0 && now >= customer.soberAt) {
        customer.beers--;
        customer.soberAt = now + soberMs;
        changed = true;
      }
    }
    return changed;
  }

  consumeMs(item, large) {
    return (this.cfg.items[item]?.consumeSeconds ?? 180) * 1000 * (large ? 1.6 : 1);
  }

  // Món được thưởng thức dần: mỗi loại món hết một phần sau một khoảng thời gian.
  consumeTick(now) {
    let changed = false;
    for (const customer of this.customers.values()) {
      for (const [item, at] of Object.entries(customer.consume)) {
        if (now < at) continue;
        const stack = customer.stacks.find((s) => s.item === item);
        if (!stack) {
          delete customer.consume[item];
          continue;
        }
        stack.qty--;
        if (stack.qty <= 0) customer.stacks.splice(customer.stacks.indexOf(stack), 1);
        const next = customer.stacks.find((s) => s.item === item);
        if (next) customer.consume[item] = now + this.consumeMs(item, next.large);
        else delete customer.consume[item];
        changed = true;
      }
      const water = customer.water;
      if (water.has && customer.seat && !customer.needsWater && water.level > 0 && now >= (water.nextSip ?? 0)) {
        water.level = Math.max(0, Math.round((water.level - 0.25) * 100) / 100);
        water.nextSip = now + this.waterSipMs();
        this.emit('sip', { id: customer.id });
        if (water.level <= 0) {
          customer.needsWater = 'refill';
          customer.waterAskedAt = now;
        }
        changed = true;
      }
    }
    return changed;
  }

  hasPending(customer) {
    return Boolean(customer.needsWater) || this.orders.some((o) => o.customerId === customer.id) || Boolean(this.runner?.orders.some((o) => o.customerId === customer.id) && !this.runner.delivered);
  }

  // Khách tự về khi im lặng lâu và bàn đã trống món; món đã nhận không bao giờ bị lấy đi.
  seatingTick(now) {
    const idleMs = (this.cfg.seating?.idleLeaveMinutes ?? 20) * 60_000;
    const roomMs = (this.cfg.seating?.makeRoomIdleMinutes ?? 5) * 60_000;
    for (const customer of [...this.customers.values()]) {
      if (!customer.seat || customer.stacks.length || this.hasPending(customer)) continue;
      const idle = now - customer.lastActive;
      if (idle >= idleMs || (this.waitlist.length && idle >= roomMs && this.freeSeats().length === 0)) this.leave(customer, 'idle');
    }
    while (this.waitlist.length) {
      const seat = this.chooseSeat();
      if (!seat) break;
      const customer = this.customers.get(this.waitlist.shift());
      if (!customer) continue;
      this.seat(customer, seat);
      customer.lastActive = now;
      this.emit('join', { id: customer.id, name: customer.name, table: seat.table, index: seat.index });
      this.say('coba', 'welcomeBack', { name: customer.name, table: numberWord(seat.table) });
      this.changed();
    }
  }

  // ---------- Sự kiện ----------

  startShift(announce = true) {
    const now = this.now();
    const shift = this.cfg.shift ?? {};
    this.shift = {
      startAt: now,
      minutes: shift.minutes ?? 20,
      plan: (shift.schedule ?? []).map((entry) => {
        const at = Array.isArray(entry.at) ? entry.at[0] + this.random() * (entry.at[1] - entry.at[0]) : entry.at;
        return { event: entry.event, at: now + at * 60_000, fired: false };
      }),
    };
    this.nextChatter = now + this.chatterGap();
    this.nextCrash ??= now + this.crashGap();
    this.nextVendor ??= now + this.vendorGap();
    this.nextToast ??= now + (this.cfg.toast?.promptEveryMinutes ?? 4) * 60_000;
    this.nextWife ??= now + this.minutesGap(this.cfg.wife?.everyMinutes ?? 6);
    this.nextBlackout ??= now + this.minutesGap(this.cfg.blackout?.everyMinutes ?? 9);
    if (announce && !this.safeMode) this.say('coba', 'open');
    this.emit('shift', { startAt: now });
  }

  crashGap() {
    return Math.max(this.cfg.crash?.everySeconds ?? 30, (this.cfg.crash?.seconds ?? 24) + 3) * 1000;
  }

  // Khoảng cách ngẫu nhiên quanh một số phút (±20%) để sự kiện không đều đều như đồng hồ.
  minutesGap(minutes) {
    return minutes * 60_000 * (0.8 + this.random() * 0.4);
  }

  seated() {
    return [...this.customers.values()].filter((c) => c.seat);
  }

  // ---------- Một, hai, ba, dô! ----------
  // Ai comment "dô" (kể cả người chưa vào quán) cũng góp một lượt; đủ số lượt trong thời hạn thì cả quán cụng ly.

  toastCfg() {
    return { need: 10, seconds: 30, cooldownSeconds: 45, ...this.cfg.toast };
  }

  startToast(now) {
    const cfg = this.toastCfg();
    this.ambient.toast = { phase: 'open', startAt: now, endAt: now + cfg.seconds * 1000, need: Math.max(1, cfg.need), count: 0, names: [], by: new Map() };
    this.say('coba', 'toastOpen', { need: numberWord(cfg.need), seconds: cfg.seconds });
    this.changed();
  }

  toastVote(who, customer, text) {
    const now = this.now();
    if (customer) {
      customer.name = who.name;
      customer.lastActive = now;
      if (customer.seat) this.emit('chat', { id: customer.id, text: this.cleanChat(text) });
    }
    let round = this.ambient.toast;
    if (round?.phase === 'done') return { result: 'toast-done' };
    if (!round) {
      if (now < (this.toastCooldownUntil ?? 0)) return { result: 'toast-cooldown' };
      this.startToast(now);
      round = this.ambient.toast;
    }
    // Một người gõ dồn dập chỉ tính mỗi 1,5 giây một lượt.
    if (now - (round.by.get(who.id) ?? 0) < 1500) return { result: 'toast-wait' };
    round.by.set(who.id, now);
    round.count++;
    round.names = [who.name, ...round.names.filter((n) => n !== who.name)].slice(0, 4);
    if (round.count >= round.need) {
      round.phase = 'done';
      round.doneAt = now;
      round.endAt = now + 6500;
      this.emit('toast', { count: round.count, people: round.by.size });
      this.say('coba', 'toastDone', {}, 4200);
    }
    this.changed();
    return { result: round.phase === 'done' ? 'toast-cheers' : 'toast', count: round.count, need: round.need };
  }

  toastTick(now) {
    const round = this.ambient.toast;
    if (!round || now < round.endAt) return;
    if (round.phase === 'open') this.say('coba', 'toastFail', { count: round.count });
    this.ambient.toast = null;
    this.toastCooldownUntil = now + this.toastCfg().cooldownSeconds * 1000;
    this.changed();
  }

  // ---------- Vợ tới kiếm ----------
  // Chọn một khách đang ngồi mà trên bàn không còn món và không có món đang chờ (bị lôi về không mất quà),
  // ưu tiên người đã uống. Vợ xông vào réo, khách năn nỉ;
  // tùy may rủi: được "ly cuối" hoặc bị xách tai lôi về (khách rời quán, gõ "vào" để quay lại).

  startWife(now) {
    const pool = this.seated().filter((c) => !c.stacks.length && !this.hasPending(c));
    if (!pool.length) return 'empty';
    const drinkers = pool.filter((c) => c.drank);
    const target = this.pick(drinkers.length ? drinkers : pool);
    const tb = tableById(target.seat.table);
    const seat = tb.seats[target.seat.index];
    const stand = standNear(tb, seat);
    let t = now + 1500;
    let pos = { x: AISLE_X, y: 1700 };
    const frames = [{ t, ...pos }];
    const go = (pt, speed) => {
      const d = Math.hypot(pt.x - pos.x, pt.y - pos.y);
      if (d < 1) return;
      t += (d / speed) * 1000;
      pos = { x: pt.x, y: pt.y };
      frames.push({ t, ...pos });
    };
    go({ x: AISLE_X, y: stand.y }, 330);
    go(stand, 330);
    const arriveAt = t;
    t += 6800;
    frames.push({ t, ...pos });
    go({ x: AISLE_X, y: stand.y }, 190);
    go({ x: AISLE_X, y: 1700 }, 190);
    const spare = this.random() < (this.cfg.wife?.spareChance ?? 0.35);
    const values = { name: target.name };
    this.ambient.wife = {
      startAt: now,
      endAt: t,
      frames,
      arriveAt,
      dragAt: arriveAt + 6600,
      id: target.id,
      name: target.name,
      table: target.seat.table,
      index: target.seat.index,
      look: target.look,
      spare,
      dragged: false,
      scold: line('wifeScold', values, this.random),
      plead: line(target.drank ? 'wifePlead' : 'wifePleadSober', values, this.random),
      verdict: line(spare ? 'wifeSpare' : 'wifeDrag', values, this.random),
    };
    this.say('coba', 'wifeBa', values, 400);
    if (!spare) this.say('chutu', 'wifeTu', values, arriveAt - now + 9000);
    this.emit('wife', { name: target.name, spare });
    return 'started';
  }

  wifeTick(now) {
    const w = this.ambient.wife;
    if (!w || w.spare || w.dragged || w.missed || w.saved || now < w.dragAt) return;
    const c = this.customers.get(w.id);
    // Khách đã tự về hoặc đổi bàn trước khi bị lôi: vợ đi về một mình.
    // Khách kịp gọi món trong lúc bị réo thì cũng thoát, để không mất món vừa tặng quà.
    if (c?.seat && (c.stacks.length || this.hasPending(c))) w.saved = true;
    else if (c?.seat && c.seat.table === w.table && c.seat.index === w.index) {
      w.dragged = true;
      this.leave(c, 'wife');
    } else w.missed = true;
    this.changed();
  }

  vendorCfg() {
    return { everySeconds: 150, maxTables: 4, products: [{ name: 'hột vịt lộn', unit: 'quả', color: '#efe6d2' }], ...this.cfg.vendor };
  }

  vendorGap() {
    return Math.max(30, this.vendorCfg().everySeconds) * 1000;
  }

  // Khách mua hay không tùy người: đang ngà ngà thì rộng rãi, khách tặng quà nhiều thì sộp, bàn đầy món thì kêu no.
  vendorDecision(customer, values) {
    const food = customer.stacks.filter((s) => s.item !== 'beer').reduce((n, s) => n + s.qty, 0);
    const full = food >= 3;
    let chance = 0.35;
    if (customer.beers > 0) chance += 0.25;
    if (customer.spent >= 3) chance += 0.2;
    if (full) chance -= 0.25;
    if (this.random() >= chance) return { buy: false, qty: 0, reply: line(full ? 'buyerNoFull' : 'buyerNo', values, this.random) };
    const drunk = customer.beers >= 2;
    const big = !drunk && customer.spent >= 5;
    const qty = big ? 4 : drunk ? 3 : 1 + Math.floor(this.random() * 2);
    const key = big ? 'buyerYesBig' : drunk ? 'buyerYesDrunk' : 'buyerYes';
    return { buy: true, qty, reply: line(key, { ...values, qty: numberWord(qty) }, this.random) };
  }

  // Dì Năm gánh hàng rong vào quán, ghé lần lượt các bàn có khách (bàn gần cửa trước), mỗi bàn hỏi một người.
  // Lộ trình tính sẵn thành các mốc (thời gian, vị trí) để màn hình vẽ đúng, kể cả khi mở giữa chừng.
  startVendor(now) {
    const cfg = this.vendorCfg();
    const byTable = new Map();
    for (const c of this.customers.values()) {
      if (!c.seat) continue;
      if (!byTable.has(c.seat.table)) byTable.set(c.seat.table, []);
      byTable.get(c.seat.table).push(c);
    }
    if (!byTable.size) return 'empty';
    const tables = [...byTable.keys()].sort((a, b) => tableById(b).y - tableById(a).y || a - b).slice(0, Math.max(1, cfg.maxTables));
    const product = this.pick(cfg.products);
    const values = { item: product.name, unit: product.unit };
    const SPEED = 230;
    const ASK_MS = 5400;
    let t = now + 2200;
    let pos = { x: AISLE_X, y: 1700 };
    const frames = [{ t, ...pos }];
    const go = (pt) => {
      const d = Math.hypot(pt.x - pos.x, pt.y - pos.y);
      if (d < 1) return;
      t += (d / SPEED) * 1000;
      pos = { x: pt.x, y: pt.y };
      frames.push({ t, ...pos });
    };
    const stops = [];
    for (const id of tables) {
      const tb = tableById(id);
      const customer = this.pick(byTable.get(id));
      const seat = tb.seats[customer.seat.index];
      const stand = standNear(tb, seat);
      go({ x: AISLE_X, y: pos.y });
      go({ x: AISLE_X, y: stand.y });
      go(stand);
      const at = t;
      t += ASK_MS;
      frames.push({ t, ...pos });
      const values2 = { ...values, name: customer.name };
      const decision = this.vendorDecision(customer, values2);
      stops.push({
        table: id,
        index: customer.seat.index,
        id: customer.id,
        name: customer.name,
        at,
        ask: line('vendorAsk', values2, this.random),
        ...decision,
        after: line(decision.buy ? 'vendorThanks' : 'vendorOk', values2, this.random),
      });
    }
    go({ x: AISLE_X, y: pos.y });
    go({ x: AISLE_X, y: 1700 });
    this.ambient.vendor = { startAt: now, endAt: t, frames, stops, product, call: line('vendorCall', values, this.random) };
    this.nextVendor = t + this.vendorGap();
    this.say('coba', 'vendorBa', values, 2600);
    this.emit('vendor', { item: product.name, unit: product.unit, stops: stops.map(({ name, buy, qty }) => ({ name, buy, qty })) });
    return 'started';
  }

  chatterGap() {
    const [min, max] = this.cfg.shift?.chatterEveryMinutes ?? [2, 4];
    return (min + this.random() * (max - min)) * 60_000;
  }

  // Sự kiện lớn: chỉ một cái chạy tại một thời điểm, cái sau xếp hàng chờ.
  trigger(kind, options = {}) {
    if (BIG_EVENTS.has(kind)) {
      if (this.stage || this.promo) {
        if (!this.queue.includes(kind)) this.queue.push(kind);
        this.emit('queued', { kind, queue: [...this.queue] });
        this.changed();
        return 'queued';
      }
      if (kind === 'b1g2') this.startPromo('b1g2', this.cfg.promos.b1g2.gifts, this.cfg.promos.b1g2.seconds, { open: 'b1g2Open' });
      if (kind === 'wheel') this.startWheel(options);
      if (kind === 'match') this.startMatch(options);
      return 'started';
    }
    if (kind === 'ambient') return this.trigger(this.pick(AMBIENT));
    const now = this.now();
    if (kind === 'rain') {
      this.ambient.rain = { startAt: now, endAt: now + 45_000 };
      this.say('ti', 'rainTi');
      this.say('coba', 'rainBa', {}, 1800);
    } else if (kind === 'cat') {
      const seated = [...this.customers.values()].filter((c) => c.seat);
      const target = seated.length ? this.pick(seated) : null;
      const t = target ? target.seat.table : this.pick(TABLES).id;
      this.ambient.cat = { startAt: now, endAt: now + 30_000, table: t, index: target?.seat.index ?? 0, id: target?.id ?? null };
      this.say('coba', 'cat', { name: target?.name ?? 'khách', table: numberWord(t) });
    } else if (kind === 'toast') {
      if (this.ambient.toast) return 'busy';
      this.startToast(now);
    } else if (kind === 'wife') {
      if (this.ambient.wife) return 'busy';
      const result = this.startWife(now);
      if (result !== 'started') return result;
    } else if (kind === 'blackout') {
      // Cúp điện: cả quán tối om, Tí soi đèn pin, Cô Ba thắp đèn cầy, rồi có điện lại. Không cúp giữa trận bóng.
      if (this.ambient.blackout) return 'busy';
      if (this.stage?.kind === 'match' && this.stage.phase !== 'promo') return 'busy';
      const seconds = Math.max(8, this.cfg.blackout?.seconds ?? 14);
      this.ambient.blackout = { startAt: now, endAt: now + seconds * 1000 };
      this.say('ti', 'blackoutTi', {}, 700);
      this.say('coba', 'blackoutBa', {}, 2300);
      if (this.random() < 0.6) this.say('chutu', 'blackoutTu', {}, 4300);
      this.say('coba', 'blackoutEnd', {}, seconds * 1000 + 300);
    } else if (kind === 'vendor') {
      if (this.ambient.vendor) return 'busy';
      const result = this.startVendor(now);
      if (result !== 'started') return result;
    } else if (kind === 'nearMiss') {
      this.ambient.nearMiss = true;
    } else if (kind === 'crash') {
      // Hai xe đụng nhẹ ngoài đường, cả quán hóng, công an tới giải quyết rồi ai đi đường nấy.
      if (this.ambient.crash) return 'busy';
      if (now < (this.streetBusyUntil ?? 0)) {
        this.nextCrash = Math.max(this.nextCrash, this.streetBusyUntil + 3000);
        return 'busy';
      }
      const seconds = this.cfg.crash?.seconds ?? 24;
      this.ambient.crash = { startAt: now, endAt: now + seconds * 1000, x: 380 + Math.floor(this.random() * 320), seed: Math.floor(this.random() * 1e6) };
      this.nextCrash = now + this.crashGap();
      this.say('coba', 'crashBa', {}, 2300);
      this.say('chutu', 'crashTu', {}, 3200);
      if (this.random() < 0.5) this.say('ti', 'crashTi', {}, 4600);
      this.say('coba', 'policeBa', {}, 8600);
      if (this.random() < 0.5) this.say('chutu', 'policeTu', {}, 15_500);
      this.say('coba', 'crashEndBa', {}, seconds * 1000 - 3000);
    } else if (kind === 'karaoke') {
      this.ambient.karaoke = { startAt: now, endAt: now + 16_000 };
      this.say('coba', 'karaoke');
    } else if (kind === 'chatter') {
      this.say('chutu', 'chatter');
      if (this.random() < 0.4) this.say('coba', 'chatterBa', {}, 2500);
    } else if (kind === 'closing') {
      this.say('coba', 'closing');
    } else if (kind === 'open') {
      this.say('coba', 'open');
    } else return 'unknown';
    this.changed();
    return 'started';
  }

  startPromo(kind, gifts, seconds, { open, effect = 'multiply', multiplier, label, short, source } = {}) {
    const now = this.now();
    const multipliers = { b1g2: 3, b1g3: 4, double: 2 };
    const labels = {
      b1g2: ['CÔ BA CHƠI LỚN', 'MUA 1 TẶNG 2'],
      b1g3: ['BÓNG LĂN, QUÁN CÓ LỘC', 'MUA 1 TẶNG 3'],
    };
    this.promo = {
      kind,
      effect,
      multiplier: multiplier ?? multipliers[kind] ?? 1,
      gifts: [...gifts],
      title: label ?? labels[kind]?.[0] ?? '',
      short: short ?? labels[kind]?.[1] ?? '',
      source: source ?? kind,
      startAt: now,
      endAt: now + seconds * 1000,
    };
    if (!this.stage) this.stage = { kind, phase: 'promo' };
    else this.stage.phase = 'promo';
    if (open) this.say('coba', open);
    this.emit('promo', { ...this.promo });
    this.changed();
  }

  startWheel({ slot } = {}) {
    const now = this.now();
    const slots = this.cfg.wheel.slots;
    let index = Number.isInteger(slot) && slots[slot] ? slot : -1;
    if (index < 0) {
      const total = slots.reduce((n, s) => n + s.weight, 0);
      let roll = this.random() * total;
      index = slots.findIndex((s) => (roll -= s.weight) < 0);
      if (index < 0) index = slots.length - 1;
    }
    const gift = this.pick(this.cfg.wheel.gifts);
    this.stage = { kind: 'wheel', phase: 'spin', startAt: now, spinEnd: now + WHEEL_SPIN_MS, result: index, gift, slots: slots.map((s) => s.effect) };
    this.say('coba', 'wheelOpen');
    this.emit('wheel', { ...this.stage });
    this.changed();
  }

  finishWheel() {
    const { result, gift } = this.stage;
    const effect = this.cfg.wheel.slots[result].effect;
    const entry = this.menuEntry(gift);
    const names = { double: 'GẤP ĐÔI MÓN', side: 'CÓ ĐỒ NHẮM KÈM', large: 'PHẦN LỚN CÔ MỜI', b1g2: 'MUA 1 TẶNG 2', b1g3: 'MUA 1 TẶNG 3' };
    const spec = {
      double: { effect: 'multiply', multiplier: 2 },
      side: { effect: 'side' },
      large: { effect: 'large' },
      b1g2: { effect: 'multiply', multiplier: 3 },
      b1g3: { effect: 'multiply', multiplier: 4 },
    }[effect];
    this.say('coba', `wheelResult.${effect}`, { gift: entry?.label ?? gift });
    this.startPromo('wheel', [gift], this.cfg.wheel.seconds, { ...spec, label: 'CHIẾC QUẠT SỐ HÊN', short: names[effect], source: effect });
  }

  startMatch({ outcome } = {}) {
    const now = this.now();
    const cfg = this.cfg.match;
    const chances = cfg.chances;
    if (!['win', 'draw', 'lose'].includes(outcome)) {
      const roll = this.random();
      outcome = roll < chances.win ? 'win' : roll < chances.win + chances.draw ? 'draw' : 'lose';
    }
    const r = () => Math.floor(this.random() * 3);
    let home = r();
    let away = r();
    if (outcome === 'win') home = away + 1 + Math.floor(this.random() * 2);
    if (outcome === 'lose') away = home + 1 + Math.floor(this.random() * 2);
    if (outcome === 'draw') away = home;
    const startAt = now + MATCH_INTRO_MS;
    const length = cfg.seconds * 1000;
    const goals = [
      ...Array.from({ length: home }, () => ({ team: 'home' })),
      ...Array.from({ length: away }, () => ({ team: 'away' })),
    ].map((g) => ({ ...g, at: startAt + (0.06 + this.random() * 0.88) * length, done: false }));
    goals.sort((a, b) => a.at - b.at);
    // Chú Tư luôn tự tin và thường đoán trật tỉ số.
    const predict = { a: home + 1 + Math.floor(this.random() * 2), b: Math.floor(this.random() * 2) };
    this.stage = {
      kind: 'match',
      phase: 'intro',
      home: cfg.home,
      away: this.pick(cfg.opponents),
      startAt,
      endAt: startAt + length,
      outroAt: 0,
      score: { home: 0, away: 0 },
      goals,
      outcome,
      predict,
    };
    this.say('chutu', 'matchOpenTu');
    this.say('coba', 'matchOpenBa', {}, 2200);
    this.say('chutu', 'predict', { home: cfg.home, a: predict.a, b: predict.b }, 4400);
    this.emit('match', this.publicStage());
    this.changed();
  }

  matchTick(now) {
    const stage = this.stage;
    if (stage.phase === 'intro' && now >= stage.startAt) {
      stage.phase = 'live';
      this.emit('kickoff', {});
      this.changed();
    }
    if (stage.phase === 'live') {
      for (const goal of stage.goals) {
        if (goal.done || now < goal.at) continue;
        goal.done = true;
        stage.score[goal.team]++;
        this.emit('goal', { team: goal.team, score: { ...stage.score } });
        if (goal.team === 'home') {
          if (this.runner && !this.runner.delivered && this.random() < 0.6) this.say('coba', 'goalHomeBusy', { table: numberWord(this.runner.table) });
          else this.say('coba', 'goalHome');
          if (this.random() < 0.6) this.say('chutu', 'goalHomeTu', {}, 1500);
        } else this.say('chutu', 'goalAwayTu');
        this.changed();
      }
      if (now >= stage.endAt) {
        stage.phase = 'result';
        stage.outroAt = now + MATCH_OUTRO_MS;
        this.emit('fulltime', { score: { ...stage.score }, outcome: stage.outcome });
        if (stage.outcome === 'win') this.say('coba', 'win');
        else if (stage.outcome === 'draw') {
          this.say('chutu', 'drawTu');
          this.say('coba', 'drawBa', {}, 2000);
        } else {
          this.say('chutu', 'loseTu');
          this.say('coba', 'loseBa', {}, 2000);
        }
        this.changed();
      }
    }
    if (stage.phase === 'result' && now >= stage.outroAt) {
      if (stage.outcome === 'win') {
        this.startPromo('b1g3', this.cfg.promos.b1g3.gifts, this.cfg.promos.b1g3.seconds, { open: 'b1g3Open' });
        this.stage = { ...stage, phase: 'promo' };
      } else this.endStage();
    }
  }

  endStage() {
    this.stage = null;
    this.changed();
    const next = this.queue.shift();
    if (next) this.trigger(next);
  }

  publicStage() {
    const s = this.stage;
    if (!s) return null;
    if (s.kind === 'match') {
      const { goals, outcome, ...rest } = s;
      return { ...rest, outcome: s.phase === 'result' || s.phase === 'promo' ? outcome : undefined };
    }
    return { ...s };
  }

  tick() {
    const now = this.now();
    let changed = false;

    if (this.promo && now >= this.promo.endAt) {
      this.promo = null;
      this.say('coba', 'promoEnd');
      this.emit('promoEnd', {});
      this.endStage();
    }
    if (this.stage?.kind === 'wheel' && this.stage.phase === 'spin' && now >= this.stage.spinEnd) this.finishWheel();
    if (this.stage?.kind === 'match') this.matchTick(now);
    if (!this.stage && !this.promo && this.queue.length) this.endStage();

    this.toastTick(now);
    this.wifeTick(now);
    for (const key of ['rain', 'cat', 'karaoke', 'crash', 'vendor', 'wife', 'blackout']) {
      if (this.ambient[key] && now >= this.ambient[key].endAt) {
        if (key === 'rain') this.say('coba', 'rainEnd');
        this.ambient[key] = null;
        changed = true;
      }
    }

    if (this.runner && !this.runner.delivered && now >= this.runner.arriveAt) this.deliver(now);
    if (this.runner && now >= this.runner.endAt) {
      this.runner = null;
      changed = true;
    }
    if (!this.runner) this.dispatch(now);

    if (this.consumeTick(now)) changed = true;
    if (this.drunkTick(now)) changed = true;
    this.seatingTick(now);

    // Lịch ca quán: sự kiện tự động chỉ chạy khi không ở chế độ an toàn.
    const auto = this.cfg.shift?.autoEvents !== false && !this.safeMode;
    for (const entry of this.shift.plan) {
      if (entry.fired || now < entry.at) continue;
      entry.fired = true;
      if (auto) this.trigger(entry.event);
    }
    if (auto && this.cfg.crash?.everySeconds && now >= this.nextCrash) this.trigger('crash');
    if (auto && this.cfg.vendor?.everySeconds && now >= this.nextVendor && this.trigger('vendor') !== 'started') this.nextVendor = now + 30_000;
    if (auto && this.cfg.toast?.promptEveryMinutes && now >= this.nextToast) {
      this.nextToast = now + this.cfg.toast.promptEveryMinutes * 60_000;
      if (this.seated().length && !this.ambient.toast && now >= (this.toastCooldownUntil ?? 0)) this.trigger('toast');
    }
    if (auto && this.cfg.wife?.everyMinutes && now >= this.nextWife) {
      this.nextWife = this.trigger('wife') === 'started' ? now + this.minutesGap(this.cfg.wife.everyMinutes) : now + 60_000;
    }
    if (auto && this.cfg.blackout?.everyMinutes && now >= this.nextBlackout) {
      this.nextBlackout = this.trigger('blackout') === 'started' ? now + this.minutesGap(this.cfg.blackout.everyMinutes) : now + 60_000;
    }
    if (auto && now >= this.nextChatter) {
      this.nextChatter = now + this.chatterGap();
      this.trigger(this.random() < 0.7 ? 'chatter' : 'cat');
    }
    if (now - this.shift.startAt >= this.shift.minutes * 60_000) this.startShift(auto);

    if (changed) this.changed();
  }

  // ---------- Hiển thị ----------

  menuView() {
    return this.cfg.menu.map((entry) => {
      const promo = this.offerFor(entry.gift);
      const item = this.cfg.items[entry.item];
      const offer = this.describeOffer(entry, promo);
      return { gift: entry.gift, label: entry.label, icon: entry.icon, item: entry.item, call: entry.call ?? '', itemName: item.name, unit: item.unit, base: entry.perGift, offer: offer.text, promo: Boolean(promo), ...offer };
    });
  }

  snapshot() {
    const now = this.now();
    const pendingIds = new Set(this.orders.map((o) => o.customerId));
    return {
      now,
      customers: [...this.customers.values()].map((c) => ({
        id: c.id,
        name: c.name,
        avatar: c.avatar,
        seat: c.seat,
        seatedAt: c.seatedAt ?? 0,
        look: c.look,
        water: c.water,
        stacks: c.stacks.map((s) => ({ ...s })),
        beers: c.beers,
        pending: pendingIds.has(c.id),
      })),
      waitlist: this.waitlist.map((id) => this.customers.get(id)?.name).filter(Boolean),
      runner: this.runner && {
        table: this.runner.table,
        startAt: this.runner.startAt,
        arriveAt: this.runner.arriveAt,
        endAt: this.runner.endAt,
        points: this.runner.points,
        speed: this.runner.speed,
        detour: this.runner.detour,
        big: this.runner.big,
        tray: this.runner.tray,
        items: this.runner.items,
        delivered: this.runner.delivered,
      },
      queueLength: this.orders.length,
      promo: this.promo,
      stage: this.publicStage(),
      queue: [...this.queue],
      ambient: {
        rain: this.ambient.rain,
        cat: this.ambient.cat,
        karaoke: this.ambient.karaoke,
        crash: this.ambient.crash,
        vendor: this.ambient.vendor,
        toast: this.ambient.toast && (({ by, ...rest }) => rest)(this.ambient.toast),
        wife: this.ambient.wife,
        blackout: this.ambient.blackout,
      },
      menu: this.menuView(),
      shift: { startAt: this.shift.startAt, minutes: this.shift.minutes, plan: this.shift.plan.map(({ event, at, fired }) => ({ event, at, fired })) },
      unmapped: this.unmapped.slice(0, 10),
      stats: { ...this.stats, customers: this.customers.size, seats: TABLES.length * 4 },
      safeMode: this.safeMode,
    };
  }
}
