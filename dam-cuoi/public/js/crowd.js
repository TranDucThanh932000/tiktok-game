// Quan khách ngồi kín các bàn tiệc: vài trăm người thật (Rocketbox) mà vẫn nhẹ máy.
// Mỗi nhân vật × mỗi tư thế có một "bộ xương mẫu" chạy động tác quay thật; mọi khách cùng nhân vật, cùng tư thế
// được vẽ một lượt bằng instancing (bộ xương dùng chung, mỗi khách chỉ khác vị trí). Khách đổi tư thế
// (ngồi yên ↔ vỗ tay ↔ reo hò) là chuyển sang nhóm vẽ khác, không tốn thêm gì.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Tư thế: ngồi yên (3 kiểu), vỗ tay (2 nhóm lệch nhịp cho đỡ đều nhau), reo hò giơ tay.
const POSES = [
  { key: 'sit', clip: 'sit' },
  { key: 'sit2', clip: 'sit2' },
  { key: 'sit3', clip: 'sit3' },
  { key: 'clapA', clip: 'sitClap' },
  { key: 'clapB', clip: 'sitClap', lag: 0.37 },
  { key: 'cheer', clip: 'sitCheer' },
];
const IDLE = ['sit', 'sit2', 'sit3'];
const CLAP = ['clapA', 'clapB'];

// Gom các đoạn cùng chất liệu (da, áo, tóc) thành một đoạn liền, để mỗi nhóm khách chỉ tốn 2–3 lượt vẽ
// thay vì 10–12 lượt như file gốc. File gốc không có chỉ mục (mỗi tam giác ba đỉnh riêng), nên gộp các đỉnh trùng
// lại: card đồ hoạ tính xương cho ít đỉnh hơn hẳn.
function compact(mesh, cache) {
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const mats = [].concat(mesh.material);
  const count = geo.attributes.position.count;
  const groups = geo.groups.length ? geo.groups : [{ start: 0, count, materialIndex: 0 }];
  const keyOf = (m) => `${m.map?.uuid}|${m.alphaTest}|${m.side}`;
  const byKey = new Map();
  for (const g of groups) {
    const m = mats[g.materialIndex ?? 0] ?? mats[0];
    const k = keyOf(m);
    if (!byKey.has(k)) byKey.set(k, { mat: m, parts: [] });
    byKey.get(k).parts.push(g);
  }
  const out = new THREE.BufferGeometry();
  const order = [];
  const materials = [];
  let cursor = 0;
  for (const [k, { mat, parts }] of byKey) {
    const start = cursor;
    for (const g of parts) {
      order.push(g);
      cursor += Math.min(g.count, count - g.start);
    }
    out.addGroup(start, cursor - start, materials.length);
    // Chất liệu riêng cho đám đông: cùng một chất liệu vừa vẽ người thường vừa vẽ instancing sẽ bắt máy
    // đổi shader liên tục.
    if (!cache.has(k)) cache.set(k, mat.clone());
    materials.push(cache.get(k));
  }
  for (const [name, attr] of Object.entries(geo.attributes)) {
    const size = attr.itemSize;
    const dst = new attr.array.constructor(cursor * size);
    let o = 0;
    for (const g of order) {
      const n = Math.min(g.count, count - g.start) * size;
      dst.set(attr.array.subarray(g.start * size, g.start * size + n), o);
      o += n;
    }
    out.setAttribute(name, new THREE.BufferAttribute(dst, size, attr.normalized));
  }
  return { geometry: mergeVertices(out), materials };
}

// SkinnedMesh vẽ nhiều bản một lượt. Shader của three.js áp xương trước rồi mới áp ma trận instance,
// nên chỉ cần gắn thêm các thuộc tính của InstancedMesh.
function instancedSkinned(src, part, capacity) {
  const m = new THREE.SkinnedMesh(part.geometry, part.materials);
  m.isInstancedMesh = true;
  m.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity) * 16), 16);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.instanceColor = null;
  m.morphTexture = null;
  m.count = 0;
  m.frustumCulled = false;
  m.visible = false;
  m.bind(src.skeleton, src.bindMatrix);
  return m;
}

export class Crowd {
  // seats: [{ x, z, yaw, table }]: chỗ ngồi trong sảnh (sàn ở y = floorY), mặt hướng vào giữa bàn.
  constructor(scene, templates, seats, { floorY = -0.34 } = {}) {
    this.scene = scene;
    this.members = [];
    this.groups = [];
    this.time = 0;
    this.nextWave = 3;
    if (!templates.length || !seats.length) return;
    const matCache = new Map();
    this.groups = templates.map((t) => {
      // Cấu trúc vẽ dùng chung cho mọi tư thế của nhân vật này.
      const parts = [];
      t.object.traverse((o) => o.isSkinnedMesh && parts.push(compact(o, matCache)));
      return { template: t, parts, poses: {}, dirty: true, members: [] };
    });
    // Chia ghế cho từng nhân vật, xen kẽ nam nữ cho tự nhiên.
    const order = this.groups.map((g, i) => i).sort((a, b) => (this.groups[a].template.info.gender < this.groups[b].template.info.gender ? -1 : 1));
    const interleave = [];
    const m = order.filter((i) => this.groups[i].template.info.gender === 'm');
    const f = order.filter((i) => this.groups[i].template.info.gender !== 'm');
    for (let i = 0; i < Math.max(m.length, f.length); i++) {
      if (m[i] !== undefined) interleave.push(m[i]);
      if (f[i] !== undefined) interleave.push(f[i]);
    }
    seats.forEach((s, i) => {
      const g = this.groups[interleave[(i * 7 + (s.table ?? 0) * 3) % interleave.length]];
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(s.x, floorY, s.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw + (Math.random() - 0.5) * 0.25),
        new THREE.Vector3().setScalar(0.96 + Math.random() * 0.07),
      );
      const member = { group: g, matrix, pose: IDLE[i % 3], until: 0, next: null, z: s.z, table: s.table ?? -1 };
      g.members.push(member);
      this.members.push(member);
    });
    for (const g of this.groups) {
      for (const pose of POSES) {
        const clip = g.template.clips[pose.clip] ?? g.template.clips.sit;
        if (!clip) continue;
        const rig = SkeletonUtils.clone(g.template.object);
        rig.position.set(0, 0, 0);
        rig.rotation.set(0, 0, 0);
        rig.updateMatrixWorld(true);
        const mixer = new THREE.AnimationMixer(rig);
        const action = mixer.clipAction(clip);
        action.play();
        mixer.update(pose.lag ? pose.lag * clip.duration : Math.random() * clip.duration);
        rig.updateMatrixWorld(true);
        const skinned = [];
        rig.traverse((o) => o.isSkinnedMesh && skinned.push(o));
        const meshes = skinned.map((src, i) => {
          const mesh = instancedSkinned(src, g.parts[i], g.members.length);
          scene.add(mesh);
          return mesh;
        });
        g.poses[pose.key] = { rig, mixer, meshes, count: 0 };
      }
    }
    this.flush();
  }

  get count() {
    return this.members.length;
  }

  setPose(member, pose) {
    if (member.pose === pose) return;
    member.pose = pose;
    member.group.dirty = true;
  }

  // Ghi lại vị trí khách vào từng nhóm vẽ theo tư thế hiện tại.
  flush() {
    for (const g of this.groups) {
      if (!g.dirty) continue;
      g.dirty = false;
      for (const p of Object.values(g.poses)) p.count = 0;
      for (const m of g.members) {
        const p = g.poses[m.pose] ?? g.poses.sit;
        for (const mesh of p.meshes) mesh.instanceMatrix.array.set(m.matrix.elements, p.count * 16);
        p.count++;
      }
      for (const p of Object.values(g.poses)) {
        for (const mesh of p.meshes) {
          mesh.count = p.count;
          mesh.visible = p.count > 0;
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }
  }

  // Cả sảnh phản ứng: lan dần từ bàn gần sân khấu ra cuối sảnh như một đợt sóng.
  // kind: clap | cheer | shock. share: tỉ lệ khách tham gia.
  react(kind, seconds = 2.5, share = 0.85) {
    for (const m of this.members) {
      if (Math.random() > share) continue;
      const pose = kind === 'cheer' ? (Math.random() < 0.55 ? 'cheer' : CLAP[Math.random() < 0.5 ? 0 : 1]) : kind === 'shock' ? IDLE[Math.floor(Math.random() * 3)] : CLAP[Math.random() < 0.5 ? 0 : 1];
      const delay = Math.max(0, m.z) * 0.035 + Math.random() * 0.5;
      m.next = { at: this.time + delay, pose, hold: seconds + Math.random() * 1.2 };
    }
  }

  // Một bàn vỗ tay (cho sảnh lúc nào cũng có chút sôi động).
  tableCheer(table, seconds = 2.5) {
    for (const m of this.members) {
      if (m.table !== table || m.next) continue;
      m.next = { at: this.time + Math.random() * 0.4, pose: Math.random() < 0.3 ? 'cheer' : CLAP[Math.random() < 0.5 ? 0 : 1], hold: seconds + Math.random() };
    }
  }

  update(dt) {
    if (!this.members.length) return;
    this.time += dt;
    // Thỉnh thoảng vài bàn tự vỗ tay cổ vũ.
    if (this.time >= this.nextWave) {
      this.nextWave = this.time + 1.6 + Math.random() * 2.4;
      const tables = [...new Set(this.members.map((m) => m.table))];
      for (let i = 0; i < 2; i++) this.tableCheer(tables[Math.floor(Math.random() * tables.length)]);
    }
    for (const m of this.members) {
      if (m.next && this.time >= m.next.at) {
        this.setPose(m, m.next.pose);
        m.until = this.time + m.next.hold;
        m.next = null;
      } else if (m.until && this.time >= m.until) {
        m.until = 0;
        this.setPose(m, IDLE[Math.floor(Math.random() * 3)]);
      }
    }
    this.flush();
    for (const g of this.groups) {
      for (const p of Object.values(g.poses)) {
        if (!p.count) continue;
        p.mixer.update(dt);
        p.rig.updateMatrixWorld(true);
      }
    }
  }
}
