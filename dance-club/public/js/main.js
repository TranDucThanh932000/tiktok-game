// Virtual Dance Club – màn hình 3D cho TikTok LIVE.
// Nhận trạng thái từ server (SSE), dựng club 3D, điều phối Choreography → Camera/Lighting/Crowd/Audio.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Stage, SPOT } from './stage.js';
import { Crowd } from './crowd.js';
import { CameraDirector } from './camera.js';
import { ChoreographyPlayer } from './choreo.js';
import { Music } from './audio.js';
import { Hud } from './hud.js';
import { AuraFX } from './fx.js';
import { I } from './moves.js';
import { DANCE } from './character.js';

const W = 1080;
const H = 1920;
const stageEl = document.getElementById('stage');
const canvas = document.getElementById('game');
const params = new URLSearchParams(location.search);

let config = null;
let world = null;
let serverOffset = 0;
let pendingState = null;
const serverNow = () => Date.now() + serverOffset;

// ---------------------------------------------------------------- Khung 9:16

function fit() {
  const scale = Math.min(innerWidth / W, innerHeight / H);
  stageEl.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
  if (world) world.resize(scale);
}
addEventListener('resize', fit);

// ---------------------------------------------------------------- Thế giới 3D

function createWorld(cfg) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05020c');
  scene.fog = new THREE.FogExp2('#0d0620', 0.03);

  const camera = new THREE.PerspectiveCamera(56, W / H, 0.1, 80);
  const stage = new Stage(scene, cfg.lightingPresets, cfg.display);
  const crowd = new Crowd(scene, cfg);
  const director = new CameraDirector(camera, cfg.cameraPresets);
  const music = new Music(cfg.music);
  const hud = new Hud(stageEl, cfg);
  const fx = new AuraFX(scene, cfg.auraFx ?? {});

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.35, 0.3, 0.95);
  if (cfg.display?.bloom !== false) composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // Khử răng cưa SMAA (chạy được trên mọi card đồ hoạ) để viền sáng không lấp lánh khi chuyển động.
  const smaa = new SMAAPass();
  composer.addPass(smaa);

  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  controls.target.set(0, 1, 0);

  const w = {
    renderer,
    scene,
    camera,
    stage,
    crowd,
    director,
    music,
    hud,
    fx,
    composer,
    bloom,
    controls,
    session: null,
    sessionId: null,
    player: null,
    performerTarget: new THREE.Vector3().copy(SPOT),
    lightClock: 0,
    chillShot: 0,
    chillTimer: 0,
    focusQueue: [],
    lastState: null,
    resize(scale) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const factor = Math.min(1, scale * dpr * 1.15) * (cfg.display?.renderScale ?? 1);
      const rw = Math.max(270, Math.round(W * factor));
      const rh = Math.max(480, Math.round(H * factor));
      renderer.setPixelRatio(1);
      renderer.setSize(rw, rh, false);
      composer.setSize(rw, rh);
      bloom.resolution.set(rw / 2, rh / 2);
    },
  };
  return w;
}

// ---------------------------------------------------------------- Phiên biểu diễn

function tierOf(n) {
  return config.tiers.find((t) => t.tier === n) ?? config.tiers[0];
}

function startSession(s) {
  const w = world;
  const beat = w.music.beat();
  const choreo = config.choreographies.find((c) => c.id === s.choreoId) ?? config.choreographies.find((c) => c.tier === s.tier);
  const tier = tierOf(s.tier);
  w.session = s;
  w.sessionId = s.id;
  w.choreo = choreo;
  w.tier = tier;
  w.player = new ChoreographyPlayer(s, choreo, config.music.bpm);
  const preset = config.crowdReactionPresets[choreo.crowdReactionPreset] ?? config.crowdReactionPresets[tier.id];
  w.crowd.startPerformance({ session: s, preset, tierColor: tier.color }, beat);
  w.stage.setPreset(choreo.lightingPreset ?? tier.id, tier.color);
  w.stage.highlight = false;
  w.stage.finale = false;
  w.focusQueue.length = 0;
  w.director.endFocus();
  w.director.setShot('CAM_MEDIUM', w.performerTarget);
  w.hud.showBanner(s, choreo);
  w.fx.start(s.tier, tier.color);
  w.stage.wall.info = { mode: 'perform', id: s.performerId, tier: tier.name, name: s.name, sub: `${choreo.name} · ${s.coins} xu`, color: tier.color };
  const prepSeconds = Math.max(0.3, (s.performingAt - serverNow()) / 1000);
  if (s.state === 'preparing') {
    w.music.setMuffled(true);
    w.music.riser(prepSeconds);
    w.music.sparkle();
  }
}

function onChoreoEvent(name) {
  const w = world;
  const t = w.session.tier;
  w.crowd.phaseEvent(name);
  w.fx.phase(name);
  switch (name) {
    case 'PerformanceStarted':
      w.music.setMuffled(false);
      w.music.setLevel(t);
      w.music.impact(0.4 + 0.1 * t);
      w.music.cheer(1.6, 0.1 + 0.03 * t);
      w.director.setShot('CAM_MEDIUM', w.performerTarget);
      w.stage.burst('flash');
      break;
    case 'IntroCompleted':
      w.director.setShot(w.choreo.cameraPreset ?? 'CAM_MEDIUM', w.performerTarget);
      break;
    case 'HighlightStarted':
      w.stage.highlight = true;
      if (t <= 2) w.director.setShot('CAM_CLOSE', w.performerTarget);
      else if (t <= 4) w.director.setShot('CAM_TRACKING', w.performerTarget, { height: 0.55, sway: 0.6, swaySpeed: 0.45 });
      else w.director.setShot('CAM_CINEMATIC', w.performerTarget, { orbitSpeed: 0.75 });
      w.music.impact(0.5 + 0.1 * t);
      if (t >= 3) w.music.airhorn();
      w.music.cheer(2.2, 0.12 + 0.04 * t);
      w.stage.burst('flash');
      if (t >= 4) w.stage.burst('sparks');
      if (t >= 5) w.stage.burst('confetti');
      break;
    case 'FreezeStarted':
      w.stage.highlight = false;
      w.director.setShot('CAM_CLOSE', w.performerTarget, { sway: 0, damping: 0.9 });
      break;
    case 'FinaleStarted':
      w.stage.finale = true;
      w.director.setShot('CAM_FINALE', w.performerTarget);
      w.music.cheer(3, 0.14 + 0.04 * t);
      if (t >= 4) {
        w.stage.burst('confetti');
        w.stage.burst('sparks');
        w.music.impact(0.8);
      }
      break;
    case 'PerformanceCompleted':
      endSession();
      break;
  }
}

function endSession() {
  const w = world;
  if (!w.player) return;
  const beat = w.music.beat();
  w.player = null;
  w.stage.highlight = false;
  w.stage.finale = false;
  w.stage.setPreset('chill');
  w.music.setLevel(0);
  w.music.setMuffled(false);
  w.crowd.endPerformance(beat);
  w.fx.stop();
  w.director.setShot('CAM_WIDE');
  w.chillShot = 0;
  w.chillTimer = 0;
  w.hud.hideBanner();
  w.stage.wall.info = chillWallInfo();
}

function chillWallInfo() {
  return { mode: 'chill', hint: `comment "${config.join.keywords[0] ?? 'hey'}" để lên sàn` };
}

// ---------------------------------------------------------------- Trạng thái server

function applyState(state) {
  const w = world;
  if (!w) {
    pendingState = state;
    return;
  }
  serverOffset = state.now - Date.now();
  w.lastState = state;
  const beat = w.music.beat();
  w.crowd.sync(state.dancers, beat);
  w.hud.updateState(state);
  w.stage.wall.board = state.leaderboard ?? [];
  const s = state.session;
  if (s && s.id !== w.sessionId) startSession(s);
  else if (s && w.player && s.returningAt !== w.session.returningAt) {
    // Bị kết thúc sớm (nút C): dựng lại mốc thời gian.
    w.session = s;
    w.player.session = s;
    w.player.timeline = w.player.buildTimeline();
  }
  if (!s && w.player) endSession();
}

function onFx(msg) {
  const w = world;
  if (!w) return;
  const d = msg.data ?? {};
  const beat = w.music.beat();
  switch (msg.fx) {
    case 'gift':
      if (!d.swap) w.hud.giftToast(d);
      w.music.sparkle();
      w.crowd.wave(d.id, beat);
      break;
    case 'wave':
      w.crowd.wave(d.id, beat);
      break;
    case 'joined':
      w.stage.wall.welcome = { name: d.name, until: performance.now() + 2600 };
      queueFocus(d.id);
      break;
    case 'swapped': {
      const sg = config.swapGift ?? {};
      w.hud.toast(`🎭 <b>${escapeHtml(d.name)}</b> tặng ${escapeHtml(sg.gift ?? 'TikTok')} · <span class="coins">đổi nhân vật mới!</span>`, sg.color ?? '#25f4ee', 3500);
      queueFocus(d.id);
      break;
    }
    case 'queued':
      if (w.player) w.hud.toast(`⏳ <b>${escapeHtml(d.name)}</b> xếp lượt diễn <span class="coins">${escapeHtml(tierOf(d.tier).name)}</span>`, tierOf(d.tier).color, 3200);
      break;
    case 'upgraded':
      w.hud.toast(`⬆️ <b>${escapeHtml(d.name)}</b> lên hạng <span class="coins">${escapeHtml(tierOf(d.tier).name)}</span>`, tierOf(d.tier).color, 3500);
      break;
    case 'waiting':
      w.hud.toast(`🚪 <b>${escapeHtml(d.name)}</b> đang chờ vào sàn (#${d.position})`, '#b28dff', 2600);
      break;
    case 'like':
      w.hud.hearts(Math.min(4, d.count ?? 1));
      break;
  }
}

// ---------------------------------------------------------------- Camera lia tới người mới vào sàn

function queueFocus(id) {
  const jf = config.joinFocus;
  const w = world;
  if (!jf?.enabled || !w) return;
  if (jf.onlyWhenChill !== false && w.player) return;
  const q = w.focusQueue;
  if (q.some((x) => x.id === id)) return;
  q.push({ id, at: performance.now() });
  // Nhiều người vào cùng lúc thì chỉ lia tới vài người mới nhất, tránh camera giật liên tục.
  while (q.length > Math.max(1, jf.maxQueue ?? 2)) q.shift();
}

function updateFocus(w) {
  const jf = config.joinFocus;
  if (!jf?.enabled || w.controls.enabled) return;
  if (jf.onlyWhenChill !== false && w.player) {
    w.focusQueue.length = 0;
    return;
  }
  if (w.director.focusing) return;
  const now = performance.now();
  while (w.focusQueue.length) {
    const item = w.focusQueue[0];
    const e = w.crowd.entries.get(item.id);
    if (e && !e.leaving) {
      w.focusQueue.shift();
      // Người mới đang rơi từ trên xuống: giữ khung thêm cho tới lúc chạm sàn rồi mới tính `seconds`.
      const c = e.char;
      const land = c.fallH > 0 ? (Math.sqrt(c.fallV * c.fallV + 32 * c.fallH) - c.fallV) / 16 : 0;
      w.director.focus(c.pos, (jf.seconds ?? 1) + land);
      return;
    }
    // Chờ snapshot tạo nhân vật; quá 2 giây thì bỏ.
    if (now - item.at < 2000) return;
    w.focusQueue.shift();
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function connect() {
  const es = new EventSource('/events');
  const offline = document.getElementById('offline');
  es.onopen = () => (offline.style.display = 'none');
  es.onerror = () => (offline.style.display = 'block');
  es.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    try {
      if (msg.type === 'snapshot') {
        if (!config) init(msg.config);
        applyState(msg.state);
      } else if (msg.type === 'state') applyState(msg.state);
      else if (msg.type === 'fx') onFx(msg);
    } catch (err) {
      console.error('[dance-club]', err);
    }
  };
}

// ---------------------------------------------------------------- Debug (phím tắt)

async function post(url, body = {}) {
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (err) {
    console.warn('Không gọi được server', err);
  }
}

addEventListener('keydown', (e) => {
  if (!world || e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === '1') post('/api/sim/crowd', { count: 1 });
  else if (k === '2') post('/api/sim/crowd', { count: 10 });
  else if (k === '3') post('/api/sim/crowd', { count: config.maxDancers });
  else if ('qwert'.includes(k) && k.length === 1) post('/api/sim/tier', { tier: 'qwert'.indexOf(k) + 1 });
  else if (k === 'c') post('/api/chill');
  else if (k === 'y') post('/api/sim/swap');
  else if (k === 'f') {
    const on = !world.controls.enabled;
    world.controls.enabled = on;
    world.director.enabled = !on;
    if (on) world.controls.target.copy(world.director.look);
    document.getElementById('debug').classList.toggle('on', on);
    if (!on) world.camera.clearViewOffset();
  } else if (k === 'm') {
    const m = world.music;
    if (m.master) m.master.gain.value = m.master.gain.value > 0 ? 0 : m.volume;
  }
});

// ---------------------------------------------------------------- Vòng lặp

let last = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
let fps = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const w = world;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const beat = w.music.beat();
  const t = serverNow();

  let performerMove = null;
  let performerMoveStart = beat;
  if (w.player) {
    for (const ev of w.player.events(t)) onChoreoEvent(ev);
  }
  if (w.player) {
    const phase = w.player.phaseAt(t);
    const mv = w.player.moveAt(t, phase);
    if (mv) {
      performerMove = mv.id;
      performerMoveStart = beat - ((t - mv.start) / 60000) * config.music.bpm;
    }
  }
  const perfChar = w.crowd.performer?.char;
  w.crowd.update(dt, beat, { performerMove, performerMoveStart, performerGlow: perfChar ? perfChar.pose[I.glow] : 0, cameraPos: w.camera.position });
  const perfPos = w.crowd.performerPos();
  if (perfPos) w.performerTarget.set(perfPos.x, perfChar.pose[I.jump] * 0.6, perfPos.z);
  w.stage.setPerformer(w.player && perfPos ? perfPos : null);
  const perfH = perfChar ? perfChar.topY() - perfChar.root.position.y - perfChar.pose[I.jump] : 1.7;
  w.director.subjectScale += (Math.max(1, perfH / 1.7) - w.director.subjectScale) * Math.min(1, dt * 2);
  w.fx.update(dt, perfPos ? perfChar.root.position : null, perfChar ? perfChar.topY() - perfChar.root.position.y : 1.7, w.camera);
  // Mặc định đèn chạy theo đồng hồ chậm riêng, không nháy theo nhạc (đỡ mỏi mắt khi streamer dùng nhạc riêng).
  const followBeat = config.display?.lightsFollowBeat === true;
  w.lightClock += dt * (config.display?.lightSpeed ?? 0.35);
  w.stage.update(dt, followBeat ? beat : w.lightClock, { kick: followBeat ? w.music.kick() : 0, spectrum: followBeat ? w.music.getSpectrum() : null });
  // Lúc chill: tự đổi góc máy (toàn cảnh → quét đám đông → DJ → góc cao...).
  const chill = config.chillCamera;
  updateFocus(w);
  if (!w.player && chill?.shots?.length && !w.controls.enabled) {
    if (!w.director.focusing) w.chillTimer += dt;
    if (w.chillTimer >= (chill.seconds ?? 15)) {
      w.chillTimer = 0;
      w.chillShot = (w.chillShot + 1) % chill.shots.length;
      w.director.setShot(chill.shots[w.chillShot]);
    }
  }
  if (w.controls.enabled) w.controls.update();
  else w.director.update(dt);
  w.hud.updateTags(w.crowd.tags(), w.camera);
  // bloom: false → vẽ thẳng, không qua hậu kỳ (tương thích mọi card đồ hoạ, khử răng cưa gốc của trình duyệt).
  if (config.display?.bloom === false) w.renderer.render(w.scene, w.camera);
  else w.composer.render(dt);

  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc >= 0.5) {
    fps = fpsFrames / fpsAcc;
    fpsAcc = 0;
    fpsFrames = 0;
    if (w.controls.enabled) {
      w.hud.debug(`CAMERA DEBUG (F để tắt)\nfps ${fps.toFixed(0)} · draw calls ${w.renderer.info.render.calls}\nshot ${w.director.debugInfo}\nbeat ${beat.toFixed(1)}`);
    }
  }
  window.__dance = { fps, calls: w.renderer.info.render.calls, beat, shot: w.director.shot, dancers: w.crowd.entries.size };
}

// ---------------------------------------------------------------- Khởi động

async function startAudio() {
  const ok = await world.music.start();
  document.getElementById('sound-hint').hidden = ok || !config.music.enabled;
  return ok;
}

function init(cfg) {
  config = cfg;
  DANCE.sharpness = cfg.dance?.sharpness ?? 0.7;
  if (params.has('mute')) config.music.enabled = false;
  world = createWorld(cfg);
  world.stage.wall.info = chillWallInfo();
  fit();
  world.director.update(1);
  startAudio();
  const hint = document.getElementById('sound-hint');
  hint.addEventListener('click', startAudio);
  addEventListener('pointerdown', () => world.music.running || startAudio(), { once: false });
  if (params.has('debug')) window.__world = world;
  if (pendingState) applyState(pendingState);
  document.fonts?.load('800 40px "Baloo 2"').catch(() => {});
  requestAnimationFrame(frame);
}

fit();
connect();
