// Hạt bắn (nước, bụi, mồ hôi, kim tuyến) dùng chung một InstancedMesh, gợn sóng dùng một bể vòng tròn.
import * as THREE from 'three';

const MAX = 700;
const dummy = new THREE.Object3D();
const color = new THREE.Color();

export function createFx(scene) {
  const geo = new THREE.SphereGeometry(1, 6, 5);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0, transparent: true, opacity: 0.95 });
  const inst = new THREE.InstancedMesh(geo, material, MAX);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  inst.frustumCulled = false;
  inst.count = 0;
  for (let i = 0; i < MAX; i++) inst.setColorAt(i, color.set('#ffffff'));
  scene.add(inst);
  const parts = [];

  const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    m.renderOrder = 3;
    scene.add(m);
    rings.push({ mesh: m, age: 1, life: 1, size: 1 });
  }
  let ringNext = 0;

  function add(pos, vel, { life = 1, size = 0.08, gravity = 9.8, col = '#ffffff', drag = 0, water = false, grow = 0 } = {}) {
    if (parts.length >= MAX) parts.shift();
    parts.push({ p: pos.clone(), v: vel.clone(), life, age: 0, size, gravity, col: new THREE.Color(col), drag, water, grow });
  }

  function ripple(x, z, size = 1, life = 1.2, opacity = 0.7) {
    const r = rings[ringNext];
    ringNext = (ringNext + 1) % rings.length;
    r.mesh.position.set(x, 0.04, z);
    r.age = 0;
    r.life = life;
    r.size = size;
    r.opacity = opacity;
    r.mesh.visible = true;
  }

  const v = new THREE.Vector3();
  const api = {
    ripple,
    splash(pos, power = 1) {
      const n = Math.round(9 * power + 4);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = (0.8 + Math.random() * 1.6) * Math.sqrt(power);
        v.set(Math.cos(a) * s, 2.5 + Math.random() * 3.5 * Math.sqrt(power), Math.sin(a) * s);
        add(pos, v, { life: 0.9 + Math.random() * 0.5, size: 0.025 + Math.random() * 0.04 * Math.sqrt(power), col: Math.random() < 0.7 ? '#ffffff' : '#9fe6ff', water: true });
      }
      ripple(pos.x, pos.z, 0.8 * Math.sqrt(power), 1.1);
      ripple(pos.x, pos.z, 1.5 * Math.sqrt(power), 1.6, 0.45);
    },
    dust(pos) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        v.set(Math.cos(a) * 2.2, 0.4 + Math.random() * 0.6, Math.sin(a) * 2.2);
        add(pos, v, { life: 0.6, size: 0.12, gravity: 0, drag: 3.5, col: '#f2e2c4', grow: 0.25 });
      }
    },
    sweat(pos) {
      v.set((Math.random() - 0.5) * 2, 1.8 + Math.random(), (Math.random() - 0.5) * 2);
      add(pos, v, { life: 0.7, size: 0.05, col: '#7fd3ff' });
    },
    confetti(pos, n = 50) {
      const cols = ['#ff5a5a', '#ffd43b', '#51cf66', '#4dabf7', '#f783ac', '#ffffff'];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        v.set(Math.cos(a) * (1 + Math.random() * 2.5), 3 + Math.random() * 4, Math.sin(a) * (1 + Math.random() * 2.5));
        add(pos, v, { life: 1.6, size: 0.06, gravity: 6, drag: 1.2, col: cols[i % cols.length] });
      }
    },
    // Tia lấp lánh bay lên, nhẹ và tắt nhanh.
    sparkle(pos, n = 3, col = '#ffe066') {
      for (let i = 0; i < n; i++) {
        v.set((Math.random() - 0.5) * 1.4, 0.9 + Math.random() * 1.8, (Math.random() - 0.5) * 1.4);
        add(pos, v, { life: 0.7 + Math.random() * 0.5, size: 0.035 + Math.random() * 0.045, gravity: 0.6, col });
      }
    },
    // Cột nước phun thẳng lên.
    geyser(pos, n = 90) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 0.3 + Math.random() * 2.2;
        v.set(Math.cos(a) * s, 6 + Math.random() * 8, Math.sin(a) * s);
        add(pos, v, { life: 2.2, size: 0.03 + Math.random() * 0.05, col: Math.random() < 0.7 ? '#ffffff' : '#9fe6ff', water: true });
      }
    },
    // Đồng vàng bắn tung ra xung quanh.
    coins(pos, n = 60) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 1 + Math.random() * 3.2;
        v.set(Math.cos(a) * s, 5 + Math.random() * 6, Math.sin(a) * s);
        add(pos, v, { life: 2, size: 0.04 + Math.random() * 0.03, col: Math.random() < 0.75 ? '#ffc61a' : '#fff3bf', water: true });
      }
    },
    // Pháo hoa nổ tròn.
    burst(pos, col = '#ffd43b', n = 56) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const z = Math.random() * 2 - 1;
        const r = Math.sqrt(1 - z * z);
        const s = 3 + Math.random() * 1.6;
        v.set(Math.cos(a) * r * s, z * s, Math.sin(a) * r * s);
        add(pos, v, { life: 1.1 + Math.random() * 0.3, size: 0.05 + Math.random() * 0.03, gravity: 2.5, drag: 1.6, col: Math.random() < 0.8 ? col : '#ffffff' });
      }
    },
    update(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        q.age += dt;
        q.v.y -= q.gravity * dt;
        if (q.drag) q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
        q.p.addScaledVector(q.v, dt);
        if (q.age >= q.life || (q.water && q.p.y < 0 && q.v.y < 0)) parts.splice(i, 1);
      }
      inst.count = parts.length;
      for (let i = 0; i < parts.length; i++) {
        const q = parts[i];
        const k = 1 - q.age / q.life;
        dummy.position.copy(q.p);
        dummy.scale.setScalar(q.size * (q.grow ? 1 + (q.age / q.life) * q.grow * 10 : Math.min(1, k * 2.5)));
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
        inst.setColorAt(i, q.col);
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      for (const r of rings) {
        if (!r.mesh.visible) continue;
        r.age += dt;
        const k = r.age / r.life;
        if (k >= 1) {
          r.mesh.visible = false;
          continue;
        }
        r.mesh.scale.setScalar(r.size * (0.3 + k * 1.2));
        r.mesh.material.opacity = (1 - k) * r.opacity;
      }
    },
  };
  return api;
}
