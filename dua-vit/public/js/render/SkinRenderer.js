// Silly things bolted onto a duck. Everything is drawn in duck space (see DuckRenderer: the body spans about
// x -34..33 and y -21..13, the head sits at (18, -34)): "back" goes behind the duck, "front" on top of it.
// Skins only change how a duck looks, never how fast it goes.

// lift: how far above the water it rides. airborne: no feet, no wake. seated: sits in something, so no feet either.
const INFO = {
  helicopter: { lift: 24, airborne: true },
  swan: { lift: 10, airborne: true },
  skateboard: { lift: 14, airborne: true },
  rocket: { lift: 14, airborne: true },
  balloons: { lift: 20, airborne: true },
  basin: { lift: 3, seated: true },
  toilet: { lift: 6, seated: true },
};
const NONE = { lift: 0 };
export const skinInfo = (skin) => INFO[skin] ?? NONE;

function box(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function line(ctx, x1, y1, x2, y2, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function swanWing(ctx, flap, far) {
  ctx.save();
  ctx.translate(-6, -14);
  ctx.rotate(0.55 + flap * 0.55 + (far ? 0.28 : 0));
  ctx.fillStyle = far ? '#dee2e6' : '#ffffff';
  ctx.strokeStyle = '#adb5bd';
  ctx.lineWidth = 2;
  for (let i = 4; i >= 0; i--) {
    ctx.beginPath();
    ctx.ellipse(-20 - i * 11, 5 + i * 3, 21 - i, 7, 0.3 + i * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(-22, -3, 26, 10, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

const BACK = {
  helicopter(ctx, t) {
    // Tail boom and tail rotor.
    line(ctx, -30, -16, -64, -26, 6, '#495057');
    box(ctx, -72, -38, 10, 16, 3, '#e03131');
    ctx.save();
    ctx.translate(-66, -28);
    ctx.rotate(t * 38);
    line(ctx, -13, 0, 13, 0, 3, '#212529');
    ctx.restore();
    // Skids.
    line(ctx, -12, 8, -16, 24, 3.5, '#495057');
    line(ctx, 14, 8, 18, 24, 3.5, '#495057');
    line(ctx, -32, 24, 34, 24, 4, '#343a40');
    line(ctx, 34, 24, 40, 19, 4, '#343a40');
  },
  swan(ctx, t, flap) {
    swanWing(ctx, flap, true);
  },
  rocket(ctx, t) {
    // Flame first, so the rocket sits on top of it.
    const flame = 34 + Math.sin(t * 40) * 8 + Math.sin(t * 67) * 5;
    ctx.fillStyle = '#ff922b';
    ctx.beginPath();
    ctx.moveTo(-70, -36);
    ctx.quadraticCurveTo(-72 - flame, -27, -70, -18);
    ctx.fill();
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.moveTo(-70, -32);
    ctx.quadraticCurveTo(-72 - flame * 0.55, -27, -70, -22);
    ctx.fill();
    ctx.lineWidth = 2.5;
    box(ctx, -72, -38, 48, 22, 10, '#f1f3f5', '#495057');
    ctx.fillStyle = '#e03131';
    ctx.beginPath();
    ctx.moveTo(-34, -37);
    ctx.quadraticCurveTo(-16, -27, -34, -17);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e03131';
    ctx.beginPath();
    ctx.moveTo(-68, -38);
    ctx.lineTo(-78, -48);
    ctx.lineTo(-58, -38);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-68, -16);
    ctx.lineTo(-78, -6);
    ctx.lineTo(-58, -16);
    ctx.closePath();
    ctx.fill();
  },
  outboard(ctx, t) {
    // Shaft and propeller first; the engine sits on the duck's tail.
    box(ctx, -49, -8, 6, 24, 2, '#868e96');
    ctx.fillStyle = 'rgba(52,58,64,0.75)';
    ctx.beginPath();
    ctx.ellipse(-46, 17, 4, Math.abs(Math.cos(t * 42)) * 13 + 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    box(ctx, -58, -36, 24, 30, 6, '#212529', '#000');
    box(ctx, -58, -28, 24, 7, 1, '#e03131');
  },
  basin(ctx) {
    ctx.fillStyle = '#6c757d';
    ctx.strokeStyle = '#ced4da';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(2, -3, 50, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  },
  toilet(ctx, t) {
    // Paper trailing behind in the wind.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(-44, -22);
    for (let i = 1; i <= 6; i++) ctx.lineTo(-44 - i * 9, -22 + i * 1.5 + Math.sin(t * 9 - i * 0.8) * (2 + i * 0.8));
    ctx.stroke();
    // Tank.
    ctx.lineWidth = 2.5;
    box(ctx, -50, -52, 24, 48, 5, '#ffffff', '#adb5bd');
    box(ctx, -54, -58, 32, 8, 3, '#f1f3f5', '#adb5bd');
    line(ctx, -38, -40, -30, -40, 3.5, '#868e96');
  },
  balloons(ctx, t) {
    for (const [i, [x, y, color]] of [[-26, -92, '#ff6b6b'], [6, -106, '#ffd43b'], [34, -88, '#4dabf7']].entries()) {
      const bx = x + Math.sin(t * 2 + i * 2) * 3.5;
      const by = y + Math.sin(t * 2.6 + i) * 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-2, -20);
      ctx.quadraticCurveTo((bx - 2) / 2, (by - 20) / 2 + 6, bx, by + 17);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(bx, by, 13.5, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(bx - 4, by - 6, 3.5, 5.5, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

const FRONT = {
  helicopter(ctx, t) {
    line(ctx, 16, -47, 16, -64, 5, '#495057');
    ctx.fillStyle = 'rgba(52,58,64,0.2)';
    ctx.beginPath();
    ctx.ellipse(16, -65, 62, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const a = Math.cos(t * 36) * 62;
    const b = Math.sin(t * 36) * 62;
    line(ctx, 16 - a, -65, 16 + a, -65, 5, '#212529');
    line(ctx, 16 - b, -65, 16 + b, -65, 3, '#495057');
    ctx.fillStyle = '#e03131';
    ctx.beginPath();
    ctx.arc(16, -65, 4.5, 0, Math.PI * 2);
    ctx.fill();
  },
  swan(ctx, t, flap) {
    swanWing(ctx, flap, false);
    // A small crown: a swan knows what it is worth.
    ctx.fillStyle = '#ffd43b';
    ctx.strokeStyle = '#e67700';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(7, -47);
    ctx.lineTo(5, -59);
    ctx.lineTo(12, -53);
    ctx.lineTo(16, -61);
    ctx.lineTo(20, -53);
    ctx.lineTo(27, -59);
    ctx.lineTo(25, -47);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  },
  skateboard(ctx, t) {
    // A cap on backwards.
    ctx.fillStyle = '#e03131';
    ctx.beginPath();
    ctx.arc(18, -41, 15, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    box(ctx, -8, -44, 16, 5, 2, '#c92a2a');
    // Board and wheels.
    line(ctx, -24, 14, -24, 24, 3, '#868e96');
    line(ctx, 26, 14, 26, 24, 3, '#868e96');
    ctx.strokeStyle = '#e8590c';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-50, 8);
    ctx.quadraticCurveTo(-46, 16, -36, 16);
    ctx.lineTo(38, 16);
    ctx.quadraticCurveTo(48, 16, 52, 8);
    ctx.stroke();
    for (const x of [-24, 26]) {
      ctx.fillStyle = '#ffd43b';
      ctx.strokeStyle = '#343a40';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, 26, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      line(ctx, x - Math.cos(t * 30) * 6, 26 - Math.sin(t * 30) * 6, x + Math.cos(t * 30) * 6, 26 + Math.sin(t * 30) * 6, 2, '#343a40');
    }
  },
  rocket(ctx) {
    // A harness and goggles.
    line(ctx, -26, -22, 6, -8, 4, '#495057');
    line(ctx, 3, -42, 30, -44, 4, '#343a40');
    ctx.fillStyle = 'rgba(130,225,255,0.45)';
    ctx.strokeStyle = '#343a40';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(22, -39, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  },
  outboard(ctx) {
    // A captain's hat.
    box(ctx, 3, -56, 30, 9, 4, '#ffffff', '#adb5bd');
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#adb5bd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(18, -56, 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    box(ctx, 8, -49, 30, 5, 2.5, '#212529');
    ctx.fillStyle = '#fcc419';
    ctx.beginPath();
    ctx.arc(18, -53, 3.2, 0, Math.PI * 2);
    ctx.fill();
  },
  basin(ctx, t) {
    // The aluminium basin, then a paddle working hard.
    const g = ctx.createLinearGradient(-48, 0, 50, 0);
    g.addColorStop(0, '#adb5bd');
    g.addColorStop(0.35, '#f8f9fa');
    g.addColorStop(0.7, '#ced4da');
    g.addColorStop(1, '#868e96');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#6c757d';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-48, -3);
    ctx.quadraticCurveTo(-42, 20, -26, 21);
    ctx.lineTo(28, 21);
    ctx.quadraticCurveTo(44, 20, 52, -3);
    ctx.quadraticCurveTo(2, 12, -48, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.translate(-4, -12);
    ctx.rotate(0.55 + Math.sin(t * 8) * 0.55);
    line(ctx, 0, -6, 0, 40, 4, '#8d5524');
    ctx.fillStyle = '#a0692f';
    ctx.beginPath();
    ctx.ellipse(0, 44, 6.5, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  toilet(ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#adb5bd';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-34, -6);
    ctx.lineTo(38, -6);
    ctx.quadraticCurveTo(40, 14, 14, 18);
    ctx.lineTo(8, 27);
    ctx.lineTo(-14, 27);
    ctx.lineTo(-18, 18);
    ctx.quadraticCurveTo(-36, 14, -34, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    box(ctx, -38, -10, 80, 7, 3.5, '#f1f3f5', '#adb5bd');
  },
  shades(ctx, t) {
    // Sunglasses.
    line(ctx, 3, -40, 12, -40, 3, '#111');
    box(ctx, 10, -46, 26, 12, 4, '#111');
    line(ctx, 15, -43, 21, -43, 2, 'rgba(255,255,255,0.75)');
    // A very thick gold chain.
    ctx.strokeStyle = '#fcc419';
    ctx.lineWidth = 4;
    ctx.setLineDash([4, 2]);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.ellipse(14, -19, 15, 9, 0, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd43b';
    ctx.strokeStyle = '#e67700';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(14, -6, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e67700';
    ctx.font = '900 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 14, -5.5);
    // Bling.
    const shine = Math.max(0, Math.sin(t * 5));
    ctx.fillStyle = `rgba(255,255,255,${shine})`;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 1.2 : 5.5 * shine;
      ctx.lineTo(19 + Math.cos((i * Math.PI) / 4) * r, -10 + Math.sin((i * Math.PI) / 4) * r);
    }
    ctx.fill();
  },
  conicalHat(ctx) {
    // A checked scarf, then the hat.
    box(ctx, 4, -24, 28, 10, 3, '#ffffff', '#343a40');
    ctx.fillStyle = '#343a40';
    for (let x = 6; x < 30; x += 6) {
      ctx.fillRect(x, -22, 3, 3);
      ctx.fillRect(x + 3, -19, 3, 3);
    }
    line(ctx, 30, -44, 24, -24, 1.5, '#8d5524');
    ctx.fillStyle = '#e9c46a';
    ctx.strokeStyle = '#a97c2f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, -44);
    ctx.lineTo(18, -74);
    ctx.lineTo(46, -44);
    ctx.quadraticCurveTo(18, -38, -10, -44);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(140,100,30,0.55)';
    ctx.lineWidth = 1.5;
    for (const k of [0.3, 0.55, 0.8]) {
      ctx.beginPath();
      ctx.moveTo(18 - 28 * k, -74 + 30 * k);
      ctx.quadraticCurveTo(18, -72 + 34 * k, 18 + 28 * k, -74 + 30 * k);
      ctx.stroke();
    }
  },
};

export function drawSkinBack(ctx, skin, t, flap = 0) {
  BACK[skin]?.(ctx, t, flap);
}

export function drawSkinFront(ctx, skin, t, flap = 0) {
  FRONT[skin]?.(ctx, t, flap);
}
