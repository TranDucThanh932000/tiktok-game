// Sảnh tiệc cưới kiểu thật: vật liệu PBR, chiếu sáng bằng ảnh HDRI một sảnh tiệc thật (Poly Haven, CC0),
// sân khấu tròn mặt đá bóng, phông vải xếp ly có đèn hắt, rèm vén, cổng hoa hồng, chữ Hỷ mạ vàng, cột trụ,
// đèn chùm pha lê, bàn tiệc phủ khăn, thảm đỏ, trụ hoa nến dọc lối đi. Toàn bộ dựng bằng code.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Character } from './character.js';

export const SLOT = { groom: new THREE.Vector3(-0.62, 0, 0.35), bride: new THREE.Vector3(0.62, 0, 0.35) };
export const ENTRY = { groom: new THREE.Vector3(-3.3, 0, 0.55), bride: new THREE.Vector3(3.3, 0, 0.55) };
// Sân khấu bầu dục: tâm, bán kính ngang, bán kính sâu.
const STAGE = { z: -0.55, rx: 4.3, rz: 2.35 };
export const MC_SPOT = { nam: new THREE.Vector3(-1.8, 0, 1.2), nu: new THREE.Vector3(1.8, 0, 1.2) };

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
function tiedCurtain(width, height, tieAt, side) {
  const g = new THREE.PlaneGeometry(width, height, 60, 40);
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
    S.fog = new THREE.Fog('#2a0c16', 22, 45);

    // ---------- Ánh sáng
    S.add(new THREE.HemisphereLight('#fff1f4', '#3a1a22', 0.35));
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

    // ---------- Sàn sảnh, thảm đỏ
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), M.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.34;
    floor.receiveShadow = true;
    S.add(floor);
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 14), M.carpet);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, -0.333, 8.4);
    carpet.receiveShadow = true;
    S.add(carpet);
    for (const x of [-0.77, 0.77]) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 14), M.gold);
      trim.position.set(x, -0.33, 8.4);
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
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), M.backWall);
    wall.position.set(0, 4, -3.6);
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

    // ---------- Đèn chùm pha lê (thấy mờ sau phần chữ phía trên)
    for (const [x, y, z, s] of [[-1.6, 4.2, -0.6, 0.8], [1.6, 4.2, -0.6, 0.8], [0, 4.6, 2.2, 1.1]]) this.chandelier(new THREE.Vector3(x, y, z), s);

    // ---------- Trụ hoa lớn hai bên cổng, trụ hoa nến dọc lối đi
    for (const side of [-1, 1]) {
      this.flowerStand(side * 2.05, -1.55, 1.25, 0.34, false);
      this.flowerStand(side * 1.05, STAGE.z + STAGE.rz + 0.15, 0.75, 0.17, true);
      for (let i = 0; i < 4; i++) this.flowerStand(side * 1.05, 3.2 + i * 1.6, 0.75, 0.17, true);
    }

    // ---------- Bàn tiệc tròn dưới sân khấu, hai bên lối đi (khách ngồi khi nhân vật người thật tải xong)
    this.tables = [];
    for (const [x, z] of [[-2.3, 3.0], [2.3, 3.0], [-2.6, 5.4], [2.6, 5.4], [-4.9, 3.6], [4.9, 3.6]]) this.tables.push(this.banquet(x, z));

    this.setGuests((kind, opts) => new Character(kind, { ...opts, scale: 0.78 }));
  }

  chandelier(at, s) {
    const g = new THREE.Group();
    g.position.copy(at);
    g.scale.setScalar(s);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 6), M.gold);
    rod.position.y = 0.75;
    g.add(rod);
    const drops = [];
    [[0.55, 0, 22], [0.4, -0.22, 16], [0.24, -0.42, 10]].forEach(([r, y, n]) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 48), M.gold);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      g.add(ring);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        for (let k = 0; k < 3; k++) drops.push(new THREE.Vector3(Math.cos(a) * r, y - 0.06 - k * 0.07, Math.sin(a) * r));
        if (i % 2 === 0) {
          const bulb = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: '#ffd9a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
          bulb.position.set(Math.cos(a) * r, y + 0.06, Math.sin(a) * r);
          bulb.scale.setScalar(0.12);
          g.add(bulb);
        }
      }
    });
    const crystals = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), M.crystal, drops.length);
    const m = new THREE.Matrix4();
    drops.forEach((p, i) => crystals.setMatrixAt(i, m.compose(p, new THREE.Quaternion(), new THREE.Vector3(0.018, 0.034, 0.018))));
    g.add(crystals);
    const ball = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 1), M.crystal);
    ball.position.y = -0.62;
    g.add(ball);
    this.scene.add(g);
  }

  flowerStand(x, z, height, ball, candle) {
    const y0 = candle ? -0.34 : 0;
    const g = new THREE.Group();
    // Trụ kính trong, lõi và chân mạ vàng.
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, height, 16, 1, true), M.glass);
    stem.position.set(x, y0 + height / 2, z);
    g.add(stem);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, height, 6), M.gold);
    core.position.copy(stem.position);
    g.add(core);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.05, 24), M.gold);
    base.position.set(x, y0 + 0.025, z);
    g.add(base);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.07, 0.08, 24), M.gold);
    cup.position.set(x, y0 + height, z);
    g.add(cup);
    flowerBall(g, new THREE.Vector3(x, y0 + height + ball * 0.75, z), ball, candle ? 24 : 60);
    if (candle) {
      const top = y0 + height + ball * 1.75;
      const glassCup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 16, 1, true), M.glass);
      glassCup.position.set(x, top + 0.08, z);
      g.add(glassCup);
      const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12), M.wax);
      wax.position.set(x, top + 0.04, z);
      g.add(wax);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: '#ffbf66', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      flame.position.set(x, top + 0.12, z);
      flame.scale.setScalar(0.14);
      g.add(flame);
      this.twinkles.push(flame);
    }
    this.scene.add(g);
  }

  banquet(x, z) {
    const g = new THREE.Group();
    g.position.set(x, -0.34, z);
    // Khăn bàn satin rủ chấm đất, có nếp.
    const profile = [[0, 0], [0.86, 0.0], [0.84, 0.2], [0.8, 0.5], [0.76, 0.74], [0.72, 0.78], [0, 0.78]].map(([a, b]) => new THREE.Vector2(a, b));
    const clothGeo = new THREE.LatheGeometry(profile, 64);
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
    const cloth = new THREE.Mesh(clothGeo, M.cloth);
    cloth.castShadow = true;
    cloth.receiveShadow = true;
    g.add(cloth);
    // Hoa và nến giữa bàn.
    flowerBall(g, new THREE.Vector3(0, 0.98, 0), 0.16, 22);
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.2, 16), M.gold);
    vase.position.y = 0.88;
    g.add(vase);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 10), M.wax);
      wax.position.set(Math.cos(a) * 0.32, 0.85, Math.sin(a) * 0.32);
      g.add(wax);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: '#ffbf66', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      flame.position.set(wax.position.x, 0.95, wax.position.z);
      flame.scale.setScalar(0.1);
      g.add(flame);
      this.twinkles.push(flame);
    }
    // Ghế bọc vải trắng, nơ hồng sau lưng. Tám ghế gộp thành hai khối (vải bọc, nơ) cho nhẹ máy.
    const covers = [];
    const sashes = [];
    g.userData.chairs = [];
    const place = (geo, matrix, list) => list.push(geo.applyMatrix4(matrix));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const chair = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * 1.15, 0, Math.sin(a) * 1.15), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a - Math.PI / 2), new THREE.Vector3(1, 1, 1));
      // Chỗ ngồi (toạ độ sảnh) và hướng mặt vào giữa bàn, cho khách ngồi.
      g.userData.chairs.push({ x: x + Math.cos(a) * 1.08, z: z + Math.sin(a) * 1.08, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) });
      const at = (x, y, z) => chair.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));
      place(new THREE.BoxGeometry(0.44, 0.47, 0.44), at(0, 0.235, 0), covers);
      place(new THREE.BoxGeometry(0.44, 0.55, 0.08), at(0, 0.74, 0.2), covers);
      place(new THREE.BoxGeometry(0.46, 0.08, 0.1), at(0, 0.62, 0.2), sashes);
      for (const side of [-1, 1]) {
        const bow = new THREE.TorusGeometry(0.06, 0.02, 6, 12).rotateY(side * 0.5);
        place(bow, at(side * 0.05, 0.62, 0.27), sashes);
      }
    }
    g.add(new THREE.Mesh(mergeGeometries(covers.map((x) => x.toNonIndexed())), M.chairCover));
    g.add(new THREE.Mesh(mergeGeometries(sashes.map((x) => x.toNonIndexed())), M.sash));
    this.scene.add(g);
    return g;
  }

  // Khách mời đứng hai bên vỗ tay. make(kind, opts) tạo nhân vật (chibi lúc đầu, người thật khi đã tải xong).
  // diners: thêm khách ngồi quanh các bàn tiệc (chỉ khi nhân vật biết ngồi, tức người thật).
  setGuests(make, { diners = false } = {}) {
    for (const g of [...this.guests, ...(this.diners ?? [])]) this.scene.remove(g.root);
    this.guests = [];
    this.diners = [];
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
    if (!diners) return;
    let n = 0;
    this.tables.forEach((table, ti) => {
      // Mỗi bàn vài khách, chừa ghế trống cho tự nhiên.
      table.userData.chairs.forEach((chair, ci) => {
        if ((ci + ti) % 3 === 2) return;
        const d = make('guest', { seed: 10 + n * 7 });
        d.root.position.set(chair.x, -0.34, chair.z);
        d.faceYaw(chair.yaw);
        d.yaw = chair.yaw;
        d.play(['sit', 'sit2', 'sit3'][n % 3]);
        d.seated = true;
        this.scene.add(d.root);
        this.diners.push(d);
        n++;
      });
    });
  }

  // Khách mời phản ứng theo sự kiện.
  react(anim, seconds = 2) {
    this.guests.forEach((g, i) => {
      setTimeout(() => {
        g.play(anim);
        clearTimeout(g.back);
        g.back = setTimeout(() => g.play(i % 3 === 0 ? 'clap' : 'idle'), seconds * 1000);
      }, i * 70);
    });
  }

  update(dt, time) {
    this.guests.forEach((g) => g.update(dt));
    this.diners?.forEach((g) => g.update(dt));
    this.fairy.material.opacity = 0.75 + 0.25 * Math.sin(time * 2.3);
    this.twinkles.forEach((f, i) => f.scale.setScalar((f.userData.base ??= f.scale.x) * (1 + 0.12 * Math.sin(time * 9 + i * 1.7))));
    this.hy.rotation.z = Math.sin(time * 0.8) * 0.03;
  }
}
