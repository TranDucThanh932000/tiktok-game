import { laneHeight } from './layout.js';

// River objects. Before an object is armed it fades in with a dashed warning ring, so viewers see it coming.
function rock(ctx) {
  ctx.fillStyle = '#868e96';
  ctx.strokeStyle = '#495057';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-26, 6);
  ctx.quadraticCurveTo(-24, -16, -6, -20);
  ctx.quadraticCurveTo(14, -24, 24, -6);
  ctx.quadraticCurveTo(30, 6, 22, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-6, -10, 9, 5, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

function log(ctx) {
  ctx.fillStyle = '#a0522d';
  ctx.strokeStyle = '#5c3317';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-38, -12, 70, 22, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#deb887';
  ctx.beginPath();
  ctx.ellipse(32, -1, 7, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#8b4513';
  ctx.beginPath();
  ctx.ellipse(32, -1, 3, 5, 0, 0, Math.PI * 2);
  ctx.moveTo(-28, -4);
  ctx.lineTo(10, -5);
  ctx.moveTo(-20, 4);
  ctx.lineTo(18, 3);
  ctx.stroke();
}

function whirlpool(ctx, t) {
  ctx.rotate(t * 4);
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,0.85)' : 'rgba(21,101,192,0.7)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 3; a += 0.25) {
      const r = 4 + a * 7;
      ctx.lineTo(Math.cos(a + (i * Math.PI) / 2) * r, Math.sin(a + (i * Math.PI) / 2) * r * 0.55);
    }
    ctx.stroke();
  }
}

function rapids(ctx, t) {
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const off = ((t * 40 + i * 12) % 36) - 18;
    ctx.beginPath();
    ctx.moveTo(off - 8, -20);
    ctx.lineTo(off + 6, 0);
    ctx.lineTo(off - 8, 20);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 34, 22, 0, 0, Math.PI * 2);
  ctx.fill();
}

function seaweed(ctx, t) {
  ctx.strokeStyle = '#2b8a3e';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 10, 10);
    ctx.quadraticCurveTo(i * 10 + Math.sin(t * 3 + i) * 10, -6, i * 12 + Math.sin(t * 3 + i + 1) * 6, -22);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(64,192,87,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, 8, 30, 8, 0, 0, Math.PI * 2);
  ctx.fill();
}

function boost(ctx, t) {
  ctx.fillStyle = 'rgba(102,217,232,0.35)';
  ctx.beginPath();
  ctx.roundRect(-44, -20, 88, 40, 20);
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    const a = (Math.sin(t * 8 - i) + 1) / 2;
    ctx.fillStyle = `rgba(255,255,255,${0.4 + a * 0.6})`;
    ctx.beginPath();
    ctx.moveTo(-26 + i * 20, -14);
    ctx.lineTo(-12 + i * 20, 0);
    ctx.lineTo(-26 + i * 20, 14);
    ctx.lineTo(-20 + i * 20, 0);
    ctx.fill();
  }
}

function coin(ctx, t) {
  const w = Math.abs(Math.cos(t * 4)) * 15 + 2;
  ctx.fillStyle = '#ffd43b';
  ctx.strokeStyle = '#e67700';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, -10, w, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (w > 8) {
    ctx.fillStyle = '#e67700';
    ctx.font = '900 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', 0, -9);
  }
}

function rocket(ctx, t) {
  ctx.rotate(-0.2 + Math.sin(t * 6) * 0.08);
  ctx.fillStyle = '#ff922b';
  ctx.beginPath();
  ctx.moveTo(-24, -6);
  ctx.lineTo(-36 - Math.random() * 8, 0);
  ctx.lineTo(-24, 6);
  ctx.fill();
  ctx.fillStyle = '#fa5252';
  ctx.strokeStyle = '#a61e4d';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-24, -10);
  ctx.lineTo(10, -10);
  ctx.quadraticCurveTo(28, 0, 10, 10);
  ctx.lineTo(-24, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#a5d8ff';
  ctx.beginPath();
  ctx.arc(2, 0, 5, 0, Math.PI * 2);
  ctx.fill();
}

function shield(ctx, t) {
  ctx.fillStyle = 'rgba(116,192,252,0.35)';
  ctx.strokeStyle = '#66d9e8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -10, 22 + Math.sin(t * 5) * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1c7ed6';
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.lineTo(12, -18);
  ctx.quadraticCurveTo(12, -2, 0, 4);
  ctx.quadraticCurveTo(-12, -2, -12, -18);
  ctx.closePath();
  ctx.fill();
}

function starItem(ctx, t) {
  ctx.rotate(Math.sin(t * 3) * 0.3);
  ctx.fillStyle = '#ffe066';
  ctx.strokeStyle = '#f08c00';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 ? 9 : 20;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r - 10);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function rainbowItem(ctx) {
  ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#9775fa'].forEach((color, i) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 28 - i * 4, Math.PI, 0);
    ctx.stroke();
  });
}

const PAINT = { rock, log, whirlpool, waterfall: rapids, seaweed, boost, coin, rocket, shield, star: starItem, rainbow: rainbowItem };
const PICKUPS = new Set(['coin', 'rocket', 'shield', 'star', 'rainbow']);

export function drawObstacles(ctx, items, t, gameTime, { lanes, x: toX, y: toY, scale }) {
  const s = Math.min(1.1, Math.max(0.7, laneHeight(lanes) / 70)) * scale;
  for (const o of items) {
    const paint = PAINT[o.type];
    if (!paint) continue;
    const x = toX(o.pos);
    const y = toY(o.lane) + 6;
    const arming = o.armed > gameTime;
    ctx.save();
    ctx.translate(x, y + (PICKUPS.has(o.type) ? Math.sin(t * 3 + o.id) * 4 : 0));
    ctx.scale(s, s);
    ctx.globalAlpha = arming ? 0.45 : 1;
    if (PICKUPS.has(o.type)) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 12, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    paint(ctx, t);
    ctx.restore();
    if (arming) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - 4, 32 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
