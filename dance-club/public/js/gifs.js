// Meme GIF trong club 3D: giải mã GIF thành từng khung hình (ImageDecoder của trình duyệt),
// mỗi file GIF là một texture dùng chung cho mọi dancer cùng GIF.
// GifDancer là "tấm" GIF luôn quay về camera, có cùng giao diện điều khiển với nhân vật 3D
// (đi lại, rơi từ trên trời, nhún theo nhịp, nhào lộn khi biểu diễn).
import * as THREE from 'three';
import { N, I } from './moves.js';

const MAX_SIZE = 320;

class GifAnim {
  constructor(url) {
    this.url = url;
    this.frames = [];
    this.durations = [];
    this.total = 0;
    this.index = -1;
    this.aspect = 1;
    this.texture = null;
    this.ready = false;
    this.failed = false;
    this.load().catch((err) => {
      this.failed = true;
      console.warn('[meme] Không đọc được GIF', url, err);
    });
  }

  async load() {
    const res = await fetch(this.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const type = blob.type || 'image/gif';
    if ('ImageDecoder' in window && (await ImageDecoder.isTypeSupported(type))) {
      const dec = new ImageDecoder({ data: blob.stream(), type });
      await dec.tracks.ready;
      await dec.completed;
      const count = dec.tracks.selectedTrack?.frameCount ?? 1;
      for (let i = 0; i < count; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        const w = image.displayWidth;
        const h = image.displayHeight;
        const k = Math.min(1, MAX_SIZE / Math.max(w, h));
        this.frames.push(await createImageBitmap(image, { resizeWidth: Math.max(1, Math.round(w * k)), resizeHeight: Math.max(1, Math.round(h * k)), resizeQuality: 'medium' }));
        this.durations.push(Math.max(20, (image.duration ?? 100_000) / 1000));
        image.close();
      }
      dec.close();
    } else {
      this.frames.push(await createImageBitmap(blob));
      this.durations.push(1000);
    }
    const first = this.frames[0];
    this.canvas = document.createElement('canvas');
    this.canvas.width = first.width;
    this.canvas.height = first.height;
    this.g = this.canvas.getContext('2d');
    this.aspect = first.width / first.height;
    this.total = this.durations.reduce((a, b) => a + b, 0);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.draw(0);
    this.ready = true;
  }

  draw(i) {
    if (i === this.index) return;
    this.index = i;
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.g.drawImage(this.frames[i], 0, 0);
    this.texture.needsUpdate = true;
  }

  update(now) {
    if (!this.ready || this.frames.length < 2) return;
    let t = now % this.total;
    let i = 0;
    while (t >= this.durations[i] && i < this.durations.length - 1) t -= this.durations[i++];
    this.draw(i);
  }
}

export class GifLibrary {
  constructor() {
    this.cache = new Map();
  }

  get(url) {
    if (!this.cache.has(url)) this.cache.set(url, new GifAnim(url));
    return this.cache.get(url);
  }

  update(now) {
    for (const a of this.cache.values()) a.update(now);
  }
}

// Kiểu chuyển động theo tên động tác (động tác của nhân vật 3D được "dịch" sang GIF).
const JUMPY = new Set(['cheer', 'jump_hype', 'finale_jump', 'hype_up', 'krump', 'bounce_step', 'jump_split', 'mc_hype']);
const FLIPS = { backflip: 1, double_flip: 2 };
const SPINS = { spin: 1, spin_fast: 2, tornado: 3, knee_drop: 1, headspin: 4 };
const frac = (x) => x - Math.floor(x);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class GifDancer {
  constructor() {
    this.isGif = true;
    this.root = new THREE.Group();
    this.material = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.35, depthWrite: true, toneMapped: false, color: 0xffffff });
    this.material.visible = false;
    this.sprite = new THREE.Sprite(this.material);
    this.root.add(this.sprite);
    this.pose = new Float32Array(N);
    this.ctx = { lb: 0, e: 1, v: 0.5 };
    this.current = { id: 'head_bob', start: 0 };
    this.previous = null;
    this.fade = 1;
    this.beatOffset = 0;
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.yaw = 0;
    this.targetYaw = 0;
    this.faceTravel = false;
    this.speed = 0.62;
    this.spawn = 1;
    this.spawnDir = 0;
    this.fallH = 0;
    this.fallV = 0;
    this.squash = 0;
    this.hop = 0;
    this.size = 1.7;
    this.height = 1.7;
    this.bodyScale = 1;
    this.anim = null;
    this.mirror = 1;
  }

  setGif(anim, size = 1.7) {
    this.anim = anim;
    this.size = size;
    this.height = size;
    this.material.map = null;
  }

  // Giao diện giống Character (nhân vật 3D) để Crowd điều khiển như nhau.
  setAvatar() {}
  setMaterial() {}

  setMove(id, beat) {
    if (this.current.id === id) return;
    this.previous = this.current;
    this.current = { id, start: beat };
  }

  update(dt, beat) {
    const a = this.anim;
    if (a?.ready && this.material.map !== a.texture) {
      this.material.map = a.texture;
      this.material.visible = true;
      this.material.needsUpdate = true;
    }

    // Di chuyển trên sàn (giống nhân vật 3D).
    const dx = this.target.x - this.pos.x;
    const dz = this.target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.002) {
      const step = Math.min(dist, this.speed * dt, dist * (1 - Math.exp(-dt * 5)) + 0.4 * dt);
      this.pos.x += (dx / dist) * step;
      this.pos.z += (dz / dist) * step;
    }

    // Nhún / nhảy / nhào lộn theo động tác hiện tại.
    const id = this.current.id;
    const b = beat + this.beatOffset;
    const u = frac(b);
    const lb = beat - this.current.start;
    const e = this.ctx.e;
    let jump = 0;
    let squash = 0;
    let rot = 0;
    let flipX = 1;
    let glow = 0;
    if (id === 'walk') jump = 0.06 * Math.abs(Math.sin(Math.PI * b));
    else if (id === 'run') jump = 0.12 * Math.abs(Math.sin(Math.PI * b * 2));
    else if (FLIPS[id]) {
      const t = frac(lb / 4) * 4;
      const p = Math.min(1, Math.max(0, (t - 0.8) / 1.6));
      jump = 1.2 * Math.sin(Math.PI * p) * FLIPS[id];
      rot = Math.PI * 2 * FLIPS[id] * ease(p);
    } else if (SPINS[id]) {
      const t = frac(lb / 4) * 4;
      flipX = Math.cos(Math.PI * 2 * SPINS[id] * ease(Math.min(1, t / 3)));
      jump = 0.15 * Math.abs(Math.sin(Math.PI * u));
    } else if (id === 'levitate') {
      const p = Math.min(1, Math.max(0, (lb - 1.5) / 5));
      jump = 1.0 * ease(p) + 0.08 * Math.sin(lb * 1.6) * p;
      glow = p;
    } else if (JUMPY.has(id)) {
      jump = 0.32 * e * Math.sin(Math.PI * u);
      squash = 0.12 * Math.pow(1 - u, 4);
    } else if (id.startsWith('pose_')) {
      squash = 0.03 * Math.sin(Math.PI * 2 * b * 0.5);
    } else {
      // Nhảy thường: dập mạnh theo nhịp cho có không khí quẩy.
      jump = 0.13 * e * Math.sin(Math.PI * u);
      squash = 0.14 * Math.pow(1 - u, 5);
    }
    this.pose[I.jump] = jump;
    this.pose[I.glow] = glow;

    // Rơi từ trên trời xuống + nhún khi chạm đất.
    if (this.fallH > 0) {
      this.fallV += 16 * dt;
      this.fallH -= this.fallV * dt;
      if (this.fallH <= 0) {
        this.fallH = 0;
        this.fallV = 0;
        this.squash = 1;
      }
    }
    this.squash = Math.max(0, this.squash - dt * 3.2);
    squash += Math.sin(this.squash * Math.PI) * 0.25;
    if (this.spawnDir) {
      this.spawn = Math.min(1, Math.max(0, this.spawn + this.spawnDir * dt * 1.6));
      if (this.spawn === 1 && this.spawnDir > 0) this.spawnDir = 0;
    }

    const h = this.size * this.bodyScale;
    const w = h * (this.anim?.aspect ?? 1);
    const s = Math.max(0.001, this.spawn);
    this.sprite.scale.set(w * flipX * this.mirror * (1 + squash * 0.5) * s, h * (1 - squash) * s, 1);
    this.sprite.position.set(0, (h * (1 - squash) * s) / 2 + jump, 0);
    this.material.rotation = rot;
    this.root.position.set(this.pos.x, this.pos.y + this.fallH + (1 - s) * 1.2, this.pos.z);
    this.root.visible = s > 0.001;
  }

  topY() {
    return this.root.position.y + this.size * this.bodyScale + this.pose[I.jump];
  }

  dispose() {
    this.material.dispose();
  }
}
