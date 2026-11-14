import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Race } from '../src/race.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

function setup() {
  let t = 1_000_000;
  const events = [];
  const race = new Race(config, { emit: (m) => events.push(m), now: () => t });
  return { race, events, advance: (ms) => { t += ms; race.tick(); } };
}
const who = (id) => ({ id, name: id, avatar: '' });

test('comment tên nước cộng 0,1 m, nhiều cách viết', () => {
  const { race } = setup();
  for (const text of ['Vietnam', 'viet nam oi', 'VIỆT NAM', 'vn', 'Go VIETNAM!!!', '越南加油']) race.comment(who('a'), text);
  assert.equal(race.scores.vietnam, 6);
  assert.equal(race.comment(who('a'), 'vnd 500k'), null);
  assert.equal(race.comment(who('a'), 'hello'), null);
  race.comment(who('b'), 'ไทยสู้ๆ');
  race.comment(who('b'), 'Campuchia');
  race.comment(who('b'), 'trung quốc');
  race.comment(who('b'), 'Pinoy here');
  assert.deepEqual(race.scores, { thailand: 1, vietnam: 6, china: 1, cambodia: 1, philippines: 1 });
});

test('comment nhắc nhiều nước thì tính nước nhắc trước', () => {
  const { race } = setup();
  race.comment(who('a'), 'thailand > vietnam');
  assert.equal(race.scores.thailand, 1);
  assert.equal(race.scores.vietnam, 0);
});

test('quà của nước nào cộng 1 m cho nước đó, quà khác theo nước comment gần nhất', () => {
  const { race } = setup();
  race.gift(who('a'), { name: 'Rose' }, 3);
  assert.equal(race.scores.vietnam, 30);
  assert.equal(race.gift(who('b'), { name: 'Galaxy' }, 1), null);
  race.comment(who('b'), 'china');
  race.gift(who('b'), { name: 'Galaxy' }, 2);
  assert.equal(race.scores.china, 21);
  race.gift(who('b'), { name: 'TikTok' }, 1);
  assert.equal(race.scores.thailand, 10);
});

test('hết 60 giây nước xa nhất thắng, nghỉ rồi sang vòng mới từ 0', () => {
  const { race, events, advance } = setup();
  race.comment(who('a'), 'cambodia');
  race.comment(who('b'), 'philippines');
  race.comment(who('c'), 'philippines');
  advance(59_999);
  assert.equal(race.phase, 'race');
  advance(1);
  assert.equal(race.phase, 'result');
  const result = events.findLast((e) => e.type === 'result');
  assert.equal(result.winner, 'philippines');
  assert.equal(result.top.name, 'b');
  assert.equal(race.wins.philippines, 1);
  race.gift(who('d'), { name: 'Rose' });
  assert.equal(race.scores.vietnam, 0, 'quà lúc công bố được để dành');
  advance(config.resultSeconds * 1000);
  assert.equal(race.phase, 'race');
  assert.equal(race.round, 2);
  assert.equal(race.scores.vietnam, 10);
  assert.equal(race.scores.philippines, 0);
});

test('bằng điểm thì nước tới trước thắng, không ai chạy thì không ai thắng', () => {
  const { race, advance } = setup();
  advance(60_000);
  assert.equal(race.lastResult.winner, null);
  advance(config.resultSeconds * 1000);
  race.comment(who('a'), 'china');
  advance(10);
  race.comment(who('b'), 'thailand');
  advance(60_000);
  assert.equal(race.lastResult.winner, 'china');
});

test('tạm dừng giữ nguyên đồng hồ, lưu và khôi phục', () => {
  const { race, advance } = setup();
  advance(20_000);
  race.pause(true);
  advance(100_000);
  assert.equal(race.phase, 'race');
  race.comment(who('a'), 'vietnam');
  assert.equal(race.scores.vietnam, 0);
  race.pause(false);
  assert.equal(race.scores.vietnam, 1);
  assert.equal(race.left(), 40_000);
  const saved = JSON.parse(JSON.stringify(race));
  const { race: again } = setup();
  again.restore(saved);
  assert.equal(again.left(), 40_000);
  assert.equal(again.scores.vietnam, 1);
  again.gift(who('a'), { name: 'Galaxy' });
  assert.equal(again.scores.vietnam, 11, 'nhớ nước của người xem');
});
