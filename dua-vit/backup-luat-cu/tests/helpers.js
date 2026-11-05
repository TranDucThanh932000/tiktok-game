import path from 'node:path';
import { paths, readJson, validate } from '../src/config/loadConfig.js';
import { GameEngine } from '../src/game/GameEngine.js';
import { ResultStore } from '../src/game/ResultStore.js';
import { createPlayer } from '../src/game/DuckManager.js';

// The shipped config files, without data/settings.json overrides, so tests do not depend on admin changes.
export function baseConfig() {
  return validate({
    game: readJson(path.join(paths.config, 'game.json')),
    balance: readJson(path.join(paths.config, 'balance.json')),
    gifts: readJson(path.join(paths.config, 'gifts.json')),
  });
}

export const player = (overrides = {}) =>
  Object.assign(createPlayer({ userId: 'u1', username: 'u1', nickname: 'u1', source: 'live' }, { seq: 1, lane: 0, position: 0, now: 0 }), overrides);

export function makeEngine(mutate) {
  const config = structuredClone(baseConfig());
  config.game.testMode = true;
  mutate?.(config);
  let wall = 1_700_000_000_000;
  let seq = 0;
  const engine = new GameEngine({ config, results: new ResultStore(paths.data, { persist: false }), now: () => wall });
  engine.start();
  const event = (type, user, fields = {}) => ({
    type, eventId: `live:t${++seq}`, source: 'live', userId: user, username: user, nickname: user, avatar: '', timestamp: wall, receivedAt: wall, ...fields,
  });
  // Advances both the game clock and the wall clock in 50 ms ticks.
  const run = (seconds) => {
    for (let t = 0; t < seconds - 1e-9; t += 0.05) {
      wall += 50;
      engine.tick(0.05);
    }
  };
  const send = (...args) => {
    const e = event(...args);
    engine.ingest(e);
    return e;
  };
  return { engine, config, event, send, run, wall: () => wall };
}
