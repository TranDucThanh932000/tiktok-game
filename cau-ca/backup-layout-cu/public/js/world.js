// Khung cảnh hồ câu: hồ hình bầu dục giữa sàn gỗ, chỗ ngồi đệm trắng viền xanh quanh mép hồ,
// chòi lá bên trái, tháp canh bên phải, hàng rào + cờ dây phía sau, hồ lớn, vách đá có thác nước và núi xa.
// Mọi thứ dựng bằng hình khối + texture vẽ bằng canvas, không có file ngoài.
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

export const POND = { rx: 9.6, rz: 7.6, deck: 0.45, floor: -1.9 };

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

function woodTexture(base = [196, 120, 70], repeat = [0.22, 0.22]) {
  return canvasTexture(
    512,
    512,
    (g, w, h) => {
      const rows = 8;
      const rh = h / rows;
      for (let r = 0; r < rows; r++) {
        let x = -range(0, 200);
        while (x < w) {
          const len = range(180, 340);
          const k = range(-18, 18);
          g.fillStyle = `rgb(${base[0] + k},${base[1] + k * 0.7},${base[2] + k * 0.5})`;
          g.fillRect(x, r * rh, len, rh);
          // vân gỗ
          g.strokeStyle = `rgba(110,60,30,${range(0.08, 0.18)})`;
          g.lineWidth = 2;
          for (let s = 0; s < 4; s++) {
            const y = r * rh + range(6, rh - 6);
            g.beginPath();
            g.moveTo(x, y);
            g.bezierCurveTo(x + len * 0.3, y + range(-5, 5), x + len * 0.6, y + range(-5, 5), x + len, y + range(-3, 3));
            g.stroke();
          }
          g.fillStyle = 'rgba(70,35,15,0.55)';
          g.fillRect(x, r * rh, 4, rh);
          g.fillStyle = 'rgba(60,40,30,0.6)';
          g.beginPath();
          g.arc(x + 12, r * rh + 12, 3, 0, 7);
          g.arc(x + 12, r * rh + rh - 12, 3, 0, 7);
          g.fill();
          x += len;
        }
        g.fillStyle = 'rgba(80,40,18,0.65)';
        g.fillRect(0, r * rh, w, 4);
        g.fillStyle = 'rgba(255,220,170,0.18)';
        g.fillRect(0, r * rh + 4, w, 3);
      }
    },
    { repeat },
  );
}

function thatchTexture() {
  return canvasTexture(
    256,
    256,
    (g, w, h) => {
      g.fillStyle = '#c99447';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const x = range(0, w);
        const y = range(0, h);
        g.strokeStyle = `rgba(${range(90, 140)},${range(55, 85)},${range(15, 35)},${range(0.25, 0.6)})`;
        g.lineWidth = range(1, 2.5);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + range(-3, 3), y + range(14, 30));
        g.stroke();
      }
      for (let r = 0; r < 4; r++) {
        g.fillStyle = 'rgba(90,55,20,0.35)';
        g.fillRect(0, (r * h) / 4, w, 5);
      }
    },
    { repeat: [3, 2] },
  );
}

function fishEmblem(bg, fg, rounded = false) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = bg;
    if (rounded) {
      g.beginPath();
      g.roundRect(0, 0, w, h, 26);
      g.fill();
    } else g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.beginPath();
    g.ellipse(118, 128, 70, 38, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(178, 128);
    g.lineTo(226, 88);
    g.lineTo(226, 168);
    g.closePath();
    g.fill();
    g.fillStyle = bg;
    g.beginPath();
    g.arc(82, 118, 9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = bg;
    g.lineWidth = 5;
    g.beginPath();
    g.arc(140, 128, 34, -1, 1);
    g.stroke();
  });
}

// ---------------------------------------------------------------- Shader nước

const waterVertex = /* glsl */ `
  varying vec2 vXZ;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vXZ = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// Gợn tròn do hạt mưa rơi: lưới ô, mỗi ô thỉnh thoảng nở một vòng (amount = mật độ mưa 0..1).
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

const pondFragment = /* glsl */ `
  uniform float uTime;
  uniform vec2 uR;
  uniform vec3 uTint;
  uniform float uRain;
  uniform float uNight;
  varying vec2 vXZ;
  #define TAU 6.28318530718
  ${rainRings}
  float caustic(vec2 uv, float time) {
    vec2 p = mod(uv * TAU, TAU) - 250.0;
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
  void main() {
    float d = length(vXZ / uR);
    vec3 deep = vec3(0.03, 0.42, 0.78);
    vec3 shallow = vec3(0.16, 0.80, 0.92);
    vec3 col = mix(deep, shallow, smoothstep(0.25, 1.0, d));
    float c1 = caustic(vXZ * 0.11, uTime * 0.45);
    float c2 = caustic(vXZ * 0.07 + 0.3, uTime * 0.3 + 3.0);
    col += vec3(0.75, 0.95, 1.0) * clamp(c1 * 0.55 + c2 * 0.35, 0.0, 0.9);
    // mép hồ sáng như bọt nước
    col = mix(col, vec3(0.75, 0.97, 1.0), smoothstep(0.93, 1.0, d) * 0.6);
    col *= uTint;
    // ban đêm: đèn chiếu dưới đáy hồ cho mặt nước phát sáng xanh ngọc
    col += vec3(0.04, 0.30, 0.42) * uNight * (1.0 - smoothstep(0.0, 1.0, d) * 0.55) * (0.8 + clamp(c1 * 0.5 + c2 * 0.3, 0.0, 0.6));
    // mưa: mặt nước xỉn hơn + gợn tròn
    col = mix(col, col * 0.82, uRain * 0.5);
    col += vec3(0.85, 0.93, 1.0) * rainRings(vXZ * 1.35, uTime, uRain * 0.95) * (0.25 + 0.55 * max(uTint.g, uNight * 0.6));
    float alpha = mix(0.86, 0.72, smoothstep(0.2, 1.0, d));
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

const lakeFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uTint;
  uniform vec3 uGlint;
  uniform float uRain;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying vec2 vXZ;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  ${rainRings}
  void main() {
    float dist = length(vXZ - cameraPosition.xz);
    vec3 col = mix(vec3(0.10, 0.62, 0.90), vec3(0.42, 0.80, 0.95), smoothstep(20.0, 160.0, dist)) * uTint;
    float n = noise(vXZ * vec2(0.35, 0.9) + vec2(uTime * 0.25, uTime * 0.1));
    float n2 = noise(vXZ * vec2(0.8, 1.6) - vec2(uTime * 0.2, 0.0));
    float glint = smoothstep(0.78, 0.95, n * 0.6 + n2 * 0.5) * (1.0 - uRain * 0.75);
    col += glint * 0.45 * uGlint;
    col += rainRings(vXZ * 0.9, uTime, uRain * 0.8) * uRain * 0.35 * uTint * (1.0 - smoothstep(30.0, 90.0, dist));
    float fogF = smoothstep(fogNear, fogFar, dist);
    col = mix(col, fogColor, fogF);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const fallFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uTint;
  varying vec2 vUv;
  float hash(float x) { return fract(sin(x * 91.3) * 47453.5); }
  void main() {
    float col = floor(vUv.x * 26.0);
    float speed = 1.4 + hash(col) * 0.8;
    float y = vUv.y + uTime * speed * 0.35 + hash(col + 3.0);
    float streak = smoothstep(0.35, 0.5, fract(y * 3.0)) * smoothstep(0.95, 0.6, fract(y * 3.0));
    vec3 c = mix(vec3(0.55, 0.85, 1.0), vec3(1.0), streak * 0.8 + (1.0 - vUv.y) * 0.25) * (0.25 + uTint * 0.75);
    float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
    gl_FragColor = vec4(c, (0.78 + streak * 0.2) * edge);
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------- Dựng cảnh

export function buildWorld(scene, { seats: seatCount = 16 } = {}) {
  const updaters = [];
  const uniforms = {
    uTime: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) }, // màu ánh sáng chung theo giờ/thời tiết
    uGlint: { value: new THREE.Color(1, 1, 1) }, // màu lấp lánh trên hồ lớn (nắng/trăng)
    uRain: { value: 0 },
    uNight: { value: 0 },
  };
  // Gió do weather.js đặt: dấu là hướng (+ thổi sang phải), độ lớn 0..~1.5
  const env = { wind: 0 };

  // Sương xa (màu trời, mây, mặt trời, mặt trăng do weather.js điều khiển)
  const skyColor = new THREE.Color('#bfe6ff');
  scene.fog = new THREE.Fog(skyColor, 70, 300);
  scene.background = skyColor.clone();

  // Núi xa
  for (let i = 0; i < 16; i++) {
    const h = range(24, 40); // thấp để lộ dải trời phía trên (mặt trời, mặt trăng, sao)
    const m = mesh(new THREE.ConeGeometry(h * range(1.2, 1.6), h, 6), mat(i % 3 ? '#5b8fc2' : '#6d9fcc', { flat: true }), {
      pos: [range(-260, 260), h / 2 - 4, range(-240, -190)],
      rot: [0, rnd() * 3, 0],
      cast: false,
      receive: false,
    });
    scene.add(m);
  }
  // Đồi xanh gần hơn
  for (let i = 0; i < 12; i++) {
    const r = range(14, 30);
    const side = i % 2 ? 1 : -1;
    const m = mesh(new THREE.SphereGeometry(r, 10, 8), mat(i % 3 ? '#3f9b4c' : '#58b057', { flat: true }), {
      pos: [side * range(40, 140), -r * 0.45, range(-150, -80)],
      scale: [1.4, 0.7, 1],
      cast: false,
      receive: false,
    });
    scene.add(m);
    for (let k = 0; k < 4; k++) scene.add(broadTree(m.position.x + range(-r, r), r * 0.25, m.position.z + range(-r * 0.4, r * 0.4), range(2.5, 4)));
  }

  // Hồ lớn phía sau
  const lakeMat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, fogColor: { value: skyColor.clone() }, fogNear: { value: 60 }, fogFar: { value: 300 } },
    vertexShader: waterVertex,
    fragmentShader: lakeFragment,
  });
  // Hồ lớn chỉ nằm sau sàn gỗ (z < -12) để không cắt ngang lòng hồ câu.
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(900, 600), lakeMat);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(0, -0.4, -14.5 - 300);
  scene.add(lake);
  // Bãi cỏ hai bên và phía trước sàn gỗ
  const grassTex = canvasTexture(
    128,
    128,
    (g, w, h) => {
      g.fillStyle = '#5cae4c';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) {
        g.fillStyle = `rgba(${range(40, 110)},${range(130, 190)},${range(40, 80)},0.6)`;
        g.fillRect(range(0, w), range(0, h), 2, range(3, 7));
      }
    },
    { repeat: [40, 40] },
  );
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 });
  for (const [x, z, w, d] of [[-171, 60, 300, 150], [171, 60, 300, 150], [0, 67, 42, 100]]) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, d), grassMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(x, 0.05, z);
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // Vách đá + thác nước (phía sau bên phải như ảnh mẫu)
  const cliff = new THREE.Group();
  cliff.position.set(10, -0.5, -80);
  const stone = mat('#9c8fae', { flat: true });
  const stoneDark = mat('#7d7192', { flat: true });
  const grass = mat('#4fa44a', { flat: true });
  [
    [-14, 9, 0, 16, 20, 14],
    [-1, 12, -4, 14, 26, 14],
    [12, 9, -2, 16, 19, 16],
    [24, 6, 2, 14, 13, 12],
    [-26, 5, 4, 12, 11, 12],
  ].forEach(([x, y, z, w, h, d], i) => {
    const rock = mesh(new THREE.DodecahedronGeometry(1, 0), i % 2 ? stone : stoneDark, { pos: [x, y, z], scale: [w / 1.6, h / 1.6, d / 1.6], rot: [0, i, 0], cast: false });
    cliff.add(rock);
    const cap = mesh(new THREE.DodecahedronGeometry(1, 0), grass, { pos: [x, y + h * 0.55, z], scale: [w / 1.5, h / 7, d / 1.5], rot: [0, i, 0], cast: false });
    cliff.add(cap);
    for (let k = 0; k < 3; k++) cliff.add(broadTree(x + range(-w / 3, w / 3), y + h * 0.6, z + range(-d / 4, d / 4), range(2.2, 3.4)));
  });
  const fallMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: fallFragment,
  });
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(9, 22, 1, 1), fallMat);
  fall.position.set(-1, 11.5, 8.2);
  cliff.add(fall);
  const foamMat = mat('#ffffff', { rough: 1, transparent: true, opacity: 0.85 });
  const foams = [];
  for (let i = 0; i < 9; i++) {
    const f = mesh(new THREE.SphereGeometry(1, 10, 8), foamMat, { pos: [-5 + i * 1.0, 0.6, 9.5 + range(-0.6, 0.6)], cast: false, receive: false });
    f.userData.phase = rnd() * 6;
    cliff.add(f);
    foams.push(f);
  }
  updaters.push((t) => {
    for (const f of foams) {
      const s = 1.2 + Math.sin(t * 3 + f.userData.phase) * 0.35;
      f.scale.set(s * 1.3, s * 0.7, s);
    }
  });
  bake(cliff);
  scene.add(cliff);

  // Đảo nhỏ bên trái
  const isle = mesh(new THREE.SphereGeometry(16, 10, 8), mat('#4aa04c', { flat: true }), { pos: [-48, -6, -78], scale: [1.6, 0.6, 1], cast: false });
  scene.add(isle);
  for (let k = 0; k < 7; k++) scene.add(k % 3 ? broadTree(-48 + range(-18, 18), 2, -78 + range(-8, 8), range(3, 4.5)) : palm(-48 + range(-18, 18), 2, -78 + range(-6, 6), range(5, 7)));

  // Đèn lồng và cửa sổ chòi sáng rực hơn khi trời tối (vật liệu riêng, không dùng chung bộ nhớ đệm mat()).
  const lanternGlow = new THREE.MeshStandardMaterial({ color: '#ffd36b', roughness: 0.85, emissive: '#ffbe3d', emissiveIntensity: 1.6 });
  const windowGlow = new THREE.MeshStandardMaterial({ color: '#a8d8f0', roughness: 0.85, emissive: '#ffd27a', emissiveIntensity: 0.25 });

  // ---------------------------------------------------------------- Sàn gỗ quanh hồ
  const wood = woodTexture([206, 128, 74], [0.2, 0.2]);
  const deckMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.9 });
  const shape = new THREE.Shape();
  const X0 = -21;
  const X1 = 21;
  const Z0 = -14.5; // sau
  const Z1 = 17; // trước (gần camera)
  shape.moveTo(X0, -Z1);
  shape.lineTo(X1, -Z1);
  shape.lineTo(X1, -Z0);
  shape.lineTo(X0, -Z0);
  shape.closePath();
  const hole = new THREE.Path();
  hole.absellipse(0, 0, POND.rx, POND.rz, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const deckGeo = new THREE.ExtrudeGeometry(shape, { depth: POND.deck + 0.6, bevelEnabled: false, curveSegments: 72 });
  deckGeo.rotateX(-Math.PI / 2);
  deckGeo.translate(0, -0.6, 0);
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.receiveShadow = true;
  scene.add(deck);

  // Chân cột sàn gỗ ở mép sau (nhô lên khỏi mặt hồ lớn)
  const pillarMat = mat('#8a5530');
  for (let x = X0 + 1; x <= X1 - 1; x += 3) scene.add(mesh(new THREE.BoxGeometry(0.5, 2, 0.5), pillarMat, { pos: [x, -0.8, Z0 + 0.1], cast: false }));

  // Viền gỗ quanh miệng hồ (khối đậm màu như ảnh)
  const rimMat = new THREE.MeshStandardMaterial({ map: woodTexture([170, 98, 55], [0.6, 0.6]), roughness: 0.9 });
  const rimShape = new THREE.Shape();
  rimShape.absellipse(0, 0, POND.rx + 0.55, POND.rz + 0.55, 0, Math.PI * 2, false);
  const rimHole = new THREE.Path();
  rimHole.absellipse(0, 0, POND.rx, POND.rz, 0, Math.PI * 2, true);
  rimShape.holes.push(rimHole);
  const rimGeo = new THREE.ExtrudeGeometry(rimShape, { depth: 0.2, bevelEnabled: false, curveSegments: 72 });
  rimGeo.rotateX(-Math.PI / 2);
  rimGeo.translate(0, POND.deck, 0);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.receiveShadow = true;
  rim.castShadow = true;
  scene.add(rim);
  const blockMat = mat('#c98d55');
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const b = mesh(new THREE.BoxGeometry(0.5, 0.42, 0.62), blockMat, {
      pos: [Math.cos(a) * (POND.rx + 0.28), POND.deck + 0.2, Math.sin(a) * (POND.rz + 0.28)],
      rot: [0, -a, 0],
    });
    scene.add(b);
  }

  // Thành hồ + đáy hồ
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, POND.deck - POND.floor, 72, 1, true), new THREE.MeshStandardMaterial({ color: '#3f8f9e', roughness: 1, side: THREE.BackSide }));
  wall.scale.set(POND.rx, 1, POND.rz);
  wall.position.y = (POND.deck + POND.floor) / 2;
  scene.add(wall);
  const floorTex = canvasTexture(
    256,
    256,
    (g, w, h) => {
      g.fillStyle = '#5fb8a8';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) {
        g.fillStyle = `rgba(${range(40, 120)},${range(120, 180)},${range(120, 170)},0.5)`;
        g.beginPath();
        g.arc(range(0, w), range(0, h), range(2, 10), 0, 7);
        g.fill();
      }
    },
    { repeat: [3, 3] },
  );
  const pondFloor = new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1 }));
  pondFloor.rotation.x = -Math.PI / 2;
  pondFloor.scale.set(POND.rx, POND.rz, 1);
  pondFloor.position.y = POND.floor;
  scene.add(pondFloor);
  // đá + rong dưới đáy
  const rockMats = [mat('#6f8f8a', { flat: true }), mat('#58767a', { flat: true }), mat('#8aa39a', { flat: true })];
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * 0.92;
    const s = range(0.3, 0.9);
    scene.add(mesh(new THREE.DodecahedronGeometry(s, 0), rockMats[i % 3], { pos: [Math.cos(a) * POND.rx * d, POND.floor + s * 0.3, Math.sin(a) * POND.rz * d], scale: [1, 0.6, 1], rot: [rnd(), rnd() * 3, 0], cast: false }));
  }
  const weedMat = mat('#2f9a57');
  const weeds = [];
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2;
    const d = range(0.55, 0.95);
    const h = range(0.6, 1.4);
    const w = mesh(new THREE.ConeGeometry(0.09, h, 4), weedMat, { pos: [Math.cos(a) * POND.rx * d, POND.floor + h / 2, Math.sin(a) * POND.rz * d], cast: false });
    w.userData.phase = rnd() * 6;
    w.userData.keep = true;
    weeds.push(w);
    scene.add(w);
  }
  updaters.push((t) => {
    for (const w of weeds) w.rotation.z = Math.sin(t * 1.3 + w.userData.phase) * 0.18;
  });

  // Mặt nước hồ câu
  const pondMat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uR: { value: new THREE.Vector2(POND.rx, POND.rz) } },
    transparent: true,
    depthWrite: false,
    vertexShader: waterVertex,
    fragmentShader: pondFragment,
  });
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 96), pondMat);
  water.rotation.x = -Math.PI / 2;
  water.scale.set(POND.rx, POND.rz, 1);
  water.renderOrder = 2;
  scene.add(water);

  // Lá súng + hoa sen
  const padMat = mat('#5cbf4a', { side: THREE.DoubleSide });
  const lotusMat = mat('#ff8fc4', { emissive: '#ff5fa8', emissiveIntensity: 0.15 });
  const pads = [];
  [
    [-5.9, 1.2], [-5.2, 2.2], [-4.6, 1.4], [5.6, -2.6], [4.9, -3.2], [5.9, -1.6], [-4.8, -3.4], [-3.9, -4.1], [2.4, 4.6], [3.3, 4.2], [-1.2, -5.1], [6.2, 1.8],
  ].forEach(([px, pz], i) => {
    const x = px * (POND.rx / 7.4);
    const z = pz * (POND.rz / 6);
    const r = range(0.35, 0.6);
    const pad = mesh(new THREE.CircleGeometry(r, 18, 0.35, Math.PI * 2 - 0.5), padMat, { pos: [x, 0.03, z], rot: [-Math.PI / 2, 0, rnd() * 6], cast: false });
    pad.userData.phase = rnd() * 6;
    pad.userData.keep = true;
    pads.push(pad);
    scene.add(pad);
    if (i % 3 === 0) {
      const lotus = new THREE.Group();
      for (let k = 0; k < 7; k++) {
        const petal = mesh(new THREE.SphereGeometry(0.13, 8, 6), lotusMat, { scale: [0.6, 1.4, 0.35], cast: false });
        petal.position.set(Math.cos((k / 7) * 6.28) * 0.09, 0.12, Math.sin((k / 7) * 6.28) * 0.09);
        petal.rotation.set(Math.sin((k / 7) * 6.28) * 0.6, 0, -Math.cos((k / 7) * 6.28) * 0.6);
        lotus.add(petal);
      }
      lotus.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), mat('#ffd84a'), { pos: [0, 0.14, 0], cast: false }));
      lotus.position.set(x, 0.03, z);
      pad.userData.lotus = lotus;
      scene.add(lotus);
    }
  });
  updaters.push((t) => {
    for (const p of pads) {
      const y = 0.03 + Math.sin(t * (1.2 + Math.abs(env.wind)) + p.userData.phase) * (0.02 + Math.abs(env.wind) * 0.02);
      p.position.y = y;
      if (p.userData.lotus) p.userData.lotus.position.y = y;
    }
  });

  // ---------------------------------------------------------------- Chỗ ngồi quanh hồ
  const seats = [];
  const cushionTop = mat('#f4f1ea', { rough: 0.7 });
  const cushionBand = mat('#2f5fbf', { rough: 0.6 });
  const platformMat = mat('#b8743f', { rough: 0.9 });
  const holderMat = mat('#6b4426');
  const goldMat = mat('#d9a53a', { rough: 0.4, metal: 0.4 });
  const bucketMat = mat('#b9824c');
  const rodMat = mat('#2b2b33', { rough: 0.4 });
  const rodGold = mat('#e0b54a', { rough: 0.35, metal: 0.5 });
  for (let i = 0; i < seatCount; i++) {
    // Bắt đầu từ chính giữa phía trước, đi vòng quanh hồ.
    const a = Math.PI / 2 + (i / seatCount) * Math.PI * 2;
    const ex = Math.cos(a);
    const ez = Math.sin(a);
    const pos = new THREE.Vector3(ex * (POND.rx + 1.25), POND.deck, ez * (POND.rz + 1.25));
    const inward = new THREE.Vector3(-pos.x, 0, -pos.z).normalize();
    const rotY = Math.atan2(inward.x, inward.z);
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = rotY;
    // bệ gỗ + đệm ngồi
    g.add(mesh(new THREE.CylinderGeometry(0.56, 0.6, 0.22, 20), platformMat, { pos: [0, 0.11, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.16, 20), cushionBand, { pos: [0, 0.3, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.37, 0.4, 0.1, 20), cushionTop, { pos: [0, 0.42, 0] }));
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
    const water = mesh(new THREE.CircleGeometry(0.23, 12), mat('#3fb6e0'), { pos: [0, 0.3, 0], rot: [-Math.PI / 2, 0, 0], cast: false });
    bucket.add(water);
    g.add(bucket);
    for (const part of [g, holder, spare, bucket]) bake(part);
    scene.add(g);
    const bobber = pos.clone().addScaledVector(inward, 3.4);
    bobber.y = 0;
    const side = new THREE.Vector3(inward.z, 0, -inward.x);
    seats.push({ index: i, group: g, pos, inward, side, rotY, bobber, spare, bucket, seatY: POND.deck + 0.47 });
  }

  // ---------------------------------------------------------------- Hàng rào + cờ dây phía sau
  const postMat = mat('#9a6034');
  const ropeMat = mat('#d8c08a', { rough: 1 });
  const fenceZ = Z0 + 0.6;
  const fencePosts = [];
  for (let x = -19.5; x <= 19.5; x += 2.6) {
    const p = mesh(new THREE.BoxGeometry(0.3, 1.3, 0.3), postMat, { pos: [x, POND.deck + 0.65, fenceZ] });
    scene.add(p);
    scene.add(mesh(new THREE.BoxGeometry(0.38, 0.12, 0.38), mat('#7d4a26'), { pos: [x, POND.deck + 1.33, fenceZ] }));
    fencePosts.push(new THREE.Vector3(x, POND.deck + 1.1, fenceZ));
  }
  for (let i = 0; i < fencePosts.length - 1; i++) {
    for (const dy of [0, -0.45]) {
      const a = fencePosts[i].clone().setY(fencePosts[i].y + dy);
      const b = fencePosts[i + 1].clone().setY(fencePosts[i + 1].y + dy);
      scene.add(rope(a, b, 0.18, 0.045, ropeMat));
    }
  }
  // Cột cao treo đèn lồng + cờ dây
  const poles = [-16.5, -5.5, 5.5, 16.5].map((x) => {
    const top = new THREE.Vector3(x, POND.deck + 5.2, fenceZ - 0.1);
    scene.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 5.2, 8), postMat, { pos: [x, POND.deck + 2.6, fenceZ - 0.1] }));
    scene.add(mesh(new THREE.ConeGeometry(0.28, 0.5, 4), mat('#7d4a26'), { pos: [x, top.y + 0.25, top.z], rot: [0, Math.PI / 4, 0] }));
    scene.add(lantern(x + 0.45, POND.deck + 4.1, fenceZ - 0.1));
    return top;
  });
  const flagColors = ['#ff5a5a', '#ffb02e', '#ffe14d', '#46c96b', '#3fa9ff', '#a66bff'];
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i].clone().setY(poles[i].y - 0.4);
    const b = poles[i + 1].clone().setY(poles[i + 1].y - 0.4);
    scene.add(rope(a, b, 1.1, 0.025, mat('#f5ead0')));
    const n = 9;
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(t * Math.PI) * 1.1;
      const flag = mesh(new THREE.ConeGeometry(0.28, 0.6, 3), mat(flagColors[(i * n + k) % flagColors.length], { side: THREE.DoubleSide }), { pos: [p.x, p.y - 0.32, p.z], rot: [Math.PI, 0, 0], scale: [1, 1, 0.15], cast: false });
      flag.userData.phase = rnd() * 6;
      flag.userData.keep = true;
      scene.add(flag);
      updaters.push((tt) => {
        const w = Math.abs(env.wind);
        flag.rotation.x = Math.PI + Math.sin(tt * (2.2 + w * 6) + flag.userData.phase) * (0.18 + w * 0.35) + w * 0.4;
      });
    }
  }

  // ---------------------------------------------------------------- Chòi lá bên trái
  const thatch = mat('#d29b4c');
  thatch.map = thatchTexture();
  thatch.needsUpdate = true;
  const hut = new THREE.Group();
  hut.position.set(-16.6, POND.deck, -9.4);
  hut.rotation.y = 0.5;
  const hutWood = new THREE.MeshStandardMaterial({ map: woodTexture([170, 104, 58], [0.5, 0.5]), roughness: 0.9 });
  hut.add(mesh(new THREE.BoxGeometry(5.2, 3, 4), hutWood, { pos: [0, 1.5, 0] }));
  // cửa sổ
  hut.add(mesh(new THREE.BoxGeometry(1.4, 1.1, 0.1), mat('#5b3a22'), { pos: [0.9, 1.8, 2.02] }));
  hut.add(mesh(new THREE.BoxGeometry(1.2, 0.9, 0.12), windowGlow, { pos: [0.9, 1.8, 2.04] }));
  hut.add(mesh(new THREE.BoxGeometry(1.0, 2.0, 0.1), mat('#6e4527'), { pos: [-1.2, 1.0, 2.02] }));
  const roof = mesh(new THREE.ConeGeometry(4.6, 2.6, 4, 1), thatch, { pos: [0, 4.3, 0], rot: [0, Math.PI / 4, 0], scale: [1.15, 1, 0.95] });
  hut.add(roof);
  hut.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), postMat, { pos: [2.4, 1.5, 2.4] }));
  hut.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), postMat, { pos: [-2.4, 1.5, 2.4] }));
  hut.add(lantern(2.35, 2.6, 2.6));
  hut.add(lantern(-2.35, 2.6, 2.6));
  // phao cứu sinh treo tường
  const ring = new THREE.Group();
  for (let k = 0; k < 8; k++) {
    ring.add(mesh(new THREE.TorusGeometry(0.55, 0.17, 8, 6, Math.PI / 4), mat(k % 2 ? '#ffffff' : '#e8473f'), { rot: [0, 0, (k * Math.PI) / 4] }));
  }
  ring.position.set(2.62, 1.6, 0.6);
  ring.rotation.y = Math.PI / 2;
  hut.add(ring);
  bake(hut);
  scene.add(hut);

  // Biển hiệu con cá
  const sign = new THREE.Group();
  sign.position.set(-11.8, POND.deck, -12.6);
  sign.rotation.y = 0.25;
  sign.add(mesh(new THREE.BoxGeometry(0.25, 3.2, 0.25), postMat, { pos: [-1.1, 1.6, 0] }));
  sign.add(mesh(new THREE.BoxGeometry(0.25, 3.2, 0.25), postMat, { pos: [1.1, 1.6, 0] }));
  sign.add(mesh(new THREE.BoxGeometry(2.9, 1.5, 0.18), mat('#b5733c'), { pos: [0, 2.6, 0] }));
  sign.add(mesh(new THREE.PlaneGeometry(2.5, 1.2), new THREE.MeshStandardMaterial({ map: fishEmblem('#c98447', '#f2c45a', true), roughness: 0.8 }), { pos: [0, 2.6, 0.1], cast: false }));
  bake(sign);
  scene.add(sign);

  // ---------------------------------------------------------------- Tháp canh bên phải
  const tower = new THREE.Group();
  tower.position.set(16.8, POND.deck, -10.2);
  tower.rotation.y = -0.45;
  const legMat = mat('#8f5a31');
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) tower.add(mesh(new THREE.BoxGeometry(0.32, 6.4, 0.32), legMat, { pos: [x, 3.2, z] }));
  for (const y of [1.6, 3.4]) {
    for (const [x, z, ry] of [[0, 1.3, 0], [0, -1.3, 0], [1.3, 0, Math.PI / 2], [-1.3, 0, Math.PI / 2]]) {
      tower.add(mesh(new THREE.BoxGeometry(2.9, 0.18, 0.18), legMat, { pos: [x, y, z], rot: [0, ry, 0.55] }));
    }
  }
  tower.add(mesh(new THREE.BoxGeometry(3.6, 0.3, 3.6), hutWood, { pos: [0, 5, 0] }));
  for (const [x, z, w, d] of [[0, 1.75, 3.6, 0.14], [0, -1.75, 3.6, 0.14], [1.75, 0, 0.14, 3.6], [-1.75, 0, 0.14, 3.6]]) tower.add(mesh(new THREE.BoxGeometry(w, 0.14, d), legMat, { pos: [x, 6.0, z] }));
  for (const [x, z] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) tower.add(mesh(new THREE.BoxGeometry(0.2, 2.4, 0.2), legMat, { pos: [x, 6.3, z] }));
  tower.add(mesh(new THREE.ConeGeometry(3.4, 2.2, 4), thatch, { pos: [0, 8.5, 0], rot: [0, Math.PI / 4, 0] }));
  // cờ có hình con cá
  const banner = mesh(new THREE.PlaneGeometry(1.6, 2.6), new THREE.MeshStandardMaterial({ map: fishEmblem('#3d6fd6', '#ffffff'), side: THREE.DoubleSide, roughness: 0.8 }), { pos: [-2.3, 6.4, 1.2], cast: false });
  tower.add(banner);
  tower.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.9), mat('#d6b06a'), { pos: [-2.3, 7.75, 1.2], rot: [0, 0, Math.PI / 2] }));
  updaters.push((t) => (banner.rotation.y = Math.sin(t * (1.4 + Math.abs(env.wind) * 5)) * (0.12 + Math.abs(env.wind) * 0.3) + env.wind * 0.3));
  tower.add(lantern(-1.9, 5.7, 1.9));
  // thùng gỗ + lưới
  tower.add(mesh(new THREE.BoxGeometry(1.1, 0.9, 1.1), mat('#b07a44'), { pos: [2.4, 0.45, 1.8] }));
  tower.add(mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), mat('#a06c3a'), { pos: [2.5, 1.25, 1.7], rot: [0, 0.4, 0] }));
  const net = mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 20), mat('#c9a66b'), { pos: [3.1, 0.9, 0.2], rot: [0, Math.PI / 2 + 0.3, 0] });
  tower.add(net);
  tower.add(mesh(new THREE.CircleGeometry(0.72, 20), mat('#e6d3a3', { transparent: true, opacity: 0.55, side: THREE.DoubleSide }), { pos: [3.1, 0.9, 0.2], rot: [0, Math.PI / 2 + 0.3, 0], cast: false }));
  bake(tower);
  scene.add(tower);

  // ---------------------------------------------------------------- Cây cối
  const trees = [
    palm(-19.8, POND.deck, -13.6, 7.5),
    palm(-20.2, POND.deck, -3, 6.2),
    palm(20, POND.deck, -14, 7),
    palm(20.2, POND.deck, 2, 6),
    palm(-20.4, POND.deck, 8, 6.4),
    palm(20.4, POND.deck, 12, 5.8),
    broadTree(-24, 0, -16, 4.5),
    broadTree(25, 0, -17, 5),
    broadTree(-25, 0, 3, 4),
    broadTree(25, 0, 7, 4.2),
  ];
  trees.forEach((t) => scene.add(t));
  updaters.push((t) => {
    const w = env.wind;
    const a = Math.abs(w);
    for (const tree of trees) {
      const crown = tree.userData.crown;
      if (crown) crown.rotation.z = -w * 0.14 + Math.sin(t * (0.8 + a * 3.2) + tree.position.x) * (0.04 + a * 0.07);
    }
  });
  // bụi lá
  const bushMats = [mat('#3e9c45', { flat: true }), mat('#58b84d', { flat: true }), mat('#2f8a3e', { flat: true })];
  [
    [-19.5, 15.5], [19.5, 16], [-20, 5], [20, 6], [-19, -12.5], [19.5, -13], [-20, 0], [20.2, -4], [-13.5, -13.8], [12, -13.8],
  ].forEach(([x, z], i) => {
    for (let k = 0; k < 4; k++) {
      const r = range(0.7, 1.3);
      scene.add(mesh(new THREE.IcosahedronGeometry(r, 0), bushMats[(i + k) % 3], { pos: [x + range(-1, 1), POND.deck + r * 0.6, z + range(-0.8, 0.8)] }));
    }
  });
  // lá to sát camera ở hai góc dưới (như ảnh mẫu)
  const frondMat = mat('#3fa547', { side: THREE.DoubleSide });
  for (const [x, z, ry] of [[-15, 16, 0.6], [15, 16.2, -0.6], [-18, 13.5, 1.2], [18, 13.8, -1.2]]) {
    const plant = new THREE.Group();
    plant.position.set(x, POND.deck, z);
    plant.rotation.y = ry;
    for (let k = 0; k < 6; k++) {
      const leaf = mesh(new THREE.SphereGeometry(1, 10, 6), frondMat, { scale: [0.55, 0.06, 1.9], cast: false });
      const a = (k / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.1, 0.9 + rnd() * 0.4, Math.sin(a) * 1.1);
      leaf.rotation.set(0.5, -a + Math.PI / 2, 0);
      leaf.rotation.order = 'YXZ';
      plant.add(leaf);
    }
    scene.add(plant);
  }

  // Đồ lặt vặt trên sàn gỗ phía trước: thùng gỗ, thùng phuy, cột đèn lồng, cuộn dây, hộp đồ nghề
  const crateMat = new THREE.MeshStandardMaterial({ map: woodTexture([182, 124, 70], [0.9, 0.9]), roughness: 0.9 });
  for (const [x, z, s, ry] of [[-15.4, 12.2, 1.1, 0.3], [-14.3, 13, 0.8, -0.2], [-15.2, 13.2, 0.7, 0.6]]) {
    scene.add(mesh(new THREE.BoxGeometry(s, s, s), crateMat, { pos: [x, POND.deck + s / 2 + (s < 0.75 ? 1.1 : 0), z], rot: [0, ry, 0] }));
  }
  const barrel = new THREE.Group();
  barrel.position.set(15, POND.deck, 12.4);
  barrel.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 14), mat('#a8703f'), { pos: [0, 0.6, 0], scale: [1, 1, 1] }));
  for (const y of [0.2, 1.0]) barrel.add(mesh(new THREE.TorusGeometry(0.52, 0.04, 5, 18), mat('#4b3a2e', { metal: 0.5, rough: 0.5 }), { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0] }));
  barrel.add(mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 14), mat('#7a4f2b'), { pos: [0, 1.21, 0] }));
  scene.add(barrel);
  const box = new THREE.Group();
  box.position.set(13.6, POND.deck, 13.6);
  box.rotation.y = -0.4;
  box.add(mesh(new THREE.BoxGeometry(0.9, 0.45, 0.55), mat('#2f6fd6'), { pos: [0, 0.23, 0] }));
  box.add(mesh(new THREE.BoxGeometry(0.5, 0.08, 0.1), mat('#ffd43b'), { pos: [0, 0.5, 0] }));
  scene.add(box);
  const coil = mesh(new THREE.TorusGeometry(0.4, 0.09, 6, 18), mat('#d8c08a', { rough: 1 }), { pos: [-12.8, POND.deck + 0.09, 14.2], rot: [Math.PI / 2, 0, 0] });
  scene.add(coil);
  scene.add(mesh(new THREE.TorusGeometry(0.28, 0.08, 6, 16), mat('#d8c08a', { rough: 1 }), { pos: [-12.8, POND.deck + 0.25, 14.2], rot: [Math.PI / 2, 0, 0] }));
  for (const x of [-17.2, 17.2]) {
    scene.add(mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), postMat, { pos: [x, POND.deck + 1.3, 8.5] }));
    scene.add(lantern(x, POND.deck + 2.85, 8.5));
  }

  // ---------------------------------------------------------------- Ánh sáng
  const hemi = new THREE.HemisphereLight('#dff1ff', '#b98d5d', 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
  sun.position.set(14, 26, 12);
  sun.target.position.set(0, 0, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  // Đèn vàng quanh sàn gỗ, chỉ sáng lên khi trời tối (luôn có trong cảnh để không phải biên dịch lại shader).
  const lamps = [[-12, 4.2, -12.4], [12, 4.2, -12.4], [-16, 3.6, 8.5], [16, 3.6, 8.5]].map(([x, y, z]) => {
    const l = new THREE.PointLight('#ffb560', 0, 24, 1.3);
    l.position.set(x, y, z);
    scene.add(l);
    return l;
  });

  // gộp mọi khối tĩnh nằm thẳng trong scene (cột, dây, đá, núi, viền hồ...)
  scene.traverse((o) => o.isGroup && o.children.some((c) => c.isMesh) && o !== scene && !o.userData.noBake && bake(o));
  bake(scene);

  return {
    seats,
    env,
    sky: {
      uniforms,
      lake: lakeMat.uniforms,
      hemi,
      sun,
      lamps,
      glow: [
        { mat: lanternGlow, day: 1.6, night: 3.2 },
        { mat: windowGlow, day: 0.25, night: 1.6 },
      ],
      wet: [deckMat, rimMat, hutWood, crateMat],
    },
    update(t, dt) {
      uniforms.uTime.value = t;
      for (const fn of updaters) fn(t, dt);
    },
  };

  // ---------------------------------------------------------------- Đồ vật dùng chung

  function rope(a, b, sag, r, material) {
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= sag;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, r, 5), material);
    m.castShadow = true;
    return m;
  }

  function lantern(x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.add(mesh(new THREE.BoxGeometry(0.34, 0.06, 0.34), mat('#4a2f1c'), { pos: [0, 0.24, 0] }));
    g.add(mesh(new THREE.BoxGeometry(0.28, 0.4, 0.28), lanternGlow, { cast: false }));
    g.add(mesh(new THREE.BoxGeometry(0.34, 0.06, 0.34), mat('#4a2f1c'), { pos: [0, -0.23, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3), mat('#333'), { pos: [0, 0.4, 0] }));
    return g;
  }
}

// Cây dừa: thân cong ghép từ nhiều khúc, tán lá rủ.
function palm(x, y, z, h) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const trunkMat = mat('#a7764a', { flat: true });
  const leafMat = mat('#3fae4a', { side: THREE.DoubleSide, flat: true });
  const leafDark = mat('#2f9441', { side: THREE.DoubleSide, flat: true });
  const lean = range(-0.25, 0.25);
  const segs = 7;
  let px = 0;
  let py = 0;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const seg = mesh(new THREE.CylinderGeometry(0.2 - t * 0.06, 0.24 - t * 0.06, h / segs + 0.05, 7), trunkMat);
    const nx = Math.sin(t * 1.2) * lean * h * 0.6;
    seg.position.set(nx, py + h / segs / 2, 0);
    seg.rotation.z = -lean * 0.6 * Math.cos(t * 1.2);
    g.add(seg);
    px = nx;
    py += h / segs;
  }
  const crown = new THREE.Group();
  crown.position.set(px, py, 0);
  for (let k = 0; k < 8; k++) {
    const leaf = mesh(new THREE.SphereGeometry(1, 8, 4), k % 2 ? leafMat : leafDark, { scale: [0.38, 0.05, 1.9] });
    const holder = new THREE.Group();
    holder.rotation.y = (k / 8) * Math.PI * 2 + rnd() * 0.3;
    leaf.position.set(0, -0.35, 1.5);
    leaf.rotation.x = 0.45;
    holder.add(leaf);
    crown.add(holder);
  }
  for (let k = 0; k < 3; k++) crown.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), mat('#6b4a2a'), { pos: [Math.cos(k * 2) * 0.2, -0.2, Math.sin(k * 2) * 0.2] }));
  g.add(crown);
  g.userData.crown = crown;
  return g;
}

function broadTree(x, y, z, s) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(mesh(new THREE.CylinderGeometry(0.18 * s * 0.4, 0.25 * s * 0.4, s * 0.8, 6), mat('#8a5a34', { flat: true }), { pos: [0, s * 0.4, 0] }));
  const greens = ['#3f9e45', '#4fb04b', '#2f8a3c'];
  for (let k = 0; k < 3; k++) {
    g.add(mesh(new THREE.IcosahedronGeometry(s * range(0.35, 0.5), 0), mat(greens[k], { flat: true }), { pos: [range(-0.3, 0.3) * s, s * (0.95 + k * 0.18), range(-0.3, 0.3) * s] }));
  }
  return g;
}
