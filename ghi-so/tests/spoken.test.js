import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readableName } from '../src/spoken.js';

const people = JSON.parse(readFileSync(new URL('../demo-people.json', import.meta.url), 'utf8'));

test('tên tiếng Việt bình thường giữ nguyên, chỉ bỏ biểu tượng', () => {
  assert.equal(readableName('Nguyễn Văn Thịnh'), 'Nguyễn Văn Thịnh');
  assert.equal(readableName('Thỏ Trắng 🐰'), 'Thỏ Trắng');
  assert.equal(readableName('Lan ✿ Anh'), 'Lan Anh');
});

test('chữ hoa mỹ được đưa về chữ thường dùng', () => {
  assert.equal(readableName('𝓣𝓱𝓪𝓷𝓱 ✿'), 'Thanh');
  assert.equal(readableName('ＬＡＮ　ＡＮＨ'), 'Lan Anh');
  assert.equal(readableName('ᴛʜᴀɴʜ ʟᴀᴍ'), 'thanh lam');
  assert.equal(readableName('LAN ANH'), 'Lan Anh');
});

test('dấu tiếng Việt viết rời được ghép lại', () => {
  assert.equal(readableName('Nguyễn'.normalize('NFD')), 'Nguyễn');
});

test('bỏ số và phần dính sau số', () => {
  assert.equal(readableName('Hùng 1995'), 'Hùng');
  assert.equal(readableName('bé Na 2k5'), 'bé Na');
  assert.equal(readableName('09xx.Thanh'), 'Thanh');
});

test('không đọc được thì trả về rỗng để nơi gọi đọc "quý khách"', () => {
  for (const name of ['🌸🌸🌸', '1995', 'nguyenhoang_88', 'phamngoc2003', 'Ꮇinh Ꭲú', '小明', '___', '']) {
    assert.equal(readableName(name), '', name);
  }
});

test('từ đọc được vẫn giữ khi đứng cạnh từ không đọc được', () => {
  assert.equal(readableName('Christopher Nam'), 'Nam');
  assert.equal(readableName('小明 Lan'), 'Lan');
});

test('cả 100 người đều có chữ đọc được, không có số hay ký hiệu', () => {
  for (const person of people) {
    const text = person.spoken ?? readableName(person.name);
    assert.ok(text, person.name);
    assert.ok(/^[\p{L}\s]+$/u.test(text), `${person.name} -> ${text}`);
  }
  assert.equal(people.filter((person) => person.spoken).length, 10);
});

test('tên kiểu tài khoản giữ nguyên trên giấy, chỉ đổi chữ để đọc', () => {
  const person = people.find((row) => row.name === 'nguyenhoang_88');
  assert.equal(person.spoken, 'Nguyễn Hoàng');
});
