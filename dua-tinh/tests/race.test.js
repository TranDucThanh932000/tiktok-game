import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Race } from '../src/race.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

function setup(overrides = {}) {
  let clock = 1_000_000;
  const events = [];
  const race = new Race({ ...config, ...overrides }, { emit: (msg) => events.push(msg), now: () => clock });
  return {
    race,
    events,
    advance(ms) {
      clock += ms;
    },
    last: (type) => events.filter((e) => e.type === type).at(-1),
    all: (type) => events.filter((e) => e.type === type),
  };
}

const who = (name) => ({ id: `u:${name}`, name, avatar: '' });
const score = (race, id) => race.tally.get(id).score;

test('comment tên tỉnh +1, mỗi người chỉ tính một lần và không đổi được tỉnh', () => {
  const { race, all } = setup();
  assert.equal(race.comment(who('Lan'), 'Nam Định')?.id, 'nam-dinh');
  assert.equal(race.comment(who('Lan'), 'Nam Định'), null);
  assert.equal(race.comment(who('Lan'), 'Thái Bình'), null);
  race.comment(who('Huy'), 'nam dinh day');
  assert.equal(score(race, 'nam-dinh'), 2);
  assert.equal(score(race, 'thai-binh'), 0);
  assert.equal(race.provinceOf('u:Lan'), 'nam-dinh');
  assert.equal(all('join').length, 2);
  assert.equal(race.members.size, 2);
});

test('comment không có tên tỉnh thì bỏ qua và vẫn được comment tên tỉnh sau đó', () => {
  const { race } = setup();
  assert.equal(race.comment(who('Mai'), 'chào cả nhà'), null);
  assert.equal(race.comment(who('Mai'), '18'), null);
  assert.equal(race.members.size, 0);
  assert.equal(race.comment(who('Mai'), 'Thái Bình')?.id, 'thai-binh');
});

test('quà: hoa hồng +1, bắn tim +5, heo may mắn +10, combo nhân theo số lượng', () => {
  const { race, last } = setup();
  race.comment(who('Lan'), 'Nam Định');
  race.gift(who('Lan'), { name: 'Rose', coins: 1 }, 1);
  assert.equal(score(race, 'nam-dinh'), 2);
  race.gift(who('Lan'), { name: 'Finger Heart', coins: 5 }, 1);
  assert.equal(score(race, 'nam-dinh'), 7);
  race.gift(who('Lan'), { name: 'Lucky Pig', coins: 10 }, 3);
  assert.equal(score(race, 'nam-dinh'), 37);
  assert.deepEqual([last('gift').points, last('gift').icon], [30, '/gifts/lucky-pig.webp']);
  assert.equal(race.tally.get('nam-dinh').people, 1);
  assert.equal(race.tally.get('nam-dinh').gift, 36);
});

test('quà khác tính theo số xu, quà thử chỉ có số xu thì khớp theo bảng quà', () => {
  const { race, last } = setup();
  race.comment(who('Lan'), 'Hà Nội');
  race.gift(who('Lan'), { name: 'Galaxy', coins: 1000 }, 1);
  assert.equal(score(race, 'ha-noi'), 1001);
  assert.equal(last('gift').icon, '');
  race.gift(who('Lan'), { name: '', coins: 5 }, 2);
  assert.equal(last('gift').points, 10);
  assert.equal(last('gift').icon, '/gifts/finger-heart.webp');
  assert.equal(setup({ pointsPerCoin: 2 }).race.giftInfo({ name: 'Galaxy', coins: 1000 }).points, 2000);
});

test('quà gửi trước khi chọn tỉnh được giữ, comment tên tỉnh thì cộng vào', () => {
  const { race, last } = setup();
  race.gift(who('Bảo'), { name: 'Lucky Pig', coins: 10 }, 1);
  race.gift(who('Bảo'), { name: 'Rose', coins: 1 }, 2);
  assert.equal(last('pending').held, 12);
  assert.equal(race.ranking().length, 0);
  race.comment(who('Bảo'), 'Thái Bình');
  assert.equal(score(race, 'thai-binh'), 13);
  assert.deepEqual([last('join').points, last('join').held], [13, 12]);
  assert.equal(race.pending.size, 0);
});

test('bảng xếp hạng: bằng điểm thì tỉnh đạt trước đứng trên, chỉ báo đổi ngôi đầu khi vượt hẳn', () => {
  const ctx = setup();
  const { race, all } = ctx;
  race.comment(who('A'), 'Nam Định');
  ctx.advance(1000);
  race.comment(who('B'), 'Thái Bình');
  assert.deepEqual(race.ranking().map((r) => r.id), ['nam-dinh', 'thai-binh']);
  assert.equal(all('lead').length, 1);
  assert.equal(race.leader, 'nam-dinh');
  ctx.advance(1000);
  race.comment(who('C'), 'Thái Bình');
  assert.equal(race.leader, 'thai-binh');
  assert.deepEqual(all('lead').map((e) => [e.province, e.previous]), [['nam-dinh', null], ['thai-binh', 'nam-dinh']]);
  assert.equal(race.rankOf('nam-dinh'), 2);
});

test('tin tới cùng một mili giây (cùng một gói TikTok) vẫn xếp đúng ai tới trước', () => {
  const { race, all } = setup();
  race.comment(who('A'), 'Thanh Hóa');
  race.comment(who('B'), 'Hà Nội');
  race.comment(who('C'), 'Nam Định');
  assert.deepEqual(race.ranking().map((r) => r.id), ['thanh-hoa', 'ha-noi', 'nam-dinh']);
  assert.deepEqual(all('lead').map((e) => e.province), ['thanh-hoa']);
  // Nạp lại rồi chơi tiếp trong cùng mili giây: thứ tự vẫn nối tiếp sau các mốc đã lưu.
  const copy = setup().race;
  copy.importState(JSON.parse(JSON.stringify(race.exportState())));
  copy.comment(who('D'), 'Hà Nội');
  copy.comment(who('E'), 'Thanh Hóa');
  assert.deepEqual(copy.ranking().slice(0, 2).map((r) => r.id), ['ha-noi', 'thanh-hoa']);
});

test('thả tim chỉ tính người đã có tỉnh và không dồn dập', () => {
  const ctx = setup();
  const { race, all } = ctx;
  race.like(who('Lạ'), 5);
  assert.equal(all('like').length, 0);
  race.comment(who('Lan'), 'Huế');
  race.like(who('Lan'), 5);
  race.like(who('Lan'), 5);
  assert.equal(all('like').length, 1);
  assert.equal(all('like')[0].province, 'thua-thien-hue');
  ctx.advance(300);
  race.like(who('Lan'), 1);
  assert.equal(all('like').length, 2);
  assert.equal(score(race, 'thua-thien-hue'), 1);
});

test('vòng mới xóa hết điểm và danh sách người đã điểm danh', () => {
  const { race, last } = setup();
  race.comment(who('Lan'), 'Nam Định');
  race.gift(who('Khách'), { name: 'Rose', coins: 1 }, 1);
  race.reset();
  assert.equal(race.ranking().length, 0);
  assert.equal(race.members.size, 0);
  assert.equal(race.pending.size, 0);
  assert.equal(last('reset').race.tally.length, 0);
  assert.equal(race.comment(who('Lan'), 'Thái Bình')?.id, 'thai-binh');
});

test('lưu và nạp lại giữ nguyên điểm, người đã điểm danh, quà đang giữ', () => {
  const { race } = setup();
  race.comment(who('Lan'), 'Nam Định');
  race.gift(who('Lan'), { name: 'Lucky Pig', coins: 10 }, 1);
  race.comment(who('Huy'), 'Thái Bình');
  race.gift(who('Khách'), { name: 'Finger Heart', coins: 5 }, 1);
  const saved = JSON.parse(JSON.stringify(race.exportState()));
  const copy = setup().race;
  copy.importState(saved);
  assert.deepEqual(copy.ranking(), race.ranking());
  assert.equal(copy.leader, 'nam-dinh');
  assert.equal(copy.comment(who('Lan'), 'Hà Nội'), null);
  copy.comment(who('Khách'), 'Hà Nội');
  assert.equal(score(copy, 'ha-noi'), 6);
});
