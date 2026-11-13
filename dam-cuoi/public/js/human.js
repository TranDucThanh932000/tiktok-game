// Nhân vật người thật (Microsoft Rocketbox, giấy phép MIT) thay cho nhân vật chibi.
// - Đứng, đi, vỗ tay, reo hò, vẫy tay, uống: động tác quay từ người thật (public/anims/*.json).
// - Đá, bị đá văng, cúi lạy, trao nhẫn, rót rượu, cắt bánh...: dùng lại động tác tự viết của nhân vật chibi.
//   Một "con rối" chibi ẩn (không thêm vào cảnh) diễn động tác, rồi từng đoạn tay chân người thật được xoay
//   cho cùng hướng với con rối.
// API giống hệt Character (character.js) để main.js, world.js, ritual.js dùng chung.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Character, hashSeed } from './character.js';

const MOCAP = Object.fromEntries(
  ['idle', 'idle2', 'walk', 'cheer', 'clap', 'wave', 'drink', 'laugh', 'talk1', 'talk2', 'talk3', 'moderate', 'presentL', 'presentR', 'sit', 'sit2', 'sit3'].map((k) => [k, k]),
);
const lib = { ready: false, byRole: { groom: [], bride: [], guest: [], mc: [] }, templates: new Map() };
const BLANK_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// ---------------------------------------------------------------- Tải nhân vật và động tác

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Không tải được ${url}`));
    img.src = url;
  });
}

function texture(source) {
  const t = source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(source) : new THREE.Texture(source);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// Đổi màu áo của cô dâu sang trắng ngà (giữ độ sáng tối của nếp vải), theo khoảng màu trong avatars.json.
function recolor(img, { hue, minSat = 0.2 }) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i] / 255;
    const gg = p[i + 1] / 255;
    const b = p[i + 2] / 255;
    const max = Math.max(r, gg, b);
    const min = Math.min(r, gg, b);
    const d = max - min;
    if (!d || d / max < minSat) continue;
    let h = max === r ? ((gg - b) / d) % 6 : max === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
    h = (h * 60 + 360) % 360;
    if (h < hue[0] || h > hue[1]) continue;
    const shade = Math.min(1, 0.55 + max * 0.75);
    p[i] = 250 * shade;
    p[i + 1] = 246 * shade;
    p[i + 2] = 240 * shade;
  }
  g.putImageData(data, 0, 0);
  return c;
}

function clipFrom(json, restRoot) {
  const tracks = json.tracks.map((t) =>
    t.type === 'quaternion'
      ? new THREE.QuaternionKeyframeTrack(t.name, t.times, t.values)
      : new THREE.VectorKeyframeTrack(t.name, t.times, t.values.map((v, i) => v + (json.absolute && i % 3 === 1 ? 0 : restRoot[i % 3]))),
  );
  const clip = new THREE.AnimationClip(json.name, json.duration, tracks);
  clip.userData = { speed: json.speed || 1 };
  return clip;
}

async function loadAvatar(info, clipJson) {
  const base = `/avatars/${info.name}/`;
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => (url.endsWith('.fbx') ? url : BLANK_PIXEL));
  const [object, body, head, opacity] = await Promise.all([
    new FBXLoader(manager).loadAsync(`${base}model.fbx`),
    loadImage(`${base}body.jpg`),
    loadImage(`${base}head.jpg`),
    info.hair === false ? null : loadImage(`${base}opacity.png`).catch(() => null),
  ]);
  const maps = {
    body: texture(info.recolor ? recolor(body, info.recolor) : body),
    head: texture(head),
    opacity: opacity ? texture(opacity) : null,
  };
  object.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.castShadow = true;
    const mats = [].concat(o.material).map((m) => {
      const name = m.name.toLowerCase();
      if (name.includes('opacity')) {
        return new THREE.MeshStandardMaterial({ map: maps.opacity, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85 });
      }
      return new THREE.MeshStandardMaterial({ map: name.includes('head') ? maps.head : maps.body, roughness: name.includes('head') ? 0.6 : 0.8, metalness: 0 });
    });
    o.material = Array.isArray(o.material) ? mats : mats[0];
  });
  // File FBX có kèm đèn môi trường; mỗi nhân vật một đèn sẽ làm cả cảnh chói trắng.
  const lights = [];
  object.traverse((o) => o.isLight && lights.push(o));
  lights.forEach((l) => l.removeFromParent());
  object.scale.setScalar(0.01);
  let rootBone = null;
  object.traverse((o) => {
    if (o.isBone && o.name === 'Bip01') rootBone ??= o;
  });
  const restRoot = rootBone ? rootBone.position.toArray() : [0, 0, 0];
  const clips = {};
  for (const [key, json] of Object.entries(clipJson[info.gender] ?? {})) clips[key] = clipFrom(json, restRoot);
  return { info, object, clips };
}

export async function loadHumans(onProgress = () => {}) {
  const manifest = await fetch('/avatars/avatars.json').then((r) => r.json());
  const clipJson = { m: {}, f: {} };
  await Promise.all(
    Object.entries(manifest.clips).flatMap(([gender, keys]) =>
      keys.map((key) => fetch(`/anims/${gender}_${key}.json`).then((r) => r.json()).then((j) => (clipJson[gender][key] = j))),
    ),
  );
  let done = 0;
  await Promise.all(
    manifest.avatars.map(async (info) => {
      try {
        const t = await loadAvatar(info, clipJson);
        lib.templates.set(info.name, t);
        lib.byRole[info.role]?.push(t);
      } catch (err) {
        console.error(err);
      }
      onProgress(++done, manifest.avatars.length);
    }),
  );
  for (const list of Object.values(lib.byRole)) list.sort((a, b) => a.info.name.localeCompare(b.info.name));
  lib.ready = lib.byRole.groom.length > 0 && lib.byRole.bride.length > 0;
  return lib.ready;
}

export const humansReady = () => lib.ready;

// ---------------------------------------------------------------- Đồ cưới thêm cho cô dâu

const gownProfile = [
  [0.001, 0.0], [0.58, 0.0], [0.6, 0.03], [0.55, 0.15], [0.45, 0.36], [0.33, 0.6], [0.22, 0.82], [0.165, 0.95], [0.155, 1.0], [0.001, 1.0],
].map(([x, y]) => new THREE.Vector2(x, y));
const gownGeo = (() => {
  const g = new THREE.LatheGeometry(gownProfile, 64);
  // Nếp gấp váy: bán kính dao động theo góc, càng xuống dưới càng rõ.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const y = p.getY(i);
    const a = Math.atan2(z, x);
    const k = 1 + Math.sin(a * 14) * 0.035 * (1 - y);
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
})();
const gownMat = new THREE.MeshPhysicalMaterial({ color: '#e9e4de', roughness: 0.55, sheen: 1, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.4 });
const veilMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9 });
const veilGeo = new THREE.CylinderGeometry(0.09, 0.32, 1, 24, 1, true, Math.PI * 0.6, Math.PI * 0.8);
const tiaraMat = new THREE.MeshStandardMaterial({ color: '#f6d36b', metalness: 0.9, roughness: 0.25, emissive: '#3a2a08' });
const pearlMat = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.2, roughness: 0.15, emissive: '#2a2a2a' });
const ghostMat = new THREE.MeshStandardMaterial({ color: '#ff9fbc', transparent: true, opacity: 0.5, depthWrite: false, emissive: '#ff4f86', emissiveIntensity: 0.45 });

// ---------------------------------------------------------------- Nhân vật

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _frameInv = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const FIST = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -1.35);
const FIST_F = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.35);

export class HumanCharacter {
  // kind: groom | bride | guest. owner: người chơi (chọn nhân vật theo id), blank: bóng mờ chờ người chơi.
  constructor(kind, { seed = Math.random() * 1e9, blank = false, scale = 1, gender, mic = false } = {}) {
    this.kind = kind;
    this.blank = blank;
    this.mic = mic;
    let list = lib.byRole[kind]?.length ? lib.byRole[kind] : lib.byRole.guest;
    if (gender && list.some((t) => t.info.gender === gender)) list = list.filter((t) => t.info.gender === gender);
    const template = list[Math.floor(seed) % list.length];
    this.gender = template.info.gender;
    this.root = new THREE.Group();
    this.spinner = new THREE.Group();
    this.frame = new THREE.Group(); // không gian thân người: mọi hướng tính trong khung này
    this.root.add(this.spinner);
    this.spinner.add(this.frame);
    this.root.scale.setScalar(scale);
    this.model = SkeletonUtils.clone(template.object);
    this.frame.add(this.model);
    if (blank) this.model.traverse((o) => o.isMesh && (o.material = Array.isArray(o.material) ? o.material.map(() => ghostMat) : ghostMat));

    this.bones = {};
    this.restLocal = new Map();
    this.model.traverse((o) => {
      if (!o.isBone) return;
      this.bones[o.name.replace(/^Bip01_?/, '') || 'root'] = o;
      this.restLocal.set(o, o.quaternion.clone());
    });
    this.root.updateMatrixWorld(true);
    this.rest = {};
    const chains = {
      Spine: 'Neck', Neck: 'Head',
      L_UpperArm: 'L_Forearm', L_Forearm: 'L_Hand', R_UpperArm: 'R_Forearm', R_Forearm: 'R_Hand',
      L_Thigh: 'L_Calf', L_Calf: 'L_Foot', R_Thigh: 'R_Calf', R_Calf: 'R_Foot',
    };
    this.frame.getWorldQuaternion(_frameInv).invert();
    const frameInvM = new THREE.Matrix4().copy(this.frame.matrixWorld).invert();
    for (const [name, child] of Object.entries(chains)) {
      const b = this.bones[name];
      const c = this.bones[child];
      if (!b || !c) continue;
      const pb = b.getWorldPosition(new THREE.Vector3()).applyMatrix4(frameInvM);
      const pc = c.getWorldPosition(new THREE.Vector3()).applyMatrix4(frameInvM);
      const q = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(_frameInv);
      this.rest[name] = { dir: pc.sub(pb).normalize(), q };
    }
    const head = this.bones.Head?.getWorldPosition(new THREE.Vector3()).applyMatrix4(frameInvM);
    this.headHeight = head ? head.y : 1.6;
    const pelvis = this.bones.Pelvis?.getWorldPosition(new THREE.Vector3()).applyMatrix4(frameInvM);
    this.hipHeight = pelvis ? pelvis.y : 0.9;

    // Con rối chibi ẩn: chỉ để tính tư thế cho các động tác tự viết.
    this.puppet = new Character(kind === 'bride' ? 'bride' : 'groom', { seed });
    this.puppet.root.updateMatrixWorld(true);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const [key, clip] of Object.entries(template.clips)) this.actions[key] = this.mixer.clipAction(clip);
    this.current = null;
    this.weight = 0; // 0 = động tác quay thật, 1 = động tác tự viết
    this.armWeight = 0;
    this.armWeightR = 0;
    this.anim = '';
    this.yaw = 0;
    this.targetYaw = 0;
    this.move = null;
    this.flight = null;
    this.done = false;
    this.carry = false;
    this.anchors = {};
    this.headTopOffset = 0.2;
    if (kind === 'bride' && !blank) this.dressUp();
    if (mic) this.holdMic();
    this.play('idle');
    // Mỗi người bắt đầu ở một lúc khác nhau của động tác đứng, không ai cử động giống ai.
    this.mixer.update(Math.random() * 8);
  }

  dressUp() {
    const gown = new THREE.Mesh(gownGeo, gownMat);
    const waist = this.hipHeight + 0.1;
    gown.scale.set(1, waist, 1);
    this.frame.add(gown);
    this.gown = gown;
    // Khăn voan và vương miện bám theo đầu.
    const head = this.anchor('Head');
    const veil = new THREE.Mesh(veilGeo, veilMat);
    veil.scale.set(1, 0.9, 1);
    veil.position.set(0, -0.36, -0.04);
    head.add(veil);
    const tiara = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.008, 6, 24, Math.PI), tiaraMat);
    tiara.position.set(0, 0.1, 0.0);
    tiara.rotation.set(-0.35, 0, 0);
    head.add(tiara);
    for (let i = 0; i < 5; i++) {
      const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), pearlMat);
      const a = (i / 4) * Math.PI;
      pearl.position.set(Math.cos(a) * 0.085, 0.1 + Math.sin(a) * 0.085 * Math.cos(0.35) + 0.012, -Math.sin(a) * 0.085 * Math.sin(0.35));
      head.add(pearl);
    }
    // Bó hoa cưới ở tay phải.
    const hand = this.handAnchor('R');
    const colors = ['#e8344e', '#ff7a9c', '#ffffff', '#ffd1dc', '#c2183c'];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = i ? 0.045 : 0;
      const rose = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.6 }));
      rose.position.set(Math.cos(a) * r, -0.07, Math.sin(a) * r + 0.03);
      hand.add(rose);
    }
  }

  // Micro cầm tay của MC.
  holdMic() {
    const hand = this.handAnchor('R');
    const black = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.4, metalness: 0.6 });
    const grill = new THREE.MeshStandardMaterial({ color: '#9a9a9a', roughness: 0.35, metalness: 0.9 });
    // Cán micro nằm trong nắm tay, đầu micro nhô lên phía ngón cái.
    const mic = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.013, 0.18, 12), black);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), grill);
    head.position.y = 0.105;
    mic.add(handle, head);
    mic.position.set(0, -0.02, 0.025);
    hand.add(mic);
    this.micObj = mic;
    // Xương ngón tay của nhân vật nam và nữ gập theo hai chiều ngược nhau.
    this.fistQ = this.gender === 'f' ? FIST_F : FIST;
    this.fist = Object.entries(this.bones).filter(([n]) => /^R_Finger[1-4]\d?$/.test(n)).map(([, b]) => b);
  }

  // Đầu micro luôn hướng về miệng, tay cử động thế nào cũng vậy.
  aimMic() {
    const head = this.bones.Head;
    if (!head) return;
    this.root.updateMatrixWorld(true);
    const from = this.micObj.getWorldPosition(_v);
    const mouth = head.getWorldPosition(_v2).add(_v3.set(0, -0.04, 0.09).applyQuaternion(this.root.quaternion));
    const dir = mouth.sub(from).normalize();
    this.micObj.parent.getWorldQuaternion(_q2).invert();
    this.micObj.quaternion.setFromUnitVectors(UP, dir).premultiply(_q2);
  }

  // Điểm gắn đồ trên một xương. Trục của điểm neo trùng khung thân người khi xương ở tư thế gốc, nên đồ gắn vào
  // không bị lệch theo trục riêng của xương 3ds Max. Mô hình tính bằng cm nên điểm neo phóng to 100 lần.
  anchor(boneName) {
    if (this.anchors[boneName]) return this.anchors[boneName];
    const bone = this.bones[boneName];
    const q = this.model.quaternion.clone();
    const chain = [];
    for (let o = bone; o && o !== this.model; o = o.parent) chain.unshift(o);
    for (const n of chain) q.multiply(this.restLocal.get(n) ?? n.quaternion);
    const a = new THREE.Group();
    a.quaternion.copy(q).invert();
    a.scale.setScalar(100);
    bone.add(a);
    this.anchors[boneName] = a;
    return a;
  }

  // Tay cầm đồ: trục -y của điểm cầm chỉ dọc cẳng tay về phía các ngón (giống tay nhân vật chibi), đặt ở lòng bàn tay.
  handAnchor(side) {
    const key = `hand${side}`;
    if (this.anchors[key]) return this.anchors[key];
    const a = this.anchor(`${side}_Hand`);
    const dir = this.rest[`${side}_Forearm`]?.dir ?? new THREE.Vector3(0, -1, 0);
    const holder = new THREE.Group();
    holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    holder.position.copy(dir).multiplyScalar(0.08);
    a.add(holder);
    this.anchors[key] = holder;
    return holder;
  }

  get armR() {
    return { el: this.handAnchor('R') };
  }

  get armL() {
    return { el: this.handAnchor('L') };
  }

  // ---------------------------------------------------------------- Điều khiển (giống Character)

  play(name) {
    if (this.anim === name) return;
    this.anim = name;
    const key = MOCAP[name];
    // MC: thân người theo động tác quay thật, riêng tay phải giữ micro (lấy từ con rối).
    this.puppet.play(this.mic && key ? 'mic' : name);
    const next = key && this.actions[key] ? this.actions[key] : this.actions.idle;
    if (next && next !== this.current) {
      next.reset().setEffectiveWeight(1).fadeIn(0.3).play();
      this.current?.fadeOut(0.3);
      this.current = next;
    }
    this.mocap = !!(key && this.actions[key]);
  }

  setFace() {}

  faceYaw(yaw) {
    this.targetYaw = yaw;
  }

  facePoint(x, z) {
    this.targetYaw = Math.atan2(x - this.root.position.x, z - this.root.position.z);
  }

  walkTo(x, z, duration, y) {
    return new Promise((resolve) => {
      this.move?.resolve();
      const from = this.root.position.clone();
      const to = new THREE.Vector3(x, y ?? from.y, z);
      this.move = { from, to, t: 0, duration: Math.max(0.05, duration), resolve };
      this.facePoint(x, z);
      this.play('walk');
      // Bước chân khớp tốc độ di chuyển để không bị trượt.
      const speed = from.distanceTo(to) / Math.max(0.05, duration);
      const clipSpeed = this.actions.walk?.getClip().userData.speed || 1;
      if (this.actions.walk) this.actions.walk.timeScale = THREE.MathUtils.clamp(speed / clipSpeed, 0.6, 1.8);
    });
  }

  knockAway(velocity, life = 1.6) {
    this.move?.resolve();
    this.move = null;
    this.flight = { v: velocity.clone(), t: 0, life, spin: new THREE.Vector3(7 + Math.random() * 4, 0, (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 4)) };
    this.play('fly');
  }

  headTop() {
    const head = this.bones.Head;
    if (!head) return new THREE.Vector3(0, 1.85, 0).applyMatrix4(this.root.matrixWorld);
    return head.getWorldPosition(new THREE.Vector3()).add(_v.set(0, 0.2 * this.root.scale.y, 0));
  }

  // ---------------------------------------------------------------- Mỗi khung hình

  update(dt) {
    const p = this.root.position;
    if (this.move) {
      const m = this.move;
      m.t += dt;
      const k = Math.min(1, m.t / m.duration);
      p.lerpVectors(m.from, m.to, k);
      if (k >= 1) {
        this.move = null;
        if (this.anim === 'walk') this.play('idle');
        m.resolve();
      }
    }
    if (this.flight) {
      const f = this.flight;
      f.t += dt;
      f.v.y -= 5 * dt;
      p.addScaledVector(f.v, dt);
      this.spinner.rotation.x += f.spin.x * dt;
      this.spinner.rotation.z += f.spin.z * dt;
      if (f.t >= f.life) this.done = true;
    } else {
      let d = this.targetYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 10);
      this.root.rotation.y = this.yaw;
    }

    // Con rối tính tư thế cho động tác tự viết.
    this.puppet.update(dt);
    if (this.puppet.anim !== this.anim && !this.mocap && !this.mic) {
      // Con rối tự chuyển (ví dụ kick xong về idle, spin xong sang cheer): nhân vật đi theo.
      this.play(this.puppet.anim);
    }
    this.mixer.update(dt);

    const target = this.mocap ? 0 : 1;
    const armTarget = this.carry ? 1 : target;
    const armTargetR = this.carry || this.mic ? 1 : target;
    const k = Math.min(1, dt * 7);
    this.weight += (target - this.weight) * k;
    this.armWeight += (armTarget - this.armWeight) * k;
    this.armWeightR += (armTargetR - this.armWeightR) * k;
    this.frame.rotation.y = this.puppet.body.rotation.y;
    this.frame.position.y = (this.puppet.hips.position.y - 0.68) * this.weight;
    if (this.weight > 0.01 || this.armWeight > 0.01 || this.armWeightR > 0.01) this.retarget();
    // Nắm tay quanh micro: gập các đốt ngón (trừ ngón cái).
    if (this.fist) for (const b of this.fist) b.quaternion.copy(this.restLocal.get(b)).multiply(this.fistQ ?? FIST);
    if (this.micObj) this.aimMic();
  }

  retarget() {
    const P = this.puppet;
    P.root.updateMatrixWorld(true);
    const pos = (o, x = 0, y = 0, z = 0) => o.localToWorld(new THREE.Vector3(x, y, z));
    const hips = pos(P.hips);
    const neck = pos(P.neck);
    const headTop = pos(P.neck, 0, 0.5, 0);
    const targets = {
      Spine: [neck.clone().sub(hips), this.weight],
      Neck: [headTop.clone().sub(neck), this.weight],
    };
    for (const [side, arm, leg] of [['L', P.armL, P.legL], ['R', P.armR, P.legR]]) {
      const sh = pos(arm.sh);
      const el = pos(arm.el);
      const hand = pos(arm.el, 0, -0.22, 0);
      const hip = pos(leg.hip);
      const knee = pos(leg.knee);
      const foot = pos(leg.knee, 0, -0.32, 0);
      const aw = side === 'R' ? this.armWeightR : this.armWeight;
      targets[`${side}_UpperArm`] = [el.clone().sub(sh), aw];
      targets[`${side}_Forearm`] = [hand.clone().sub(el), aw];
      targets[`${side}_Thigh`] = [knee.clone().sub(hip), this.weight];
      targets[`${side}_Calf`] = [foot.clone().sub(knee), this.weight];
    }
    this.frame.updateMatrixWorld(true);
    this.frame.getWorldQuaternion(_frameInv).invert();
    // Thứ tự cha trước con.
    for (const name of ['Spine', 'Neck', 'L_UpperArm', 'L_Forearm', 'R_UpperArm', 'R_Forearm', 'L_Thigh', 'L_Calf', 'R_Thigh', 'R_Calf']) {
      const rest = this.rest[name];
      const bone = this.bones[name];
      const [dir, w] = targets[name];
      if (!rest || !bone || w < 0.01) continue;
      // Hướng mong muốn trong khung thân -> quaternion của xương trong khung thân -> đổi sang hệ của xương cha.
      _q.setFromUnitVectors(rest.dir, _v2.copy(dir).normalize()).multiply(rest.q);
      bone.parent.getWorldQuaternion(_q2).premultiply(_frameInv).invert();
      _q.premultiply(_q2);
      bone.quaternion.slerp(_q, w);
      bone.updateMatrixWorld(true);
    }
  }
}

export { hashSeed };
