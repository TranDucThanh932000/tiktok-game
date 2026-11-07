import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { MC } from '../src/mc.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const lines = JSON.parse(readFileSync(new URL('../mc.json', import.meta.url), 'utf8'));
const T = config.timing;

const QUESTION = { subject: 'Toán', text: '7 × 9 bằng bao nhiêu?', options: ['63', '56', '72', '64'], correct: 0, explain: '7 × 9 = 63' };
const questions = { next: () => ({ ...QUESTION }), peek: (n = 1) => Array.from({ length: n }, () => ({ ...QUESTION })) };

// Giọng giả: mỗi mẩu dài 1 giây. autoReady: mẩu được tạo xong ngay khi xin; tắt đi để giả Vbee đang chậm.
function fakeVoice({ autoReady = true } = {}) {
  const have = new Set();
  const asked = new Set();
  return {
    enabled: true,
    have,
    asked,
    ready: (text) => (have.has(text) ? `id:${text}` : null),
    clip(text) {
      asked.add(text);
      if (autoReady) have.add(text);
      return Promise.resolve(autoReady ? `id:${text}` : null);
    },
    duration: () => 1000,
    busy: () => 0,
  };
}

function setup({ voice = fakeVoice(), muted = false, overrides = {} } = {}) {
  let clock = 1_000_000;
  const events = [];
  const emit = (msg) => events.push(msg);
  const mc = new MC({ voice, lines, emit, now: () => clock, rng: () => 0, enabled: () => !muted, trimMs: 0, leadMs: 0 });
  const game = new Game({ ...config, ...overrides }, { questions, director: mc, emit: (msg) => (emit(msg), mc.onEvent(msg)), now: () => clock });
  mc.attach(game);
  for (const part of mc.staticParts()) voice.have.add(part);
  // Như lúc server khởi động: tạo sẵn giọng các câu sắp hỏi.
  mc.prepareUpcoming(3);
  return {
    game,
    mc,
    voice,
    events,
    advance(ms) {
      clock += ms;
      game.tick();
      mc.tick();
    },
    get now() {
      return clock;
    },
    says: () => events.filter((e) => e.type === 'say' && e.clips.length),
  };
}

const who = (name) => ({ id: name, name });
const join = (ctx, ...names) => names.forEach((name) => ctx.game.comment(who(name), 'vào'));
const spoken = (msg) => msg.clips.map((clip) => clip.id.slice(3));

test('MC đọc câu hỏi và 4 đáp án; đồng hồ 15 giây chỉ chạy khi MC đọc xong', () => {
  const ctx = setup();
  join(ctx, 'Lan', 'Huy');
  ctx.advance(T.lobbySeconds * 1000);
  assert.equal(ctx.game.phase, 'asking');
  const say = ctx.says().at(-1);
  const words = spoken(say);
  assert.ok(words.includes('7 nhân 9 bằng bao nhiêu?'));
  assert.deepEqual(say.clips.filter((c) => c.opt !== undefined).map((c) => c.opt), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.ok(words.includes('Bê.'));
  const readMs = say.clips.length * 1000;
  assert.equal(ctx.game.timerFrom, ctx.now + readMs);
  assert.equal(ctx.game.endsAt, ctx.now + readMs + T.askSeconds * 1000);
});

test('mọi người trả lời trong lúc MC còn đọc thì vẫn chờ MC đọc xong mới công bố', () => {
  const ctx = setup();
  join(ctx, 'Lan', 'Huy');
  ctx.advance(T.lobbySeconds * 1000);
  ctx.game.comment(who('Lan'), 'a');
  ctx.game.comment(who('Huy'), 'a');
  assert.equal(ctx.game.endsAt, ctx.game.timerFrom + T.earlyCloseSeconds * 1000);
});

test('giọng câu hỏi chưa có thì chờ Vbee; quá 12 giây thì cứ hỏi và mời đọc trên màn hình', () => {
  const voice = fakeVoice({ autoReady: false });
  const ctx = setup({ voice });
  join(ctx, 'Lan', 'Huy');
  ctx.advance(T.lobbySeconds * 1000);
  assert.equal(ctx.game.phase, 'lobby');
  assert.ok(voice.asked.has('7 nhân 9 bằng bao nhiêu?'));
  ctx.advance(6000);
  assert.equal(ctx.game.phase, 'lobby');
  ctx.advance(6000);
  assert.equal(ctx.game.phase, 'asking');
  assert.ok(lines.readBoard.includes(spoken(ctx.says().at(-1)).at(-1)));
});

test('giọng câu hỏi tạo xong thì hỏi ngay, không chờ hết 12 giây', () => {
  const voice = fakeVoice({ autoReady: false });
  const ctx = setup({ voice });
  join(ctx, 'Lan', 'Huy');
  ctx.advance(T.lobbySeconds * 1000);
  assert.equal(ctx.game.phase, 'lobby');
  voice.asked.forEach((text) => voice.have.add(text));
  ctx.advance(100);
  assert.equal(ctx.game.phase, 'asking');
});

test('công bố đáp án: đọc chữ cái, lời giải, số người rời sàn; màn công bố đủ dài cho MC nói hết', () => {
  const ctx = setup();
  join(ctx, 'Lan', 'Huy', 'Mai');
  ctx.advance(T.lobbySeconds * 1000);
  ctx.game.comment(who('Lan'), 'a');
  ctx.game.comment(who('Huy'), 'b');
  ctx.advance(ctx.game.endsAt - ctx.now);
  assert.equal(ctx.game.phase, 'reveal');
  const say = ctx.says().at(-1);
  const words = spoken(say);
  assert.ok(words.includes('Đáp án đúng là A.'));
  assert.ok(words.includes('7 nhân 9 bằng 63'));
  assert.ok(words.includes('2'));
  assert.ok(words.includes('bạn phải rời sàn thi.'));
  // Tên Lan chưa có giọng nên MC không gọi tên người nhanh nhất.
  assert.ok(!words.includes('Lan'));
  const talk = 400 + say.clips.length * 1000;
  assert.equal(ctx.game.endsAt, ctx.now + Math.max(T.revealSeconds * 1000, talk + 1200));
});

test('người lên sàn được chào khi MC rảnh; tên không đọc được thì bỏ lời chào', () => {
  const ctx = setup();
  ctx.game.comment(who('Lan Anh'), 'vào');
  ctx.game.comment(who('🔥🔥🔥'), 'vào');
  ctx.advance(100);
  const say = ctx.says().at(-1);
  assert.equal(say.cut, false);
  assert.ok(spoken(say).includes('Lan Anh'));
  ctx.advance(10_000);
  ctx.advance(10_000);
  // Lời chào thứ hai (mẫu "{name} đã lên sàn!") bị bỏ vì tên chỉ có biểu tượng.
  const greetings = ctx.says().filter((s) => spoken(s).some((w) => ['Chào mừng', 'đã lên sàn!', 'Xin chào'].includes(w)));
  assert.equal(greetings.length, 1);
});

test('câu hỏi vàng và rung chuông: MC gọi tên người cuối cùng, màn kết thúc đủ dài cho lời chúc mừng', () => {
  const ctx = setup({ overrides: { rescue: { minQuestion: 99, alivePercent: 30, maxTimes: 0 } } });
  join(ctx, 'Lan', 'Huy');
  ctx.advance(T.lobbySeconds * 1000);
  ctx.game.comment(who('Lan'), 'a');
  ctx.game.comment(who('Huy'), 'b');
  ctx.advance(ctx.game.endsAt - ctx.now);
  ctx.advance(ctx.game.endsAt - ctx.now);
  assert.equal(ctx.game.mode, 'golden');
  const intro = spoken(ctx.says().at(-1));
  assert.ok(intro.includes('Lan') && intro.includes('Hãy trả lời đúng') && intro.includes(String(config.goldenQuestions)));
  for (let i = 0; i < config.goldenQuestions; i++) {
    ctx.advance(ctx.game.endsAt - ctx.now);
    assert.equal(ctx.game.phase, 'asking');
    ctx.game.comment(who('Lan'), 'a');
    ctx.advance(ctx.game.endsAt - ctx.now);
    assert.equal(ctx.game.phase, 'reveal');
  }
  ctx.advance(ctx.game.endsAt - ctx.now);
  assert.equal(ctx.game.phase, 'end');
  const say = ctx.says().at(-1);
  const words = spoken(say);
  assert.ok(words.includes('Lan') && words.includes('Xin chúc mừng') && words.includes('đã rung chuông vàng!'));
  assert.ok(ctx.game.endsAt - ctx.now >= say.delayMs + say.clips.length * 1000);
});

test('MC tắt tiếng thì không nói gì, trận chạy theo giờ mặc định', () => {
  const ctx = setup({ muted: true });
  join(ctx, 'Lan', 'Huy');
  ctx.advance(T.lobbySeconds * 1000);
  assert.equal(ctx.game.phase, 'asking');
  assert.equal(ctx.says().length, 0);
  assert.equal(ctx.game.endsAt, ctx.now + T.askSeconds * 1000);
});

test('đủ mẩu giọng dùng chung: số câu, chữ cái, các câu mẫu', () => {
  const ctx = setup();
  const parts = new Set(ctx.mc.staticParts());
  for (const text of ['Câu hỏi số', '40', 'A.', 'Đê.', 'Đáp án đúng là Xê.', 'Chào mừng', 'lên sàn thi!', 'Hãy trả lời đúng', 'câu hỏi vàng để rung chuông vàng!']) {
    assert.ok(parts.has(text), text);
  }
});
