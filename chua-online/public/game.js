const W = 1080;
const H = 1920;
const $ = (id) => document.getElementById(id);

const stage = $('stage');
const ctx = $('fx').getContext('2d');
const toast = $('toast');
const welcomeBox = $('welcome');
const totalValue = $('total-value');
const topList = $('top');
const socialGuideList = $('social-guide');
const giftGuideList = $('gift-guide');
const bell = $('bell');
const mo = $('mo');
const mallet = $('mallet');
const halo = $('halo');
const striker = $('striker');
const vases = [...document.querySelectorAll('.vase')];

const LABEL = {
  mo: 'Gõ mõ',
  incense: 'Thắp hương',
  flower: 'Dâng hoa',
  lantern: 'Thả hoa đăng',
  bell: 'Thỉnh chuông',
  ceremony: 'Đại lễ',
  repent: 'Sám hối',
  wish: 'Cầu nguyện',
};
const ICON = { mo: '🪵', incense: '🙏', flower: '🌸', lantern: '🏮', bell: '🔔', ceremony: '✨', repent: '🙇' };
const MEDALS = ['🥇', '🥈', '🥉', '4', '5'];
// Sand surface of the bronze cauldron, where incense sticks stand.
const BOWL = { x: 540, y: 877 };

const rand = (min, max) => min + Math.random() * (max - min);
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = (n) => Math.round(n).toLocaleString('vi-VN');

const captureLandscape = new URLSearchParams(location.search).get('capture') === 'landscape';
if (captureLandscape) document.title = 'Chùa Online - Full HD';

function fit() {
  const viewWidth = captureLandscape ? H : W;
  const viewHeight = captureLandscape ? W : H;
  const scale = Math.min(innerWidth / viewWidth, innerHeight / viewHeight);
  const rotation = captureLandscape ? ` translate(${H}px, 0) rotate(90deg)` : '';
  stage.style.transform = `translate(${(innerWidth - viewWidth * scale) / 2}px, ${(innerHeight - viewHeight * scale) / 2}px) scale(${scale})${rotation}`;
}
addEventListener('resize', fit);
fit();

// ---------- Sound (synthesized, no audio files) ----------
// ?mute: picture-only copy (e.g. a LIVE Studio Link source) while another page plays the sound.
const muted = new URLSearchParams(location.search).has('mute');
const VOLUME = muted ? 0 : 0.6;
const audio = new AudioContext();
const master = audio.createGain();
master.gain.value = VOLUME;
master.connect(audio.destination);
const soundHint = $('sound-hint');
const syncHint = () => {
  soundHint.hidden = muted || audio.state === 'running';
};
audio.addEventListener('statechange', syncHint);
syncHint();
addEventListener('pointerdown', () => audio.resume());

// Vbee voice clips play one at a time; effects are ducked so the voice stays clear.
const speechQueue = [];
let speaking = false;
function speak(id) {
  if (muted || speechQueue.length >= 4) return;
  speechQueue.push(id);
  if (!speaking) playNextSpeech();
}

function playNextSpeech() {
  const id = speechQueue.shift();
  speaking = Boolean(id);
  master.gain.setTargetAtTime(speaking ? VOLUME * 0.4 : VOLUME, audio.currentTime, 0.15);
  if (!id) return;
  const voice = new Audio(`/tts/${id}`);
  let done = false;
  const next = () => {
    if (done) return;
    done = true;
    playNextSpeech();
  };
  voice.onended = next;
  voice.onerror = next;
  voice.play().catch(next);
}

function tone(freq, start, duration, peak, type = 'sine', destination = master) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
  return osc;
}

const sound = {
  knock() {
    if (audio.state !== 'running') return;
    const t = audio.currentTime;
    tone(820, t, 0.16, 0.7).frequency.exponentialRampToValueAtTime(520, t + 0.09);
    tone(1650, t, 0.05, 0.2, 'triangle');
  },
  bell() {
    if (audio.state !== 'running') return;
    const t = audio.currentTime;
    // Inharmonic partials, each split in two detuned oscillators for the bell's slow beating.
    for (const [ratio, amp, duration] of [[0.5, 0.5, 9], [1, 0.7, 8], [1.19, 0.3, 6], [1.5, 0.25, 5], [2, 0.3, 4], [2.74, 0.15, 3], [3.76, 0.1, 2]]) {
      tone(165 * ratio - 0.4, t, duration, amp * 0.12);
      tone(165 * ratio + 0.4, t, duration, amp * 0.12);
    }
    tone(1250, t, 0.25, 0.08, 'triangle');
  },
  chime(freq) {
    if (audio.state !== 'running') return;
    const t = audio.currentTime;
    tone(freq, t, 1.8, 0.16);
    tone(freq * 2.01, t, 1, 0.05);
  },
  // Prayer bowl for each prostration; detuned pairs give it a slow beating.
  bowl() {
    if (audio.state !== 'running') return;
    const t = audio.currentTime;
    for (const [ratio, amp, duration] of [[1, 0.1, 4.5], [2.76, 0.04, 2.5], [5.4, 0.015, 1.2]]) {
      tone(262 * ratio - 0.6, t, duration, amp);
      tone(262 * ratio + 0.6, t, duration, amp);
    }
  },
};

// ---------- Canvas effects ----------
const sticks = [];
const smoke = [];
const petals = [];
const sparks = [];
const rings = [];
const texts = [];
const lanterns = [];
const wishCards = [];
let flash = 0;

const puff = document.createElement('canvas');
puff.width = puff.height = 64;
{
  const g = puff.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(235, 235, 245, 0.9)');
  grad.addColorStop(1, 'rgba(235, 235, 245, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
}

const cap = (list, max) => list.length > max && list.splice(0, list.length - max);

function glow(x, y, r, rgb, alpha) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function outlinedText(text, x, y, size, color, weight = 700) {
  ctx.font = `${weight} ${size}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size / 5;
  ctx.strokeStyle = 'rgba(10, 26, 30, 0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function addSticks(count) {
  for (let i = 0; i < count; i++) {
    sticks.push({ x: BOWL.x + rand(-36, 36), y: BOWL.y + rand(-3, 3), tilt: rand(-0.12, 0.12), len: rand(58, 70), age: 0, life: rand(80, 100), puff: 0 });
  }
  cap(sticks, 24);
}

function drawSticks(dt) {
  ctx.lineCap = 'round';
  for (let i = sticks.length - 1; i >= 0; i--) {
    const s = sticks[i];
    s.age += dt;
    if (s.age > s.life) {
      sticks.splice(i, 1);
      continue;
    }
    const length = s.len * (1 - 0.7 * (s.age / s.life));
    const dx = Math.sin(s.tilt);
    const dy = -Math.cos(s.tilt);
    const hx = s.x + dx * 16;
    const hy = s.y + dy * 16;
    const tx = s.x + dx * length;
    const ty = s.y + dy * length;
    ctx.strokeStyle = '#b4452f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.strokeStyle = '#6e4a2a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    glow(tx, ty, 9, '255, 120, 30', 0.9);
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath();
    ctx.arc(tx, ty, 2, 0, Math.PI * 2);
    ctx.fill();
    s.puff += dt;
    while (s.puff > 0.22) {
      s.puff -= 0.22;
      smoke.push({ x: tx, y: ty - 3, vx: rand(-5, 5), vy: rand(-50, -34), r: rand(4, 6), age: 0, life: rand(3.5, 5), seed: rand(0, 6) });
    }
  }
  cap(smoke, 700);
}

function drawSmoke(dt) {
  for (let i = smoke.length - 1; i >= 0; i--) {
    const p = smoke[i];
    p.age += dt;
    if (p.age > p.life) {
      smoke.splice(i, 1);
      continue;
    }
    p.x += (p.vx + Math.sin(p.age * 1.6 + p.seed) * 14 + wind * 0.5) * dt;
    p.y += p.vy * dt;
    p.r += 7 * dt;
    ctx.globalAlpha = 0.32 * (1 - p.age / p.life) * Math.min(1, p.age * 3);
    ctx.drawImage(puff, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  }
  ctx.globalAlpha = 1;
}

const PETAL_COLORS = ['#ff9ec4', '#ffc4dc', '#ff6f96', '#ffe1ec'];
// Petals drift down over the hall and the courtyard and settle at a random depth.
function addPetals(count, x0, x1, gold = false) {
  for (let i = 0; i < count; i++) {
    petals.push({
      x: rand(x0, x1),
      y: rand(380, 720),
      vx: rand(-20, 20),
      vy: rand(60, 120),
      rot: rand(0, Math.PI * 2),
      spin: rand(-3, 3),
      size: rand(5, 9),
      color: gold && Math.random() < 0.4 ? '#ffd54a' : PETAL_COLORS[i % PETAL_COLORS.length],
      age: 0,
      seed: rand(0, 6),
      land: rand(900, 1750),
    });
  }
  cap(petals, 400);
}

function drawPetals(dt) {
  for (let i = petals.length - 1; i >= 0; i--) {
    const p = petals[i];
    p.age += dt;
    p.x += (p.vx + Math.sin(p.age * 2 + p.seed) * 30 + wind * 0.8) * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
    if (p.y > p.land) {
      petals.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = Math.min(1, (p.land - p.y) / 90);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function addSparks(x, y, count, speed) {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const v = rand(0.3, 1) * speed;
    sparks.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - 60, age: 0, life: rand(0.8, 1.6), size: rand(2, 4.5) });
  }
  cap(sparks, 400);
}

function drawSparks(dt) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#ffd36b';
  const drag = Math.pow(0.35, dt);
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.age += dt;
    if (p.age > p.life) {
      sparks.splice(i, 1);
      continue;
    }
    p.vx *= drag;
    p.vy = p.vy * drag + 120 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    ctx.globalAlpha = 1 - p.age / p.life;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const ring = rings[i];
    ring.age += dt;
    if (ring.age < 0) continue;
    if (ring.age > ring.life) {
      rings.splice(i, 1);
      continue;
    }
    const k = ring.age / ring.life;
    ctx.strokeStyle = `rgba(255, 214, 120, ${0.7 * (1 - k)})`;
    ctx.lineWidth = 6 * (1 - k) + 1;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, 22 + k * ring.max, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function addText(text, x, y, { size = 40, color = '#ffd54a', name = '', kind = '', merit = 0, slot = -1, rise = 100, life = 2.2, avatar, wreath = false } = {}) {
  const portrait = avatar === undefined ? null : { image: avatarImage(avatar), wreath };
  texts.push({ text, x, y, size, color, name, kind, merit, slot, rise, life, portrait, age: 0 });
  cap(texts, 40);
}

const PORTRAIT_R = 58;
const initial = (name) => (Array.from(String(name).trim())[0] ?? '?').toUpperCase();

const avatarImages = new Map();
function avatarImage(url) {
  if (!url) return null;
  if (!avatarImages.has(url)) {
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    image.src = url;
    avatarImages.set(url, image);
    if (avatarImages.size > 100) avatarImages.delete(avatarImages.keys().next().value);
  }
  return avatarImages.get(url);
}

function drawAvatar(image, name, x, y, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (image?.complete && image.naturalWidth) {
    ctx.save();
    ctx.clip();
    ctx.drawImage(image, x - r, y - r, r * 2, r * 2);
    ctx.restore();
  } else {
    const grad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    grad.addColorStop(0, '#3f8f88');
    grad.addColorStop(1, '#e0a066');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(r * 0.95)}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial(name), x, y + r * 0.06);
  }
  ctx.lineWidth = Math.max(2.5, r * 0.09);
  ctx.strokeStyle = '#ffd8a8';
  ctx.stroke();
  ctx.restore();
}

function drawWreath(x, y, r, age) {
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + age * 0.6;
    drawPetalShape(x + Math.cos(angle) * (r - 6), y + Math.sin(angle) * (r - 6), angle + Math.PI / 2, 0.5);
  }
}

function drawTexts(dt) {
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.age += dt;
    if (t.age > t.life) {
      texts.splice(i, 1);
      continue;
    }
    const k = t.age / t.life;
    const nameSize = Math.round(t.size * 0.8);
    ctx.font = `800 ${t.size}px "Segoe UI", Arial, sans-serif`;
    let half = ctx.measureText(t.text).width / 2;
    if (t.name) {
      ctx.font = `700 ${nameSize}px "Segoe UI", Arial, sans-serif`;
      half = Math.max(half, ctx.measureText(t.name).width / 2);
    }
    if (t.portrait) half = Math.max(half, PORTRAIT_R + 40);
    const x = Math.min(W - half - 12, Math.max(half + 12, t.x));
    const y = t.y - t.rise * (1 - (1 - k) ** 2);
    const nameY = y - t.size * 0.95;
    ctx.globalAlpha = k < 0.12 ? k / 0.12 : 1 - Math.max(0, (k - 0.65) / 0.35);
    if (t.portrait) {
      const portraitY = nameY - nameSize * 0.5 - (t.portrait.wreath ? 36 : 14) - PORTRAIT_R;
      if (t.portrait.wreath) drawWreath(x, portraitY, PORTRAIT_R, t.age);
      drawAvatar(t.portrait.image, t.name, x, portraitY, PORTRAIT_R);
    }
    if (t.name) outlinedText(t.name, x, nameY, nameSize, '#ffffff');
    outlinedText(t.text, x, y, t.size, t.color, 800);
  }
  ctx.globalAlpha = 1;
}

// Lotus lanterns float at the far side of the two ponds, clear of the front row's name tags, drifting slowly, and fade out.
const LANTERN_LIFE = 12;
let lanternSeq = 0;
function addLanterns(name, count) {
  for (let i = 0; i < count && lanterns.length < 8; i++) {
    const side = lanternSeq % 2 ? 1 : -1;
    // Golden-ratio steps spread consecutive lanterns over each pond, so they don't overlap.
    const k = (Math.floor(lanternSeq++ / 2) * 0.618) % 1;
    const y = rand(POND.y0 + 30, POND.y0 + 84);
    const X = lerp(POND.x0 + 80, (540 - 50) / scaleAt(y), k);
    // A batch from one gift shows the name once.
    lanterns.push({ name: i ? '' : name, side, X, y, vx: rand(-12, 12), phase: rand(0, 6), age: -i * 0.8 });
  }
}

function drawPetalShape(x, y, angle, scale, base = '#e0507a', tip = '#ffe0ec') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  const grad = ctx.createLinearGradient(0, 0, 0, -72);
  grad.addColorStop(0, base);
  grad.addColorStop(1, tip);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-17, -18, -15, -52, 0, -72);
  ctx.bezierCurveTo(15, -52, 17, -18, 0, 0);
  ctx.fill();
  ctx.restore();
}

function drawLanterns(dt) {
  for (let i = lanterns.length - 1; i >= 0; i--) {
    const l = lanterns[i];
    l.age += dt;
    if (l.age < 0) continue;
    if (l.age > LANTERN_LIFE) {
      lanterns.splice(i, 1);
      continue;
    }
    const k = l.age / LANTERN_LIFE;
    const s = scaleAt(l.y);
    // Drift on the water, clear of the pond's inner bank and the screen edge.
    l.X = Math.min((540 - 50) / s, Math.max(POND.x0 + 70, l.X + l.vx * dt));
    const x = 540 + l.side * l.X * s;
    const y = l.y + Math.sin(l.phase + l.age * 1.4) * 1.5;
    const size = 1.7 * s;
    ctx.globalAlpha = Math.min(1, l.age / 0.8) * (1 - Math.max(0, (k - 0.75) / 0.25));
    // Light on the water and a slow ripple.
    glow(x, y + 4, 60 * size, '255, 190, 110', 0.4);
    const ripple = (l.age * 0.5 + l.phase) % 1;
    const rx = (20 + 30 * ripple) * size;
    ctx.strokeStyle = `rgba(255, 236, 205, ${0.5 * (1 - ripple)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y + 3, rx, rx * flatAt(l.y), 0, 0, Math.PI * 2);
    ctx.stroke();
    for (const [angle, scale] of [[-1.1, 0.34], [1.1, 0.34], [-0.55, 0.42], [0.55, 0.42], [0, 0.46]]) {
      drawPetalShape(x, y + 4 * size, angle, scale * size);
    }
    const flicker = Math.sin(l.age * 20 + l.phase);
    glow(x, y - 20 * size, 34 * size, '255, 214, 120', 0.6);
    ctx.fillStyle = '#ffe9a6';
    ctx.beginPath();
    ctx.ellipse(x, y - 20 * size, 3 * size, (7 + flicker) * size, 0, 0, Math.PI * 2);
    ctx.fill();
    if (l.name) {
      // The name shows for the first few seconds, then the lantern floats on alone.
      ctx.globalAlpha *= Math.max(0, Math.min(1, 5 - l.age));
      ctx.font = '700 19px "Segoe UI", Arial, sans-serif';
      const half = ctx.measureText(l.name).width / 2 + 6;
      outlinedText(l.name, Math.min(W - half, Math.max(half, x)), y + 24 * size, 19, '#ffffff');
    }
  }
  ctx.globalAlpha = 1;
}

function drawWishCards(dt) {
  ctx.font = '700 26px "Segoe UI", Arial, sans-serif';
  for (let i = wishCards.length - 1; i >= 0; i--) {
    const card = wishCards[i];
    card.age += dt;
    if (card.age > card.life) {
      wishCards.splice(i, 1);
      continue;
    }
    const k = card.age / card.life;
    const width = ctx.measureText(card.text).width + 40;
    // Keep cards left of the leaderboard panel (x >= 824).
    const x = Math.min(814 - width / 2, Math.max(width / 2 + 10, card.x));
    // Start just above the praying viewer's avatar.
    const y = card.y - 420 * (1 - (1 - k) ** 2);
    ctx.globalAlpha = Math.min(1, card.age * 3) * (1 - Math.max(0, (k - 0.7) / 0.3));
    ctx.fillStyle = 'rgba(18, 58, 62, 0.88)';
    ctx.strokeStyle = '#ffd8a8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - 24, width, 48, 24);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff6e6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.text, x, y + 1);
  }
  ctx.globalAlpha = 1;
}

// ---------- Temple courtyard: perspective ground and devotees ----------
// A high, distant camera: the horizon lies far above the screen, so the courtyard is seen from above and people shrink
// only gently toward the hall. A ground point (X, D) is sideways and depth from the bottom edge, in px at that edge.
const HORIZON = -700;
const CAMERA = 3500;
const FLOOR_Y = 872;
const scaleAt = (y) => (y - HORIZON) / (H - HORIZON);
const depthAt = (y) => CAMERA * (1 / scaleAt(y) - 1);
// How squashed a circle lying on the ground looks at height y.
const flatAt = (y) => (y - HORIZON) / CAMERA;
function project(X, D) {
  const s = CAMERA / (CAMERA + D);
  return [540 + X * s, HORIZON + (H - HORIZON) * s];
}

// Five rows of eight cushions, four each side of the stone path. Every row spans about the same screen width, so names
// keep their room at the back too. They fill from the cauldron backwards, centre first.
const ROW_Y = [1140, 1272, 1425, 1604, 1815];
const SEATS = ROW_Y.flatMap((y, row) => {
  const inner = 118 * scaleAt(y) + 58;
  const outer = 452 + 5 * row;
  return [0, 1, 2, 3].flatMap((i) => {
    const offset = Math.round(inner + ((outer - inner) * i) / 3);
    return [{ x: 540 - offset, y, row }, { x: 540 + offset, y, row }];
  });
});
// Prayer mats in front of the cauldron, centre first.
const MAT_Y = 1008;
const MATS = [540, 428, 652].map((x) => ({ x, y: MAT_Y, by: null }));
// Walkways: in front of and behind each row, up the path, and in from below the bottom edge (far enough to hide the name too).
const laneY = (row) => (ROW_Y[row] + (row ? ROW_Y[row - 1] : MAT_Y)) / 2;
const backY = (row) => (ROW_Y[row] + (ROW_Y[row + 1] ?? H)) / 2;
const FRONT_Y = laneY(0);
const ENTRY_Y = 2200;
// Two lanes on each half of the stone path: up toward the cauldron on the inside, back down on the outside.
const aisle = (y, side, down = false) => 540 + side * (down ? 80 : 36) * scaleAt(y);
// Lotus ponds either side of the cauldron square: |X| from x0 outwards (past the screen edge), between screen rows y0 and y1.
const POND = { x0: 330, x1: 1500, y0: 888, y1: 1046 };

{
  const floor = $('floor');
  const add = (tag, attrs) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    floor.append(el);
  };
  const pt = (X, D) => project(X, D).map((v) => v.toFixed(1)).join(' ');
  const quad = (x0, x1, d0, d1) => `M${pt(x0, d0)}L${pt(x1, d0)}L${pt(x1, d1)}L${pt(x0, d1)}Z`;
  const ellipse = (x, y, rx, ry) => `M${(x - rx).toFixed(1)} ${y.toFixed(1)}a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(2 * rx).toFixed(1)} 0a${rx.toFixed(1)} ${ry.toFixed(1)} 0 1 0 ${(-2 * rx).toFixed(1)} 0Z`;
  // Seeded, so stones and lotus leaves stay put between reloads.
  let seed = 20261102;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const far = depthAt(FLOOR_Y);
  const square = depthAt(POND.y1);
  const SQUARE_X = 300;
  // Bluestone slabs in running bond, each a slightly different shade, with moss in the joints off the path.
  const SLAB_D = 150;
  const SLAB_W = 230;
  let joints = '';
  let lighter = '';
  let darker = '';
  for (let row = 0; row * SLAB_D < far; row++) {
    const d0 = row * SLAB_D;
    const d1 = Math.min(far, d0 + SLAB_D);
    joints += `M0 ${project(0, d0)[1].toFixed(1)}H${W}`;
    for (let col = -7; col <= 7; col++) {
      const x0 = (col + (row % 2) * 0.5) * SLAB_W;
      joints += `M${pt(x0, d0)}L${pt(x0, d1)}`;
      const r = rnd();
      if (r < 0.28) lighter += quad(x0, x0 + SLAB_W, d0, d1);
      else if (r > 0.78) darker += quad(x0, x0 + SLAB_W, d0, d1);
    }
  }
  add('path', { d: lighter, fill: '#fff6e4', 'fill-opacity': 0.08 });
  add('path', { d: darker, fill: '#1f2b2c', 'fill-opacity': 0.06 });
  add('path', { d: joints, fill: 'none', stroke: '#585d58', 'stroke-opacity': 0.32, 'stroke-width': 1.5 });
  let moss = '';
  for (let i = 0; i < 80; i++) {
    const X = (rnd() - 0.5) * 2600;
    const D = rnd() * far;
    if (Math.abs(X) < 380) continue;
    const [x, y] = project(X, D);
    const rx = (5 + rnd() * 12) * scaleAt(y);
    moss += ellipse(x, y, rx, rx * flatAt(y));
  }
  add('path', { d: moss, fill: '#6f8f5a', 'fill-opacity': 0.35 });
  // A pale stone path from below the bottom edge up to the square around the cauldron, paved in large squares.
  add('path', { d: quad(-118, 118, -500, square), fill: '#d0cabb' });
  let slabs = '';
  for (let d = 90; d < square; d += 90) slabs += `M${pt(-118, d)}L${pt(118, d)}`;
  add('path', { d: slabs, fill: 'none', stroke: '#8f897b', 'stroke-opacity': 0.5, 'stroke-width': 1.5 });
  add('path', { d: `M${pt(-118, -500)}L${pt(-118, square)}M${pt(118, -500)}L${pt(118, square)}`, fill: 'none', stroke: '#6f6a5e', 'stroke-opacity': 0.55, 'stroke-width': 3 });
  add('path', { d: quad(-SQUARE_X, SQUARE_X, square, far), fill: '#d6d0c1' });
  let grid = '';
  for (let X = -SQUARE_X + 120; X < SQUARE_X; X += 120) grid += `M${pt(X, square)}L${pt(X, far)}`;
  for (let d = square + 120; d < far; d += 120) grid += `M${pt(-SQUARE_X, d)}L${pt(SQUARE_X, d)}`;
  add('path', { d: grid, fill: 'none', stroke: '#97907f', 'stroke-opacity': 0.45, 'stroke-width': 1.5 });
  add('path', { d: quad(-SQUARE_X, SQUARE_X, square, far), fill: 'none', stroke: '#7a7466', 'stroke-opacity': 0.5, 'stroke-width': 3 });
  // Rounded rectangle on the ground, projected: near-right corner first, then round through the far side.
  const groundRect = (x0, x1, d0, d1, r) => {
    const pts = [];
    for (const [cx, cd, a0] of [[x1 - r, d0 + r, -Math.PI / 2], [x1 - r, d1 - r, 0], [x0 + r, d1 - r, Math.PI / 2], [x0 + r, d0 + r, Math.PI]]) {
      for (let i = 0; i <= 6; i++) pts.push(pt(cx + Math.cos(a0 + (i / 12) * Math.PI) * r, cd + Math.sin(a0 + (i / 12) * Math.PI) * r));
    }
    return `M${pts.join('L')}Z`;
  };
  const pondNear = depthAt(POND.y1);
  const pondFar = depthAt(POND.y0);
  for (const side of [-1, 1]) {
    const outline = side < 0 ? groundRect(-POND.x1, -POND.x0, pondNear, pondFar, 120) : groundRect(POND.x0, POND.x1, pondNear, pondFar, 120);
    add('path', { d: outline, fill: 'url(#g-water)' });
    // The sunrise glints on the water by the far bank.
    let glints = '';
    for (let i = 0; i < 5; i++) {
      const [x, y] = project(side * (POND.x0 + 90 + rnd() * 600), pondFar - 30 - rnd() * 70);
      glints += ellipse(x, y, (24 + rnd() * 30) * scaleAt(y), 2.2);
    }
    add('path', { d: glints, fill: '#ffe7c6', 'fill-opacity': 0.5 });
    add('path', { d: outline, fill: 'none', stroke: '#e1dbcb', 'stroke-width': 7 });
    add('path', { d: outline, fill: 'none', stroke: '#2e4a4a', 'stroke-opacity': 0.3, 'stroke-width': 2 });
    for (let i = 0; i < 9; i++) {
      const [x, y] = project(side * (POND.x0 + 70 + rnd() * 560), pondNear + 45 + rnd() * (pondFar - pondNear - 90));
      const s = scaleAt(y);
      const rx = (20 + rnd() * 12) * s;
      const ry = rx * flatAt(y);
      add('path', { d: ellipse(x, y, rx, ry), fill: rnd() < 0.5 ? '#5b8f57' : '#4a7d4c' });
      add('path', { d: `M${x} ${y}L${(x + rx).toFixed(1)} ${(y - ry * 0.35).toFixed(1)}L${(x + rx).toFixed(1)} ${(y + ry * 0.3).toFixed(1)}Z`, fill: '#5e8d8b' });
      add('path', { d: `M${x} ${y}L${(x - rx * 0.8).toFixed(1)} ${y}M${x} ${y}L${x} ${(y - ry * 0.8).toFixed(1)}M${x} ${y}L${x} ${(y + ry * 0.8).toFixed(1)}`, stroke: '#a9cc8e', 'stroke-opacity': 0.55, 'stroke-width': 1.2 });
      if (rnd() < 0.45) add('use', { href: '#blossom', transform: `translate(${x.toFixed(1)} ${(y - 2).toFixed(1)}) scale(${(1.7 * s).toFixed(2)})` });
    }
  }
  // Woven prayer mats before the cauldron, and saffron cushions in the rows.
  for (const { x, y } of MATS) {
    const X = (x - 540) / scaleAt(y);
    const D = depthAt(y);
    add('path', { d: quad(X - 64, X + 64, D - 30, D + 95), fill: '#dcc995', stroke: '#a3864d', 'stroke-width': 2 });
    let weave = '';
    for (let i = 1; i < 5; i++) weave += `M${pt(X - 64 + i * 25.6, D - 30)}L${pt(X - 64 + i * 25.6, D + 95)}`;
    add('path', { d: weave, fill: 'none', stroke: '#b39a62', 'stroke-opacity': 0.5, 'stroke-width': 1 });
    add('path', { d: quad(X - 52, X + 52, D - 18, D + 83), fill: 'none', stroke: '#8f6f3a', 'stroke-opacity': 0.55, 'stroke-width': 1.5 });
  }
  for (const { x, y } of SEATS) {
    const s = scaleAt(y);
    const rx = 31 * s;
    const ry = rx * flatAt(y);
    const h = 8 * s;
    add('path', { d: `M${x - rx} ${y - h}V${y}A${rx} ${ry} 0 0 0 ${x + rx} ${y}V${y - h}Z`, fill: '#94661f' });
    add('ellipse', { cx: x, cy: y - h, rx, ry, fill: '#d19b42', stroke: '#f2d593', 'stroke-opacity': 0.55, 'stroke-width': 1.5 });
  }
}

// Praying viewers kneel on the cushions. To pray they get up, walk to a mat before the cauldron, bow three times,
// then walk back to their seat and kneel again. The courtyard opens full of pilgrims without name tags, and people
// trade cushions every few seconds. Once every seat is taken, a newcomer sends a random pilgrim out, or else whoever
// prayed least recently.
const ROBES = ['#4c5f88', '#7b5b3d', '#8d9196', '#6a8c74', '#d9cfb8', '#c8963e', '#ad7778', '#5f5679', '#e9e6dc', '#3f7f86', '#9a6b4f', '#7a8f4e'];
const MONK_ROBES = ['#c8963e', '#8a6a48', '#8d9196'];
const TROUSERS = ['#2e333d', '#4a3c31', '#3b4950', '#ece8de'];
const SKINS = ['#f2cba8', '#e2b088', '#c99168'];
const HAIR_COLORS = ['#1e1916', '#2c221c', '#3b2c22'];
const HAIRDOS = ['short', 'short', 'bun', 'tail', 'bald', 'scarf', 'grey'];
// Children to tall adults.
const SIZES = [0.84, 0.94, 1, 1, 1.05];
// A hurried walk, about five steps a second.
const WALK_SPEED = 300;
const STEP = 64;
const BOW_LEAD = 0.6;
const ENTRY_GAP = 1.8;
const devotees = [];
const altarQueue = [];
// Courtyard clock (stops while the close-up covers it) and when each side's lane is next free to walk in.
let hallTime = 0;
const entryAt = { [-1]: 0, 1: 0 };
let devoteeSeq = 0;
let idleIn = rand(5, 10);
const SWAP_EVERY = 3;
let swapIn = SWAP_EVERY;

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${[16, 8, 0].map((bit) => Math.min(255, Math.round(((n >> bit) & 255) * f))).join(', ')})`;
}

// The same outfit, hairdo, skin tone and height for a name every time, so each viewer keeps their own figure.
function lookFor(name) {
  let h = 2166136261;
  for (const ch of name) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  h >>>= 0;
  const pick = (list, bit) => list[(h >>> bit) % list.length];
  const hair = pick(HAIRDOS, 3);
  const monk = hair === 'bald';
  const robe = monk ? pick(MONK_ROBES, 7) : pick(ROBES, 0);
  return {
    robe,
    fold: shade(robe, 0.78),
    lit: shade(robe, 1.16),
    // Some wear a tunic over trousers instead of a long robe; monks wear a sash.
    trousers: !monk && (h >>> 11) % 3 === 0 ? pick(TROUSERS, 13) : null,
    sash: monk ? shade(robe, 0.62) : null,
    skin: pick(SKINS, 17),
    hair,
    hairColor: hair === 'grey' ? '#bdb8b0' : pick(HAIR_COLORS, 20),
    size: pick(SIZES, 24),
  };
}

const devoteeAt = (name) => devotees.find((d) => !d.leaving && d.name === name);
// Kneeling on their own cushion, at most bowing there.
const atSeat = (d) => !d.leaving && !d.mat && d.pose === 1 && !altarQueue.includes(d) && d.x === SEATS[d.seat].x && d.y === SEATS[d.seat].y;
const isResting = (d) => atSeat(d) && !d.plan.length;

// Plan steps, run one after another by advance().
const rise = () => ({ do: 'rise' });
const kneel = () => ({ do: 'kneel' });
const walk = (path, toMat = false) => ({ do: 'walk', path, toMat });
const bow = (time, depth) => ({ do: 'bow', time, depth });
const wait = (t) => ({ do: 'wait', t });
const call = (fn) => ({ do: 'call', fn });

function unqueue(d) {
  const i = altarQueue.indexOf(d);
  if (i !== -1) altarQueue.splice(i, 1);
}

function releaseMat(d) {
  if (d.mat) d.mat.by = null;
  d.mat = null;
}

function claimSeat() {
  const staying = devotees.filter((d) => !d.leaving);
  const free = SEATS.findIndex((_, i) => !staying.some((d) => d.seat === i));
  if (free !== -1) return free;
  const resting = staying.filter(isResting);
  const extras = resting.filter((d) => d.extra);
  const out = extras.length ? extras[Math.floor(Math.random() * extras.length)] : (resting.length ? resting : staying).reduce((a, b) => (b.seq < a.seq ? b : a));
  leave(out);
  return out.seat;
}

function addDevotee(m, x, y, pose) {
  ctx.font = LABEL_FONT;
  const label = fitText(m.user, 112);
  const d = { name: m.user, label, labelWidth: ctx.measureText(label).width, lift: 0, tagAlpha: 1, image: avatarImage(m.avatar), look: lookFor(m.user), seat: claimSeat(), x, y, pose, facing: 1, stride: 0, moving: false, age: 0, bowAt: -Infinity, bowTime: 1, bowDepth: 0, bows: 3, plan: [], mat: null, leaving: false, gone: false, extra: false, newcomer: false, wantsAltar: false, seq: ++devoteeSeq };
  devotees.push(d);
  return d;
}

// Gets up and walks out down the stone path; from a cushion by the walkway behind the row.
function leave(d) {
  const seat = SEATS[d.seat];
  const y = d.x === seat.x && d.y === seat.y ? backY(seat.row) : Math.min(H, d.y + 40 * scaleAt(d.y));
  releaseMat(d);
  unqueue(d);
  d.leaving = true;
  const side = d.x < 540 ? -1 : 1;
  const path = d.y < H ? [{ x: d.x, y }, { x: aisle(y, side, true), y }] : [];
  d.plan = [rise(), walk([...path, { x: aisle(ENTRY_Y, side, true), y: ENTRY_Y }]), call(() => (d.gone = true))];
}

// Forward to the walkway before the row, along it to the stone path, up to the front, then straight onto the mat.
function pathToMat(d, mat) {
  const seat = SEATS[d.seat];
  const side = Math.sign(seat.x - 540);
  const path = [];
  if (d.y < H) {
    const y = laneY(seat.row);
    path.push({ x: d.x, y });
    if (seat.row) path.push({ x: aisle(y, side), y });
  }
  // The front row's walkway is the space before the mats itself.
  if (d.y >= H || seat.row) path.push({ x: aisle(FRONT_Y, side), y: FRONT_Y });
  return [...path, { x: mat.x, y: FRONT_Y }, { x: mat.x, y: mat.y }];
}

// Back off the mat, down the stone path to the walkway behind the row, then forward onto the cushion facing the hall.
function pathToSeat(d) {
  const seat = SEATS[d.seat];
  const side = Math.sign(seat.x - 540);
  const y = backY(seat.row);
  return [{ x: d.mat?.x ?? d.x, y: FRONT_Y }, { x: aisle(FRONT_Y, side, true), y: FRONT_Y }, { x: aisle(y, side, true), y }, { x: seat.x, y }, { x: seat.x, y: seat.y }];
}

// Up the stone path from below the courtyard to the walkway behind the row, then forward onto the cushion.
function pathFromBelow(d) {
  const seat = SEATS[d.seat];
  const y = backY(seat.row);
  return [{ x: aisle(y, Math.sign(seat.x - 540)), y }, { x: seat.x, y }, { x: seat.x, y: seat.y }];
}

// Cushion to cushion: back onto the walkway behind the row, along the stone path if the row changes, then along the
// other row's walkway and forward onto the cushion.
function pathAcross(from, to) {
  const a = SEATS[from];
  const b = SEATS[to];
  const ya = backY(a.row);
  const yb = backY(b.row);
  const path = [{ x: a.x, y: ya }];
  if (a.row !== b.row) {
    const side = Math.sign(a.x - 540);
    const down = b.row > a.row;
    path.push({ x: aisle(ya, side, down), y: ya }, { x: aisle(yb, side, down), y: yb });
  }
  return [...path, { x: b.x, y: yb }, { x: b.x, y: b.y }];
}

// Out of sight below the courtyard, in single file: a burst of newcomers comes in one after another.
function lineUp(d) {
  const side = Math.sign(SEATS[d.seat].x - 540);
  d.x = aisle(ENTRY_Y, side);
  const start = Math.max(hallTime, entryAt[side]);
  entryAt[side] = start + ENTRY_GAP;
  return wait(start - hallTime);
}

function pray(d, mat) {
  mat.by = d;
  d.mat = mat;
  d.bowAt = -Infinity;
  d.plan = [rise(), walk(pathToMat(d, mat), true), kneel(), bow(2.2, 0.95), rise(), call(releaseMat), walk(pathToSeat(d)), kneel()];
  // The follow shot is for viewers, not the nameless pilgrims.
  if (!d.extra && !camQueue.includes(d)) camQueue.push(d);
}

// The centre mat first, otherwise the one on the devotee's own side.
function serveAltar() {
  while (altarQueue.length) {
    const mat = (SEATS[altarQueue[0].seat].x < 540 ? [0, 1, 2] : [0, 2, 1]).map((i) => MATS[i]).find((m) => !m.by);
    if (!mat) return;
    pray(altarQueue.shift(), mat);
  }
}

// Every few seconds a resting devotee bows three times in place, or now and then walks up to the mats and back.
function idleDevotees(dt) {
  idleIn -= dt;
  if (idleIn > 0) return;
  idleIn = rand(4, 8);
  const resting = devotees.filter(isResting);
  const d = resting[Math.floor(Math.random() * resting.length)];
  if (!d) return;
  if (Math.random() < 0.3 && !altarQueue.length && MATS.every((m) => !m.by)) altarQueue.push(d);
  else d.plan = [bow(2.6, 0.6)];
}

// Every few seconds two resting people get up and trade cushions, so the courtyard is always on the move.
function swapSeats(dt) {
  swapIn -= dt;
  if (swapIn > 0) return;
  swapIn = SWAP_EVERY;
  const resting = devotees.filter(isResting);
  if (resting.length < 2) return;
  const a = resting.splice(Math.floor(Math.random() * resting.length), 1)[0];
  const b = resting[Math.floor(Math.random() * resting.length)];
  const [from, to] = [a.seat, b.seat];
  a.seat = to;
  b.seat = from;
  a.plan = [rise(), walk(pathAcross(from, to)), kneel()];
  b.plan = [rise(), walk(pathAcross(to, from)), kneel()];
}

function advance(d, dt) {
  d.age += dt;
  d.moving = false;
  while (d.plan.length && run(d, d.plan[0], dt)) {
    d.plan.shift();
    dt = 0;
  }
}

// Advances one plan step; true once it is finished.
function run(d, step, dt) {
  switch (step.do) {
    case 'rise':
      d.pose = Math.max(0, d.pose - dt / 0.3);
      return d.pose === 0;
    case 'kneel':
      d.facing = 1;
      d.pose = Math.min(1, d.pose + dt / 0.35);
      return d.pose === 1;
    case 'bow':
      if (!step.started) {
        step.started = true;
        Object.assign(d, { bowAt: d.age, bowTime: step.time, bowDepth: step.depth, bows: 3 });
      }
      return d.age >= d.bowAt + BOW_LEAD + d.bows * d.bowTime;
    case 'wait':
      return (step.t -= dt) <= 0;
    case 'walk':
      return walkAlong(d, step.path, dt);
    default:
      step.fn(d);
      return true;
  }
}

// Speed and stride shrink with distance, so steps keep pace with the ground.
function walkAlong(d, path, dt) {
  d.moving = true;
  let left = WALK_SPEED * scaleAt(d.y) * dt;
  while (path.length && left > 0) {
    const dx = path[0].x - d.x;
    const dy = path[0].y - d.y;
    const dist = Math.hypot(dx, dy);
    // Back to the camera going up the courtyard, face to it coming down; sideways steps keep the last facing.
    if (Math.abs(dy) > 0.3 * Math.abs(dx)) d.facing = dy < 0 ? 1 : -1;
    const move = Math.min(dist, left);
    if (move < dist) {
      d.x += (dx / dist) * move;
      d.y += (dy / dist) * move;
    } else {
      d.x = path[0].x;
      d.y = path[0].y;
      path.shift();
    }
    d.stride += (Math.PI * move) / (STEP * scaleAt(d.y));
    left -= move;
  }
  return !path.length;
}

// Three bows (vái ba vái), counted from when the bow step began.
function bowAngle(d) {
  const t = (d.age - d.bowAt - BOW_LEAD) / d.bowTime;
  return t < 0 || t >= d.bows ? 0 : Math.sin(Math.PI * (t % 1)) ** 2 * d.bowDepth;
}

function drawHead(look, y, front) {
  const hair = look.hairColor;
  ctx.fillStyle = look.skin;
  ctx.fillRect(-4.5, y + 8, 9, 11);
  if (front) {
    if (look.hair === 'bun' || look.hair === 'grey') {
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(0, y - 14, 6.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.arc(0, y, 13.5, 0, Math.PI * 2);
    ctx.fill();
    if (look.hair !== 'bald') {
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(0, y, 14.5, Math.PI, Math.PI * 2);
      ctx.quadraticCurveTo(0, y - 8, -14.5, y);
      ctx.fill();
    }
    if (look.hair === 'scarf') {
      ctx.fillStyle = '#3d2a35';
      ctx.beginPath();
      ctx.ellipse(0, y - 8, 15.5, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Eyes lowered, a touch of colour in the cheeks.
    ctx.strokeStyle = '#3a2418';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(side * 5 - 2.6, y + 2);
      ctx.quadraticCurveTo(side * 5, y + 4, side * 5 + 2.6, y + 2);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(232, 120, 110, 0.28)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * 7.5, y + 6, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  if (look.hair === 'short' || look.hair === 'bald') {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * 13.5, y + 2, 3, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = look.hair === 'bald' ? look.skin : hair;
  ctx.beginPath();
  ctx.arc(0, y, 14, 0, Math.PI * 2);
  ctx.fill();
  if (look.hair === 'bun' || look.hair === 'grey') {
    ctx.fillStyle = shade(hair, look.hair === 'grey' ? 0.85 : 1.35);
    ctx.beginPath();
    ctx.arc(0, y + 5, 6.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.hair === 'scarf') {
    // Khăn vấn wrapped round the head.
    ctx.fillStyle = '#3d2a35';
    ctx.beginPath();
    ctx.ellipse(0, y - 3, 15.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sheen from the morning sun.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.beginPath();
  ctx.ellipse(-5, y - 6, 6, 3.5, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

// One devotee in figure units around the feet: about 160 tall standing, 120 kneeling on a cushion. pose 0 stands,
// 1 kneels; bow tips the upper body away from the camera; front faces the camera; step swings the walk.
function drawFigure(look, { pose: p, bow = 0, front = false, step = 0, flat = 0.5 }) {
  // Seen from high up, a bow shortens the back on screen and sinks the head behind the shoulders.
  const lean = Math.cos(bow) * 0.8 + 0.2;
  const hip = lerp(-74, -30, p) - Math.abs(step) * 2;
  const shoulder = hip - 48 * lean;
  const head = shoulder - 20 * Math.cos(bow) - 2;
  const alpha = ctx.globalAlpha;
  // Contact shadow, cast a little to the right, away from the sunrise.
  ctx.fillStyle = 'rgba(24, 34, 38, 0.3)';
  ctx.beginPath();
  ctx.ellipse(5, 0, 27 + 6 * p, (27 + 6 * p) * flat, 0, 0, Math.PI * 2);
  ctx.fill();
  // Kneel on top of the cushion.
  ctx.translate(0, -8 * p);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (p < 0.7) {
    ctx.fillStyle = '#2d2420';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * 7, -2 - Math.max(0, side * step) * 4, 5.5, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // The robe, or trousers, hangs to the feet standing and spreads over the folded legs kneeling.
  const waist = lerp(18, 22, p);
  const hem = lerp(23, 31, p);
  const sway = step * 3;
  ctx.strokeStyle = 'rgba(28, 24, 24, 0.35)';
  ctx.lineWidth = 2;
  ctx.fillStyle = look.trousers ?? look.fold;
  ctx.beginPath();
  ctx.moveTo(-waist, hip);
  ctx.lineTo(waist, hip);
  ctx.quadraticCurveTo(hem + 1, hip * 0.35, hem + sway, -4);
  ctx.quadraticCurveTo(sway, 1, -hem + sway, -4);
  ctx.quadraticCurveTo(-hem - 1, hip * 0.35, -waist, hip);
  ctx.fill();
  ctx.stroke();
  if (look.trousers) {
    // The tunic's panel falls over the trousers.
    const end = lerp(hip + 40, -7, p);
    ctx.fillStyle = look.robe;
    ctx.beginPath();
    ctx.moveTo(-waist + 2, hip);
    ctx.lineTo(waist - 2, hip);
    ctx.lineTo(waist + 1 + sway, end);
    ctx.lineTo(-waist - 1 + sway, end);
    ctx.closePath();
    ctx.fill();
  }
  if (!front && p > 0.6) {
    // Soles of the feet tucked under, seen from behind.
    ctx.globalAlpha = alpha * ((p - 0.6) / 0.4);
    ctx.fillStyle = look.skin;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * 10, -6, 5.5, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = alpha;
  }
  // From behind the head goes first, so a bow sinks it behind the shoulders.
  if (!front) drawHead(look, head, false);
  ctx.fillStyle = look.robe;
  ctx.beginPath();
  ctx.moveTo(-22, hip + 4);
  ctx.quadraticCurveTo(-26, (hip + shoulder) / 2, -23, shoulder + 8);
  ctx.quadraticCurveTo(-20, shoulder - 3, -8, shoulder - 4);
  ctx.lineTo(8, shoulder - 4);
  ctx.quadraticCurveTo(20, shoulder - 3, 23, shoulder + 8);
  ctx.quadraticCurveTo(26, (hip + shoulder) / 2, 22, hip + 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Wide sleeves.
  ctx.fillStyle = look.fold;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 20, shoulder + 6);
    ctx.quadraticCurveTo(side * 34, lerp(shoulder, hip, 0.5), side * 29, hip + 1);
    ctx.lineTo(side * 18, hip - 4);
    ctx.closePath();
    ctx.fill();
  }
  // Morning light along the left side.
  ctx.strokeStyle = look.lit;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-21, shoulder + 2);
  ctx.quadraticCurveTo(-25, (hip + shoulder) / 2, -22, hip);
  ctx.stroke();
  if (front) {
    // Crossed collar, and sleeves meeting at palms joined before the chest.
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-7, shoulder - 3);
    ctx.lineTo(6, shoulder + 20);
    ctx.moveTo(7, shoulder - 3);
    ctx.lineTo(2, shoulder + 8);
    ctx.stroke();
    ctx.strokeStyle = look.fold;
    ctx.lineWidth = 9;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(side * 19, shoulder + 8);
      ctx.lineTo(side * 16, shoulder + 30);
      ctx.lineTo(side * 5, shoulder + 30);
    }
    ctx.stroke();
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.ellipse(0, shoulder + 22, 3.6, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();
    drawHead(look, head, true);
    return;
  }
  ctx.strokeStyle = look.fold;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, shoulder);
  ctx.lineTo(0, hip + 3);
  ctx.stroke();
  if (look.sash) {
    // A monk's sash across the back.
    ctx.strokeStyle = look.sash;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-15, shoulder);
    ctx.lineTo(17, hip + 1);
    ctx.stroke();
  }
  if (look.hair === 'tail') {
    ctx.fillStyle = look.hairColor;
    ctx.beginPath();
    ctx.moveTo(-4, head + 8);
    ctx.quadraticCurveTo(-6, shoulder + 10, 0, shoulder + 18 * lean);
    ctx.quadraticCurveTo(6, shoulder + 10, 4, head + 8);
    ctx.fill();
  }
}

// A devotee at their place in the courtyard, scaled by depth.
function drawDevotee(d) {
  const s = scaleAt(d.y) * d.look.size;
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.scale(s, s);
  drawFigure(d.look, { pose: d.pose, bow: bowAngle(d), front: d.facing < 0, step: d.moving ? Math.sin(d.stride) : 0, flat: flatAt(d.y) });
  ctx.restore();
}

// Avatar and name ride above the head without bobbing on bows or steps.
const LABEL_FONT = '700 18px "Segoe UI", Arial, sans-serif';
const labelBase = (d) => d.y - lerp(172, 134, d.pose) * scaleAt(d.y) * d.look.size;
const labelScale = (d) => 0.82 + 0.18 * Math.min(1, scaleAt(d.y));

// The name tag before any lift: centre, half width, avatar radius, name pill height, top and bottom.
function labelBox(d) {
  const ls = labelScale(d);
  const r = 18 * ls;
  const pill = 25 * ls;
  const half = Math.max(r, (d.labelWidth / 2 + 9) * ls);
  const bottom = labelBase(d);
  return { x: Math.min(W - half - 8, Math.max(half + 8, d.x)), half, r, pill, top: bottom - pill - 3 - 2 * r, bottom };
}

const kneeling = (d) => d.pose === 1;

// Tags of people on the move come first and stay over their heads, so viewers can follow them; kneeling tags they
// cover are dimmed. Within each group nearer tags keep their place and one that would cover them rises above it,
// gliding there. The lift is capped so a crowd never stacks into a tower; a tag still covered is dimmed instead.
function liftLabels(order, dt) {
  const placed = [];
  const covers = (box, lift, p) => Math.abs(p.x - box.x) < p.half + box.half + 4 && box.top - lift < p.bottom && box.bottom - lift > p.top;
  for (const d of [...order].reverse().sort((a, b) => kneeling(a) - kneeling(b))) {
    const box = labelBox(d);
    const max = 1.6 * (box.bottom - box.top);
    const group = placed.filter((q) => q.kneeling === kneeling(d));
    let lift = 0;
    for (let p; lift < max && (p = group.find((q) => covers(box, lift, q))); ) lift = box.bottom - p.top + 4;
    lift = Math.min(lift, max);
    const k = Math.min(1, dt * 5);
    d.lift += (lift - d.lift) * k;
    d.tagAlpha += ((placed.some((q) => covers(box, lift, q)) ? 0.35 : 1) - d.tagAlpha) * k;
    placed.push({ ...box, top: box.top - lift, bottom: box.bottom - lift, kneeling: kneeling(d) });
  }
}

function drawLabel(d) {
  const { x, r, pill, half, bottom } = labelBox(d);
  const ls = labelScale(d);
  const y = bottom - d.lift;
  ctx.globalAlpha = d.tagAlpha;
  ctx.fillStyle = 'rgba(12, 32, 38, 0.74)';
  ctx.beginPath();
  ctx.roundRect(x - half, y - pill, half * 2, pill, pill / 2);
  ctx.fill();
  ctx.font = `700 ${Math.round(18 * ls)}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fbf3e4';
  ctx.fillText(d.label, x, y - pill / 2 + 1);
  drawAvatar(d.image, d.name, x, y - pill - 3 - r, r);
  ctx.globalAlpha = 1;
}

function showCard(d, text) {
  wishCards.push({ text, x: d.x, y: Math.min(1650, labelBase(d) - d.lift - 90 * labelScale(d)), age: 0, life: 7 });
}

function drawDevotees(dt) {
  hallTime += dt;
  // Whoever prayed while busy goes up to the mats once back on their cushion.
  for (const d of devotees) {
    if (d.wantsAltar && isResting(d)) {
      d.wantsAltar = false;
      altarQueue.push(d);
    }
  }
  serveAltar();
  idleDevotees(dt);
  swapSeats(dt);
  admitArrivals(dt);
  for (const d of devotees) advance(d, dt);
  for (let i = devotees.length - 1; i >= 0; i--) if (devotees[i].gone) devotees.splice(i, 1);
  // Far to near, so nearer people overlap those behind.
  [...devotees].sort((a, b) => a.y - b.y).forEach(drawDevotee);
}

// Names go on top of everyone, weather included.
function drawTags(dt) {
  // Pilgrims have no tag, nor do people still out of sight below the courtyard (lifting would pull it into view).
  const tagged = devotees.filter((d) => !d.extra && labelBox(d).top < H).sort((a, b) => a.y - b.y);
  liftLabels(tagged, dt);
  tagged.sort((a, b) => kneeling(b) - kneeling(a)).forEach(drawLabel);
}

function fitText(text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && ctx.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop();
  return `${chars.join('')}…`;
}

// The courtyard opens full: a pilgrim kneels on every cushion until a viewer takes their place.
while (devotees.length < SEATS.length) {
  const d = addDevotee({ user: '' }, 0, 0, 1);
  Object.assign(d, { extra: true, look: lookFor(`khách ${d.seat}`), x: SEATS[d.seat].x, y: SEATS[d.seat].y });
}

// ---------- Courtyard camera ----------
// Whoever walks up to the prayer mats gets a ~2 s follow shot, one person at a time. Waiting gifts cut a shot short;
// gift effects and the newcomer close-up only play on the wide view.
const CAM_ZOOM = 1.9;
const CAM_TIME = 2;
const CAM_IN = 0.5;
const CAM_OUT = 0.6;
const CAM_GAP = 1;
// Where the followed person is kept on screen, clear of the guide and leaderboard.
const CAM_ANCHOR = { x: 540, y: 1240 };
const worldLayers = [$('scene'), $('fx')];
const camQueue = [];
const cam = { d: null, t: 0, k: 0, x: 0, y: 0, ending: false, rest: 0, css: '' };
const headingToMat = (d) => d.plan.slice(0, 2).some((step) => step.toMat);

function updateCamera(dt, now) {
  const cut = queue.length > 0;
  cam.rest -= dt;
  if (!cam.d && cam.rest <= 0 && !cut && !focus && !focusQueue.length && now >= nextAt) {
    for (let i = camQueue.length - 1; i >= 0; i--) if (!headingToMat(camQueue[i])) camQueue.splice(i, 1);
    // Someone still walking in from below the courtyard is filmed once in sight.
    const i = camQueue.findIndex((d) => d.y < H - 40);
    if (i !== -1) Object.assign(cam, { d: camQueue.splice(i, 1)[0], t: 0, ending: false });
  }
  if (cam.d) {
    const d = cam.d;
    const follow = cam.t ? Math.min(1, dt * 8) : 1;
    cam.x += (d.x - cam.x) * follow;
    cam.y += (d.y - 80 * scaleAt(d.y) - cam.y) * follow;
    cam.t += dt;
    if (cam.t >= CAM_TIME || cut || d.gone) cam.ending = true;
    cam.k = cam.ending ? Math.max(0, cam.k - dt / CAM_OUT) : Math.min(1, cam.k + dt / CAM_IN);
    if (cam.ending && !cam.k) {
      cam.d = null;
      cam.rest = CAM_GAP;
    }
  }
  const zoom = 1 + (CAM_ZOOM - 1) * cam.k * cam.k * (3 - 2 * cam.k);
  // Never past the edges of the courtyard.
  const tx = Math.min(0, Math.max(W - W * zoom, CAM_ANCHOR.x - cam.x * zoom));
  const ty = Math.min(0, Math.max(H - H * zoom, CAM_ANCHOR.y - cam.y * zoom));
  const css = cam.k ? `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${zoom.toFixed(4)})` : '';
  if (css !== cam.css) {
    cam.css = css;
    for (const layer of worldLayers) layer.style.transform = css;
  }
}

// ---------- Focus cam ----------
// A newcomer first bows three times alone, filmed from behind, then walks to a seat in the courtyard.
// Sám hối uses the same camera: three slow, deep bows while the verse appears, then the smoke turns to light.
const FOCUS_IN = 0.7;
const FOCUS_FADE = 0.7;
const BOW_START = 1;
const RELEASE_TIME = 1.8;
const focusQueue = [];
let focus = null;
let repentVerse = [];

function focusBow(t) {
  const n = (t - BOW_START) / focus.bowTime;
  if (n < 0 || n >= 3) return 0;
  const phase = (n % 1) / 0.9;
  return phase >= 1 ? 0 : Math.sin(Math.PI * phase) ** 2 * focus.depth;
}

function startFocus(m) {
  const repent = m.action === 'repent';
  const bowTime = repent ? 2.8 : 2.2;
  const bowsEnd = BOW_START + 3 * bowTime;
  const out = bowsEnd + (repent ? RELEASE_TIME : 0);
  ctx.font = '800 46px "Segoe UI", Arial, sans-serif';
  const label = fitText(m.user, 900);
  // Verse lines too wide for the screen get a smaller font.
  ctx.font = '600 36px "Segoe UI", Arial, sans-serif';
  const verse = repent ? repentVerse.map((text) => ({ text, size: Math.min(36, Math.floor((36 * 980) / ctx.measureText(text).width)) })) : [];
  focus = { m, repent, bowTime, depth: repent ? 1.2 : 0.9, bowsEnd, out, end: out + FOCUS_FADE, verse, motes: [], spawn: 0, t: 0, rung: 0, released: false, seated: false, image: avatarImage(m.avatar), label, look: lookFor(m.user) };
  stage.classList.add('focusing');
}

// The close-up: the hall's open central door with the Buddha, the bronze cauldron, and the viewer kneeling before it.
const ROOF = new Path2D('M-20 200H1100V350Q1040 450 940 456H140Q40 450 -20 350Z');
const EAVE = new Path2D('M-20 350Q40 450 140 456H940Q1040 450 1100 350');

function linear(x0, y0, x1, y1, stops) {
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((color, i) => grad.addColorStop(i / (stops.length - 1), color));
  return grad;
}

function drawCloseup(t) {
  ctx.fillStyle = linear(0, 0, 0, 470, ['#16304a', '#7d97a0', '#f0c8a0']);
  ctx.fillRect(0, 0, W, 470);
  glow(130, 300, 560, '255, 214, 160', 0.5);
  // The lower roof across the top, its corners curling up off screen.
  ctx.fillStyle = linear(0, 200, 0, 456, ['#a5603f', '#7b422c']);
  ctx.fill(ROOF);
  ctx.save();
  ctx.clip(ROOF);
  ctx.strokeStyle = 'rgba(70, 32, 20, 0.45)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  for (let x = -30; x < 1120; x += 32) {
    ctx.moveTo(x, 200);
    ctx.lineTo(540 + (x - 540) * 1.08, 460);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#4a281c';
  ctx.lineWidth = 14;
  ctx.stroke(EAVE);
  ctx.setLineDash([9, 24]);
  ctx.strokeStyle = '#efdcb8';
  ctx.lineWidth = 8;
  ctx.stroke(EAVE);
  ctx.setLineDash([]);
  // Wall, side windows and columns.
  ctx.fillStyle = linear(0, 456, 0, 1000, ['#9c845e', '#e5d0a6', '#d6c095']);
  ctx.fillRect(0, 456, W, 560);
  ctx.fillStyle = linear(0, 470, 0, 1000, ['#4a2618', '#b8673a', '#ffcf8c']);
  ctx.fillRect(330, 476, 420, 530);
  ctx.fillStyle = '#5c3626';
  ctx.fillRect(84, 560, 170, 330);
  ctx.fillRect(826, 560, 170, 330);
  ctx.strokeStyle = 'rgba(217, 191, 142, 0.5)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let y = 594; y < 880; y += 34) {
    ctx.moveTo(96, y);
    ctx.lineTo(242, y);
    ctx.moveTo(838, y);
    ctx.lineTo(984, y);
  }
  for (const x of [126, 169, 212, 868, 911, 954]) {
    ctx.moveTo(x, 572);
    ctx.lineTo(x, 878);
  }
  ctx.stroke();
  for (const x of [20, 290, 750, 1020]) {
    ctx.fillStyle = linear(x, 0, x + 44, 0, ['#7d4c33', '#5e3826', '#3e2418']);
    ctx.fillRect(x, 456, 44, 560);
  }
  drawBuddha(t);
  // Courtyard, then the threshold, stone terrace and steps over it.
  ctx.fillStyle = linear(0, 1100, 0, H, ['#c3bdaf', '#7f8784']);
  ctx.fillRect(0, 1100, W, H - 1100);
  ctx.strokeStyle = 'rgba(88, 93, 88, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const y of [1200, 1262, 1340, 1440, 1570, 1740]) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  for (let i = -6; i <= 6; i++) {
    ctx.moveTo(540 + i * 120, 1158);
    ctx.lineTo(540 + i * 330, H);
  }
  ctx.stroke();
  ctx.fillStyle = '#4a2a1c';
  ctx.fillRect(0, 1000, W, 18);
  ctx.fillStyle = linear(0, 1018, 0, 1080, ['#d9d3c3', '#c2bba8']);
  ctx.fillRect(0, 1018, W, 62);
  ctx.fillStyle = '#9a927f';
  ctx.fillRect(0, 1080, W, 40);
  ctx.fillStyle = '#eee8da';
  ctx.fillRect(0, 1080, W, 3);
  for (let i = 0; i < 3; i++) {
    const half = 220 + i * 16;
    ctx.fillStyle = '#ddd7c7';
    ctx.fillRect(540 - half, 1080 + i * 26, half * 2, 14);
    ctx.fillStyle = '#958d7b';
    ctx.fillRect(540 - half, 1094 + i * 26, half * 2, 12);
  }
  // Tall candles on the terrace.
  for (const x of [230, 850]) {
    ctx.fillStyle = linear(x - 10, 0, x + 10, 0, ['#6d5a36', '#c9a764', '#5a4a2c']);
    ctx.fillRect(x - 7, 900, 14, 160);
    ctx.fillRect(x - 30, 1050, 60, 12);
    ctx.fillStyle = '#f3ead6';
    ctx.fillRect(x - 9, 852, 18, 50);
    glow(x, 838, 46, '255, 200, 90', 0.6);
    ctx.fillStyle = '#ffcf4d';
    ctx.beginPath();
    ctx.ellipse(x, 838, 6, 13 + Math.sin(t * 18 + x) * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  drawBigCauldron(t);
}

function drawBuddha() {
  glow(540, 660, 340, '255, 200, 120', 0.35);
  glow(540, 650, 170, '255, 236, 190', 0.55);
  ctx.strokeStyle = 'rgba(255, 228, 150, 0.7)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(540, 650, 140, 0, Math.PI * 2);
  ctx.stroke();
  for (const [angle, scale] of [[-1.25, 1.25], [1.25, 1.25], [-0.62, 1.4], [0.62, 1.4], [0, 1.5]]) drawPetalShape(540, 985, angle, scale, '#a8721f', '#ffe7a2');
  const gold = linear(410, 0, 670, 0, ['#a8721f', '#f6d27a', '#9a6618']);
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.ellipse(540, 920, 150, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(540, 690);
  ctx.bezierCurveTo(600, 690, 628, 720, 636, 770);
  ctx.bezierCurveTo(646, 830, 658, 880, 662, 912);
  ctx.lineTo(418, 912);
  ctx.bezierCurveTo(422, 880, 434, 830, 444, 770);
  ctx.bezierCurveTo(452, 720, 480, 690, 540, 690);
  ctx.fill();
  ctx.strokeStyle = 'rgba(138, 85, 18, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(612, 716);
  ctx.bezierCurveTo(590, 780, 520, 840, 452, 880);
  ctx.moveTo(470, 760);
  ctx.bezierCurveTo(474, 820, 470, 860, 462, 900);
  ctx.moveTo(430, 930);
  ctx.bezierCurveTo(500, 905, 580, 905, 650, 930);
  ctx.stroke();
  ctx.fillStyle = '#f7d98e';
  ctx.beginPath();
  ctx.ellipse(540, 890, 36, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e2ac50';
  ctx.fillRect(522, 672, 36, 24);
  const face = ctx.createRadialGradient(530, 630, 4, 540, 640, 56);
  face.addColorStop(0, '#fff0bd');
  face.addColorStop(0.6, '#e8b24c');
  face.addColorStop(1, '#a36a1a');
  ctx.fillStyle = face;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(540 + side * 41, 648, 8, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(540, 642, 40, 48, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b07a2a';
  ctx.beginPath();
  ctx.ellipse(540, 628, 42, 36, 0, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(540, 590, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6e420e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(540 + side * 8, 645);
    ctx.quadraticCurveTo(540 + side * 17, 652, 540 + side * 27, 645);
    ctx.moveTo(540 + side * 7, 634);
    ctx.quadraticCurveTo(540 + side * 18, 627, 540 + side * 29, 634);
  }
  ctx.moveTo(540, 640);
  ctx.quadraticCurveTo(536, 658, 537, 664);
  ctx.moveTo(530, 674);
  ctx.quadraticCurveTo(540, 679, 550, 674);
  ctx.stroke();
  ctx.fillStyle = '#9a5f16';
  ctx.beginPath();
  ctx.arc(540, 622, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawBigCauldron(t) {
  ctx.fillStyle = 'rgba(24, 34, 38, 0.3)';
  ctx.beginPath();
  ctx.ellipse(540, 1380, 270, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d2cbb9';
  ctx.beginPath();
  ctx.moveTo(330, 1330);
  ctx.lineTo(750, 1330);
  ctx.lineTo(780, 1366);
  ctx.lineTo(300, 1366);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#958d7b';
  ctx.fillRect(300, 1366, 480, 30);
  ctx.strokeStyle = '#3f3424';
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(440, 1290);
  ctx.lineTo(424, 1340);
  ctx.moveTo(640, 1290);
  ctx.lineTo(656, 1340);
  ctx.stroke();
  ctx.fillStyle = linear(352, 0, 728, 0, ['#3a3224', '#8d7446', '#bf9d5f', '#6c5835', '#30291d']);
  ctx.beginPath();
  ctx.moveTo(352, 1180);
  ctx.bezierCurveTo(352, 1290, 430, 1332, 540, 1332);
  ctx.bezierCurveTo(650, 1332, 728, 1290, 728, 1180);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(224, 192, 132, 0.45)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(366, 1236);
  ctx.quadraticCurveTo(540, 1270, 714, 1236);
  ctx.stroke();
  ctx.fillStyle = 'rgba(111, 154, 134, 0.5)';
  for (const [x, y, rx] of [[420, 1270, 16], [650, 1250, 12], [580, 1300, 14]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#7d6740';
  ctx.lineWidth = 20;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(380, 1172);
  ctx.lineTo(380, 1120);
  ctx.quadraticCurveTo(380, 1098, 402, 1098);
  ctx.lineTo(426, 1098);
  ctx.lineTo(426, 1172);
  ctx.moveTo(700, 1172);
  ctx.lineTo(700, 1120);
  ctx.quadraticCurveTo(700, 1098, 678, 1098);
  ctx.lineTo(654, 1098);
  ctx.lineTo(654, 1172);
  ctx.stroke();
  ctx.fillStyle = '#4a3d2a';
  ctx.beginPath();
  ctx.ellipse(540, 1180, 196, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8c7a58';
  ctx.beginPath();
  ctx.ellipse(540, 1183, 172, 27, 0, 0, Math.PI * 2);
  ctx.fill();
  // Three incense sticks, their smoke curling up past the door.
  ctx.lineCap = 'round';
  for (const [i, x] of [500, 540, 580].entries()) {
    const tipX = x + (i - 1) * 10;
    ctx.strokeStyle = '#6e4a2a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, 1186);
    ctx.lineTo(tipX, 1020);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(235, 235, 245, 0.18)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    for (let d = 0; d <= 300; d += 10) ctx.lineTo(tipX + Math.sin(d / 40 - t * 1.6 + i * 2) * (4 + d / 14), 1020 - d);
    ctx.stroke();
    glow(tipX, 1020, 16, '255, 120, 30', 0.9);
  }
}

// The praying viewer, large and seen from behind, kneeling on a cushion and mat before the cauldron.
function drawCloseKneeler(bow) {
  ctx.fillStyle = '#d9c590';
  ctx.strokeStyle = '#a3864d';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(300, 1730);
  ctx.lineTo(780, 1730);
  ctx.lineTo(850, 1900);
  ctx.lineTo(230, 1900);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#94661f';
  ctx.beginPath();
  ctx.ellipse(540, 1832, 150, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d19b42';
  ctx.beginPath();
  ctx.ellipse(540, 1808, 150, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(540, 1830);
  ctx.scale(4, 4);
  drawFigure(focus.look, { pose: 1, bow, flat: 0.34 });
  ctx.restore();
}

// The light around the Buddha swells while the smoke turns to light.
function drawHaloFlare(t) {
  const k = Math.min(1, (t - focus.bowsEnd) / RELEASE_TIME);
  glow(540, 650, 170 + 330 * k, '255, 226, 150', 0.7 - 0.4 * k);
}

// Gray smoke rises from the kneeling viewer during the bows; at the release it turns gold and sparks fly up to the Buddha.
function drawMotes(dt, t, alpha) {
  const motes = focus.motes;
  if (t < focus.out) {
    focus.spawn += dt * (focus.released ? 40 : 8);
    for (; focus.spawn >= 1; focus.spawn--) {
      motes.push(
        focus.released
          ? { x: 540 + rand(-160, 160), y: rand(1450, 1650), vx: rand(-20, 20), vy: rand(-340, -200), r: rand(4, 8), age: 0, life: rand(1.2, 2), gold: 1 }
          : { x: 540 + rand(-170, 170), y: rand(1420, 1600), vx: rand(-12, 12), vy: rand(-70, -40), r: rand(16, 28), age: 0, life: rand(3, 4.5), gold: 0 },
      );
    }
  }
  for (let i = motes.length - 1; i >= 0; i--) {
    const p = motes[i];
    p.age += dt;
    if (p.age > p.life) {
      motes.splice(i, 1);
      continue;
    }
    if (focus.released) {
      p.gold = Math.min(1, p.gold + dt / 0.8);
      p.vy -= 120 * dt;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.gold < 1) p.r += 10 * dt;
    const fade = Math.min(1, p.age * 3) * (1 - p.age / p.life);
    if (p.gold < 1) {
      ctx.globalAlpha = alpha * fade * 0.3 * (1 - p.gold);
      ctx.drawImage(puff, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    if (p.gold > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * fade * p.gold;
      glow(p.x, p.y, p.r * 1.6, '255, 214, 120', 0.9);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.globalAlpha = alpha;
}

function drawVerse(t, alpha) {
  const m = focus.m;
  outlinedText('thành tâm sám hối', 540, 462, 34, '#ffd54a');
  outlinedText(`${m.count > 1 ? `x${m.count} · ` : ''}+${fmt(m.merit)} công đức`, 540, 508, 28, '#fff1b8');
  // One line after another across the three bows.
  const step = (3 * focus.bowTime) / Math.max(1, focus.verse.length);
  focus.verse.forEach(({ text, size }, i) => {
    const k = Math.min(1, (t - BOW_START - i * step) / 0.8);
    if (k <= 0) return;
    ctx.globalAlpha = alpha * k;
    outlinedText(text, 540, 590 + i * 54 + 12 * (1 - k), size, '#fff6da', 600);
  });
  ctx.globalAlpha = alpha;
}

function drawFocus(dt) {
  if (!focus) return;
  // Waiting gifts, or a line of newcomers, speed the close-up along; Sám hối less so, to keep the verse readable.
  const speed = focus.repent ? (queue.length > 6 ? 3 : queue.length ? 1.5 : 1) : queue.length ? 3 : focusQueue.length >= 2 ? 1.5 : 1;
  focus.t += dt * speed;
  const t = focus.t;
  if (!focus.seated && t >= focus.out) {
    focus.seated = true;
    stage.classList.remove('focusing');
    afterFocus(focus.m, focus.repent ? `🙇 ${focus.m.user} thành tâm sám hối` : `🙏 ${focus.m.user} cầu ${focus.m.detail}`);
  }
  if (t >= focus.end) {
    focus = null;
    return;
  }
  if (focus.rung < 3 && t >= BOW_START + (focus.rung + 0.45) * focus.bowTime) {
    focus.rung++;
    if (focus.repent) sound.bowl();
    else sound.chime(392);
  }
  if (focus.repent && !focus.released && t >= focus.bowsEnd) {
    focus.released = true;
    [523, 659, 784].forEach((freq, i) => setTimeout(() => sound.chime(freq), i * 250));
  }
  const alpha = Math.min(1, t / FOCUS_IN, (focus.end - t) / FOCUS_FADE);
  ctx.globalAlpha = alpha;
  ctx.save();
  // Slow dolly-in.
  const zoom = 1.06 - 0.06 * Math.min(1, t / focus.out);
  ctx.translate(540, 1300);
  ctx.scale(zoom, zoom);
  ctx.translate(-540, -1300);
  drawCloseup(t);
  if (focus.released) drawHaloFlare(t);
  glow(540, 1400, 320, '255, 190, 110', 0.14);
  drawCloseKneeler(focusBow(t));
  if (focus.repent) drawMotes(dt * speed, t, alpha);
  ctx.restore();
  const vignette = ctx.createRadialGradient(540, 1000, 450, 540, 1000, 1150);
  vignette.addColorStop(0, 'rgba(10, 22, 26, 0)');
  vignette.addColorStop(1, 'rgba(10, 22, 26, 0.65)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  drawAvatar(focus.image, focus.m.user, 540, 300, 62);
  outlinedText(focus.label, 540, 405, 46, '#ffffff', 800);
  if (focus.repent) drawVerse(t, alpha);
  else outlinedText(`thành tâm cầu ${focus.m.detail}`, 540, 462, 34, '#ffd54a');
  ctx.globalAlpha = 1;
}

function drawFlash(dt) {
  if (flash <= 0) return;
  flash = Math.max(0, flash - dt * 0.4);
  const grad = ctx.createRadialGradient(540, 760, 0, 540, 760, 900);
  grad.addColorStop(0, `rgba(255, 220, 120, ${0.55 * flash})`);
  grad.addColorStop(1, 'rgba(255, 220, 120, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

// ---------- Ambient life ----------
// A thin wisp of incense always rises from the cauldron; birds cross the dawn sky now and then, bodhi leaves drift
// down and fish ripple the ponds, so the courtyard never stands still.
const birds = [];
const leaves = [];
const ripples = [];
let wispIn = 0;
let birdsIn = rand(3, 8);
let leafIn = rand(2, 5);
let rippleIn = rand(2, 4);

function drawAmbient(dt) {
  wispIn -= dt;
  if (wispIn <= 0) {
    wispIn = 0.7;
    smoke.push({ x: BOWL.x + rand(-24, 24), y: BOWL.y - 6, vx: rand(-4, 4), vy: rand(-40, -28), r: rand(4, 6), age: 0, life: rand(3.5, 5), seed: rand(0, 6) });
  }
  birdsIn -= dt;
  if (birdsIn <= 0) {
    birdsIn = rand(16, 32);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const y = rand(300, 560);
    for (let i = 0, n = 2 + Math.floor(Math.random() * 4); i < n; i++) {
      birds.push({ x: dir > 0 ? -30 - i * rand(30, 60) : W + 30 + i * rand(30, 60), y: y + rand(-30, 30), vx: dir * rand(70, 95), vy: rand(-6, 3), flap: rand(0, 6), size: rand(0.8, 1.2) });
    }
  }
  ctx.strokeStyle = 'rgba(38, 54, 60, 0.75)';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = birds.length - 1; i >= 0; i--) {
    const b = birds[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.flap += dt * 9;
    if (b.x < -400 || b.x > W + 400) {
      birds.splice(i, 1);
      continue;
    }
    const wing = Math.sin(b.flap) * 5 * b.size;
    const span = 9 * b.size;
    ctx.moveTo(b.x - span, b.y - wing);
    ctx.quadraticCurveTo(b.x - span / 2, b.y - wing - 2, b.x, b.y);
    ctx.quadraticCurveTo(b.x + span / 2, b.y - wing - 2, b.x + span, b.y - wing);
  }
  ctx.stroke();
  leafIn -= dt;
  if (leafIn <= 0) {
    leafIn = wind ? rand(0.2, 0.6) : rand(3, 7);
    leaves.push({ x: rand(790, 1050), y: rand(640, 780), vx: rand(-22, -6), vy: rand(34, 48), rot: rand(0, 6), spin: rand(-2.5, 2.5), age: 0, life: rand(9, 11), land: rand(880, 1010), seed: rand(0, 6), color: Math.random() < 0.3 ? '#cdb35c' : '#6f9a5a' });
  }
  for (let i = leaves.length - 1; i >= 0; i--) {
    const l = leaves[i];
    l.age += dt;
    if (l.age > l.life) {
      leaves.splice(i, 1);
      continue;
    }
    if (l.y < l.land) {
      l.x += (l.vx + Math.sin(l.age * 2.2 + l.seed) * 20 + wind) * dt;
      l.y += l.vy * dt;
      l.rot += l.spin * dt;
    }
    ctx.save();
    ctx.globalAlpha = Math.min(1, (l.life - l.age) / 1.5, l.age * 2);
    ctx.translate(l.x, l.y);
    ctx.rotate(l.rot);
    ctx.fillStyle = l.color;
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.quadraticCurveTo(0, -4.5, 7, 0);
    ctx.quadraticCurveTo(0, 4.5, -7, 0);
    ctx.fill();
    ctx.restore();
  }
  rippleIn -= dt;
  if (rippleIn <= 0) {
    rippleIn = rand(2.5, 5);
    const side = Math.random() < 0.5 ? -1 : 1;
    const y = rand(POND.y0 + 30, POND.y1 - 20);
    const s = scaleAt(y);
    ripples.push({ x: 540 + side * rand(POND.x0 + 80, (540 - 40) / s) * s, y, age: 0 });
  }
  ctx.lineWidth = 1.5;
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.age += dt;
    if (r.age > 2.4) {
      ripples.splice(i, 1);
      continue;
    }
    for (const lag of [0, 0.5]) {
      const k = (r.age - lag) / 1.9;
      if (k <= 0 || k >= 1) continue;
      const rx = 6 + 34 * k;
      ctx.strokeStyle = `rgba(235, 245, 240, ${0.55 * (1 - k)})`;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rx, rx * flatAt(r.y), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// ---------- Weather ----------
// Now and then a spell of bright sun, rain or strong wind passes over the courtyard, fading in and out. Wind gusts are
// planned up front, so the picture and the sound rise and fall together.
const WEATHER_FADE = 4;
const WIND = 420;
const SUN = { x: 205, y: 492 };
const weather = { kind: '', last: '', t: 0, length: 0, k: 0, next: rand(20, 40), dir: 1, gusts: [] };
// Sideways push on smoke, petals and leaves, in px/s.
let wind = 0;
const drops = [];
const splashes = [];
const blown = [];
const gustLines = [];
const sunDust = [];
const BLOWN_COLORS = ['#6f9a5a', '#88a85e', '#cdb35c', '#a7c47a', '#ff9ec4', '#ffc4dc'];
const crown = $('crown');
const rays = $('rays');
const hangingLanterns = [...document.querySelectorAll('.sway')];
// Where the sun glints on the two ponds.
const glints = Array.from({ length: 14 }, (_, i) => {
  const y = rand(POND.y0 + 20, POND.y1 - 20);
  const s = scaleAt(y);
  return { x: 540 + (i % 2 ? 1 : -1) * rand(POND.x0 + 60, (540 - 20) / s) * s, y, size: rand(10, 18) * s, phase: rand(0, 6) };
});
const onPond = (x, y) => y > POND.y0 + 15 && y < POND.y1 - 10 && Math.abs(x - 540) > (POND.x0 + 30) * scaleAt(y);
const weatherLevel = (t) => Math.max(0, Math.min(1, t / WEATHER_FADE, (weather.length - t) / WEATHER_FADE));
const setStyle = (el, prop, value) => el.style[prop] !== value && (el.style[prop] = value);

function gustAt(t) {
  const g = weather.gusts;
  let i = 1;
  while (i < g.length - 1 && g[i].t < t) i++;
  return lerp(g[i - 1].v, g[i].v, Math.min(1, Math.max(0, (t - g[i - 1].t) / (g[i].t - g[i - 1].t))));
}

function startWeather() {
  const kinds = ['sun', 'rain', 'wind'].filter((kind) => kind !== weather.last);
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  Object.assign(weather, { kind, last: kind, t: 0, length: rand(30, 45), dir: Math.random() < 0.5 ? -1 : 1, gusts: [] });
  // Mostly brisk, now and then a strong gust.
  for (let t = 0; t < weather.length + 2; t += rand(0.8, 1.6)) weather.gusts.push({ t, v: Math.random() < 0.2 ? rand(1.1, 1.4) : rand(0.45, 0.9) });
  weatherSound(kind);
}

function updateWeather(dt) {
  if (!weather.kind) {
    weather.next -= dt;
    if (weather.next <= 0) startWeather();
  } else if ((weather.t += dt) >= weather.length) {
    Object.assign(weather, { kind: '', next: rand(60, 150) });
  }
  weather.k = weather.kind ? weatherLevel(weather.t) : 0;
  wind = weather.kind === 'wind' ? weather.dir * WIND * weather.k * gustAt(weather.t) : 0;
  // The bodhi tree leans and tosses, the hanging lanterns swing, and rain hides the sun's rays.
  const w = wind / WIND;
  setStyle(crown, 'rotate', w ? `${(w * 3.5 + Math.sin(weather.t * 5.3) * w * 1.2).toFixed(2)}deg` : '');
  for (const el of hangingLanterns) setStyle(el, 'rotate', w ? `${(w * 12 + Math.sin(weather.t * 6.1) * w * 8).toFixed(1)}deg` : '');
  setStyle(rays, 'fillOpacity', weather.kind === 'rain' ? String(Math.round((1 - weather.k) * 100) / 100) : '');
}

// Looped white noise, shaped into rain or wind by a filter.
let noiseBuffer;
function noiseSource() {
  if (!noiseBuffer) {
    noiseBuffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return Object.assign(audio.createBufferSource(), { buffer: noiseBuffer, loop: true });
}

// Rain hisses, the wind roars with its gusts, birds sing in the sun.
function weatherSound(kind) {
  if (muted || audio.state !== 'running') return;
  const t0 = audio.currentTime;
  if (kind === 'sun') {
    for (let t = rand(1.5, 4); t < weather.length - 2; t += rand(2.5, 6)) {
      const pitch = rand(2400, 3600);
      for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) {
        const start = t0 + t + i * 0.14;
        tone(pitch, start, 0.09, 0.04).frequency.exponentialRampToValueAtTime(pitch * 1.4, start + 0.07);
      }
    }
    return;
  }
  const rain = kind === 'rain';
  const src = noiseSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  filter.type = rain ? 'lowpass' : 'bandpass';
  filter.frequency.value = rain ? 2800 : 500;
  filter.Q.value = rain ? 0.7 : 0.9;
  gain.gain.setValueAtTime(0, t0);
  for (let t = 0.25; t <= weather.length; t += 0.25) {
    const gust = rain ? 1 : gustAt(t);
    gain.gain.linearRampToValueAtTime((rain ? 0.25 : 0.45) * weatherLevel(t) * gust, t0 + t);
    if (!rain) filter.frequency.linearRampToValueAtTime(300 + 450 * gust, t0 + t);
  }
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
  src.stop(t0 + weather.length + 0.2);
}

// Over the people but under their name tags.
function drawWeather(dt) {
  drawRain(dt);
  drawSunshine(dt);
  drawGale(dt);
}

// Rain darkens the courtyard and falls slanted; drops splash on the stones and ring the ponds.
function drawRain(dt) {
  const k = weather.kind === 'rain' ? weather.k : 0;
  if (!k && !drops.length && !splashes.length) return;
  if (k) {
    ctx.fillStyle = `rgba(20, 32, 46, ${0.34 * k})`;
    ctx.fillRect(0, 0, W, H);
  }
  const want = Math.round(420 * k);
  const slant = weather.dir * 0.14;
  // Drops landing far back are smaller and slower on screen.
  const spawn = (p) => {
    const land = rand(FLOOR_Y, H + 60);
    const s = scaleAt(Math.min(land, H));
    return Object.assign(p, { x: rand(-150, W + 150), y: rand(-300, -20), land, vy: rand(1300, 1800) * s, len: rand(26, 44) * s });
  };
  while (drops.length < want) drops.push(spawn({}));
  ctx.strokeStyle = 'rgba(214, 228, 240, 0.5)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = drops.length - 1; i >= 0; i--) {
    const p = drops[i];
    p.y += p.vy * dt;
    p.x += p.vy * slant * dt;
    if (p.y >= p.land) {
      if (p.land < H && Math.random() < 0.5) splashes.push({ x: p.x, y: p.land, age: 0, pond: onPond(p.x, p.land) });
      if (drops.length > want) {
        drops.splice(i, 1);
        continue;
      }
      spawn(p);
    }
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.len * slant, p.y - p.len);
  }
  ctx.stroke();
  cap(splashes, 160);
  ctx.lineWidth = 1.3;
  for (let i = splashes.length - 1; i >= 0; i--) {
    const s = splashes[i];
    const life = s.pond ? 0.6 : 0.3;
    s.age += dt;
    if (s.age > life) {
      splashes.splice(i, 1);
      continue;
    }
    const q = s.age / life;
    const r = (s.pond ? 4 + 12 * q : 2 + 7 * q) * scaleAt(s.y);
    ctx.strokeStyle = `rgba(225, 236, 245, ${0.6 * (1 - q)})`;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r, r * flatAt(s.y), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Bright sun: warm light from the sunrise, shafts sweeping the courtyard, glittering dust and sparkles on the ponds.
function drawSunshine(dt) {
  const k = weather.kind === 'sun' ? weather.k : 0;
  if (!k) return;
  const t = weather.t;
  ctx.globalCompositeOperation = 'lighter';
  const wash = ctx.createRadialGradient(SUN.x, SUN.y, 0, SUN.x, SUN.y, 1800);
  wash.addColorStop(0, `rgba(255, 214, 150, ${0.4 * k})`);
  wash.addColorStop(1, 'rgba(255, 214, 150, 0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++) {
    const angle = 0.45 + i * 0.2 + Math.sin(t * 0.23 + i * 1.7) * 0.04;
    const spread = 0.022 + 0.012 * Math.sin(t * 0.37 + i * 2.3);
    const shaft = ctx.createLinearGradient(SUN.x, SUN.y, SUN.x + Math.cos(angle) * 2300, SUN.y + Math.sin(angle) * 2300);
    shaft.addColorStop(0, `rgba(255, 232, 180, ${k * (0.22 + 0.1 * Math.sin(t * 0.8 + i * 2.1))})`);
    shaft.addColorStop(1, 'rgba(255, 232, 180, 0)');
    ctx.fillStyle = shaft;
    ctx.beginPath();
    ctx.moveTo(SUN.x, SUN.y);
    ctx.lineTo(SUN.x + Math.cos(angle - spread) * 2300, SUN.y + Math.sin(angle - spread) * 2300);
    ctx.lineTo(SUN.x + Math.cos(angle + spread) * 2300, SUN.y + Math.sin(angle + spread) * 2300);
    ctx.fill();
  }
  while (sunDust.length < 60) sunDust.push({ x: rand(0, W), y: rand(620, H), vx: rand(-8, 8), vy: rand(-12, -3), r: rand(1.5, 3.2), phase: rand(0, 6) });
  ctx.fillStyle = '#fff1c8';
  for (const p of sunDust) {
    p.x = (p.x + p.vx * dt + W) % W;
    p.y += p.vy * dt;
    if (p.y < 620) p.y = H;
    ctx.globalAlpha = k * Math.sin(p.phase + t * 1.8) ** 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#fff6dc';
  ctx.lineWidth = 2;
  for (const g of glints) {
    const twinkle = Math.max(0, Math.sin(g.phase + t * 2.6)) ** 3;
    if (!twinkle) continue;
    const r = g.size * twinkle;
    ctx.globalAlpha = k * twinkle;
    ctx.beginPath();
    ctx.moveTo(g.x - r, g.y);
    ctx.lineTo(g.x + r, g.y);
    ctx.moveTo(g.x, g.y - r * 0.6);
    ctx.lineTo(g.x, g.y + r * 0.6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// Strong wind: leaves and petals tear across the courtyard and streaks of air rush past.
function drawGale(dt) {
  const k = weather.kind === 'wind' ? weather.k : 0;
  if (!k && !blown.length && !gustLines.length) return;
  const dir = weather.dir;
  while (blown.length < Math.round(55 * k)) {
    blown.push({ x: dir > 0 ? rand(-80, -10) : rand(W + 10, W + 80), y: rand(560, H - 40), mult: rand(0.8, 1.4), vy: rand(-30, 40), rot: rand(0, 6), spin: rand(-10, 10), seed: rand(0, 6), size: rand(1.5, 2.5), color: BLOWN_COLORS[Math.floor(Math.random() * BLOWN_COLORS.length)] });
  }
  // As the wind drops, whatever is still in the air settles.
  const calm = 1 - Math.min(1, Math.abs(wind) / WIND);
  for (let i = blown.length - 1; i >= 0; i--) {
    const l = blown[i];
    l.x += (wind * l.mult + dir * 80) * dt;
    l.y += (l.vy + Math.sin(l.x * 0.012 + l.seed) * 50 + 160 * calm) * dt;
    l.rot += l.spin * dt;
    if (l.x < -100 || l.x > W + 100 || l.y > H + 30) {
      blown.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.rot);
    ctx.scale(l.size, l.size);
    ctx.fillStyle = l.color;
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.quadraticCurveTo(0, -4.5, 7, 0);
    ctx.quadraticCurveTo(0, 4.5, -7, 0);
    ctx.fill();
    ctx.restore();
  }
  if (k && Math.random() < dt * 14 * k) gustLines.push({ x: rand(-300, W + 300), y: rand(600, H - 40), len: rand(140, 300), bend: rand(-12, 12), age: 0, life: rand(0.5, 0.9) });
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let i = gustLines.length - 1; i >= 0; i--) {
    const g = gustLines[i];
    g.age += dt;
    if (g.age > g.life) {
      gustLines.splice(i, 1);
      continue;
    }
    g.x += wind * 2.2 * dt;
    ctx.strokeStyle = `rgba(245, 248, 250, ${0.5 * Math.sin((Math.PI * g.age) / g.life)})`;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.quadraticCurveTo(g.x - (dir * g.len) / 2, g.y + g.bend, g.x - dir * g.len, g.y);
    ctx.stroke();
  }
}

// ---------- Actions ----------
function avatarElement(url, name) {
  const fallback = () => Object.assign(document.createElement('span'), { className: 'avatar initial', textContent: initial(name) });
  if (!url) return fallback();
  const image = Object.assign(new Image(), { className: 'avatar', alt: '', referrerPolicy: 'no-referrer' });
  image.onerror = () => image.replaceWith(fallback());
  image.src = url;
  return image;
}

const textSpan = (text) => Object.assign(document.createElement('span'), { className: 'text', textContent: text });

function showToast(nodes, { big = false, note = false, duration = 2600 } = {}) {
  toast.replaceChildren(...nodes);
  toast.classList.toggle('big', big);
  toast.classList.toggle('note', note);
  toast.getAnimations().forEach((animation) => animation.cancel());
  toast.animate(
    [
      { opacity: 0, transform: 'translate(-50%, 14px) scale(0.9)' },
      { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: 0.1 },
      { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: 0.85 },
      { opacity: 0, transform: 'translate(-50%, -12px) scale(1)' },
    ],
    { duration, easing: 'ease-out' },
  );
}

// Joins come in bursts: show one at a time, faster while others wait, and keep only the latest few.
const welcomeQueue = [];
let welcoming = false;
function welcome(m) {
  welcomeQueue.push(m);
  cap(welcomeQueue, 5);
  if (!welcoming) showNextWelcome();
}

function showNextWelcome() {
  const m = welcomeQueue.shift();
  welcoming = Boolean(m);
  if (!m) return;
  welcomeBox.replaceChildren(avatarElement(m.avatar, m.user), textSpan(`Chào mừng ${m.user}`));
  const duration = welcomeQueue.length ? 1300 : 2600;
  welcomeBox.animate(
    [
      { opacity: 0, transform: 'translate(-50%, -8px)' },
      { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.12 },
      { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.85 },
      { opacity: 0, transform: 'translate(-50%, 0)' },
    ],
    { duration, easing: 'ease-out' },
  );
  // A timer, not onfinish: finish events wait for rendering, which stops while the window is hidden.
  setTimeout(showNextWelcome, duration);
}

function describe(m) {
  const times = m.count > 1 ? ` x${m.count}` : '';
  const via = { gift: `tặng ${m.detail}${times}`, follow: 'vừa follow', share: 'vừa chia sẻ live' }[m.via] ?? '';
  return `${ICON[m.action] ?? '🙏'} ${m.user} ${via} → ${LABEL[m.action]}`;
}

function ringBell() {
  bell.animate(
    [{ transform: 'rotate(0deg)' }, { transform: 'rotate(9deg)' }, { transform: 'rotate(-7deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(-2deg)' }, { transform: 'rotate(0deg)' }],
    { duration: 2400, easing: 'ease-out' },
  );
  // The hanging log swings into the bell.
  striker.animate([{ transform: 'rotate(-14deg)' }, { transform: 'rotate(10deg)', offset: 0.18 }, { transform: 'rotate(-5deg)', offset: 0.5 }, { transform: 'rotate(0deg)' }], { duration: 1400, easing: 'ease-out' });
  for (let i = 0; i < 3; i++) rings.push({ x: 135, y: 752, age: -i * 0.35, life: 1.8, max: 360 });
  addSparks(135, 752, 30, 200);
  sound.bell();
}

let lastKnock = 0;
function strike() {
  const now = performance.now();
  if (now - lastKnock < 140) return;
  lastKnock = now;
  mallet.animate([{ transform: 'rotate(14deg)' }, { transform: 'rotate(0deg)', offset: 0.35 }, { transform: 'rotate(14deg)' }], { duration: 260, easing: 'ease-out' });
  mo.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06, 0.93)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  sound.knock();
}

function knock(m) {
  // A viewer who keeps liking keeps one label whose total counts up.
  const label = texts.find((t) => t.kind === 'like' && t.name === m.user);
  if (label) {
    label.merit += m.merit;
    label.text = `+${fmt(label.merit)} công đức`;
    label.age = Math.min(label.age, 0.3);
  } else {
    const likeLabels = texts.filter((t) => t.kind === 'like');
    let slot = [0, 1, 2].find((s) => !likeLabels.some((t) => t.slot === s));
    if (slot === undefined) {
      const oldest = likeLabels.reduce((a, b) => (b.age > a.age ? b : a));
      slot = oldest.slot;
      texts.splice(texts.indexOf(oldest), 1);
    }
    addText(`+${fmt(m.merit)} công đức`, 930, 796 + slot * 52, { size: 26, color: '#fff1d6', name: m.user, kind: 'like', merit: m.merit, slot, rise: 12 });
  }
  strike();
}

// Timed temple rituals from the server: no merit, no names.
function ritual(m) {
  if (m.action === 'mo') {
    for (let i = 0; i < Math.min(m.count, 20); i++) setTimeout(strike, i * 650);
  } else if (m.action === 'incense') {
    addSticks(Math.min(m.count, 5));
    sound.chime(660);
  } else if (m.action === 'bell') {
    ringBell();
  } else if (m.action === 'speak') {
    showToast([textSpan(`🙏 ${m.text}`)], { note: true, duration: 9000 });
  }
}

let lastWishSound = 0;
function wishChime() {
  if (performance.now() - lastWishSound > 1200) {
    lastWishSound = performance.now();
    sound.chime(988);
  }
}

const inFocusLine = (user) => focus?.m.user === user || focusQueue.some((q) => q.user === user);

function wish(m) {
  const d = devoteeAt(m.user);
  const waiting = inFocusLine(m.user);
  // Viewers who walked in when joining the room still get the close-up for their first prayer.
  if (d && (!d.newcomer || (!waiting && focusQueue.length >= 3))) {
    // Praying again: finish the bow under way; back on their cushion they get up and pray at the mats.
    if (atSeat(d)) d.bows = Math.min(d.bows, Math.max(0, Math.ceil((d.age - d.bowAt - BOW_LEAD) / d.bowTime)));
    if (!d.mat && !altarQueue.includes(d)) d.wantsAltar = true;
    d.newcomer = false;
    d.image = avatarImage(m.avatar);
    d.seq = ++devoteeSeq;
    showCard(d, `🙏 ${m.user} cầu ${m.detail}`);
    wishChime();
  } else if (!waiting) {
    // A long line skips the close-up: the newcomer walks in and prays at the mats instead.
    if (focusQueue.length >= 3) enter(m);
    else focusQueue.push(m);
  }
}

function enter(m) {
  const d = addDevotee(m, 540, ENTRY_Y, 0);
  d.plan = [
    lineUp(d),
    call(() => {
      if (altarQueue.length < MATS.filter((mat) => !mat.by).length) {
        altarQueue.push(d);
      } else {
        // The mats are busy: take the seat first and go up when a mat is free.
        d.plan.push(walk(pathFromBelow(d)), kneel(), call(() => altarQueue.push(d)));
      }
    }),
  ];
  showCard(d, `🙏 ${m.user} cầu ${m.detail}`);
  wishChime();
}

// Viewers joining the room walk in from below and take a cushion, one every ARRIVE_GAP seconds at most; a burst keeps
// only the latest few.
const ARRIVE_GAP = 1.5;
const arrivals = [];
let arriveIn = 0;

function arrive(m) {
  if (arrivals.some((a) => a.user === m.user)) return;
  arrivals.push(m);
  cap(arrivals, 6);
}

function admitArrivals(dt) {
  arriveIn = Math.max(0, arriveIn - dt);
  while (!arriveIn && arrivals.length) {
    const m = arrivals.shift();
    // Already here, or about to appear after their prayer close-up.
    if (devoteeAt(m.user) || inFocusLine(m.user)) continue;
    const d = addDevotee(m, 540, ENTRY_Y, 0);
    d.newcomer = true;
    d.plan = [lineUp(d), walk(pathFromBelow(d)), kneel()];
    arriveIn = ARRIVE_GAP;
  }
}

// The close-up ends on the viewer kneeling at a prayer mat; they get up, walk to their seat and kneel there.
function afterFocus(m, card) {
  let d = devoteeAt(m.user);
  if (d) {
    releaseMat(d);
    unqueue(d);
    d.image = avatarImage(m.avatar);
    d.seq = ++devoteeSeq;
    d.newcomer = false;
  } else {
    d = addDevotee(m, 540, FRONT_Y, 0);
  }
  d.bowAt = -Infinity;
  const mat = MATS.find((free) => !free.by);
  if (mat) {
    mat.by = d;
    Object.assign(d, { mat, x: mat.x, y: mat.y, pose: 1, facing: 1 });
    d.plan = [wait(0.8), rise(), call(releaseMat), walk(pathToSeat(d)), kneel()];
  } else {
    Object.assign(d, { x: 540, y: FRONT_Y, pose: 0 });
    d.plan = [walk(pathToSeat(d)), kneel()];
  }
  showCard(d, card);
  wishChime();
}

// More pigs from the same viewer (a combo) add to their Sám hối instead of queueing another one.
function joinRepent(m) {
  if (m.action !== 'repent') return false;
  const same = focus?.repent && !focus.seated && focus.m.user === m.user ? focus.m : queue.find((q) => q.action === 'repent' && q.user === m.user);
  if (!same) return false;
  same.count += m.count;
  same.merit += m.merit;
  return true;
}

// Plays one queued action and returns how long (ms) to wait before the next one.
function perform(m) {
  const big = m.action === 'ceremony';
  showToast([avatarElement(m.avatar, m.user), textSpan(describe(m))], { big, duration: big ? 4000 : 2600 });
  if (m.merit > 0 && !['bell', 'mo', 'flower', 'repent'].includes(m.action)) addText(`+${fmt(m.merit)} công đức`, 540, 930, { name: m.user });
  switch (m.action) {
    case 'incense':
      addSticks(Math.min(m.count, 5));
      sound.chime(660);
      return 900;
    case 'flower':
      addPetals(30 + Math.min(m.count, 20) * 5, 120, 960);
      vases.forEach((vase) => vase.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 900, easing: 'ease-out' }));
      // One offering portrait at a time; the newest replaces the previous one.
      for (let i = texts.length - 1; i >= 0; i--) if (texts[i].kind === 'offering') texts.splice(i, 1);
      addText(`+${fmt(m.merit)} công đức`, 540, 960, { name: m.user, kind: 'offering', avatar: m.avatar ?? '', wreath: true, rise: 30, life: 3.6 });
      sound.chime(784);
      return 1500;
    case 'lantern':
      addLanterns(m.user, Math.min(m.count, 4));
      sound.chime(523);
      return 1200;
    case 'bell':
      ringBell();
      addText(`+${fmt(m.merit)} công đức`, 135, 660, { name: m.user });
      return 2200;
    case 'ceremony':
      flash = 1;
      ringBell();
      addPetals(160, 30, 1050, true);
      addSparks(540, 860, 90, 420);
      addSticks(3);
      halo.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.6)', opacity: 1 }, { transform: 'scale(1)', opacity: 1 }], { duration: 3500, easing: 'ease-in-out' });
      addLanterns(m.user, 2);
      [523, 659, 784].forEach((freq, i) => setTimeout(() => sound.chime(freq), i * 250));
      return 4200;
    case 'repent':
      startFocus(m);
      return 0;
    case 'mo':
      knock(m);
      return 300;
    default:
      return 600;
  }
}

// ---------- UI ----------
function renderTop(list) {
  if (!list.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Chưa có ai, hãy là người đầu tiên!';
    topList.replaceChildren(empty);
    return;
  }
  topList.replaceChildren(
    ...list.map((entry, i) => {
      const li = document.createElement('li');
      for (const [className, text] of [['rank', MEDALS[i]], ['name', entry.name], ['pts', fmt(entry.merit)]]) {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = text;
        li.append(span);
      }
      return li;
    }),
  );
}

function giftIcon(src) {
  const image = Object.assign(new Image(), { className: 'gift-icon', alt: '', src });
  image.onerror = () => image.replaceWith('🎁 ');
  return image;
}

function renderGuide(guide) {
  const groups = [
    {
      list: socialGuideList,
      items: [
        { what: '❤️ Like', result: LABEL.mo },
        { what: '➕ Follow', result: LABEL[guide.social.follow] },
        { what: '🔁 Share', result: LABEL[guide.social.share] },
        { what: '💬 Bình luận', result: guide.wishes.map((text) => text.toLowerCase()).join(' · ') },
      ],
    },
    {
      list: giftGuideList,
      items: [
        ...guide.gifts.map((gift) => ({ icon: gift.icon, what: gift.icon ? '' : gift.label, result: LABEL[gift.action] })),
        ...[...guide.tiers].reverse().map((tier) => ({ icon: tier.icon, what: tier.icon ? '' : `🎁 ${tier.minCoins}+ xu`, result: LABEL[tier.action] })),
      ],
    },
  ];
  for (const { list, items } of groups) {
    list.replaceChildren(
      ...items.map(({ icon, what, result }) => {
        const li = document.createElement('li');
        const b = document.createElement('b');
        const text = document.createElement('span');
        if (icon) b.append(giftIcon(icon));
        if (what) b.append(`${what}: `);
        text.textContent = result;
        li.append(b, text);
        return li;
      }),
    );
  }
}

// ---------- Main loop & server events ----------
const queue = [];
let nextAt = 0;
let shownTotal = 0;
let targetTotal = 0;
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!focus && queue.length && now >= nextAt && !cam.k) {
    const m = queue.shift();
    nextAt = now + perform(m) * (queue.length > 6 ? 0.35 : 1);
  }
  if (!focus && !queue.length && focusQueue.length && now >= nextAt && !cam.k) startFocus(focusQueue.shift());
  if (shownTotal !== targetTotal) {
    shownTotal += (targetTotal - shownTotal) * Math.min(1, dt * 5);
    if (Math.abs(targetTotal - shownTotal) < 1) shownTotal = targetTotal;
    totalValue.textContent = fmt(shownTotal);
  }
  updateWeather(dt);
  ctx.clearRect(0, 0, W, H);
  drawFlash(dt);
  drawAmbient(dt);
  // Lanterns float on the ponds, behind anyone walking past.
  drawLanterns(dt);
  drawRings(dt);
  drawSticks(dt);
  drawSmoke(dt);
  // The courtyard waits while the close-up covers it, so viewers still see everyone walk.
  const hallDt = focus && focus.t >= FOCUS_IN && focus.t < focus.out ? 0 : dt;
  drawDevotees(hallDt);
  drawWeather(dt);
  drawTags(hallDt);
  updateCamera(dt, now);
  drawPetals(dt);
  drawWishCards(dt);
  drawSparks(dt);
  drawTexts(dt);
  drawFocus(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const events = new EventSource('/events');
events.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  // Succeeds once this page has been clicked.
  if (audio.state === 'suspended' && (msg.type === 'action' || msg.type === 'speak')) audio.resume().catch(() => {});
  if (msg.type === 'snapshot') {
    renderGuide(msg.guide);
    repentVerse = msg.guide.repentVerse ?? [];
  }
  if (msg.type === 'snapshot' || msg.type === 'state') {
    targetTotal = msg.total;
    renderTop(msg.top);
  }
  if (msg.type === 'speak') speak(msg.id);
  if (msg.type === 'ritual') ritual(msg);
  if (msg.type === 'join') {
    welcome(msg);
    arrive(msg);
  }
  if (msg.type === 'action') {
    if (msg.via === 'like') knock(msg);
    else if (msg.action === 'wish') wish(msg);
    else if (!joinRepent(msg)) {
      queue.push(msg);
      cap(queue, 80);
    }
  }
};
