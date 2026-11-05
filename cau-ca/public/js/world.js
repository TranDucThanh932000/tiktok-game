// Hồ câu trong hang đá (theo bản vẽ cave_fishing_pond_layout.png): hồ hình dạng tự do uốn theo vách, vùng nước nông,
// vùng nước sâu, đảo pha lê, thác ngầm, bờ đá nhiều độ cao, nhũ đá, măng đá, nấm phát sáng. Ánh sáng chủ yếu từ dưới nước hắt lên.
// Mọi thứ dựng bằng hình khối low-poly + texture vẽ bằng canvas, không có file ngoài.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Gộp các khối con trực tiếp (không texture, không có con, không đánh dấu keep) của một Group thành MỘT mesh,
// màu giữ bằng vertex color. 50 người câu × vài chục khối mỗi người sẽ còn vài chục lần vẽ thay vì hàng nghìn.
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

function mesh(geo, material, { pos, rot, scale, cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) (typeof scale === 'number' ? m.scale.setScalar(scale) : m.scale.set(...scale));
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// ---------------------------------------------------------------- Texture vẽ tay

function canvasTexture(w, h, draw, { repeat, srgb = true } = {}) {
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
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------- Bản vẽ → toạ độ cảnh
// Toạ độ pixel lấy từ cave_fishing_pond_layout.png (giữa hồ là px 741, 677; 1 px = 0,0192 đơn vị), ảnh nhìn từ trên xuống, phía trên ảnh là cuối hang.

const K = 0.0192;
const P = (px, py) => [(px - 741) * K, (py - 677) * K];

const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Viền hồ theo bản vẽ, đi một vòng theo chiều kim đồng hồ.
const OUTLINE = [
  [710, 263], [850, 278], [950, 315], [1040, 362], [1130, 420], [1190, 490], [1225, 575], [1235, 660], [1215, 780], [1150, 885], [1060, 980], [930, 1060],
  [770, 1090], [640, 1075], [470, 1030], [340, 945], [270, 830], [247, 660], [265, 540], [325, 440], [385, 360], [500, 295], [600, 270],
].map(([x, y]) => P(x, y));

// Bảng bán kính hồ theo góc (hồ hình sao quanh gốc toạ độ, nên mỗi góc chỉ có một điểm trên viền).
const R_STEPS = 360;
const radii = (() => {
  const curve = new THREE.CatmullRomCurve3(OUTLINE.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'catmullrom', 0.5);
  const pts = curve.getPoints(360).map((p) => ({ a: Math.atan2(p.z, p.x), r: Math.hypot(p.x, p.z) }));
  const table = new Float32Array(R_STEPS);
  for (let i = 0; i < R_STEPS; i++) {
    const a = (i / R_STEPS) * Math.PI * 2 - Math.PI;
    let best = pts[0];
    let bestD = Infinity;
    for (const p of pts) {
      const d = Math.abs(Math.atan2(Math.sin(p.a - a), Math.cos(p.a - a)));
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    // thêm vài vịnh nhỏ để bờ uốn lượn, không tròn trịa
    table[i] = best.r * (1 + 0.03 * Math.sin(5 * a + 0.7) + 0.02 * Math.sin(8 * a + 2.1) + 0.012 * Math.sin(13 * a + 4));
  }
  return table;
})();

export function pondRadius(a) {
  const u = ((((a + Math.PI) / (Math.PI * 2)) % 1) + 1) % 1;
  const f = u * R_STEPS;
  const i = Math.floor(f) % R_STEPS;
  return lerp(radii[i], radii[(i + 1) % R_STEPS], f - Math.floor(f));
}
const pondDepthIn = (x, z) => pondRadius(Math.atan2(z, x)) - Math.hypot(x, z); // >0: nằm trong hồ, cách bờ bao nhiêu

const zone = (px, py, prx, pry) => {
  const [x, z] = P(px, py);
  return { x, z, rx: prx * K, rz: pry * K };
};
const SHALLOW = zone(441, 794, 147, 132);
const DEEP = zone(912, 765, 206, 147);
const ISLAND = { x: P(588, 500)[0], z: P(588, 500)[1], r: 1.35 };

// swim: đường lượn của cá mập trong sự kiện, tránh đảo pha lê.
export const POND = { shallow: SHALLOW, deep: DEEP, island: ISLAND, swim: { x: 1, z: 1, rx: 5, rz: 3.6 } };

// Các hàng ghế: bờ càng xa càng cao, mỗi bờ có hai bậc. cap: số ghế khi đủ 50 chỗ.
const LOW_Y = 0.45;
const MID_LEFT_Y = 1.35;
const MID_RIGHT_Y = 1.6;
const HIGH_Y = 3.6;
const ROWS = [
  { from: [-6.3, 9.0], to: [6.3, 9.0], y: LOW_Y, cap: 9, stone: '#6d6b64', margin: 0.9 }, // bờ thấp
  { from: [-5.6, 10.55], to: [5.6, 10.55], y: LOW_Y + 0.65, cap: 8, stone: '#6d6b64', margin: 1.5 },
  { from: [-10.15, -2.9], to: [-10.15, 5.0], y: MID_LEFT_Y, cap: 6, stone: '#918f86', margin: 0.9 }, // bờ đá trái
  { from: [-11.4, -2.4], to: [-11.4, 4.5], y: MID_LEFT_Y + 0.7, cap: 5, stone: '#918f86', margin: 1.5 },
  { from: [10.6, -3.9], to: [10.6, 3.9], y: MID_RIGHT_Y, cap: 6, stone: '#918f86', margin: 0.9 }, // bờ đá giữa
  { from: [12, -3.4], to: [12, 3.4], y: MID_RIGHT_Y + 0.7, cap: 5, stone: '#918f86', margin: 1.5 },
  { from: [5.9, -8.05], to: [12.7, -7.35], y: HIGH_Y, cap: 6, stone: '#b8b6ac', margin: 0.9 }, // vách cao
  { from: [5.4, -9.45], to: [12.2, -8.75], y: HIGH_Y + 0.8, cap: 5, stone: '#b8b6ac', margin: 1.5 },
];

// Chia số ghế cấu hình cho các hàng theo tỉ lệ cap (mặc định đúng 50 ghế như trên).
function seatsPerRow(total) {
  const sum = ROWS.reduce((s, r) => s + r.cap, 0);
  const exact = ROWS.map((r) => (r.cap * total) / sum);
  const counts = exact.map(Math.floor);
  const order = exact.map((v, i) => [v - counts[i], i]).sort((a, b) => b[0] - a[0]);
  for (let i = 0, left = total - counts.reduce((s, n) => s + n, 0); left > 0; i++, left--) counts[order[i % order.length][1]]++;
  return counts;
}

// ---------------------------------------------------------------- Địa hình

function valueNoise(x, z) {
  const hash = (i, j) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x);
  const j = Math.floor(z);
  const u = x - i;
  const v = z - j;
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  return lerp(lerp(hash(i, j), hash(i + 1, j), su), lerp(hash(i, j + 1), hash(i + 1, j + 1), su), sv);
}
const inEllipse = (x, z, e) => 1 - sstep(0.55, 1.05, Math.hypot((x - e.x) / e.rx, (z - e.z) / e.rz));

// Khe suối từ chân thác ngầm chảy vào hồ.
const FALL_Z = (P(0, 383)[1] + P(0, 435)[1]) / 2;
const FALL_X = 13.1;

// Độ cao mặt đá/đáy hồ tại một điểm. Bờ hồ đúng ở y = 0, tức mực nước.
function groundY(x, z) {
  const r = Math.hypot(x, z);
  const R = pondRadius(Math.atan2(z, x));
  const t = r / R;
  if (t < 1) {
    const s = 1 - t;
    let depth = 1.45 * sstep(0, 0.32, s);
    depth = lerp(depth, 0.4 * sstep(0, 0.2, s), inEllipse(x, z, SHALLOW));
    depth += 2.4 * inEllipse(x, z, DEEP);
    return -(depth + (valueNoise(x * 0.9, z * 0.9) - 0.5) * 0.25 * sstep(0, 0.12, s));
  }
  const out = r - R;
  let y = 0.04 + sstep(0, 1.8, out) * 0.2 + (valueNoise(x * 0.55, z * 0.55) - 0.3) * 0.34 * sstep(0.2, 2.4, out);
  // khe suối
  const inFall = sstep(0.95, 0.45, Math.abs(z - FALL_Z)) * sstep(FALL_X + 1, FALL_X, x);
  y = lerp(y, -0.06, inFall);
  // vách hang: cuối hang và hai bên dựng đứng, phía trước (sát máy quay) chỉ là mô đá thấp
  const dx = Math.max(-14.2 - x, x - 14.6, 0);
  const dzBack = Math.max(-12.4 - z, 0);
  const dzFront = Math.max(z - 12.6, 0);
  const side = Math.hypot(dx, dzBack);
  y += sstep(0, 9, side) * 40 * (0.82 + valueNoise(x * 0.3, z * 0.3) * 0.4);
  y += sstep(0, 3.6, dzFront) * (3 + valueNoise(x * 0.5, z * 0.4) * 2.5);
  return y;
}

// Gom tam giác low-poly màu theo từng mặt, cuối cùng thành một mesh duy nhất.
function rockBuilder() {
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const n = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const api = {
    // hint: hướng mặt mong muốn, tự đảo chiều tam giác nếu ngược.
    tri(a, b, d, color, hint, jitter = 0.05) {
      if (hint) {
        ab.subVectors(b, a);
        ac.subVectors(d, a);
        n.crossVectors(ab, ac);
        if (n.dot(hint) < 0) [b, d] = [d, b];
      }
      c.set(color);
      const k = 1 + (rnd() - 0.5) * jitter * 2;
      for (const v of [a, b, d]) {
        pos.push(v.x, v.y, v.z);
        col.push(c.r * k, c.g * k, c.b * k);
      }
    },
    // Thêm khối có sẵn của Three (nón, đa diện), rung đỉnh cho gồ ghề. color có thể là hàm (tâm mặt) => màu.
    geo(geometry, color, { matrix, rough = 0 } = {}) {
      const g = geometry.index ? geometry.toNonIndexed() : geometry;
      const p = g.getAttribute('position');
      const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      const shake = (w) => {
        if (!rough) return;
        // cùng toạ độ thì lệch như nhau để các mặt vẫn khít
        const s = Math.sin(w.x * 91.7 + w.y * 37.3 + w.z * 53.1) * 43758.5453;
        const f = s - Math.floor(s);
        w.x += (f - 0.5) * rough;
        w.y += (((f * 7.13) % 1) - 0.5) * rough;
        w.z += (((f * 3.71) % 1) - 0.5) * rough;
      };
      for (let i = 0; i < p.count; i += 3) {
        for (let k = 0; k < 3; k++) {
          v[k].fromBufferAttribute(p, i + k);
          shake(v[k]);
          if (matrix) v[k].applyMatrix4(matrix);
        }
        const mid = typeof color === 'function' ? color((v[0].y + v[1].y + v[2].y) / 3) : color;
        api.tri(v[0], v[1], v[2], mid);
      }
      geometry.dispose();
      if (g !== geometry) g.dispose();
    },
    build(material, { cast = false } = {}) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, material);
      m.castShadow = cast;
      m.receiveShadow = true;
      m.userData.keep = true; // giữ vật liệu riêng, không gộp vào bake()
      return m;
    },
  };
  return api;
}

const placed = (x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

// Bậc đá: đa giác (x, z) có mặt trên phẳng hơi gồ, sườn loe dần xuống chân.
function slab(b, poly, top, bottom, color, sideColor) {
  const center = poly.reduce((s, [x, z]) => [s[0] + x / poly.length, s[1] + z / poly.length], [0, 0]);
  const rim = [];
  poly.forEach(([x, z], i) => {
    const [nx, nz] = poly[(i + 1) % poly.length];
    const parts = Math.max(1, Math.round(Math.hypot(nx - x, nz - z) / 1.4));
    for (let k = 0; k < parts; k++) {
      const u = k / parts;
      rim.push([lerp(x, nx, u) + range(-0.1, 0.1), lerp(z, nz, u) + range(-0.1, 0.1)]);
    }
  });
  const out = rim.map(([x, z]) => {
    const dx = x - center[0];
    const dz = z - center[1];
    const d = Math.hypot(dx, dz) || 1;
    return [dx / d, dz / d];
  });
  const up = new THREE.Vector3(0, 1, 0);
  const ring = (grow, y, wobble = 0) => rim.map(([x, z], i) => new THREE.Vector3(x + out[i][0] * grow + range(-wobble, wobble), y + range(-wobble, wobble), z + out[i][1] * grow + range(-wobble, wobble)));
  const edge = ring(0, top);
  const mid = ring(0.22, lerp(top, bottom, 0.45), 0.08);
  const foot = ring(0.6, bottom, 0.1);
  const contour = rim.map(([x, z]) => new THREE.Vector2(x, z));
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) b.tri(edge[i], edge[j], edge[k], color, up, 0.035);
  const hint = new THREE.Vector3();
  const belt = (upper, lower, shade) => {
    for (let i = 0; i < rim.length; i++) {
      const j = (i + 1) % rim.length;
      hint.set(out[i][0], 0, out[i][1]);
      b.tri(upper[i], upper[j], lower[j], shade, hint, 0.1);
      b.tri(upper[i], lower[j], lower[i], shade, hint, 0.1);
    }
  };
  belt(edge, mid, sideColor);
  belt(mid, foot, sideColor);
}

// ---------------------------------------------------------------- Shader nước

// Gợn tròn do giọt nước rơi: lưới ô, mỗi ô thỉnh thoảng nở một vòng (amount = mật độ 0..1).
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

const causticFn = /* glsl */ `
  float caustic(vec2 uv, float time) {
    const float TAU_ = 6.28318530718;
    vec2 p = mod(uv * TAU_, TAU_) - 250.0;
    vec2 i = p;
    float c = 1.0;
    float inten = 0.005;
    for (int n = 0; n < 4; n++) {
      float t = time * (1.0 - (3.5 / float(n + 1)));
      i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
    }
    c /= 4.0;
    c = 1.17 - pow(c, 1.4);
    return pow(abs(c), 8.0);
  }
`;

const glsl2 = (n) => (Number.isInteger(n) ? `${n}.0` : `${n}`);
const vec2Of = (a, b) => `vec2(${glsl2(a)}, ${glsl2(b)})`;

const pondVertex = /* glsl */ `
  attribute float aEdge;
  varying vec2 vXZ;
  varying float vEdge;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vXZ = world.xz;
    vEdge = aEdge;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// Nước tự phát sáng: ngày xanh ngọc, đêm tím. Vùng nông sáng và có đốm lấp lánh, vùng sâu tối hẳn.
const pondFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uTint;
  uniform float uRain;
  uniform float uNight;
  varying vec2 vXZ;
  varying float vEdge;
  ${rainRings}
  ${causticFn}
  float ell(vec2 p, vec2 c, vec2 r) { return length((p - c) / r); }
  float twinkle(vec2 p, float time) {
    vec2 cell = floor(p);
    float h = rainHash(cell);
    if (h < 0.72) return 0.0;
    vec2 c = vec2(rainHash(cell + 2.1), rainHash(cell + 5.3)) * 0.6 + 0.2;
    float d = length(fract(p) - c);
    float blink = 0.5 + 0.5 * sin(time * (1.0 + h * 2.5) + h * 40.0);
    return smoothstep(0.13, 0.0, d) * blink;
  }
  void main() {
    float nearShore = smoothstep(0.0, 0.07, vEdge);
    float shallow = smoothstep(1.08, 0.72, ell(vXZ, ${vec2Of(SHALLOW.x, SHALLOW.z)}, ${vec2Of(SHALLOW.rx, SHALLOW.rz)}));
    float deep = smoothstep(1.08, 0.66, ell(vXZ, ${vec2Of(DEEP.x, DEEP.z)}, ${vec2Of(DEEP.rx, DEEP.rz)}));
    vec3 midCol = mix(vec3(0.006, 0.17, 0.125), vec3(0.075, 0.03, 0.30), uNight);
    vec3 shallowCol = mix(vec3(0.05, 0.62, 0.40), vec3(0.34, 0.15, 0.85), uNight);
    vec3 deepCol = mix(vec3(0.002, 0.045, 0.04), vec3(0.018, 0.008, 0.09), uNight);
    vec3 glow = mix(vec3(0.35, 1.0, 0.82), vec3(0.72, 0.5, 1.0), uNight);
    vec3 col = mix(midCol, shallowCol, shallow);
    col = mix(col, deepCol, deep);
    // lớp sáng từ đáy hồ loang chậm
    float swell = 0.5 + 0.5 * sin(vXZ.x * 0.55 + uTime * 0.23) * sin(vXZ.y * 0.7 - uTime * 0.17);
    col += glow * 0.05 * swell * (1.0 - deep);
    float c1 = caustic(vXZ * 0.11, uTime * 0.45);
    float c2 = caustic(vXZ * 0.07 + 0.3, uTime * 0.3 + 3.0);
    col += glow * clamp(c1 * 0.5 + c2 * 0.32, 0.0, 0.8) * mix(0.3, 0.75, shallow) * (1.0 - deep * 0.9);
    // đốm lấp lánh vùng nông
    col += vec3(0.85, 1.0, 0.95) * twinkle(vXZ * 1.7, uTime) * shallow * 0.9;
    // mép hồ sáng như viền phát quang
    col += glow * (1.0 - nearShore) * 0.26;
    col *= uTint;
    // giọt nước: mặt hồ gợn tròn
    col += vec3(0.8, 0.95, 1.0) * rainRings(vXZ * 1.35, uTime, uRain * 0.95) * 0.5;
    float alpha = mix(0.8, 0.96, deep);
    alpha = mix(alpha, 0.66, shallow);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

// Dòng nước thác ngầm và khe suối: vUv.y = 1 ở đỉnh thác, = 0 ở chỗ chảy vào hồ.
const fallFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uTint;
  uniform float uNight;
  varying vec2 vUv;
  float hash(float x) { return fract(sin(x * 91.3) * 47453.5); }
  void main() {
    float col = floor(vUv.x * 14.0);
    float speed = 1.4 + hash(col) * 0.8;
    float y = vUv.y * 2.4 + uTime * speed * 0.42 + hash(col + 3.0);
    float streak = smoothstep(0.35, 0.5, fract(y)) * smoothstep(0.95, 0.6, fract(y));
    vec3 water = mix(vec3(0.16, 0.5, 0.82), vec3(0.42, 0.26, 0.95), uNight);
    vec3 c = mix(water, vec3(0.92, 0.98, 1.0), streak * 0.75) * uTint;
    float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
    gl_FragColor = vec4(c, (0.72 + streak * 0.25) * edge * smoothstep(0.0, 0.05, vUv.y));
    #include <colorspace_fragment>
  }
`;

// Đá nhận ánh sáng nước: sóng sáng (caustic) chiếu lên vách, mạnh ở gần hồ và tắt dần theo độ cao.
function makeRockMaterial(uniforms) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = uniforms.uTime;
    s.uniforms.uGlow = uniforms.uGlow;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRockPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform vec3 uGlow;\nvarying vec3 vRockPos;\n${causticFn}`)
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        float rockH = max(vRockPos.y, 0.0);
        float rockD = length(vRockPos.xz / vec2(10.5, 9.0));
        float reach = smoothstep(1.75, 0.98, rockD) * exp(-rockH * 0.11);
        float ripple = caustic((vRockPos.xz + vRockPos.y * vec2(0.6, 0.4)) * 0.09, uTime * 0.4);
        totalEmissiveRadiance += uGlow * reach * (0.012 + clamp(ripple, 0.0, 1.0) * 0.2);`,
      );
  };
  m.customProgramCacheKey = () => 'cave-rock';
  return m;
}

// ---------------------------------------------------------------- Dựng cảnh

export function buildWorld(scene, { seats: seatCount = 50 } = {}) {
  const updaters = [];
  const uniforms = {
    uTime: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) }, // độ sáng chung của nước (giông bão tối đi, chớp thì loé lên)
    uRain: { value: 0 },
    uNight: { value: 0 }, // 0: ngày, nước xanh ngọc; 1: đêm, nước tím
    uGlow: { value: new THREE.Color('#38e0c0') }, // màu ánh sáng nước hắt lên vách
  };
  // Gió lùa qua khe đá do weather.js đặt: dấu là hướng, độ lớn 0..~1.5
  const env = { wind: 0 };

  const voidColor = new THREE.Color('#05080b');
  scene.background = voidColor.clone();
  scene.fog = new THREE.Fog(voidColor.clone(), 55, 125);

  const rockMat = makeRockMaterial(uniforms);
  const ground = rockBuilder();
  const solid = rockBuilder();

  // ---------------------------------------------------------------- Nền hang + đáy hồ: lưới toả tròn bám theo viền hồ
  {
    const rings = [0, 0.22, 0.42, 0.6, 0.74, 0.86, 0.94, 1, 1.03, 1.08, 1.15, 1.24, 1.34, 1.46, 1.6, 1.75, 1.92, 2.1, 2.35, 2.7, 3.2, 4, 5.2, 7];
    const segs = 132;
    const at = (t, i) => {
      const a = (i / segs) * Math.PI * 2 - Math.PI;
      const r = pondRadius(a) * t;
      // lệch nhẹ để mặt đá không xếp thành hình quạt đều tăm tắp (trừ đúng viền hồ)
      const wobble = t > 1.05 ? 0.22 * t : 0;
      const x = Math.cos(a) * r + Math.sin(i * 12.9898 + t * 78.2) * wobble;
      const z = Math.sin(a) * r + Math.sin(i * 39.34 + t * 11.1) * wobble;
      return new THREE.Vector3(x, groundY(x, z), z);
    };
    const grid = rings.map((t) => Array.from({ length: segs + 1 }, (_, i) => at(t, i % segs)));
    const up = new THREE.Vector3(0, 1, 0);
    const shade = (a, b, c) => {
      const x = (a.x + b.x + c.x) / 3;
      const y = (a.y + b.y + c.y) / 3;
      const z = (a.z + b.z + c.z) / 3;
      if (y < -0.01) {
        const sh = inEllipse(x, z, SHALLOW);
        const de = inEllipse(x, z, DEEP);
        return new THREE.Color('#0e3f39').lerp(new THREE.Color('#2a8d76'), sh).lerp(new THREE.Color('#04181a'), de).getHex();
      }
      if (y < 1.2) return new THREE.Color('#2e3532').lerp(new THREE.Color('#4a4943'), sstep(0.02, 0.2, y)).getHex();
      return new THREE.Color('#403f3b').lerp(new THREE.Color('#1d1c21'), sstep(1, 26, y)).getHex();
    };
    for (let r = 0; r < rings.length - 1; r++) {
      for (let i = 0; i < segs; i++) {
        const a = grid[r][i];
        const b = grid[r][i + 1];
        const c = grid[r + 1][i + 1];
        const d = grid[r + 1][i];
        const jitter = r < 7 ? 0.04 : 0.09;
        ground.tri(a, b, c, shade(a, b, c), up, jitter);
        ground.tri(a, c, d, shade(a, c, d), up, jitter);
      }
    }
  }

  // ---------------------------------------------------------------- Các bờ đá, cao thấp khác nhau
  // bờ thấp, phía trước
  slab(solid, [[-6.8, 8.3], [6.8, 8.3], [6.4, 9.95], [-6.4, 9.95]], LOW_Y, -0.5, '#5f5e5a', '#403f3c');
  slab(solid, [[-6.3, 9.92], [6.3, 9.92], [5.9, 11.5], [-5.9, 11.5]], LOW_Y + 0.65, -0.2, '#6b6a65', '#44433f');
  // bờ đá trái
  slab(solid, [[-9.55, -3.4], [-9.55, 5.5], [-10.92, 5.7], [-10.92, -3.6]], MID_LEFT_Y, -0.5, '#888780', '#4b4a46');
  slab(solid, [[-10.88, -3], [-10.88, 5.1], [-12.35, 5.3], [-12.35, -3.2]], MID_LEFT_Y + 0.7, -0.2, '#94938b', '#4f4e49');
  // bờ đá giữa, bên phải
  slab(solid, [[9.9, -4.2], [9.9, 4.2], [11.4, 4.35], [11.4, -4.35]], MID_RIGHT_Y, -0.5, '#888780', '#4b4a46');
  slab(solid, [[11.35, -3.85], [11.35, 3.85], [13.1, 4], [13.1, -4]], MID_RIGHT_Y + 0.7, -0.2, '#94938b', '#4f4e49');
  // vách cao, cuối hang bên phải
  slab(solid, [[5.0, -7.6], [13.6, -6.65], [13.6, -8.35], [4.6, -9.1]], HIGH_Y, -0.4, '#b3b1a8', '#5a5954');
  slab(solid, [[4.6, -9.06], [13.6, -8.3], [13.6, -10.7], [4.2, -11]], HIGH_Y + 0.8, -0.2, '#bdbbb2', '#5e5d58');

  // đá vụn lăn dưới chân các bờ
  const pebble = (x, z, s, color) => {
    const y = groundY(x, z);
    solid.geo(new THREE.DodecahedronGeometry(1, 0), color, { matrix: placed(x, y + s * 0.2, z, s, s * range(0.55, 0.9), s * range(0.8, 1.2), rnd() * 6, rnd() * 0.6, rnd() * 0.6) });
  };
  for (const [x0, z0, x1, z1, n] of [
    [-7, 7.7, 7, 7.7, 0], [7, 8.2, 8.6, 11, 7], [-7, 8.2, -8.6, 11, 7], [-9.6, 5.8, -11.5, 7, 6], [-9.6, -3.8, -11.4, -5, 6], [9.6, 4.6, 12.5, 5.6, 6],
    [4.5, -6.8, 6.5, -6.6, 5], [7, -6.2, 12.5, -5.9, 6], [2, -9.5, 4.3, -11, 6],
  ]) {
    for (let i = 0; i < n; i++) pebble(lerp(x0, x1, rnd()) + range(-0.5, 0.5), lerp(z0, z1, rnd()) + range(-0.5, 0.5), range(0.2, 0.6), i % 2 ? '#55544f' : '#44433f');
  }

  // ---------------------------------------------------------------- Măng đá dưới nền (các chấm xám trên bản vẽ) và nhũ đá trên trần
  const stoneByHeight = (low, high, from, to) => (y) => new THREE.Color(low).lerp(new THREE.Color(high), sstep(from, to, y)).getHex();
  const mite = (x, z, r, h) => {
    const y = groundY(x, z) - 0.2;
    const col = stoneByHeight('#4d4c47', '#a9a79d', y, y + h);
    solid.geo(new THREE.DodecahedronGeometry(r * 1.2, 0), '#4b4a45', { matrix: placed(x, y + 0.2, z, 1, 0.45, 1, rnd() * 6) });
    solid.geo(new THREE.ConeGeometry(r, h, 7, 4), col, { rough: 0.1, matrix: placed(x, y + h / 2, z, 1, 1, 1, rnd() * 6) });
    for (let i = 0; i < 3; i++) {
      const a = rnd() * 6.28;
      const rr = r * range(0.35, 0.55);
      const hh = h * range(0.3, 0.55);
      solid.geo(new THREE.ConeGeometry(rr, hh, 6, 2), col, { rough: 0.05, matrix: placed(x + Math.cos(a) * r * 0.9, y + hh / 2, z + Math.sin(a) * r * 0.9, 1, 1, 1, rnd() * 6) });
    }
  };
  for (const [px, py, r, h] of [[264, 206, 0.82, 5.2], [735, 147, 0.62, 3.8], [176, 1088, 0.72, 3.1]]) {
    const [x, z] = P(px, py);
    mite(x, z, r, h);
  }
  // vài măng đá nhỏ cuối hang để có chiều sâu
  for (const [x, z, r, h] of [[-5.5, -10.6, 0.5, 2.8], [2.4, -11.4, 0.55, 3.4], [-12.4, -6.6, 0.55, 3.2], [-13, 7.2, 0.5, 2.4], [13.4, 8.4, 0.5, 2.6]]) mite(x, z, r, h);

  const tite = (x, z, r, tipY, topY = 44) => {
    const h = topY - tipY;
    const col = (y) => new THREE.Color('#8f9690').lerp(new THREE.Color('#2a2930'), sstep(tipY, tipY + 12, y)).getHex();
    // nón chúc xuống, thân gồ ghề
    solid.geo(new THREE.ConeGeometry(r, h, 7, 6), col, { rough: 0.25, matrix: placed(x, tipY + h / 2, z, 1, 1, 1, rnd() * 6, Math.PI) });
  };
  const stalactites = [
    // chùm cuối hang, ngọn lộ ra ngay trên mặt hồ
    [-13, -11, 2.2, 12], [-10.2, -12, 2.8, 8.5], [-7.5, -11.3, 2.2, 11], [-4.6, -12.2, 3, 8], [-2, -11.4, 2.1, 12.5], [0.7, -12.4, 3.1, 8.5], [3.4, -12, 2.2, 11.5], [6.4, -12.6, 3.1, 11], [9.8, -12.4, 2.8, 12.5], [13.2, -12, 2.4, 11],
    // sườn hai bên, khung lấy mặt hồ
    [-15.4, -7.5, 2.6, 8], [-15.8, -3, 2.6, 11], [-15.6, 2, 2.4, 13], [15.8, -6, 2.6, 8.5], [16, -1, 2.4, 11], [15.8, 4, 2.4, 14],
    [-13.4, 11.6, 1.8, 16], [13.6, 11.2, 1.8, 16],
  ];
  for (const [x, z, r, tip] of stalactites) {
    tite(x, z, r, tip);
    // nhũ nhỏ bám quanh
    for (let i = 0; i < 2; i++) tite(x + range(-2.2, 2.2), z + range(-1, 0.6), r * range(0.35, 0.55), tip + range(2, 7));
  }

  // ---------------------------------------------------------------- Đảo pha lê
  const crystalMat = new THREE.MeshStandardMaterial({ color: '#35d6a8', emissive: '#14c795', emissiveIntensity: 0.85, roughness: 0.25, flatShading: true });
  const crystalVioletMat = new THREE.MeshStandardMaterial({ color: '#9a6df5', emissive: '#7a3ff0', emissiveIntensity: 0.8, roughness: 0.25, flatShading: true });
  {
    const { x, z, r } = ISLAND;
    solid.geo(new THREE.DodecahedronGeometry(1, 0), '#5d5c57', { rough: 0.05, matrix: placed(x, -0.35, z, r, 0.95, r * 0.92, 0.7) });
    solid.geo(new THREE.DodecahedronGeometry(1, 0), '#6c6a64', { rough: 0.05, matrix: placed(x + 0.15, 0.12, z - 0.05, r * 0.7, 0.42, r * 0.62, 2.1) });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28 + 0.3;
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), i % 2 ? crystalMat : crystalVioletMat);
      c.position.set(x + Math.cos(a) * r * 0.62, 0.48, z + Math.sin(a) * r * 0.55);
      c.scale.set(0.8, range(1.3, 2.3), 0.8);
      c.rotation.set(range(-0.3, 0.3), rnd() * 6, range(-0.3, 0.3));
      scene.add(c);
    }
    const main = new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 0), crystalMat);
    main.position.set(x + 0.1, 1.95, z);
    main.scale.set(0.82, 1.9, 0.82);
    scene.add(main);
    updaters.push((t) => {
      main.rotation.y = t * 0.45;
      main.position.y = 1.95 + Math.sin(t * 1.1) * 0.09;
    });
    scene.add(halo('#6ff5d0', 5, [x + 0.1, 1.9, z], 0.34));
  }

  // ---------------------------------------------------------------- Thác ngầm
  {
    const [x0, z0] = [FALL_X, FALL_Z];
    const shore = pondRadius(Math.atan2(z0, 8.5));
    const endX = Math.cos(Math.atan2(z0, 8.5)) * shore - 0.5;
    const width = 1.5;
    // khối đá sau thác
    solid.geo(new THREE.DodecahedronGeometry(1, 0), '#55544f', { rough: 0.1, matrix: placed(x0 + 1.75, 3, z0, 1.7, 4.2, 2.3, 0.4) });
    solid.geo(new THREE.DodecahedronGeometry(1, 0), '#5f5e58', { rough: 0.1, matrix: placed(x0 + 1.05, 6.5, z0 - 0.1, 1.4, 0.7, 1.7, 1.2) });
    for (const dz of [-1.25, 1.25]) solid.geo(new THREE.DodecahedronGeometry(1, 0), '#4b4a46', { rough: 0.05, matrix: placed(x0 - 0.2, 0.5, z0 + dz, 0.75, 0.75, 0.55, rnd() * 6) });
    // dải nước: đổ thẳng từ đỉnh, cong ở chân thác rồi chảy vào hồ
    const path = [[x0 + 0.42, 6.2], [x0 + 0.34, 4.2], [x0 + 0.2, 2], [x0 + 0.08, 0.7], [x0 - 0.3, 0.16], [x0 - 0.9, 0.05], [lerp(x0, endX, 0.55), 0.03], [endX, 0.015]];
    const len = path.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0), 0);
    const pos = [];
    const uv = [];
    const index = [];
    let walked = 0;
    path.forEach(([x, y], i) => {
      if (i) walked += Math.hypot(x - path[i - 1][0], y - path[i - 1][1]);
      pos.push(x, y, z0 - width / 2, x, y, z0 + width / 2);
      uv.push(0, 1 - walked / len, 1, 1 - walked / len);
      if (i) {
        const v = i * 2;
        index.push(v - 2, v - 1, v, v - 1, v + 1, v);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    const stream = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: fallFragment,
      }),
    );
    stream.renderOrder = 3;
    stream.userData.keep = true;
    scene.add(stream);
    scene.add(halo('#7fb8ff', 5.5, [x0, 1.4, z0], 0.4));
    // bọt chân thác
    const foamMat = mat('#e8fbff', { rough: 1, transparent: true, opacity: 0.85 });
    const foams = [];
    for (let i = 0; i < 7; i++) {
      const f = mesh(new THREE.IcosahedronGeometry(0.3, 0), foamMat, { pos: [x0 - 0.3 + range(-0.4, 0.3), 0.14, z0 + range(-0.55, 0.55)], cast: false, receive: false });
      f.userData.phase = rnd() * 6;
      scene.add(f);
      foams.push(f);
    }
    updaters.push((t) => {
      for (const f of foams) {
        const s = 1 + Math.sin(t * 3.4 + f.userData.phase) * 0.35;
        f.scale.set(s * 1.25, s * 0.6, s);
      }
    });
  }

  // ---------------------------------------------------------------- Mặt nước
  {
    const rings = [0, 0.25, 0.5, 0.7, 0.84, 0.92, 0.97, 1, 1.05];
    const segs = 144;
    const pos = [];
    const edge = [];
    const index = [];
    rings.forEach((t) => {
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2 - Math.PI;
        const r = pondRadius(a) * t;
        pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
        edge.push(1 - Math.min(1, t));
      }
    });
    for (let r = 0; r < rings.length - 1; r++) {
      for (let i = 0; i < segs; i++) {
        const j = (i + 1) % segs;
        const a = r * segs + i;
        const b = r * segs + j;
        const c = (r + 1) * segs + j;
        const d = (r + 1) * segs + i;
        index.push(a, b, c, a, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
    g.setIndex(index);
    const pondMat = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexShader: pondVertex, fragmentShader: pondFragment });
    const water = new THREE.Mesh(g, pondMat);
    water.renderOrder = 2;
    water.userData.keep = true;
    scene.add(water);
  }

  // Rong phát sáng dưới đáy vùng nông và ven bờ
  const weedMat = new THREE.MeshStandardMaterial({ color: '#2fbf8c', emissive: '#22c79a', emissiveIntensity: 0.9 });
  const weeds = [];
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2;
    const inShallow = i < 9;
    const d = inShallow ? Math.sqrt(rnd()) * 0.85 : range(0.72, 0.92);
    const x = inShallow ? SHALLOW.x + Math.cos(a) * SHALLOW.rx * d : Math.cos(a) * pondRadius(a) * d;
    const z = inShallow ? SHALLOW.z + Math.sin(a) * SHALLOW.rz * d : Math.sin(a) * pondRadius(a) * d;
    const y = groundY(x, z);
    const h = Math.min(range(0.4, 0.9), -y + 0.02);
    if (h < 0.15) continue;
    const w = mesh(new THREE.ConeGeometry(0.08, h, 4), weedMat, { pos: [x, y + h / 2, z], cast: false, receive: false });
    w.userData.phase = rnd() * 6;
    weeds.push(w);
    scene.add(w);
  }
  updaters.push((t) => {
    for (const w of weeds) w.rotation.z = Math.sin(t * 1.3 + w.userData.phase) * 0.18;
  });

  // ---------------------------------------------------------------- Nấm phát sáng
  const capPink = new THREE.MeshStandardMaterial({ color: '#e0407f', emissive: '#ff2f88', emissiveIntensity: 0.75, roughness: 0.5, flatShading: true });
  const capPurple = new THREE.MeshStandardMaterial({ color: '#7a5cf0', emissive: '#6d45ff', emissiveIntensity: 0.8, roughness: 0.5, flatShading: true });
  function mushrooms(list, capMat, haloColor) {
    const caps = [];
    for (const [x, z, s] of list) {
      const y = groundY(x, z) - 0.05;
      const h = 0.75 * s;
      solid.geo(new THREE.CylinderGeometry(0.1 * s, 0.17 * s, h, 6), '#d9d3c4', { matrix: placed(x, y + h / 2, z, 1, 1, 1, rnd() * 6) });
      const cap = new THREE.SphereGeometry(0.46 * s, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2);
      cap.applyMatrix4(placed(x, y + h - 0.03, z, 1, 0.72, 1, rnd() * 6, range(-0.12, 0.12), range(-0.12, 0.12)));
      caps.push(cap);
      scene.add(halo(haloColor, 2.4 * s + 1, [x, y + h, z], 0.26));
    }
    const m = new THREE.Mesh(mergeGeometries(caps), capMat);
    caps.forEach((c) => c.dispose());
    m.castShadow = true;
    scene.add(m);
  }
  const near = (px, py, dx, dz) => {
    const [x, z] = P(px, py);
    return [x + dx, z + dz];
  };
  mushrooms(
    [[...near(205, 382, 0, 0), 1.5], [...near(235, 418, 0, 0), 1], [...near(205, 382, -0.8, 0.35), 0.8], [...near(235, 418, 0.75, 0.45), 0.7], [...near(205, 382, 0.3, -0.8), 0.65],
     [...near(323, 1200, 0, 0), 1.2], [...near(358, 1176, 0, 0), 0.9], [...near(323, 1200, -0.7, 0.35), 0.7], [...near(358, 1176, 0.65, 0.3), 0.6]],
    capPurple,
    '#a78bff',
  );
  // nhóm nấm hồng dời vào trong một chút so với bản vẽ để không bị khung dọc cắt mất
  mushrooms(
    [[...near(1367, 1029, -1.4, 0), 1.5], [...near(1400, 1058, -1.5, 0), 1.1], [...near(1347, 1070, -1.3, 0), 0.9], [...near(1367, 1029, -2.1, 0.55), 0.7], [...near(1400, 1058, -2.1, 0.6), 0.6]],
    capPink,
    '#ff7db2',
  );

  // ---------------------------------------------------------------- Ghế trên bệ đá
  const seats = [];
  const cushionTop = mat('#a9672d', { rough: 0.75 });
  const cushionBand = mat('#7a4a1a', { rough: 0.7 });
  const holderMat = mat('#6b4426');
  const goldMat = mat('#d9a53a', { rough: 0.4, metal: 0.4 });
  const bucketMat = mat('#b9824c');
  const rodMat = mat('#2b2b33', { rough: 0.4 });
  const rodGold = mat('#e0b54a', { rough: 0.35, metal: 0.5 });
  const counts = seatsPerRow(seatCount);
  ROWS.forEach((row, rowIndex) => {
    const n = counts[rowIndex];
    const stoneMat = mat(row.stone, { flat: true, rough: 0.95 });
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      const pos = new THREE.Vector3(lerp(row.from[0], row.to[0], u) + range(-0.07, 0.07), row.y + range(-0.1, 0.12), lerp(row.from[1], row.to[1], u) + range(-0.07, 0.07));
      const inward = new THREE.Vector3(-pos.x, 0, -pos.z).normalize();
      const rotY = Math.atan2(inward.x, inward.z);
      const g = new THREE.Group();
      g.position.copy(pos);
      g.rotation.y = rotY;
      // bệ đá chôn một phần xuống bậc, nên ghế nào cũng chắc chân dù cao thấp lệch nhau
      g.add(mesh(new THREE.CylinderGeometry(0.56, 0.68, 0.82, 7), stoneMat, { pos: [0, -0.19, 0], rot: [0, rnd() * 6, 0] }));
      g.add(mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.16, 12), cushionBand, { pos: [0, 0.3, 0] }));
      g.add(mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.1, 12), cushionTop, { pos: [0, 0.42, 0] }));
      // ống cắm cần (bên phải) + xô (bên trái)
      const holder = new THREE.Group();
      holder.position.set(-0.42, 0, -0.78);
      holder.add(mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.55, 10), holderMat, { pos: [0, 0.28, 0] }));
      holder.add(mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 14), goldMat, { pos: [0, 0.5, 0], rot: [Math.PI / 2, 0, 0] }));
      const spare = new THREE.Group();
      spare.position.set(0, 0.45, 0);
      spare.rotation.x = 0.55;
      spare.add(mesh(new THREE.CylinderGeometry(0.02, 0.035, 2.4, 6), rodMat, { pos: [0, 1.2, 0] }));
      spare.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.35, 8), rodGold, { pos: [0, 0.3, 0] }));
      spare.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10), mat('#333'), { pos: [0.07, 0.4, 0], rot: [0, 0, Math.PI / 2] }));
      holder.add(spare);
      g.add(holder);
      const bucket = new THREE.Group();
      bucket.position.set(0.42, 0, -0.8);
      bucket.scale.setScalar(0.8);
      bucket.add(mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.42, 12, 1, true), mat('#b9824c', { side: THREE.DoubleSide }), { pos: [0, 0.21, 0] }));
      bucket.add(mesh(new THREE.CircleGeometry(0.2, 12), bucketMat, { pos: [0, 0.02, 0], rot: [-Math.PI / 2, 0, 0] }));
      bucket.add(mesh(new THREE.TorusGeometry(0.26, 0.02, 4, 16), mat('#7a5230'), { pos: [0, 0.4, 0], rot: [Math.PI / 2, 0, 0] }));
      bucket.add(mesh(new THREE.TorusGeometry(0.23, 0.02, 4, 16), mat('#7a5230'), { pos: [0, 0.12, 0], rot: [Math.PI / 2, 0, 0] }));
      bucket.add(mesh(new THREE.CircleGeometry(0.23, 12), mat('#3fb6e0'), { pos: [0, 0.3, 0], rot: [-Math.PI / 2, 0, 0], cast: false }));
      g.add(bucket);
      for (const part of [g, holder, spare, bucket]) bake(part);
      scene.add(g);
      // phao rơi ở chỗ gần nhất trên đường nhìn ra hồ, cách bờ một đoạn và không rơi lên đảo
      let reach = 2.4;
      const bobber = new THREE.Vector3();
      for (; reach < 24; reach += 0.2) {
        bobber.copy(pos).addScaledVector(inward, reach);
        bobber.y = 0;
        const clear = Math.hypot(bobber.x - ISLAND.x, bobber.z - ISLAND.z) > ISLAND.r + 0.7;
        if (clear && pondDepthIn(bobber.x, bobber.z) > row.margin) break;
      }
      const side = new THREE.Vector3(inward.z, 0, -inward.x);
      seats.push({ index: seats.length, group: g, pos, inward, side, rotY, bobber, reach, spare, bucket, seatY: pos.y + 0.47 });
    }
  });

  // ---------------------------------------------------------------- Khối đá gộp một lần
  const groundMesh = ground.build(rockMat);
  const solidMesh = solid.build(rockMat, { cast: true });
  scene.add(groundMesh, solidMesh);

  // ---------------------------------------------------------------- Vệt sáng lọt qua khe trần, rọi xuống đảo pha lê
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#cfe6ff') }, uOpacity: { value: 0.1 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vY;
      void main() {
        gl_FragColor = vec4(uColor, uOpacity * smoothstep(0.0, 0.3, vY) * (0.4 + vY * 0.6));
        #include <colorspace_fragment>
      }
    `,
  });
  const shaftFrom = new THREE.Vector3(-6.5, 42, -14);
  const shaftTo = new THREE.Vector3(ISLAND.x, 0, ISLAND.z);
  const shaftLen = shaftFrom.distanceTo(shaftTo);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 2.3, shaftLen, 10, 1, true), shaftMat);
  shaft.position.copy(shaftFrom).lerp(shaftTo, 0.5);
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shaftFrom.clone().sub(shaftTo).normalize());
  shaft.renderOrder = 4;
  shaft.userData.keep = true;
  scene.add(shaft);

  // ---------------------------------------------------------------- Ánh sáng: nước hắt lên là chính
  // đèn bán cầu: mặt nhìn xuống (đáy nhũ đá, cằm người câu) nhận màu nước từ dưới, mặt nhìn lên nhận ánh mờ trên trần
  const hemi = new THREE.HemisphereLight('#8d9cb8', '#49b8a4', 1.2);
  scene.add(hemi);
  // ánh sáng mờ từ khe trần, chỉ để người câu có bóng đổ và không bị tối mặt
  const sun = new THREE.DirectionalLight('#dfe9ff', 0.85);
  sun.position.set(-4, 30, 18);
  sun.target.position.set(0, 0, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 70 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  // đèn phụ đi theo máy quay (main.js điều khiển): giữ màu áo và mặt người câu không bị ám xanh, mạnh lên khi quay cận
  const fill = new THREE.DirectionalLight('#fff0dc', 0.3);
  scene.add(fill, fill.target);
  // đèn đặt ngay trên mặt nước, chiếu ngược lên các bờ đá
  const pondLights = [
    { at: [SHALLOW.x, 1.1, SHALLOW.z], power: 11 },
    { at: [DEEP.x, 1.2, DEEP.z], power: 4 },
    { at: [0.5, 1.2, -4.6], power: 8 },
    { at: [0.2, 1.1, 5.8], power: 7 },
  ].map(({ at, power }) => {
    const l = new THREE.PointLight('#38e0c0', power, 30, 1.25);
    l.position.set(...at);
    l.userData.power = power;
    scene.add(l);
    return l;
  });
  // đèn của cụm nấm (màu cố định)
  const mushLights = [
    { at: near(220, 400, 0, 0), color: '#9a7bff', power: 14 },
    { at: near(340, 1188, 0, 0), color: '#9a7bff', power: 10 },
    { at: near(1367, 1050, -1.5, 0), color: '#ff5fa8', power: 16 },
  ].map(({ at, color, power }) => {
    const l = new THREE.PointLight(color, power, 11, 1.5);
    l.position.set(at[0], 1.4, at[1]);
    l.userData.power = power;
    scene.add(l);
    return l;
  });

  // gộp các khối tĩnh nằm thẳng trong scene và trong group con
  scene.traverse((o) => o.isGroup && o.children.some((c) => c.isMesh) && o !== scene && !o.userData.noBake && bake(o));
  bake(scene);

  return {
    seats,
    env,
    sky: {
      uniforms,
      hemi,
      sun,
      fill,
      focus: 0, // 0: toàn cảnh, 1: đang quay cận
      shaft: shaftMat.uniforms,
      pondLights,
      mushLights,
      glow: [
        { mat: crystalMat, day: 0.85, night: 1.3 },
        { mat: crystalVioletMat, day: 0.8, night: 1.3 },
        { mat: capPink, day: 0.7, night: 1.15 },
        { mat: capPurple, day: 0.75, night: 1.2 },
        { mat: weedMat, day: 0.9, night: 1.4 },
      ],
      wet: [rockMat],
    },
    update(t, dt) {
      uniforms.uTime.value = t;
      for (const fn of updaters) fn(t, dt);
    },
  };

  // ---------------------------------------------------------------- Đồ vật dùng chung

  function halo(color, size, at, opacity) {
    const m = new THREE.SpriteMaterial({ map: haloTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const s = new THREE.Sprite(m);
    s.position.set(...at);
    s.scale.setScalar(size);
    s.renderOrder = 3;
    return s;
  }
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
