import test from 'node:test';
import assert from 'node:assert/strict';
import { PULL_MS, WordGame } from '../src/game.js';

const config = {
  seats: 40,
  timing: { wordSeconds: 45, afterFirstSeconds: 10, hintEverySeconds: 8, graceSeconds: 1.5, revealSeconds: 6 },
  hints: { start: 0, max: 0.5 },
  boost: { multiplier: 2, socialTurns: 1, socialGapSeconds: 60 },
  gifts: {
    fundGoal: 100,
    photoGift: { label: 'Tim cam', names: ['Heart Me', 'Tim cam'], ids: [7934], icon: '/gifts/heart-me.webp' },
    scenes: [
      { coins: 1, scene: 'rose', label: 'Hoa hồng', icon: '/gifts/rose.webp' },
      { coins: 5, scene: 'kem', label: 'Kem', icon: '/gifts/kem.webp' },
      { coins: 10, scene: 'pig', label: 'Heo may mắn', icon: '/gifts/lucky-pig.webp' },
    ],
  },
};

const WORDS = [
  { topic: 'Con vật', text: 'con mèo', hint: 'Bắt chuột giỏi' },
  { topic: 'Trái cây', text: 'quả xoài', hint: 'Vàng thơm' },
  { topic: 'Món ăn', text: 'bánh chưng', hint: 'Lang Liêu' },
];

function setup(extra = {}) {
  let t = 1_000_000;
  let i = 0;
  const events = [];
  const game = new WordGame({ ...config, ...extra }, {
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
  assert.equal(of('reveal')[0].fastest, null);
});

test('công bố kèm bạn nhanh nhất: tên, ảnh, số giây, điểm vừa được', () => {
  const { game, of, advance } = setup();
  advance(3400);
  game.comment({ id: 'id:An', name: 'An', avatar: 'https://p16.tiktokcdn.com/a.webp' }, 'mèo');
  advance(500);
  game.comment(who('Bình'), 'mèo');
  advance(11_000);
  const { fastest } = of('reveal')[0];
  assert.deepEqual(fastest, { name: 'An', avatar: 'https://p16.tiktokcdn.com/a.webp', look: game.players.get('id:An').look, delta: 1, score: 1, seconds: 3 });
  assert.equal(game.snapshot().reveal.fastest.name, 'An');
  assert.ok(!JSON.stringify(game.exportState()).includes('tiktokcdn'), 'không lưu ảnh ra file');
});

test('đoán ra rồi thì thôi mở chữ', () => {
  const { game, of, advance } = setup();
  advance(8100);
  assert.equal(of('letter').length, 1);
  game.comment(who('An'), 'mèo');
  advance(9000);
  assert.equal(of('letter').length, 1);
});

test('quà không đụng tới điểm hay lượt x2: chỉ có cảnh theo tổng xu, hình quà thật nếu có', () => {
  const { game, of } = setup();
  assert.deepEqual(game.gift(who('An'), 1), { scene: 'rose', fund: 1, photo: false });
  assert.deepEqual(game.gift(who('An'), 1, 5), { scene: 'kem', fund: 6, photo: false });
  assert.deepEqual(game.gift(who('Bình'), 30, 1, { image: 'https://p16.tiktokcdn.com/g.png' }), { scene: 'pig', fund: 36, photo: false });
  assert.equal(game.gift(who('Chi'), 0), null);
  const gifts = of('gift');
  assert.deepEqual(gifts.map((g) => [g.name, g.scene, g.coins, g.count]), [['An', 'rose', 1, 1], ['An', 'kem', 5, 5], ['Bình', 'pig', 30, 1]]);
  assert.equal(gifts[0].icon, '/gifts/rose.webp');
  assert.equal(gifts[2].icon, 'https://p16.tiktokcdn.com/g.png');
  assert.equal(game.players.get('id:An').score, 0);
  assert.equal(game.boosts.size, 0);
  assert.equal(game.ranking().length, 0, 'gửi quà không có ghế trong lớp');
});

test('quỹ lớp: góp xu từ quà, gần đủ thì báo, đủ thì phát kẹo kèm 3 người góp nhiều nhất, phần dư sang quỹ mới', () => {
  const { game, of } = setup();
  game.gift(who('An'), 10);
  game.gift(who('Bình'), 30);
  game.gift(who('Chi'), 5);
  game.gift(who('Dũng'), 1);
  game.gift(who('An'), 45);
  assert.equal(of('fund').at(-1).coins, 91);
  assert.equal(of('fund').at(-1).near, true);
  assert.equal(of('fund').filter((f) => f.near).length, 1, 'chỉ báo gần đủ một lần');
  game.gift(who('Chi'), 20);
  const [candy] = of('candy');
  assert.deepEqual(candy.thanks.map((t) => t.name), ['An', 'Bình', 'Chi']);
  assert.equal(candy.coins, 11);
  assert.equal(candy.times, 1);
  assert.equal(game.fund.coins, 11);
  game.gift(who('Em'), 250);
  assert.equal(of('candy')[1].times, 2);
  assert.equal(game.fund.coins, 61);
  assert.deepEqual(of('candy')[1].thanks.map((t) => t.name), ['Em', 'Chi'], 'quỹ mới chỉ tính người góp từ sau lần phát trước');
});

test('ghế VIP: chỉ Tim cam (theo tên hoặc mã quà), người gửi cuối cùng được ngồi', () => {
  const { game, of } = setup();
  game.gift(who('An'), 30);
  game.gift(who('An'), 1, 1, { name: 'Rose', id: 5655 });
  assert.equal(game.snapshot().honor, null, 'quà khác không được ngồi ghế VIP');
  assert.equal(game.gift({ id: 'id:Bình', name: 'Bình', avatar: 'https://p16.tiktokcdn.com/b.webp' }, 1, 1, { name: 'Heart Me', id: 7934 }).photo, true);
  assert.deepEqual(game.snapshot().honor, { name: 'Bình', avatar: 'https://p16.tiktokcdn.com/b.webp', look: game.players.get('id:Bình').look });
  assert.equal(of('gift').at(-1).icon, '/gifts/heart-me.webp', 'không có hình quà thật thì dùng hình Tim cam');
  game.gift(who('Chi'), 1, 1, { name: 'tim  CAM' });
  assert.equal(game.snapshot().honor.name, 'Chi');
  game.gift(who('Dũng'), 1, 1, { id: '7934' });
  game.gift(who('Dũng'), 1, 1, { id: 7934 });
  assert.deepEqual(of('honor').map((h) => h.name), ['Bình', 'Chi', 'Dũng'], 'cùng người gửi tiếp thì không báo lại');
  assert.ok(!JSON.stringify(game.exportState()).includes('tiktokcdn'), 'không lưu ảnh ra file');
});

test('có lượt x2 thì đoán đúng +2 và mất một lượt; đoán sai không mất lượt', () => {
  const { game, of, advance } = setup();
  game.addTurns(who('An'), 2, 'follow');
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
  game.social(who('Chi'), 'follow');
  advance(500);
  const board = of('board').at(-1).board;
  assert.deepEqual(board.map((p) => [p.name, p.score, p.turns]), [['An', 1, 0], ['Bình', 1, 0], ['Chi', 0, 1]]);
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

test('lưu và nạp lại bảng điểm cùng lượt x2, quỹ lớp, tên trên bảng', () => {
  const a = setup();
  a.game.comment(who('An'), 'mèo');
  a.game.gift(who('Bình'), 5, 1, { name: 'Tim cam' });
  a.game.social(who('Chi'), 'follow');
  const saved = JSON.parse(JSON.stringify(a.game.exportState()));
  const b = setup();
  b.game.importState(saved);
  assert.equal(b.game.players.get('id:An').score, 1);
  assert.equal(b.game.boosts.get('id:Chi'), 1);
  assert.equal(b.game.fund.coins, 5);
  assert.deepEqual(b.game.fund.by.get('id:Bình'), { name: 'Bình', coins: 5 });
  assert.equal(b.game.snapshot().honor.name, 'Bình');
  // Bảng điểm cũ (luật trước) có lượt x2 từ quà và patrons: lượt x2 vẫn giữ.
  const c = setup();
  c.game.importState({ players: [{ id: 'id:Dũng', name: 'Dũng', score: 3, reachedAt: 1 }], boosts: [['id:Dũng', 13]], patrons: [['id:Dũng', '/gifts/lucky-pig.webp']] });
  assert.equal(c.game.boosts.get('id:Dũng'), 13);
  assert.equal(c.game.fund.coins, 0);
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

const MONITOR = { sleepWords: 2, perWord: 2, lines: ['Ra ngoài!'], replies: ['Ui da!'] };

test('thầy giám thị: im lặng 1 từ thì ngủ gật, 2 từ liền thì bị kéo ra khỏi lớp (giữ điểm), comment là vào lại', () => {
  const { game, of, advance } = setup({ monitor: MONITOR });
  const next = () => {
    game.skip();
    game.skip();
  };
  game.comment(who('An'), 'mèo');
  game.comment(who('Bình'), 'mèo');
  next();
  game.comment(who('Bình'), 'nói chuyện');
  next();
  assert.deepEqual(game.board().map((p) => [p.name, p.sleepy]), [['An', true], ['Bình', false]], 'comment sai cũng là thức');
  advance(3000);
  assert.equal(of('monitor').length, 0, 'mới ngủ gật một từ');
  next();
  advance(2000);
  assert.equal(of('monitor').length, 0, 'chờ cô đọc từ mới');
  advance(1000);
  assert.deepEqual(of('monitor').map((m) => [m.name, m.line, m.reply, m.first, m.ms]), [['An', 'Ra ngoài!', 'Ui da!', true, PULL_MS]]);
  assert.deepEqual(game.board().map((p) => p.name), ['An', 'Bình'], 'đang bị kéo thì vẫn giữ chỗ tới khi ra tới cửa');
  advance(PULL_MS);
  assert.deepEqual(of('expel').map((e) => [e.name, e.woke]), [['An', false]]);
  assert.deepEqual(of('board').at(-1).board.map((p) => p.name), ['Bình']);
  assert.equal(game.players.get('id:An').score, 1, 'vẫn giữ điểm');

  const saved = JSON.parse(JSON.stringify(game.exportState()));
  const b = setup({ monitor: MONITOR });
  b.game.importState(saved);
  assert.deepEqual(b.game.board().map((p) => [p.name, p.sleepy]), [['Bình', false]], 'nạp lại: người bị kéo vẫn ở ngoài, chưa ai ngủ gật');

  game.comment(who('An'), 'chào cô');
  assert.deepEqual(game.board().map((p) => [p.name, p.sleepy]), [['An', false], ['Bình', true]], 'An vào lại lớp; Bình đã im một từ');
});

test('thầy giám thị: đang bị kéo mà kịp comment thì được về chỗ; mỗi từ tối đa perWord lần; sleepWords 0 là tắt', () => {
  const { game, of, advance } = setup({ monitor: { ...MONITOR, sleepWords: 1, perWord: 1 } });
  for (const name of ['An', 'Bình', 'Chi']) game.comment(who(name), 'mèo');
  game.skip();
  game.skip();
  game.skip();
  game.skip();
  advance(3000);
  const [pull] = of('monitor');
  assert.equal(pull.name, 'An');
  advance(1000);
  game.comment(who('An'), 'em đây');
  advance(PULL_MS);
  assert.deepEqual(of('expel').map((e) => [e.name, e.woke]), [['An', true]]);
  assert.equal(game.board().length, 3);
  advance(20_000);
  assert.equal(of('monitor').length, 1, 'đủ perWord lần trong từ này');
  assert.equal(game.summon(), true, 'bảng điều khiển gọi thầy ngay');
  assert.equal(of('monitor').at(-1).name, 'Bình');

  const off = setup();
  off.game.comment(who('An'), 'mèo');
  for (let n = 0; n < 6; n++) off.game.skip();
  off.advance(10_000);
  assert.equal(off.of('monitor').length, 0);
  assert.equal(off.game.board()[0].sleepy, false);
});
