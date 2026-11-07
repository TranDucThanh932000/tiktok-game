import { TIMING } from './rules.js';

export function coverRect(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new RangeError('Invalid image size.');
  const size = Math.min(width, height);
  return { x: (width - size) / 2, y: (height - size) / 2, size };
}

export function makeBeads(pixels, columns) {
  if (!Number.isInteger(columns) || columns < 1 || pixels.length !== columns * columns * 4) throw new RangeError('Pixel data does not match the grid.');
  const beads = [];
  for (let row = columns - 1; row >= 0; row -= 1) {
    for (let step = 0; step < columns; step += 1) {
      const col = row % 2 ? columns - step - 1 : step;
      const index = (row * columns + col) * 4;
      const alpha = pixels[index + 3] / 255;
      const color = [0, 1, 2].map(channel => Math.round(pixels[index + channel] * alpha + 250 * (1 - alpha)));
      beads.push({ col, row, color, x: 22 + (col + .5) * 300 / columns, y: 62 + (row + .5) * 300 / columns });
    }
  }
  return beads;
}

export function imageUrl(value) {
  if (!value) return '';
  if (/^\/avatars\/[a-z]+\.svg$/.test(value) || /^\/sample-avatar\/\d+\.svg$/.test(value) || /^\/samples\/[^/]+$/.test(value) || /^data:image\/(jpeg|png|webp);base64,/.test(value)) return value;
  return `/api/avatar?url=${encodeURIComponent(value)}`;
}

function makeCanvas(width, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export async function loadImage(source) {
  if (!source) throw new Error('No photo from TikTok.');
  if (/^(data:image\/|blob:)/.test(source)) {
    const image = new Image();
    image.src = source;
    await image.decode();
    return image;
  }
  const response = await fetch(source, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    const detail = contentType.includes('application/json') ? (await response.json()).error : '';
    throw new Error(detail || `Image failed (${response.status}).`);
  }
  const url = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function placeholder(name) {
  const canvas = makeCanvas(256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#dfcfaa';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#657e6b';
  ctx.font = 'bold 105px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Array.from(name.trim()).slice(0, 2).join('').toUpperCase(), 128, 134);
  return canvas;
}

export class PortraitRenderer {
  constructor(canvas, onError) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onError = onError;
    this.jobId = undefined;
    this.ready = false;
    this.settled = 0;
    this.layer = makeCanvas(688, 740);
    this.layerCtx = this.layer.getContext('2d');
    this.layerCtx.scale(2, 2);
    this.ctx.scale(2, 2);
    this.idle();
  }

  idle() {
    const source = makeCanvas(240);
    const ctx = source.getContext('2d');
    ctx.fillStyle = '#eee9d5';
    ctx.fillRect(0, 0, 240, 240);
    ctx.fillStyle = '#d3918c';
    ctx.beginPath();
    ctx.moveTo(120, 190);
    ctx.bezierCurveTo(80, 161, 37, 128, 48, 92);
    ctx.bezierCurveTo(59, 56, 98, 59, 120, 85);
    ctx.bezierCurveTo(141, 59, 181, 56, 193, 92);
    ctx.bezierCurveTo(205, 128, 162, 161, 120, 190);
    ctx.fill();
    this.prepare(source, 24);
    this.paint(TIMING.drawMs);
    this.canvas.dataset.mode = 'sample';
  }

  async setJob(job) {
    const id = job?.id ?? null;
    if (id === this.jobId) return;
    this.jobId = id;
    this.ready = false;
    this.canvas.dataset.status = 'loading';
    if (!job) {
      this.idle();
      return;
    }
    this.ctx.clearRect(0, 0, 344, 370);
    let image;
    try {
      image = await loadImage(imageUrl(job.viewer.avatar));
    } catch (error) {
      if (this.jobId !== id) return;
      image = placeholder(job.viewer.nickname);
      this.onError(`${error.message} Initials only.`);
    }
    if (this.jobId !== id) return;
    this.prepare(image, job.quality.columns);
    this.canvas.dataset.mode = 'portrait';
  }

  prepare(image, columns) {
    const sample = makeCanvas(columns);
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    const rect = coverRect(image.naturalWidth || image.width, image.naturalHeight || image.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, rect.x, rect.y, rect.size, rect.size, 0, 0, columns, columns);
    this.beads = makeBeads(ctx.getImageData(0, 0, columns, columns).data, columns);
    this.cell = 300 / columns;
    this.spriteSize = Math.ceil(this.cell * 2) + 2;
    this.atlas = makeCanvas(columns * this.spriteSize);
    const atlas = this.atlas.getContext('2d');
    this.beads.forEach((bead, index) => {
      bead.sx = index % columns * this.spriteSize;
      bead.sy = Math.floor(index / columns) * this.spriteSize;
      const x = bead.sx + this.spriteSize / 2;
      const y = bead.sy + this.spriteSize / 2;
      const radius = this.cell * .94;
      const color = `rgb(${bead.color.join(',')})`;
      atlas.beginPath();
      atlas.arc(x, y, radius, 0, Math.PI * 2);
      atlas.fillStyle = color;
      atlas.fill();
      const light = atlas.createRadialGradient(x - radius * .32, y - radius * .4, radius * .04, x, y, radius);
      light.addColorStop(0, 'rgba(255,255,255,.40)');
      light.addColorStop(.35, 'rgba(255,255,255,.06)');
      light.addColorStop(.74, 'rgba(0,0,0,0)');
      light.addColorStop(1, 'rgba(32,38,29,.22)');
      atlas.fillStyle = light;
      atlas.fill();
    });
    this.layerCtx.clearRect(0, 0, 344, 370);
    this.settled = 0;
    this.ready = true;
    this.canvas.dataset.columns = String(columns);
    this.canvas.dataset.beads = String(this.beads.length);
    this.canvas.dataset.status = 'ready';
  }

  drawBead(ctx, bead, x, y) {
    const size = this.spriteSize / 2;
    ctx.drawImage(this.atlas, bead.sx, bead.sy, this.spriteSize, this.spriteSize, x - size / 2, y - size / 2, size, size);
  }

  paint(drawElapsed) {
    if (!this.ready) return;
    const duration = 850;
    const spacing = (TIMING.drawMs - duration) / Math.max(1, this.beads.length - 1);
    const settled = Math.min(this.beads.length, Math.max(0, Math.floor((drawElapsed - duration) / spacing) + 1));
    if (settled < this.settled) {
      this.layerCtx.clearRect(0, 0, 344, 370);
      this.settled = 0;
    }
    while (this.settled < settled) {
      const bead = this.beads[this.settled++];
      this.drawBead(this.layerCtx, bead, bead.x, bead.y);
    }
    this.ctx.clearRect(0, 0, 344, 370);
    this.ctx.drawImage(this.layer, 0, 0, 344, 370);
    const started = Math.min(this.beads.length, Math.max(0, Math.floor(drawElapsed / spacing) + 1));
    for (let index = settled; index < started; index += 1) {
      const bead = this.beads[index];
      const t = (drawElapsed - index * spacing) / 620;
      const nozzle = [54, 172, 290].reduce((best, x) => Math.abs(x - bead.x) < Math.abs(best - bead.x) ? x : best, 54);
      let x = bead.x;
      let y;
      if (t < 1) {
        x = nozzle + (bead.x - nozzle) * (t * t * (3 - 2 * t));
        y = 23 + (bead.y - 23) * t * t;
      } else {
        const bounce = Math.min(1, (t - 1) * 620 / 230);
        y = bead.y - Math.sin(bounce * Math.PI) * 7 * (1 - bounce);
      }
      this.drawBead(this.ctx, bead, x, y);
    }
    this.canvas.dataset.settled = String(settled);
  }
}
