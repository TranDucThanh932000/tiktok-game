// Khúc sông quê miền Tây (theo bản vẽ vietnam_riverbank_fishing_layout.png): cây đa, đình làng, quán nước đầu làng, đường làng,
// cầu ao gỗ, cầu tre qua sông, chà cá, đò ngang, vó, ghe neo, bờ đê dừa nước, ruộng lúa và chòi canh, lục bình trôi theo dòng.
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

// Tấm biển gỗ sơn số chỗ câu: 20 biển chung một ảnh. Số đẹp (8, 9) sơn đỏ chữ vàng.
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
// Toạ độ pixel lấy từ vietnam_riverbank_fishing_layout.png (giữa bản đồ là px 765, 677; 1 px = 0,0192 đơn vị).
// Ảnh nhìn từ trên xuống: phía trên ảnh là phía xa máy quay (z âm), sông chảy từ trái sang phải (x dương).
const K = 0.0192;
const X = (px) => (px - 765) * K;
const Z = (py) => (py - 677) * K;
const P = (px, py) => [X(px), Z(py)];

const BANK_Y = 0.36; // mặt đất cao hơn mặt nước
const DECK_Y = 0.46; // mặt cầu ao và bến đò
const HOT = { x: X(705), z: Z(677), r: 70 * K }; // chà cá

// Đường cong trơn đi qua các điểm [x, y] có x tăng dần, ngoài hai đầu thì giữ nguyên.
function smoothCurve(points) {
  const n = points.length;
  const slope = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    return (b[1] - a[1]) / (b[0] - a[0]);
  });
  return (x) => {
    if (x <= points[0][0]) return points[0][1];
    if (x >= points[n - 1][0]) return points[n - 1][1];
    let i = 0;
    while (points[i + 1][0] < x) i++;
    const h = points[i + 1][0] - points[i][0];
    const u = (x - points[i][0]) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * points[i][1] + (u3 - 2 * u2 + u) * h * slope[i] + (-2 * u3 + 3 * u2) * points[i + 1][1] + (u3 - u2) * h * slope[i + 1];
  };
}
// Hai bờ sông theo bản vẽ (px từ 59 đến 1470), hai đầu kéo dài ra ngoài khung hình cho máy quay cận vẫn thấy sông chảy tiếp.
const bankN = smoothCurve([[-6000, 495], [-4000, 470], [-2500, 510], [-1200, 470], [-400, 515], [59, 500], [200, 484], [300, 483], [500, 495], [700, 508], [880, 510], [1000, 500], [1150, 478], [1270, 469], [1380, 475], [1470, 500], [2200, 470], [3000, 515], [4500, 480], [7500, 500]].map(([px, py]) => P(px, py)));
const bankS = smoothCurve([[-6000, 850], [-4000, 835], [-2500, 860], [-1200, 830], [-400, 865], [59, 852], [200, 838], [300, 836], [500, 855], [700, 875], [900, 885], [1120, 882], [1200, 860], [1300, 835], [1390, 828], [1470, 838], [2200, 820], [3000, 870], [4500, 835], [7500, 850]].map(([px, py]) => P(px, py)));

const RIVER_X = [];
for (let x = -130; x < -30; x += 5) RIVER_X.push(x);
for (let x = -30; x < 30; x += 0.6) RIVER_X.push(x);
for (let x = 30; x <= 130; x += 5) RIVER_X.push(x);

// roam: đàn cá lượn dọc sông. hot: cá tụ quanh chà. swim: đường lượn của cá hô chúa trong sự kiện, nằm giữa cầu tre và đò ngang.
export const POND = {
  hot: HOT,
  roam: { x: 0, z: 0.1, rx: 13, rz: 2.5 },
  swim: { x: 0.1, z: -0.1, rx: 5, rz: 1.25 },
};

// Cầu tre: mặt cầu cong lên ở giữa.
const BRIDGE = { x: X(360), z0: Z(441), z1: Z(876), rise: 0.85 };
const bridgeY = (z) => {
  const mid = (BRIDGE.z0 + BRIDGE.z1) / 2;
  const u = (z - mid) / ((BRIDGE.z1 - BRIDGE.z0) / 2);
  return BANK_Y + 0.06 + BRIDGE.rise * (1 - u * u);
};

// Các chỗ ngồi câu. 14 chỗ đầu đúng các chấm trên bản vẽ, 6 chỗ sau thêm vào hai bờ để hồ vẫn đủ 20 người.
// Đặt seats: 14 trong config.json thì chỉ dựng đúng 14 chỗ của bản vẽ.
const SPOTS = [
  ['bank', 176, 456],
  ['bank', 270, 450],
  ['bank', 588, 471],
  ['bank', 770, 477],
  ['pier', 894, 528, { skew: -0.2 }],
  ['bank', 1029, 447],
  ['bridge', 356, 603],
  ['bridge', 356, 750],
  ['boat', 911, 800, { skew: 0.3 }],
  ['bank', 235, 871],
  ['bank', 441, 882],
  ['bank', 676, 912],
  ['bank', 823, 923],
  ['bank', 1029, 918],
  ['bank', 480, 466],
  ['bank', 1110, 455],
  ['bank', 1270, 440],
  ['bank', 505, 885],
  ['bank', 1120, 916],
  ['bank', 1262, 875],
];
export const SPOT_COUNT = SPOTS.length;

// Bố trí đồ quanh ghế theo từng loại chỗ ngồi: [ngang, dọc] tính từ ghế, dọc dương là phía người câu nhìn tới.
const GEAR_AT = {
  bank: { bucket: [-0.68, 0.3], holder: [0.5, 0.42], stake: [0.92, -0.4], mat: true, cooler: true },
  pier: { bucket: [-0.6, 0.1], holder: [0.52, 0.25], stake: [0.66, -0.5] },
  bridge: { bucket: [-0.66, 0.02], holder: [0.48, 0.22], stake: [0, -0.62] },
  boat: { bucket: [-0.72, 0.05], holder: [0.55, 0.25], stake: [0.75, -0.3] },
};

const RIGHT = { x0: X(1215), x1: X(1385) }; // khu bàn cân, cạnh quán nước

// Đường người phục vụ đi từ đường làng tới cạnh chỗ ngồi, gồm các điểm [x, y, z]. Sang bờ nam thì đi qua cầu tre,
// men theo phía tay vịn để không va vào người đang ngồi câu trên cầu.
const ROAD_N = Z(323);
const ROAD_S = Z(958);
const ROAD_Y = BANK_Y + 0.06;
const WALK_X = BRIDGE.x + 0.36;
function serveRoute(kind, pos, side, north) {
  const onBridge = (toZ) => {
    const pts = [];
    for (let z = BRIDGE.z0; z < toZ; z += 0.5) pts.push([WALK_X, bridgeY(z) + 0.025, z]);
    pts.push([WALK_X, bridgeY(toZ) + 0.025, toZ]);
    return pts;
  };
  const toBridge = [[WALK_X, ROAD_Y, ROAD_N]];
  if (kind === 'bridge') return [...toBridge, ...onBridge(pos.z - 0.85)];
  if (kind === 'pier') {
    const x = pos.x - 0.45;
    return [[x, ROAD_Y, ROAD_N], [x, BANK_Y, Z(404)], [x, DECK_Y, Z(416)], [x, DECK_Y, pos.z - 0.75]];
  }
  if (kind === 'boat') return [[pos.x + 0.9, 0, pos.z - 1.15]]; // xuồng cập ngay trước ghe
  const x = pos.x + side.x * 1.05;
  if (north) return [[x, ROAD_Y, ROAD_N], [x, BANK_Y, pos.z]];
  return [...toBridge, ...onBridge(BRIDGE.z1), [WALK_X, BANK_Y, Z(940)], [WALK_X, ROAD_Y, ROAD_S], [x, ROAD_Y, ROAD_S], [x, BANK_Y, pos.z]];
}

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

const riverVertex = /* glsl */ `
  attribute float aEdge;
  varying vec3 vP;
  varying float vEdge;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vP = world.xyz;
    vEdge = aEdge;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// Nước sông phù sa, chảy từ trái sang phải, ánh màu trời. Chà cá sủi bọt, đò ngang rẽ sóng, nước vỗ mép bờ.
const riverFragment = /* glsl */ `
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
  uniform vec3 uFerry; // x, z, độ mạnh của sóng đò
  varying vec3 vP;
  varying float vEdge;
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
    vec2 flow = xz - vec2(t * 0.32, 0.0);
    vec2 g = waves(flow, t);
    float foam = 0.0;
    // chà cá: nước sủi và gợn tròn trong vòng phao
    vec2 hot = xz - ${vec2Of(HOT.x, HOT.z)};
    float hotR = length(hot);
    float inHot = smoothstep(${glsl2(HOT.r)}, ${glsl2(HOT.r * 0.5)}, hotR);
    g += (hot / max(hotR, 0.001)) * cos(hotR * 9.0 - t * 3.5) * 0.05 * inHot;
    float bubble = noise2(xz * 6.0 + vec2(t * 0.8, -t * 1.4)) * 0.6 + noise2(xz * 14.0 - vec2(t * 1.1, 0.0)) * 0.4;
    foam = max(foam, smoothstep(0.6, 0.8, bubble) * inHot * 0.7);
    // đò ngang rẽ nước hai bên mạn
    vec2 ferry = (xz - uFerry.xy) * vec2(1.7, 0.7);
    float wake = exp(-dot(ferry, ferry)) * uFerry.z;
    foam = max(foam, smoothstep(0.42, 0.72, noise2(xz * 9.0 + vec2(t * 0.9, t * 1.3))) * wake * 0.8);
    // nước vỗ mép bờ
    float lap = smoothstep(0.1, 0.0, abs(vEdge - 0.46 - sin(xz.x * 1.3 + t * 1.2) * 0.05));
    foam = max(foam, lap * (0.25 + 0.3 * noise2(flow * 3.0)));

    vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 V = normalize(cameraPosition - vP);
    vec3 R = reflect(-V, N);
    // phù sa: ven bờ đục sáng hơn, giữa dòng sậm hơn, vệt nước loang kéo dài theo dòng chảy
    float silt = noise2(vec2(flow.x * 0.28, xz.y * 1.5) + 3.0) * 0.65 + noise2(vec2(flow.x * 0.8, xz.y * 4.0)) * 0.35;
    vec3 deep = mix(vec3(0.27, 0.16, 0.06), vec3(0.4, 0.25, 0.1), silt);
    vec3 shallow = vec3(0.46, 0.31, 0.14);
    vec3 col = mix(shallow, deep, smoothstep(0.4, 2.4, vEdge));
    // ánh trời trên mặt nước: nhìn càng xiên càng rõ
    float fres = 0.16 + 0.84 * pow(1.0 - max(dot(N, V), 0.0), 3.0);
    vec3 sky = mix(uHor, uTop, smoothstep(0.1, 0.8, R.y));
    col = mix(col, sky, fres * 0.24);
    // nắng lấp lánh theo màu nắng lúc đó
    float sun = pow(max(dot(R, uSunDir), 0.0), 240.0) * 1.8 + pow(max(dot(R, uSunDir), 0.0), 24.0) * 0.1;
    col += uGlint * sun;
    vec2 wob = flow + g * 2.5;
    col += uGlint * twinkle(wob * vec2(1.1, 2.6), t) * 0.26 * (1.0 - uNight);
    col += uGlint * twinkle(wob * vec2(2.1, 4.6) + 7.0, t * 1.4) * 0.14 * (1.0 - uNight);
    col *= uTint;
    // bọt trắng, trời tối vẫn thấy nhờ ánh đèn
    vec3 foamCol = mix(vec3(0.93, 0.9, 0.82), vec3(0.32, 0.38, 0.42), uNight * (1.0 - uLamp * 0.5));
    col = mix(col, foamCol * max(uTint, vec3(0.4)), foam * 0.85);
    // mưa làm mặt sông gợn tròn
    col += vec3(0.8, 0.9, 0.95) * rainRings(xz * 1.35, t, uRain * 0.95) * 0.42;
    // khúc sông xa tan vào chân trời
    col = mix(col, uHor, smoothstep(58.0, 125.0, length(cameraPosition - vP)));
    float alpha = mix(0.7, 0.95, smoothstep(0.35, 1.3, vEdge));
    gl_FragColor = vec4(col, max(alpha, foam));
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------- Dựng cảnh

// Tấm lưới bám theo một hàm: fn(x, j) trả về { y, z, ...thuộc tính khác }. zUp: z tăng theo j (để mặt lưới ngửa lên trên).
function sheet(xs, rows, fn, zUp, attrs = {}) {
  const pos = [];
  const extra = Object.fromEntries(Object.keys(attrs).map((k) => [k, []]));
  const index = [];
  xs.forEach((x, i) => {
    for (let j = 0; j <= rows; j++) {
      const v = fn(x, j);
      pos.push(x, v.y, v.z);
      for (const k in extra) extra[k].push(...[v[k]].flat());
      if (i < xs.length - 1 && j < rows) {
        const a = i * (rows + 1) + j;
        const b = a + rows + 1;
        if (zUp) index.push(a, a + 1, b, b, a + 1, b + 1);
        else index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  for (const k in extra) g.setAttribute(k, new THREE.Float32BufferAttribute(extra[k], attrs[k]));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// Cây tre, cột chống: một thanh tròn nối hai điểm.
const UP = new THREE.Vector3(0, 1, 0);
function pole(a, b, r, material, opts = {}) {
  const from = new THREE.Vector3(...a);
  const dir = new THREE.Vector3(...b).sub(from);
  const m = cyl(r, r, dir.length(), material, [...from.clone().addScaledVector(dir, 0.5).toArray()], { seg: 6, ...opts });
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  return m;
}

// Mái ngói bốn mái của đình: gốc toạ độ ở giữa đường viền mái.
function hipRoof(w, d, ridge, h) {
  const A = [-w / 2, 0, d / 2];
  const B = [w / 2, 0, d / 2];
  const C = [w / 2, 0, -d / 2];
  const D = [-w / 2, 0, -d / 2];
  const E = [-ridge / 2, h, 0];
  const F = [ridge / 2, h, 0];
  const tris = [A, B, F, A, F, E, C, D, E, C, E, F, D, A, E, B, C, F];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(tris.flatMap((p) => [p[0] * 1.5, p[1] * 2.4 + Math.abs(p[2]) * 0.4]), 2));
  g.computeVertexNormals();
  return g;
}

// overview: { pos, look } của góc máy toàn cảnh. seatCount: số chỗ câu đang mở (seats trong config.json).
export function buildWorld(scene, overview, seatCount = SPOT_COUNT) {
  const updaters = [];
  const uniforms = {
    uTime: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uRain: { value: 0 },
    uNight: { value: 0 },
    uLamp: { value: 0 }, // 0: đèn tắt; 1: đèn câu sáng
    uWind: { value: 0 },
    uTop: { value: new THREE.Color('#3f7fc4') },
    uHor: { value: new THREE.Color('#ffd29a') },
    uGlint: { value: new THREE.Color('#fff3dc') },
    uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.5).normalize() },
    uFerry: { value: new THREE.Vector3(0, 0, 0) },
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
  const signMat = new THREE.MeshStandardMaterial({ map: signAtlas(), roughness: 0.8 });
  // đèn câu: sáng lên khi trời tối (weather.js chỉnh độ sáng)
  const tubeMat = new THREE.MeshStandardMaterial({ color: '#eef8f2', emissive: '#d8fff0', emissiveIntensity: 0.1, roughness: 0.3 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#ffe8b0', emissive: '#ffb648', emissiveIntensity: 0.1, roughness: 0.4 });
  const lampPool = new THREE.MeshBasicMaterial({ map: haloTexture(), color: '#dffff0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

  const bamboo = mat('#c8ae62', { rough: 0.7 });
  const bambooDark = mat('#8f7a3f', { rough: 0.75 });
  const plank = ['#a37546', '#96683b', '#ad7f4f', '#8d6135'].map((c) => mat(c, { rough: 0.95 }));
  const pile = mat('#5e4a30');
  const weave = mat('#c0a56c', { rough: 1 });

  // Mái lá hai dốc, nóc chạy dọc trục x.
  function thatchRoof(x, y, z, w, d, rise) {
    const run = d / 2;
    const a = Math.atan2(rise, run);
    const slope = Math.hypot(rise, run) + 0.1;
    for (const s of [1, -1]) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y + rise / 2, z + (s * run) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(s * a, 0, 0)), new THREE.Vector3(1, 1, 1));
      addTextured(thatchMat, new THREE.BoxGeometry(w, 0.09, slope), m);
    }
    props.add(cyl(0.05, 0.05, w + 0.02, bambooDark, [x, y + rise + 0.03, z], { rot: [0, 0, Math.PI / 2], seg: 6 }));
  }

  // ---------------------------------------------------------------- Đất: bãi cỏ hai bờ, đường làng, bờ đê, ruộng lúa
  {
    const grass = canvasTexture(
      1024,
      1024,
      (g, w, h) => {
        g.fillStyle = '#b6d488';
        g.fillRect(0, 0, w, h);
        // mảng cỏ đậm nhạt, vẽ lặp qua mép ảnh để ghép liền
        for (let i = 0; i < 220; i++) {
          const r = range(24, 90);
          const x = range(0, w);
          const y = range(0, h);
          const dark = rnd() < 0.55;
          const color = dark ? `rgba(120,160,70,${range(0.14, 0.3)})` : `rgba(214,226,140,${range(0.12, 0.26)})`;
          for (const ox of [-w, 0, w]) {
            for (const oy of [-h, 0, h]) {
              if (x + ox < -r || x + ox > w + r || y + oy < -r || y + oy > h + r) continue;
              const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
              grad.addColorStop(0, color);
              grad.addColorStop(1, 'rgba(0,0,0,0)');
              g.fillStyle = grad;
              g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
            }
          }
        }
        // ngọn cỏ
        for (let i = 0; i < 13000; i++) {
          const x = range(0, w);
          const y = range(0, h);
          g.strokeStyle = rnd() < 0.5 ? `rgba(92,136,56,${range(0.18, 0.42)})` : `rgba(220,232,150,${range(0.14, 0.34)})`;
          g.lineWidth = 1.4;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + range(-2.5, 2.5), y - range(4, 10));
          g.stroke();
        }
      },
      { repeat: [1, 1], anisotropy: 8 },
    );
    const grassMat = new THREE.MeshStandardMaterial({ map: grass, roughness: 1 });
    // Bãi cỏ: đa giác giữa bờ sông và một đường z cố định, uv theo toạ độ thật.
    const lawn = (bank, zEnd) => {
      const shape = new THREE.Shape();
      RIVER_X.forEach((x, i) => (i ? shape.lineTo(x, -bank(x)) : shape.moveTo(x, -bank(x))));
      shape.lineTo(130, -zEnd);
      shape.lineTo(-130, -zEnd);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const p = geo.getAttribute('position');
      const uv = geo.getAttribute('uv');
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 16, p.getZ(i) / 16);
      const m = mesh(geo, grassMat, { pos: [0, BANK_Y, 0], cast: false });
      m.userData.keep = true;
      scene.add(m);
    };
    lawn(bankN, Z(59));
    lawn(bankS, Z(972));

    // Bờ sông: đất bùn dốc xuống nước, phía trên loang dần vào bãi cỏ.
    const mudLand = [0.54, 0.42, 0.26];
    const mudWet = [0.3, 0.22, 0.13];
    for (const [bank, dir] of [[bankN, 1], [bankS, -1]]) {
      const slope = [[-0.03, BANK_Y + 0.01, mudLand], [0.22, 0.14, mudLand], [0.55, -0.1, mudWet], [1.1, -0.8, mudWet]];
      const slopeGeo = sheet(RIVER_X, 3, (x, j) => ({ z: bank(x) + dir * slope[j][0], y: slope[j][1], color: slope[j][2] }), dir > 0, { color: 3 });
      const s = mesh(slopeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), { cast: false });
      s.userData.keep = true;
      scene.add(s);
      const fade = [[-0.7, 0], [-0.22, 0.75], [0, 1]];
      const fadeGeo = sheet(RIVER_X, 2, (x, j) => ({ z: bank(x) + dir * fade[j][0], y: BANK_Y + 0.012, color: [...mudLand, fade[j][1]] }), dir > 0, { color: 4 });
      const f = mesh(fadeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, depthWrite: false }), { cast: false });
      f.userData.keep = true;
      scene.add(f);
    }

    // đường làng và đường trên bờ đê
    const concrete = canvasTexture(
      512,
      256,
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
        g.fillRect(w - 5, 0, 5, h);
      },
      { repeat: [52, 1] },
    );
    const roadMat = new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.95 });
    for (const py of [323, 958]) {
      const road = mesh(new THREE.BoxGeometry(260, 0.08, 0.72), roadMat, { pos: [0, BANK_Y + 0.02, Z(py)], cast: false });
      road.userData.keep = true;
      scene.add(road);
    }
    // lối đất từ đường xuống bến
    const dirt = mat('#b89c6c', { rough: 1 });
    for (const [px, py0, py1] of [[894, 335, 412], [1176, 335, 435], [1176, 923, 946], [360, 335, 441], [360, 876, 946], [553, 247, 311], [1117, 253, 311]]) {
      props.add(box(0.62, 0.02, (py1 - py0) * K, dirt, [X(px), BANK_Y + 0.006, Z((py0 + py1) / 2)], { cast: false }));
    }

    // ruộng lúa: thửa dài đúng khổ trên bản vẽ (353 × 103 px), bờ ruộng sáng màu
    const COLS = 4;
    const ROWS = 6;
    const rice = canvasTexture(
      2048,
      1024,
      (g, w, h) => {
        const cw = w / COLS;
        const ch = h / ROWS;
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLS; x++) {
            g.fillStyle = pick(['#8fbb4f', '#98c459', '#86b34a', '#9fc75c', '#8ab84c']);
            g.fillRect(x * cw, y * ch, cw, ch);
            g.strokeStyle = 'rgba(50,100,35,0.22)';
            g.lineWidth = 2;
            for (let k = 5; k < ch; k += 10) {
              g.beginPath();
              g.moveTo(x * cw, y * ch + k);
              g.lineTo((x + 1) * cw, y * ch + k + range(-1.5, 1.5));
              g.stroke();
            }
            g.strokeStyle = '#5f8f2c';
            g.lineWidth = 6;
            g.strokeRect(x * cw, y * ch, cw, ch);
          }
        }
      },
      { repeat: [1, 1], anisotropy: 8 },
    );
    const riceMat = new THREE.MeshStandardMaterial({ map: rice, roughness: 1 });
    const tileW = 353 * COLS * K;
    const tileD = 103 * ROWS * K;
    for (const [z0, z1] of [[Z(970), 48], [-48, Z(59)]]) {
      const geo = new THREE.PlaneGeometry(260, z1 - z0).rotateX(-Math.PI / 2).translate(0, BANK_Y - 0.02, (z0 + z1) / 2);
      const p = geo.getAttribute('position');
      const uv = geo.getAttribute('uv');
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - X(59)) / tileW, (p.getZ(i) - Z(970)) / tileD);
      const fields = mesh(geo, riceMat, { cast: false });
      fields.userData.keep = true;
      scene.add(fields);
    }
  }

  // ---------------------------------------------------------------- Sông: đáy bùn và mặt nước
  {
    props.add(box(270, 0.1, 18, mat('#2c2112', { rough: 1 }), [0, -0.95, 0], { cast: false }));
    const geo = sheet(
      RIVER_X,
      14,
      (x, j) => {
        const n = bankN(x) - 1.1;
        const s = bankS(x) + 1.1;
        const z = n + ((s - n) * j) / 14;
        return { z, y: 0, aEdge: Math.min(z - bankN(x), bankS(x) - z) };
      },
      true,
      { aEdge: 1 },
    );
    const water = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, vertexShader: riverVertex, fragmentShader: riverFragment }));
    water.renderOrder = 2;
    water.userData.keep = true;
    water.frustumCulled = false;
    scene.add(water);
  }

  // ---------------------------------------------------------------- Cây đa và đình làng
  {
    const [x, z] = P(235, 200);
    const y = BANK_Y;
    const bark = mat('#5c4630', { rough: 1 });
    props.add(cyl(0.42, 0.74, 2.7, bark, [x, y + 1.35, z], { seg: 10 }));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + range(-0.2, 0.2);
      props.add(pole([x + Math.cos(a) * 0.3, y + 0.8, z + Math.sin(a) * 0.3], [x + Math.cos(a) * 1, y, z + Math.sin(a) * 1], 0.13, bark));
    }
    // rễ phụ thả từ tán xuống đất
    const rootMat = mat('#6d543a', { rough: 1 });
    for (let k = 0; k < 16; k++) {
      const a = rnd() * Math.PI * 2;
      const r = range(0.75, 1.55);
      props.add(cyl(0.022, 0.035, 3, rootMat, [x + Math.cos(a) * r, y + 1.5, z + Math.sin(a) * r], { seg: 4, cast: false }));
    }
    const leaves = ['#35690f', '#3f7a14', '#2f6010'].map((c) => mat(c, { flat: true, rough: 1 }));
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2;
      const r = range(0.95, 1.35);
      const s = range(0.75, 1.05);
      props.add(mesh(new THREE.IcosahedronGeometry(s, 1), pick(leaves), { pos: [x + Math.cos(a) * r, y + range(3.1, 3.6), z + Math.sin(a) * r * 0.9], scale: [1, 0.72, 1] }));
    }
    props.add(mesh(new THREE.IcosahedronGeometry(1.05, 1), mat('#5f9a25', { flat: true, rough: 1 }), { pos: [x, y + 4.1, z], scale: [1.05, 0.72, 1.05] }));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      props.add(mesh(new THREE.IcosahedronGeometry(0.55, 1), mat('#4f8a1c', { flat: true, rough: 1 }), { pos: [x + Math.cos(a) * 0.7, y + 3.95, z + Math.sin(a) * 0.7], scale: [1, 0.7, 1] }));
    }

    // Đình: nền đá, hàng cột son, mái ngói bốn mái đầu đao cong
    const [dx, dz] = P(553, 200);
    const stone = mat('#b9b2a3', { rough: 0.95 });
    const lacquer = mat('#8f2418', { rough: 0.5 });
    const gold = mat('#e0b54a', { rough: 0.35, metal: 0.5 });
    props.add(box(3.5, 0.3, 2.2, stone, [dx, y + 0.15, dz]));
    props.add(box(1.5, 0.14, 0.3, stone, [dx, y + 0.07, dz + 1.22]));
    const floorY = y + 0.3;
    const postH = 1.35;
    for (let k = 0; k < 5; k++) {
      for (const s of [-1, 1]) props.add(cyl(0.075, 0.09, postH, lacquer, [dx - 1.4 + k * 0.7, floorY + postH / 2, dz + s * 0.78], { seg: 8 }));
    }
    props.add(box(2.9, postH, 0.08, mat('#c9a36a', { rough: 0.9 }), [dx, floorY + postH / 2, dz - 0.74]));
    for (const s of [-1, 1]) props.add(box(0.08, postH, 1.5, mat('#c9a36a', { rough: 0.9 }), [dx + s * 1.42, floorY + postH / 2, dz]));
    // bàn thờ và hoành phi
    props.add(box(1.1, 0.6, 0.35, lacquer, [dx, floorY + 0.3, dz - 0.5]));
    props.add(box(0.5, 0.2, 0.2, gold, [dx, floorY + 0.7, dz - 0.5]));
    props.add(box(1.2, 0.18, 0.04, gold, [dx, floorY + postH - 0.12, dz + 0.8], { cast: false }));
    const tiles = canvasTexture(
      256,
      256,
      (g, w, h) => {
        g.fillStyle = '#9a3a1e';
        g.fillRect(0, 0, w, h);
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            g.fillStyle = `rgba(${range(90, 190)},${range(40, 75)},${range(20, 40)},0.55)`;
            g.beginPath();
            g.arc(((c + (r % 2) * 0.5) * w) / 8, ((r + 0.8) * h) / 8, w / 16, 0, Math.PI);
            g.fill();
          }
          g.fillStyle = 'rgba(55,20,8,0.45)';
          g.fillRect(0, (r * h) / 8, w, 3);
        }
      },
      { repeat: [1, 1] },
    );
    const tileMat = new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.9, side: THREE.DoubleSide });
    const roofAt = new THREE.Matrix4().makeTranslation(dx, floorY + postH - 0.02, dz);
    addTextured(tileMat, hipRoof(3.95, 2.55, 2.5, 0.95), roofAt);
    const ridgeY = floorY + postH + 0.93;
    props.add(box(2.6, 0.09, 0.14, mat('#f0906a', { rough: 0.7 }), [dx, ridgeY + 0.04, dz]));
    props.add(mesh(new THREE.IcosahedronGeometry(0.11, 1), gold, { pos: [dx, ridgeY + 0.2, dz] }));
    for (const s of [-1, 1]) {
      props.add(mesh(new THREE.ConeGeometry(0.07, 0.42, 6), mat('#f0906a', { rough: 0.7 }), { pos: [dx + s * 1.34, ridgeY + 0.16, dz], rot: [0, 0, -s * 0.75] }));
      for (const c of [-1, 1]) {
        props.add(mesh(new THREE.ConeGeometry(0.08, 0.5, 6), mat('#b5482a', { rough: 0.8 }), { pos: [dx + s * 2.02, floorY + postH + 0.1, dz + c * 1.32], rot: [c * 0.7, 0, -s * 0.8] }));
      }
    }
  }

  // ---------------------------------------------------------------- Quán nước đầu làng
  {
    const [x, z] = P(1117, 208);
    const floorY = BANK_Y + 0.04;
    const postH = 2.05;
    const hw = 1.2;
    const hd = 0.95;
    const brown = ['#84500f', '#7a4a10', '#8e5915'].map((c) => mat(c, { rough: 0.95 }));
    for (let k = -hd - 0.1; k < hd + 0.05; k += 0.3) props.add(box(hw * 2 + 0.2, 0.08, 0.29, pick(brown), [x, floorY - 0.03, k + z + 0.15], { cast: false }));
    const wood = mat('#9a7a48', { rough: 0.8 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) props.add(cyl(0.06, 0.075, postH, wood, [x + sx * hw, floorY + postH / 2, z + sz * hd]));
    thatchRoof(x, floorY + postH, z, hw * 2 + 0.5, hd * 2 + 0.55, 0.72);
    // quầy nước: hũ trà đá, ly cà phê, thùng mì gói
    const backZ = z - hd + 0.35;
    props.add(box(2, 0.82, 0.46, mat('#6a4522', { rough: 0.9 }), [x, floorY + 0.41, backZ]));
    props.add(box(2.08, 0.05, 0.54, mat('#efe6cf', { rough: 0.6 }), [x, floorY + 0.84, backZ]));
    props.add(cyl(0.2, 0.2, 0.42, mat('#d7572a', { rough: 0.4 }), [x - 0.72, floorY + 1.08, backZ], { seg: 12 }));
    props.add(cyl(0.21, 0.21, 0.05, mat('#f4f4ec'), [x - 0.72, floorY + 1.31, backZ], { seg: 12 }));
    for (let k = 0; k < 4; k++) props.add(cyl(0.06, 0.045, 0.16, mat(k % 2 ? '#2c1810' : '#c98a3c', { rough: 0.25 }), [x - 0.22 + k * 0.19, floorY + 0.95, backZ + 0.06], { seg: 8, cast: false }));
    props.add(box(0.46, 0.34, 0.34, mat('#e9c13f', { rough: 0.8 }), [x + 0.74, floorY + 1.04, backZ]));
    props.add(box(0.48, 0.1, 0.36, mat('#d6332f', { rough: 0.8 }), [x + 0.74, floorY + 1.05, backZ]));
    // biển quán
    const menu = paintedBoard(640, 256, '#7a1f12', (g, w, h) => {
      g.strokeStyle = '#ffd84d';
      g.lineWidth = 10;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#ffe16a';
      g.font = '900 104px "Segoe UI", Arial, sans-serif';
      g.fillText('QUÁN NƯỚC', w / 2, 88);
      g.fillStyle = '#ffffff';
      g.font = '800 50px "Segoe UI", Arial, sans-serif';
      g.fillText('Trà đá · Cà phê · Mì gói', w / 2, 188);
    });
    const board = mesh(new THREE.PlaneGeometry(2.3, 0.92), new THREE.MeshStandardMaterial({ map: menu, roughness: 0.75, side: THREE.DoubleSide }), { pos: [x, floorY + postH + 0.5, z + hd + 0.42], rot: [-0.62, 0, 0] });
    board.userData.keep = true;
    scene.add(board);
    // dây bóng đèn vàng dọc mái, sáng lúc trời tối
    const bulbs = [];
    for (let k = 0; k < 7; k++) bulbs.push(new THREE.IcosahedronGeometry(0.06, 0).translate(x - hw + (k * hw * 2) / 6, floorY + postH - 0.12 - Math.sin((k / 6) * Math.PI) * 0.12, z + hd));
    const string = new THREE.Mesh(mergeGeometries(bulbs), bulbMat);
    string.userData.keep = true;
    scene.add(string);
    // một cái võng có người nằm đong đưa
    const pivot = new THREE.Group();
    pivot.position.set(x, floorY + 1.72, z + 0.42);
    pivot.add(hammock(hw * 2 - 0.15, 0.9, ['#d94b38', '#f1c232']));
    pivot.add(restingPerson({ shirt: '#2d6da3', pants: '#3b3b3f', hat: true }));
    bake(pivot);
    pivot.userData.noBake = true;
    scene.add(pivot);
    updaters.push((t) => (pivot.rotation.x = Math.sin(t * 0.9) * (0.08 + Math.min(0.1, Math.abs(env.wind) * 0.08))));
    // bàn nhựa thấp trước quán
    for (const [dx, dz] of [[-1.85, 0.75], [1.75, 0.8]]) {
      props.add(cyl(0.34, 0.26, 0.05, mat('#3a7fbd', { rough: 0.5 }), [x + dx, BANK_Y + 0.42, z + dz], { seg: 10 }));
      props.add(cyl(0.05, 0.14, 0.4, mat('#2f6da0', { rough: 0.5 }), [x + dx, BANK_Y + 0.2, z + dz], { seg: 8 }));
      props.add(cyl(0.055, 0.042, 0.16, mat('#2c1810', { rough: 0.25 }), [x + dx - 0.08, BANK_Y + 0.53, z + dz], { seg: 8, cast: false }));
    }
    // xe máy dựng cạnh quán
    const paint = ['#c7302b', '#222a33', '#2a62b0'];
    [[945, 262], [985, 268], [1025, 262]].forEach(([px, py], i) => {
      const bike = motorbike(paint[i]);
      bike.position.set(X(px), BANK_Y + 0.02, Z(py));
      bike.rotation.y = range(-0.1, 0.1);
      bike.scale.setScalar(0.8);
      flatten(bike, props);
    });
  }

  // ---------------------------------------------------------------- Cầu ao gỗ
  {
    const x = X(894);
    const z0 = Z(412);
    const z1 = Z(548);
    const w = 1.5;
    for (let z = z0; z < z1; z += 0.27) props.add(box(w + range(-0.05, 0.05), 0.07, 0.25, pick(plank), [x + range(-0.015, 0.015), DECK_Y - 0.035, z + 0.13]));
    for (const s of [-1, 1]) {
      props.add(box(0.09, 0.1, z1 - z0, pile, [x + s * (w / 2 - 0.08), DECK_Y - 0.12, (z0 + z1) / 2], { cast: false }));
      for (const z of [z1 - 0.1, z1 - 0.95]) props.add(cyl(0.05, 0.05, 1.4, pile, [x + s * (w / 2 - 0.08), DECK_Y - 0.72, z], { seg: 6, cast: false }));
    }
  }

  // ---------------------------------------------------------------- Cầu tre qua sông
  {
    const { x, z0, z1 } = BRIDGE;
    for (let z = z0; z < z1; z += 0.2) props.add(box(1.22 + range(-0.05, 0.05), 0.045, 0.18, rnd() < 0.5 ? bamboo : bambooDark, [x, bridgeY(z), z + 0.09], { rot: [-Math.atan2(bridgeY(z + 0.2) - bridgeY(z), 0.2), 0, 0] }));
    const steps = 8;
    const at = (i) => z0 + ((z1 - z0) * i) / steps;
    for (let i = 0; i < steps; i++) {
      for (const s of [-1, 1]) props.add(pole([x + s * 0.5, bridgeY(at(i)) - 0.05, at(i)], [x + s * 0.5, bridgeY(at(i + 1)) - 0.05, at(i + 1)], 0.05, bambooDark, { cast: false }));
      // tay vịn một bên như bản vẽ
      props.add(pole([x + 0.62, bridgeY(at(i)) + 0.92, at(i)], [x + 0.62, bridgeY(at(i + 1)) + 0.92, at(i + 1)], 0.035, bamboo));
      props.add(pole([x + 0.62, bridgeY(at(i)) + 0.48, at(i)], [x + 0.62, bridgeY(at(i + 1)) + 0.48, at(i + 1)], 0.025, bamboo, { cast: false }));
    }
    for (let i = 0; i <= steps; i++) {
      const z = at(i);
      const y = bridgeY(z);
      props.add(pole([x + 0.62, y - 0.02, z], [x + 0.62, y + 0.94, z], 0.04, bamboo));
      if (i === 0 || i === steps) continue;
      // chân cầu chữ X cắm xuống lòng sông
      props.add(pole([x - 0.58, y - 0.03, z], [x + 0.72, -0.9, z], 0.055, bambooDark, { cast: false }));
      props.add(pole([x + 0.58, y - 0.03, z], [x - 0.72, -0.9, z], 0.055, bambooDark, { cast: false }));
      props.add(pole([x - 0.62, y - 0.06, z], [x + 0.62, y - 0.06, z], 0.045, bambooDark, { cast: false }));
    }
  }

  // ---------------------------------------------------------------- Chà cá: cành cây chất dưới nước, vòng phao cam quanh điểm nóng
  {
    const { x, z, r } = HOT;
    const stick = mat('#47443d', { rough: 1 });
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + range(-0.25, 0.25);
      const len = range(0.55, 0.85);
      props.add(pole([x, -0.5, z], [x + Math.cos(a) * len, range(0.18, 0.72), z + Math.sin(a) * len], range(0.022, 0.04), stick));
    }
    props.add(cyl(0.05, 0.07, 1.6, stick, [x + 0.05, 0.2, z - 0.03], { seg: 6 }));
    const floats = new THREE.Group();
    const orange = mat('#f39a1c', { rough: 0.5 });
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      floats.add(mesh(new THREE.SphereGeometry(0.085, 8, 6), orange, { pos: [x + Math.cos(a) * r, 0.03, z + Math.sin(a) * r], scale: [1.4, 0.75, 1], cast: false }));
    }
    bake(floats);
    floats.userData.noBake = true;
    scene.add(floats);
    updaters.push((t) => (floats.position.y = Math.sin(t * 1.5) * 0.018));
  }

  // ---------------------------------------------------------------- Đò ngang: hai bến, dây căng qua sông, đò chạy qua lại
  {
    const x = X(1176);
    const landing = (py0, py1) => {
      const z0 = Z(py0);
      const z1 = Z(py1);
      for (let z = z0; z < z1; z += 0.26) props.add(box(1 + range(-0.04, 0.04), 0.07, 0.24, pick(plank), [x, DECK_Y - 0.035, z + 0.13]));
      for (const s of [-1, 1]) {
        props.add(box(0.08, 0.1, z1 - z0, pile, [x + s * 0.42, DECK_Y - 0.12, (z0 + z1) / 2], { cast: false }));
        for (const z of [z0 + 0.12, z1 - 0.12]) props.add(cyl(0.05, 0.05, 1.5, pile, [x + s * 0.42, DECK_Y - 0.6, z], { seg: 6, cast: false }));
      }
    };
    landing(435, 500);
    landing(860, 923);
    const zN = Z(500);
    const zS = Z(860);
    props.add(pole([x, 0.5, zN], [x, 0.5, zS], 0.012, mat('#efe9d6', { rough: 1 }), { cast: false }));
    for (const z of [Z(490), Z(870)]) props.add(cyl(0.05, 0.05, 1.2, bambooDark, [x, 0.5, z], { seg: 6, cast: false }));

    const ferry = new THREE.Group();
    const hull = boat(2.5, 0.92, '#623a0e');
    flatten(hull, ferry);
    flatten(villager({ shirt: '#3f6f4f', pants: '#2f2a26', standing: true, pos: [-0.95, 0.12, 0], rot: Math.PI / 2 }), ferry);
    ferry.add(pole([-1.2, 1.35, 0.1], [-0.95, -0.7, 0.32], 0.018, bambooDark, { cast: false }));
    flatten(villager({ shirt: '#d9c7a0', pants: '#46423a', pos: [0.15, 0.12, 0], rot: Math.PI / 2 }), ferry);
    flatten(villager({ shirt: '#a8473a', pants: '#2f2a26', pos: [0.72, 0.12, 0], rot: Math.PI / 2, hat: false }), ferry);
    bake(ferry);
    ferry.userData.noBake = true;
    ferry.rotation.y = Math.PI / 2;
    ferry.position.x = x;
    scene.add(ferry);
    // Mỗi chuyến 20 giây, chờ khách ở mỗi bến 6 giây.
    const CROSS = 20;
    const WAIT = 6;
    const zA = zN + 1.15;
    const zB = zS - 1.15;
    updaters.push((t) => {
      const c = t % ((CROSS + WAIT) * 2);
      const leg = c % (CROSS + WAIT);
      const u = leg < CROSS ? leg / CROSS : 1;
      const eased = u * u * (3 - 2 * u);
      const back = c >= CROSS + WAIT;
      ferry.position.z = back ? zB + (zA - zB) * eased : zA + (zB - zA) * eased;
      ferry.rotation.y = back ? -Math.PI / 2 : Math.PI / 2;
      ferry.rotation.x = Math.sin(t * 1.3) * 0.012;
      uniforms.uFerry.value.set(ferry.position.x, ferry.position.z, u < 1 ? Math.sin(u * Math.PI) ** 0.5 : 0);
    });
  }

  // ---------------------------------------------------------------- Ghe neo
  const anchored = new THREE.Group();
  {
    const [x, z] = P(911, 800);
    flatten(boat(3, 1.12, '#623a0e'), anchored);
    // mui ghe đan tre phía đuôi
    const hood = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.95, 10, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), mat('#a58a55', { rough: 1, side: THREE.DoubleSide }), { pos: [-0.85, 0.28, 0] });
    anchored.add(hood);
    anchored.add(pole([1.3, 0.4, 0], [2.4, -0.6, 0.3], 0.012, mat('#d8cfb5'), { cast: false }));
    bake(anchored);
    anchored.position.set(x, 0, z);
    anchored.userData.noBake = true;
    scene.add(anchored);
    updaters.push((t) => (anchored.rotation.x = Math.sin(t * 1.1) * 0.012));
  }

  // ---------------------------------------------------------------- Vó (rớ): cần tre dài nâng tấm lưới lên xuống
  {
    const [bx, bz] = P(1383, 435);
    const [nx, nz] = P(1353, 550);
    const reach = Math.hypot(nx - bx, nz - bz);
    const py = BANK_Y + 0.28;
    // giá đỡ
    props.add(box(1.1, 0.06, 0.9, pick(plank), [bx, BANK_Y + 0.05, bz]));
    for (const s of [-1, 1]) props.add(pole([bx + s * 0.4, BANK_Y, bz - 0.2], [bx, py, bz], 0.04, pile));
    flatten(villager({ shirt: '#e8e4d8', pants: '#3b3b3f', standing: true, pos: [bx + 0.5, BANK_Y + 0.07, bz - 0.25], rot: 0.3 + Math.PI * 1.9 }), props);
    const arm = new THREE.Group();
    arm.position.set(bx, py, bz);
    arm.rotation.order = 'YXZ';
    arm.rotation.y = Math.atan2(nx - bx, nz - bz);
    arm.add(pole([0, 0, -0.75], [0, 0, reach], 0.04, bambooDark));
    arm.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), mat('#6b6a66', { flat: true }), { pos: [0, -0.02, -0.75] }));
    const net = new THREE.Group();
    net.position.z = reach;
    const hw = 0.85;
    const hd = 0.75;
    const apex = [0, 0.05, 0];
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) net.add(pole(apex, [sx * hw, -0.72, sz * hd], 0.016, bamboo));
    net.add(cyl(0.03, 0.03, 0.2, bambooDark, [0, 0.08, 0], { seg: 5, cast: false }));
    const mesh2 = canvasTexture(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(240,235,215,0.95)';
      g.lineWidth = 2.5;
      for (let k = 0; k <= 16; k++) {
        g.beginPath();
        g.moveTo((k * w) / 16, 0);
        g.lineTo((k * w) / 16, h);
        g.moveTo(0, (k * h) / 16);
        g.lineTo(w, (k * h) / 16);
        g.stroke();
      }
    });
    const netGeo = new THREE.PlaneGeometry(hw * 2, hd * 2, 8, 8).rotateX(-Math.PI / 2);
    const np = netGeo.getAttribute('position');
    for (let i = 0; i < np.count; i++) {
      const u = np.getX(i) / hw;
      const v = np.getZ(i) / hd;
      np.setY(i, -0.72 - 0.34 * (1 - u * u) * (1 - v * v));
    }
    netGeo.computeVertexNormals();
    const netMesh = new THREE.Mesh(netGeo, new THREE.MeshStandardMaterial({ map: mesh2, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, roughness: 1, depthWrite: false }));
    netMesh.renderOrder = 3;
    net.add(netMesh);
    arm.add(net);
    bake(arm);
    scene.add(arm);
    // Hạ lưới ngâm 11 giây, kéo lên 3 giây, giữ 3 giây, hạ xuống 2,5 giây.
    const down = Math.asin((0.42 - py) / reach);
    const up = Math.asin((1.75 - py) / reach);
    updaters.push((t) => {
      const c = (t + 8) % 19.5;
      const raw = c < 11 ? 0 : c < 14 ? (c - 11) / 3 : c < 17 ? 1 : 1 - (c - 17) / 2.5;
      const u = raw * raw * (3 - 2 * raw);
      const a = down + (up - down) * u;
      arm.rotation.x = -a;
      net.rotation.x = a;
    });
  }

  // ---------------------------------------------------------------- Lục bình trôi theo dòng
  {
    const clump = new THREE.Group();
    const greens = ['#3f7d17', '#4a8c1c', '#356d13'].map((c) => mat(c, { flat: true, rough: 0.9 }));
    for (const [x, z, r] of [[-0.24, 0.06, 0.25], [0.2, 0.2, 0.28], [0.06, -0.22, 0.22]]) clump.add(mesh(new THREE.IcosahedronGeometry(r, 1), pick(greens), { pos: [x, 0.08, z], scale: [1, 0.55, 1], cast: false }));
    clump.add(mesh(new THREE.IcosahedronGeometry(0.075, 1), mat('#a9a4ec', { rough: 0.7 }), { pos: [0, 0.27, 0.02], cast: false }));
    clump.add(mesh(new THREE.IcosahedronGeometry(0.055, 1), mat('#c3bff5', { rough: 0.7 }), { pos: [0.08, 0.22, 0.1], cast: false }));
    bake(clump);
    const parts = clump.children.filter((c) => c.isMesh);
    const merged = mergeGeometries(parts.map((p) => p.geometry));
    const LANES = [[205, 623], [529, 713], [1041, 582], [-90, 760], [760, 610], [1300, 760]].map(([px, py]) => P(px, py));
    const herd = new THREE.InstancedMesh(merged, parts[0].material, LANES.length);
    herd.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    herd.frustumCulled = false;
    herd.userData.keep = true;
    scene.add(herd);
    const SPAN = 42; // đi hết đoạn sông rồi quay lại từ ngoài khung hình
    const SPEED = 0.16;
    const d = new THREE.Object3D();
    updaters.push((t) => {
      LANES.forEach(([x0, z0], i) => {
        const x = ((x0 + 21 + t * SPEED) % SPAN) - 21;
        // né chà cá và ghe neo: lệch sang bên khi tới gần
        const near = Math.exp(-(((x - HOT.x) / 1.6) ** 2));
        const clear = Math.max(0, HOT.r + 0.55 - Math.abs(z0 - HOT.z));
        d.position.set(x, 0.01 + Math.sin(t * 1.4 + i) * 0.012, z0 + Math.sin(t * 0.13 + i * 2) * 0.22 + Math.sign(z0 - HOT.z || 1) * clear * near);
        d.rotation.y = t * 0.08 + i;
        d.scale.setScalar(1.15 + (i % 3) * 0.15);
        d.updateMatrix();
        herd.setMatrixAt(i, d.matrix);
      });
      herd.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------- Chỗ ngồi câu
  const seats = [];
  const CHAIRS = ['#d6332f', '#2268b8', '#2f9e55', '#e8912b', '#f2efe6'];
  const rodMat = mat('#2b2b33', { rough: 0.4 });
  const rodGold = mat('#e0b54a', { rough: 0.35, metal: 0.5 });
  // biển số song song với màn hình của máy toàn cảnh: chỗ nào cũng thấy số thẳng, không bị nghiêng theo phối cảnh
  const signTurn = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(overview.pos, overview.look, new THREE.Vector3(0, 1, 0)));
  const signBack = new THREE.Vector3(0, 0, -1).applyQuaternion(signTurn);

  SPOTS.slice(0, seatCount).forEach(([kind, px, py, opt = {}], i) => {
    const n = i + 1;
    const [x, z] = P(px, py);
    const north = py < 677;
    const inwardXZ = kind === 'bridge' ? [-1, 0] : kind === 'boat' || !north ? [0, -1] : [0, 1];
    const inward = new THREE.Vector3(inwardXZ[0], 0, inwardXZ[1]);
    const rotY = Math.atan2(inward.x, inward.z);
    const y = kind === 'bridge' ? bridgeY(z) + 0.025 : kind === 'pier' ? DECK_Y : kind === 'boat' ? 0.16 : BANK_Y;
    const pos = new THREE.Vector3(x, y, z);
    const side = new THREE.Vector3(inward.z, 0, -inward.x);
    const at = GEAR_AT[kind];
    // cần thả ra giữa dòng, chếch nhẹ để các phao không dính vào nhau
    const aim = inward.clone().applyAxisAngle(UP, (opt.skew ?? 0) + range(-0.08, 0.08));
    // độ xa của phao: bờ nào cũng thả cách mép nước ít nhất 2,2 đơn vị
    const reach = kind === 'bridge' ? range(2.7, 3.2) : kind === 'boat' ? range(2.4, 2.7) : Math.abs((north ? bankN(x) + 2.5 : bankS(x) - 2.5) - z) + range(-0.15, 0.25);

    const st = new THREE.Group();
    st.position.copy(pos);
    st.rotation.y = rotY;
    // tấm ván lót ngoài bờ đất
    if (at.mat) st.add(box(1.5, 0.04, 1.05, pick(plank), [-0.05, 0.02, 0.02], { cast: false }));

    // ghế: ghế nhựa có tựa hoặc ghế xếp; mặt ghế cao đúng 0,47 (fisher.js ngồi ở mức này)
    const chair = mat(CHAIRS[i % CHAIRS.length], { rough: 0.5 });
    if (i % 3 !== 1) {
      st.add(box(0.62, 0.05, 0.58, chair, [0, 0.445, -0.02]));
      for (const [lx, lz] of [[-0.27, -0.26], [0.27, -0.26], [-0.27, 0.22], [0.27, 0.22]]) st.add(box(0.05, 0.43, 0.05, chair, [lx, 0.21, lz]));
      st.add(box(0.6, 0.48, 0.04, chair, [0, 0.82, -0.31], { rot: [-0.14, 0, 0] }));
    } else {
      const frame = mat('#5a6168', { rough: 0.4, metal: 0.5 });
      const cloth = mat(['#2f6f4f', '#a03c30', '#34588c'][i % 3], { rough: 0.95, side: THREE.DoubleSide });
      st.add(box(0.6, 0.03, 0.56, cloth, [0, 0.45, -0.02]));
      st.add(box(0.6, 0.46, 0.03, cloth, [0, 0.8, -0.33], { rot: [-0.26, 0, 0] }));
      for (const lx of [-0.3, 0.3]) {
        st.add(box(0.03, 0.62, 0.03, frame, [lx, 0.22, -0.02], { rot: [0.72, 0, 0] }));
        st.add(box(0.03, 0.62, 0.03, frame, [lx, 0.22, -0.02], { rot: [-0.72, 0, 0] }));
      }
    }

    // thùng đá xốp nắp màu và gói cám (chỉ để ngoài bờ, trên cầu không đủ chỗ)
    if (at.cooler) {
      st.add(box(0.46, 0.32, 0.34, mat('#f1f1ea', { rough: 1 }), [-0.62, 0.17, -0.42]));
      st.add(box(0.49, 0.05, 0.37, mat(i % 2 ? '#2b7fc4' : '#d8473a', { rough: 0.6 }), [-0.62, 0.35, -0.42]));
      st.add(mesh(new THREE.DodecahedronGeometry(0.18, 0), mat(i % 2 ? '#e9c13f' : '#cf4a2c', { flat: true, rough: 0.9 }), { pos: [0.6, 0.14, -0.3], scale: [1, 0.78, 0.7] }));
    }

    // cọc tre cắm biển số, treo đèn câu
    const [sx, sz] = at.stake;
    const stakeH = 1.95;
    st.add(cyl(0.035, 0.05, stakeH, bamboo, [sx, stakeH / 2, sz], { seg: 6 }));
    st.updateMatrixWorld(true);
    {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(sx, 1.4, sz + 0.06), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      m.premultiply(st.matrix);
      addTextured(tubeMat, new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6).rotateZ(Math.PI / 2), m, { cast: false });
    }
    const signPos = new THREE.Vector3(sx, stakeH + 0.28, sz).applyMatrix4(st.matrix);
    const signW = 1;
    const signH = signW * 0.625;
    addTextured(signMat, signUv(new THREE.PlaneGeometry(signW, signH), n), new THREE.Matrix4().compose(signPos, signTurn, new THREE.Vector3(1, 1, 1)));
    addTextured(signMat, signUv(new THREE.PlaneGeometry(signW, signH), n).rotateY(Math.PI), new THREE.Matrix4().compose(signPos.clone().addScaledVector(signBack, 0.02), signTurn, new THREE.Vector3(1, 1, 1)));
    // biển nhỏ quay về phía người câu để lúc quay cận (máy nhìn từ giữa sông) vẫn đọc được
    {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(sx, 1.72, sz + 0.05), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      m.premultiply(st.matrix);
      addTextured(signMat, signUv(new THREE.PlaneGeometry(0.58, 0.36), n), m);
    }
    flatten(st, props);

    // phần động: cần dự phòng, ống cắm cần và xô cá (fisher.js và main.js dùng tới)
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = rotY;
    const holder = new THREE.Group();
    holder.position.set(at.holder[0], 0, at.holder[1]);
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
    bucket.position.set(at.bucket[0], 0, at.bucket[1]);
    bucket.scale.setScalar(0.82);
    const bucketColor = ['#3a8fd9', '#d9463a', '#35a35c'][i % 3];
    bucket.add(mesh(new THREE.CylinderGeometry(0.28, 0.21, 0.46, 12, 1, true), mat(bucketColor, { rough: 0.55, side: THREE.DoubleSide }), { pos: [0, 0.23, 0] }));
    bucket.add(mesh(new THREE.CircleGeometry(0.21, 12), mat(bucketColor), { pos: [0, 0.02, 0], rot: [-Math.PI / 2, 0, 0] }));
    bucket.add(mesh(new THREE.TorusGeometry(0.28, 0.018, 4, 16), mat('#e8e4d8'), { pos: [0, 0.46, 0], rot: [Math.PI / 2, 0, 0] }));
    bucket.add(mesh(new THREE.CircleGeometry(0.25, 12), mat('#7fb8a0'), { pos: [0, 0.36, 0], rot: [-Math.PI / 2, 0, 0], cast: false }));
    g.add(bucket);
    for (const part of [holder, spare, bucket]) bake(part);
    scene.add(g);

    const bobber = pos.clone().addScaledVector(aim, reach);
    bobber.y = 0;
    seats.push({ index: i, number: n, group: g, pos, inward, side, rotY, bobber, reach, spare, bucket, seatY: pos.y + 0.47, kind, route: serveRoute(kind, pos, side, north) });
  });

  // quầng đèn câu: trên chỗ ngồi và vệt hắt xuống mặt nước
  {
    const pools = [];
    for (const s of seats) {
      pools.push(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2).translate(s.pos.x, s.pos.y + 0.05, s.pos.z));
      const streak = new THREE.PlaneGeometry(1.5, 5.2).rotateX(-Math.PI / 2).rotateY(s.rotY);
      pools.push(streak.translate(s.pos.x + s.inward.x * 2.6, 0.04, s.pos.z + s.inward.z * 2.6));
    }
    const m = new THREE.Mesh(mergeGeometries(pools), lampPool);
    pools.forEach((g) => g.dispose());
    m.renderOrder = 3;
    m.userData.keep = true;
    scene.add(m);
  }

  // ---------------------------------------------------------------- Bụi cây bờ bắc, dừa nước bờ đê, lau sậy ven sông
  {
    const leaf = ['#659a24', '#5c9120', '#6fa42b'].map((c) => mat(c, { flat: true, rough: 1 }));
    for (const [px, py, r] of [[103, 388, 0.46], [141, 376, 0.46], [470, 393, 0.46], [509, 382, 0.46], [690, 393, 0.46], [729, 382, 0.46], [1264, 376, 0.46], [1303, 388, 0.46]]) {
      const [x, z] = P(px, py);
      props.add(mesh(new THREE.IcosahedronGeometry(r, 1), pick(leaf), { pos: [x, BANK_Y + r * 0.72, z], scale: [1.1, 0.92, 1.1] }));
      props.add(mesh(new THREE.IcosahedronGeometry(r * 0.6, 1), pick(leaf), { pos: [x + r * 0.5, BANK_Y + r * 0.45, z + r * 0.4] }));
    }
    const reedMats = ['#7f9a3a', '#93aa45', '#6b8a30'].map((c) => mat(c, { flat: true, side: THREE.DoubleSide }));
    const blade = new THREE.ConeGeometry(0.028, 1, 3);
    const clear = [...seats.map((s) => [s.pos.x, s.pos.z]), P(894, 500), P(1176, 490), P(1176, 870), P(360, 490), P(360, 860), P(1353, 490)];
    for (const [bank, dir] of [[bankN, 1], [bankS, -1]]) {
      for (let k = 0; k < 52; k++) {
        const x = range(-19, 19);
        const z = bank(x) + dir * range(-0.2, 0.22);
        if (clear.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 1.05)) continue;
        for (let b = 0; b < 5; b++) {
          const h = range(0.45, 0.95);
          props.add(mesh(blade, pick(reedMats), { pos: [x + range(-0.13, 0.13), BANK_Y * 0.55 + h / 2, z + range(-0.1, 0.1)], rot: [range(-0.22, 0.22), 0, range(-0.22, 0.22)], scale: [1, h, 1], cast: false }));
        }
      }
    }
  }
  const crowns = [];
  // dừa nước: bẹ lá mọc thẳng từ gốc sát đất
  for (const [px, py] of [[118, 900], [558, 923], [1338, 895], [1376, 905]]) {
    const [x, z] = P(px, py);
    const tree = nipa(x, BANK_Y, z);
    scene.add(tree);
    crowns.push({ crown: tree.userData.crown, phase: rnd() * 6 });
  }
  // vài cây dừa cao phía sau làng
  for (const [px, py, tall] of [[60, 70, 6.2], [400, 90, 6.8], [760, 70, 7], [960, 110, 6.4], [1440, 90, 6.6]]) {
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
  // mấy con chó nằm dưới gốc đa và trước quán
  {
    const [x1, z1] = P(235, 290);
    const [x2, z2] = P(1000, 300);
    const pack = [
      makeDog({ pos: [x1 + 0.9, BANK_Y, z1 - 0.2], rot: 0.5, coat: '#c8964e', belly: '#ecd3a0' }),
      makeDog({ pos: [x1 - 0.9, BANK_Y, z1 - 0.3], rot: 2.2, coat: '#2f2a26', belly: '#c9b79a', scale: 0.92 }),
      makeDog({ pos: [x2, BANK_Y, z2 - 0.1], rot: -1.2, coat: '#e7dcc5', belly: '#f7f2e6', patch: '#8a5b34' }),
    ];
    for (const d of pack) {
      scene.add(d.group);
      updaters.push(d.update);
    }
  }

  // ---------------------------------------------------------------- Chòi canh ruộng
  {
    const [x, z] = P(885, 1132);
    const base = BANK_Y - 0.02;
    const floorY = base + 1.05;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) props.add(cyl(0.05, 0.07, 2.45, bamboo, [x + sx * 0.55, base + 1.22, z + sz * 0.48]));
      props.add(pole([x + sx * 0.18, base, z + 1.05], [x + sx * 0.18, floorY, z + 0.5], 0.03, bambooDark));
    }
    for (let k = 1; k < 4; k++) props.add(box(0.42, 0.03, 0.05, bambooDark, [x, base + (k * 1.05) / 4, z + 1.05 - (k * 0.55) / 4], { cast: false }));
    props.add(box(1.3, 0.06, 1.15, pick(plank), [x, floorY, z]));
    props.add(box(1.2, 0.5, 0.05, weave, [x, floorY + 0.28, z - 0.5]));
    for (const sx of [-1, 1]) props.add(box(0.05, 0.5, 1, weave, [x + sx * 0.58, floorY + 0.28, z]));
    thatchRoof(x, base + 2.42, z, 1.75, 1.65, 0.6);
  }

  // ---------------------------------------------------------------- Bàn cân, bảng trắng, loa (cạnh quán nước)
  const scale = (() => {
    const zBack = Z(130);
    const zFront = Z(290);
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

    // bảng trắng ghi tên và số ký từng chỗ
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
        wb.fillText('Chưa có ai lên cá', 360, 216);
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

  // ---------------------------------------------------------------- Cảnh xa: rặng cây, xóm nhà, núi thấp
  {
    const greens = ['#3f7a3a', '#4d8a3e', '#356b34', '#5a9446', '#2f6130'].map((c) => mat(c, { flat: true, rough: 1 }));
    const blob = (x, z, r, tall = 1) => farProps.add(mesh(new THREE.IcosahedronGeometry(r, 1), pick(greens), { pos: [x, 0.25 + r * 0.55 * tall, z], scale: [1, tall * range(0.85, 1.15), range(0.85, 1.15)], cast: false }));
    // mép ruộng phía xa phải có cây che kín (đường chân trời giả cho máy nhìn dốc từ trên cao)
    for (let x = -60; x <= 60; x += 2.1) {
      blob(x + range(-0.7, 0.7), -36 + range(-1.2, 1.2), range(1.7, 2.9), 1.1);
      if (rnd() < 0.55) blob(x + range(-1, 1), -39 + range(-1, 1), range(2.1, 3.3), 1.25);
    }
    // ba phía còn lại chỉ thấy lúc quay cận; chừa khúc sông chảy qua
    for (let z = -30; z <= 46; z += 3) {
      if (Math.abs(z) < 8.5) continue;
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
    for (const [x, z, r] of [[-26, -19, 2], [-20, -20, 1.5], [24, -20, 2], [31, -18, 1.7], [-30, -11, 2.1], [32, 10, 2.1], [-24, 18, 2], [26, 22, 2]]) blob(x, z, r, 1.25);
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
  // đèn câu hai bờ: vài đèn thật toả rộng (phần còn lại là quầng giả cho nhẹ), thêm đèn vàng của quán và đình
  const lampLights = [
    { at: [X(330), 3, Z(440)], color: '#d8fff0', power: 24 },
    { at: [X(900), 3, Z(440)], color: '#d8fff0', power: 24 },
    { at: [X(420), 3, Z(910)], color: '#d8fff0', power: 24 },
    { at: [X(950), 3, Z(910)], color: '#d8fff0', power: 24 },
    { at: [X(360), 3.2, Z(677)], color: '#d8fff0', power: 20 },
    { at: [X(1117), 2.9, Z(240)], color: '#ffc27a', power: 18 },
    { at: [X(553), 2.9, Z(260)], color: '#ffc27a', power: 14 },
  ].map(({ at, color, power }) => {
    const l = new THREE.PointLight(color, 0, 18, 1.4);
    l.position.set(...at);
    l.userData.power = power;
    scene.add(l);
    return l;
  });

  return {
    seats,
    // chỗ đứng chờ trước quán của người phục vụ, bến đậu của xuồng bán hàng
    service: {
      homes: [[1072, 291], [1117, 296], [1162, 291]].map(([px, py]) => [X(px), BANK_Y, Z(py)]),
      moor: [X(975), 0, Z(540)],
    },
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

// Thân thuyền gỗ: dài theo trục x, gốc toạ độ ở giữa mặt nước, hai đầu cong lên, có sàn và băng ngồi.
export function boat(len, beam, color) {
  const g = new THREE.Group();
  const stations = [];
  for (let i = 0; i <= 18; i++) stations.push(-len / 2 + (i * len) / 18);
  const K_ROWS = 8;
  const hull = sheet(
    stations,
    K_ROWS,
    (x, j) => {
      const u = (x + len / 2) / len;
      const k = (j / K_ROWS) * 2 - 1;
      const w = (beam / 2) * Math.sin(Math.PI * Math.min(0.995, Math.max(0.005, u))) ** 0.55;
      const top = 0.3 + 0.32 * (2 * u - 1) ** 4;
      return { z: k * w, y: -0.2 + (top + 0.2) * Math.abs(k) ** 1.5 };
    },
    true,
  );
  g.add(mesh(hull, mat(color, { rough: 0.85, side: THREE.DoubleSide })));
  g.add(box(len * 0.62, 0.035, beam * 0.72, mat('#8d6135', { rough: 0.95 }), [0, 0.11, 0], { cast: false }));
  for (const x of [-0.3, 0.3]) g.add(box(0.2, 0.05, beam * 0.86, mat('#a37546', { rough: 0.95 }), [(x * len) / 1.2, 0.2, 0], { cast: false }));
  return g;
}

// Người làng đứng hoặc ngồi, đội nón lá. Không có hoạt cảnh, gộp được vào khối tĩnh.
function villager({ shirt, pants, standing = false, pos = [0, 0, 0], rot = 0, hat = true }) {
  const g = new THREE.Group();
  g.position.set(...pos);
  g.rotation.y = rot;
  const skin = mat('#c99668', { rough: 0.8 });
  const hips = standing ? 0.72 : 0.3;
  g.add(mesh(new THREE.CapsuleGeometry(0.15, 0.32, 3, 8), mat(shirt, { rough: 0.9 }), { pos: [0, hips + 0.3, 0] }));
  for (const s of [-1, 1]) {
    if (standing) g.add(mesh(new THREE.CapsuleGeometry(0.07, 0.56, 3, 6), mat(pants, { rough: 0.9 }), { pos: [s * 0.08, 0.36, 0] }));
    else g.add(mesh(new THREE.CapsuleGeometry(0.07, 0.3, 3, 6), mat(pants, { rough: 0.9 }), { pos: [s * 0.09, hips + 0.02, 0.18], rot: [Math.PI / 2 - 0.2, 0, 0] }));
    g.add(mesh(new THREE.CapsuleGeometry(0.045, 0.36, 3, 6), skin, { pos: [s * 0.2, hips + 0.3, 0.06], rot: [-0.5, 0, s * 0.12] }));
  }
  g.add(mesh(new THREE.SphereGeometry(0.135, 10, 8), skin, { pos: [0, hips + 0.68, 0] }));
  if (hat) g.add(mesh(new THREE.ConeGeometry(0.34, 0.2, 14), mat('#e6c978', { rough: 0.9, flat: true }), { pos: [0, hips + 0.84, 0] }));
  else g.add(mesh(new THREE.SphereGeometry(0.145, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat('#2a221c', { rough: 0.95 }), { pos: [0, hips + 0.7, -0.01] }));
  return g;
}

// Dừa nước: không thân, các bẹ lá dài mọc thẳng từ gốc rồi rủ ra ngoài.
function nipa(x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const leafMats = ['#2f6d12', '#387a16', '#44861d'].map((c) => mat(c, { side: THREE.DoubleSide, flat: true }));
  const crown = new THREE.Group();
  for (let k = 0; k < 11; k++) {
    const holder = new THREE.Group();
    holder.rotation.y = (k / 11) * Math.PI * 2 + range(-0.2, 0.2);
    holder.add(mesh(frond(range(1.5, 2.05), range(0.26, 0.36), range(1, 1.45)), pick(leafMats), {}));
    flatten(holder, crown);
  }
  bake(crown);
  crown.userData.noBake = true;
  g.add(crown);
  g.userData.crown = crown;
  return g;
}

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
