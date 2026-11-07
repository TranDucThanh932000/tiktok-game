import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, PHASE, DECIDE_MS } from '../src/game.js';
import { GiftCatalog } from '../src/gifts.js';
import { normalize, safeName, safeShare, spokenName } from '../src/text.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
config.demo.enabled = false; // Cặp diễn mẫu có file test riêng.
const ROSE = { name: 'Rose', coins: 1 };
const HEART = { name: 'Finger Heart', coins: 5 };
const BOX = { name: 'Gift Box', coins: 100 };
const PIG = { name: 'Lucky Pig', coins: 10 };
const CLOVER = { name: 'Clover', coins: 10 };

function setup() {
  const clock = { t: 1_000_000 };
  const events = [];
  const scenes = [];
  const director = { busy: false, scene: (name) => scenes.push(name), sceneBusy() { return this.busy; }, onEvent() {}, stop() {} };
  const game = new Game({ config, catalog: new GiftCatalog(config.gifts), director, emit: (m) => events.push(m), now: () => clock.t });
  const u = (id) => ({ id, name: `Tên ${id}`, avatar: '' });
  const run = (ms) => {
    const end = clock.t + ms;
    while (clock.t < end) {
      clock.t = Math.min(end, clock.t + 100);
      game.tick();
    }
  };
  const seat = (m = 'nam', f = 'nu') => {
    game.gift({ user: u(m), gift: PIG });
    game.gift({ user: u(f), gift: CLOVER });
    game.tick();
    return game.pair;
  };
  const toPhase = (phase) => {
    for (let i = 0; i < 2000 && game.phase !== phase; i++) run(100);
    assert.equal(game.phase, phase);
  };
  const say = (id, text, eventId) => game.comment({ user: u(id), text, eventId });
  return { game, clock, events, scenes, director, u, run, seat, toPhase, say };
}

test('chuẩn hóa: chữ hoa, khoảng trắng, Unicode tổ hợp', () => {
  assert.equal(normalize('  ĐẸP   ĐÔI '), 'đẹp đôi');
  assert.equal(normalize('đẹp đôi'.normalize('NFD')), 'đẹp đôi');
  assert.equal(normalize('Không  Đồng Ý'), 'không đồng ý');
});

test('hàng chờ: thứ tự đăng ký, không thêm suất, không đứng hai hàng', () => {
  const { game, u, events } = setup();
  game.gift({ user: u('a'), gift: PIG });
  game.gift({ user: u('b'), gift: PIG });
  game.gift({ user: u('a'), gift: PIG });
  game.gift({ user: u('a'), gift: CLOVER });
  assert.deepEqual(game.queues.male.map((v) => v.id), ['a', 'b']);
  assert.equal(game.queues.female.length, 0);
  const cards = events.filter((m) => m.type === 'card').map((m) => [m.kind, m.position]);
  assert.deepEqual(cards, [['queued', 1], ['queued', 2], ['already', 1], ['other', 1]]);
});

test('rời hàng khi đang đợi thì hủy đăng ký; không cần gửi lại mới đăng ký lại được', () => {
  const { game, u, say } = setup();
  game.gift({ user: u('a'), gift: PIG });
  say('a', 'Rời Hàng');
  assert.equal(game.queues.male.length, 0);
  game.gift({ user: u('a'), gift: CLOVER });
  assert.equal(game.queues.female[0].id, 'a');
});

test('vào phòng không đồng nghĩa đăng ký, gửi lại sự kiện không tạo thêm người', () => {
  const { game, u, events } = setup();
  game.join(u('x'));
  game.join(u('x'));
  game.comment({ user: u('x'), text: 'xin chào' });
  assert.equal(events.filter((m) => m.type === 'viewer-in').length, 1);
  assert.equal(game.queues.male.length + game.queues.female.length, 0);
});

test('avatar: giữ theo tài khoản, sự kiện sau mới có ảnh thì cập nhật, không tạo thêm người', () => {
  const { game, events, seat } = setup();
  game.join({ id: 'x', name: 'Lan' });
  game.comment({ user: { id: 'x', name: 'Lan', avatar: 'https://cdn/a.jpg' }, text: 'chào' });
  game.comment({ user: { id: 'x', name: 'Lan', avatar: 'https://cdn/b.jpg' }, text: 'chào' });
  assert.equal(events.filter((m) => m.type === 'viewer-in').length, 1);
  const updates = events.filter((m) => m.type === 'viewer-update');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].viewer.avatar, 'https://cdn/a.jpg');
  game.gift({ user: { id: 'x', name: 'Lan' }, gift: PIG });
  game.gift({ user: { id: 'y', name: 'Hà', avatar: 'https://cdn/y.jpg' }, gift: CLOVER });
  game.tick();
  assert.equal(game.snapshot().pair.male.avatar, 'https://cdn/a.jpg');
  assert.equal(game.snapshot().pair.female.avatar, 'https://cdn/y.jpg');
  void seat;
});

test('quà ngoài danh mục giữ ảnh TikTok gửi kèm để hiện đúng icon', () => {
  const { game, u, seat, events } = setup();
  seat();
  game.gift({ user: u('v'), gift: { name: 'Quà khác', coins: 3, image: 'https://cdn/g.png' } });
  const sent = events.filter((m) => m.type === 'gift').at(-1);
  assert.equal(sent.image, 'https://cdn/g.png');
  assert.equal(sent.key, 'other');
});

test('quà trong lúc có cặp mang theo lời chúc, lúc sân khấu trống thì không', () => {
  const { game, u, seat, events } = setup();
  game.gift({ user: u('v'), gift: ROSE });
  assert.equal(events.filter((m) => m.type === 'gift').at(-1).wish, '');
  seat();
  game.gift({ user: u('v'), gift: ROSE });
  assert.ok(config.giftWishes.rose.includes(events.filter((m) => m.type === 'gift').at(-1).wish));
  game.gift({ user: u('v'), gift: { name: 'Quà khác', coins: 3 } });
  assert.ok(config.giftWishes.other.includes(events.filter((m) => m.type === 'gift').at(-1).wish));
});

test('vào LIVE thật: xóa người giả, người thật không bị ghép với bot', () => {
  const { game, u, events } = setup();
  game.gift({ user: u('sim:Bot Nam'), gift: PIG });
  game.gift({ user: u('sim:Bot Nam 2'), gift: PIG });
  game.gift({ user: u('that-1'), gift: PIG });
  game.join(u('sim:Khách'));
  game.purgeSimulated();
  assert.deepEqual(game.queues.male.map((v) => v.id), ['that-1']);
  assert.ok(![...game.viewers.keys()].some((id) => id.startsWith('sim:')));
  assert.equal(events.filter((m) => m.type === 'viewer-out').length, 3);
  game.gift({ user: u('that-2'), gift: CLOVER });
  game.tick();
  assert.equal(game.pair.male.id, 'that-1');
  assert.equal(game.pair.female.id, 'that-2');
});

test('bot đang trên sân khấu lúc vào LIVE: rời sân khấu, người thật cùng cặp giữ chỗ đầu hàng', () => {
  const { game, u, seat } = setup();
  game.gift({ user: u('sim:Bot'), gift: PIG });
  game.gift({ user: u('that'), gift: CLOVER });
  game.tick();
  assert.equal(game.pair.male.id, 'sim:Bot');
  game.purgeSimulated();
  assert.equal(game.pair, null);
  assert.equal(game.phase, PHASE.WAITING);
  assert.equal(game.queues.female[0].id, 'that');
  assert.equal(game.queues.male.length, 0);
  void seat;
});

test('xóa người giả không đụng tới lịch sử và hàng chờ của người thật', () => {
  const { game, u, seat, toPhase } = setup();
  seat('nam', 'nu');
  toPhase(PHASE.RESULT);
  toPhase(PHASE.WAITING);
  game.gift({ user: u('sim:Bot'), gift: PIG });
  game.purgeSimulated();
  assert.equal(game.history.length, 1);
  assert.equal(game.viewers.has('nam'), true);
  assert.equal(game.queues.male.length, 0);
});

test('đủ hai hàng thì mời ngay một cặp; người khác chờ, không chen ngang', () => {
  const { game, u, seat } = setup();
  const pair = seat();
  assert.equal(game.phase, PHASE.INVITE);
  assert.equal(pair.no, 1);
  assert.equal(pair.male.id, 'nam');
  assert.equal(pair.female.id, 'nu');
  game.gift({ user: u('c'), gift: PIG });
  game.gift({ user: u('d'), gift: CLOVER });
  game.tick();
  assert.equal(game.pair, pair);
  assert.equal(game.queues.male.length, 1);
});

test('điểm: ví dụ 7 bình luận + 3 Hoa hồng + 2 Bắn tim + 1 Hộp quà = 120', () => {
  const { game, u, seat, say } = setup();
  seat();
  for (let i = 0; i < 7; i++) say('v', 'đẹp đôi', `c${i}`);
  game.gift({ user: u('v'), gift: ROSE, repeatCount: 3 });
  game.gift({ user: u('v'), gift: HEART, repeatCount: 2 });
  game.gift({ user: u('v'), gift: BOX });
  assert.equal(game.pair.score, 120);
});

test('bình luận phải khớp toàn câu; cùng một người nhiều bình luận vẫn tính từng cái', () => {
  const { game, seat, say } = setup();
  seat();
  say('v', 'đẹp đôi đẹp đôi');
  say('v', 'hai bạn đẹp đôi quá');
  assert.equal(game.pair.score, 0);
  for (let i = 0; i < 10; i++) say('v', 'đẹp đôi', `x${i}`);
  assert.equal(game.pair.score, 10);
});

test('sự kiện gửi lại chỉ tính một lần', () => {
  const { game, u, seat, say } = setup();
  seat();
  say('v', 'đẹp đôi', 'same');
  say('v', 'đẹp đôi', 'same');
  game.gift({ eventId: 'g1', user: u('v'), gift: HEART });
  game.gift({ eventId: 'g1', user: u('v'), gift: HEART });
  assert.equal(game.pair.score, 6);
});

test('combo báo lũy kế 1→2→3 chỉ cộng phần mới tăng: tổng 15', () => {
  const { game, u, seat } = setup();
  seat();
  for (const repeatCount of [1, 2, 3]) game.gift({ user: u('v'), gift: HEART, combo: true, groupId: 'g', repeatCount });
  game.gift({ user: u('v'), gift: HEART, combo: true, groupId: 'g', repeatCount: 3, repeatEnd: true });
  assert.equal(game.pair.score, 15);
});

test('tương tác lúc chưa có cặp không cộng ngầm sang cặp sau', () => {
  const { game, u, seat, say } = setup();
  say('v', 'đẹp đôi');
  game.gift({ user: u('v'), gift: BOX });
  const pair = seat();
  assert.equal(pair.score, 0);
});

test('quà đăng ký trước khi có cặp không hồi tố; gửi trong cửa điểm thì vừa cộng điểm vừa đăng ký lượt sau', () => {
  const { game, u, seat } = setup();
  const pair = seat();
  assert.equal(pair.score, 0);
  game.gift({ user: u('c'), gift: PIG });
  assert.equal(pair.score, 10);
  assert.equal(game.queues.male[0].id, 'c');
});

test('người trên sân khấu gửi Heo/Cỏ: cộng điểm cặp nhưng không xếp thêm lượt', () => {
  const { game, u, seat } = setup();
  const pair = seat();
  game.gift({ user: u('nam'), gift: PIG });
  game.gift({ user: u('nam'), gift: CLOVER });
  assert.equal(pair.score, 20);
  assert.equal(game.queues.male.length + game.queues.female.length, 0);
});

test('combo kéo dài qua hai lượt không chuyển sang cặp mới', () => {
  const { game, u, seat, toPhase } = setup();
  const first = seat();
  game.gift({ user: u('v'), gift: HEART, combo: true, groupId: 'g', repeatCount: 1 });
  assert.equal(first.score, 5);
  toPhase(PHASE.RESULT);
  game.gift({ user: u('n2'), gift: PIG });
  game.gift({ user: u('f2'), gift: CLOVER });
  const firstFinal = first.score;
  toPhase(PHASE.INVITE);
  const second = game.pair;
  assert.notEqual(second, first);
  game.gift({ user: u('v'), gift: HEART, combo: true, groupId: 'g', repeatCount: 2 });
  assert.equal(second.score, 0);
  assert.equal(first.score, firstFinal);
});

test('quà chưa rõ giá: chờ xác minh, ghi TẠM TÍNH, đối soát đúng cặp đã gắn', () => {
  const { game, u, seat, toPhase, events } = setup();
  const first = seat();
  game.gift({ user: u('v'), gift: { name: 'Quà lạ' } });
  assert.equal(first.score, 0);
  assert.equal(first.pendingCount, 1);
  assert.equal(events.filter((m) => m.type === 'gift').at(-1).state, 'pending');
  game.gift({ user: u('n2'), gift: PIG });
  game.gift({ user: u('f2'), gift: CLOVER });
  toPhase(PHASE.RESULT);
  toPhase(PHASE.INVITE);
  const second = game.pair;
  const { id } = game.pending[0];
  assert.ok(game.reconcile(id, 50));
  assert.equal(second.score, 0);
  assert.equal(game.history.find((row) => row.id === first.id).score, 20 + 50);
  assert.equal(first.pendingCount, 0);
});

test('mốc điểm báo một lần; vượt nhiều mốc một lúc chỉ báo mốc cao nhất', () => {
  const { game, u, seat, events } = setup();
  seat();
  for (let i = 0; i < 6; i++) game.gift({ user: u('v'), gift: BOX });
  game.gift({ user: u('v'), gift: { name: 'Lớn', coins: 900 } });
  const marks = events.filter((m) => m.type === 'milestone').map((m) => m.mark);
  assert.deepEqual(marks, [100, 500, 1000]);
  const b = setup();
  b.seat();
  b.game.gift({ user: b.u('v'), gift: { name: 'Lớn', coins: 1200 } });
  assert.deepEqual(b.events.filter((m) => m.type === 'milestone').map((m) => m.mark), [1000]);
});

test('hướng dẫn phải đọc xong mới mở đồng hồ', () => {
  const { game, director, seat, toPhase, run } = setup();
  seat();
  toPhase(PHASE.GUIDE);
  director.busy = true;
  run(60_000);
  assert.equal(game.phase, PHASE.GUIDE);
  director.busy = false;
  run(200);
  assert.equal(game.phase, PHASE.DECIDE);
});

test('cửa quyết định đúng 10 giây: mốc đóng là muộn, đổi ý tính lần cuối, không mở sớm', () => {
  const { game, clock, events, seat, toPhase, say } = setup();
  const pair = seat();
  say('nam', 'đồng ý');
  assert.equal(pair.choices.male, null, 'trước khi mở chuông không nhận');
  assert.equal(events.at(-1).note ?? events.findLast((m) => m.type === 'choice-note').note, 'early');
  toPhase(PHASE.DECIDE);
  const open = game.deadline - DECIDE_MS;
  assert.ok(clock.t >= open);
  say('nam', 'đồng ý');
  say('nu', 'đồng ý');
  say('nam', 'không đồng ý');
  say('nam', 'đồng ý');
  game.tick();
  assert.equal(game.phase, PHASE.DECIDE, 'cả hai trả lời sớm vẫn chờ đủ giờ');
  clock.t = game.deadline - 1;
  say('nu', 'không đồng ý');
  assert.equal(pair.choices.female, 'no');
  clock.t = game.deadline;
  say('nu', 'đồng ý');
  assert.equal(pair.choices.female, 'no', 'đúng mốc đóng là không hợp lệ');
  assert.equal(events.findLast((m) => m.type === 'choice-note').note, 'late');
  game.tick();
  assert.equal(game.phase, PHASE.RESULT);
  assert.equal(pair.result, 'mismatch');
});

test('không đồng ý không bao giờ thành đồng ý; người ngoài cặp không thay được lựa chọn', () => {
  const { game, seat, toPhase, say } = setup();
  const pair = seat();
  toPhase(PHASE.DECIDE);
  say('nam', 'KHÔNG  ĐỒNG Ý');
  say('nguoi-ngoai', 'đồng ý');
  say('nu', 'tôi đồng ý');
  assert.equal(pair.choices.male, 'no');
  assert.equal(pair.choices.female, null, 'phải khớp toàn câu');
});

test('đủ các nhánh kết quả', () => {
  const cases = [
    ['đồng ý', 'đồng ý', 'matched'],
    ['đồng ý', 'không đồng ý', 'mismatch'],
    ['không đồng ý', 'đồng ý', 'mismatch'],
    ['không đồng ý', 'không đồng ý', 'mismatch'],
    ['đồng ý', null, 'noresponse'],
    [null, 'không đồng ý', 'noresponse'],
    [null, null, 'noresponse'],
  ];
  for (const [m, f, expected] of cases) {
    const { game, seat, toPhase, say, clock, scenes } = setup();
    const pair = seat();
    toPhase(PHASE.DECIDE);
    if (m) say('nam', m);
    if (f) say('nu', f);
    clock.t = game.deadline;
    game.tick();
    assert.equal(pair.result, expected);
    assert.equal(scenes.at(-1), expected);
  }
});

test('lựa chọn không lộ ra trước khi khóa, cả với bảng điều khiển', () => {
  const { game, clock, seat, toPhase, say } = setup();
  seat();
  toPhase(PHASE.DECIDE);
  say('nam', 'không đồng ý');
  const view = game.snapshot().pair;
  assert.equal(view.choices, null);
  assert.deepEqual(view.chosen, { male: true, female: false });
  assert.ok(!/:"(no|yes)"/.test(JSON.stringify(game.snapshot())));
  clock.t = game.deadline;
  game.tick();
  assert.deepEqual(game.snapshot().pair.choices, { male: 'no', female: null });
});

test('quà lớn không đổi kết quả', () => {
  const { game, u, seat, toPhase, say, clock } = setup();
  const pair = seat();
  toPhase(PHASE.DECIDE);
  say('nam', 'không đồng ý');
  say('nu', 'đồng ý');
  game.gift({ user: u('v'), gift: { name: 'Lớn', coins: 50_000 } });
  clock.t = game.deadline;
  game.tick();
  assert.equal(pair.result, 'mismatch');
});

test('điểm vẫn nhận trong phần kết quả, khóa khi chuyển cặp; hết lượt không tự vào lại hàng', () => {
  const { game, u, seat, toPhase, say, run } = setup();
  const pair = seat();
  toPhase(PHASE.RESULT);
  say('v', 'đẹp đôi');
  assert.equal(pair.score, 1);
  run(config.timing.resultSeconds * 1000 + 100);
  assert.equal(game.phase, PHASE.TRANSITION);
  say('v', 'đẹp đôi');
  game.gift({ user: u('v'), gift: BOX });
  assert.equal(pair.score, 1);
  run(config.timing.transitionSeconds * 1000 + 100);
  assert.equal(game.phase, PHASE.WAITING);
  assert.equal(game.pair, null);
  assert.equal(game.queues.male.length + game.queues.female.length, 0);
});

test('thời lượng phần kết quả không kéo dài theo quà', () => {
  const { game, u, seat, toPhase, run } = setup();
  seat();
  toPhase(PHASE.RESULT);
  for (let i = 0; i < 149; i++) {
    game.gift({ user: u('v'), gift: BOX });
    run(100);
  }
  assert.equal(game.phase, PHASE.RESULT);
  run(200);
  assert.equal(game.phase, PHASE.TRANSITION);
});

test('rút lui trên sân khấu: dừng ngay, đóng điểm, không công bố lựa chọn, cặp sau lên', () => {
  const { game, u, seat, toPhase, say, run, scenes } = setup();
  const pair = seat();
  toPhase(PHASE.DECIDE);
  say('nu', 'đồng ý');
  say('nam', 'rời hàng');
  assert.equal(game.phase, PHASE.RESULT);
  assert.equal(pair.result, 'withdrawn');
  assert.equal(scenes.at(-1), 'withdrawn');
  assert.equal(game.snapshot().pair.choices, null);
  say('v', 'đẹp đôi');
  assert.equal(pair.score, 0);
  game.gift({ user: u('n2'), gift: PIG });
  game.gift({ user: u('f2'), gift: CLOVER });
  run((config.timing.stoppedSeconds + config.timing.transitionSeconds) * 1000 + 300);
  assert.equal(game.phase, PHASE.INVITE);
  assert.equal(game.pair.no, 2);
  assert.equal(game.pair.score, 0);
});

test('mất kết nối: hủy lượt, giữ điểm để đối soát; xác nhận lại mở lượt mới với 10 giây mới và điểm 0', () => {
  const { game, seat, toPhase, say, clock } = setup();
  const pair = seat();
  say('v', 'đẹp đôi');
  toPhase(PHASE.DECIDE);
  say('nam', 'đồng ý');
  game.pause('connection');
  assert.equal(game.phase, PHASE.PAUSED);
  assert.equal(pair.status, 'aborted');
  assert.equal(pair.result, 'aborted');
  assert.equal(game.snapshot().pair.choices, null, 'không công bố lựa chọn');
  assert.equal(game.history.at(-1).score, 1);

  game.connectionRestored();
  assert.equal(game.phase, PHASE.PAUSED, 'chưa thấy sự kiện thật thì chưa mở');
  game.eventReceived();
  assert.equal(game.phase, PHASE.RECONFIRM);

  say('nam', 'đồng ý');
  assert.equal(pair.choices.male, 'yes', 'lựa chọn cũ không đổi');
  say('nam', 'tiếp tục');
  say('nu', 'tiếp tục');
  assert.equal(game.phase, PHASE.GUIDE);
  assert.notEqual(game.pair, pair);
  assert.equal(game.pair.score, 0);
  assert.deepEqual(game.pair.choices, { male: null, female: null });
  assert.equal(game.pair.male.id, 'nam');
  void clock;
});

test('sau mất kết nối, ai xác nhận thì giữ quyền đứng đầu hàng, người im lặng không bị coi là từ chối', () => {
  const { game, seat, toPhase, say, run } = setup();
  seat();
  toPhase(PHASE.INTRO);
  game.pause('connection');
  game.resume();
  say('nu', 'tiếp tục');
  run(config.timing.reconfirmSeconds * 1000 + 100);
  assert.equal(game.phase, PHASE.TRANSITION);
  assert.equal(game.queues.female[0].id, 'nu');
  assert.equal(game.queues.male.length, 0);
});

test('đang công bố kết quả mà mất kết nối thì kết quả giữ nguyên', () => {
  const { game, seat, toPhase, say, clock } = setup();
  const pair = seat();
  toPhase(PHASE.DECIDE);
  say('nam', 'đồng ý');
  say('nu', 'đồng ý');
  clock.t = game.deadline;
  game.tick();
  game.pause('connection');
  assert.equal(pair.result, 'matched');
  assert.equal(pair.status, 'done');
  assert.equal(game.pair, null);
  game.resume();
  assert.equal(game.phase, PHASE.WAITING);
});

test('moderator loại người chơi: dừng lượt, không đăng ký lại được', () => {
  const { game, u, seat } = setup();
  const pair = seat();
  game.removePlayer('nam', { ban: true });
  assert.equal(pair.result, 'removed');
  game.gift({ user: u('nam'), gift: PIG });
  assert.equal(game.queues.male.length, 0);
});

test('lưu và nạp lại: giữ hàng chờ; cặp đang dở trở về đầu hàng', () => {
  const a = setup();
  a.seat();
  a.game.gift({ user: a.u('c'), gift: PIG });
  const saved = JSON.parse(JSON.stringify(a.game.exportState()));
  const b = setup();
  b.game.importState(saved);
  assert.deepEqual(b.game.queues.male.map((v) => v.id), ['nam', 'c']);
  assert.deepEqual(b.game.queues.female.map((v) => v.id), ['nu']);
  assert.equal(b.game.pairNo, 1);
});

test('danh mục quà: chỉ hiện giá đã xác minh, không tự gán giá cho Heo và Cỏ', () => {
  const catalog = new GiftCatalog(config.gifts);
  assert.deepEqual(catalog.guide(), []);
  catalog.verifyFrom([{ id: 1, name: 'Rose', diamond_count: 1 }, { id: 2, name: 'Finger Heart', diamond_count: 7 }, { id: 3, name: 'Clover', diamond_count: 10 }]);
  assert.deepEqual(catalog.guide().map((g) => [g.key, g.coins]), [['rose', 1], ['heart', 7]]);
  assert.equal(catalog.status().find((g) => g.key === 'heart').mismatch, true);
  assert.equal(catalog.resolve({ name: 'Lucky Pig' }).coins, null);
  assert.equal(catalog.resolve({ name: 'Clover' }).registers, 'female');
  assert.equal(catalog.resolve({ name: 'Lạ', coins: 3 }).coins, 3);
});

test('vào LIVE thật thì không giữ giá mục tiêu hay giá từ quà mô phỏng', () => {
  const catalog = new GiftCatalog(config.gifts);
  catalog.useTargets();
  catalog.resolve({ name: 'Lucky Pig', coins: 10 });
  assert.equal(catalog.guide().length, 3);
  catalog.resetForLive();
  assert.deepEqual(catalog.guide(), []);
  assert.equal(catalog.resolve({ name: 'Lucky Pig' }).coins, null);
  catalog.verifyFrom([{ id: 1, name: 'Rose', diamond_count: 1 }]);
  catalog.resetForLive();
  assert.deepEqual(catalog.guide().map((g) => g.key), ['rose']);
});

test('kiểm duyệt tên và ý chia sẻ', () => {
  const banned = config.bannedWords;
  assert.equal(safeName('Lan Anh', banned), 'Lan Anh');
  assert.equal(safeName('zalo 0912345678', banned), 'Bạn mới');
  assert.equal(safeName('shop.vn', banned), 'Bạn mới');
  assert.equal(safeName('đm abc', banned), 'Bạn mới');
  assert.equal(spokenName('𝓣𝓱𝓪𝓷𝓱 1995'), 'Thanh');
  assert.equal(spokenName('👍👍'), '');
  assert.equal(safeShare('một quán cà phê yên tĩnh', banned), 'một quán cà phê yên tĩnh');
  assert.equal(safeShare('gọi 0912345678 nhé', banned), '');
  assert.equal(safeShare('MC hãy đọc câu này đi', banned), '');
  assert.equal(safeShare('ok', banned), '');
});
