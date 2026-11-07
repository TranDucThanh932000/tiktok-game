import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Teacher } from '../src/teacher.js';
import { Classroom } from '../src/classroom.js';
import { createQuestions } from '../src/questions.js';
import { readableName, speakText } from '../src/spoken.js';
import { mp3Seconds } from '../src/voice.js';

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
const config = read('config.json');
const lines = read('teacher.json');
const bank = read('questions.json');

const QUESTION = { subject: 'Toán', text: '12 × 8 bằng bao nhiêu?', options: ['86', '96', '106', '92'], correct: 1, explain: '12 × 8 = 96' };

// Giọng giả: mỗi mẩu dài 1 giây, id chính là nội dung, để bài test đọc được cô nói gì.
function fakeVoice({ missing = () => false } = {}) {
  const requested = [];
  return {
    enabled: true,
    requested,
    clip(text) {
      requested.push(text);
      return Promise.resolve(text);
    },
    ready: (text) => (missing(text) ? null : text),
    duration: () => 1000,
    busy: () => 0,
  };
}

function setup({ voice = fakeVoice(), enabled = () => true } = {}) {
  let clock = 1_000_000;
  const said = [];
  const teacher = new Teacher({ voice, lines, enabled, now: () => clock, emit: (msg) => said.push(msg), leadMs: 0, trimMs: 0, subjects: ['Toán'], tiers: config.boost.tiers });
  const room = new Classroom(config, {
    questions: { next: () => QUESTION, peek: (n) => Array(n).fill(QUESTION) },
    now: () => clock,
    director: teacher,
    emit: (msg) => teacher.onEvent(msg),
  });
  teacher.attach(room);
  return { teacher, room, said, voice, advance: (ms) => (clock += ms), lastSay: () => said.filter((m) => m.type === 'say' && m.clips.length).at(-1) };
}
const who = (name) => ({ id: name, name });
const spoken = (msg) => msg.clips.map((clip) => clip.id);

test('đọc số và ký hiệu thành chữ', () => {
  const cases = {
    '12 × 8 bằng bao nhiêu?': '12 nhân 8 bằng bao nhiêu?',
    '100 − 37 bằng bao nhiêu?': '100 trừ 37 bằng bao nhiêu?',
    '45 : 5 = 9': '45 chia 5 bằng 9',
    '−10°C': 'âm 10 độ xê',
    '100°C': '100 độ xê',
    '180°': '180 độ',
    '24 cm²': '24 xăng ti mét vuông',
    '20 cm': '20 xăng ti mét',
    '1 km bằng bao nhiêu mét?': '1 ki lô mét bằng bao nhiêu mét?',
    '1 kg bằng bao nhiêu gam?': '1 ki lô gam bằng bao nhiêu gam?',
    '20/11': '20 tháng 11',
    '1/6': 'mùng 1 tháng 6',
    '15/8 âm lịch': '15 tháng 8 âm lịch',
    'Ngày 2/9/1945 tại Ba Đình': 'Ngày 2 tháng 9 năm 1945 tại Ba Đình',
    'Điền tiếp: Uống nước nhớ...': 'Điền tiếp: Uống nước nhớ.',
    '"Teacher" nghĩa là gì?': 'Teacher nghĩa là gì?',
  };
  for (const [from, to] of Object.entries(cases)) assert.equal(speakText(from), to);
  assert.equal(speakText('H₂O', lines.fixes), 'hát hai ô');
  assert.equal(speakText('TP. Hồ Chí Minh', lines.fixes), 'Thành phố Hồ Chí Minh');
});

test('mọi câu trong bộ câu hỏi đọc lên không còn ký hiệu lạ', () => {
  for (const row of bank) {
    for (const text of [row.q, row.e, ...row.o].filter(Boolean)) {
      assert.doesNotMatch(speakText(String(text), lines.fixes), /[×−=°²₂%/"“”]|\.\.\./, text);
    }
  }
});

test('tên hoa mỹ đọc được, tên không đọc được thì bỏ', () => {
  assert.equal(readableName('𝓣𝓱𝓪𝓷𝓱 💖'), 'Thanh');
  assert.equal(readableName('bé bơ 2k5'), 'bé bơ');
  assert.equal(readableName('💖💖'), '');
});

test('đếm được độ dài MP3 thật theo frame', () => {
  // MPEG2 Layer III, 128 kbps, 24 kHz: mỗi frame 576 mẫu = 24 ms, dài 384 byte.
  const frame = Buffer.alloc(384);
  frame[0] = 0xff;
  frame[1] = 0xf3;
  frame[2] = 0xc4;
  assert.ok(Math.abs(mp3Seconds(Buffer.concat(Array(50).fill(frame))) - 1.2) < 0.001);
  assert.equal(mp3Seconds(Buffer.alloc(100)), 0);
});

test('đọc câu hỏi rồi từng đáp án theo đúng thứ tự, sáng đáp án đang đọc', () => {
  const { teacher, lastSay } = setup();
  const ms = teacher.asking(QUESTION, { inSet: 2 });
  const msg = lastSay();
  assert.equal(msg.cut, true);
  assert.equal(ms, msg.clips.length * 1000);
  const words = spoken(msg);
  const at = words.indexOf('12 nhân 8 bằng bao nhiêu?');
  assert.ok(at >= 0);
  assert.deepEqual(words.slice(at + 1, at + 9), ['A.', '86', 'Bê.', '96', 'Xê.', '106', 'Đê.', '92']);
  assert.deepEqual(msg.clips.slice(at + 1, at + 9).map((clip) => clip.opt), [0, 0, 1, 1, 2, 2, 3, 3]);
  // Lúc đọc câu hỏi không được lộ đáp án: không dùng lời giải.
  assert.ok(!words.includes('12 nhân 8 bằng 96'));
});

test('giọng câu hỏi chưa có thì bảo đọc trên bảng, không đọc chữ cái trống không', () => {
  const voice = fakeVoice({ missing: (text) => text === '96' });
  const { teacher, lastSay } = setup({ voice });
  teacher.asking(QUESTION, { inSet: 2 });
  const msg = lastSay();
  assert.ok(!spoken(msg).includes('A.'));
  assert.ok(!spoken(msg).includes('12 nhân 8 bằng bao nhiêu?'));
  assert.ok(spoken(msg).some((w) => lines.readBoard.includes(w)));
  assert.ok(msg.clips.every((clip) => clip.opt === undefined));
});

test('mở lớp mới xong chờ tick để giọng câu đầu kịp sẵn sàng', () => {
  const { room } = setup();
  room.tick();
  room.comment(who('Lan'), 'vào');
  room.reset();
  assert.equal(room.phase, 'idle');
  assert.equal(room.count, 0);
  room.tick();
  assert.equal(room.phase, 'asking');
  assert.equal(room.no, 1);
});

test('chuẩn bị giọng cho các câu sắp tới, gồm cả lời giải', () => {
  const { teacher, voice } = setup();
  teacher.asking(QUESTION, { inSet: 1 });
  assert.ok(voice.requested.includes('12 nhân 8 bằng bao nhiêu?'));
  assert.ok(voice.requested.includes('12 nhân 8 bằng 96'));
});

test('công bố đáp án rồi gọi tên khen bạn đúng', () => {
  const { room, teacher, lastSay } = setup();
  for (const name of ['Lan', 'Hà', 'Tú', 'Nam']) room.comment(who(name), 'vào');
  room.question = QUESTION;
  const results = [
    { seat: 0, ok: true, delta: 1, streak: 1, boosted: false },
    { seat: 1, ok: false, delta: 0, streak: 0, boosted: false },
    { seat: 2, ok: false, delta: 0, streak: 0, boosted: false },
    { seat: 3, ok: false, delta: 0, streak: 0, boosted: false },
  ];
  const ms = teacher.revealing({ question: QUESTION, results, promoted: [] });
  const words = spoken(lastSay());
  assert.ok(ms > 0);
  assert.ok(words.some((w) => w.includes('Bê')), 'nói đáp án đúng là Bê');
  assert.ok(words.includes('12 nhân 8 bằng 96'));
  assert.ok(words.includes('Lan'), 'gọi tên bạn đúng');
  assert.ok(!words.includes('Hà'), 'không gọi tên bạn sai giữa đông người');
});

test('không ai trả lời, không ai đúng, cả lớp đúng thì nói khác nhau', () => {
  const { room, teacher, lastSay } = setup();
  for (const name of ['Lan', 'Hà', 'Tú']) room.comment(who(name), 'vào');
  const has = (pool) => spoken(lastSay()).some((w) => pool.includes(w));
  teacher.revealing({ question: QUESTION, results: [], promoted: [] });
  assert.ok(has(lines.noAnswer));
  const row = (seat, ok) => ({ seat, ok, delta: ok ? 1 : 0, streak: ok ? 1 : 0, boosted: false });
  teacher.revealing({ question: QUESTION, results: [row(0, false), row(1, false)], promoted: [] });
  assert.ok(has(lines.noneRight));
  teacher.revealing({ question: QUESTION, results: [row(0, true), row(1, true), row(2, true)], promoted: [] });
  assert.ok(has(lines.allRight));
});

test('lên lớp trưởng thì chúc mừng kèm tiếng vỗ tay, chuỗi đúng thì được khen', () => {
  const { room, teacher, lastSay } = setup();
  for (const name of ['Lan', 'Hà', 'Tú', 'Nam', 'Yến']) room.comment(who(name), 'vào');
  const results = [
    { seat: 0, ok: true, delta: 1, streak: 4, boosted: false },
    { seat: 1, ok: false, delta: 0, streak: 0, boosted: false },
    { seat: 2, ok: false, delta: 0, streak: 0, boosted: false },
    { seat: 3, ok: false, delta: 0, streak: 0, boosted: false },
    { seat: 4, ok: false, delta: 0, streak: 0, boosted: false },
  ];
  teacher.revealing({ question: QUESTION, results, promoted: [{ name: 'Lan', title: 'Lớp trưởng', rank: 0 }] });
  const msg = lastSay();
  assert.ok(msg.clips.some((clip) => clip.sfx === 'applause'));
  assert.ok(spoken(msg).filter((w) => w === 'Lan').length >= 2);
  assert.ok(spoken(msg).some((w) => w.includes('4 câu')));
  assert.match(msg.text, /Lan/);
});

test('khen bạn đúng đầu tiên, câu x2 không khen trùng bạn đó', () => {
  const { room, teacher, lastSay } = setup();
  for (const name of ['Lan', 'Hà']) room.comment(who(name), 'vào');
  const results = [
    { seat: 0, ok: true, delta: 4, streak: 1, boosted: true, first: true },
    { seat: 1, ok: false, delta: 0, streak: 0, boosted: false, first: false },
  ];
  teacher.revealing({ question: QUESTION, results, promoted: [] });
  const msg = lastSay();
  const tails = lines.firstRight.map((line) => line.replace('{name}', '').replace(/^[\s,.!?:]+/, '').trim());
  assert.ok(spoken(msg).some((w) => tails.includes(w)));
  assert.match(msg.text, /Lan/);
  assert.ok(!spoken(msg).some((w) => lines.doubled.some((line) => line.includes(w) && w !== 'Lan')));
});

test('tên chưa có giọng hoặc không đọc được thì không làm hỏng câu', () => {
  const voice = fakeVoice({ missing: (text) => text === 'Lan' });
  const { room, teacher, lastSay } = setup({ voice });
  room.comment(who('Lan'), 'vào');
  room.comment(who('💖💖'), 'vào');
  const results = [
    { seat: 0, ok: true, delta: 1, streak: 1, boosted: false },
    { seat: 1, ok: true, delta: 1, streak: 1, boosted: false },
  ];
  teacher.revealing({ question: QUESTION, results, promoted: [{ name: 'Lan', title: 'Lớp trưởng', rank: 0 }] });
  const words = spoken(lastSay());
  assert.ok(!words.includes('Lan'));
  assert.ok(words.includes('12 nhân 8 bằng 96'));
});

test('câu phụ chỉ nói khi rảnh và nói xong trước lúc hết giờ', () => {
  const { room, teacher, said, advance, lastSay } = setup();
  room.tick();
  const count = () => said.filter((m) => m.type === 'say' && m.clips.length).length;
  const reading = count();
  room.comment(who('Lan'), 'vào');
  teacher.tick();
  assert.equal(count(), reading, 'đang đọc câu hỏi thì chưa chào');
  advance(room.timerFrom - 1_000_000);
  teacher.tick();
  assert.equal(count(), reading + 1);
  assert.equal(lastSay().cut, false);
  assert.ok(spoken(lastSay()).includes('Lan'));

  // Câu không kịp nói xong trước khi hết giờ thì để dành.
  teacher.queue = [];
  teacher.busyUntil = 0;
  room.endsAt = 1_000_000 + 1;
  teacher.enqueue('gift', teacher.fill(lines.gift[0], { name: 'Hà', n: 6 }), { ttlMs: 60_000 });
  teacher.pump();
  assert.equal(teacher.queue.length, 1, 'lời cảm ơn được giữ lại');
});

test('lời chào lúc cô đang đọc câu hỏi không bị hết hạn oan', () => {
  const { room, teacher, advance, lastSay } = setup();
  room.tick();
  room.comment(who('Lan'), 'vào');
  // Câu hỏi đọc dài hơn hạn của lời chào.
  advance(room.timerFrom - 1_000_000 + 1000);
  teacher.tick();
  assert.ok(spoken(lastSay()).includes('Lan'));
  assert.equal(lastSay().cut, false);
});

test('cảm ơn được ưu tiên trước lời chào', () => {
  const { room, teacher, advance, lastSay } = setup();
  room.tick();
  advance(room.timerFrom - 1_000_000);
  room.comment(who('Hà'), 'vào');
  room.gift(who('Lan'), 5);
  teacher.pump();
  assert.ok(spoken(lastSay()).includes('Lan'));
  assert.ok(spoken(lastSay()).some((w) => w.includes('6 lượt')));
});

test('follow, share thì cô cảm ơn, nhường lời cảm ơn có xu', () => {
  const { room, teacher, advance, lastSay } = setup();
  room.tick();
  advance(room.timerFrom - 1_000_000);
  room.comment(who('Hà'), 'vào');
  room.comment(who('Lan'), 'vào');
  teacher.queue = []; // Bỏ lời chào, chỉ xét lời cảm ơn.
  room.social(who('Hà'), 'share');
  room.gift(who('Lan'), 5);
  teacher.pump();
  assert.ok(spoken(lastSay()).includes('Lan'));
  teacher.busyUntil = 0;
  teacher.pump();
  assert.ok(spoken(lastSay()).includes('Hà'));
  assert.ok(spoken(lastSay()).some((w) => w.includes('câu sau')));
});

test('đáp lại comment theo từ khóa, không đọc lại nội dung comment, mỗi người một phút một lần', () => {
  const { room, teacher, advance, lastSay } = setup();
  room.tick();
  advance(room.timerFrom - 1_000_000);
  assert.equal(teacher.reply(who('Lan'), 'Chào cô ạ'), true);
  assert.equal(teacher.reply(who('Lan'), 'chào cô'), false);
  assert.equal(teacher.reply(who('Hà'), 'hôm nay trời đẹp'), false);
  assert.equal(teacher.reply(who('Hà'), 'có ngày gì không'), false);
  teacher.pump();
  const words = spoken(lastSay());
  assert.ok(words.includes('Lan'));
  assert.ok(!words.includes('Chào cô ạ'));
});

test('bật chế độ an toàn thì cô im, đồng hồ chạy ngay', () => {
  let safe = true;
  const { teacher, said } = setup({ enabled: () => !safe });
  assert.equal(teacher.asking(QUESTION, { inSet: 1 }), 0);
  assert.equal(teacher.holdAsk(), false);
  teacher.onEvent({ type: 'hint', name: 'Lan' });
  teacher.tick();
  assert.equal(said.filter((m) => m.type === 'say' && m.clips.length).length, 0);
  safe = false;
  assert.ok(teacher.asking(QUESTION, { inSet: 1 }) > 0);
});

test('giọng câu sắp hỏi chưa có thì chờ một lát rồi vẫn hỏi', () => {
  const voice = fakeVoice({ missing: () => true });
  const { teacher, advance } = setup({ voice });
  assert.equal(teacher.holdAsk(), true);
  advance(5000);
  assert.equal(teacher.holdAsk(), true);
  advance(8000);
  assert.equal(teacher.holdAsk(), false);
});

test('xem trước câu sắp hỏi đúng là câu sẽ được hỏi', () => {
  const deck = createQuestions(bank);
  const [first, second] = deck.peek(2);
  assert.equal(deck.next(), first);
  assert.equal(deck.peek(1)[0], second);
  assert.equal(deck.next(), second);
});

test('thách đấu: cô giới thiệu hai bạn, công bố người thắng một lần kèm vỗ tay', () => {
  const { room, teacher, lastSay } = setup();
  for (const name of ['Lan', 'Hà']) room.comment(who(name), 'vào');
  teacher.asking(QUESTION, { inSet: 3, setSize: 6, duel: { challenger: 'Hà', leader: 'Lan', seats: [1, 0] } });
  const intro = spoken(lastSay());
  assert.ok(intro.includes('Hà') && intro.includes('Lan'));
  assert.ok(intro.indexOf('Hà') < intro.indexOf('Lan'));

  const results = [
    { seat: 1, ok: true, delta: 4, streak: 1, boosted: true, first: true },
    { seat: 0, ok: false, delta: 0, streak: 0, boosted: false, first: false },
  ];
  const duel = { outcome: 'won', bonus: 0, challenger: { name: 'Hà', seat: 1, score: 6 }, leader: { name: 'Lan', seat: 0, score: 3 } };
  teacher.revealing({ question: QUESTION, results, promoted: [{ name: 'Hà', title: 'Lớp trưởng', rank: 0 }], duel });
  const msg = lastSay();
  assert.equal(msg.clips.filter((clip) => clip.sfx === 'applause').length, 1);
  const tails = lines.promoteLeader.flatMap((line) => line.split('{name}')).map((part) => part.replace(/^[\s,.!?:]+/, '').trim()).filter(Boolean);
  assert.ok(!spoken(msg).some((w) => tails.includes(w)), 'không chúc lên lớp trưởng lần nữa');
  assert.match(msg.text, /Hà/);
});

test('câu cuối tiết cô nhắc, quà thách đấu được cảm ơn trước lời chào', () => {
  const { room, teacher, advance, lastSay } = setup();
  teacher.asking(QUESTION, { inSet: 6, setSize: 6 });
  assert.ok(spoken(lastSay()).some((w) => lines.lastQuestion.includes(w)));
  room.tick();
  advance(room.timerFrom - 1_000_000);
  room.comment(who('Hà'), 'vào');
  teacher.onEvent({ type: 'challenge', name: 'Lan', leader: 'Hà', ahead: 0 });
  teacher.pump();
  assert.ok(spoken(lastSay()).includes('Lan'));
});

test('lời cô không có từ cần tránh, câu mẫu tách mẩu đúng', () => {
  const all = JSON.stringify({ ...lines, fixes: undefined });
  for (const word of ['tặng quà', 'quà', 'đánh', 'máu', 'kick']) assert.ok(!all.toLowerCase().includes(word), word);
  const { teacher } = setup();
  const parts = teacher.staticParts();
  assert.ok(parts.includes('Hết giờ.'));
  assert.ok(parts.includes('Đáp án đúng là Bê.'));
  assert.ok(parts.includes('Chào em'));
  assert.ok(parts.every((part) => !part.includes('{')), 'không còn chỗ trống trong mẩu giọng');
  assert.deepEqual(teacher.fill('Chào em {name}, vào đi.', { name: 'Lan' }).parts, ['Chào em', 'Lan', 'vào đi.']);
});
