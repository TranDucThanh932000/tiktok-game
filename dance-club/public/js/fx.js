// Hiệu ứng quanh người biểu diễn theo tier quà (dùng cho cả GIF meme lẫn nhân vật 3D):
// biểu tượng xoay quanh người, biểu tượng bay lên, vương miện trên đầu, tia sáng xoay chậm sau lưng,
// vòng sáng dưới chân. Không chớp nháy; chỉ chuyển động mềm. Cấu hình trong config.json → auraFx.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const tmp = new THREE.Vector3();

function emojiTexture(ch) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '100px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  g.fillText(ch, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function raysTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  for (let i = 0; i < 16; i++) {
    g.rotate(TAU / 16);
    const grad = g.createLinearGradient(0, 0, 0, -128);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-14, -128);
    g.lineTo(14, -128);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 40, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.82, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export class AuraFX {
  constructor(scene, config = {}) {
    this.cfg = config;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.textures = new Map();
    this.alpha = 0;
    this.target = 0;
    this.boost = 1;
    this.angle = 0;
    this.time = 0;
    this.active = null;
    this.carry = 0;

    const sprite = (opts = {}) => {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0, ...opts }));
      m.visible = false;
      m.renderOrder = 6;
      this.group.add(m);
      return m;
    };
    this.orbiters = Array.from({ length: 24 }, () => sprite());
    this.risers = Array.from({ length: 48 }, () => ({ s: sprite(), life: 0, max: 1, vy: 0, x: 0, z: 0, y: 0, phase: 0, size: 0.3 }));
    this.crown = sprite();
    this.rays = sprite({ map: raysTexture(), blending: THREE.AdditiveBlending });
    this.rays.renderOrder = 0;
    this.disc = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending }),
    );
    this.disc.visible = false;
    this.group.add(this.disc);
  }

  tex(ch) {
    if (!this.textures.has(ch)) this.textures.set(ch, emojiTexture(ch));
    return this.textures.get(ch);
  }

  start(tier, color) {
    const fx = this.cfg[String(tier)] ?? this.cfg['1'];
    if (!fx) return;
    this.active = fx;
    this.target = 1;
    this.boost = 1;
    this.color = new THREE.Color(color);
    const orbit = fx.orbit ?? ['✨'];
    this.orbiters.forEach((s, i) => {
      s.visible = i < (fx.orbitCount ?? 8);
      s.material.map = this.tex(orbit[i % orbit.length]);
      s.material.needsUpdate = true;
    });
    this.crown.visible = Boolean(fx.crown);
    if (fx.crown) {
      this.crown.material.map = this.tex(fx.crown);
      this.crown.material.needsUpdate = true;
    }
    this.rays.visible = Boolean(fx.rays);
    this.rays.material.color.copy(this.color);
    this.disc.visible = true;
    this.disc.material.color.copy(this.color);
  }

  phase(name) {
    if (!this.active) return;
    if (name === 'HighlightStarted') this.boost = 1.8;
    if (name === 'FreezeStarted') this.boost = 0.7;
    if (name === 'FinaleStarted') {
      this.boost = 1.4;
      this.burst(18);
    }
  }

  stop() {
    this.target = 0;
  }

  burst(n) {
    for (let k = 0; k < n; k++) this.spawnRiser(true);
  }

  spawnRiser(big = false) {
    const fx = this.active;
    if (!fx) return;
    const r = this.risers.find((x) => x.life <= 0);
    if (!r) return;
    const list = fx.rise ?? fx.orbit ?? ['✨'];
    r.s.material.map = this.tex(list[Math.floor(Math.random() * list.length)]);
    r.s.material.needsUpdate = true;
    const a = Math.random() * TAU;
    const rad = 0.25 + Math.random() * (big ? 1.1 : 0.6);
    r.x = Math.cos(a) * rad;
    r.z = Math.sin(a) * rad;
    r.y = 0.1 + Math.random() * 0.4;
    r.vy = (big ? 1.4 : 0.8) + Math.random() * 0.7;
    r.max = r.life = 1.8 + Math.random() * 1.0;
    r.phase = Math.random() * TAU;
    r.size = (big ? 0.35 : 0.24) + Math.random() * 0.16;
    r.s.visible = true;
  }

  // pos: vị trí chân người biểu diễn (null nếu không có), height: chiều cao người, camera: để đặt tia sáng ra sau lưng.
  update(dt, pos, height, camera) {
    this.time += dt;
    this.alpha += (this.target - this.alpha) * (1 - Math.exp(-dt * 3));
    this.boost += (1 - this.boost) * dt * 0.15;
    const fx = this.active;
    const a = this.alpha;
    if (!fx || a < 0.01 || !pos) {
      if (a < 0.01 && this.target === 0) this.active = null;
      this.group.visible = Boolean(fx && pos && a >= 0.01);
      if (!this.group.visible) return;
    }
    this.group.visible = true;
    const h = height || 1.7;
    const scale = fx.scale ?? 1;

    // Biểu tượng xoay quanh người (2 tầng đan nhau).
    this.angle += dt * (fx.orbitSpeed ?? 1.2) * this.boost;
    const count = fx.orbitCount ?? 8;
    for (let i = 0; i < count; i++) {
      const s = this.orbiters[i];
      const layer = i % 2;
      const ang = (layer ? -this.angle * 0.8 : this.angle) + (i * TAU) / count;
      const rad = (0.75 + 0.25 * layer) * scale * (h / 1.7) + 0.06 * Math.sin(this.time * 2 + i);
      s.position.set(pos.x + Math.cos(ang) * rad, pos.y + h * (0.35 + 0.4 * layer) + 0.12 * Math.sin(this.time * 2.4 + i * 1.7), pos.z + Math.sin(ang) * rad);
      const size = (fx.orbitSize ?? 0.32) * (0.9 + 0.1 * Math.sin(this.time * 3 + i));
      s.scale.set(size, size, 1);
      s.material.opacity = a;
    }

    // Biểu tượng bay lên.
    this.carry += dt * (fx.riseRate ?? 4) * this.boost * (this.target ? 1 : 0);
    while (this.carry >= 1) {
      this.carry -= 1;
      this.spawnRiser();
    }
    for (const r of this.risers) {
      if (r.life <= 0) {
        r.s.visible = false;
        continue;
      }
      r.life -= dt;
      r.y += r.vy * dt;
      const t = 1 - r.life / r.max;
      const fade = Math.min(1, t * 5) * Math.min(1, r.life / 0.6);
      r.s.position.set(pos.x + r.x + 0.12 * Math.sin(this.time * 2 + r.phase), pos.y + r.y, pos.z + r.z);
      r.s.scale.set(r.size, r.size, 1);
      r.s.material.opacity = fade * a;
    }

    // Vương miện trên đầu.
    if (this.crown.visible) {
      const cs = 0.5 * (h / 1.7);
      this.crown.position.set(pos.x, pos.y + h + 0.3 + 0.05 * Math.sin(this.time * 2.2), pos.z);
      this.crown.scale.set(cs, cs, 1);
      this.crown.material.opacity = a;
    }

    // Tia sáng xoay chậm, đặt lùi ra sau lưng người (theo hướng nhìn của camera).
    if (this.rays.visible) {
      tmp.set(pos.x - camera.position.x, 0, pos.z - camera.position.z).normalize();
      const rs = h * 2.6 * scale;
      this.rays.position.set(pos.x + tmp.x * 0.6, pos.y + h * 0.55, pos.z + tmp.z * 0.6);
      this.rays.scale.set(rs, rs, 1);
      this.rays.material.rotation += dt * 0.25;
      this.rays.material.opacity = 0.32 * a;
    }

    // Vòng sáng dưới chân.
    const ds = 2.4 * scale * (h / 1.7) * (fx.disc ?? 1);
    this.disc.position.set(pos.x, 0.025, pos.z);
    this.disc.scale.set(ds, 1, ds);
    this.disc.rotation.y += dt * 0.4;
    this.disc.material.opacity = 0.55 * a;
  }
}
