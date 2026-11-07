import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEMO_VIEWERS, GIFT_PRESETS, giftQuality, QUALITY_TIERS } from '../public/rules.js';
import { TikTokSource } from '../src/tiktok.js';

test('game-owned UI and error copy is English, including screen-reader labels', () => {
  const accentedLatin = /[\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u024f\u1e00-\u1eff]/u;
  for (const file of ['public/index.html', 'public/app.js', 'public/portrait.js', 'public/sound.js', 'src/factory.js', 'src/tiktok.js', 'src/avatar.js', 'src/samples.js', 'server.js']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, accentedLatin, file);
  }
  assert.match(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), /<html lang="en">/);
  for (const label of [...QUALITY_TIERS.map(tier => tier.label), ...GIFT_PRESETS.map(gift => gift.name), ...DEMO_VIEWERS.map(viewer => viewer.nickname)]) {
    assert.match(label, /^[A-Za-z ]+$/);
  }
});

test('English gift labels retain Vietnamese aliases and the same quality levels', () => {
  for (const [name, english, columns] of [['Hoa hồng', 'Rose', 36], ['Bắn tim', 'Heart', 52], ['Heo may mắn', 'Lucky Pig', 72]]) {
    const gift = giftQuality(0, name);
    assert.equal(gift.name, english);
    assert.equal(gift.tier.columns, columns);
  }
  assert.equal(giftQuality(10, 'Quà khác').name, 'Gift');
  assert.equal(giftQuality(10, 'Quà khác').tier.columns, 72);
});

test('missing live names use Guest without translating real viewer names', () => {
  const source = new TikTokSource();
  const events = [];
  source.on('event', event => events.push(event));
  source.consume('like', { common: { msgId: '1' }, user: { id: 'a' }, count: 50 });
  source.consume('like', { common: { msgId: '2' }, user: { id: 'b', nickname: 'Người xem' }, count: 50 });
  assert.equal(events[0].nickname, 'Guest');
  assert.equal(events[1].nickname, 'Người xem');
});
