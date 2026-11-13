import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MC, parseLine } from '../src/mc.js';

const lines = JSON.parse(readFileSync(new URL('../mc.json', import.meta.url), 'utf8'));
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

function fakeVoice() {
  return { enabled: true, clip: async (t) => `${Buffer.from(t).toString('hex').slice(0, 16).padEnd(16, '0')}`, ready: () => null, duration: () => 1000, audio: () => null };
}

test('tách câu thành mẩu cố định và chỗ điền tên, bỏ mẩu chỉ có dấu câu', () => {
  const l = parseLine('nu: Ối giời ơi! {ten} vừa giành vai cô dâu từ tay {cu}!');
  assert.equal(l.speaker, 'nu');
  assert.deepEqual(l.segments, ['Ối giời ơi!', { key: 'ten' }, 'vừa giành vai cô dâu từ tay', { key: 'cu' }]);
  assert.deepEqual(parseLine('nam: {ten}, chúc bạn vui').segments, [{ key: 'ten' }, 'chúc bạn vui']);
});

test('mỗi tình huống trong game đều có lời, mỗi nghi thức đều có lời', () => {
  for (const key of ['claim_groom', 'claim_bride', 'steal_groom', 'steal_bride', 'register_groom', 'register_bride', 'cheer', 'cancel', 'ceremony_start', 'restart', 'farewell', 'gold_big', 'gold_huge', 'goal', 'idle_empty', 'idle_groom', 'idle_bride', 'idle_couple']) {
    assert.ok(lines[key]?.length >= 3, key);
  }
  for (const step of config.ceremony.steps) assert.ok(lines[`step_${step.id}`]?.length >= 3, step.id);
});

test('không lặp lại cách nói vừa dùng', () => {
  const mc = new MC({ lines, voices: { nam: fakeVoice(), nu: fakeVoice() }, emit() {} });
  const n = mc.lines.claim_groom.length;
  const picks = Array.from({ length: 40 }, () => mc.lines.claim_groom.indexOf(mc.pick('claim_groom')));
  const window = Math.floor(n / 2);
  for (let i = 1; i < picks.length; i++) assert.ok(!picks.slice(Math.max(0, i - window), i).includes(picks[i]), `lặp ${picks[i]} ở lượt ${i}`);
});

test('đọc lần lượt, không chồng câu; tên khó đọc được làm sạch', async () => {
  let t = 0;
  const said = [];
  const mc = new MC({ lines, voices: { nam: fakeVoice(), nu: fakeVoice() }, emit: (m) => said.push(m), now: () => t });
  mc.say('steal_bride', { ten: '𝓜𝓪𝓲 ❤️', cu: 'Lan 2k5' }, { priority: 3 });
  mc.say('cancel', { ten: 'Phá' }, { priority: 3 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(said.length, 1);
  assert.ok(said[0].clips.length > 0);
  t += 60_000;
  await mc.pump();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(said.length, 1, 'câu hủy hôn hết hạn khi chờ quá lâu thì bỏ');
});

test('không chen câu nói lúc vắng khi đang chuẩn bị câu chính', async () => {
  let t = 1_000_000;
  const said = [];
  const slow = { ...fakeVoice(), clip: (text) => new Promise((r) => setTimeout(() => r('abcdef0123456789'), 30)) };
  const mc = new MC({ lines, voices: { nam: slow, nu: slow }, emit: (m) => said.push(m), now: () => t, idleMs: 1000 });
  t += 5000;
  mc.say('claim_groom', { ten: 'Huy' }, { priority: 3 });
  mc.tick({ groom: { name: 'Huy' }, bride: null, ceremony: null });
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(said.map((m) => m.event), ['claim_groom']);
});
