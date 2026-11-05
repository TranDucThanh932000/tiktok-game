import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraDirector } from '../public/js/render/Camera.js';
import { RIVER } from '../public/js/render/layout.js';
import { makeEngine } from './helpers.js';

const rules = { leaderEverySeconds: 10, sprintEverySeconds: 5, leaderSeconds: 4, minGiftSeconds: 1.6, giftSeconds: { small: 2, medium: 3, large: 4, special: 5 } };

// A river with ducks 1, 2 and 3; duck 1 leads unless told otherwise.
function setup() {
  const camera = new CameraDirector(rules);
  const ducks = new Map([1, 2, 3].map((id) => [id, { x: 300 + id * 100, y: 1000, finished: false }]));
  const frame = { racing: true, sprint: false, leaderId: 1, target: (id) => ducks.get(id) ?? null };
  const run = (seconds) => {
    for (let t = 0; t < seconds - 1e-9; t += 0.05) camera.update(0.05, frame);
  };
  return { camera, ducks, frame, run };
}
const gift = (id, tier = 'small', meters = 8, count = 1, name = 'Rose') => ({ id, tier, meters, count, name });

test('the camera stays wide, then visits the leader for a few seconds', () => {
  const { camera, run } = setup();
  run(9.5);
  assert.equal(camera.focus, null);
  run(1);
  assert.deepEqual([camera.focus.kind, camera.focus.id], ['leader', 1]);
  run(rules.leaderSeconds + 0.1);
  assert.equal(camera.focus, null);
});

test('the leader shot follows a new leader, and the sprint visits more often', () => {
  const { camera, frame, run } = setup();
  run(10.1);
  frame.leaderId = 2;
  run(0.1);
  assert.equal(camera.focus.id, 2);
  run(rules.leaderSeconds);
  frame.sprint = true;
  run(rules.sprintEverySeconds + 0.1);
  assert.equal(camera.focus?.kind, 'leader');
});

test('a gift cuts away from the leader at once, and each shot begins only once', () => {
  const { camera, run } = setup();
  run(10.1);
  assert.equal(camera.takeStarted().kind, 'leader');
  camera.onGift(gift(3, 'large', 80));
  run(0.1);
  assert.deepEqual([camera.focus.kind, camera.focus.id, camera.focus.meters], ['gift', 3, 80]);
  assert.equal(camera.takeStarted().id, 3);
  assert.equal(camera.takeStarted(), null);
});

test('a burst of gifts queues biggest first, and every sender gets a shot of at least the minimum', () => {
  const { camera, run } = setup();
  camera.onGift(gift(1, 'small'));
  run(0.1);
  camera.onGift(gift(2, 'small'));
  camera.onGift(gift(3, 'special', 150));
  run(1);
  assert.equal(camera.focus.id, 1, 'still inside the minimum time');
  run(0.6);
  assert.equal(camera.focus.id, 3, 'the bigger gift goes first');
  run(rules.minGiftSeconds);
  assert.equal(camera.focus.id, 2);
});

test('a combo from the duck on screen stays on it and adds up', () => {
  const { camera, run } = setup();
  camera.onGift(gift(2, 'small', 8, 1));
  run(0.1);
  camera.onGift(gift(2, 'small', 40, 5));
  camera.onGift(gift(2, 'large', 80, 1, 'Lion'));
  run(0.1);
  assert.deepEqual([camera.focus.id, camera.focus.meters, camera.focus.count, camera.focus.name, camera.focus.tier], [2, 128, 1, 'Lion', 'large']);
  assert.equal(camera.queue.length, 0);
});

test('a finished duck is held briefly, a duck that left is dropped, a gift for a finished duck is skipped', () => {
  const { camera, ducks, run } = setup();
  camera.onGift(gift(1, 'special', 150));
  run(0.1);
  ducks.get(1).finished = true;
  run(1);
  assert.equal(camera.focus?.id, 1);
  run(1);
  assert.equal(camera.focus, null);
  camera.onGift(gift(1));
  run(0.1);
  assert.equal(camera.focus, null);
  camera.onGift(gift(2));
  run(0.1);
  ducks.delete(2);
  run(0.1);
  assert.equal(camera.focus, null);
});

test('outside the race everything is dropped and the view goes back to the whole river', () => {
  const { camera, frame, run } = setup();
  camera.onGift(gift(2));
  camera.onGift(gift(3));
  run(1);
  assert.ok(camera.view().zoom > 1.5);
  frame.racing = false;
  run(3);
  assert.equal(camera.focus, null);
  assert.equal(camera.queue.length, 0);
  const view = camera.view();
  assert.ok(view.zoom < 1.01);
  assert.ok(Math.abs(view.x - (RIVER.x + RIVER.w / 2)) < 2 / view.zoom + 5);
});

test('the view never leaves the river, even for a duck at the very edge', () => {
  const { camera, ducks, run } = setup();
  ducks.get(1).x = 5;
  ducks.get(1).y = RIVER.y + RIVER.h - 5;
  camera.onGift(gift(1, 'special'));
  run(2);
  const v = camera.view();
  assert.ok(v.x - RIVER.w / 2 / v.zoom >= RIVER.x - 1e-6);
  assert.ok(v.y + RIVER.h / 2 / v.zoom <= RIVER.y + RIVER.h + 1e-6);
});

test('a skin gift keeps its punchline through a combo, and a bigger gift goes before it', () => {
  const { camera, run } = setup();
  camera.onGift(gift(1, 'small'));
  run(0.1);
  camera.onGift({ ...gift(2, 'skin', 20, 1, 'Cỏ ba lá'), skinLabel: 'BỒN CẦU!' });
  camera.onGift(gift(3, 'large', 80));
  run(rules.minGiftSeconds);
  assert.equal(camera.focus.id, 3);
  run(rules.minGiftSeconds);
  assert.deepEqual([camera.focus.id, camera.focus.skinLabel], [2, 'BỒN CẦU!']);
  camera.onGift({ ...gift(2, 'skin', 20, 1, 'Cỏ ba lá'), skinLabel: 'NÓN LÁ!' });
  assert.deepEqual([camera.focus.skinLabel, camera.focus.meters], ['NÓN LÁ!', 40]);
});

test('switched off, the camera ignores everything', () => {
  const camera = new CameraDirector({ ...rules, enabled: false });
  camera.onGift(gift(1));
  camera.update(30, { racing: true, leaderId: 1, target: () => ({ x: 400, y: 1000, finished: false }) });
  assert.equal(camera.focus, null);
});

test('the engine announces gifts to the camera only during the race', () => {
  const { engine, send, run, config } = makeEngine();
  const giftFx = () => engine.takeFx().filter((f) => f.k === 'gift');
  send('gift', 'early', { giftId: 'x', giftName: 'Rose', diamonds: 1, repeatCount: 1 });
  run(0.1);
  assert.deepEqual(giftFx(), []);
  run(config.game.phases.registration + 0.1);
  send('gift', 'early', { giftId: 'x', giftName: 'Rose', diamonds: 1, repeatCount: 3 });
  run(0.1);
  const [fx] = giftFx();
  assert.deepEqual([fx.tier, fx.meters, fx.count, fx.name], ['small', config.gifts.tiers.small.meters * 3, 3, 'Hoa hồng']);
  assert.equal(fx.id, engine.ducks.get('early').id);
});
