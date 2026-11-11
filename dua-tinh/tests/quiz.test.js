import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Race } from '../src/race.js';
import { Quiz } from '../src/quiz.js';
import { Commentator } from '../src/commentator.js';
import { findProvince } from '../src/provinces.js';
import { validateBank } from '../src/words.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const lines = JSON.parse(readFileSync(new URL('../mc.json', import.meta.url), 'utf8'));
const bank = JSON.parse(readFileSync(new URL('../words.json', import.meta.url), 'utf8'));

// Bộ bài giả: luôn hỏi lần lượt các từ cho trước.
function fixedDeck(words) {
  let i = 0;
  return { next: () => words[i++ % words.length], peek: (n) => Array.from({ length: n }, (_, k) => words[(i + k) % words.length]) };
}

const WORDS = [
  { topic: '🐾 Con vật', text: 'con mèo', hint: 'Bắt chuột giỏi, thích nằm sưởi nắng' },
  { topic: '🍉 Trái cây', text: 'quả xoài', hint: 'Vàng ươm, ngọt lịm mùa hè' },
];

function setup({ voice = null } = {}) {
  let clock = 1_000_000;
  const events = [];
  const said = [];
  const mc = voice
    ? new Commentator({ voice, lines, options: { ...config.voice, talkEverySeconds: [600, 600] }, emit: (msg) => said.push(msg), now: () => clock, rng: () => 0.6 })
    : null;
  const race = new Race(config, { emit: (msg) => (events.push(msg), mc?.onEvent(msg)), now: () => clock });
  const deck = fixedDeck(WORDS);
  const quiz = new Quiz(config.quiz, { deck, race, emit: (msg) => (events.push(msg), mc?.onEvent(msg)), now: () => clock, rng: () => 0.3 });
  mc?.attach(race);
  mc?.attachQuiz(quiz, deck);
  return {
    race,
    quiz,
    mc,
    said,
    events,
    advance(ms) {
      clock += ms;
      quiz.tick();
      mc?.tick();
    },
    all: (type) => events.filter((e) => e.type === type),
    last: (type) => events.filter((e) => e.type === type).at(-1),
  };
}

const who = (name) => ({ id: `u:${name}`, name, avatar: '' });
const score = (race, id) => race.tally.get(id).score;

test('bộ từ chép từ Đoán Từ hợp lệ, và vẫn còn nhiều từ sau khi bỏ từ trùng tên tỉnh', () => {
  assert.deepEqual(validateBank(bank), []);
  const all = Object.values(bank).flat();
  const kept = all.filter(([text]) => !findProvince(text));
  assert.ok(kept.length >= 900, `còn ${kept.length} từ`);
  assert.ok(findProvince('đà nẵng') && findProvince('cố đô huế'), 'các đáp án trùng tên tỉnh phải bị bỏ');
});

test('trả lời đúng: tỉnh của người đó +điểm, mỗi người một lần mỗi câu, comment đúng không bị coi là tên tỉnh', () => {
  const { race, quiz, all } = setup();
  quiz.tick();
  assert.equal(quiz.phase, 'asking');
  race.comment(who('Lan'), 'Nam Định');
  assert.equal(score(race, 'nam-dinh'), 1);
  assert.equal(quiz.comment(who('Lan'), 'meo'), true);
  assert.equal(quiz.comment(who('Lan'), 'con mèo'), true);
  assert.equal(score(race, 'nam-dinh'), 1 + config.quiz.points);
  assert.equal(race.tally.get('nam-dinh').quiz, config.quiz.points);
  assert.equal(all('quiz-correct').length, 1);
  assert.equal(quiz.comment(who('Huy'), 'con chó'), false);
});

test('chưa chọn tỉnh mà trả lời đúng: điểm được giữ, comment tên tỉnh thì cộng vào tỉnh đó', () => {
  const { race, quiz, last } = setup();
  quiz.tick();
  quiz.comment(who('Mai'), 'con mèo');
  assert.equal(last('quiz-correct').province, null);
  assert.equal(last('quiz-correct').held, config.quiz.points);
  assert.equal(race.ranking().length, 0);
  race.comment(who('Mai'), 'Huế');
  assert.equal(score(race, 'thua-thien-hue'), config.commentPoints + config.quiz.points);
  assert.equal(last('join').quizHeld, config.quiz.points);
  assert.equal(last('join').held, 0, 'điểm đố chữ không bị coi là quà');
  // Lưu và nạp lại vẫn giữ điểm đố chữ chưa cộng.
  quiz.ask();
  quiz.comment(who('Tú'), 'quả xoài');
  const copy = new Race(config);
  copy.importState(JSON.parse(JSON.stringify(race.exportState())));
  assert.equal(copy.quizHeld.get('u:Tú'), config.quiz.points);
  assert.equal(copy.tally.get('thua-thien-hue').quiz, config.quiz.points);
});

test('mở chữ dần khi chưa ai đoán ra; có người đúng thì rút ngắn giờ, hết giờ công bố rồi sang câu mới', () => {
  const { race, quiz, advance, all, last } = setup();
  quiz.tick();
  advance(config.quiz.hintEverySeconds * 1000);
  assert.equal(all('quiz-letter').length, 1);
  race.comment(who('A'), 'Hà Nội');
  race.comment(who('B'), 'Hà Nội');
  race.comment(who('C'), 'Nam Định');
  quiz.comment(who('C'), 'con mèo');
  quiz.comment(who('A'), 'đáp án là con mèo');
  quiz.comment(who('B'), 'meo nha');
  assert.ok(quiz.endsAt - 1_000_000 <= config.quiz.wordSeconds * 1000);
  advance(config.quiz.afterFirstSeconds * 1000 + config.quiz.graceSeconds * 1000 + 100);
  const reveal = last('quiz-reveal');
  assert.equal(reveal.answer, 'CON MÈO');
  assert.equal(reveal.count, 3);
  assert.equal(reveal.fastest.name, 'C');
  assert.deepEqual(reveal.best, { province: 'ha-noi', count: 2 });
  assert.equal(quiz.comment(who('D'), 'con mèo'), false, 'đang công bố thì không nhận đáp án');
  advance(config.quiz.revealSeconds * 1000 + 10);
  assert.equal(quiz.phase, 'break', 'công bố xong thì nghỉ, ô đố chữ ẩn');
  assert.equal(all('quiz-break').length, 1);
  assert.equal(all('quiz-ask').length, 1);
  advance(config.quiz.breakSeconds * 1000 + 10);
  assert.equal(last('quiz-ask').hint, WORDS[1].hint);
});

test('màn hình không nhận đáp án trước khi công bố', () => {
  const { quiz, last } = setup();
  quiz.tick();
  const ask = last('quiz-ask');
  assert.ok(!JSON.stringify(ask).toLowerCase().includes('mèo'));
  assert.ok(!JSON.stringify(quiz.snapshot()).toLowerCase().includes('mèo'));
});

test('MC đọc câu đố, báo người đúng đầu tiên kèm tỉnh, công bố đáp án và tỉnh nhiều người đúng nhất', () => {
  const voice = { enabled: true, ready: (text) => `id:${text}`, clip: (text) => Promise.resolve(`id:${text}`), duration: () => 1000, busy: () => 0 };
  const { race, quiz, said, advance } = setup({ voice });
  quiz.tick();
  advance(100);
  assert.equal(said.at(-1).kind, 'quizAsk');
  assert.match(said.at(-1).text, /Con vật: Bắt chuột giỏi/);
  assert.ok(said.at(-1).clips.some((clip) => clip.id.includes('Gợi ý') || clip.id.includes('Bắt chuột')));
  race.comment(who('Phương Thảo'), 'Nam Định');
  advance(20_000);
  quiz.comment(who('Phương Thảo'), 'con mèo');
  // MC có thể đang đọc câu báo dẫn đầu; câu khen phải đợi tới lượt.
  for (let i = 0; i < 50; i++) advance(100);
  const first = said.find((s) => s.kind === 'quizFirst');
  assert.match(first.text, /Phương Thảo.*Nam Định/);
  assert.doesNotMatch(first.text, /cô |các em/i);
  advance(30_000);
  const reveal = said.find((s) => s.kind === 'quizReveal');
  assert.match(reveal.text, /CON MÈO.*Nam Định/);
});

test('lời MC phần đố chữ có sẵn trong mẩu giọng tạo trước (cả câu cho từng tỉnh)', () => {
  const voice = { enabled: true, ready: () => null, clip: () => Promise.resolve(null), duration: () => 1000, busy: () => 0 };
  const mc = new Commentator({ voice, lines, options: config.voice });
  const parts = mc.staticParts();
  assert.ok(parts.includes('Đã có người trả lời đúng!'));
  assert.ok(parts.some((text) => text.includes('Nam Định có nhiều người trả lời đúng nhất')));
  assert.ok(!parts.some((text) => /\{(topic|hint)\}/.test(text)));
});
