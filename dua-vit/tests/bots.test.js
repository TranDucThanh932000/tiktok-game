import test from 'node:test';
import assert from 'node:assert/strict';
import { pickBotNames } from '../src/game/BotManager.js';
import { makeEngine } from './helpers.js';

const withBots = (mutate) => makeEngine((c) => {
  c.game.bots.enabled = true;
  mutate?.(c);
});
const bots = (engine) => engine.ducks.list().filter((p) => p.isBot);
const calmRiver = (c) => {
  c.balance.obstacles.enabled = false;
  c.balance.currents.amplitude = 0;
  c.balance.currents.sprintAmplitude = 0;
};

test('with bots on, a round opens by itself with 8 differently named ducks, and the race starts with nobody watching', () => {
  const { engine, run, config } = withBots();
  assert.equal(engine.round.phase, 'registration');
  assert.equal(bots(engine).length, 8);
  assert.equal(new Set(bots(engine).map((p) => p.nickname)).size, 8);
  run(config.game.phases.registration + 0.1);
  assert.equal(engine.round.phase, 'race');
});

test('with bots off, the game still waits for the first viewer', () => {
  const { engine } = makeEngine();
  assert.equal(engine.round.phase, 'waiting');
  assert.equal(engine.ducks.size, 0);
});

test('bots only earn metres by likes and comments, and stay out of the goal, the statistics and the announcements', () => {
  const { engine, run, config } = withBots();
  const fx = [];
  const { phases } = config.game;
  for (let t = 0; t < phases.registration + 30; t += 0.5) {
    run(0.5);
    fx.push(...engine.takeFx());
  }
  const earned = bots(engine).reduce((sum, p) => sum + p.metersEarned, 0);
  assert.ok(earned > 0, 'the bots are active');
  assert.deepEqual([...new Set(fx.filter((f) => f.k === 'dash').map((f) => f.via))], ['like']);
  assert.ok(fx.filter((f) => f.k === 'dash').every((f) => f.quiet));
  assert.equal(fx.filter((f) => ['gift', 'skin'].includes(f.k)).length, 0);
  assert.equal(fx.filter((f) => f.k === 'note' && f.kind === 'join').length, 0);
  assert.deepEqual([engine.totals.likes, engine.totals.comments, engine.totals.shares, engine.totals.gifts], [0, 0, 0, 0]);
  assert.equal(engine.community.value('tsunami'), 0);
  assert.ok(bots(engine).every((p) => !p.skin && p.totalGifts === 0 && p.totalShares === 0 && !p.shared));
});

test('no bot ever passes the leading viewer, even one who does nothing after joining', () => {
  for (let round = 0; round < 15; round++) {
    const { engine, send, run, config } = withBots();
    const { phases } = config.game;
    send('comment', 'lazy', { message: 'chào' });
    run(phases.registration + 0.1);
    const viewer = engine.ducks.get('lazy');
    for (let t = 0; t < phases.race + phases.sprint - 0.5; t += 0.5) {
      run(0.5);
      for (const bot of bots(engine)) assert.ok(bot.position < viewer.position, `${bot.nickname} passed at ${t}s`);
    }
  }
});

test('bots stay close behind an active viewer, so the race still feels like one', () => {
  const gaps = Array.from({ length: 30 }, () => {
    const { engine, send, run, config } = withBots(calmRiver);
    send('comment', 'a', { message: 'chào' });
    run(config.game.phases.registration);
    for (let i = 0; i < 15; i++) {
      send('comment', 'a', { message: 'cố lên' });
      run(3.1);
    }
    return (engine.ducks.get('a').position - Math.max(...bots(engine).map((p) => p.position))) / engine.toTrack(1);
  });
  const average = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  assert.ok(average < 40, `on average the closest bot is ${average}m behind`);
  assert.ok(gaps.every((gap) => gap > 0));
});

test('a late viewer closes in even when idle, and passes every bot by joining in', () => {
  const idle = withBots(calmRiver);
  idle.run(idle.config.game.phases.registration + 30);
  idle.send('comment', 'late', { message: 'vào muộn' });
  idle.run(0.1);
  const gap = () => Math.max(...bots(idle.engine).map((p) => p.position)) - idle.engine.ducks.get('late').position;
  const before = gap();
  assert.ok(before > 0, 'joins behind the pack');
  idle.run(20);
  assert.ok(gap() < before, 'the bots ease off');

  for (let round = 0; round < 10; round++) {
    const { engine, send, run, config } = withBots(calmRiver);
    const { phases } = config.game;
    run(phases.registration + 30);
    for (let t = 0; t < phases.race + phases.sprint - 31; t += 3.1) {
      send('comment', 'late', { message: 'cố lên' });
      run(3.1);
    }
    const late = engine.ducks.get('late');
    assert.ok(bots(engine).every((p) => p.isFinished === false && p.position < late.position), `round ${round}`);
  }
});

test('no two rounds play out alike', () => {
  const { engine, run, config } = withBots();
  const { phases } = config.game;
  const playRound = () => {
    run(phases.registration + 30);
    const earned = bots(engine).map((p) => p.metersEarned);
    const names = bots(engine).map((p) => p.nickname);
    const zeal = bots(engine).map((p) => p.bot.zeal);
    engine.newRound();
    return { earned, names, zeal };
  };
  const rounds = Array.from({ length: 6 }, playRound);
  for (let i = 1; i < rounds.length; i++) {
    assert.notDeepEqual(rounds[i].earned, rounds[i - 1].earned);
    assert.notDeepEqual(rounds[i].zeal, rounds[i - 1].zeal);
  }
  assert.ok(new Set(rounds.map((r) => r.names.join())).size > 1, 'different ducks in different lanes');
  assert.ok(new Set(rounds[0].earned).size > 3, 'the bots of one round differ from each other');
});

test('a bot does not tap at a steady beat: it has bursts and silences', () => {
  const { engine, run, config } = withBots(calmRiver);
  const pauses = [];
  const seen = new Map();
  for (let t = 0; t < config.game.phases.registration + 60; t += 0.05) {
    run(0.05);
    for (const p of bots(engine)) {
      const last = seen.get(p.id);
      if (last && last.nextAt !== p.bot.nextAt) pauses.push(p.bot.nextAt - engine.time);
      seen.set(p.id, { nextAt: p.bot.nextAt });
    }
  }
  assert.ok(pauses.length > 50);
  assert.ok(Math.max(...pauses) > 4 * Math.min(...pauses), `pauses from ${Math.min(...pauses)} to ${Math.max(...pauses)}`);
});

test('every viewer takes the place of one bot at the start, and a full room has no bots', () => {
  const few = withBots();
  few.send('comment', 'a', { message: 'chào' });
  few.send('comment', 'b', { message: 'chào' });
  few.send('comment', 'c', { message: 'chào' });
  few.run(0.1);
  assert.equal(bots(few.engine).length, 8, 'nothing disappears during the countdown');
  few.run(few.config.game.phases.registration + 0.1);
  assert.equal(bots(few.engine).length, 5);
  assert.equal(few.engine.ducks.size, 8);
  const full = withBots();
  for (let i = 0; i < 12; i++) full.send('comment', `u${i}`, { message: 'chào' });
  full.run(full.config.game.phases.registration + 0.2);
  assert.equal(bots(full.engine).length, 0);
  assert.equal(full.engine.ducks.size, 12);
});

test('a round with bots only is not recorded, and a bot never enters the champions table', () => {
  const { engine, send, run, config } = withBots();
  const { phases } = config.game;
  const whole = phases.registration + phases.race + phases.sprint + 0.2;
  run(whole);
  assert.equal(engine.round.phase, 'finish');
  assert.ok(engine.lastResult.top[0].source === 'bot', 'the podium still works');
  assert.equal(engine.results.rounds.length, 0);
  run(phases.finish + 0.1);
  send('comment', 'a', { message: 'chào' });
  run(whole);
  assert.equal(engine.lastResult.top[0].name, 'a');
  assert.equal(engine.results.rounds.length, 1);
  assert.deepEqual(engine.results.winsTable(true).map((w) => w.name), ['a']);
  assert.ok(engine.lastResult.top.some((r) => r.source === 'bot'), 'bots still show in the results');
});

test('alone on the river, the bots reach the finish in time, so an empty room still sees a real race', () => {
  const { engine, run, config } = withBots(calmRiver);
  const { phases } = config.game;
  run(phases.registration + phases.race + phases.sprint - 0.5);
  const best = Math.max(...bots(engine).map((p) => p.position));
  assert.ok(best > engine.trackLength * 0.8, `the best bot got to ${Math.round((best / engine.trackLength) * 100)}%`);
});

test('bots bump into obstacles but leave pickups for viewers', () => {
  const { engine, send, run } = withBots();
  send('comment', 'a', { message: 'chào' });
  run(0.1);
  const bot = bots(engine)[0];
  const viewer = engine.ducks.get('a');
  const item = (kind) => ({ id: 1, type: kind === 'pickup' ? 'coin' : 'rock', kind, lane: 0, pos: 100, armedAt: 0, hits: new Set(), consumed: false });
  engine.obstacles.items = [item('pickup')];
  assert.equal(engine.obstacles.crossed({ ...bot, lane: 0 }, 90, 110, 1, 5).length, 0);
  assert.equal(engine.obstacles.items[0].consumed, false);
  assert.equal(engine.obstacles.crossed({ ...viewer, lane: 0 }, 90, 110, 1, 5).length, 1);
  engine.obstacles.items = [item('obstacle')];
  assert.equal(engine.obstacles.crossed({ ...bot, lane: 0 }, 90, 110, 1, 5).length, 1);
});

test('turning bots off applies from the next round, and a count above the names still gives different names', () => {
  const { engine, run, config } = withBots();
  config.game.bots.enabled = false;
  engine.newRound();
  run(0.1);
  assert.equal(engine.ducks.size, 0);
  assert.equal(engine.round.phase, 'waiting');
  const names = pickBotNames(['A', 'B'], 5, () => 0.5);
  assert.equal(new Set(names).size, 5);
});
