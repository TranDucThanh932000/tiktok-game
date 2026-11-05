// Các tình huống kiểm tra cốt lõi (mục 14 kịch bản). Chạy: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Shop, GiftCounter, isJoinCommand, isLeaveCommand, isToastCommand, tableCommand } from '../src/shop.js';
import { TABLES, SEAT_COUNT } from '../public/layout.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
config.shift.autoEvents = false;

function makeShop(overrides = {}) {
  const clock = { t: 1_000_000 };
  const shop = new Shop({ ...config, ...overrides }, { now: () => clock.t, random: () => 0.1 });
  const events = [];
  shop.on((type, data) => events.push({ type, data }));
  const advance = (ms, step = 200) => {
    for (let left = ms; left > 0; left -= step) {
      clock.t += Math.min(step, left);
      shop.tick();
    }
  };
  return { shop, clock, events, advance };
}

const nam = { id: 'u1', name: 'Nam' };
const count = (shop, id, item) => shop.customers.get(id).stacks.filter((s) => s.item === item).reduce((n, s) => n + s.qty, 0);
const served = (shop, advance) => {
  for (let i = 0; i < 300 && (shop.pendingByTable().length || shop.runner); i++) advance(200);
};

test('lệnh vào nhận cả có dấu và không dấu, câu dài thì không', () => {
  for (const text of ['vào', 'Vào', 'vao', 'VÔ', 'vào quán', 'Vào nha!']) assert.ok(isJoinCommand(text), text);
  for (const text of ['cho vào bia', 'vào quán uống bia đi mọi người', 'chào']) assert.ok(!isJoinCommand(text), text);
});

test('cùng một tài khoản comment "vào" hai lần chỉ có một nhân vật', () => {
  const { shop } = makeShop();
  shop.comment(nam, 'vào');
  shop.comment(nam, 'vào');
  assert.equal(shop.customers.size, 1);
  assert.equal(shop.seats.size, 1);
});

test('hai khách trùng tên vẫn là hai nhân vật riêng, món giao đúng người', () => {
  const { shop, advance } = makeShop();
  shop.comment({ id: 'a', name: 'Nam' }, 'vào');
  shop.comment({ id: 'b', name: 'Nam' }, 'vào');
  shop.gift({ id: 'b', name: 'Nam' }, 'Finger Heart', 1);
  served(shop, advance);
  assert.equal(count(shop, 'a', 'beer'), 0);
  assert.equal(count(shop, 'b', 'beer'), 1);
});

test('vào quán là Tí tự bưng nước lã ra; comment "cho bia" chỉ hiện bong bóng, không ra món', () => {
  const { shop, advance } = makeShop();
  shop.comment(nam, 'vào');
  assert.equal(shop.customers.get('u1').needsWater, 'serve');
  assert.equal(shop.comment(nam, 'Cho một cốc bia').result, 'chat');
  served(shop, advance);
  const c = shop.customers.get('u1');
  assert.equal(c.water.has, true);
  assert.equal(c.stacks.length, 0);
});

test('bình luận dồn dập không làm Tí chạy thêm chuyến nước nào', () => {
  const { shop, events, advance } = makeShop();
  shop.comment(nam, 'vào');
  served(shop, advance);
  for (let i = 0; i < 20; i++) shop.comment(nam, `chào ${i}`);
  assert.equal(shop.pendingByTable().length, 0);
  assert.equal(shop.customers.get('u1').water.level, 1);
  assert.equal(events.filter((e) => e.type === 'chat').length, 20);
  assert.equal(shop.customers.get('u1').stacks.length, 0);
});

test('nước lã vơi dần 4 ngụm, uống cạn thì Tí tự mang ly mới', () => {
  const { shop, events, advance } = makeShop();
  shop.comment(nam, 'vào');
  served(shop, advance);
  const c = shop.customers.get('u1');
  assert.deepEqual([c.water.has, c.water.level], [true, 1]);
  for (let i = 0; i < 400 && c.needsWater !== 'refill'; i++) advance(1000, 1000);
  assert.equal(c.needsWater, 'refill');
  assert.equal(c.water.level, 0);
  assert.equal(events.filter((e) => e.type === 'sip').length, 4);
  served(shop, advance);
  assert.equal(c.water.level, 1);
  assert.equal(c.needsWater, null);
});

test('Tim tay lúc bình thường: một quà một cốc, hai quà hai cốc', () => {
  const { shop, advance } = makeShop();
  shop.comment(nam, 'vào');
  shop.gift(nam, 'Finger Heart', 1);
  served(shop, advance);
  assert.equal(count(shop, 'u1', 'beer'), 1);
  shop.gift(nam, 'Finger Heart', 2);
  served(shop, advance);
  assert.equal(count(shop, 'u1', 'beer'), 3);
});

test('mua 1 tặng 2 cho bia: một Tim tay nhận ba cốc', () => {
  const { shop, advance } = makeShop();
  shop.comment(nam, 'vào');
  shop.trigger('b1g2');
  const order = shop.gift(nam, 'Finger Heart', 1);
  assert.equal(order.qty, 3);
  served(shop, advance);
  assert.equal(count(shop, 'u1', 'beer'), 3);
});

test('mua 1 tặng 3 sau khi đội nhà thắng: một Tim tay nhận bốn cốc', () => {
  const { shop, advance } = makeShop();
  shop.comment(nam, 'vào');
  shop.trigger('match', { outcome: 'win' });
  advance(config.match.seconds * 1000 + 15_000, 500);
  assert.equal(shop.promo?.kind, 'b1g3');
  assert.equal(shop.gift(nam, 'Finger Heart', 1).qty, 4);
});

test('trận hòa hoặc thua không mở ưu đãi', () => {
  for (const outcome of ['draw', 'lose']) {
    const { shop, advance } = makeShop();
    shop.trigger('match', { outcome });
    advance(config.match.seconds * 1000 + 15_000, 500);
    assert.equal(shop.promo, null);
    assert.equal(shop.stage, null);
  }
});

test('combo ba Tim tay nhiều bản cập nhật chỉ tính ba quà', () => {
  const counter = new GiftCounter();
  const base = { userId: 'u1', giftId: 5655, groupId: 'g1', combo: true };
  const counts = [
    counter.count({ ...base, repeatCount: 1, msgId: 'm1' }),
    counter.count({ ...base, repeatCount: 2, msgId: 'm2' }),
    counter.count({ ...base, repeatCount: 2, msgId: 'm2' }),
    counter.count({ ...base, repeatCount: 3, msgId: 'm3' }),
    counter.count({ ...base, repeatCount: 3, repeatEnd: true, msgId: 'm4' }),
  ];
  assert.equal(counts.reduce((a, b) => a + b, 0), 3);
});

test('vòng quay xong nhưng chưa ai gửi quà: chỉ công bố ưu đãi, không phát món', () => {
  const { shop, advance } = makeShop();
  shop.comment(nam, 'vào');
  shop.trigger('wheel', { slot: 4 });
  advance(8000);
  assert.equal(shop.promo?.kind, 'wheel');
  served(shop, advance);
  assert.equal(shop.customers.get('u1').stacks.length, 0);
});

test('vòng quay "có đồ nhắm kèm" thêm đậu phộng, "phần lớn" không nhân số phần', () => {
  const { shop, advance } = makeShop();
  shop.comment(nam, 'vào');
  shop.trigger('wheel', { slot: 1 });
  advance(8000);
  const gift = shop.stage.gift;
  const side = shop.gift(nam, gift, 2);
  assert.equal(side.qty, 2);
  assert.equal(side.side, 2);
  shop.promo.endAt = shop.now();
  advance(400);
  shop.trigger('wheel', { slot: 2 });
  advance(8000);
  const large = shop.gift(nam, shop.stage.gift, 1);
  assert.equal(large.qty, 1);
  assert.equal(large.large, true);
});

test('khách đã có bia và đồ ăn bình luận: món trên bàn giữ nguyên', () => {
  const { shop, advance } = makeShop();
  shop.comment(nam, 'vào');
  shop.gift(nam, 'Finger Heart', 1);
  shop.gift(nam, 'Rose', 1);
  served(shop, advance);
  const before = JSON.stringify(shop.customers.get('u1').stacks);
  shop.comment(nam, 'Quán đông vui quá');
  served(shop, advance);
  assert.equal(JSON.stringify(shop.customers.get('u1').stacks), before);
  assert.equal(shop.customers.get('u1').water.has, true);
});

test('hai sự kiện ưu đãi cùng lúc: xếp hàng, không cộng dồn thành hệ số mười hai', () => {
  const { shop, advance } = makeShop();
  shop.comment(nam, 'vào');
  assert.equal(shop.trigger('b1g2'), 'started');
  assert.equal(shop.trigger('wheel', { slot: 4 }), 'queued');
  assert.equal(shop.gift(nam, 'Finger Heart', 1).qty, 3);
  advance(config.promos.b1g2.seconds * 1000 + 400);
  assert.equal(shop.stage?.kind, 'wheel');
});

test('quà nhận trước khi ưu đãi hết, phục vụ sau đó vẫn giữ quyền lợi', () => {
  const { shop, advance } = makeShop();
  shop.comment(nam, 'vào');
  shop.trigger('b1g2');
  advance(config.promos.b1g2.seconds * 1000 - 200);
  for (let i = 0; i < 8; i++) shop.gift({ id: `x${i}`, name: `Khách ${i}` }, 'Finger Heart', 1);
  shop.gift(nam, 'Finger Heart', 1);
  advance(1000);
  assert.equal(shop.promo, null);
  served(shop, advance);
  assert.equal(count(shop, 'u1', 'beer'), 3);
});

test('món tặng không sinh thêm món tặng; mua 1 tặng 2 hết thì về một cốc', () => {
  const { shop, advance } = makeShop();
  shop.comment(nam, 'vào');
  shop.trigger('b1g2');
  advance(config.promos.b1g2.seconds * 1000 + 400);
  assert.equal(shop.gift(nam, 'Finger Heart', 1).qty, 1);
});

test('kết thúc ca 20 phút không xóa khách, món và đơn', () => {
  const { shop, clock, advance } = makeShop();
  shop.comment(nam, 'vào');
  shop.gift(nam, 'Galaxy', 1);
  clock.t = shop.shift.startAt + 20 * 60_000;
  shop.comment(nam, 'còn đây');
  advance(400);
  assert.ok(shop.customers.has('u1'));
  assert.ok(shop.orders.length + (shop.runner ? 1 : 0) > 0 || count(shop, 'u1', 'hotpot') === 1);
});

test('quà chưa có trong thực đơn được báo cho chủ quán, không tự đổi thành món', () => {
  const { shop, events } = makeShop();
  shop.comment(nam, 'vào');
  assert.equal(shop.gift(nam, 'Lucky Pig', 1), null);
  assert.ok(events.some((e) => e.type === 'unmapped'));
  assert.equal(shop.orders.length, 0);
});

test('gửi quà khi chưa vào quán: tự đón khách rồi phục vụ', () => {
  const { shop, advance } = makeShop();
  shop.gift(nam, 'Finger Heart', 1);
  assert.ok(shop.customers.get('u1').seat);
  served(shop, advance);
  assert.equal(count(shop, 'u1', 'beer'), 1);
});

test('bình luận của người chưa vào quán không tạo nhân vật', () => {
  const { shop } = makeShop();
  shop.comment(nam, 'chào cô Ba');
  assert.equal(shop.customers.size, 0);
});

test('quán đầy thì chờ ghế; khách tặng quà được ưu tiên ghế trống tiếp theo', () => {
  const { shop } = makeShop();
  assert.equal(TABLES.length, 8);
  assert.equal(SEAT_COUNT, 32);
  for (let index = 0; index < SEAT_COUNT; index++) shop.comment({ id: `s${index}`, name: `S${index}` }, 'vào');
  assert.equal(shop.seats.size, 32);
  assert.equal(shop.waitlist.length, 0);
  for (const table of TABLES) assert.equal([...shop.customers.values()].filter((customer) => customer.seat?.table === table.id).length, 4);
  shop.comment({ id: 'w1', name: 'W1' }, 'vào');
  shop.gift({ id: 'w2', name: 'W2' }, 'Rose', 1);
  assert.deepEqual(shop.waitlist, ['w2', 'w1']);
  shop.leave(shop.customers.get('s0'));
  shop.tick();
  assert.ok(shop.customers.get('w2').seat);
  assert.equal(shop.customers.get('w1').seat, null);
});

test('khách im lặng lâu và bàn trống thì về; khách còn món thì ở lại', () => {
  const { shop, clock, advance } = makeShop();
  shop.comment(nam, 'vào');
  shop.comment({ id: 'u2', name: 'Lan' }, 'vào');
  shop.gift({ id: 'u2', name: 'Lan' }, 'Galaxy', 5);
  served(shop, advance);
  clock.t += 21 * 60_000;
  advance(400);
  assert.ok(!shop.customers.has('u1'));
  assert.ok(shop.customers.has('u2'));
});

test('bình luận tục bị ẩn khỏi bong bóng thoại; chữ có dấu thường không bị chặn', () => {
  const { shop } = makeShop();
  assert.equal(shop.cleanChat('quán lớn quá'), 'quán lớn quá');
  assert.equal(shop.cleanChat('vcl luôn'), '');
  assert.equal(shop.cleanChat('xem https://abc.xyz đi'), 'xem đi');
  assert.equal(Array.from(shop.cleanChat('a'.repeat(100))).length, config.chat.maxLength);
});

test('va chạm xe tự diễn ra theo chu kỳ config (2 phút), không chồng lên nhau, tắt khi bật chế độ an toàn', () => {
  const every = config.crash.everySeconds * 1000;
  const length = config.crash.seconds * 1000;
  assert.equal(every, 120_000);
  const clock = { t: 1_000_000 };
  const shop = new Shop({ ...config, shift: { ...config.shift, autoEvents: true, schedule: [] } }, { now: () => clock.t, random: () => 0.1 });
  const step = (ms) => {
    for (let left = ms; left > 0; left -= 500) {
      clock.t += 500;
      shop.tick();
    }
  };
  step(every - 1000);
  assert.equal(shop.ambient.crash, null);
  step(1500);
  assert.ok(shop.ambient.crash);
  assert.equal(shop.trigger('crash'), 'busy');
  step(length);
  assert.equal(shop.ambient.crash, null);
  // Giữa hai lần không có va chạm; lần sau bắt đầu đúng một chu kỳ sau lần trước.
  step(every - length - 2000);
  assert.equal(shop.ambient.crash, null);
  step(2000);
  assert.ok(shop.ambient.crash);
  step(length);
  shop.safeMode = true;
  step(every * 2);
  assert.equal(shop.ambient.crash, null);
});

test('lệnh vào bàn nhận nhiều cách gõ và vẫn tương thích lệnh cũ', () => {
  for (const [text, n] of [['vào bàn 3', 3], ['Vào bàn: 3!', 3], ['vao ban:3', 3], ['vào bàn số 5', 5], ['VAO BAN 8', 8], ['đổi bàn: 3', 3], ['Đổi bàn 3', 3], ['doi ban:3', 3], ['đổi bàn số 5', 5], ['chuyển bàn 2', 2], ['qua bàn 6', 6]]) assert.equal(tableCommand(text), n, text);
  for (const text of ['vào bàn', 'vào bàn abc', 'vào bàn 123', 'bàn 3 vui quá', 'vào bàn 3 đi mọi người', 'đổi bàn 3 đi mọi người']) assert.equal(tableCommand(text), null, text);
});

test('vào bàn 7 và 8 cho khách mới chọn đúng bàn', () => {
  const { shop } = makeShop();
  for (const tableId of [7, 8]) {
    const viewer = { id: `new-${tableId}`, name: `Guest ${tableId}` };
    assert.equal(shop.comment(viewer, `vào bàn ${tableId}`).result, 'join');
    assert.equal(shop.customers.get(viewer.id).seat.table, tableId);
  }
});

test('vào bàn: sang đúng bàn, mang theo món, không nhận nước lã, có giới hạn', () => {
  const { shop, clock, advance } = makeShop();
  shop.comment(nam, 'vào');
  shop.gift(nam, 'Finger Heart', 2);
  served(shop, advance);
  const from = shop.customers.get('u1').seat.table;
  const to = from === 8 ? 7 : 8;
  assert.equal(shop.comment(nam, `vào bàn ${to}`).result, 'move');
  const c = shop.customers.get('u1');
  assert.equal(c.seat.table, to);
  assert.equal(count(shop, 'u1', 'beer'), 2);
  assert.equal(c.needsWater, null);
  assert.equal([...shop.seats.values()].filter((id) => id === 'u1').length, 1);
  assert.equal(shop.comment(nam, `vào bàn ${to}`).result, 'move-same');
  assert.equal(shop.comment(nam, 'vào bàn 9').result, 'move-bad');
  assert.equal(shop.comment(nam, `vào bàn ${from}`).result, 'move-cooldown');
  clock.t += 11_000;
  assert.equal(shop.comment(nam, `vào bàn ${from}`).result, 'move');
});

test('vào bàn đã đủ 4 người thì báo hết ghế; người chưa vào gõ vào bàn thì vào thẳng bàn đó', () => {
  const { shop } = makeShop();
  shop.comment({ id: 'a', name: 'A' }, 'vào bàn 2');
  assert.equal(shop.customers.get('a').seat.table, 2);
  for (let i = 0; i < 3; i++) shop.comment({ id: `b${i}`, name: `B${i}` }, 'vào bàn 2');
  assert.equal([...shop.customers.values()].filter((c) => c.seat?.table === 2).length, 4);
  shop.comment(nam, 'vào');
  assert.notEqual(shop.customers.get('u1').seat.table, 2);
  const notices = [];
  const says = [];
  shop.on((type, data) => {
    if (type === 'notice') notices.push(data);
    if (type === 'say') says.push(data.text);
  });
  const before = shop.customers.get('u1').seat;
  assert.equal(shop.comment(nam, 'vào bàn 2').result, 'move-full');
  assert.deepEqual(shop.customers.get('u1').seat, before);
  assert.deepEqual(notices.at(-1), { id: 'u1', text: 'Bàn 2 đã đầy rồi!' });
  assert.match(says.at(-1), /Bàn hai đã đầy rồi/);
  // Người chưa vào quán chọn bàn đầy: được xếp bàn khác và vẫn được báo bàn đã đầy.
  assert.equal(shop.comment({ id: 'n', name: 'N' }, 'vào bàn 2').result, 'join-full');
  assert.notEqual(shop.customers.get('n').seat.table, 2);
  assert.equal(notices.at(-1).text, 'Bàn 2 đã đầy rồi!');
});

test('thả tim: cứ đủ 100 tim cộng dồn thì được 1 sinh tố lúa mạch, không áp ưu đãi', () => {
  const { shop, advance } = makeShop();
  shop.comment(nam, 'vào');
  shop.trigger('b1g2');
  for (let i = 0; i < 9; i++) assert.equal(shop.like(nam, 10), null);
  const order = shop.like(nam, 15);
  assert.equal(order.item, 'beer');
  assert.equal(order.qty, 1);
  assert.equal(shop.like(nam, 195).qty, 2);
  served(shop, advance);
  assert.equal(count(shop, 'u1', 'beer'), 3);
});

test('người chưa vào quán thả đủ 100 tim thì được tự đón vào và phục vụ', () => {
  const { shop, advance } = makeShop();
  assert.equal(shop.like({ id: 'z', name: 'Z' }, 60), null);
  assert.equal(shop.customers.size, 0);
  shop.like({ id: 'z', name: 'Z' }, 40);
  assert.ok(shop.customers.get('z').seat);
  served(shop, advance);
  assert.equal(count(shop, 'z', 'beer'), 1);
});

test('uống tới cốc thứ 2 thì nôn một lần, cốc thứ 3 không nôn, cốc thứ 4 nôn tiếp', () => {
  const { shop, events, advance } = makeShop();
  shop.comment(nam, 'vào');
  const vomits = () => events.filter((e) => e.type === 'vomit').length;
  shop.gift(nam, 'Finger Heart', 1);
  served(shop, advance);
  advance(6000);
  assert.equal(shop.customers.get('u1').beers, 1);
  assert.equal(vomits(), 0);
  shop.gift(nam, 'Finger Heart', 1);
  served(shop, advance);
  advance(6000);
  assert.equal(vomits(), 1);
  assert.equal(events.find((e) => e.type === 'vomit').data.id, 'u1');
  advance(30_000);
  shop.gift(nam, 'Finger Heart', 1);
  served(shop, advance);
  advance(6000);
  assert.equal(vomits(), 1);
  shop.gift(nam, 'Finger Heart', 1);
  served(shop, advance);
  advance(6000);
  assert.equal(vomits(), 2);
});

test('combo nhiều cốc một lúc chỉ nôn một lần; món khác không làm say', () => {
  const { shop, events, advance } = makeShop();
  shop.comment(nam, 'vào');
  shop.gift(nam, 'Rose', 3);
  served(shop, advance);
  assert.equal(shop.customers.get('u1').beers, 0);
  shop.gift(nam, 'Finger Heart', 5);
  served(shop, advance);
  advance(6000);
  assert.equal(shop.customers.get('u1').beers, 5);
  assert.equal(events.filter((e) => e.type === 'vomit').length, 1);
});

test('chế độ an toàn không nôn; để lâu không uống thì tỉnh dần', () => {
  const { shop, events, advance } = makeShop();
  shop.safeMode = true;
  shop.comment(nam, 'vào');
  shop.gift(nam, 'Finger Heart', 2);
  served(shop, advance);
  advance(6000);
  assert.equal(events.filter((e) => e.type === 'vomit').length, 0);
  assert.equal(shop.customers.get('u1').beers, 2);
  advance(3 * 60_000 + 1000, 1000);
  assert.equal(shop.customers.get('u1').beers, 1);
});

test('lệnh về nhận nhiều cách gõ, câu dài thì không', () => {
  for (const text of ['về', 'Về', 've', 'về nha', 'Về thôi!', 'đi về', 'về nha cô Ba', 'xin phép về']) assert.ok(isLeaveCommand(text), text);
  for (const text of ['về quê ăn tết', 'quán này về đêm vui', 'vào', 'về đi đâu vậy']) assert.ok(!isLeaveCommand(text), text);
});

test('gõ "về": chưa uống thì về thường, đã từng uống thì bị công an giữ xe (kể cả đã tỉnh)', () => {
  const { shop, events, advance } = makeShop();
  const lan = { id: 'u2', name: 'Lan' };
  shop.comment(nam, 'vào');
  shop.comment(lan, 'vào');
  shop.gift(nam, 'Finger Heart', 1);
  served(shop, advance);
  advance(10 * 60_000);
  assert.equal(shop.customers.get('u1').beers, 0, 'đã tỉnh hẳn');
  assert.equal(shop.comment(lan, 'về').result, 'home');
  assert.equal(shop.comment(nam, 'Về nha cô Ba').result, 'home-drunk');
  const leaves = events.filter((e) => e.type === 'leave');
  assert.deepEqual(leaves.map((e) => [e.data.id, e.data.reason, e.data.drunk]), [['u2', 'home', false], ['u1', 'home', true]]);
  assert.equal(shop.customers.size, 0);
  assert.equal(shop.seats.size, 0);
  assert.ok(events.some((e) => e.type === 'say' && e.data.who === 'chutu' && e.data.delay > 9000), 'Chú Tư nói sau cảnh công an');
});

test('khách còn món đang làm gõ "về" thì chờ nhận xong; người chưa vào quán gõ "về" không có gì xảy ra', () => {
  const { shop, events, advance } = makeShop();
  shop.comment(nam, 'vào');
  shop.gift(nam, 'Rose', 1);
  assert.equal(shop.comment(nam, 'về').result, 'home-pending');
  assert.ok(shop.customers.has('u1'));
  assert.ok(events.some((e) => e.type === 'notice' && e.data.id === 'u1'));
  served(shop, advance);
  assert.equal(shop.comment(nam, 'về').result, 'home');
  assert.equal(shop.comment({ id: 'u9', name: 'Lạ' }, 'về').result, 'hint');
  assert.equal(shop.customers.size, 0);
});

test('chế độ an toàn: khách đã uống gõ "về" vẫn về bình thường, không có cảnh công an', () => {
  const { shop, events, advance } = makeShop();
  shop.comment(nam, 'vào');
  shop.gift(nam, 'Finger Heart', 1);
  served(shop, advance);
  shop.safeMode = true;
  assert.equal(shop.comment(nam, 'về').result, 'home');
  assert.equal(events.find((e) => e.type === 'leave').data.drunk, false);
});

test('đang có cảnh công an giữ xe khách say thì vụ đụng xe hoãn lại, xong cảnh mới diễn ra', () => {
  const { shop, advance } = makeShop();
  shop.comment(nam, 'vào');
  shop.gift(nam, 'Finger Heart', 1);
  served(shop, advance);
  shop.comment(nam, 'về');
  assert.equal(shop.trigger('crash'), 'busy');
  assert.equal(shop.ambient.crash, null);
  advance(40_000, 500);
  assert.equal(shop.trigger('crash'), 'started');
});

test('Dì Năm bán hàng rong ghé từng bàn có khách (bàn gần cửa trước), mỗi bàn hỏi một người rồi đi', () => {
  const { shop, events, advance } = makeShop();
  assert.equal(shop.trigger('vendor'), 'empty', 'quán vắng thì không vào');
  shop.admit({ id: 'a', name: 'A' }, { table: 1 });
  shop.admit({ id: 'b', name: 'B' }, { table: 6 });
  shop.admit({ id: 'c', name: 'C' }, { table: 6 });
  assert.equal(shop.trigger('vendor'), 'started');
  assert.equal(shop.trigger('vendor'), 'busy');
  const v = shop.ambient.vendor;
  assert.deepEqual(v.stops.map((s) => s.table), [6, 1]);
  assert.ok(v.stops.every((s, i) => i === 0 || s.at > v.stops[i - 1].at));
  assert.ok(v.frames.every((f, i) => i === 0 || f.t >= v.frames[i - 1].t));
  assert.ok(events.some((e) => e.type === 'vendor'));
  advance(v.endAt - shop.now() + 500, 1000);
  assert.equal(shop.ambient.vendor, null);
});

test('khách mua hay từ chối tùy người: ngà ngà hoặc tặng quà nhiều thì dễ mua, bàn đầy món thì kêu no', () => {
  const { shop } = makeShop();
  const roll = { v: 0.5 };
  shop.random = () => roll.v;
  const plain = { stacks: [], beers: 0, spent: 0 };
  const tipsy = { stacks: [], beers: 1, spent: 0 };
  const full = { stacks: [{ item: 'nem', qty: 3 }], beers: 0, spent: 0 };
  const values = { item: 'bắp luộc', unit: 'trái', name: 'Nam' };
  assert.equal(shop.vendorDecision(plain, values).buy, false);
  assert.equal(shop.vendorDecision(tipsy, values).buy, true);
  const no = shop.vendorDecision(full, values);
  assert.equal(no.buy, false);
  assert.match(no.reply, /no|đầy/);
  roll.v = 0.01;
  const big = shop.vendorDecision({ stacks: [], beers: 0, spent: 6 }, values);
  assert.deepEqual([big.buy, big.qty], [true, 4]);
  assert.match(big.reply, /bốn trái/);
});

test('lệnh dô nhận nhiều cách gõ; "vô" vẫn là lệnh vào quán', () => {
  for (const text of ['dô', 'Dô!', 'DÔ DÔ DÔ', 'dzô', 'zô', '1 2 3 dô', 'một hai ba dô', 'dô nào']) assert.ok(isToastCommand(text), text);
  for (const text of ['vô', 'đi đâu đó', 'dô quán', 'do']) assert.equal(isToastCommand(text), text === 'do', text);
  assert.ok(isJoinCommand('vô'));
});

test('đủ 10 tiếng dô trong 30 giây thì cả quán cụng ly; một người gõ dồn dập chỉ tính mỗi 1,5 giây', () => {
  const { shop, events, clock, advance } = makeShop();
  shop.comment(nam, 'vào');
  served(shop, advance);
  assert.equal(shop.comment(nam, 'dô').result, 'toast');
  assert.equal(shop.comment(nam, 'dô').result, 'toast-wait');
  assert.ok(events.some((e) => e.type === 'chat' && e.data.text === 'dô'), 'khách trong quán hiện bong bóng "dô"');
  assert.equal(shop.customers.get('u1').needsWater, null, 'dô không tính là xin nước');
  for (let i = 0; i < 9; i++) shop.comment({ id: `v${i}`, name: `V${i}` }, 'Dô!');
  assert.equal(shop.ambient.toast.phase, 'done');
  assert.equal(events.filter((e) => e.type === 'toast').length, 1);
  assert.equal(shop.customers.size, 1, 'người chưa vào quán gõ dô không bị kéo vào quán');
  assert.equal(shop.comment(nam, 'dô').result, 'toast-done');
  advance(7000);
  assert.equal(shop.ambient.toast, null);
  assert.equal(shop.comment(nam, 'dô').result, 'toast-cooldown');
  clock.t += 46_000;
  assert.equal(shop.comment(nam, 'dô').result, 'toast');
});

test('không đủ tiếng dô thì hết giờ Cô Ba hẹn lát làm lại', () => {
  const { shop, events, advance } = makeShop();
  assert.equal(shop.trigger('toast'), 'started');
  shop.comment(nam, 'dô');
  advance(31_000, 1000);
  assert.equal(shop.ambient.toast, null);
  assert.equal(events.filter((e) => e.type === 'toast').length, 0);
  assert.ok(events.some((e) => e.type === 'say' && /dô/.test(e.data.text) && /1|một/.test(e.data.text)));
});

test('vợ tới kiếm: ưu tiên khách đã uống; bị lôi về thì rời quán, được tha thì ngồi lại', () => {
  for (const spare of [false, true]) {
    const { shop, events, advance } = makeShop({ wife: { spareChance: spare ? 1 : 0 } });
    const lan = { id: 'u2', name: 'Lan' };
    assert.equal(shop.trigger('wife'), 'empty');
    shop.comment(nam, 'vào');
    shop.comment(lan, 'vào');
    shop.gift(lan, 'Finger Heart', 1);
    served(shop, advance);
    assert.equal(shop.trigger('wife'), 'started');
    assert.equal(shop.ambient.wife.id, 'u1', 'Lan còn cốc trên bàn nên chưa bị chọn');
    shop.ambient.wife = null;
    advance(12_000);
    assert.equal(count(shop, 'u2', 'beer'), 0);
    assert.equal(shop.trigger('wife'), 'started');
    assert.equal(shop.trigger('wife'), 'busy');
    const w = shop.ambient.wife;
    assert.equal(w.id, 'u2', 'chọn người đã uống');
    advance(w.dragAt - shop.now() + 400, 400);
    assert.equal(shop.customers.has('u2'), spare);
    const leave = events.find((e) => e.type === 'leave');
    if (spare) assert.equal(leave, undefined);
    else assert.equal(leave.data.reason, 'wife');
    advance(w.endAt - shop.now() + 500, 1000);
    assert.equal(shop.ambient.wife, null);
    assert.ok(shop.customers.has('u1'));
  }
});

test('vợ tới mà khách đã tự về trước thì không lôi ai cả', () => {
  const { shop, events, advance } = makeShop({ wife: { spareChance: 0 } });
  shop.comment(nam, 'vào');
  served(shop, advance);
  assert.equal(shop.trigger('wife'), 'started');
  shop.comment(nam, 'về');
  advance(shop.ambient.wife.dragAt - shop.now() + 400, 400);
  assert.equal(events.filter((e) => e.type === 'leave').length, 1);
  assert.equal(shop.ambient.wife.missed, true);
});

test('cúp điện: một lần một cúp, hết giờ có điện lại; không cúp giữa trận bóng', () => {
  const { shop, advance } = makeShop();
  assert.equal(shop.trigger('blackout'), 'started');
  assert.equal(shop.trigger('blackout'), 'busy');
  advance(15_000, 1000);
  assert.equal(shop.ambient.blackout, null);
  shop.trigger('match', { outcome: 'draw' });
  assert.equal(shop.trigger('blackout'), 'busy');
});

test('vợ tới kiếm không chọn khách còn món trên bàn; khách kịp gọi món lúc bị réo thì không bị lôi về', () => {
  const { shop, advance } = makeShop({ wife: { spareChance: 0 } });
  shop.comment(nam, 'vào');
  shop.gift(nam, 'Rose', 1);
  served(shop, advance);
  assert.ok(count(shop, 'u1', 'peanut') > 0);
  assert.equal(shop.trigger('wife'), 'empty');
  advance(16_000);
  assert.equal(shop.trigger('wife'), 'started');
  shop.gift(nam, 'Rose', 1);
  advance(shop.ambient.wife.dragAt - shop.now() + 400, 400);
  assert.ok(shop.customers.has('u1'));
  assert.equal(shop.ambient.wife.saved, true);
});
