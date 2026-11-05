// Người câu cá kiểu chibi: dựng từ các Group lồng nhau (hông → thân → đầu/tay, hông → đùi → cẳng chân)
// để tạo dáng bằng góc xoay. Cần câu là chuỗi 6 đốt, uốn cong bằng cách xoay từng đốt.
// Toạ độ cục bộ: +z là hướng ra mặt hồ, y hướng lên, gốc ở mặt sàn chỗ ngồi.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { mat, bake, haloTexture } from './world.js';

const SKINS = ['#ffe0c7', '#f6caa4', '#eab48a', '#d79f72', '#b98059'];
const SHIRTS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#f783ac', '#9775fa', '#ff922b', '#38d9a9', '#ffffff', '#5c7cfa'];
const PANTS = ['#364fc7', '#495057', '#5f3dc4', '#2b8a3e', '#7d5a3c', '#1c7ed6', '#c92a2a'];
const HAIR = ['#2b2121', '#3b2a20', '#5a3a22', '#1a1a1a', '#8a5a2b', '#d9a441'];
const HATS = ['non', 'non', 'bucket', 'cap', 'cap', 'straw', 'none'];

export function hash(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

function part(geo, material, pos, { rot, scale } = {}) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.copy(pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  return m;
}
function limb(length, r, material) {
  // khúc tay/chân hướng xuống -y từ gốc khớp
  const g = new THREE.CapsuleGeometry(r, length, 4, 10);
  g.translate(0, -length / 2, 0);
  return part(g, material);
}

const lineMaterials = new Set();
export function setLineResolution(w, h) {
  for (const m of lineMaterials) m.resolution.set(w, h);
}

const SCALE = 1.3;
const ROD_SEGS = 4;
const ROD_LEN = 2.6;

// Cái móc ngoắc ở miệng cá lúc giật lên, cùng màu với món đang dùng. Toạ độ tính theo con cá nên tự to nhỏ theo cá.
const HOOK_GEO = new THREE.TorusGeometry(0.07, 0.016, 6, 14, Math.PI * 1.4);
export function hookMesh(item) {
  const color = item?.color ?? '#c7ced6';
  const m = new THREE.Mesh(HOOK_GEO, mat(color, { rough: 0.3, metal: 0.6, emissive: item?.glow ? color : undefined, emissiveIntensity: 0.8 }));
  m.rotation.set(0, 0, 0.6);
  return m;
}

export class Fisher {
  // look = { rod, hook }: món đang dùng (dữ liệu trong config.gear), null là đồ mặc định.
  constructor(player, seat, scene, look = {}) {
    this.player = player;
    this.look = { rod: look.rod ?? null, hook: look.hook ?? null };
    this.seat = seat;
    this.scene = scene;
    const r = seeded(hash(player.name + player.key));
    const pick = (list) => list[Math.floor(r() * list.length)];
    const skin = mat(pick(SKINS), { rough: 0.7 });
    const shirt = mat(pick(SHIRTS), { rough: 0.8 });
    const pants = mat(pick(PANTS), { rough: 0.85 });
    const hairMat = mat(pick(HAIR), { rough: 0.9 });
    const shoe = mat('#3a2a20');
    const hat = pick(HATS);

    const root = (this.root = new THREE.Group());
    root.position.copy(seat.pos);
    root.rotation.y = seat.rotY;
    scene.add(root);
    // phóng to nhân vật quanh mặt đệm (y = 0.47) để vẫn ngồi đúng chỗ
    const scaler = new THREE.Group();
    scaler.scale.setScalar(SCALE);
    scaler.position.y = 0.47 * (1 - SCALE);
    root.add(scaler);
    const body = (this.body = new THREE.Group()); // nhún/rung cả người
    scaler.add(body);

    const hips = (this.hips = new THREE.Group());
    hips.position.set(0, 0.62, -0.05);
    body.add(hips);
    hips.add(part(new THREE.SphereGeometry(0.25, 14, 10), pants, V(0, 0, 0), { scale: [1.05, 0.7, 1] }));

    // thân
    const spine = (this.spine = new THREE.Group());
    hips.add(spine);
    const torsoGeo = new THREE.CapsuleGeometry(0.25, 0.26, 6, 14);
    spine.add(part(torsoGeo, shirt, V(0, 0.27, 0), { scale: [1, 1, 0.85] }));
    // cổ áo
    spine.add(part(new THREE.TorusGeometry(0.13, 0.04, 6, 14), shirt, V(0, 0.57, 0), { rot: [Math.PI / 2, 0, 0] }));

    // đầu (to kiểu chibi)
    const head = (this.head = new THREE.Group());
    head.position.set(0, 0.6, 0);
    spine.add(head);
    head.add(part(new THREE.SphereGeometry(0.34, 20, 16), skin, V(0, 0.3, 0)));
    // tai
    for (const x of [-0.33, 0.33]) head.add(part(new THREE.SphereGeometry(0.07, 8, 6), skin, V(x, 0.28, 0), { scale: [0.6, 1, 0.8] }));
    // mắt thường
    const eyeMat = mat('#1b1b1f', { rough: 0.3 });
    const white = mat('#ffffff', { rough: 0.3 });
    this.eyes = new THREE.Group();
    for (const x of [-0.12, 0.12]) {
      const e = part(new THREE.SphereGeometry(0.055, 10, 8), eyeMat, V(x, 0.31, 0.3), { scale: [0.85, 1.15, 0.5] });
      this.eyes.add(e, part(new THREE.SphereGeometry(0.018, 6, 4), white, V(x + 0.016, 0.338, 0.33)));
    }
    head.add(this.eyes);
    // mắt nhắm tịt (> <) khi gồng sức
    this.squint = new THREE.Group();
    for (const s of [-1, 1]) {
      for (const d of [-1, 1]) {
        const bar = part(new THREE.BoxGeometry(0.1, 0.022, 0.02), eyeMat, V(s * 0.12, 0.31 + d * 0.022, 0.315), { rot: [0, 0, d * s * 0.45] });
        this.squint.add(bar);
      }
    }
    this.squint.visible = false;
    head.add(this.squint);
    // má hồng + miệng
    const blush = mat('#ffa3b1', { rough: 0.9 });
    for (const x of [-0.2, 0.2]) head.add(part(new THREE.SphereGeometry(0.05, 8, 6), blush, V(x, 0.21, 0.27), { scale: [1.2, 0.6, 0.4] }));
    this.smile = part(new THREE.TorusGeometry(0.05, 0.014, 6, 12, Math.PI), eyeMat, V(0, 0.19, 0.325), { rot: [0, 0, Math.PI] });
    this.smile.userData.keep = true;
    head.add(this.smile);
    this.mouth = part(new THREE.SphereGeometry(0.06, 10, 8), mat('#7a1f2b'), V(0, 0.16, 0.31), { scale: [1, 0.9, 0.4] });
    this.mouth.visible = false;
    head.add(this.mouth);

    // tóc / mũ
    head.add(part(new THREE.SphereGeometry(0.355, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat, V(0, 0.32, -0.02), { rot: [-0.35, 0, 0] }));
    if (hat === 'non') {
      const non = mat('#f1d38a', { rough: 0.9 });
      head.add(part(new THREE.ConeGeometry(0.62, 0.38, 24, 1, true), mat('#f1d38a', { rough: 0.9, side: THREE.DoubleSide }), V(0, 0.73, 0)));
      head.add(part(new THREE.TorusGeometry(0.6, 0.02, 4, 24), mat('#c9a35a'), V(0, 0.55, 0), { rot: [Math.PI / 2, 0, 0] }));
      head.add(part(new THREE.CircleGeometry(0.6, 24), non, V(0, 0.54, 0), { rot: [Math.PI / 2, 0, 0] }));
    } else if (hat === 'bucket') {
      const c = mat(pick(['#6c8a4a', '#d9c8a0', '#4a6fa5', '#e9ecef']), { rough: 0.9 });
      head.add(part(new THREE.CylinderGeometry(0.3, 0.36, 0.26, 18), c, V(0, 0.6, 0)));
      head.add(part(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 20), c, V(0, 0.48, 0), { rot: [0.08, 0, 0] }));
    } else if (hat === 'cap') {
      const c = mat(pick(['#e03131', '#1971c2', '#2f9e44', '#f08c00', '#212529']), { rough: 0.7 });
      head.add(part(new THREE.SphereGeometry(0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), c, V(0, 0.38, 0)));
      head.add(part(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), c, V(0, 0.42, 0.18), { rot: [0.12, 0, 0] }));
    } else if (hat === 'straw') {
      const c = mat('#e8c46a', { rough: 0.95 });
      head.add(part(new THREE.CylinderGeometry(0.27, 0.32, 0.24, 18), c, V(0, 0.6, 0)));
      head.add(part(new THREE.CylinderGeometry(0.58, 0.58, 0.03, 22), c, V(0, 0.5, 0)));
      head.add(part(new THREE.CylinderGeometry(0.325, 0.325, 0.07, 18), mat('#d6455d'), V(0, 0.52, 0)));
    } else {
      head.add(part(new THREE.SphereGeometry(0.2, 10, 8), hairMat, V(0, 0.62, -0.05)));
    }

    // tay: vai → khuỷu
    this.arms = [-1, 1].map((s) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.3, 0.46, 0);
      spine.add(shoulder);
      shoulder.add(part(new THREE.SphereGeometry(0.1, 10, 8), shirt, V(0, 0, 0)));
      shoulder.add(limb(0.2, 0.085, shirt));
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.28, 0);
      shoulder.add(elbow);
      elbow.add(limb(0.17, 0.07, skin));
      elbow.add(part(new THREE.SphereGeometry(0.085, 10, 8), skin, V(0, -0.26, 0)));
      return { shoulder, elbow, s };
    });

    // chân: đùi duỗi ra trước (ngồi), cẳng chân thõng xuống
    this.legs = [-1, 1].map((s) => {
      const thigh = new THREE.Group();
      thigh.position.set(s * 0.13, -0.02, 0.05);
      hips.add(thigh);
      thigh.add(limb(0.24, 0.1, pants));
      const knee = new THREE.Group();
      knee.position.set(0, -0.34, 0);
      thigh.add(knee);
      knee.add(limb(0.2, 0.085, pants));
      knee.add(part(new THREE.SphereGeometry(0.1, 10, 8), shoe, V(0, -0.32, 0.05), { scale: [0.9, 0.7, 1.4] }));
      return { thigh, knee, s };
    });

    // cần câu gắn vào thân (tay chỉ đặt theo cho khớp)
    const rod = (this.rod = new THREE.Group());
    rod.position.set(0.2, 0.2, 0.4);
    rod.rotation.z = -0.22; // nghiêng sang bên để không che mặt khi quay cận
    spine.add(rod);
    this.buildRod();

    // dây câu + phao
    const lm = new LineMaterial({ color: 0xffffff, linewidth: 2.2, transparent: true, opacity: 0.9 });
    lm.resolution.set(1080, 1920);
    lineMaterials.add(lm);
    this.lineMat = lm;
    this.lineGeo = new LineGeometry();
    this.linePts = new Float32Array(16 * 3);
    this.lineGeo.setPositions(this.linePts);
    this.line = new Line2(this.lineGeo, lm);
    this.line.frustumCulled = false;
    scene.add(this.line);
    const bob = (this.bobber = new THREE.Group());
    this.buildBobber();
    bob.position.copy(seat.bobber);
    scene.add(bob);

    // gộp khối cho nhẹ (mắt, miệng bật/tắt riêng nên giữ nguyên)
    for (const g of [hips, spine, head, this.eyes, this.squint, ...this.arms.flatMap((a) => [a.shoulder, a.elbow]), ...this.legs.flatMap((l) => [l.thigh, l.knee])]) bake(g);

    // trạng thái
    this.t = Math.random() * 10;
    this.state = 'fall';
    this.stateT = 0;
    this.fallFrom = 26 + Math.random() * 6;
    this.pose = { lean: 0, arm: -2.8, elbow: -0.2, thigh: 1.5, knee: 0, rodPitch: 0.5, bend: 0, head: 0, bounce: 0 };
    this.lineEnd = seat.bobber.clone(); // nơi dây câu chạm (phao hoặc con cá)
    this.hook = null; // Object3D con cá đang mắc câu (dây nối vào miệng cá)
    this.lineSlack = 1;
    this.lineHidden = false;
    this.removed = false;
    this.seat.spare.visible = false;
    this.root.position.y = this.fallFrom;
    this.onLand = null;
    this.tmp = new THREE.Vector3();
  }

  // Dựng lại cần câu theo món đang dùng (đổi lúc đang ngồi vẫn được, dáng cần giữ nguyên vì nằm ở nhóm rod).
  buildRod() {
    const rod = this.rod;
    for (const c of [...rod.children]) {
      rod.remove(c);
      c.traverse((o) => o.isMesh && o.geometry.dispose());
    }
    const item = this.look.rod;
    const shaft = mat(item?.color ?? '#2b2b33', { rough: 0.35 });
    const accent = mat(item?.accent ?? '#e0b54a', { rough: 0.35, metal: 0.5 });
    rod.add(part(new THREE.CylinderGeometry(0.045, 0.05, 0.5, 8), accent, V(0, 0.0, 0)));
    rod.add(part(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 12), mat('#222'), V(0.09, 0.1, 0), { rot: [0, 0, Math.PI / 2] }));
    this.rodSegs = [];
    let parent = rod;
    const segLen = ROD_LEN / ROD_SEGS;
    for (let i = 0; i < ROD_SEGS; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, i === 0 ? 0.25 : segLen, 0);
      const rTop = 0.034 - ((i + 1) / ROD_SEGS) * 0.024;
      const rBot = 0.034 - (i / ROD_SEGS) * 0.024;
      const g = new THREE.CylinderGeometry(rTop, rBot, segLen, 6);
      g.translate(0, segLen / 2, 0);
      seg.add(part(g, shaft));
      if (i % 2 === 1) seg.add(part(new THREE.TorusGeometry(rBot + 0.012, 0.006, 4, 8), accent, V(0, 0.02, 0), { rot: [Math.PI / 2, 0, 0] }));
      parent.add(seg);
      this.rodSegs.push(seg);
      parent = seg;
    }
    this.tip = new THREE.Object3D();
    this.tip.position.set(0, segLen, 0);
    parent.add(this.tip);
    // món xịn có đầu cần phát sáng, nhìn từ xa cũng nhận ra
    if (item?.glow) parent.add(part(new THREE.SphereGeometry(0.03, 8, 6), mat(item.accent, { emissive: item.color, emissiveIntensity: 1.8 }), V(0, segLen, 0)));
    for (const g of [rod, ...this.rodSegs]) bake(g);
  }

  // Phao mang màu của móc câu đang dùng.
  buildBobber() {
    const bob = this.bobber;
    for (const c of [...bob.children]) {
      bob.remove(c);
      c.geometry.dispose();
    }
    const item = this.look.hook;
    const top = item?.color ?? '#ff3b3b';
    bob.add(part(new THREE.SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(top, { emissive: top, emissiveIntensity: item?.glow ? 0.9 : 0.25 }), V(0, 0, 0)));
    bob.add(part(new THREE.SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#ffffff'), V(0, 0, 0)));
    bob.add(part(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4), mat(item?.accent ?? '#ffdd33'), V(0, 0.12, 0)));
    bake(bob);
  }

  // Viền vàng quanh bệ khi có Ghế VIP, rái cá ngồi cạnh khi có rái cá.
  setPerks(perks) {
    const vip = Boolean(perks?.vip);
    if (vip && !this.vipRing) {
      this.vipRing = part(new THREE.TorusGeometry(0.72, 0.045, 6, 22), mat('#ffd43b', { rough: 0.3, metal: 0.5, emissive: '#ffb700', emissiveIntensity: 0.9 }), V(0, 0.06, 0), { rot: [Math.PI / 2, 0, 0] });
      this.vipRing.castShadow = false;
      this.root.add(this.vipRing);
    }
    if (this.vipRing) this.vipRing.visible = vip;
    const otter = Boolean(perks?.otter);
    if (otter && !this.otter) this.buildOtter();
    if (this.otter) this.otter.visible = otter;
  }

  buildOtter() {
    const g = (this.otter = new THREE.Group());
    g.position.set(0.82, 0, 0.3);
    g.rotation.y = 0.5;
    g.scale.setScalar(1.35);
    const fur = mat('#7a5230', { rough: 0.8 });
    const belly = mat('#e0c49a', { rough: 0.8 });
    const dark = mat('#2a1c14', { rough: 0.5 });
    g.add(part(new THREE.CapsuleGeometry(0.13, 0.16, 4, 10), fur, V(0, 0.2, 0)));
    g.add(part(new THREE.SphereGeometry(0.1, 10, 8), belly, V(0, 0.19, 0.06), { scale: [1, 1.35, 0.8] }));
    g.add(part(new THREE.SphereGeometry(0.115, 12, 10), fur, V(0, 0.42, 0.02)));
    g.add(part(new THREE.SphereGeometry(0.06, 8, 6), belly, V(0, 0.39, 0.1), { scale: [1.2, 0.8, 0.8] }));
    g.add(part(new THREE.SphereGeometry(0.022, 6, 5), dark, V(0, 0.415, 0.15)));
    for (const s of [-1, 1]) {
      g.add(part(new THREE.SphereGeometry(0.016, 6, 5), dark, V(s * 0.05, 0.45, 0.115)));
      g.add(part(new THREE.SphereGeometry(0.03, 6, 5), fur, V(s * 0.095, 0.5, 0)));
      g.add(part(new THREE.CapsuleGeometry(0.03, 0.08, 3, 6), fur, V(s * 0.11, 0.26, 0.08), { rot: [0.9, 0, 0] }));
    }
    g.add(part(new THREE.ConeGeometry(0.07, 0.34, 7), fur, V(0, 0.08, -0.2), { rot: [-1.3, 0, 0] }));
    bake(g);
    this.root.add(g);
    this.otterAt = -9;
  }

  otterHop() {
    this.otterAt = this.t;
  }

  // Vua Câu: vương miện và hào quang vàng.
  setKing(on) {
    if (on && !this.crown) {
      const gold = mat('#ffc61a', { rough: 0.3, metal: 0.6, emissive: '#ffb300', emissiveIntensity: 0.85 });
      const c = (this.crown = new THREE.Group());
      c.position.set(0, 1.02, 0);
      c.add(part(new THREE.CylinderGeometry(0.22, 0.19, 0.11, 8, 1, true), mat('#ffc61a', { rough: 0.3, metal: 0.6, emissive: '#ffb300', emissiveIntensity: 0.85, side: THREE.DoubleSide }), V(0, 0, 0)));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        c.add(part(new THREE.ConeGeometry(0.055, 0.15, 4), gold, V(Math.cos(a) * 0.2, 0.12, Math.sin(a) * 0.2)));
      }
      this.head.add(c);
      this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: '#ffd043', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      this.aura.position.y = 1.3;
      this.aura.scale.setScalar(4);
      this.aura.renderOrder = 3;
      this.root.add(this.aura);
    }
    if (this.crown) this.crown.visible = on;
    if (this.aura) this.aura.visible = on;
  }

  setGear(slot, item) {
    this.look[slot] = item;
    if (slot === 'rod') this.buildRod();
    else this.buildBobber();
  }

  get headPos() {
    return this.head.localToWorld(this.tmp.set(0, 0.95, 0));
  }

  setState(state) {
    this.state = state;
    this.stateT = 0;
  }

  // cá cắn câu: phao giật liên hồi trong lúc chờ tới lượt giật
  bite() {
    this.biteUntil = this.t + 6;
  }
  struggle() {
    this.biteUntil = 0;
    if (this.state === 'fall' || this.state === 'leave') return;
    this.setState('struggle');
  }
  cheer() {
    this.setState('cheer');
  }
  fail() {
    this.setState('fail');
  }
  leave() {
    this.setState('leave');
  }

  tipWorld(out) {
    return this.tip.getWorldPosition(out);
  }

  update(dt) {
    this.t += dt;
    this.stateT += dt;
    const t = this.t;
    const st = this.stateT;
    const target = { lean: 0.1, arm: -1.25, elbow: -0.55, thigh: 1.45, knee: 1.45, rodPitch: 0.95, bend: 0.03 + Math.sin(t * 1.4) * 0.008, head: 0.05 + Math.sin(t * 0.7) * 0.05, bounce: 0 };
    let rate = 8;
    let shake = 0;
    let face = 'smile';
    let kick = 0;
    this.lineSlack = 1;
    this.lineHidden = false;

    switch (this.state) {
      case 'fall': {
        // rơi tự do từ trên trời, tay chân giãy giụa, xoay vòng
        const g = 30;
        const y = this.fallFrom - 0.5 * g * st * st;
        const seatY = this.seat.pos.y;
        this.root.rotation.y = this.seat.rotY + st * 9;
        Object.assign(target, { lean: -0.2, arm: -2.9 + Math.sin(t * 25) * 0.4, elbow: -0.2, thigh: 0.4 + Math.sin(t * 20) * 0.3, knee: 0.3, rodPitch: 0.6, bend: 0, head: -0.3 });
        face = 'open';
        rate = 20;
        this.lineHidden = true;
        if (y <= seatY) {
          this.root.position.y = seatY;
          this.root.rotation.y = this.seat.rotY;
          this.setState('land');
          this.onLand?.(this);
        } else this.root.position.y = y;
        break;
      }
      case 'land': {
        // tiếp đất: bẹp người rồi nảy lại, ngồi xuống đệm
        const k = clamp01(st / 0.45);
        const squash = 1 - Math.sin(k * Math.PI) * 0.35 * (1 - k);
        this.body.scale.set(1 + (1 - squash) * 0.6, squash, 1 + (1 - squash) * 0.6);
        face = st < 0.3 ? 'squint' : 'smile';
        rate = 10;
        this.lineHidden = st < 0.35;
        this.lineSlack = 2.5;
        if (st > 0.6) {
          this.body.scale.set(1, 1, 1);
          this.setState('idle');
        }
        break;
      }
      case 'struggle': {
        // ngả người ra sau, gồng tay, cần cong vồng, chân đạp loạn xạ
        const w = Math.sin(t * 17);
        Object.assign(target, {
          lean: -0.55 + w * 0.08,
          arm: -2.05 + Math.sin(t * 13) * 0.12,
          elbow: -0.75,
          thigh: 1.05 + Math.sin(t * 21) * 0.35,
          knee: 1.2,
          rodPitch: 0.5 + Math.sin(t * 9) * 0.06,
          bend: (this.heavy ? 0.36 : 0.24) + Math.sin(t * 11) * 0.04,
          head: -0.25 + Math.sin(t * 15) * 0.06,
        });
        shake = this.heavy ? 0.06 : 0.035;
        kick = 1;
        face = 'squint';
        rate = 14;
        this.lineSlack = 0;
        break;
      }
      case 'cheer': {
        // giơ cần lên ăn mừng, nhún nhảy
        Object.assign(target, {
          lean: -0.1,
          arm: -2.7 + Math.sin(t * 12) * 0.15,
          elbow: -0.15,
          thigh: 1.35,
          rodPitch: 0.5,
          bend: this.hook ? (this.heavy ? 0.22 : 0.1) : 0.04,
          head: -0.2,
          bounce: Math.abs(Math.sin(t * 9)) * 0.12,
        });
        face = 'happy';
        rate = 12;
        this.lineSlack = 0;
        if (st > 2.2) this.setState('idle');
        break;
      }
      case 'fail': {
        // dây đứt: ngã ngửa ra sau, chân chổng lên trời, rồi ngồi dậy
        const down = st < 0.9;
        Object.assign(target, down ? { lean: -1.15, arm: -2.6, elbow: -0.1, thigh: 2.4, knee: 0.3, rodPitch: 0.1, bend: 0, head: -0.4 } : {});
        face = down ? 'open' : 'squint';
        rate = down ? 16 : 5;
        this.lineHidden = st < 1.5;
        if (st > 2.0) this.setState('idle');
        break;
      }
      case 'leave': {
        // bật lên trời rồi biến mất
        this.root.position.y = this.seat.pos.y + st * st * 30;
        this.root.rotation.y += dt * 12;
        Object.assign(target, { arm: -2.9, elbow: 0, thigh: 1.0, knee: 0.5, lean: 0 });
        face = 'happy';
        this.lineHidden = true;
        if (st > 1.2) this.dispose();
        break;
      }
    }

    // nội suy dáng
    const k = damp(rate, dt);
    const p = this.pose;
    for (const key in target) p[key] = lerp(p[key], target[key], k);

    this.spine.rotation.x = p.lean;
    this.head.rotation.x = p.head;
    for (const a of this.arms) {
      a.shoulder.rotation.x = p.arm;
      a.shoulder.rotation.z = a.s * (this.state === 'cheer' || this.state === 'fall' ? 0.35 : -0.25);
      a.elbow.rotation.x = p.elbow;
    }
    for (const l of this.legs) {
      const kickA = kick ? Math.sin(this.t * 22 + l.s * 1.6) * 0.45 : 0;
      l.thigh.rotation.x = -p.thigh + kickA;
      l.knee.rotation.x = p.knee - kickA * 0.8;
    }
    this.rod.rotation.x = p.rodPitch;
    for (const s of this.rodSegs) s.rotation.x = p.bend * (6 / ROD_SEGS);
    this.body.position.set(shake ? (Math.random() - 0.5) * shake : 0, p.bounce, shake ? (Math.random() - 0.5) * shake : 0);

    this.eyes.visible = face === 'smile' || face === 'open';
    this.squint.visible = face === 'squint' || face === 'happy';
    this.smile.visible = face === 'smile';
    this.mouth.visible = face === 'open' || face === 'squint' || face === 'happy';
    if (this.mouth.visible) this.mouth.scale.y = face === 'squint' ? 0.55 + Math.abs(Math.sin(this.t * 14)) * 0.5 : 1;

    if (this.otter?.visible) {
      // rái cá nhấp nhô, tha được cá thì nhảy cẫng lên
      const hop = this.t - this.otterAt;
      this.otter.position.y = (hop < 0.7 ? Math.sin((hop / 0.7) * Math.PI) * 0.45 : 0) + Math.abs(Math.sin(this.t * 1.8)) * 0.02;
    }
    if (this.aura?.visible) this.aura.material.opacity = 0.42 + Math.sin(this.t * 2.4) * 0.12;

    this.updateLine();
  }

  updateLine() {
    if (this.removed) return;
    const tip = this.tipWorld(new THREE.Vector3());
    // phao nhấp nhô khi ngồi chờ
    const idle = this.state === 'idle' || this.state === 'land';
    if (idle) {
      const biting = this.t < (this.biteUntil ?? 0);
      const nibble = biting
        ? -Math.abs(Math.sin(this.t * 13)) * 0.14 - (Math.sin(this.t * 3.1) > 0.4 ? 0.1 : 0)
        : Math.sin(this.t * 1.7) * 0.025 + (Math.sin(this.t * 0.37) > 0.92 ? Math.sin(this.t * 30) * 0.04 : 0);
      this.bobber.position.set(this.seat.bobber.x, nibble, this.seat.bobber.z);
    }
    this.bobber.visible = (idle || this.state === 'cheer') && !this.hook && this.state !== 'fall';
    const end = this.hook ? this.hook.getWorldPosition(new THREE.Vector3()) : this.state === 'struggle' ? this.lineEnd : this.bobber.position.clone().setY(this.bobber.position.y + 0.18);
    this.line.visible = !this.lineHidden;
    if (!this.line.visible) return;
    const n = 16;
    const sag = this.lineSlack * Math.min(1.2, tip.distanceTo(end) * 0.18);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const x = lerp(tip.x, end.x, u);
      const y = lerp(tip.y, end.y, u) - Math.sin(u * Math.PI) * sag;
      const z = lerp(tip.z, end.z, u);
      this.linePts[i * 3] = x;
      this.linePts[i * 3 + 1] = y;
      this.linePts[i * 3 + 2] = z;
    }
    this.lineGeo.setPositions(this.linePts);
  }

  dispose() {
    if (this.removed) return;
    this.removed = true;
    this.scene.remove(this.root, this.line, this.bobber);
    for (const obj of [this.root, this.bobber]) obj.traverse((o) => o.isMesh && o.geometry.dispose());
    this.lineGeo.dispose();
    lineMaterials.delete(this.lineMat);
    this.lineMat.dispose();
    this.seat.spare.visible = true;
  }
}
