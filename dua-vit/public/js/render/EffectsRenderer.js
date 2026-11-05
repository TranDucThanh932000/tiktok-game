import { FONT, RIVER } from './layout.js';

// Particles and floating text come from fixed pools: nothing is allocated per effect, so a long stream with
// thousands of splashes never stutters on garbage collection. When a pool is full the oldest slot is reused.
const TYPES = { drop: 0, spark: 1, fire: 2, confetti: 3, leaf: 4, feather: 5, star: 6, gift: 7, rocket: 8, smoke: 9 };
const CONFETTI = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#da77f2', '#ff922b', '#ffffff'];

export class Effects {
  constructor(ctx, size = 2600, texts = 80) {
    this.ctx = ctx;
    this.p = Array.from({ length: size }, () => ({ on: false }));
    this.next = 0;
    this.t = Array.from({ length: texts }, () => ({ on: false }));
    this.nextText = 0;
    this.active = 0;
  }

  emit(type, x, y, o = {}) {
    const p = this.p[this.next];
    this.next = (this.next + 1) % this.p.length;
    p.on = true;
    p.type = TYPES[type];
    p.x = x;
    p.y = y;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.g = o.g ?? 0;
    p.life = p.max = o.life ?? 1;
    p.size = o.size ?? 4;
    p.color = o.color ?? '#fff';
    p.rot = o.rot ?? Math.random() * 6;
    p.vr = o.vr ?? (Math.random() - 0.5) * 8;
    p.drag = o.drag ?? 0.98;
    p.hue = o.hue ?? 0;
    return p;
  }

  burst(type, x, y, n, { speed = 200, spread = Math.PI * 2, angle = 0, ...o } = {}) {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.emit(type, x, y, { ...o, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: (o.life ?? 1) * (0.6 + Math.random() * 0.6), size: (o.size ?? 4) * (0.6 + Math.random() * 0.8), color: o.colors ? o.colors[i % o.colors.length] : o.color });
    }
  }

  splash(x, y, n = 14, power = 1) {
    this.burst('drop', x, y, n, { speed: 220 * power, angle: -Math.PI / 2, spread: Math.PI * 0.9, g: 700, life: 0.7, size: 4, color: 'rgba(230,248,255,0.95)' });
  }

  confetti(x, y, n = 60, power = 1) {
    this.burst('confetti', x, y, n, { speed: 520 * power, angle: -Math.PI / 2, spread: Math.PI * 1.2, g: 420, life: 2.6, size: 9, drag: 0.97, colors: CONFETTI });
  }

  firework(x, y) {
    const hue = Math.floor(Math.random() * 360);
    const r = this.emit('rocket', x, RIVER.y + RIVER.h, { vx: (Math.random() - 0.5) * 80, vy: -(900 + Math.random() * 200), g: 500, life: 1, size: 4, hue });
    r.targetY = y;
  }

  text(str, x, y, { color = '#fff', stroke = '#1d3557', size = 34, life = 1.2, vy = -70 } = {}) {
    const t = this.t[this.nextText];
    this.nextText = (this.nextText + 1) % this.t.length;
    Object.assign(t, { on: true, str, x, y, color, stroke, size, life, max: life, vy });
  }

  update(dt) {
    let active = 0;
    for (const p of this.p) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.on = false;
        if (p.type === TYPES.rocket) this.explode(p);
        continue;
      }
      if (p.type === TYPES.rocket && p.y <= p.targetY) {
        p.on = false;
        this.explode(p);
        continue;
      }
      active++;
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.g * dt;
      if (p.type === TYPES.leaf || p.type === TYPES.feather || p.type === TYPES.confetti) p.vx += Math.sin(p.life * 6 + p.rot) * 30 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.type === TYPES.rocket && Math.random() < 0.6) this.emit('spark', p.x, p.y + 6, { life: 0.4, size: 3, color: `hsl(${p.hue} 100% 70%)`, vy: 60 });
    }
    this.active = active;
    for (const t of this.t) {
      if (!t.on) continue;
      t.life -= dt;
      t.y += t.vy * dt;
      if (t.life <= 0) t.on = false;
    }
  }

  explode(p) {
    const colors = [`hsl(${p.hue} 100% 65%)`, `hsl(${(p.hue + 40) % 360} 100% 70%)`, '#fff'];
    this.burst('spark', p.x, p.y, 70, { speed: 420, g: 160, life: 1.4, size: 4, drag: 0.96, colors });
  }

  // textScale keeps floating text a sensible size while the camera is zoomed in.
  draw(textScale = 1) {
    const ctx = this.ctx;
    ctx.save();
    for (const p of this.p) {
      if (!p.on) continue;
      const k = p.life / p.max;
      switch (p.type) {
        case TYPES.drop:
          ctx.globalAlpha = Math.min(1, k * 1.5);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case TYPES.spark:
        case TYPES.rocket:
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = k;
          ctx.fillStyle = p.type === TYPES.rocket ? `hsl(${p.hue} 100% 75%)` : p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          break;
        case TYPES.fire:
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = k * 0.9;
          ctx.fillStyle = k > 0.6 ? '#ffe066' : k > 0.3 ? '#ff922b' : '#e03131';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.4 + k), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          break;
        case TYPES.smoke:
          ctx.globalAlpha = k * 0.35;
          ctx.fillStyle = '#e9ecef';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (2 - k), 0, Math.PI * 2);
          ctx.fill();
          break;
        case TYPES.confetti:
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, (p.size / 2) * Math.abs(Math.cos(p.rot * 2)) + 1);
          ctx.restore();
          break;
        case TYPES.leaf:
        case TYPES.feather:
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.type === TYPES.leaf ? p.color : '#ffffff';
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size * 1.6, p.size * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
          if (p.type === TYPES.leaf) {
            ctx.strokeStyle = 'rgba(0,60,0,0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-p.size * 1.4, 0);
            ctx.lineTo(p.size * 1.4, 0);
            ctx.stroke();
          }
          ctx.restore();
          break;
        case TYPES.star: {
          ctx.globalAlpha = k;
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = (i * Math.PI) / 5;
            const r = i % 2 ? p.size * 0.45 : p.size;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.fill();
          ctx.restore();
          break;
        }
        case TYPES.gift:
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot * 0.3);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size, -p.size, p.size * 2, p.size * 2);
          ctx.fillStyle = '#ffd43b';
          ctx.fillRect(-p.size * 0.25, -p.size, p.size * 0.5, p.size * 2);
          ctx.fillRect(-p.size, -p.size * 0.25, p.size * 2, p.size * 0.5);
          ctx.restore();
          break;
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of this.t) {
      if (!t.on) continue;
      const k = t.life / t.max;
      const pop = k > 0.85 ? 1 + (k - 0.85) * 3 : 1;
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.font = `900 ${t.size * pop * textScale}px ${FONT}`;
      ctx.lineWidth = Math.max(4, t.size / 5) * textScale;
      ctx.strokeStyle = t.stroke;
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  }
}
