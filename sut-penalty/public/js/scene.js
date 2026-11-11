import { KEEPER_KIT, kitOf, drawPuppet, drawBall } from './art.js';

const W = 1080;
const H = 1920;
const TOP = 655;
const GOAL = { l: 141, r: 939, top: 735, line: 1040 };
const SPOT = { x: 540, y: 1294 };
const FEET_Y = 1872;
const PLAYER_H = 300;
const KEEPER_H = 320;
const HOME_X = 540;

const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lerp = (a, b, u) => a + (b - a) * u;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Dáng vẽ thay khi chưa có ảnh: thông số cho drawPuppet (art.js).
const PLAYER_POSES = {
  dung: () => ({}),
  chay: (t) => ({ armL: 0.5 * Math.sin(t / 70), armR: -0.5 * Math.sin(t / 70), legL: -0.4 * Math.sin(t / 70), legR: 0.4 * Math.sin(t / 70), rot: 0.04 }),
  sut: () => ({ armL: -1.2, armR: 1.0, legL: -0.1, legR: 1.15, rot: -0.08 }),
  mung: (t) => ({ armL: -2.8, armR: 2.8, lift: 30 + 14 * Math.sin(t / 90) }),
  buon: () => ({ armL: -2.75, armR: 2.75, rot: 0.06 }),
  vay: (t) => ({ armL: -0.2, armR: 2.5 + 0.35 * Math.sin(t / 90) }),
};
const KEEPER_POSES = {
  dung: (t) => ({ armL: -2.3, armR: 2.3, legL: -0.14, legR: 0.14, lift: 2 * Math.sin(t / 300) }),
  'bay-trai': () => ({ armL: -2.95, armR: -2.75, legL: 0.05, legR: 0.2, rot: -1.3 }),
  'bay-phai': () => ({ armL: 2.75, armR: 2.95, legL: -0.2, legR: -0.05, rot: 1.3 }),
  bat: () => ({ armL: -0.55, armR: 0.55, ball: true, face: 'happy' }),
  mung: (t) => ({ armL: -2.9, armR: 1.2 + 0.5 * Math.sin(t / 80), lift: 24 + 10 * Math.sin(t / 80), face: 'happy' }),
  thua: () => ({ armL: -0.7, armR: 0.7, legL: -1.35, legR: 1.35, lift: -48, face: 'sad' }),
};
// Thiếu ảnh của một dáng thì dùng ảnh đứng và nghiêng/nhấc cho gần giống.
const SPRITE_FALLBACK = {
  chay: { rot: 0.06 },
  sut: { rot: -0.12 },
  mung: { lift: 36 },
  buon: { rot: 0.1 },
  vay: { lift: 10 },
  'bay-trai': { rot: -1.25, dy: 40 },
  'bay-phai': { rot: 1.25, dy: 40 },
  bat: {},
  thua: { rot: 0.25 },
};

export function createScene(canvas, { onResolve = () => {}, onLaunch = () => {} } = {}) {
  const ctx = canvas.getContext('2d');
  const images = new Map();
  let players = [];
  const keeper = { frames: [{ t: 0, x: HOME_X, lift: 0, pose: 'dung' }] };
  const balls = [];
  const ripples = [];
  const particles = [];
  let headline = null;
  let lastBoard = null;
  const field = drawField();

  function setTeams(teams) {
    const n = teams.length;
    players = teams.map((t, i) => ({ id: t.id, number: t.number, kit: kitOf(t.id), x: Math.round((W * (i + 0.5)) / n), frames: [], ready: false }));
  }

  function setSprites(names) {
    for (const name of names) {
      if (images.has(name)) continue;
      const img = new Image();
      img.decoding = 'async';
      img.src = `/nhan-vat/${encodeURIComponent(name)}.png?v=${Date.now()}`;
      images.set(name, img);
    }
  }
  const sprite = (name) => {
    const img = images.get(name);
    return img?.complete && img.naturalWidth ? img : null;
  };

  function setBoard(board) {
    lastBoard = board;
    for (const p of players) p.ready = (board.pending?.[p.id] ?? 0) > 0;
  }

  const playerOf = (id) => players.find((p) => p.id === id);

  function wave(teamId) {
    const p = playerOf(teamId);
    if (!p) return;
    const now = performance.now();
    if (p.frames.length && now < p.frames.at(-1).t) return;
    p.frames = [{ t: now, pose: 'vay' }, { t: now + 1100, pose: 'dung' }];
  }

  // Lượt sút: cầu thủ lấy đà (khi sút chậm), bóng bay vào khung, thủ môn bay người, rồi báo kết quả.
  function shot(msg) {
    const p = playerOf(msg.team);
    if (!p) return onResolve(msg);
    const now = performance.now();
    const slow = msg.gap >= 800;
    const windup = slow ? 280 : 0;
    const launch = now + windup;
    const dur = clamp(msg.gap * 2.4, 420, 900);
    const to = { x: HOME_X + msg.tx * ((GOAL.r - GOAL.l) / 2) * 0.9, y: GOAL.line - 22 - msg.ty * (GOAL.line - GOAL.top - 60) };
    const from = { x: p.x, y: FEET_Y - 34 };
    const center = msg.dive === 0;
    balls.push({ msg, from, to, launch, dur, catch: msg.saved && center, color: p.kit.color, done: false, spin: 0 });
    setTimeout(() => onLaunch(msg), windup);

    const after = launch + dur;
    p.frames = [
      ...(slow ? [{ t: now, pose: 'chay' }] : []),
      { t: launch, pose: 'sut' },
      { t: launch + Math.min(260, dur * 0.5), pose: 'dung' },
      { t: after + 60, pose: msg.saved ? 'buon' : 'mung' },
      { t: after + (slow ? 1100 : 500), pose: 'dung' },
    ];

    const cur = keeperAt(now);
    const reach = launch + dur * 0.86;
    const start = launch + dur * 0.32;
    const height = GOAL.line - to.y;
    let kx;
    let lift;
    let pose;
    // Tay thủ môn cách gốc hình bao xa (đo trên ảnh chibi đã cắt, tỉ lệ theo KEEPER_H); không có ảnh thì theo hình khối.
    const real = Boolean(sprite('thu-mon-bay-trai') && sprite('thu-mon-bat'));
    if (msg.saved && center) {
      kx = to.x;
      lift = Math.max(0, height - (real ? 0.42 : 0.55) * KEEPER_H);
      pose = 'bat';
    } else if (msg.saved) {
      kx = to.x - msg.dive * (real ? 0.41 : 0.35) * KEEPER_H;
      lift = Math.max(0, height - (real ? 0.39 : 0.26) * KEEPER_H);
      pose = msg.dive < 0 ? 'bay-trai' : 'bay-phai';
    } else if (msg.dive === 0) {
      kx = HOME_X;
      lift = 18;
      pose = 'dung';
    } else {
      kx = HOME_X + msg.dive * 230;
      lift = 40 + Math.random() * 60;
      pose = msg.dive < 0 ? 'bay-trai' : 'bay-phai';
    }
    kx = clamp(kx, GOAL.l + 60, GOAL.r - 60);
    const land = after + (slow ? 260 : 120);
    const rest = land + (slow ? 800 : 300);
    // Dáng ôm bóng chỉ hiện khi bóng tới tay, không thì thấy hai quả bóng.
    const arrive = pose === 'bat' ? [{ t: reach, x: kx, lift, pose: 'dung' }, { t: after, x: kx, lift, pose: 'bat' }] : [{ t: reach, x: kx, lift, pose }];
    keeper.frames = [
      { t: now, x: cur.x, lift: cur.lift, pose: ['thua', 'mung', 'bat'].includes(cur.pose) ? 'dung' : cur.pose },
      { t: start, x: cur.x, lift: 0, pose: pose === 'bat' ? 'dung' : pose },
      ...arrive,
      { t: land, x: kx, lift: 0, pose: msg.saved ? (center ? 'bat' : 'mung') : 'thua' },
      { t: rest, x: kx, lift: 0, pose: 'dung' },
      { t: rest + 320, x: HOME_X, lift: 0, pose: 'dung' },
    ];
  }

  // Vị trí/dáng nội suy giữa các mốc; dáng giữ theo mốc vừa qua.
  function keeperAt(now) {
    const f = keeper.frames;
    if (now <= f[0].t) return f[0];
    for (let i = 0; i < f.length - 1; i++) {
      if (now < f[i + 1].t) {
        const u = ease((now - f[i].t) / (f[i + 1].t - f[i].t));
        return { x: lerp(f[i].x, f[i + 1].x, u), lift: lerp(f[i].lift, f[i + 1].lift, u), pose: f[i].pose };
      }
    }
    return f.at(-1);
  }

  function poseOf(p, now) {
    let pose = 'dung';
    for (const f of p.frames) if (f.t <= now) pose = f.pose;
    return pose;
  }

  function resolve(ball, now) {
    ball.done = true;
    ball.doneAt = now;
    const { msg } = ball;
    const turbo = msg.gap < 500;
    if (!msg.saved) {
      ripples.push({ x: ball.to.x, y: ball.to.y, t0: now });
      if (ripples.length > 12) ripples.shift();
      burst(ball.to.x, ball.to.y, ball.color, turbo ? 6 : 26);
      say(turbo ? 'GOAL!' : 'GOOOAL!', ball.color, now, msg.gap);
    } else if (ball.catch) {
      say('CAUGHT!', '#ffd23f', now, msg.gap);
    } else {
      const side = Math.sign(ball.to.x - HOME_X) || 1;
      ball.vx = side * (420 + Math.random() * 360);
      ball.vy = 260 + Math.random() * 260;
      say('SAVED!', '#ffd23f', now, msg.gap);
    }
    onResolve(msg);
  }

  function say(text, color, now, gap) {
    if (headline && now - headline.t0 < 260 && gap < 500) return;
    headline = { text, color, t0: now };
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n && particles.length < 500; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 250 + Math.random() * 550;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200, color: i % 3 ? color : '#ffd23f', life: 900 + Math.random() * 600, t0: performance.now(), rot: Math.random() * 6 });
    }
  }

  // ---------- Vẽ ----------
  function drawField() {
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const g = off.getContext('2d');
    for (let y = TOP, i = 0; y < H; y += 108, i++) {
      g.fillStyle = i % 2 ? '#2b8243' : '#30904a';
      g.fillRect(0, y, W, 108);
    }
    g.strokeStyle = 'rgba(255,255,255,.92)';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(18, GOAL.line);
    g.lineTo(W - 18, GOAL.line);
    g.strokeRect(62, GOAL.line, W - 124, 411);
    g.strokeRect(283, GOAL.line, W - 566, 143);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.92)';
    g.beginPath();
    g.arc(SPOT.x, SPOT.y, 8, 0, Math.PI * 2);
    g.fill();
    return off;
  }

  function netOffset(x, y, now) {
    let dx = 0;
    let dy = 0;
    for (const r of ripples) {
      const age = now - r.t0;
      if (age > 900) continue;
      const ddx = x - r.x;
      const ddy = y - r.y;
      const d = Math.hypot(ddx, ddy);
      if (d > 150 || d < 0.01) continue;
      const k = (1 - d / 150) ** 2 * 26 * Math.exp(-age / 260) * Math.cos(age / 70);
      dx -= (ddx / d) * k;
      dy -= (ddy / d) * k;
    }
    return [dx, dy];
  }

  function drawGoal(now) {
    const { l, r, top, line } = GOAL;
    ctx.fillStyle = '#1f5a34';
    ctx.fillRect(l, top, r - l, line - top);
    for (const rp of ripples) {
      const age = now - rp.t0;
      if (age > 900) continue;
      const g = ctx.createRadialGradient(rp.x, rp.y, 0, rp.x, rp.y, 120);
      g.addColorStop(0, `rgba(0,0,0,${0.35 * (1 - age / 900)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(rp.x - 120, rp.y - 120, 240, 240);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.42)';
    ctx.lineWidth = 2;
    const active = ripples.some((rp) => now - rp.t0 < 900);
    ctx.beginPath();
    for (let x = l + 22; x < r; x += 22) {
      for (let y = top; y <= line; y += active ? 12 : line - top) {
        const [dx, dy] = active ? netOffset(x, y, now) : [0, 0];
        if (y === top) ctx.moveTo(x + dx, y + dy);
        else ctx.lineTo(x + dx, y + dy);
      }
    }
    for (let y = top + 22; y < line; y += 22) {
      for (let x = l; x <= r; x += active ? 12 : r - l) {
        const [dx, dy] = active ? netOffset(x, y, now) : [0, 0];
        if (x === l) ctx.moveTo(x + dx, y + dy);
        else ctx.lineTo(x + dx, y + dy);
      }
    }
    ctx.stroke();
  }

  function drawPosts() {
    const { l, r, top, line } = GOAL;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,.25)';
    ctx.shadowBlur = 8;
    ctx.fillRect(l - 14, top - 14, r - l + 28, 14);
    ctx.fillRect(l - 14, top - 14, 14, line - top + 18);
    ctx.fillRect(r, top - 14, 14, line - top + 18);
    ctx.shadowBlur = 0;
  }

  function shadow(x, y, w) {
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath();
    ctx.ellipse(x, y, w, w * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ảnh chibi nếu có, không thì vẽ hình khối.
  function drawFigure({ prefix, pose, x, y, height, lift, fallback }) {
    const exact = sprite(`${prefix}-${pose}`);
    const base = exact ?? sprite(`${prefix}-dung`);
    if (base) {
      const fix = exact ? {} : SPRITE_FALLBACK[pose] ?? {};
      const w = (base.naturalWidth * height) / base.naturalHeight;
      ctx.save();
      ctx.translate(x, y - lift - (fix.lift ?? 0) - (fix.dy ?? 0));
      if (fix.rot) {
        ctx.translate(0, -height / 2);
        ctx.rotate(fix.rot);
        ctx.translate(0, height / 2);
      }
      ctx.drawImage(base, -w / 2, -height, w, height);
      ctx.restore();
      return;
    }
    fallback();
  }

  function drawKeeper(now) {
    const k = keeperAt(now);
    const pose = KEEPER_POSES[k.pose] ? k.pose : 'dung';
    shadow(k.x, GOAL.line + 4, pose.startsWith('bay') ? 90 : 62);
    const scale = KEEPER_H / 270;
    drawFigure({
      prefix: 'thu-mon',
      pose,
      x: k.x,
      y: GOAL.line,
      height: KEEPER_H,
      lift: k.lift,
      fallback: () => {
        const p = KEEPER_POSES[pose](now);
        drawPuppet(ctx, { x: k.x, y: GOAL.line - k.lift * scale, scale, rot: p.rot ?? 0, back: false, kit: KEEPER_KIT, number: 1, pose: p });
      },
    });
  }

  function drawPlayers(now) {
    for (const p of players) {
      const pose = poseOf(p, now);
      shadow(p.x, FEET_Y, 66);
      if (p.ready && pose === 'dung') {
        ctx.save();
        ctx.translate(p.x + 40, FEET_Y - 20);
        drawBall(ctx, 22, 0);
        ctx.restore();
      }
      drawFigure({
        prefix: p.id,
        pose,
        x: p.x,
        y: FEET_Y,
        height: PLAYER_H,
        lift: 0,
        fallback: () => {
          const pp = PLAYER_POSES[pose]?.(now) ?? {};
          drawPuppet(ctx, { x: p.x, y: FEET_Y, scale: PLAYER_H / 280, rot: pp.rot ?? 0, back: true, kit: p.kit, number: p.number, pose: pp });
        },
      });
    }
  }

  function drawBalls(now, dt, layer) {
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (now < b.launch) continue;
      const u = Math.min(1, (now - b.launch) / b.dur);
      if (!b.done && u >= 1) resolve(b, now);
      const inNet = b.done && !b.msg.saved;
      if ((layer === 'net') !== inNet) continue;
      let x;
      let y;
      let r;
      let alpha = 1;
      if (!b.done) {
        const e = 1 - (1 - u) ** 2;
        x = lerp(b.from.x, b.to.x, e);
        y = lerp(b.from.y, b.to.y, e) - Math.sin(Math.PI * u) * (60 + 90 * b.msg.ty);
        r = lerp(26, 14, e);
        b.spin += dt * 0.02;
      } else {
        const age = now - b.doneAt;
        if (b.catch) {
          balls.splice(i, 1);
          continue;
        }
        if (inNet) {
          x = b.to.x;
          y = b.to.y - Math.min(10, age / 20);
          r = 13;
          alpha = 1 - age / 700;
        } else {
          const s = age / 1000;
          x = b.to.x + b.vx * s * (1 - s * 0.4);
          y = b.to.y + b.vy * s * (1 - s * 0.4);
          r = 14 + s * 10;
          alpha = 1 - age / 750;
          b.spin += dt * 0.03;
        }
        if (alpha <= 0) {
          balls.splice(i, 1);
          continue;
        }
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      if (!b.done) {
        const gy = lerp(b.from.y, b.to.y, 1 - (1 - u) ** 2) + r * 0.6;
        ctx.beginPath();
        ctx.ellipse(x, gy, r, r * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.translate(x, y);
      drawBall(ctx, r, b.spin);
      ctx.restore();
    }
  }

  function drawParticles(now, dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      const age = now - q.t0;
      if (age > q.life) {
        particles.splice(i, 1);
        continue;
      }
      q.vy += 900 * (dt / 1000);
      q.x += q.vx * (dt / 1000);
      q.y += q.vy * (dt / 1000);
      q.rot += dt * 0.01;
      ctx.save();
      ctx.globalAlpha = 1 - age / q.life;
      ctx.translate(q.x, q.y);
      ctx.rotate(q.rot);
      ctx.fillStyle = q.color;
      ctx.fillRect(-7, -4, 14, 8);
      ctx.restore();
    }
  }

  function drawHeadline(now) {
    if (!headline) return;
    const age = now - headline.t0;
    if (age > 1100) {
      headline = null;
      return;
    }
    const pop = age < 160 ? 0.6 + (age / 160) * 0.5 : age < 260 ? 1.1 - ((age - 160) / 100) * 0.1 : 1;
    ctx.save();
    ctx.globalAlpha = age > 850 ? 1 - (age - 850) / 250 : 1;
    ctx.translate(540, 1150);
    ctx.scale(pop, pop);
    ctx.rotate(-0.05);
    ctx.font = '700 130px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 22;
    ctx.strokeStyle = 'rgba(8,14,26,.9)';
    ctx.strokeText(headline.text, 0, 0);
    ctx.fillStyle = headline.color;
    ctx.fillText(headline.text, 0, 0);
    ctx.restore();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(64, now - last);
    last = now;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(field, 0, 0);
    drawGoal(now);
    drawBalls(now, dt, 'net');
    drawPosts();
    drawKeeper(now);
    drawBalls(now, dt, 'air');
    drawPlayers(now);
    drawParticles(now, dt);
    drawHeadline(now);
    while (ripples.length && now - ripples[0].t0 > 900) ripples.shift();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { setTeams, setSprites, setBoard, shot, wave, playerX: (id) => playerOf(id)?.x ?? 0, get board() { return lastBoard; } };
}
