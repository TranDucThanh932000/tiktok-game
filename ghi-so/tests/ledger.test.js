import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Ledger } from '../src/ledger.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const who = (name) => ({ id: name, name, avatar: `https://x/${name}.png` });

function setup() {
  const clock = { t: 1000 };
  const events = [];
  const ledger = new Ledger(config, { now: () => clock.t, random: () => 0, emit: (msg) => events.push(msg) });
  const writes = () => events.filter((msg) => msg.type === 'write').map((msg) => msg.job);
  // Chạy hết tờ đang viết rồi mở tờ kế tiếp.
  const nextJob = () => {
    ledger.tick();
    const job = ledger.job;
    if (job) clock.t += job.total;
    return job;
  };
  return { clock, events, ledger, writes, nextJob };
}

const kinds = (job) => job.stages.map((stage) => stage.kind);

test('đủ 100 tim mới được ghi tên, chỉ viết tên', () => {
  const { ledger, nextJob } = setup();
  assert.equal(ledger.like(who('Lan'), 99).earned, false);
  assert.equal(ledger.size, 0);
  assert.equal(ledger.like(who('Lan'), 1).earned, true);
  assert.deepEqual(kinds(nextJob()), ['sheet', 'name', 'seal', 'hold']);
});

test('mỗi mức xu có đúng nội dung trên tờ sớ', () => {
  const cases = [
    [1, ['sheet', 'avatar', 'name', 'seal', 'hold']],
    [5, ['sheet', 'avatar', 'name', 'wish', 'seal', 'hold']],
    [10, ['sheet', 'avatar', 'name', 'wish', 'thanks', 'seal', 'hold']],
    [500, ['sheet', 'avatar', 'name', 'wish', 'thanks', 'seal', 'hold']],
  ];
  for (const [coins, expected] of cases) {
    const { ledger, nextJob } = setup();
    ledger.gift(who('Nam'), coins);
    assert.deepEqual(kinds(nextJob()), expected, `${coins} xu`);
  }
});

test('10 xu cảm ơn lâu hơn 5 xu, 5 xu lâu hơn 1 xu', () => {
  const total = (coins) => {
    const { ledger, nextJob } = setup();
    ledger.gift(who('Nam'), coins);
    return nextJob().total;
  };
  assert.ok(total(10) > total(5));
  assert.ok(total(5) > total(1));
});

test('quà combo gộp vào một tờ và tự lên hạng', () => {
  const { ledger, nextJob } = setup();
  assert.equal(ledger.gift(who('Nam'), 1).upgraded, false);
  ledger.gift(who('Nam'), 1, 3);
  assert.equal(ledger.gift(who('Nam'), 1).upgraded, true);
  assert.equal(ledger.size, 1);
  const job = nextJob();
  assert.equal(job.tier, 'wish');
  assert.equal(job.gifts, 5);
});

test('xu cao viết trước, cùng hạng thì ai đến trước viết trước', () => {
  const { ledger, nextJob } = setup();
  ledger.like(who('Tim'), 100);
  ledger.gift(who('A'), 1);
  ledger.gift(who('B'), 1);
  ledger.gift(who('C'), 10);
  assert.deepEqual([nextJob(), nextJob(), nextJob(), nextJob()].map((job) => job.name), ['C', 'A', 'B', 'Tim']);
});

test('người thả tim không bị xu chen mãi: cứ sau fairEvery tờ xu được một lượt', () => {
  const { ledger, nextJob } = setup();
  ledger.like(who('Tim'), 100);
  for (let i = 0; i < config.fairEvery + 2; i++) ledger.gift(who(`X${i}`), 1);
  const names = [];
  for (let i = 0; i <= config.fairEvery; i++) names.push(nextJob().name);
  assert.equal(names.at(-1), 'Tim');
  assert.ok(names.slice(0, -1).every((name) => name !== 'Tim'));
});

test('đang chờ thì tim không tạo thêm tờ, viết xong tim tiếp theo được ghi tiếp', () => {
  const { ledger, nextJob } = setup();
  ledger.like(who('Lan'), 100);
  assert.equal(ledger.like(who('Lan'), 500).earned, false);
  assert.equal(ledger.size, 1);
  nextJob();
  ledger.tick();
  assert.equal(ledger.like(who('Lan'), 1).earned, true);
});

test('xu viết rồi mới gửi thêm thì có tờ mới', () => {
  const { ledger, writes, nextJob } = setup();
  ledger.gift(who('Nam'), 1);
  ledger.tick();
  ledger.gift(who('Nam'), 1);
  assert.equal(ledger.size, 1);
  nextJob();
  nextJob();
  assert.equal(writes().length, 2);
});

test('hàng chờ dài thì viết nhanh hơn, tờ chỉ có tên tăng tốc nhiều hơn', () => {
  const measure = (backlog, addTarget) => {
    const { ledger, nextJob } = setup();
    addTarget(ledger);
    for (let i = 0; i < backlog; i++) ledger.like(who(`N${i}`), 100);
    return nextJob().total;
  };
  const free = (ledger) => ledger.like(who('Lan'), 100);
  const paid = (ledger) => ledger.gift(who('Lan'), 1);
  assert.ok(measure(60, free) < measure(0, free) * 0.5);
  assert.ok(measure(60, paid) > measure(0, paid) * 0.5);
  assert.ok(measure(60, paid) < measure(0, paid));
});

test('danh sách câu trong config không có câu nào trùng nhau', () => {
  for (const list of [config.wishes, config.thanks]) assert.equal(new Set(list).size, list.length);
});

test('dùng hết cả bộ câu rồi mới lặp, lúc xáo lại cũng không lặp ngay câu vừa dùng', () => {
  for (const [list, n] of [[config.wishes, config.wishes.length], [config.thanks, config.thanks.length]]) {
    for (const random of [() => 0, () => 0.999, Math.random]) {
      const ledger = new Ledger(config, { now: () => 0, random });
      const drawn = Array.from({ length: n * 4 }, () => ledger.pick(list));
      for (let round = 0; round < 4; round++) assert.equal(new Set(drawn.slice(round * n, (round + 1) * n)).size, n);
      drawn.forEach((text, i) => assert.ok(i === 0 || text !== drawn[i - 1]));
    }
  }
});

test('tờ 10 xu lấy lời chúc và lời đa tạ từ hai bộ riêng, các tờ liên tiếp không trùng lời', () => {
  const { ledger, nextJob } = setup();
  const seen = { wish: new Set(), thanks: new Set() };
  const rounds = Math.min(config.wishes.length, config.thanks.length);
  for (let i = 0; i < rounds; i++) {
    ledger.gift(who(`N${i}`), 10);
    const job = nextJob();
    for (const kind of ['wish', 'thanks']) {
      const { text } = job.stages.find((stage) => stage.kind === kind);
      assert.ok(!seen[kind].has(text), text);
      seen[kind].add(text);
    }
  }
});

// ---------- Tự chạy ----------
const people = JSON.parse(readFileSync(new URL('../demo-people.json', import.meta.url), 'utf8'));

function demoSetup(options = {}) {
  const clock = { t: 1000 };
  const events = [];
  const ledger = new Ledger(config, { now: () => clock.t, emit: (msg) => events.push(msg), people, ...options });
  const writes = () => events.filter((msg) => msg.type === 'write');
  // Tua đồng hồ từng bước 100 ms như server thật.
  const run = (ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 100) {
      clock.t += 100;
      ledger.tick();
    }
  };
  return { clock, events, ledger, writes, run };
}

test('bộ người có đủ 100 tên khác nhau, đủ ảnh, tên không quá 20 ký tự', () => {
  assert.equal(people.length, 100);
  assert.equal(new Set(people.map((person) => person.name)).size, 100);
  assert.equal(new Set(people.map((person) => person.avatar)).size, 100);
  for (const person of people) {
    assert.ok(Array.from(person.name).length <= 20, person.name);
    assert.ok(existsSync(new URL(`../public${person.avatar}`, import.meta.url)), person.avatar);
  }
});

test('vắng người thì tự viết, chưa tới giờ thì chưa viết', () => {
  const { ledger, writes, run } = demoSetup();
  ledger.tick();
  run((config.demo.idleSeconds - 1) * 1000);
  assert.equal(writes().length, 0);
  run(2000);
  assert.equal(writes().length, 1);
  assert.equal(writes()[0].job.demo, true);
});

test('người thật vào hàng chờ thì dừng tờ tự chạy ngay lượt kế tiếp, tờ dở không tính', () => {
  const { ledger, writes, run, clock } = demoSetup();
  run((config.demo.idleSeconds + 1) * 1000);
  assert.equal(ledger.job.demo, true);
  const writtenBefore = ledger.written;
  ledger.gift(who('Nguoi That'), 1);
  clock.t += 100;
  ledger.tick();
  const last = writes().at(-1);
  assert.equal(last.job.name, 'Nguoi That');
  assert.equal(last.job.demo, false);
  assert.equal(last.preempted, true);
  assert.equal(last.job.no, writtenBefore + 1);
  assert.equal(ledger.demoWritten, 0);
  assert.deepEqual(ledger.recent, []);
});

test('đủ tim cũng dừng tờ tự chạy; thả chưa đủ tim thì tờ tự chạy vẫn tiếp tục', () => {
  const { ledger, run, clock } = demoSetup();
  run((config.demo.idleSeconds + 1) * 1000);
  const name = ledger.job.name;
  ledger.like(who('Tim'), config.likesForName - 1);
  clock.t += 100;
  ledger.tick();
  assert.equal(ledger.job.name, name);
  ledger.like(who('Tim'), 1);
  clock.t += 100;
  ledger.tick();
  assert.equal(ledger.job.name, 'Tim');
});

test('đang viết cho người thật thì không tự chạy chen vào, viết xong mới chạy lại', () => {
  const { ledger, writes, run } = demoSetup();
  ledger.gift(who('That'), 10);
  ledger.tick();
  const total = ledger.job.total;
  run(total - 200);
  assert.equal(writes().length, 1);
  run(200 + config.demo.idleSeconds * 1000 + 200);
  assert.equal(writes().length, 2);
  assert.equal(writes()[1].job.demo, true);
  assert.equal(writes()[1].preempted, false);
});

test('tự chạy đi hết 100 người mới lặp, không viết mức đa tạ, số đã ghi tăng dần', () => {
  const { ledger, writes, run } = demoSetup();
  run(40 * 60 * 1000);
  const jobs = writes().map((msg) => msg.job);
  assert.ok(jobs.length >= 100, `chỉ có ${jobs.length} tờ`);
  assert.equal(new Set(jobs.slice(0, 100).map((job) => job.name)).size, 100);
  assert.ok(jobs.every((job) => job.tier !== 'thanks'));
  assert.ok(new Set(jobs.map((job) => job.tier)).size === 3);
  jobs.forEach((job, i) => assert.equal(job.no, i + 1));
  assert.ok(ledger.demoWritten >= 99);
});

test('cứ sau inviteEvery tờ thì nghỉ dài để tờ mời kịp hiện, các tờ khác nghỉ ngắn', () => {
  const { ledger, clock, run, writes } = demoSetup();
  const gaps = [];
  run((config.demo.idleSeconds + 1) * 1000);
  for (let i = 0; i < config.demo.inviteEvery * 3; i++) {
    const count = writes().length;
    run(ledger.job.startedAt + ledger.job.total - clock.t);
    const doneAt = clock.t;
    while (writes().length === count) run(100);
    gaps.push((clock.t - doneAt) / 1000);
  }
  const [, max] = config.demo.gapSeconds;
  gaps.forEach((gap, i) => {
    const long = (i + 1) % config.demo.inviteEvery === 0;
    if (long) assert.ok(gap >= config.demo.inviteSeconds - 0.3, `lần ${i + 1}: ${gap}`);
    else assert.ok(gap <= max + 0.3, `lần ${i + 1}: ${gap}`);
  });
});

test('tắt tự chạy, chế độ an toàn hoặc không có bộ người thì không tự viết', () => {
  const off = demoSetup();
  off.ledger.setDemo(false);
  off.run(60_000);
  assert.equal(off.writes().length, 0);
  const safe = demoSetup({ canDemo: () => false });
  safe.run(60_000);
  assert.equal(safe.writes().length, 0);
  const empty = demoSetup({ people: [] });
  empty.run(60_000);
  assert.equal(empty.writes().length, 0);
  // Tắt chế độ an toàn là chạy lại.
  let blocked = true;
  const resume = demoSetup({ canDemo: () => !blocked });
  resume.run(10_000);
  assert.equal(resume.writes().length, 0);
  blocked = false;
  resume.run(10_000);
  assert.ok(resume.writes().length >= 1);
});

test('tờ tự chạy mang theo chữ để đọc của người đó', () => {
  const only = people.find((person) => person.spoken);
  const { ledger, run } = demoSetup({ people: [only] });
  run((config.demo.idleSeconds + 1) * 1000);
  assert.equal(ledger.job.name, only.name);
  assert.equal(ledger.job.spoken, only.spoken);
});

test('tờ tự chạy không được lưu lại để viết tiếp sau khi bật lại server', () => {
  const { ledger, run } = demoSetup();
  run((config.demo.idleSeconds + 1) * 1000);
  assert.equal(ledger.job.demo, true);
  assert.deepEqual(ledger.exportState().queue, []);
});

test('số sớ tăng dần và chỉ giữ 3 tờ mới nhất', () => {
  const { ledger, nextJob, events } = setup();
  for (const name of ['A', 'B', 'C', 'D']) ledger.gift(who(name), 1);
  for (let i = 0; i < 4; i++) nextJob();
  ledger.tick();
  assert.equal(ledger.written, 4);
  const done = events.filter((msg) => msg.type === 'done').at(-1);
  assert.deepEqual(done.recent.map((row) => row.no), [4, 3, 2]);
});

test('tờ chỉ có tên không lưu avatar vào danh sách vừa ghi', () => {
  const { ledger, nextJob } = setup();
  ledger.like(who('Lan'), 100);
  nextJob();
  ledger.tick();
  assert.equal(ledger.recent[0].avatar, '');
});

test('lưu và nạp lại giữ cả tờ đang viết dở', () => {
  const first = setup();
  first.ledger.gift(who('Dang'), 10);
  first.ledger.tick();
  first.ledger.gift(who('Cho'), 1);
  const saved = JSON.parse(JSON.stringify(first.ledger.exportState()));
  const second = setup();
  second.ledger.importState(saved);
  assert.equal(second.ledger.size, 2);
  assert.deepEqual([second.nextJob().name, second.nextJob().name], ['Dang', 'Cho']);
});

test('xóa hàng chờ không làm hỏng tờ đang viết', () => {
  const { ledger, clock } = setup();
  ledger.gift(who('A'), 1);
  ledger.tick();
  ledger.gift(who('B'), 1);
  ledger.clearQueue();
  assert.equal(ledger.size, 0);
  assert.equal(ledger.job.name, 'A');
  clock.t += ledger.job.total;
  ledger.tick();
  assert.equal(ledger.written, 1);
  assert.equal(ledger.job, null);
});

test('hàng chờ gửi xuống trang game có giãn cách, không gửi theo từng tim', () => {
  const { ledger, events, clock } = setup();
  for (let i = 0; i < 20; i++) {
    ledger.like(who(`N${i}`), 100);
    ledger.tick();
    clock.t += 10;
  }
  assert.ok(events.filter((msg) => msg.type === 'queue').length <= 2);
});
