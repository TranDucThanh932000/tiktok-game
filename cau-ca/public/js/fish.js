// Mô hình cá dựng từ khối cầu/nón. Thân dài theo trục +x (đầu ở +x), đuôi ở -x.
// makeFish trả về Group có userData.tail để vẫy đuôi và userData.length (mét trong cảnh).
import * as THREE from 'three';
import { mat, POND, bake, pondRadius, haloTexture } from './world.js';

const EYE_WHITE = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
const EYE_BLACK = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.2 });

// Chiều dài hiển thị theo cân nặng (phóng đại cho dễ nhìn trên điện thoại).
export function fishLength(kg, shark) {
  // sự kiện nhân cân nặng có thể ra cá mập vài trăm ký: giới hạn cỡ để cá vẫn nằm gọn trong khung hình
  if (shark) return 2.2 + (Math.min(kg, 220) - 100) / 100;
  return 0.45 + Math.cbrt(kg) * 0.32;
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

export function makeFish({ color = '#d98c2b', belly = '#f8dd9c', name = '' } = {}, kg = 2) {
  const shark = /mập/i.test(name);
  const hammer = /búa/i.test(name);
  const len = fishLength(kg, shark);
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const skin = mat(color, { rough: 0.45, metal: 0.1 });
  const under = mat(belly, { rough: 0.5 });
  const finMat = mat(color, { rough: 0.5, side: THREE.DoubleSide });

  if (shark) {
    // thân thon dài, bụng trắng, vây lưng to, đuôi lưỡi liềm
    body.add(sphere(0.5, skin, [0, 0.03, 0], [1, 0.36, 0.34]));
    body.add(sphere(0.5, under, [0.02, -0.04, 0], [0.96, 0.3, 0.31]));
    body.add(sphere(0.2, skin, [0.48, 0.0, 0], [1.1, 0.55, 0.62]));
    if (hammer) body.add(sphere(0.2, skin, [0.58, 0.02, 0], [0.35, 0.18, 1.6]));
    body.add(fin(0.32, 0.36, finMat, [-0.1, 0.14, 0], [0, 0, 0]));
    body.add(fin(0.26, 0.2, finMat, [0.12, -0.08, 0.12], [-1.1, 0.4, -0.3]));
    body.add(fin(0.26, 0.2, finMat, [0.12, -0.08, -0.12], [1.1, -0.4, -0.3]));
    // miệng có răng
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 6, 12, Math.PI), mat('#3a1010'));
    mouth.position.set(0.56, -0.07, 0);
    mouth.rotation.set(Math.PI / 2, 0, Math.PI);
    body.add(mouth);
    for (let i = 0; i < 6; i++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 3), mat('#ffffff'));
      const a = (i / 5) * Math.PI;
      tooth.position.set(0.56 - Math.sin(a) * 0.06, -0.07 + 0.012, Math.cos(a) * 0.065);
      body.add(tooth);
    }
    for (const z of [1, -1]) {
      body.add(sphere(0.032, EYE_BLACK, [0.5, 0.06, 0.1 * z]));
    }
  } else {
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
    // râu cho cá trê, cá lăng
    if (/trê|lăng/i.test(name)) {
      for (const z of [1, -1]) {
        const whisker = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.3, 4), mat('#3a3028'));
        whisker.position.set(0.55, -0.05, 0.06 * z);
        whisker.rotation.set(0.6 * z, 0, 1.0);
        body.add(whisker);
      }
    }
  }

  // đuôi gắn ở khớp riêng để vẫy
  const tail = new THREE.Group();
  tail.position.set(-0.45, 0.02, 0);
  const tailShape = new THREE.Shape();
  if (shark) {
    tailShape.moveTo(0, 0);
    tailShape.quadraticCurveTo(-0.12, 0.12, -0.3, 0.36);
    tailShape.quadraticCurveTo(-0.14, 0.05, -0.2, -0.2);
    tailShape.closePath();
  } else {
    tailShape.moveTo(0, 0);
    tailShape.quadraticCurveTo(-0.15, 0.08, -0.3, 0.22);
    tailShape.quadraticCurveTo(-0.22, 0, -0.3, -0.22);
    tailShape.quadraticCurveTo(-0.15, -0.08, 0, 0);
  }
  const tailMesh = new THREE.Mesh(new THREE.ShapeGeometry(tailShape, 8), finMat);
  tailMesh.castShadow = true;
  tail.add(tailMesh);
  body.add(tail);

  bake(body);
  g.scale.setScalar(len);
  g.userData = { tail, body, length: len, shark };
  return g;
}

// Cá phát quang: thân tám mặt, đuôi tam giác, quầng sáng quanh mình. Vẽ sau mặt nước (renderOrder 3) nên không bị nước che mờ.
const glowBody = new THREE.OctahedronGeometry(0.5, 0).scale(1, 0.3, 0.42);
// đuôi nằm ngang để nhìn từ trên xuống vẫn ra dáng con cá
const glowTail = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.06, 0, 0), new THREE.Vector3(-0.36, 0, 0.24), new THREE.Vector3(-0.36, 0, -0.24)]);
function makeGlowFish(color, length, opacity) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const g = new THREE.Group();
  const body = new THREE.Mesh(glowBody, material);
  const tail = new THREE.Group();
  tail.position.set(-0.42, 0, 0);
  const fin = new THREE.Mesh(glowTail, material);
  tail.add(fin);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color, transparent: true, opacity: opacity * 0.42, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.scale.setScalar(2);
  g.add(body, tail, halo);
  for (const o of [body, fin, halo]) o.renderOrder = 3;
  g.scale.setScalar(length);
  g.userData = { tail };
  return g;
}

// Đàn cá trong hồ: cá lớn lượn khắp hồ, cá nhỏ tụ ở vùng nông, vài con to mờ dưới vùng sâu (như các chấm sáng trên bản vẽ).
export function addSwimmers(scene) {
  const swimmers = [];
  const add = (color, length, opacity, y, path) => {
    const f = makeGlowFish(color, length, opacity);
    f.position.y = y;
    scene.add(f);
    swimmers.push({ mesh: f, path, a: Math.random() * Math.PI * 2, speed: (0.14 + Math.random() * 0.16) * (Math.random() < 0.5 ? -1 : 1), phase: Math.random() * 6, wobble: 0.05 + Math.random() * 0.1 });
  };
  const roam = ['#6ff5da', '#8fe9ff', '#b6a0ff', '#ff9fd0', '#6ff5da', '#a8ffcf'];
  for (let i = 0; i < 12; i++) add(roam[i % roam.length], 0.55 + Math.random() * 0.4, 0.8, -0.35, { r: 0.42 + Math.random() * 0.42 });
  for (let i = 0; i < 7; i++) add('#d8fff0', 0.3 + Math.random() * 0.14, 0.9, -0.18, { e: POND.shallow, r: 0.25 + Math.random() * 0.55 });
  for (let i = 0; i < 3; i++) add('#49c9a4', 1 + Math.random() * 0.4, 0.5, -1.1, { e: POND.deep, r: 0.3 + Math.random() * 0.4 });
  const prev = new THREE.Vector3();
  return {
    update(t, dt) {
      for (const s of swimmers) {
        s.a += s.speed * dt;
        const r = s.path.r + Math.sin(t * 0.3 + s.phase) * s.wobble;
        prev.copy(s.mesh.position);
        if (s.path.e) {
          s.mesh.position.x = s.path.e.x + Math.cos(s.a) * s.path.e.rx * r;
          s.mesh.position.z = s.path.e.z + Math.sin(s.a) * s.path.e.rz * r;
        } else {
          const R = pondRadius(s.a) * r;
          s.mesh.position.x = Math.cos(s.a) * R;
          s.mesh.position.z = Math.sin(s.a) * R;
        }
        const dx = s.mesh.position.x - prev.x;
        const dz = s.mesh.position.z - prev.z;
        if (dx * dx + dz * dz > 1e-8) s.mesh.rotation.y = Math.atan2(-dz, dx);
        s.mesh.userData.tail.rotation.y = Math.sin(t * 8 + s.phase) * 0.5;
      }
    },
  };
}
