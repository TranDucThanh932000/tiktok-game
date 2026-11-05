// Fixed 1920×1080 stage; the canvas is scaled as a whole to whatever window or OBS source it lives in.
export const W = 1920;
export const H = 1080;

export const HEADER = { x: 0, y: 0, w: W, h: 96 };
export const RIVER = { x: 0, y: 96, w: 1490, h: 808 };
export const BANK_TOP = 66;
export const BANK_BOTTOM = 52;
export const WATER = { x: 0, y: RIVER.y + BANK_TOP, w: RIVER.w, h: RIVER.h - BANK_TOP - BANK_BOTTOM };
export const TRACK = { start: 130, end: 1385 };
export const BOARD = { x: 1500, y: 104, w: 410, h: 792 };
export const BAR = { x: 10, y: 912, w: W - 20, h: 160 };

export const laneHeight = (lanes) => WATER.h / lanes;
export const laneY = (lane, lanes) => WATER.y + (lane + 0.5) * laneHeight(lanes);
export const trackX = (pos, track) => TRACK.start + (Math.max(0, Math.min(pos, track)) / track) * (TRACK.end - TRACK.start);

export const FONT = '"Baloo 2", "Segoe UI", Arial, sans-serif';

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Text that shrinks to fit a width instead of overflowing.
export function fitText(ctx, text, x, y, maxWidth, size, weight = 800) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (s > 10 && ctx.measureText(text).width > maxWidth) {
    s -= 1;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  ctx.fillText(text, x, y);
}

export function outlinedText(ctx, text, x, y, { size = 40, fill = '#fff', stroke = '#1d3557', line = 8, weight = 900, align = 'center', baseline = 'middle' } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.lineJoin = 'round';
  ctx.lineWidth = line;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export const fmtInt = (n) => Math.round(n).toLocaleString('vi-VN');
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutBack = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
