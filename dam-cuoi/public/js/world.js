// Sảnh tiệc cưới kiểu nhà hàng lớn: vật liệu PBR, chiếu sáng bằng ảnh HDRI một sảnh tiệc thật (Poly Haven, CC0),
// sân khấu tròn mặt đá bóng, phông vải xếp ly có đèn hắt, rèm vén, cổng hoa hồng, chữ Hỷ mạ vàng, cột trụ;
// sảnh rộng có tường ốp phào, rèm nhung, trần ô kẻ, hàng đèn chùm pha lê, hai màn hình LED, cửa chính có cổng hoa,
// hàng chục bàn tiệc kín khách. Toàn bộ dựng bằng code; đồ lặp lại nhiều (bàn, ghế, hoa, đèn) vẽ bằng instancing.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Character } from './character.js';

export const SLOT = { groom: new THREE.Vector3(-0.62, 0, 0.35), bride: new THREE.Vector3(0.62, 0, 0.35) };
export const ENTRY = { groom: new THREE.Vector3(-3.3, 0, 0.55), bride: new THREE.Vector3(3.3, 0, 0.55) };
// Sân khấu bầu dục: tâm, bán kính ngang, bán kính sâu.
const STAGE = { z: -0.55, rx: 4.3, rz: 2.35 };
export const MC_SPOT = { nam: new THREE.Vector3(-1.8, 0, 1.2), nu: new THREE.Vector3(1.8, 0, 1.2) };
// Sảnh: nửa bề ngang, tường sân khấu, tường cửa chính, chiều cao trần, mặt sàn.
export const HALL = { hw: 14.6, front: -3.6, back: 30, h: 8.6, floor: -0.34 };
// Bàn tiệc: các cột (đối xứng hai bên lối đi) và các hàng.
const TABLE_X = [2.8, 5.8, 8.8, 11.8];
const TABLE_Z = [3.6, 6.55, 9.5, 12.45, 15.4, 18.35, 21.3];

// Số ngẫu nhiên có hạt giống: bày ghế trống, chọn chỗ giống nhau mỗi lần mở trang.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const DOT = canvasTexture(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
});

// ---------------------------------------------------------------- Vật liệu

const loader = new THREE.TextureLoader();
function tex(name, kind, repeat, srgb = false) {
  const t = loader.load(`/hall/${name}_${kind}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const M = {
  floor: new THREE.MeshStandardMaterial({ color: '#c9b8a6', map: tex('marble', 'color', [10, 10], true), normalMap: tex('marble', 'normal', [10, 10]), roughness: 0.32, metalness: 0.05, envMapIntensity: 1.2 }),
  stageTop: new THREE.MeshStandardMaterial({ color: '#e8dfdb', roughness: 0.12, metalness: 0.05, envMapIntensity: 1.4 }),
  stageSkirt: new THREE.MeshPhysicalMaterial({ color: '#f3d3dc', normalMap: tex('satin', 'normal', [12, 1]), roughness: 0.55, sheen: 0.8, sheenColor: new THREE.Color('#ffffff') }),
  carpet: new THREE.MeshStandardMaterial({ color: '#d02c4a', map: tex('velvet', 'color', [2, 12], true), normalMap: tex('velvet', 'normal', [2, 12]), roughnessMap: tex('velvet', 'rough', [2, 12]), roughness: 1 }),
  gold: new THREE.MeshStandardMaterial({ color: '#e8c36a', metalness: 1, roughness: 0.22, envMapIntensity: 1.5 }),
  goldLed: new THREE.MeshStandardMaterial({ color: '#ffe2a0', emissive: '#ffcf70', emissiveIntensity: 1.6 }),
  drape: new THREE.MeshPhysicalMaterial({ color: '#e9cfd7', normalMap: tex('satin', 'normal', [6, 3]), roughness: 0.6, sheen: 1, sheenColor: new THREE.Color('#fff4f7'), sheenRoughness: 0.5, side: THREE.DoubleSide }),
  curtain: new THREE.MeshPhysicalMaterial({ color: '#c9405f', normalMap: tex('velvet', 'normal', [3, 4]), roughness: 0.75, sheen: 1, sheenColor: new THREE.Color('#ff9fb4'), side: THREE.DoubleSide }),
  column: new THREE.MeshStandardMaterial({ color: '#f6f0ea', roughness: 0.35, envMapIntensity: 1.1 }),
  cloth: new THREE.MeshPhysicalMaterial({ color: '#fffaf6', normalMap: tex('satin', 'normal', [4, 2]), roughness: 0.5, sheen: 1, sheenColor: new THREE.Color('#ffffff') }),
  chairCover: new THREE.MeshPhysicalMaterial({ color: '#fbf7f3', roughness: 0.65, sheen: 0.8, sheenColor: new THREE.Color('#ffffff') }),
  sash: new THREE.MeshPhysicalMaterial({ color: '#f29bb2', roughness: 0.4, sheen: 1, sheenColor: new THREE.Color('#ffd0dc') }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, envMapIntensity: 2, depthWrite: false }),
  crystal: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.02, metalness: 0.6, envMapIntensity: 2.5, emissive: '#fff1d6', emissiveIntensity: 0.25 }),
  leaf: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, side: THREE.DoubleSide }),
  petal: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, side: THREE.DoubleSide }),
  wax: new THREE.MeshStandardMaterial({ color: '#fff6ea', roughness: 0.5, emissive: '#ffcf8a', emissiveIntensity: 0.15 }),
  backWall: new THREE.MeshStandardMaterial({ color: '#3a1420', roughness: 0.9 }),
  pilaster: new THREE.MeshStandardMaterial({ color: '#f1e6da', roughness: 0.45, envMapIntensity: 1.1 }),
  plate: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.18, envMapIntensity: 1.3 }),
  napkin: new THREE.MeshPhysicalMaterial({ color: '#e7869f', roughness: 0.6, sheen: 1, sheenColor: new THREE.Color('#ffd0dc') }),
  door: new THREE.MeshStandardMaterial({ color: '#4a2416', roughness: 0.45, metalness: 0.05 }),
  ledStrip: new THREE.MeshStandardMaterial({ color: '#ffd6c0', emissive: '#ffb48a', emissiveIntensity: 2.4 }),
};

// ---------------------------------------------------------------- Hình khối dùng chung

// Một bông hồng: nụ giữa và ba vòng cánh cong, gộp thành một hình (bán kính ~1).
const ROSE = (() => {
  const parts = [new THREE.SphereGeometry(0.45, 8, 6).scale(1, 1.15, 1).translate(0, 0.2, 0)];
  const rings = [[0.65, 5, 0.25], [1.0, 6, 0]];
  rings.forEach(([r, n, lift], ri) => {
    for (let i = 0; i < n; i++) {
      const g = new THREE.SphereGeometry(r, 6, 4, 0, (Math.PI * 2) / n + 0.5, 0.35, 1.35);
      g.rotateY((i / n) * Math.PI * 2 + ri * 0.6);
      g.translate(0, lift - 0.15, 0);
      parts.push(g);
    }
  });
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  merged.computeVertexNormals();
  return merged;
})();
const LEAF = (() => {
  const g = new THREE.PlaneGeometry(1, 2, 2, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const w = Math.cos((y / 2) * Math.PI) ** 0.8;
    p.setX(i, p.getX(i) * w);
    p.setZ(i, Math.abs(p.getX(i)) * 0.4 + y * y * 0.1);
  }
  g.computeVertexNormals();
  return g;
})();
const BABY = new THREE.IcosahedronGeometry(1, 0);

const ROSES = ['#f4efe9', '#f2c9d4', '#e98aa4', '#d9466c', '#b8173f', '#f7dbe2', '#c92a52', '#efb3c4'];
const LEAVES = ['#4f7f4a', '#5e8f55', '#3f6b3c'];

// Nhiều bông hoa trong một InstancedMesh: points là tâm, normals là hướng bông hoa nhìn ra.
function flowers(points, { size = 0.06, colors = ROSES, geo = ROSE, mat = M.petal, normals } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, points.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  points.forEach((p, i) => {
    const n = normals?.[i] ?? new THREE.Vector3().randomDirection().setY(Math.abs(Math.random()) + 0.3).normalize();
    q.setFromUnitVectors(up, n).multiply(new THREE.Quaternion().setFromAxisAngle(up, Math.random() * 6.28));
    const k = size * (0.75 + Math.random() * 0.5);
    s.set(k, k, k);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(colors[Math.floor(Math.random() * colors.length)]));
  });
  return mesh;
}

// Một bó hoa tròn: hoa hồng, lá, hoa baby trắng.
function flowerBall(group, center, radius, count = 40) {
  const roses = [];
  const normals = [];
  const leaves = [];
  const leafN = [];
  const baby = [];
  for (let i = 0; i < count; i++) {
    const d = new THREE.Vector3().randomDirection();
    d.y = Math.abs(d.y) * 0.9 + 0.1;
    d.normalize();
    roses.push(center.clone().addScaledVector(d, radius * (0.85 + Math.random() * 0.15)));
    normals.push(d);
    if (i % 2 === 0) {
      const e = new THREE.Vector3().randomDirection();
      e.y = Math.abs(e.y) * 0.5;
      leaves.push(center.clone().addScaledVector(e.normalize(), radius * 1.02));
      leafN.push(e);
    }
    if (i % 3 === 0) baby.push(center.clone().addScaledVector(new THREE.Vector3().randomDirection(), radius * 1.08));
  }
  group.add(flowers(roses, { size: radius * 0.24, normals }));
  group.add(flowers(leaves, { size: radius * 0.16, geo: LEAF, mat: M.leaf, colors: LEAVES, normals: leafN }));
  group.add(flowers(baby, { size: radius * 0.035, geo: BABY, colors: ['#ffffff', '#fff6f8'] }));
}

// Vải xếp ly: mặt phẳng nhiều nếp gấp dọc.
function pleated(width, height, pleatWidth, depth, segX = 240) {
  const g = new THREE.PlaneGeometry(width, height, segX, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / pleatWidth) * Math.PI * 2) * depth);
  g.computeVertexNormals();
  return g;
}

// Rèm vén: hẹp lại ở chỗ buộc dây, xòe ra ở trên và dưới.
function tiedCurtain(width, height, tieAt, side, segX = 60, segY = 40) {
  const g = new THREE.PlaneGeometry(width, height, segX, segY);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + width / 2; // 0..width tính từ mép ngoài
    const y = p.getY(i) + height / 2;
    const pinch = 1 - 0.62 * Math.exp(-(((y - tieAt) / (height * 0.22)) ** 2));
    p.setX(i, side * (x * pinch - width / 2));
    p.setZ(i, Math.sin((x / 0.18) * Math.PI) * 0.05 * (0.5 + pinch * 0.5) + (1 - pinch) * 0.18);
  }
  g.computeVertexNormals();
  return g;
}

// Bông hồng ít đa giác cho hoa trên hàng chục bàn tiệc (nhìn xa giống hệt bông đầy đủ).
const ROSE_LO = (() => {
  const parts = [new THREE.SphereGeometry(0.45, 6, 4).scale(1, 1.15, 1).translate(0, 0.2, 0)];
  [[0.68, 4, 0.22], [1.0, 5, 0]].forEach(([r, n, lift], ri) => {
    for (let i = 0; i < n; i++) {
      const g = new THREE.SphereGeometry(r, 5, 3, 0, (Math.PI * 2) / n + 0.5, 0.35, 1.35);
      g.rotateY((i / n) * Math.PI * 2 + ri * 0.6);
      g.translate(0, lift - 0.15, 0);
      parts.push(g);
    }
  });
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  merged.computeVertexNormals();
  return merged;
})();

// Gom đồ lặp lại (cùng hình, cùng chất liệu) thành một InstancedMesh: trăm cái ghế chỉ tốn một lượt vẽ.
class Batch {
  constructor() {
    this.sets = new Map();
  }

  add(geo, mat, pos, { scale = 1, rotY = 0, rotX = 0, shadow = false } = {}) {
    const key = `${geo.uuid}|${mat.uuid}`;
    if (!this.sets.has(key)) this.sets.set(key, { geo, mat, list: [], shadow: false });
    const set = this.sets.get(key);
    set.shadow ||= shadow;
    const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale;
    set.list.push(new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, 0, 'YXZ')), s));
  }

  build(scene) {
    for (const { geo, mat, list, shadow } of this.sets.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
}

// Gom hoa của mọi bó (bàn tiệc, trụ hoa, cổng hoa cửa chính) thành ba lượt vẽ: hồng, lá, hoa baby.
class Bouquets {
  constructor() {
    this.roses = [];
    this.leaves = [];
    this.baby = [];
  }

  push(list, p, n, size) {
    list.push({ p, n: n ?? new THREE.Vector3().randomDirection().setY(Math.random() + 0.3).normalize(), k: size * (0.75 + Math.random() * 0.5) });
  }

  ball(center, radius, count) {
    for (let i = 0; i < count; i++) {
      const d = new THREE.Vector3().randomDirection();
      d.y = Math.abs(d.y) * 0.9 + 0.1;
      d.normalize();
      this.push(this.roses, center.clone().addScaledVector(d, radius * (0.85 + Math.random() * 0.15)), d, radius * 0.27);
      if (i % 2 === 0) {
        const e = new THREE.Vector3().randomDirection();
        e.y = Math.abs(e.y) * 0.5;
        e.normalize();
        this.push(this.leaves, center.clone().addScaledVector(e, radius * 1.02), e, radius * 0.17);
      }
      if (i % 3 === 0) this.push(this.baby, center.clone().addScaledVector(new THREE.Vector3().randomDirection(), radius * 1.08), null, radius * 0.035);
    }
  }

  build(scene) {
    const make = (items, geo, mat, colors) => {
      const mesh = new THREE.InstancedMesh(geo, mat, items.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const c = new THREE.Color();
      items.forEach(({ p, n, k }, i) => {
        q.setFromUnitVectors(up, n).multiply(new THREE.Quaternion().setFromAxisAngle(up, Math.random() * 6.28));
        mesh.setMatrixAt(i, m.compose(p, q, new THREE.Vector3(k, k, k)));
        mesh.setColorAt(i, c.set(colors[Math.floor(Math.random() * colors.length)]));
      });
      scene.add(mesh);
    };
    make(this.roses, ROSE_LO, M.petal, ROSES);
    make(this.leaves, LEAF, M.leaf, LEAVES);
    make(this.baby, BABY, M.petal, ['#ffffff', '#fff6f8']);
  }
}

// Đốm sáng (bóng đèn, ngọn nến) gom thành một lớp Points.
function glowPoints(points, color, size) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap((p) => [p.x, p.y, p.z]), 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size, map: DOT, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
}

// Mặt tường ốp phào: chân tường gỗ, ô phào chỉ vàng, nền kem. Một ô ứng với một khoảng giữa hai cột ốp.
const WALL_TEX = canvasTexture(512, 1024, (g, w, h) => {
  g.fillStyle = '#eadbcc';
  g.fillRect(0, 0, w, h);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(120,70,60,0.18)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(90,50,40,0.12)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // Chân tường.
  g.fillStyle = '#7a3b34';
  g.fillRect(0, h * 0.86, w, h * 0.14);
  g.strokeStyle = '#d7b46a';
  g.lineWidth = 6;
  g.strokeRect(36, h * 0.875, w - 72, h * 0.1);
  g.fillStyle = '#d7b46a';
  g.fillRect(0, h * 0.855, w, 8);
  // Ô phào lớn và ô nhỏ phía trên.
  g.lineWidth = 7;
  g.strokeRect(70, h * 0.3, w - 140, h * 0.5);
  g.lineWidth = 3;
  g.strokeRect(92, h * 0.32, w - 184, h * 0.46);
  g.lineWidth = 6;
  g.strokeRect(70, h * 0.07, w - 140, h * 0.18);
  // Hoa văn tròn giữa ô lớn.
  g.lineWidth = 4;
  g.beginPath();
  g.arc(w / 2, h * 0.55, 60, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(w / 2, h * 0.55, 36, 0, Math.PI * 2);
  g.stroke();
});
WALL_TEX.wrapS = THREE.RepeatWrapping;

// Trần ô kẻ: ô vuông lõm, viền chỉ vàng.
const CEIL_TEX = canvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#d9c8b8';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#efe4d8';
  g.fillRect(18, 18, w - 36, h - 36);
  g.strokeStyle = '#c9a25a';
  g.lineWidth = 4;
  g.strokeRect(18, 18, w - 36, h - 36);
  g.lineWidth = 2;
  g.strokeRect(34, 34, w - 68, h - 68);
});
CEIL_TEX.wrapS = CEIL_TEX.wrapT = THREE.RepeatWrapping;

export class Hall {
  constructor(scene) {
    this.scene = scene;
    this.guests = [];
    this.twinkles = [];
    this.build();
  }

  // Ảnh HDRI một sảnh tiệc thật chiếu sáng và phản chiếu lên mọi vật liệu (không hiện làm nền).
  async loadEnvironment(renderer) {
    try {
      const hdr = await new HDRLoader().loadAsync('/hall/env.hdr');
      const pmrem = new THREE.PMREMGenerator(renderer);
      this.scene.environment = pmrem.fromEquirectangular(hdr).texture;
      this.scene.environmentIntensity = 0.55;
      hdr.dispose();
      pmrem.dispose();
    } catch (err) {
      console.error('Không tải được ảnh chiếu sáng HDRI', err);
    }
  }

  build() {
    const S = this.scene;
    S.background = new THREE.Color('#1e0910');
    S.fog = new THREE.Fog('#2e1418', 34, 85);
    this.batch = new Batch();
    this.bouquets = new Bouquets();
    this.flames = [];
    this.bulbs = [];

    // ---------- Ánh sáng
    S.add(new THREE.HemisphereLight('#fff1f4', '#3a1a22', 0.35));
    // Ánh đèn trần ấm trải đều khắp sảnh để các bàn xa vẫn rõ người.
    const ceilingLight = new THREE.DirectionalLight('#ffe6cf', 0.75);
    ceilingLight.position.set(0, 10, 18);
    ceilingLight.target.position.set(0, 0, 10);
    S.add(ceilingLight, ceilingLight.target);
    const key = new THREE.SpotLight('#fff3e6', 150, 30, 0.3, 0.7, 1.6);
    key.position.set(1.2, 7.5, 7.5);
    key.target.position.set(0, 0.9, 0.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.camera.near = 4;
    key.shadow.camera.far = 20;
    S.add(key, key.target);
    const fill = new THREE.DirectionalLight('#ffe9ef', 0.8);
    fill.position.set(-4, 4, 8);
    S.add(fill);
    const rim = new THREE.DirectionalLight('#ffb6c8', 1.2);
    rim.position.set(2, 5, -6);
    S.add(rim);
    // Đèn hắt từ sàn lên phông vải.
    [[-2.4, '#ff5c93'], [-1.2, '#ffb36b'], [0, '#ff7aa8'], [1.2, '#ffb36b'], [2.4, '#ff5c93']].forEach(([x, color]) => {
      const up = new THREE.SpotLight(color, 40, 8, 0.45, 0.8, 1.4);
      up.position.set(x, 0.05, -2.3);
      up.target.position.set(x * 1.05, 4, -2.95);
      S.add(up, up.target);
    });

    // ---------- Vỏ sảnh: sàn đá, tường, trần, đèn chùm, màn hình LED, cửa chính
    this.room();

    // ---------- Thảm đỏ chạy suốt từ cửa chính tới sân khấu
    const aisleFrom = STAGE.z + STAGE.rz + 0.4;
    const aisleLen = HALL.back - aisleFrom;
    const aisleZ = aisleFrom + aisleLen / 2;
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(1.5, aisleLen), M.carpet);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, -0.333, aisleZ);
    carpet.receiveShadow = true;
    S.add(carpet);
    for (const x of [-0.77, 0.77]) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, aisleLen), M.gold);
      trim.position.set(x, -0.33, aisleZ);
      S.add(trim);
    }

    // ---------- Sân khấu tròn: mặt đá bóng, viền đèn vàng, váy satin xếp ly, bậc thang phủ thảm.
    const stage = new THREE.Group();
    stage.position.set(0, 0, STAGE.z);
    stage.scale.set(1, 1, STAGE.rz / STAGE.rx);
    const R = STAGE.rx;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.04, 72), M.stageTop);
    top.position.y = -0.02;
    top.receiveShadow = true;
    stage.add(top);
    const skirtGeo = new THREE.CylinderGeometry(R + 0.02, R + 0.06, 0.3, 180, 1, true);
    const sp = skirtGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const a = Math.atan2(sp.getZ(i), sp.getX(i));
      const k = 1 + Math.sin(a * 60) * 0.004;
      sp.setX(i, sp.getX(i) * k);
      sp.setZ(i, sp.getZ(i) * k);
    }
    skirtGeo.computeVertexNormals();
    const skirt = new THREE.Mesh(skirtGeo, M.stageSkirt);
    skirt.position.y = -0.19;
    stage.add(skirt);
    const led = new THREE.Mesh(new THREE.TorusGeometry(R + 0.01, 0.018, 6, 160), M.goldLed);
    led.rotation.x = Math.PI / 2;
    stage.add(led);
    S.add(stage);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(2.0, 48), M.carpet);
    rug.rotation.x = -Math.PI / 2;
    rug.scale.y = 0.42;
    rug.position.set(0, 0.003, 0.25);
    rug.receiveShadow = true;
    S.add(rug);
    for (let i = 0; i < 2; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.11, 0.3), M.carpet);
      step.position.set(0, -0.34 + 0.055 + i * 0.11, STAGE.z + STAGE.rz + 0.3 - i * 0.24);
      step.receiveShadow = true;
      S.add(step);
    }

    // ---------- Phông: tường tối phía sau, vải xếp ly trắng hồng có đèn hắt, rèm đỏ vén hai bên.
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(HALL.hw * 2, HALL.h), M.backWall);
    wall.position.set(0, HALL.floor + HALL.h / 2, HALL.front);
    S.add(wall);
    const drape = new THREE.Mesh(pleated(7.2, 6.5, 0.34, 0.06), M.drape);
    drape.position.set(0, 2.9, -3.0);
    drape.receiveShadow = true;
    S.add(drape);
    const valance = new THREE.Mesh(pleated(7.6, 0.7, 0.22, 0.05), M.curtain);
    valance.position.set(0, 5.9, -2.9);
    S.add(valance);
    for (const side of [-1, 1]) {
      const c = new THREE.Mesh(tiedCurtain(1.5, 6.4, 1.6, side), M.curtain);
      c.position.set(side * 3.1, 2.9, -2.75);
      S.add(c);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 8, 20), M.gold);
      tie.position.set(side * 3.35, 1.55, -2.55);
      tie.rotation.y = Math.PI / 2;
      S.add(tie);
    }

    // Rèm đèn lấp lánh trước phông.
    const lights = [];
    const lightColors = [];
    const c = new THREE.Color();
    for (let i = 0; i < 40; i++) {
      const x = -3.2 + i * 0.165;
      const len = 2.5 + Math.random() * 3;
      for (let y = 6.1; y > 6.1 - len; y -= 0.2) {
        lights.push(x + Math.sin(y * 2 + i) * 0.02, y, -2.88);
        c.set(Math.random() < 0.85 ? '#ffe6bd' : '#ffc2d4');
        lightColors.push(c.r, c.g, c.b);
      }
    }
    const fairy = new THREE.BufferGeometry();
    fairy.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3));
    fairy.setAttribute('color', new THREE.Float32BufferAttribute(lightColors, 3));
    this.fairy = new THREE.Points(fairy, new THREE.PointsMaterial({ size: 0.07, map: DOT, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    S.add(this.fairy);

    // ---------- Cổng hoa hồng
    const arch = new THREE.Group();
    const archCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.6, 0, -1.25), new THREE.Vector3(-1.58, 1.4, -1.3), new THREE.Vector3(-1.1, 2.3, -1.35),
      new THREE.Vector3(0, 2.62, -1.4), new THREE.Vector3(1.1, 2.3, -1.35), new THREE.Vector3(1.58, 1.4, -1.3), new THREE.Vector3(1.6, 0, -1.25),
    ]);
    arch.add(new THREE.Mesh(new THREE.TubeGeometry(archCurve, 80, 0.035, 8), M.gold));
    const roses = [];
    const rn = [];
    const leaves = [];
    const ln = [];
    const baby = [];
    for (let i = 0; i < 640; i++) {
      // Hoa dày ở hai chân và đỉnh vòm, thưa ở giữa hai bên như cổng hoa thật.
      let u = Math.random();
      if (Math.random() < 0.45) u = Math.random() < 0.5 ? Math.random() * 0.18 : 1 - Math.random() * 0.18;
      const p = archCurve.getPoint(u);
      const t = archCurve.getTangent(u);
      const outward = new THREE.Vector3(t.y, -t.x, 0).normalize();
      const thick = 0.12 + 0.16 * (Math.abs(u - 0.5) > 0.32 ? 1 : 0.6);
      const d = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, Math.random() * 1.2 - 0.2).normalize();
      const pos = p.clone().addScaledVector(d, thick * (0.6 + Math.random() * 0.5));
      const n = d.clone().add(new THREE.Vector3(0, 0, 0.8)).add(outward.multiplyScalar(0.2)).normalize();
      if (i % 3 === 2) {
        leaves.push(pos);
        ln.push(n);
      } else {
        roses.push(pos);
        rn.push(n);
      }
      if (i % 3 === 0) baby.push(p.clone().addScaledVector(new THREE.Vector3().randomDirection(), thick * 1.25));
    }
    arch.add(flowers(roses, { size: 0.052, normals: rn }));
    arch.add(flowers(leaves, { size: 0.05, geo: LEAF, mat: M.leaf, colors: LEAVES, normals: ln }));
    arch.add(flowers(baby, { size: 0.012, geo: BABY, colors: ['#ffffff'] }));
    S.add(arch);

    // Chữ Hỷ mạ vàng trên đĩa nhung đỏ.
    const hyMask = canvasTexture(512, 512, (g) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, 512, 512);
      g.fillStyle = '#fff';
      g.font = 'bold 360px "Microsoft YaHei", "SimHei", serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('囍', 256, 276);
    });
    hyMask.colorSpace = THREE.NoColorSpace;
    const hy = new THREE.Group();
    hy.position.set(0, 2.02, -1.45);
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 48), new THREE.MeshStandardMaterial({ color: '#8a0f26', roughness: 0.7, normalMap: M.curtain.normalMap }));
    disk.rotation.x = Math.PI / 2;
    hy.add(disk);
    hy.add(new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.018, 8, 64), M.gold));
    const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshStandardMaterial({ color: '#d9a43c', metalness: 1, roughness: 0.3, alphaMap: hyMask, transparent: true, envMapIntensity: 1.3 }));
    glyph.position.z = 0.02;
    hy.add(glyph);
    S.add(hy);
    this.hy = hy;

    // ---------- Cột trụ hai bên
    const colProfile = [[0, 0], [0.32, 0], [0.32, 0.12], [0.26, 0.18], [0.22, 0.24], [0.2, 0.3], [0.2, 4.6], [0.24, 4.7], [0.3, 4.82], [0.34, 4.92], [0.34, 5.05], [0, 5.05]].map(([x, y]) => new THREE.Vector2(x, y));
    const colGeo = new THREE.LatheGeometry(colProfile, 32);
    for (const [x, z] of [[-2.7, -2.35], [2.7, -2.35], [-4.6, 1.3], [4.6, 1.3]]) {
      const col = new THREE.Mesh(colGeo, M.column);
      col.position.set(x, -0.34, z);
      col.castShadow = true;
      S.add(col);
      for (const y of [0.2, 4.55]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.02, 8, 32), M.gold);
        band.rotation.x = Math.PI / 2;
        band.position.set(x, y - 0.34, z);
        S.add(band);
      }
      const garland = new THREE.Group();
      flowerBall(garland, new THREE.Vector3(x, 1.4, z + 0.18), 0.22, 26);
      S.add(garland);
    }

    // ---------- Đèn chùm pha lê: ba chiếc trên sân khấu, hai hàng chiếc lớn trên khu bàn tiệc
    const lamps = [[-1.6, 4.2, -0.6, 0.8], [1.6, 4.2, -0.6, 0.8], [0, 4.6, 2.2, 1.1]];
    for (const z of [7.5, 14]) lamps.push([0, 5.9, z, 1.55]);
    for (const z of [5.2, 11.2, 17.2, 23.2]) for (const x of [-7.3, 7.3]) lamps.push([x, 5.5, z, 1.45]);
    this.chandeliers(lamps);

    // ---------- Trụ hoa lớn hai bên cổng, trụ hoa nến dọc suốt lối đi
    for (const side of [-1, 1]) {
      this.flowerStand(side * 2.05, -1.55, 1.25, 0.34, false);
      this.flowerStand(side * 1.05, STAGE.z + STAGE.rz + 0.15, 0.75, 0.17, true);
      for (let z = 3.3; z < HALL.back - 2.5; z += 2.2) this.flowerStand(side * 1.05, z, 0.75, 0.17, true);
    }

    // ---------- Bàn tiệc kín hai bên lối đi (khách ngồi khi nhân vật người thật tải xong)
    this.tables();

    this.batch.build(S);
    this.bouquets.build(S);
    this.flameGlow = glowPoints(this.flames, '#ffbf66', 0.13);
    this.bulbGlow = glowPoints(this.bulbs, '#ffd9a0', 0.16);
    S.add(this.flameGlow, this.bulbGlow);

    this.setGuests((kind, opts) => new Character(kind, { ...opts, scale: 0.78 }));
  }

  // Sàn, tường ốp phào có cột và rèm nhung, trần ô kẻ có dải đèn, hai màn hình LED, cửa chính có cổng hoa.
  room() {
    const S = this.scene;
    const { hw, front, back, h, floor: fy } = HALL;
    const depth = back - front;
    const midZ = (front + back) / 2;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, depth), M.floor);
    for (const t of [M.floor.map, M.floor.normalMap]) t.repeat.set(hw / 2, depth / 4);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, fy, midZ);
    floor.receiveShadow = true;
    S.add(floor);

    // Tường hai bên và tường cửa chính, mỗi khoảng 4,2 m một ô phào.
    const bay = 4.2;
    const wallMat = (repeat) => {
      const t = WALL_TEX.clone();
      t.repeat.set(repeat, 1);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.75, envMapIntensity: 0.8 });
    };
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(depth, h), wallMat(depth / bay));
      w.rotation.y = -side * Math.PI / 2;
      w.position.set(side * hw, fy + h / 2, midZ);
      S.add(w);
    }
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, h), wallMat((hw * 2) / bay));
    backWall.rotation.y = Math.PI;
    backWall.position.set(0, fy + h / 2, back);
    S.add(backWall);

    // Cột ốp, đèn tường và rèm nhung vén dọc hai tường bên.
    const pil = new THREE.BoxGeometry(0.62, h, 0.26);
    const cap = new THREE.BoxGeometry(0.78, 0.22, 0.36);
    const sconce = new THREE.CylinderGeometry(0.12, 0.05, 0.16, 12);
    const curtainL = tiedCurtain(1.3, h - 0.9, 2.4, -1, 18, 16);
    const curtainR = tiedCurtain(1.3, h - 0.9, 2.4, 1, 18, 16);
    const curtainMat = M.curtain.clone();
    curtainMat.color.set('#7d1730');
    const b = this.batch;
    for (const side of [-1, 1]) {
      for (let z = front + 2.1; z < back - 0.5; z += bay) {
        const x = side * (hw - 0.13);
        const yaw = -side * Math.PI / 2;
        b.add(pil, M.pilaster, new THREE.Vector3(x, fy + h / 2, z), { rotY: yaw });
        for (const y of [fy + h - 0.5, fy + 0.25]) b.add(cap, M.gold, new THREE.Vector3(x, y, z), { rotY: yaw });
        b.add(sconce, M.gold, new THREE.Vector3(side * (hw - 0.4), fy + 3.4, z), {});
        this.bulbs.push(new THREE.Vector3(side * (hw - 0.4), fy + 3.55, z));
        // Rèm vén hai bên cột: mép ngoài sát cột.
        const cy = fy + (h - 0.9) / 2 + 0.05;
        b.add(curtainL, curtainMat, new THREE.Vector3(side * (hw - 0.3), cy, z - 0.95), { rotY: yaw });
        b.add(curtainR, curtainMat, new THREE.Vector3(side * (hw - 0.3), cy, z + 0.95), { rotY: yaw });
      }
    }

    // Trần ô kẻ, hai dải đèn hắt chạy dọc sảnh.
    const ceilMat = new THREE.MeshStandardMaterial({ map: CEIL_TEX, roughness: 0.85, envMapIntensity: 0.6 });
    CEIL_TEX.repeat.set((hw * 2) / 2.4, depth / 2.4);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, depth), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, fy + h, midZ);
    S.add(ceil);
    const strip = new THREE.BoxGeometry(0.12, 0.05, depth - 3);
    for (const x of [-3.9, 3.9, -10.6, 10.6]) b.add(strip, M.ledStrip, new THREE.Vector3(x, fy + h - 0.03, midZ + 1), {});
    // Đèn âm trần.
    for (let z = 1; z < back; z += 3) for (const x of [-12.6, -9, -5.4, 5.4, 9, 12.6]) this.bulbs.push(new THREE.Vector3(x, fy + h - 0.06, z));

    // Hai màn hình LED hai bên sân khấu.
    this.screen = canvasTexture(1024, 576, () => {});
    const screenMat = new THREE.MeshBasicMaterial({ map: this.screen });
    this.drawScreen();
    for (const side of [-1, 1]) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(5.3, 3.1, 0.12), M.gold);
      frame.position.set(side * 9, fy + 3.9, front + 0.08);
      S.add(frame);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 2.8), screenMat);
      s.position.set(side * 9, fy + 3.9, front + 0.15);
      S.add(s);
    }

    // Cửa chính: hai cánh gỗ, khung và tay nắm mạ vàng, cổng hoa phía trên, hai trụ hoa lớn.
    const doorGeo = new THREE.BoxGeometry(1.3, 3.4, 0.08);
    for (const side of [-1, 1]) {
      b.add(doorGeo, M.door, new THREE.Vector3(side * 0.67, fy + 1.7, back - 0.05), {});
      b.add(new THREE.BoxGeometry(0.04, 0.5, 0.04), M.gold, new THREE.Vector3(side * 0.12, fy + 1.6, back - 0.12), {});
      b.add(new THREE.BoxGeometry(0.12, 3.6, 0.14), M.gold, new THREE.Vector3(side * 1.4, fy + 1.8, back - 0.06), {});
    }
    b.add(new THREE.BoxGeometry(2.92, 0.14, 0.14), M.gold, new THREE.Vector3(0, fy + 3.55, back - 0.06), {});
    const gate = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.0, fy, back - 0.5), new THREE.Vector3(-2.0, fy + 2.4, back - 0.5), new THREE.Vector3(-1.3, fy + 3.9, back - 0.5),
      new THREE.Vector3(0, fy + 4.4, back - 0.5), new THREE.Vector3(1.3, fy + 3.9, back - 0.5), new THREE.Vector3(2.0, fy + 2.4, back - 0.5), new THREE.Vector3(2.0, fy, back - 0.5),
    ]);
    S.add(new THREE.Mesh(new THREE.TubeGeometry(gate, 60, 0.04, 8), M.gold));
    const bq = this.bouquets;
    for (let i = 0; i < 420; i++) {
      let u = Math.random();
      if (Math.random() < 0.45) u = Math.random() < 0.5 ? Math.random() * 0.2 : 1 - Math.random() * 0.2;
      const p = gate.getPoint(u);
      const d = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, -Math.random() * 1.2 + 0.2).normalize();
      const pos = p.clone().addScaledVector(d, 0.22 * (0.6 + Math.random() * 0.5));
      const n = d.clone().add(new THREE.Vector3(0, 0, -0.8)).normalize();
      bq.push(i % 3 === 2 ? bq.leaves : bq.roses, pos, n, 0.075);
      if (i % 3 === 0) bq.push(bq.baby, p.clone().addScaledVector(new THREE.Vector3().randomDirection(), 0.3), null, 0.016);
    }
    for (const side of [-1, 1]) this.flowerStand(side * 2.7, back - 0.9, 1.3, 0.36, false, fy);
  }

  // Mọi đèn chùm gộp chung: khung vàng một khối, pha lê một lượt instancing, bóng đèn một lớp đốm sáng.
  chandeliers(list) {
    const frames = [];
    const drops = [];
    const ceiling = HALL.floor + HALL.h;
    for (const [x, y, z, s] of list) {
      const at = (gx, gy, gz) => new THREE.Vector3(x + gx * s, y + gy * s, z + gz * s);
      const rodLen = Math.min(ceiling, y + 2.4 * s) - y;
      frames.push(new THREE.CylinderGeometry(0.012 * s, 0.012 * s, rodLen, 6).translate(x, y + rodLen / 2, z));
      [[0.55, 0, 22], [0.4, -0.22, 16], [0.24, -0.42, 10]].forEach(([r, ry, n]) => {
        frames.push(new THREE.TorusGeometry(r * s, 0.012 * s, 6, 48).rotateX(Math.PI / 2).translate(x, y + ry * s, z));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          for (let k = 0; k < 3; k++) drops.push([at(Math.cos(a) * r, ry - 0.06 - k * 0.07, Math.sin(a) * r), s]);
          if (i % 2 === 0) this.bulbs.push(at(Math.cos(a) * r, ry + 0.06, Math.sin(a) * r));
        }
      });
      drops.push([at(0, -0.62, 0), s * 3.5]);
    }
    this.scene.add(new THREE.Mesh(mergeGeometries(frames.map((g) => g.toNonIndexed())), M.gold));
    const crystals = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), M.crystal, drops.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    drops.forEach(([p, s], i) => crystals.setMatrixAt(i, m.compose(p, q, new THREE.Vector3(0.018 * s, 0.034 * s, 0.018 * s))));
    this.scene.add(crystals);
  }

  // Trụ hoa: trụ kính lõi vàng, bó hoa trên đỉnh; trụ dọc lối đi có thêm cốc nến.
  flowerStand(x, z, height, ball, candle, base = null) {
    const y0 = base ?? (candle ? HALL.floor : 0);
    const b = this.batch;
    const G = (Hall.standGeo ??= {
      stem: new THREE.CylinderGeometry(0.05, 0.05, 1, 16, 1, true),
      core: new THREE.CylinderGeometry(0.012, 0.012, 1, 6),
      base: new THREE.CylinderGeometry(0.15, 0.19, 0.05, 24),
      cup: new THREE.CylinderGeometry(0.13, 0.07, 0.08, 24),
      glassCup: new THREE.CylinderGeometry(0.06, 0.06, 0.16, 16, 1, true),
      wax: new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12),
    });
    const tall = new THREE.Vector3(1, height, 1);
    b.add(G.stem, M.glass, new THREE.Vector3(x, y0 + height / 2, z), { scale: tall });
    b.add(G.core, M.gold, new THREE.Vector3(x, y0 + height / 2, z), { scale: tall });
    b.add(G.base, M.gold, new THREE.Vector3(x, y0 + 0.025, z));
    b.add(G.cup, M.gold, new THREE.Vector3(x, y0 + height, z));
    this.bouquets.ball(new THREE.Vector3(x, y0 + height + ball * 0.75, z), ball, candle ? 18 : 60);
    if (candle) {
      const top = y0 + height + ball * 1.75;
      b.add(G.glassCup, M.glass, new THREE.Vector3(x, top + 0.08, z));
      b.add(G.wax, M.wax, new THREE.Vector3(x, top + 0.04, z));
      this.flames.push(new THREE.Vector3(x, top + 0.12, z));
    }
  }

  // Bàn tiệc tròn: khăn satin rủ chấm đất, đĩa, khăn ăn, bình hoa nến giữa bàn, tám ghế bọc vải nơ hồng.
  // Mọi bàn chung một bộ hình, vẽ bằng instancing. Ghi lại chỗ ngồi để xếp khách.
  tables() {
    const b = this.batch;
    const fy = HALL.floor;
    const profile = [[0, 0], [0.86, 0.0], [0.84, 0.2], [0.8, 0.5], [0.76, 0.74], [0.72, 0.78], [0, 0.78]].map(([a, c]) => new THREE.Vector2(a, c));
    const clothGeo = new THREE.LatheGeometry(profile, 48);
    const p = clothGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > 0.74) continue;
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const k = 1 + Math.sin(a * 16) * 0.025 * (1 - y / 0.74);
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    clothGeo.computeVertexNormals();
    // Tám ghế gộp thành hai khối (vải bọc, nơ), dùng chung cho mọi bàn.
    const covers = [];
    const sashes = [];
    const plates = [];
    const napkins = [];
    const chairs = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const chair = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * 1.15, 0, Math.sin(a) * 1.15), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a - Math.PI / 2), new THREE.Vector3(1, 1, 1));
      chairs.push({ dx: Math.cos(a) * 1.08, dz: Math.sin(a) * 1.08, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) });
      const at = (x, y, z) => chair.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));
      covers.push(new THREE.BoxGeometry(0.44, 0.47, 0.44).applyMatrix4(at(0, 0.235, 0)));
      covers.push(new THREE.BoxGeometry(0.44, 0.55, 0.08).applyMatrix4(at(0, 0.74, 0.2)));
      sashes.push(new THREE.BoxGeometry(0.46, 0.08, 0.1).applyMatrix4(at(0, 0.62, 0.2)));
      for (const side of [-1, 1]) sashes.push(new THREE.TorusGeometry(0.06, 0.02, 6, 12).rotateY(side * 0.5).applyMatrix4(at(side * 0.05, 0.62, 0.27)));
      plates.push(new THREE.CylinderGeometry(0.12, 0.1, 0.02, 20).translate(Math.cos(a) * 0.6, 0.79, Math.sin(a) * 0.6));
      napkins.push(new THREE.ConeGeometry(0.04, 0.13, 6).translate(Math.cos(a) * 0.6, 0.865, Math.sin(a) * 0.6));
    }
    const merge = (list) => mergeGeometries(list.map((x) => x.toNonIndexed()));
    const G = { covers: merge(covers), sashes: merge(sashes), plates: merge(plates), napkins: merge(napkins) };
    const vase = new THREE.CylinderGeometry(0.06, 0.09, 0.2, 16);
    const wax = new THREE.CylinderGeometry(0.025, 0.025, 0.14, 10);
    this.seats = [];
    this.tableSpots = [];
    let ti = 0;
    for (const z of TABLE_Z) {
      for (const ax of TABLE_X) {
        for (const x of [-ax, ax]) {
          const at = new THREE.Vector3(x, fy, z);
          const turn = (ti % 3) * 0.13;
          b.add(clothGeo, M.cloth, at, { shadow: true });
          b.add(G.covers, M.chairCover, at, { rotY: turn });
          b.add(G.sashes, M.sash, at, { rotY: turn });
          b.add(G.plates, M.plate, at, { rotY: turn });
          b.add(G.napkins, M.napkin, at, { rotY: turn });
          b.add(vase, M.gold, new THREE.Vector3(x, fy + 0.88, z));
          this.bouquets.ball(new THREE.Vector3(x, fy + 0.98, z), 0.16, 14);
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 + ti;
            b.add(wax, M.wax, new THREE.Vector3(x + Math.cos(a) * 0.32, fy + 0.85, z + Math.sin(a) * 0.32));
            this.flames.push(new THREE.Vector3(x + Math.cos(a) * 0.32, fy + 0.95, z + Math.sin(a) * 0.32));
          }
          const cos = Math.cos(turn);
          const sin = Math.sin(turn);
          // rotY quay ghế theo chiều kim đồng hồ nhìn từ trên: (dx, dz) → (dx·cos + dz·sin, −dx·sin + dz·cos).
          const spots = chairs.map((c) => ({ x: x + c.dx * cos + c.dz * sin, z: z - c.dx * sin + c.dz * cos, yaw: c.yaw + turn, table: ti }));
          this.seats.push(...spots);
          this.tableSpots.push({ x, z });
          ti++;
        }
      }
    }
  }

  // Màn hình LED: chữ Lễ Thành Hôn và tên cô dâu chú rể đang giữ vai.
  setCoupleNames(groom, bride) {
    const key = `${groom ?? ''}|${bride ?? ''}`;
    if (key === this.screenKey) return;
    this.screenKey = key;
    this.drawScreen(groom, bride);
  }

  drawScreen(groom, bride) {
    const c = this.screen.image;
    const g = c.getContext('2d');
    const w = c.width;
    const h = c.height;
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#5a0d24');
    bg.addColorStop(0.5, '#b0244c');
    bg.addColorStop(1, '#5a0d24');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,220,230,0.12)';
    for (let i = 0; i < 26; i++) {
      const x = (i * 197) % w;
      const y = (i * 131) % h;
      g.font = `${30 + (i % 4) * 14}px serif`;
      g.fillText('♥', x, y);
    }
    g.strokeStyle = '#f2cf7a';
    g.lineWidth = 10;
    g.strokeRect(24, 24, w - 48, h - 48);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#f6d98a';
    g.font = 'bold 120px "Microsoft YaHei", "SimHei", serif';
    g.fillText('囍', w / 2, 140);
    g.fillStyle = '#ffffff';
    g.font = 'bold 84px "Be Vietnam Pro", "Segoe UI", sans-serif';
    g.fillText('LỄ THÀNH HÔN', w / 2, 290);
    const names = groom && bride ? `${groom} ♥ ${bride}` : groom || bride ? `${groom || '…'} ♥ ${bride || '…'}` : 'Chúc mừng hạnh phúc';
    g.fillStyle = '#ffe3ea';
    let size = 64;
    do {
      g.font = `600 ${size}px "Be Vietnam Pro", "Segoe UI", sans-serif`;
      size -= 4;
    } while (g.measureText(names).width > w - 120 && size > 28);
    g.fillText(names, w / 2, 420);
    this.screen.needsUpdate = true;
  }

  // Phù dâu, phù rể đứng trên sân khấu vỗ tay. make(kind, opts) tạo nhân vật (chibi lúc đầu, người thật khi đã tải xong).
  setGuests(make) {
    for (const g of this.guests) this.scene.remove(g.root);
    this.guests = [];
    // Phù dâu, phù rể đứng phía sau trên sân khấu.
    const guestSpots = [[-1.75, -0.95], [-2.35, -0.45], [-1.3, -2.0], [1.75, -0.95], [2.35, -0.45], [1.3, -2.0]];
    guestSpots.forEach(([x, z], i) => {
      const g = make('guest', { seed: i });
      g.root.position.set(x, 0, z);
      g.faceYaw(Math.atan2(-x * 0.4, 1));
      g.yaw = g.targetYaw;
      g.play(i % 3 === 0 ? 'clap' : 'idle');
      g.root.traverse((o) => o.isMesh && (o.castShadow = true));
      this.scene.add(g.root);
      this.guests.push(g);
    });
  }

  // Chọn ghế có khách: perTable người mỗi bàn (tối đa 8), ghế trống rải ngẫu nhiên nhưng cố định.
  // Khách xoay người một phần về phía sân khấu để xem và cổ vũ (xoay hết thì chân đâm vào bàn).
  occupiedSeats(perTable = 6) {
    const n = Math.max(0, Math.min(8, Math.round(perTable)));
    const out = [];
    for (let t = 0; t < this.tableSpots.length; t++) {
      const rand = rng(t * 977 + 13);
      const seats = this.seats.filter((s) => s.table === t).map((s) => ({ s, r: rand() }));
      seats.sort((a, b) => a.r - b.r);
      for (const { s } of seats.slice(0, n)) {
        const toStage = Math.atan2(-s.x, SLOT.groom.z - s.z);
        const d = Math.atan2(Math.sin(toStage - s.yaw), Math.cos(toStage - s.yaw));
        out.push({ ...s, yaw: s.yaw + THREE.MathUtils.clamp(d * 0.5, -0.8, 0.8) });
      }
    }
    return out;
  }

  // Quan khách ngồi kín các bàn (crowd.js), có khi nhân vật người thật đã tải xong.
  setCrowd(crowd) {
    this.crowd = crowd;
  }

  // Khách mời phản ứng theo sự kiện: phù dâu phù rể trên sân khấu, cả sảnh vỗ tay / reo hò.
  react(anim, seconds = 2) {
    this.guests.forEach((g, i) => {
      setTimeout(() => {
        g.play(anim);
        clearTimeout(g.back);
        g.back = setTimeout(() => g.play(i % 3 === 0 ? 'clap' : 'idle'), seconds * 1000);
      }, i * 70);
    });
    this.crowd?.react(anim, seconds + 0.8);
  }

  update(dt, time) {
    this.guests.forEach((g) => g.update(dt));
    this.crowd?.update(dt);
    this.fairy.material.opacity = 0.75 + 0.25 * Math.sin(time * 2.3);
    this.twinkles.forEach((f, i) => f.scale.setScalar((f.userData.base ??= f.scale.x) * (1 + 0.12 * Math.sin(time * 9 + i * 1.7))));
    this.flameGlow.material.size = 0.13 * (1 + 0.1 * Math.sin(time * 11));
    this.hy.rotation.z = Math.sin(time * 0.8) * 0.03;
  }
}
