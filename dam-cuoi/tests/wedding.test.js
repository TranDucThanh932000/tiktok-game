import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Wedding, giftMatcher } from '../src/wedding.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

function setup() {
  let t = 1_000_000;
  const events = [];
  const w = new Wedding(config, { emit: (m) => events.push(m), now: () => t });
  const advance = (ms) => {
    t += ms;
    w.tick();
  };
  const who = (name) => ({ id: `u:${name}`, name, avatar: '' });
  return { w, events, advance, who, of: (type) => events.filter((e) => e.type === type) };
}

test('đăng ký chú rể khi trống, người sau đổi vai, kịch bản chạy lần lượt', () => {
  const { w, advance, who, of } = setup();
  w.act(who('Huy'), 'become_groom');
  w.act(who('Nam'), 'steal_groom');
  assert.equal(of('scene').length, 1);
  assert.equal(of('scene')[0].kind, 'claim');
  assert.equal(w.roles.groom.name, 'Huy');
  advance(config.timing.claimMs);
  assert.equal(of('scene').length, 2);
  const steal = of('scene')[1];
  assert.equal(steal.kind, 'steal');
  assert.equal(steal.from.name, 'Huy');
  assert.equal(steal.text, '⚡ Nam đổi vai chú rể, đá văng Huy!');
  assert.equal(w.roles.groom.name, 'Nam');
});

test('người đang giữ vai tặng tiếp thì không có kịch bản, không chặn hàng chờ', () => {
  const { w, advance, who, of } = setup();
  w.act(who('Lan'), 'become_bride');
  advance(config.timing.claimMs);
  w.act(who('Lan'), 'become_bride');
  w.act(who('Vy'), 'steal_bride');
  assert.equal(of('cheer').length, 1);
  assert.equal(of('scene').at(-1).kind, 'steal');
  assert.equal(w.roles.bride.name, 'Vy');
});

test('hủy hôn xóa cả hai và ghi kỷ lục bên nhau', () => {
  const { w, advance, who, of } = setup();
  w.act(who('Huy'), 'become_groom');
  advance(config.timing.claimMs);
  w.act(who('Lan'), 'become_bride');
  advance(config.timing.claimMs + 60_000);
  w.act(who('Phá'), 'cancel_wedding');
  const cancel = of('scene').at(-1);
  assert.equal(cancel.kind, 'cancel');
  assert.equal(cancel.from.groom.name, 'Huy');
  assert.equal(w.roles.groom, null);
  assert.equal(w.roles.bride, null);
  assert.equal(w.record.groom, 'Huy');
  assert.ok(w.record.ms >= 60_000);
});

test('hủy hôn khi sân khấu trống không tạo kịch bản', () => {
  const { w, who, of } = setup();
  w.act(who('Phá'), 'cancel_wedding');
  assert.equal(of('scene').length, 0);
  assert.equal(of('cheer').length, 1);
});

test('chỉ vàng cộng ngay theo xu, vượt mốc thì bắn pháo hoa một lần', () => {
  const { w, who, of } = setup();
  w.act(who('A'), 'gold', { coins: 1, count: 299 });
  assert.equal(of('goal').length, 0);
  w.act(who('B'), 'become_groom', { coins: 1, count: 1 });
  assert.equal(w.gold, 300);
  assert.equal(of('goal').length, 1);
  w.act(who('C'), 'gold', { coins: 5000, count: 1 });
  assert.equal(of('goal').length, 2);
  assert.equal(of('goal')[1].goal, 3000);
  assert.deepEqual(w.progress(), { gold: 5300, from: 3000, goal: 6000 });
  w.gold = 12_000;
  assert.deepEqual(w.progress(), { gold: 12_000, from: 10_000, goal: 15_000 });
});

test('hàng chờ dài thì kịch bản chạy nhanh hơn, đầy thì bỏ qua', () => {
  const { w, who, of } = setup();
  for (let i = 0; i < 60; i++) w.act(who(`P${i}`), i % 2 ? 'steal_bride' : 'steal_groom');
  assert.equal(w.queue.length, config.queueLimit);
  assert.ok(of('dropped').length > 0);
  w.current = null;
  w.tick();
  assert.ok(of('scene').at(-1).speed > 1);
});

test('lưu và khôi phục', () => {
  const a = setup();
  a.w.act(a.who('Huy'), 'become_groom', { coins: 1 });
  a.w.act(a.who('Lan'), 'become_bride', { coins: 1 });
  const b = setup();
  b.w.restore(JSON.parse(JSON.stringify(a.w)));
  assert.equal(b.w.roles.groom.name, 'Huy');
  assert.equal(b.w.queue.length, 1);
  assert.equal(b.w.gold, 2);
});

test('khớp quà theo mã rồi theo tên, không phân biệt dấu', () => {
  const match = giftMatcher([{ action: 'become_bride', giftLabel: 'Hoa hồng', names: ['Rose'], ids: [5655] }]);
  assert.equal(match({ giftId: 5655, giftName: 'xyz' })?.action, 'become_bride');
  assert.equal(match({ giftName: 'rose' })?.action, 'become_bride');
  assert.equal(match({ giftName: 'HOA HONG' })?.action, 'become_bride');
  assert.equal(match({ giftName: 'Galaxy' }), null);
});

test('đăng ký khi vai đã có người thì vào hàng chờ, hủy hôn thì người đầu hàng lên vai', () => {
  const { w, advance, who, of } = setup();
  w.act(who('Huy'), 'become_groom');
  advance(config.timing.claimMs);
  w.act(who('Nam'), 'become_groom');
  w.act(who('Tú'), 'become_groom');
  w.act(who('Nam'), 'become_groom');
  assert.equal(of('scene').length, 1);
  assert.equal(w.roles.groom.name, 'Huy');
  assert.deepEqual(w.waitlist.groom.map((p) => p.name), ['Nam', 'Tú']);
  assert.equal(of('registered').at(-1).position, 1);
  // Tú đổi vai thì rời hàng chờ.
  w.act(who('Tú'), 'steal_groom');
  assert.equal(w.roles.groom.name, 'Tú');
  assert.deepEqual(w.waitlist.groom.map((p) => p.name), ['Nam']);
  advance(config.timing.stealMs);
  w.act(who('Phá'), 'cancel_wedding');
  assert.equal(of('scene').at(-1).kind, 'cancel');
  advance(config.timing.cancelMs);
  assert.equal(of('scene').at(-1).kind, 'claim');
  assert.equal(w.roles.groom.name, 'Nam');
  assert.equal(w.waitlist.groom.length, 0);
});

test('đủ đôi thì làm lễ lần lượt, đổi vai thì làm lại từ đầu, xong lễ thì người hàng chờ lên', () => {
  const { w, advance, who, of } = setup();
  const steps = config.ceremony.steps;
  w.act(who('Huy'), 'become_groom');
  advance(config.timing.claimMs);
  w.act(who('Lan'), 'become_bride');
  advance(config.timing.claimMs);
  assert.equal(of('ritual').at(-1).step, -1);
  advance(config.ceremony.startDelayMs);
  advance(steps[0].ms);
  assert.equal(of('ritual').at(-1).id, steps[1].id);

  w.act(who('Nam'), 'steal_groom');
  assert.equal(w.ceremony, null);
  advance(config.timing.stealMs);
  const restart = of('ritual').at(-1);
  assert.equal(restart.step, -1);
  assert.equal(restart.restart, true);

  w.act(who('Tú'), 'become_groom');
  assert.deepEqual(w.waitlist.groom.map((p) => p.name), ['Tú']);
  advance(config.ceremony.startDelayMs);
  assert.equal(of('ritual').at(-1).step, 0);
  assert.equal(of('ritual').at(-1).restart, false);
  for (const s of steps) advance(s.ms);
  const farewell = of('scene').at(-1);
  assert.equal(farewell.kind, 'farewell');
  assert.equal(farewell.from.groom.name, 'Nam');
  assert.equal(w.married, 1);
  advance(config.ceremony.farewellMs);
  assert.equal(w.roles.groom.name, 'Tú');
  assert.equal(w.roles.bride, null);
  assert.equal(w.ceremony, null);
});
