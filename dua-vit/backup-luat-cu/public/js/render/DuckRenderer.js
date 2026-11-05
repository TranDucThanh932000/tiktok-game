import { FONT, roundRect } from './layout.js';

// Procedural cartoon ducks. The body, head, eye and beak are painted once per colour into a sprite; the wing,
// paddling feet, ripples and every buff effect are drawn live so the duck is always animated.
const SPRITE_SCALE = 2;
const SW = 96;
const SH = 84;
const OX = 44;
const OY = 58;

export const duckColors = (hue) => ({
  body: `hsl(${hue} 85% 63%)`,
  shade: `hsl(${hue} 72% 47%)`,
  line: `hsl(${hue} 60% 26%)`,
  belly: `hsl(${hue} 95% 80%)`,
});

function bodyPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-34, -21);
  ctx.quadraticCurveTo(-31, -6, -24, 2);
  ctx.bezierCurveTo(-14, 13, 16, 13, 27, 0);
  ctx.bezierCurveTo(33, -9, 26, -20, 13, -20);
  ctx.bezierCurveTo(0, -18, -16, -13, -24, -16);
  ctx.quadraticCurveTo(-30, -18, -34, -21);
  ctx.closePath();
}

function paintDuck(ctx, hue) {
  const c = duckColors(hue);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = c.line;
  bodyPath(ctx);
  ctx.fillStyle = c.body;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = c.belly;
  ctx.beginPath();
  ctx.ellipse(6, -2, 17, 6, -0.1, 0, Math.PI * 2);
  ctx.fill();
  // Head.
  ctx.beginPath();
  ctx.arc(18, -34, 15, 0, Math.PI * 2);
  ctx.fillStyle = c.body;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = c.body;
  ctx.fillRect(9, -24, 16, 8);
  // Tuft.
  ctx.beginPath();
  ctx.moveTo(12, -47);
  ctx.quadraticCurveTo(10, -58, 18, -56);
  ctx.quadraticCurveTo(14, -52, 17, -48);
  ctx.fillStyle = c.shade;
  ctx.fill();
  // Beak.
  ctx.fillStyle = '#ff922b';
  ctx.strokeStyle = '#c2410c';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(29, -38);
  ctx.quadraticCurveTo(46, -38, 46, -32);
  ctx.quadraticCurveTo(40, -29, 29, -30);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(30, -31);
  ctx.quadraticCurveTo(41, -30, 43, -28);
  ctx.quadraticCurveTo(36, -25, 30, -27);
  ctx.fillStyle = '#fd7e14';
  ctx.fill();
  ctx.stroke();
  // Eye with shine, cheek blush.
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(22, -39, 6, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#212529';
  ctx.beginPath();
  ctx.arc(23.5, -38.5, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(24.8, -40, 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 120, 150, 0.55)';
  ctx.beginPath();
  ctx.ellipse(15, -29, 4.5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

const sprites = new Map();
export function duckSprite(hue) {
  let c = sprites.get(hue);
  if (!c) {
    c = document.createElement('canvas');
    c.width = SW * SPRITE_SCALE;
    c.height = SH * SPRITE_SCALE;
    const ctx = c.getContext('2d');
    ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
    ctx.translate(OX, OY);
    paintDuck(ctx, hue);
    sprites.set(hue, c);
  }
  return c;
}

let glowSprite;
function glow() {
  if (!glowSprite) {
    glowSprite = document.createElement('canvas');
    glowSprite.width = glowSprite.height = 128;
    const ctx = glowSprite.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,240,140,0.95)');
    g.addColorStop(0.45, 'rgba(255,212,59,0.45)');
    g.addColorStop(1, 'rgba(255,212,59,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return glowSprite;
}

// Name pill, painted once per duck and reused every frame.
export function makeLabel(name, hue, test) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = `800 30px ${FONT}`;
  ctx.font = font;
  const text = Array.from(name).slice(0, 16).join('');
  const tag = test ? 'TEST' : '';
  ctx.font = `800 18px ${FONT}`;
  const tagW = tag ? ctx.measureText(tag).width + 14 : 0;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width + 30 + tagW);
  c.width = w + 8;
  c.height = 50;
  ctx.font = font;
  roundRect(ctx, 4, 4, w, 40, 20);
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = `hsl(${hue} 70% 45%)`;
  ctx.stroke();
  ctx.fillStyle = '#212529';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, 19, 25);
  if (tag) {
    const x = 19 + ctx.measureText(text).width + 6;
    ctx.fillStyle = '#ff922b';
    roundRect(ctx, x, 13, tagW - 6, 24, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `800 16px ${FONT}`;
    ctx.fillText(tag, x + 4, 26);
  }
  return { canvas: c, w: c.width, h: c.height };
}

function bolt(ctx, x, y, s, color = '#ffd43b') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(2, -14);
  ctx.lineTo(-7, 2);
  ctx.lineTo(0, 2);
  ctx.lineTo(-3, 14);
  ctx.lineTo(8, -3);
  ctx.lineTo(1, -3);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#e67700';
  ctx.stroke();
  ctx.restore();
}

function star(ctx, x, y, r, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rad = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function angelWing(ctx, flap, front) {
  ctx.save();
  ctx.translate(-6, -16);
  ctx.rotate(-0.5 - flap * 0.6);
  ctx.fillStyle = front ? '#ffffff' : '#e7f5ff';
  ctx.strokeStyle = '#74c0fc';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(-10 - i * 7, -6 - i * 5, 20 - i * 2, 7, -0.5 - i * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// d: { hue, x, y, scale, anim, flags, mult, energy, combo, tier, label, place, finished, test }
export function drawDuck(ctx, d, t, F) {
  const s = d.scale;
  const flying = d.flags & F.WINGS;
  const slowed = d.flags & F.SLOW;
  const turbo = d.flags & (F.ENERGY_TURBO | F.TURBO | F.COMBO_TURBO | F.ROCKET | F.BOOST_ZONE);
  const superTurbo = d.flags & F.SUPER_TURBO;
  const rainbow = d.flags & F.RAINBOW_BOOST;
  const flap = Math.sin(d.anim);
  const bob = Math.sin(d.anim * 0.5) * 2.2 * s;
  const lift = flying ? (16 + Math.sin(t * 4) * 4) * s : 0;
  const x = d.x;
  const y = d.y + bob - lift;

  ctx.save();
  // Trails behind the duck.
  if (rainbow) {
    const colors = ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#9775fa'];
    colors.forEach((color, i) => {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 5 * s;
      ctx.beginPath();
      const yy = y - 26 * s + i * 5 * s;
      ctx.moveTo(x - 30 * s, yy);
      for (let k = 1; k <= 8; k++) ctx.lineTo(x - 30 * s - k * 22 * s, yy + Math.sin(t * 8 - k * 0.8) * 4 * s);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
  if (turbo || superTurbo) {
    ctx.strokeStyle = superTurbo ? 'rgba(255,120,40,0.85)' : 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3 * s;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const yy = y - (6 + i * 9) * s;
      const len = (40 + ((t * 300 + i * 37) % 50)) * s * (d.mult > 1.15 ? 1.4 : 1);
      ctx.beginPath();
      ctx.moveTo(x - 36 * s, yy);
      ctx.lineTo(x - 36 * s - len, yy);
      ctx.stroke();
    }
  }
  // Wake.
  if (!flying && d.racing) {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2.5 * s;
    const spread = (6 + (d.mult - 1) * 30) * s;
    for (const k of [1, 2]) {
      ctx.beginPath();
      ctx.moveTo(x - 26 * s * k, y + 2 * s - spread * k * 0.4);
      ctx.quadraticCurveTo(x - 20 * s, y + 4 * s, x - 26 * s * k, y + 8 * s + spread * k * 0.4);
      ctx.stroke();
    }
  }
  if ((d.flags & F.ENERGY_TURBO) || superTurbo) {
    const r = (46 + d.tier * 8) * s * (1 + Math.sin(t * 10) * 0.06);
    ctx.globalAlpha = 0.45 + d.tier * 0.1;
    ctx.drawImage(glow(), x - r, y - 22 * s - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }
  if (flying) {
    ctx.fillStyle = 'rgba(0,40,80,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, d.y + 6 * s, 30 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.translate(x, y);
  ctx.scale(s, s);
  const tilt = slowed ? -0.18 + Math.sin(t * 9) * 0.06 : d.racing ? Math.min(0.12, (d.mult - 1) * 0.6) : 0;
  ctx.rotate(tilt);
  const c = duckColors(d.hue);

  if (!flying) {
    // Paddling feet under the surface.
    ctx.fillStyle = 'rgba(255,146,43,0.65)';
    for (const ph of [0, Math.PI]) {
      const k = Math.sin(d.anim + ph);
      ctx.beginPath();
      ctx.ellipse(-4 + k * 8, 13 + Math.abs(k) * 2, 7, 3, k * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (flying) angelWing(ctx, flap, false);
  ctx.drawImage(duckSprite(d.hue), -OX, -OY, SW, SH);
  // Wing.
  ctx.save();
  ctx.translate(-6, -9);
  ctx.rotate(-0.25 - flap * 0.35);
  ctx.fillStyle = c.shade;
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(-2, 0, 16, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-12, 1);
  ctx.lineTo(4, -1);
  ctx.moveTo(-10, 5);
  ctx.lineTo(4, 3);
  ctx.stroke();
  ctx.restore();
  if (flying) angelWing(ctx, flap, true);
  if (!flying) {
    // The water hides the bottom of the body.
    ctx.fillStyle = 'rgba(56, 170, 220, 0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 9, 38, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 6 + Math.sin(t * 3 + d.hue) * 0.8, 37 + Math.sin(d.anim) * 2, 5.5, 0, Math.PI * 0.05, Math.PI * 0.95);
    ctx.stroke();
  }
  ctx.rotate(-tilt);
  if (d.flags & F.SHIELD) {
    const pulse = 1 + Math.sin(t * 5) * 0.04;
    ctx.strokeStyle = 'rgba(102, 217, 255, 0.95)';
    ctx.fillStyle = 'rgba(165, 216, 255, 0.22)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(4, -20, 50 * pulse, 42 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(4, -20, 36, Math.PI * 1.1, Math.PI * 1.4);
    ctx.stroke();
  }
  if (slowed) {
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + (i * Math.PI * 2) / 3;
      star(ctx, 18 + Math.cos(a) * 18, -58 + Math.sin(a) * 6, 6, '#ffe066');
    }
  }
  if (turbo || superTurbo) bolt(ctx, -26, -46, 1.1, superTurbo ? '#ff8787' : '#ffd43b');
  if (d.finished) {
    ctx.fillStyle = '#ffd43b';
    ctx.strokeStyle = '#e67700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, -50);
    ctx.lineTo(9, -62);
    ctx.lineTo(15, -54);
    ctx.lineTo(20, -64);
    ctx.lineTo(25, -54);
    ctx.lineTo(31, -62);
    ctx.lineTo(32, -50);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// Drawn in a second pass, after every duck, so a name is never hidden behind the duck in the lane below.
export function drawDuckLabel(ctx, d, t, F, minY) {
  if (!d.label) return;
  const s = d.scale;
  const slowed = d.flags & F.SLOW;
  const lift = d.flags & F.WINGS ? 18 * s : 0;
  const x = d.x;
  const ls = Math.max(0.5, Math.min(0.85, s * 0.82));
  const lw = d.label.w * ls;
  const lh = d.label.h * ls;
  const lx = x - lw / 2 + 6 * s;
  const ly = Math.max(minY + (d.combo >= 2 ? 22 * ls : 0), d.y - lift - 70 * s - lh - (slowed ? 6 : 0));
  ctx.drawImage(d.label.canvas, lx, ly, lw, lh);
  if (d.place && d.place <= 3) {
    const medal = ['#ffd43b', '#ced4da', '#e8590c'][d.place - 1];
    ctx.fillStyle = medal;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(lx + 2, ly + lh / 2, 14 * ls, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#212529';
    ctx.font = `900 ${18 * ls}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(d.place), lx + 2, ly + lh / 2 + 1);
  }
  // Energy bar.
  const bw = Math.max(46, Math.min(lw - 16, 90 * ls));
  const bx = x - bw / 2 + 6 * s;
  const by = ly + lh - 2;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, bx, by, bw, 8, 4);
  ctx.fill();
  if (d.energy > 0) {
    const e = Math.min(1, d.energy / 100);
    ctx.fillStyle = e >= 0.25 ? '#ffd43b' : '#74c0fc';
    roundRect(ctx, bx, by, bw * e, 8, 4);
    ctx.fill();
  }
  if (d.combo >= 2) {
    ctx.font = `900 ${22 * ls}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#862e9c';
    const cx = x + 6 * s;
    const cy = ly - 2 + Math.sin(t * 8) * 2;
    ctx.strokeText(`COMBO x${d.combo}`, cx, cy);
    ctx.fillStyle = '#ffec99';
    ctx.fillText(`COMBO x${d.combo}`, cx, cy);
  }
}
