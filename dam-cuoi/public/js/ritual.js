// Nghi lễ cưới Việt Nam: đồ lễ 3D (dựng một lần rồi dùng lại, không rò bộ nhớ) và kịch bản diễn từng nghi thức.
// Server quyết định nghi thức nào đang diễn và bao lâu; file này chỉ lo phần nhìn.
import * as THREE from 'three';
import { Character } from './character.js';

// Vật liệu thật (PBR) cho đồ lễ, đồng bộ với sảnh. Màu vàng kim là kim loại bóng.
const mats = new Map();
function toon(color, extra = {}) {
  const key = `${color}|${JSON.stringify(extra)}`;
  if (!mats.has(key)) {
    const gold = /^#f[0-9a-f]c[0-9a-f]{3}$/i.test(color) && color.toLowerCase().startsWith('#f2c1') || color === '#f6d36b';
    const { emissive, ...rest } = extra;
    mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: gold ? 0.25 : 0.55, metalness: gold ? 1 : 0, envMapIntensity: gold ? 1.5 : 1, emissive: gold ? '#000000' : emissive ?? '#000000', ...rest }));
  }
  return mats.get(key);
}
import { DOT, SLOT } from './world.js';

const GOLD = () => toon('#f2c14e', { emissive: '#4a3208' });

function hyTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#b3122e';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#f6d36b';
  g.lineWidth = 12;
  g.strokeRect(10, 10, 236, 236);
  g.fillStyle = '#f6d36b';
  g.font = 'bold 170px "Microsoft YaHei", "SimHei", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('囍', 128, 138);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function m(parent, geo, mat, pos, scale, rot) {
  const mesh = new THREE.Mesh(geo, mat);
  if (pos) mesh.position.set(...pos);
  if (scale) typeof scale === 'number' ? mesh.scale.setScalar(scale) : mesh.scale.set(...scale);
  if (rot) mesh.rotation.set(...rot);
  parent.add(mesh);
  return mesh;
}

function flame(parent, pos, size = 0.16) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: '#ffc864', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.position.set(...pos);
  s.scale.setScalar(size);
  s.userData.base = size;
  parent.add(s);
  return s;
}

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 18),
  sphere: new THREE.SphereGeometry(1, 16, 12),
  torus: new THREE.TorusGeometry(1, 0.2, 8, 24),
  dome: new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  flute: new THREE.CylinderGeometry(1, 0.55, 1, 12, 1, true),
  octa: new THREE.OctahedronGeometry(1, 0),
};

// ---------------------------------------------------------------- Đồ lễ

export class Props {
  constructor(scene) {
    this.scene = scene;
    this.cache = {};
    this.shown = new Set();
    this.attached = [];
    this.flames = [];
  }

  get(name) {
    if (!this.cache[name]) this.cache[name] = this[`build_${name.replace(/\d+$/, '')}`]();
    return this.cache[name];
  }

  show(name, at, { pop = true } = {}) {
    const obj = this.get(name);
    obj.position.copy(at);
    obj.scale.setScalar(pop ? 0.01 : 1);
    obj.userData.grow = pop ? 0 : 1;
    this.scene.add(obj);
    this.shown.add(obj);
    return obj;
  }

  // Gắn đồ vào bàn tay phải/trái của nhân vật.
  attach(name, char, hand = 'R') {
    const obj = this.get(name);
    obj.rotation.set(0, 0, 0);
    obj.scale.setScalar(1);
    if (char.handAnchor) {
      // Nhân vật người thật: điểm cầm đã ở lòng bàn tay.
      obj.position.set(0, -0.02, 0.03);
      char.handAnchor(hand).add(obj);
    } else {
      const arm = hand === 'R' ? char.armR : char.armL;
      obj.position.set(0, -0.26, 0.04);
      arm.el.add(obj);
    }
    this.attached.push(obj);
    return obj;
  }

  clear() {
    for (const o of this.shown) this.scene.remove(o);
    this.shown.clear();
    for (const o of this.attached) o.parent?.remove(o);
    this.attached = [];
    this.lights(false);
    if (this.cache.tower) this.fill(0);
  }

  lights(on, which) {
    for (const f of this.flames) if (!which || f.userData.group === which) f.visible = on;
  }

  // Rót rượu: rượu chảy từ ly trên cùng xuống các tầng dưới.
  fill(k) {
    const tower = this.cache.tower;
    if (!tower) return;
    for (const l of tower.userData.liquids) {
      const local = Math.min(1, Math.max(0, (k - l.userData.delay) / 0.25));
      l.scale.y = Math.max(0.001, local) * l.userData.h;
      l.position.y = l.userData.y0 + (l.scale.y - l.userData.h) / 2;
    }
  }

  update(dt, time) {
    for (const o of this.shown) {
      if (o.userData.grow < 1) {
        o.userData.grow = Math.min(1, o.userData.grow + dt * 3);
        const g = o.userData.grow;
        o.scale.setScalar(1 + Math.sin(g * Math.PI) * 0.15 - (1 - g) * 0.99);
      }
    }
    for (const f of this.flames) if (f.visible) f.scale.setScalar(f.userData.base * (1 + 0.12 * Math.sin(time * 14 + f.id)));
  }

  build_altar() {
    // Bàn thờ gia tiên: bàn đỏ viền vàng, bát hương, đôi nến, mâm ngũ quả, bức hoành chữ Hỷ.
    const g = new THREE.Group();
    m(g, G.box, toon('#9e1028'), [0, 0.32, 0], [1.25, 0.64, 0.52]);
    m(g, G.box, GOLD(), [0, 0.655, 0], [1.3, 0.04, 0.56]);
    m(g, G.box, GOLD(), [0, 0.36, 0.265], [1.0, 0.06, 0.01]);
    m(g, G.box, GOLD(), [0, 0.15, 0.265], [1.0, 0.04, 0.01]);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: hyTexture() }));
    plaque.position.set(0, 1.12, -0.22);
    g.add(plaque);
    m(g, G.box, GOLD(), [0, 1.12, -0.23], [0.68, 0.68, 0.02]);
    m(g, G.cyl, GOLD(), [0, 0.73, 0.02], [0.1, 0.11, 0.1]);
    for (let i = -1; i <= 1; i++) {
      m(g, G.cyl, toon('#c0392b'), [i * 0.03, 0.9, 0.02], [0.006, 0.28, 0.006], [0, 0, i * 0.12]);
      const tip = flame(g, [i * 0.065, 1.04, 0.02], 0.07);
      tip.userData.group = 'altar';
      this.flames.push(tip);
    }
    for (const x of [-0.45, 0.45]) {
      m(g, G.cyl, GOLD(), [x, 0.69, 0], [0.05, 0.04, 0.05]);
      m(g, G.cyl, toon('#d4142f'), [x, 0.82, 0], [0.035, 0.22, 0.035]);
      const f = flame(g, [x, 0.97, 0], 0.13);
      f.userData.group = 'altar';
      this.flames.push(f);
    }
    m(g, G.cyl, GOLD(), [0.24, 0.69, 0.08], [0.15, 0.02, 0.15]);
    const fruit = ['#ffcc00', '#ff6b35', '#3f8a4a', '#e8344e', '#ffe08a'];
    fruit.forEach((c, i) => {
      const a = (i / fruit.length) * Math.PI * 2;
      m(g, G.sphere, toon(c), [0.24 + Math.cos(a) * 0.07, 0.74 + (i === 0 ? 0.06 : 0), 0.08 + Math.sin(a) * 0.07], i === 0 ? 0.06 : 0.045);
    });
    m(g, G.cyl, GOLD(), [-0.24, 0.69, 0.08], [0.12, 0.02, 0.12]);
    m(g, G.box, toon('#c8102e'), [-0.24, 0.74, 0.08], [0.14, 0.08, 0.1]);
    return g;
  }

  build_candles() {
    // Lễ lên đèn: chân nến vàng ba ngọn, ngọn giữa là nến hạnh phúc.
    const g = new THREE.Group();
    m(g, G.cyl, GOLD(), [0, 0.03, 0], [0.22, 0.06, 0.22]);
    m(g, G.cyl, GOLD(), [0, 0.42, 0], [0.025, 0.8, 0.025]);
    m(g, G.box, GOLD(), [0, 0.8, 0], [0.5, 0.03, 0.03]);
    const spots = [[-0.24, 0.92, 0.18, 'left'], [0.24, 0.92, 0.18, 'right'], [0, 1.0, 0.32, 'center']];
    for (const [x, y, h, name] of spots) {
      m(g, G.cyl, GOLD(), [x, 0.83, 0], [0.05, 0.03, 0.05]);
      m(g, G.cyl, toon(name === 'center' ? '#fff6e8' : '#ff8fab'), [x, 0.84 + h / 2, 0], [name === 'center' ? 0.05 : 0.035, h, name === 'center' ? 0.05 : 0.035]);
      const f = flame(g, [x, 0.86 + h + 0.05, 0], name === 'center' ? 0.24 : 0.15);
      f.userData.group = name;
      this.flames.push(f);
    }
    return g;
  }

  build_table() {
    const g = new THREE.Group();
    m(g, G.cyl, new THREE.MeshStandardMaterial({ color: '#efe4de', roughness: 0.9 }), [0, 0.32, 0], [0.5, 0.64, 0.5]);
    m(g, G.torus, toon('#ff9fb8'), [0, 0.6, 0], [0.5, 0.5, 0.25], [Math.PI / 2, 0, 0]);
    return g;
  }

  build_tower() {
    // Tháp ly 4 tầng (16 + 9 + 4 + 1 ly) đặt trên bàn.
    const g = new THREE.Group();
    const glass = toon('#e8f4ff', { transparent: true, opacity: 0.45, depthWrite: false });
    const wine = toon('#f4c542', { emissive: '#6a4a00' });
    g.userData.liquids = [];
    const sizes = [4, 3, 2, 1];
    sizes.forEach((n, tier) => {
      const y = 0.64 + tier * 0.12;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const x = (i - (n - 1) / 2) * 0.1;
          const z = (j - (n - 1) / 2) * 0.1;
          m(g, G.flute, glass, [x, y + 0.06, z], [0.045, 0.12, 0.045]);
          const l = m(g, G.cyl, wine, [x, y + 0.05, z], [0.035, 0.08, 0.035]);
          l.userData = { h: 0.08, y0: y + 0.05, delay: ((3 - tier) / 4) * 0.75 };
          g.userData.liquids.push(l);
        }
      }
    });
    return g;
  }

  build_cake() {
    const g = new THREE.Group();
    const tiers = [[0.27, 0.16], [0.2, 0.15], [0.14, 0.14]];
    let y = 0.64;
    tiers.forEach(([r, h], i) => {
      m(g, G.cyl, toon(i === 1 ? '#ffe3ea' : '#fffaf5'), [0, y + h / 2, 0], [r, h, r]);
      m(g, G.torus, toon('#ff9fb8'), [0, y + 0.01, 0], [r, r, 0.15], [Math.PI / 2, 0, 0]);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        m(g, G.sphere, toon('#e8344e'), [Math.cos(a) * r, y + h * 0.7, Math.sin(a) * r], 0.022);
      }
      y += h;
    });
    m(g, G.sphere, toon('#e8344e'), [-0.03, y + 0.06, 0], 0.045);
    m(g, G.sphere, toon('#e8344e'), [0.03, y + 0.06, 0], 0.045);
    m(g, G.octa, toon('#e8344e'), [0, y + 0.03, 0], [0.06, 0.05, 0.04]);
    return g;
  }

  build_ring() {
    const g = new THREE.Group();
    m(g, G.torus, toon('#f6d36b', { emissive: '#7a5a10' }), [0, 0, 0], 0.035, [Math.PI / 2, 0, 0]);
    m(g, G.octa, toon('#dff6ff', { emissive: '#7ac8ff' }), [0, 0.04, 0], 0.022);
    const glow = flame(g, [0, 0.04, 0], 0.12);
    glow.material.color.set('#bfe9ff');
    return g;
  }

  build_rose() {
    const g = new THREE.Group();
    m(g, G.sphere, toon('#e8344e'), [0, 0.02, 0.02], [0.06, 0.05, 0.06]);
    m(g, G.cyl, toon('#3f8a4a'), [0, -0.08, 0.02], [0.008, 0.16, 0.008]);
    return g;
  }

  glass() {
    const g = new THREE.Group();
    m(g, G.flute, toon('#e8f4ff', { transparent: true, opacity: 0.5, depthWrite: false }), [0, 0.03, 0], [0.035, 0.1, 0.035]);
    m(g, G.cyl, toon('#c8102e', { emissive: '#3a0008' }), [0, 0.02, 0], [0.026, 0.06, 0.026]);
    return g;
  }
  build_glassR() {
    return this.glass();
  }
  build_glassL() {
    return this.glass();
  }

  build_tray() {
    // Tráp lễ phủ khăn đỏ cho đội bê tráp.
    const g = new THREE.Group();
    m(g, G.cyl, toon('#c8102e'), [0, 0, 0], [0.2, 0.08, 0.2]);
    m(g, G.dome, toon('#d4142f'), [0, 0.04, 0], [0.19, 0.16, 0.19]);
    m(g, G.torus, GOLD(), [0, 0.04, 0], [0.2, 0.2, 0.2], [Math.PI / 2, 0, 0]);
    m(g, G.sphere, GOLD(), [0, 0.21, 0], 0.03);
    return g;
  }
}

// ---------------------------------------------------------------- Kịch bản từng nghi thức

const ease = (x) => x * x * (3 - 2 * x);

// ctx: { groom, bride, props, fx, hall, sfx, wait(sec), cameraTo, CAM_MAIN, closeUp(x), heartsAt(char), bigEmoji(text), spawnExtra(...) }
export const RITUALS = {
  async chuan_bi(c) {
    await place(c, 0);
    c.groom.play('wave');
    c.bride.play('wave');
    await c.wait(1.6);
    c.groom.play('idle');
    c.bride.play('idle');
  },

  async ruoc_dau(c) {
    await place(c, 0);
    // Đội bê tráp đi ngang trước sân khấu.
    const bearers = [];
    for (let i = 0; i < 4; i++) {
      const b = c.spawnExtra(1000 + i * 31, new THREE.Vector3(-2.9 - i * 0.55, 0, 1.05));
      b.carry = true;
      const tray = c.props.get(`tray${i}`);
      tray.position.set(0, 1.0, 0.3);
      b.root.add(tray);
      c.props.attached.push(tray);
      bearers.push(b);
    }
    bearers.forEach((b, i) => b.walkTo(2.9 + (3 - i) * 0.55, 1.05, 7.2).then(() => c.despawnExtra(b)));
    c.sfx.fanfare();
    // Chú rể sang đón cô dâu, trao hoa.
    c.bride.facePoint(c.groom.root.position.x, c.groom.root.position.z);
    await c.wait(1.2);
    await c.groom.walkTo(c.bride.root.position.x - 0.5, SLOT.bride.z, 1.6);
    c.groom.faceYaw(Math.PI / 2);
    c.props.attach('rose', c.groom);
    c.groom.play('offer');
    await c.wait(1.6);
    c.props.get('rose').parent?.remove(c.props.get('rose'));
    c.bride.play('cheer');
    c.heartsAt(c.bride, 5);
    c.sfx.cheer();
    c.hall.react('clap', 3);
    await c.wait(1.4);
    c.groom.play('idle');
    c.bride.play('idle');
    // Cùng nhau về giữa lễ đường.
    c.groom.walkTo(SLOT.groom.x, SLOT.groom.z, 2);
    c.bride.walkTo(SLOT.bride.x, SLOT.bride.z, 2);
    await c.wait(2.1);
    faceFront(c);
  },

  async gia_tien(c) {
    c.props.show('altar', new THREE.Vector3(0, 0, -0.75));
    c.props.lights(true, 'altar');
    c.sfx.twinkle();
    await place(c, 0, { x: 0.36, z: 0.15 });
    c.groom.faceYaw(Math.PI);
    c.bride.faceYaw(Math.PI);
    await c.wait(0.7);
    for (let i = 0; i < 3; i++) {
      c.groom.play('bow');
      c.bride.play('bow');
      c.smoke(new THREE.Vector3(0, 1.1, -0.73));
      await c.wait(1.35);
      c.smoke(new THREE.Vector3(0, 1.1, -0.73));
      await c.wait(0.9);
    }
    c.groom.play('idle');
    c.bride.play('idle');
    faceFront(c);
  },

  async len_den(c) {
    c.props.show('candles', new THREE.Vector3(0, 0, 0.95));
    await place(c, 0, { x: 0.42, z: 0.45 });
    c.groom.facePoint(0, 0.95);
    c.bride.facePoint(0, 0.95);
    c.groom.play('hold');
    c.bride.play('hold');
    await c.wait(1.4);
    c.props.lights(true, 'left');
    c.fx.burst(new THREE.Vector3(-0.24, 1.15, 0.95), 25, { speed: 0.8, life: 0.6 });
    c.sfx.twinkle();
    await c.wait(1.3);
    c.props.lights(true, 'right');
    c.fx.burst(new THREE.Vector3(0.24, 1.15, 0.95), 25, { speed: 0.8, life: 0.6 });
    c.sfx.twinkle();
    await c.wait(1.6);
    c.props.lights(true, 'center');
    c.fx.burst(new THREE.Vector3(0, 1.4, 0.95), 90, { colors: ['#fff3b0', '#ffd166', '#ff8fab'], speed: 1.8, life: 1 });
    c.sfx.fanfare();
    c.hall.react('clap', 3);
    c.groom.play('cheer');
    c.bride.play('cheer');
    await c.wait(1.8);
    c.groom.play('idle');
    c.bride.play('idle');
    faceFront(c);
  },

  async trao_nhan(c) {
    await place(c, 0.8, { x: 0.32, z: 0.35 });
    c.groom.faceYaw(Math.PI / 2);
    c.bride.faceYaw(-Math.PI / 2);
    c.cameraTo(c.closeUp(0), 0.9);
    await c.wait(1);
    c.props.attach('ring', c.groom);
    c.groom.play('offer');
    c.bride.play('receive');
    await c.wait(2.2);
    const ring = c.props.get('ring');
    ring.parent?.remove(ring);
    c.props.attach('ring', c.bride, 'L');
    c.bigEmoji('💍');
    c.sfx.twinkle();
    c.heartsAt(c.groom, 3);
    c.heartsAt(c.bride, 3);
    c.hall.react('clap', 3);
    await c.wait(1.6);
    c.groom.play('cheer');
    c.bride.play('cheer');
    c.sfx.cheer();
    c.fx.confetti(new THREE.Vector3(0, 1.3, 0.4), 100);
    await c.wait(1.6);
    c.cameraTo(c.CAM_MAIN, 0.9);
    c.groom.play('idle');
    c.bride.play('idle');
    faceFront(c);
  },

  async rot_ruou(c) {
    c.props.show('table', new THREE.Vector3(0, 0, 1.0));
    c.props.show('tower', new THREE.Vector3(0, 0, 1.0));
    await place(c, 0, { x: 0.38, z: 0.45 });
    c.groom.facePoint(0, 1.0);
    c.bride.facePoint(0, 1.0);
    await c.wait(0.6);
    c.groom.play('pour');
    c.bride.play('pour');
    const start = c.now();
    while (c.now() - start < 5) {
      const k = (c.now() - start) / 5;
      c.props.fill(ease(Math.min(1, k)));
      c.fx.burst(new THREE.Vector3((Math.random() - 0.5) * 0.3, 1.12 - k * 0.3, 1.0), 4, { colors: ['#fff3b0', '#ffd166'], speed: 0.6, gravity: 2, life: 0.5 });
      await c.wait(0.12);
    }
    c.props.fill(1);
    c.sfx.cheer();
    c.hall.react('cheer', 2.5);
    c.groom.play('cheer');
    c.bride.play('cheer');
    await c.wait(1.6);
    c.groom.play('idle');
    c.bride.play('idle');
    faceFront(c);
  },

  async cat_banh(c) {
    c.props.show('table', new THREE.Vector3(0, 0, 1.0), { pop: false });
    c.props.show('cake', new THREE.Vector3(0, 0, 1.0));
    await place(c, 0, { x: 0.36, z: 0.45 });
    c.groom.facePoint(0, 1.0);
    c.bride.facePoint(0, 1.0);
    await c.wait(1);
    c.groom.play('cut');
    c.bride.play('cut');
    await c.wait(1.6);
    c.fx.confetti(new THREE.Vector3(0, 1.2, 1.0), 120);
    c.fx.burst(new THREE.Vector3(0, 1.1, 1.0), 50, { colors: ['#ffffff', '#ffd1dc'], speed: 1.5, life: 0.7 });
    c.sfx.fanfare();
    c.hall.react('clap', 3);
    c.groom.play('cheer');
    c.bride.play('cheer');
    c.heartsAt(c.groom, 2);
    c.heartsAt(c.bride, 2);
    await c.wait(1.8);
    c.groom.play('idle');
    c.bride.play('idle');
    faceFront(c);
  },

  async giao_boi(c) {
    await place(c, 0.8, { x: 0.27, z: 0.35 });
    c.groom.faceYaw(Math.PI / 2);
    c.bride.faceYaw(-Math.PI / 2);
    c.props.attach('glassR', c.groom);
    c.props.attach('glassL', c.bride);
    c.cameraTo(c.closeUp(0), 0.9);
    c.groom.play('offer');
    c.bride.play('offer');
    await c.wait(1.6);
    c.groom.play('drink');
    c.bride.play('drink');
    await c.wait(2.4);
    c.heartsAt(c.groom, 3);
    c.heartsAt(c.bride, 3);
    c.sfx.cheer();
    c.hall.react('cheer', 2.5);
    c.groom.play('cheer');
    c.bride.play('cheer');
    await c.wait(1.5);
    c.cameraTo(c.CAM_MAIN, 0.9);
    c.groom.play('idle');
    c.bride.play('idle');
    faceFront(c);
  },

  async cam_on(c) {
    await place(c, 0);
    faceFront(c);
    await c.wait(0.4);
    for (let i = 0; i < 2; i++) {
      c.groom.play('bow');
      c.bride.play('bow');
      await c.wait(1.4);
    }
    c.groom.play('wave');
    c.bride.play('wave');
    c.fx.petals(200);
    c.fx.fireworkShow(5);
    c.sfx.launch();
    c.sfx.cheer();
    c.hall.react('cheer', 4);
    await c.wait(3);
    c.groom.play('idle');
    c.bride.play('idle');
  },
};

// Đưa cô dâu chú rể về vị trí: offset.x là khoảng cách mỗi người tới giữa.
async function place(c, extraWait, { x = Math.abs(SLOT.groom.x), z = SLOT.groom.z } = {}) {
  const moves = [];
  for (const [ch, side] of [[c.groom, -1], [c.bride, 1]]) {
    const p = ch.root.position;
    const tx = side * x;
    if (Math.hypot(p.x - tx, p.z - z) > 0.05) moves.push(ch.walkTo(tx, z, Math.max(0.4, Math.hypot(p.x - tx, p.z - z) / 1.2)));
  }
  if (moves.length) await Promise.race([Promise.all(moves), c.wait(2.5)]);
  if (extraWait) await c.wait(extraWait * 0.25);
}

function faceFront(c) {
  c.groom.faceYaw(0);
  c.bride.faceYaw(0);
}

export { Character };
