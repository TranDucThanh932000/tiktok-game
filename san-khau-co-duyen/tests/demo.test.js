import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Director } from '../src/director.js';
import { Game, PHASE, DECIDE_MS } from '../src/game.js';
import { GiftCatalog } from '../src/gifts.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const lines = JSON.parse(readFileSync(new URL('../lines.json', import.meta.url), 'utf8'));
const off = { enabled: false, clip: async () => null, ready: () => null, duration: () => 0 };
const PIG = { name: 'Lucky Pig', coins: 10 };
const CLOVER = { name: 'Clover', coins: 10 };
const BOX = { name: 'Gift Box', coins: 100 };

function setup({ enabled = true } = {}) {
  const clock = { t: 9_000_000 };
  const says = [];
  const events = [];
  const emit = (message) => {
    events.push(message);
    if (message.type === 'say') says.push(message);
  };
  const director = new Director({ lines, voices: { duy: off, linh: off }, now: () => clock.t, rng: () => 0, emit });
  const game = new Game({ config: { ...config, demo: { ...config.demo, enabled } }, catalog: new GiftCatalog(config.gifts), director, emit, now: () => clock.t });
  director.attach(game);
  const run = (ms) => {
    const end = clock.t + ms;
    while (clock.t < end) {
      clock.t = Math.min(end, clock.t + 50);
      game.tick();
      director.tick();
    }
  };
  const u = (id) => ({ id, name: `Người ${id}` });
  const toPhase = (phase) => {
    for (let i = 0; i < 8000 && game.phase !== phase; i++) run(50);
    assert.equal(game.phase, phase);
  };
  const toDemo = () => {
    toPhase(PHASE.WAITING);
    run((config.demo.idleSeconds + 1) * 1000);
    assert.equal(game.pair?.demo, true);
  };
  return { clock, says, events, game, director, run, u, toPhase, toDemo };
}

test('hai hàng trống đủ lâu thì bot ghép với bot, có nói rõ là diễn mẫu', () => {
  const { game, says, run, toPhase } = setup();
  toPhase(PHASE.WAITING);
  run((config.demo.idleSeconds - 2) * 1000);
  assert.equal(game.pair, null, 'chưa tới giờ');
  run(3000);
  assert.equal(game.pair.demo, true);
  assert.ok(game.pair.male.id.startsWith('demo:') && game.pair.female.id.startsWith('demo:'));
  run(8000);
  const spoken = says.map((s) => s.text).join(' ');
  assert.ok(spoken.includes('diễn mẫu'), spoken);
});

test('có một người thật trong hàng thì không mở cặp mẫu, người đó chờ người thật', () => {
  const { game, run, toPhase, u } = setup();
  toPhase(PHASE.WAITING);
  game.gift({ user: u('that'), gift: PIG });
  run(180_000);
  assert.equal(game.pair, null);
  assert.equal(game.queues.male[0].id, 'that');
  game.gift({ user: u('that-2'), gift: CLOVER });
  run(100);
  assert.equal(game.pair.demo, false);
  assert.equal(game.pair.male.id, 'that');
  assert.equal(game.pair.female.id, 'that-2');
});

test('đang diễn mẫu mà một người thật đăng ký: không bị ghép với bot, hết lượt mẫu không mở lượt mới', () => {
  const { game, run, u, toDemo } = setup();
  toDemo();
  game.gift({ user: u('that'), gift: PIG });
  assert.equal(game.pair.demo, true);
  for (let i = 0; i < 200; i++) {
    run(1000);
    if (game.pair) assert.ok(game.pair.demo, 'không có cặp nào trộn người thật với bot');
    if (game.pair) assert.ok(game.pair.male.id !== 'that' && game.pair.female.id !== 'that');
  }
  assert.equal(game.pair, null);
  assert.equal(game.queues.male[0].id, 'that');
});

test('đủ hai người thật thì cặp mẫu nhường ngay, cặp thật lên với số 1', () => {
  const { game, says, run, u, toDemo, toPhase } = setup();
  toDemo();
  toPhase(PHASE.INTRO);
  game.gift({ user: u('a'), gift: PIG });
  game.gift({ user: u('b'), gift: CLOVER });
  game.tick();
  assert.equal(game.phase, PHASE.TRANSITION);
  assert.equal(game.pair.closed, true);
  run(600);
  assert.ok(says.some((s) => s.text.includes('nhường sân khấu')));
  run(config.demo.yieldSeconds * 1000);
  assert.equal(game.pair.demo, false);
  assert.equal(game.pair.no, 1);
  assert.equal(game.pair.male.id, 'a');
  assert.equal(game.phase, PHASE.INVITE);
});

test('quà thật không tính cho cặp mẫu; Heo/Cỏ vẫn đăng ký; đẹp đôi vẫn lên bảng điểm mẫu', () => {
  const { game, events, u, toDemo } = setup();
  toDemo();
  game.gift({ user: u('v'), gift: BOX });
  assert.equal(game.pair.score, 0);
  assert.equal(game.pair.coins, 0);
  const sent = events.filter((m) => m.type === 'gift').at(-1);
  assert.equal(sent.state, 'demo');
  assert.equal(sent.points, 0);
  assert.equal(sent.wish, '');
  game.gift({ user: u('n'), gift: PIG });
  assert.equal(game.queues.male[0].id, 'n');
  assert.equal(game.pair.score, 0);
  game.comment({ user: u('v'), text: 'đẹp đôi' });
  assert.equal(game.pair.score, 1);
});

test('MC không cảm ơn quà như chúc cặp mẫu', () => {
  const { game, says, run, u, toDemo } = setup();
  toDemo();
  const start = says.length;
  game.gift({ user: u('Quang'), gift: BOX });
  run(15_000);
  assert.ok(!says.slice(start).some((s) => s.text.includes('Người Quang')));
});

test('cặp mẫu tự trả lời trong đúng 10 giây, giấu đáp án tới hết giờ, người thật không chọn thay được', () => {
  const { game, clock, run, u, toDemo, toPhase } = setup();
  toDemo();
  toPhase(PHASE.DECIDE);
  game.comment({ user: u('v'), text: 'đồng ý' });
  const pair = game.pair;
  run(DECIDE_MS - 500);
  assert.equal(game.phase, PHASE.DECIDE);
  assert.equal(game.snapshot().pair.choices, null);
  assert.ok(!/:"(no|yes)"/.test(JSON.stringify(game.snapshot())));
  clock.t = game.deadline;
  game.tick();
  assert.equal(game.phase, PHASE.RESULT);
  assert.ok(['matched', 'mismatch', 'noresponse'].includes(pair.result));
  assert.ok(pair.male.id.startsWith('demo:'));
});

test('cặp mẫu không vào lịch sử, không lấy số cặp, không lưu lại khi khởi động lại', () => {
  const { game, toDemo, toPhase, run } = setup();
  toDemo();
  assert.deepEqual(JSON.parse(JSON.stringify(game.exportState())).interrupted, null);
  toPhase(PHASE.RESULT);
  toPhase(PHASE.TRANSITION);
  run(100);
  assert.equal(game.snapshot().memory, null, 'không có thẻ kỷ niệm');
  toPhase(PHASE.WAITING);
  assert.equal(game.history.length, 0);
  assert.equal(game.pairNo, 0);
  assert.ok(![...game.viewers.keys()].some((id) => id.startsWith('demo:')), 'không tính là người xem');
});

test('sau một lượt mẫu vẫn vắng thì chờ rồi diễn cặp khác; tắt công tắc thì không diễn', () => {
  const a = setup();
  a.toDemo();
  const first = a.game.pair.male.name;
  a.toPhase(PHASE.WAITING);
  a.run((config.demo.idleSeconds + 1) * 1000);
  assert.equal(a.game.pair?.demo, true);
  assert.notEqual(a.game.pair.male.name, first);
  a.game.setDemo(false);
  a.toPhase(PHASE.WAITING);
  a.run(60_000);
  assert.equal(a.game.pair, null);

  const b = setup({ enabled: false });
  b.toPhase(PHASE.WAITING);
  b.run(120_000);
  assert.equal(b.game.pair, null);
});

test('mất kết nối lúc diễn mẫu: bỏ cặp mẫu, không hỏi lại ai, không đẩy bot vào hàng', () => {
  const { game, toDemo } = setup();
  toDemo();
  game.pause('connection');
  assert.equal(game.pair, null);
  game.resume();
  assert.equal(game.phase, PHASE.WAITING);
  assert.equal(game.queues.male.length + game.queues.female.length, 0);
});

test('tên diễn viên được tạo sẵn giọng', () => {
  const { director } = setup();
  const parts = director.staticParts();
  for (const { male, female } of config.demo.pairs) {
    assert.ok(parts.duy.includes(male) && parts.duy.includes(female));
  }
});
