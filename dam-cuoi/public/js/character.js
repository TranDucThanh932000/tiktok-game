// Nhân vật chibi 3D dựng bằng khối cơ bản (không cần file Mixamo): chú rể, cô dâu, khách mời.
// Hình học và vật liệu dùng chung cho mọi nhân vật, nên sinh/hủy nhân vật suốt buổi live không rò bộ nhớ GPU.
// Animation là tư thế tính bằng code: idle, walk, kick, fly (bị đá văng), cheer, clap, wave, spin, shock.
import * as THREE from 'three';

// ---------------------------------------------------------------- Tài nguyên dùng chung

const gradient = (() => {
  const t = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const mats = new Map();
export function toon(color, extra = {}) {
  const key = `${color}|${JSON.stringify(extra)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...extra }));
  return mats.get(key);
}

const skirtProfile = [
  [0.001, 0.0], [0.5, 0.0], [0.5, 0.04], [0.45, 0.16], [0.36, 0.36], [0.27, 0.56], [0.2, 0.7], [0.18, 0.76], [0.001, 0.76],
].map(([x, y]) => new THREE.Vector2(x, y));
const tunicProfile = [
  [0.001, 0.0], [0.27, 0.0], [0.27, 0.02], [0.24, 0.2], [0.21, 0.4], [0.2, 0.5], [0.001, 0.5],
].map(([x, y]) => new THREE.Vector2(x, y));

const G = {
  sphere: new THREE.SphereGeometry(1, 22, 16),
  lowSphere: new THREE.SphereGeometry(1, 10, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  taper: new THREE.CylinderGeometry(0.86, 1, 1, 16),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(1, 1, 12),
  smile: new THREE.TorusGeometry(1, 0.28, 6, 14, Math.PI),
  ring: new THREE.TorusGeometry(1, 0.18, 6, 20),
  skirt: new THREE.LatheGeometry(skirtProfile, 28),
  tunic: new THREE.LatheGeometry(tunicProfile, 22),
  veil: new THREE.CylinderGeometry(0.3, 0.5, 1, 18, 1, true, Math.PI * 0.55, Math.PI * 0.9),
};

// ---------------------------------------------------------------- Bảng màu

const SKIN = ['#ffd9c2', '#f8cdb0', '#f1c09d', '#e8b48f', '#ffe1cf'];
const HAIR = ['#1d1412', '#2b1b14', '#3b2417', '#4a2b1a', '#5a3420', '#1a1a24'];
const SUIT = [
  { coat: '#1f2a4a', pants: '#1a223b', tie: '#d4213d' },
  { coat: '#1c1c22', pants: '#141418', tie: '#d4213d' },
  { coat: '#f3efe7', pants: '#e6e0d4', tie: '#c9183a' },
  { coat: '#6b1f2e', pants: '#3a1219', tie: '#f2c14e' },
  { coat: '#4f5563', pants: '#3a3f4b', tie: '#ff7aa2' },
  { coat: '#2747a8', pants: '#1d2f6b', tie: '#f2c14e' },
];
const DRESS = [
  { dress: '#fffaf5', trim: '#f2d8a7' },
  { dress: '#fbf1e2', trim: '#e6c58d' },
  { dress: '#ffe3ea', trim: '#ff9fb8' },
  { dress: '#f6efff', trim: '#d9c4ff' },
];
const AO_DAI_BRIDE = { dress: '#d4142f', trim: '#f2c14e', pants: '#fff7ec' };
const AO_DAI_GROOM = { coat: '#1d3b8f', trim: '#f2c14e', pants: '#fff7ec' };
const GUEST = ['#ff8fab', '#7ec8e3', '#ffd166', '#b5e48c', '#cdb4db', '#f4a261', '#90e0ef', '#e5989b'];

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length) % arr.length];
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
export function hashSeed(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

// ---------------------------------------------------------------- Dựng hình

function mesh(parent, geo, color, pos, scale, rot, extra) {
  const m = new THREE.Mesh(geo, typeof color === 'string' ? toon(color, extra) : color);
  if (pos) m.position.set(...pos);
  if (scale) typeof scale === 'number' ? m.scale.setScalar(scale) : m.scale.set(...scale);
  if (rot) m.rotation.set(...rot);
  parent.add(m);
  return m;
}
const pivot = (parent, pos) => {
  const g = new THREE.Group();
  g.position.set(...pos);
  parent.add(g);
  return g;
};

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, t) => a + (b - a) * t;

export class Character {
  // kind: 'groom' | 'bride' | 'guest'; blank: nhân vật trống chờ người chơi.
  constructor(kind, { seed = Math.random() * 1e9, blank = false, scale = 1 } = {}) {
    this.kind = kind;
    this.blank = blank;
    this.root = new THREE.Group();
    this.spinner = pivot(this.root, [0, 0, 0]);
    this.body = pivot(this.spinner, [0, 0, 0]);
    this.root.scale.setScalar(scale);
    this.scale = scale;
    this.anim = 'idle';
    this.animT = Math.random() * 10;
    this.time = Math.random() * 10;
    this.yaw = 0;
    this.targetYaw = 0;
    this.move = null;
    this.flight = null;
    this.done = false;
    this.blinkAt = 1 + Math.random() * 3;
    this.build(rng(seed));
    this.root.traverse((o) => (o.frustumCulled = false));
  }

  build(rnd) {
    const blank = this.blank;
    const skin = blank ? '#d9cfd6' : pick(SKIN, rnd);
    const hair = blank ? '#b9aab4' : pick(HAIR, rnd);
    const k = this.kind;
    const aoDai = !blank && k !== 'guest' && rnd() < 0.3;
    let top, pants, shoe, tie, trim;
    if (k === 'groom') {
      const s = blank ? { coat: '#c9bdc6', pants: '#b3a6b0', tie: '#a897a3' } : aoDai ? AO_DAI_GROOM : pick(SUIT, rnd);
      top = s.coat; pants = s.pants; tie = s.tie ?? '#d4213d'; trim = s.trim; shoe = blank ? '#9b8c96' : '#1a1418';
    } else if (k === 'bride') {
      const d = blank ? { dress: '#e7dde4', trim: '#cbbfc8' } : aoDai ? AO_DAI_BRIDE : pick(DRESS, rnd);
      top = d.dress; trim = d.trim; pants = d.pants ?? d.dress; shoe = blank ? '#cbbfc8' : '#ffffff';
    } else {
      top = pick(GUEST, rnd); pants = pick(['#3d405b', '#2b2d42', '#5c4d7d', '#6d6875'], rnd); shoe = '#2b2024';
    }
    this.colors = { top, trim };
    const girl = k === 'bride' || (k === 'guest' && rnd() < 0.5);
    const B = this.body;

    // Hông và chân (đầu gối có khớp để đá cho "đã").
    this.hips = pivot(B, [0, 0.68, 0]);
    const legs = [];
    for (const side of [1, -1]) {
      const hip = pivot(this.hips, [side * 0.1, 0, 0]);
      mesh(hip, G.cyl, pants, [0, -0.16, 0], [0.078, 0.34, 0.078]);
      const knee = pivot(hip, [0, -0.32, 0]);
      mesh(knee, G.cyl, girl && k !== 'groom' ? skin : pants, [0, -0.15, 0], [0.066, 0.3, 0.066]);
      mesh(knee, G.sphere, shoe, [0, -0.32, 0.04], [0.085, 0.06, 0.135]);
      legs.push({ hip, knee });
    }
    [this.legL, this.legR] = legs;

    // Thân.
    this.spine = pivot(this.hips, [0, 0, 0]);
    const S = this.spine;
    if (k === 'bride' && !aoDai) {
      mesh(S, G.skirt, top, [0, -0.68, 0]);
      mesh(S, G.taper, top, [0, 0.21, 0], [0.17, 0.36, 0.15]);
      mesh(S, G.ring, trim, [0, 0.06, 0], [0.19, 0.19, 0.3], [Math.PI / 2, 0, 0]);
      mesh(S, G.sphere, skin, [0, 0.38, 0], [0.16, 0.06, 0.12]);
    } else if (aoDai) {
      // Áo dài: thân dài tới gối, khăn đóng/khăn vấn trên đầu.
      mesh(S, G.tunic, top, [0, -0.36, 0], [1, 1, 0.82]);
      mesh(S, G.taper, top, [0, 0.21, 0], [0.18, 0.38, 0.16]);
      mesh(S, G.box, trim, [0.06, 0.3, 0.14], [0.03, 0.2, 0.04], [0, 0, 0.5]);
      mesh(S, G.cyl, trim, [0, 0.41, 0], [0.08, 0.06, 0.08]);
    } else {
      mesh(S, G.cyl, pants, [0, 0.0, 0], [0.19, 0.14, 0.16]);
      mesh(S, G.taper, top, [0, 0.22, 0], [0.2, 0.42, 0.17]);
      if (k === 'groom') {
        mesh(S, G.box, '#ffffff', [0, 0.3, 0.13], [0.11, 0.22, 0.06], [0.12, 0, 0]);
        mesh(S, G.sphere, tie, [0.04, 0.38, 0.17], [0.045, 0.03, 0.025]);
        mesh(S, G.sphere, tie, [-0.04, 0.38, 0.17], [0.045, 0.03, 0.025]);
        mesh(S, G.sphere, tie, [0, 0.38, 0.18], [0.02, 0.02, 0.02]);
        if (!blank) {
          mesh(S, G.sphere, '#e8344e', [0.12, 0.33, 0.14], 0.032);
          mesh(S, G.sphere, '#3f8a4a', [0.135, 0.31, 0.13], [0.018, 0.03, 0.01]);
        }
        mesh(S, G.sphere, '#f2c14e', [0, 0.17, 0.165], 0.014);
        mesh(S, G.sphere, '#f2c14e', [0, 0.1, 0.165], 0.014);
      }
    }

    // Tay.
    const arms = [];
    const sleeve = k === 'bride' && !aoDai ? skin : top;
    for (const side of [1, -1]) {
      const sh = pivot(S, [side * 0.23, 0.38, 0]);
      mesh(sh, G.sphere, sleeve, [0, 0, 0], 0.07);
      mesh(sh, G.cyl, sleeve, [0, -0.11, 0], [0.058, 0.22, 0.058]);
      const el = pivot(sh, [0, -0.22, 0]);
      mesh(el, G.cyl, sleeve, [0, -0.09, 0], [0.052, 0.18, 0.052]);
      if (k === 'groom' && !blank && !aoDai) mesh(el, G.cyl, '#ffffff', [0, -0.18, 0], [0.056, 0.03, 0.056]);
      const hand = mesh(el, G.sphere, skin, [0, -0.22, 0], 0.062);
      arms.push({ sh, el, hand });
    }
    [this.armL, this.armR] = arms;
    if (k === 'bride' && !blank) {
      // Bó hoa cưới ở tay phải.
      const bq = pivot(this.armR.el, [0, -0.27, 0.05]);
      const roses = ['#e8344e', '#ff7a9c', '#ffffff', '#ffd1dc', '#c2183c'];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const r = i === 0 ? 0 : 0.06;
        mesh(bq, G.lowSphere, roses[i % roses.length], [Math.cos(a) * r, 0.02 + (i ? 0 : 0.03), Math.sin(a) * r + 0.02], 0.05);
      }
      mesh(bq, G.cone, '#3f8a4a', [0, -0.08, 0], [0.05, 0.14, 0.05], [Math.PI, 0, 0]);
      mesh(bq, G.cyl, '#fff3f6', [0, -0.13, 0], [0.025, 0.08, 0.025]);
    }

    // Đầu và mặt.
    this.neck = pivot(S, [0, 0.44, 0]);
    const H = this.neck;
    mesh(H, G.sphere, skin, [0, 0.25, 0], [0.27, 0.26, 0.255]);
    mesh(H, G.sphere, skin, [0.27, 0.22, 0], [0.04, 0.055, 0.03]);
    mesh(H, G.sphere, skin, [-0.27, 0.22, 0], [0.04, 0.055, 0.03]);
    // Tóc.
    mesh(H, G.sphere, hair, [0, 0.36, -0.03], [0.29, 0.22, 0.28]);
    mesh(H, G.sphere, hair, [0, 0.27, -0.07], [0.285, 0.22, 0.24]);
    if (girl) {
      mesh(H, G.sphere, hair, [0, 0.16, -0.1], [0.27, 0.26, 0.2]);
      mesh(H, G.sphere, hair, [0, 0.47, -0.14], 0.11);
      mesh(H, G.sphere, hair, [0.16, 0.37, 0.15], [0.11, 0.07, 0.06], [0, 0, -0.5]);
      mesh(H, G.sphere, hair, [-0.12, 0.38, 0.17], [0.1, 0.06, 0.06], [0, 0, 0.6]);
    } else {
      mesh(H, G.sphere, hair, [0.08, 0.41, 0.15], [0.16, 0.08, 0.1], [0.3, 0, -0.35]);
      mesh(H, G.sphere, hair, [-0.12, 0.39, 0.14], [0.11, 0.07, 0.09], [0.3, 0, 0.3]);
    }
    if (k === 'bride' && !blank) {
      if (aoDai) {
        mesh(H, G.ring, this.colors.trim, [0, 0.4, -0.01], [0.28, 0.28, 0.7], [Math.PI / 2 - 0.25, 0, 0]);
        mesh(H, G.cyl, this.colors.top, [0, 0.43, -0.02], [0.27, 0.09, 0.27], [-0.25, 0, 0]);
      } else {
        mesh(H, G.ring, '#f6d36b', [0, 0.47, 0.05], [0.13, 0.13, 0.4], [Math.PI / 2 - 0.5, 0, 0], { emissive: '#5a4210' });
        mesh(H, G.sphere, '#bfe9ff', [0, 0.53, 0.08], 0.025, null, { emissive: '#5ab0ff' });
        mesh(H, G.veil, toon('#ffffff', { transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }), [0, -0.05, -0.02], [1, 0.95, 1]);
      }
    }
    if (k === 'groom' && aoDai) {
      mesh(H, G.cyl, this.colors.top, [0, 0.42, -0.01], [0.285, 0.12, 0.285], [-0.2, 0, 0]);
      mesh(H, G.ring, this.colors.trim, [0, 0.43, -0.01], [0.285, 0.285, 0.5], [Math.PI / 2 - 0.2, 0, 0]);
    }

    // Mắt (mở / nhắm / chóng mặt), má hồng, miệng.
    const eyeMat = toon('#2a1a1f');
    this.eyes = [];
    this.dizzy = [];
    for (const side of [1, -1]) {
      const eye = pivot(H, [side * 0.09, 0.24, 0.235]);
      mesh(eye, G.sphere, eyeMat, [0, 0, 0], [0.038, 0.052, 0.022]);
      if (!blank) mesh(eye, G.sphere, '#ffffff', [0.012, 0.018, 0.016], 0.012);
      this.eyes.push(eye);
      const x = pivot(H, [side * 0.09, 0.24, 0.245]);
      mesh(x, G.box, eyeMat, [0, 0, 0], [0.09, 0.018, 0.01], [0, 0, 0.78]);
      mesh(x, G.box, eyeMat, [0, 0, 0], [0.09, 0.018, 0.01], [0, 0, -0.78]);
      x.visible = false;
      this.dizzy.push(x);
      if (!blank) mesh(H, G.sphere, '#ff9db0', [side * 0.155, 0.16, 0.21], [0.05, 0.028, 0.015], [0, side * 0.5, 0]);
    }
    this.smile = mesh(H, G.smile, '#a8324a', [0, 0.14, 0.245], 0.035, [0, 0, Math.PI]);
    this.mouthO = mesh(H, G.sphere, '#7a1f33', [0, 0.13, 0.24], [0.035, 0.045, 0.02]);
    this.mouthO.visible = false;
  }

  // ---------------------------------------------------------------- Điều khiển

  play(name) {
    if (this.anim === name) return;
    this.anim = name;
    this.animT = 0;
  }

  setFace(face) {
    this.face = face;
    const dizzy = face === 'dizzy';
    this.eyes.forEach((e) => (e.visible = !dizzy));
    this.dizzy.forEach((e) => (e.visible = dizzy));
    this.smile.visible = face === 'happy' || !face;
    this.mouthO.visible = face === 'shock' || dizzy;
    this.eyes.forEach((e) => e.scale.set(face === 'shock' ? 1.25 : 1, face === 'shock' ? 1.25 : 1, 1));
  }

  faceYaw(yaw) {
    this.targetYaw = yaw;
  }

  facePoint(x, z) {
    this.targetYaw = Math.atan2(x - this.root.position.x, z - this.root.position.z);
  }

  walkTo(x, z, duration, y) {
    return new Promise((resolve) => {
      this.move?.resolve();
      const from = this.root.position.clone();
      this.move = { from, to: new THREE.Vector3(x, y ?? from.y, z), t: 0, duration: Math.max(0.05, duration), resolve };
      this.facePoint(x, z);
      this.play('walk');
    });
  }

  // Bị đá văng: bay theo parabol, xoay vòng, rồi tự đánh dấu done để bị gỡ khỏi cảnh.
  knockAway(velocity, life = 1.6) {
    this.move?.resolve();
    this.move = null;
    this.flight = { v: velocity.clone(), t: 0, life, spin: new THREE.Vector3(7 + Math.random() * 4, 0, (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 4)) };
    this.setFace('dizzy');
    this.play('fly');
  }

  headTop() {
    return new THREE.Vector3(0, 1.72, 0).applyMatrix4(this.root.matrixWorld);
  }

  // ---------------------------------------------------------------- Mỗi khung hình

  update(dt) {
    this.time += dt;
    this.animT += dt;
    const p = this.root.position;

    if (this.move) {
      const m = this.move;
      m.t += dt;
      const k = Math.min(1, m.t / m.duration);
      p.lerpVectors(m.from, m.to, k);
      if (k >= 1) {
        this.move = null;
        if (this.anim === 'walk') this.play('idle');
        m.resolve();
      }
    }

    if (this.flight) {
      const f = this.flight;
      f.t += dt;
      f.v.y -= 5 * dt;
      p.addScaledVector(f.v, dt);
      this.spinner.rotation.x += f.spin.x * dt;
      this.spinner.rotation.z += f.spin.z * dt;
      if (f.t >= f.life) this.done = true;
    } else {
      let d = this.targetYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 10);
      this.root.rotation.y = this.yaw;
    }

    // Chớp mắt.
    if (this.face !== 'dizzy' && this.face !== 'shock') {
      this.blinkAt -= dt;
      const closed = this.blinkAt < 0.12;
      this.eyes.forEach((e) => (e.scale.y = closed ? 0.15 : 1));
      if (this.blinkAt < 0) this.blinkAt = 2.5 + Math.random() * 3;
    }

    this.pose(dt);
  }

  pose(dt) {
    const t = this.animT;
    const T = this.time;
    const bride = this.kind === 'bride' && !this.blank;
    // Mục tiêu từng khớp: [hipsY, spineX, spineZ, neckX, neckZ, shLx, shLz, elL, shRx, shRz, elR, hipL, kneeL, hipR, kneeR, spinY]
    let q = {
      y: 0, sx: 0, sz: 0, nx: 0, nz: 0,
      lx: 0, lz: 0.12, le: 0, rx: 0, rz: -0.12, re: 0,
      hl: 0, kl: 0, hr: 0, kr: 0, spin: 0,
    };
    let snap = 12;
    const breath = Math.sin(T * 2.2);

    switch (this.anim) {
      case 'idle': {
        q.y = 0.006 * breath;
        q.sx = 0.02 * breath;
        q.nz = Math.sin(T * 0.9) * 0.06;
        q.nx = -0.03;
        q.sz = Math.sin(T * 0.7) * 0.025;
        if (bride) Object.assign(q, { rx: -0.75, rz: 0.25, re: -1.1, lx: -0.55, lz: -0.2, le: -1.2 });
        break;
      }
      case 'walk': {
        const ph = T * 8.5;
        const s = Math.sin(ph);
        q.hl = 0.55 * s;
        q.hr = -0.55 * s;
        q.kl = 0.7 * Math.max(0, -Math.cos(ph));
        q.kr = 0.7 * Math.max(0, Math.cos(ph));
        q.lx = -0.5 * s;
        q.rx = 0.5 * s;
        q.le = -0.3;
        q.re = -0.3;
        q.y = 0.035 * Math.abs(Math.cos(ph));
        q.sx = 0.08;
        q.sz = 0.04 * s;
        if (bride) Object.assign(q, { rx: -0.8, rz: 0.2, re: -1.0 });
        snap = 16;
        break;
      }
      case 'cheer': {
        const hop = Math.max(0, Math.sin(t * 7.5));
        q.y = 0.2 * hop;
        q.kl = q.kr = 0.6 * hop;
        q.hl = q.hr = -0.3 * hop;
        const w = Math.sin(t * 15) * 0.25;
        q.lz = 2.6 + w;
        q.rz = -2.6 - w;
        q.le = q.re = -0.2;
        q.nx = -0.2;
        snap = 18;
        break;
      }
      case 'clap': {
        const c = Math.sin(T * 13);
        q.lx = q.rx = -1.15;
        q.lz = -0.35 - 0.3 * c;
        q.rz = 0.35 + 0.3 * c;
        q.le = q.re = -0.5;
        q.y = 0.01 * Math.abs(c);
        q.nx = -0.1;
        snap = 22;
        break;
      }
      case 'wave': {
        q.rz = -2.5;
        q.re = -0.3 + 0.5 * Math.sin(T * 10);
        q.nz = 0.12;
        if (bride) Object.assign(q, { lx: -0.55, lz: -0.2, le: -1.2 });
        break;
      }
      case 'shock': {
        const jump = Math.max(0, Math.sin(Math.min(t, 0.35) * 9));
        q.y = 0.12 * jump;
        q.lz = 1.4;
        q.rz = -1.4;
        q.le = q.re = -1.6;
        q.lx = q.rx = -0.4;
        q.nx = -0.25;
        q.sx = -0.1;
        snap = 25;
        break;
      }
      case 'kick': {
        // 0–0.3 lấy đà, 0.3–0.42 tung chân, giữ, rồi thu về. Điểm trúng ~0.36 giây.
        const wind = ease(t / 0.3);
        const strike = ease((t - 0.3) / 0.1);
        const back = ease((t - 0.75) / 0.25);
        const amt = strike * (1 - back);
        q.hr = lerp(lerp(0, 0.7, wind), -1.75, strike) * (1 - back);
        q.kr = lerp(lerp(0, 1.3, wind), 0.05, strike) * (1 - back);
        q.hl = 0.15 * amt;
        q.sx = lerp(0.12 * wind, -0.3, strike) * (1 - back);
        q.lz = 0.9 * (wind + amt) / 2 + 0.12;
        q.rz = -0.9 * (wind + amt) / 2 - 0.12;
        q.lx = -0.4 * amt;
        q.rx = 0.5 * amt;
        q.y = 0.04 * amt;
        snap = 40;
        if (t > 1.05) this.play('idle');
        break;
      }
      case 'fly': {
        const f = T * 22;
        q.lz = 2.2 + Math.sin(f) * 0.6;
        q.rz = -2.2 - Math.cos(f) * 0.6;
        q.le = q.re = -0.4;
        q.hl = 0.6 + Math.sin(f * 0.8) * 0.4;
        q.hr = -0.6 - Math.cos(f * 0.8) * 0.4;
        q.kl = q.kr = 0.5;
        snap = 30;
        break;
      }
      case 'bow': {
        // Vái lạy / cúi chào: gập người rồi đứng lên, tay chắp trước ngực.
        const b = Math.max(0, Math.sin(t * 2.3));
        q.sx = 0.6 * b;
        q.nx = 0.25 * b;
        q.lx = q.rx = -0.9;
        q.lz = -0.45;
        q.rz = 0.45;
        q.le = q.re = -1.3;
        q.y = -0.02 * b;
        snap = 10;
        break;
      }
      case 'hold': {
        q.lx = q.rx = -1.0;
        q.lz = -0.28;
        q.rz = 0.28;
        q.le = q.re = -0.65;
        q.y = 0.006 * breath;
        q.nx = 0.08;
        break;
      }
      case 'pour': {
        q.lx = q.rx = -1.45 + 0.08 * Math.sin(T * 3);
        q.lz = -0.3;
        q.rz = 0.3;
        q.le = q.re = -0.35;
        q.sx = 0.08;
        break;
      }
      case 'offer': {
        q.rx = -1.35;
        q.rz = 0.1;
        q.re = -0.15;
        q.sx = 0.06;
        q.nx = 0.1;
        break;
      }
      case 'receive': {
        q.lx = -1.2;
        q.lz = -0.15;
        q.le = -0.25;
        q.nx = 0.12;
        break;
      }
      case 'drink': {
        q.rx = -1.1;
        q.rz = 0.35;
        q.re = -2.1;
        q.nx = -0.22;
        q.lz = 0.2;
        break;
      }
      case 'cut': {
        const c = Math.sin(t * 6);
        q.lx = q.rx = -0.85 - 0.3 * c;
        q.lz = -0.3;
        q.rz = 0.3;
        q.le = q.re = -0.4;
        q.sx = 0.15;
        q.nx = 0.15;
        snap = 18;
        break;
      }
      case 'mic': {
        q.rx = -0.35;
        q.rz = 0.3;
        q.re = -1.75;
        break;
      }
      case 'spin': {
        q.spin = ease(t / 0.7) * Math.PI * 4;
        q.lz = 1.3;
        q.rz = -1.3;
        q.y = 0.12 * Math.sin(Math.min(1, t / 0.7) * Math.PI);
        snap = 30;
        if (t > 0.75) {
          this.body.rotation.y = 0;
          this.play('cheer');
        }
        break;
      }
    }

    if (this.carry && this.anim !== 'fly') Object.assign(q, { lx: -1.0, rx: -1.0, lz: -0.28, rz: 0.28, le: -0.65, re: -0.65 });
    const k = 1 - Math.exp(-dt * snap);
    const set = (obj, prop, v) => (obj.rotation[prop] += (v - obj.rotation[prop]) * k);
    this.hips.position.y += (0.68 + q.y - this.hips.position.y) * k;
    set(this.spine, 'x', q.sx);
    set(this.spine, 'z', q.sz);
    set(this.neck, 'x', q.nx);
    set(this.neck, 'z', q.nz);
    set(this.armL.sh, 'x', q.lx);
    set(this.armL.sh, 'z', q.lz);
    set(this.armL.el, 'x', q.le);
    set(this.armR.sh, 'x', q.rx);
    set(this.armR.sh, 'z', q.rz);
    set(this.armR.el, 'x', q.re);
    set(this.legL.hip, 'x', q.hl);
    set(this.legL.knee, 'x', q.kl);
    set(this.legR.hip, 'x', q.hr);
    set(this.legR.knee, 'x', q.kr);
    if (this.anim === 'spin') this.body.rotation.y = q.spin;
  }
}
