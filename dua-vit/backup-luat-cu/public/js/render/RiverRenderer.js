import { BANK_BOTTOM, BANK_TOP, FONT, RIVER, TRACK, WATER, laneHeight, outlinedText, roundRect } from './layout.js';

// The river: banks, moving water, lane ropes, start and finish, plus the big community scenes
// (wind, tsunami, cheering stands, gift storm). Static art is painted once into offscreen canvases.
const rand = (seed) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};

function offscreen(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  return c;
}

function tree(ctx, x, y, s, r) {
  ctx.fillStyle = '#7a4b2a';
  roundRect(ctx, x - 5 * s, y - 8 * s, 10 * s, 26 * s, 4 * s);
  ctx.fill();
  const greens = ['#2f9e44', '#37b24d', '#40c057'];
  [[0, -26, 22], [-14, -14, 17], [14, -14, 17], [0, -40, 15]].forEach(([dx, dy, rad], i) => {
    ctx.fillStyle = greens[(i + Math.floor(r * 3)) % 3];
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, rad * s, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(x - 6 * s, y - 32 * s, 7 * s, 0, Math.PI * 2);
  ctx.fill();
}

function bush(ctx, x, y, s, flowers) {
  ctx.fillStyle = '#2b8a3e';
  for (const [dx, rad] of [[-10, 10], [0, 13], [11, 9]]) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y, rad * s, 0, Math.PI * 2);
    ctx.fill();
  }
  if (flowers) {
    for (const [dx, dy, color] of [[-8, -4, '#ff6b9a'], [4, -8, '#ffd43b'], [10, 0, '#ffffff']]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + dx * s, y + dy * s, 3 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function reeds(ctx, x, y, s) {
  ctx.strokeStyle = '#5c940d';
  ctx.lineWidth = 3 * s;
  ctx.lineCap = 'round';
  for (const [dx, h, lean] of [[-6, 26, -4], [0, 34, 2], [6, 24, 5]]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * s, y);
    ctx.quadraticCurveTo(x + (dx + lean / 2) * s, y - (h / 2) * s, x + (dx + lean) * s, y - h * s);
    ctx.stroke();
  }
  ctx.fillStyle = '#8d5524';
  roundRect(ctx, x - 2 * s, y - 34 * s, 5 * s, 12 * s, 3 * s);
  ctx.fill();
}

// A bank painted into its own canvas: grass, a sandy wavy shore towards the water (transparent beyond it),
// then trees, bushes and reeds.
function bankArt(top) {
  const h = (top ? BANK_TOP : BANK_BOTTOM) + 12;
  return offscreen(RIVER.w, h, (ctx, w) => {
    const r = rand(top ? 7 : 13);
    const edge = (x, inset) => (top ? h - 8 - inset - Math.sin(x / 47) * 4 : 8 + inset + Math.sin(x / 47) * 4);
    const shape = (inset) => {
      ctx.beginPath();
      ctx.moveTo(0, top ? 0 : h);
      ctx.lineTo(w, top ? 0 : h);
      for (let x = w; x >= 0; x -= 10) ctx.lineTo(x, edge(x, inset));
      ctx.closePath();
    };
    shape(0);
    ctx.fillStyle = '#ffe8a3';
    ctx.fill();
    shape(14);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top ? '#51cf66' : '#8ce99a');
    g.addColorStop(1, top ? '#8ce99a' : '#51cf66');
    ctx.fillStyle = g;
    ctx.fill();
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = r() > 0.5 ? 'rgba(47,158,68,0.35)' : 'rgba(255,255,255,0.18)';
      ctx.fillRect(r() * w, top ? r() * (h - 30) : 26 + r() * (h - 30), 3, 6);
    }
    const baseY = top ? h - 26 : h - 6;
    for (let x = 20; x < w; x += 70 + r() * 60) {
      const kind = r();
      if (top && kind < 0.35) tree(ctx, x, baseY - 4, 0.8, r());
      else if (kind < 0.75) bush(ctx, x, top ? baseY : h - 16, top ? 1 : 0.9, r() > 0.4);
      else reeds(ctx, x, top ? h - 14 : 30, 0.85);
    }
  });
}

function waterTile() {
  return offscreen(256, 256, (ctx) => {
    const r = rand(42);
    for (let i = 0; i < 26; i++) {
      const x = r() * 256;
      const y = r() * 256;
      const rad = 14 + r() * 30;
      for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        g.addColorStop(0, 'rgba(255,255,255,0.10)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, rad * 1.6, rad * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

export class RiverRenderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.top = bankArt(true);
    this.bottom = bankArt(false);
    this.tile = ctx.createPattern(waterTile(), 'repeat');
    const r = rand(99);
    this.waves = Array.from({ length: 110 }, () => ({ x: r() * RIVER.w, y: WATER.y + 10 + r() * (WATER.h - 20), len: 14 + r() * 26, ph: r() * 6 }));
    this.flow = 0;
    this.crowd = Array.from({ length: 70 }, (_, i) => ({ x: 14 + i * 21 + r() * 6, hue: Math.floor(r() * 360), ph: r() * 6 }));
  }

  draw(t, dt, scene) {
    const ctx = this.ctx;
    const speed = scene.sprint ? 70 : 38;
    this.flow += dt * speed * (scene.wind ? 2.2 : 1);

    // Water body.
    const g = ctx.createLinearGradient(0, WATER.y, 0, WATER.y + WATER.h);
    if (scene.sprint) {
      g.addColorStop(0, '#22b8cf');
      g.addColorStop(0.5, '#1098ad');
      g.addColorStop(1, '#0c8599');
    } else {
      g.addColorStop(0, '#4dc4ea');
      g.addColorStop(0.5, '#2fa8d8');
      g.addColorStop(1, '#2290c4');
    }
    ctx.fillStyle = g;
    ctx.fillRect(RIVER.x, WATER.y - 6, RIVER.w, WATER.h + 12);
    ctx.save();
    ctx.translate(this.flow % 256, Math.sin(t * 0.6) * 6);
    ctx.fillStyle = this.tile;
    ctx.fillRect(-256, WATER.y - 20, RIVER.w + 512, WATER.h + 40);
    ctx.restore();

    // Ripple marks drifting downstream.
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const w of this.waves) {
      w.x += dt * speed * (scene.wind ? 2.4 : 1.2);
      if (w.x > RIVER.w + 40) w.x = -40;
      const y = w.y + Math.sin(t * 2 + w.ph) * 3;
      const a = (Math.sin(t * 1.5 + w.ph) + 1) / 2;
      const len = w.len * (0.6 + a * 0.4);
      ctx.moveTo(w.x - len, y);
      ctx.quadraticCurveTo(w.x, y - 5, w.x + len, y);
    }
    ctx.stroke();

    this.drawLaneRopes(t, scene.lanes);
    this.drawMarkers(scene);

    // Banks with foam along the waterline.
    ctx.drawImage(this.top, 0, RIVER.y);
    ctx.drawImage(this.bottom, 0, WATER.y + WATER.h - 12);
    this.drawFoam(t, WATER.y + 4, 1);
    this.drawFoam(t, WATER.y + WATER.h - 4, -1);

    if (scene.cheer > 0) this.drawStands(t, scene.cheer);
    this.drawStartFinish(t);
    if (scene.storm > 0) this.drawStorm(t, scene.storm);
    if (scene.wind > 0) this.drawWind(t, scene.wind);
  }

  drawFoam(t, y, dir) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= RIVER.w; x += 16) ctx.lineTo(x, y + dir * (4 + Math.sin(x / 30 + t * 2.4) * 3 + Math.sin(x / 11 - t * 3) * 1.5));
    ctx.lineTo(RIVER.w, y - dir * 4);
    ctx.lineTo(0, y - dir * 4);
    ctx.fill();
  }

  drawLaneRopes(t, lanes) {
    if (lanes > 14) return;
    const ctx = this.ctx;
    const lh = laneHeight(lanes);
    for (let i = 1; i < lanes; i++) {
      const y = WATER.y + i * lh;
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(TRACK.start - 30, y);
      ctx.lineTo(TRACK.end + 30, y);
      ctx.stroke();
      for (let x = TRACK.start - 20, k = 0; x < TRACK.end + 30; x += 46, k++) {
        ctx.fillStyle = k % 2 ? 'rgba(255,255,255,0.85)' : 'rgba(255,107,107,0.85)';
        ctx.beginPath();
        ctx.ellipse(x, y + Math.sin(t * 2 + x / 60 + i) * 1.5, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawMarkers(scene) {
    const ctx = this.ctx;
    for (const f of [0.25, 0.5, 0.75]) {
      const x = TRACK.start + (TRACK.end - TRACK.start) * f;
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.setLineDash([10, 12]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, WATER.y + 8);
      ctx.lineTo(x, WATER.y + WATER.h - 8);
      ctx.stroke();
      ctx.setLineDash([]);
      const y = WATER.y + WATER.h + 26;
      ctx.fillStyle = '#fff3bf';
      roundRect(ctx, x - 34, y - 14, 68, 28, 8);
      ctx.fill();
      ctx.strokeStyle = '#8d5524';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#8d5524';
      ctx.font = `800 18px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(scene.meters * f)}m`, x, y + 1);
    }
  }

  drawStartFinish(t) {
    const ctx = this.ctx;
    const check = (x, w) => {
      const size = 14;
      for (let y = WATER.y, row = 0; y < WATER.y + WATER.h; y += size, row++) {
        for (let c = 0; c < Math.ceil(w / size); c++) {
          ctx.fillStyle = (row + c) % 2 ? 'rgba(255,255,255,0.85)' : 'rgba(33,37,41,0.75)';
          ctx.fillRect(x + c * size, y, size, Math.min(size, WATER.y + WATER.h - y));
        }
      }
    };
    check(TRACK.start - 34, 14);
    check(TRACK.end, 28);
    // Finish arch banner on the top bank.
    const x = TRACK.end + 14;
    ctx.fillStyle = '#e03131';
    roundRect(ctx, x - 6, RIVER.y + 2, 12, BANK_TOP + 10, 4);
    ctx.fill();
    const wave = Math.sin(t * 3) * 3;
    ctx.fillStyle = '#ffd43b';
    ctx.strokeStyle = '#c92a2a';
    ctx.lineWidth = 4;
    roundRect(ctx, x - 64, RIVER.y + 6 + wave, 128, 40, 12);
    ctx.fill();
    ctx.stroke();
    outlinedText(ctx, 'ĐÍCH', x, RIVER.y + 27 + wave, { size: 28, fill: '#c92a2a', stroke: '#fff', line: 5 });
    // Start flag.
    const sx = TRACK.start - 27;
    ctx.fillStyle = '#495057';
    ctx.fillRect(sx - 3, RIVER.y + 8, 6, BANK_TOP - 4);
    ctx.fillStyle = '#20c997';
    ctx.beginPath();
    ctx.moveTo(sx + 3, RIVER.y + 10);
    ctx.quadraticCurveTo(sx + 40, RIVER.y + 16 + Math.sin(t * 4) * 5, sx + 70, RIVER.y + 14);
    ctx.lineTo(sx + 70, RIVER.y + 44);
    ctx.quadraticCurveTo(sx + 40, RIVER.y + 46 + Math.sin(t * 4 + 1) * 5, sx + 3, RIVER.y + 40);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `800 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('XUẤT PHÁT', sx + 37, RIVER.y + 28);
  }

  drawStands(t, k) {
    const ctx = this.ctx;
    const rise = Math.min(1, k * 3);
    for (const [y0, dir] of [[RIVER.y + 6, 1], [WATER.y + WATER.h + 8, 1]]) {
      ctx.save();
      ctx.globalAlpha = rise;
      ctx.fillStyle = 'rgba(134,46,156,0.85)';
      roundRect(ctx, 0, y0 + (1 - rise) * 40, RIVER.w, 44, 10);
      ctx.fill();
      for (const p of this.crowd) {
        const jump = Math.abs(Math.sin(t * 7 + p.ph)) * 9 * dir;
        const y = y0 + 26 - jump + (1 - rise) * 40;
        ctx.fillStyle = `hsl(${p.hue} 70% 55%)`;
        roundRect(ctx, p.x * (RIVER.w / 1490) - 8, y, 16, 18, 6);
        ctx.fill();
        ctx.fillStyle = '#ffd8a8';
        ctx.beginPath();
        ctx.arc(p.x * (RIVER.w / 1490), y - 6, 8, 0, Math.PI * 2);
        ctx.fill();
        if ((p.hue | 0) % 3 === 0) {
          ctx.strokeStyle = `hsl(${(p.hue + 180) % 360} 80% 60%)`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(p.x + 6, y);
          ctx.lineTo(p.x + 14, y - 22 - jump);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  drawStorm(t, k) {
    const ctx = this.ctx;
    const a = Math.min(1, k * 2) * (0.22 + Math.sin(t * 5) * 0.05);
    const g = ctx.createLinearGradient(0, RIVER.y, 0, RIVER.y + RIVER.h);
    g.addColorStop(0, `rgba(132, 94, 247, ${a * 1.6})`);
    g.addColorStop(0.5, `rgba(255, 146, 43, ${a * 0.6})`);
    g.addColorStop(1, `rgba(247, 131, 172, ${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(RIVER.x, RIVER.y, RIVER.w, RIVER.h);
  }

  drawWind(t, k) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 2) * 0.5;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const y = WATER.y + ((i * 97) % WATER.h);
      const x = ((t * 900 + i * 233) % (RIVER.w + 400)) - 200;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 60, y - 10, x + 120, y + 10, x + 180, y - 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  // The tsunami front sweeps left to right over ~2.6 s.
  drawTsunami(progress) {
    if (progress <= 0 || progress >= 1) return;
    const ctx = this.ctx;
    const front = -200 + progress * (RIVER.w + 500);
    const top = WATER.y - 30;
    const bottom = WATER.y + WATER.h + 20;
    ctx.save();
    const body = ctx.createLinearGradient(front - 320, 0, front, 0);
    body.addColorStop(0, 'rgba(25, 113, 194, 0)');
    body.addColorStop(0.7, 'rgba(25, 113, 194, 0.55)');
    body.addColorStop(1, 'rgba(165, 216, 255, 0.95)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(front - 320, top);
    for (let y = top; y <= bottom; y += 20) ctx.lineTo(front + Math.sin(y / 40 + progress * 20) * 22, y);
    ctx.lineTo(front - 320, bottom);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let y = top; y <= bottom; y += 20) ctx.lineTo(front + 6 + Math.sin(y / 40 + progress * 20) * 22, y);
    ctx.stroke();
    ctx.restore();
  }
}
