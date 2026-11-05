import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ResultStore } from '../src/game/ResultStore.js';
import { makeEngine } from './helpers.js';
import { MockAdapter, MOCK_GIFTS, mockUser } from '../src/events/MockAdapter.js';

test('a full round: registration, race, sprint, finish, results, new round', () => {
  const { engine, send, run, config } = makeEngine();
  const { phases } = config.game;
  assert.equal(engine.round.phase, 'waiting');
  for (let i = 0; i < 10; i++) send('comment', `p${i}`, { message: 'GO' });
  run(0.05);
  assert.equal(engine.round.phase, 'registration');
  assert.equal(engine.ducks.size, 10);
  run(phases.registration + 0.1);
  assert.equal(engine.round.phase, 'race');
  run(phases.race + 0.1);
  assert.equal(engine.round.phase, 'sprint');
  run(phases.sprint + 0.1);
  assert.equal(engine.round.phase, 'finish');
  assert.equal(engine.lastResult.top.length, 10);
  assert.equal(engine.results.rounds.length, 1);
  run(phases.finish + 0.1);
  assert.equal(engine.round.phase, 'waiting');
  assert.equal(engine.ducks.size, 0);
  assert.equal(engine.round.n, 2);
});

test('one viewer owns one duck per round, and repeat actions update it', () => {
  const { engine, send, run, config } = makeEngine();
  send('comment', 'minh', { message: 'vịt ơi' });
  send('like', 'minh', { count: 50 });
  send('share', 'minh');
  run(0.1);
  assert.equal(engine.ducks.size, 1);
  const p = engine.ducks.get('minh');
  assert.equal(p.totalLikes, 50);
  assert.equal(p.totalShares, 1);
  const { commentMeters, shareMeters, likesPerMeter } = config.balance.rewards;
  assert.equal(p.metersEarned, commentMeters + shareMeters + 50 / likesPerMeter);
});

test('a duplicated event is processed once', () => {
  const { engine, event, run } = makeEngine();
  const gift = event('gift', 'g', { giftId: 'x', giftName: 'Rose', diamonds: 1, repeatCount: 1 });
  assert.equal(engine.ingest(gift), '');
  assert.equal(engine.ingest({ ...gift }), 'duplicate');
  run(0.1);
  assert.equal(engine.totals.gifts, 1);
  assert.equal(engine.ducks.get('g').totalGifts, 1);
});

test('any comment gives a duck, only an empty one does not', () => {
  const { engine, send, run } = makeEngine();
  send('comment', 'a', { message: 'hello mọi người' });
  send('comment', 'b', { message: '1' });
  send('comment', 'c', { message: '   ' });
  run(0.1);
  assert.equal(engine.ducks.size, 2);
  assert.ok(!engine.ducks.get('c'));
});

test('every action shows right away how many metres it earned', () => {
  const { engine, send, run, config } = makeEngine();
  send('comment', 'a', { message: 'chào' });
  run(0.1);
  const dash = engine.takeFx().filter((f) => f.k === 'dash');
  assert.deepEqual(dash.map((f) => f.meters), [config.balance.rewards.commentMeters]);
});

test('likes without a user only feed the community', () => {
  const { engine, send, run } = makeEngine();
  send('like', null, { count: 300 });
  run(0.1);
  assert.equal(engine.ducks.size, 0);
  assert.equal(engine.totals.likes, 300);
  assert.equal(engine.community.value('tsunami'), 300);
});

test('everyone has the same base speed: with no buffs the ducks stay level', () => {
  const { engine, send, run, config } = makeEngine((c) => {
    c.balance.obstacles.enabled = false;
    c.balance.currents.amplitude = 0;
  });
  send('comment', 'a', { message: 'GO' });
  send('comment', 'b', { message: 'GO' });
  run(config.game.phases.registration + 10);
  const [a, b] = [engine.ducks.get('a'), engine.ducks.get('b')];
  assert.ok(Math.abs(a.position - b.position) < 1e-6);
  const dash = (config.balance.rewards.commentMeters * engine.trackLength) / 500;
  assert.ok(Math.abs(a.position - 1000 - dash) < 60, `about base speed x 10 s + one comment, got ${a.position}`);
});

const calmRiver = (c) => {
  c.balance.obstacles.enabled = false;
  c.balance.currents.amplitude = 0;
  c.balance.currents.sprintAmplitude = 0;
};

test('a huge gift is a long burst of speed, never an instant win', () => {
  const { engine, send, run, config } = makeEngine(calmRiver);
  send('gift', 'rich', { giftId: 'x', giftName: 'Big', diamonds: 1000, repeatCount: 99 });
  run(config.game.phases.registration + 10);
  const rich = engine.ducks.get('rich');
  const cap = config.balance.baseSpeed * (1 + config.balance.rewards.maxDashBonus);
  assert.ok(rich.speedMult <= 1 + config.balance.rewards.maxDashBonus + 1e-9);
  assert.ok(rich.position <= cap * 10.1, `at most capped speed x 10 s, got ${rich.position}`);
  assert.ok(!rich.isFinished);
});

test('a free player who keeps tapping beats someone who only sent one gift', () => {
  const { engine, send, run, config } = makeEngine(calmRiver);
  send('comment', 'free', { message: 'chào' });
  send('gift', 'gifter', { giftId: 'x', giftName: 'Lucky Pig', diamonds: 10, repeatCount: 1 });
  run(config.game.phases.registration);
  for (let i = 0; i < 40; i++) {
    send('like', 'free', { count: 15 });
    run(1.5);
  }
  assert.ok(engine.ducks.get('free').position > engine.ducks.get('gifter').position);
});

test('a duck that does nothing does not reach the finish on its own', () => {
  const { engine, send, run, config } = makeEngine(calmRiver);
  send('comment', 'idle', { message: 'chào' });
  run(config.game.phases.registration + config.game.phases.race + config.game.phases.sprint - 0.1);
  assert.ok(!engine.ducks.get('idle').isFinished);
});

test('acting during the results puts you in the next round, a gift keeps its metres', () => {
  const { engine, send, run, config } = makeEngine();
  const { phases } = config.game;
  send('comment', 'a', { message: 'chào' });
  run(phases.registration + phases.race + phases.sprint + 0.1);
  assert.equal(engine.round.phase, 'finish');
  send('comment', 'b', { message: 'vào với' });
  send('gift', 'c', { giftId: 'x', giftName: 'Lucky Pig', diamonds: 10, repeatCount: 1 });
  run(0.1);
  assert.equal(engine.ducks.size, 1, 'nobody joins the finished round');
  run(phases.finish + 0.1);
  assert.equal(engine.round.phase, 'registration');
  assert.deepEqual(engine.ducks.list().map((p) => p.userId).sort(), ['b', 'c']);
  assert.equal(engine.ducks.get('c').metersEarned, config.gifts.tiers.large.meters);
});

test('a duck that joins mid-race starts at the back of the pack, never near the finish', () => {
  const { engine, send, run, config } = makeEngine();
  send('comment', 'a', { message: 'chào' });
  run(config.game.phases.registration + 30);
  const lead = engine.ducks.get('a').position;
  send('comment', 'late', { message: 'GO' });
  run(0.05);
  const late = engine.ducks.get('late');
  assert.ok(late.position < lead);
  assert.ok(late.position <= engine.trackLength * 0.5);
});

test('race order follows distance, and finishers rank by finish time', () => {
  const { engine, send, run, config } = makeEngine((c) => {
    c.balance.obstacles.enabled = false;
  });
  ['a', 'b', 'c'].forEach((u) => send('comment', u, { message: 'GO' }));
  send('gift', 'b', { giftId: 'x', giftName: 'Big', diamonds: 1000, repeatCount: 1 });
  run(config.game.phases.registration + config.game.phases.race + config.game.phases.sprint + 0.5);
  const top = engine.lastResult.top;
  assert.equal(top[0].name, 'b');
  for (let i = 1; i < top.length; i++) {
    if (top[i - 1].finished && top[i].finished) assert.ok(top[i - 1].time <= top[i].time);
  }
});

test('a gift on the list is matched by name and shown under its Vietnamese label, whatever its diamond value', () => {
  const { engine, send, run, config } = makeEngine();
  send('gift', 'a', { giftId: 'x', giftName: 'lucky pig', diamonds: 1, repeatCount: 2 });
  run(config.game.phases.registration + 0.1);
  send('gift', 'a', { giftId: 'x', giftName: 'Hoa hồng', diamonds: 1, repeatCount: 1 });
  run(0.1);
  assert.equal(engine.ducks.get('a').metersEarned, config.gifts.tiers.large.meters * 2 + config.gifts.tiers.small.meters);
  const [fx] = engine.takeFx().filter((f) => f.k === 'gift');
  assert.equal(fx.name, 'Hoa hồng');
});

test('a gift off the list goes by its diamond value, and the admin mapping beats the list', () => {
  const { engine, send, run, config } = makeEngine((c) => (c.gifts.byId = { 'mapped-rose': 'special' }));
  send('gift', 'a', { giftId: 'y', giftName: 'Galaxy', diamonds: 1000, repeatCount: 1 });
  send('gift', 'b', { giftId: 'mapped-rose', giftName: 'Rose', diamonds: 1, repeatCount: 1 });
  run(0.1);
  assert.equal(engine.ducks.get('a').metersEarned, config.gifts.tiers.special.meters);
  assert.equal(engine.ducks.get('b').metersEarned, config.gifts.tiers.special.meters);
});

test('the gift list on screen is ordered by price and every gift goes further than the cheaper one', () => {
  const { config } = makeEngine();
  const list = config.gifts.list.filter((g) => !config.gifts.tiers[g.tier].randomSkin).map((g) => [g.coins, config.gifts.tiers[g.tier].meters]);
  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i][0] > list[i - 1][0]);
    assert.ok(list[i][1] > list[i - 1][1]);
  }
});

const clover = { giftId: 'c', giftName: 'Treasure Clover', diamonds: 10, repeatCount: 1 };

test('a clover puts a random skin on the duck, shows it, and adds metres like any gift', () => {
  const { engine, send, run, config } = makeEngine();
  send('gift', 'a', clover);
  run(0.1);
  const p = engine.ducks.get('a');
  assert.ok(config.gifts.skins.some((skin) => skin.id === p.skin));
  assert.equal(p.metersEarned, config.gifts.tiers.skin.meters);
  const fx = engine.takeFx().find((f) => f.k === 'skin');
  assert.deepEqual([fx.id, fx.skin], [p.id, p.skin]);
  assert.equal(engine.roster()[0].skin, p.skin);
});

test('every clover changes the skin to a different one', () => {
  const { engine, send, run } = makeEngine();
  send('gift', 'a', clover);
  run(0.05);
  for (let i = 0; i < 40; i++) {
    const before = engine.ducks.get('a').skin;
    send('gift', 'a', clover);
    run(0.05);
    assert.notEqual(engine.ducks.get('a').skin, before);
  }
});

test('in a race the close-up gets the skin as its punchline', () => {
  const { engine, send, run, config } = makeEngine();
  send('comment', 'a', { message: 'chào' });
  run(config.game.phases.registration + 0.1);
  engine.takeFx();
  send('gift', 'a', clover);
  run(0.1);
  const p = engine.ducks.get('a');
  const fx = engine.takeFx().find((f) => f.k === 'gift');
  assert.equal(fx.tier, 'skin');
  assert.equal(fx.skinLabel, config.gifts.skins.find((skin) => skin.id === p.skin).label);
});

test('a skin stays with the viewer into the next round, also when sent during the results', () => {
  const { engine, send, run, config } = makeEngine();
  const { phases } = config.game;
  send('gift', 'a', clover);
  send('comment', 'b', { message: 'chào' });
  run(0.1);
  const skinA = engine.ducks.get('a').skin;
  run(phases.registration + phases.race + phases.sprint + 0.1);
  assert.equal(engine.round.phase, 'finish');
  send('gift', 'b', clover);
  run(0.1);
  run(phases.finish + 0.1);
  send('comment', 'a', { message: 'lại nè' });
  run(0.1);
  assert.equal(engine.ducks.get('a').skin, skinA);
  assert.ok(engine.ducks.get('b').skin, 'the gift sent during the results is on the new duck');
});

test('leaving TEST MODE removes test skins, stopping the game keeps skins, only a reset takes them all away', () => {
  const { engine, event, run } = makeEngine();
  engine.ingest({ ...event('gift', 'test', clover), source: 'mock' });
  engine.ingest(event('gift', 'real', clover));
  run(0.1);
  engine.purgeMock();
  assert.deepEqual(Object.keys(engine.results.skins), ['real']);
  engine.stop();
  engine.start();
  assert.deepEqual(Object.keys(engine.results.skins), ['real']);
  engine.reset();
  assert.deepEqual(engine.results.skins, {});
});

test('skins survive a server restart and are gone after a reset', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tha-vit-'));
  try {
    const first = new ResultStore(dir);
    first.setSkin('a', 'toilet', 'live');
    const second = new ResultStore(dir);
    assert.equal(second.skinOf('a'), 'toilet');
    assert.equal(second.skinOf('nobody'), null);
    second.clear();
    assert.equal(new ResultStore(dir).skinOf('a'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('someone from the round that just ended also keeps a place when acting during the results', () => {
  const { engine, send, run, config } = makeEngine();
  const { phases } = config.game;
  send('comment', 'a', { message: 'chào' });
  send('comment', 'b', { message: 'chào' });
  run(phases.registration + phases.race + phases.sprint + 0.2);
  assert.equal(engine.round.phase, 'finish');
  send('comment', 'a', { message: 'chơi tiếp' });
  send('gift', 'b', { giftId: 'x', giftName: 'Lucky Pig', diamonds: 10, repeatCount: 1 });
  run(0.1);
  run(phases.finish + 0.1);
  assert.equal(engine.round.phase, 'registration');
  assert.deepEqual(engine.ducks.list().map((p) => p.userId).sort(), ['a', 'b']);
  assert.equal(engine.ducks.get('a').position, 0);
  assert.equal(engine.ducks.get('b').metersEarned, config.gifts.tiers.large.meters);
});

test('stale events from before the round only count in the totals', () => {
  const { engine, event, run, wall } = makeEngine();
  engine.ingest(event('comment', 'old', { message: 'GO', timestamp: wall() - 120_000 }));
  run(0.1);
  assert.equal(engine.ducks.size, 0);
  assert.equal(engine.stats.late, 1);
});

test('TEST MODE off: mock events are refused', () => {
  const { engine, event } = makeEngine((c) => (c.game.testMode = false));
  assert.equal(engine.ingest({ ...event('comment', 'x', { message: 'GO' }), source: 'mock' }), 'test-off');
});

test('mock adapter: a gift combo of 20 counts 20 gifts, replays are ignored', () => {
  const { engine, run } = makeEngine();
  const mock = new MockAdapter();
  mock.on('event', (e) => engine.ingest(e));
  const user = mockUser('combo');
  const gift = MOCK_GIFTS.small;
  [1, 5, 12, 20].forEach((n) => mock.gift(user, gift, n, { groupId: 'g', repeatEnd: 0 }));
  mock.gift(user, gift, 20, { groupId: 'g', repeatEnd: 1 });
  mock.replay(5);
  run(0.1);
  assert.equal(engine.totals.gifts, 20);
  // The replayed end message carries no increase, so it makes no event at all; the other four are duplicates.
  assert.equal(engine.dedup.duplicates, 4);
});

test('100 ducks and a flood of events run without errors', () => {
  const { engine, send, run } = makeEngine();
  for (let i = 0; i < 100; i++) send('comment', `u${i}`, { message: 'GO' });
  for (let i = 0; i < 5000; i++) send(['like', 'comment', 'share', 'gift'][i % 4], `u${i % 100}`, { count: 3, message: 'GO', giftId: 'x', giftName: 'R', diamonds: 1, repeatCount: 1 });
  run(60);
  assert.equal(engine.ducks.size, 100);
  assert.equal(engine.queue.size, 0);
  assert.ok(engine.frame().ducks.length === 100);
});
