import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clicksPerSecond, SOUNDS, soundsForChange } from '../public/sound.js';
import { Factory } from '../src/factory.js';
import { buildAccounts, SampleDeck } from '../src/samples.js';

const base = (extra = {}) => ({ activity: [], active: null, paused: false, connection: { phase: 'idle' }, ...extra });
const real = id => ({ id, viewer: { source: 'live' } });
const sample = id => ({ id, viewer: { source: 'sample' } });

test('the first state after opening the page plays nothing', () => {
  assert.deepEqual(soundsForChange(null, base({ active: real('a'), activity: [{ id: '1', kind: 'gift', tier: 'pig' }] })), []);
});

test('every gift has its own sound and every sound exists', () => {
  for (const tier of ['like', 'rose', 'heart', 'pig']) {
    const names = soundsForChange(base(), base({ activity: [{ id: '1', kind: 'gift', tier }] }));
    assert.deepEqual(names, [`gift-${tier}`]);
    assert.equal(typeof SOUNDS[names[0]], 'function');
  }
  for (const name of ['like', 'turn', 'start', 'cut', 'done', 'box', 'pause', 'resume', 'connected', 'lost', 'tap']) {
    assert.equal(typeof SOUNDS[name], 'function', name);
  }
});

test('likes pop, and reaching a turn rings instead', () => {
  assert.deepEqual(soundsForChange(base(), base({ activity: [{ id: '1', kind: 'like', tickets: 0 }] })), ['like']);
  assert.deepEqual(soundsForChange(base(), base({ activity: [{ id: '1', kind: 'like', tickets: 1 }] })), ['turn']);
});

test('only new activity sounds: the same list again is silent, warnings are silent', () => {
  const activity = [{ id: '1', kind: 'gift', tier: 'pig' }];
  assert.deepEqual(soundsForChange(base({ activity }), base({ activity })), []);
  assert.deepEqual(soundsForChange(base(), base({ activity: [{ id: '2', kind: 'warning' }] })), []);
});

test('a burst plays each sound once, not once per event', () => {
  const activity = Array.from({ length: 12 }, (_, i) => ({ id: String(i), kind: 'like', tickets: 0 }));
  assert.deepEqual(soundsForChange(base(), base({ activity })), ['like']);
});

test('a new job starts the machine; a sample giving way to a real viewer adds the sweep', () => {
  assert.deepEqual(soundsForChange(base(), base({ active: sample('s') })), ['start']);
  assert.deepEqual(soundsForChange(base({ active: sample('s') }), base({ active: sample('t') })), ['start']);
  assert.deepEqual(soundsForChange(base({ active: real('a') }), base({ active: real('b') })), ['start']);
  assert.deepEqual(soundsForChange(base({ active: sample('s') }), base({ active: real('a') })), ['cut', 'start']);
  assert.deepEqual(soundsForChange(base({ active: real('a') }), base({ active: real('a') })), []);
  assert.deepEqual(soundsForChange(base({ active: real('a') }), base()), []);
});

test('pause and resume each have a sound', () => {
  assert.deepEqual(soundsForChange(base(), base({ paused: true })), ['pause']);
  assert.deepEqual(soundsForChange(base({ paused: true }), base()), ['resume']);
});

test('connection news reaches the operator but never the LIVE window', () => {
  const up = [base({ connection: { phase: 'connecting' } }), base({ connection: { phase: 'connected' } })];
  const down = [base({ connection: { phase: 'connected' } }), base({ connection: { phase: 'retrying' } })];
  assert.deepEqual(soundsForChange(...up), ['connected']);
  assert.deepEqual(soundsForChange(...down), ['lost']);
  assert.deepEqual(soundsForChange(...up, { isOverlay: true }), []);
  assert.deepEqual(soundsForChange(...down, { isOverlay: true }), []);
});

test('finer grids click faster', () => {
  assert.ok(clicksPerSecond(72) > clicksPerSecond(52));
  assert.ok(clicksPerSecond(52) > clicksPerSecond(36));
  assert.ok(clicksPerSecond(72) < 40, 'still separate clicks, not a buzz');
});

test('the factory tells the page which gift and whether likes earned a turn', () => {
  const factory = new Factory({ samples: new SampleDeck({ accounts: buildAccounts(5) }) });
  factory.ingest({ type: 'gift', source: 'live', eventId: 'g', userId: 'a', nickname: 'A', repeatCount: 1, diamonds: 10, giftName: 'Lucky Pig' });
  assert.equal(factory.snapshot().activity[0].tier, 'pig');
  factory.ingest({ type: 'like', source: 'live', eventId: 'l1', userId: 'b', nickname: 'B', count: 10 });
  assert.equal(factory.snapshot().activity[0].tickets, 0);
  factory.ingest({ type: 'like', source: 'live', eventId: 'l2', userId: 'b', nickname: 'B', count: 40 });
  assert.equal(factory.snapshot().activity[0].tickets, 1);
});

test('the page only plays sounds through the shared on/off switch', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /new (Audio|AudioContext)\b/);
});
