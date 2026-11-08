import test from 'node:test';
import assert from 'node:assert/strict';
import { WordGame } from '../src/game.js';

const config = {
  seats: 40,
  timing: { wordSeconds: 45, afterFirstSeconds: 10, hintEverySeconds: 8, graceSeconds: 1.5, revealSeconds: 6 },
  hints: { start: 0, max: 0.5 },
  boost: {
    multiplier: 2,
    socialTurns: 1,
    socialGapSeconds: 60,
    tiers: [
      { coins: 1, turns: 1, label: 'Hoa hồng', icon: '/gifts/rose.webp' },
      { coins: 5, turns: 6, label: 'Kem', icon: '/gifts/kem.webp' },
      { coins: 10, turns: 13, label: 'Heo may mắn', icon: '/gifts/lucky-pig.webp' },
    ],
  },
};

const WORDS = [
  { topic: 'Con vật', text: 'con mèo', hint: 'Bắt chuột giỏi' },
  { topic: 'Trái cây', text: 'quả xoài', hint: 'Vàng thơm' },
  { topic: 'Món ăn', text: 'bánh chưng', hint: 'Lang Liêu' },
];

function setup() {
  let t = 1_000_000;
  let i = 0;
  const events = [];
  const game = new WordGame(config, {
    deck: { next: () => WORDS[i++ % WORDS.length] },
    emit: (msg) => events.push(msg),
    now: () => t,
    rng: () => 0.5,
  });
  const advance = (ms) => {
    for (let left = ms; left > 0; left -= 100) {
      t += Math.min(100, left);
      game.tick();
    }
  };
  game.tick();
  const of = (type) => events.filter((e) => e.type === type);
  return { game, events, of, advance, now: () => t };
}

const who = (name) => ({ id: `id:${name}`, name });

test('vào là hỏi từ đầu tiên với chủ đề, gợi ý và ô chữ đóng hết', () => {
  const { of } = setup();
  const [word] = of('word');
  assert.equal(word.no, 1);
  assert.equal(word.topic, 'Con vật');
  assert.equal(word.hint, 'Bắt chuột giỏi');
  assert.deepEqual(word.tiles, ['', '', '', ' ', '', '', '']);
  assert.equal(word.letters, 6);
});

test('ai comment đúng cũng được +1, mỗi người một lần mỗi từ; comment sai không tính', () => {
  const { game, of } = setup();
  assert.equal(game.comment(who('An'), 'con chó'), false);
  assert.equal(game.comment(who('An'), 'meo'), true);
  assert.equal(game.comment(who('An'), 'con mèo'), true, 'đoán lại vẫn là đúng nhưng không cộng thêm');
  assert.equal(game.comment(who('Bình'), 'Con Mèo nha'), true);
  const correct = of('correct');
  assert.equal(correct.length, 2);
  assert.deepEqual(correct.map((c) => [c.name, c.delta, c.first, c.count]), [['An', 1, true, 1], ['Bình', 1, false, 2]]);
  assert.equal(game.players.get('id:An').score, 1);
  assert.equal(game.players.get('id:Bình').score, 1);
});

test('có người đoán ra thì chỉ chờ thêm afterFirstSeconds, rồi công bố và sang từ mới', () => {
  const { game, of, advance, now } = setup();
  advance(5000);
  game.comment(who('An'), 'mèo');
  assert.equal(game.endsAt, now() + 10_000);
  advance(10_000);
  game.comment(who('Chậm'), 'mèo');
  assert.equal(of('correct').length, 2, 'vẫn nhận trong lúc chờ thêm do hình trễ');
  advance(1600);
  const [reveal] = of('reveal');
  assert.equal(reveal.answer, 'CON MÈO');
  assert.equal(reveal.count, 2);
  assert.equal(game.comment(who('Muộn'), 'mèo'), false, 'đang công bố thì không nhận');
  advance(6000);
  assert.equal(of('word').length, 2);
  assert.equal(of('word')[1].topic, 'Trái cây');
});

test('chưa ai đoán ra thì cứ hintEverySeconds mở thêm một chữ, tối đa một nửa', () => {
  const { of, advance } = setup();
  advance(45_000);
  const letters = of('letter');
  assert.equal(letters.length, 3, '6 chữ, mở tối đa 3');
  assert.deepEqual(letters.map((l) => l.left), [2, 1, 0]);
  advance(1600);
  assert.equal(of('reveal')[0].count, 0);
});

test('đoán ra rồi thì thôi mở chữ', () => {
  const { game, of, advance } = setup();
  advance(8100);
  assert.equal(of('letter').length, 1);
  game.comment(who('An'), 'mèo');
  advance(9000);
  assert.equal(of('letter').length, 1);
});

test('quà cho lượt x2 theo số xu, quà to tính theo mức gần nhất nhân lên', () => {
  const { game } = setup();
  assert.deepEqual(game.turnsFor(1), { turns: 1, icon: '/gifts/rose.webp' });
  assert.deepEqual(game.turnsFor(5), { turns: 6, icon: '/gifts/kem.webp' });
  assert.deepEqual(game.turnsFor(99), { turns: 117, icon: '/gifts/lucky-pig.webp' });
  assert.equal(game.turnsFor(0), null);
  assert.deepEqual(game.gift(who('An'), 5, 2), { added: 12, turns: 12 });
});

test('có lượt x2 thì đoán đúng +2 và mất một lượt; đoán sai không mất lượt', () => {
  const { game, of, advance } = setup();
  game.gift(who('An'), 1, 2);
  game.comment(who('An'), 'con chó');
  assert.equal(game.boosts.get('id:An'), 2);
  game.comment(who('An'), 'mèo');
  const [hit] = of('correct');
  assert.equal(hit.delta, 2);
  assert.equal(hit.boosted, true);
  assert.equal(hit.turns, 1);
  assert.equal(game.players.get('id:An').score, 2);
  advance(20_000);
  game.comment(who('An'), 'xoài');
  assert.equal(game.players.get('id:An').score, 4);
  assert.equal(game.boosts.has('id:An'), false, 'hết lượt');
  advance(20_000);
  game.comment(who('An'), 'bánh chưng');
  assert.equal(game.players.get('id:An').score, 5);
});

test('follow, share cho 1 lượt, mỗi người tối đa một lần mỗi phút', () => {
  const { game, advance } = setup();
  assert.deepEqual(game.social(who('An'), 'follow'), { added: 1, turns: 1 });
  assert.equal(game.social(who('An'), 'share'), null);
  advance(60_000);
  assert.deepEqual(game.social(who('An'), 'share'), { added: 1, turns: 2 });
});

test('bảng điểm: điểm cao đứng trên, bằng điểm thì ai đạt trước đứng trên; người có lượt x2 cũng có ghế', () => {
  const { game, of, advance } = setup();
  game.comment(who('An'), 'mèo');
  advance(100);
  game.comment(who('Bình'), 'mèo');
  game.gift(who('Chi'), 10);
  advance(500);
  const board = of('board').at(-1).board;
  assert.deepEqual(board.map((p) => [p.name, p.score, p.turns]), [['An', 1, 0], ['Bình', 1, 0], ['Chi', 0, 13]]);
  assert.equal(board[2].icon, '/gifts/lucky-pig.webp');
  advance(20_000);
  game.comment(who('Bình'), 'xoài');
  advance(500);
  assert.deepEqual(of('board').at(-1).board.map((p) => p.name), ['Bình', 'An', 'Chi']);
  assert.ok(new Set(board.map((p) => p.key)).size === 3 && board.every((p) => !('id' in p)), 'không gửi id TikTok ra màn hình');
});

test('bảng điểm gửi gộp, không quá một lần mỗi 400 ms', () => {
  const { game, of, advance } = setup();
  for (let n = 0; n < 30; n++) game.comment(who(`P${n}`), 'mèo');
  advance(1000);
  assert.ok(of('board').length <= 3);
  assert.equal(of('board').at(-1).board.length, 30);
});

test('màn hình chỉ hiện top theo số ghế', () => {
  const { game } = setup();
  for (let n = 0; n < 50; n++) game.comment(who(`P${n}`), 'mèo');
  assert.equal(game.board().length, 40);
  assert.equal(game.snapshot().players, 50);
});

test('lưu và nạp lại bảng điểm cùng lượt x2', () => {
  const a = setup();
  a.game.comment(who('An'), 'mèo');
  a.game.gift(who('Bình'), 5);
  a.game.social(who('Chi'), 'follow');
  const saved = JSON.parse(JSON.stringify(a.game.exportState()));
  const b = setup();
  b.game.importState(saved);
  assert.equal(b.game.players.get('id:An').score, 1);
  assert.equal(b.game.boosts.get('id:Bình'), 6);
  assert.equal(b.game.patrons.get('id:Bình'), '/gifts/kem.webp');
  assert.equal(b.game.boosts.get('id:Chi'), 1);
  assert.equal(b.game.patrons.has('id:Chi'), false);
  b.game.importState({ players: [{ id: 1, name: 'x', score: 'a' }], boosts: [['ma', 5]] });
  assert.equal(b.game.players.has('ma'), false);
});

test('xóa bảng điểm và bỏ qua từ từ bảng điều khiển', () => {
  const { game, of } = setup();
  game.comment(who('An'), 'mèo');
  game.skip();
  assert.equal(of('reveal').length, 1);
  game.skip();
  assert.equal(of('word').length, 2);
  game.reset();
  assert.equal(game.players.size, 0);
  assert.equal(of('word').at(-1).no, 1);
  assert.equal(of('snapshot-game').at(-1).game.board.length, 0);
});
