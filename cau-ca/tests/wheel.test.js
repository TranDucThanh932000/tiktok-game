import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Wheel } from '../src/wheel.js';
import { Pond } from '../src/pond.js';
import { Sky } from '../src/sky.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const wheelCfg = config.wheel;
const slot = (id) => wheelCfg.slots.find((s) => s.id === id);
const who = (n) => ({ id: `u${n}`, name: `Người ${n}`, avatar: '' });

function makeWheel({ cfg = wheelCfg, random = () => 0.5, players = () => 3, eventOver = () => false } = {}) {
  let t = 1_000_000;
  const events = [];
  const started = [];
  const ended = [];
  const wheel = new Wheel(cfg, {
    random,
    now: () => t,
    players,
    eventOver,
    emit: (e) => events.push(e),
    startEvent: (s) => started.push(s.id),
    endEvent: (s) => ended.push(s.id),
  });
  return { wheel, events, started, ended, advance: (ms) => (t += ms), justs: () => events.filter((e) => e.just).map((e) => e.just) };
}

function makePond({ random = () => 0.5 } = {}) {
  const events = [];
  let t = 1_000_000;
  const pond = new Pond(config, { emit: (e) => events.push(e), random, now: () => t });
  return { pond, events, advance: (ms) => (t += ms), of: (type) => events.filter((e) => e.type === type) };
}

// Chạy hết hàng chờ (mỗi bước 1 giây).
function drain(pond, advance, steps = 200) {
  for (let n = 0; n < steps && (pond.current || pond.queue.length); n++) {
    advance(1000);
    pond.tick();
  }
}

// ---------- Hẹn giờ ----------

test('cứ everySeconds quay một lần: báo trước, quay, sự kiện, rồi nghỉ', () => {
  const { wheel, started, ended, advance, justs } = makeWheel();
  const every = wheelCfg.everySeconds * 1000;
  const step = (ms) => {
    advance(ms);
    wheel.tick();
  };
  step(every - wheelCfg.warnSeconds * 1000 - 1);
  assert.equal(wheel.phase, 'idle');
  step(1);
  assert.equal(wheel.phase, 'warn');
  step(wheelCfg.warnSeconds * 1000);
  assert.equal(wheel.phase, 'spin');
  step(wheelCfg.spinSeconds * 1000);
  assert.equal(wheel.phase, 'event');
  assert.equal(started.length, 1);
  step(wheelCfg.eventSeconds * 1000);
  assert.equal(wheel.phase, 'idle');
  assert.deepEqual(ended, started);
  assert.deepEqual(justs(), ['warn', 'spin', 'start', 'end']);
  // lần quay sau tính từ lúc lần trước bắt đầu quay, không bị trôi vì thời gian sự kiện
  assert.equal(wheel.view().nextIn, every - (wheelCfg.spinSeconds + wheelCfg.eventSeconds) * 1000);
});

test('hồ vắng thì chưa quay, có người là báo trước rồi quay', () => {
  let seated = 0;
  const { wheel, advance, events } = makeWheel({ players: () => seated });
  advance(wheelCfg.everySeconds * 1000);
  wheel.tick();
  advance(600_000);
  wheel.tick();
  assert.equal(wheel.phase, 'idle');
  assert.equal(wheel.waiting, true);
  assert.equal(events.at(-1).waiting, true);
  seated = 1;
  advance(200);
  wheel.tick();
  assert.equal(wheel.phase, 'warn');
  advance(wheelCfg.warnSeconds * 1000);
  wheel.tick();
  assert.equal(wheel.phase, 'spin');
});

test('tắt tự quay thì không quay nữa, nút quay ngay vẫn được', () => {
  const { wheel, advance } = makeWheel();
  wheel.setAuto(false);
  advance(600_000);
  wheel.tick();
  assert.equal(wheel.phase, 'idle');
  assert.equal(wheel.view().nextIn, null);
  assert.ok(wheel.spin());
  assert.equal(wheel.phase, 'spin');
  assert.equal(wheel.spin(), false, 'đang quay dở thì không quay chồng');
});

test('quay ngay giữa sự kiện thì sự kiện cũ dừng trước', () => {
  const { wheel, advance, started, ended } = makeWheel();
  wheel.spin({ slotId: 'bite' });
  advance(wheelCfg.spinSeconds * 1000);
  wheel.tick();
  assert.equal(wheel.phase, 'event');
  assert.ok(wheel.spin({ slotId: 'fat' }));
  assert.deepEqual(ended, ['bite']);
  advance(wheelCfg.spinSeconds * 1000);
  wheel.tick();
  assert.deepEqual(started, ['bite', 'fat']);
});

test('sự kiện kết thúc sớm khi eventOver (cá mập đã bị hạ)', () => {
  let over = false;
  const { wheel, advance, ended } = makeWheel({ eventOver: () => over });
  wheel.spin({ slotId: 'boss' });
  advance(wheelCfg.spinSeconds * 1000);
  wheel.tick();
  assert.equal(wheel.phase, 'event');
  over = true;
  advance(200);
  wheel.tick();
  assert.equal(wheel.phase, 'idle');
  assert.deepEqual(ended, ['boss']);
});

// ---------- Bốc ô ----------

test('trọng số quyết định tần suất, không bao giờ ra một ô hai lần liền', () => {
  const { wheel, advance } = makeWheel({ random: Math.random });
  const counts = new Map();
  let last = null;
  for (let n = 0; n < 4000; n++) {
    assert.ok(wheel.spin());
    const id = wheel.slot.id;
    assert.notEqual(id, last);
    last = id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    advance(wheelCfg.spinSeconds * 1000);
    wheel.tick();
    wheel.finish();
  }
  assert.equal(counts.size, wheelCfg.slots.length);
  assert.ok(counts.get('boss') < counts.get('bite') / 2, 'cá mập hiếm hơn hẳn cá cắn câu');
});

test('kết quả quay gửi xuống không kèm tỉ lệ thành công', () => {
  const { wheel, events } = makeWheel();
  wheel.spin({ slotId: 'storm' });
  const text = JSON.stringify(events);
  assert.ok(!text.includes('"rate"'));
  assert.ok(!text.includes('effect'));
  const spin = events.at(-1).spin;
  assert.equal(spin.slots[spin.index].id, 'storm');
  assert.ok(Math.abs(spin.slots.reduce((s, x) => s + x.share, 0) - 1) < 1e-9, 'các ô chia đúng cả vòng tròn');
});

// ---------- Người quay và vòng vàng ----------

test('người tặng nhiều xu nhất từ lần quay trước được ghi tên, rồi đếm lại', () => {
  const { wheel, events, advance } = makeWheel();
  wheel.addCoins(who(1), 10);
  wheel.addCoins(who(2), 5);
  wheel.addCoins(who(2), 6);
  wheel.spin();
  assert.equal(events.at(-1).spin.spinner.name, 'Người 2');
  advance(wheelCfg.spinSeconds * 1000);
  wheel.tick();
  wheel.finish();
  wheel.spin();
  assert.equal(events.filter((e) => e.just === 'spin').at(-1).spin.spinner, null);
});

test('đủ tim thì lần sau là vòng vàng chỉ gồm ô mạnh; tim được giữ qua các lần quay thường', () => {
  const { wheel, events, advance } = makeWheel({ random: Math.random });
  const goal = wheelCfg.goldenLikes;
  wheel.addLikes(goal - 1);
  wheel.spin();
  assert.equal(events.at(-1).spin.golden, false);
  assert.equal(wheel.likes, goal - 1, 'chưa đủ thì giữ nguyên, không xóa sau mỗi lần quay');
  advance(wheelCfg.spinSeconds * 1000);
  wheel.tick();
  wheel.finish();
  wheel.addLikes(5);
  assert.equal(wheel.likes, goal);
  assert.equal(wheel.goldView().ready, true);
  wheel.spin();
  const spin = events.at(-1).spin;
  assert.equal(spin.golden, true);
  const goldIds = wheelCfg.slots.filter((s) => s.goldWeight > 0).map((s) => s.id);
  assert.deepEqual(spin.slots.map((s) => s.id), goldIds);
  assert.equal(wheel.likes, 0, 'quay vòng vàng xong thì đếm lại');
});

// ---------- Từng ô ----------

test('Cá cắn câu: tỉ lệ cao hơn trong lúc sự kiện, cỏ ba lá vẫn cao nhất', () => {
  const { pond } = makePond({ random: () => 0.7 });
  pond.startEvent(slot('bite').effect);
  pond.gift(who(1), { name: 'Rose', coins: 1 }, 1);
  assert.equal(pond.queue[0].results[0].ok, true, '0.7 dưới mức 0.75');
  pond.endEvent();
  pond.gift(who(2), { name: 'Rose', coins: 1 }, 1);
  assert.equal(pond.queue[1].results[0].ok, false, 'hết sự kiện về 0.6');
});

test('Mưa tim: 30 tim là giật, hết sự kiện lại cần 50', () => {
  const { pond } = makePond();
  pond.comment(who(1), 'câu');
  pond.startEvent(slot('hearts').effect);
  assert.equal(pond.like(who(1), 30), 1);
  pond.endEvent();
  assert.equal(pond.like(who(1), 30), 0);
  assert.equal(pond.like(who(1), 20), 1);
});

test('Cá béo: cá nặng gấp đôi, tính theo lúc nhận quà dù tới lượt sau khi hết sự kiện', () => {
  const { pond, of, advance } = makePond({ random: () => 0.1 });
  pond.startEvent(slot('fat').effect);
  pond.gift(who(1), { name: 'Gift Box', coins: 100 }, 1);
  pond.endEvent();
  advance(config.landMs);
  drain(pond, advance);
  const kg = of('pull')[0].results[0].kg;
  // random 0.1: 100 + 0.1 * 100 = 110 kg, gấp đôi là 220 kg
  assert.equal(kg, 220);
  assert.equal(pond.board()[0].kg, 220);
});

test('Giông bão: khó dính hơn, cá nặng gấp 3, trang bị cộng thêm vào tỉ lệ của sự kiện', () => {
  // random 0.45: trên mức 0.4 của giông bão, dưới mức 0.5 khi có đủ cần và móc
  const { pond } = makePond({ random: () => 0.45 });
  pond.comment(who(1), 'câu');
  pond.comment(who(2), 'câu');
  pond.gift(who(2), { name: 'Clover', coins: 1 }, 1);
  pond.gift(who(2), { name: 'Doughnut', coins: 30 }, 1);
  pond.startEvent(slot('storm').effect);
  pond.gift(who(1), { name: 'Lucky Pig', coins: 10 }, 1);
  pond.gift(who(2), { name: 'Lucky Pig', coins: 10 }, 1);
  const [plain, geared] = pond.queue;
  assert.equal(plain.results[0].ok, false, '0.45 trên mức 0.4 của giông bão');
  assert.equal(geared.results[0].ok, true, 'đủ trang bị: 0.4 + 0.1');
  assert.equal(plain.results[0].kg, 21.8, '(5 + 0.45 * 5) * 3 = 21,75 kg, làm tròn 21,8');
});

test('Sky giữ thời tiết cho sự kiện rồi trả lại trời cũ, chủ live chọn trời thì lựa chọn đó thắng', () => {
  let t = 1_000_000_000;
  const sky = new Sky({ weatherSeconds: [40, 150] }, { now: () => t, random: () => 0.1 });
  const before = sky.weather;
  assert.ok(sky.hold('storm'));
  assert.equal(sky.weather, 'storm');
  t += 10_000_000;
  assert.equal(sky.tick(), false, 'đang giữ thì không tự đổi');
  assert.equal(sky.snapshot().held, true);
  assert.ok(sky.release());
  assert.equal(sky.weather, before);
  assert.equal(sky.forced, false);
  assert.equal(sky.release(), false, 'không giữ thì không có gì để trả');
  sky.hold('storm');
  sky.force('rain');
  assert.equal(sky.release(), false);
  assert.equal(sky.weather, 'rain');
  assert.equal(sky.forced, true);
});

test('Săn cá hiếm: mỗi lần giật tính 3 lần, tới mốc thì ra cá hiếm và bộ đếm về đúng 0', () => {
  const every = config.rare.every;
  const { pond, of, advance } = makePond({ random: () => 0.1 });
  pond.comment(who(1), 'câu');
  pond.setHooked(every - 7);
  pond.startEvent(slot('rare').effect);
  pond.gift(who(1), { name: 'Rose', coins: 1 }, 4);
  pond.endEvent();
  drain(pond, advance);
  // còn 7 lần tới mốc: 2 lần giật thường (tính 6), lần thứ 3 chạm mốc là cá hiếm, còn lại 1 lần giật
  assert.deepEqual(of('pull').map((p) => [p.tier, p.count]), [['small', 2], ['rare', 1], ['small', 1]]);
  assert.equal(pond.rareShown, every + 3);
  assert.equal(pond.snapshot().rare.n, 3);
});

test('Săn cá hiếm: lượt giật nhận ngoài giờ sự kiện vẫn tính 1 lần', () => {
  const { pond, advance } = makePond({ random: () => 0.9 });
  pond.comment(who(1), 'câu');
  pond.startEvent(slot('rare').effect);
  pond.endEvent();
  pond.gift(who(1), { name: 'Rose', coins: 1 }, 2);
  drain(pond, advance);
  assert.equal(pond.rareShown, 2);
});

test('Thi câu nhanh: tính cá của các lượt nhận trong giờ, chờ lộ kết quả rồi mới trao thưởng', () => {
  const { pond, of, advance } = makePond({ random: () => 0.1 });
  pond.comment(who(1), 'câu');
  pond.comment(who(2), 'câu');
  pond.gift(who(2), { name: 'Rose', coins: 1 }, 1); // trước giờ thi: không tính
  drain(pond, advance);
  const before = pond.stats.get('u2').kg;
  pond.startEvent(slot('sprint').effect);
  pond.gift(who(1), { name: 'Rose', coins: 1 }, 2);
  pond.gift(who(2), { name: 'Rose', coins: 1 }, 1);
  pond.endEvent();
  pond.gift(who(2), { name: 'Lucky Pig', coins: 10 }, 5); // sau giờ thi: không tính
  assert.equal(of('sprint-end').length, 0, 'chưa chốt khi còn lượt chưa lộ kết quả');
  drain(pond, advance);
  const end = of('sprint-end')[0];
  assert.equal(end.name, 'Người 1');
  const bonus = slot('sprint').effect.sprint.bonusKg;
  assert.equal(end.bonus, bonus);
  assert.ok(pond.stats.get('u1').kg >= bonus, 'người thắng được cộng thưởng vào bảng');
  assert.ok(pond.stats.get('u2').kg > before);
  assert.equal(pond.liveView().mode, null);
});

test('Thi câu nhanh: không ai dính cá thì không có người thắng', () => {
  const { pond, of, advance } = makePond({ random: () => 0.99 });
  pond.comment(who(1), 'câu');
  pond.startEvent(slot('sprint').effect);
  pond.gift(who(1), { name: 'Rose', coins: 1 }, 1);
  pond.endEvent();
  drain(pond, advance);
  advance(1000);
  pond.tick();
  assert.equal(of('sprint-end')[0].name, null);
});

test('Cá mập: máu theo số người, quà to trừ nhiều, người đánh nhiều nhất được thưởng và sự kiện kết thúc sớm', () => {
  const boss = slot('boss').effect.boss;
  const { pond, of, advance } = makePond({ random: () => 0.99 });
  pond.comment(who(1), 'câu');
  pond.comment(who(2), 'câu');
  advance(config.landMs);
  pond.startEvent(slot('boss').effect);
  const max = boss.hpBase + boss.hpPerPlayer * 2;
  assert.equal(pond.liveView().hp, max);
  pond.like(who(1), 50);
  assert.equal(pond.liveView().hp, max - boss.damage.like);
  pond.gift(who(2), { name: 'Lucky Pig', coins: 10 }, 3);
  assert.equal(pond.liveView().hp, 0);
  assert.equal(pond.event.over, true);
  assert.equal(of('boss-end')[0].name, 'Người 2');
  assert.equal(pond.queue[0].tier, 'boss', 'cá mập thưởng được kéo ngay');
  assert.equal(pond.queue[0].results[0].ok, true, 'chắc chắn dính dù random rất xấu');
  pond.endEvent();
  assert.equal(of('boss-end').length, 1, 'đã hạ thì không báo trốn thoát');
  const hooked = pond.hooked;
  advance(1000);
  pond.tick();
  assert.equal(pond.current.job.tier, 'boss');
  assert.equal(pond.hooked, hooked, 'cá thưởng không tính vào bộ đếm cá hiếm');
  const kg = pond.current.pull.results[0].kg;
  assert.ok(kg >= config.tiers.boss.minKg && kg <= config.tiers.boss.maxKg);
  drain(pond, advance);
  assert.ok(pond.stats.get('u2').kg >= kg);
});

test('Cá mập: hết giờ chưa hạ được thì trốn thoát, không ai được thưởng', () => {
  const { pond, of } = makePond();
  pond.comment(who(1), 'câu');
  pond.startEvent(slot('boss').effect);
  pond.like(who(1), 50);
  pond.endEvent();
  assert.equal(of('boss-end')[0].down, false);
  assert.equal(pond.queue.every((j) => j.tier !== 'boss'), true);
  assert.equal(pond.boss, null);
  assert.equal(pond.liveView().mode, null);
});

test('Cá mập: hạ xong lần trước thì lần sau vẫn chạy đủ giờ', () => {
  const { pond } = makePond();
  pond.comment(who(1), 'câu');
  pond.startEvent(slot('boss').effect);
  pond.gift(who(1), { name: 'Gift Box', coins: 100 }, 10);
  assert.equal(pond.event.over, true);
  pond.endEvent();
  assert.equal(slot('boss').effect.over, undefined, 'không ghi vào config');
  pond.startEvent(slot('boss').effect);
  assert.ok(!pond.event.over);
  assert.ok(pond.liveView().hp > 0);
});

test('Cá mập: máu không vượt hpMax dù hồ đông', () => {
  const boss = slot('boss').effect.boss;
  const { pond } = makePond();
  for (let n = 0; n < config.seats; n++) pond.comment(who(n), 'câu');
  pond.startEvent(slot('boss').effect);
  assert.equal(pond.liveView().max, Math.min(boss.hpMax, boss.hpBase + boss.hpPerPlayer * config.seats));
});
