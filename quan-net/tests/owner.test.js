import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OwnerVoice } from '../src/owner.js';

const lines = JSON.parse(readFileSync(new URL('../lines.json', import.meta.url), 'utf8'));

// Giọng giả: mẩu nào cũng có ngay, dài 1 giây.
function fakeVoice({ enabled = true, missing = [] } = {}) {
  const asked = [];
  return {
    enabled,
    asked,
    clip(text) {
      asked.push(text);
      return Promise.resolve(missing.includes(text) ? null : `id:${text}`);
    },
    duration: () => 1000,
  };
}

function setup(options) {
  let t = 1000;
  const said = [];
  const voice = fakeVoice(options);
  let safe = false;
  const owner = new OwnerVoice({ voice, lines, emit: (msg) => said.push(msg), now: () => t, enabled: () => !safe });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return { owner, said, voice, flush, advance: (ms) => (t += ms), safeMode: (on) => (safe = on) };
}

const line = (template, vars, priority = 1) => ({ type: 'say', template, vars, text: template.replace(/\{(\w+)\}/g, (_, k) => vars[k]), mood: 'thuong', priority });

test('câu mẫu tách ở chỗ tên, số phút điền thẳng vào lời; tên không đọc được thì gọi "bạn"', () => {
  const { owner } = setup();
  assert.deepEqual(owner.fill('Ghi sổ {name} thêm {minutes} phút!', { name: 'Lan Anh', minutes: 30 }), ['Ghi sổ', 'Lan Anh', 'thêm 30 phút!']);
  assert.deepEqual(owner.fill('{name} ơi, hết giờ rồi con!', { name: '🔥🔥' }), ['bạn', 'ơi, hết giờ rồi con!']);
  assert.deepEqual(owner.fill('{name} buzz {target} kìa!', { name: 'An', target: 'Bình' }), ['An', 'bớt', 'Bình', 'kìa!']);
});

test('đọc đúng tên game, lệnh, số máy VIP và chữ tiếng Anh; chữ trên màn hình không đổi', () => {
  const { owner } = setup();
  assert.deepEqual(owner.fill('Giờ vàng {game}! Chơi {game} được x2, gõ {code}!', { game: 'Audition', code: 'au' }), ['Giờ vàng Au đi sần! Chơi Au đi sần được gấp đôi, gõ au!']);
  assert.deepEqual(owner.fill('Bye {name}, về sớm kẻo mẹ la!', { name: 'An' }), ['Bai', 'An', 'về sớm kẻo mẹ la!']);
  assert.equal(owner.value('seat', 'V2'), 'víp 2');
  assert.equal(owner.value('seat', '7'), '7');
});

test('mẩu tạo sẵn: mọi lời cố định, câu có giá trị hay gặp; không có lời của mẹ, không có câu còn số chưa biết', () => {
  const { owner } = setup();
  const parts = owner.staticParts({ golden: [{ game: 'Võ Lâm', code: 'volam' }], gift: [{ minutes: 30 }] });
  assert.ok(parts.includes('vô chơi đi con!'));
  assert.ok(parts.includes('Tiệm mở thâu đêm nha mấy đứa!'));
  assert.ok(parts.includes('nạp thêm 30 phút nha!'));
  assert.ok(parts.some((part) => part.startsWith('Giờ vàng Võ Lâm')));
  assert.ok(!parts.some((part) => /về ăn cơm|Đâu mất rồi/.test(part)), 'lời của mẹ để mẹ nói');
  assert.ok(!parts.some((part) => /\{|\}/.test(part)), 'không còn chỗ trống');
  assert.ok(!parts.some((part) => /^còn \d/.test(part)), 'giờ còn lại tạo khi cần');
});

test('nói: phát các mẩu kèm chữ; giọng tắt hoặc chế độ an toàn thì chỉ hiện chữ', async () => {
  const { owner, said, flush, safeMode } = setup();
  owner.say(line('Mời {name} vô máy!', { name: 'An' }));
  await flush();
  assert.deepEqual(said[0].clips, [{ id: 'id:Mời' }, { id: 'id:An' }, { id: 'id:vô máy!' }]);
  assert.equal(said[0].text, 'Mời An vô máy!');
  assert.equal(said[0].ms, 3 * 800);
  safeMode(true);
  owner.stop();
  owner.say(line('Mời {name} vô máy!', { name: 'Bình' }, 3));
  await flush();
  assert.deepEqual(said.at(-1).clips, []);
  assert.equal(said.at(-1).text, 'Mời Bình vô máy!');
});

test('đang nói thì câu ngang hàng chờ nói xong mới tới (giữ câu mới nhất); câu quan trọng hơn cắt ngang', async () => {
  const { owner, said, flush, advance } = setup();
  owner.say(line('{name} hết giờ rồi nha!', { name: 'An' }));
  await flush();
  owner.say(line('Mời {name} vô máy!', { name: 'Bình' }));
  owner.say(line('Mời {name} vô máy!', { name: 'Chi' }));
  await flush();
  assert.equal(said.length, 1);
  owner.tick();
  await flush();
  assert.equal(said.length, 1, 'chưa nói xong câu trước');
  advance(2000);
  owner.tick();
  await flush();
  assert.equal(said.length, 2);
  assert.equal(said[1].text, 'Mời Chi vô máy!', 'chỉ giữ câu mới nhất');
  owner.say(line('Trời ơi, lại cúp điện!', {}, 2));
  await flush();
  assert.equal(said.length, 3);
  assert.equal(said[2].cut, true);
});

test('thiếu mẩu (Vbee lỗi) thì chỉ hiện chữ, không đọc hụt', async () => {
  const { owner, said, flush } = setup({ missing: ['An'] });
  owner.say(line('Mời {name} vô máy!', { name: 'An' }));
  await flush();
  assert.deepEqual(said[0].clips, []);
  assert.equal(said[0].text, 'Mời An vô máy!');
});
