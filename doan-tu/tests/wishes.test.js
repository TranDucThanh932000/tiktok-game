import test from 'node:test';
import assert from 'node:assert/strict';
import { REPLY_MS, Wishes } from '../src/wishes.js';

const BOARD = [
  { key: 'p1', name: 'An' },
  { key: 'p2', name: 'Bình' },
];

function setup({ board = BOARD, everyMs = 60_000, rng = () => 0 } = {}) {
  let t = 0;
  const sent = [];
  const thanked = [];
  const timers = [];
  const game = { phase: 'asking', endsAt: 45_000, board: () => board };
  const teacher = { busyUntil: 0, current: null, thankWish: (player) => thanked.push(player.name) };
  const wishes = new Wishes({ game, teacher, everyMs, lines: ['Chúc cô 20/11 vui vẻ ạ!', 'Em yêu cô ạ!'], emit: (msg) => sent.push(msg), now: () => t, rng, later: (fn, ms) => timers.push({ fn, ms }) });
  return { wishes, game, teacher, sent, thanked, timers, at: (ms) => (t = ms) };
}

test('tới giờ, đang hỏi và cô không đọc lời chính thì một bạn trong lớp lên chúc; cô cảm ơn sau REPLY_MS', () => {
  const { wishes, game, teacher, sent, thanked, timers, at } = setup();
  at(29_000);
  wishes.tick();
  assert.equal(sent.length, 0, 'chưa tới giờ (lần đầu sau nửa khoảng cách)');

  at(30_000);
  teacher.current = { main: true };
  teacher.busyUntil = 33_000;
  wishes.tick();
  assert.equal(sent.length, 0, 'cô đang đọc từ mới hoặc công bố');

  teacher.busyUntil = 30_000;
  game.endsAt = 37_999;
  wishes.tick();
  assert.equal(sent.length, 0, 'không đủ giờ để cô cảm ơn xong trước khi công bố');

  game.endsAt = 45_000;
  game.phase = 'reveal';
  wishes.tick();
  assert.equal(sent.length, 0, 'đang công bố');

  game.phase = 'asking';
  wishes.tick();
  assert.deepEqual(sent, [{ type: 'wish', key: 'p1', name: 'An', text: 'Chúc cô 20/11 vui vẻ ạ!', replyMs: REPLY_MS }]);
  assert.equal(timers[0].ms, REPLY_MS);
  timers[0].fn();
  assert.deepEqual(thanked, ['An']);

  wishes.tick();
  assert.equal(sent.length, 1, 'chờ khoảng cách tiếp theo');
});

test('không chọn một bạn hai lần liền, không lặp câu chúc vừa nói; lớp trống thì chờ rồi thử lại; everyMs 0 là tắt', () => {
  const { wishes, sent, at } = setup();
  at(30_000);
  wishes.fire();
  wishes.fire();
  assert.deepEqual(sent.map((m) => [m.name, m.text]), [['An', 'Chúc cô 20/11 vui vẻ ạ!'], ['Bình', 'Em yêu cô ạ!']]);

  const empty = setup({ board: [] });
  empty.at(30_000);
  assert.equal(empty.wishes.fire(), null);
  assert.equal(empty.sent.length, 0);

  const off = setup({ everyMs: 0 });
  off.at(1_000_000);
  off.wishes.tick();
  assert.equal(off.sent.length, 0);
});
