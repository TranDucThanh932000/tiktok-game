import test from 'node:test';
import assert from 'node:assert/strict';
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
  const { engine, send, run } = makeEngine();
  send('comment', 'minh', { message: 'vịt ơi' });
  send('like', 'minh', { count: 50 });
  send('share', 'minh');
  run(0.1);
  assert.equal(engine.ducks.size, 1);
  const p = engine.ducks.get('minh');
  assert.equal(p.totalLikes, 50);
  assert.equal(p.totalShares, 1);
  assert.equal(p.energy, 3 + 5 + 10);
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

test('comments without a keyword do nothing', () => {
  const { engine, send, run } = makeEngine();
  send('comment', 'a', { message: 'hello mọi người' });
  run(0.1);
  assert.equal(engine.ducks.size, 0);
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
  assert.ok(Math.abs(a.position - 1000) < 60, `about base speed x 10 s, got ${a.position}`);
});

test('a gifter goes faster but within the cap, and a free player can still win', () => {
  const { engine, send, run, config } = makeEngine((c) => {
    c.balance.obstacles.enabled = false;
    c.balance.currents.amplitude = 0;
    c.balance.currents.sprintAmplitude = 0;
  });
  send('comment', 'free', { message: 'GO' });
  send('gift', 'rich', { giftId: 'x', giftName: 'Big', diamonds: 1000, repeatCount: 1 });
  run(config.game.phases.registration + 1);
  const rich = engine.ducks.get('rich');
  const free = engine.ducks.get('free');
  assert.ok(rich.speedMult > 1 && rich.speedMult <= 1 + config.balance.maxTotalBonus);
  for (let i = 0; i < 20; i++) {
    send('comment', 'free', { message: 'GO' });
    send('share', 'free');
    send('like', 'free', { count: 50 });
    run(5.5);
  }
  assert.ok(free.energy >= 0);
  assert.ok(free.earned.like <= 20 && free.earned.comment <= 15 && free.earned.share <= 10);
});

test('a duck that joins mid-race starts at the back of the pack, never near the finish', () => {
  const { engine, send, run, config } = makeEngine();
  send('comment', 'a', { message: 'GO' });
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
