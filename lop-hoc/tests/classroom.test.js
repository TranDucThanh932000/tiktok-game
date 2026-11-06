import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Classroom, parseComment } from '../src/classroom.js';
import { createQuestions, validateBank } from '../src/questions.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

// Câu nào đáp án đúng cũng là A, để bài test đọc dễ.
const fixedQuestions = {
  next: () => ({ subject: 'Toán', text: '1 + 1?', options: ['2', '3', '4', '5'], correct: 0, explain: '1 + 1 = 2' }),
};

function setup(overrides = {}) {
  let clock = 1_000_000;
  const events = [];
  const room = new Classroom({ ...config, ...overrides }, {
    questions: fixedQuestions,
    emit: (msg) => events.push(msg),
    now: () => clock,
  });
  room.tick();
  return {
    room,
    events,
    advance(ms) {
      clock += ms;
      room.tick();
    },
    last: (type) => events.filter((e) => e.type === type).at(-1),
  };
}

const who = (name) => ({ id: name, name });
const fill = (room, n = config.seats) => {
  for (let i = 0; i < n; i++) room.comment(who(`hs${i}`), 'vào');
};
const finishQuestion = (ctx) => ctx.advance((config.timing.askSeconds + config.timing.graceSeconds) * 1000);
const nextQuestion = (ctx) => ctx.advance(config.timing.revealSeconds * 1000);

test('hiểu comment vào lớp, kể cả không dấu và có thêm chữ', () => {
  for (const text of ['vào', 'Vào', 'VAO', 'vao!', 'vào lớp', 'Vào lớp nha', 'cho em vào', 'xin vào', 'vô', 'vô lớp', 'vào 😀'])
    assert.deepEqual(parseComment(text), { kind: 'join' }, text);
  for (const text of ['vào đây xem', 'không vào', 'vợ', 'vỏ', 'hello', '']) assert.equal(parseComment(text), null, text);
});

test('hiểu đáp án A B C D nhưng không nhầm tiếng đệm', () => {
  const cases = { a: 0, A: 0, b: 1, ' C ': 2, 'D.': 3, 'đáp án B': 1, 'dap an c': 2, 'chọn d': 3, aaa: 0, 'b nha': 1, 'Ａ': 0 };
  for (const [text, choice] of Object.entries(cases)) assert.deepEqual(parseComment(text), { kind: 'answer', choice }, text);
  for (const text of ['à', 'á', 'ạ', 'Ừ', 'abc', 'a b', 'đ', 'câu a hay b']) assert.equal(parseComment(text), null, text);
});

test('chat vào thì được chỗ, vào lại không chiếm thêm ghế', () => {
  const { room, last } = setup();
  room.comment(who('Lan'), 'vào');
  room.comment(who('Lan'), 'vào');
  assert.equal(room.count, 1);
  assert.equal(last('join').student.name, 'Lan');
  assert.equal(last('wave').seat, 0);
});

test('đúng +1, sai giữ nguyên, không trả lời giữ nguyên', () => {
  const ctx = setup();
  const { room } = ctx;
  for (const name of ['Nhanh', 'Đúng', 'Sai', 'Lặng']) room.comment(who(name), 'vào');
  room.comment(who('Nhanh'), 'A');
  room.comment(who('Đúng'), 'A');
  room.comment(who('Sai'), 'B');
  finishQuestion(ctx);
  const score = (name) => room.seats.find((s) => s?.name === name).score;
  assert.equal(score('Đúng'), 1);
  assert.equal(score('Sai'), 0);
  assert.equal(score('Lặng'), 0);
  assert.equal(ctx.last('reveal').correct, 0);
});

test('bạn đúng đầu tiên được x2 câu đó, bạn sai trả lời trước không tính', () => {
  const ctx = setup();
  const { room } = ctx;
  for (const name of ['Sai', 'Nhanh', 'Chậm']) room.comment(who(name), 'vào');
  room.comment(who('Sai'), 'B');
  room.comment(who('Nhanh'), 'A');
  room.comment(who('Chậm'), 'A');
  finishQuestion(ctx);
  const score = (name) => room.seats.find((s) => s?.name === name).score;
  assert.equal(score('Sai'), 0);
  assert.equal(score('Nhanh'), 2);
  assert.equal(score('Chậm'), 1);
  assert.deepEqual(ctx.last('reveal').results.map((r) => r.first), [false, true, false]);
});

test('câu sau xét lại từ đầu, không ai đúng thì không ai được x2', () => {
  const ctx = setup();
  const { room } = ctx;
  for (const name of ['Lan', 'Hà']) room.comment(who(name), 'vào');
  room.comment(who('Lan'), 'A');
  room.comment(who('Hà'), 'A');
  finishQuestion(ctx);
  nextQuestion(ctx);
  room.comment(who('Hà'), 'A');
  room.comment(who('Lan'), 'A');
  finishQuestion(ctx);
  assert.equal(room.seats[0].score, 3, 'Lan: 2 + 1');
  assert.equal(room.seats[1].score, 3, 'Hà: 1 + 2');
  nextQuestion(ctx);
  room.comment(who('Lan'), 'B');
  finishQuestion(ctx);
  assert.equal(ctx.last('reveal').results.some((r) => r.first), false);
});

test('đúng đầu tiên cộng dồn với lượt x2', () => {
  const ctx = setup();
  const { room } = ctx;
  room.comment(who('Lan'), 'vào');
  room.gift(who('Lan'), 1);
  room.comment(who('Lan'), 'A');
  finishQuestion(ctx);
  assert.equal(room.seats[0].score, 4);
  assert.equal(ctx.last('reveal').results[0].delta, 4);
});

test('chỉ tính đáp án đầu tiên', () => {
  const ctx = setup();
  ctx.room.comment(who('Lan'), 'vào');
  ctx.room.comment(who('Lan'), 'B');
  ctx.room.comment(who('Lan'), 'A');
  finishQuestion(ctx);
  assert.equal(ctx.room.seats[0].score, 0);
});

test('người chưa vào lớp trả lời thì được nhắc, không được điểm', () => {
  const ctx = setup();
  ctx.room.comment(who('Khách'), 'A');
  ctx.room.comment(who('Khách'), 'B');
  assert.equal(ctx.room.count, 0);
  assert.equal(ctx.events.filter((e) => e.type === 'hint').length, 1);
});

test('đáp án gửi muộn trong thời gian bù trễ vẫn được tính', () => {
  const ctx = setup();
  ctx.room.comment(who('Lan'), 'vào');
  ctx.room.comment(who('Hà'), 'vào');
  ctx.advance(config.timing.askSeconds * 1000 + 500);
  assert.equal(ctx.room.phase, 'asking');
  ctx.room.comment(who('Lan'), 'A');
  finishQuestion(ctx);
  assert.equal(ctx.room.seats[0].score, 2);
});

test('ba bạn cao điểm nhất làm ban cán sự, người 0 điểm không có chức', () => {
  const ctx = setup();
  const { room } = ctx;
  for (const name of ['Một', 'Hai', 'Ba', 'Tư', 'Năm']) room.comment(who(name), 'vào');
  const round = (names) => {
    names.forEach((name) => room.comment(who(name), 'A'));
    finishQuestion(ctx);
    nextQuestion(ctx);
  };
  round(['Một', 'Hai']);
  assert.deepEqual(room.officers.map((o) => o.name), ['Một', 'Hai']);
  round(['Hai', 'Ba']);
  round(['Hai', 'Tư']);
  assert.deepEqual(room.officers.map((o) => [o.name, o.score, o.title]), [
    ['Hai', 5, 'Lớp trưởng'],
    ['Một', 2, 'Lớp phó học tập'],
    ['Ba', 1, 'Lớp phó học tập'],
  ]);
});

test('hoa hồng 1 xu: câu tiếp theo đúng được x2, câu sau về +1', () => {
  const ctx = setup();
  const { room } = ctx;
  room.comment(who('Lan'), 'vào');
  room.comment(who('Hà'), 'vào');
  assert.deepEqual(room.gift(who('Lan'), 1), { added: 1, turns: 1 });
  // Hà luôn đúng trước để phần x2 của đúng đầu tiên không lẫn vào.
  room.comment(who('Hà'), 'A');
  room.comment(who('Lan'), 'A');
  finishQuestion(ctx);
  assert.equal(room.seats[0].score, 2);
  nextQuestion(ctx);
  room.comment(who('Hà'), 'A');
  room.comment(who('Lan'), 'A');
  finishQuestion(ctx);
  assert.equal(room.seats[0].score, 3);
});

test('mức quà: 1 xu 1 lượt, 5 xu 6 lượt, 10 xu 13 lượt, cộng dồn và nhân số lượng', () => {
  const { room } = setup();
  assert.equal(room.gift(who('A'), 1).turns, 1);
  assert.equal(room.gift(who('B'), 5).turns, 6);
  assert.equal(room.gift(who('C'), 10).turns, 13);
  assert.equal(room.gift(who('D'), 5, 2).turns, 12);
  room.gift(who('D'), 1);
  assert.equal(room.boosts.get('D'), 13);
  assert.equal(room.gift(who('E'), 99).turns, 13 * 9);
  assert.equal(room.gift(who('F'), 0), null);
});

test('lượt x2 mất khi trả lời (đúng hay sai), không trả lời thì còn nguyên', () => {
  const ctx = setup();
  const { room } = ctx;
  room.comment(who('Lan'), 'vào');
  room.comment(who('Hà'), 'vào');
  room.gift(who('Lan'), 5);
  finishQuestion(ctx); // Lan không trả lời
  nextQuestion(ctx);
  assert.equal(room.boosts.get('Lan'), 6);
  room.comment(who('Lan'), 'B'); // sai
  finishQuestion(ctx);
  assert.equal(room.boosts.get('Lan'), 5);
  assert.equal(room.seats[0].score, 0);
});

test('follow, share được 1 lượt x2, mỗi người tối đa 1 lần mỗi phút, quá thì không báo gì', () => {
  const ctx = setup();
  const { room } = ctx;
  const boosts = () => ctx.events.filter((e) => e.type === 'boost').length;
  assert.deepEqual(room.social(who('Lan'), 'follow'), { added: 1, turns: 1 });
  assert.equal(ctx.last('boost').kind, 'follow');
  assert.equal(room.seatOf('Lan'), 0, 'chưa vào lớp thì được vào luôn');

  // Follow rồi share ngay, hay share liên tục, đều chỉ tính một lần.
  assert.equal(room.social(who('Lan'), 'share'), null);
  assert.equal(room.social(who('Lan'), 'share'), null);
  assert.equal(boosts(), 1);
  assert.equal(room.boosts.get('Lan'), 1);

  // Người khác không bị ảnh hưởng.
  assert.deepEqual(room.social(who('Hà'), 'share'), { added: 1, turns: 1 });

  ctx.advance(config.boost.socialGapSeconds * 1000 - 1);
  assert.equal(room.social(who('Lan'), 'share'), null);
  ctx.advance(1);
  assert.deepEqual(room.social(who('Lan'), 'share'), { added: 1, turns: 2 });
});

test('lượt x2 từ share được dùng ở câu trả lời tiếp theo rồi hết', () => {
  const ctx = setup();
  const { room } = ctx;
  room.comment(who('Nhanh'), 'vào');
  room.comment(who('Lan'), 'vào');
  room.social(who('Lan'), 'share');
  room.comment(who('Nhanh'), 'A');
  room.comment(who('Lan'), 'A');
  finishQuestion(ctx);
  assert.equal(room.seats[1].score, 2);
  assert.equal(room.boosts.has('Lan'), false);
  nextQuestion(ctx);
  room.comment(who('Nhanh'), 'A');
  room.comment(who('Lan'), 'A');
  finishQuestion(ctx);
  assert.equal(room.seats[1].score, 3);
});

test('người chưa vào lớp có quà thì được vào lớp luôn', () => {
  const { room, last } = setup();
  room.gift(who('Lan'), 10);
  assert.equal(room.count, 1);
  assert.equal(last('boost').seat, 0);
  assert.equal(last('join').student.turns, 13);
});

test('lớp đầy: người vào sau thay người thấp điểm nhất, bằng điểm thì ai im lâu nhất', () => {
  const ctx = setup();
  const { room } = ctx;
  fill(room);
  for (let i = 0; i < config.seats; i++) if (i !== 5 && i !== 9) room.comment(who(`hs${i}`), 'A');
  finishQuestion(ctx);
  nextQuestion(ctx);
  // hs5 và hs9 cùng 0 điểm; hs9 vừa nói gì đó nên hs5 im lâu hơn.
  room.comment(who('hs9'), 'B');
  ctx.advance(config.newcomerGraceSeconds * 1000);
  room.comment(who('Mới'), 'vào');
  assert.equal(room.count, config.seats);
  assert.equal(ctx.last('join').kicked.name, 'hs5');
  assert.equal(room.seats[5].name, 'Mới');
  assert.equal(room.seats[5].score, 0);
});

test('bị mời ra rồi vào lại thì điểm về 0 nhưng lượt x2 vẫn còn', () => {
  const ctx = setup();
  const { room } = ctx;
  fill(room);
  ctx.advance(config.newcomerGraceSeconds * 1000);
  room.comment(who('Mới'), 'vào');
  assert.equal(ctx.last('join').kicked.name, 'hs0');
  // Quà gửi lúc đang ở ngoài cũng được giữ; hàng chờ đưa hs0 vào khi tới lượt.
  room.gift(who('hs0'), 1, 4);
  ctx.advance(config.kickGapSeconds * 1000);
  room.comment(who('hs0'), 'vào');
  const seat = room.seatOf('hs0');
  assert.equal(room.seats[seat].score, 0);
  assert.equal(ctx.last('join').student.turns, 4);
});

test('không mời ra: ban cán sự, người còn lượt x2, người vừa vào, người đang chờ kết quả', () => {
  const ctx = setup();
  const { room } = ctx;
  fill(room);
  // hs0 có điểm và làm lớp trưởng, nhưng không ai đủ thấp để thay nếu còn trong thời gian làm quen.
  room.comment(who('hs0'), 'A');
  finishQuestion(ctx);
  nextQuestion(ctx);
  assert.equal(room.pickVictim()?.id !== 'hs0', true);
  room.comment(who('hs1'), 'A');
  room.gift(who('hs2'), 1);
  ctx.advance(config.newcomerGraceSeconds * 1000 - (config.timing.askSeconds + config.timing.graceSeconds + config.timing.revealSeconds) * 1000 + 1000);
  const victim = room.pickVictim();
  assert.ok(victim);
  assert.notEqual(victim.id, 'hs0');
  assert.notEqual(victim.id, 'hs1');
  assert.notEqual(victim.id, 'hs2');
});

test('người vừa vào được giữ chỗ: lớp đầy toàn người mới thì người sau phải chờ ngoài cửa', () => {
  const ctx = setup();
  const { room } = ctx;
  fill(room);
  room.comment(who('Sau'), 'vào');
  assert.equal(room.seatOf('Sau'), -1);
  assert.equal(ctx.last('waiting').count, 1);
  ctx.advance(config.newcomerGraceSeconds * 1000);
  assert.ok(room.seatOf('Sau') >= 0);
  assert.equal(room.waiting.length, 0);
  assert.equal(ctx.last('join').waiting, 0, 'tin vào lớp phải báo hàng chờ đã trống');
});

test('đông người: mỗi lần thay cách nhau ít nhất kickGap, không xáo tung cả lớp', () => {
  const ctx = setup();
  const { room } = ctx;
  fill(room);
  ctx.advance(config.newcomerGraceSeconds * 1000);
  for (let i = 0; i < 10; i++) room.comment(who(`mới${i}`), 'vào');
  assert.equal(ctx.events.filter((e) => e.type === 'join' && e.kicked).length, 1);
  assert.equal(room.waiting.length, 9);
  ctx.advance(config.kickGapSeconds * 1000);
  assert.equal(ctx.events.filter((e) => e.type === 'join' && e.kicked).length, 2);
});

test('có quà thì chen lên đầu hàng chờ', () => {
  const ctx = setup();
  const { room } = ctx;
  fill(room);
  room.comment(who('Chờ'), 'vào');
  room.gift(who('Quà'), 1);
  assert.deepEqual(room.waiting.map((w) => w.id), ['Quà', 'Chờ']);
});

test('cả lớp trả lời xong thì rút ngắn giờ, nhưng không dưới mức tối thiểu', () => {
  const ctx = setup();
  const { room } = ctx;
  room.comment(who('Lan'), 'vào');
  room.comment(who('Lan'), 'A');
  assert.equal(ctx.last('hurry').endsAt - room.startedAt, config.timing.minAskSeconds * 1000);
});

test('hết bộ câu thì khen ban cán sự, không có ai điểm thì hỏi tiếp luôn', () => {
  const ctx = setup({ setSize: 2 });
  const { room } = ctx;
  finishQuestion(ctx);
  nextQuestion(ctx);
  room.comment(who('Lan'), 'vào');
  room.comment(who('Lan'), 'A');
  ctx.advance(config.timing.askSeconds * 1000);
  ctx.advance(config.timing.graceSeconds * 1000);
  ctx.advance(config.timing.revealSeconds * 1000);
  assert.equal(room.phase, 'recap');
  assert.equal(ctx.last('recap').officers[0].name, 'Lan');
  ctx.advance(config.timing.recapSeconds * 1000);
  assert.equal(room.phase, 'asking');
});

test('đồng hồ chờ cô đọc xong, lời công bố dài thì câu sau chờ, chưa có giọng thì chờ một lát', () => {
  let clock = 1_000_000;
  let hold = true;
  const director = { asking: () => 12_000, revealing: () => 20_000, recapping: () => 0, holdAsk: () => hold };
  const room = new Classroom(config, { questions: fixedQuestions, now: () => clock, director });
  room.tick();
  assert.equal(room.phase, 'idle', 'chưa có giọng câu đầu thì chưa hỏi');
  hold = false;
  room.tick();
  assert.equal(room.timerFrom, clock + 12_000);
  assert.equal(room.endsAt, clock + 12_000 + config.timing.askSeconds * 1000);

  // Nhận đáp án ngay cả khi cô đang đọc, nhưng cả lớp trả lời xong cũng không cắt lời cô.
  room.comment(who('Lan'), 'vào');
  room.comment(who('Lan'), 'A');
  assert.equal(room.endsAt, room.timerFrom + config.timing.minAskSeconds * 1000);

  clock = room.endsAt + config.timing.graceSeconds * 1000;
  room.tick();
  assert.equal(room.phase, 'reveal');
  assert.equal(room.endsAt, clock + 20_800);
  clock += 10_000;
  room.tick();
  assert.equal(room.phase, 'reveal', 'cô chưa nói xong thì chưa sang câu mới');
});

test('đếm chuỗi đúng và số câu không trả lời', () => {
  const ctx = setup();
  const { room } = ctx;
  room.comment(who('Đúng'), 'vào');
  room.comment(who('Im'), 'vào');
  for (let i = 0; i < 3; i++) {
    room.comment(who('Đúng'), 'A');
    finishQuestion(ctx);
    if (i < 2) nextQuestion(ctx);
  }
  const student = (name) => room.seats.find((s) => s?.name === name);
  assert.equal(student('Đúng').streak, 3);
  assert.equal(student('Đúng').missed, 0);
  assert.equal(student('Im').missed, 3);
  assert.equal(ctx.last('reveal').results[0].streak, 3);
});

test('câu hỏi gửi cho màn hình không lộ đáp án trước giờ', () => {
  const ctx = setup();
  assert.equal(ctx.last('question').question.correct, undefined);
  assert.equal(ctx.room.snapshot().question.correct, undefined);
  assert.equal(ctx.room.snapshot().reveal, null);
});

test('lưu và nạp lại giữ nguyên lớp, điểm và lượt x2', () => {
  const ctx = setup();
  ctx.room.comment(who('Lan'), 'vào');
  ctx.room.comment(who('Hà'), 'vào');
  ctx.room.gift(who('Lan'), 5);
  ctx.room.comment(who('Lan'), 'A');
  finishQuestion(ctx);
  const saved = JSON.parse(JSON.stringify(ctx.room.exportState()));
  const fresh = setup().room;
  fresh.importState(saved);
  assert.equal(fresh.count, 2);
  assert.equal(fresh.seats[0].score, 4);
  assert.equal(fresh.boosts.get('Lan'), 5);
  assert.equal(fresh.officers[0].name, 'Lan');
});

test('bộ câu hỏi: dữ liệu hợp lệ, xáo đáp án mà vẫn trỏ đúng', () => {
  const bank = JSON.parse(readFileSync(new URL('../questions.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateBank(bank), []);
  const deck = createQuestions(bank);
  const seen = new Set();
  for (let i = 0; i < bank.length; i++) {
    const q = deck.next();
    seen.add(q.text);
    const row = bank.find((r) => r.q === q.text);
    assert.equal(q.options[q.correct], row.o[0]);
  }
  assert.equal(seen.size, bank.length, 'hết bộ mới được lặp lại');
});

test('bộ câu hỏi lỗi thì báo rõ', () => {
  assert.equal(validateBank([]).length, 1);
  assert.equal(validateBank([{ s: 'Toán', q: 'x', o: ['1', '2', '3'] }]).length, 1);
  assert.equal(validateBank([{ s: 'Toán', q: 'x', o: ['1', '1', '3', '4'] }]).length, 1);
});
