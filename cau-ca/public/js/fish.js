// Mô hình cá dựng từ khối cầu/nón. Thân dài theo trục +x (đầu ở +x), đuôi ở -x.
// makeFish trả về Group có userData.tail để vẫy đuôi và userData.length (mét trong cảnh).
import * as THREE from 'three';
import { mat, POND, bake } from './world.js';

const EYE_WHITE = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
const EYE_BLACK = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.2 });

// Chiều dài hiển thị theo cân nặng (phóng đại cho dễ nhìn trên điện thoại).
export function fishLength(kg, giant) {
  // sự kiện nhân cân nặng có thể ra cá chúa vài trăm ký: giới hạn cỡ để cá vẫn nằm gọn trong khung hình
  if (giant) return 2.2 + (Math.min(kg, 220) - 100) / 100;
  return 0.45 + Math.cbrt(kg) * 0.32;
}

// Mỗi con cá câu lên có hình khối riêng: gỡ khỏi cảnh mà không giải phóng thì bộ nhớ đồ hoạ tăng dần suốt buổi live.
// Vật liệu dùng chung giữa các con nên giữ lại.
export function removeFish(scene, fish) {
  scene.remove(fish);
  fish.traverse((o) => o.isMesh && o.geometry.dispose());
}

function sphere(r, material, pos, scale, rot) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), material);
  m.position.set(...pos);
  if (scale) m.scale.set(...scale);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  return m;
}

function fin(w, h, material, pos, rot) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(w * 0.2, h, w, h * 0.9);
  shape.quadraticCurveTo(w * 0.7, h * 0.3, w, 0);
  shape.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 6), material);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  return m;
}

// giant: cá chúa, cá hô con; đặt trong config.json để cá dài hẳn ra so với số ký.
export function makeFish({ color = '#d98c2b', belly = '#f8dd9c', name = '', giant = false } = {}, kg = 2) {
  const len = fishLength(kg, giant);
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const skin = mat(color, { rough: 0.45, metal: 0.1 });
  const under = mat(belly, { rough: 0.5 });
  const finMat = mat(color, { rough: 0.5, side: THREE.DoubleSide });

  body.add(sphere(0.5, skin, [0, 0.02, 0], [1, 0.48, 0.27]));
  body.add(sphere(0.5, under, [0.03, -0.05, 0], [0.88, 0.36, 0.25]));
  body.add(fin(0.22, 0.16, finMat, [-0.12, 0.2, 0], [0, 0, 0]));
  body.add(fin(0.12, 0.1, finMat, [0.12, -0.12, 0.1], [-1.0, 0.3, -0.4]));
  body.add(fin(0.12, 0.1, finMat, [0.12, -0.12, -0.1], [1.0, -0.3, -0.4]));
  // mang + môi
  const gill = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.008, 4, 10, Math.PI), mat(belly));
  gill.position.set(0.24, 0.01, 0);
  gill.rotation.set(0, Math.PI / 2, Math.PI / 2);
  gill.scale.set(1, 1, 1.2);
  body.add(gill);
  body.add(sphere(0.04, mat('#c8655a'), [0.5, -0.02, 0], [0.6, 0.6, 1]));
  for (const z of [1, -1]) {
    body.add(sphere(0.055, EYE_WHITE, [0.36, 0.07, 0.1 * z]));
    body.add(sphere(0.032, EYE_BLACK, [0.39, 0.075, 0.125 * z]));
  }
  // râu cho cá trê, cá lăng, cá tra
  if (/trê|lăng|tra\b/i.test(name)) {
    for (const z of [1, -1]) {
      const whisker = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.3, 4), mat('#3a3028'));
      whisker.position.set(0.55, -0.05, 0.06 * z);
      whisker.rotation.set(0.6 * z, 0, 1.0);
      body.add(whisker);
    }
  }

  // đuôi gắn ở khớp riêng để vẫy
  const tail = new THREE.Group();
  tail.position.set(-0.45, 0.02, 0);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.quadraticCurveTo(-0.15, 0.08, -0.3, 0.22);
  tailShape.quadraticCurveTo(-0.22, 0, -0.3, -0.22);
  tailShape.quadraticCurveTo(-0.15, -0.08, 0, 0);
  const tailMesh = new THREE.Mesh(new THREE.ShapeGeometry(tailShape, 8), finMat);
  tailMesh.castShadow = true;
  tail.add(tailMesh);
  body.add(tail);

  bake(body);
  g.scale.setScalar(len);
  g.userData = { tail, body, length: len };
  return g;
}

// Bóng cá dưới mặt nước: thân tám mặt, đuôi tam giác. Vẽ sau mặt nước (renderOrder 3) nên nhìn rõ từ máy toàn cảnh.
const swimBody = new THREE.OctahedronGeometry(0.5, 0).scale(1, 0.3, 0.42);
// đuôi nằm ngang để nhìn từ trên xuống vẫn ra dáng con cá
const swimTail = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.06, 0, 0), new THREE.Vector3(-0.36, 0, 0.24), new THREE.Vector3(-0.36, 0, -0.24)]);
function makeSwimmer(color, length, opacity) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const g = new THREE.Group();
  const body = new THREE.Mesh(swimBody, material);
  const tail = new THREE.Group();
  tail.position.set(-0.42, 0, 0);
  const fin = new THREE.Mesh(swimTail, material);
  tail.add(fin);
  g.add(body, tail);
  for (const o of [body, fin]) o.renderOrder = 3;
  g.scale.setScalar(length);
  g.userData = { tail };
  return g;
}

// Đàn cá dưới sông: cá hay tụ quanh chà, số còn lại lượn dọc khúc sông.
export function addSwimmers(scene) {
  const swimmers = [];
  const add = (color, length, opacity, y, path, pace = 1) => {
    const f = makeSwimmer(color, length, opacity);
    f.position.y = y;
    scene.add(f);
    swimmers.push({ mesh: f, path, a: Math.random() * Math.PI * 2, speed: pace * (0.14 + Math.random() * 0.16) * (Math.random() < 0.5 ? -1 : 1), phase: Math.random() * 6, wobble: 0.05 + Math.random() * 0.1 });
  };
  const roam = ['#1f3a2c', '#24402f', '#d9942f', '#1b3328', '#2a4634', '#e8e0c8'];
  for (let i = 0; i < 9; i++) add(roam[i % roam.length], 0.6 + Math.random() * 0.45, 0.62, -0.25, { e: POND.roam, r: 0.55 + Math.random() * 0.42 });
  const near = ['#1b3328', '#d9942f', '#24402f', '#1f3a2c', '#c9502c'];
  const hot = { x: POND.hot.x, z: POND.hot.z, rx: POND.hot.r, rz: POND.hot.r };
  for (let i = 0; i < 12; i++) add(near[i % near.length], 0.45 + Math.random() * 0.3, 0.68, -0.18, { e: hot, r: 0.55 + Math.random() * 0.45 }, 2.1);
  const prev = new THREE.Vector3();
  return {
    update(t, dt) {
      for (const s of swimmers) {
        s.a += s.speed * dt;
        const r = s.path.r + Math.sin(t * 0.3 + s.phase) * s.wobble;
        prev.copy(s.mesh.position);
        s.mesh.position.x = s.path.e.x + Math.cos(s.a) * s.path.e.rx * r;
        s.mesh.position.z = s.path.e.z + Math.sin(s.a) * s.path.e.rz * r;
        const dx = s.mesh.position.x - prev.x;
        const dz = s.mesh.position.z - prev.z;
        if (dx * dx + dz * dz > 1e-8) s.mesh.rotation.y = Math.atan2(-dz, dx);
        s.mesh.userData.tail.rotation.y = Math.sin(t * 8 + s.phase) * 0.5;
      }
    },
  };
}
