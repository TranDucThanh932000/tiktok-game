import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Race } from '../src/race.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

function setup(overrides = {}) {
  let t = 1_000_000;
  const events = [];
  const race = new Race({ ...config, ...overrides }, { emit: (m) => events.push(m), now: () => t });
  return { race, events, advance: (ms) => { t += ms; race.tick(); } };
}
const who = (id) => ({ id, name: id, avatar: '' });
const zero = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

test('comment số báo danh để chọn trâu, không cộng mét', () => {
  const { race, events } = setup();
  for (const [text, id] of [['3', '3'], ['số 2', '2'], ['Trâu số 5 ơi', '5'], ['#4', '4'], ['so1', '1'], ['３', '3'], ['01', '1'], ['3️⃣', '3']]) {
    assert.equal(race.comment(who('a'), text)?.buffalo, id, text);
    assert.equal(race.fans.get('a').buffalo, id);
  }
  for (const text of ['12', '0', '6', 'hello', '100k', 'v1p']) assert.equal(race.comment(who('a'), text), null, text);
  assert.deepEqual(race.scores, zero);
  assert.equal(events.at(-1).type, 'pick');
});

test('mỗi người thả đủ 30 tim thì trâu của người đó đi 0,1 m', () => {
  const { race, events } = setup();
  assert.equal(race.like(who('a'), 30), null, 'chưa chọn trâu thì tim không tính');
  race.comment(who('a'), '2');
  race.comment(who('b'), '2');
  race.like(who('a'), 15);
  race.like(who('b'), 15);
  assert.equal(race.scores[2], 0, 'tim của hai người không cộng dồn với nhau');
  assert.equal(events.at(-1).type, 'like');
  race.like(who('a'), 15);
  assert.equal(race.scores[2], 1);
  assert.equal(events.at(-1).kind, 'like');
  race.like(who('a'), 65);
  assert.equal(race.scores[2], 3, '95 tim = 3 bước');
  race.comment(who('a'), '4');
  race.like(who('a'), 25);
  assert.equal(race.scores[4], 1, 'đổi trâu thì 5 tim đang dồn tính tiếp cho trâu mới');
});

test('tim chỉ tính trong lúc đang đua, sang vòng mới đếm lại từ 0', () => {
  const { race, advance } = setup();
  race.comment(who('a'), '1');
  race.like(who('a'), 20);
  race.pause(true);
  assert.equal(race.like(who('a'), 30), null);
  race.pause(false);
  advance(60_000);
  assert.equal(race.phase, 'result');
  assert.equal(race.like(who('a'), 30), null);
  advance(config.resultSeconds * 1000);
  race.like(who('a'), 20);
  assert.equal(race.scores[1], 0, '20 tim vòng trước không dồn sang vòng sau');
  race.like(who('a'), 10);
  assert.equal(race.scores[1], 1);
});

test('commentMeters > 0 thì comment chọn trâu vẫn cộng mét', () => {
  const { race } = setup({ commentMeters: 0.1 });
  race.comment(who('a'), 'số 3');
  assert.equal(race.scores[3], 1);
});

test('quà riêng của trâu nào cộng 1 m cho trâu đó, quà khác cho trâu đã chọn', () => {
  const { race } = setup();
  race.gift(who('a'), { name: 'Rose' }, 3);
  assert.equal(race.scores[2], 30);
  assert.equal(race.gift(who('b'), { name: 'Galaxy' }, 1), null);
  race.comment(who('b'), '3');
  race.gift(who('b'), { name: 'Galaxy' }, 2);
  assert.equal(race.scores[3], 20);
  race.gift(who('b'), { name: 'TikTok' }, 1);
  assert.equal(race.scores[1], 10);
});

test('hết 60 giây trâu xa nhất thắng, nghỉ rồi sang vòng mới từ 0', () => {
  const { race, events, advance } = setup();
  for (const [id, n] of [['a', '4'], ['b', '5'], ['c', '5']]) race.comment(who(id), n);
  race.like(who('a'), 30);
  race.like(who('b'), 60);
  race.like(who('c'), 30);
  advance(59_999);
  assert.equal(race.phase, 'race');
  advance(1);
  assert.equal(race.phase, 'result');
  const result = events.findLast((e) => e.type === 'result');
  assert.equal(result.winner, '5');
  assert.equal(result.top.name, 'b');
  assert.equal(race.wins[5], 1);
  race.gift(who('d'), { name: 'Rose' });
  assert.equal(race.scores[2], 0, 'quà lúc công bố được để dành');
  advance(config.resultSeconds * 1000);
  assert.equal(race.phase, 'race');
  assert.equal(race.round, 2);
  assert.equal(race.scores[2], 10);
  assert.equal(race.scores[5], 0);
});

test('bằng điểm thì trâu tới trước thắng, không ai chạy thì không ai thắng', () => {
  const { race, advance } = setup();
  advance(60_000);
  assert.equal(race.lastResult.winner, null);
  advance(config.resultSeconds * 1000);
  race.comment(who('a'), '3');
  race.comment(who('b'), '1');
  race.like(who('a'), 30);
  advance(10);
  race.like(who('b'), 30);
  advance(60_000);
  assert.equal(race.lastResult.winner, '3');
});

test('tạm dừng giữ nguyên đồng hồ, lưu và khôi phục', () => {
  const { race, advance } = setup();
  race.comment(who('a'), '2');
  advance(20_000);
  race.pause(true);
  advance(100_000);
  assert.equal(race.phase, 'race');
  race.gift(who('a'), { name: 'Galaxy' });
  assert.equal(race.scores[2], 0);
  race.pause(false);
  assert.equal(race.scores[2], 10);
  assert.equal(race.left(), 40_000);
  const saved = JSON.parse(JSON.stringify(race));
  const { race: again } = setup();
  again.restore(saved);
  assert.equal(again.left(), 40_000);
  assert.equal(again.scores[2], 10);
  again.like(who('a'), 30);
  assert.equal(again.scores[2], 11, 'nhớ trâu người xem đã chọn');
});

test('đội cổ vũ: đếm người chọn từng trâu, đổi trâu thì chuyển đội', () => {
  const { race, events } = setup();
  assert.equal(race.comment(who('a'), '1').joined, true);
  assert.equal(race.comment(who('a'), 'số 1').joined, false, 'comment lại cùng số không tính là vào đội mới');
  race.comment(who('b'), '1');
  race.comment(who('c'), '2');
  assert.equal(race.board().teams[1].count, 2);
  assert.deepEqual(race.board().teams[1].recent.map((r) => r.name), ['b', 'a']);
  race.like(who('a'), 5);
  assert.deepEqual(race.board().teams[1].recent.map((r) => r.name), ['a', 'b'], 'người vừa thả tim lên đầu hàng');
  race.comment(who('a'), '2');
  assert.equal(events.at(-1).joined, true);
  assert.equal(race.board().teams[1].count, 1);
  assert.equal(race.board().teams[2].count, 2);
  assert.deepEqual(race.board().teams[1].recent.map((r) => r.name), ['b']);
});

test('kết quả vòng có bục top 3, số người đội thắng và bảng vàng cả buổi', () => {
  const { race, advance } = setup();
  for (const [id, n] of [['a', '2'], ['b', '2'], ['c', '2'], ['d', '2'], ['e', '3']]) race.comment(who(id), n);
  race.like(who('a'), 30);
  race.like(who('b'), 90);
  race.like(who('c'), 60);
  race.like(who('d'), 30);
  race.gift(who('e'), { name: 'GG' }, 1);
  race.gift(who('e'), { name: 'Rose' }, 2);
  advance(60_000);
  const r = race.lastResult;
  assert.equal(r.winner, '2');
  assert.deepEqual(r.podium.map((p) => [p.name, p.units]), [['e', 20], ['b', 3], ['c', 2]]);
  assert.equal(r.team, 4);
  assert.deepEqual(r.session.map((p) => [p.name, p.units]), [['e', 30], ['b', 3], ['c', 2], ['a', 1], ['d', 1]]);
  advance(config.resultSeconds * 1000);
  race.like(who('a'), 90);
  advance(60_000);
  assert.deepEqual(race.lastResult.session.slice(0, 2).map((p) => [p.name, p.units]), [['e', 30], ['a', 4]], 'bảng vàng cộng dồn qua các vòng');
  const saved = JSON.parse(JSON.stringify(race));
  const { race: again } = setup();
  again.restore(saved);
  assert.equal(again.board().teams[2].count, 4);
  assert.equal(again.sessionTop(1)[0].units, 30);
  race.resetWins();
  assert.deepEqual(race.sessionTop(5), [], 'Xóa số vòng thắng thì bảng vàng đếm lại');
});
