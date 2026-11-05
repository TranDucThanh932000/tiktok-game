import { H, RIVER, TRACK, W, WATER, laneHeight, laneY, trackX } from './render/layout.js';
import { RiverRenderer } from './render/RiverRenderer.js';
import { drawDuck, drawDuckLabel, makeLabel } from './render/DuckRenderer.js';
import { Effects } from './render/EffectsRenderer.js';
import { drawObstacles } from './render/ObstacleRenderer.js';
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

const METERS = 500;
const COMMUNITY_BANNERS = {
  wind: ['GIÓ THUẬN!', '#63e6be'],
  tsunami: ['SÓNG THẦN!', '#74c0fc'],
  cheer: ['ĐẠI HỘI CỔ VŨ!', '#ffa94d'],
  giftStorm: ['CƠN BÃO GIFT!', '#e599f7'],
};
const SKILL_TEXT = {
  TURBO: ['TURBO!', '#ffd43b'], SUPER_TURBO: ['SIÊU TURBO!', '#ff8787'], RAINBOW_BOOST: ['CẦU VỒNG!', '#e599f7'],
  SHIELD: ['LÁ CHẮN!', '#66d9e8'], WINGS: ['CÁNH THIÊN THẦN!', '#ffffff'], COMBO_TURBO: ['TURBO COMBO!', '#b197fc'],
  ROCKET: ['TÊN LỬA!', '#ff6b6b'], RAINBOW_PICKUP: ['CẦU VỒNG!', '#e599f7'], BOOST_ZONE: ['DÒNG CHẢY XIẾT!', '#66d9e8'],
};

const state = {
  settings: { lanes: 10, keywords: [], flags: {}, phases: {} },
  frame: { phase: 'idle', round: 0, left: 0, paused: false, track: 10000, base: 100, players: 0, community: { bonus: 0, active: [], progress: [] }, totals: { likes: 0, comments: 0, shares: 0, gifts: 0 }, ducks: [], time: 0 },
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
    pos: 0, target: 0, speed: 0, mult: 1, energy: 0, flags: 0, combo: 0, tier: 0,
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
  for (const [id, pos, mult, energy, flags, combo, tier] of f.ducks) {
    const d = state.ducks.get(id);
    if (!d) continue;
    if (Math.abs(pos - d.pos) > f.track * 0.05) d.jump = true;
    d.target = pos;
    d.mult = mult / 1000;
    d.speed = f.base * d.mult;
    d.energy = energy;
    d.flags = flags;
    d.combo = combo;
    d.tier = tier;
  }
}

function onFx(e, now) {
  const d = e.id != null ? state.ducks.get(e.id) : null;
  if (d) d.hotUntil = now + 4000;
  const [x, y] = d ? [d.x, d.y] : [0, 0];
  switch (e.k) {
    case 'note':
      ui.notify(e, now, state.settings.maxNotifications ?? 4);
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
    case 'energy':
      if (!d) break;
      fx.text(`+${e.amount}⚡`, x + 20, y - 90, { color: e.via === 'gift' ? '#ffa8e2' : '#ffe066', size: 28, life: 1 });
      if (e.via !== 'like') sound.play('energy');
      break;
    case 'combo':
      if (!d) break;
      fx.text(`COMBO x${e.count}`, x, y - 120, { color: '#d0bfff', stroke: '#5f3dc4', size: 34, life: 1.1 });
      fx.burst('star', x, y - 40, 8, { speed: 160, life: 0.8, size: 9, color: '#d0bfff' });
      sound.play('combo');
      break;
    case 'skill': {
      if (!d) break;
      const [label, color] = e.skill === 'ENERGY_TURBO' ? [`TURBO +${[0, 5, 10, 15, 20][e.tier] ?? 5}%`, '#ffe066'] : SKILL_TEXT[e.skill] ?? [e.skill, '#fff'];
      fx.text(label, x, y - 112, { color, size: e.skill === 'ENERGY_TURBO' ? 30 + e.tier * 3 : 38, life: 1.4 });
      fx.splash(x - 20, y, 22, 1.4);
      if (e.skill === 'SUPER_TURBO') fx.burst('fire', x - 30, y - 20, 40, { speed: 240, life: 0.8, size: 9, angle: Math.PI, spread: 1.4 });
      else if (e.skill === 'RAINBOW_BOOST' || e.skill === 'RAINBOW_PICKUP') fx.burst('spark', x, y - 30, 50, { speed: 320, life: 1, size: 5, colors: ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#9775fa'] });
      else if (e.skill === 'WINGS') fx.burst('feather', x, y - 30, 18, { speed: 160, life: 1.6, size: 7, g: 40 });
      else if (e.skill === 'SHIELD') fx.burst('spark', x, y - 20, 30, { speed: 200, life: 0.8, size: 4, color: '#99e9f2' });
      else fx.burst('spark', x, y - 30, 26, { speed: 260, life: 0.7, size: 4, color: '#ffe066' });
      sound.play(e.skill === 'SHIELD' ? 'shield' : e.skill === 'WINGS' ? 'gift' : 'turbo');
      break;
    }
    case 'hit':
      if (!d) break;
      if (e.result === 'hit') {
        fx.splash(x + 20, y, 18, 1.2);
        fx.text(['Ối!', 'Úi da!', 'Á!'][e.obj % 3], x, y - 100, { color: '#ff8787', size: 30, life: 0.9 });
        sound.play('hit');
      } else if (e.result === 'shield') {
        fx.burst('spark', x + 20, y - 20, 30, { speed: 260, life: 0.6, size: 4, color: '#99e9f2' });
        fx.text('CHẶN!', x, y - 100, { color: '#99e9f2', size: 30, life: 0.9 });
        sound.play('shield');
      } else {
        fx.text('BAY QUA!', x, y - 110, { color: '#fff', size: 28, life: 0.9 });
      }
      break;
    case 'pickup':
      if (!d) break;
      fx.burst('star', x + 20, y - 20, 12, { speed: 200, life: 0.8, size: 8, color: '#ffe066' });
      fx.text({ coin: '+5⚡', rocket: 'TÊN LỬA!', shield: 'LÁ CHẮN!', star: '+10 điểm', rainbow: 'CẦU VỒNG!', boost: 'TĂNG TỐC!' }[e.type] ?? '+', x, y - 100, { color: '#ffe066', size: 28, life: 1 });
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
      ui.banner(title, `+${Math.round(e.bonus * 100)}% tốc độ cho TẤT CẢ vịt · ${e.seconds}s`, color, now, true);
      if (e.id === 'wind') {
        state.scenes.wind = e.seconds;
        sound.play('wind');
      } else if (e.id === 'tsunami') {
        state.tsunamiAt = now / 1000;
        sound.play('tsunami');
      } else if (e.id === 'cheer') {
        state.scenes.cheer = e.seconds + 1;
        for (let i = 0; i < 6; i++) fx.confetti(200 + i * 220, RIVER.y + 40, 40);
        sound.play('cheer');
      } else if (e.id === 'giftStorm') {
        state.scenes.storm = e.seconds + 1;
        sound.play('storm');
      }
      break;
    }
    case 'milestone':
      ui.banner(`${(e.n * 1000).toLocaleString('vi-VN')} LIKE!`, 'Sóng thần đang tới gần...', '#74c0fc', now);
      break;
    case 'phase':
      if (e.phase === 'registration') ui.banner('ĐĂNG KÝ THAM GIA!', 'Comment để thả vịt xuống sông', '#8ce99a', now);
      if (e.phase === 'race') {
        ui.banner('XUẤT PHÁT!', null, '#ffe066', now, true);
        for (const duck of state.ducks.values()) fx.splash(duck.x, duck.y, 6, 0.8);
        sound.play('start');
      }
      if (e.phase === 'sprint') {
        ui.banner('NƯỚC RÚT!', 'Dùng hết năng lượng còn lại!', '#ff8787', now, true);
        sound.play('start');
      }
      if (e.phase === 'waiting') state.result = null;
      break;
    case 'win': {
      state.result = { ...e.result, top: e.result.top.map((r) => ({ ...r, hue: state.ducks.get(r.id)?.hue ?? 48 })) };
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
          state.result = { ...m.result, top: m.result.top.map((r) => ({ ...r, hue: state.ducks.get(r.id)?.hue ?? 48 })) };
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
        break;
    }
  };
}

// ---------- simulation on screen ----------
// Ducks shrink with the crowd and never outgrow their lane, so the name above fits in the water between lanes.
function duckScale(n) {
  const byCount = n <= 30 ? 1 : n <= 80 ? 0.8 : n <= 200 ? 0.65 : 0.55;
  return Math.min(byCount, laneHeight(state.settings.lanes || 8) / 100);
}

// The waterline sits a little below the lane centre, leaving room for the name above the head.
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
    d.anim += dt * (d.racing ? (slowed ? 4 : 7 * d.mult ** 4) : 2.5);
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
  river.draw(t, dt, {
    lanes: state.settings.lanes || 10,
    sprint: f.phase === 'sprint',
    wind: state.scenes.wind,
    cheer: state.scenes.cheer,
    storm: state.scenes.storm,
    meters: METERS,
  });

  const lanes = state.settings.lanes || 10;
  const scale = duckScale(state.ducks.size);
  drawObstacles(ctx, state.obstacles, t, gameTime(now), { lanes, x: (pos) => trackX(pos, f.track), y: (lane) => swimY(lane, lanes) - 6, scale });

  // Labels: everyone when the river is small; otherwise the top 15 and whoever just did something.
  const ducks = [...state.ducks.values()].sort((a, b) => a.y - b.y);
  const many = ducks.length > 40;
  let labels = 0;
  const F = state.settings.flags;
  const labelled = [];
  for (const d of ducks) {
    if (!d.finished) d.place = d.rankNow <= 3 && (f.phase === 'race' || f.phase === 'sprint') ? d.rankNow : null;
    if (!many || (((d.rankNow ?? 99) <= 15 || d.hotUntil > now) && labels < 45)) {
      labels++;
      labelled.push(d);
    }
    drawDuck(ctx, d, t, F);
  }
  for (const d of labelled) drawDuckLabel(ctx, d, t, F, RIVER.y + 4);

  const tsunami = now / 1000 - state.tsunamiAt;
  river.drawTsunami(tsunami / 2.6);
  fx.draw();

  ui.drawTop3(state, t);
  const left = Math.max(0, f.left - (f.paused ? 0 : (now - state.frameAt) / 1000));
  const view = { ...state, left, phaseTotal: state.settings.phases?.[f.phase === 'waiting' ? 'registration' : f.phase] ?? 1, finishAge: (now - state.finishAt) / 1000 };
  ui.drawJoinCard(view, t);
  ui.drawResults(view, t);
  ui.drawPaused(state);
  ui.drawNotes(now, state.settings.maxNotifications ?? 4);
  ui.drawBanners(now);
  ui.drawHeader(view, t);
  ui.drawBoard(view, t, dt);
  ui.drawCommunity(view, t);

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
