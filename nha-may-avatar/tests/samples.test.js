import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JOB_MS } from '../public/rules.js';
import { imageUrl } from '../public/portrait.js';
import { Factory } from '../src/factory.js';
import { buildAccounts, listPhotoAccounts, sampleAvatar, SampleDeck } from '../src/samples.js';

function setup({ gap = 1000, count = 40 } = {}) {
  let clock = 1_000_000;
  let seq = 0;
  const factory = new Factory({
    now: () => clock, id: () => `id-${++seq}`, sampleGapMs: gap, random: () => 0.5,
    samples: new SampleDeck({ accounts: buildAccounts(count) }),
  });
  const advance = ms => { clock += ms; factory.tick(); };
  const gift = (userId = 'real') => factory.ingest({
    type: 'gift', source: 'live', eventId: `e-${++seq}`, userId, nickname: 'Real', avatar: '', repeatCount: 1, diamonds: 5, giftName: 'Heart',
  });
  return { factory, advance, gift };
}

test('1000 accounts with different pictures and different names, all usable as images', () => {
  const accounts = buildAccounts(1000);
  assert.equal(accounts.length, 1000);
  assert.equal(new Set(accounts.map(account => account.userId)).size, 1000);
  assert.equal(new Set(accounts.map(account => account.nickname)).size, 1000);
  for (const account of accounts) assert.match(account.nickname, /^[A-Za-z]+ [A-Za-z]+$/);
  const pictures = new Set();
  for (const account of accounts) {
    const index = Number(/(\d+)\.svg$/.exec(account.avatar)[1]);
    const svg = sampleAvatar(index);
    assert.doesNotMatch(svg, /undefined|NaN|null/);
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
    pictures.add(svg);
    assert.equal(imageUrl(account.avatar), account.avatar, 'loads directly, not through the TikTok proxy');
  }
  assert.equal(pictures.size, 1000);
});

test('the deck uses every account once before any comes back', () => {
  const deck = new SampleDeck({ accounts: buildAccounts(200) });
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const account = deck.next();
    assert.ok(!seen.has(account.userId), `repeat at draw ${i}`);
    seen.add(account.userId);
  }
  assert.equal(seen.size, 200);
});

test('reshuffling never brings back an account that was just on screen', () => {
  const deck = new SampleDeck({ accounts: buildAccounts(100), recent: 30 });
  const order = Array.from({ length: 1000 }, () => deck.next().userId);
  for (let i = 0; i < order.length; i += 1) {
    const window = order.slice(Math.max(0, i - 30), i);
    assert.ok(!window.includes(order[i]), `${order[i]} came back within 30 draws`);
  }
});

test('order differs from one run to the next', () => {
  const draw = () => {
    const deck = new SampleDeck({ accounts: buildAccounts(100) });
    return Array.from({ length: 20 }, () => deck.next().userId).join();
  };
  assert.notEqual(draw(), draw());
});

test('pictures dropped in the folder join the deck; other files are ignored', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'samples-'));
  try {
    writeFileSync(path.join(folder, 'my photo.png'), 'x');
    writeFileSync(path.join(folder, 'README.txt'), 'x');
    const photos = listPhotoAccounts(folder);
    assert.equal(photos.length, 1);
    assert.equal(photos[0].avatar, '/samples/my%20photo.png');
    assert.equal(imageUrl(photos[0].avatar), photos[0].avatar);
    const deck = new SampleDeck({ accounts: buildAccounts(2), photos: () => photos });
    assert.equal(deck.size, 3);
    assert.ok(Array.from({ length: 3 }, () => deck.next().userId).includes(photos[0].userId));
  } finally {
    rmSync(folder, { recursive: true });
  }
  assert.deepEqual(listPhotoAccounts(path.join(tmpdir(), 'no-such-folder-here')), []);
});

test('an idle machine starts drawing samples, one after another with no empty gap', () => {
  const { factory, advance } = setup();
  assert.equal(factory.active, null);
  advance(500);
  assert.equal(factory.active, null, 'waits for the idle gap');
  advance(600);
  const first = factory.active;
  assert.equal(first.viewer.source, 'sample');
  assert.equal(first.trigger.name, 'Sample');
  assert.notEqual(first.quality.id, 'like');
  advance(JOB_MS);
  assert.equal(factory.active.viewer.source, 'sample');
  assert.notEqual(factory.active.viewer.userId, first.viewer.userId);
});

test('a real gift takes the machine immediately from a sample', () => {
  const { factory, advance, gift } = setup();
  advance(1100);
  assert.equal(factory.active.viewer.source, 'sample');
  advance(2000);
  gift('real-1');
  assert.equal(factory.active.viewer.userId, 'real-1');
  assert.equal(factory.active.viewer.source, 'live');
});

test('samples wait while real turns are queued, and resume only after the gap', () => {
  const { factory, advance, gift } = setup({ gap: 3000 });
  gift('a');
  gift('b');
  advance(JOB_MS);
  assert.equal(factory.active.viewer.userId, 'b');
  advance(JOB_MS);
  assert.equal(factory.active, null, 'the finished portrait stays on screen');
  advance(2000);
  assert.equal(factory.active, null);
  advance(1100);
  assert.equal(factory.active.viewer.source, 'sample');
});

test('samples never touch stats, history or the queue', () => {
  const { factory, advance } = setup();
  for (let i = 0; i < 10; i += 1) advance(JOB_MS + 1100);
  const state = factory.snapshot();
  assert.deepEqual(state.stats, { likes: 0, gifts: 0, completed: 0 });
  assert.deepEqual(state.history, []);
  assert.equal(state.pending, 0);
  assert.deepEqual(state.queue, []);
});

test('the switch turns samples off at once and back on; pausing stops them', () => {
  const { factory, advance } = setup();
  advance(1100);
  assert.ok(factory.active);
  factory.setSamples(false);
  assert.equal(factory.active, null);
  assert.equal(factory.snapshot().samples.on, false);
  advance(60_000);
  assert.equal(factory.active, null);
  factory.setSamples(true);
  advance(1100);
  assert.ok(factory.active);
  factory.active = null;
  factory.setPaused(true);
  advance(60_000);
  assert.equal(factory.active, null);
  assert.throws(() => factory.setSamples('yes'), TypeError);
});

test('without a deck the machine behaves as before', () => {
  let clock = 0;
  const factory = new Factory({ now: () => clock });
  clock = 100_000;
  factory.tick();
  assert.equal(factory.active, null);
  assert.deepEqual(factory.snapshot().samples, { on: false, total: 0 });
});
