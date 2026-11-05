// Con cá mập của sự kiện "Cá mập vào hồ": lượn vòng trên hồ, vây lưng nhô khỏi mặt nước.
// Hết máu thì nhảy lên rồi rơi xuống nước, hết giờ thì lặn mất. Mô hình tạo một lần rồi dùng lại.
import * as THREE from 'three';
import { makeFish } from './fish.js';
import { POND } from './world.js';

const SWIM_Y = -0.12; // lưng và vây nhô khỏi mặt nước để nhìn rõ từ máy toàn cảnh
const HIDDEN_Y = -3.2;
const BOSS_SIZE = 4.2; // to hơn cá câu được, nhìn rõ từ máy toàn cảnh

export function createBossShark(scene, fx, species) {
  const mesh = makeFish(species, 200);
  mesh.scale.setScalar(BOSS_SIZE);
  mesh.visible = false;
  scene.add(mesh);
  let state = 'off'; // off, rise, swim, jump, dive
  let age = 0;
  let angle = 0;
  let shake = 0;
  let wake = 0;
  const center = new THREE.Vector3();
  const top = new THREE.Vector3();

  function place(dt) {
    angle += 0.55 * dt;
    const { x, z, rx, rz } = POND.swim;
    mesh.position.x = x + Math.cos(angle) * rx;
    mesh.position.z = z + Math.sin(angle) * rz;
    // đầu cá (trục +x) hướng theo đường bơi
    mesh.rotation.y = Math.atan2(-Math.cos(angle) * rz, -Math.sin(angle) * rx);
  }

  return {
    get active() {
      return state === 'rise' || state === 'swim';
    },
    // Điểm trên đầu cá để hiện số máu bị trừ.
    top() {
      return top.copy(mesh.position).setY(1.6);
    },
    show() {
      state = 'rise';
      age = 0;
      angle = Math.random() * Math.PI * 2;
      mesh.visible = true;
      mesh.rotation.set(0, 0, 0);
      place(0);
      mesh.position.y = HIDDEN_Y;
      fx.splash(center.copy(mesh.position).setY(0), 3);
    },
    hit(power = 1) {
      if (!this.active) return;
      shake = Math.max(shake, 0.25);
      fx.splash(center.copy(mesh.position).setY(0), Math.min(2.5, 0.7 + power * 0.1));
    },
    defeat() {
      if (state === 'off') return;
      state = 'jump';
      age = 0;
      fx.confetti(center.copy(mesh.position).setY(1.5), 120);
    },
    flee() {
      if (state === 'off') return;
      state = 'dive';
      age = 0;
    },
    update(t, dt) {
      if (state === 'off') return;
      age += dt;
      mesh.userData.tail.rotation.y = Math.sin(t * 9) * 0.45;
      if (state === 'rise' || state === 'swim') {
        place(dt);
        if (state === 'rise') {
          const u = Math.min(1, age / 1.1);
          mesh.position.y = HIDDEN_Y + (SWIM_Y - HIDDEN_Y) * (u * (2 - u));
          if (u >= 1) state = 'swim';
        } else {
          mesh.position.y = SWIM_Y + Math.sin(t * 1.7) * 0.06;
          // vệt sóng sau lưng cá
          if ((wake -= dt) <= 0) {
            wake = 0.28;
            fx.ripple(mesh.position.x, mesh.position.z, 1.6, 1.3, 0.55);
          }
        }
        shake = Math.max(0, shake - dt);
        mesh.rotation.z = Math.sin(t * 38) * shake * 0.5;
        return;
      }
      if (state === 'jump') {
        const u = Math.min(1, age / 1.25);
        mesh.position.y = SWIM_Y + Math.sin(u * Math.PI) * 6.5;
        mesh.rotation.z = u * Math.PI * 2;
        if (u >= 1) {
          fx.splash(center.copy(mesh.position).setY(0), 5);
          mesh.visible = false;
          state = 'off';
        }
        return;
      }
      // dive: bơi tiếp và chìm dần
      place(dt);
      const u = Math.min(1, age / 1.6);
      mesh.position.y = SWIM_Y + (HIDDEN_Y - SWIM_Y) * u * u;
      if (u >= 1) {
        mesh.visible = false;
        state = 'off';
      }
    },
  };
}
