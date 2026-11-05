// Môi trường club + LightingController: sàn LED, sân khấu DJ, màn hình LED, giàn đèn moving-head,
// spotlight cho performer, laser, confetti, pháo sáng lạnh. Mọi thứ phản ứng theo beat và preset ánh sáng.
import * as THREE from 'three';

export const SPOT = new THREE.Vector3(0, 0, 0.6);
export const FLOOR = { minX: -5, maxX: 5, minZ: -3.5, maxZ: 5.5, tile: 0.5 };
export const STAGE = { front: -3.8, top: 0.7, djZ: -5.3 };

const TAU = Math.PI * 2;
const smoothstep = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
const tmpC = new THREE.Color();
const tmpC2 = new THREE.Color();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpE = new THREE.Euler();
// Hệ số để mọi màu có độ sáng cảm nhận ngang nhau (vàng/trắng bị giảm, xanh dương giữ nguyên).
function lumScale(c, target = 0.17) {
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return Math.min(1.6, target / Math.max(0.05, lum));
}
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

function beamMaterial(color, strength = 0.18) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: `
      varying float vT; varying vec3 vN; varying vec3 vV;
      void main() {
        vT = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uStrength;
      varying float vT; varying vec3 vN; varying vec3 vV;
      void main() {
        float edge = pow(abs(dot(vN, vV)), 1.6);
        float a = uStrength * pow(vT, 1.3) * edge;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function easeInOutCubic(t) {
  t = Math.max(0, Math.min(1, t));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function hashHue(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

function softDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Cone mở đầu, đỉnh ở gốc toạ độ, dài 1 theo trục -Y.
function beamGeometry(radius) {
  const g = new THREE.CylinderGeometry(0.06, radius, 1, 24, 1, true);
  g.translate(0, -0.5, 0);
  return g;
}

class Beam {
  constructor(parent, color, radius = 0.9, strength = 0.16) {
    this.mesh = new THREE.Mesh(beamGeometry(radius), beamMaterial(color, strength));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    parent.add(this.mesh);
  }

  aim(from, to) {
    tmpV.subVectors(to, from);
    const len = tmpV.length();
    this.mesh.position.copy(from);
    this.mesh.quaternion.setFromUnitVectors(DOWN, tmpV.normalize());
    this.mesh.scale.set(1, len, 1);
  }
}

class LedWall {
  constructor(parent, width, height) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = Math.round((1024 * height) / width);
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, color: new THREE.Color(1.1, 1.1, 1.1), fog: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.material);
    parent.add(this.mesh);
    this.acc = 0;
    this.info = { mode: 'chill' };
    this.board = [];
    this.images = new Map();
  }

  drawCard(g, f, card, dx, info, W, H) {
    const MEDAL = ['#ffd23f', '#d9e2ec', '#e8955c'];
    const color = MEDAL[f.rank - 1] ?? '#a98bff';
    const x = card.x + dx;
    const mid = card.y + card.h / 2;
    const performing = info.mode === 'perform' && info.id === f.id;
    // Nền thẻ
    const grad = g.createLinearGradient(x, card.y, x + card.w, card.y + card.h);
    grad.addColorStop(0, f.rank === 1 ? 'rgba(255, 200, 40, 0.28)' : 'rgba(140, 100, 255, 0.22)');
    grad.addColorStop(1, 'rgba(20, 8, 40, 0.65)');
    g.fillStyle = grad;
    roundRect(g, x + 4, card.y + 4, card.w - 8, card.h - 8, H * 0.055);
    g.fill();
    g.strokeStyle = performing ? info.color : color;
    g.lineWidth = 5;
    g.stroke();
    // Ảnh đại diện
    const ax = x + card.w * 0.25;
    const ar = card.h * 0.33;
    g.save();
    g.beginPath();
    g.arc(ax, mid, ar, 0, TAU);
    g.clip();
    const img = this.avatar(f.avatar);
    if (img) g.drawImage(img, ax - ar, mid - ar, ar * 2, ar * 2);
    else {
      g.fillStyle = `hsl(${hashHue(f.id)}, 65%, 52%)`;
      g.fillRect(ax - ar, mid - ar, ar * 2, ar * 2);
      g.fillStyle = '#ffffff';
      g.font = `800 ${Math.round(ar * 1.1)}px "Baloo 2", sans-serif`;
      g.fillText(Array.from(f.name)[0]?.toUpperCase() ?? '?', ax, mid + ar * 0.06);
    }
    g.restore();
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(ax, mid, ar, 0, TAU);
    g.stroke();
    // Huy hiệu "TOP n" gắn góc trên trái ảnh
    const bx = ax - ar * 0.78;
    const by = mid - ar * 0.78;
    const br = card.h * 0.17;
    g.fillStyle = color;
    g.beginPath();
    g.arc(bx, by, br, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(20, 8, 40, 0.9)';
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = f.rank <= 3 ? '#2a1a00' : '#ffffff';
    g.textAlign = 'center';
    g.font = `800 ${Math.round(br * 0.42)}px "Baloo 2", sans-serif`;
    g.fillText('TOP', bx, by - br * 0.38);
    g.font = `800 ${Math.round(br * 1.05)}px "Baloo 2", sans-serif`;
    g.fillText(String(f.rank), bx, by + br * 0.22);
    // Tên + xu
    const tx = ax + ar + card.w * 0.05;
    const maxW = x + card.w - tx - card.w * 0.04;
    g.textAlign = 'left';
    g.fillStyle = '#ffffff';
    g.font = `800 ${Math.round(card.h * 0.2)}px "Baloo 2", sans-serif`;
    g.fillText(f.name, tx, mid - card.h * 0.1, maxW);
    g.fillStyle = color;
    g.font = `800 ${Math.round(card.h * 0.16)}px "Baloo 2", sans-serif`;
    g.fillText(`${f.coins.toLocaleString('vi-VN')} xu`, tx, mid + card.h * 0.16, maxW);
    g.textAlign = 'center';
  }

  avatar(url) {
    if (!url) return null;
    let entry = this.images.get(url);
    if (!entry) {
      const img = new Image();
      entry = { img, ok: false };
      img.onload = () => (entry.ok = true);
      img.src = `/api/avatar?u=${encodeURIComponent(url)}`;
      this.images.set(url, entry);
      if (this.images.size > 100) this.images.delete(this.images.keys().next().value);
    }
    return entry.ok ? entry.img : null;
  }

  update(dt, beat, palette, spectrum, kick) {
    if (this.calm) beat *= 0.4;
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    this.acc = 0;
    const { g, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const info = this.info;
    const col = (i, a = 1) => {
      tmpC.copy(palette[i % palette.length]);
      return `rgba(${Math.round(Math.min(1, tmpC.r) * 255)},${Math.round(Math.min(1, tmpC.g) * 255)},${Math.round(Math.min(1, tmpC.b) * 255)},${a})`;
    };
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#05010d';
    g.fillRect(0, 0, W, H);

    // Nền: khung vuông mờ (rất nhẹ để chữ dễ đọc).
    g.lineWidth = 5;
    const cx = W / 2;
    for (let i = 0; i < 7; i++) {
      const t = (i + (beat % 1)) / 7;
      const sq = Math.pow(t, 2.2);
      g.strokeStyle = col(i + Math.floor(beat / 4), 0.05 + 0.12 * t);
      g.strokeRect(cx - (W * 1.3 * sq) / 2, H * 0.45 - (H * 1.3 * sq) / 2, W * 1.3 * sq, H * 1.3 * sq);
    }

    // Tiêu đề: lúc có người diễn thì hiện tier + tên người diễn.
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowBlur = 18;
    if (info.mode === 'perform') {
      g.fillStyle = info.color;
      g.shadowColor = info.color;
      g.font = `800 ${Math.round(H * 0.095)}px "Baloo 2", sans-serif`;
      g.fillText(`★ ${info.tier.toUpperCase()} ★  ${info.name}`, cx, H * 0.085, W * 0.94);
    } else {
      g.fillStyle = '#ffd166';
      g.shadowColor = '#ffb703';
      g.font = `800 ${Math.round(H * 0.1)}px "Baloo 2", sans-serif`;
      g.fillText('🏆 BẢNG XẾP HẠNG 🏆', cx, H * 0.085);
    }
    g.shadowBlur = 0;

    const board = this.board ?? [];
    if (!board.length) {
      g.fillStyle = '#ffd166';
      g.font = `700 ${Math.round(H * 0.075)}px "Baloo 2", sans-serif`;
      g.fillText('Hãy là người đầu tiên lên TOP!', cx, H * 0.36, W * 0.9);
    } else {
      // Slider: mỗi lần một người, trượt ngang sang người kế tiếp.
      const now = performance.now();
      const HOLD = 4200;
      const SLIDE = 650;
      if (!this.slide) this.slide = { index: 0, since: now };
      const sl = this.slide;
      if (sl.index >= board.length) sl.index = 0;
      let elapsed = now - sl.since;
      if (board.length > 1 && elapsed >= HOLD + SLIDE) {
        sl.index = (sl.index + 1) % board.length;
        sl.since = now;
        elapsed = 0;
      }
      const moving = board.length > 1 && elapsed > HOLD;
      const u = moving ? easeInOutCubic((elapsed - HOLD) / SLIDE) : 0;
      const card = { x: W * 0.2, y: H * 0.165, w: W * 0.6, h: H * 0.54 };
      g.save();
      roundRect(g, card.x, card.y, card.w, card.h, H * 0.06);
      g.clip();
      this.drawCard(g, board[sl.index], card, -u * W, info, W, H);
      if (moving) this.drawCard(g, board[(sl.index + 1) % board.length], card, (1 - u) * W, info, W, H);
      g.restore();
      // Chấm chỉ vị trí (góc phải dưới thẻ).
      const active = moving && u > 0.5 ? (sl.index + 1) % board.length : sl.index;
      for (let i = 0; i < board.length; i++) {
        g.fillStyle = i === active ? '#ffd166' : 'rgba(255,255,255,0.3)';
        g.beginPath();
        g.arc(card.x + card.w - 30 - (board.length - 1 - i) * 26, card.y + card.h - 24, i === active ? 8 : 6, 0, TAU);
        g.fill();
      }
    }
    g.shadowBlur = 0;
    this.texture.needsUpdate = true;
  }
}

class Confetti {
  constructor(parent, count = 700) {
    const geo = new THREE.PlaneGeometry(0.07, 0.11);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.count = count;
    this.p = new Float32Array(count * 3);
    this.v = new Float32Array(count * 3);
    this.r = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.next = 0;
    for (let i = 0; i < count; i++) {
      this.mesh.setColorAt(i, tmpC.setRGB(1, 1, 1));
      tmpM.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, tmpM);
    }
    parent.add(this.mesh);
  }

  burst(n, palette, center = SPOT) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      this.p[i * 3] = center.x + (Math.random() - 0.5) * 9;
      this.p[i * 3 + 1] = 6.5 + Math.random() * 2;
      this.p[i * 3 + 2] = center.z + (Math.random() - 0.5) * 7;
      this.v[i * 3] = (Math.random() - 0.5) * 1.5;
      this.v[i * 3 + 1] = -0.5 - Math.random() * 1.2;
      this.v[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
      this.r[i * 3] = Math.random() * TAU;
      this.r[i * 3 + 1] = Math.random() * TAU;
      this.r[i * 3 + 2] = 2 + Math.random() * 6;
      this.life[i] = 6 + Math.random() * 3;
      tmpC.copy(palette[Math.floor(Math.random() * palette.length)]).multiplyScalar(1.4);
      this.mesh.setColorAt(i, tmpC);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt, time) {
    let any = false;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const j = i * 3;
      this.v[j + 1] = Math.max(-1.1, this.v[j + 1] - 0.6 * dt);
      this.p[j] += (this.v[j] + Math.sin(time * 2 + i) * 0.4) * dt;
      this.p[j + 1] += this.v[j + 1] * dt;
      this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < 0.01) {
        this.p[j + 1] = 0.01;
        this.v[j] = this.v[j + 2] = 0;
      }
      this.r[j] += this.r[j + 2] * dt;
      this.r[j + 1] += this.r[j + 2] * 0.7 * dt;
      const s = this.life[i] > 0 ? Math.min(1, this.life[i]) : 0;
      tmpQ.setFromEuler(tmpE.set(this.r[j], this.r[j + 1], 0));
      tmpM.compose(tmpV.set(this.p[j], this.p[j + 1], this.p[j + 2]), tmpQ, tmpS.setScalar(s));
      this.mesh.setMatrixAt(i, tmpM);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

class Sparks {
  constructor(parent, count = 1800) {
    this.count = count;
    this.p = new Float32Array(count * 3);
    this.v = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.colors = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.12, map: softDotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.points.frustumCulled = false;
    parent.add(this.points);
    this.next = 0;
    this.emitters = [
      new THREE.Vector3(-3.6, STAGE.top, STAGE.front - 0.1),
      new THREE.Vector3(3.6, STAGE.top, STAGE.front - 0.1),
      new THREE.Vector3(-4.6, 0, 4.8),
      new THREE.Vector3(4.6, 0, 4.8),
    ];
    this.active = 0;
    this.carry = 0;
    for (let i = 0; i < count; i++) this.p[i * 3 + 1] = -100;
  }

  fire(seconds) {
    this.active = Math.max(this.active, seconds);
  }

  update(dt) {
    if (this.active > 0) {
      this.active -= dt;
      this.carry += dt * 900;
      while (this.carry >= 1) {
        this.carry -= 1;
        const e = this.emitters[Math.floor(Math.random() * this.emitters.length)];
        const i = this.next;
        this.next = (this.next + 1) % this.count;
        const j = i * 3;
        this.p[j] = e.x + (Math.random() - 0.5) * 0.1;
        this.p[j + 1] = e.y;
        this.p[j + 2] = e.z + (Math.random() - 0.5) * 0.1;
        this.v[j] = (Math.random() - 0.5) * 0.9;
        this.v[j + 1] = 5 + Math.random() * 2.5;
        this.v[j + 2] = (Math.random() - 0.5) * 0.9;
        this.life[i] = 1.1 + Math.random() * 0.5;
      }
    }
    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      if (this.life[i] <= 0) {
        this.colors[j] = this.colors[j + 1] = this.colors[j + 2] = 0;
        continue;
      }
      this.life[i] -= dt;
      this.v[j + 1] -= 6 * dt;
      this.p[j] += this.v[j] * dt;
      this.p[j + 1] += this.v[j + 1] * dt;
      this.p[j + 2] += this.v[j + 2] * dt;
      const f = Math.max(0, Math.min(1, this.life[i]));
      this.colors[j] = 1.6 * f;
      this.colors[j + 1] = 1.2 * f;
      this.colors[j + 2] = 0.55 * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export class Stage {
  constructor(scene, presets, display = {}) {
    this.scene = scene;
    this.presets = presets;
    // Độ nháy theo nhịp (0 = đứng yên, 1 = nháy mạnh) và có cho strobe hay không.
    this.beatPulse = Math.max(0, Math.min(1, display.beatPulse ?? 0.25));
    // Chế độ đèn dịu (mặc định): không laser, không pháo sáng, không chớp, đèn quét rất chậm.
    this.calm = display.calmLights !== false;
    // Tắt hẳn hiệu ứng đèn: mọi đèn đứng yên một màu, không quét, không đổi màu khi có người diễn.
    this.frozen = display.lightAnimation === false;
    if (this.frozen) this.calm = true;
    this.allowStrobe = display.strobe === true && !this.calm;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.preset = presets.chill;
    this.palette = presets.chill.palette.map((c) => new THREE.Color(c));
    this.paletteTarget = this.palette.map((c) => c.clone());
    this.tierColor = new THREE.Color('#ffffff');
    this.spotOn = 0;
    this.spotTarget = 0;
    this.lasersOn = 0;
    this.strobe = 0;
    this.flash = 0;
    this.performerPos = null;
    this.highlight = false;
    this.finale = false;
    this.time = 0;
    this.buildRoom();
    this.buildFloor();
    this.buildStage();
    this.buildLights();
    this.buildRainbowLasers(display.rainbowLasers);
    this.confetti = new Confetti(this.group);
    this.sparks = new Sparks(this.group);
  }

  buildRoom() {
    const g = this.group;
    const dark = new THREE.MeshStandardMaterial({ color: '#0d0818', roughness: 0.9 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), dark);
    back.position.set(0, 6, -7.2);
    g.add(back);
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(26, 14), dark);
      wall.position.set(s * 7.5, 6, 0);
      wall.rotation.y = -s * Math.PI / 2;
      g.add(wall);
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: '#05020a' }));
    ceil.position.y = 9;
    ceil.rotation.x = Math.PI / 2;
    g.add(ceil);
    // Cột neon hai bên.
    this.neon = [];
    const neonGeo = new THREE.BoxGeometry(0.14, 5.5, 0.14);
    for (const s of [-1, 1]) {
      for (const z of [-3.6, -0.5, 2.6, 5.6]) {
        const m = new THREE.Mesh(neonGeo, new THREE.MeshBasicMaterial({ color: '#ffffff' }));
        m.position.set(s * 5.9, 2.75, z);
        g.add(m);
        this.neon.push(m);
      }
    }
    // Giàn truss.
    const trussMat = new THREE.MeshStandardMaterial({ color: '#2a2a33', roughness: 0.5, metalness: 0.6 });
    const bar = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), trussMat);
      m.position.set(x, y, z);
      g.add(m);
    };
    bar(12, 0.18, 0.18, 0, 7.15, -3.9);
    bar(12, 0.18, 0.18, 0, 6.6, 3.2);
    for (const s of [-1, 1]) bar(0.18, 0.18, 7.1, s * 5.9, 6.9, -0.35);
  }

  buildFloor() {
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshStandardMaterial({ color: '#0b0614', roughness: 0.45, metalness: 0.2 }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(0, -0.01, 1);
    this.group.add(base);

    // Sàn LED: MỘT mặt phẳng, màu từng ô lấy từ texture nhỏ (1 điểm ảnh = 1 ô),
    // khe giữa các ô vẽ bằng shader có khử răng cưa → không chập chờn (moiré) khi camera di chuyển.
    const cols = Math.round((FLOOR.maxX - FLOOR.minX) / FLOOR.tile);
    const rows = Math.round((FLOOR.maxZ - FLOOR.minZ) / FLOOR.tile);
    this.tileCols = cols;
    this.tileRows = rows;
    this.tileData = new Float32Array(cols * rows * 4);
    this.tileTex = new THREE.DataTexture(this.tileData, cols, rows, THREE.RGBAFormat, THREE.FloatType);
    this.tileTex.magFilter = THREE.NearestFilter;
    this.tileTex.minFilter = THREE.NearestFilter;
    this.tileTex.colorSpace = THREE.LinearSRGBColorSpace;
    this.tileTex.needsUpdate = true;
    this.tileXZ = new Float32Array(cols * rows * 2);
    this.tileTexel = new Uint32Array(cols * rows);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.tileXZ[i * 2] = FLOOR.minX + (c + 0.5) * FLOOR.tile;
        this.tileXZ[i * 2 + 1] = FLOOR.minZ + (r + 0.5) * FLOOR.tile;
        this.tileTexel[i] = ((rows - 1 - r) * cols + c) * 4;
        i++;
      }
    }
    const mat = new THREE.MeshStandardMaterial({ color: '#160d26', roughness: 0.3, metalness: 0.15 });
    const tileUniforms = { uTiles: { value: this.tileTex }, uGrid: { value: new THREE.Vector2(cols, rows) }, uGap: { value: 0.035 } };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, tileUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vTileUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTileUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vTileUv;\nuniform sampler2D uTiles;\nuniform vec2 uGrid;\nuniform float uGap;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          vec2 cell = vTileUv * uGrid;
          vec2 f = fract(cell);
          vec2 edge = min(f, 1.0 - f);
          vec2 fw = max(fwidth(cell), vec2(1e-4));
          vec2 m = smoothstep(vec2(uGap) - fw, vec2(uGap) + fw, edge);
          float mask = m.x * m.y;
          // Khe nhỏ hơn 1 điểm ảnh thì dùng độ phủ trung bình, tránh lấp lánh khi ở xa.
          float avg = (1.0 - 2.0 * uGap) * (1.0 - 2.0 * uGap);
          float far = clamp(max(fw.x, fw.y) / (uGap * 2.0) - 0.5, 0.0, 1.0);
          mask = mix(mask, avg, far);
          totalEmissiveRadiance += texture2D(uTiles, vTileUv).rgb * mask;`,
        );
    };
    const geo = new THREE.PlaneGeometry(cols * FLOOR.tile, rows * FLOOR.tile).rotateX(-Math.PI / 2);
    this.tiles = new THREE.Mesh(geo, mat);
    this.tiles.position.set((FLOOR.minX + FLOOR.maxX) / 2, 0.002, (FLOOR.minZ + FLOOR.maxZ) / 2);
    this.group.add(this.tiles);

    // Vòng sáng sân khấu cho performer.
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.035, 8, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0 }),
    );
    this.ring.position.set(SPOT.x, 0.03, SPOT.z);
    this.group.add(this.ring);
  }

  buildStage() {
    const g = this.group;
    const stageMat = new THREE.MeshStandardMaterial({ color: '#141022', roughness: 0.6, metalness: 0.2 });
    const depth = 7.2 + STAGE.front;
    const stage = new THREE.Mesh(new THREE.BoxGeometry(11, STAGE.top, 3.4), stageMat);
    stage.position.set(0, STAGE.top / 2, STAGE.front - 1.7);
    g.add(stage);
    this.stageEdge = new THREE.Mesh(new THREE.BoxGeometry(11, 0.09, 0.09), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    this.stageEdge.position.set(0, STAGE.top - 0.02, STAGE.front + 0.02);
    g.add(this.stageEdge);
    void depth;

    // LED wall.
    this.wall = new LedWall(g, 10.4, 5.4);
    this.wall.mesh.position.set(0, STAGE.top + 0.25 + 2.7, -7.0);

    // DJ booth.
    const boothMat = new THREE.MeshStandardMaterial({ color: '#1b1730', roughness: 0.4, metalness: 0.4 });
    const booth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.95, 0.85), boothMat);
    booth.position.set(0, STAGE.top + 0.475, STAGE.djZ + 0.75);
    g.add(booth);
    this.boothFront = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.8), new THREE.MeshBasicMaterial({ color: '#ffffff', map: this.boothTexture() }));
    this.boothFront.position.set(0, STAGE.top + 0.47, STAGE.djZ + 1.2);
    g.add(this.boothFront);
    this.decks = [];
    for (const x of [-0.7, 0.7]) {
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 24), new THREE.MeshStandardMaterial({ color: '#0b0b0f', roughness: 0.3, metalness: 0.5 }));
      deck.position.set(x, STAGE.top + 0.97, STAGE.djZ + 0.72);
      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.045, 16), new THREE.MeshBasicMaterial({ color: '#ff3cac' }));
      label.position.y = 0.002;
      deck.add(label);
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.2), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      mark.position.set(0, 0.005, 0.15);
      deck.add(mark);
      g.add(deck);
      this.decks.push(deck);
    }
    const mixer = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.5), new THREE.MeshStandardMaterial({ color: '#222230', roughness: 0.4 }));
    mixer.position.set(0, STAGE.top + 0.98, STAGE.djZ + 0.72);
    g.add(mixer);

    // Loa hai bên.
    this.cones = [];
    const cabMat = new THREE.MeshStandardMaterial({ color: '#101016', roughness: 0.7 });
    for (const s of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 0.9), cabMat);
        cab.position.set(s * 4.4, STAGE.top + 0.6 + k * 1.22, STAGE.front - 0.7);
        g.add(cab);
        const cone = new THREE.Mesh(new THREE.CircleGeometry(0.38, 24), new THREE.MeshStandardMaterial({ color: '#1e1e28', roughness: 0.5, metalness: 0.3, emissive: '#000000' }));
        cone.position.set(s * 4.4, STAGE.top + 0.6 + k * 1.22, STAGE.front - 0.22);
        g.add(cone);
        this.cones.push(cone);
      }
    }
  }

  boothTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, '#ff00a8');
    grad.addColorStop(0.5, '#7b2ff7');
    grad.addColorStop(1, '#00f0ff');
    g.fillStyle = '#0a0612';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = grad;
    for (let x = 4; x < 256; x += 12) g.fillRect(x, 6, 7, 52);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  buildLights() {
    const g = this.group;
    this.hemi = new THREE.HemisphereLight('#8a7cff', '#1a0b2e', 0.9);
    g.add(this.hemi);
    this.key = new THREE.DirectionalLight('#ffe9f5', 1.1);
    this.key.position.set(2, 9, 12);
    g.add(this.key);
    this.rim = new THREE.DirectionalLight('#55d6ff', 1.4);
    this.rim.position.set(0, 6, -10);
    g.add(this.rim);

    this.points = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight('#ffffff', 12, 14, 1.4);
      l.position.set(0, 3.2, 0);
      g.add(l);
      this.points.push(l);
    }

    this.spot = new THREE.SpotLight('#ffffff', 0, 20, 0.32, 0.55, 1.0);
    this.spot.position.set(0, 7.8, 3.2);
    g.add(this.spot);
    g.add(this.spot.target);
    this.spotBeam = new Beam(g, '#ffffff', 1.05, 0.0);

    this.heads = [];
    for (let i = 0; i < 6; i++) {
      const x = -4.5 + i * 1.8;
      const from = new THREE.Vector3(x, 7.0, -3.9);
      const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.3, 12), new THREE.MeshStandardMaterial({ color: '#1a1a22', metalness: 0.5, roughness: 0.4 }));
      fixture.position.copy(from).add(new THREE.Vector3(0, 0.05, 0));
      g.add(fixture);
      this.heads.push({ from, beam: new Beam(g, '#ffffff', 0.75, 0.14), target: new THREE.Vector3(), phase: i * 0.9 });
    }
    for (let i = 0; i < 4; i++) {
      const x = -3.6 + i * 2.4;
      const from = new THREE.Vector3(x, 6.45, 3.2);
      this.heads.push({ from, beam: new Beam(g, '#ffffff', 0.7, 0.1), target: new THREE.Vector3(), phase: 3 + i * 1.3, front: true });
    }

    this.lasers = [];
    const laserGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6, 1, true).translate(0, -0.5, 0);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: '#00ff88', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.position.set(0, STAGE.top + 5.0, -6.9);
      m.scale.y = 22;
      m.frustumCulled = false;
      g.add(m);
      this.lasers.push(m);
    }
  }

  // Tia laser mảnh đủ 7 sắc cầu vồng, quét chậm (không nháy). Chạy cả lúc chill, sáng hơn khi có người diễn.
  // Bật/tắt và chỉnh ở display.rainbowLasers trong config.json.
  buildRainbowLasers(opts = {}) {
    this.rainbow = [];
    this.rainbowOn = 0;
    this.rainbowOpts = { enabled: true, perEmitter: 7, sweepSpeed: 0.18, chillOpacity: 0.32, performOpacity: 0.6, ...opts };
    if (this.rainbowOpts.enabled === false) return;
    const g = this.group;
    const perEmitter = Math.max(2, Math.min(16, Math.round(this.rainbowOpts.perEmitter) || 7));
    const geo = new THREE.CylinderGeometry(0.0065, 0.0065, 1, 5, 1, true).translate(0, -0.5, 0);
    const headGeo = new THREE.SphereGeometry(0.07, 10, 8);
    // yaw: hướng ngang so với trục +z (về phía khán giả); pitch < 0 là chúc xuống.
    const emitters = [
      { from: [-4.3, STAGE.top + 4.7, -6.95], yaw: 0.32, pitch: -0.27, fan: 1.15 },
      { from: [4.3, STAGE.top + 4.7, -6.95], yaw: -0.32, pitch: -0.27, fan: 1.15 },
      { from: [-7.3, 5.9, 1.2], yaw: Math.PI / 2, pitch: -0.4, fan: 1.35 },
      { from: [7.3, 5.9, 1.2], yaw: -Math.PI / 2, pitch: -0.4, fan: 1.35 },
    ];
    const total = emitters.length * perEmitter;
    emitters.forEach((em, ei) => {
      const head = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ color: '#fff6e0', fog: false, toneMapped: false }));
      head.position.set(...em.from);
      g.add(head);
      for (let i = 0; i < perEmitter; i++) {
        const k = ei * perEmitter + i;
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
        m.position.set(...em.from);
        m.scale.y = 26;
        m.frustumCulled = false;
        g.add(m);
        this.rainbow.push({
          mesh: m,
          head,
          em,
          offset: (i / (perEmitter - 1) - 0.5) * em.fan,
          // Xen kẽ màu giữa các cụm để cụm nào cũng có đủ màu.
          hue: ((i / perEmitter) + ei * 0.13) % 1,
          phase: k * 0.7 + ei * 1.9,
        });
      }
    });
    this.rainbowTotal = total;
  }

  updateRainbowLasers(dt) {
    if (!this.rainbow?.length) return;
    const o = this.rainbowOpts;
    const performing = this.spotTarget > 0;
    const target = performing ? (o.performOpacity ?? 0.6) * (this.highlight || this.finale ? 1.3 : 1) : (o.chillOpacity ?? 0.32);
    this.rainbowOn += (Math.min(1, target) - this.rainbowOn) * (1 - Math.exp(-dt * 2));
    const t = this.time;
    const sp = (o.sweepSpeed ?? 0.18) * (performing ? 1.6 : 1);
    this.sweepClock = (this.sweepClock ?? 0) + dt * sp;
    const sc = this.sweepClock;
    for (const b of this.rainbow) {
      const em = b.em;
      const yaw = em.yaw + b.offset + Math.sin(sc * TAU * 0.5 + b.phase * 0.15) * 0.32;
      const pitch = em.pitch + Math.sin(sc * TAU * 0.37 + b.phase) * 0.07;
      tmpV.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      b.mesh.quaternion.setFromUnitVectors(DOWN, tmpV.normalize());
      // Màu trôi rất chậm quanh vòng màu để lúc nào cũng đủ sắc.
      b.mesh.material.color.setHSL((b.hue + t * 0.015) % 1, 1, 0.5);
      b.mesh.material.opacity = this.rainbowOn;
      b.mesh.visible = this.rainbowOn > 0.01;
    }
  }

  // ---- API cho Camera/Crowd/Session ----

  setPreset(name, tierColor) {
    if (this.frozen) {
      if (tierColor) this.tierColor.set(tierColor);
      this.spotTarget = name === 'chill' ? 0 : 1;
      return;
    }
    const preset = this.presets[name] ?? this.presets.chill;
    this.preset = preset;
    const colors = preset.palette.map((c) => new THREE.Color(c));
    this.paletteTarget = Array.from({ length: Math.max(colors.length, 3) }, (_, i) => colors[i % colors.length]);
    while (this.palette.length < this.paletteTarget.length) this.palette.push(this.palette[0].clone());
    this.palette.length = this.paletteTarget.length;
    if (tierColor) this.tierColor.set(tierColor);
    this.spotTarget = preset.spot ? 1 : 0;
  }

  setPerformer(pos) {
    this.performerPos = pos;
  }

  burst(kind) {
    if (kind === 'confetti') this.confetti.burst(320, this.palette);
    if (kind === 'sparks' && !this.calm) this.sparks.fire(2.4);
    if (kind === 'flash' && this.allowStrobe) this.flash = 0.5;
  }

  update(dt, beat, { kick = 0, spectrum = null } = {}) {
    this.time += dt;
    const t = this.frozen ? 0 : this.time;
    if (this.frozen) beat = 0;
    const p = this.preset;
    const k = 1 - Math.exp(-dt * 2.5);
    for (let i = 0; i < this.palette.length; i++) this.palette[i].lerp(this.paletteTarget[i], k);
    const pal = this.palette;
    const performer = this.performerPos;

    // Sàn LED.
    const n = this.tileXZ.length / 2;
    const td = this.tileData;
    const beatFrac = beat % 1;
    // Nháy mềm theo nhịp, biên độ nhỏ để màn hình không chớp sáng/tối liên tục.
    const pulse = (0.5 + 0.5 * Math.cos(beatFrac * TAU)) * this.beatPulse;
    const half4 = smoothstep(((beat / 4) % 1) * 2 - 0.5);
    const center = performer ?? SPOT;
    for (let i = 0; i < n; i++) {
      const x = this.tileXZ[i * 2];
      const z = this.tileXZ[i * 2 + 1];
      const dx = x - center.x;
      const dz = z - center.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      let v;
      let ci;
      switch (this.calm ? 'calm' : p.floor) {
        case 'calm': {
          v = 0.09 + 0.07 * (0.5 + 0.5 * Math.sin(x * 0.45 + t * 0.25) * Math.cos(z * 0.4 - t * 0.2));
          ci = Math.floor((x + z) * 0.12 + t * 0.04 + 100) % pal.length;
          break;
        }
        case 'ripple': {
          const front = (beat % 2) * 3.2;
          v = 0.08 + 0.55 * Math.exp(-Math.pow((d - front) * 2.2, 2));
          ci = Math.floor(d * 0.8 + beat) % pal.length;
          break;
        }
        case 'checker': {
          // Ô caro đổi chỗ từ từ mỗi 2 nhịp thay vì bật/tắt gắt từng nhịp.
          const c = (Math.floor((x - FLOOR.minX) / FLOOR.tile) + Math.floor((z - FLOOR.minZ) / FLOOR.tile)) % 2;
          const on = Math.floor(beat / 4) % 2 === c ? 1 - half4 : half4;
          v = 0.1 + 0.12 * on + 0.08 * pulse;
          ci = (Math.floor(beat / 8) + c) % pal.length;
          break;
        }
        case 'rings': {
          v = 0.08 + 0.32 * (0.5 + 0.5 * Math.sin(d * 3 - beat * Math.PI));
          ci = Math.floor(d * 1.2 - beat * 0.5 + 100) % pal.length;
          break;
        }
        case 'spiral': {
          const a = Math.atan2(dz, dx);
          v = 0.1 + 0.38 * (0.5 + 0.5 * Math.sin(a * 3 + d * 2.2 - beat * Math.PI));
          ci = Math.floor((a / TAU + 0.5) * pal.length + beat * 0.5) % pal.length;
          break;
        }
        default: {
          v = 0.07 + 0.16 * (0.5 + 0.5 * Math.sin(x * 0.7 + t * 0.9) * Math.cos(z * 0.55 - t * 0.6));
          ci = Math.floor((x + z) * 0.15 + t * 0.12 + 100) % pal.length;
        }
      }
      v += 0.06 * pulse;
      tmpC.copy(pal[ci]);
      tmpC.multiplyScalar(v * lumScale(tmpC));
      if (performer && d < 1.1) {
        const w = (1 - d / 1.1) * this.spotOn;
        tmpC.lerp(tmpC2.copy(this.tierColor).multiplyScalar(0.45 + 0.25 * pulse), w);
      }
      const o = this.tileTexel[i];
      td[o] = tmpC.r;
      td[o + 1] = tmpC.g;
      td[o + 2] = tmpC.b;
      td[o + 3] = 1;
    }
    this.tileTex.needsUpdate = true;

    // Vòng sáng performer.
    this.spotOn += (this.spotTarget - this.spotOn) * (1 - Math.exp(-dt * 3));
    if (performer) this.ring.position.set(performer.x, 0.03, performer.z);
    this.ring.material.color.copy(this.tierColor).multiplyScalar(1.5 + pulse);
    this.ring.material.opacity = 0.9 * this.spotOn;
    this.ring.scale.setScalar(1 + 0.08 * pulse);

    // Neon, mép sân khấu, loa.
    this.neon.forEach((m, i) => {
      const pos = i * 0.5 + beat / 16;
      const a = pal[Math.floor(pos) % pal.length];
      const b = pal[(Math.floor(pos) + 1) % pal.length];
      m.material.color.copy(a).lerp(b, smoothstep(pos % 1)).multiplyScalar((this.calm ? 0.9 : 1.4) + 0.6 * pulse);
    });
    this.stageEdge.material.color.copy(pal[1 % pal.length]).multiplyScalar(this.calm ? 1.0 : 1.6);
    this.boothFront.material.color.setScalar(0.9 + 0.8 * pulse);
    for (const cone of this.cones) {
      cone.scale.setScalar(1 + 0.08 * kick);
      cone.material.emissive.copy(pal[0]).multiplyScalar(0.25 * kick);
    }
    for (const deck of this.decks) deck.rotation.y -= dt * 3.5;

    // Đèn điểm màu chạy quanh sàn.
    this.points.forEach((l, i) => {
      const a = t * (this.calm ? 0.08 : 0.35 * (p.beamSpeed + 0.4)) + (i * TAU) / 3;
      l.position.set(Math.cos(a) * 3.4, 3.4, 1 + Math.sin(a) * 3);
      l.color.copy(pal[i % pal.length]);
      l.intensity = (8 + 6 * pulse) * Math.min(1, lumScale(l.color, 0.3));
    });

    // Moving heads.
    const speed = this.calm ? 0.12 : p.beamSpeed;
    this.heads.forEach((h, i) => {
      const a = t * speed + h.phase;
      if (!this.frozen && performer && this.spotOn > 0.5 && (i % 3 === 0 || this.highlight)) {
        h.target.set(performer.x + Math.sin(a * 2) * 0.4, 0, performer.z + Math.cos(a * 2) * 0.4);
      } else {
        h.target.set(Math.sin(a * 1.3) * 4, 0, 1 + Math.cos(a * 0.9) * 3.5);
      }
      h.beam.aim(h.from, h.target);
      const pos = i + beat / 16;
      h.beam.mesh.material.uniforms.uColor.value.copy(pal[Math.floor(pos) % pal.length]).lerp(pal[(Math.floor(pos) + 1) % pal.length], smoothstep(pos % 1));
      h.beam.mesh.material.uniforms.uStrength.value = (h.front ? 0.07 : 0.12) * (this.calm ? 0.8 : (0.9 + 0.5 * pulse) * (this.highlight ? 1.3 : 1));
    });

    // Spotlight performer.
    const target = performer ?? SPOT;
    this.spot.target.position.copy(target);
    this.spot.intensity = 38 * this.spotOn;
    this.spot.color.copy(this.tierColor).lerp(tmpC.setRGB(1, 1, 1), 0.55);
    tmpV2.set(target.x, 0, target.z);
    this.spotBeam.aim(this.spot.position, tmpV2);
    this.spotBeam.mesh.material.uniforms.uColor.value.copy(this.spot.color);
    this.spotBeam.mesh.material.uniforms.uStrength.value = 0.1 * this.spotOn;

    // Laser.
    const laserTarget = p.lasers && !this.calm ? (this.highlight || this.finale ? 1 : 0.55) : 0;
    this.lasersOn += (laserTarget - this.lasersOn) * (1 - Math.exp(-dt * 4));
    this.lasers.forEach((m, i) => {
      const spread = (i / (this.lasers.length - 1) - 0.5) * 1.6;
      const sweep = Math.sin(t * 1.4 * speed + i * 0.35) * 0.35;
      tmpV.set(Math.sin(spread + sweep), -0.32 - 0.12 * Math.sin(t * 0.9 + i), Math.cos(spread + sweep));
      m.quaternion.setFromUnitVectors(DOWN, tmpV.normalize());
      m.material.color.copy(pal[i % pal.length]).multiplyScalar(2.5);
      m.material.opacity = this.lasersOn * (0.7 + 0.3 * pulse);
      m.visible = this.lasersOn > 0.01;
    });

    // Strobe nhẹ trong highlight (giới hạn cường độ để an toàn).
    // Strobe chỉ chạy khi bật display.strobe trong config.
    if (this.allowStrobe && p.strobe && this.highlight && beatFrac < dt * 2.5) this.flash = Math.max(this.flash, p.strobe);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.hemi.intensity = 0.95 + 0.1 * pulse + 0.5 * this.flash;
    this.key.intensity = 1.1 + 0.3 * this.flash;
    this.rim.color.copy(pal[2 % pal.length]);

    this.updateRainbowLasers(dt);

    this.wall.calm = this.calm;
    this.wall.update(dt, beat, pal, spectrum, kick);
    this.confetti.update(dt, this.time);
    this.sparks.update(dt);
  }
}
