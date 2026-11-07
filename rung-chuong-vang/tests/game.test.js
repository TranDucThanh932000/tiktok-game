import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, parseComment } from '../src/game.js';
import { createQuestions, validateBank } from '../src/questions.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const T = config.timing;

// Câu nào đáp án đúng cũng là A để bài test dễ đọc.
const fixedQuestions = { next: () => ({ subject: 'Toán', text: '1 + 1 = ?', options: ['2', '3', '4', '5'], correct: 0, explain: '' }) };

function setup(overrides = {}) {
  let clock = 1_000_000;
  const events = [];
  const game = new Game({ ...config, ...overrides }, { questions: fixedQuestions, emit: (msg) => events.push(msg), now: () => clock });
  return {
    game,
    events,
    advance(ms) {
      clock += ms;
      game.tick();
    },
    last: (type) => events.filter((e) => e.type === type).at(-1),
    count: (type) => events.filter((e) => e.type === type).length,
  };
}

const who = (name) => ({ id: name, name });
const say = (ctx, name, text) => ctx.game.comment(who(name), text);

// Mọi người lên sàn rồi vào câu 1.
function start(ctx, names) {
  for (const name of names) assert.equal(say(ctx, name, 'vào'), 'join');
  ctx.advance(T.lobbySeconds * 1000);
  assert.equal(ctx.game.phase, 'asking');
  assert.equal(ctx.game.questionNo, 1);
}

// Trả lời theo bảng { tên: 'A' }, rồi chờ hết giờ để công bố đáp án.
function round(ctx, picks) {
  for (const [name, text] of Object.entries(picks)) say(ctx, name, text);
  ctx.advance(T.askSeconds * 1000);
  assert.equal(ctx.game.phase, 'reveal');
  const result = ctx.last('reveal').result;
  ctx.advance(T.revealSeconds * 1000);
  return result;
}

const NAMES = Array.from({ length: 10 }, (_, i) => `N${i}`);

test('nhận đáp án A B C D đủ kiểu gõ, không nhận tiếng đệm', () => {
  for (const [text, choice] of [['a', 0], ['B', 1], ['ccc', 2], ['đáp án d', 3], ['chọn b nha', 1], ['Là C.', 2], ['câu a', 0]]) {
    assert.deepEqual(parseComment(text), { kind: 'answer', choice }, text);
  }
  for (const text of ['à', 'á', 'ạ', 'ab', 'a b', 'e', 'ok a đi', '']) assert.equal(parseComment(text)?.kind, undefined, text);
});

test('nhận comment lên sàn có dấu, không dấu, có chữ đệm', () => {
  for (const text of ['vào', 'Vô', 'VAO', 'tham gia', 'cho em vào với', 'vào sân', 'vô sàn nha', 'join', 'lên sàn']) {
    assert.deepEqual(parseComment(text), { kind: 'join' }, text);
  }
  for (const text of ['vỏ', 'vợ', 'vào đây làm gì vậy', 'hello']) assert.equal(parseComment(text), null, text);
});

test('chưa đủ người thì chờ; đủ người sau giờ mở sàn thì đếm thêm 5 giây rồi hỏi câu 1', () => {
  const ctx = setup();
  say(ctx, 'Lan', 'vào');
  ctx.advance(T.lobbySeconds * 1000 + 60_000);
  assert.equal(ctx.game.phase, 'lobby');
  say(ctx, 'Huy', 'vào');
  ctx.advance(4000);
  assert.equal(ctx.game.phase, 'lobby');
  ctx.advance(1000);
  assert.equal(ctx.game.phase, 'asking');
  assert.equal(ctx.count('start'), 1);
});

test('trả lời sai hoặc không trả lời thì rời sàn, chỉ tính đáp án đầu tiên', () => {
  const ctx = setup();
  start(ctx, ['Lan', 'Huy', 'Mai', 'Nam']);
  assert.equal(say(ctx, 'Lan', 'a'), 'answer');
  assert.equal(say(ctx, 'Huy', 'b'), 'answer');
  // Đổi ý không được tính.
  assert.equal(say(ctx, 'Huy', 'a'), null);
  say(ctx, 'Mai', 'A');
  const result = round(ctx, {});
  assert.equal(result.right, 2);
  assert.deepEqual(result.counts, [2, 1, 0, 0]);
  assert.equal(result.out.length, 2);
  assert.equal(result.fastest.name, 'Lan');
  assert.equal(ctx.game.aliveCount, 2);
  // Người đã rời sàn trả lời câu sau không được tính.
  assert.equal(say(ctx, 'Huy', 'a'), null);
});

test('cả sàn cùng sai thì không ai bị loại', () => {
  const ctx = setup();
  start(ctx, ['Lan', 'Huy']);
  const result = round(ctx, { Lan: 'b', Huy: 'c' });
  assert.equal(result.allWrong, true);
  assert.equal(result.out.length, 0);
  assert.equal(ctx.game.aliveCount, 2);
});

test('ai cũng trả lời rồi thì đóng câu sớm', () => {
  const ctx = setup();
  start(ctx, ['Lan', 'Huy']);
  say(ctx, 'Lan', 'a');
  say(ctx, 'Huy', 'a');
  ctx.advance(T.earlyCloseSeconds * 1000);
  assert.equal(ctx.game.phase, 'reveal');
});

test('câu 1 vẫn cho người mới trả lời để lên sàn, từ câu 2 thì không', () => {
  const ctx = setup();
  start(ctx, ['Lan', 'Huy']);
  assert.equal(say(ctx, 'Mới', 'a'), 'answer');
  assert.equal(ctx.game.players.size, 3);
  round(ctx, { Lan: 'a', Huy: 'a' });
  assert.equal(ctx.game.questionNo, 2);
  assert.equal(say(ctx, 'Muộn', 'a'), 'nudge');
  assert.equal(say(ctx, 'Muộn 2', 'vào'), null); // cả phòng đang trong 4 giây chờ nhắc
  assert.equal(ctx.game.players.has('Muộn'), false);
});

test('phao giữ người trả lời sai ở lại sàn, mỗi phao dùng một lần', () => {
  const ctx = setup();
  start(ctx, ['Lan', 'Huy', 'Mai']);
  const res = ctx.game.gift(who('Huy'), { coins: 5 }, 1);
  assert.deepEqual(res, { effect: 'shield', shields: 1, revived: false });
  let result = round(ctx, { Lan: 'a', Huy: 'b', Mai: 'a' });
  assert.deepEqual(result.saved, [ctx.game.players.get('Huy').pid]);
  assert.equal(ctx.game.players.get('Huy').alive, true);
  assert.equal(ctx.game.players.get('Huy').shields, 0);
  result = round(ctx, { Lan: 'a', Huy: 'b', Mai: 'a' });
  assert.equal(ctx.game.players.get('Huy').alive, false);
});

test('quà lớn đưa người đã rời sàn quay lại; khi sàn đóng thì đưa người mới lên sàn', () => {
  const ctx = setup();
  start(ctx, ['Lan', 'Huy', 'Mai']);
  round(ctx, { Lan: 'a', Huy: 'b', Mai: 'a' });
  assert.equal(ctx.game.players.get('Huy').alive, false);
  assert.deepEqual(ctx.game.gift(who('Huy'), { coins: 10 }, 1), { effect: 'revive', shields: 0, revived: true });
  assert.equal(ctx.game.players.get('Huy').alive, true);
  // Đang trên sàn thì quà lớn thành phao; quà đắt hơn bậc cao nhất vẫn tính bậc cao nhất.
  assert.deepEqual(ctx.game.gift(who('Lan'), { coins: 99 }, 2), { effect: 'revive', shields: 2, revived: false });
  // Sàn đã đóng: quà lớn là vé lên sàn, quà phao thì chỉ là cổ vũ.
  assert.deepEqual(ctx.game.gift(who('Khách'), { coins: 5 }, 1), { effect: 'cheer', shields: 0, revived: false });
  assert.equal(ctx.game.players.has('Khách'), false);
  assert.deepEqual(ctx.game.gift(who('Khách'), { coins: 10 }, 3), { effect: 'revive', shields: 2, revived: true });
  assert.equal(ctx.game.players.get('Khách').alive, true);
  // Quà rẻ hơn bậc thấp nhất không có tác dụng.
  assert.equal(ctx.game.gift(who('Lan'), { coins: 0 }, 1), null);
});

test('lúc mở sàn quà nào cũng đưa người tặng lên sàn', () => {
  const ctx = setup();
  assert.equal(ctx.game.gift(who('Lan'), { coins: 1 }, 1).effect, 'cheer');
  assert.equal(ctx.game.players.get('Lan').alive, true);
  assert.deepEqual(ctx.game.gift(who('Huy'), { coins: 10 }, 1), { effect: 'revive', shields: 1, revived: false });
});

test('sàn còn ít người thì có cứu trợ: người đã rời sàn trả lời đúng được quay lại', () => {
  const ctx = setup({ rescue: { minQuestion: 2, alivePercent: 30, maxTimes: 1 } });
  start(ctx, NAMES);
  // Câu 1: 6 người đúng, chưa tới câu được cứu trợ.
  round(ctx, Object.fromEntries(NAMES.map((n, i) => [n, i < 6 ? 'a' : 'b'])));
  assert.equal(ctx.game.phase, 'asking');
  // Câu 2: còn 3 người (<= 30% của 10) thì vào cứu trợ.
  round(ctx, { N0: 'a', N1: 'a', N2: 'a', N3: 'b', N4: 'b', N5: 'b' });
  assert.equal(ctx.game.phase, 'intro');
  assert.equal(ctx.game.mode, 'rescue');
  ctx.advance(T.introSeconds * 1000);
  assert.equal(ctx.game.phase, 'asking');
  // Người trên sàn không trả lời câu cứu trợ.
  assert.equal(say(ctx, 'N0', 'a'), null);
  const result = round(ctx, { N3: 'a', N7: 'a', N8: 'c' });
  assert.equal(result.back.length, 2);
  assert.equal(ctx.game.aliveCount, 5);
  // Hết lượt cứu trợ thì hỏi tiếp câu 3.
  assert.equal(ctx.game.mode, 'main');
  assert.equal(ctx.game.questionNo, 3);
});

test('còn một người thì vào câu hỏi vàng; đúng hết là rung chuông vàng', () => {
  const ctx = setup({ rescue: { minQuestion: 99, alivePercent: 30, maxTimes: 0 } });
  start(ctx, ['Lan', 'Huy']);
  round(ctx, { Lan: 'a', Huy: 'b' });
  assert.equal(ctx.game.phase, 'intro');
  assert.equal(ctx.game.mode, 'golden');
  assert.equal(ctx.last('intro').finalist.name, 'Lan');
  ctx.advance(T.introSeconds * 1000);
  for (let i = 1; i <= config.goldenQuestions; i++) {
    assert.equal(ctx.game.goldenNo, i);
    // Người khác, kể cả người mới, không trả lời được câu hỏi vàng.
    assert.equal(say(ctx, 'Huy', 'a'), null);
    assert.notEqual(say(ctx, 'Mới', 'a'), 'answer');
    assert.equal(ctx.game.players.has('Mới'), false);
    const result = round(ctx, { Lan: 'a' });
    assert.equal(result.passed, true);
  }
  assert.equal(ctx.game.phase, 'end');
  assert.equal(ctx.game.champion.kind, 'bell');
  assert.equal(ctx.game.champion.winners[0].name, 'Lan');
  // Lúc ăn mừng, quà lớn chỉ là cổ vũ.
  assert.equal(ctx.game.gift(who('Huy'), { coins: 10 }, 1).effect, 'cheer');
  ctx.advance(T.endSeconds * 1000);
  assert.equal(ctx.game.phase, 'lobby');
  assert.equal(ctx.game.players.size, 0);
});

test('trả lời sai câu hỏi vàng thì dừng lại, vẫn là người cuối cùng trên sàn', () => {
  const ctx = setup({ rescue: { minQuestion: 99, alivePercent: 30, maxTimes: 0 } });
  start(ctx, ['Lan', 'Huy']);
  round(ctx, { Lan: 'a', Huy: 'b' });
  ctx.advance(T.introSeconds * 1000);
  round(ctx, { Lan: 'a' });
  round(ctx, { Lan: 'c' });
  assert.equal(ctx.game.phase, 'end');
  assert.equal(ctx.game.champion.kind, 'fail');
  assert.equal(ctx.game.champion.goldenNo, 2);
});

test('câu thường cuối cùng không có cứu trợ: còn một người thì vẫn vào câu hỏi vàng', () => {
  const ctx = setup({ maxQuestions: 5, rescue: { minQuestion: 4, alivePercent: 60, maxTimes: 2 } });
  start(ctx, NAMES);
  for (let q = 1; q <= 4; q++) round(ctx, Object.fromEntries(NAMES.map((n) => [n, 'a'])));
  round(ctx, Object.fromEntries(NAMES.map((n, i) => [n, i === 0 ? 'a' : 'b'])));
  assert.equal(ctx.game.phase, 'intro');
  assert.equal(ctx.game.mode, 'golden');
  assert.equal(ctx.last('intro').finalist.name, 'N0');
});

test('hết số câu tối đa mà còn nhiều người thì cùng về đích', () => {
  const ctx = setup({ maxQuestions: 2 });
  start(ctx, ['Lan', 'Huy', 'Mai']);
  round(ctx, { Lan: 'a', Huy: 'a', Mai: 'b' });
  round(ctx, { Lan: 'a', Huy: 'a' });
  assert.equal(ctx.game.phase, 'end');
  assert.equal(ctx.game.champion.kind, 'many');
  assert.deepEqual(ctx.game.champion.winners.map((w) => w.name), ['Lan', 'Huy']);
  // Mai không đúng câu nào nên không vào top.
  assert.deepEqual(ctx.game.champion.top.map((p) => p.name), ['Lan', 'Huy']);
});

test('bảng điều khiển: bỏ câu không loại ai, sang bước tiếp, kết thúc sớm', () => {
  const ctx = setup();
  assert.equal(ctx.game.advance(), false);
  say(ctx, 'Lan', 'vào');
  assert.equal(ctx.game.advance(), true);
  assert.equal(ctx.game.phase, 'asking');
  say(ctx, 'Huy', 'b');
  assert.equal(ctx.game.skip(), true);
  assert.equal(ctx.game.questionNo, 1);
  assert.equal(ctx.game.answers.size, 0);
  assert.equal(ctx.game.aliveCount, 2);
  assert.equal(ctx.game.advance(), true);
  assert.equal(ctx.game.phase, 'reveal');
  assert.equal(ctx.game.stop(), true);
  assert.equal(ctx.game.phase, 'end');
});

test('màn hình không nhận đáp án trước khi công bố', () => {
  const ctx = setup();
  start(ctx, ['Lan', 'Huy']);
  assert.equal(ctx.last('ask').state.question.correct, null);
  say(ctx, 'Lan', 'a');
  assert.equal(ctx.last('answer').state.question.correct, null);
  ctx.advance(T.askSeconds * 1000);
  assert.equal(ctx.last('reveal').state.question.correct, 0);
});

test('bộ câu hỏi questions.json hợp lệ, xáo đáp án nhưng giữ đúng đáp án đúng', () => {
  const bank = JSON.parse(readFileSync(new URL('../questions.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateBank(bank), []);
  const questions = createQuestions(bank);
  const seen = new Set();
  for (let i = 0; i < bank.length; i++) {
    const q = questions.next();
    seen.add(q.text);
    const row = bank.find((r) => r.q === q.text);
    assert.equal(q.options[q.correct], String(row.o[0]));
  }
  // Hết một vòng mới lặp lại.
  assert.equal(seen.size, new Set(bank.map((r) => r.q)).size);
});
