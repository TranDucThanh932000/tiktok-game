import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createCamera } from '../public/js/camera.js';

// Bản đồ giả ghi lại tỉnh đang được focus. Đồng hồ và setTimeout giả để chạy nhanh.
function setup(options = {}) {
  mock.timers.enable({ apis: ['setTimeout'] });
  let clock = 0;
  const shown = [];
  const map = {
    focused: null,
    homeCount: 0,
    focus(id) {
      this.focused = id;
      shown.push(id);
    },
    unfocus() {
      this.focused = null;
      this.homeCount++;
    },
  };
  const camera = createCamera({ map, options: { holdMs: 6000, minDwellMs: 2500, ...options }, now: () => clock });
  return {
    camera,
    map,
    shown,
    run(ms) {
      clock += ms;
      mock.timers.tick(ms);
    },
  };
}

test.afterEach(() => mock.timers.reset());

test('có quà thì bay tới tỉnh, combo giữ camera, hết combo thì lùi về toàn cảnh', () => {
  const ctx = setup();
  ctx.camera.focus('nam-dinh');
  assert.equal(ctx.map.focused, 'nam-dinh');
  ctx.run(5000);
  ctx.camera.focus('nam-dinh');
  ctx.run(5000);
  assert.equal(ctx.map.focused, 'nam-dinh');
  assert.deepEqual(ctx.shown, ['nam-dinh'], 'combo cùng tỉnh không bay lại');
  ctx.run(1100);
  assert.equal(ctx.map.focused, null);
  assert.equal(ctx.map.homeCount, 1);
});

test('tỉnh khác tặng quà: chờ đủ minDwell mới chuyển, nhiều tỉnh chờ thì lấy tỉnh mới nhất', () => {
  const ctx = setup();
  ctx.camera.focus('ha-noi');
  ctx.run(500);
  ctx.camera.focus('ca-mau');
  ctx.camera.focus('nghe-an');
  assert.equal(ctx.map.focused, 'ha-noi');
  ctx.run(2100);
  assert.equal(ctx.map.focused, 'nghe-an');
  assert.deepEqual(ctx.shown, ['ha-noi', 'nghe-an']);
});

test('MC đang đọc tên người tặng thì khóa camera ở tỉnh đó tới khi nói xong', () => {
  const ctx = setup();
  ctx.camera.focus('ha-noi', { lockMs: 20000 });
  ctx.run(3000);
  ctx.camera.focus('ca-mau');
  ctx.run(5000);
  assert.equal(ctx.map.focused, 'ha-noi');
  ctx.camera.unlock('ha-noi');
  ctx.run(100);
  assert.equal(ctx.map.focused, 'ca-mau');
});

test('comment chỉ focus khi camera đang rảnh; tắt camera thì không làm gì', () => {
  const ctx = setup();
  ctx.camera.focus('ha-noi');
  ctx.camera.focus('ca-mau', { soft: true });
  ctx.run(3000);
  assert.equal(ctx.map.focused, 'ha-noi');
  mock.timers.reset();

  const off = setup({ enabled: false });
  off.camera.focus('ha-noi');
  assert.equal(off.map.focused, null);
});

test('vòng mới: lùi về toàn cảnh ngay', () => {
  const ctx = setup();
  ctx.camera.focus('ha-noi');
  ctx.camera.reset();
  assert.equal(ctx.map.focused, null);
  assert.equal(ctx.map.homeCount, 1);
});
