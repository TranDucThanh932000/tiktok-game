import { H, RIVER, TRACK, W, WATER, laneHeight, laneY, trackX } from './render/layout.js';
import { RiverRenderer } from './render/RiverRenderer.js';
import { drawDuck, drawDuckLabel, makeLabel } from './render/DuckRenderer.js';
import { Effects } from './render/EffectsRenderer.js';
import { drawObstacles } from './render/ObstacleRenderer.js';
import { CameraDirector } from './render/Camera.js';
import { UIManager } from './render/UIManager.js';
import { Sound } from './sound.js';

// The game screen only draws. The server owns the simulation and sends a frame 10 times a second;
// between frames each duck is extrapolated from its speed and eased towards it, so motion stays smooth at 60 FPS.
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const river = new RiverRenderer(ctx);
const fx = new Effects(ctx);
const ui = new UIManager(ctx);
const sound = new Sound();
const camera = new CameraDirector();

const METERS = 500;
const COMMUNITY_BANNERS = {
  wind: ['GIÓ THUẬN!', '#63e6be'],
  tsunami: ['SÓNG THẦN!', '#74c0fc'],
  cheer: ['ĐẠI HỘI CỔ VŨ!', '#ffa94d'],
  giftStorm: ['CƠN BÃO GIFT!', '#e599f7'],
};
const SKILL_TEXT = {
  SUPER_TURBO: ['SIÊU TURBO!', '#ff8787'], RAINBOW_BOOST: ['CẦU VỒNG!', '#e599f7'],
  SHIELD: ['LÁ CHẮN!', '#66d9e8'], WINGS: ['CÁNH THIÊN THẦN!', '#ffffff'],
};

const state = {
  settings: { lanes: 10, flags: {}, phases: {} },
  frame: { phase: 'idle', round: 0, left: 0, paused: false, track: 10000, base: 100, players: 0, community: { bonus: 0, active: [], progress: [] }, ducks: [], time: 0 },
  frameAt: performance.now(),
  rank: { race: [] },
  obstacles: [],
  result: null,
  ducks: new Map(),
  scenes: { wind: 0, cheer: 0, storm: 0 },
  tsunamiAt: -10,
  finishAt: 0,
  lastTick: 0,
  meters: METERS,
};

// ---------- network ----------
function addDuck(entry) {
  if (state.ducks.has(entry.id)) return state.ducks.get(entry.id);
  const d = {
    ...entry,
    hue: entry.color,
    label: makeLabel(entry.name, entry.color, entry.test),
    pos: 0, target: 0, speed: 0, mult: 1, flags: 0,
    anim: Math.random() * 6,
    x: TRACK.start, y: 0,
    jitter: ((entry.id * 0.618) % 1) - 0.5,
    seenAt: performance.now(),
    hotUntil: performance.now() + 4000,
  };
  state.ducks.set(entry.id, d);
  return d;
}

function setRoster(roster) {
  const keep = new Set(roster.map((r) => r.id));
  for (const id of state.ducks.keys()) if (!keep.has(id)) state.ducks.delete(id);
  roster.forEach(addDuck);
}

function applyFrame(f) {
  const now = performance.now();
  state.frame = f;
  state.frameAt = now;
  state.meters = METERS;
  for (const [id, pos, mult, flags] of f.ducks) {
    const d = state.ducks.get(id);
    if (!d) continue;
    if (Math.abs(pos - d.pos) > f.track * 0.05) d.jump = true;
    d.target = pos;
    d.mult = mult / 1000;
    d.speed = f.base * d.mult;
    d.flags = flags;
  }
}

const withLook = (r) => ({ ...r, hue: state.ducks.get(r.id)?.hue ?? 48, skin: state.ducks.get(r.id)?.skin ?? null });

function onFx(e, now) {
  const d = e.id != null ? state.ducks.get(e.id) : null;
  if (d && !e.quiet) d.hotUntil = now + 4000; // Bots are busy all the time; a big name is for viewers.
  const [x, y] = d ? [d.x, d.y] : [0, 0];
  switch (e.k) {
    case 'note':
      // During the race a gift gets a close-up whose caption says the same thing.
      if (e.kind === 'gift' && e.id != null && camera.rules.enabled && (state.frame.phase === 'race' || state.frame.phase === 'sprint')) break;
      ui.notify(e, now, state.settings.maxNotifications ?? 3);
      break;
    case 'join': {
      const nd = addDuck(e.duck);
      placeDuck(nd);
      fx.splash(nd.x, nd.y, 16, 1.1);
      sound.play('quack');
      break;
    }
    case 'roster':
      setRoster(e.roster);
      break;
    case 'dash':
      if (!d) break;
      fx.text(`+${e.meters}m`, x + 20, y - 80, { color: e.via === 'gift' ? '#ffa8e2' : '#ffe066', size: e.meters >= 30 ? 62 : e.quiet ? 32 : 44, life: 1.1 });
      fx.splash(x - 20, y, e.meters >= 30 ? 24 : e.quiet ? 4 : 8, 1.2);
      if (e.via !== 'like') sound.play('energy');
      break;
    case 'skill': {
      if (!d) break;
      const [label, color] = SKILL_TEXT[e.skill] ?? [e.skill, '#fff'];
      fx.text(label, x, y - 130, { color, size: 46, life: 1.4 });
      if (e.skill === 'SUPER_TURBO') fx.burst('fire', x - 30, y - 20, 40, { speed: 240, life: 0.8, size: 9, angle: Math.PI, spread: 1.4 });
      else if (e.skill === 'RAINBOW_BOOST') fx.burst('spark', x, y - 30, 50, { speed: 320, life: 1, size: 5, colors: ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#9775fa'] });
      else if (e.skill === 'WINGS') fx.burst('feather', x, y - 30, 18, { speed: 160, life: 1.6, size: 7, g: 40 });
      else if (e.skill === 'SHIELD') fx.burst('spark', x, y - 20, 30, { speed: 200, life: 0.8, size: 4, color: '#99e9f2' });
      sound.play(e.skill === 'SHIELD' ? 'shield' : e.skill === 'WINGS' ? 'gift' : 'turbo');
      break;
    }
    case 'gift':
      camera.onGift(e);
      break;
    case 'skin':
      if (!d) break;
      d.skin = e.skin;
      fx.burst('smoke', x, y - 24, 20, { speed: 130, life: 0.8, size: 14 });
      fx.burst('star', x, y - 24, 14, { speed: 240, life: 0.9, size: 9, color: '#ffe066' });
      fx.text(e.label, x, y - 130, { color: '#b2f2bb', size: 46, life: 1.6 });
      sound.play('gift');
      break;
    case 'hit':
      if (!d) break;
      if (e.result === 'hit') {
        fx.splash(x + 20, y, 18, 1.2);
        fx.text(['Ối!', 'Úi da!', 'Á!'][e.obj % 3], x, y - 100, { color: '#ff8787', size: 38, life: 0.9 });
        sound.play('hit');
      } else if (e.result === 'shield') {
        fx.burst('spark', x + 20, y - 20, 30, { speed: 260, life: 0.6, size: 4, color: '#99e9f2' });
        fx.text('CHẶN!', x, y - 100, { color: '#99e9f2', size: 38, life: 0.9 });
        sound.play('shield');
      } else {
        fx.text('BAY QUA!', x, y - 110, { color: '#fff', size: 36, life: 0.9 });
      }
      break;
    case 'pickup':
      if (!d) break;
      fx.burst('star', x + 20, y - 20, 12, { speed: 200, life: 0.8, size: 8, color: '#ffe066' });
      if (e.type === 'shield') fx.text('LÁ CHẮN!', x, y - 100, { color: '#99e9f2', size: 38, life: 1 });
      sound.play('coin');
      break;
    case 'finish':
      if (!d) break;
      d.place = e.place;
      fx.confetti(trackX(state.frame.track, state.frame.track), y, e.place <= 3 ? 70 : 20);
      if (e.place <= 3) sound.play('fanfare');
      break;
    case 'community': {
      const [title, color] = COMMUNITY_BANNERS[e.id] ?? [e.id, '#fff'];
      ui.banner(title, e.meters ? `Cả đàn vịt lao lên ${e.meters}m!` : `Cả đàn vịt nhanh hơn ${Math.round(e.bonus * 100)}% trong ${e.seconds} giây`, color, now, true);
      if (e.id === 'wind') {
        state.scenes.wind = e.seconds;
        sound.play('wind');
      } else if (e.id === 'tsunami') {
        state.tsunamiAt = now / 1000;
        sound.play('tsunami');
      } else if (e.id === 'cheer') {
        state.scenes.cheer = e.seconds + 1;
        for (let i = 0; i < 6; i++) fx.confetti(RIVER.w * ((i + 0.5) / 6), RIVER.y + 40, 40);
        sound.play('cheer');
      } else if (e.id === 'giftStorm') {
        state.scenes.storm = e.seconds + 1;
        sound.play('storm');
      }
      break;
    }
    case 'milestone':
      ui.banner(`${(e.n * 1000).toLocaleString('vi-VN')} TIM!`, 'Sóng thần đang tới gần...', '#74c0fc', now);
      break;
    case 'phase':
      if (e.phase === 'registration') ui.banner('SẮP XUẤT PHÁT!', 'Comment gì cũng được là có vịt', '#8ce99a', now);
      if (e.phase === 'race') {
        ui.banner('XUẤT PHÁT!', null, '#ffe066', now, true);
        for (const duck of state.ducks.values()) fx.splash(duck.x, duck.y, 6, 0.8);
        sound.play('start');
      }
      if (e.phase === 'sprint') {
        ui.banner('NƯỚC RÚT!', 'Thả tim thật nhanh!', '#ff8787', now, true);
        sound.play('start');
      }
      if (e.phase === 'waiting') state.result = null;
      break;
    case 'win': {
      state.result = { ...e.result, top: e.result.top.map(withLook) };
      state.winnerWins = e.wins;
      state.finishAt = now;
      for (let i = 0; i < 8; i++) setTimeout(() => {
        fx.firework(150 + Math.random() * (RIVER.w - 300), RIVER.y + 80 + Math.random() * 260);
        sound.play('firework');
      }, i * 450);
      sound.play('fanfare');
      break;
    }
  }
}

function connect() {
  const source = new EventSource('/events');
  source.onmessage = (msg) => {
    const m = JSON.parse(msg.data);
    const now = performance.now();
    switch (m.t) {
      case 'snapshot':
        state.settings = m.settings;
        sound.enabled = m.settings.sound;
        camera.configure(m.settings.camera);
        state.ducks.clear();
        setRoster(m.roster);
        applyFrame(m.frame);
        for (const d of state.ducks.values()) {
          d.pos = d.target;
          placeDuck(d);
        }
        state.rank = m.rank;
        state.obstacles = m.obstacles;
        if (m.result) {
          state.result = { ...m.result, top: m.result.top.map(withLook) };
          state.finishAt = now - 3000;
        }
        break;
      case 'frame':
        applyFrame(m);
        break;
      case 'fx':
        for (const e of m.fx) onFx(e, now);
        break;
      case 'roster':
        setRoster(m.roster);
        break;
      case 'rank':
        state.rank = m;
        for (const r of m.race) {
          const d = state.ducks.get(r.id);
          if (d) d.rankNow = r.rank;
        }
        break;
      case 'obstacles':
        state.obstacles = m.items;
        break;
      case 'settings':
        state.settings = m.settings;
        sound.enabled = m.settings.sound;
        camera.configure(m.settings.camera);
        break;
    }
  };
}

// ---------- camera ----------
function directCamera(dt) {
  const f = state.frame;
  const leader = (state.rank.race ?? []).find((r) => !r.done);
  camera.update(f.paused ? 0 : dt, {
    racing: f.phase === 'race' || f.phase === 'sprint',
    sprint: f.phase === 'sprint',
    leaderId: leader?.id ?? null,
    target: (id) => state.ducks.get(id) ?? null,
  });
  const shot = camera.takeStarted();
  if (shot) startShot(shot);
}

function startShot(shot) {
  const d = state.ducks.get(shot.id);
  if (!d) return;
  if (shot.kind === 'leader') {
    sound.play('wind');
    return;
  }
  const [x, y] = [d.x, d.y - 30];
  if (shot.tier === 'skin') {
    fx.burst('smoke', x, y, 30, { speed: 170, life: 0.9, size: 16 });
    fx.confetti(x, y, 40);
    sound.play('gift');
    return;
  }
  fx.burst('gift', x, y, shot.tier === 'small' ? 6 : 12, { speed: 340, life: 1.2, size: 9, g: 260, colors: ['#ff6b6b', '#cc5de8', '#4dabf7', '#51cf66'] });
  fx.burst('star', x, y, 22, { speed: 300, life: 1, size: 11, color: '#ffe066' });
  if (shot.tier === 'medium') fx.burst('spark', x, y, 50, { speed: 280, life: 0.9, size: 5, color: '#99e9f2' });
  if (shot.tier === 'large') fx.burst('fire', x - 30, y + 10, 40, { speed: 320, life: 0.7, size: 7, angle: Math.PI, spread: 1.4 });
  if (shot.tier === 'special') {
    fx.burst('spark', x, y, 120, { speed: 420, life: 1.2, size: 6, colors: ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#9775fa'] });
    fx.confetti(x, y, 50);
  }
  sound.play(shot.tier === 'special' || shot.tier === 'large' ? 'fanfare' : 'gift');
}

// Spray off the feet, a wave at the chest and sweat flying off the head of the duck on screen.
function strain(d, s) {
  if (Math.random() < 0.9) fx.emit('drop', d.x - 28 * s, d.y + 6 * s, { vx: -240 - Math.random() * 220, vy: -60 - Math.random() * 170, g: 700, life: 0.55, size: 2 + Math.random() * 2.5, color: 'rgba(235,250,255,0.95)' });
  if (Math.random() < 0.6) fx.emit('drop', d.x + 30 * s, d.y + 4 * s, { vx: -60 - Math.random() * 90, vy: -90 - Math.random() * 130, g: 700, life: 0.4, size: 1.5 + Math.random() * 2, color: 'rgba(235,250,255,0.9)' });
  if (Math.random() < 0.28) fx.emit('drop', d.x + 12 * s, d.y - 50 * s, { vx: -150 - Math.random() * 120, vy: -70 - Math.random() * 90, g: 420, life: 0.6, size: 2.6, color: '#a5e4ff' });
  if (Math.random() < 0.12) fx.emit('smoke', d.x + 40 * s, d.y - 32 * s, { vx: -90, vy: -30, life: 0.5, size: 5 });
}

// ---------- simulation on screen ----------
// Ducks shrink with the crowd and never outgrow their lane.
function duckScale(n) {
  const byCount = n <= 30 ? 1 : n <= 80 ? 0.8 : n <= 200 ? 0.65 : 0.55;
  return Math.min(byCount, laneHeight(state.settings.lanes || 8) / 100);
}

// The waterline sits a little below the lane centre, so the head stays inside the lane.
const swimY = (lane, lanes) => laneY(lane, lanes) + laneHeight(lanes) * 0.18;

function placeDuck(d) {
  const lanes = state.settings.lanes || 10;
  const crowd = state.ducks.size / lanes;
  d.x = trackX(d.pos, state.frame.track) - (state.frame.phase === 'registration' || state.frame.phase === 'waiting' ? (d.id % 3) * 10 : 0);
  d.y = swimY(d.lane, lanes) + (crowd > 1.2 ? d.jitter * laneHeight(lanes) * 0.55 : 0);
}

function gameTime(now) {
  const f = state.frame;
  return f.time + (f.paused ? 0 : (now - state.frameAt) / 1000);
}

function update(now, dt) {
  directCamera(dt);
  const f = state.frame;
  const since = (now - state.frameAt) / 1000;
  const racing = (f.phase === 'race' || f.phase === 'sprint') && !f.paused;
  const lanes = state.settings.lanes || 10;
  const scale = duckScale(state.ducks.size);
  const F = state.settings.flags;
  for (const d of state.ducks.values()) {
    const finished = d.flags & (F.FINISHED ?? 128);
    const predicted = racing && !finished ? Math.min(f.track, d.target + d.speed * Math.min(since, 0.3)) : d.target;
    const ease = d.jump ? 3 : 10;
    d.pos += (predicted - d.pos) * Math.min(1, dt * ease);
    if (d.jump && Math.abs(predicted - d.pos) < f.track * 0.002) d.jump = false;
    placeDuck(d);
    d.scale = scale;
    d.racing = racing && !finished;
    d.finished = finished;
    const slowed = d.flags & (F.SLOW ?? 64);
    d.effort = camera.focus?.id === d.id && d.racing ? camera.k : 0;
    d.anim += dt * (d.racing ? (slowed ? 4 : 7 * Math.min(d.mult, 1.6) ** 2) + d.effort * 24 : 2.5);
    d.hot = d.hotUntil > now;
    if (d.effort > 0.4) strain(d, scale);
    // Splashes and fire scale with speed; with hundreds of ducks only a share of them emit each frame.
    if (d.racing && Math.random() < (d.mult > 1.08 ? 0.5 : 0.08) * (state.ducks.size > 80 ? 0.3 : 1)) {
      fx.emit('drop', d.x - 30 * scale, d.y + 4, { vx: -60 - Math.random() * 80, vy: -80 - Math.random() * 120, g: 600, life: 0.5, size: 3 * scale, color: 'rgba(230,248,255,0.9)' });
    }
    if (d.racing && d.flags & (F.SUPER_TURBO ?? 4) && Math.random() < 0.7) {
      fx.emit('fire', d.x - 34 * scale, d.y - 20 * scale + (Math.random() - 0.5) * 20 * scale, { vx: -120 - Math.random() * 80, vy: -30, life: 0.5, size: 8 * scale });
    }
  }
  for (const key of Object.keys(state.scenes)) state.scenes[key] = Math.max(0, state.scenes[key] - dt);
  if (state.scenes.wind > 0 && Math.random() < 0.5) {
    fx.emit('leaf', -20, WATER.y + Math.random() * WATER.h, { vx: 380 + Math.random() * 200, vy: (Math.random() - 0.5) * 60, life: 4, size: 7, color: ['#69db7c', '#a9e34b', '#ffd43b'][Math.floor(Math.random() * 3)] });
  }
  if (state.scenes.storm > 0 && Math.random() < 0.5) {
    const type = Math.random() < 0.4 ? 'gift' : 'star';
    fx.emit(type, Math.random() * RIVER.w, RIVER.y - 10, { vy: 160 + Math.random() * 120, vx: (Math.random() - 0.5) * 60, life: 4, size: type === 'gift' ? 10 : 9, color: ['#ff6b6b', '#cc5de8', '#ffd43b', '#4dabf7'][Math.floor(Math.random() * 4)] });
  }
  const tsunami = now / 1000 - state.tsunamiAt;
  if (tsunami > 0 && tsunami < 2.6) {
    const front = -200 + (tsunami / 2.6) * (RIVER.w + 500);
    for (let i = 0; i < 4; i++) fx.emit('drop', front + Math.random() * 20, WATER.y + Math.random() * WATER.h, { vx: 300, vy: -200 - Math.random() * 200, g: 600, life: 0.8, size: 5, color: '#fff' });
  }
  fx.update(dt);
}

// ---------- drawing ----------
function draw(now, t, dt) {
  const f = state.frame;
  ctx.fillStyle = '#0b2545';
  ctx.fillRect(0, 0, W, H);
  river.drawGround();

  // Everything on the river goes through the camera; everything around it stays put.
  const cam = camera.view();
  const shake = camera.k * 2.5 + camera.kick * 7;
  ctx.save();
  ctx.beginPath();
  ctx.rect(RIVER.x, RIVER.y, RIVER.w, RIVER.h);
  ctx.clip();
  ctx.translate(RIVER.x + RIVER.w / 2 + Math.sin(t * 41) * shake, RIVER.y + RIVER.h / 2 + Math.cos(t * 53) * shake);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  river.draw(t, dt, {
    lanes: state.settings.lanes || 10,
    sprint: f.phase === 'sprint',
    wind: state.scenes.wind,
    cheer: state.scenes.cheer,
    storm: state.scenes.storm,
    meters: METERS,
    rush: camera.k,
  });

  const lanes = state.settings.lanes || 10;
  const scale = duckScale(state.ducks.size);
  // Objects stand still in the river, which would give the close-up away while the scenery rushes past.
  if (camera.k < 0.5) drawObstacles(ctx, state.obstacles, t, gameTime(now), { lanes, x: (pos) => trackX(pos, f.track), y: (lane) => swimY(lane, lanes) - 6, scale });

  // Labels: everyone when the river is small; otherwise the top 10 and whoever just did something.
  const ducks = [...state.ducks.values()].sort((a, b) => a.y - b.y);
  const many = ducks.length > 40;
  let labels = 0;
  const F = state.settings.flags;
  const labelled = [];
  const hero = camera.focus ? state.ducks.get(camera.focus.id) : null;
  for (const d of ducks) {
    if (!d.finished) d.place = d.rankNow <= 3 && (f.phase === 'race' || f.phase === 'sprint') ? d.rankNow : null;
    if (!many || (((d.rankNow ?? 99) <= 10 || d.hotUntil > now) && labels < 24)) {
      labels++;
      labelled.push(d);
    }
    if (d !== hero) drawDuck(ctx, d, t, F);
  }
  // In a close-up the names make way (the caption has the one that matters) and the star of the shot goes on top.
  ctx.globalAlpha = 1 - camera.k;
  if (camera.k < 0.95) for (const d of labelled) drawDuckLabel(ctx, d, F);
  ctx.globalAlpha = 1;
  if (hero) drawDuck(ctx, hero, t, F);

  const tsunami = now / 1000 - state.tsunamiAt;
  river.drawTsunami(tsunami / 2.6);
  fx.draw(1 / cam.zoom ** 0.7);
  ctx.restore();

  ui.drawCloseUp(state, camera, cam, t);
  ui.drawSprintEdge(state, t);
  const left = Math.max(0, f.left - (f.paused ? 0 : (now - state.frameAt) / 1000));
  const view = { ...state, left, phaseTotal: state.settings.phases?.[f.phase === 'waiting' ? 'registration' : f.phase] ?? 1, finishAge: (now - state.finishAt) / 1000 };
  ui.drawJoinCard(view, t);
  ui.drawResults(view, t);
  ui.drawPaused(state);
  // A close-up keeps the river clear; notes wait until the camera is back.
  if (camera.k < 0.3) ui.drawNotes(now, state.settings.maxNotifications ?? 3);
  ui.drawBanners(now);
  ui.drawHeader(view, t);
  ui.drawBoard(view, t, dt);
  ui.drawHowTo(view);
  ui.drawGiftList(view, t);
  ui.drawGoal(view, t);

  // Countdown beeps for the last 3 seconds of registration.
  if (f.phase === 'registration' && left <= 3 && left > 0 && Math.ceil(left) !== state.lastTick) {
    state.lastTick = Math.ceil(left);
    sound.play('tick');
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(now, dt);
  draw(now, now / 1000, dt);
  requestAnimationFrame(loop);
}

// ---------- window ----------
function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = `${W * s}px`;
  canvas.style.height = `${H * s}px`;
}
window.addEventListener('resize', fit);
fit();
const toggleFullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}));
window.addEventListener('dblclick', toggleFullscreen);
window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
});

connect();
document.fonts?.ready.finally(() => requestAnimationFrame(loop)) ?? requestAnimationFrame(loop);
