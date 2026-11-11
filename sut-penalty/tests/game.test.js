import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, normalize } from '../src/game.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

// rng lặp lại dãy số cho trước; now chỉnh tay.
function setup({ rolls = [0.99], saveChance = config.saveChance } = {}) {
  const events = [];
  let i = 0;
  const clock = { t: 1_000_000 };
  const game = new Game({ ...config, saveChance }, {
    emit: (msg) => events.push(msg),
    rng: () => rolls[i++ % rolls.length],
    now: () => clock.t,
  });
  return { game, events, clock };
}
const fan = (n) => ({ id: `u${n}`, name: `Người ${n}`, avatar: '' });
const shots = (events) => events.filter((e) => e.type === 'shot');
function drain(game, clock, max = 10_000) {
  for (let i = 0; i < max && game.totalPending(); i++) {
    clock.t += 10_000;
    game.tick();
  }
}

test('normalize bỏ dấu, chữ hoa và ký tự lạ', () => {
  assert.equal(normalize('  BARÇA!!! vô địch '), 'barca vo dich');
  assert.equal(normalize('Quỷ Đỏ'), 'quy do');
});

test('comment tên đội để vào đội, nhắc hai đội thì bỏ qua', () => {
  const { game, events } = setup();
  assert.equal(game.comment(fan(1), 'MU vô địch')?.team, 'mu');
  assert.equal(game.comment(fan(2), 'Barça ơi')?.team, 'barca');
  assert.equal(game.comment(fan(3), 'MU hơn Real'), null);
  assert.equal(game.comment(fan(3), 'mua đồ'), null, '"mua" không phải MU');
  assert.equal(game.comment(fan(4), 'Paris Saint-Germain')?.team, 'psg');
  assert.equal(game.comment(fan(5), 'real madrid')?.team, 'real');
  assert.deepEqual(events.filter((e) => e.type === 'join').map((e) => e.team), ['mu', 'barca', 'psg', 'real']);
});

test('comment lại đội cũ không báo lại; đổi đội thì chuyển fan', () => {
  const { game, events } = setup();
  game.comment(fan(1), 'mu');
  assert.deepEqual(game.comment(fan(1), 'MU MU'), { team: 'mu', already: true });
  assert.deepEqual(game.comment(fan(1), 'psg'), { team: 'psg', from: 'mu' });
  assert.equal(events.filter((e) => e.type === 'join').length, 2);
  assert.deepEqual(game.board().fans, { mu: 0, real: 0, barca: 0, psg: 1 });
});

test('quà đổi ra lượt sút: hoa hồng 1, bánh vòng 50, hộp quà 200, quà khác theo xu', () => {
  const { game } = setup();
  game.comment(fan(1), 'mu');
  assert.equal(game.gift(fan(1), { coins: 1 }, 3).shots, 3);
  assert.equal(game.gift(fan(1), { coins: 30 }, 1).shots, 50);
  assert.equal(game.gift(fan(1), { coins: 100 }, 2).shots, 400);
  assert.equal(game.gift(fan(1), { coins: 5 }, 1).shots, 5 * config.otherGiftShotsPerCoin);
  assert.equal(game.board().pending.mu, 458);
  assert.equal(game.board().heads.mu.left, 458, 'lượt của cùng một người dồn vào một chỗ');
});

test('tim cộng dồn theo người: đủ 50 tim được 1 lượt sút, phần lẻ giữ lại', () => {
  const { game, events } = setup();
  game.comment(fan(1), 'psg');
  assert.deepEqual(game.like(fan(1), 30), { team: 'psg', shots: 0, likes: 30 });
  assert.equal(events.filter((e) => e.type === 'likes').length, 0);
  assert.deepEqual(game.like(fan(1), 125), { team: 'psg', shots: 3, auto: false, likes: 5 });
  assert.equal(events.at(-1).type, 'likes');
  assert.equal(events.at(-1).likes, 150);
  assert.equal(game.board().pending.psg, 3);
  game.like(fan(2), 49);
  assert.equal(game.totalPending(), 3, 'tim của người khác không cộng chung');
  assert.equal(game.like(fan(2), 1).auto, true, 'chưa chọn đội thì được xếp đội');
  const saved = JSON.parse(JSON.stringify(game));
  const { game: copy } = setup();
  copy.restore(saved);
  assert.equal(copy.like(fan(1), 45).shots, 1, 'tim lẻ còn sau khi khởi động lại');
  const { game: off } = setup();
  off.likesPerShot = 0;
  assert.equal(off.like(fan(1), 1000), null);
});

test('tặng quà khi chưa chọn đội thì được xếp vào đội ít fan nhất', () => {
  const { game, events } = setup({ rolls: [0] });
  game.comment(fan(1), 'mu');
  game.comment(fan(2), 'real');
  game.comment(fan(3), 'barca');
  const result = game.gift(fan(9), { coins: 1 }, 1);
  assert.deepEqual(result, { team: 'psg', shots: 1, auto: true });
  assert.equal(events.at(-2).type, 'join');
  assert.equal(events.at(-2).auto, true);
});

test('các đội sút xoay vòng, không đội nào phải chờ hết hàng của đội khác', () => {
  const { game, events, clock } = setup();
  game.comment(fan(1), 'mu');
  game.comment(fan(2), 'real');
  game.gift(fan(1), { coins: 30 }, 1);
  game.gift(fan(2), { coins: 1 }, 2);
  for (let i = 0; i < 6; i++) {
    clock.t += 10_000;
    game.tick();
  }
  assert.deepEqual(shots(events).map((e) => e.team), ['mu', 'real', 'mu', 'real', 'mu', 'mu']);
});

test('không sút khi chưa tới giờ, hàng càng dài sút càng nhanh', () => {
  const { game, events, clock } = setup();
  game.comment(fan(1), 'mu');
  game.gift(fan(1), { coins: 100 }, 1);
  game.tick();
  game.tick();
  assert.equal(shots(events).length, 1);
  const fast = shots(events)[0].gap;
  assert.ok(fast >= config.timing.fastestShotMs && fast < 300, `gap ${fast}`);
  clock.t += fast;
  game.tick();
  assert.equal(shots(events).length, 2);
  assert.equal(game.interval(0), config.timing.shotMs);
  assert.ok(game.interval(1000) === config.timing.fastestShotMs);
});

test('thủ môn bắt đúng theo tỉ lệ; bắt thì bay đúng hướng, thủng lưới thì hướng khác hoặc đứng yên', () => {
  const rolls = Array.from({ length: 997 }, (_, i) => ((i * 7919) % 997) / 997);
  const { game, events, clock } = setup({ rolls });
  game.comment(fan(1), 'mu');
  game.gift(fan(1), { coins: 100 }, 10);
  drain(game, clock);
  const all = shots(events);
  assert.equal(all.length, 2000);
  const saved = all.filter((e) => e.saved).length;
  assert.ok(saved > 900 && saved < 1100, `bắt ${saved}/2000`);
  const side = (e) => (Math.abs(e.tx) < 0.3 ? 0 : Math.sign(e.tx));
  for (const e of all) {
    assert.ok(Math.abs(e.tx) <= 0.9 && e.ty >= 0 && e.ty <= 1);
    if (e.saved) assert.equal(e.dive, side(e));
    else assert.notEqual(e.dive, side(e));
  }
  const { stats } = game.board();
  assert.deepEqual(stats.mu, { goals: 2000 - saved, saved });
});

test('saveChance 0 thì vào hết, 1 thì bắt hết', () => {
  for (const [saveChance, goals] of [[0, 10], [1, 0]]) {
    const { game, clock } = setup({ saveChance, rolls: [0.3, 0.7, 0.1, 0.5] });
    game.comment(fan(1), 'real');
    game.gift(fan(1), { coins: 1 }, 10);
    drain(game, clock);
    assert.equal(game.board().stats.real.goals, goals);
  }
});

test('vua phá lưới, trận mới về 0 nhưng giữ lượt chưa sút và đội của fan', () => {
  const { game, clock } = setup({ saveChance: 0 });
  game.comment(fan(1), 'mu');
  game.comment(fan(2), 'psg');
  game.gift(fan(1), { coins: 1 }, 3);
  game.gift(fan(2), { coins: 1 }, 1);
  drain(game, clock);
  assert.deepEqual(game.board().leaders.map((l) => [l.name, l.goals]), [['Người 1', 3], ['Người 2', 1]]);
  game.gift(fan(1), { coins: 1 }, 5);
  game.reset();
  const board = game.board();
  assert.deepEqual(board.stats.mu, { goals: 0, saved: 0 });
  assert.deepEqual(board.leaders, []);
  assert.equal(board.pending.mu, 5);
  assert.equal(board.fans.mu, 1);
});

test('tạm dừng thì không sút; xóa hàng chờ', () => {
  const { game, events, clock } = setup();
  game.comment(fan(1), 'mu');
  game.gift(fan(1), { coins: 1 }, 5);
  game.pause(true);
  clock.t += 10_000;
  game.tick();
  assert.equal(shots(events).length, 0);
  game.pause(false);
  game.clearQueue();
  game.tick();
  assert.equal(shots(events).length, 0);
  assert.equal(game.totalPending(), 0);
});

test('lưu rồi khôi phục giữ tỉ số, fan và lượt sút chờ', () => {
  const { game, clock } = setup({ saveChance: 0 });
  game.comment(fan(1), 'barca');
  game.gift(fan(1), { coins: 30 }, 1);
  for (let i = 0; i < 10; i++) {
    clock.t += 10_000;
    game.tick();
  }
  const saved = JSON.parse(JSON.stringify(game));
  const { game: copy } = setup();
  copy.restore({ ...saved, queues: { ...saved.queues, khong_co: [{ id: 'x', left: 5 }] } });
  assert.deepEqual(copy.board(), game.board());
  copy.restore(null);
  copy.restore({ stats: 'hỏng', fans: {}, queues: [] });
});
