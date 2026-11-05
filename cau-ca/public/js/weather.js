// Giờ và thời tiết nhìn từ trong hang: không thấy trời, nhưng ngoài kia đổi thì trong hang cũng đổi theo.
// Ngày: nước xanh ngọc. Đêm: nước tím, nấm và pha lê sáng hơn. Nhiều mây: sương tràn vào hang.
// Gió: gió lùa qua khe đá, cuốn bào tử nấm. Mưa: nước rỉ từ nhũ đá. Giông bão: rỉ nặng hạt, chớp loé qua khe trần, sấm dội.
// Mọi thông số chuyển dần (không giật cục) khi đổi giờ hoặc đổi thời tiết.
import * as THREE from 'three';
import { haloTexture } from './world.js';

// Mục tiêu của từng kiểu thời tiết. mist: sương, dark: trong hang tối đi, rain: nước rỉ, wind: gió nền, gust: gió giật.
const KINDS = {
  clear: { mist: 0, dark: 0, rain: 0, wind: 0.12, gust: 0.25, storm: 0 },
  cloudy: { mist: 1, dark: 0.15, rain: 0, wind: 0.3, gust: 0.45, storm: 0 },
  windy: { mist: 0.25, dark: 0.05, rain: 0, wind: 0.8, gust: 1, storm: 0 },
  rain: { mist: 0.35, dark: 0.2, rain: 0.55, wind: 0.35, gust: 0.5, storm: 0 },
  storm: { mist: 0.45, dark: 0.45, rain: 1, wind: 0.95, gust: 1, storm: 1 },
};

export const WEATHER_NEWS = {
  clear: '✨ Hang yên ắng, nước hồ trong vắt',
  cloudy: '🌫️ Sương mù đang tràn vào hang',
  windy: '🌬️ Gió lùa qua khe đá, giữ chặt cần nhé!',
  rain: '💧 Nước rỉ xuống từ nhũ đá',
  storm: '⛈️ Giông bão ngoài kia, cả hang rung chuyển!',
};

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// ---------------------------------------------------------------- Shader

// Giọt nước rỉ: mỗi giọt là một vệt mảnh (2 tam giác) quay mặt về máy quay, rơi và quấn vòng trong một khối hộp đi theo máy quay.
const dripVertex = /* glsl */ `
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
const dripFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity * vFade);
    #include <colorspace_fragment>
  }
`;

// Bào tử nấm lơ lửng: bay lên chậm, gió thổi đi ngang, quấn vòng trong lòng hang.
const sporeVertex = /* glsl */ `
  attribute vec3 aSeed;
  attribute float aRand;
  uniform float uTime;
  uniform float uWindX;
  varying float vRand;
  const vec3 BOX = vec3(29.0, 13.0, 25.0);
  void main() {
    vRand = aRand;
    vec3 p = aSeed * BOX;
    p.x += uWindX * (0.6 + aRand) + sin(uTime * 0.4 + aRand * 40.0) * 0.5;
    p.y += uTime * (0.1 + aRand * 0.2);
    p.z += cos(uTime * 0.3 + aRand * 25.0) * 0.5;
    p = mod(p, BOX) - vec3(BOX.x * 0.5, 0.0, BOX.z * 0.5);
    p.y += 0.2;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_PointSize = (5.0 + aRand * 9.0) * 40.0 / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const sporeFragment = /* glsl */ `
  uniform vec3 uColorA;
  uniform float uTime;
  varying float vRand;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    float blink = 0.55 + 0.45 * sin(uTime * (0.8 + vRand * 1.6) + vRand * 30.0);
    vec3 c = mix(uColorA, vec3(1.0, 0.72, 0.9), step(0.8, vRand));
    gl_FragColor = vec4(c, a * a * blink * 0.6);
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------- Dựng hiệu ứng

export function createWeather(scene, world) {
  const S = world.sky;
  const env = world.env;

  // --- giọt nước rỉ
  const DROPS = 1800;
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
  const dripGeo = new THREE.BufferGeometry();
  dripGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DROPS * 4 * 3), 3));
  dripGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  dripGeo.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
  dripGeo.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));
  dripGeo.setIndex(new THREE.BufferAttribute(index, 1));
  const dripU = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(56, 40, 56) },
    uSpeed: { value: 18 },
    uWind: { value: 0 },
    uLen: { value: 0.8 },
    uAmount: { value: 0 },
    uColor: { value: new THREE.Color('#bfe9f2') },
    uOpacity: { value: 0.4 },
  };
  const drips = new THREE.Mesh(dripGeo, new THREE.ShaderMaterial({ uniforms: dripU, vertexShader: dripVertex, fragmentShader: dripFragment, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  drips.frustumCulled = false;
  drips.renderOrder = 5;
  drips.visible = false;
  scene.add(drips);

  // --- bào tử nấm
  const SPORES = 170;
  const sporeSeeds = new Float32Array(SPORES * 3);
  const sporeRands = new Float32Array(SPORES);
  for (let i = 0; i < SPORES; i++) {
    sporeSeeds.set([Math.random(), Math.random(), Math.random()], i * 3);
    sporeRands[i] = Math.random();
  }
  const sporeGeo = new THREE.BufferGeometry();
  sporeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPORES * 3), 3));
  sporeGeo.setAttribute('aSeed', new THREE.BufferAttribute(sporeSeeds, 3));
  sporeGeo.setAttribute('aRand', new THREE.BufferAttribute(sporeRands, 1));
  const sporeU = { uTime: { value: 0 }, uWindX: { value: 0 }, uColorA: { value: new THREE.Color('#7ff5da') } };
  const spores = new THREE.Points(sporeGeo, new THREE.ShaderMaterial({ uniforms: sporeU, vertexShader: sporeVertex, fragmentShader: sporeFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  spores.frustumCulled = false;
  spores.renderOrder = 4;
  scene.add(spores);

  // --- sương trên mặt hồ
  const mists = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, opacity: 0, depthWrite: false, fog: false });
    const s = new THREE.Sprite(m);
    s.scale.set(11 + Math.random() * 7, 5 + Math.random() * 3, 1);
    s.position.set(-14 + Math.random() * 28, 1 + Math.random() * 2.2, -8 + Math.random() * 16);
    s.renderOrder = 4;
    s.userData = { speed: 0.3 + Math.random() * 0.5 };
    s.visible = false;
    scene.add(s);
    mists.push(s);
  }

  // ---------------------------------------------------------------- Trạng thái
  const now = { mist: 0, dark: 0, rain: 0, wind: 0.1, gust: 0.2, storm: 0, wet: 0 };
  const sky = { weather: 'clear', hour: 12, msPerHour: 60000, at: performance.now() };
  let windDir = Math.random() < 0.5 ? 1 : -1;
  let windTarget = windDir;
  let windSigned = 0;
  let windPhase = 0;
  let gust = 0;
  let gustTarget = 0;
  let nextGust = 2;
  let flash = 0;
  let nextStrike = 6;
  let pendingStrike = 0;
  let first = true;
  const teal = new THREE.Color('#38e0c0');
  const violet = new THREE.Color('#9a6bff');
  const hemiDay = new THREE.Color('#8d9cb8');
  const hemiNight = new THREE.Color('#6a5ca8');
  const groundDay = new THREE.Color('#49b8a4');
  const groundNight = new THREE.Color('#8f6fe0');
  const shaftDay = new THREE.Color('#cfe6ff');
  const shaftNight = new THREE.Color('#7f8fe0');
  const fogBase = new THREE.Color('#05080b');
  const fogNight = new THREE.Color('#090616');
  const mistDay = new THREE.Color('#a8f0e0');
  const mistNight = new THREE.Color('#bda6ff');
  const fwd = new THREE.Vector3();
  const wetBase = S.wet.map((m) => ({ m, color: m.color.clone(), rough: m.roughness }));
  const api = { onThunder: null, onNews: null, state: now, hour: () => currentHour(), weather: () => sky.weather, night: 0 };

  function currentHour() {
    const h = sky.hour + (sky.msPerHour > 0 ? (performance.now() - sky.at) / sky.msPerHour : 0);
    return ((h % 24) + 24) % 24;
  }

  // Thông báo lúc bình minh / chập tối.
  let lastHour = null;
  function phaseNews(h) {
    if (lastHour !== null && api.onNews) {
      const step = (h - lastHour + 24) % 24;
      const crossed = (mark) => {
        const m = (mark - lastHour + 24) % 24;
        return step < 1 && m > 0 && m <= step;
      };
      if (crossed(5.8)) api.onNews('💎 Trời sáng, nước hồ về lại màu xanh ngọc!');
      if (crossed(18.6)) api.onNews('💜 Đêm xuống, nước hồ chuyển tím, nấm sáng rực!');
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

  // Một tia sét ngoài trời: chớp loé qua khe trần 2 lần, tiếng sấm dội vào sau một chút.
  api.strike = () => {
    flash = 1;
    pendingStrike = 0.12 + Math.random() * 0.1;
    api.onThunder?.(0.6 + Math.random() * 0.5, 0.25 + Math.random() * 1.2);
  };

  api.update = (t, dt, camera) => {
    const target = KINDS[sky.weather];
    now.mist = approach(now.mist, target.mist, target.mist > now.mist ? 0.3 : 0.15, dt);
    now.dark = approach(now.dark, target.dark, 0.2, dt);
    now.rain = approach(now.rain, target.rain, target.rain > now.rain ? 0.2 : 0.3, dt);
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
    windPhase += windSigned * dt * 2.2;

    // giờ trong ngày
    const h = currentHour();
    phaseNews(h);
    const sunE = Math.sin((Math.PI * (h - 6)) / 12); // >0: ban ngày
    const night = 1 - smooth(-0.12, 0.18, sunE);
    api.night = night;
    const dark = now.dark;

    // sấm chớp
    if (now.storm > 0.5 && (nextStrike -= dt) <= 0) {
      nextStrike = 3 + Math.random() * 10;
      api.strike();
    }
    if (pendingStrike > 0 && (pendingStrike -= dt) <= 0) flash = Math.max(flash, 0.8);
    flash = Math.max(0, flash - dt * 4.5);
    const flick = flash > 0.05 ? flash * (0.7 + Math.random() * 0.3) : 0;

    // sương xa của hang
    scene.fog.color.copy(fogBase).lerp(fogNight, night);
    scene.background.copy(scene.fog.color);

    // ánh sáng môi trường: từ dưới nước hắt lên
    S.hemi.color.copy(hemiDay).lerp(hemiNight, night * (1 - S.focus * 0.6));
    S.hemi.groundColor.copy(groundDay).lerp(groundNight, night);
    S.hemi.intensity = 1.2 * (1 - dark * 0.3) * (1 - S.focus * 0.3) + flick * 1.8;

    // ánh sáng mờ từ khe trần: ban ngày rõ hơn ban đêm một chút
    S.sun.intensity = (0.85 - night * 0.2) * (1 - dark * 0.45) + flick * 1.5;
    S.shaft.uColor.value.copy(shaftDay).lerp(shaftNight, night);
    S.shaft.uOpacity.value = (0.1 - night * 0.05) * (1 - dark * 0.7) + flick * 0.5;

    // nước, đèn, vật liệu ướt
    const U = S.uniforms;
    const brightness = 1 - dark * 0.35 + flick * 0.4;
    U.uTint.value.setRGB(brightness, brightness, brightness);
    U.uRain.value = now.rain;
    U.uNight.value = night;
    U.uGlow.value.copy(teal).lerp(violet, night);
    for (const l of S.pondLights) {
      l.color.copy(U.uGlow.value);
      l.intensity = l.userData.power * (0.92 + 0.08 * Math.sin(t * 0.9 + l.position.x)) * brightness * (1 - S.focus * 0.55);
    }
    for (const l of S.mushLights) l.intensity = l.userData.power * (0.65 + night * 0.45) * (0.9 + 0.1 * Math.sin(t * 1.3 + l.position.x));
    for (const g of S.glow) g.mat.emissiveIntensity = (g.day + (g.night - g.day) * night) * (0.88 + 0.12 * Math.sin(t * 1.2));
    for (const w of wetBase) {
      w.m.color.copy(w.color).multiplyScalar(1 - now.wet * 0.2);
      w.m.roughness = w.rough - now.wet * 0.42;
    }

    // bào tử
    sporeU.uTime.value = t;
    sporeU.uWindX.value = windPhase;
    sporeU.uColorA.value.copy(U.uGlow.value).lerp(mistDay, 0.35);

    // sương
    const mistColor = mistDay.clone().lerp(mistNight, night);
    for (const s of mists) {
      s.position.x += windDir * s.userData.speed * (0.25 + now.wind * 1.5 + gust * 2.5) * dt;
      if (s.position.x > 15) s.position.x = -15;
      if (s.position.x < -15) s.position.x = 15;
      s.material.opacity = now.mist * 0.2;
      s.material.color.copy(mistColor);
      s.visible = s.material.opacity > 0.005;
    }

    // giọt nước đi theo máy quay
    drips.visible = now.rain > 0.01;
    if (drips.visible) {
      camera.getWorldDirection(fwd);
      dripU.uCenter.value.copy(camera.position).addScaledVector(fwd, 22);
      dripU.uTime.value = t;
      dripU.uAmount.value = now.rain;
      dripU.uWind.value = windSigned * 0.2;
      dripU.uOpacity.value = 0.2 + now.rain * 0.25;
      dripU.uColor.value.copy(U.uGlow.value).lerp(mistDay, 0.65).multiplyScalar(0.85 + flick);
    }
  };

  return api;
}

// Biểu tượng nhỏ cho góc màn hình.
export function weatherIcon(weather, night) {
  if (weather === 'storm') return '⛈️';
  if (weather === 'rain') return '💧';
  if (weather === 'windy') return '💨';
  if (weather === 'cloudy') return '🌫️';
  return night ? '💜' : '💎';
}
