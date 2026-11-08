import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Teacher } from '../src/teacher.js';

const lines = JSON.parse(readFileSync(new URL('../teacher.json', import.meta.url), 'utf8'));

// Giọng giả: mẩu nào cũng có ngay, dài 1 giây; ghi lại các câu được yêu cầu tạo.
function fakeVoice({ enabled = true, missing = [], unready = [] } = {}) {
  const asked = [];
  return {
    enabled,
    asked,
    clip(text) {
      asked.push(text);
      return Promise.resolve(missing.includes(text) ? null : `id:${text}`);
    },
    ready: (text) => (enabled && !missing.includes(text) && !unready.includes(text) ? `id:${text}` : null),
    duration: () => 1000,
  };
}

function setup(options) {
  let t = 1000;
  const said = [];
  const voice = fakeVoice(options);
  const game = { phase: 'asking', no: 1, endsAt: t + 45_000, puzzle: { topic: '🐾 Con vật', hint: 'Bắt chuột giỏi.', answer: 'con mèo', display: 'CON MÈO' } };
  const deck = { peek: (n) => [{ topic: '🍉 Trái cây', text: 'quả xoài', hint: 'Vàng thơm' }].slice(0, n) };
  let safe = false;
  const teacher = new Teacher({ voice, lines, emit: (msg) => said.push(msg), now: () => t, rng: () => 0, enabled: () => !safe });
  teacher.attach(game, deck);
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return { teacher, said, voice, game, flush, advance: (ms) => (t += ms), safeMode: (on) => (safe = on) };
}

test('từ mới: đọc câu mở đầu rồi chủ đề (bỏ biểu tượng) và gợi ý, tạo sẵn giọng các từ sắp hỏi', async () => {
  const { teacher, said, voice, game, flush } = setup();
  teacher.onEvent({ type: 'word', no: 1, topic: '🐾 Con vật', hint: 'Bắt chuột giỏi.' });
  await flush();
  const intro = teacher.introText(game.puzzle);
  assert.match(intro, /Con vật.*Bắt chuột giỏi\.$/);
  assert.doesNotMatch(intro, /🐾|\.\./);
  assert.equal(intro, teacher.introText(game.puzzle), 'cùng một từ luôn cùng một câu, khớp với mẩu tạo sẵn');
  assert.equal(said.length, 1);
  assert.deepEqual(said[0].clips.map((c) => c.id), [`id:${lines.newWord[0]}`, `id:${intro}`]);
  assert.equal(said[0].cut, true);
  assert.equal(said[0].text, lines.newWord[0]);
  assert.equal(said[0].ms, 2080);
  assert.ok(voice.asked.includes(teacher.introText({ topic: '🍉 Trái cây', hint: 'Vàng thơm' })));
  assert.ok(voice.asked.includes('quả xoài'));
});

test('không nói lại đúng câu vừa nói', () => {
  const { teacher } = setup();
  const picks = Array.from({ length: 20 }, () => teacher.pick('letter'));
  for (let i = 1; i < picks.length; i++) assert.notEqual(picks[i], picks[i - 1]);
});

test('đoán ra ngay trước khi mở chữ thì khen nhanh; mốc 5, 10, 20 bạn thì báo', async () => {
  const { teacher, said, flush, advance } = setup();
  teacher.onEvent({ type: 'word', no: 1 });
  await flush();
  advance(4000);
  teacher.onEvent({ type: 'correct', first: true, name: 'An', count: 1 });
  await flush();
  assert.equal(said[1].text, `An ${lines.firstFast[0]}`);
  advance(3000);
  teacher.onEvent({ type: 'correct', first: false, name: 'B', count: 4 });
  teacher.onEvent({ type: 'correct', first: false, name: 'C', count: 5 });
  await flush();
  assert.equal(said[2].text, lines.milestones['5'][0]);
});

test('mở chữ cuối thì nói khác; giữa từ chưa ai ra thì động viên một lần', async () => {
  const { teacher, said, game, flush, advance } = setup();
  teacher.onEvent({ type: 'word', no: 1 });
  await flush();
  advance(3000);
  teacher.onEvent({ type: 'letter', left: 0 });
  await flush();
  assert.equal(said[1].text, lines.lastLetter[0]);
  advance(25_000);
  game.solvers = new Map();
  teacher.tick();
  teacher.tick();
  await flush();
  assert.deepEqual(said.slice(2).map((s) => s.text), [lines.encourage[0]]);
});

test('follow, share cảm ơn riêng, quà thì chỉ báo nhân đôi', async () => {
  const { teacher, said, flush, advance } = setup();
  for (const kind of ['follow', 'share', null]) {
    teacher.onEvent({ type: 'boost', name: 'Chi', kind });
    await flush();
    advance(5000);
  }
  assert.deepEqual(said.map((s) => s.text), [`Chi ${lines.boostFollow[0]}`, `Chi ${lines.boostShare[0]}`, `Chi ${lines.boost[0]}`]);
});

test('đoán ra đầu tiên: đọc tên rồi lời khen; tên không đọc được thì khen chung', async () => {
  const { teacher, said, flush } = setup();
  teacher.onEvent({ type: 'correct', first: true, name: 'Lan Anh 2k5' });
  await flush();
  assert.deepEqual(said[0].clips.map((c) => c.id), ['id:Lan Anh', `id:${lines.first[0]}`]);
  assert.equal(said[0].text, `Lan Anh 2k5 ${lines.first[0]}`);
  teacher.onEvent({ type: 'correct', first: false, name: 'Bình' });
  assert.equal(said.length, 1, 'chỉ khen người đầu tiên');
});

test('lời phụ chờ cô nói xong mới đọc, chờ quá lâu thì bỏ', async () => {
  const { teacher, said, flush, advance } = setup();
  teacher.onEvent({ type: 'correct', first: true, name: 'An' });
  await flush();
  teacher.onEvent({ type: 'letter' });
  teacher.tick();
  await flush();
  assert.equal(said.length, 1, 'đang nói thì xếp hàng');
  advance(2500);
  teacher.tick();
  await flush();
  assert.equal(said.length, 2);
  assert.equal(said[1].text, lines.letter[0]);
  teacher.onEvent({ type: 'boost', name: 'Chi' });
  advance(9000);
  teacher.tick();
  await flush();
  assert.equal(said.length, 2, 'chờ quá 8 giây thì bỏ');
});

test('công bố: đáp án là ..., kèm lời theo số bạn đoán đúng, cắt ngang lời đang đọc', async () => {
  const { teacher, said, flush } = setup();
  teacher.onEvent({ type: 'reveal', answer: 'CON MÈO', count: 0 });
  await flush();
  assert.deepEqual(said[0].clips.map((c) => c.id), [`id:${lines.answerIs[0]}`, 'id:con mèo', `id:${lines.nobody[0]}`]);
  assert.equal(said[0].cut, true);
  teacher.onEvent({ type: 'reveal', answer: 'CON MÈO', count: 7 });
  await flush();
  assert.equal(said[1].text, `${lines.answerIs[1]} CON MÈO. ${lines.many[0]}`);
  teacher.onEvent({ type: 'reveal', answer: 'CON MÈO', count: 1 });
  await flush();
  assert.ok(said[2].text.endsWith(lines.one[0]));
});

test('sắp hết giờ thì giục một lần mỗi từ', async () => {
  const { teacher, said, flush, advance } = setup();
  advance(39_500);
  teacher.tick();
  teacher.tick();
  await flush();
  assert.deepEqual(said.map((s) => s.text), [lines.hurry[0]]);
});

test('thiếu tên trong lời phụ thì chỉ hiện chữ; tắt Vbee hoặc chế độ an toàn thì chỉ hiện chữ', async () => {
  const a = setup({ missing: ['Chi'] });
  a.teacher.onEvent({ type: 'boost', name: 'Chi' });
  await a.flush();
  assert.deepEqual(a.said[0].clips, []);
  assert.equal(a.said[0].text, `Chi ${lines.boost[0]}`);

  const b = setup({ enabled: false });
  b.teacher.onEvent({ type: 'letter' });
  await b.flush();
  assert.deepEqual(b.said[0].clips, []);
  assert.equal(b.voice.asked.length, 0);

  const c = setup();
  c.safeMode(true);
  c.teacher.stop();
  c.teacher.onEvent({ type: 'letter' });
  await c.flush();
  assert.deepEqual(c.said.map((s) => s.clips.length), [0, 0]);
  assert.equal(c.said[1].text, lines.letter[0]);
});

test('công bố gọi tên bạn nhanh nhất; tên chưa có giọng sẵn thì chỉ hiện chữ', async () => {
  const a = setup();
  a.teacher.onEvent({ type: 'reveal', answer: 'CON MÈO', count: 3, fastest: { name: 'Lan Anh 🌸' } });
  await a.flush();
  assert.deepEqual(a.said[0].clips.map((c) => c.id), [`id:${lines.answerIs[0]}`, 'id:con mèo', `id:${lines.fastestIs[0]}`, 'id:Lan Anh', `id:${lines.some[0]}`]);
  assert.equal(a.said[0].text, `${lines.answerIs[0]} CON MÈO. ${lines.fastestIs[0]} Lan Anh 🌸! ${lines.some[0]}`);

  const b = setup({ unready: ['Lan Anh'] });
  b.teacher.onEvent({ type: 'reveal', answer: 'CON MÈO', count: 3, fastest: { name: 'Lan Anh' } });
  await b.flush();
  assert.equal(b.said[0].clips.length, 3);
  assert.match(b.said[0].text, /Lan Anh!/);
});

test('mọi lời thoại tĩnh đều có trong danh sách tạo sẵn', () => {
  const { teacher } = setup();
  const parts = teacher.staticParts();
  for (const key of ['newWord', 'letter', 'lastLetter', 'encourage', 'hurry', 'first', 'firstFast', 'firstNoName', 'answerIs', 'fastestIs', 'nobody', 'one', 'some', 'many', 'boost', 'boostFollow', 'boostShare'])
    for (const line of lines[key]) assert.ok(parts.includes(line), line);
  for (const line of Object.values(lines.milestones).flat()) assert.ok(parts.includes(line), line);
  assert.ok(!parts.some((p) => p.includes('{')), 'không tạo sẵn mẫu giới thiệu còn chỗ trống');
});
