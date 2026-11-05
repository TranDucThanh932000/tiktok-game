// CameraDirector (thay cho Cinemachine): mỗi preset tính vị trí/hướng nhìn mong muốn,
// camera thật luôn trượt mượt tới đó (lọc mũ), không cắt cảnh gắt.
// Có thời gian giữ khung tối thiểu để nhiều quà liên tiếp không làm camera nhảy liên tục.
import * as THREE from 'three';
import { SPOT } from './stage.js';

const tmp = new THREE.Vector3();
const lerp = (a, b, u) => a + (b - a) * u;
const easeInOut = (u) => u * u * (3 - 2 * u);

export class CameraDirector {
  constructor(camera, presets, { minHold = 1.1 } = {}) {
    this.camera = camera;
    this.presets = presets;
    this.minHold = minHold;
    this.shot = 'CAM_WIDE';
    this.pending = null;
    this.shotTime = 99;
    this.time = 0;
    this.target = null;
    this.orbitBase = 0;
    this.pos = new THREE.Vector3(...presets.CAM_WIDE.pos);
    this.look = new THREE.Vector3(...presets.CAM_WIDE.look);
    this.fov = presets.CAM_WIDE.fov;
    this.frameY = presets.CAM_WIDE.frameY;
    this.desiredPos = this.pos.clone();
    this.desiredLook = this.look.clone();
    this.enabled = true;
    this.overrides = {};
    // Tỉ lệ chiều cao người biểu diễn so với nhân vật chuẩn 1,7 m (GIF meme to hơn thì camera lùi xa hơn).
    this.subjectScale = 1;
    // Lia nhanh tới một người (người vừa vào sàn / vừa đổi nhân vật) rồi trả về shot đang chạy.
    this.focusTarget = null;
    this.focusTime = 0;
    this.focusSeconds = 1;
    this.returnBoost = 0;
  }

  // target: Vector3 vị trí trên sàn (cập nhật liên tục). seconds: thời gian giữ khung sau khi lia tới.
  focus(target, seconds = 1) {
    this.focusTarget = target;
    this.focusTime = 0;
    this.focusSeconds = Math.max(0.2, seconds) + 0.25; // + ~0,25 s cho cú lia
  }

  endFocus() {
    if (!this.focusTarget) return;
    this.focusTarget = null;
    this.returnBoost = 0.9;
  }

  get focusing() {
    return Boolean(this.focusTarget);
  }

  // target: Vector3 (vị trí performer, được cập nhật liên tục).
  setShot(name, target = this.target, overrides = {}) {
    if (!this.presets[name]) return;
    this.target = target;
    if (name === this.shot && JSON.stringify(overrides) === JSON.stringify(this.overrides)) return;
    if (this.shotTime < this.minHold && name !== 'CAM_WIDE') {
      this.pending = { name, overrides };
      return;
    }
    this.cut(name, overrides);
  }

  cut(name, overrides) {
    this.shot = name;
    this.overrides = overrides;
    this.shotTime = 0;
    this.pending = null;
    this.orbitBase = Math.atan2(this.pos.x - (this.target?.x ?? 0), this.pos.z - (this.target?.z ?? 0));
  }

  update(dt) {
    this.time += dt;
    this.shotTime += dt;
    if (this.pending && this.shotTime >= this.minHold) this.cut(this.pending.name, this.pending.overrides);
    if (!this.enabled) return;
    if (this.focusTarget) {
      this.focusTime += dt;
      if (this.focusTime >= this.focusSeconds) this.endFocus();
    }
    const p = { ...this.presets[this.shot], ...this.overrides };
    const target = this.target ?? SPOT;
    const t = this.time;

    if (p.mode === 'fixed') {
      // Đường bay chậm từ pos → to trong `seconds` giây, cộng thêm lia trái/phải và tiến/lùi nhẹ.
      const u = p.seconds ? easeInOut(Math.min(1, this.shotTime / p.seconds)) : 0;
      const to = p.to ?? p.pos;
      const lookTo = p.lookTo ?? p.look;
      const sp = p.panSpeed ?? 0.07;
      const pan = (p.panX ?? 0) * Math.sin(t * sp);
      const dolly = (p.dolly ?? 0) * Math.sin(t * sp * 0.63 + 1.3);
      const bob = (p.bob ?? 0) * Math.sin(t * sp * 0.81 + 0.4);
      this.desiredPos.set(lerp(p.pos[0], to[0], u) + pan, lerp(p.pos[1], to[1], u) + bob, lerp(p.pos[2], to[2], u) + dolly);
      this.desiredLook.set(lerp(p.look[0], lookTo[0], u) + pan * (p.lookFollow ?? 0.35), lerp(p.look[1], lookTo[1], u), lerp(p.look[2], lookTo[2], u));
    } else {
      let angle;
      if (p.mode === 'orbit') {
        // Quét qua lại ±75° phía trước performer (không vòng ra sau quá lâu).
        angle = 1.3 * Math.sin(this.shotTime * (p.orbitSpeed ?? 0.5));
      } else {
        angle = (p.sway ?? 0) * Math.sin(t * (p.swaySpeed ?? 0.25));
      }
      const k = this.subjectScale;
      this.desiredPos.set(target.x + Math.sin(angle) * p.dist * k, p.height * k, target.z + Math.cos(angle) * p.dist * k);
      this.desiredLook.set(target.x, p.lookHeight * k + (target.y ?? 0), target.z);
    }
    let damping = Math.max(0.05, p.damping ?? 0.8);
    let fovTarget = p.fov;
    // Người biểu diễn cao hơn (GIF) thì hạ khung xuống để vương miện/đầu không bị banner che.
    let frameTarget = (p.frameY ?? 0.5) + (p.mode === 'fixed' ? 0 : (this.subjectScale - 1) * 0.14);
    if (this.focusTarget) {
      // Đứng chếch phía trước người đó, nhìn từ trên xuống để người đứng trước không che.
      const f = this.focusTarget;
      const a = Math.max(-0.45, Math.min(0.45, -f.x * 0.07));
      this.desiredPos.set(f.x + Math.sin(a) * 2.7, 4.0, f.z + Math.cos(a) * 2.7);
      this.desiredLook.set(f.x, 0.9, f.z);
      damping = 0.11;
      fovTarget = 48;
      frameTarget = 0.5;
    } else if (this.returnBoost > 0) {
      // Quay về shot cũ cũng nhanh, không lững lờ.
      this.returnBoost -= dt;
      damping = Math.min(damping, 0.4);
    }
    const k = 1 - Math.exp(-dt / damping);
    // Nâng độ cao nhanh hơn để khi lùi ra toàn cảnh camera không lướt qua đầu đám đông.
    const ky = this.desiredPos.y > this.pos.y ? Math.min(1, k * 2.2) : k;
    this.pos.x += (this.desiredPos.x - this.pos.x) * k;
    this.pos.z += (this.desiredPos.z - this.pos.z) * k;
    this.pos.y += (this.desiredPos.y - this.pos.y) * ky;
    this.look.lerp(this.desiredLook, Math.min(1, k * 1.4));
    this.fov += (fovTarget - this.fov) * k;
    this.frameY += (frameTarget - this.frameY) * k;
    // Không để camera chui xuống sàn hoặc ra ngoài phòng.
    this.pos.y = Math.max(0.35, this.pos.y);
    this.pos.x = Math.max(-6.8, Math.min(6.8, this.pos.x));

    const cam = this.camera;
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
    cam.fov = this.fov;
    this.applyFrame();
  }

  // Đẩy điểm nhìn lên cao hơn tâm khung để chừa chỗ cho bình luận TikTok ở nửa dưới (khung 9:16).
  applyFrame() {
    const cam = this.camera;
    const w = 1000;
    const h = 1000 / cam.aspect;
    cam.setViewOffset(w, h, 0, (0.5 - this.frameY) * h, w, h);
    cam.updateProjectionMatrix();
  }

  // Vector tạm cho debug.
  get debugInfo() {
    tmp.copy(this.pos);
    return `${this.shot} (${this.shotTime.toFixed(1)}s)`;
  }
}
