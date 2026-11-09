import test from 'node:test';
import assert from 'node:assert/strict';
import { NetCafe } from '../src/net.js';
import { buildCommands, parseCommand } from '../src/text.js';

// 1 phút net = 1 giây thật cho dễ tính. Sự kiện tự động tắt, từng bài bật tay.
const config = {
  room: { rows: 2, cols: 3, vip: 2 },
  clock: { start: '19:00', secondsPerMinute: 1 },
  time: { freeMinutes: 20, commentMinutes: 1, commentGapSeconds: 10, likesPerMinute: 10, followMinutes: 30, shareMinutes: 15, shareGapSeconds: 60, kickSeconds: 10, idleKickMinutes: 10, itemMinutes: 60 },
  rates: { boost: 2, vip: 3, golden: 2 },
  minutesPerCoin: 30,
  gifts: [
    { coins: 1, label: 'Nạp giờ', icon: '/gifts/rose.webp' },
    { coins: 5, label: 'Mì tôm + Sting', icon: '/gifts/finger-heart.webp', item: 'mi' },
    { coins: 10, label: 'Lên đồ x2', icon: '/gifts/lucky-pig.webp', boostMinutes: 120 },
    { coins: 30, label: 'Máy khủng x2', icon: '/gifts/doughnut.webp', boostMinutes: 240, rig: true },
    { coins: 100, label: 'Phòng VIP x3', icon: '/gifts/gift-box.webp', vipMinutes: 300 },
    { coins: 299, label: 'Bao net cả tiệm', icon: '/gifts/corgi.webp', everyoneMinutes: 60 },
    { coins: 1000, label: 'Mua lại tiệm', icon: '/gifts/galaxy.webp', everyoneMinutes: 120, bossSeconds: 600 },
  ],
  commands: {
    join: ['ngoi', 'ngồi', 'ngồi máy', 'vào', 'vào máy', 'vào chơi', 'vô', 'chơi', 'mở máy'],
    leave: ['ve', 'về', 'về nhà', 'về thôi', 'đi về', 'nghỉ', 'tắt máy', 'out'],
    check: ['gio', 'giờ', 'xem giờ', 'check giờ', 'còn bao nhiêu'],
    buzz: ['buzz', 'rung máy'],
    rage: ['gg', 'đập phím', 'cay'],
    hide: ['tron', 'trốn', 'núp', 'trốn đi'],
  },
  games: [
    { code: 'volam', aliases: ['vl', 'võ lâm'], label: 'Võ Lâm', screen: 'kiemhiep' },
    { code: 'au', aliases: ['audition'], label: 'Audition', screen: 'nhay' },
    { code: 'cs', aliases: ['half life'], label: 'Half-Life', screen: 'sung' },
    { code: 'aoe', aliases: ['đế chế'], label: 'Đế Chế', screen: 'dechet' },
    { code: 'fifa', aliases: ['pes', 'bóng đá'], label: 'Bóng đá', screen: 'bong' },
    { code: 'chat', aliases: ['yahoo'], label: 'Yahoo', screen: 'chat' },
  ],
  events: {
    golden: { everySeconds: 0, seconds: 60 },
    blackout: { everySeconds: 0, seconds: 7 },
    mom: { everySeconds: 0, seconds: 12, minPlayers: 3, hideMinutes: 10 },
  },
  chatterSeconds: 1e9,
};

const LINES = { sit: ['{name} máy {seat}'], checkNone: ['{name} chưa ngồi'], mom: ['{name} về ăn cơm'], momLost: ['Đâu rồi?'] };

function setup(overrides = {}) {
  let t = 1_000_000;
  const events = [];
  const cafe = new NetCafe({ ...config, ...overrides }, { emit: (msg) => events.push(msg), now: () => t, rng: () => 0, lines: LINES });
  const advance = (ms) => {
    for (let left = ms; left > 0; left -= 100) {
      t += Math.min(100, left);
      cafe.tick();
    }
  };
  const of = (type) => events.filter((e) => e.type === type);
  const p = (name) => cafe.players.get(`id:${name}`);
  return { cafe, events, of, advance, p, now: () => t };
}

const who = (name) => ({ id: `id:${name}`, name });
const fill = (cafe, names) => names.forEach((name) => cafe.comment(who(name), 'ngoi'));

test('lệnh nằm trọn trong comment, gõ không dấu, hoa thường, thêm "nha" đều được', () => {
  const table = buildCommands(config);
  const kind = (text) => parseCommand(table, text)?.kind ?? null;
  for (const text of ['ngồi', 'NGOI!!', 'ngoi nha', 'cho em ngồi với', 'vào máy', 'ngoiii', 'Vô 😆']) assert.equal(kind(text), 'join', text);
  for (const text of ['về nhà', 've', 'Về thôi nha']) assert.equal(kind(text), 'leave', text);
  assert.equal(kind('giờ?'), 'check');
  assert.equal(kind('gg'), 'rage');
  assert.equal(kind('trốn'), 'hide');
  assert.deepEqual(parseCommand(table, 'VL'), { kind: 'game', code: 'volam' });
  assert.deepEqual(parseCommand(table, 'đế chế'), { kind: 'game', code: 'aoe' });
  assert.deepEqual(parseCommand(table, 'ngoi 4'), { kind: 'join', seat: 4 });
  for (const text of ['ngồi đâu vậy', 'chơi game gì vậy mọi người', 'giờ 5', 'hello']) assert.equal(kind(text), null, text);
});

test('gõ ngoi là vào máy trống với freeMinutes phút, gõ lại không ngồi thêm máy', () => {
  const { cafe, of, p } = setup();
  assert.deepEqual(cafe.comment(who('An'), 'ngồi'), { kind: 'seat', seat: 2 });
  const [seat] = of('seat');
  assert.equal(seat.from, 'door');
  assert.equal(seat.player.minutes, 20);
  assert.equal(seat.player.name, 'An');
  assert.deepEqual(cafe.comment(who('An'), 'ngoi'), { kind: 'already', seat: 2 });
  assert.equal(of('seat').length, 1);
  assert.equal(p('An').seat, 2, 'ghế thường đầu tiên (2 ghế đầu là VIP)');
  assert.deepEqual(cafe.comment(who('Bình'), 'ngoi 4'), { kind: 'seat', seat: 5 }, 'xin máy 4 thì ngồi máy 4');
});

test('ngồi là trừ giờ và cày điểm theo phút; lên đồ thì cày gấp đôi', () => {
  const { cafe, advance, p } = setup();
  fill(cafe, ['An']);
  advance(5000);
  assert.ok(Math.abs(p('An').balance - 15) < 1e-6);
  assert.ok(Math.abs(p('An').score - 5) < 1e-6);
  cafe.gift(who('An'), 10);
  advance(5000);
  assert.ok(Math.abs(p('An').score - 15) < 1e-6, 'x2 trong 5 phút = 10 điểm');
  assert.equal(cafe.publicPlayer(p('An')).rate, 2);
});

test('hết giờ vẫn ngồi khi không ai chờ; có người chờ thì sau kickSeconds mới nhường, mỗi người chờ một máy', () => {
  const { cafe, advance, of, p } = setup();
  fill(cafe, ['A', 'B', 'C', 'D', 'E', 'F']);
  advance(20_000);
  assert.equal(of('expire').length, 6);
  assert.ok(['A', 'B', 'C', 'D', 'E', 'F'].every((name) => p(name).state === 'out' && p(name).seat !== null));
  advance(30_000);
  assert.equal(of('leave').length, 0, 'không ai chờ thì cứ ngồi');
  assert.deepEqual(cafe.comment(who('G'), 'ngoi'), { kind: 'queued', pos: 1 });
  advance(9_000);
  assert.equal(of('leave').length, 1, 'hết giờ đã lâu nên nhường ngay một máy');
  const [kick] = of('leave');
  assert.equal(kick.reason, 'kick');
  assert.equal(p('G').seat, kick.seat);
  assert.equal(of('seat').at(-1).from, 'queue');
  assert.equal(cafe.queue.length, 0);
});

test('hết giờ ngồi im quá idleKickMinutes thì cô Tám tắt máy', () => {
  const { cafe, advance, of, p } = setup();
  fill(cafe, ['An']);
  advance(20_000 + 9 * 60_000);
  assert.equal(of('leave').length, 0);
  cafe.comment(who('An'), 'alo');
  advance(9 * 60_000);
  assert.equal(of('leave').length, 0, 'comment là còn ở đây');
  advance(61_000);
  assert.equal(of('leave')[0].reason, 'idle');
  assert.equal(p('An').seat, null);
});

test('thả tim: likesPerMinute tim được 1 phút, hết giờ mà thả tim thì chơi tiếp', () => {
  const { cafe, advance, p, of } = setup();
  assert.equal(cafe.like(who('Lạ'), 50), 0, 'chưa vào tiệm thì không tính');
  fill(cafe, ['An']);
  assert.equal(cafe.like(who('An'), 25), 2);
  assert.equal(cafe.like(who('An'), 5), 1);
  advance(23_000);
  assert.equal(p('An').state, 'out');
  cafe.like(who('An'), 10);
  assert.equal(p('An').state, 'play');
  assert.equal(of('revive').length, 1);
});

test('comment khi đang chơi được thêm 1 phút, tối đa một lần mỗi commentGapSeconds', () => {
  const { cafe, advance, of } = setup();
  fill(cafe, ['An']);
  cafe.comment(who('An'), 'hay quá');
  cafe.comment(who('An'), 'hay quá 2');
  assert.equal(of('topup').length, 1);
  advance(10_000);
  cafe.comment(who('An'), 'lại nè');
  assert.equal(of('topup').length, 2);
});

test('tặng quà là vào tiệm luôn, mỗi xu 30 phút; tiệm đầy thì người tặng đứng đầu hàng chờ', () => {
  const { cafe, of, p } = setup();
  const result = cafe.gift(who('Bo'), 1);
  assert.equal(result.minutes, 30);
  assert.equal(p('Bo').seat, 2);
  assert.equal(of('gift')[0].seat, 2);
  fill(cafe, ['A', 'B', 'C', 'D', 'E', 'Cu', 'Di']);
  assert.deepEqual(cafe.queue, ['id:Cu', 'id:Di']);
  cafe.gift(who('Em'), 1, 2);
  assert.deepEqual(cafe.queue, ['id:Em', 'id:Cu', 'id:Di']);
  assert.equal(p('Em').balance, 60, 'combo x2 = 60 phút');
  cafe.gift(who('Di'), 1);
  assert.deepEqual(cafe.queue, ['id:Em', 'id:Di', 'id:Cu'], 'tặng lúc đang chờ thì lên trước người chưa tặng');
});

test('các mức quà: mì tôm, lên đồ, máy khủng; quà to tính theo mức gần nhất nhân lên', () => {
  const { cafe, p, of } = setup();
  fill(cafe, ['An']);
  cafe.gift(who('An'), 5);
  assert.equal(p('An').item, 'mi');
  assert.equal(p('An').balance, 20 + 150);
  cafe.gift(who('An'), 99);
  assert.equal(p('An').boost, 720, '99 xu = 3 lần mức 30 xu');
  assert.equal(p('An').rig, true);
  assert.deepEqual(of('gift').map((g) => g.label), ['Mì tôm + Sting', 'Máy khủng x2']);
});

test('phòng VIP: đang ngồi ghế thường thì chuyển sang ghế VIP, cày x3; VIP kín thì chờ, có chỗ là vào', () => {
  const { cafe, p, of, advance } = setup();
  fill(cafe, ['A', 'B', 'C']);
  const old = p('A').seat;
  cafe.gift(who('A'), 100);
  assert.equal(p('A').seat, 0);
  assert.deepEqual(of('leave').map((e) => [e.seat, e.reason]), [[old, 'move']]);
  assert.equal(of('seat').at(-1).from, old);
  assert.equal(cafe.publicPlayer(p('A')).rate, 3);
  cafe.gift(who('B'), 100);
  assert.equal(p('B').seat, 1);
  const cSeat = p('C').seat;
  cafe.gift(who('C'), 100);
  assert.equal(p('C').seat, cSeat, 'hai ghế VIP đã có người, C chờ ở ghế cũ');
  advance(301_000);
  assert.equal(p('C').seat === 0 || p('C').seat === 1, true, 'A, B hết giờ VIP thì C vào');
  assert.equal(cafe.seats[p('A').seat].vip && cafe.seats[p('B').seat].vip, false, 'một người hết VIP đã ra ghế thường');
});

test('bao net: mọi người đang ngồi và đang chờ đều được thêm giờ', () => {
  const { cafe, p, of } = setup();
  fill(cafe, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  cafe.gift(who('A'), 299);
  const [treat] = of('treat');
  assert.equal(treat.minutes, 60);
  assert.equal(treat.seats.length, 6);
  assert.equal(p('B').balance, 80);
  assert.equal(p('G').balance, 80, 'người đang chờ cũng có phần');
  assert.equal(p('A').balance, 20 + 299 * 30 + 60);
});

test('mua lại tiệm: bảng hiệu đổi tên bossSeconds giây rồi trả lại', () => {
  const { cafe, of, advance, now } = setup();
  cafe.gift(who('Đại gia'), 1000);
  const [boss] = of('boss');
  assert.equal(boss.boss.name, 'Đại gia');
  assert.equal(boss.boss.until, now() + 600_000);
  advance(600_100);
  assert.equal(of('boss').at(-1).boss, null);
});

test('gõ về thì nhường máy cho người chờ, giờ còn lại để dành cho lần sau', () => {
  const { cafe, of, p, advance } = setup();
  fill(cafe, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  advance(5_000);
  cafe.gift(who('A'), 10);
  const aSeat = p('A').seat;
  cafe.comment(who('A'), 'về nha');
  assert.equal(of('leave')[0].reason, 'home');
  assert.equal(p('G').seat, aSeat);
  const left = p('A').balance;
  assert.ok(left > 300);
  cafe.comment(who('A'), 'ngoi');
  assert.equal(p('A').balance, left, 'giờ đã nạp vẫn còn');
  assert.deepEqual(cafe.comment(who('A'), 've'), { kind: 'unqueue' });
});

test('cúp điện: không trừ giờ, không cày điểm', () => {
  const { cafe, p, advance, of } = setup();
  fill(cafe, ['An']);
  cafe.startEvent('blackout');
  advance(5_000);
  assert.equal(p('An').balance, 20);
  assert.equal(p('An').score, 0);
  advance(3_000);
  assert.equal(of('blackout').at(-1).blackout, null);
  assert.ok(Math.abs(p('An').balance - 19) < 1e-6);
});

test('mẹ tới kiếm: gõ trốn kịp thì ở lại và được thêm giờ', () => {
  const { cafe, p, of } = setup();
  fill(cafe, ['A', 'B', 'C']);
  assert.equal(cafe.startEvent('mom'), true);
  const { mom } = of('mom')[0];
  assert.equal(mom.phase, 'come');
  assert.equal(mom.text, `${mom.name} về ăn cơm`);
  cafe.comment(who(mom.name), 'trốn');
  assert.equal(of('mom').at(-1).mom.phase, 'hide');
  assert.equal(p(mom.name).balance, 20 + 1 + 10, 'comment +1, trốn kịp +10');
  assert.notEqual(p(mom.name).seat, null);
});

test('mẹ tới kiếm: không trốn thì bị xách về; người đã tặng quà không bị chọn', () => {
  const { cafe, p, of, advance } = setup();
  fill(cafe, ['A', 'B', 'C']);
  cafe.gift(who('A'), 1);
  cafe.gift(who('B'), 1);
  cafe.startEvent('mom');
  assert.equal(of('mom')[0].mom.name, 'C');
  advance(12_000);
  assert.equal(of('mom').at(-1).mom.phase, 'drag');
  assert.equal(of('leave').at(-1).reason, 'mom');
  assert.equal(p('C').seat, null);
  advance(4_000);
  assert.equal(of('mom').at(-1).mom, null);
});

test('giờ vàng: chơi đúng game được cộng hệ số, gõ tên game để đổi', () => {
  const { cafe, p, of, advance } = setup();
  fill(cafe, ['An']);
  cafe.comment(who('An'), 'cs');
  assert.equal(p('An').game, 'cs');
  assert.equal(of('game')[0].code, 'cs');
  cafe.startEvent('golden');
  const { golden } = of('golden')[0];
  assert.equal(golden.code, 'volam');
  assert.equal(cafe.publicPlayer(p('An')).rate, 1);
  cafe.comment(who('An'), 'vl');
  advance(5_000);
  assert.ok(Math.abs(p('An').score - 10) < 1e-6);
});

test('gõ tên game khi chưa ngồi là vào máy chơi game đó luôn', () => {
  const { cafe, p } = setup();
  assert.deepEqual(cafe.comment(who('An'), 'aoe'), { kind: 'seat', seat: 2 });
  assert.equal(p('An').game, 'aoe');
});

test('buzz rung máy một bạn khác, mỗi người 20 giây một lần', () => {
  const { cafe, of, p, advance } = setup();
  fill(cafe, ['A', 'B']);
  assert.deepEqual(cafe.comment(who('A'), 'buzz'), { to: p('B').seat });
  assert.equal(cafe.comment(who('A'), 'buzz'), null);
  advance(20_000);
  assert.ok(cafe.comment(who('A'), 'buzz'));
  assert.equal(of('buzz').length, 2);
});

test('xem giờ, follow một lần, share có giãn cách', () => {
  const { cafe, of, events } = setup();
  cafe.comment(who('Lạ'), 'giờ');
  assert.equal(events.find((e) => e.type === 'say')?.text, 'Lạ chưa ngồi');
  fill(cafe, ['An']);
  cafe.comment(who('An'), 'giờ');
  assert.deepEqual(of('check').map((c) => [c.minutes, c.pos]), [[21, 0]], 'comment lúc đang chơi cũng được +1');
  assert.equal(cafe.social(who('An'), 'follow'), 30);
  assert.equal(cafe.social(who('An'), 'follow'), 0);
  assert.equal(cafe.social(who('An'), 'share'), 15);
  assert.equal(cafe.social(who('An'), 'share'), 0);
});

test('lưu và nạp lại: điểm, giờ còn lại, không lưu ảnh đại diện', () => {
  const { cafe, advance } = setup();
  cafe.gift({ id: 'id:An', name: 'An', avatar: 'https://p16.tiktokcdn.com/a.webp' }, 10);
  advance(4_000);
  const saved = JSON.parse(JSON.stringify(cafe.exportState()));
  assert.ok(!JSON.stringify(saved).includes('tiktokcdn'));
  const { cafe: again, p } = setup();
  again.importState(saved);
  assert.ok(Math.abs(p('An').score - 8) < 0.01);
  assert.ok(Math.abs(p('An').balance - 296) < 0.01);
  assert.equal(p('An').paid, true);
  assert.equal(p('An').seat, null, 'mở lại server thì tiệm trống');
  assert.equal(again.board()[0].name, 'An');
});
