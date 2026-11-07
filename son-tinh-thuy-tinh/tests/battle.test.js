import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Battle } from '../src/battle.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const T = config.timing;

// Từ nào cũng là "cá chép" để bài test dễ đọc.
const fixedDeck = { next: () => ({ topic: 'Con vật', text: 'cá chép' }) };

function setup(overrides = {}) {
  let clock = 1_000_000;
  const events = [];
  const battle = new Battle({ ...config, ...overrides }, { deck: fixedDeck, emit: (msg) => events.push(msg), now: () => clock });
  return {
    battle,
    events,
    advance(ms) {
      clock += ms;
      battle.tick();
    },
    last: (type) => events.filter((e) => e.type === type).at(-1),
    count: (type) => events.filter((e) => e.type === type).length,
  };
}

const who = (name) => ({ id: name, name });
const ROSE = { id: '5655', name: 'Rose' };
const HEART = { id: '5487', name: 'Finger Heart' };
const PIG = { id: '8825', name: 'Lucky Pig' };
const TIKTOK = { id: '5269', name: 'TikTok' };
const BING = { id: '7412', name: 'Ice cream' };
const CLOVER = { id: '9875', name: 'Shamrock' };

// Mỗi phe một người rồi vào hiệp 1.
function start(ctx) {
  ctx.battle.comment(who('Sơn'), 'sơn tinh');
  ctx.battle.comment(who('Thủy'), 'thủy tinh');
  ctx.advance(T.lobbySeconds * 1000);
  assert.equal(ctx.battle.phase, 'round');
}

test('hết giờ chọn phe mà còn thiếu phe thì chờ; đủ người thì đếm thêm 5 giây rồi vào hiệp 1', () => {
  const ctx = setup();
  const { battle } = ctx;
  assert.equal(battle.comment(who('Lan'), 'Sơn Tinh'), 'join');
  ctx.advance(T.lobbySeconds * 1000);
  ctx.advance(60_000);
  assert.equal(battle.phase, 'lobby');
  battle.comment(who('Hà'), 'tt');
  ctx.advance(4000);
  assert.equal(battle.phase, 'lobby');
  ctx.advance(1000);
  assert.equal(battle.phase, 'round');
  assert.equal(battle.round, 1);
  assert.deepEqual(battle.hp, { son: 100, thuy: 100 });
  assert.equal(ctx.last('round-start').round, 1);
});

test('đoán đúng thì phe kia mất 5, đoán sai không sao, người chưa chọn phe không được tính', () => {
  const ctx = setup();
  start(ctx);
  const { battle } = ctx;
  assert.equal(battle.comment(who('Thủy'), 'cá rô'), null);
  assert.equal(battle.comment(who('Khách'), 'cá chép'), 'nudge');
  assert.deepEqual(battle.hp, { son: 100, thuy: 100 });
  assert.equal(battle.comment(who('Sơn'), 'ca chep'), 'hit');
  assert.deepEqual(battle.hp, { son: 100, thuy: 95 });
  // Từ đã có người đoán ra thì người sau không được tính nữa.
  assert.equal(battle.comment(who('Thủy'), 'cá chép'), null);
  assert.equal(battle.hp.son, 100);
  const hit = ctx.last('hit');
  assert.deepEqual([hit.side, hit.target, hit.damage, hit.answer], ['son', 'thuy', 5, 'CÁ CHÉP']);
  assert.equal(hit.state.word.done.name, 'Sơn');
});

test('đoán xong vài giây thì ra từ mới; không ai đoán ra thì hết giờ lộ đáp án', () => {
  const ctx = setup();
  start(ctx);
  const { battle } = ctx;
  battle.comment(who('Sơn'), 'cá chép');
  const first = battle.word.no;
  ctx.advance(T.solvedSeconds * 1000);
  assert.equal(battle.word.no, first + 1);
  assert.equal(ctx.last('word').state.word.done, null);
  assert.ok(ctx.last('word').state.word.tiles.includes(''), 'từ mới chưa lộ hết chữ');
  ctx.advance(T.wordSeconds * 1000);
  assert.equal(ctx.last('timeout').answer, 'CÁ CHÉP');
  assert.deepEqual(battle.hp, { son: 100, thuy: 95 });
});

test('cứ hintEverySeconds giây mở thêm một chữ, không bao giờ mở hết', () => {
  const ctx = setup();
  start(ctx);
  const open = () => ctx.battle.publicWord().tiles.filter((ch) => ch && ch !== ' ').length;
  assert.equal(open(), 2);
  ctx.advance(T.hintEverySeconds * 1000);
  assert.equal(open(), 3);
  ctx.advance(T.hintEverySeconds * 1000);
  assert.equal(open(), 4);
  ctx.advance(T.hintEverySeconds * 1000);
  assert.equal(open(), 4);
  assert.equal(ctx.count('hint'), 2);
});

test('quà cộng thêm vào sức mỗi từ của đúng phe ứng với quà', () => {
  const ctx = setup();
  start(ctx);
  const { battle } = ctx;
  battle.gift(who('Khách 1'), ROSE, 1);
  battle.gift(who('Khách 2'), PIG, 3);
  assert.deepEqual(battle.bonus, { son: 31, thuy: 0 });
  battle.gift(who('Khách 3'), TIKTOK, 2);
  battle.gift(who('Khách 4'), BING, 1);
  battle.gift(who('Khách 5'), CLOVER, 1);
  battle.gift(who('Khách 6'), HEART, 1);
  assert.deepEqual(battle.bonus, { son: 36, thuy: 17 });
  assert.deepEqual(ctx.last('gift').state.damage, { son: 41, thuy: 22 });
  battle.comment(who('Sơn'), 'cá chép');
  assert.equal(battle.hp.thuy, 100 - 41);
});

test('nhận quà theo id, theo tên tiếng Anh hoặc tiếng Việt; quà khác thì bỏ qua', () => {
  const ctx = setup();
  start(ctx);
  const { battle } = ctx;
  assert.deepEqual(battle.gift(who('A'), { id: '9875', name: '' }), { side: 'thuy', added: 10 });
  assert.deepEqual(battle.gift(who('B'), { id: '', name: 'Cỏ bốn lá' }), { side: 'thuy', added: 10 });
  assert.deepEqual(battle.gift(who('C'), { id: '', name: 'Bing Chilling' }), { side: 'thuy', added: 5 });
  assert.deepEqual(battle.gift(who('D'), { id: '', name: 'Chú heo may mắn' }), { side: 'son', added: 10 });
  assert.equal(battle.gift(who('E'), { id: '637990', name: 'Treasure Clover' }), null);
  assert.equal(battle.gift(who('F'), { id: '5827', name: 'Ice Cream Cone' }), null);
});

test('người chưa chọn phe gửi quà thì vào phe của quà; đã có phe thì giữ phe cũ', () => {
  const ctx = setup();
  start(ctx);
  const { battle } = ctx;
  battle.gift(who('Mới'), CLOVER, 1);
  assert.equal(battle.players.get('Mới').side, 'thuy');
  battle.gift(who('Sơn'), TIKTOK, 1);
  assert.equal(battle.players.get('Sơn').side, 'son');
  assert.equal(battle.bonus.thuy, 11);
});

test('quà chỉ tính trong hiệp; quà gửi lúc nghỉ giữa hiệp tính cho hiệp sau', () => {
  const ctx = setup();
  start(ctx);
  const { battle } = ctx;
  battle.gift(who('A'), PIG, 1);
  ctx.advance(T.roundSeconds * 1000);
  assert.equal(battle.phase, 'roundEnd');
  assert.deepEqual(battle.bonus, { son: 0, thuy: 0 });
  battle.gift(who('B'), ROSE, 2);
  assert.equal(ctx.last('gift').later, true);
  ctx.advance(T.roundEndSeconds * 1000);
  assert.equal(battle.round, 2);
  assert.deepEqual(battle.bonus, { son: 2, thuy: 0 });
  battle.comment(who('Sơn'), 'cá chép');
  assert.equal(battle.hp.thuy, 93);
});

test('phe kia cạn máu thì thắng hiệp ngay, không chờ hết giờ', () => {
  const ctx = setup();
  start(ctx);
  const { battle } = ctx;
  battle.gift(who('A'), PIG, 10);
  battle.comment(who('Sơn'), 'cá chép');
  assert.equal(battle.hp.thuy, 0);
  assert.equal(battle.phase, 'roundEnd');
  const end = ctx.last('round-end');
  assert.deepEqual([end.winner, end.reason, end.answer], ['son', 'ko', '']);
  assert.deepEqual(end.mvp, { name: 'Sơn', side: 'son', words: 1 });
  assert.deepEqual(battle.wins, { son: 1, thuy: 0 });
});

test('hết 3 phút thì phe còn nhiều máu hơn thắng, bằng máu thì hòa', () => {
  const ctx = setup();
  start(ctx);
  const { battle } = ctx;
  battle.comment(who('Thủy'), 'cá chép');
  ctx.advance(T.roundSeconds * 1000);
  assert.deepEqual([ctx.last('round-end').winner, ctx.last('round-end').reason], ['thuy', 'time']);
  ctx.advance(T.roundEndSeconds * 1000);
  ctx.advance(T.roundSeconds * 1000);
  const draw = ctx.last('round-end');
  assert.equal(draw.winner, null);
  assert.equal(draw.answer, 'CÁ CHÉP', 'lộ từ đang đoán dở');
  assert.deepEqual(battle.wins, { son: 0, thuy: 1 });
});

test('thắng 5 hiệp trước thì rước Mị Nương, sau đó mở trận mới và chọn phe lại', () => {
  const ctx = setup();
  start(ctx);
  const { battle } = ctx;
  for (let i = 0; i < 5; i++) {
    battle.gift(who('A'), PIG, 10);
    battle.comment(who('Sơn'), 'cá chép');
    assert.equal(battle.phase, 'roundEnd');
    ctx.advance(T.roundEndSeconds * 1000);
  }
  assert.equal(battle.phase, 'matchEnd');
  const end = ctx.last('match-end');
  assert.equal(end.side, 'son');
  assert.deepEqual(end.wins, { son: 5, thuy: 0 });
  assert.deepEqual(end.top, [{ name: 'Sơn', side: 'son', words: 5 }]);
  ctx.advance(T.matchEndSeconds * 1000);
  assert.equal(battle.phase, 'lobby');
  assert.equal(battle.players.size, 0);
  assert.deepEqual(battle.wins, { son: 0, thuy: 0 });
  assert.equal(battle.round, 0);
  assert.equal(ctx.count('reset'), 1);
});

test('đã chọn phe thì không đổi được tới hết trận', () => {
  const ctx = setup();
  const { battle } = ctx;
  battle.comment(who('Lan'), 'Sơn Tinh');
  assert.equal(battle.comment(who('Lan'), 'Thủy Tinh'), 'wave');
  assert.equal(battle.players.get('Lan').side, 'son');
  assert.deepEqual(battle.count, { son: 1, thuy: 0 });
});

test('nhắc người chưa chọn phe, mỗi người một lần mỗi phút, cả phòng cách nhau 4 giây', () => {
  const ctx = setup();
  const { battle } = ctx;
  assert.equal(battle.comment(who('Khách'), 'hello'), 'nudge');
  assert.equal(battle.comment(who('Khách'), 'hello'), null);
  ctx.advance(5000);
  assert.equal(battle.comment(who('Khách 2'), 'chào'), 'nudge');
  assert.equal(battle.comment(who('Khách 3'), 'chào'), null);
  ctx.advance(60_000);
  assert.equal(battle.comment(who('Khách'), 'hello'), 'nudge');
});

test('bảng điều khiển: vào hiệp ngay, mở thêm chữ, đổi từ, kết thúc hiệp', () => {
  const ctx = setup();
  const { battle } = ctx;
  assert.equal(battle.advance(), true);
  assert.equal(battle.phase, 'round');
  const open = () => battle.publicWord().tiles.filter((ch) => ch && ch !== ' ').length;
  const before = open();
  assert.equal(battle.revealMore(), true);
  assert.equal(open(), before + 1);
  assert.equal(battle.answerText(), 'cá chép');
  assert.equal(battle.skipWord(), true);
  assert.equal(ctx.last('timeout').kind, 'skip');
  assert.equal(battle.answerText(), '');
  assert.equal(battle.endRound(), true);
  assert.equal(battle.phase, 'roundEnd');
  assert.equal(battle.endRound(), false);
});

test('lưu rồi nạp lại: giữ phe, tỉ số và quà; hiệp đang dở thì đấu lại từ đầu', () => {
  const ctx = setup();
  start(ctx);
  ctx.battle.gift(who('A'), PIG, 10);
  ctx.battle.comment(who('Sơn'), 'cá chép');
  ctx.advance(T.roundEndSeconds * 1000);
  ctx.battle.gift(who('B'), ROSE, 3);
  const saved = JSON.parse(JSON.stringify(ctx.battle.exportState()));

  const again = setup();
  again.battle.importState(saved);
  assert.equal(again.battle.phase, 'lobby');
  assert.deepEqual(again.battle.wins, { son: 1, thuy: 0 });
  assert.deepEqual(again.battle.bonus, { son: 3, thuy: 0 });
  assert.deepEqual(again.battle.count, { son: 3, thuy: 1 });
  assert.equal(again.battle.players.get('Thủy').side, 'thuy');
  again.advance(T.lobbySeconds * 1000);
  assert.equal(again.battle.round, 2);
  again.battle.comment(who('Mới'), '2');
  assert.ok(again.battle.players.get('Mới').pid > Math.max(...[...ctx.battle.players.values()].map((p) => p.pid)), 'người mới không trùng số với người cũ');
});

test('trận đã xong thì lần sau mở trận mới', () => {
  const ctx = setup({ winsToMarry: 1 });
  start(ctx);
  ctx.battle.gift(who('A'), PIG, 10);
  ctx.battle.comment(who('Sơn'), 'cá chép');
  const again = setup({ winsToMarry: 1 });
  again.battle.importState(JSON.parse(JSON.stringify(ctx.battle.exportState())));
  assert.equal(again.battle.players.size, 0);
  assert.deepEqual(again.battle.wins, { son: 0, thuy: 0 });
});
