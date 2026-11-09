import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVoice } from '../src/voice.js';

// Vbee giả: mỗi yêu cầu treo tới khi test gọi finish(text).
function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dua-tinh-voice-'));
  const started = [];
  const jobs = new Map();
  const voice = createVoice({
    enabled: true,
    voice: 'test',
    speed: 1,
    dir,
    concurrency: 3,
    synthesize: (text) =>
      new Promise((resolve) => {
        started.push(text);
        jobs.set(text, () => resolve(Buffer.from(text)));
      }),
  });
  const finish = async (text) => {
    jobs.get(text)();
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { voice, started, finish, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('tạo sẵn hàng loạt vẫn chừa một chỗ cho tên người tặng quà', async () => {
  const ctx = setup();
  for (let i = 0; i < 10; i++) ctx.voice.clip(`câu ${i}`, { background: true });
  assert.deepEqual(ctx.started, ['câu 0', 'câu 1']);
  ctx.voice.clip('Lan', { urgent: true });
  assert.deepEqual(ctx.started, ['câu 0', 'câu 1', 'Lan']);
  ctx.cleanup();
});

test('mẩu đang xếp hàng tạo sẵn mà cần đọc ngay thì được chen lên trước', async () => {
  const ctx = setup();
  for (let i = 0; i < 10; i++) ctx.voice.clip(`câu ${i}`, { background: true });
  const waitingFor = ctx.voice.clip('câu 7', { urgent: true });
  assert.deepEqual(ctx.started, ['câu 0', 'câu 1', 'câu 7']);
  await ctx.finish('câu 7');
  assert.ok(await waitingFor);
  assert.ok(ctx.voice.ready('câu 7'));
  // Xong việc gấp thì chỗ chừa riêng để trống, việc tạo sẵn vẫn chạy ở hai chỗ còn lại.
  await ctx.finish('câu 0');
  assert.deepEqual(ctx.started, ['câu 0', 'câu 1', 'câu 7', 'câu 2']);
  ctx.cleanup();
});
