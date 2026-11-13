// Hiệu ứng: hoa giấy, cánh hoa, tia sáng, pháo hoa (3D, bể hạt cố định nên không rò bộ nhớ),
// cộng với hình nổ kiểu truyện tranh và tim bay (DOM).
import * as THREE from 'three';
import { DOT } from './world.js';

const CONFETTI = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585', '#ffffff', '#ffb3c6', '#c77dff'];
const PETALS = ['#ff7a9c', '#ffd1dc', '#e8344e', '#ffffff', '#ffb3c6'];

export class Effects {
  constructor(scene) {
    this.scene = scene;

    // Hoa giấy / cánh hoa: mảnh phẳng xoay khi rơi.
    this.maxFlakes = 700;
    this.flakes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 0.09), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: '#ffffff' }), this.maxFlakes);
    this.flakes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flakes.frustumCulled = false;
    this.flakeData = [];
    this.flakes.count = 0;
    scene.add(this.flakes);

    // Tia sáng / pháo hoa: điểm cộng màu, mờ dần bằng cách tối màu.
    this.maxSparks = 2400;
    const geo = new THREE.BufferGeometry();
    this.sparkPos = new Float32Array(this.maxSparks * 3);
    this.sparkCol = new Float32Array(this.maxSparks * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparks = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.2, map: DOT, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks.frustumCulled = false;
    this.sparkData = [];
    scene.add(this.sparks);
    this.rockets = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
  }

  // ---------------------------------------------------------------- Phát hạt

  confetti(at, count = 120, { colors = CONFETTI, spread = 1.4, up = 3.2 } = {}) {
    for (let i = 0; i < count; i++) {
      if (this.flakeData.length >= this.maxFlakes) this.flakeData.shift();
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      this.flakeData.push({
        p: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)),
        v: new THREE.Vector3(Math.cos(a) * r, up * (0.6 + Math.random() * 0.6), Math.sin(a) * r * 0.6),
        r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        w: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 2.6 + Math.random() * 1.6,
        t: 0,
        size: 0.8 + Math.random() * 0.6,
      });
    }
  }

  // Cánh hoa rơi từ trên xuống khắp khung hình.
  petals(count = 160) {
    for (let i = 0; i < count; i++) {
      if (this.flakeData.length >= this.maxFlakes) this.flakeData.shift();
      this.flakeData.push({
        p: new THREE.Vector3((Math.random() - 0.5) * 4.5, 4 + Math.random() * 3, -1 + Math.random() * 3),
        v: new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.6 - Math.random() * 0.5, 0),
        r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        w: new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5),
        color: PETALS[Math.floor(Math.random() * PETALS.length)],
        life: 6 + Math.random() * 2,
        t: -Math.random() * 1.5,
        size: 1.2 + Math.random() * 0.6,
        petal: true,
      });
    }
  }

  burst(at, count = 60, { colors = ['#fff3b0', '#ffd166', '#ffffff'], speed = 2.5, gravity = 1.5, life = 0.8 } = {}) {
    for (let i = 0; i < count; i++) {
      if (this.sparkData.length >= this.maxSparks) this.sparkData.shift();
      const v = new THREE.Vector3().randomDirection().multiplyScalar(speed * (0.5 + Math.random() * 0.6));
      this.sparkData.push({ p: at.clone(), v, color: new THREE.Color(colors[i % colors.length]), t: 0, life: life * (0.7 + Math.random() * 0.6), g: gravity, drag: 1.6 });
    }
  }

  // Pháo hoa: một tia bay lên rồi nổ.
  firework(from, to, colors) {
    this.rockets.push({ p: from.clone(), to: to.clone(), v: to.clone().sub(from).multiplyScalar(1 / 0.9), t: 0, colors });
  }

  fireworkShow(n = 7) {
    const sets = [['#ff4d6d', '#ffd166'], ['#4cc9f0', '#ffffff'], ['#f72585', '#ffb3c6'], ['#06d6a0', '#fff3b0'], ['#ffd166', '#ff9f1c'], ['#c77dff', '#ffffff']];
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const x = (i % 2 ? 1 : -1) * (0.4 + Math.random() * 1.3);
        this.firework(new THREE.Vector3(x * 0.7, 0, -0.6), new THREE.Vector3(x, 1.9 + Math.random() * 0.6, -0.7 + Math.random() * 0.4), sets[i % sets.length]);
      }, i * 380 + Math.random() * 200);
    }
  }

  // ---------------------------------------------------------------- Mỗi khung hình

  update(dt) {
    // Tên lửa pháo hoa.
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.t += dt;
      r.p.addScaledVector(r.v, dt);
      this.burst(r.p, 2, { colors: ['#fff3b0'], speed: 0.2, gravity: 0.5, life: 0.35 });
      if (r.t >= 0.9) {
        this.burst(r.to, 160, { colors: r.colors, speed: 2.8, gravity: 0.9, life: 1.6 });
        this.burst(r.to, 30, { colors: ['#ffffff'], speed: 1, gravity: 0.6, life: 0.7 });
        this.onBoom?.();
        this.rockets.splice(i, 1);
      }
    }

    // Tia sáng.
    let n = 0;
    for (let i = this.sparkData.length - 1; i >= 0; i--) {
      const s = this.sparkData[i];
      s.t += dt;
      if (s.t >= s.life) {
        this.sparkData.splice(i, 1);
        continue;
      }
      s.v.multiplyScalar(Math.exp(-s.drag * dt));
      s.v.y -= s.g * dt;
      s.p.addScaledVector(s.v, dt);
    }
    for (const s of this.sparkData) {
      const fade = 1 - s.t / s.life;
      const j = n * 3;
      this.sparkPos[j] = s.p.x;
      this.sparkPos[j + 1] = s.p.y;
      this.sparkPos[j + 2] = s.p.z;
      this.sparkCol[j] = s.color.r * fade;
      this.sparkCol[j + 1] = s.color.g * fade;
      this.sparkCol[j + 2] = s.color.b * fade;
      n++;
    }
    this.sparks.geometry.setDrawRange(0, n);
    this.sparks.geometry.attributes.position.needsUpdate = true;
    this.sparks.geometry.attributes.color.needsUpdate = true;

    // Hoa giấy.
    let f = 0;
    for (let i = this.flakeData.length - 1; i >= 0; i--) {
      const d = this.flakeData[i];
      d.t += dt;
      if (d.t >= d.life) this.flakeData.splice(i, 1);
    }
    for (const d of this.flakeData) {
      if (d.t < 0) continue;
      if (d.petal) {
        d.p.x += Math.sin(d.t * 2 + d.r.x) * 0.4 * dt;
      } else {
        d.v.multiplyScalar(Math.exp(-1.8 * dt));
        d.v.y -= 2.2 * dt;
        d.v.y = Math.max(d.v.y, -0.7);
        d.p.x += Math.sin(d.t * 5 + d.r.y) * 0.25 * dt;
      }
      d.p.addScaledVector(d.v, dt);
      d.r.addScaledVector(d.w, dt);
      const shrink = Math.min(1, (d.life - d.t) / 0.5);
      this.s.setScalar(d.size * shrink);
      this.m.compose(d.p, this.q.setFromEuler(this.e.set(d.r.x, d.r.y, d.r.z)), this.s);
      this.flakes.setMatrixAt(f, this.m);
      this.flakes.setColorAt(f, this.c.set(d.color));
      f++;
    }
    this.flakes.count = f;
    this.flakes.instanceMatrix.needsUpdate = true;
    if (this.flakes.instanceColor) this.flakes.instanceColor.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- DOM

const BURST_SVG = (fill, stroke) => {
  const pts = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const r = i % 2 ? 50 : 30 + Math.random() * 8;
    pts.push(`${100 + Math.cos(a) * r * 1.9},${100 + Math.sin(a) * r * 1.9}`);
  }
  return `<svg viewBox="0 0 200 200"><polygon points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="7" stroke-linejoin="round"/></svg>`;
};

export function comicBurst(layer, x, y, text, { fill = '#ffe14d', stroke = '#d1102e', size = 420 } = {}) {
  const el = document.createElement('div');
  el.className = 'comic';
  el.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;--rot:${(Math.random() - 0.5) * 24}deg`;
  el.innerHTML = `${BURST_SVG(fill, stroke)}<b>${text}</b>`;
  layer.append(el);
  setTimeout(() => el.remove(), 1200);
}

export function floatHearts(layer, x, y, n = 3) {
  const icons = ['❤️', '💖', '💕', '💗', '🌸'];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'float-heart';
    el.textContent = icons[Math.floor(Math.random() * icons.length)];
    el.style.cssText = `left:${x + (Math.random() - 0.5) * 220}px;top:${y}px;animation-delay:${i * 0.12}s;--dx:${(Math.random() - 0.5) * 160}px`;
    layer.append(el);
    setTimeout(() => el.remove(), 3200);
  }
}
