// Bầu trời và thời tiết của hồ câu: ngày/đêm theo giờ server gửi xuống, chiều tà nắng vàng kéo dài, tối bật đèn tuýp dọc bờ.
// Mặt trời + mặt trăng đi qua dải trời phía trên màn hình, mây trôi theo gió, mưa, sấm chớp, gió giật (dừa, võng, mưa, lá bay theo).
// Mọi thông số chuyển dần (không giật cục) khi đổi giờ hoặc đổi thời tiết.
import * as THREE from 'three';

// Mục tiêu của từng kiểu thời tiết. cloud: độ phủ mây, dark: trời u ám, rain: mưa, wind: gió nền, gust: gió giật.
const KINDS = {
  clear: { cloud: 0.22, dark: 0, rain: 0, wind: 0.12, gust: 0.25, storm: 0 },
  cloudy: { cloud: 0.8, dark: 0.3, rain: 0, wind: 0.3, gust: 0.45, storm: 0 },
  windy: { cloud: 0.55, dark: 0.12, rain: 0, wind: 0.8, gust: 1, storm: 0 },
  rain: { cloud: 1, dark: 0.5, rain: 0.55, wind: 0.35, gust: 0.5, storm: 0 },
  storm: { cloud: 1, dark: 0.78, rain: 1, wind: 0.95, gust: 1, storm: 1 },
};

export const WEATHER_NEWS = {
  clear: '☀️ Trời nắng đẹp, cá đang đói!',
  cloudy: '⛅ Mây kéo đến, mát trời dễ câu',
  windy: '🌬️ Gió nổi lên rồi, giữ chặt cần nhé!',
  rain: '🌧️ Trời đổ mưa, cá nổi lên đớp mồi!',
  storm: '⛈️ Giông bão kéo tới!',
};

// Bảng màu theo giờ (0–24). top/hor: đỉnh và chân trời, hemi/ground: ánh sáng môi trường, tint: độ sáng nước, stars: độ sáng sao.
// Từ 14:30 trời đã ngả vàng để cảnh chiều tà ở lâu trên màn hình.
const PALETTE = [
  [0, { top: '#071028', hor: '#1a2850', hemi: '#6578b8', ground: '#2c2f40', hemiI: 0.62, tint: [0.5, 0.56, 0.72], stars: 1 }],
  [4.7, { top: '#071028', hor: '#1a2850', hemi: '#6578b8', ground: '#2c2f40', hemiI: 0.62, tint: [0.5, 0.56, 0.72], stars: 1 }],
  [5.6, { top: '#22305f', hor: '#d98b78', hemi: '#a39ccc', ground: '#4a3c3c', hemiI: 1, tint: [0.68, 0.64, 0.74], stars: 0.35 }],
  [6.6, { top: '#4f86c9', hor: '#ffbf8c', hemi: '#ffe0c4', ground: '#a07a5a', hemiI: 1.15, tint: [0.95, 0.87, 0.8], stars: 0 }],
  [8.5, { top: '#3a8fe0', hor: '#d3edff', hemi: '#eaf4ff', ground: '#b09468', hemiI: 1.35, tint: [1, 1, 0.97], stars: 0 }],
  [13.5, { top: '#3a8fe0', hor: '#d3edff', hemi: '#eaf4ff', ground: '#b09468', hemiI: 1.35, tint: [1, 1, 0.97], stars: 0 }],
  [15, { top: '#4f83c8', hor: '#ffdca6', hemi: '#ffeccf', ground: '#b58d62', hemiI: 1.3, tint: [1, 0.95, 0.84], stars: 0 }],
  [17, { top: '#4a6cae', hor: '#ffb86a', hemi: '#ffdcae', ground: '#b5805a', hemiI: 1.2, tint: [1, 0.86, 0.68], stars: 0 }],
  [18.2, { top: '#2f3b7c', hor: '#ff8850', hemi: '#eaa98c', ground: '#7a5048', hemiI: 1.05, tint: [0.9, 0.68, 0.6], stars: 0.1 }],
  [19.2, { top: '#141f49', hor: '#4d3f70', hemi: '#7686c0', ground: '#37324a', hemiI: 0.72, tint: [0.56, 0.54, 0.72], stars: 0.7 }],
  [20.2, { top: '#071028', hor: '#1a2850', hemi: '#6578b8', ground: '#2c2f40', hemiI: 0.62, tint: [0.5, 0.56, 0.72], stars: 1 }],
  [24, { top: '#071028', hor: '#1a2850', hemi: '#6578b8', ground: '#2c2f40', hemiI: 0.62, tint: [0.5, 0.56, 0.72], stars: 1 }],
].map(([h, k]) => [h, { ...k, top: new THREE.Color(k.top), hor: new THREE.Color(k.hor), hemi: new THREE.Color(k.hemi), ground: new THREE.Color(k.ground), tint: new THREE.Color(...k.tint) }]);

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// ---------------------------------------------------------------- Texture vẽ tay

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const sunTexture = () =>
  canvasTex(256, 256, (g) => {
    const glow = g.createRadialGradient(128, 128, 22, 128, 128, 128);
    glow.addColorStop(0, 'rgba(255,226,130,0.85)');
    glow.addColorStop(0.32, 'rgba(255,196,80,0.32)');
    glow.addColorStop(1, 'rgba(255,170,60,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 256, 256);
    const disc = g.createRadialGradient(122, 122, 4, 128, 128, 34);
    disc.addColorStop(0, '#fffbe6');
    disc.addColorStop(0.6, '#ffe89a');
    disc.addColorStop(1, '#ffc95a');
    g.fillStyle = disc;
    g.beginPath();
    g.arc(128, 128, 32, 0, Math.PI * 2);
    g.fill();
  });

const moonTexture = () =>
  canvasTex(256, 256, (g) => {
    const halo = g.createRadialGradient(128, 128, 30, 128, 128, 128);
    halo.addColorStop(0, 'rgba(200,215,255,0.5)');
    halo.addColorStop(0.4, 'rgba(170,190,255,0.14)');
    halo.addColorStop(1, 'rgba(150,170,255,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, 256, 256);
    const disc = g.createRadialGradient(118, 116, 4, 128, 128, 40);
    disc.addColorStop(0, '#fffdf2');
    disc.addColorStop(1, '#dfe2ea');
    g.fillStyle = disc;
    g.beginPath();
    g.arc(128, 128, 38, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(150,158,180,0.45)';
    for (const [x, y, r] of [[114, 114, 9], [142, 132, 7], [124, 146, 5], [140, 108, 4], [104, 136, 4], [150, 148, 3]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });

function cloudTexture(seed) {
  let a = seed * 9301 + 49297;
  const rnd = () => ((a = (a * 9301 + 49297) % 233280) / 233280);
  return canvasTex(256, 128, (g) => {
    for (let i = 0; i < 16; i++) {
      const x = 46 + rnd() * 164;
      const y = 52 + rnd() * 34 - Math.sin(((x - 46) / 164) * Math.PI) * 20;
      const r = 20 + rnd() * 22;
      const grad = g.createRadialGradient(x, y - r * 0.25, 2, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.65, 'rgba(236,240,246,0.95)');
      grad.addColorStop(1, 'rgba(220,226,236,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// ---------------------------------------------------------------- Shader

const skyVertex = /* glsl */ `
  varying vec3 vP;
  void main() {
    vP = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// Máy toàn cảnh nhìn dốc xuống nên dải trời lộ ra nằm dưới đường chân trời thật (d.y âm), sau rặng cây xa.
// Vì vậy dồn màu chân trời vào đoạn d.y từ -0,56 tới -0,28; lúc quay cận (d.y dương) có thêm dải sáng ở chân trời thật.
const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHor;
  uniform float uStars;
  uniform float uFlash;
  uniform float uTime;
  varying vec3 vP;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vP);
    vec3 col = mix(uHor, uTop, pow(smoothstep(-0.56, -0.26, d.y), 0.85));
    col = mix(col, uHor, smoothstep(0.2, -0.02, d.y) * smoothstep(-0.2, -0.02, d.y));
    vec2 uv = vec2(atan(d.x, -d.z), asin(d.y)) * 150.0;
    vec2 cell = floor(uv);
    float r = hash(cell);
    if (r > 0.9) {
      vec2 c = vec2(hash(cell + 3.1), hash(cell + 7.7)) * 0.6 + 0.2;
      float dist = length(fract(uv) - c);
      float tw = 0.6 + 0.4 * sin(uTime * (1.5 + r * 4.0) + r * 50.0);
      col += vec3(0.95, 0.97, 1.0) * smoothstep(0.16 + (r - 0.9) * 1.2, 0.0, dist) * tw * uStars;
    }
    col += vec3(0.75, 0.78, 1.0) * uFlash;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

// Hạt mưa: mỗi hạt là một vệt mảnh (2 tam giác) quay mặt về máy quay, rơi và quấn vòng trong một khối hộp
// đi theo máy quay, nên chỉ cần vài nghìn hạt là phủ kín khung hình.
const rainVertex = /* glsl */ `
  attribute vec3 aSeed;
  attribute vec2 aCorner;
  attribute float aRand;
  uniform float uTime;
  uniform vec3 uCenter;
  uniform vec3 uBox;
  uniform float uSpeed;
  uniform float uWind;
  uniform float uLen;
  uniform float uAmount;
  varying float vFade;
  void main() {
    if (aRand > uAmount) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vFade = 0.0;
      return;
    }
    float fall = uTime * uSpeed * (0.8 + aRand * 0.4);
    vec3 base = uCenter - uBox * 0.5;
    vec3 p = aSeed * uBox + vec3(uWind * fall, -fall, 0.0);
    p = base + mod(p - base, uBox);
    vec3 dir = normalize(vec3(uWind, -1.0, 0.0));
    vec3 view = normalize(p - cameraPosition);
    vec3 side = normalize(cross(dir, view));
    float len = uLen * (0.7 + aRand * 0.6);
    vec3 world = p + dir * len * aCorner.y + side * 0.022 * aCorner.x * (1.0 + length(p - cameraPosition) * 0.012);
    float y01 = (p.y - base.y) / uBox.y;
    vFade = smoothstep(0.0, 0.12, y01) * smoothstep(1.0, 0.85, y01) * (0.5 + 0.5 * aCorner.y) * smoothstep(3.0, 9.0, length(p - cameraPosition));
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;
const rainFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity * vFade);
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------- Dựng bầu trời

// overview: { pos, look, fov } của góc máy toàn cảnh, để đặt mặt trời, mặt trăng, mây đúng dải trời lộ ra trên màn hình.
export function createWeather(scene, world, overview, { width = 1080, height = 1920 } = {}) {
  const S = world.sky;
  const env = world.env;

  // --- vòm trời
  const skyU = {
    uTop: { value: new THREE.Color() },
    uHor: { value: new THREE.Color() },
    uStars: { value: 0 },
    uFlash: { value: 0 },
    uTime: { value: 0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(450, 48, 24),
    new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU, vertexShader: skyVertex, fragmentShader: skyFragment }),
  );
  dome.renderOrder = -10;
  scene.add(dome);

  // --- điểm trên màn hình của góc máy toàn cảnh → điểm trong cảnh ở rất xa
  const ref = new THREE.PerspectiveCamera(overview.fov, width / height, 0.1, 1200);
  ref.position.copy(overview.pos);
  ref.lookAt(overview.look);
  ref.updateMatrixWorld();
  const screenPoint = (sx, sy, out) => {
    out.set((sx / width) * 2 - 1, 1 - (sy / height) * 2, 0.5).unproject(ref).sub(ref.position).normalize();
    return out.multiplyScalar(400).add(ref.position);
  };
  // mặt trời mọc bên trái, lặn bên phải sau rặng cây, ngay trên mép bảng
  const arcPoint = (u, out) => {
    const k = Math.min(1, Math.max(0, u));
    return screenPoint(40 + u * (width - 80), 372 - Math.sin(k * Math.PI) * 308, out);
  };
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture(), fog: false, depthWrite: false, transparent: true }));
  sunSprite.scale.setScalar(118);
  sunSprite.renderOrder = -8;
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), fog: false, depthWrite: false, transparent: true }));
  moonSprite.scale.setScalar(62);
  moonSprite.renderOrder = -8;
  scene.add(sunSprite, moonSprite);

  // --- mây: nhiều đám, đám nào hiện tùy độ phủ mây. Một phần nằm trong dải trời của máy toàn cảnh, phần còn lại quanh chân trời thật cho lúc quay cận.
  const cloudTexes = [1, 2, 3, 4].map(cloudTexture);
  const clouds = [];
  const CLOUDS = 26;
  for (let i = 0; i < CLOUDS; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTexes[i % 4], fog: false, transparent: true, depthWrite: false, opacity: 0 });
    const s = new THREE.Sprite(m);
    const w = 60 + Math.random() * 70;
    s.scale.set(w, w * 0.45, 1);
    s.renderOrder = -6;
    s.userData = { threshold: (i / CLOUDS) * 0.95, speed: 0.6 + Math.random() * 0.8, shade: Math.random(), band: i % 2 === 0, sx: Math.random() * 1600 - 260, sy: 20 + Math.random() * 300, a: Math.random() * Math.PI * 2, el: 18 + Math.random() * 34 };
    scene.add(s);
    clouds.push(s);
  }

  // --- mưa
  const DROPS = 7000;
  const seeds = new Float32Array(DROPS * 4 * 3);
  const corners = new Float32Array(DROPS * 4 * 2);
  const rands = new Float32Array(DROPS * 4);
  const index = new Uint32Array(DROPS * 6);
  const quad = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
  for (let i = 0; i < DROPS; i++) {
    const sx = Math.random();
    const sy = Math.random();
    const sz = Math.random();
    const r = Math.random();
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      seeds.set([sx, sy, sz], v * 3);
      corners.set(quad[k], v * 2);
      rands[v] = r;
    }
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DROPS * 4 * 3), 3));
  rainGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  rainGeo.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
  rainGeo.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));
  rainGeo.setIndex(new THREE.BufferAttribute(index, 1));
  const rainU = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(56, 40, 56) },
    uSpeed: { value: 24 },
    uWind: { value: 0 },
    uLen: { value: 1.1 },
    uAmount: { value: 0 },
    uColor: { value: new THREE.Color('#d6e6ff') },
    uOpacity: { value: 0.4 },
  };
  const rain = new THREE.Mesh(rainGeo, new THREE.ShaderMaterial({ uniforms: rainU, vertexShader: rainVertex, fragmentShader: rainFragment, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  rain.frustumCulled = false;
  rain.renderOrder = 5;
  rain.visible = false;
  scene.add(rain);

  // --- tia chớp: dải gấp khúc trong dải trời, vẽ lại mỗi lần đánh
  const boltMat = new THREE.MeshBasicMaterial({ color: '#efeaff', transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const bolt = new THREE.Mesh(new THREE.BufferGeometry(), boltMat);
  bolt.visible = false;
  bolt.renderOrder = -5;
  scene.add(bolt);
  function makeBolt() {
    const pos = [];
    const branch = (sx, sy, len, w, depth) => {
      let px = sx;
      let py = sy;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      while (len > 0) {
        const step = 24 + Math.random() * 34;
        const nx = px + (Math.random() - 0.5) * 46;
        const ny = py + step;
        screenPoint(px, py, a);
        screenPoint(nx, ny, b);
        pos.push(a.x - w, a.y, a.z, a.x + w, a.y, a.z, b.x + w, b.y, b.z, a.x - w, a.y, a.z, b.x + w, b.y, b.z, b.x - w, b.y, b.z);
        if (depth < 2 && Math.random() < 0.18) branch(nx, ny, len * 0.4, w * 0.55, depth + 1);
        px = nx;
        py = ny;
        len -= step;
      }
    };
    branch(90 + Math.random() * 900, -10, 400, 0.6, 0);
    bolt.geometry.dispose();
    bolt.geometry = new THREE.BufferGeometry();
    bolt.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  }

  // --- lá bay khi gió to
  const LEAVES = 50;
  const leafGeo = new THREE.PlaneGeometry(0.3, 0.12);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), LEAVES);
  leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  leaves.frustumCulled = false;
  leaves.count = 0;
  const leafCols = ['#6d9c45', '#8bb353', '#c0ca33', '#c9a24a', '#8d6e3f'].map((c) => new THREE.Color(c));
  for (let i = 0; i < LEAVES; i++) leaves.setColorAt(i, leafCols[i % leafCols.length]);
  scene.add(leaves);
  const flying = [];
  const dummy = new THREE.Object3D();

  // ---------------------------------------------------------------- Trạng thái
  const now = { cloud: 0.2, dark: 0, rain: 0, wind: 0.1, gust: 0.2, storm: 0, wet: 0 };
  const sky = { weather: 'clear', hour: 16.5, msPerHour: 60000, at: performance.now() };
  let windDir = Math.random() < 0.5 ? 1 : -1;
  let windTarget = windDir;
  let windSigned = 0;
  let gust = 0;
  let gustTarget = 0;
  let nextGust = 2;
  let flash = 0;
  let nextStrike = 6;
  let pendingStrike = 0;
  let first = true;
  const pal = { top: new THREE.Color(), hor: new THREE.Color(), hemi: new THREE.Color(), ground: new THREE.Color(), tint: new THREE.Color(), hemiI: 1, stars: 0 };
  const grayDay = new THREE.Color('#7d8796');
  const grayNight = new THREE.Color('#151a28');
  const gray = new THREE.Color();
  const tmp = new THREE.Color();
  const white = new THREE.Color(1, 1, 1);
  const sunWarm = new THREE.Color('#ff9d52');
  const sunGold = new THREE.Color('#ffc97e');
  const sunNoon = new THREE.Color('#fff3dc');
  const moonCol = new THREE.Color('#a9bfff');
  const v = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const api = { onThunder: null, onNews: null, state: now, hour: () => currentHour(), weather: () => sky.weather, night: 0, lamps: 0 };

  function currentHour() {
    const h = sky.hour + (sky.msPerHour > 0 ? (performance.now() - sky.at) / sky.msPerHour : 0);
    return ((h % 24) + 24) % 24;
  }

  function samplePalette(h) {
    let i = 0;
    while (i < PALETTE.length - 2 && PALETTE[i + 1][0] <= h) i++;
    const [h0, a] = PALETTE[i];
    const [h1, b] = PALETTE[i + 1];
    const k = smooth(0, 1, (h - h0) / (h1 - h0));
    pal.top.copy(a.top).lerp(b.top, k);
    pal.hor.copy(a.hor).lerp(b.hor, k);
    pal.hemi.copy(a.hemi).lerp(b.hemi, k);
    pal.ground.copy(a.ground).lerp(b.ground, k);
    pal.tint.copy(a.tint).lerp(b.tint, k);
    pal.hemiI = a.hemiI + (b.hemiI - a.hemiI) * k;
    pal.stars = a.stars + (b.stars - a.stars) * k;
  }

  // Thông báo lúc bình minh / chiều tà / chập tối.
  let lastHour = null;
  function phaseNews(h) {
    if (lastHour !== null && api.onNews) {
      const step = (h - lastHour + 24) % 24;
      const crossed = (mark) => {
        const m = (mark - lastHour + 24) % 24;
        return step < 1 && m > 0 && m <= step;
      };
      if (crossed(5.8)) api.onNews('🌅 Sáng sớm rồi, câu sớm cá to!');
      if (crossed(15.2)) api.onNews('🌇 Chiều tà nắng vàng, ra hồ làm vài cần!');
      if (crossed(18.4)) api.onNews('💡 Trời tối rồi, đèn tuýp dọc bờ đã bật!');
    }
    lastHour = h;
  }

  api.set = (msg, changed = false) => {
    sky.weather = KINDS[msg.weather] ? msg.weather : 'clear';
    sky.hour = msg.hour;
    sky.msPerHour = msg.msPerHour;
    sky.at = performance.now();
    if (changed) {
      if (Math.random() < 0.45) windTarget = -windTarget;
      api.onNews?.(WEATHER_NEWS[sky.weather]);
    }
    if (first) {
      Object.assign(now, KINDS[sky.weather]);
      now.wet = now.rain;
      first = false;
    }
    lastHour = null;
  };

  // Một tia sét: chớp sáng 2 lần, tiếng sấm tới sau một chút.
  api.strike = () => {
    flash = 1;
    pendingStrike = 0.12 + Math.random() * 0.1;
    makeBolt();
    api.onThunder?.(0.6 + Math.random() * 0.5, 0.25 + Math.random() * 1.2);
  };

  api.update = (t, dt, camera) => {
    const target = KINDS[sky.weather];
    // mây kéo đến trước, mưa rơi sau; tạnh thì mưa ngớt trước rồi mây mới tan
    now.cloud = approach(now.cloud, target.cloud, target.cloud > now.cloud ? 0.18 : 0.08, dt);
    now.dark = approach(now.dark, target.dark, 0.14, dt);
    const rainReady = target.rain > now.rain ? smooth(0.6, 0.9, now.cloud) : 1;
    now.rain = approach(now.rain, target.rain * rainReady, target.rain > now.rain ? 0.12 : 0.2, dt);
    now.wind = approach(now.wind, target.wind, 0.2, dt);
    now.gust = approach(now.gust, target.gust, 0.3, dt);
    now.storm = approach(now.storm, target.storm, 0.2, dt);
    now.wet = approach(now.wet, now.rain, now.rain > now.wet ? 0.25 : 0.03, dt);

    // gió: nền dao động chậm + những cơn giật bất chợt, hướng cũng đổi bất chợt
    nextGust -= dt;
    if (nextGust <= 0) {
      gustTarget = now.gust * (0.4 + Math.random() * 0.9);
      nextGust = 1.5 + Math.random() * (7 - now.gust * 4);
      if (Math.random() < 0.08 * now.gust) windTarget = -windTarget;
    }
    gust = approach(gust, gustTarget, gustTarget > gust ? 2.2 : 0.7, dt);
    gustTarget = approach(gustTarget, 0, 0.5, dt);
    windDir = approach(windDir, windTarget, 0.35, dt);
    const base = now.wind * (0.75 + 0.25 * Math.sin(t * 0.37) * Math.sin(t * 0.13 + 1));
    windSigned = windDir * (base + gust);
    env.wind = windSigned;
    const windAbs = Math.abs(windSigned);

    // giờ trong ngày
    const h = currentHour();
    phaseNews(h);
    samplePalette(h);
    const sunE = Math.sin((Math.PI * (h - 6)) / 12); // >0: ban ngày
    const night = 1 - smooth(-0.12, 0.18, sunE);
    api.night = night;
    const dark = now.dark;
    gray.copy(grayDay).lerp(grayNight, night);

    // sấm chớp
    if (now.storm > 0.5 && (nextStrike -= dt) <= 0) {
      nextStrike = 3 + Math.random() * 10;
      api.strike();
    }
    if (pendingStrike > 0 && (pendingStrike -= dt) <= 0) flash = Math.max(flash, 0.8);
    flash = Math.max(0, flash - dt * 4.5);
    const flick = flash > 0.05 ? flash * (0.7 + Math.random() * 0.3) : 0;
    bolt.visible = flick > 0.05;
    boltMat.opacity = Math.min(1, flick * 1.4);

    // màu trời + sương xa
    skyU.uTop.value.copy(pal.top).lerp(gray, dark * 0.8);
    skyU.uHor.value.copy(pal.hor).lerp(gray, dark * 0.75);
    skyU.uStars.value = pal.stars * (1 - smooth(0.35, 0.8, now.cloud));
    skyU.uFlash.value = flick * 0.6;
    skyU.uTime.value = t;
    tmp.copy(skyU.uHor.value).lerp(gray, now.rain * 0.5).multiplyScalar(1 - now.storm * 0.25);
    tmp.r += flick * 0.25;
    tmp.g += flick * 0.25;
    tmp.b += flick * 0.3;
    scene.fog.color.copy(tmp);
    scene.background.copy(tmp);
    scene.fog.near = 58 - now.rain * 22;
    scene.fog.far = 128 - now.rain * 50;

    // ánh sáng môi trường
    S.hemi.color.copy(pal.hemi).lerp(gray, dark * 0.5);
    S.hemi.groundColor.copy(pal.ground);
    S.hemi.intensity = pal.hemiI * (1 - dark * 0.36) + flick * 1.6;

    // nắng ban ngày / trăng ban đêm (cùng một đèn chiếu, đổi hướng lúc nó tắt hẳn ở chân trời)
    const day = sunE >= 0;
    const nightHour = (((h - 18) % 24) + 24) % 24;
    const theta = day ? (Math.PI * (h - 6)) / 12 : (Math.PI * nightHour) / 12;
    const elev = Math.sin(theta);
    v.set(-Math.cos(theta) * 0.85, 0.38 + elev, 0.55).normalize();
    S.sun.position.copy(S.sun.target.position).addScaledVector(v, 50);
    if (day) {
      S.sun.color.copy(sunWarm).lerp(sunGold, smooth(0.02, 0.45, elev)).lerp(sunNoon, smooth(0.5, 0.92, elev));
      S.sun.intensity = 2.5 * smooth(-0.02, 0.2, elev) * (1 - dark * 0.82);
    } else {
      S.sun.color.copy(moonCol);
      S.sun.intensity = 0.42 * smooth(-0.02, 0.25, elev) * (1 - dark * 0.7);
    }

    // đèn tuýp bật khi chập tối hoặc khi trời tối sầm vì giông
    const lampOn = Math.max(night, smooth(0.35, 0.8, dark) * 0.7);
    api.lamps = lampOn;
    S.tubes.emissiveIntensity = 0.08 + lampOn * 3.2;
    S.bulbs.emissiveIntensity = 0.1 + lampOn * 3;
    S.pools.opacity = lampOn * 0.34;
    for (const l of S.lampLights) l.intensity = l.userData.power * lampOn * (0.97 + 0.03 * Math.sin(t * 13 + l.position.x));

    // nước
    const U = S.uniforms;
    U.uTint.value.copy(pal.tint).lerp(gray, dark * 0.25).multiplyScalar(1 - dark * 0.4 + flick * 0.4);
    U.uRain.value = now.rain;
    U.uNight.value = night;
    U.uLamp.value = lampOn;
    U.uWind.value = Math.min(1.5, windAbs);
    U.uTop.value.copy(skyU.uTop.value);
    U.uHor.value.copy(skyU.uHor.value);
    U.uSunDir.value.copy(v);
    if (day) U.uGlint.value.copy(S.sun.color).multiplyScalar(0.3 + 0.7 * (1 - dark));
    else U.uGlint.value.copy(moonCol).multiplyScalar(0.55 * (1 - dark));

    // mặt trời, mặt trăng
    arcPoint((h - 6) / 12, sunSprite.position);
    sunSprite.material.color.copy(S.sun.color).lerp(sunNoon, 0.4);
    sunSprite.material.opacity = smooth(-0.04, 0.08, sunE) * (1 - smooth(0.45, 0.95, now.cloud) * 0.92) * (1 - dark * 0.6);
    sunSprite.visible = sunSprite.material.opacity > 0.01;
    arcPoint(nightHour / 12, moonSprite.position);
    moonSprite.material.opacity = smooth(-0.04, 0.08, -sunE) * (1 - smooth(0.5, 0.95, now.cloud) * 0.85);
    moonSprite.visible = moonSprite.material.opacity > 0.01;

    // mây
    tmp.copy(pal.hor).lerp(white, 0.5 * (1 - night)).lerp(pal.hemi, night * 0.4);
    for (const c of clouds) {
      const u = c.userData;
      const drift = windDir * u.speed * (0.4 + now.wind * 3 + gust * 4) * dt;
      if (u.band) {
        u.sx += drift * 2.2;
        if (u.sx > 1340) u.sx = -260;
        if (u.sx < -260) u.sx = 1340;
        screenPoint(u.sx, u.sy, c.position);
      } else {
        u.a += drift * 0.004;
        c.position.set(Math.cos(u.a) * 330, u.el, Math.sin(u.a) * 330);
      }
      const shown = smooth(u.threshold - 0.08, u.threshold + 0.06, now.cloud);
      c.material.opacity = shown * (0.78 + 0.22 * (1 - u.shade));
      c.visible = c.material.opacity > 0.01;
      const shade = dark * (0.55 + u.shade * 0.35);
      c.material.color.copy(tmp).lerp(gray, shade).multiplyScalar(night * 0.25 + (1 - night) * 1 + flick * 0.8);
    }

    // mưa đi theo máy quay
    rain.visible = now.rain > 0.01;
    if (rain.visible) {
      camera.getWorldDirection(fwd);
      rainU.uCenter.value.copy(camera.position).addScaledVector(fwd, 22);
      rainU.uTime.value = t;
      rainU.uAmount.value = now.rain;
      rainU.uWind.value = windSigned * 0.45;
      rainU.uOpacity.value = 0.22 + now.rain * 0.22;
      rainU.uColor.value.copy(pal.tint).lerp(white, 0.35).multiplyScalar(0.85 + flick);
    }

    // lá bay
    const spawnRate = Math.max(0, windAbs - 0.45) * 14;
    if (Math.random() < spawnRate * dt && flying.length < LEAVES) {
      const dir = Math.sign(windSigned) || 1;
      flying.push({
        p: new THREE.Vector3(-dir * 18, 1 + Math.random() * 6, -13 + Math.random() * 26),
        spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
        bob: Math.random() * 6,
        speed: 0.7 + Math.random() * 0.6,
        color: Math.floor(Math.random() * LEAVES),
      });
    }
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      f.p.x += windSigned * 9 * f.speed * dt;
      f.p.y += Math.sin(t * 3 + f.bob) * 1.2 * dt - 0.25 * dt;
      f.p.z += Math.cos(t * 2 + f.bob) * 0.8 * dt;
      f.r.x += f.spin.x * dt;
      f.r.y += f.spin.y * dt;
      f.r.z += f.spin.z * dt;
      if (Math.abs(f.p.x) > 20 || f.p.y < 0.4) flying.splice(i, 1);
    }
    leaves.count = flying.length;
    for (let i = 0; i < flying.length; i++) {
      const f = flying[i];
      dummy.position.copy(f.p);
      dummy.rotation.copy(f.r);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
      leaves.setColorAt(i, leafCols[f.color % leafCols.length]);
    }
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  };

  return api;
}

// Biểu tượng nhỏ cho góc màn hình.
export function weatherIcon(weather, night) {
  if (weather === 'storm') return '⛈️';
  if (weather === 'rain') return '🌧️';
  if (weather === 'windy') return '💨';
  if (weather === 'cloudy') return night ? '☁️' : '⛅';
  return night ? '🌙' : '☀️';
}
