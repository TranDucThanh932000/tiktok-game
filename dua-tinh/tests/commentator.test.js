import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Race } from '../src/race.js';
import { Commentator } from '../src/commentator.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const lines = JSON.parse(readFileSync(new URL('../mc.json', import.meta.url), 'utf8'));

// Giọng giả: mẩu nào không nằm trong `missing` coi như đã có sẵn, mỗi mẩu dài 1 giây.
function fakeVoice(missing = new Set()) {
  return {
    enabled: true,
    missing,
    ready: (text) => (missing.has(text) ? null : `id:${text}`),
    clip: (text) => Promise.resolve(missing.has(text) ? null : `id:${text}`),
    duration: () => 1000,
    busy: () => 0,
  };
}

function setup({ missing, options = {}, safe = () => false } = {}) {
  let clock = 1_000_000;
  const said = [];
  const voice = fakeVoice(missing);
  const mc = new Commentator({
    voice,
    lines,
    options: { ...config.voice, talkEverySeconds: [600, 600], ...options },
    emit: (msg) => said.push(msg),
    now: () => clock,
    rng: () => 0.6,
    enabled: () => !safe(),
  });
  const race = new Race(config, { emit: (msg) => mc.onEvent(msg), now: () => clock });
  mc.attach(race);
  return {
    race,
    mc,
    said,
    voice,
    // Chạy đồng hồ từng bước 100 ms như server.
    run(ms) {
      for (let t = 0; t < ms; t += 100) {
        clock += 100;
        mc.tick();
      }
    },
  };
}

const who = (name) => ({ id: `u:${name}`, name });
const texts = (said) => said.filter((m) => m.clips?.length).map((m) => m.text);

test('cảm ơn người gửi quà kèm tên tỉnh, cả combo chỉ cảm ơn một lần', () => {
  const ctx = setup();
  ctx.race.comment(who('Lan'), 'Nam Định');
  for (let i = 0; i < 4; i++) {
    ctx.race.gift(who('Lan'), { name: 'Rose', coins: 1 }, 1);
    ctx.run(500);
  }
  ctx.run(3000);
  const thanks = ctx.said.filter((m) => m.kind === 'thanks');
  assert.equal(thanks.length, 1);
  assert.match(thanks[0].text, /Lan/);
  assert.match(thanks[0].text, /Nam Định/);
  assert.ok(thanks[0].clips.some((c) => c.id === 'id:Nam Định'));
});

test('quà to có lời cảm ơn riêng', () => {
  const ctx = setup();
  ctx.race.comment(who('Lan'), 'Thái Bình');
  ctx.race.gift(who('Lan'), { name: 'Galaxy', coins: 1000 }, 1);
  ctx.run(3000);
  const text = ctx.said.find((m) => m.kind === 'thanks').text;
  assert.ok(lines.thanksBig.some((line) => text === line.replace('{name}', 'Lan').replace('{province}', 'Thái Bình')), text);
});

test('quà khi chưa chọn tỉnh: nhắc bình luận tên tỉnh; chọn tỉnh ngay sau đó thì cảm ơn kèm tỉnh', () => {
  const a = setup();
  a.race.gift(who('Bảo'), { name: 'Lucky Pig', coins: 10 }, 1);
  a.run(3000);
  assert.match(a.said.find((m) => m.kind === 'thanks').text, /Bảo.*bình luận tên tỉnh/i);

  const b = setup();
  b.race.gift(who('Bảo'), { name: 'Lucky Pig', coins: 10 }, 1);
  b.run(1000);
  b.race.comment(who('Bảo'), 'Hà Nội');
  b.run(3000);
  assert.match(b.said.find((m) => m.kind === 'thanks').text, /Bảo.*Hà Nội|Hà Nội.*Bảo/);
});

test('giọng tên chưa kịp có thì chờ có hạn rồi cảm ơn không tên; tên toàn ký hiệu thì không đọc tên', () => {
  const ctx = setup({ missing: new Set(['Lan']) });
  ctx.race.comment(who('Lan'), 'Nam Định');
  ctx.race.gift(who('Lan'), { name: 'Rose', coins: 1 }, 1);
  ctx.run(config.voice.nameWaitMs - 500);
  assert.equal(ctx.said.filter((m) => m.kind === 'thanks').length, 0);
  ctx.run(1500);
  const text = ctx.said.find((m) => m.kind === 'thanks').text;
  assert.doesNotMatch(text, /Lan/);
  assert.match(text, /Nam Định/);

  const odd = setup();
  odd.race.comment({ id: 'u:x', name: '🌸🌸' }, 'Cà Mau');
  odd.race.gift({ id: 'u:x', name: '🌸🌸' }, { name: 'Rose', coins: 1 }, 1);
  odd.run(3000);
  assert.match(odd.said.find((m) => m.kind === 'thanks').text, /^Cảm ơn bạn|Cà Mau vừa được tiếp sức/);
});

test('đổi ngôi đầu: nói ngay, đổi tiếp trong lúc chờ thì chỉ nói tỉnh dẫn đầu cuối cùng', () => {
  const ctx = setup();
  ctx.race.comment(who('A'), 'Nam Định');
  ctx.run(500);
  assert.equal(ctx.said.filter((m) => m.kind === 'lead').length, 1);
  assert.match(ctx.said.find((m) => m.kind === 'lead').text, /Nam Định/);
  ctx.race.comment(who('B'), 'Thái Bình');
  ctx.race.comment(who('C'), 'Thái Bình');
  ctx.run(3000);
  ctx.race.comment(who('D'), 'Hà Nội');
  ctx.race.comment(who('E'), 'Hà Nội');
  ctx.race.comment(who('F'), 'Hà Nội');
  ctx.run(5000);
  assert.equal(ctx.said.filter((m) => m.kind === 'lead').length, 1);
  ctx.run(config.voice.leadGapSeconds * 1000);
  const leads = ctx.said.filter((m) => m.kind === 'lead');
  assert.equal(leads.length, 2);
  assert.match(leads[1].text, /Hà Nội/);
  assert.doesNotMatch(leads[1].text, /Thái Bình/);
});

test('ngôi đầu đổi lại trong lúc MC đang bận thì không đọc thông tin cũ', () => {
  const ctx = setup();
  ctx.race.comment(who('A'), 'Hà Nội');
  ctx.race.comment(who('B'), 'Hà Nội');
  ctx.run(500);
  ctx.run(config.voice.leadGapSeconds * 1000);
  // MC đang cảm ơn quà thì Nam Định vượt lên, rồi Hà Nội giành lại trước khi MC rảnh.
  ctx.race.comment(who('Tặng'), 'Cà Mau');
  ctx.race.gift(who('Tặng'), { name: 'Rose', coins: 1 }, 1);
  ctx.run(2600);
  for (const name of ['C', 'D', 'E']) ctx.race.comment(who(name), 'Nam Định');
  ctx.run(300);
  for (const name of ['F', 'G']) ctx.race.comment(who(name), 'Hà Nội');
  ctx.run(30_000);
  const leads = ctx.said.filter((m) => m.kind === 'lead');
  assert.equal(leads.length, 1, leads.map((m) => m.text).join(' | '));
  assert.match(leads[0].text, /Hà Nội/);
});

test('tỉnh nhảy thẳng lên hạng 1 thì báo ngôi đầu, không báo "vào top 3"', () => {
  const ctx = setup();
  let n = 0;
  for (const [province, count] of [['Hà Nội', 5], ['Nam Định', 4], ['Thái Bình', 3], ['Nghệ An', 2], ['Cà Mau', 1]]) {
    for (let i = 0; i < count; i++) ctx.race.comment(who(`p${n++}`), province);
  }
  ctx.run(500);
  ctx.run(config.voice.leadGapSeconds * 1000);
  ctx.race.gift(who('p14'), { name: 'Lucky Pig', coins: 10 }, 1);
  ctx.run(30_000);
  assert.equal(ctx.said.filter((m) => m.kind === 'rising').length, 0);
  assert.match(ctx.said.filter((m) => m.kind === 'lead').at(-1).text, /Cà Mau/);
});

test('thỉnh thoảng bình luận theo tình hình cuộc đua, không nói chồng câu', () => {
  const ctx = setup({ options: { talkEverySeconds: [30, 30] } });
  for (const [name, province] of [['A', 'Nam Định'], ['B', 'Nam Định'], ['C', 'Thái Bình']]) ctx.race.comment(who(name), province);
  ctx.run(60_000);
  const talks = ctx.said.filter((m) => m.kind === 'talk');
  assert.ok(talks.length >= 1);
  assert.match(talks[0].text, /Nam Định|Thái Bình/);
  const starts = ctx.said.filter((m) => m.clips?.length);
  assert.ok(starts.length <= 3);
});

test('quà dồn dập thì chỉ giữ vài lời cảm ơn, bỏ lời của quà nhỏ nhất', () => {
  const ctx = setup({ options: { maxThanks: 2 } });
  const gifts = [['A', 1], ['B', 10], ['C', 5], ['D', 10]];
  for (const [name] of gifts) ctx.race.comment(who(name), 'Nghệ An');
  for (const [name, coins] of gifts) ctx.race.gift(who(name), { name: '', coins }, 1);
  ctx.run(2600);
  assert.ok(ctx.mc.queue.filter((e) => e.kind === 'thanks').length <= 2);
  ctx.run(60_000);
  const thanked = texts(ctx.said).filter((t) => /Cảm ơn|tiếp sức|cảm ơn/.test(t)).join(' | ');
  assert.doesNotMatch(thanked, /\bA\b/);
});

test('chế độ an toàn: MC im hoàn toàn', () => {
  let safe = true;
  const ctx = setup({ safe: () => safe });
  ctx.race.comment(who('Lan'), 'Nam Định');
  ctx.race.gift(who('Lan'), { name: 'Rose', coins: 1 }, 1);
  ctx.run(10_000);
  assert.equal(texts(ctx.said).length, 0);
  safe = false;
  ctx.mc.stop();
  assert.deepEqual(ctx.said.at(-1), { type: 'say', clips: [], cut: true });
});

test('các mẩu giọng dùng chung gồm tên 63 tỉnh và lời MC, không còn chỗ trống chưa điền', () => {
  const { mc } = setup();
  const parts = mc.staticParts();
  for (const name of ['Nam Định', 'Thái Bình', 'Thành phố Hồ Chí Minh', 'Bà Rịa Vũng Tàu', 'Cảm ơn', 'đã tiếp sức cho']) assert.ok(parts.includes(name), name);
  assert.ok(parts.every((part) => !part.includes('{') && !part.includes('}')));
  assert.ok(parts.length > 63);
});
