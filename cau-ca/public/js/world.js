// Hồ câu dịch vụ kiểu Việt (theo bản vẽ vietnam_service_fishing_pond_layout.png): ao chữ nhật bờ xi măng, 20 chòi đánh số,
// 2 quạt nước sục khí, hàng dừa, quán võng, bàn cân + loa, bãi xe máy, đường bê tông và cổng vào.
// Mọi thứ dựng bằng hình khối low-poly + texture vẽ bằng canvas, không có file ngoài.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Gộp các khối con trực tiếp (không texture, không có con, không đánh dấu keep) của một Group thành MỘT mesh,
// màu giữ bằng vertex color. Cả khu hồ và từng người câu nhờ vậy chỉ còn vài lần vẽ thay vì hàng nghìn.
const bakedMats = {};
const bakedMat = (double, flat) =>
  (bakedMats[`${double}|${flat}`] ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, flatShading: flat, side: double ? THREE.DoubleSide : THREE.FrontSide }));
const bakeable = (c) =>
  c.isMesh &&
  !c.children.length &&
  !c.userData.keep &&
  c.visible &&
  c.material.isMeshStandardMaterial &&
  !c.material.map &&
  !c.material.transparent &&
  c.material.side !== THREE.BackSide &&
  c.material.emissive.getHex() === 0;
export function bake(group) {
  const parts = group.children.filter(bakeable);
  const batches = new Map();
  for (const m of parts) {
    const key = `${m.material.side === THREE.DoubleSide}|${m.material.flatShading}|${m.castShadow}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(m);
  }
  for (const list of batches.values()) {
    if (list.length < 2) continue;
    const double = list[0].material.side === THREE.DoubleSide;
    const flat = list[0].material.flatShading;
    const geos = list.map((m) => {
      m.updateMatrix();
      const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', src.getAttribute('position').clone());
      out.setAttribute('normal', src.getAttribute('normal').clone());
      const n = out.getAttribute('position').count;
      const colors = new Float32Array(n * 3);
      const c = m.material.color;
      for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
      out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      out.applyMatrix4(m.matrix);
      return out;
    });
    const merged = new THREE.Mesh(mergeGeometries(geos), bakedMat(double, flat));
    merged.castShadow = list[0].castShadow;
    merged.receiveShadow = list.some((m) => m.receiveShadow);
    for (const m of list) {
      group.remove(m);
      m.geometry.dispose();
    }
    geos.forEach((g) => g.dispose());
    group.add(merged);
  }
}

const mats = new Map();
export function mat(color, { rough = 0.85, metal = 0, emissive, emissiveIntensity = 1, flat = false, side, transparent, opacity, map } = {}) {
  const key = [color, rough, metal, emissive, emissiveIntensity, flat, side, transparent, opacity, map?.uuid].join('|');
  if (!mats.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: flat, map: map ?? null });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = emissiveIntensity;
    }
    if (side !== undefined) m.side = side;
    if (transparent) {
      m.transparent = true;
      m.opacity = opacity ?? 1;
    }
    mats.set(key, m);
  }
  return mats.get(key);
}

const rnd = (() => {
  let a = 1234567;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
const range = (a, b) => a + rnd() * (b - a);
const pick = (list) => list[Math.floor(rnd() * list.length)];

function mesh(geo, material, { pos, rot, scale, cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) (typeof scale === 'number' ? m.scale.setScalar(scale) : m.scale.set(...scale));
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
const box = (w, h, d, material, pos, opts = {}) => mesh(new THREE.BoxGeometry(w, h, d), material, { pos, ...opts });
const cyl = (r0, r1, h, material, pos, opts = {}) => mesh(new THREE.CylinderGeometry(r0, r1, h, opts.seg ?? 8), material, { pos, ...opts });

// Chép toàn bộ khối của một Group (kể cả group con) sang dst, giữ nguyên vị trí, để bake() gộp được một lần cho cả khu hồ.
function flatten(src, dst) {
  src.updateMatrixWorld(true);
  src.traverse((o) => {
    if (!o.isMesh) return;
    const m = new THREE.Mesh(o.geometry, o.material);
    o.matrixWorld.decompose(m.position, m.quaternion, m.scale);
    m.castShadow = o.castShadow;
    m.receiveShadow = o.receiveShadow;
    dst.add(m);
  });
}

// ---------------------------------------------------------------- Texture vẽ tay

function canvasTexture(w, h, draw, { repeat, srgb = true, anisotropy = 4 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repeat);
  }
  tex.anisotropy = anisotropy;
  return tex;
}

// Mái lá dừa: nhiều lớp lá khô chồng lên nhau, vài tàu còn xanh.
const thatchTexture = () =>
  canvasTexture(
    512,
    256,
    (g, w, h) => {
      g.fillStyle = '#8f7038';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2200; i++) {
        const x = range(0, w);
        const y = range(0, h);
        const green = rnd() < 0.14;
        g.strokeStyle = green ? `rgba(${range(90, 125)},${range(115, 140)},${range(45, 70)},${range(0.5, 0.8)})` : `rgba(${range(130, 205)},${range(95, 155)},${range(40, 85)},${range(0.35, 0.8)})`;
        g.lineWidth = range(1.2, 3.4);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + range(-5, 5), y + range(20, 46));
        g.stroke();
      }
      for (let r = 0; r < 4; r++) {
        g.fillStyle = 'rgba(55,35,12,0.3)';
        g.fillRect(0, (r * h) / 4, w, 7);
      }
    },
    { repeat: [2, 1] },
  );

// Mái tôn sóng màu xanh, có vệt gỉ.
const zincTexture = () =>
  canvasTexture(
    256,
    256,
    (g, w, h) => {
      g.fillStyle = '#4f83a6';
      g.fillRect(0, 0, w, h);
      const n = 16;
      for (let i = 0; i < n; i++) {
        const x = (i / n) * w;
        const grad = g.createLinearGradient(x, 0, x + w / n, 0);
        grad.addColorStop(0, 'rgba(255,255,255,0.28)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0.05)');
        grad.addColorStop(1, 'rgba(0,20,40,0.32)');
        g.fillStyle = grad;
        g.fillRect(x, 0, w / n, h);
      }
      for (let i = 0; i < 26; i++) {
        g.fillStyle = `rgba(${range(130, 170)},${range(70, 95)},${range(30, 50)},${range(0.12, 0.32)})`;
        g.fillRect(range(0, w), range(0, h * 0.5), range(3, 9), range(40, 170));
      }
    },
    { repeat: [2, 1] },
  );

// Tấm biển gỗ sơn số chòi: 20 biển chung một ảnh. Chòi số đẹp (8, 9) sơn đỏ chữ vàng.
const SIGN_COLS = 5;
const SIGN_ROWS = 4;
const signAtlas = () =>
  canvasTexture(1280, 800, (g, w, h) => {
    const cw = w / SIGN_COLS;
    const ch = h / SIGN_ROWS;
    for (let n = 1; n <= 20; n++) {
      const x = ((n - 1) % SIGN_COLS) * cw;
      const y = Math.floor((n - 1) / SIGN_COLS) * ch;
      const lucky = n === 8 || n === 9;
      g.fillStyle = '#4a2c12';
      g.fillRect(x, y, cw, ch);
      g.fillStyle = lucky ? '#c81e1e' : '#c98c4a';
      g.fillRect(x + 8, y + 8, cw - 16, ch - 16);
      g.strokeStyle = lucky ? 'rgba(90,0,0,0.3)' : 'rgba(90,50,20,0.28)';
      g.lineWidth = 3;
      for (let i = 1; i < 5; i++) {
        g.beginPath();
        g.moveTo(x + 8, y + (i * ch) / 5);
        g.bezierCurveTo(x + cw * 0.3, y + (i * ch) / 5 + range(-5, 5), x + cw * 0.7, y + (i * ch) / 5 + range(-5, 5), x + cw - 8, y + (i * ch) / 5);
        g.stroke();
      }
      g.font = '900 160px "Segoe UI", Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 16;
      g.strokeStyle = lucky ? '#5c0a0a' : '#3b2008';
      g.strokeText(n, x + cw / 2, y + ch / 2 + 8);
      g.fillStyle = lucky ? '#ffd83a' : '#ffffff';
      g.fillText(n, x + cw / 2, y + ch / 2 + 8);
    }
  });

function signUv(geo, n) {
  const col = (n - 1) % SIGN_COLS;
  const row = Math.floor((n - 1) / SIGN_COLS);
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / SIGN_COLS, 1 - (row + 1 - uv.getY(i)) / SIGN_ROWS);
  return geo;
}

// Tấm biển chữ, lẻ một mặt.
const paintedBoard = (w, h, bg, draw) =>
  canvasTexture(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    draw(g, w, h);
  });

// ---------------------------------------------------------------- Bản vẽ → toạ độ cảnh
// Toạ độ pixel lấy từ vietnam_service_fishing_pond_layout.png (giữa ao là px 705.5, 632.5; 1 px = 0,0192 đơn vị).
// Ảnh nhìn từ trên xuống: phía trên ảnh là phía xa máy quay (z âm), bên phải ảnh là đường vào (x dương).
const K = 0.0192;
const P = (px, py) => [(px - 705.5) * K, (py - 632.5) * K];

const POND_HX = 9.6; // nửa chiều ngang ao
const POND_HZ = 7.05; // nửa chiều dọc ao
const RIM = 0.4; // bờ xi măng
const BANK_Y = 0.36; // mặt đất cao hơn mặt nước
const DECK_Y = 0.46;
const HUT_SPACING = 117.6 * K;

const FANS = [P(500, 632), P(912, 632)].map(([x, z]) => ({ x, z }));
// swim: đường lượn của cá mập trong sự kiện.
export const POND = { hx: POND_HX, hz: POND_HZ, fans: FANS, swim: { x: 0, z: 0, rx: 6.8, rz: 4.3 } };

const ROW_X = [285, 403, 520, 638, 756, 873, 991, 1108].map((px) => P(px, 0)[0]);
const SEAT_OFF = RIM + 0.6; // ghế cách mép nước
// Thứ tự đúng số chòi trên bản vẽ: 1–8 bờ trên (trái → phải), 9–16 bờ dưới (phải → trái), 17–20 bờ trái (dưới → trên).
// gap: khoảng từ ghế tới mái, bờ dưới lớn hơn vì mái nằm giữa người câu và máy quay.
const HUTS = [
  ...ROW_X.map((x) => ({ x, z: -(POND_HZ + SEAT_OFF), inward: [0, 1], gap: 0.72 })),
  ...[...ROW_X].reverse().map((x) => ({ x, z: POND_HZ + SEAT_OFF, inward: [0, -1], gap: 1.05 })),
  ...[825, 677, 530, 383].map((py) => ({ x: -(POND_HX + SEAT_OFF), z: P(0, py)[1], inward: [1, 0], gap: 0.8 })),
];
export const HUT_COUNT = HUTS.length;

const PROP = { x0: -13.8, x1: 15, z0: -13, z1: 13.1 }; // ranh khu hồ (đường nét đứt trên bản vẽ)
const ROAD = { x0: POND_HX + RIM, x1: POND_HX + RIM + 1.28 };
const RIGHT = { x0: P(1294, 0)[0] + 0.12, x1: P(1447, 0)[0] + 0.4 }; // dải bên phải: quán võng, bàn cân, bãi xe

// ---------------------------------------------------------------- Shader nước

// Gợn tròn do giọt mưa: lưới ô, mỗi ô thỉnh thoảng nở một vòng (amount = mật độ 0..1).
const rainRings = /* glsl */ `
  float rainHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float rainRings(vec2 p, float time, float amount) {
    float acc = 0.0;
    for (int k = 0; k < 3; k++) {
      vec2 q = p + vec2(float(k) * 17.1, float(k) * 9.7);
      vec2 cell = floor(q);
      vec2 f = fract(q) - 0.5;
      float h = rainHash(cell + float(k) * 3.7);
      if (h > amount) continue;
      vec2 c = (vec2(rainHash(cell + 1.3), rainHash(cell + 7.1)) - 0.5) * 0.5;
      float ph = fract(time * (0.9 + h * 0.6) + h * 10.0);
      float d = length(f - c);
      acc += smoothstep(0.05, 0.0, abs(d - ph * 0.42)) * (1.0 - ph) * (1.0 - ph);
    }
    return acc;
  }
`;

const glsl2 = (n) => (Number.isInteger(n) ? `${n}.0` : `${n}`);
const vec2Of = (a, b) => `vec2(${glsl2(a)}, ${glsl2(b)})`;

const pondVertex = /* glsl */ `
  varying vec3 vP;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vP = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// Nước ao xanh rêu, ánh màu trời. Quạt nước khuấy bọt trắng và đẩy sóng tròn về phía nam. Tối: vệt đèn tuýp hắt dọc bờ.
const pondFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uTint;
  uniform float uRain;
  uniform float uNight;
  uniform float uLamp;
  uniform float uWind;
  uniform vec3 uTop;
  uniform vec3 uHor;
  uniform vec3 uGlint;
  uniform vec3 uSunDir;
  varying vec3 vP;
  ${rainRings}
  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = rainHash(i);
    float b = rainHash(i + vec2(1.0, 0.0));
    float c = rainHash(i + vec2(0.0, 1.0));
    float d = rainHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  vec2 waves(vec2 p, float t) {
    float amp = 1.0 + uWind * 1.2 + uRain * 0.6;
    vec2 g = vec2(0.0);
    g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 1.7 + t * 1.1) * 0.035;
    g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 3.1 + t * 1.6) * 0.03;
    g += vec2(0.3, -0.95) * cos(dot(p, vec2(0.3, -0.95)) * 6.3 + t * 2.3) * 0.022;
    g += vec2(0.93, 0.37) * cos(dot(p, vec2(0.93, 0.37)) * 11.0 + t * 3.1) * 0.016;
    return g * amp;
  }
  // Bọt của một quạt: hai vùng sục dưới bánh guồng, một dải bọt loe dần về phía nam (z dương) và các vòng sóng trên bản vẽ.
  void fan(vec2 p, float t, inout vec2 grad, inout float foam) {
    float r = max(length(p), 0.001);
    grad += (p / r) * cos(r * 7.0 - t * 6.0) * 0.07 * exp(-r * 0.5);
    float south = smoothstep(-0.2, 0.5, p.y);
    float widen = 0.9 + max(p.y, 0.0) * 0.32;
    float trail = smoothstep(4.2, 0.2, p.y) * south * smoothstep(1.5, 0.3, abs(p.x) / widen);
    float wheel = smoothstep(1.05, 0.25, length(vec2(abs(p.x) - 1.05, p.y * 1.15)));
    float body = max(trail * 0.8, wheel);
    float n = noise2(p * 5.5 + vec2(0.0, -t * 1.9)) * 0.6 + noise2(p * 13.0 + vec2(t * 0.7, -t * 2.6)) * 0.4;
    float bubble = smoothstep(1.02 - body * 0.72, 1.2 - body * 0.72, n + 0.32) * smoothstep(0.02, 0.3, body);
    float arc = smoothstep(0.1, 0.0, abs(fract(r * 0.72 - t * 0.42) - 0.5)) * south * smoothstep(5.2, 1.3, r) * smoothstep(0.75, 0.1, abs(p.x) / max(r, 0.5));
    foam = max(foam, max(bubble, arc * 0.55));
  }
  float twinkle(vec2 p, float time) {
    vec2 cell = floor(p);
    float h = rainHash(cell);
    if (h < 0.7) return 0.0;
    vec2 c = vec2(rainHash(cell + 2.1), rainHash(cell + 5.3)) * 0.6 + 0.2;
    float d = length((fract(p) - c) * vec2(0.55, 1.5));
    float blink = 0.5 + 0.5 * sin(time * (1.2 + h * 2.5) + h * 40.0);
    return smoothstep(0.15, 0.0, d) * blink * blink;
  }
  void main() {
    vec2 xz = vP.xz;
    float t = uTime;
    vec2 g = waves(xz, t);
    float foam = 0.0;
    fan(xz - ${vec2Of(FANS[0].x, FANS[0].z)}, t, g, foam);
    fan(xz - ${vec2Of(FANS[1].x, FANS[1].z)}, t + 2.3, g, foam);
    vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 V = normalize(cameraPosition - vP);
    vec3 R = reflect(-V, N);
    // ven bờ nước đục sáng hơn giữa ao
    float rim = min(${glsl2(POND_HX)} - abs(xz.x), ${glsl2(POND_HZ)} - abs(xz.y));
    float mud = noise2(xz * 0.35 + 3.0);
    vec3 deep = mix(vec3(0.05, 0.19, 0.125), vec3(0.075, 0.22, 0.13), mud);
    vec3 shallow = vec3(0.16, 0.31, 0.19);
    vec3 col = mix(shallow, deep, smoothstep(0.0, 2.4, rim));
    // ánh trời trên mặt nước: nhìn càng xiên càng rõ
    float fres = 0.2 + 0.8 * pow(1.0 - max(dot(N, V), 0.0), 3.0);
    vec3 sky = mix(uHor, uTop, smoothstep(0.1, 0.8, R.y));
    col = mix(col, sky, fres * 0.62);
    // nắng lấp lánh theo màu nắng lúc đó
    float sun = pow(max(dot(R, uSunDir), 0.0), 240.0) * 1.8 + pow(max(dot(R, uSunDir), 0.0), 24.0) * 0.1;
    col += uGlint * sun;
    vec2 wob = xz + g * 2.5;
    col += uGlint * twinkle(wob * vec2(1.1, 2.6) + vec2(t * 0.06, 0.0), t) * 0.26 * (1.0 - uNight);
    col += uGlint * twinkle(wob * vec2(2.1, 4.6) + 7.0, t * 1.4) * 0.14 * (1.0 - uNight);
    col *= uTint;
    // đèn tuýp hắt xuống nước: mỗi chòi một vệt, kéo dài ra giữa ao và rung rinh theo sóng
    vec3 lampCol = vec3(0.85, 1.0, 0.92);
    float wx = (xz.x - ${glsl2(HUTS[0].x)}) / ${glsl2(HUT_SPACING)} + g.x * 1.5;
    float streakX = pow(0.5 + 0.5 * cos(6.2832 * wx), 12.0);
    float rowLight = streakX * exp(-(${glsl2(POND_HZ)} - abs(xz.y)) * 0.85) * step(abs(xz.x), ${glsl2(POND_HX)} - 0.7);
    float wz = (xz.y - ${glsl2(HUTS[16].z)}) / ${glsl2((677 - 825) * K)} + g.y * 1.5;
    float streakZ = pow(0.5 + 0.5 * cos(6.2832 * wz), 12.0) * smoothstep(5.2, 3.4, abs(xz.y + 0.6));
    float sideLight = streakZ * exp(-(xz.x + ${glsl2(POND_HX)}) * 0.85);
    col += lampCol * uLamp * (rowLight + sideLight) * 0.42;
    // bọt trắng của quạt nước, trời tối vẫn thấy nhờ ánh đèn
    vec3 foamCol = mix(vec3(0.95, 0.98, 0.96), vec3(0.32, 0.4, 0.46), uNight * (1.0 - uLamp * 0.5));
    col = mix(col, foamCol * max(uTint, vec3(0.4)), foam * 0.9);
    // mưa làm mặt ao gợn tròn
    col += vec3(0.8, 0.9, 0.95) * rainRings(xz * 1.35, t, uRain * 0.95) * 0.42;
    float alpha = mix(0.82, 0.94, smoothstep(0.0, 2.0, rim));
    gl_FragColor = vec4(col, max(alpha, foam));
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------- Dựng cảnh

// overview: { pos, look } của góc máy toàn cảnh.
export function buildWorld(scene, overview) {
  const updaters = [];
  const uniforms = {
    uTime: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uRain: { value: 0 },
    uNight: { value: 0 },
    uLamp: { value: 0 }, // 0: đèn tắt; 1: đèn tuýp sáng
    uWind: { value: 0 },
    uTop: { value: new THREE.Color('#3f7fc4') },
    uHor: { value: new THREE.Color('#ffd29a') },
    uGlint: { value: new THREE.Color('#fff3dc') },
    uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.5).normalize() },
  };
  // Gió do weather.js đặt: dấu là hướng, độ lớn 0..~1.5
  const env = { wind: 0 };

  const haze = new THREE.Color('#ffd9ac');
  scene.background = haze.clone();
  scene.fog = new THREE.Fog(haze.clone(), 58, 128);

  // Khối tĩnh không texture gom vào đây, cuối cùng bake() thành vài mesh.
  const props = new THREE.Group();
  const farProps = new THREE.Group(); // cảnh xa: không đổ bóng
  // Khối có texture dùng chung gom theo vật liệu rồi gộp hình học.
  const texBatches = new Map();
  function addTextured(material, geo, matrix, { cast = true } = {}) {
    if (!texBatches.has(material)) texBatches.set(material, { geos: [], cast });
    texBatches.get(material).geos.push(geo.applyMatrix4(matrix));
  }
  const thatchMat = new THREE.MeshStandardMaterial({ map: thatchTexture(), roughness: 1, side: THREE.DoubleSide });
  const zincMat = new THREE.MeshStandardMaterial({ map: zincTexture(), roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide });
  const signMat = new THREE.MeshStandardMaterial({ map: signAtlas(), roughness: 0.8 });
  // đèn tuýp: sáng lên khi trời tối (weather.js chỉnh độ sáng)
  const tubeMat = new THREE.MeshStandardMaterial({ color: '#eef8f2', emissive: '#d8fff0', emissiveIntensity: 0.1, roughness: 0.3 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#ffe8b0', emissive: '#ffb648', emissiveIntensity: 0.1, roughness: 0.4 });
  const lampPool = new THREE.MeshBasicMaterial({ map: haloTexture(), color: '#dffff0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

  // ---------------------------------------------------------------- Đất: bãi cỏ trong khu hồ, ruộng lúa bên ngoài
  {
    const W = PROP.x1 - PROP.x0;
    const D = PROP.z1 - PROP.z0;
    const toX = (x, cw) => ((x - PROP.x0) / W) * cw;
    const toY = (z, ch) => ((z - PROP.z0) / D) * ch;
    const lawn = canvasTexture(
      2048,
      1860,
      (g, w, h) => {
        g.fillStyle = '#b6d488';
        g.fillRect(0, 0, w, h);
        // mảng cỏ đậm nhạt
        for (let i = 0; i < 520; i++) {
          const r = range(24, 90);
          const x = range(0, w);
          const y = range(0, h);
          const dark = rnd() < 0.55;
          const grad = g.createRadialGradient(x, y, 0, x, y, r);
          grad.addColorStop(0, dark ? `rgba(120,160,70,${range(0.14, 0.3)})` : `rgba(214,226,140,${range(0.12, 0.26)})`);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = grad;
          g.fillRect(x - r, y - r, r * 2, r * 2);
        }
        // ngọn cỏ
        for (let i = 0; i < 26000; i++) {
          const x = range(0, w);
          const y = range(0, h);
          const shade = rnd();
          g.strokeStyle = shade < 0.5 ? `rgba(92,136,56,${range(0.18, 0.42)})` : `rgba(220,232,150,${range(0.14, 0.34)})`;
          g.lineWidth = 1.4;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + range(-2.5, 2.5), y - range(4, 10));
          g.stroke();
        }
        // lối đất giẫm mòn: sau lưng các chòi, nối ra đường bê tông
        const dirt = (x0, z0, x1, z1) => {
          const px0 = toX(x0, w);
          const py0 = toY(z0, h);
          const px1 = toX(x1, w);
          const py1 = toY(z1, h);
          for (let i = 0; i < 140; i++) {
            const u = rnd();
            const x = px0 + (px1 - px0) * u + range(-20, 20);
            const y = py0 + (py1 - py0) * u + range(-20, 20);
            const r = range(14, 36);
            const grad = g.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, `rgba(178,140,92,${range(0.25, 0.55)})`);
            grad.addColorStop(1, 'rgba(178,140,92,0)');
            g.fillStyle = grad;
            g.fillRect(x - r, y - r, r * 2, r * 2);
          }
        };
        dirt(-13, -11.2, ROAD.x0, -11.2);
        dirt(-13.2, -11.2, -13.2, 10.8);
        dirt(-13.2, 10.8, ROAD.x0, 10.8);
        // bãi xe và nền quán láng xi măng
        const slab = (x0, z0, x1, z1, fill) => {
          g.fillStyle = fill;
          g.fillRect(toX(x0, w), toY(z0, h), toX(x1, w) - toX(x0, w), toY(z1, h) - toY(z0, h));
        };
        const lot = P(0, 810)[1];
        const lotEnd = P(0, 1103)[1];
        slab(RIGHT.x0, lot, RIGHT.x1, lotEnd, '#d3cfc6');
        g.strokeStyle = 'rgba(90,86,78,0.35)';
        g.lineWidth = 4;
        for (let i = 1; i < 4; i++) {
          const x = toX(RIGHT.x0 + ((RIGHT.x1 - RIGHT.x0) * i) / 4, w);
          g.beginPath();
          g.moveTo(x, toY(lot, h));
          g.lineTo(x, toY(lotEnd, h));
          g.stroke();
        }
        for (let i = 0; i < 90; i++) {
          g.fillStyle = `rgba(90,86,78,${range(0.05, 0.16)})`;
          g.beginPath();
          g.arc(range(toX(RIGHT.x0, w), toX(RIGHT.x1, w)), range(toY(lot, h), toY(lotEnd, h)), range(2, 16), 0, 7);
          g.fill();
        }
      },
      { anisotropy: 8 },
    );
    // mặt đất có lỗ đúng bằng cái ao
    const ex = POND_HX + 0.02;
    const ez = POND_HZ + 0.02;
    const shape = new THREE.Shape();
    shape.moveTo(PROP.x0, -PROP.z1);
    shape.lineTo(PROP.x1, -PROP.z1);
    shape.lineTo(PROP.x1, -PROP.z0);
    shape.lineTo(PROP.x0, -PROP.z0);
    shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-ex, -ez);
    hole.lineTo(-ex, ez);
    hole.lineTo(ex, ez);
    hole.lineTo(ex, -ez);
    hole.closePath();
    shape.holes.push(hole);
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const p = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - PROP.x0) / W, 1 - (p.getZ(i) - PROP.z0) / D);
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: lawn, roughness: 1 }));
    ground.position.y = BANK_Y;
    ground.receiveShadow = true;
    ground.userData.keep = true;
    scene.add(ground);

    // ruộng lúa: thửa xanh thửa vàng, bờ ruộng sáng màu
    const rice = canvasTexture(
      1024,
      1024,
      (g, w, h) => {
        const n = 5;
        const cell = w / n;
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            const ripe = rnd() < 0.4;
            g.fillStyle = ripe ? pick(['#c9b656', '#d6bf58', '#bfae4e']) : pick(['#7fa94c', '#6d9c45', '#8bb353']);
            g.fillRect(x * cell, y * cell, cell, cell);
            g.strokeStyle = ripe ? 'rgba(130,110,40,0.18)' : 'rgba(50,90,40,0.2)';
            g.lineWidth = 2;
            for (let k = 6; k < cell; k += 12) {
              g.beginPath();
              g.moveTo(x * cell + k, y * cell);
              g.lineTo(x * cell + k + range(-2, 2), (y + 1) * cell);
              g.stroke();
            }
            g.strokeStyle = '#a78f5c';
            g.lineWidth = 7;
            g.strokeRect(x * cell, y * cell, cell, cell);
          }
        }
      },
      { repeat: [4.5, 4.5], anisotropy: 8 },
    );
    // ruộng bao quanh, chừa đúng phần khu hồ (không thì đè lên mặt ao)
    const land = new THREE.Shape();
    land.moveTo(-56, 36);
    land.lineTo(56, 36);
    land.lineTo(56, -48);
    land.lineTo(-56, -48);
    land.closePath();
    const yard = new THREE.Path();
    yard.moveTo(PROP.x0, -PROP.z1);
    yard.lineTo(PROP.x0, -PROP.z0);
    yard.lineTo(PROP.x1, -PROP.z0);
    yard.lineTo(PROP.x1, -PROP.z1);
    yard.closePath();
    land.holes.push(yard);
    const landGeo = new THREE.ShapeGeometry(land);
    landGeo.rotateX(-Math.PI / 2);
    const lp = landGeo.getAttribute('position');
    const luv = landGeo.getAttribute('uv');
    for (let i = 0; i < lp.count; i++) luv.setXY(i, lp.getX(i) / 112, lp.getZ(i) / 112);
    const fields = mesh(landGeo, new THREE.MeshStandardMaterial({ map: rice, roughness: 1 }), { pos: [0, BANK_Y - 0.02, 0], cast: false });
    fields.userData.keep = true;
    scene.add(fields);
  }

  // ---------------------------------------------------------------- Ao: thành xi măng, đáy bùn, mặt nước
  {
    const concrete = mat('#b4ae9f', { rough: 0.95 });
    const concreteDark = mat('#8f8a7c', { rough: 0.95 });
    const outerZ = POND_HZ + RIM;
    for (const s of [-1, 1]) {
      props.add(box(RIM, 2.2, outerZ * 2, concrete, [s * (POND_HX + RIM / 2), BANK_Y + 0.05 - 1.1, 0]));
      props.add(box(POND_HX * 2, 2.2, RIM, concrete, [0, BANK_Y + 0.05 - 1.1, s * (POND_HZ + RIM / 2)]));
      // vệt rêu ẩm sát mặt nước
      props.add(box(0.03, 0.16, POND_HZ * 2, concreteDark, [s * (POND_HX - 0.015), 0.07, 0], { cast: false }));
      props.add(box(POND_HX * 2, 0.16, 0.03, concreteDark, [0, 0.07, s * (POND_HZ - 0.015)], { cast: false }));
    }
    const floor = box(POND_HX * 2, 0.1, POND_HZ * 2, mat('#1d2b1e', { rough: 1 }), [0, -1.9, 0], { cast: false });
    props.add(floor);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(POND_HX * 2, POND_HZ * 2).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, vertexShader: pondVertex, fragmentShader: pondFragment }),
    );
    water.renderOrder = 2;
    water.userData.keep = true;
    scene.add(water);
  }

  // ---------------------------------------------------------------- Đường bê tông và cổng vào
  {
    const concrete = canvasTexture(
      256,
      512,
      (g, w, h) => {
        g.fillStyle = '#d3cfc6';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 500; i++) {
          g.fillStyle = `rgba(${rnd() < 0.5 ? '120,116,106' : '238,234,224'},${range(0.05, 0.14)})`;
          g.beginPath();
          g.arc(range(0, w), range(0, h), range(1, 8), 0, 7);
          g.fill();
        }
        g.fillStyle = 'rgba(85,80,70,0.55)';
        g.fillRect(0, h - 5, w, 5);
        g.strokeStyle = 'rgba(85,80,70,0.3)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(range(30, 200), 0);
        g.lineTo(range(30, 200), h * 0.5);
        g.lineTo(range(30, 200), h * 0.9);
        g.stroke();
      },
      { repeat: [1, 7] },
    );
    const len = PROP.z1 - PROP.z0 + 12;
    const road = mesh(new THREE.BoxGeometry(ROAD.x1 - ROAD.x0, 0.08, len), new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.95 }), { pos: [(ROAD.x0 + ROAD.x1) / 2, BANK_Y + 0.02, (PROP.z0 + PROP.z1 + 12) / 2], cast: false });
    road.userData.keep = true;
    scene.add(road);

    // cổng
    const gateZ = PROP.z1;
    const brick = mat('#c76d45', { rough: 0.95 });
    const cap = mat('#e8dfc8');
    const gate = new THREE.Group();
    for (const x of [ROAD.x0 - 0.3, ROAD.x1 + 0.3]) {
      gate.add(box(0.42, 2.9, 0.42, brick, [x, BANK_Y + 1.45, gateZ]));
      gate.add(box(0.52, 0.12, 0.52, cap, [x, BANK_Y + 2.96, gateZ]));
    }
    const midX = (ROAD.x0 + ROAD.x1) / 2;
    const spanW = ROAD.x1 - ROAD.x0 + 1.04;
    gate.add(box(spanW, 0.16, 0.2, mat('#6b4426'), [midX, BANK_Y + 2.72, gateZ]));
    flatten(gate, props);
    const board = paintedBoard(512, 150, '#1b5e8f', (g, w, h) => {
      g.strokeStyle = '#ffe066';
      g.lineWidth = 10;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#ffe066';
      g.font = '900 86px "Segoe UI", Arial, sans-serif';
      g.fillText('HỒ CÂU CÁ', w / 2, h / 2 + 4);
    });
    const sign = mesh(new THREE.PlaneGeometry(spanW + 0.25, (spanW + 0.25) * 0.3), new THREE.MeshStandardMaterial({ map: board, roughness: 0.7, side: THREE.DoubleSide }), { pos: [midX, BANK_Y + 3.12, gateZ + 0.12], rot: [-0.55, 0, 0] });
    sign.userData.keep = true;
    scene.add(sign);
  }

  // ---------------------------------------------------------------- Hàng rào quanh khu hồ
  {
    const postMat = mat('#8a6a3c', { rough: 0.95 });
    const railMat = mat('#a08356', { rough: 0.95 });
    const y = BANK_Y;
    const side = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.round(len / 1.9);
      for (let i = 0; i <= n; i++) props.add(cyl(0.05, 0.06, 1, postMat, [x0 + ((x1 - x0) * i) / n, y + 0.5, z0 + ((z1 - z0) * i) / n], { seg: 5 }));
      const a = Math.atan2(x1 - x0, z1 - z0);
      for (const h of [0.42, 0.82]) props.add(box(0.035, 0.05, len, railMat, [(x0 + x1) / 2, y + h, (z0 + z1) / 2], { rot: [0, a, 0], cast: false }));
    };
    side(PROP.x0, PROP.z0, ROAD.x0 - 0.2, PROP.z0);
    side(ROAD.x1 + 0.2, PROP.z0, PROP.x1, PROP.z0);
    side(PROP.x0, PROP.z0, PROP.x0, PROP.z1);
    side(PROP.x1, PROP.z0, PROP.x1, PROP.z1);
    side(PROP.x0, PROP.z1, ROAD.x0 - 0.3, PROP.z1);
    side(ROAD.x1 + 0.3, PROP.z1, PROP.x1, PROP.z1);
  }

  // ---------------------------------------------------------------- 20 chòi câu
  const seats = [];
  const CHAIRS = ['#d6332f', '#2268b8', '#2f9e55', '#e8912b', '#f2efe6'];
  const bamboo = mat('#c8ae62', { rough: 0.7 });
  const bambooDark = mat('#8f7a3f', { rough: 0.75 });
  const plank = ['#a37546', '#96683b', '#ad7f4f', '#8d6135'].map((c) => mat(c, { rough: 0.95 }));
  const pile = mat('#5e4a30');
  const weave = mat('#c0a56c', { rough: 1 });
  const rodMat = mat('#2b2b33', { rough: 0.4 });
  const rodGold = mat('#e0b54a', { rough: 0.35, metal: 0.5 });
  const netMat = new THREE.MeshStandardMaterial({ color: '#e9ebe2', transparent: true, opacity: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
  const netGeos = [];
  // biển số song song với màn hình của máy toàn cảnh: chòi nào cũng thấy số thẳng, không bị nghiêng theo phối cảnh
  const signTurn = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(overview.pos, overview.look, new THREE.Vector3(0, 1, 0)));
  const signBack = new THREE.Vector3(0, 0, -1).applyQuaternion(signTurn);

  HUTS.forEach((h, i) => {
    const n = i + 1;
    const inward = new THREE.Vector3(h.inward[0], 0, h.inward[1]);
    const rotY = Math.atan2(inward.x, inward.z);
    const pos = new THREE.Vector3(h.x, DECK_Y, h.z);
    const side = new THREE.Vector3(inward.z, 0, -inward.x);
    // cần thả hơi chếch vào giữa ao như bản vẽ
    const skew = (h.inward[1] !== 0 ? -Math.sign(h.x || 1) * h.inward[1] : -Math.sign(h.z || 1) * h.inward[0]) * 0.1 + range(-0.04, 0.04);
    const aim = inward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), skew);

    const st = new THREE.Group();
    st.position.copy(pos);
    st.rotation.y = rotY;
    const gap = h.gap;
    const roofFront = -gap;
    const roofBack = -gap - 1.65;
    const postX = 0.84;

    // sàn gỗ từ sau chòi chìa ra mép nước
    const deckFront = SEAT_OFF - RIM + 0.72;
    for (let z = roofBack - 0.1; z < deckFront; z += 0.4) st.add(box(1.98 + range(-0.05, 0.05), 0.08, 0.37, pick(plank), [range(-0.015, 0.015), -0.04, z + 0.18]));
    for (const x of [-0.85, 0.85]) {
      st.add(box(0.09, 0.1, deckFront - roofBack + 0.1, pile, [x, -0.12, (deckFront + roofBack) / 2 - 0.05], { cast: false }));
      st.add(cyl(0.05, 0.05, 1, pile, [x, -0.62, deckFront - 0.12], { seg: 6, cast: false }));
    }

    // cột tre, xà và ván sau
    for (const [x, z] of [[-postX, roofFront], [postX, roofFront], [-postX, roofBack], [postX, roofBack]]) {
      const pole = cyl(0.058, 0.066, 2.46, bamboo, [x, 1.21, z]);
      st.add(pole);
      for (const y of [0.45, 1.05, 1.65, 2.2]) st.add(cyl(0.072, 0.072, 0.035, bambooDark, [x, y, z]));
    }
    for (const z of [roofFront, roofBack]) st.add(cyl(0.05, 0.05, postX * 2 + 0.3, bamboo, [0, 2.4, z], { rot: [0, 0, Math.PI / 2], seg: 6 }));
    for (const x of [-postX, postX]) st.add(cyl(0.05, 0.05, 1.8, bamboo, [x, 2.4, (roofFront + roofBack) / 2], { rot: [Math.PI / 2, 0, 0], seg: 6 }));
    st.add(box(postX * 2, 1.62, 0.05, weave, [0, 0.82, roofBack + 0.02]));
    // nan phên tre
    for (let k = 1; k < 8; k++) st.add(box(postX * 2, 0.025, 0.012, bambooDark, [0, 0.02 + k * 0.2, roofBack + 0.05], { cast: false }));
    for (const x of [-postX, postX]) st.add(cyl(0.03, 0.03, 1.65, bamboo, [x, 0.75, (roofFront + roofBack) / 2], { rot: [Math.PI / 2, 0, 0], seg: 5, cast: false }));

    // ghế: ghế nhựa có tựa hoặc ghế xếp; mặt ghế cao đúng 0,47 (fisher.js ngồi ở mức này)
    const chair = mat(CHAIRS[i % CHAIRS.length], { rough: 0.5 });
    if (i % 3 !== 1) {
      st.add(box(0.62, 0.05, 0.58, chair, [0, 0.445, -0.02]));
      for (const [x, z] of [[-0.27, -0.26], [0.27, -0.26], [-0.27, 0.22], [0.27, 0.22]]) st.add(box(0.05, 0.43, 0.05, chair, [x, 0.21, z]));
      st.add(box(0.6, 0.48, 0.04, chair, [0, 0.82, -0.31], { rot: [-0.14, 0, 0] }));
    } else {
      const frame = mat('#5a6168', { rough: 0.4, metal: 0.5 });
      const cloth = mat(['#2f6f4f', '#a03c30', '#34588c'][i % 3], { rough: 0.95, side: THREE.DoubleSide });
      st.add(box(0.6, 0.03, 0.56, cloth, [0, 0.45, -0.02]));
      st.add(box(0.6, 0.46, 0.03, cloth, [0, 0.8, -0.33], { rot: [-0.26, 0, 0] }));
      for (const x of [-0.3, 0.3]) {
        st.add(box(0.03, 0.62, 0.03, frame, [x, 0.22, -0.02], { rot: [0.72, 0, 0] }));
        st.add(box(0.03, 0.62, 0.03, frame, [x, 0.22, -0.02], { rot: [-0.72, 0, 0] }));
      }
    }

    // thùng đá xốp nắp xanh và gói cám
    st.add(box(0.5, 0.36, 0.36, mat('#f1f1ea', { rough: 1 }), [-0.74, 0.18, -0.5]));
    st.add(box(0.53, 0.06, 0.39, mat(i % 2 ? '#2b7fc4' : '#d8473a', { rough: 0.6 }), [-0.74, 0.39, -0.5]));
    st.add(mesh(new THREE.DodecahedronGeometry(0.2, 0), mat(i % 2 ? '#e9c13f' : '#cf4a2c', { flat: true, rough: 0.9 }), { pos: [0.72, 0.15, -0.42], scale: [1, 0.78, 0.7] }));
    st.add(box(0.2, 0.02, 0.14, mat('#fff4d0'), [0.72, 0.3, -0.42], { rot: [0.3, 0.2, 0] }));

    // vợt dựng vào cột
    const netAt = new THREE.Group();
    netAt.position.set(postX + 0.08, 0, roofFront + 0.05);
    netAt.rotation.set(0.1, 0, -0.16);
    netAt.add(cyl(0.018, 0.022, 1.45, bambooDark, [0, 0.7, 0], { seg: 5, cast: false }));
    netAt.add(mesh(new THREE.TorusGeometry(0.2, 0.014, 5, 16), bambooDark, { pos: [0, 1.6, 0], cast: false }));
    st.add(netAt);
    st.updateMatrixWorld(true);
    {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(postX + 0.08, 1.6, roofFront + 0.05), new THREE.Quaternion().setFromEuler(netAt.rotation), new THREE.Vector3(1, 1, 1));
      m.premultiply(st.matrix);
      const cone = new THREE.ConeGeometry(0.19, 0.42, 10, 1, true);
      cone.rotateX(Math.PI / 2);
      cone.translate(0, 0, 0.22);
      cone.applyMatrix4(m);
      netGeos.push(cone);
    }

    // mái hai dốc: chòi nào cũng có sóng lá dừa, thỉnh thoảng một mái tôn
    const roofMat = n % 3 === 0 ? zincMat : thatchMat;
    const rise = 0.72;
    const run = (roofBack - roofFront) / 2;
    const slope = Math.hypot(rise, run) + 0.1;
    const angle = Math.atan2(rise, -run);
    const midZ = (roofFront + roofBack) / 2;
    const eave = 2.34;
    const bias = roofMat === zincMat ? 0.04 : 0.09;
    for (const s of [1, -1]) {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(0, eave + rise / 2, midZ + (s * -run) / 2 + s * 0.02),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(s * angle, 0, 0)),
        new THREE.Vector3(1, 1, 1),
      );
      m.premultiply(st.matrix);
      addTextured(roofMat, new THREE.BoxGeometry(2.14, bias, slope), m);
    }
    st.add(cyl(0.055, 0.055, 2.16, bambooDark, [0, eave + rise + 0.03, midZ], { rot: [0, 0, Math.PI / 2], seg: 6 }));

    // đèn tuýp treo dưới xà trước, quầng sáng trên sàn và mặt nước (gộp thành một lần vẽ)
    {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(0, 2.3, roofFront + 0.02), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      m.premultiply(st.matrix);
      addTextured(tubeMat, new THREE.CylinderGeometry(0.035, 0.035, 1.25, 6).rotateZ(Math.PI / 2), m, { cast: false });
      st.add(box(1.32, 0.03, 0.08, mat('#dedad0'), [0, 2.345, roofFront + 0.02], { cast: false }));
    }

    // biển số trên nóc, sơn hai mặt
    // bờ dưới: mái nằm giữa người câu và máy quay, nên biển treo sau lưng chòi để không che người
    const signPos = h.inward[1] < 0 ? pos.clone().addScaledVector(inward, roofBack - 0.16).setY(DECK_Y + 1.5) : pos.clone().addScaledVector(inward, midZ).setY(DECK_Y + eave + rise + 0.68);
    const signW = 1.5;
    const signH = signW * 0.625;
    addTextured(signMat, signUv(new THREE.PlaneGeometry(signW, signH), n), new THREE.Matrix4().compose(signPos, signTurn, new THREE.Vector3(1, 1, 1)));
    addTextured(signMat, signUv(new THREE.PlaneGeometry(signW, signH), n).rotateY(Math.PI), new THREE.Matrix4().compose(signPos.clone().addScaledVector(signBack, 0.02), signTurn, new THREE.Vector3(1, 1, 1)));
    // chòi bờ trái thêm một biển trước xà để lúc quay cận (máy nhìn từ giữa ao) vẫn đọc được
    if (h.inward[0] !== 0) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(0, 2.72, roofFront + 0.03), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      m.premultiply(st.matrix);
      addTextured(signMat, signUv(new THREE.PlaneGeometry(0.72, 0.45), n), m);
    }
    if (h.inward[1] >= 0) st.add(cyl(0.035, 0.035, 0.55, bambooDark, [0, eave + rise + 0.25, midZ], { seg: 5 }));
    flatten(st, props);

    // phần động: cần dự phòng, ống cắm cần và xô cá (fisher.js và main.js dùng tới)
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = rotY;
    const holder = new THREE.Group();
    holder.position.set(0.5, 0, 0.42);
    holder.add(mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.5, 8), bambooDark, { pos: [0, 0.25, 0] }));
    const spare = new THREE.Group();
    spare.position.set(0, 0.45, 0);
    spare.rotation.x = 0.55;
    spare.add(mesh(new THREE.CylinderGeometry(0.02, 0.035, 2.4, 6), rodMat, { pos: [0, 1.2, 0] }));
    spare.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.35, 8), rodGold, { pos: [0, 0.3, 0] }));
    spare.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10), mat('#333'), { pos: [0.07, 0.4, 0], rot: [0, 0, Math.PI / 2] }));
    holder.add(spare);
    g.add(holder);
    const bucket = new THREE.Group();
    bucket.position.set(-0.68, 0, 0.3);
    bucket.scale.setScalar(0.82);
    const bucketColor = ['#3a8fd9', '#d9463a', '#35a35c'][i % 3];
    bucket.add(mesh(new THREE.CylinderGeometry(0.28, 0.21, 0.46, 12, 1, true), mat(bucketColor, { rough: 0.55, side: THREE.DoubleSide }), { pos: [0, 0.23, 0] }));
    bucket.add(mesh(new THREE.CircleGeometry(0.21, 12), mat(bucketColor), { pos: [0, 0.02, 0], rot: [-Math.PI / 2, 0, 0] }));
    bucket.add(mesh(new THREE.TorusGeometry(0.28, 0.018, 4, 16), mat('#e8e4d8'), { pos: [0, 0.46, 0], rot: [Math.PI / 2, 0, 0] }));
    bucket.add(mesh(new THREE.CircleGeometry(0.25, 12), mat('#7fb8a0'), { pos: [0, 0.36, 0], rot: [-Math.PI / 2, 0, 0], cast: false }));
    g.add(bucket);
    for (const part of [holder, spare, bucket]) bake(part);
    scene.add(g);

    const reach = range(3.05, 3.5);
    const bobber = pos.clone().addScaledVector(aim, reach);
    bobber.y = 0;
    seats.push({ index: i, number: n, group: g, pos, inward, side, rotY, bobber, reach, spare, bucket, seatY: pos.y + 0.47 });
  });

  // quầng đèn tuýp trên sàn chòi và sát mép nước
  {
    const pools = [];
    for (const s of seats) {
      const onDeck = new THREE.PlaneGeometry(4.2, 4.2).rotateX(-Math.PI / 2);
      onDeck.translate(s.pos.x + s.inward.x * 0.1, DECK_Y + 0.03, s.pos.z + s.inward.z * 0.1);
      pools.push(onDeck);
    }
    const m = new THREE.Mesh(mergeGeometries(pools), lampPool);
    pools.forEach((g) => g.dispose());
    m.renderOrder = 3;
    m.userData.keep = true;
    scene.add(m);
  }

  // lưới vợt trong suốt của cả 20 chòi: một lần vẽ
  {
    const nets = new THREE.Mesh(mergeGeometries(netGeos), netMat);
    netGeos.forEach((g) => g.dispose());
    nets.userData.keep = true;
    scene.add(nets);
  }

  // ---------------------------------------------------------------- Quạt nước
  {
    const white = mat('#f1eee6', { rough: 0.5 });
    const dark = mat('#3a3f42', { rough: 0.5, metal: 0.3 });
    const blade = mat('#2f6d9c', { rough: 0.5 });
    const floatMat = mat('#e8e6dc', { rough: 0.6 });
    const spray = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: '#f4fbff', transparent: true, opacity: 0.85, fog: false }), 96);
    spray.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    spray.frustumCulled = false;
    spray.renderOrder = 3;
    spray.userData.keep = true;
    scene.add(spray);
    const drops = Array.from({ length: 96 }, (_, i) => ({ fan: i % 2, side: i % 4 < 2 ? -1 : 1, phase: rnd(), speed: range(0.9, 1.4), dx: range(-0.28, 0.28), kick: range(0.5, 1.5), up: range(0.8, 1.6), size: range(0.025, 0.06) }));
    const dummy = new THREE.Object3D();
    const units = FANS.map((f, idx) => {
      const unit = new THREE.Group();
      unit.position.set(f.x, 0, f.z);
      // thân máy trắng trên phao, trục ngang ra hai bánh guồng như bản vẽ
      unit.add(mesh(new THREE.BoxGeometry(1.05, 0.5, 0.72), white, { pos: [0, 0.42, 0] }));
      unit.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.32, 10), dark, { pos: [0, 0.82, 0] }));
      unit.add(mesh(new THREE.BoxGeometry(0.75, 0.2, 0.92), floatMat, { pos: [0, 0.1, 0] }));
      unit.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.5, 8), dark, { pos: [0, 0.3, 0.02], rot: [0, 0, Math.PI / 2] }));
      for (const s of [-1, 1]) {
        unit.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.05, 10), floatMat, { pos: [s * 1.18, 0.07, -0.5], rot: [Math.PI / 2, 0, 0] }));
        unit.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.62), dark, { pos: [s * 0.82, 0.26, -0.28] }));
      }
      const wheels = [-1, 1].map((s) => {
        const w = new THREE.Group();
        w.position.set(s * 1.05, 0.3, 0.02);
        w.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), dark, { rot: [0, 0, Math.PI / 2] }));
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          w.add(mesh(new THREE.BoxGeometry(0.46, 0.34, 0.04), blade, { pos: [0, Math.cos(a) * 0.3, Math.sin(a) * 0.3], rot: [-a, 0, 0] }));
        }
        bake(w);
        w.userData.noBake = true;
        unit.add(w);
        return w;
      });
      // dây điện nổi về bờ
      const shoreZ = -POND_HZ;
      props.add(box(0.03, 0.03, Math.abs(shoreZ - f.z) - 0.2, mat('#16181a'), [f.x + (idx ? 0.36 : -0.36), 0.06, (shoreZ + f.z) / 2], { cast: false }));
      unit.userData.noBake = true;
      bake(unit);
      scene.add(unit);
      return { unit, wheels, phase: idx * 1.7 };
    });
    updaters.push((t) => {
      for (const u of units) {
        u.wheels.forEach((w, i) => (w.rotation.x = t * (i ? 9.5 : -9.5)));
        u.unit.position.y = Math.sin(t * 2.6 + u.phase) * 0.018;
        u.unit.rotation.z = Math.sin(t * 2.1 + u.phase) * 0.012;
      }
      drops.forEach((d, i) => {
        const age = (t * d.speed + d.phase) % 1;
        const f = FANS[d.fan];
        dummy.position.set(f.x + d.side * 1.05 + d.dx, 0.1 + 4 * age * (1 - age) * d.up, f.z + 0.3 + age * d.kick);
        dummy.scale.setScalar(d.size * (1 - age * 0.5));
        dummy.updateMatrix();
        spray.setMatrixAt(i, dummy.matrix);
      });
      spray.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------- Hàng dừa và mấy con chó nằm dưới gốc
  const crowns = [];
  for (const [px, py, tall] of [[176, 62, 7.2], [353, 48, 8.4], [529, 62, 7.5], [706, 48, 8.8], [882, 62, 7.4], [1059, 48, 8.2], [1382, 112, 7.8]]) {
    const [x, z] = P(px, py);
    const tree = palm(x, BANK_Y, z, tall);
    scene.add(tree);
    crowns.push({ crown: tree.userData.crown, phase: rnd() * 6 });
  }
  updaters.push((t) => {
    const lean = env.wind * 0.1;
    for (const c of crowns) {
      c.crown.rotation.z = -lean + Math.sin(t * 1.2 + c.phase) * (0.02 + Math.abs(env.wind) * 0.04);
      c.crown.rotation.x = Math.cos(t * 0.9 + c.phase) * (0.02 + Math.abs(env.wind) * 0.03);
    }
  });
  {
    const [x1, z1] = P(176, 62);
    const [x2, z2] = P(1382, 112);
    const pack = [
      makeDog({ pos: [x1 - 0.5, BANK_Y, z1 + 1.15], rot: 0.5, coat: '#c8964e', belly: '#ecd3a0' }),
      makeDog({ pos: [x1 - 1.9, BANK_Y, z1 + 2.2], rot: 2.2, coat: '#2f2a26', belly: '#c9b79a', scale: 0.92 }),
      makeDog({ pos: [x2 - 0.9, BANK_Y, z2 + 0.9], rot: -1.2, coat: '#e7dcc5', belly: '#f7f2e6', patch: '#8a5b34' }),
    ];
    for (const d of pack) {
      scene.add(d.group);
      updaters.push(d.update);
    }
  }

  // ---------------------------------------------------------------- Quán võng
  {
    const [, zFront] = P(0, 500);
    const [, zBack] = P(0, 265);
    const { x0, x1 } = RIGHT;
    const midX = (x0 + x1) / 2;
    const width = x1 - x0;
    const floorY = BANK_Y + 0.08;
    const brown = ['#84500f', '#7a4a10', '#8e5915'].map((c) => mat(c, { rough: 0.95 }));
    for (let z = zBack; z < zFront - 0.01; z += 0.46) props.add(box(width, 0.16, 0.44, pick(brown), [midX, floorY - 0.08, z + 0.22], { cast: false }));
    const pole = mat('#9a7a48', { rough: 0.8 });
    const postZs = [zBack + 0.1, zBack + 1.7, zFront - 0.1];
    const postH = 2.55;
    for (const x of [x0 + 0.08, x1 - 0.08]) {
      for (const z of postZs) props.add(cyl(0.07, 0.085, postH, pole, [x, floorY + postH / 2, z]));
      props.add(cyl(0.06, 0.06, zFront - zBack, pole, [x, floorY + postH, (zBack + zFront) / 2], { rot: [Math.PI / 2, 0, 0], seg: 6 }));
    }
    for (const z of postZs) props.add(cyl(0.05, 0.05, width, pole, [midX, floorY + postH, z], { rot: [0, 0, Math.PI / 2], seg: 6 }));
    // mái lá phía trong, che quầy nước
    const rise = 0.6;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(midX, floorY + postH + rise / 2 + 0.05, zBack + 0.9), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.36, 0, 0)), new THREE.Vector3(1, 1, 1));
    addTextured(thatchMat, new THREE.BoxGeometry(width + 0.5, 0.1, 2.1), m);
    // quầy nước: hũ trà đá, ly cà phê, thùng mì gói
    props.add(box(width - 0.5, 0.82, 0.48, mat('#6a4522', { rough: 0.9 }), [midX, floorY + 0.41, zBack + 0.72]));
    props.add(box(width - 0.42, 0.05, 0.56, mat('#efe6cf', { rough: 0.6 }), [midX, floorY + 0.84, zBack + 0.72]));
    props.add(cyl(0.2, 0.2, 0.42, mat('#d7572a', { rough: 0.4 }), [midX - 0.75, floorY + 1.08, zBack + 0.72], { seg: 12 }));
    props.add(cyl(0.21, 0.21, 0.05, mat('#f4f4ec'), [midX - 0.75, floorY + 1.31, zBack + 0.72], { seg: 12 }));
    for (let k = 0; k < 4; k++) {
      props.add(cyl(0.06, 0.045, 0.16, mat(k % 2 ? '#2c1810' : '#c98a3c', { rough: 0.25 }), [midX - 0.22 + k * 0.19, floorY + 0.95, zBack + 0.78], { seg: 8, cast: false }));
    }
    props.add(box(0.46, 0.34, 0.34, mat('#e9c13f', { rough: 0.8 }), [midX + 0.82, floorY + 1.04, zBack + 0.72]));
    props.add(box(0.48, 0.1, 0.36, mat('#d6332f', { rough: 0.8 }), [midX + 0.82, floorY + 1.05, zBack + 0.72]));

    // biển quán
    const menu = paintedBoard(640, 256, '#7a1f12', (g, w, h) => {
      g.strokeStyle = '#ffd84d';
      g.lineWidth = 10;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#ffe16a';
      g.font = '900 104px "Segoe UI", Arial, sans-serif';
      g.fillText('QUÁN VÕNG', w / 2, 88);
      g.fillStyle = '#ffffff';
      g.font = '800 50px "Segoe UI", Arial, sans-serif';
      g.fillText('Cà phê đá · Trà đá · Mì gói', w / 2, 188);
    });
    const signW = width * 0.98;
    const board = mesh(new THREE.PlaneGeometry(signW, signW * 0.4), new THREE.MeshStandardMaterial({ map: menu, roughness: 0.75, side: THREE.DoubleSide }), { pos: [midX, floorY + postH + 0.62, zBack + 2.2], rot: [-0.62, 0, 0] });
    board.userData.keep = true;
    scene.add(board);
    props.add(cyl(0.03, 0.03, 0.8, pole, [x0 + 0.5, floorY + postH + 0.3, zBack + 2.1], { seg: 5 }));
    props.add(cyl(0.03, 0.03, 0.8, pole, [x1 - 0.5, floorY + postH + 0.3, zBack + 2.1], { seg: 5 }));

    // dây bóng đèn vàng dọc xà, sáng lúc trời tối
    {
      const bulbs = [];
      for (const x of [x0 + 0.12, x1 - 0.12]) {
        for (let k = 0; k < 5; k++) bulbs.push(new THREE.IcosahedronGeometry(0.06, 0).translate(x, floorY + postH - 0.12 - Math.sin((k / 4) * Math.PI) * 0.1, zBack + 1.9 + (k * (zFront - zBack - 2)) / 4));
      }
      const m2 = new THREE.Mesh(mergeGeometries(bulbs), bulbMat);
      m2.userData.keep = true;
      scene.add(m2);
    }

    // ba cái võng mắc ngang, hai võng có người nằm đong đưa
    const span = width - 0.2;
    const hammockZs = [zFront - 2.46, zFront - 1.42, zFront - 0.42];
    const rows = [
      { z: hammockZs[0], colors: ['#d94b38', '#f1c232'], npc: { shirt: '#2d6da3', pants: '#3b3b3f', hat: true } },
      { z: hammockZs[1], colors: ['#2a8f74', '#e8e2c8'], npc: { shirt: '#e8e4d8', pants: '#5a4b3a', hat: false } },
      { z: hammockZs[2], colors: ['#3a64b0', '#e8913b'], npc: null },
    ];
    const swings = rows.map((row, idx) => {
      const pivot = new THREE.Group();
      pivot.position.set(midX, floorY + 1.95, row.z);
      pivot.add(hammock(span, 1.02, row.colors));
      if (row.npc) pivot.add(restingPerson(row.npc));
      bake(pivot);
      pivot.userData.noBake = true;
      scene.add(pivot);
      // cọc mắc võng ở đúng hàng này
      for (const x of [x0 + 0.08, x1 - 0.08]) props.add(cyl(0.05, 0.06, 2.1, pole, [x, floorY + 1.05, row.z], { seg: 6 }));
      return { pivot, phase: idx * 1.9, speed: 0.85 + idx * 0.12 };
    });
    // bàn nhựa thấp với ly cà phê đá
    for (const [dx, zk] of [[-0.95, 0.5], [0.95, 1.46]]) {
      const tz = zFront - zk - 0.46;
      props.add(cyl(0.34, 0.26, 0.05, mat('#3a7fbd', { rough: 0.5 }), [midX + dx, floorY + 0.42, tz], { seg: 10 }));
      props.add(cyl(0.05, 0.14, 0.4, mat('#2f6da0', { rough: 0.5 }), [midX + dx, floorY + 0.2, tz], { seg: 8 }));
      props.add(cyl(0.055, 0.042, 0.16, mat('#2c1810', { rough: 0.25 }), [midX + dx - 0.08, floorY + 0.53, tz], { seg: 8, cast: false }));
      props.add(cyl(0.055, 0.042, 0.16, mat('#c98a3c', { rough: 0.25 }), [midX + dx + 0.1, floorY + 0.53, tz + 0.05], { seg: 8, cast: false }));
    }
    updaters.push((t) => {
      for (const s of swings) s.pivot.rotation.x = Math.sin(t * s.speed + s.phase) * (0.08 + Math.min(0.1, Math.abs(env.wind) * 0.08));
    });
  }

  // ---------------------------------------------------------------- Bàn cân, bảng trắng, loa
  const scale = (() => {
    const [, zBack] = P(0, 545);
    const [, zFront] = P(0, 677);
    const { x0, x1 } = RIGHT;
    const midX = (x0 + x1) / 2;
    const midZ = (zBack + zFront) / 2 + 0.25;
    const y = BANK_Y;
    const top = mat('#f2efe8', { rough: 0.7 });
    const leg = mat('#6e7276', { rough: 0.5, metal: 0.3 });
    const w = x1 - x0 - 0.2;
    const d = zFront - zBack - 1;
    props.add(box(w, 0.08, d, top, [midX, y + 0.86, midZ]));
    props.add(box(w - 0.1, 0.5, 0.03, top, [midX, y + 0.56, midZ + d / 2 - 0.02]));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) props.add(box(0.07, 0.86, 0.07, leg, [midX + (sx * (w - 0.2)) / 2, y + 0.43, midZ + (sz * (d - 0.14)) / 2]));
    // cân điện tử: đế xám, mặt đặt cá, màn số đỏ
    props.add(box(0.95, 0.09, 0.72, mat('#878880', { rough: 0.45, metal: 0.35 }), [midX - 0.35, y + 0.95, midZ]));
    props.add(box(0.8, 0.03, 0.6, mat('#c4c6c2', { rough: 0.3, metal: 0.65 }), [midX - 0.35, y + 1.01, midZ]));
    props.add(box(0.58, 0.28, 0.08, mat('#3a3d40', { rough: 0.5 }), [midX - 0.35, y + 1.1, midZ + 0.4], { rot: [-0.3, 0, 0] }));
    // cân đồng hồ bên cạnh
    props.add(box(0.5, 0.05, 0.5, mat('#c92f2f', { rough: 0.5 }), [midX + 0.72, y + 1.2, midZ - 0.05]));
    props.add(cyl(0.04, 0.05, 0.28, mat('#b92b2b'), [midX + 0.72, y + 1.05, midZ - 0.05], { seg: 8 }));
    props.add(cyl(0.22, 0.25, 0.08, mat('#d13c3c'), [midX + 0.72, y + 0.94, midZ - 0.05], { seg: 12 }));
    props.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 18), mat('#f2f2ec'), { pos: [midX + 0.72, y + 1.1, midZ + 0.18], rot: [Math.PI / 2 - 0.2, 0, 0] }));
    props.add(mesh(new THREE.TorusGeometry(0.27, 0.025, 5, 18), mat('#c92f2f'), { pos: [midX + 0.72, y + 1.12, midZ + 0.235], rot: [-0.2, 0, 0] }));
    props.add(box(0.025, 0.2, 0.012, mat('#c92f2f'), [midX + 0.76, y + 1.16, midZ + 0.245], { rot: [-0.2, 0, -0.5], cast: false }));
    props.add(box(0.2, 0.16, 0.012, mat('#26262a'), [midX + 0.72, y + 1.02, midZ + 0.26], { rot: [-0.2, 0, 0], cast: false }));

    const ledTex = canvasTexture(256, 96, () => {});
    const ledCanvas = ledTex.image;
    const led = ledCanvas.getContext('2d');
    const showLed = (text) => {
      led.fillStyle = '#180404';
      led.fillRect(0, 0, 256, 96);
      led.fillStyle = '#ff3c32';
      led.font = '900 74px Consolas, "Courier New", monospace';
      led.textAlign = 'center';
      led.textBaseline = 'middle';
      led.fillText(text, 128, 52);
      ledTex.needsUpdate = true;
    };
    showLed('0.0');
    const display = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), new THREE.MeshStandardMaterial({ map: ledTex, emissive: '#ffffff', emissiveMap: ledTex, emissiveIntensity: 0.9, roughness: 0.3 }));
    display.position.set(midX - 0.35, y + 1.11, midZ + 0.445);
    display.rotation.x = -0.3;
    display.userData.keep = true;
    scene.add(display);

    // bảng trắng ghi tên và số ký từng chòi
    const boardW = x1 - x0 + 0.2;
    const boardH = boardW * 0.5;
    const boardY = y + 0.72 + boardH / 2;
    const boardZ = zBack + 0.2;
    const frame = mat('#9aa0a4', { rough: 0.4, metal: 0.5 });
    props.add(box(boardW + 0.12, boardH + 0.12, 0.05, frame, [midX, boardY, boardZ - 0.03], { rot: [-0.5, 0, 0] }));
    for (const s of [-1, 1]) props.add(box(0.07, boardY - y + 0.4, 0.07, frame, [midX + (s * boardW) / 2.2, y + (boardY - y + 0.4) / 2, boardZ - 0.16]));
    const wbTex = canvasTexture(720, 360, () => {}, { anisotropy: 8 });
    const wb = wbTex.image.getContext('2d');
    const entries = new Map(); // ghế -> { name, kg }
    const paintBoard = () => {
      wb.fillStyle = '#fbfbf7';
      wb.fillRect(0, 0, 720, 360);
      wb.fillStyle = '#1b4fa8';
      wb.font = '900 62px "Segoe UI", Arial, sans-serif';
      wb.textAlign = 'center';
      wb.textBaseline = 'middle';
      wb.fillText('BẢNG CÂN', 360, 46);
      wb.strokeStyle = '#1b4fa8';
      wb.lineWidth = 5;
      wb.beginPath();
      wb.moveTo(20, 88);
      wb.lineTo(700, 88);
      wb.stroke();
      const rows = [...entries].sort((a, b) => b[1].kg - a[1].kg).slice(0, 4);
      rows.forEach(([seat, e], i) => {
        const yy = 128 + i * 70;
        wb.textAlign = 'left';
        wb.fillStyle = '#c0262d';
        wb.font = '900 56px "Segoe UI", Arial, sans-serif';
        wb.fillText(`C${seat + 1}`, 18, yy);
        wb.fillStyle = '#20242a';
        wb.font = '800 48px "Segoe UI", Arial, sans-serif';
        let name = e.name;
        while (wb.measureText(name).width > 360 && name.length > 2) name = name.slice(0, -1);
        wb.fillText(name, 118, yy);
        wb.textAlign = 'right';
        wb.fillStyle = '#1b4fa8';
        wb.font = '900 54px "Segoe UI", Arial, sans-serif';
        wb.fillText(e.kg.toLocaleString('vi-VN', { maximumFractionDigits: 1 }), 702, yy);
      });
      if (!rows.length) {
        wb.fillStyle = '#9aa0a8';
        wb.font = '700 44px "Segoe UI", Arial, sans-serif';
        wb.textAlign = 'center';
        wb.fillText('Chưa có chòi nào lên cá', 360, 216);
      }
      wbTex.needsUpdate = true;
    };
    paintBoard();
    const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(boardW, boardH), new THREE.MeshStandardMaterial({ map: wbTex, roughness: 0.5, emissive: '#ffffff', emissiveMap: wbTex, emissiveIntensity: 0.32 }));
    boardMesh.position.set(midX, boardY, boardZ);
    boardMesh.rotation.x = -0.5;
    boardMesh.castShadow = true;
    boardMesh.userData.keep = true;
    scene.add(boardMesh);

    // cột loa phóng thanh
    const poleX = x1 - 0.1;
    const poleZ = zFront - 0.1;
    props.add(cyl(0.05, 0.07, 3.9, mat('#70757a', { rough: 0.5, metal: 0.4 }), [poleX, y + 1.95, poleZ]));
    const hornMat = mat('#dfe2dc', { rough: 0.5, metal: 0.25 });
    const horns = [
      { rot: [Math.PI / 2 + 0.25, 0, 0], dir: [0, 0, 1] },
      { rot: [Math.PI / 2 + 0.25, 0, Math.PI / 2], dir: [-1, 0, 0] },
    ];
    for (const h of horns) {
      const g = new THREE.Group();
      g.position.set(poleX, y + 3.72, poleZ);
      g.rotation.y = Math.atan2(h.dir[0], h.dir[2]);
      g.add(mesh(new THREE.CylinderGeometry(0.33, 0.07, 0.62, 12, 1, true), mat('#dfe2dc', { rough: 0.5, metal: 0.25, side: THREE.DoubleSide }), { pos: [0, 0.06, 0.34], rot: [Math.PI / 2 + 0.22, 0, 0] }));
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 10), hornMat, { pos: [0, -0.02, 0.04], rot: [Math.PI / 2, 0, 0] }));
      flatten(g, props);
    }

    // vòng sóng toả ra từ loa khi thông báo
    const pulseMat = new THREE.MeshBasicMaterial({ color: '#fff3bf', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    const rings = [0, 1, 2].map(() => {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 28, 1, 0, Math.PI), pulseMat.clone());
      r.position.set(poleX - 0.12, y + 3.82, poleZ + 0.5);
      r.rotation.x = -0.55;
      r.renderOrder = 4;
      r.visible = false;
      r.userData.keep = true;
      scene.add(r);
      return r;
    });
    let pulseUntil = -1;
    let elapsed = 0;
    updaters.push((t, dt) => {
      elapsed += dt;
      const on = elapsed < pulseUntil;
      rings.forEach((r, i) => {
        const u = (elapsed * 0.9 + i / 3) % 1;
        r.visible = on;
        if (!on) return;
        r.scale.setScalar(0.25 + u * 1.15);
        r.material.opacity = (1 - u) * 0.85;
      });
    });
    return {
      weigh(seat, name, kg) {
        const prev = entries.get(seat);
        entries.set(seat, { name, kg: Math.round(((prev?.name === name ? prev.kg : 0) + kg) * 10) / 10 });
        showLed(kg.toFixed(1));
        paintBoard();
        pulseUntil = elapsed + 3.2;
      },
      clear(seat) {
        if (entries.delete(seat)) paintBoard();
      },
    };
  })();

  // ---------------------------------------------------------------- Bãi xe máy
  {
    const paint = ['#c7302b', '#222a33', '#2a62b0', '#e5e0d2', '#2f7d53', '#e0a02a'];
    const [, row1] = P(0, 873);
    const [, row2] = P(0, 962);
    const [, row3] = P(0, 1050);
    const cols = [RIGHT.x0 + 0.5, RIGHT.x0 + 1.25, RIGHT.x0 + 2];
    const spots = [[cols[0], row1], [cols[1], row1], [cols[2], row1], [cols[0], row2], [cols[1], row2], [cols[0], row3]];
    spots.forEach(([x, z], i) => {
      const bike = motorbike(paint[i % paint.length]);
      bike.position.set(x, BANK_Y + 0.02, z);
      bike.rotation.y = Math.PI + range(-0.07, 0.07);
      bike.scale.setScalar(0.8);
      flatten(bike, props);
    });
  }

  // ---------------------------------------------------------------- Cảnh xa: rặng cây, xóm nhà, núi thấp
  {
    const greens = ['#3f7a3a', '#4d8a3e', '#356b34', '#5a9446', '#2f6130'].map((c) => mat(c, { flat: true, rough: 1 }));
    const blob = (x, z, r, tall = 1) => farProps.add(mesh(new THREE.IcosahedronGeometry(r, 1), pick(greens), { pos: [x, 0.25 + r * 0.55 * tall, z], scale: [1, tall * range(0.85, 1.15), range(0.85, 1.15)], cast: false }));
    // mép ruộng phía xa phải có cây che kín (đường chân trời giả cho máy nhìn dốc từ trên cao)
    for (let x = -60; x <= 60; x += 2.1) {
      blob(x + range(-0.7, 0.7), -36 + range(-1.2, 1.2), range(1.7, 2.9), 1.1);
      if (rnd() < 0.55) blob(x + range(-1, 1), -39 + range(-1, 1), range(2.1, 3.3), 1.25);
    }
    // ba phía còn lại chỉ thấy lúc quay cận
    for (let z = -30; z <= 46; z += 3) {
      blob(-44 + range(-2, 2), z, range(1.9, 3.2), 1.2);
      blob(44 + range(-2, 2), z, range(1.9, 3.2), 1.2);
    }
    for (let x = -42; x <= 42; x += 3) blob(x, 44 + range(-2, 2), range(1.9, 3.2), 1.2);
    // lùm cây và mái nhà đỏ trên đồng
    const house = (x, z, s, roof) => {
      farProps.add(box(2.6 * s, 1.6 * s, 2 * s, mat(pick(['#e6dcc4', '#d6c9a8', '#efe5d2']), { rough: 1 }), [x, 0.25 + 0.8 * s, z], { cast: false }));
      farProps.add(mesh(new THREE.ConeGeometry(2.2 * s, 1.15 * s, 4), mat(roof, { flat: true, rough: 1 }), { pos: [x, 0.25 + 2.15 * s, z], rot: [0, Math.PI / 4, 0], scale: [1.08, 1, 0.82], cast: false }));
    };
    for (const [x, z, s, roof] of [[-23, -29, 1.15, '#b24a32'], [-16, -31, 0.95, '#c15a3a'], [17, -29, 1.15, '#a8452f'], [26, -31, 1, '#b95236'], [-34, -27, 1.1, '#b24a32'], [36, -28, 1, '#c15a3a']]) {
      house(x, z, s, roof);
      blob(x + 3.4, z - 0.6, 1.5, 1.3);
    }
    for (const [x, z, r] of [[-26, -19, 2], [-20, -20, 1.5], [24, -20, 2], [31, -18, 1.7], [-30, -5, 2.1], [32, 3, 2.1], [-24, 18, 2], [26, 22, 2]]) blob(x, z, r, 1.25);
    // dãy núi thấp sau rặng cây
    const hillMat = mat('#7f9d94', { flat: true, rough: 1 });
    for (let x = -72; x <= 72; x += 9) farProps.add(mesh(new THREE.IcosahedronGeometry(1, 1), hillMat, { pos: [x + range(-2, 2), 0, -47 + range(-1, 1)], scale: [range(7, 11), range(3, 6.5), 5], cast: false }));
    bake(farProps);
    scene.add(farProps);
  }

  // ---------------------------------------------------------------- Gộp khối có texture và khối tĩnh
  for (const [material, { geos, cast }] of texBatches) {
    const merged = new THREE.Mesh(mergeGeometries(geos), material);
    geos.forEach((g) => g.dispose());
    merged.castShadow = cast;
    merged.receiveShadow = true;
    merged.userData.keep = true;
    scene.add(merged);
  }
  bake(props);
  scene.add(props);

  // ---------------------------------------------------------------- Ánh sáng
  const hemi = new THREE.HemisphereLight('#ffe6c8', '#b08060', 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffc98a', 2.2);
  sun.position.set(24, 22, 14);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  // đèn phụ đi theo máy quay (main.js điều khiển): giữ mặt người câu không bị tối, mạnh lên khi quay cận
  const fill = new THREE.DirectionalLight('#fff0dc', 0.3);
  scene.add(fill, fill.target);
  // đèn tuýp dọc bờ: vài đèn thật toả rộng (phần còn lại là quầng giả cho nhẹ), thêm đèn vàng của quán
  const lampLights = [
    { at: [-5.6, 3.2, -8.8], color: '#d8fff0', power: 26 },
    { at: [3.4, 3.2, -8.8], color: '#d8fff0', power: 26 },
    { at: [-5.6, 3.2, 9.1], color: '#d8fff0', power: 26 },
    { at: [3.4, 3.2, 9.1], color: '#d8fff0', power: 26 },
    { at: [-11.2, 3.2, -0.6], color: '#d8fff0', power: 24 },
    { at: [(RIGHT.x0 + RIGHT.x1) / 2, 2.9, -4.8], color: '#ffc27a', power: 18 },
    { at: [(RIGHT.x0 + RIGHT.x1) / 2, 3, 0.6], color: '#fff0d8', power: 16 },
  ].map(({ at, color, power }) => {
    const l = new THREE.PointLight(color, 0, 18, 1.4);
    l.position.set(...at);
    l.userData.power = power;
    scene.add(l);
    return l;
  });

  return {
    seats,
    env,
    weigh: scale.weigh,
    clearWeigh: scale.clear,
    sky: {
      uniforms,
      hemi,
      sun,
      fill,
      focus: 0, // 0: toàn cảnh, 1: đang quay cận
      lampLights,
      tubes: tubeMat,
      bulbs: bulbMat,
      pools: lampPool,
    },
    update(t, dt) {
      uniforms.uTime.value = t;
      for (const fn of updaters) fn(t, dt);
    },
  };
}

// ---------------------------------------------------------------- Đồ vật dùng chung

// Cây dừa: thân cong ghép từ nhiều khúc, tàu lá dài rủ xuống.
function palm(x, y, z, h) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const trunkMat = mat('#ab9270');
  const ring = mat('#86704f');
  const leafMats = ['#4c8f3a', '#3e7f35', '#5d9c42'].map((c) => mat(c, { side: THREE.DoubleSide, flat: true }));
  const lean = range(-0.3, 0.3);
  const leanZ = range(-0.06, 0.12);
  const segs = 8;
  let topX = 0;
  let topZ = 0;
  let py = 0;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const seg = mesh(new THREE.CylinderGeometry(0.27 - (t + 1 / segs) * 0.13, 0.27 - t * 0.13, h / segs + 0.06, 9), trunkMat);
    topX = Math.sin(t * 1.3) * lean * h * 0.55;
    topZ = Math.sin(t * 1.3) * leanZ * h * 0.55;
    seg.position.set(topX, py + h / segs / 2, topZ);
    seg.rotation.z = -lean * 0.6 * Math.cos(t * 1.3);
    g.add(seg);
    if (i % 2 === 0) g.add(mesh(new THREE.CylinderGeometry(0.28 - t * 0.13, 0.28 - t * 0.13, 0.04, 9), ring, { pos: [topX, py + 0.05, topZ], cast: false }));
    py += h / segs;
  }
  bake(g);
  const crown = new THREE.Group();
  crown.position.set(topX, py, topZ);
  for (let k = 0; k < 11; k++) {
    const holder = new THREE.Group();
    holder.rotation.y = (k / 11) * Math.PI * 2 + range(-0.2, 0.2);
    holder.add(mesh(frond(range(2.5, 3.3), range(0.55, 0.85), range(0.1, 0.4)), pick(leafMats), {}));
    flatten(holder, crown);
  }
  for (let k = 0; k < 4; k++) crown.add(mesh(new THREE.SphereGeometry(0.17, 7, 5), mat('#5f7a35'), { pos: [Math.cos(k * 1.7) * 0.22, -0.2, Math.sin(k * 1.7) * 0.22] }));
  bake(crown);
  crown.userData.noBake = true;
  g.add(crown);
  g.userData.crown = crown;
  return g;
}

// Tàu dừa: dải cong rủ xuống, rộng ở giữa, có răng cưa hai bên để nhìn từ xa ra dáng lá dừa.
function frond(len, width, liftAngle) {
  const n = 12;
  const pos = [];
  const index = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const z = u * len;
    const y = liftAngle * z - 0.62 * z * z / len - 0.05;
    const w = width * Math.sin(Math.min(1, u * 1.15) * Math.PI * 0.92 + 0.08) * (i % 2 ? 1 : 0.55);
    pos.push(-w, y - w * 0.3, z, 0, y, z, w, y - w * 0.3, z);
    if (i < n) {
      const a = i * 3;
      index.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// Chó ta nằm phơi bụng: thở phập phồng, thỉnh thoảng vẫy đuôi và vểnh đầu.
function makeDog({ pos, rot, coat, belly, patch, scale = 1 }) {
  const group = new THREE.Group();
  group.position.set(...pos);
  group.rotation.y = rot;
  group.scale.setScalar(scale * 1.25);
  const fur = mat(coat, { rough: 0.95 });
  const under = mat(belly, { rough: 0.95 });
  const dark = mat('#1c1613', { rough: 0.4 });
  const body = new THREE.Group();
  body.position.y = 0.2;
  body.add(mesh(new THREE.SphereGeometry(0.28, 10, 8), fur, { scale: [0.9, 0.72, 1.6] }));
  body.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), under, { pos: [0, -0.1, 0.12], scale: [0.9, 0.5, 1.5], cast: false }));
  if (patch) body.add(mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(patch, { rough: 0.95 }), { pos: [0.1, 0.13, -0.12], scale: [1, 0.5, 1.3], cast: false }));
  for (const x of [-0.17, 0.17]) {
    body.add(mesh(new THREE.SphereGeometry(0.09, 6, 5), fur, { pos: [x, -0.14, 0.42], scale: [0.8, 0.5, 2] }));
    body.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), fur, { pos: [x, -0.13, -0.3], scale: [0.9, 0.6, 1.5] }));
  }
  bake(body);
  group.add(body);
  const head = new THREE.Group();
  head.position.set(0, 0.25, 0.46);
  head.add(mesh(new THREE.SphereGeometry(0.17, 10, 8), fur, { scale: [1, 0.9, 1.1] }));
  head.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), under, { pos: [0, -0.04, 0.16], scale: [0.85, 0.7, 1.15], cast: false }));
  head.add(mesh(new THREE.SphereGeometry(0.03, 6, 5), dark, { pos: [0, 0, 0.26], cast: false }));
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.ConeGeometry(0.06, 0.15, 4), fur, { pos: [s * 0.1, 0.16, -0.03], rot: [-0.3, 0, -s * 0.3] }));
    head.add(mesh(new THREE.SphereGeometry(0.02, 5, 4), dark, { pos: [s * 0.07, 0.04, 0.13], cast: false }));
  }
  bake(head);
  group.add(head);
  const tail = new THREE.Group();
  tail.position.set(0, 0.26, -0.42);
  tail.add(mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.32, 5), fur, { pos: [0, 0.03, -0.14], rot: [1.05, 0, 0] }));
  group.add(tail);
  const phase = rnd() * 20;
  return {
    group,
    update(t) {
      const breath = 1 + Math.sin(t * 2 + phase) * 0.028;
      body.scale.set(breath, breath, 1);
      const wag = (t + phase) % 11 < 2.5;
      tail.rotation.y = wag ? Math.sin(t * 14) * 0.55 : Math.sin(t * 0.8 + phase) * 0.08;
      const up = (t + phase) % 17 < 3.5;
      head.rotation.x += ((up ? -0.2 : 0.3) - head.rotation.x) * 0.04;
      head.rotation.y = up ? Math.sin(t * 0.8) * 0.45 : 0;
    },
  };
}

// Võng lưới: gốc toạ độ là giữa đường dây mắc, võng võng xuống theo trục y âm.
function hammock(span, sag, [colorA, colorB]) {
  const n = 18;
  const m = 3;
  const pos = [];
  const col = [];
  const index = [];
  const a = new THREE.Color(colorA);
  const b = new THREE.Color(colorB);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = (u - 0.5) * span;
    const y = -sag * (1 - (2 * u - 1) ** 2);
    const w = 0.42 * Math.sin(u * Math.PI) ** 0.65;
    for (let j = 0; j <= m; j++) {
      const v = j / m - 0.5;
      pos.push(x, y + (v * v - 0.25) * 0.55 * Math.sin(u * Math.PI), v * 2 * w);
      const c = i % 4 < 2 ? a : b;
      col.push(c.r, c.g, c.b);
    }
    if (i < n) {
      for (let j = 0; j < m; j++) {
        const p = i * (m + 1) + j;
        index.push(p, p + 1, p + m + 2, p, p + m + 2, p + m + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const m2 = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
  m2.castShadow = true;
  m2.userData.keep = true;
  return m2;
}

// Người nằm võng: đầu kê về một phía, nón lá úp lên mặt nếu có.
function restingPerson({ shirt, pants, hat }) {
  const skin = mat('#d9a679', { rough: 0.8 });
  const g = new THREE.Group();
  g.position.set(0, -0.72, 0);
  g.add(mesh(new THREE.CapsuleGeometry(0.2, 0.46, 4, 8), mat(shirt, { rough: 0.9 }), { pos: [-0.2, -0.06, 0], rot: [0, 0, Math.PI / 2 - 0.2] }));
  g.add(mesh(new THREE.CapsuleGeometry(0.11, 0.36, 3, 6), mat(pants, { rough: 0.9 }), { pos: [0.42, -0.08, 0.1], rot: [0, 0, Math.PI / 2 + 0.28] }));
  g.add(mesh(new THREE.CapsuleGeometry(0.11, 0.36, 3, 6), mat(pants, { rough: 0.9 }), { pos: [0.42, -0.08, -0.1], rot: [0, 0, Math.PI / 2 + 0.28] }));
  g.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), skin, { pos: [0.76, 0.05, 0.1] }));
  g.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), skin, { pos: [0.76, 0.05, -0.1] }));
  g.add(mesh(new THREE.SphereGeometry(0.23, 10, 8), skin, { pos: [-0.74, 0.14, 0] }));
  g.add(mesh(new THREE.SphereGeometry(0.24, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat('#2a221c', { rough: 0.95 }), { pos: [-0.8, 0.15, 0], rot: [0, 0, 0.9] }));
  g.add(mesh(new THREE.CapsuleGeometry(0.07, 0.34, 3, 6), skin, { pos: [-0.26, 0.15, 0.2], rot: [0, 0.2, Math.PI / 2] }));
  if (hat) g.add(mesh(new THREE.ConeGeometry(0.46, 0.26, 16), mat('#e6c978', { rough: 0.9, flat: true }), { pos: [-0.72, 0.38, 0], rot: [0.18, 0, 0.12] }));
  const out = new THREE.Group();
  flatten(g, out);
  bake(out);
  return out;
}

// Xe máy kiểu phổ thông, không hãng nào cụ thể.
function motorbike(color) {
  const g = new THREE.Group();
  const paint = mat(color, { rough: 0.35, metal: 0.25 });
  const black = mat('#1d1f21', { rough: 0.7 });
  const chrome = mat('#b9bcc0', { rough: 0.3, metal: 0.8 });
  const wheel = (z) => {
    g.add(mesh(new THREE.TorusGeometry(0.235, 0.065, 6, 14), black, { pos: [0, 0.3, z], rot: [0, Math.PI / 2, 0] }));
    g.add(cyl(0.09, 0.09, 0.07, chrome, [0, 0.3, z], { rot: [0, 0, Math.PI / 2], seg: 8 }));
  };
  wheel(0.68);
  wheel(-0.68);
  g.add(box(0.25, 0.26, 0.92, black, [0, 0.46, -0.1]));
  g.add(box(0.3, 0.36, 0.6, paint, [0, 0.72, -0.42]));
  g.add(box(0.3, 0.1, 0.92, mat('#252628', { rough: 0.85 }), [0, 0.94, -0.34]));
  g.add(box(0.2, 0.05, 0.42, black, [0, 0.5, 0.25], { cast: false }));
  // yếm trước
  g.add(box(0.34, 0.66, 0.12, paint, [0, 0.8, 0.46], { rot: [0.25, 0, 0] }));
  g.add(box(0.1, 0.5, 0.1, chrome, [0.1, 0.42, 0.6], { rot: [0.3, 0, 0] }));
  g.add(box(0.1, 0.5, 0.1, chrome, [-0.1, 0.42, 0.6], { rot: [0.3, 0, 0] }));
  g.add(box(0.26, 0.05, 0.24, paint, [0, 0.52, 0.68]));
  g.add(cyl(0.025, 0.025, 0.74, black, [0, 1.17, 0.42], { rot: [0, 0, Math.PI / 2], seg: 6 }));
  g.add(box(0.26, 0.15, 0.2, paint, [0, 1.13, 0.43]));
  g.add(cyl(0.075, 0.075, 0.05, mat('#fff7cf', { rough: 0.2 }), [0, 1.11, 0.55], { rot: [Math.PI / 2, 0, 0], seg: 10, cast: false }));
  g.add(box(0.14, 0.09, 0.05, mat('#c8332e'), [0, 0.92, -0.82], { cast: false }));
  g.add(cyl(0.04, 0.05, 0.62, chrome, [0.18, 0.37, -0.48], { rot: [Math.PI / 2 - 0.1, 0, 0], seg: 6 }));
  return g;
}

let haloTex = null;
export function haloTexture() {
  haloTex ??= canvasTexture(128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  return haloTex;
}
