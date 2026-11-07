import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROVINCES, BY_ID, findProvince, strip } from '../src/provinces.js';

const map = JSON.parse(readFileSync(new URL('../public/map/vietnam.json', import.meta.url), 'utf8'));
const nameOf = (text) => findProvince(text)?.name ?? null;

test('đủ 63 tỉnh, biển số không trùng, đúng ví dụ Nam Định 18, Thái Bình 17', () => {
  assert.equal(PROVINCES.length, 63);
  assert.equal(new Set(PROVINCES.map((p) => p.id)).size, 63);
  const plates = PROVINCES.flatMap((p) => p.plates);
  assert.equal(new Set(plates).size, plates.length);
  assert.ok(plates.every((n) => Number.isInteger(n) && n >= 11 && n <= 99));
  assert.equal(BY_ID.get('nam-dinh').plates[0], 18);
  assert.equal(BY_ID.get('thai-binh').plates[0], 17);
  assert.equal(BY_ID.get('ha-noi').plates[0], 29);
});

test('nhận tên tỉnh có dấu, không dấu, viết hoa, viết liền, chữ kiểu', () => {
  for (const text of ['Nam Định', 'nam dinh', 'NAM ĐỊNH', 'Nam Đinh', 'namdinh', '#NamDinh', '𝓝𝓪𝓶 Đị𝓷𝓱', 'Ｎａｍ Ｄｉｎｈ', 'nam   định!!!']) {
    assert.equal(nameOf(text), 'Nam Định', text);
  }
});

test('mọi tỉnh đều nhận được bằng tên chính, bỏ dấu và viết liền', () => {
  for (const p of PROVINCES) {
    const bare = strip(p.name).toLowerCase();
    for (const text of [p.name, bare, bare.replace(/[^a-z]/g, ''), `${p.name} đây cả nhà ơi`]) assert.equal(findProvince(text)?.id, p.id, text);
  }
});

test('nhận tên tỉnh trong câu, lấy tỉnh được nhắc đầu tiên', () => {
  assert.equal(nameOf('Thái Bình cố lên'), 'Thái Bình');
  assert.equal(nameOf('anh em Nghệ An đâu rồi'), 'Nghệ An');
  assert.equal(nameOf('Quảng Nam Đà Nẵng'), 'Quảng Nam');
  assert.equal(nameOf('Hà Nam Định'), 'Hà Nam');
});

test('cách gọi khác của chính tỉnh đó', () => {
  const cases = {
    'Sài Gòn': 'TP. Hồ Chí Minh', saigon: 'TP. Hồ Chí Minh', 'TP HCM': 'TP. Hồ Chí Minh', 'Hồ Chí Minh': 'TP. Hồ Chí Minh',
    Huế: 'Thừa Thiên Huế', hue: 'Thừa Thiên Huế', 'Vũng Tàu': 'Bà Rịa - Vũng Tàu', 'Đắc Lắc': 'Đắk Lắk', 'dak lak': 'Đắk Lắk',
    'Bắc Cạn': 'Bắc Kạn', kontum: 'Kon Tum', 'hoà bình': 'Hòa Bình', 'Thanh Hoá': 'Thanh Hóa',
  };
  for (const [text, name] of Object.entries(cases)) assert.equal(nameOf(text), name, text);
});

test('không tính số biển số và không nhầm tên người, chữ viết tắt mơ hồ', () => {
  for (const text of ['18', '18 đây', '29', 'biển 36', 'chị Huệ ơi', 'hn nay mệt quá', 'sg', 'chào cả nhà', 'hello', '', '❤️❤️', '@hanoi_boy chào bạn']) {
    assert.equal(findProvince(text), null, text);
  }
  assert.equal(nameOf('@hanoi_boy Nam Định nè'), 'Nam Định');
});

test('dữ liệu bản đồ khớp 63 tỉnh, tỉnh kề nhau khác màu', () => {
  assert.equal(map.provinces.length, 63);
  const color = new Map(map.provinces.map((p) => [p.id, p.color]));
  for (const p of map.provinces) {
    assert.ok(BY_ID.has(p.id), p.id);
    assert.ok(p.d.startsWith('M') && p.label.length === 2, p.id);
    for (const n of p.neighbors) assert.notEqual(color.get(n), p.color, `${p.id} và ${n} trùng màu`);
  }
  assert.deepEqual(map.archipelagos.map((a) => [a.name, a.province]), [['Hoàng Sa', 'da-nang'], ['Trường Sa', 'khanh-hoa']]);
  assert.ok(BY_ID.get('nam-dinh') && map.provinces.find((p) => p.id === 'nam-dinh').neighbors.includes('thai-binh'));
});
