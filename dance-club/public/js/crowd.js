// CharacterManager + CharacterPool + CrowdReactionController phía hiển thị.
// Đồng bộ danh sách dancer từ server, bố trí slot trên sàn, chọn điệu chill lệch nhịp cho tự nhiên,
// và điều khiển phản ứng (LookAt, Cheer, DanceAlong, MakeSpace, Finale) theo preset của tier.
import * as THREE from 'three';
import { Character, makeCharacterMaterial } from './character.js';
import { generateAvatar, resolveAvatar, djAvatar, mcAvatar, stageDancerAvatars, hashString, rng } from './avatar.js';
import { CHILL_MOVES } from './moves.js';
import { GifLibrary, GifDancer } from './gifs.js';
import { SPOT, FLOOR, STAGE } from './stage.js';

const CAMERA_POINT = new THREE.Vector3(0, 0, 14);
const WALK_SPEED = 0.62; // khớp sải bước của động tác walk (0.3 m x ~2 bước/giây)
const RUN_SPEED = 2.4;

function computeSlots(n) {
  const r = rng(20251102);
  let spacing = 0.95;
  for (;;) {
    const out = [];
    for (let row = 0; ; row++) {
      const z = FLOOR.minZ + 0.45 + row * spacing * 0.866;
      if (z > FLOOR.maxZ - 0.35) break;
      for (let x = FLOOR.minX + 0.45 + (row % 2) * spacing * 0.5; x <= FLOOR.maxX - 0.45; x += spacing) {
        const px = x + (r() - 0.5) * 0.22;
        const pz = z + (r() - 0.5) * 0.22;
        const d = Math.hypot(px - SPOT.x, pz - SPOT.z);
        if (d < 1.55) continue;
        out.push({ pos: new THREE.Vector3(px, 0, pz), score: Math.abs(px) * 0.55 + Math.abs(pz - 1.2) * 0.7 + d * 0.25 });
      }
    }
    if (out.length >= n || spacing < 0.6) return out.sort((a, b) => a.score - b.score).slice(0, n).map((s) => s.pos);
    spacing -= 0.05;
  }
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const tmpM = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();

export class Crowd {
  constructor(scene, cfg) {
    this.scene = scene;
    this.cfg = cfg;
    this.max = cfg.maxDancers;
    this.slots = computeSlots(this.max);
    this.entries = new Map();
    this.pool = [];
    this.gifPool = [];
    this.memes = cfg.memes ?? { crowd: [], perform: {}, stage: {} };
    this.gifs = new GifLibrary();
    this.gifMode = this.memes.crowd.length > 0;
    this.memeHeight = this.memes.height ?? 1.75;
    this.material = makeCharacterMaterial();
    this.performerMaterial = makeCharacterMaterial();
    this.performerId = null;
    this.performer = null;
    this.perf = null;

    this.shadows = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
      this.max + 8,
    );
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;
    scene.add(this.shadows);

    this.spawnBeams = [];
    const beamGeo = new THREE.CylinderGeometry(0.45, 0.45, 9, 20, 1, true).translate(0, 4.5, 0);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#9b7bff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false;
      scene.add(m);
      this.spawnBeams.push({ mesh: m, t: 0 });
    }

    // DJ
    this.dj = this.makeStageChar(djAvatar(), this.memes.stage?.dj);
    this.dj.pos.set(0, STAGE.top, STAGE.djZ);
    this.dj.target.copy(this.dj.pos);
    this.dj.setMove('dj_mix', 0, 0.01);
    this.dj.ctx.e = 1;
    scene.add(this.dj.root);

    // MC + 2 vũ công trên sân khấu DJ.
    const stageZ = STAGE.front - 0.5;
    this.crew = [];
    const addCrew = (data, x, z, role, gif) => {
      const c = this.makeStageChar(data, gif);
      c.pos.set(x, STAGE.top, z);
      c.target.copy(c.pos);
      c.ctx.e = 1.15;
      c.ctx.v = this.crew.length * 0.3;
      c.faceTravel = true;
      c.speed = 0.62;
      scene.add(c.root);
      this.crew.push({ char: c, role, name: data.Username, home: c.pos.clone() });
    };
    const [d1, d2] = stageDancerAvatars();
    addCrew(d1, -2.25, stageZ - 0.3, 'dancer', this.memes.stage?.dancer1);
    addCrew(d2, 2.25, stageZ - 0.3, 'dancer', this.memes.stage?.dancer2);
    addCrew(mcAvatar(), 3.3, STAGE.front - 0.18, 'mc', this.memes.stage?.mc);
    this.mcSpots = [3.3, -3.3, 0.0];
    this.mcSpot = 0;
    this.mcNext = performance.now() + 12000;
  }

  // Vũ công nhảy đồng đều theo bộ động tác, đổi mỗi 8 nhịp; MC đi qua lại hô hào.
  updateCrew(dt, beat) {
    const ROUTINE = ['two_step', 'vogue', 'body_roll', 'pop_lock', 'roll_arms', 'shuffle', 'glide', 'hand_groove'];
    const finale = this.perf?.finale;
    const now = performance.now();
    for (const m of this.crew) {
      const c = m.char;
      const moving = c.pos.distanceTo(c.target) > 0.08;
      let move;
      if (moving) move = 'walk';
      else if (m.role === 'mc') move = this.perf ? 'mc_hype' : 'mc_hype';
      else move = finale ? 'finale_wave' : ROUTINE[Math.floor(beat / 8) % ROUTINE.length];
      c.targetYaw = 0;
      c.setMove(move, beat, moving ? 0.2 : 0.3);
      if (m.role === 'mc' && now > this.mcNext) {
        this.mcSpot = (this.mcSpot + 1) % this.mcSpots.length;
        c.target.set(this.mcSpots[this.mcSpot], STAGE.top, m.home.z);
        this.mcNext = now + 14000 + Math.random() * 6000;
      }
      c.update(dt, beat);
    }
  }

  makeStageChar(data, gif) {
    if (gif) {
      const c = new GifDancer();
      c.setGif(this.gifs.get(gif), this.memeHeight * 1.05);
      return c;
    }
    const c = new Character();
    c.setAvatar(resolveAvatar(data), this.material);
    return c;
  }

  // ---------- Roster ----------

  sync(dancers, beat) {
    const seen = new Set();
    for (const d of dancers) {
      seen.add(d.id);
      let e = this.entries.get(d.id);
      if (!e) e = this.add(d, beat);
      else if (e.leaving) this.revive(e, beat);
      e.name = d.name;
      e.status = d.status;
      if ((d.look ?? 0) !== e.look) this.reskin(e, d, beat);
      if (e.slot !== d.slot) {
        e.slot = d.slot;
        e.home.copy(this.slots[d.slot] ?? SPOT);
        if (!this.perf || e.id !== this.performerId) e.char.target.copy(e.home);
      }
    }
    for (const e of this.entries.values()) if (!seen.has(e.id) && !e.leaving) this.remove(e);
    if (this.perf && !this.performer && this.entries.has(this.performerId)) this.attachPerformer(beat);
  }

  // Ngoại hình theo tài khoản; mỗi lần tặng quà đổi nhân vật (look + 1) ra một ngoại hình khác.
  lookData(d) {
    const look = d.look ?? 0;
    return generateAvatar(look ? `${d.id}#look${look}` : d.id, d.name);
  }

  lookGif(d, seed) {
    const list = this.memes.crowd;
    return this.gifs.get(list[(seed + (d.look ?? 0)) % list.length]);
  }

  add(d, beat) {
    const data = generateAvatar(d.id, d.name);
    let char;
    if (this.gifMode) {
      char = this.gifPool.pop() ?? new GifDancer();
      char.setGif(this.lookGif(d, data.Seed), this.memeHeight * (0.92 + (data.Seed % 17) / 100));
    } else {
      char = this.pool.pop() ?? new Character();
      char.setAvatar(resolveAvatar(this.lookData(d)), this.material);
    }
    const r = rng(data.Seed ^ 0x9e3779b9);
    char.ctx.e = 0.95 + r() * 0.45;
    char.ctx.v = r();
    char.beatOffset = (r() - 0.5) * 0.3;
    const home = (this.slots[d.slot] ?? SPOT).clone();
    char.pos.copy(home);
    char.target.copy(home);
    const faceDj = r() < 0.15;
    const toCam = Math.atan2(CAMERA_POINT.x - home.x, CAMERA_POINT.z - home.z);
    const chillYaw = faceDj ? Math.PI + (r() - 0.5) * 0.6 : toCam + (r() - 0.5) * 1.1;
    char.yaw = char.targetYaw = chillYaw;
    // Rơi từ trần xuống chỗ của mình.
    char.spawn = 1;
    char.spawnDir = 0;
    char.fallH = 7.5 + r() * 1.2;
    char.fallV = 0;
    const chillMove = CHILL_MOVES[Math.floor(r() * CHILL_MOVES.length)];
    char.current = { id: chillMove, start: beat };
    char.previous = null;
    char.fade = 1;
    char.setMove('cheer', beat, 0.01);
    this.scene.add(char.root);
    char.faceTravel = true;
    char.speed = WALK_SPEED;
    const e = {
      id: d.id,
      name: d.name,
      seed: data.Seed,
      look: d.look ?? 0,
      slot: d.slot,
      status: d.status,
      char,
      home,
      chillMove,
      chillYaw,
      rand: r,
      react: null,
      tempMove: 'cheer',
      tempUntil: Infinity,
      falling: true,
      leaving: false,
      joinedAt: performance.now(),
      walking: false,
      wanderAt: performance.now() + 4000 + r() * 10000,
    };
    this.entries.set(d.id, e);
    this.flashBeam(home);
    return e;
  }

  // Đổi sang nhân vật khác ngay tại chỗ, có cột sáng và hiệu ứng "bung" ra.
  reskin(e, d, beat) {
    e.look = d.look ?? 0;
    const c = e.char;
    if (c.isGif) {
      const anim = this.lookGif(d, e.seed);
      if (e.savedGif) e.savedGif.anim = anim;
      else c.setGif(anim, c.size);
    } else {
      c.setAvatar(resolveAvatar(this.lookData(d)), c.mesh?.material ?? this.material);
    }
    if (!e.leaving) {
      c.spawn = 0.45;
      c.spawnDir = 1;
      c.squash = 1;
    }
    this.flashBeam(c.pos, { force: true, color: this.cfg.swapGift?.color ?? '#25f4ee' });
    if (e !== this.performer) {
      e.tempMove = 'cheer';
      e.tempUntil = beat + 4;
    }
  }

  revive(e, beat) {
    e.leaving = false;
    e.char.spawnDir = 1;
    e.tempMove = 'wave_hand';
    e.tempUntil = beat + 4;
  }

  remove(e) {
    e.leaving = true;
    e.char.spawnDir = -1;
    this.flashBeam(e.char.pos);
  }

  flashBeam(pos, { force = false, color = '#9b7bff' } = {}) {
    if (!force && this.cfg.display?.lightAnimation === false) return;
    const b = this.spawnBeams.find((x) => x.t <= 0) ?? this.spawnBeams[0];
    b.t = 1;
    b.mesh.material.color.set(color);
    b.mesh.position.set(pos.x, 0, pos.z);
    b.mesh.visible = true;
  }

  wave(id, beat) {
    const e = this.entries.get(id);
    if (!e || e.id === this.performerId) return;
    e.tempMove = e.rand() < 0.5 ? 'wave_hand' : 'jump_hype';
    e.tempUntil = beat + 4;
  }

  // ---------- Performance ----------

  // perf = { session, tier, preset (crowd), tierColor }
  startPerformance(perf, beat) {
    this.endPerformance(beat, true);
    this.perf = perf;
    this.performerId = perf.session.performerId;
    const u = this.performerMaterial.userData.uniforms;
    u.uRim.value.set(perf.tierColor).multiplyScalar(0.45);
    this.attachPerformer(beat);
    const preset = perf.preset;
    const seed = hashString(`${perf.session.id}`);
    for (const e of this.entries.values()) {
      e.rest = e.char.target.clone();
      if (e.id === this.performerId) continue;
      const r = rng(seed ^ hashString(e.id));
      const roll = r();
      let kind = 'chill';
      let acc = preset.cheer;
      if (roll < acc) kind = 'cheer';
      else if (roll < (acc += preset.clap)) kind = 'clap';
      else if (roll < (acc += preset.jump)) kind = 'jump_hype';
      else if (roll < (acc += preset.danceAlong)) kind = 'along';
      e.react = {
        kind,
        look: r() < preset.lookAt,
        highlight: r() < preset.highlightCheer ? (r() < 0.3 ? 'point_at' : 'cheer') : null,
        sync: r() < preset.finaleSync,
        phase: 'preparing',
      };
    }
    this.layoutMakeSpace(preset.makeSpace);
  }

  attachPerformer(beat) {
    const pe = this.entries.get(this.performerId);
    this.performer = pe ?? null;
    if (!pe) return;
    pe.react = null;
    pe.tempMove = null;
    pe.char.setMaterial(this.performerMaterial);
    if (pe.char.isGif) {
      pe.savedGif = { anim: pe.char.anim, size: pe.char.size };
      const list = this.memes.perform?.[this.perf.session.tier] ?? [];
      const anim = list.length ? this.gifs.get(list[this.perf.session.id % list.length]) : pe.char.anim;
      pe.char.setGif(anim, this.memeHeight * (this.memes.performerScale ?? 1.5));
    }
    pe.char.target.copy(SPOT);
    pe.char.faceTravel = true;
    pe.char.targetYaw = 0;
    pe.char.speed = 2.7;
    pe.char.setMove('run', beat, 0.2);
  }

  layoutMakeSpace(radius) {
    const targets = [];
    for (const e of this.entries.values()) {
      if (e.id === this.performerId || e.leaving) continue;
      const p = (e.rest ?? e.home).clone();
      const v = tmpV.subVectors(p, SPOT);
      const r = v.length() || 0.01;
      if (r < radius) p.copy(SPOT).addScaledVector(v, (radius + e.rand() * 0.25) / r);
      // Chừa hành lang phía trước cho camera.
      const dz = p.z - SPOT.z;
      if (dz > 0.2) {
        const half = 0.95 + dz * 0.24;
        if (Math.abs(p.x - SPOT.x) < half) p.x = SPOT.x + (p.x >= SPOT.x ? 1 : -1) * (half + 0.12);
      }
      targets.push({ e, p });
    }
    // Giãn cách nhẹ để không chồng lên nhau.
    for (let iter = 0; iter < 4; iter++) {
      for (let i = 0; i < targets.length; i++) {
        for (let j = i + 1; j < targets.length; j++) {
          const a = targets[i].p;
          const b = targets[j].p;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const d = Math.hypot(dx, dz);
          if (d > 0 && d < 0.62) {
            const push = (0.62 - d) / 2 / d;
            a.x -= dx * push;
            a.z -= dz * push;
            b.x += dx * push;
            b.z += dz * push;
          }
        }
      }
    }
    for (const { e, p } of targets) {
      p.x = Math.max(FLOOR.minX - 0.6, Math.min(FLOOR.maxX + 0.6, p.x));
      p.z = Math.max(FLOOR.minZ + 0.2, Math.min(FLOOR.maxZ + 0.8, p.z));
      e.spaceTarget = p.clone();
      e.char.target.copy(p);
      e.char.speed = RUN_SPEED;
    }
  }

  phaseEvent(name) {
    if (!this.perf) return;
    const phase = { HighlightStarted: 'highlight', FreezeStarted: 'freeze', FinaleStarted: 'finale', PerformanceStarted: 'intro', IntroCompleted: 'main' }[name];
    if (!phase) return;
    for (const e of this.entries.values()) if (e.react) e.react.phase = phase;
    this.perf.finale = phase === 'finale';
  }

  endPerformance(beat, silent = false) {
    if (!this.perf) return;
    const pe = this.entries.get(this.performerId);
    if (pe) {
      pe.char.setMaterial(this.material);
      if (pe.char.isGif && pe.savedGif) {
        pe.char.setGif(pe.savedGif.anim, pe.savedGif.size);
        pe.savedGif = null;
      }
      pe.char.target.copy(pe.rest ?? pe.home);
      pe.char.faceTravel = true;
      pe.char.targetYaw = pe.chillYaw;
      pe.char.speed = WALK_SPEED * 1.6;
      if (!silent) {
        pe.tempMove = 'cheer';
        pe.tempUntil = beat + 4;
      }
    }
    for (const e of this.entries.values()) {
      e.react = null;
      e.spaceTarget = null;
      if (e === pe) continue;
      e.char.target.copy(e.rest ?? e.home);
      e.char.speed = WALK_SPEED;
      e.wanderAt = performance.now() + 3000 + e.rand() * 8000;
      e.char.targetYaw = e.chillYaw;
      e.char.beatOffset = (e.rand() - 0.5) * 0.3;
      if (!silent) e.chillMove = CHILL_MOVES[Math.floor(e.rand() * CHILL_MOVES.length)];
    }
    this.perf = null;
    this.performerId = null;
    this.performer = null;
  }

  // Vị trí hiện tại của performer (null nếu không có).
  performerPos() {
    return this.performer?.char.pos ?? null;
  }

  // ---------- Frame ----------

  update(dt, beat, { performerMove, performerMoveStart, performerGlow = 0, cameraPos = null } = {}) {
    const perfPos = this.performerPos();
    let shadowIndex = 0;

    // Performer
    if (this.performer) {
      const c = this.performer.char;
      const arrived = c.pos.distanceTo(c.target) < 0.08;
      if (arrived) c.faceTravel = false;
      else if (c.pos.distanceTo(c.target) > 0.3) c.setMove('run', beat, 0.2);
      if (performerMove && arrived) c.setMove(performerMove, performerMoveStart ?? beat, 0.35);
      this.performerMaterial.userData.uniforms.uExtraGlow.value = performerGlow * 0.5;
    }

    this.gifs.update(performance.now());
    if (!this.perf) this.wander(performance.now());
    this.separate(dt);
    for (const e of this.entries.values()) {
      const c = e.char;
      const isPerformer = e === this.performer;
      if (!isPerformer) {
        let move = e.chillMove;
        let wantYaw = e.chillYaw;
        if (e.tempMove && beat < e.tempUntil) move = e.tempMove;
        else {
          e.tempMove = null;
          const r = e.react;
          if (r && perfPos) {
            const since = r.phase === 'preparing' ? 0 : 1;
            if (since) move = this.reactionMove(e, r, performerMove);
            if (cameraPos && e.spaceTarget) this.keepCameraClear(e, perfPos, cameraPos);
            if (r.look) wantYaw = Math.atan2(perfPos.x - c.pos.x, perfPos.z - c.pos.z);
            const dist = c.pos.distanceTo(perfPos);
            c.beatOffset = r.kind === 'along' || (r.phase === 'finale' && r.sync) ? -dist * 0.08 : c.beatOffset;
          }
        }
        // Đang di chuyển thì bước chân thật (đi bộ hoặc chạy) thay vì trượt.
        const d = c.pos.distanceTo(c.target);
        if (e.walking ? d > 0.06 : d > 0.25) {
          e.walking = true;
          move = c.speed > 1.3 ? 'run' : 'walk';
        } else if (e.walking) {
          e.walking = false;
          if (!this.perf && e.arriveYaw !== undefined) e.chillYaw = e.arriveYaw;
          if (!e.react) wantYaw = e.chillYaw;
        }
        c.targetYaw = wantYaw;
        c.setMove(move, beat, e.walking ? 0.2 : 0.28);
      }
      c.update(dt, beat);
      if (e.falling && c.fallH <= 0) {
        e.falling = false;
        e.tempMove = e.rand() < 0.5 ? 'wave_hand' : 'jump_hype';
        e.tempUntil = beat + 4;
      }
      // Ai đứng sát ống kính thì ẩn đi (như near-clip của máy quay) để không che khung hình.
      if (cameraPos && c.root.visible && !isPerformer) {
        const dx = c.pos.x - cameraPos.x;
        const dz = c.pos.z - cameraPos.z;
        const d2 = dx * dx + dz * dz;
        if (cameraPos.y < 2.6 && d2 < 1.0) e.nearCam = true;
        else if (cameraPos.y >= 2.6 || d2 > 2.0) e.nearCam = false;
        if (e.nearCam) c.root.visible = false;
      }

      if (e.leaving && c.spawn <= 0) {
        this.scene.remove(c.root);
        (c.isGif ? this.gifPool : this.pool).push(c);
        this.entries.delete(e.id);
        continue;
      }
      if (c.root.visible && shadowIndex < this.max + 3) {
        const air = Math.max(0, c.root.position.y - c.pos.y);
        const s = (1 / (1 + air * 1.5)) * c.spawn * c.bodyScale;
        tmpM.compose(tmpV.set(c.pos.x, 0.015, c.pos.z), tmpQ.identity(), tmpS.set(s, 1, s));
        this.shadows.setMatrixAt(shadowIndex++, tmpM);
      }
    }
    this.updateCrew(dt, beat);
    for (const m of this.crew) {
      tmpM.compose(tmpV.set(m.char.pos.x, STAGE.top + 0.01, m.char.pos.z), tmpQ.identity(), tmpS.set(m.char.bodyScale, 1, m.char.bodyScale));
      this.shadows.setMatrixAt(shadowIndex++, tmpM);
    }
    // DJ
    this.dj.update(dt, beat);
    tmpM.compose(tmpV.set(this.dj.pos.x, STAGE.top + 0.01, this.dj.pos.z), tmpQ.identity(), tmpS.set(1.1, 1, 1.1));
    this.shadows.setMatrixAt(shadowIndex++, tmpM);
    this.shadows.count = shadowIndex;
    this.shadows.instanceMatrix.needsUpdate = true;

    for (const b of this.spawnBeams) {
      if (b.t <= 0) continue;
      b.t -= dt * 1.2;
      b.mesh.material.opacity = Math.max(0, b.t) * 0.32;
      b.mesh.scale.set(1 - (1 - b.t) * 0.6, 1, 1 - (1 - b.t) * 0.6);
      if (b.t <= 0) b.mesh.visible = false;
    }
  }

  // Thỉnh thoảng một dancer rời chỗ đi dạo quanh sàn rồi đứng nhảy ở chỗ mới.
  wander(now) {
    let walking = 0;
    for (const e of this.entries.values()) if (e.walking) walking++;
    const maxWalking = Math.max(2, Math.ceil(this.entries.size * 0.25));
    for (const e of this.entries.values()) {
      if (now < e.wanderAt || e.leaving || e.tempMove || e.walking) continue;
      if (walking >= maxWalking) {
        e.wanderAt = now + 1500 + e.rand() * 3000;
        continue;
      }
      const far = e.rand() < 0.3;
      const base = far ? e.char.pos : e.home;
      const radius = far ? 2.6 : 1.0;
      let x = base.x;
      let z = base.z;
      for (let tries = 0; tries < 8; tries++) {
        const a = e.rand() * Math.PI * 2;
        const rr = (0.35 + 0.65 * e.rand()) * radius;
        x = Math.max(-4.6, Math.min(4.6, base.x + Math.cos(a) * rr));
        z = Math.max(FLOOR.minZ + 0.4, Math.min(FLOOR.maxZ - 0.4, base.z + Math.sin(a) * rr));
        // Không đứng chắn vòng sân khấu; không đi quá xa chỗ của mình.
        if (Math.hypot(x - SPOT.x, z - SPOT.z) > 1.7 && Math.hypot(x - e.home.x, z - e.home.z) < 3.2) break;
      }
      e.char.target.set(x, 0, z);
      e.char.speed = WALK_SPEED;
      const toCam = Math.atan2(CAMERA_POINT.x - x, CAMERA_POINT.z - z);
      e.arriveYaw = e.rand() < 0.15 ? Math.PI + (e.rand() - 0.5) * 0.6 : toCam + (e.rand() - 0.5) * 1.1;
      if (e.rand() < 0.35) e.chillMove = CHILL_MOVES[Math.floor(e.rand() * CHILL_MOVES.length)];
      e.wanderAt = now + 7000 + e.rand() * 14000;
      walking++;
    }
  }

  // Giãn cách để người đi dạo không xuyên qua nhau.
  separate(dt) {
    const list = [];
    for (const e of this.entries.values()) if (!e.leaving && e !== this.performer) list.push(e.char.pos);
    const k = Math.min(1, dt * 6);
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.3025 || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = ((0.55 - d) / 2 / d) * k;
        a.x -= dx * push;
        a.z -= dz * push;
        b.x += dx * push;
        b.z += dz * push;
      }
    }
  }

  // Né khỏi đường nhìn giữa camera và performer (đám đông "rẽ lối" cho camera).
  keepCameraClear(e, perfPos, cameraPos) {
    const cx = cameraPos.x - perfPos.x;
    const cz = cameraPos.z - perfPos.z;
    const L = Math.hypot(cx, cz) || 1;
    const ux = cx / L;
    const uz = cz / L;
    const t = e.spaceTarget;
    const dx = t.x - perfPos.x;
    const dz = t.z - perfPos.z;
    const along = dx * ux + dz * uz;
    const lat = dx * uz - dz * ux;
    const half = 1.0 - 0.3 * Math.max(0, Math.min(1, along / L));
    if (along > -0.2 && along < L + 0.6 && Math.abs(lat) < half) {
      const s = lat >= 0 ? 1 : -1;
      const push = s * (half + 0.12) - lat;
      e.char.target.set(t.x + push * uz, 0, t.z - push * ux);
    } else {
      e.char.target.copy(t);
    }
  }

  reactionMove(e, r, performerMove) {
    if (r.phase === 'finale') {
      if (r.sync && performerMove) return performerMove;
      return r.kind === 'chill' ? 'cheer' : r.kind === 'along' ? 'jump_hype' : r.kind;
    }
    if ((r.phase === 'highlight' || r.phase === 'freeze') && r.highlight) return r.highlight;
    if (r.kind === 'along') return performerMove && !isOneShot(performerMove) ? performerMove : 'hand_groove';
    if (r.kind === 'chill') return e.chillMove;
    return r.kind;
  }

  // Danh sách cho name tag.
  tags() {
    const out = [];
    this.crew.forEach((m, i) => out.push({ id: `crew:${m.role}${i}`, name: m.name, x: m.char.pos.x, y: m.char.topY(), z: m.char.pos.z, performer: false, fresh: false, crew: true }));
    for (const e of this.entries.values()) {
      if (!e.char.root.visible) continue;
      out.push({ id: e.id, name: e.name, x: e.char.pos.x, y: e.char.topY(), z: e.char.pos.z, performer: e === this.performer, fresh: performance.now() - e.joinedAt < 6000 });
    }
    return out;
  }
}

const ONE_SHOT = new Set(['backflip', 'double_flip', 'headspin', 'levitate', 'jump_split', 'knee_drop', 'tornado', 'spin', 'spin_fast']);
function isOneShot(id) {
  return ONE_SHOT.has(id);
}
