import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Director } from '../src/director.js';
import { Game, PHASE } from '../src/game.js';
import { GiftCatalog } from '../src/gifts.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
config.demo.enabled = false; // Cặp diễn mẫu có file test riêng.
const lines = JSON.parse(readFileSync(new URL('../lines.json', import.meta.url), 'utf8'));
const off = { enabled: false, clip: async () => null, ready: () => null, duration: () => 0 };

function setup({ voices = { duy: off, linh: off } } = {}) {
  const clock = { t: 5_000_000 };
  const says = [];
  const director = new Director({
    lines,
    voices,
    now: () => clock.t,
    rng: () => 0,
    emit: (message) => {
      if (message.type === 'say') says.push({ ...message, at: clock.t });
    },
  });
  const game = new Game({ config, catalog: new GiftCatalog(config.gifts), director, now: () => clock.t });
  director.attach(game);
  const run = (ms) => {
    const end = clock.t + ms;
    while (clock.t < end) {
      clock.t = Math.min(end, clock.t + 50);
      game.tick();
      director.tick();
    }
  };
  const u = (id, name = id) => ({ id, name });
  const seat = () => {
    game.gift({ user: u('nam', 'Minh'), gift: { name: 'Lucky Pig', coins: 10 } });
    game.gift({ user: u('nu', 'Lan'), gift: { name: 'Clover', coins: 10 } });
  };
  const toPhase = (phase) => {
    for (let i = 0; i < 6000 && game.phase !== phase; i++) run(50);
    assert.equal(game.phase, phase);
  };
  return { clock, says, director, game, run, u, seat, toPhase };
}

test('mọi câu nối tiếp, không có hai giọng chồng nhau', () => {
  const { says, run, seat } = setup();
  run(10_000);
  seat();
  run(120_000);
  for (let i = 1; i < says.length; i++) {
    const previous = says[i - 1];
    // Trong cửa 10 giây lịch đếm cố định được phép cắt câu trước; trang game dừng giọng cũ khi có câu mới.
    if (['Ba.', 'Hai.', 'Một.', 'Hết giờ!', 'Khán đài cùng chờ câu trả lời nào.', 'Hai bạn cứ chọn theo lòng mình nhé.', 'Mười giây, bắt đầu!'].includes(says[i].text)) continue;
    assert.ok(says[i].at >= previous.at + previous.ms, `"${says[i].text}" chen vào "${previous.text}"`);
  }
});

test('một vòng chơi có đủ lời mời, hướng dẫn, lịch đếm và kết quả, tên điền đúng', () => {
  const { says, game, run, seat, toPhase } = setup();
  run(300);
  seat();
  toPhase(PHASE.DECIDE);
  const open = game.deadline - 10_000;
  run(10_100);
  const text = says.map((s) => s.text);
  assert.ok(text.includes('Bên Heo đã có người, bên Cỏ cũng vừa đủ. Mời Minh và Lan lên sân khấu nào!'));
  assert.ok(text.some((line) => line.startsWith('Đến lượt hai bạn chọn rồi')));
  const timing = (line) => says.find((s) => s.text === line).at - open;
  assert.ok(Math.abs(timing('Mười giây, bắt đầu!')) <= 100);
  assert.ok(Math.abs(timing('Ba.') - 7000) <= 100);
  assert.ok(Math.abs(timing('Hai.') - 8000) <= 100);
  assert.ok(Math.abs(timing('Một.') - 9000) <= 100);
  assert.ok(Math.abs(timing('Hết giờ!') - 10_000) <= 150);
  assert.ok(text.includes('Mình chưa nhận đủ hai câu trả lời trong thời gian quy định.') || game.phase === PHASE.RESULT);
});

test('trong cửa 10 giây không chèn đọc tên người gửi quà hay chào người mới', () => {
  const { says, game, run, seat, toPhase, u } = setup();
  run(300);
  seat();
  toPhase(PHASE.DECIDE);
  const count = says.length;
  game.join(u('moi', 'Người Mới'));
  game.gift({ user: u('v', 'Khách'), gift: { name: 'Gift Box', coins: 100 } });
  run(9000);
  const during = says.slice(count).map((s) => s.text);
  assert.ok(during.every((line) => !line.includes('Người Mới') && !line.includes('Khách') && !line.includes('Hộp quà')));
});

test('câu của cặp cũ hết hiệu lực khi chuyển cặp', () => {
  const { says, game, run, seat, toPhase, u } = setup();
  run(300);
  seat();
  toPhase(PHASE.RESULT);
  game.gift({ user: u('n2', 'Hùng'), gift: { name: 'Lucky Pig', coins: 10 } });
  game.gift({ user: u('f2', 'Mai'), gift: { name: 'Clover', coins: 10 } });
  toPhase(PHASE.INVITE);
  const start = says.length;
  run(8000);
  const after = says.slice(start).map((s) => s.text).join(' ');
  assert.ok(!after.includes('Minh'), after);
  assert.ok(after.includes('Hùng'), after);
});

test('nhánh "điểm đang lên" chỉ dùng khi điểm thật tăng', () => {
  const quiet = setup();
  quiet.run(300);
  quiet.seat();
  quiet.toPhase(PHASE.GUIDE);
  assert.ok(quiet.says.some((s) => s.text === 'Khán đài hôm nay nghe chăm chú ghê.'));
  assert.ok(!quiet.says.some((s) => s.text.startsWith('Bảng điểm đang lên')));

  // Điểm tăng giữa cảnh cổ vũ vẫn được nhắc đúng số mới nhất.
  const loud = setup();
  loud.run(300);
  loud.seat();
  loud.toPhase(PHASE.CHEER);
  loud.game.comment({ user: loud.u('v'), text: 'đẹp đôi' });
  loud.toPhase(PHASE.GUIDE);
  assert.ok(loud.says.some((s) => s.text === 'Bảng điểm đang lên rồi, cặp mình đã có 1 điểm đẹp đôi!'));
});

test('một vòng đầy đủ khi chưa có giọng thật dài gần bằng khi có giọng (đo được 96-99 giây)', () => {
  const { game, run, seat, toPhase, clock } = setup();
  run(300);
  seat();
  const start = clock.t;
  toPhase(PHASE.GUIDE);
  toPhase(PHASE.DECIDE);
  toPhase(PHASE.RESULT);
  toPhase(PHASE.TRANSITION);
  toPhase(PHASE.WAITING);
  const seconds = (clock.t - start) / 1000;
  assert.ok(seconds >= 85 && seconds <= 105, `${seconds} giây`);
  assert.equal(game.pair, null);
});

test('cụm giao lưu không lặp trong ba phút, nhắc đăng ký tối đa một lần mỗi phút', () => {
  const { says, run, toPhase } = setup();
  toPhase(PHASE.WAITING);
  const start = says.length;
  const startAt = says.at(-1).at;
  run(179_000);
  const idle = says.slice(start);
  const seen = new Map();
  for (const say of idle) {
    if (say.text.includes('gửi quà Heo') || say.text.startsWith('Còn ai thích ngồi xem')) continue;
    if (seen.has(say.text)) assert.ok(say.at - seen.get(say.text) >= 180_000, `lặp: ${say.text}`);
    seen.set(say.text, say.at);
  }
  const reminders = idle.filter((say) => say.text.includes('gửi quà Heo')).map((say) => say.at);
  for (let i = 1; i < reminders.length; i++) assert.ok(reminders[i] - reminders[i - 1] >= 60_000);
  assert.ok(idle.length > 0 && startAt);
});

test('có giọng thật: độ dài câu lấy từ file mp3, không ước lượng', () => {
  const voice = { enabled: true, clip: async () => 'x', ready: (text) => `id-${text}`, duration: () => 2000 };
  const { says, run } = setup({ voices: { duy: voice, linh: voice } });
  run(100);
  assert.equal(says[0].clips.length, 1);
  assert.equal(says[0].ms, 2000 - 200 + 40);
});

test('tên chưa có giọng: chờ một nhịp, không đọc câu mất chữ, hết chờ thì mời chung', () => {
  const missing = new Set(['Lan']);
  const voice = { enabled: true, clip: async () => null, ready: (text) => (missing.has(text) ? null : `id-${text}`), duration: () => 1000 };
  const { says, game, run, seat, clock } = setup({ voices: { duy: voice, linh: voice } });
  run(300);
  seat();
  game.tick();
  const start = says.length;
  const at = clock.t;
  run(1000);
  assert.ok(!says.slice(start).some((s) => s.text.startsWith('Bên Heo')), 'còn trong lúc chờ tên');
  run(3500);
  const invite = says.slice(start).find((s) => s.text.startsWith('Bên Heo'));
  assert.equal(invite.text, 'Bên Heo đã có người, bên Cỏ cũng vừa đủ. Mời hai bạn lên sân khấu nào!');
  assert.ok(invite.clips.length > 0);
  assert.ok(invite.at - at >= 2400);
});

test('tên có giọng kịp lúc thì đọc đủ tên, không phải chờ hết nhịp', () => {
  const voice = { enabled: true, clip: async () => null, ready: (text) => `id-${text}`, duration: () => 1000 };
  const { says, game, run, seat } = setup({ voices: { duy: voice, linh: voice } });
  run(300);
  seat();
  game.tick();
  const start = says.length;
  run(8000);
  const invite = says.slice(start).find((s) => s.text.startsWith('Bên Heo'));
  assert.ok(invite.text.includes('Minh và Lan'));
  assert.equal(invite.clips.length, 5);
});

test('một câu thiếu mẩu giọng thì chỉ hiện phụ đề, không phát nửa câu', () => {
  const voice = { enabled: true, clip: async () => null, ready: (text) => (text.startsWith('Đã vào hàng') ? null : `id-${text}`), duration: () => 1000 };
  const { says, run } = setup({ voices: { duy: voice, linh: voice } });
  run(90_000);
  const broken = says.filter((s) => s.text.startsWith('Đã vào hàng'));
  assert.ok(broken.length);
  assert.ok(broken.every((s) => s.clips.length === 0));
});

test('quà trong phần làm quen: MC chen lời cảm ơn gọi tên người gửi và chúc phúc hai bạn', () => {
  const { says, game, run, seat, toPhase, u } = setup();
  run(300);
  seat();
  toPhase(PHASE.INTRO);
  run(1000);
  const start = says.length;
  game.gift({ user: u('v', 'Khách'), gift: { name: 'Rose', coins: 1 } });
  toPhase(PHASE.CHEER);
  const spoken = says.slice(start);
  const index = spoken.findIndex((s) => /Khách/.test(s.text));
  assert.ok(index >= 0, 'phải gọi tên người gửi');
  assert.ok(/[Cc]ảm ơn|chúc phúc/.test(spoken[index].text));
  const pair = spoken.slice(index, index + 2).map((s) => s.text).join(' ');
  assert.ok(/[Cc]húc|Mong/.test(pair), pair);
  assert.notEqual(spoken[index].who, spoken[index + 1].who, 'hai MC đối đáp');
});

test('cảm ơn chen vào không làm phần làm quen dài thêm quá một câu', () => {
  const a = setup();
  a.run(300);
  a.seat();
  a.toPhase(PHASE.INTRO);
  const withoutStart = a.clock.t;
  a.toPhase(PHASE.CHEER);
  const without = a.clock.t - withoutStart;

  const b = setup();
  b.run(300);
  b.seat();
  b.toPhase(PHASE.INTRO);
  const withStart = b.clock.t;
  b.run(500);
  b.game.gift({ user: b.u('v', 'Khách'), gift: { name: 'Rose', coins: 1 } });
  b.toPhase(PHASE.CHEER);
  const withThanks = b.clock.t - withStart;
  assert.ok(withThanks <= without + 3000, `${withThanks} so với ${without}`);
});

test('quà gửi lúc đang đếm 10 giây được cảm ơn sau khi có kết quả, không đọc trong lúc đếm', () => {
  const { says, game, run, seat, toPhase, u } = setup();
  run(300);
  seat();
  toPhase(PHASE.DECIDE);
  const start = says.length;
  game.gift({ user: u('v', 'Khách'), gift: { name: 'Gift Box', coins: 100 } });
  run(9000);
  assert.ok(!says.slice(start).some((s) => /Khách/.test(s.text)));
  toPhase(PHASE.WAITING);
  assert.ok(says.slice(start).some((s) => /Khách/.test(s.text)), 'phải được cảm ơn trước khi hết lượt');
});

test('quà lớn được cảm ơn ngay, không chờ hết khoảng nghỉ', () => {
  const { says, game, run, seat, toPhase, u } = setup();
  run(300);
  seat();
  toPhase(PHASE.INTRO);
  game.gift({ user: u('a', 'Khách Nhỏ'), gift: { name: 'Rose', coins: 1 } });
  run(5000);
  game.gift({ user: u('b', 'Khách Lớn'), gift: { name: 'Gift Box', coins: 100 } });
  run(18_000);
  // Nói nối tiếp ngay sau lượt cảm ơn trước: nếu phải chờ hết khoảng nghỉ thì câu dẫn sẽ chen vào giữa.
  const index = says.findIndex((s) => /Khách Lớn/.test(s.text));
  assert.ok(index > 0, 'phải được cảm ơn');
  const scripted = new Set(lines.intro.map(([, text]) => text));
  assert.ok(!scripted.has(says[index - 1].text), `câu trước đó: ${says[index - 1].text}`);
});

test('chuyển cảnh không cắt mất câu chúc phúc của lượt cảm ơn đang nói', () => {
  const { says, game, run, seat, toPhase, u } = setup();
  run(300);
  seat();
  toPhase(PHASE.INTRO);
  game.gift({ user: u('a', 'Khách'), gift: { name: 'Rose', coins: 1 } });
  toPhase(PHASE.GUIDE);
  const index = says.findIndex((s) => /Khách/.test(s.text));
  assert.ok(index >= 0);
  assert.ok(/Chúc|Mong|chúc/.test(says[index + 1].text), says[index + 1].text);
  // Cứ mỗi 12 giây lại có quà, sát lúc đổi cảnh vẫn không rơi câu thứ hai.
  const b = setup();
  b.run(300);
  b.seat();
  b.toPhase(PHASE.INTRO);
  for (let i = 0; i < 5; i++) {
    b.game.gift({ user: b.u(`g${i}`, `Khách${i}`), gift: { name: 'Finger Heart', coins: 5 } });
    b.run(9000);
  }
  const thanked = b.says.map((s, at) => (/Khách\d/.test(s.text) ? at : -1)).filter((at) => at >= 0);
  for (const at of thanked) {
    const next = b.says[at + 1]?.text ?? '';
    assert.ok(!next || b.says[at].who !== b.says[at + 1].who, `${b.says[at].text} -> ${next}`);
  }
});

test('lời chúc của cặp cũ không đọc sang cặp mới', () => {
  const { says, game, run, seat, toPhase, u } = setup();
  run(300);
  seat();
  toPhase(PHASE.RESULT);
  game.gift({ user: u('v', 'Khách'), gift: { name: 'Rose', coins: 1 } });
  game.gift({ user: u('n2', 'Hùng'), gift: { name: 'Lucky Pig', coins: 10 } });
  game.gift({ user: u('f2', 'Mai'), gift: { name: 'Clover', coins: 10 } });
  toPhase(PHASE.INVITE);
  const start = says.length;
  run(25_000);
  assert.ok(!says.slice(start).some((s) => /Khách/.test(s.text)));
});

test('lời cảm ơn liên tiếp không lặp một kiểu; quà chưa rõ tên thì không đọc tên quà', () => {
  const { says, game, run, seat, toPhase, u } = setup();
  run(300);
  seat();
  toPhase(PHASE.INTRO);
  game.gift({ user: u('a', 'Khách'), gift: { name: 'Rose', coins: 1 } });
  run(13_000);
  game.gift({ user: u('a', 'Khách'), gift: { name: 'Rose', coins: 1 } });
  run(13_000);
  const lines = says.filter((s) => /Khách/.test(s.text)).map((s) => s.text);
  assert.ok(lines.length >= 2 && new Set(lines).size === lines.length, lines.join(' | '));

  const other = setup();
  other.run(300);
  other.seat();
  other.toPhase(PHASE.INTRO);
  other.game.gift({ user: other.u('a', 'Khách'), gift: { name: 'Quà Lạ Lắm', coins: 2 } });
  other.toPhase(PHASE.CHEER);
  assert.ok(other.says.some((s) => /Khách/.test(s.text)));
  assert.ok(!other.says.some((s) => s.text.includes('Quà Lạ Lắm')));
});

test('lời chúc không nói thay cảm xúc, không ép đồng ý', () => {
  const text = JSON.stringify(lines.wishes) + JSON.stringify(lines.wishLate);
  assert.ok(!/thích nhau|phải đồng ý|nên đồng ý|đẹp đôi quá|tặng quà/i.test(text));
});

test('lời thoại không nhắc tới tuổi', () => {
  assert.ok(!/mười tám|18 tuổi|đủ tuổi/i.test(JSON.stringify(lines)));
});

test('kho lời thoại có đủ mọi cảnh mà trò chơi gọi tới', () => {
  for (const name of ['opening', 'invite', 'intro', 'cheer', 'guide', 'matched', 'mismatch', 'noresponse', 'withdrawn', 'removed', 'nextReady', 'nextWait', 'pausedConnection', 'pausedOperator', 'reconfirm', 'resumedEmpty', 'reconfirmEnd']) {
    assert.ok(lines[name]?.length, `thiếu cảnh ${name}`);
  }
  const { director } = setup();
  const parts = director.staticParts();
  assert.ok(parts.duy.length > 20 && parts.linh.length > 20);
  assert.ok(![...parts.duy, ...parts.linh].some((part) => /[{}“”‘’]/.test(part)));
});
