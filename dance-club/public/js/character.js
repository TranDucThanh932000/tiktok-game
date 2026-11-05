// Nhân vật 3D: rig chuẩn chung (18 xương) + mô hình ghép từ các phần (đầu, tóc, áo, quần, giày, phụ kiện).
// Mọi phần được gộp thành MỘT SkinnedMesh (mỗi đỉnh bám cứng 1 xương) → 1 draw call / nhân vật,
// nên 50 dancer vẫn nhẹ. Màu nằm trong vertex color, phần phát sáng dùng thuộc tính "glow".
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { N, I, evalMove, blendPose } from './moves.js';

const B = {
  root: 0, hips: 1, spine: 2, chest: 3, neck: 4, head: 5,
  shL: 6, elL: 7, haL: 8, shR: 9, elR: 10, haR: 11,
  thL: 12, knL: 13, ftL: 14, thR: 15, knR: 16, ftR: 17,
};

const LIMB = { pelvis: 0.1, spine: 0.17, chest: 0.2, neck: 0.07, upper: 0.26, fore: 0.24, thigh: 0.38, shin: 0.37, ankle: 0.07, hipX: 0.092, shoulderY: 0.15 };

// ---------------------------------------------------------------- Vật liệu

export function makeCharacterMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.0 });
  const uniforms = {
    uRim: { value: new THREE.Color(0x000000) },
    uGlowBoost: { value: 0.65 },
    uExtraGlow: { value: 0 },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;\nuniform vec3 uRim;\nuniform float uGlowBoost;\nuniform float uExtraGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.2);
        totalEmissiveRadiance += diffuseColor.rgb * (vGlow * uGlowBoost + uExtraGlow) + uRim * rimF;`,
      );
  };
  return m;
}

// ---------------------------------------------------------------- Dựng hình

const tmpColor = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

class PartBuilder {
  constructor() {
    this.parts = [];
  }

  add(geo, bone, color, glow = 0) {
    const g = geo;
    g.deleteAttribute('uv');
    if (g.attributes.uv1) g.deleteAttribute('uv1');
    const count = g.attributes.position.count;
    tmpColor.set(color);
    const colors = new Float32Array(count * 3);
    const glows = new Float32Array(count);
    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
      glows[i] = glow;
      skinIndex[i * 4] = bone;
      skinWeight[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('glow', new THREE.BufferAttribute(glows, 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    if (!g.index) {
      const idx = [];
      for (let i = 0; i < count; i++) idx.push(i);
      g.setIndex(idx);
    }
    this.parts.push(g);
    return g;
  }

  sphere(r, at, bone, color, { scale = [1, 1, 1], glow = 0, seg = 12, rot } = {}) {
    const g = new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.75)));
    g.scale(...scale);
    if (rot) g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
    g.translate(at.x, at.y, at.z);
    return this.add(g, bone, color, glow);
  }

  capsule(a, b, r, bone, color, { scale, glow = 0, radial = 8 } = {}) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = Math.max(0.001, dir.length());
    const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len), 3, radial);
    if (scale) g.scale(...scale);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    g.applyQuaternion(q);
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    return this.add(g, bone, color, glow);
  }

  box(w, h, d, at, bone, color, { glow = 0, rot } = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rot) g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
    g.translate(at.x, at.y, at.z);
    return this.add(g, bone, color, glow);
  }

  cyl(rTop, rBot, h, at, bone, color, { glow = 0, rot, radial = 10, open = false } = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, radial, 1, open);
    if (rot) g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
    g.translate(at.x, at.y, at.z);
    return this.add(g, bone, color, glow);
  }

  torus(r, tube, at, bone, color, { arc = Math.PI * 2, rot, glow = 0, radial = 6, tubular = 16 } = {}) {
    const g = new THREE.TorusGeometry(r, tube, radial, tubular, arc);
    if (rot) g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
    g.translate(at.x, at.y, at.z);
    return this.add(g, bone, color, glow);
  }

  build() {
    const geo = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    geo.computeBoundingSphere();
    return geo;
  }
}

function layout(body) {
  const H = 0.04 + LIMB.thigh + LIMB.shin + LIMB.ankle;
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const P = {};
  P.root = v(0, 0, 0);
  P.hips = v(0, H, 0);
  P.spine = v(0, H + LIMB.pelvis, 0);
  P.chest = v(0, H + LIMB.pelvis + LIMB.spine, 0);
  P.neck = v(0, P.chest.y + LIMB.chest, 0);
  P.head = v(0, P.neck.y + LIMB.neck, 0);
  for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
    P[`sh${k}`] = v(s * body.shoulderX, P.chest.y + LIMB.shoulderY, 0);
    P[`el${k}`] = v(s * body.shoulderX, P[`sh${k}`].y - LIMB.upper, 0);
    P[`ha${k}`] = v(s * body.shoulderX, P[`el${k}`].y - LIMB.fore, 0);
    P[`th${k}`] = v(s * LIMB.hipX, H - 0.04, 0);
    P[`kn${k}`] = v(s * LIMB.hipX, P[`th${k}`].y - LIMB.thigh, 0);
    P[`ft${k}`] = v(s * LIMB.hipX, LIMB.ankle, 0);
  }
  return { H, P };
}

const PARENT = [-1, 0, 1, 2, 3, 4, 3, 6, 7, 3, 9, 10, 1, 12, 13, 1, 15, 16];
const NAMES = Object.keys(B);

function buildBones(P) {
  const bones = NAMES.map((name) => {
    const bone = new THREE.Bone();
    bone.name = name;
    return bone;
  });
  NAMES.forEach((name, i) => {
    const parent = PARENT[i];
    const pos = P[name].clone();
    if (parent >= 0) {
      pos.sub(P[NAMES[parent]]);
      bones[parent].add(bones[i]);
    }
    bones[i].position.copy(pos);
  });
  return bones;
}

function buildGeometry(style, P) {
  const pb = new PartBuilder();
  const { body, colors: c } = style;
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const skin = style.skin;
  const trim = style.glowTrim ? 1 : 0;
  const R = body.headR;
  const hc = P.head.clone().add(v(0, R * 0.82, 0));

  // --- Thân
  const bottomColor = style.bottom === 'skirt' ? c.bottom : c.bottom;
  pb.sphere(body.hipR, P.hips.clone().add(v(0, 0.02, 0)), B.hips, bottomColor, { scale: [1.18, 0.78, 0.9] });
  const bellyColor = style.top === 'crop' ? skin : style.top === 'windbreaker' ? c.top2 : c.top;
  pb.capsule(P.hips.clone().add(v(0, 0.06, 0)), P.chest.clone().add(v(0, 0.02, 0)), body.torsoR * 0.9, B.spine, bellyColor, { scale: [1.1, 1, 0.82] });
  pb.capsule(P.chest.clone().add(v(0, 0.02, 0)), P.chest.clone().add(v(0, LIMB.chest - 0.07, 0)), body.torsoR, B.chest, c.top, { scale: [1.2, 1, 0.82] });
  // Cạp quần / dây lưng
  pb.torus(body.hipR * 0.98, 0.026, P.hips.clone().add(v(0, 0.07, 0)), B.hips, trim ? c.accent : c.bottom, { rot: [Math.PI / 2, 0, 0], glow: trim, tubular: 18 });

  // Chi tiết áo
  const chestFront = body.torsoR * 0.82;
  if (style.top === 'hoodie') {
    pb.torus(0.12, 0.05, P.chest.clone().add(v(0, LIMB.chest - 0.03, -0.07)), B.chest, c.top, { rot: [1.15, 0, 0], tubular: 14 });
    pb.box(0.16, 0.08, 0.03, P.spine.clone().add(v(0, 0.06, body.torsoR * 0.78)), B.spine, c.top2);
    pb.cyl(0.006, 0.006, 0.12, P.chest.clone().add(v(0.04, LIMB.chest - 0.12, chestFront)), B.chest, c.top2);
    pb.cyl(0.006, 0.006, 0.12, P.chest.clone().add(v(-0.04, LIMB.chest - 0.12, chestFront)), B.chest, c.top2);
  } else if (style.top === 'jacket' || style.top === 'windbreaker') {
    pb.box(0.09, LIMB.chest * 0.85, 0.03, P.chest.clone().add(v(0, LIMB.chest * 0.42, chestFront + 0.005)), B.chest, c.top2, { glow: trim * 0.6 });
    pb.torus(0.085, 0.03, P.chest.clone().add(v(0, LIMB.chest - 0.04, 0)), B.chest, c.top, { rot: [Math.PI / 2, 0, 0], tubular: 14 });
  } else if (style.top === 'jersey') {
    pb.box(body.torsoR * 2.3, 0.035, 0.03, P.chest.clone().add(v(0, 0.1, chestFront)), B.chest, c.top2);
  } else if (style.top === 'tshirt') {
    pb.box(0.09, 0.07, 0.02, P.chest.clone().add(v(0, 0.09, chestFront + 0.005)), B.chest, c.top2, { glow: trim });
  } else if (style.top === 'crop' && style.sparkle) {
    pb.torus(body.torsoR * 1.05, 0.02, P.chest.clone().add(v(0, 0.02, 0)), B.chest, c.accent, { rot: [Math.PI / 2, 0, 0], glow: 0.8, tubular: 18 });
  }

  // --- Đầu, cổ, mặt
  pb.capsule(P.neck.clone().add(v(0, -0.03, 0)), P.neck.clone().add(v(0, 0.07, 0)), 0.048, B.neck, skin);
  pb.sphere(R, hc, B.head, skin, { seg: 16 });
  pb.sphere(R * 0.15, hc.clone().add(v(R * 0.97, -R * 0.02, 0)), B.head, skin, { seg: 8 });
  pb.sphere(R * 0.15, hc.clone().add(v(-R * 0.97, -R * 0.02, 0)), B.head, skin, { seg: 8 });
  buildFace(pb, style, hc, R);
  buildHair(pb, style, hc, R);

  // --- Tay
  const longSleeve = ['hoodie', 'jacket', 'windbreaker', 'longsleeve'].includes(style.top);
  const shortSleeve = ['tshirt', 'jersey', 'crop'].includes(style.top);
  const sleeveColor = style.top === 'windbreaker' ? c.top2 : c.top;
  for (const [k, sh, el, ha] of [['L', B.shL, B.elL, B.haL], ['R', B.shR, B.elR, B.haR]]) {
    const S = P[`sh${k}`];
    const E = P[`el${k}`];
    const Hn = P[`ha${k}`];
    pb.sphere(body.armR * 1.35, S, sh, style.top === 'tank' ? skin : c.top, { seg: 10 });
    if (longSleeve) {
      pb.capsule(S, E, body.armR * 1.1, sh, sleeveColor);
      pb.capsule(E, Hn.clone().add(v(0, 0.04, 0)), body.armR * 1.0, el, sleeveColor);
      pb.torus(body.armR * 1.0, 0.022, Hn.clone().add(v(0, 0.05, 0)), el, trim ? c.accent : c.top2, { rot: [Math.PI / 2, 0, 0], glow: trim, tubular: 12 });
    } else {
      pb.capsule(S, E, body.armR * 0.92, sh, skin);
      if (shortSleeve) pb.capsule(S, S.clone().lerp(E, 0.55), body.armR * 1.18, sh, c.top);
      pb.capsule(E, Hn, body.armR * 0.85, el, skin);
      if (trim) pb.torus(body.armR * 0.95, 0.022, Hn.clone().add(v(0, 0.06, 0)), el, c.accent, { rot: [Math.PI / 2, 0, 0], glow: 1, tubular: 12 });
    }
    pb.sphere(body.armR * 1.15, Hn.clone().add(v(0, -0.03, 0)), ha, skin, { seg: 8, scale: [0.9, 1.1, 1] });
    if (style.mic && k === 'R') {
      // Micro cầm trong nắm tay, chĩa ra phía trước (khi gập tay lên thì chĩa về miệng).
      pb.cyl(0.02, 0.016, 0.17, Hn.clone().add(v(0, -0.03, 0.08)), ha, '#1c1c22', { rot: [Math.PI / 2, 0, 0], radial: 8 });
      pb.sphere(0.042, Hn.clone().add(v(0, -0.03, 0.18)), ha, '#b8bcc8', { seg: 8 });
    }
    if (style.accessory === 'glowsticks') {
      pb.cyl(0.016, 0.016, 0.26, Hn.clone().add(v(0, -0.04, 0.05)), ha, c.accent, { rot: [Math.PI / 2, 0, 0], glow: 1.6, radial: 6 });
    }
  }

  // --- Chân
  const pantsColor = c.bottom;
  for (const [k, th, kn, ft] of [['L', B.thL, B.knL, B.ftL], ['R', B.thR, B.knR, B.ftR]]) {
    const T = P[`th${k}`];
    const K = P[`kn${k}`];
    const F = P[`ft${k}`];
    const s = k === 'L' ? 1 : -1;
    const full = ['pants', 'cargo', 'track', 'wide'].includes(style.bottom);
    if (full) {
      pb.capsule(T, K, body.legR * 1.12, th, pantsColor);
      const flare = style.bottom === 'wide' ? 1.45 : 1.0;
      pb.cyl(body.legR * 1.02, body.legR * 1.05 * flare, LIMB.shin * 0.92, K.clone().lerp(F, 0.5).add(v(0, 0.01, 0)), kn, pantsColor);
      pb.sphere(body.legR * 1.05, K, kn, pantsColor, { seg: 8 });
      if (style.bottom === 'track') {
        pb.box(0.026, LIMB.thigh, 0.026, T.clone().lerp(K, 0.5).add(v(s * body.legR * 1.1, 0, 0)), th, c.accent, { glow: trim });
        pb.box(0.026, LIMB.shin * 0.85, 0.026, K.clone().lerp(F, 0.5).add(v(s * body.legR * 1.05, 0, 0)), kn, c.accent, { glow: trim });
      }
      if (style.bottom === 'cargo') pb.box(0.05, 0.08, 0.1, T.clone().lerp(K, 0.55).add(v(s * body.legR * 1.05, 0, 0)), th, pantsColor);
    } else {
      pb.capsule(T, K, body.legR, th, skin);
      pb.capsule(K, F.clone().add(v(0, 0.03, 0)), body.legR * 0.88, kn, skin);
      if (style.bottom === 'shorts') {
        pb.capsule(T.clone().add(v(0, 0.03, 0)), T.clone().lerp(K, 0.5), body.legR * 1.3, th, pantsColor);
        pb.cyl(body.legR * 0.95, body.legR * 0.95, 0.1, F.clone().add(v(0, 0.08, 0)), kn, '#f4f4f4');
      }
    }
    // Giày
    const shoeH = style.shoes === 'boot' ? 0.2 : style.shoes === 'hightop' ? 0.14 : 0.09;
    pb.box(0.115, shoeH, 0.2, F.clone().add(v(0, shoeH / 2 - 0.065, 0.045)), ft, c.shoes);
    pb.sphere(0.058, F.clone().add(v(0, -0.03, 0.13)), ft, c.shoes, { seg: 8, scale: [1, 0.7, 1] });
    const sole = style.shoes === 'boot' ? '#1a1a1a' : '#f4f4f4';
    pb.box(0.122, 0.028, 0.25, F.clone().add(v(0, -0.058, 0.06)), ft, trim && style.shoes !== 'boot' ? c.accent : sole, { glow: trim * 0.6 });
  }
  if (style.bottom === 'skirt') {
    pb.cyl(body.hipR * 1.1, body.hipR * 2.0, 0.26, P.hips.clone().add(v(0, -0.06, 0)), B.hips, c.bottom, { radial: 14, glow: style.sparkle ? 0.25 : 0 });
  }

  // --- Phụ kiện thân
  if (style.accessory === 'chain') {
    pb.torus(0.09, 0.017, P.chest.clone().add(v(0, LIMB.chest - 0.06, 0.035)), B.chest, '#ffd166', { rot: [Math.PI / 2 - 0.35, 0, 0], glow: 0.35, tubular: 16 });
  }
  return pb.build();
}

function buildFace(pb, style, hc, R) {
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const dark = '#1b1420';
  const eyeY = hc.y - R * 0.02;
  const eyeZ = hc.z + R * 0.9;
  const arc = (x) => pb.torus(R * 0.1, R * 0.028, v(hc.x + x, eyeY - R * 0.03, eyeZ + R * 0.02), B.head, dark, { arc: Math.PI, radial: 4, tubular: 8 });
  for (const s of [1, -1]) {
    const x = s * R * 0.36;
    const at = v(x, eyeY, eyeZ);
    const face = style.face === 'wink' ? (s > 0 ? 'dots' : 'happy') : style.face;
    if (face === 'dots') pb.sphere(R * 0.11, at, B.head, dark, { scale: [1, 1.1, 0.5], seg: 8 });
    else if (face === 'tall') pb.sphere(R * 0.1, at, B.head, dark, { scale: [0.85, 1.5, 0.5], seg: 8 });
    else if (face === 'big') {
      pb.sphere(R * 0.14, at, B.head, dark, { scale: [1, 1.15, 0.5], seg: 10 });
      pb.sphere(R * 0.045, at.clone().add(v(R * 0.04, R * 0.05, R * 0.06)), B.head, '#ffffff', { glow: 0.6, seg: 6 });
    } else if (face === 'happy') arc(x);
    else if (face === 'sleepy') pb.sphere(R * 0.12, at, B.head, dark, { scale: [1, 0.32, 0.5], seg: 8 });
    if (style.blush) pb.sphere(R * 0.11, v(s * R * 0.58, hc.y - R * 0.25, hc.z + R * 0.8), B.head, '#ff8fa3', { scale: [1.2, 0.6, 0.4], seg: 8 });
  }
  // Miệng cười
  pb.torus(R * 0.13, R * 0.03, v(hc.x, hc.y - R * 0.3, hc.z + R * 0.94), B.head, '#6a2333', { arc: Math.PI, rot: [0, 0, Math.PI], radial: 4, tubular: 10 });

  // Phụ kiện mặt
  if (style.accessory === 'sunglasses' || style.accessory === 'ledglasses') {
    const led = style.accessory === 'ledglasses';
    const col = led ? style.colors.accent : '#101014';
    for (const s of [1, -1]) pb.box(R * 0.36, R * 0.22, R * 0.06, v(s * R * 0.37, eyeY, eyeZ + R * 0.08), B.head, col, { glow: led ? 1.4 : 0 });
    pb.box(R * 0.9, R * 0.05, R * 0.05, v(0, eyeY + R * 0.08, eyeZ + R * 0.08), B.head, led ? col : '#2a2a2e', { glow: led ? 1.0 : 0 });
  }
}

function buildHair(pb, style, hc, R) {
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const col = style.hairColor;
  const cap = () => pb.sphere(R * 1.08, hc.clone().add(v(0, R * 0.38, -R * 0.1)), B.head, col, { scale: [1, 0.7, 1.02], seg: 14 });
  const fringe = () => pb.box(R * 1.5, R * 0.3, R * 0.32, hc.clone().add(v(0, R * 0.66, R * 0.68)), B.head, col, { rot: [-0.45, 0, 0] });
  const back = () => pb.sphere(R * 1.05, hc.clone().add(v(0, R * 0.05, -R * 0.22)), B.head, col, { scale: [1, 0.95, 0.85], seg: 12 });
  switch (style.hair) {
    case 'buzz':
      pb.sphere(R * 1.03, hc.clone().add(v(0, R * 0.2, -R * 0.06)), B.head, col, { scale: [1, 0.78, 1], seg: 14 });
      break;
    case 'spiky':
      cap();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const dir = v(Math.cos(a) * 0.55, 1, Math.sin(a) * 0.55 - 0.2).normalize();
        const at = hc.clone().add(dir.clone().multiplyScalar(R * 0.95));
        const q = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir));
        pb.cyl(0, R * 0.22, R * 0.55, at, B.head, col, { rot: [q.x, q.y, q.z], radial: 5 });
      }
      break;
    case 'long':
      cap();
      fringe();
      back();
      pb.capsule(hc.clone().add(v(0, 0, -R * 0.5)), hc.clone().add(v(0, -R * 1.45, -R * 0.55)), R * 0.72, B.head, col, { scale: [1.25, 1, 0.55] });
      break;
    case 'bun':
      cap();
      fringe();
      pb.sphere(R * 0.42, hc.clone().add(v(0, R * 1.05, -R * 0.35)), B.head, col, { seg: 10 });
      break;
    case 'twinbuns':
      cap();
      fringe();
      for (const s of [1, -1]) pb.sphere(R * 0.36, hc.clone().add(v(s * R * 0.72, R * 0.8, -R * 0.15)), B.head, col, { seg: 10 });
      break;
    case 'ponytail':
      cap();
      fringe();
      pb.capsule(hc.clone().add(v(0, R * 0.35, -R * 1.0)), hc.clone().add(v(0, -R * 0.9, -R * 1.3)), R * 0.26, B.head, col);
      break;
    case 'afro':
      pb.sphere(R * 1.42, hc.clone().add(v(0, R * 0.42, -R * 0.15)), B.head, col, { scale: [1, 0.92, 0.95], seg: 14 });
      break;
    case 'mohawk':
      pb.sphere(R * 1.02, hc.clone().add(v(0, R * 0.18, -R * 0.06)), B.head, col, { scale: [1, 0.78, 1], seg: 14 });
      for (let i = 0; i < 5; i++) {
        const a = -0.7 + i * 0.45;
        pb.box(R * 0.16, R * 0.5, R * 0.3, hc.clone().add(v(0, Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05)), B.head, col, { rot: [a, 0, 0] });
      }
      break;
    case 'bob':
      cap();
      fringe();
      back();
      for (const s of [1, -1]) pb.capsule(hc.clone().add(v(s * R * 0.92, R * 0.3, -R * 0.1)), hc.clone().add(v(s * R * 0.92, -R * 0.5, -R * 0.1)), R * 0.26, B.head, col);
      break;
    case 'curly':
      cap();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        pb.sphere(R * 0.3, hc.clone().add(v(Math.cos(a) * R * 0.75, R * 0.72 + Math.sin(a * 3) * R * 0.08, Math.sin(a) * R * 0.75 - R * 0.12)), B.head, col, { seg: 8 });
      }
      break;
    default:
      cap();
      fringe();
  }

  // Phụ kiện đầu
  const acc = style.accessory;
  const accent = style.colors.accent;
  if (acc === 'cap') {
    pb.sphere(R * 1.12, hc.clone().add(v(0, R * 0.3, -R * 0.05)), B.head, accent, { scale: [1, 0.72, 1.02], seg: 14 });
    const z = style.backwardsCap ? -1 : 1;
    pb.box(R * 1.1, R * 0.07, R * 0.85, hc.clone().add(v(0, R * 0.42, z * R * 1.15)), B.head, accent);
  } else if (acc === 'beanie') {
    pb.sphere(R * 1.12, hc.clone().add(v(0, R * 0.42, -R * 0.06)), B.head, accent, { scale: [1, 0.85, 1.02], seg: 14 });
    pb.torus(R * 1.05, R * 0.12, hc.clone().add(v(0, R * 0.32, -R * 0.03)), B.head, style.colors.top2, { rot: [Math.PI / 2, 0, 0], tubular: 18 });
  } else if (acc === 'headphones') {
    pb.torus(R * 1.18, R * 0.08, hc.clone().add(v(0, R * 0.1, 0)), B.head, '#202024', { arc: Math.PI, tubular: 14 });
    for (const s of [1, -1]) {
      pb.cyl(R * 0.34, R * 0.34, R * 0.2, hc.clone().add(v(s * R * 1.12, 0, 0)), B.head, '#202024', { rot: [0, 0, Math.PI / 2], radial: 12 });
      pb.cyl(R * 0.36, R * 0.36, R * 0.05, hc.clone().add(v(s * R * 1.23, 0, 0)), B.head, accent, { rot: [0, 0, Math.PI / 2], radial: 12, glow: 1.2 });
    }
  } else if (acc === 'headband') {
    pb.torus(R * 1.03, R * 0.08, hc.clone().add(v(0, R * 0.42, 0)), B.head, accent, { rot: [Math.PI / 2 + 0.25, 0, 0], tubular: 18, glow: style.glowTrim ? 1 : 0 });
  }
}

// ---------------------------------------------------------------- Độ dứt khoát

// "Bẻ" thời gian trong mỗi nhịp: động tác bật nhanh tới tư thế ở đầu nhịp rồi khựng lại (hit),
// thay vì đung đưa đều. 0 = mềm như cũ, 1 = rất gắt. Đi bộ/chạy giữ nguyên để bước chân tự nhiên.
export const DANCE = { sharpness: 0.7 };
const NO_SHARP = new Set(['walk', 'run']);
function sharpBeat(b, id) {
  const s = DANCE.sharpness;
  if (!s || NO_SHARP.has(id)) return b;
  const i = Math.floor(b);
  const u = b - i;
  const fast = 1 - Math.pow(1 - u, 3.2);
  return i + u + (fast - u) * s;
}

// ---------------------------------------------------------------- Character

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qc = new THREE.Quaternion();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vc = new THREE.Vector3();
const vd = new THREE.Vector3();
const eul = new THREE.Euler();
const X_AXIS = new THREE.Vector3(1, 0, 0);

export class Character {
  constructor() {
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.skel = new THREE.Group();
    this.root.add(this.pivot);
    this.pivot.add(this.skel);
    this.mesh = null;
    this.bones = null;
    this.pose = new Float32Array(N);
    this.poseA = new Float32Array(N);
    this.poseB = new Float32Array(N);
    this.current = { id: 'head_bob', start: 0 };
    this.previous = null;
    this.fade = 1;
    this.fadeDur = 0.4;
    this.ctx = { lb: 0, e: 1, v: 0.5 };
    this.beatOffset = 0;
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.yaw = 0;
    this.targetYaw = 0;
    this.faceTravel = false;
    this.speed = 2.2;
    this.spawn = 1;
    this.spawnDir = 0;
    this.hop = 0;
    this.fallH = 0;
    this.fallV = 0;
    this.squash = 0;
    this.height = 1.7;
  }

  setAvatar(style, material) {
    if (this.mesh) {
      this.skel.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.skeleton.dispose();
    }
    const { H, P } = layout(style.body);
    this.H = H;
    this.legs = { l1: LIMB.thigh, l2: LIMB.shin, hipX: LIMB.hipX, ankle: LIMB.ankle };
    const bones = buildBones(P);
    const geo = buildGeometry(style, P);
    const mesh = new THREE.SkinnedMesh(geo, material);
    mesh.add(bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.frustumCulled = false;
    this.mesh = mesh;
    this.bones = bones;
    this.skel.add(mesh);
    this.pivot.position.y = H;
    this.skel.position.y = -H;
    this.root.scale.setScalar(style.body.height);
    this.bodyScale = style.body.height;
    this.height = (P.head.y + style.body.headR * 1.9) * style.body.height;
    this.style = style;
  }

  setMaterial(material) {
    if (this.mesh) this.mesh.material = material;
  }

  // Đổi động tác với crossfade (giây). start = beat bắt đầu để động tác một lần tính từ đầu.
  setMove(id, beat, fade = 0.4) {
    if (this.current.id === id) return;
    this.previous = { ...this.current };
    this.current = { id, start: beat };
    this.fade = 0;
    this.fadeDur = Math.max(0.01, fade);
  }

  evaluate(beat, dt) {
    const b = beat + this.beatOffset;
    this.ctx.lb = beat - this.current.start;
    evalMove(this.current.id, this.poseA, sharpBeat(b, this.current.id), this.ctx);
    if (this.fade < 1 && this.previous) {
      this.fade = Math.min(1, this.fade + dt / this.fadeDur);
      this.ctx.lb = beat - this.previous.start;
      evalMove(this.previous.id, this.poseB, sharpBeat(b, this.previous.id), this.ctx);
      const k = this.fade * this.fade * (3 - 2 * this.fade);
      blendPose(this.pose, this.poseB, this.poseA, k);
    } else {
      this.pose.set(this.poseA);
    }
  }

  apply() {
    const p = this.pose;
    const bn = this.bones;
    const H = this.H;
    bn[B.hips].position.set(p[I.hx], H + p[I.hy], p[I.hz]);
    bn[B.hips].rotation.set(p[I.hrx], p[I.hry], p[I.hrz]);
    bn[B.spine].rotation.set(p[I.sx], p[I.sy], p[I.sz]);
    bn[B.chest].rotation.set(p[I.cx], p[I.cy], p[I.cz]);
    bn[B.neck].rotation.set(p[I.nx] * 0.45, p[I.ny] * 0.45, p[I.nz] * 0.45);
    bn[B.head].rotation.set(p[I.nx] * 0.55, p[I.ny] * 0.55, p[I.nz] * 0.55);
    bn[B.shL].rotation.set(-p[I.lf], p[I.lt], p[I.lo], 'XZY');
    bn[B.shR].rotation.set(-p[I.rf], -p[I.rt], -p[I.ro], 'XZY');
    bn[B.elL].rotation.set(-Math.max(0, p[I.le]), 0, 0);
    bn[B.elR].rotation.set(-Math.max(0, p[I.re]), 0, 0);
    this.solveLeg(1, B.thL, B.knL, B.ftL, p[I.lfx], p[I.lfy], p[I.lfz], p[I.lfp]);
    this.solveLeg(-1, B.thR, B.knR, B.ftR, p[I.rfx], p[I.rfy], p[I.rfz], p[I.rfp]);
    this.pivot.position.y = H + p[I.jump];
    this.pivot.rotation.set(p[I.flip], p[I.spin], p[I.tilt], 'YXZ');
  }

  // IK 2 khớp cho chân: giữ bàn chân bám sàn khi hông nhún, xoay, bật nhảy.
  solveLeg(side, thigh, knee, foot, fx, fy, fz, fp) {
    const bn = this.bones;
    const { l1, l2, hipX, ankle } = this.legs;
    const hips = bn[B.hips];
    hips.quaternion.setFromEuler(hips.rotation);
    // Vị trí khớp hông trong không gian skeleton.
    va.copy(bn[thigh].position).applyQuaternion(hips.quaternion).add(hips.position);
    // Mục tiêu cổ chân.
    vb.set(side * (hipX + 0.015 + fx), ankle + fy, fz);
    vc.subVectors(vb, va);
    // Đưa về không gian của hông.
    qa.copy(hips.quaternion).invert();
    vc.applyQuaternion(qa);
    const len = Math.min(Math.max(vc.length(), 0.12), (l1 + l2) * 0.999);
    const cosK = (l1 * l1 + l2 * l2 - len * len) / (2 * l1 * l2);
    const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, cosK)));
    vd.set(0, -l1 - l2 * Math.cos(bend), -l2 * Math.sin(bend)).normalize();
    vc.normalize();
    qb.setFromUnitVectors(vd, vc);
    const ko = this.pose[I.ko];
    if (ko) {
      qc.setFromAxisAngle(vc, side * ko);
      qb.premultiply(qc);
    }
    bn[thigh].quaternion.copy(qb);
    bn[knee].quaternion.setFromAxisAngle(X_AXIS, bend);
    // Bàn chân: luôn song song mặt sàn (cộng góc mũi chân).
    qa.copy(hips.quaternion).multiply(qb).multiply(bn[knee].quaternion).invert();
    qc.setFromEuler(eul.set(fp, 0, 0));
    bn[foot].quaternion.copy(qa).multiply(qc);
  }

  update(dt, beat) {
    if (!this.mesh) return;
    this.evaluate(beat, dt);
    this.apply();

    // Di chuyển trên sàn (tới slot / sân khấu / né chỗ cho performer).
    va.subVectors(this.target, this.pos);
    va.y = 0;
    const dist = va.length();
    if (dist > 0.002) {
      const step = Math.min(dist, this.speed * dt, dist * (1 - Math.exp(-dt * 5)) + 0.4 * dt);
      this.pos.addScaledVector(va, step / dist);
    }
    this.hop *= Math.exp(-dt * 10);
    let want = this.targetYaw;
    if (this.faceTravel && dist > 0.35) want = Math.atan2(va.x, va.z);
    let dy = (want - this.yaw) % (Math.PI * 2);
    if (dy > Math.PI) dy -= Math.PI * 2;
    if (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * (1 - Math.exp(-dt * 6));

    // Hiệu ứng xuất hiện / biến mất.
    if (this.spawnDir) {
      this.spawn = Math.min(1, Math.max(0, this.spawn + this.spawnDir * dt * 1.6));
      if (this.spawn === 1 && this.spawnDir > 0) this.spawnDir = 0;
    }
    // Rơi từ trên trời xuống (người mới vào sàn): rơi theo trọng lực, chạm đất thì nhún xẹp.
    if (this.fallH > 0) {
      this.fallV += 16 * dt;
      this.fallH -= this.fallV * dt;
      if (this.fallH <= 0) {
        this.fallH = 0;
        this.fallV = 0;
        this.squash = 1;
      }
    }
    this.squash = Math.max(0, this.squash - dt * 3.2);
    const sq = Math.sin(this.squash * Math.PI) * 0.22;
    const stretch = this.fallH > 0 ? Math.min(0.12, this.fallV * 0.012) : 0;
    const s = this.spawn;
    const pop = s < 1 ? s * (1 + 0.25 * Math.sin(s * Math.PI)) : 1;
    this.root.position.set(this.pos.x, this.pos.y + this.hop + this.fallH + (1 - s) * 1.2, this.pos.z);
    this.root.rotation.y = this.yaw;
    const k = this.bodyScale * Math.max(0.001, pop);
    this.root.scale.set(k * (1 + sq * 0.6 - stretch * 0.4), k * (1 - sq + stretch), k * (1 + sq * 0.6 - stretch * 0.4));
    this.root.visible = s > 0.001;
  }

  // Độ cao đỉnh đầu hiện tại (để đặt name tag).
  topY() {
    return this.root.position.y + (this.height + this.pose[I.jump]) * this.root.scale.y;
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.skeleton.dispose();
    }
  }
}
