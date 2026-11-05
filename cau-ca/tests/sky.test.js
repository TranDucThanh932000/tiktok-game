import test from 'node:test';
import assert from 'node:assert/strict';
import { Sky, WEATHER } from '../src/sky.js';

function make(cfg = {}, random = () => 0.5) {
  let t = 1_000_000_000;
  const sky = new Sky({ cycleMinutes: 24, weatherSeconds: [40, 150], ...cfg }, { now: () => t, random });
  return { sky, advance: (ms) => (t += ms) };
}

test('thời tiết tự đổi khi hết lượt, không lặp lại kiểu cũ', () => {
  let i = 0;
  const seq = [0.1, 0.9, 0.3, 0.7, 0.5, 0.2, 0.8];
  const { sky, advance } = make({}, () => seq[i++ % seq.length]);
  const seen = new Set([sky.weather]);
  for (let n = 0; n < 20; n++) {
    const before = sky.weather;
    assert.equal(sky.tick(), false, 'chưa hết giờ thì giữ nguyên');
    advance(150_001);
    assert.equal(sky.tick(), true);
    assert.notEqual(sky.weather, before);
    assert.ok(sky.weather in WEATHER);
    seen.add(sky.weather);
  }
  assert.ok(seen.size >= 3, 'có nhiều kiểu thời tiết');
});

test('thời lượng mỗi kiểu nằm trong weatherSeconds', () => {
  const { sky } = make({}, () => 0.999);
  assert.ok(sky.snapshot().left <= 150_000 && sky.snapshot().left >= 40_000);
});

test('trọng số 0 thì không bao giờ ra kiểu đó', () => {
  const { sky, advance } = make({ weather: { clear: 1, rain: 1, storm: 0 } }, Math.random);
  for (let n = 0; n < 50; n++) {
    advance(200_000);
    sky.tick();
    assert.ok(['clear', 'rain'].includes(sky.weather));
  }
});

test('ép thời tiết từ bảng điều khiển giữ nguyên tới khi về tự động', () => {
  const { sky, advance } = make();
  assert.ok(sky.force('storm'));
  advance(10_000_000);
  assert.equal(sky.tick(), false);
  assert.equal(sky.weather, 'storm');
  assert.equal(sky.snapshot().left, null);
  assert.equal(sky.force('mưa đá'), false, 'tên lạ bị từ chối');
  sky.force('auto');
  advance(200_000);
  assert.equal(sky.tick(), true);
  assert.notEqual(sky.weather, 'storm');
});

test('giờ chạy theo cycleMinutes, chỉnh giờ và dừng giờ', () => {
  const { sky, advance } = make({ cycleMinutes: 24 }); // 1 phút = 1 giờ trong game
  sky.setHour(6);
  assert.ok(Math.abs(sky.hour() - 6) < 1e-9);
  advance(60_000 * 3);
  assert.ok(Math.abs(sky.hour() - 9) < 1e-9);
  advance(60_000 * 20);
  assert.ok(Math.abs(sky.hour() - 5) < 1e-9, 'qua nửa đêm thì quay về 0');
  sky.freeze(true);
  advance(60_000 * 5);
  assert.ok(Math.abs(sky.hour() - 5) < 1e-9);
  assert.equal(sky.snapshot().msPerHour, 0);
  sky.setHour(22);
  assert.equal(sky.hour(), 22);
  sky.freeze(false);
  advance(60_000);
  assert.ok(Math.abs(sky.hour() - 23) < 1e-9);
});
