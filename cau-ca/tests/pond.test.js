import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Pond, matchesWord, giftTier } from '../src/pond.js';

const { bots: botConfig, ...config } = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

function make({ random = () => 0.5, cfg = config } = {}) {
  const events = [];
  let t = 1_000_000;
  const pond = new Pond(cfg, { emit: (e) => events.push(e), random, now: () => t });
  return { pond, events, advance: (ms) => (t += ms), of: (type) => events.filter((e) => e.type === type) };
}
const who = (n) => ({ id: `u${n}`, name: `Người ${n}`, avatar: '' });

// Chạy tick đều 100 ms như server, trong ms mili giây.
function run(tools, ms) {
  for (let t = 0; t < ms; t += 100) {
    tools.advance(100);
    tools.pond.tick();
  }
}
const withBots = (random) => make({ random, cfg: { ...config, bots: botConfig } });

test('3 bot luôn ngồi trong hồ: không tự về, không bị đẩy ra, bị mời ra thì quay lại', () => {
  const tools = withBots();
  const { pond } = tools;
  pond.tick();
  assert.equal(pond.players.size, 3);
  assert.equal(pond.humans(), 0);
  run(tools, (config.idleLeaveSeconds + 10) * 1000);
  assert.equal(pond.players.size, 3, 'ngồi lâu vẫn không về');
  for (let i = 0; i < config.seats - 3; i++) pond.seat(who(i));
  assert.equal(pond.seat(who(99), { force: true }).seat !== undefined, true, 'quà đẩy người xem ngồi im, không đẩy bot');
  for (const bot of pond.bots) assert.ok(pond.players.has(bot.id));
  pond.clearPond();
  assert.equal(pond.players.size, 0);
  pond.tick();
  assert.equal(pond.players.size, 3);
});

test('bot chỉ thả tim: có lượt câu cá đồng nhưng không lên bảng, không đụng cá hiếm', () => {
  const tools = withBots(() => 0.1);
  const { pond, of } = tools;
  pond.setHooked(config.rare.every - 1);
  tools.events.length = 0;
  run(tools, 120_000);
  const pulls = of('pull');
  assert.ok(pulls.length >= 3, `phải có lượt giật, có ${pulls.length}`);
  assert.ok(pulls.every((p) => p.tier === 'like'), 'chỉ giật cá đồng từ tim');
  assert.ok(of('likes').length > 0);
  assert.equal(of('gift').length + of('gear').length + of('prop').length, 0);
  assert.equal(pond.stats.size, 0);
  assert.deepEqual(pond.board(), []);
  assert.equal(pond.king, null);
  assert.equal(of('board').length, 0);
  assert.equal(pond.hooked, config.rare.every - 1, 'con cá hiếm vẫn để dành cho người xem');
});

test('bot nhường camera: đủ tim mà đang có lượt của người xem thì chờ', () => {
  const tools = withBots();
  const { pond } = tools;
  pond.tick();
  pond.comment(who(1), 'câu');
  for (const bot of pond.bots) pond.players.get(bot.id).likes = config.likesPerPull - 1;
  pond.gift(who(1), { name: 'Rose', coins: 1 }, 1);
  pond.tick();
  assert.equal(pond.current, null, 'người xem còn đang tiếp đất');
  assert.equal(pond.queue.length, 1);
  assert.equal(pond.queue[0].pid, 'u1');
  for (const bot of pond.bots) assert.equal(pond.players.get(bot.id).likes, config.likesPerPull - 1, 'tim của bot giữ nguyên');
});

test('sự kiện: bot không đánh cá hô chúa, không tính vào máu của nó, không tranh thi câu', () => {
  const tools = withBots(() => 0.1);
  const { pond, of } = tools;
  pond.tick();
  pond.comment(who(1), 'câu');
  const bossEffect = config.wheel.slots.find((s) => s.id === 'boss').effect;
  pond.startEvent(bossEffect);
  assert.equal(pond.boss.max, bossEffect.boss.hpBase + bossEffect.boss.hpPerPlayer);
  run(tools, 30_000);
  assert.ok(of('pull').length > 0);
  assert.equal(of('boss-hit').length, 0);
  assert.equal(pond.boss.hp, pond.boss.max);
  pond.endEvent();

  pond.startEvent(config.wheel.slots.find((s) => s.id === 'sprint').effect);
  run(tools, 30_000);
  pond.endEvent();
  run(tools, 100);
  const end = of('sprint-end').at(-1);
  assert.equal(end.name, null, 'chỉ có bot câu thì không ai thắng');
});

test('comment "câu" cho ngồi xuống hồ, chữ khác thì không', () => {
  assert.ok(matchesWord('Câu!!', config.joinWords));
  assert.ok(matchesWord('cauuu đi', config.joinWords));
  assert.ok(matchesWord('cho tôi câu cá', config.joinWords));
  assert.ok(!matchesWord('câu lạc bộ'.replace('câu', 'cầu'), config.joinWords));
  assert.ok(!matchesWord('hello', config.joinWords));
  const { pond, of } = make();
  assert.ok(pond.comment(who(1), 'câu'));
  assert.equal(pond.comment(who(1), 'câu'), null, 'đã ngồi thì không ngồi lại');
  assert.equal(of('join').length, 1);
});

test('quà theo tên và theo xu', () => {
  assert.equal(giftTier(config, { name: 'Rose', coins: 1 }), 'small');
  assert.equal(giftTier(config, { name: 'Finger Heart', coins: 5 }), 'medium');
  assert.equal(giftTier(config, { name: 'Bắn tim', coins: 5 }), 'medium');
  assert.equal(giftTier(config, { name: 'Lucky Pig', coins: 10 }), 'large');
  assert.equal(giftTier(config, { name: 'Doughnut', coins: 30 }), 'large', 'quà lạ 30 xu tính theo xu');
  assert.equal(giftTier(config, { name: 'Gift Box', coins: 100 }), 'shark');
  assert.equal(giftTier(config, { name: 'Lạ', coins: 500 }), 'shark');
  assert.equal(giftTier(config, { name: 'Lạ', coins: 4 }), 'small');
  assert.equal(giftTier(config, { name: 'Lạ', coins: 5 }), 'medium');
});

test('50 tim là 1 lần giật, người chưa ngồi đủ tim thì tự xuống hồ', () => {
  const { pond, of } = make();
  assert.equal(pond.like(who(1), 30), 0);
  assert.equal(pond.players.size, 0);
  assert.equal(pond.like(who(1), 30), 1);
  assert.equal(pond.players.get('u1').likes, 10);
  assert.equal(of('join').length, 1);
  assert.equal(pond.queue[0].tier, 'like');
});

test('tim dồn không quá maxLikePullsQueued lượt', () => {
  const { pond } = make();
  pond.comment(who(1), 'câu');
  pond.like(who(1), 50 * 10);
  assert.equal(pond.queue[0].count, config.maxLikePullsQueued);
});

test('kích cỡ cá đúng hạng, tỉ lệ thành công 60%', () => {
  let i = 0;
  const seq = [];
  // tắt cá hiếm để 1000 hoa hồng không bị tách lượt
  const { pond, of, advance } = make({ cfg: { ...config, rare: null }, random: () => (seq.length ? seq.shift() : (i++ % 10) / 10) });
  pond.comment(who(1), 'câu');
  pond.gift(who(1), { name: 'Gift Box', coins: 100 }, 1);
  pond.gift(who(2), { name: 'Rose', coins: 1 }, 1000);
  for (let n = 0; n < 50; n++) {
    pond.tick();
    advance(3000);
  }
  const pulls = of('pull');
  const shark = pulls.find((p) => p.tier === 'shark').results[0];
  assert.ok(shark.kg >= 100 && shark.kg <= 200);
  const roses = pulls.find((p) => p.tier === 'small').results;
  assert.equal(roses.length, 1000, '1000 hoa hồng gộp thành 1 lượt quay cận, 1000 lần giật');
  assert.ok(roses.every((r) => r.kg >= 1 && r.kg <= 2));
  assert.equal(roses.filter((r) => r.ok).length / roses.length, 0.6);
});

test('bảng xếp hạng chỉ cộng lúc lộ kết quả, xếp theo tổng kg', () => {
  const { pond, advance, of } = make({ random: () => 0.1 });
  pond.gift(who(1), { name: 'Rose', coins: 1 }, 1);
  pond.gift(who(2), { name: 'Lucky Pig', coins: 10 }, 1);
  pond.tick();
  assert.equal(pond.current, null, 'chờ người mới tiếp đất');
  advance(config.landMs);
  pond.tick();
  assert.equal(pond.board().length, 0);
  advance(config.focusMs);
  pond.tick();
  assert.equal(pond.board()[0].name, 'Người 1');
  advance(config.focusMs);
  pond.tick();
  advance(config.focusMs);
  pond.tick();
  const top = pond.board();
  assert.equal(top[0].name, 'Người 2');
  assert.equal(top[0].wins, 1);
  assert.equal(of('reveal').length, 2);
});

test('hồ kín: người tặng quà được đẩy người ngồi im lâu nhất ra', () => {
  const { pond, advance, of } = make();
  for (let n = 0; n < config.seats; n++) {
    pond.comment(who(n), 'câu');
    advance(500);
  }
  advance(5_000);
  assert.equal(pond.comment(who(99), 'câu'), null, 'comment chưa đẩy được người vừa vào');
  assert.equal(of('full').length, 1);
  pond.gift(who(100), { name: 'Rose', coins: 1 }, 1);
  assert.ok(pond.players.has('u100'));
  assert.ok(!pond.players.has('u0'));
  assert.equal(of('leave')[0].why, 'full');
});

test('ngồi quá idleLeaveSeconds mà không giật cá thì tự về, comment hay tim lẻ không giữ chỗ', () => {
  const idleMs = config.idleLeaveSeconds * 1000;
  const { pond, advance } = make();
  pond.comment(who(1), 'câu');
  advance(idleMs - 1000);
  pond.comment(who(1), 'câu');
  pond.comment(who(1), 'hello');
  pond.like(who(1), 20);
  advance(1001);
  pond.tick();
  assert.equal(pond.players.size, 0);
  assert.ok(pond.seats.every((s) => s === null));
  // tim thả dở được để dành: thả thêm 30 tim là đủ 50, tự xuống hồ và giật
  assert.equal(pond.like(who(1), 30), 1);
  assert.ok(pond.players.has('u1'));
});

test('giật cá xong thì đếm lại từ đầu thời gian rời hồ', () => {
  const idleMs = config.idleLeaveSeconds * 1000;
  const { pond, advance } = make();
  pond.comment(who(1), 'câu');
  advance(idleMs - 5000);
  pond.like(who(1), 50);
  pond.tick();
  assert.ok(pond.current, 'đang giật');
  advance(config.focusMs);
  pond.tick();
  assert.equal(pond.current, null);
  advance(idleMs - 1000);
  pond.tick();
  assert.ok(pond.players.has('u1'), 'vừa giật xong chưa bị mời về');
  advance(2000);
  pond.tick();
  assert.ok(!pond.players.has('u1'));
});

test('follow / share câu free, gộp chung tối đa 1 lần mỗi freePullCooldownSeconds', () => {
  const { pond, advance, of } = make();
  assert.ok(pond.free(who(1), 'follow'), 'người chưa ngồi follow thì tự xuống hồ và giật');
  assert.equal(pond.queue[0].tier, 'like');
  assert.equal(pond.queue[0].count, 1);
  assert.equal(pond.free(who(1), 'share'), null, 'share ngay sau follow không được thêm lượt');
  assert.equal(pond.free(who(1), 'follow'), null);
  assert.ok(pond.free(who(2), 'share'), 'người khác vẫn được');
  advance(config.freePullCooldownSeconds * 1000 - 1);
  assert.equal(pond.free(who(1), 'share'), null);
  advance(1);
  assert.ok(pond.free(who(1), 'share'), 'hết thời gian chờ thì được câu free lại');
  assert.equal(pond.queue.find((j) => j.pid === 'u1').count, 2);
  assert.equal(of('free').length, 3);
});

test('cỏ ba lá đổi cần, bánh vòng đổi móc: không tạo lượt giật, người chưa ngồi thì tự xuống hồ', () => {
  const { pond, of } = make();
  assert.equal(pond.gift(who(1), { name: 'Treasure Clover', coins: 1 }, 1), 'rod');
  assert.equal(pond.gift(who(1), { name: 'Doughnut', coins: 30 }, 1), 'hook');
  assert.equal(pond.queue.length, 0);
  assert.equal(of('join').length, 1);
  assert.deepEqual(of('gear').map((e) => e.slot), ['rod', 'hook']);
  const worn = pond.snapshot().players[0].gear;
  assert.ok(config.gear.rod.items.some((i) => i.id === worn.rod));
  assert.ok(config.gear.hook.items.some((i) => i.id === worn.hook));
});

test('đổi trang bị luôn ra món khác món đang dùng, combo vẫn chỉ đổi một lần', () => {
  let r = 0;
  const { pond, of } = make({ random: () => (r = (r + 0.37) % 1) });
  let last = null;
  for (let n = 0; n < 40; n++) {
    pond.gift(who(1), { name: 'Clover', coins: 1 }, 3);
    const now = pond.gear.get('u1').rod;
    assert.notEqual(now, last);
    last = now;
  }
  assert.equal(of('gear').length, 40);
  assert.ok(new Set(of('gear').map((e) => e.item)).size > 2, 'có nhiều loại cần');
});

test('mỗi loại trang bị cộng 5% tỉ lệ thành công, đổi lại không cộng dồn', () => {
  // successRate 0.6: 0.62 cần 1 món, 0.67 cần đủ 2 món
  const rollOk = (value) => {
    const { pond } = make({ random: () => value });
    return pond;
  };
  const one = rollOk(0.62);
  one.gift(who(1), { name: 'Clover', coins: 1 }, 1);
  one.gift(who(1), { name: 'Rose', coins: 1 }, 1);
  assert.equal(one.queue[0].results[0].ok, true, 'có cần: 0.65');
  const plain = rollOk(0.62);
  plain.gift(who(1), { name: 'Rose', coins: 1 }, 1);
  assert.equal(plain.queue[0].results[0].ok, false, 'không có gì: 0.6');
  const stacked = rollOk(0.67);
  stacked.gift(who(1), { name: 'Clover', coins: 1 }, 5);
  stacked.gift(who(1), { name: 'Clover', coins: 1 }, 1);
  stacked.gift(who(1), { name: 'Rose', coins: 1 }, 1);
  assert.equal(stacked.queue[0].results[0].ok, false, 'đổi cần nhiều lần vẫn chỉ 0.65');
  const full = rollOk(0.67);
  full.gift(who(1), { name: 'Clover', coins: 1 }, 1);
  full.gift(who(1), { name: 'Doughnut', coins: 30 }, 1);
  full.gift(who(1), { name: 'Rose', coins: 1 }, 1);
  assert.equal(full.queue[0].results[0].ok, true, 'đủ cần và móc: 0.7');
});

test('lượt đã xếp hàng được gieo lại khi có thêm món, đổi lại thì không', () => {
  const { pond } = make({ random: () => 0.1 });
  pond.comment(who(1), 'câu');
  pond.queue.push({ id: 99, pid: 'u1', tier: 'small', count: 1, results: [{ ok: false, kg: 1, fish: 'Cá rô' }] });
  pond.gift(who(1), { name: 'Clover', coins: 1 }, 1); // gieo lại với 0.05 / 0.4 = 12,5%: 0.1 trúng
  assert.equal(pond.queue[0].results[0].ok, true);
  pond.queue[0].results[0].ok = false;
  pond.gift(who(1), { name: 'Clover', coins: 1 }, 1);
  assert.equal(pond.queue[0].results[0].ok, false, 'đã có cần thì đổi cần không gieo lại');
});

test('trang bị còn nguyên sau khi rời hồ, con số không bao giờ gửi xuống trang game', () => {
  const { pond, events } = make();
  pond.gift(who(1), { name: 'Clover', coins: 1 }, 1);
  const worn = pond.gear.get('u1').rod;
  pond.leave('u1');
  pond.comment(who(1), 'câu');
  assert.equal(pond.snapshot().players[0].gear.rod, worn);
  const sent = JSON.stringify([events.filter((e) => e.type === 'gear' || e.type === 'join'), pond.snapshot()]);
  assert.ok(!sent.includes('bonus') && !sent.includes(String(config.gear.bonus)));
});

test('đạo cụ: mỗi quà ra đúng đạo cụ, không tạo lượt giật, không lộ hệ số xuống màn hình', () => {
  const { pond, events } = make();
  assert.equal(pond.gift(who(1), { name: 'Friendship Necklace', coins: 10 }, 1), 'net');
  assert.equal(pond.gift(who(1), { name: 'Perfume', coins: 20 }, 1), 'bait');
  assert.equal(pond.gift(who(1), { name: 'Little Crown', coins: 99 }, 1), 'vip');
  assert.equal(pond.gift(who(1), { name: 'Paper Crane', coins: 99 }, 1), 'charm');
  assert.equal(pond.gift(who(1), { name: 'Corgi', coins: 299 }, 1), 'otter');
  assert.equal(pond.queue.length, 0);
  assert.deepEqual(pond.snapshot().players[0].perks, { bait: config.props.bait.pulls, net: 1, charm: 1, vip: true, otter: true });
  const sent = JSON.stringify(events.filter((e) => ['prop', 'perks', 'join'].includes(e.type)));
  assert.ok(!sent.includes('kgMul') && !sent.includes('bonus'));
});

test('mồi câu: cá nặng hơn đúng số lần, combo cộng thêm lượt, không áp dụng cho cá mập', () => {
  const { pond } = make({ random: () => 0.1 });
  pond.gift(who(1), { name: 'Perfume', coins: 20 }, 1);
  pond.gift(who(1), { name: 'Rose', coins: 1 }, config.props.bait.pulls + 1);
  const kgs = pond.queue[0].results.map((r) => r.kg);
  assert.equal(kgs[0], 1.7, '(1 + 0,1) * 1,5 làm tròn');
  assert.equal(kgs.at(-1), 1.1, 'hết mồi thì về như thường');
  assert.equal(pond.perks.get('u1').bait, 0);
  pond.gift(who(2), { name: 'Perfume', coins: 20 }, 2);
  assert.equal(pond.perks.get('u2').bait, config.props.bait.pulls * 2);
  pond.gift(who(2), { name: 'Gift Box', coins: 100 }, 1);
  assert.equal(pond.perks.get('u2').bait, config.props.bait.pulls * 2, 'cá mập không tốn mồi');
  assert.equal(pond.queue.at(-1).results[0].kg, 110);
});

test('lưới cá: lần giật tới kèm một con cá chắc chắn dính, dùng một lần', () => {
  const { pond } = make({ random: () => 0.99 });
  pond.gift(who(1), { name: 'Friendship Necklace', coins: 10 }, 1);
  pond.gift(who(1), { name: 'Rose', coins: 1 }, 1);
  const job = pond.queue[0];
  assert.equal(job.count, 2);
  assert.equal(job.results[0].ok, false, 'con chính vẫn theo tỉ lệ');
  assert.equal(job.results[1].ok, true, 'con kèm chắc chắn dính');
  assert.ok(config.tiers[config.props.net.tier].fish.some((f) => f.name === job.results[1].fish));
  pond.gift(who(1), { name: 'Rose', coins: 1 }, 1);
  assert.equal(pond.queue[0].count, 3, 'lần sau không còn con kèm');
});

test('ghế VIP và rái cá giữ chỗ: ngồi im không bị về, không bị đẩy ra; hết giờ còn trọn thời gian chờ', () => {
  const small = { ...config, seats: 4 };
  const { pond, advance } = make({ cfg: small });
  pond.gift(who(1), { name: 'Little Crown', coins: 99 }, 1);
  for (const n of [2, 3, 4]) pond.comment(who(n), 'câu');
  advance((config.idleLeaveSeconds + 5) * 1000);
  pond.tick();
  assert.ok(pond.players.has('u1'), 'VIP không bị mời về');
  assert.ok(!pond.players.has('u2'));
  for (const n of [2, 3, 4]) pond.comment(who(n), 'câu');
  advance(61_000);
  pond.comment(who(9), 'câu');
  assert.ok(pond.players.has('u1'), 'VIP không bị người mới đẩy ra');
  advance(config.props.vip.seconds * 1000);
  pond.tick();
  assert.ok(pond.players.has('u1'), 'vừa hết giờ VIP vẫn còn thời gian chờ');
  assert.equal(pond.snapshot().players.find((p) => p.key === pond.players.get('u1').key).perks, null);
  advance((config.idleLeaveSeconds + 1) * 1000);
  pond.tick();
  assert.ok(!pond.players.has('u1'));
});

test('rái cá tha cá đúng nhịp, cộng thẳng vào bảng, hết giờ thì thôi; không chiếm lượt giật', () => {
  const { pond, of, advance } = make({ random: () => 0.5 });
  pond.gift(who(1), { name: 'Corgi', coins: 299 }, 1);
  const every = config.props.otter.everySeconds * 1000;
  advance(every - 1);
  pond.tick();
  assert.equal(of('otter').length, 0);
  advance(1);
  pond.tick();
  assert.equal(of('otter').length, 1);
  assert.equal(pond.queue.length, 0);
  assert.equal(pond.hooked, 0, 'không tính vào bộ đếm cá hiếm');
  assert.equal(pond.board()[0].kg, of('otter')[0].kg);
  for (let n = 0; n < config.props.otter.seconds * 1000; n += every) {
    advance(every);
    pond.tick();
  }
  const caught = of('otter').length;
  assert.ok(caught >= config.props.otter.seconds / config.props.otter.everySeconds - 1);
  advance(every * 3);
  pond.tick();
  assert.equal(of('otter').length, caught, 'hết giờ không tha cá nữa');
});

test('bùa cá hiếm: giật tính nhiều lần vào bộ đếm, tăng tỉ lệ đúng con cá hiếm rồi dùng hết', () => {
  // random 0.45: trên mức 0.3 của cá hiếm, dưới mức 0.6 khi có bùa
  const { pond, advance, of } = make({ random: () => 0.45 });
  pond.setHooked(config.rare.every - 1);
  pond.gift(who(1), { name: 'Paper Crane', coins: 99 }, 1);
  pond.gift(who(1), { name: 'Rose', coins: 1 }, 1);
  assert.equal(pond.queue[0].rareStep, config.props.charm.rareStep);
  advance(2000);
  pond.tick();
  assert.equal(of('pull').at(-1).tier, 'rare');
  assert.equal(of('pull').at(-1).results[0].ok, true);
  assert.equal(pond.perksView('u1')?.charm ?? 0, 0);
  const plain = make({ random: () => 0.45 });
  plain.pond.setHooked(config.rare.every - 1);
  plain.pond.gift(who(1), { name: 'Rose', coins: 1 }, 1);
  plain.advance(2000);
  plain.pond.tick();
  assert.equal(plain.of('pull').at(-1).results[0].ok, false, 'không bùa thì 0.3');
});

test('Vua Câu: top 1 đổi thì báo xuống màn hình, người mới vào biết mình là top 1', () => {
  const { pond, of, advance } = make({ random: () => 0.1 });
  pond.gift(who(1), { name: 'Rose', coins: 1 }, 1);
  for (let n = 0; n < 6; n++) {
    advance(1000);
    pond.tick();
  }
  assert.equal(of('king').at(-1).key, pond.players.get('u1').key);
  assert.equal(pond.snapshot().players[0].king, true);
  pond.gift(who(2), { name: 'Lucky Pig', coins: 10 }, 1);
  for (let n = 0; n < 6; n++) {
    advance(1000);
    pond.tick();
  }
  assert.equal(of('king').at(-1).key, pond.players.get('u2').key);
  pond.reset();
  assert.equal(of('king').at(-1).key, null);
});

// Chạy hết hàng chờ (mỗi bước 1 giây).
function drain(pond, advance, steps = 400) {
  for (let n = 0; n < steps && (pond.current || pond.queue.length); n++) {
    advance(1000);
    pond.tick();
  }
}

test('con cá thứ rare.every là cá hiếm, quay cận riêng, tỉ lệ rare.successRate', () => {
  const every = config.rare.every;
  // random 0.2: dưới 0.3 nên cá hiếm dính, dưới 0.6 nên cá thường cũng dính
  const { pond, of, advance } = make({ random: () => 0.2 });
  pond.comment(who(1), 'câu');
  pond.gift(who(1), { name: 'Rose', coins: 1 }, every - 3);
  drain(pond, advance);
  assert.deepEqual(of('rare').at(-1), { type: 'rare', n: every - 3, every });
  // combo 5 hoa hồng vượt mốc: 2 con thường, 1 cá hiếm riêng, 2 con còn lại
  pond.gift(who(1), { name: 'Rose', coins: 1 }, 5);
  drain(pond, advance);
  const pulls = of('pull').slice(-3);
  assert.deepEqual(pulls.map((p) => [p.tier, p.count]), [['small', 2], ['rare', 1], ['small', 2]]);
  const fish = pulls[1].results[0];
  assert.ok(fish.ok && fish.kg >= 50 && fish.kg <= 100);
  assert.ok(config.tiers.rare.fish.some((f) => f.name === fish.fish));
  assert.equal(pulls[1].ms, config.rare.focusMs);
  assert.deepEqual(of('rare').slice(-3).map((r) => r.n), [every - 1, 0, 2]);
  assert.equal(pond.snapshot().rare.n, 2);
});

test('cá hiếm chỉ dính 30%, cỏ ba lá không tăng', () => {
  const { pond, of, advance } = make({ random: () => 0.5 });
  pond.comment(who(1), 'câu');
  pond.gift(who(1), { name: 'Clover', coins: 1 }, 1);
  pond.setHooked(config.rare.every * 7 - 1);
  pond.like(who(1), 50);
  drain(pond, advance);
  const pull = of('pull').at(-1);
  assert.equal(pull.tier, 'rare');
  assert.equal(pull.results[0].ok, false);
  assert.equal(of('reveal').at(-1).wins, 0);
  assert.equal(pond.rareShown, config.rare.every * 7);
});

test('cá mập luôn quay cận sharkFocusMs, kể cả khi đông lượt chờ', () => {
  const { pond, of, advance } = make();
  for (let n = 1; n <= config.rushQueue + 2; n++) pond.comment(who(n), 'câu');
  advance(config.landMs);
  pond.gift(who(1), { name: 'Gift Box', coins: 100 }, 1);
  for (let n = 2; n <= config.rushQueue + 2; n++) pond.gift(who(n), { name: 'Rose', coins: 1 }, 1);
  pond.tick();
  assert.equal(of('pull')[0].tier, 'shark');
  assert.equal(of('pull')[0].ms, config.sharkFocusMs);
  advance(config.sharkFocusMs);
  pond.tick();
  assert.equal(of('pull')[1].ms, config.rushFocusMs, 'lượt thường vẫn rút ngắn khi đông');
});

test('lượt giật đúng con cá hiếm tách phần còn lại về đầu hàng', () => {
  const { pond, of, advance } = make({ random: () => 0.1 });
  pond.comment(who(1), 'câu');
  pond.comment(who(2), 'câu');
  pond.setHooked(config.rare.every - 1);
  pond.gift(who(1), { name: 'Rose', coins: 1 }, 3);
  pond.gift(who(2), { name: 'Rose', coins: 1 }, 1);
  drain(pond, advance);
  assert.deepEqual(of('pull').map((p) => [p.name, p.tier, p.count]), [['Người 1', 'rare', 1], ['Người 1', 'small', 2], ['Người 2', 'small', 1]]);
});
