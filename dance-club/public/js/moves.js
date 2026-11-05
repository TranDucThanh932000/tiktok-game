// Thư viện động tác nhảy procedural (thay cho AnimationClip/Mixamo).
// Mỗi move là hàm (p, b, c): ghi tư thế vào mảng p theo beat b (nhịp nhạc toàn cục).
// c.lb = số beat kể từ khi move bắt đầu (cho động tác một lần như lộn ngược),
// c.e = độ "máu" (0.6..1.3), c.v = biến thể ngẫu nhiên 0..1 của từng dancer.
// Kênh tay: f = vung trước, o = giơ ngang ra ngoài, t = xoay, e = gập khuỷu (đối xứng trái/phải).
// Kênh chân: fx = bước ra ngoài, fy = nhấc lên, fz = bước tới, fp = mũi chân chúc xuống. Chân dùng IK.

export const CH = [
  'hx', 'hy', 'hz', 'hrx', 'hry', 'hrz',
  'sx', 'sy', 'sz', 'cx', 'cy', 'cz', 'nx', 'ny', 'nz',
  'lf', 'lo', 'lt', 'le', 'rf', 'ro', 'rt', 're',
  'lfx', 'lfy', 'lfz', 'lfp', 'rfx', 'rfy', 'rfz', 'rfp', 'ko',
  'jump', 'spin', 'flip', 'tilt', 'glow',
];
export const I = Object.fromEntries(CH.map((name, i) => [name, i]));
export const ANGLE_CHANNELS = [I.spin, I.flip, I.tilt];
export const N = CH.length;

export const NEUTRAL = new Float32Array(N);
NEUTRAL[I.hy] = -0.02;
NEUTRAL[I.lo] = NEUTRAL[I.ro] = 0.12;
NEUTRAL[I.le] = NEUTRAL[I.re] = 0.25;

const TAU = Math.PI * 2;
const { sin, cos, max, min, abs, floor, exp, PI } = Math;
const frac = (x) => x - floor(x);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const wave = (b, period = 1, phase = 0) => sin(TAU * (b / period + phase));
// 1 đúng phách, 0 ở giữa hai phách.
const dip = (b) => 0.5 + 0.5 * cos(TAU * b);
// Xung nhọn ngay phách rồi tắt dần (popping, nhún gắt).
const hit = (b, sharp = 7) => exp(-sharp * frac(b));
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

// Đặt nhiều kênh một lúc: set(p, {lo: 1, le: 0.5})
function set(p, values) {
  for (const k in values) p[I[k]] = values[k];
}

// Động tác dạng khung hình: chuyển nhanh sang tư thế kế tiếp ở đầu mỗi nhịp rồi giữ (popping, robot, vogue).
function keyed(keys, beatsPerKey = 1, snap = 0.2) {
  const frames = keys.map((k) => {
    const f = NEUTRAL.slice();
    for (const name in k) f[I[name]] = k[name];
    return f;
  });
  return (p, b) => {
    const pos = b / beatsPerKey;
    const i = floor(pos);
    const A = frames[(((i - 1) % frames.length) + frames.length) % frames.length];
    const B = frames[((i % frames.length) + frames.length) % frames.length];
    const k = smooth(frac(pos) / snap);
    for (let c = 0; c < N; c++) p[c] = A[c] + (B[c] - A[c]) * k;
  };
}

// Bước chân sang ngang theo nhịp (step-touch) dùng chung cho nhiều điệu.
function stepTouch(p, b, period, width) {
  const ph = (TAU * b) / period;
  const side = clamp(1.7 * sin(ph), -1, 1);
  const moving = cos(ph);
  p[I.hx] = width * side;
  p[I.lfx] = width * 0.9 * max(0, side);
  p[I.rfx] = width * 0.9 * max(0, -side);
  const lift = 0.07 * (1 - abs(side));
  p[I.lfy] = moving > 0 ? lift : 0;
  p[I.rfy] = moving < 0 ? lift : 0;
  return side;
}

// ------------------------------------------------------------------ Chill

function head_bob(p, b, c) {
  const d = dip(b);
  p[I.hy] = -0.03 - 0.05 * c.e * d;
  p[I.nx] = 0.18 * c.e * (d - 0.4);
  p[I.cx] = 0.05 * c.e * d;
  p[I.hx] = 0.04 * wave(b, 4, c.v);
  p[I.hrz] = -0.04 * wave(b, 4, c.v);
  p[I.lf] = 0.3 + 0.12 * wave(b, 2);
  p[I.rf] = 0.3 - 0.12 * wave(b, 2);
  p[I.le] = p[I.re] = 0.9 + 0.25 * d;
  p[I.lo] = p[I.ro] = 0.18;
  p[I.ny] = 0.15 * wave(b, 8, c.v);
}

function shoulder_groove(p, b, c) {
  const s = wave(b, 2);
  const d = dip(b);
  p[I.cz] = 0.12 * s * c.e;
  p[I.sz] = -0.05 * s;
  p[I.hx] = 0.05 * s;
  p[I.hrz] = 0.07 * s;
  p[I.lo] = 0.25 + 0.2 * max(0, s);
  p[I.ro] = 0.25 + 0.2 * max(0, -s);
  p[I.lf] = p[I.rf] = 0.55;
  p[I.le] = p[I.re] = 1.5;
  p[I.hy] = -0.05 - 0.03 * d;
  p[I.nx] = 0.08 * d;
  p[I.nz] = -0.08 * s;
  p[I.ny] = 0.15 * wave(b, 8, c.v);
}

function side_step(p, b, c) {
  const side = stepTouch(p, b, 4, 0.1);
  const d = dip(b);
  p[I.hy] = -0.04 - 0.05 * d * c.e;
  p[I.lf] = p[I.rf] = 0.65 + 0.3 * d;
  p[I.lo] = p[I.ro] = 0.4 - 0.28 * d;
  p[I.lt] = p[I.rt] = -0.4;
  p[I.le] = p[I.re] = 1.25;
  p[I.hrz] = -0.06 * side;
  p[I.nz] = 0.07 * side;
  p[I.nx] = 0.08 * d;
}

function body_wave(p, b, c) {
  const ph = (TAU * b) / 2;
  const e = c.e;
  p[I.hz] = 0.05 * sin(ph);
  p[I.sx] = 0.12 * e * sin(ph - 0.7);
  p[I.cx] = 0.18 * e * sin(ph - 1.4);
  p[I.nx] = 0.22 * e * sin(ph - 2.1);
  p[I.hy] = -0.07 - 0.04 * sin(ph + 0.5);
  p[I.lf] = p[I.rf] = 0.6 + 0.25 * sin(ph - 1.8);
  p[I.lo] = p[I.ro] = 0.45;
  p[I.le] = p[I.re] = 0.8 + 0.35 * sin(ph - 2.4);
  p[I.ny] = 0.12 * wave(b, 8, c.v);
}

function hand_groove(p, b, c) {
  const s = wave(b, 2);
  const d = dip(b);
  p[I.lf] = 1.3 + 0.5 * s;
  p[I.rf] = 1.3 - 0.5 * s;
  p[I.le] = 1.3 - 0.4 * s;
  p[I.re] = 1.3 + 0.4 * s;
  p[I.lo] = p[I.ro] = 0.3;
  p[I.hy] = -0.05 - 0.05 * d * c.e;
  p[I.nx] = 0.12 * d;
  p[I.cy] = 0.12 * s;
  p[I.hry] = -0.06 * s;
}

const FREESTYLE = [head_bob, hand_groove, shoulder_groove, side_step];
const tmpA = new Float32Array(N);
const tmpB = new Float32Array(N);
function freestyle(p, b, c) {
  const bar = floor(b / 4);
  const pick = (n) => FREESTYLE[(n * 7 + floor(c.v * 13)) % FREESTYLE.length];
  tmpA.set(NEUTRAL);
  tmpB.set(NEUTRAL);
  pick(bar)(tmpA, b, c);
  pick(bar + 1)(tmpB, b, c);
  const k = smooth((frac(b / 4) * 4 - 3.4) / 0.6);
  for (let i = 0; i < N; i++) p[i] = tmpA[i] + (tmpB[i] - tmpA[i]) * k;
  // Thỉnh thoảng giơ một tay "woo" ở phách 3.
  const woo = smooth(seg(frac(b / 8) * 8, 5.6, 6)) * (1 - smooth(seg(frac(b / 8) * 8, 7, 7.6)));
  if (woo > 0) {
    p[I.ro] += (2.6 - p[I.ro]) * woo;
    p[I.re] += (0.3 - p[I.re]) * woo;
    p[I.rf] += (0.3 - p[I.rf]) * woo;
  }
}

// ------------------------------------------------------------------ Reaction

function cheer(p, b, c) {
  const d = dip(b);
  p[I.lo] = p[I.ro] = 2.45 + 0.25 * d;
  p[I.lf] = p[I.rf] = 0.25;
  p[I.le] = p[I.re] = 0.25 + 0.45 * (1 - d);
  p[I.jump] = 0.07 * c.e * (0.5 - 0.5 * cos(TAU * b));
  p[I.hy] = -0.05 * d;
  p[I.nx] = -0.15;
  p[I.cx] = -0.06;
}

function clap(p, b, c) {
  const k = hit(b, 9);
  p[I.lf] = p[I.rf] = 1.15;
  p[I.lo] = p[I.ro] = 0.55 - 0.5 * k;
  p[I.lt] = p[I.rt] = -0.7;
  p[I.le] = p[I.re] = 1.1;
  p[I.hy] = -0.04 - 0.05 * dip(b) * c.e;
  p[I.nx] = 0.1 * dip(b);
}

function wave_hand(p, b, c) {
  head_bob(p, b, c);
  p[I.ro] = 2.55 + 0.35 * wave(b, 1);
  p[I.re] = 0.35;
  p[I.rf] = 0.2;
  p[I.rt] = 0.4;
  p[I.nz] = 0.1;
}

function jump_hype(p, b, c) {
  const air = 0.5 - 0.5 * cos(TAU * b);
  p[I.jump] = 0.2 * c.e * air;
  p[I.lfy] = p[I.rfy] = 0.12 * air;
  p[I.lfz] = p[I.rfz] = 0.05 * air;
  p[I.lo] = p[I.ro] = 2.3 + 0.4 * air;
  p[I.le] = p[I.re] = 0.5 + 0.8 * (1 - air);
  p[I.hy] = -0.1 * (1 - air);
  p[I.nx] = -0.1;
}

function point_at(p, b, c) {
  head_bob(p, b, c);
  p[I.rf] = 1.45;
  p[I.ro] = 0.25;
  p[I.re] = 0.05;
  p[I.lo] = 2.2 + 0.4 * dip(b);
  p[I.le] = 0.6;
  p[I.lf] = 0.2;
}

// ------------------------------------------------------------------ Performance: Casual / Groove

function two_step(p, b, c) {
  const side = stepTouch(p, b, 2, 0.13);
  const d = dip(b);
  p[I.hy] = -0.07 - 0.07 * d * c.e;
  p[I.lf] = 0.5 + 0.5 * side;
  p[I.rf] = 0.5 - 0.5 * side;
  p[I.le] = p[I.re] = 1.15;
  p[I.lo] = p[I.ro] = 0.3;
  p[I.cy] = 0.18 * side;
  p[I.nx] = 0.12 * d;
  p[I.hrz] = -0.05 * side;
}

function bounce_step(p, b, c) {
  const d = dip(b);
  const leg = floor(b) % 2 === 0 ? 1 : -1;
  const u = frac(b);
  const tap = sin(PI * u);
  p[I.hy] = -0.09 - 0.08 * d * c.e;
  if (leg > 0) set(p, { lfz: 0.18 * tap, lfy: 0.05 * tap });
  else set(p, { rfz: 0.18 * tap, rfy: 0.05 * tap });
  p[I.hx] = -0.04 * leg * tap;
  // Đẩy tay lên trần ("raise the roof").
  p[I.lf] = p[I.rf] = 0.2;
  p[I.lo] = p[I.ro] = 2.3;
  p[I.le] = p[I.re] = 1.7 - 0.7 * d;
  p[I.nx] = 0.15 * d;
  p[I.cy] = 0.12 * leg * tap;
}

function shuffle(p, b, c) {
  const u = frac(b);
  const leg = floor(b) % 2 === 0;
  const slideZ = 0.14 - 0.28 * u;
  const liftY = 0.26 * sin(PI * u) * c.e;
  const liftZ = -0.14 + 0.28 * smooth(u);
  if (leg) set(p, { lfz: slideZ, rfz: liftZ, rfy: liftY });
  else set(p, { rfz: slideZ, lfz: liftZ, lfy: liftY });
  p[I.hy] = -0.1 - 0.05 * (1 - sin(PI * u));
  p[I.hz] = 0.02;
  const arm = leg ? 1 : -1;
  p[I.lf] = 0.4 + 0.6 * arm * sin(PI * u);
  p[I.rf] = 0.4 - 0.6 * arm * sin(PI * u);
  p[I.le] = p[I.re] = 1.5;
  p[I.lo] = p[I.ro] = 0.2;
  p[I.sx] = 0.08;
  p[I.nx] = 0.1 * dip(b);
}

function roll_arms(p, b, c) {
  const ph = TAU * b;
  p[I.lf] = 1.1 + 0.28 * sin(ph);
  p[I.rf] = 1.1 + 0.28 * sin(ph + PI);
  p[I.le] = p[I.re] = 1.75;
  p[I.lo] = 0.12 + 0.1 * cos(ph);
  p[I.ro] = 0.12 + 0.1 * cos(ph + PI);
  p[I.lt] = p[I.rt] = -0.9;
  const side = stepTouch(p, b, 4, 0.09);
  p[I.hy] = -0.08 - 0.06 * dip(b) * c.e;
  p[I.cy] = 0.2 * side;
  p[I.nx] = 0.12 * dip(b);
  p[I.hrz] = -0.05 * side;
}

function hype_up(p, b, c) {
  const which = floor(b / 2) % 2 === 0;
  const d = dip(b);
  p[I.hy] = -0.08 - 0.06 * d * c.e;
  const point = { f: 1.35, o: 0.55, e: 0.05 };
  const fist = { f: 0.35, o: 0.3, e: 1.5 };
  const A = which ? point : fist;
  const B = which ? fist : point;
  set(p, { rf: A.f, ro: A.o, re: A.e + 0.2 * d, lf: B.f, lo: B.o, le: B.e });
  p[I.nx] = 0.2 * d;
  p[I.hry] = which ? -0.25 : 0.25;
  p[I.cy] = which ? -0.15 : 0.15;
  p[I.jump] = 0.06 * (0.5 - 0.5 * cos(TAU * b));
  stepTouch(p, b, 4, 0.06);
}

function spin(p, b, c) {
  const t = frac(c.lb / 4) * 4;
  const crouch = smooth(seg(t, 0, 0.8)) * (1 - smooth(seg(t, 1, 1.4)));
  const turn = smooth(seg(t, 1, 2.6));
  p[I.spin] = TAU * turn;
  p[I.hy] = -0.04 - 0.16 * crouch - 0.04 * dip(b);
  p[I.jump] = 0.08 * sin(PI * seg(t, 1, 2.6));
  const tuck = sin(PI * seg(t, 1, 2.6));
  p[I.lf] = p[I.rf] = 0.6 + 0.3 * tuck;
  p[I.lo] = p[I.ro] = 0.3 + 1.2 * smooth(seg(t, 2.4, 3)) - 0.2 * tuck;
  p[I.le] = p[I.re] = 1.7 * tuck + 0.2;
  p[I.lfy] = 0.06 * tuck;
  p[I.nx] = -0.1 * smooth(seg(t, 2.6, 3));
}

const pose_point_keys = { rf: 0.55, ro: 2.25, re: 0.02, rt: 0, lf: -0.25, lo: 0.75, le: 2.0, lt: -1.4, hx: 0.06, hrz: 0.09, hy: -0.06, nz: -0.12, ny: 0.15, nx: -0.08, rfx: 0.12, rfz: 0.05, rfp: 0.4, cz: -0.06 };
function pose_point(p, b, c) {
  set(p, pose_point_keys);
  p[I.cx] = 0.02 * sin(TAU * b * 0.25);
  p[I.hy] -= 0.01 * dip(b);
}

const pose_cool_keys = { lf: 1.05, rf: 1.05, le: 2.25, re: 2.25, lo: -0.15, ro: -0.15, lt: -1.2, rt: -1.2, sx: -0.1, cx: -0.05, nz: 0.15, ny: -0.2, nx: -0.05, hx: -0.05, hrz: -0.07, lfx: 0.06, rfx: -0.1, rfz: 0.12, hy: -0.04 };
function pose_cool(p, b, c) {
  set(p, pose_cool_keys);
  p[I.nx] += 0.06 * hit(b, 5);
}

const popKeys = [
  { ro: 1.55, re: 0, rf: 0, lo: 1.45, le: 1.6, lt: 1.4, ny: -0.5, hy: -0.08, cz: 0.08 },
  { lf: 1.45, rf: 1.45, le: 1.55, re: 1.55, lo: 0.15, ro: 0.15, ny: 0, hy: -0.12, cx: 0.1 },
  { lo: 0.45, ro: 0.45, le: 0.2, re: 0.2, cx: -0.22, hy: -0.18, nx: 0.25, lfx: 0.08, rfx: 0.08 },
  { lo: 1.55, le: 0, lf: 0, ro: 1.45, re: 1.6, rt: 1.4, ny: 0.5, hy: -0.08, cz: -0.08 },
];
const popBase = keyed(popKeys, 1, 0.14);
function pop_lock(p, b, c) {
  popBase(p, b);
  const h = hit(b, 10);
  p[I.cx] -= 0.1 * h * c.e;
  p[I.hy] -= 0.04 * h;
}

const robotKeys = [
  { lf: 1.57, le: 1.57, rf: 0, re: 1.57, ro: 0.1, lo: 0.1, hry: 0.35, ny: 0.4, hy: -0.06 },
  { lf: 0, le: 1.57, rf: 1.57, re: 1.57, ro: 0.1, lo: 0.1, hry: -0.35, ny: -0.4, hy: -0.06 },
  { lo: 1.57, ro: 1.57, le: 1.57, re: 1.57, lt: -1.57, rt: 1.57, hry: 0, ny: 0, nx: 0.2, hy: -0.1 },
  { lo: 1.57, ro: 1.57, le: 0, re: 0, hry: 0, nx: -0.15, hy: -0.04, cx: -0.08 },
];
const robot = keyed(robotKeys, 1, 0.12);

function body_roll(p, b, c) {
  const ph = (TAU * b) / 2;
  const e = c.e * 1.3;
  p[I.hx] = 0.07 * cos(ph);
  p[I.hz] = 0.07 * sin(ph);
  p[I.hrz] = -0.1 * cos(ph);
  p[I.sx] = 0.15 * e * sin(ph - 0.7);
  p[I.cx] = 0.22 * e * sin(ph - 1.4);
  p[I.nx] = 0.26 * e * sin(ph - 2.1);
  p[I.sz] = 0.08 * cos(ph - 0.7);
  p[I.hy] = -0.1 - 0.06 * sin(ph + 0.5);
  // Tay phải lướt từ đầu xuống ngực.
  p[I.rf] = 0.8 + 0.6 * sin(ph);
  p[I.ro] = 0.9 + 0.5 * sin(ph);
  p[I.re] = 1.9 - 0.6 * sin(ph);
  p[I.lo] = 0.6 + 0.3 * sin(ph + PI);
  p[I.lf] = 0.4;
  p[I.le] = 0.6;
  p[I.ko] = 0.25;
  p[I.lfx] = p[I.rfx] = 0.06;
}

function kick_step(p, b, c) {
  const u = frac(b);
  const leg = floor(b) % 2 === 0;
  const k = sin(PI * u);
  const kick = { z: 0.36 * k * c.e, y: 0.28 * k * c.e, p: 0.7 * k };
  if (leg) set(p, { lfz: kick.z, lfy: kick.y, lfp: kick.p, hx: -0.05 });
  else set(p, { rfz: kick.z, rfy: kick.y, rfp: kick.p, hx: 0.05 });
  p[I.hy] = -0.08 - 0.06 * (1 - k);
  p[I.sx] = -0.08 * k;
  const arm = leg ? 1 : -1;
  p[I.lf] = 0.3 - 0.6 * arm * k;
  p[I.rf] = 0.3 + 0.6 * arm * k;
  p[I.lo] = p[I.ro] = 0.6;
  p[I.le] = p[I.re] = 0.7;
  p[I.nx] = 0.1 * dip(b);
}

function glide(p, b, c) {
  const u = frac(b);
  const leg = floor(b) % 2 === 0;
  const slide = 0.15 - 0.3 * u;
  const heel = { z: -0.15 + 0.3 * smooth(u), y: 0.05, p: 0.75 };
  if (leg) set(p, { lfz: slide, lfp: 0, rfz: heel.z, rfy: heel.y, rfp: heel.p });
  else set(p, { rfz: slide, rfp: 0, lfz: heel.z, lfy: heel.y, lfp: heel.p });
  p[I.hy] = -0.06;
  p[I.sx] = -0.06;
  p[I.hrz] = leg ? 0.04 : -0.04;
  // Tay phải giữ vành mũ, tay trái đánh nhịp.
  p[I.rf] = 1.0;
  p[I.ro] = 1.2;
  p[I.re] = 2.4;
  p[I.rt] = -0.6;
  p[I.lf] = 0.3 + 0.25 * sin(TAU * b);
  p[I.lo] = 0.35;
  p[I.le] = 0.5;
  p[I.nz] = 0.1;
  p[I.nx] = 0.1 * dip(b);
}

// ------------------------------------------------------------------ Hype / Superstar / Legend

function krump(p, b, c) {
  const h = hit(b, 6);
  const leg = floor(b) % 2 === 0;
  const u = frac(b);
  const stomp = sin(PI * u) * (u < 0.7 ? 1 : 0);
  set(p, { lfx: 0.12, rfx: 0.12, ko: 0.35 });
  if (leg) p[I.lfy] = 0.16 * stomp;
  else p[I.rfy] = 0.16 * stomp;
  p[I.hy] = -0.16 - 0.06 * h;
  p[I.cx] = 0.15 - 0.4 * h * c.e;
  p[I.sx] = 0.15;
  p[I.nx] = 0.15 + 0.2 * h;
  const sw = wave(b, 2);
  p[I.lf] = 1.0 + 0.9 * sw;
  p[I.rf] = 1.0 - 0.9 * sw;
  p[I.lo] = 0.6 + 0.5 * h;
  p[I.ro] = 0.6 + 0.5 * h;
  p[I.le] = p[I.re] = 1.3 - 0.6 * h;
  p[I.hry] = 0.2 * sw;
}

function jump_split(p, b, c) {
  const t = frac(c.lb / 4) * 4;
  const crouch = smooth(seg(t, 0, 0.8)) * (1 - smooth(seg(t, 0.9, 1.1)));
  const air = sin(PI * seg(t, 1, 2));
  const land = sin(PI * seg(t, 2, 2.6));
  p[I.hy] = -0.05 - 0.22 * crouch - 0.2 * land;
  p[I.jump] = 0.75 * air;
  p[I.lfx] = p[I.rfx] = 0.42 * air;
  p[I.lfy] = p[I.rfy] = 0.5 * air;
  p[I.lfp] = p[I.rfp] = 0.6 * air;
  p[I.lo] = p[I.ro] = 0.4 + 1.6 * air + 0.8 * smooth(seg(t, 2.6, 3.2));
  p[I.lf] = p[I.rf] = -0.4 * crouch + 0.3 * air;
  p[I.le] = p[I.re] = 0.1;
  p[I.nx] = -0.2 * air;
  p[I.ko] = 0.3 * land;
}

function knee_drop(p, b, c) {
  const t = frac(c.lb / 4) * 4;
  const down = smooth(seg(t, 0, 0.5)) * (1 - smooth(seg(t, 3.2, 3.9)));
  p[I.hy] = -0.05 - 0.42 * down;
  p[I.ko] = 0.6 * down;
  p[I.lfx] = p[I.rfx] = 0.14 * down;
  p[I.spin] = TAU * smooth(seg(t, 0.5, 3.0));
  p[I.lo] = p[I.ro] = 0.3 + 2.2 * down;
  p[I.le] = p[I.re] = 0.3;
  p[I.sx] = 0.15 * down;
  p[I.nx] = -0.15 * down;
}

function backflip(p, b, c) {
  const t = frac(c.lb / 4) * 4;
  const prep = smooth(seg(t, 0, 0.9)) * (1 - smooth(seg(t, 0.9, 1.05)));
  const u = seg(t, 1, 2.2);
  const air = sin(PI * u);
  const land = sin(PI * seg(t, 2.2, 2.8));
  const tada = smooth(seg(t, 2.8, 3.2));
  p[I.hy] = -0.05 - 0.25 * prep - 0.22 * land;
  p[I.jump] = 0.95 * air * c.e;
  p[I.flip] = -TAU * smooth(u);
  p[I.lfy] = p[I.rfy] = 0.35 * air;
  p[I.lfz] = p[I.rfz] = 0.28 * air;
  p[I.lf] = p[I.rf] = -0.9 * prep + 1.3 * air;
  p[I.lo] = p[I.ro] = 0.2 + 2.3 * tada;
  p[I.le] = p[I.re] = 1.1 * air + 0.15;
  p[I.ko] = 0.3 * land;
  p[I.nx] = -0.15 * tada;
}

function spin_fast(p, b, c) {
  const t = frac(c.lb / 2) * 2;
  p[I.spin] = TAU * 2 * smooth(seg(t, 0.1, 1.7));
  const turning = sin(PI * seg(t, 0.1, 1.7));
  p[I.jump] = 0.05 * turning;
  p[I.lfy] = 0.18 * turning;
  p[I.lfz] = 0.05 * turning;
  p[I.lfx] = -0.08 * turning;
  p[I.rfp] = 0.4 * turning;
  p[I.lo] = p[I.ro] = 1.45 - 1.0 * turning;
  p[I.lf] = p[I.rf] = 0.9 * turning;
  p[I.le] = p[I.re] = 1.6 * turning;
  p[I.hy] = -0.04;
}

const pose_tilt_keys = { tilt: 0.22, lo: 1.9, le: 0.05, ro: 0.9, rf: 0.9, re: 0.3, rfy: 0.32, rfz: 0.12, rfx: -0.05, rfp: 0.6, hy: -0.08, nz: -0.2, nx: -0.1, cz: -0.1 };
function pose_tilt(p, b, c) {
  set(p, pose_tilt_keys);
  p[I.tilt] += 0.015 * sin(TAU * b * 0.5);
}

const vogueKeys = [
  { lf: 1.2, rf: 1.2, lo: 1.0, ro: 1.0, le: 2.35, re: 2.35, lt: -0.5, rt: -0.5, hx: 0.06, hrz: 0.08, ny: 0.3 },
  { ro: 2.95, re: 0, rf: 0.1, lf: 1.4, lo: 0.4, le: 2.3, hx: -0.07, hrz: -0.1, ny: -0.25, nx: -0.15 },
  { lo: 1.57, ro: 1.57, le: 0.0, re: 0.0, lt: 1.2, rt: 1.2, hx: 0.0, hy: -0.1, nx: 0.05 },
  { lo: 2.4, ro: 0.7, le: 0, re: 0, lf: 0.2, rf: -0.1, hx: 0.08, hrz: 0.1, cz: 0.12, ny: 0.35 },
];
const vogueBase = keyed(vogueKeys, 1, 0.3);
function vogue(p, b, c) {
  vogueBase(p, b);
  stepTouch(p, b, 2, 0.08);
  p[I.hy] -= 0.05 * dip(b);
}

function tornado(p, b, c) {
  const t = frac(c.lb / 4) * 4;
  const spin1 = smooth(seg(t, 0, 1));
  const spin2 = smooth(seg(t, 1, 2));
  const low = smooth(seg(t, 2, 2.5)) * (1 - smooth(seg(t, 3.5, 4)));
  p[I.spin] = TAU * (spin1 + spin2 + smooth(seg(t, 2.2, 3.6)));
  p[I.jump] = 0.4 * (sin(PI * seg(t, 0, 1)) + sin(PI * seg(t, 1, 2)));
  const airborne = p[I.jump] / 0.4;
  p[I.lfy] = p[I.rfy] = 0.2 * airborne;
  p[I.lo] = p[I.ro] = 2.6 - 1.2 * low;
  p[I.le] = p[I.re] = 0.2;
  p[I.hy] = -0.05 - 0.35 * low;
  p[I.ko] = 0.5 * low;
  p[I.lfx] = p[I.rfx] = 0.12 * low;
}

const pose_star_keys = { ro: 2.95, re: 0, rf: 0.15, lo: 0.75, le: 2.0, lf: -0.25, lt: -1.4, hx: 0.07, hrz: 0.1, hy: -0.05, nx: -0.2, ny: 0.2, lfx: 0.12, lfp: 0.3, cx: -0.08 };
function pose_star(p, b, c) {
  set(p, pose_star_keys);
  p[I.glow] = 0.4;
  p[I.hy] -= 0.01 * dip(b);
}

function levitate(p, b, c) {
  const t = c.lb;
  const gather = smooth(seg(t, 0, 1.5)) * (1 - smooth(seg(t, 1.6, 2.4)));
  const rise = smooth(seg(t, 2, 7));
  p[I.hy] = -0.05 - 0.25 * gather;
  p[I.jump] = 0.95 * rise + 0.06 * sin((TAU * t) / 4) * rise;
  p[I.lfy] = p[I.rfy] = 0.03 * rise;
  p[I.lfp] = p[I.rfp] = 0.85 * rise;
  p[I.lfx] = p[I.rfx] = -0.03 * rise;
  p[I.lo] = p[I.ro] = 0.3 + 0.9 * rise + 0.25 * sin((TAU * t) / 4) * rise;
  p[I.lf] = p[I.rf] = 0.9 * gather;
  p[I.le] = p[I.re] = 1.4 * gather + 0.1;
  p[I.nx] = -0.3 * rise;
  p[I.cx] = -0.12 * rise;
  p[I.spin] = 0.35 * t * rise;
  p[I.glow] = rise;
}

function headspin(p, b, c) {
  const t = c.lb;
  const down = smooth(seg(t, 0.6, 1.8));
  const crouch = smooth(seg(t, 0, 0.6)) * (1 - down);
  p[I.hy] = -0.05 - 0.25 * crouch;
  p[I.flip] = PI * down;
  p[I.jump] = 0.12 * down;
  p[I.lfx] = p[I.rfx] = 0.38 * down;
  p[I.lfp] = p[I.rfp] = 0.8 * down;
  p[I.lo] = p[I.ro] = 0.3 + 1.0 * down;
  p[I.le] = p[I.re] = 0.3;
  const spinT = max(0, t - 1.8);
  p[I.spin] = TAU * (0.9 * spinT + 0.12 * spinT * spinT);
  p[I.nx] = 0.2 * down;
}

function double_flip(p, b, c) {
  const t = frac(c.lb / 5) * 5;
  const prep = smooth(seg(t, 0, 0.9)) * (1 - smooth(seg(t, 0.9, 1.05)));
  const u = seg(t, 1, 2.8);
  const air = sin(PI * u);
  const land = sin(PI * seg(t, 2.8, 3.4));
  const tada = smooth(seg(t, 3.4, 3.9));
  p[I.hy] = -0.05 - 0.28 * prep - 0.25 * land;
  p[I.jump] = 1.5 * air;
  p[I.flip] = -2 * TAU * smooth(u);
  p[I.lfy] = p[I.rfy] = 0.4 * air;
  p[I.lfz] = p[I.rfz] = 0.32 * air;
  p[I.lf] = p[I.rf] = -0.9 * prep + 1.3 * air;
  p[I.lo] = p[I.ro] = 0.2 + 2.4 * tada;
  p[I.le] = p[I.re] = 1.2 * air + 0.15;
  p[I.ko] = 0.3 * land;
  p[I.glow] = 0.6 * air;
}

const pose_legend_keys = { lo: 2.35, ro: 2.35, lf: 0.25, rf: 0.25, le: 0.02, re: 0.02, nx: -0.28, cx: -0.12, hy: -0.04, lfx: 0.14, rfx: 0.14 };
function pose_legend(p, b, c) {
  set(p, pose_legend_keys);
  p[I.glow] = 0.8;
  p[I.jump] = 0.04 * (0.5 - 0.5 * cos((TAU * b) / 2));
}

function finale_wave(p, b, c) {
  const s = wave(b, 2);
  const d = dip(b);
  p[I.lo] = 2.55 + 0.25 * s;
  p[I.ro] = 2.55 - 0.25 * s;
  p[I.lf] = p[I.rf] = 0.15;
  p[I.le] = p[I.re] = 0.25;
  p[I.lt] = p[I.rt] = 0.3;
  p[I.sz] = -0.12 * s;
  p[I.cz] = -0.08 * s;
  p[I.hx] = 0.06 * s;
  p[I.hy] = -0.06 - 0.06 * d * c.e;
  p[I.nx] = -0.12;
}

function finale_jump(p, b, c) {
  const air = 0.5 - 0.5 * cos(TAU * b);
  const pump = hit(b, 5);
  p[I.jump] = 0.16 * air * c.e;
  p[I.lfy] = p[I.rfy] = 0.08 * air;
  p[I.ro] = 2.6 + 0.2 * pump;
  p[I.re] = 0.2 + 0.9 * (1 - pump);
  p[I.rf] = 0.3;
  p[I.lo] = 0.4;
  p[I.lf] = 0.6;
  p[I.le] = 1.6;
  p[I.hy] = -0.1 * (1 - air);
  p[I.nx] = -0.12 + 0.2 * pump;
}

// ------------------------------------------------------------------ Đi lại

// Bước chân tại chỗ: chân trụ lùi về sau đúng bằng quãng cơ thể tiến lên nên trông như đi thật.
function stepCycle(p, b, stride, lift, armAmp, elbow) {
  const u = frac(b);
  const leg = floor(b) % 2 === 0;
  const half = stride / 2;
  const stance = half - stride * u;
  const swing = -half + stride * smooth(u);
  const up = lift * sin(PI * u);
  if (leg) set(p, { lfz: stance, rfz: swing, rfy: up });
  else set(p, { rfz: stance, lfz: swing, lfy: up });
  const arm = leg ? 1 : -1;
  const g = 2 * smooth(u) - 1;
  p[I.lf] = 0.05 + armAmp * arm * g;
  p[I.rf] = 0.05 - armAmp * arm * g;
  p[I.le] = p[I.re] = elbow;
  p[I.lo] = p[I.ro] = 0.14;
  p[I.hry] = 0.08 * arm * g;
  p[I.cy] = -0.12 * arm * g;
  return u;
}

function walk(p, b, c) {
  const u = stepCycle(p, b, 0.3, 0.09, 0.38, 0.45);
  p[I.hy] = -0.035 - 0.03 * sin(PI * u);
  p[I.nx] = 0.08 * dip(b) - 0.03;
  p[I.nz] = 0.05 * wave(b, 2);
}

function run(p, b, c) {
  const u = stepCycle(p, b * 2, 0.6, 0.18, 0.75, 1.4);
  p[I.hy] = -0.07 - 0.05 * sin(PI * u);
  p[I.sx] = 0.14;
  p[I.jump] = 0.05 * sin(PI * u);
}

// ------------------------------------------------------------------ MC

function mc_hype(p, b, c) {
  const d = dip(b);
  stepTouch(p, b, 4, 0.07);
  p[I.hy] = -0.05 - 0.06 * d;
  p[I.nx] = 0.15 * d;
  // Tay phải đưa micro lên miệng.
  set(p, { rf: 0.75, ro: 0.3, re: 2.35, rt: -0.9 });
  // Tay trái: 4 nhịp đấm tay lên trời, 4 nhịp chỉ xuống khán giả.
  if (floor(b / 4) % 2 === 0) {
    p[I.lo] = 2.3 + 0.35 * hit(b, 5);
    p[I.le] = 0.3 + 0.6 * (1 - hit(b, 5));
    p[I.lf] = 0.2;
  } else {
    p[I.lf] = 1.35 + 0.15 * hit(b, 6);
    p[I.lo] = 0.5;
    p[I.le] = 0.05;
    p[I.ny] = 0.2 * wave(b, 4);
  }
  p[I.cy] = -0.1;
}

// ------------------------------------------------------------------ DJ

function dj_mix(p, b, c) {
  const d = dip(b);
  const bar = floor(b / 16);
  const hype = frac(b / 16) * 16 >= 12 && bar % 2 === 1;
  p[I.hy] = -0.05 - 0.06 * d;
  p[I.nx] = 0.22 * d;
  p[I.cx] = 0.08;
  if (hype) {
    cheer(p, b, { ...c, e: 0.6 });
    p[I.jump] = 0;
    return;
  }
  // Tay trái giữ tai nghe, tay phải scratch đĩa.
  set(p, { lf: 0.55, lo: 1.55, le: 2.55, lt: 0.3 });
  p[I.rf] = 0.95 + 0.12 * wave(b, 0.5);
  p[I.ro] = 0.25;
  p[I.re] = 0.65 + 0.1 * wave(b, 0.5);
  p[I.rt] = 0.3 * wave(b, 1);
  p[I.ny] = -0.15;
}

export const MOVES = {
  head_bob,
  shoulder_groove,
  side_step,
  body_wave,
  hand_groove,
  freestyle,
  cheer,
  clap,
  wave_hand,
  jump_hype,
  point_at,
  two_step,
  bounce_step,
  shuffle,
  roll_arms,
  hype_up,
  spin,
  pose_point,
  pose_cool,
  pop_lock,
  robot,
  body_roll,
  kick_step,
  glide,
  krump,
  jump_split,
  knee_drop,
  backflip,
  spin_fast,
  pose_tilt,
  vogue,
  tornado,
  pose_star,
  levitate,
  headspin,
  double_flip,
  pose_legend,
  finale_wave,
  finale_jump,
  dj_mix,
  mc_hype,
  walk,
  run,
};

export const CHILL_MOVES = ['head_bob', 'shoulder_groove', 'side_step', 'body_wave', 'hand_groove', 'freestyle'];

export function evalMove(id, p, b, ctx) {
  p.set(NEUTRAL);
  (MOVES[id] ?? head_bob)(p, b, ctx);
}

// Trộn hai tư thế; kênh góc quay (spin/flip/tilt) đi đường ngắn nhất để không bị quay ngược.
export function blendPose(out, a, bPose, k) {
  for (let i = 0; i < N; i++) out[i] = a[i] + (bPose[i] - a[i]) * k;
  for (const i of ANGLE_CHANNELS) {
    let d = (bPose[i] - a[i]) % TAU;
    if (d > PI) d -= TAU;
    if (d < -PI) d += TAU;
    out[i] = a[i] + d * k;
  }
}
