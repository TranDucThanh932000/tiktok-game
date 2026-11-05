import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MOVES, N, NEUTRAL, evalMove, blendPose, I } from '../public/js/moves.js';
import { ChoreographyPlayer } from '../public/js/choreo.js';
import { generateAvatar, resolveAvatar } from '../public/js/avatar.js';

const cfg = JSON.parse(readFileSync(path.join(import.meta.dirname, '..', 'config.json'), 'utf8'));

test('mọi move trong choreography đều có trong thư viện', () => {
  for (const c of cfg.choreographies) {
    for (const p of c.phases) for (const m of p.moves) assert.ok(MOVES[m], `${c.id}: thiếu move ${m}`);
  }
});

test('mỗi tier có ít nhất 3 choreography', () => {
  for (const t of cfg.tiers) assert.ok(cfg.choreographies.filter((c) => c.tier === t.tier).length >= 3, `tier ${t.tier}`);
});

test('mọi move cho ra số hữu hạn ở nhiều thời điểm', () => {
  const p = new Float32Array(N);
  for (const [id] of Object.entries(MOVES)) {
    for (let b = 0; b < 12; b += 0.37) {
      evalMove(id, p, b, { lb: b, e: 1, v: 0.3 });
      for (let i = 0; i < N; i++) assert.ok(Number.isFinite(p[i]), `${id} kênh ${i} tại beat ${b}`);
    }
  }
});

test('trộn góc quay đi đường ngắn nhất', () => {
  const a = NEUTRAL.slice();
  const b = NEUTRAL.slice();
  a[I.spin] = Math.PI * 2 - 0.1;
  b[I.spin] = 0.1;
  const out = new Float32Array(N);
  blendPose(out, a, b, 0.5);
  assert.ok(Math.abs(Math.cos(out[I.spin]) - 1) < 0.01);
});

test('ChoreographyPlayer phát event đúng thứ tự và phase phủ kín thời gian', () => {
  const choreo = cfg.choreographies.find((c) => c.tier === 4);
  const session = { performingAt: 1000, finaleAt: 1000 + 16000 * 0.82, returningAt: 1000 + 16000 };
  const player = new ChoreographyPlayer(session, choreo, 124);
  const events = [];
  let lastPhase = null;
  for (let t = 0; t <= 18000; t += 50) {
    events.push(...player.events(t));
    const phase = player.phaseAt(t);
    if (t >= 1000 && t < session.returningAt) {
      assert.ok(phase, `không có phase tại ${t}`);
      assert.ok(player.moveAt(t, phase)?.id, `không có move tại ${t}`);
    }
    if (phase) lastPhase = phase.phase;
  }
  assert.equal(lastPhase, 'finale');
  assert.deepEqual(events, ['PerformanceStarted', 'IntroCompleted', 'HighlightStarted', 'FreezeStarted', 'FinaleStarted', 'PerformanceCompleted']);
});

test('avatar tái tạo được bằng seed và khác nhau giữa người dùng', () => {
  const a1 = generateAvatar('user-1', 'A');
  const a2 = generateAvatar('user-1', 'A');
  assert.deepEqual(a1, a2);
  const looks = new Set();
  for (let i = 0; i < 50; i++) {
    const s = resolveAvatar(generateAvatar(`u${i}`, 'x'));
    looks.add(`${s.hair}|${s.top}|${s.bottom}|${s.colors.top}|${s.skin}`);
  }
  assert.ok(looks.size >= 45, `chỉ có ${looks.size} kiểu khác nhau`);
});
