import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Club, GiftCounter, matchesKeyword, tierFor, validateConfig } from '../src/club.js';

const base = JSON.parse(readFileSync(path.join(import.meta.dirname, '..', 'config.json'), 'utf8'));

function setup(overrides = {}) {
  const cfg = structuredClone(base);
  Object.assign(cfg.floor, overrides.floor);
  Object.assign(cfg.gifts, overrides.gifts);
  const clock = { t: 1_000_000 };
  let r = 0;
  const club = new Club(cfg, { now: () => clock.t, random: () => (r = (r + 0.37) % 1) });
  const events = [];
  club.on((type, data) => type !== 'changed' && events.push({ type, ...data }));
  const advance = (ms, step = 100) => {
    for (let i = 0; i < ms; i += step) {
      clock.t += step;
      club.tick();
    }
  };
  const who = (n) => ({ id: `u${n}`, name: `User ${n}` });
  return { club, clock, events, advance, who, cfg };
}

test('config.json hợp lệ', () => {
  assert.deepEqual(validateConfig(base), []);
});

test('nhận diện comment hey', () => {
  const kw = ['hey'];
  assert.ok(matchesKeyword('hey', kw));
  assert.ok(matchesKeyword('HEYYY mọi người', kw));
  assert.ok(matchesKeyword('ok hey!', kw));
  assert.ok(!matchesKeyword('they', kw));
  assert.ok(!matchesKeyword('heya', kw));
  assert.ok(!matchesKeyword('xin chào', kw));
});

test('tier theo tổng xu', () => {
  const t = (c) => tierFor(base.tiers, c).tier;
  assert.equal(t(1), 1);
  assert.equal(t(4), 1);
  assert.equal(t(5), 2);
  assert.equal(t(29), 2);
  assert.equal(t(30), 3);
  assert.equal(t(100), 4);
  assert.equal(t(999), 4);
  assert.equal(t(5000), 5);
});

test('comment hey vào sàn, hết chỗ thì vào hàng chờ FIFO', () => {
  const { club, advance, who } = setup({ floor: { maxDancers: 3, spawnPerSecond: 100 } });
  for (let i = 1; i <= 5; i++) club.comment(who(i), 'hey');
  assert.equal(club.dancers.size, 3);
  assert.deepEqual(
    club.waitlist.map((w) => w.id),
    ['u4', 'u5'],
  );
  club.leave(club.dancers.get('u2'), 'test');
  advance(200);
  assert.ok(club.dancers.has('u4'));
  assert.equal(club.dancers.get('u4').slot, 1);
  assert.deepEqual(
    club.waitlist.map((w) => w.id),
    ['u5'],
  );
});

test('giới hạn tốc độ spawn khi spam', () => {
  const { club, advance, who } = setup({ floor: { spawnPerSecond: 4 } });
  for (let i = 1; i <= 20; i++) club.comment(who(i), 'hey');
  assert.ok(club.dancers.size <= 4);
  advance(5000);
  assert.equal(club.dancers.size, 20);
});

test('comment thường không tạo dancer', () => {
  const { club, who } = setup();
  club.comment(who(1), 'xin chào');
  assert.equal(club.dancers.size, 0);
});

test('quà gộp combo rồi tạo một lượt biểu diễn đúng tier', () => {
  const { club, advance, who, events } = setup();
  club.gift(who(1), { coins: 1, units: 5 });
  club.gift(who(1), { coins: 1, units: 5 });
  assert.equal(club.queue.length, 0);
  advance(2600);
  const perform = events.find((e) => e.type === 'perform');
  assert.ok(perform, 'phải bắt đầu biểu diễn');
  assert.equal(perform.tier, 2);
  assert.equal(perform.performerId, 'u1');
  assert.ok(club.dancers.has('u1'), 'người tặng quà được đưa lên sàn');
});

test('không cắt ngang màn đang diễn, chỉ một performer', () => {
  const { club, advance, who } = setup({ gifts: { comboWindowMs: 0, minChillMs: 0 } });
  club.gift(who(1), { coins: 1 });
  advance(100);
  assert.equal(club.session.performerId, 'u1');
  club.gift(who(2), { coins: 1000 });
  advance(1000);
  assert.equal(club.session.performerId, 'u1');
  assert.equal(club.queue.length, 1);
  const s = club.session;
  advance(s.endAt - club.now() + 200);
  assert.equal(club.session.performerId, 'u2');
  assert.equal(club.session.tier, 5);
});

test('trạng thái đi đúng thứ tự Chill → Preparing → Performing → Finale → Returning → Chill', () => {
  const { club, advance, who } = setup({ gifts: { comboWindowMs: 0 } });
  club.gift(who(1), { coins: 50 });
  advance(100);
  const seen = [club.session.state];
  while (club.session) {
    advance(100);
    const state = club.session?.state ?? 'chill';
    if (state !== seen.at(-1)) seen.push(state);
  }
  assert.deepEqual(seen, ['preparing', 'performing', 'finale', 'returning', 'chill']);
});

test('ưu tiên quà lớn, FIFO khi bằng điểm và quà nhỏ không bị đói', () => {
  const { club, advance, who, cfg } = setup({ gifts: { comboWindowMs: 0, minChillMs: 0 } });
  club.gift(who(1), { coins: 1000 }); // đang diễn
  advance(100);
  club.gift(who(2), { coins: 1 });
  advance(100);
  club.gift(who(3), { coins: 1 });
  club.gift(who(4), { coins: 50 });
  const order = club.orderedQueue().map((r) => r.id);
  assert.deepEqual(order, ['u4', 'u2', 'u3']);
  // Quà nhỏ chờ lâu được cộng điểm theo thời gian nên không bị quà lớn mới đến chen mãi.
  const small = club.queue.find((r) => r.id === 'u2');
  small.at -= cfg.gifts.agingSecondsPerTier * 1000 * 3;
  club.gift(who(5), { coins: 50 });
  assert.equal(club.orderedQueue()[0].id, 'u2');
});

test('quà thêm khi đang chờ được cộng dồn vào lượt cũ', () => {
  const { club, advance, who } = setup({ gifts: { comboWindowMs: 0, minChillMs: 0 } });
  club.gift(who(1), { coins: 1 });
  advance(100);
  club.gift(who(2), { coins: 5 });
  club.gift(who(2), { coins: 10 });
  assert.equal(club.queue.length, 1);
  assert.equal(club.queue[0].coins, 15);
  assert.equal(club.queue[0].tier, 2);
});

test('hàng quà đầy thì bỏ lượt thấp nhất', () => {
  const { club, advance, who, events } = setup({ gifts: { comboWindowMs: 0, minChillMs: 0, maxQueue: 2 } });
  club.gift(who(1), { coins: 1 });
  advance(100);
  club.gift(who(2), { coins: 1 });
  club.gift(who(3), { coins: 1 });
  club.gift(who(4), { coins: 200 });
  assert.equal(club.queue.length, 2);
  assert.ok(club.queue.some((r) => r.id === 'u4'));
  assert.ok(events.some((e) => e.type === 'dropped' && e.id === 'u3'));
});

test('người tặng quà được nhường chỗ khi sàn đầy', () => {
  const { club, who } = setup({ floor: { maxDancers: 2, spawnPerSecond: 100 } });
  club.comment(who(1), 'hey');
  club.comment(who(2), 'hey');
  club.gift(who(3), { coins: 1 });
  assert.ok(club.dancers.has('u3'));
  assert.equal(club.dancers.size, 2);
  assert.equal(club.waitlist[0].id, 'u1');
});

test('nút C kết thúc màn diễn và về chill', () => {
  const { club, advance, who } = setup({ gifts: { comboWindowMs: 0 } });
  club.gift(who(1), { coins: 1000 });
  advance(3000);
  assert.equal(club.session.state, 'performing');
  club.forceChill();
  assert.equal(club.session.state, 'returning');
  advance(2000);
  assert.equal(club.session, null);
});

test('chọn choreography không lặp lại liên tiếp trong cùng tier', () => {
  const { club } = setup();
  let last = '';
  for (let i = 0; i < 10; i++) {
    const c = club.pickChoreography(3);
    assert.notEqual(c.id, last);
    assert.equal(c.tier, 3);
    last = c.id;
  }
});

test('dọn người đứng im khi có người chờ', () => {
  const { club, advance, who, cfg } = setup({ floor: { maxDancers: 2, spawnPerSecond: 100 } });
  club.comment(who(1), 'hey');
  club.comment(who(2), 'hey');
  advance(cfg.floor.makeRoomIdleMinutes * 60_000 - 10_000, 1000);
  club.comment(who(2), 'vẫn ở đây');
  club.comment(who(3), 'hey');
  advance(20_000, 1000);
  assert.ok(!club.dancers.has('u1'));
  assert.ok(club.dancers.has('u2'));
  assert.ok(club.dancers.has('u3'));
});

test('bảng xếp hạng cộng dồn xu theo người, không mất khi rời sàn', () => {
  const { club, who } = setup({ gifts: { comboWindowMs: 0 } });
  club.gift(who(1), { coins: 5 });
  club.gift(who(2), { coins: 30 });
  club.gift(who(1), { coins: 30 });
  club.gift(who(3), { coins: 1 });
  club.leave(club.dancers.get('u2'), 'test');
  const top = club.snapshot().leaderboard;
  assert.deepEqual(
    top.map((f) => [f.rank, f.id, f.coins]),
    [[1, 'u1', 35], [2, 'u2', 30], [3, 'u3', 1]],
  );
  club.resetBoard();
  assert.equal(club.snapshot().leaderboard.length, 0);
});

test('GiftCounter không cộng trùng combo', () => {
  const g = new GiftCounter();
  let total = 0;
  for (let i = 1; i <= 5; i++) {
    total += g.count({ msgId: `m${i}`, userId: 'a', giftId: 1, groupId: 'g', repeatCount: i, combo: true });
    total += g.count({ msgId: `m${i}`, userId: 'a', giftId: 1, groupId: 'g', repeatCount: i, combo: true });
  }
  total += g.count({ msgId: 'end', userId: 'a', giftId: 1, groupId: 'g', repeatCount: 5, repeatEnd: true, combo: true });
  assert.equal(total, 5);
});

test('quà TikTok đổi nhân vật, không tạo lượt diễn, giữ ngoại hình khi quay lại sàn', () => {
  const { club, events, advance, who } = setup({ gifts: { comboWindowMs: 0 } });
  club.comment(who(1), 'hey');
  assert.equal(club.snapshot().dancers.find((d) => d.id === 'u1').look, 0);
  const r = club.gift(who(1), { coins: 1, giftName: 'TikTok' });
  assert.equal(r.result, 'swapped');
  assert.equal(club.snapshot().dancers.find((d) => d.id === 'u1').look, 1);
  assert.ok(events.some((e) => e.type === 'swapped' && e.id === 'u1' && e.look === 1));
  advance(3000);
  assert.equal(club.session, null);
  assert.equal(club.queue.length, 0);
  assert.equal(club.snapshot().leaderboard[0].coins, 1);
  // Người chưa lên sàn tặng TikTok thì được đưa lên sàn với nhân vật mới.
  club.gift(who(2), { coins: 1, giftName: 'tiktok' });
  assert.equal(club.dancers.get('u2').look, 1);
  club.leave(club.dancers.get('u1'), 'test');
  club.comment(who(1), 'hey');
  advance(500);
  assert.equal(club.dancers.get('u1').look, 1);
  // Hoa hồng vẫn là quà biểu diễn bình thường.
  assert.equal(club.gift(who(3), { coins: 1, giftName: 'Rose' }).result, 'pending');
});
