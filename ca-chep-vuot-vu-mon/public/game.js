const W = 1080;
const H = 1920;
const $ = (id) => document.getElementById(id);

const stage = $('stage');
const ctx = $('fx').getContext('2d');
const toast = $('toast');
const welcomeBox = $('welcome');
const guideList = $('guide');
const topList = $('top');
const roundTitle = $('round-title');
const timerText = $('timer');
const roundNote = $('round-note');
const noteText = $('note');

const EFFECT = { splash: 'Bọt sóng', wave: 'Sóng lớn', surge: 'Nước dâng', rain: 'Mưa vàng', dragon: 'Rồng thần' };
const MEDALS = ['🥇', '🥈', '🥉', '4', '5'];

const rand = (min, max) => min + Math.random() * (max - min);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const smooth = (t) => t * t * (3 - 2 * t);
// Share of the remaining distance covered in one frame, the same at any frame rate.
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const pctText = (n) => `+${n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
const cap = (list, max) => list.length > max && list.splice(0, list.length - max);

function fit() {
  const scale = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
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
const running = () => audio.state === 'running';

// Vbee voice clips play one at a time; everything else is ducked so the voice stays clear.
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

// Two seconds of white noise: looped for the waterfall, cut short for splashes.
const noise = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
{
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

function hiss(start, duration, peak, frequency, Q = 0.8) {
  const source = new AudioBufferSourceNode(audio, { buffer: noise, loop: true });
  const gain = new GainNode(audio, { gain: 0.0001 });
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(new BiquadFilterNode(audio, { type: 'bandpass', frequency, Q })).connect(gain).connect(master);
  source.start(start, Math.random() * 1.5);
  source.stop(start + duration + 0.05);
}

// Đàn tranh pluck: bright attack, quick decay and the small downward bend of a pressed string.
function pluck(freq, start, peak) {
  tone(freq * 1.03, start, 1.4, peak, 'triangle').frequency.exponentialRampToValueAtTime(freq, start + 0.08);
  tone(freq * 2, start, 0.5, peak * 0.25);
}

// D major pentatonic.
const NOTES = [587.33, 659.25, 739.99, 880, 987.77, 1174.66, 1318.51, 1479.98];
let lastBubble = 0;
const sound = {
  bubble() {
    if (!running() || audio.currentTime - lastBubble < 0.09) return;
    lastBubble = audio.currentTime;
    const t = audio.currentTime;
    const f = rand(330, 480);
    tone(f, t, 0.12, 0.08).frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.08);
  },
  splash(peak = 0.22) {
    if (!running()) return;
    const t = audio.currentTime;
    hiss(t, 0.35, peak, 1300);
    hiss(t + 0.02, 0.18, peak * 0.6, 3200, 1.2);
  },
  pluck() {
    if (running()) pluck(NOTES[Math.floor(rand(0, NOTES.length))], audio.currentTime, 0.1);
  },
  arpeggio(count, peak = 0.12) {
    if (!running()) return;
    const t = audio.currentTime;
    for (let i = 0; i < count; i++) pluck(NOTES[i % NOTES.length], t + i * 0.1, peak);
  },
  drum() {
    if (!running()) return;
    const t = audio.currentTime;
    tone(130, t, 0.5, 0.55).frequency.exponentialRampToValueAtTime(50, t + 0.3);
    hiss(t, 0.06, 0.12, 900);
  },
  gong() {
    if (!running()) return;
    const t = audio.currentTime;
    // Inharmonic partials, each split in two detuned oscillators for a slow shimmer.
    for (const [ratio, amp, duration] of [[1, 0.6, 6], [1.47, 0.35, 5], [2.09, 0.3, 4], [2.92, 0.18, 3], [4.15, 0.1, 2]]) {
      tone(98 * ratio - 0.5, t, duration, amp * 0.11);
      tone(98 * ratio + 0.5, t, duration, amp * 0.11);
    }
    hiss(t, 0.4, 0.1, 600, 0.5);
  },
  tick() {
    if (running()) tone(1320, audio.currentTime, 0.06, 0.12, 'triangle');
  },
};

// ---------- Ambience: rushing water and a zither tune, generated live so it never loops ----------
const TUNE = [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99, 880];
let ambienceOn = false;
let nextNote = 0;
let step = 3;

function startAmbience() {
  if (ambienceOn || muted || !running()) return;
  ambienceOn = true;
  const water = new AudioBufferSourceNode(audio, { buffer: noise, loop: true });
  water
    .connect(new BiquadFilterNode(audio, { type: 'lowpass', frequency: 900 }))
    .connect(new BiquadFilterNode(audio, { type: 'highpass', frequency: 140 }))
    .connect(new GainNode(audio, { gain: 0.07 }))
    .connect(master);
  water.start();
  scheduleMusic();
}

// Schedules a few seconds ahead on the audio clock, so slow timers never cause gaps.
function scheduleMusic() {
  if (!ambienceOn) return;
  const now = audio.currentTime;
  nextNote = Math.max(nextNote, now + 0.3);
  while (nextNote < now + 4) {
    step = clamp(step + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)], 0, TUNE.length - 1);
    pluck(TUNE[step], nextNote, 0.045);
    // Short phrases with a breath between them.
    nextNote += Math.random() < 0.15 ? rand(1.5, 2.8) : [0.36, 0.36, 0.72, 0.72, 1.08][Math.floor(Math.random() * 5)];
  }
}
setInterval(scheduleMusic, 1000);
audio.addEventListener('statechange', startAmbience);
startAmbience();

// ---------- Scene geometry (matches the SVG in index.html) ----------
const CREST_Y = 836;
const BASE_Y = 1440;
// Where a carp swims at p just above 0 (out of the pond) and at p = 1 (at the lip, under Vũ Môn).
const BOTTOM_Y = 1404;
const TOP_Y = 862;
const GATE = { x: 540, y: 768 };
const POND = { x0: 120, x1: 960, y0: 1488, y1: 1690 };
const fallsLeft = (y) => lerp(380, 200, clamp((y - CREST_Y) / (BASE_Y - CREST_Y), 0, 1));
const fallsRight = (y) => W - fallsLeft(y);
// The SVG cliffs overlap the water's edges by up to 16 px.
const WATER_INSET = 16;
const trackY = (p) => lerp(BOTTOM_Y, TOP_Y, p);
const laneX = (lane, y) => lerp(fallsLeft(y) + 60, fallsRight(y) - 60, lane);
// Higher up the falls is further away, so carps there are drawn smaller.
const depthScale = (y) => (y <= BASE_Y ? lerp(0.8, 1, clamp((y - CREST_Y) / (BASE_Y - CREST_Y), 0, 1)) : 1 + (y - BASE_Y) / 1800);
const fishScale = (f) => depthScale(f.y) * (f.decoration ? 0.8 : f.inPond ? 0.95 : 1.15);

// ---------- Canvas helpers ----------
let clock = 0;
let flash = 0;

function glow(x, y, r, rgb, alpha) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Canvas text with a dark outline; keep emoji out of it, since outlined emoji look broken.
function outlinedText(text, x, y, size, color, weight = 700) {
  ctx.font = `${weight} ${size}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size / 5;
  ctx.strokeStyle = 'rgba(0, 12, 24, 0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

const puff = document.createElement('canvas');
puff.width = puff.height = 64;
{
  const g = puff.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(240, 252, 255, 0.9)');
  grad.addColorStop(1, 'rgba(240, 252, 255, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
}

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

function drawAvatar(image, name, x, y, r, ring = '#f2c14e') {
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
    grad.addColorStop(0, '#2a8fb8');
    grad.addColorStop(1, '#f2a03d');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(r * 0.95)}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial(name), x, y + r * 0.06);
  }
  ctx.lineWidth = Math.max(2, r * 0.15);
  ctx.strokeStyle = ring;
  ctx.stroke();
  ctx.restore();
}

// ---------- Water ----------
const newStreak = (y) => ({ u: Math.random(), y, len: rand(60, 180), speed: rand(260, 420), width: rand(1.5, 4.5), alpha: rand(0.1, 0.32) });
const streaks = Array.from({ length: 90 }, () => newStreak(rand(CREST_Y, BASE_Y + 150)));
const waves = [];
const foam = [];
const mist = [];
const ripples = [];
let foamDue = 0;
let mistDue = 0;
let rippleDue = 0;

function waterPath() {
  ctx.beginPath();
  ctx.moveTo(fallsLeft(CREST_Y) + WATER_INSET, CREST_Y);
  ctx.lineTo(fallsRight(CREST_Y) - WATER_INSET, CREST_Y);
  ctx.lineTo(fallsRight(BASE_Y) - WATER_INSET, BASE_Y);
  ctx.lineTo(fallsLeft(BASE_Y) + WATER_INSET, BASE_Y);
  ctx.closePath();
}

// Gifts send a bright wave up the falls.
function addWave(strength, delay = 0) {
  waves.push({ age: -delay, life: 1.5, strength });
}

function drawWater(dt) {
  ctx.save();
  waterPath();
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < streaks.length; i++) {
    const s = streaks[i];
    // Water speeds up as it falls.
    s.y += s.speed * dt * (0.6 + (s.y - CREST_Y) / (BASE_Y - CREST_Y));
    if (s.y - s.len > BASE_Y) {
      streaks[i] = newStreak(CREST_Y - rand(0, 60));
      continue;
    }
    const top = Math.max(CREST_Y, s.y - s.len);
    if (s.y <= top) continue;
    ctx.strokeStyle = `rgba(230, 248, 255, ${s.alpha})`;
    ctx.lineWidth = s.width;
    ctx.beginPath();
    ctx.moveTo(lerp(fallsLeft(top), fallsRight(top), s.u), top);
    ctx.lineTo(lerp(fallsLeft(s.y), fallsRight(s.y), s.u), s.y);
    ctx.stroke();
  }
  for (let i = waves.length - 1; i >= 0; i--) {
    const wave = waves[i];
    wave.age += dt;
    if (wave.age < 0) continue;
    if (wave.age > wave.life) {
      waves.splice(i, 1);
      continue;
    }
    const k = wave.age / wave.life;
    const y = lerp(BASE_Y + 40, CREST_Y - 40, smooth(k));
    const grad = ctx.createLinearGradient(0, y - 80, 0, y + 80);
    grad.addColorStop(0, 'rgba(200, 245, 255, 0)');
    grad.addColorStop(0.5, `rgba(200, 245, 255, ${0.6 * wave.strength * Math.sin(Math.PI * k)})`);
    grad.addColorStop(1, 'rgba(200, 245, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - 80, W, 160);
  }
  ctx.restore();
}

function drawFoam(dt) {
  foamDue += dt * 45;
  for (; foamDue >= 1; foamDue--) {
    foam.push({ x: rand(fallsLeft(BASE_Y) + 24, fallsRight(BASE_Y) - 24), y: BASE_Y + rand(-14, 8), r: rand(5, 14), vx: rand(-25, 25), vy: rand(-30, -8), age: 0, life: rand(0.7, 1.3) });
  }
  cap(foam, 160);
  mistDue += dt * 2.5;
  for (; mistDue >= 1; mistDue--) {
    mist.push({ x: rand(250, 830), y: BASE_Y + rand(-10, 20), r: rand(40, 80), vx: rand(-12, 12), vy: rand(-36, -18), age: 0, life: rand(3, 4.5) });
  }
  cap(mist, 30);
  ctx.fillStyle = '#f2fcff';
  for (let i = foam.length - 1; i >= 0; i--) {
    const p = foam[i];
    p.age += dt;
    if (p.age > p.life) {
      foam.splice(i, 1);
      continue;
    }
    const k = p.age / p.life;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    ctx.globalAlpha = 0.55 * (1 - k);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (1 + k), 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = mist.length - 1; i >= 0; i--) {
    const p = mist[i];
    p.age += dt;
    if (p.age > p.life) {
      mist.splice(i, 1);
      continue;
    }
    const k = p.age / p.life;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.r += 14 * dt;
    ctx.globalAlpha = 0.18 * Math.sin(Math.PI * k);
    ctx.drawImage(puff, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  }
  ctx.globalAlpha = 1;
}

function addRipple(x, y, max = 60, life = 1.2) {
  ripples.push({ x, y, max, life, age: 0 });
  cap(ripples, 40);
}

function drawRipples(dt) {
  rippleDue += dt * 1.2;
  for (; rippleDue >= 1; rippleDue--) addRipple(rand(POND.x0, POND.x1), rand(POND.y0, 1880), rand(40, 80), rand(1.5, 2.5));
  ctx.lineWidth = 2.5;
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.age += dt;
    if (r.age > r.life) {
      ripples.splice(i, 1);
      continue;
    }
    const k = r.age / r.life;
    const rx = 8 + k * r.max;
    ctx.strokeStyle = `rgba(220, 248, 255, ${0.45 * (1 - k)})`;
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, rx, rx * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ---------- Particles and floating text ----------
const drops = [];
const sparks = [];
const hearts = [];
const rings = [];
const texts = [];
const gold = [];
let rainFor = 0;
let rainDue = 0;

function splash(x, y, count, power = 1) {
  for (let i = 0; i < count; i++) {
    const angle = rand(-Math.PI * 0.95, -Math.PI * 0.05);
    const v = rand(120, 320) * power;
    drops.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, r: rand(2, 4.5), age: 0, life: rand(0.5, 0.9) });
  }
  cap(drops, 400);
}

function drawDrops(dt) {
  ctx.fillStyle = '#e6f8ff';
  for (let i = drops.length - 1; i >= 0; i--) {
    const p = drops[i];
    p.age += dt;
    if (p.age > p.life) {
      drops.splice(i, 1);
      continue;
    }
    p.vy += 900 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    ctx.globalAlpha = 0.85 * (1 - p.age / p.life);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function addSparks(x, y, count, speed) {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const v = rand(0.3, 1) * speed;
    sparks.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - 60, age: 0, life: rand(0.8, 1.6), size: rand(2, 4.5) });
  }
  cap(sparks, 500);
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

function addHearts(f, count) {
  for (let i = 0; i < count; i++) hearts.push({ x: f.x + rand(-30, 30), y: f.y + rand(-20, 10), vx: rand(-20, 20), size: rand(14, 22), age: -i * 0.08, life: rand(0.8, 1.1) });
  cap(hearts, 80);
}

function drawHearts(dt) {
  ctx.fillStyle = '#ff5c8a';
  for (let i = hearts.length - 1; i >= 0; i--) {
    const h = hearts[i];
    h.age += dt;
    if (h.age < 0) continue;
    if (h.age > h.life) {
      hearts.splice(i, 1);
      continue;
    }
    const k = h.age / h.life;
    const x = h.x + h.vx * h.age;
    const y = h.y - 90 * k;
    const s = h.size * (0.6 + 0.4 * Math.min(1, k * 4));
    ctx.globalAlpha = 1 - k * k;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x - s * 0.6, y - s * 0.1, x - s * 0.35, y - s * 0.65, x, y - s * 0.3);
    ctx.bezierCurveTo(x + s * 0.35, y - s * 0.65, x + s * 0.6, y - s * 0.1, x, y + s * 0.35);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
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
    ctx.arc(ring.x, ring.y, 40 + k * ring.max, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Labels can ride along with a carp (fish) or stay where they appeared.
function addFloat(text, { fish = null, x = 0, y = 0, size = 30, color = '#fff1b8', rise = 70, life = 1.6, kind = '', total = 0 } = {}) {
  texts.push({ text, fish, x, y, size, color, rise, life, kind, total, age: 0 });
  cap(texts, 40);
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
    const x = t.fish ? t.fish.x + 60 * fishScale(t.fish) : t.x;
    const y = (t.fish ? t.fish.y - 30 : t.y) - t.rise * (1 - (1 - k) ** 2);
    ctx.globalAlpha = k < 0.12 ? k / 0.12 : 1 - Math.max(0, (k - 0.65) / 0.35);
    outlinedText(t.text, clamp(x, 60, W - 60), y, t.size, t.color, 800);
  }
  ctx.globalAlpha = 1;
}

// A viewer who keeps liking keeps one label whose total counts up.
function likeLabel(f, gain) {
  if (gain <= 0) return;
  const label = texts.find((t) => t.kind === 'like' && t.fish === f);
  if (label) {
    label.total += gain;
    label.text = pctText(label.total);
    label.age = Math.min(label.age, 0.3);
  } else {
    addFloat(pctText(gain), { fish: f, kind: 'like', total: gain, size: 26, rise: 24, life: 1.4 });
  }
}

function drawGoldRain(dt) {
  if (rainFor > 0) {
    rainFor -= dt;
    rainDue += dt * 70;
    for (; rainDue >= 1; rainDue--) gold.push({ x: rand(140, 940), y: rand(470, 560), vx: rand(-30, 30), vy: rand(520, 760), end: rand(CREST_Y + 40, POND.y1) });
    cap(gold, 300);
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = '#ffd36b';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  for (let i = gold.length - 1; i >= 0; i--) {
    const g = gold[i];
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    if (g.y > g.end) {
      addSparks(g.x, g.y, 2, 80);
      if (g.y > BASE_Y) addRipple(g.x, g.y, 30, 0.8);
      gold.splice(i, 1);
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(g.x - g.vx * 0.02, g.y - 16);
    ctx.lineTo(g.x, g.y);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawFlash(dt) {
  if (flash <= 0) return;
  flash = Math.max(0, flash - dt * 0.5);
  const grad = ctx.createRadialGradient(GATE.x, GATE.y, 0, GATE.x, GATE.y, 1000);
  grad.addColorStop(0, `rgba(255, 236, 170, ${0.7 * flash})`);
  grad.addColorStop(1, 'rgba(255, 236, 170, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

// ---------- Carps ----------
// Koi seen from above, nose toward +x. Colours and patches come from the viewer's name, so a carp keeps its look.
const KOI = [
  { body: '#f7f2e8', edge: '#cfc3b1', patches: ['#e3452f'], fin: '255, 238, 228' },
  { body: '#f5a02e', edge: '#c0610f', patches: ['#ffd889'], fin: '255, 200, 130' },
  { body: '#f3c94a', edge: '#bf8c18', patches: ['#fff3bf'], fin: '255, 232, 160' },
  { body: '#f7f2e8', edge: '#cfc3b1', patches: ['#e3452f', '#24242b'], fin: '255, 238, 228' },
  { body: '#de3d2c', edge: '#9c2016', patches: ['#ff9a66'], fin: '255, 160, 130' },
  { body: '#f7f2e8', edge: '#cfc3b1', patches: [], crown: '#e3452f', fin: '255, 238, 228' },
  { body: '#33333d', edge: '#141419', patches: ['#e3452f', '#f7f2e8'], fin: '225, 225, 235' },
];

function hashOf(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return h;
}

function lookFor(name) {
  const h = hashOf(name);
  const koi = KOI[h % KOI.length];
  const spots = [[24, -4], [0, 5], [-24, -2]].slice(0, 2 + ((h >>> 5) & 1));
  const patches = koi.patches.length
    ? spots.map(([x, y], i) => ({
        x: x + (((h >>> (7 + i * 3)) & 7) - 3.5) * 2,
        y: y + (((h >>> (13 + i * 2)) & 3) - 1.5) * 3,
        rx: 10 + ((h >>> (17 + i)) & 7),
        ry: 8 + ((h >>> (21 + i)) & 3) * 2,
        tilt: (((h >>> (25 + i)) & 3) - 1.5) * 0.3,
        color: koi.patches[i % koi.patches.length],
      }))
    : [];
  return { koi, patches };
}

function bodyFill(koi) {
  if (!koi.fill) {
    const grad = ctx.createLinearGradient(0, -22, 0, 22);
    grad.addColorStop(0, koi.edge);
    grad.addColorStop(0.3, koi.body);
    grad.addColorStop(0.7, koi.body);
    grad.addColorStop(1, koi.edge);
    koi.fill = grad;
  }
  return koi.fill;
}

function carp(look, swim, x, y, angle, s, alpha = 1) {
  const { koi } = look;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(s, s);
  ctx.fillStyle = `rgba(${koi.fin}, 0.7)`;
  // Tail fan, swinging with each stroke.
  ctx.save();
  ctx.translate(-44, 0);
  ctx.rotate(Math.sin(swim) * 0.4);
  ctx.beginPath();
  ctx.moveTo(4, 0);
  ctx.bezierCurveTo(-12, -6, -28, -26, -46, -24);
  ctx.bezierCurveTo(-34, -10, -34, 10, -46, 24);
  ctx.bezierCurveTo(-28, 26, -12, 6, 4, 0);
  ctx.fill();
  ctx.restore();
  // Pectoral and pelvic fins, spread back and out.
  for (const side of [-1, 1]) {
    for (const [fx, len, spread] of [[22, 22, 0.95], [-14, 14, 0.75]]) {
      ctx.save();
      ctx.translate(fx, side * 13);
      ctx.rotate(Math.PI - side * (spread + Math.sin(swim * 1.3 + side) * 0.22));
      ctx.beginPath();
      ctx.ellipse(len * 0.55, 0, len * 0.6, len * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.beginPath();
  ctx.moveTo(50, 0);
  ctx.bezierCurveTo(50, -14, 36, -22, 14, -22);
  ctx.bezierCurveTo(-12, -22, -32, -12, -48, -4);
  ctx.lineTo(-48, 4);
  ctx.bezierCurveTo(-32, 12, -12, 22, 14, 22);
  ctx.bezierCurveTo(36, 22, 50, 14, 50, 0);
  ctx.closePath();
  ctx.fillStyle = bodyFill(koi);
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (const patch of look.patches) {
    ctx.fillStyle = patch.color;
    ctx.beginPath();
    ctx.ellipse(patch.x, patch.y, patch.rx, patch.ry, patch.tilt, 0, Math.PI * 2);
    ctx.fill();
  }
  if (koi.crown) {
    ctx.fillStyle = koi.crown;
    ctx.beginPath();
    ctx.arc(30, 0, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  // Scales: rows of faint arcs whose open side faces the tail.
  ctx.strokeStyle = 'rgba(60, 30, 10, 0.16)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let col = 0; col < 8; col++) {
    const sx = 22 - col * 9;
    for (let sy = -18; sy <= 18; sy += 9) {
      const cy = sy + (col % 2 ? 4.5 : 0);
      ctx.moveTo(sx + 5 * Math.cos(Math.PI - 1.1), cy + 5 * Math.sin(Math.PI - 1.1));
      ctx.arc(sx, cy, 5, Math.PI - 1.1, Math.PI + 1.1);
    }
  }
  ctx.stroke();
  ctx.restore();
  // The dorsal fin seen edge-on, then eyes and barbels.
  ctx.strokeStyle = `rgba(${koi.fin}, 0.9)`;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-30, 0);
  ctx.stroke();
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#16120e';
    ctx.beginPath();
    ctx.arc(36, side * 11, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 50, 20, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(48, side * 4);
    ctx.quadraticCurveTo(57, side * 8, 54, side * 15);
    ctx.stroke();
  }
  ctx.restore();
}

// The viewer's avatar rides on the carp's back, upright so the face stays readable.
function drawCarp(f, x, y, angle, s, alpha = 1) {
  carp(f.look, f.swim, x, y, angle, s, alpha);
  if (f.decoration) return;
  ctx.globalAlpha = alpha;
  drawAvatar(f.image, f.name, x + Math.cos(angle) * 6 * s, y + Math.sin(angle) * 6 * s, 19 * s);
  ctx.globalAlpha = 1;
}

// Racers on the falls, and the bể cá: viewers in the room whose carp swims in the pond until they comment the join word.
const fishes = new Map();
const aquarium = new Map();
const departing = [];

function makeFish({ key, name, avatar }, decoration = false, inPond = false) {
  return {
    key,
    name,
    avatar,
    decoration,
    inPond,
    image: avatarImage(avatar),
    look: lookFor(name),
    // Golden-ratio steps spread consecutive carps across the falls; a small height offset staggers carps at the same progress.
    lane: 0.08 + ((Math.abs(key) * 0.618034) % 1) * 0.84,
    stagger: (((Math.abs(key) * 0.381966) % 1) - 0.5) * 28,
    p: 0,
    x: rand(POND.x0, POND.x1),
    y: rand(POND.y0 + 20, POND.y1),
    angle: Math.random() < 0.5 ? 0 : Math.PI,
    swim: rand(0, 6),
    beat: 6,
    wander: null,
    active: -Infinity,
    born: clock,
    glow: 0,
    leap: null,
    hidden: false,
    fade: 1,
  };
}

// A few unnamed koi keep the pond alive while few viewers play.
const ambient = Array.from({ length: 4 }, (_, i) => makeFish({ key: -1 - i, name: `koi ${i}`, avatar: '' }, true));

function turnToward(angle, target, maxStep) {
  const diff = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
  return angle + clamp(diff, -maxStep, maxStep);
}

function updateFish(f, dt) {
  f.swim += dt * f.beat;
  f.beat += (6 - f.beat) * ease(1.5, dt);
  f.glow = Math.max(0, f.glow - dt);
  if (f.leap && (f.leap.t += dt) >= f.leap.dur) f.leap = null;
  // The winner stays hidden until the racers go back to the pond for the next round.
  if (f.hidden) return;
  if (!f.decoration && !f.inPond) {
    // Every carp in the round holds its lane on the falls; p = 0 is the start line, where they wait in one neat row.
    const ty = trackY(f.p) + f.stagger * Math.min(1, f.p * 20);
    const k = ease(4, dt);
    f.x += (laneX(f.lane, ty) - f.x) * k;
    f.y += (ty - f.y) * k;
    f.angle = turnToward(f.angle, -Math.PI / 2 + Math.sin(f.swim) * 0.12, dt * 7);
    return;
  }
  // A racer sent back to the pond tumbles down the falls first.
  if (f.y < POND.y0 - 30) {
    f.y = Math.min(POND.y0 + 10, f.y + 650 * dt);
    f.angle = turnToward(f.angle, Math.PI / 2, dt * 5);
    if (f.y >= POND.y0 + 10) {
      splash(f.x, f.y, 10);
      addRipple(f.x, f.y, 60);
    }
    return;
  }
  // Pond carps cruise from one side to the other, darting faster for a moment when their viewer likes.
  if (!f.wander || Math.abs(f.wander.x - f.x) < 30) {
    const dir = f.x < (POND.x0 + POND.x1) / 2 ? 1 : -1;
    f.wander = { x: clamp(f.x + dir * rand(220, 520), POND.x0, POND.x1), y: rand(POND.y0, POND.y1) };
  }
  const speed = 45 * clamp(f.beat / 6, 1, 2.5);
  f.angle = turnToward(f.angle, Math.atan2(f.wander.y - f.y, f.wander.x - f.x), dt * 1.8);
  f.x += Math.cos(f.angle) * speed * dt;
  f.y = clamp(f.y + Math.sin(f.angle) * speed * dt, POND.y0 - 30, POND.y1 + 40);
}

function drawFish(f, alpha = 1) {
  const s = fishScale(f);
  let x = f.x;
  let scale = s;
  if (f.leap) {
    const arc = Math.sin((Math.PI * f.leap.t) / f.leap.dur);
    x += f.leap.side * 40 * arc * s;
    scale *= 1 + 0.25 * arc;
  }
  if (f.glow > 0) glow(x, f.y, 90 * s, '255, 210, 110', 0.5 * Math.min(1, f.glow));
  drawCarp(f, x, f.y, f.angle, scale, alpha * (f.decoration ? 0.8 : 1));
}

// Name tags go under their carps; a tag that would cover one already placed tries just above or below, else it is skipped.
function drawLabels(list, medals) {
  const placed = [];
  for (const f of list) {
    const medal = medals.get(f);
    const s = fishScale(f);
    const text = medal ? `${medal} ${f.name}` : f.name;
    const size = Math.round(22 * clamp(s, 0.95, 1.15));
    const headUp = Math.abs(f.angle + Math.PI / 2) < 0.6;
    ctx.font = `700 ${size}px "Segoe UI", Arial, sans-serif`;
    const width = ctx.measureText(text).width + 18;
    const height = size * 1.36;
    const x = clamp(f.x, width / 2 + 6, W - width / 2 - 6);
    const base = f.y + (headUp ? 42 : 30) * s;
    const y = [base, base + height + 2, base - height - 2].find((cy) => !placed.some((p) => Math.abs(p.x - x) < (p.width + width) / 2 && Math.abs(p.y - cy) < height));
    if (y === undefined) continue;
    placed.push({ x, y, width });
    ctx.fillStyle = medal ? 'rgba(110, 64, 0, 0.8)' : 'rgba(0, 20, 35, 0.62)';
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - height / 2, width, height, height / 2);
    ctx.fill();
    ctx.fillStyle = medal ? '#ffe08a' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }
}

function drawSchool(dt) {
  const list = [...fishes.values()];
  const swimmers = [...aquarium.values()];
  for (const f of list) updateFish(f, dt);
  for (const f of swimmers) updateFish(f, dt);
  const showAmbient = list.length + swimmers.length < 6;
  if (showAmbient) for (const f of ambient) updateFish(f, dt);
  for (let i = departing.length - 1; i >= 0; i--) {
    const f = departing[i];
    f.fade -= dt * 1.2;
    f.y += 20 * dt;
    if (f.fade <= 0) departing.splice(i, 1);
  }
  // Medals for the three leaders; names only for the carps that matter, so a crowded falls stays readable.
  const ranked = list.filter((f) => f.p > 0 && !f.hidden).sort((a, b) => b.p - a.p);
  const medals = new Map(roundState.phase === 'racing' ? ranked.slice(0, 3).map((f, i) => [f, MEDALS[i]]) : []);
  const recent = (f) => clock - f.active < 5 || clock - f.born < 6;
  const named = new Set(list.length <= 12 ? list : [...ranked.slice(0, 5), ...list.filter(recent)]);
  // In the pond only viewers who just arrived or just acted are named, so a full pond stays readable.
  for (const f of swimmers) if (recent(f)) named.add(f);
  const order = [...(showAmbient ? ambient : []), ...swimmers, ...list.filter((f) => !f.hidden)].sort((a, b) => a.y - b.y);
  for (const f of departing) drawFish(f, Math.max(0, f.fade));
  for (const f of order) drawFish(f);
  // Leaders and viewers who just acted claim their tag spot first.
  const rank = (f) => (medals.has(f) ? 4 : 0) + (clock - f.active < 5 ? 2 : 0) + f.p;
  drawLabels(order.filter((f) => named.has(f)).sort((a, b) => rank(b) - rank(a)), medals);
}

function leap(f) {
  f.leap = { t: 0, dur: 0.7, side: Math.random() < 0.5 ? -1 : 1 };
  f.beat = 18;
}

// Vạch xuất phát: a red and white ribbon across the falls, level with the noses of carps waiting at p = 0.
const START_LINE_Y = BOTTOM_Y - 56;
function drawStartLine() {
  const x0 = fallsLeft(START_LINE_Y) + WATER_INSET;
  const x1 = fallsRight(START_LINE_Y) - WATER_INSET;
  ctx.fillStyle = 'rgba(0, 20, 30, 0.35)';
  ctx.fillRect(x0, START_LINE_Y + 2, x1 - x0, 8);
  for (let x = x0, i = 0; x < x1; x += 24, i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#d8322a';
    ctx.fillRect(x, START_LINE_Y - 4, Math.min(24, x1 - x), 8);
  }
  // A flag at each end, fluttering outward.
  for (const [x, dir] of [[x0, -1], [x1, 1]]) {
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, START_LINE_Y + 4);
    ctx.lineTo(x, START_LINE_Y - 64);
    ctx.stroke();
    const wave = Math.sin(clock * 4 + x) * 4;
    ctx.fillStyle = '#d8322a';
    ctx.beginPath();
    ctx.moveTo(x, START_LINE_Y - 64);
    ctx.quadraticCurveTo(x + dir * 18, START_LINE_Y - 60 + wave, x + dir * 36, START_LINE_Y - 54 + wave);
    ctx.lineTo(x, START_LINE_Y - 42);
    ctx.fill();
  }
  if (roundState.phase === 'join') outlinedText('VẠCH XUẤT PHÁT', 540, START_LINE_Y - 30, 26, '#ffffff', 800);
}

// The gate brightens as the leading carp gets close.
function drawGateGlow() {
  let best = 0;
  for (const f of fishes.values()) if (!f.hidden) best = Math.max(best, f.p);
  const near = smooth(clamp((best - 0.6) / 0.4, 0, 1));
  if (near > 0) glow(GATE.x, GATE.y + 20, 200, '255, 230, 150', near * (0.3 + 0.12 * Math.sin(clock * 5)));
}

// ---------- Dragons ----------
// Catmull-Rom curve through the waypoints; s runs from 0 to 1 over the whole path.
function pathPoint(points, s) {
  const n = points.length - 1;
  const i = Math.min(n - 1, Math.floor(s * n));
  const t = s * n - i;
  const p0 = points[Math.max(0, i - 1)];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[Math.min(n, i + 2)];
  const at = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  return { x: at(p0[0], p1[0], p2[0], p3[0]), y: at(p0[1], p1[1], p2[1], p3[1]) };
}

// The winner's dragon rises out of the gate, circles the winner card twice over and leaves through the top.
const WIN_PATH = [[540, 790], [540, 650], [700, 570], [800, 420], [720, 280], [540, 230], [360, 280], [280, 420], [360, 560], [540, 610], [720, 550], [820, 390], [880, 170], [960, -80], [1020, -340]];
// A gift dragon sweeps across the falls.
const FLYBY_PATH = [[-260, 1180], [120, 1020], [380, 1130], [640, 960], [880, 1080], [1140, 900], [1400, 860]];
const SEGMENTS = 56;
const SPACING = 10;
const flights = [];
const bodyRadius = (i) => 5 + 21 * Math.pow(1 - i / SEGMENTS, 0.6);

function addDragon(path, duration, rider) {
  flights.push({ path, duration, rider, t: 0, trail: [], spark: 0 });
}

// Points every SPACING px back along the trail, head first; the body grows as the dragon emerges.
function bodyPoints(trail) {
  const points = [trail[trail.length - 1]];
  let need = SPACING;
  for (let i = trail.length - 1; i > 0 && points.length < SEGMENTS; i--) {
    const a = trail[i];
    const b = trail[i - 1];
    let len = Math.hypot(b.x - a.x, b.y - a.y);
    let from = a;
    while (len >= need && points.length < SEGMENTS) {
      const k = need / len;
      from = { x: lerp(from.x, b.x, k), y: lerp(from.y, b.y, k) };
      points.push(from);
      len -= need;
      need = SPACING;
    }
    need -= len;
  }
  return points;
}

// Side view, snout toward +x and the crest toward -y, so in loops the dragon rolls over like the body does.
function drawDragonHead(x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(1.55, 1.55);
  ctx.fillStyle = '#d8482a';
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (0.68 + i * 0.16);
    const len = 32 + (i % 2) * 10 + Math.sin(clock * 8 + i) * 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.3) * 14, Math.sin(a - 0.3) * 14);
    ctx.quadraticCurveTo(Math.cos(a - 0.1) * len * 0.8, Math.sin(a - 0.1) * len * 0.8, Math.cos(a) * len, Math.sin(a) * len);
    ctx.quadraticCurveTo(Math.cos(a + 0.15) * len * 0.6, Math.sin(a + 0.15) * len * 0.6, Math.cos(a + 0.3) * 14, Math.sin(a + 0.3) * 14);
    ctx.fill();
  }
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#fff0b0';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-2, -14);
  ctx.quadraticCurveTo(-18, -34, -42, -36);
  ctx.moveTo(-14, -27);
  ctx.lineTo(-20, -44);
  ctx.stroke();
  ctx.fillStyle = '#f0b93a';
  ctx.strokeStyle = '#8a5a10';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 20, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(22, 3, 22, 11, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#b8281c';
  ctx.beginPath();
  ctx.moveTo(8, 9);
  ctx.quadraticCurveTo(30, 24, 44, 13);
  ctx.quadraticCurveTo(26, 14, 8, 9);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(5, -6, 6, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(6.5, -6, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffe9a0';
  ctx.lineWidth = 2.5;
  for (const side of [-1, 1]) {
    const wave = Math.sin(clock * 6 + side) * 8;
    ctx.beginPath();
    ctx.moveTo(40, 3 + side * 4);
    ctx.bezierCurveTo(54, side * 22 + wave, 18, side * 40, -14, side * 46 + wave);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDragon(d) {
  const pts = bodyPoints(d.trail);
  if (pts.length < 4) return;
  // Direction toward the head (tx, ty) and the normal toward the back (nx, ny) at every point.
  const body = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const tx = (a.x - b.x) / len;
    const ty = (a.y - b.y) / len;
    return { x: p.x, y: p.y, tx, ty, nx: ty, ny: -tx, r: bodyRadius(i) };
  });
  const side = (b, k) => ({ x: b.x + b.nx * b.r * k, y: b.y + b.ny * b.r * k });
  const last = body.length - 1;
  // Red crest along the back, behind the body.
  ctx.fillStyle = '#d8482a';
  ctx.beginPath();
  for (let i = 1; i + 2 <= last; i += 2) {
    const from = side(body[i], 0.8);
    const to = side(body[i + 2], 0.8);
    const b = body[i + 1];
    const tall = 9 + b.r * 0.5;
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(b.x + b.nx * (b.r + tall) - b.tx * 8, b.y + b.ny * (b.r + tall) - b.ty * 8);
    ctx.lineTo(to.x, to.y);
  }
  ctx.fill();
  // Two pairs of legs with three claws each, reaching back under the belly.
  ctx.lineCap = 'round';
  for (const at of [9, 30]) {
    if (at >= last) continue;
    const b = body[at];
    for (const shift of [0, 7]) {
      const hip = { x: b.x - b.tx * shift, y: b.y - b.ty * shift };
      const knee = { x: hip.x - b.nx * (b.r + 14) - b.tx * 4, y: hip.y - b.ny * (b.r + 14) - b.ty * 4 };
      const foot = { x: knee.x - b.tx * 16 - b.nx * 4, y: knee.y - b.ty * 16 - b.ny * 4 };
      ctx.strokeStyle = shift ? '#c98a1a' : '#e3a52a';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(hip.x, hip.y);
      ctx.lineTo(knee.x, knee.y);
      ctx.lineTo(foot.x, foot.y);
      ctx.stroke();
      ctx.strokeStyle = '#fff0b0';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (const claw of [-0.6, 0, 0.6]) {
        const a = Math.atan2(-b.ty, -b.tx) + claw;
        ctx.moveTo(foot.x, foot.y);
        ctx.lineTo(foot.x + Math.cos(a) * 9, foot.y + Math.sin(a) * 9);
      }
      ctx.stroke();
    }
  }
  // Flame-like tail tuft.
  const tail = body[last];
  ctx.fillStyle = '#d8482a';
  for (const spread of [-0.7, 0, 0.7]) {
    const a = Math.atan2(-tail.ty, -tail.tx) + spread + Math.sin(clock * 7 + spread) * 0.15;
    ctx.beginPath();
    ctx.moveTo(tail.x + tail.nx * 5, tail.y + tail.ny * 5);
    ctx.quadraticCurveTo(tail.x + Math.cos(a - 0.3) * 20, tail.y + Math.sin(a - 0.3) * 20, tail.x + Math.cos(a) * 30, tail.y + Math.sin(a) * 30);
    ctx.quadraticCurveTo(tail.x + Math.cos(a + 0.3) * 14, tail.y + Math.sin(a + 0.3) * 14, tail.x - tail.nx * 5, tail.y - tail.ny * 5);
    ctx.fill();
  }
  // The body as one tapered shape: back edge head to tail, belly edge tail to head.
  ctx.beginPath();
  body.forEach((b, i) => {
    const p = side(b, 1);
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  });
  for (let i = last; i >= 0; i--) {
    const p = side(body[i], -1);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fillStyle = '#eab234';
  ctx.fill();
  ctx.strokeStyle = '#8a5a10';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();
  // Pale belly plates.
  ctx.beginPath();
  body.forEach((b, i) => {
    const p = side(b, -0.2);
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  });
  for (let i = last; i >= 0; i--) {
    const p = side(body[i], -0.85);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fillStyle = '#fbe6a2';
  ctx.fill();
  ctx.strokeStyle = 'rgba(176, 116, 24, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 1; i < last; i += 2) {
    const a = side(body[i], -0.2);
    const b = side(body[i], -0.85);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  // Scales on the back: arcs whose open side faces the head.
  ctx.strokeStyle = 'rgba(138, 80, 12, 0.5)';
  ctx.beginPath();
  for (let i = 1; i < last; i++) {
    const b = body[i];
    const c = side(b, i % 2 ? 0.45 : 0.15);
    const r = b.r * 0.32;
    const a = Math.atan2(-b.ty, -b.tx);
    ctx.moveTo(c.x + Math.cos(a - 1.2) * r, c.y + Math.sin(a - 1.2) * r);
    ctx.arc(c.x, c.y, r, a - 1.2, a + 1.2);
  }
  ctx.stroke();
  const head = body[0];
  drawDragonHead(head.x, head.y, Math.atan2(head.ty, head.tx));
  if (d.rider) {
    const b = body[Math.min(9, last)];
    const ax = b.x + b.nx * (b.r + 28);
    const ay = b.y + b.ny * (b.r + 28);
    drawAvatar(d.rider.image, d.rider.name, ax, ay, 24, '#ffe08a');
    outlinedText(d.rider.name, ax, ay - 40, 24, '#ffffff', 800);
  }
}

function drawDragons(dt) {
  for (let i = flights.length - 1; i >= 0; i--) {
    const d = flights[i];
    d.t += dt;
    let head;
    if (d.t <= d.duration) {
      head = pathPoint(d.path, d.t / d.duration);
    } else {
      // Past the last waypoint: keep going the same way until the tail is off screen too.
      const [a, b] = d.trail.slice(-2);
      head = { x: b.x + (b.x - a.x), y: b.y + (b.y - a.y) };
    }
    d.trail.push(head);
    cap(d.trail, 300);
    d.spark += dt;
    if (d.spark > 0.05) {
      d.spark = 0;
      addSparks(head.x, head.y, 2, 90);
    }
    drawDragon(d);
    if (d.t > d.duration + 1.5) flights.splice(i, 1);
  }
}

// ---------- The winner: a final leap through Vũ Môn, then a dragon ----------
const LEAP_TIME = 1;
const WIN_TIME = 8.2;
let win = null;

function onWin(m) {
  const f = fishes.get(m.key);
  const from = f && !f.hidden ? { x: f.x, y: f.y, s: fishScale(f) } : { x: 540, y: TOP_Y, s: 0.92 };
  win = { m, t: 0, f, from, look: f?.look ?? lookFor(m.user), image: avatarImage(m.avatar), burst: false };
  if (f) f.hidden = true;
  stage.classList.add('celebrating');
  sound.drum();
}

function drawWinCard(alpha, t) {
  const cx = 540;
  const cy = 350;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * 0.25);
  ctx.fillStyle = 'rgba(255, 214, 110, 0.16)';
  for (let i = 0; i < 16; i++) {
    ctx.rotate(Math.PI / 8);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-26, -250);
    ctx.lineTo(26, -250);
    ctx.fill();
  }
  ctx.restore();
  glow(cx, cy, 190, '255, 214, 120', 0.5);
  drawAvatar(win.image, win.m.user, cx, cy, 76, '#ffd54a');
  outlinedText(win.m.user, cx, cy + 108, 44, '#ffffff', 800);
  outlinedText(win.m.how === 'time' ? 'dẫn đầu khi hết giờ, hóa rồng!' : 'đã vượt Vũ Môn, hóa rồng!', cx, cy + 158, 40, '#ffd54a', 800);
  if (win.m.count > 1) outlinedText(`Lần hóa rồng thứ ${win.m.count}`, cx, cy + 200, 28, '#fff1b8');
  ctx.restore();
}

function drawWin(dt) {
  if (!win) return;
  win.t += dt;
  const t = win.t;
  if (t < LEAP_TIME) {
    const k = smooth(t / LEAP_TIME);
    const x = lerp(win.from.x, GATE.x, k);
    const y = lerp(win.from.y, GATE.y, k) - Math.sin(Math.PI * k) * 90;
    const s = lerp(win.from.s, 1.5, k);
    glow(x, y, 120 * s, '255, 220, 130', 0.6);
    carp(win.look, clock * 18, x, y, -Math.PI / 2, s);
    drawAvatar(win.image, win.m.user, x, y - 6 * s, 19 * s);
    if (Math.random() < 0.6) addSparks(x, y + 30 * s, 2, 120);
  } else if (!win.burst) {
    win.burst = true;
    flash = 1;
    for (let i = 0; i < 3; i++) rings.push({ x: GATE.x, y: GATE.y, age: -i * 0.3, life: 1.6, max: 420 });
    addSparks(GATE.x, GATE.y, 120, 520);
    splash(GATE.x, CREST_Y, 30, 1.4);
    addDragon(WIN_PATH, 5.4, { image: win.image, name: win.m.user });
    sound.gong();
    sound.arpeggio(6, 0.14);
  }
  const alpha = clamp((t - 1.3) / 0.5, 0, 1) * clamp((WIN_TIME - t) / 0.6, 0, 1);
  if (alpha > 0) drawWinCard(alpha, t);
  if (t > WIN_TIME) {
    win = null;
    stage.classList.remove('celebrating');
  }
}

// ---------- Viewer actions ----------
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

// One toast at a time, faster while others wait; held back while the winner card is up.
const toastQueue = [];
let toastUntil = 0;
function queueToast(m, text, big = false) {
  toastQueue.push({ m, text, big });
  cap(toastQueue, 20);
}

function pumpToasts(now) {
  if (win || now < toastUntil || !toastQueue.length) return;
  const { m, text, big } = toastQueue.shift();
  const duration = toastQueue.length > 2 ? 1400 : big ? 3600 : 2600;
  showToast([avatarElement(m.avatar, m.user), textSpan(text)], { big, duration });
  toastUntil = now + duration * 0.92;
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

function describeGift(m) {
  const times = m.count > 1 ? ` x${m.count}` : '';
  const lift = m.all > 0 ? `, cả đàn ${pctText(m.all)}` : '';
  return `🎁 ${m.user} tặng ${m.detail}${times}: ${EFFECT[m.effect] ?? 'Nước dâng'}${lift}`;
}

// f is null when the giver has no carp this round; the whole school still rises.
function giftEffect(f, m) {
  if (f) {
    f.glow = 1.6;
    if (m.gain > 0) {
      leap(f);
      addFloat(pctText(m.gain), { fish: f, size: 34, color: '#ffe08a', rise: 80, life: 2 });
    }
    addSparks(f.x, f.y, 24, 220);
    splash(f.x, f.y, 14, 1.2);
  }
  for (const other of fishes.values()) if (other !== f && !other.hidden) splash(other.x, other.y + 10, 4, 0.7);
  switch (m.effect) {
    case 'splash':
      sound.splash(0.25);
      sound.arpeggio(3);
      break;
    case 'wave':
      addWave(0.8);
      sound.splash(0.3);
      sound.arpeggio(4);
      break;
    case 'surge':
      addWave(1);
      addWave(1, 0.4);
      sound.drum();
      sound.arpeggio(5);
      break;
    case 'rain':
      addWave(1);
      rainFor = Math.max(rainFor, 3);
      sound.gong();
      sound.arpeggio(6);
      break;
    default:
      addWave(1);
      addWave(1, 0.5);
      rainFor = Math.max(rainFor, 4);
      flash = Math.max(flash, 0.8);
      addDragon(FLYBY_PATH, 3.6, { image: avatarImage(m.avatar), name: m.user });
      sound.gong();
      sound.arpeggio(8);
  }
}

function act(m) {
  // Pond carps react too, with gain 0: they are not racing.
  const f = m.key === null ? null : (fishes.get(m.key) ?? aquarium.get(m.key));
  if (!f) {
    // Viewers without a carp this round: follows and shares get a thank-you, gifts still lift the school.
    if (m.via === 'follow' || m.via === 'share') queueToast(m, m.via === 'follow' ? `➕ ${m.user} vừa follow` : `🔁 ${m.user} vừa chia sẻ live`);
    if (m.via === 'gift') {
      giftEffect(null, m);
      queueToast(m, describeGift(m), m.effect === 'rain' || m.effect === 'dragon');
    }
    return;
  }
  if (typeof m.p === 'number' && !f.inPond) f.p = m.p / 1000;
  f.active = clock;
  switch (m.via) {
    case 'like':
      f.beat = Math.min(16, f.beat + 1.5);
      addHearts(f, Math.min(3, Math.ceil(m.count / 5)));
      likeLabel(f, m.gain);
      sound.bubble();
      break;
    case 'comment':
      addRipple(f.x, f.y + 20, 50, 1);
      splash(f.x, f.y, 6, 0.8);
      if (m.gain > 0) addFloat(pctText(m.gain), { fish: f, color: '#bff4ff' });
      sound.pluck();
      break;
    case 'follow':
    case 'share': {
      f.glow = 1;
      if (m.gain > 0) {
        leap(f);
        addFloat(pctText(m.gain), { fish: f, size: 32, color: '#bff4ff' });
      }
      splash(f.x, f.y, 16, 1.1);
      sound.splash(0.25);
      sound.pluck();
      const what = m.via === 'follow' ? `➕ ${m.user} vừa follow` : `🔁 ${m.user} vừa chia sẻ live`;
      queueToast(m, m.gain > 0 ? `${what} → cá nhảy vọt ${pctText(m.gain)}` : what);
      break;
    }
    case 'gift':
      giftEffect(f, m);
      queueToast(m, describeGift(m), m.effect === 'rain' || m.effect === 'dragon');
      break;
  }
}

// ---------- Server state ----------
let roundState = { n: 0, phase: 'idle', endsAt: 0 };

// Splashes into the pond at the foot of the falls.
function dropIntoPond(f, loud = true) {
  f.x = rand(300, 780);
  f.y = POND.y0 + rand(0, 30);
  splash(f.x, f.y, 12);
  addRipple(f.x, f.y, 70);
  if (loud) sound.splash(0.12);
}

// list: racers on the falls; pond: carps in the bể cá. A carp keeps its key when it moves between the two,
// so the same carp swims from the pond up to the start line, or tumbles back down after the round.
function setRoster(list, pond = [], fromSnapshot = false) {
  const old = new Map(fromSnapshot ? [] : [...fishes, ...aquarium]);
  // A fresh snapshot (page load or server restart) may reuse keys for other viewers.
  if (fromSnapshot) for (const f of [...fishes.values(), ...aquarium.values()]) if (!f.hidden) departing.push(f);
  fishes.clear();
  aquarium.clear();
  let returning = 0;
  const place = (item, target, inPond) => {
    let f = old.get(item.key);
    old.delete(item.key);
    if (!f) {
      f = makeFish(item, false, inPond);
      if (!fromSnapshot) dropIntoPond(f);
    } else {
      f.name = item.name;
      if (f.avatar !== item.avatar) {
        f.avatar = item.avatar;
        f.image = avatarImage(item.avatar);
      }
      if (f.inPond && !inPond) {
        // Commented the join word: swims up from the pond to its lane on the start line.
        f.inPond = false;
        f.p = 0;
        f.born = clock;
        f.beat = 14;
        f.glow = 1;
        splash(f.x, f.y, 10);
        addRipple(f.x, f.y, 60);
        addFloat('Lên vạch!', { fish: f, size: 26, color: '#ffe08a', rise: 40, life: 1.6 });
        sound.splash(0.15);
        sound.pluck();
      } else if (!f.inPond && inPond) {
        // Round over: back to the pond. The winner (hidden as a dragon) reappears with a splash.
        f.inPond = true;
        f.p = 0;
        f.wander = null;
        f.leap = null;
        if (f.hidden) {
          f.hidden = false;
          dropIntoPond(f, false);
        }
        returning++;
      }
    }
    target.set(item.key, f);
  };
  for (const item of list) place(item, fishes, false);
  for (const item of pond) place(item, aquarium, true);
  for (const f of old.values()) if (!f.hidden) departing.push(f);
  if (returning) sound.splash(0.2);
}

function setPositions(pos, snap = false) {
  for (const [key, permille] of pos) {
    const f = fishes.get(key);
    if (!f) continue;
    f.p = permille / 1000;
    if (snap) {
      f.y = trackY(f.p) + f.stagger * Math.min(1, f.p * 20);
      f.x = laneX(f.lane, f.y);
      f.angle = -Math.PI / 2;
    }
  }
}

function setRound(m, fromSnapshot = false) {
  const before = roundState.phase;
  roundState = { n: m.n, phase: m.phase, endsAt: m.endsAt };
  if (fromSnapshot || before === m.phase) return;
  if (m.phase === 'join') {
    showToast([textSpan(`📝 Mở đăng ký vòng ${m.n + 1}! Comment “${joinWord}” để tham gia`)], { note: true, duration: 3200 });
    toastUntil = performance.now() + 3200;
    sound.gong();
  } else if (m.phase === 'racing') {
    showToast([textSpan(`🥁 Vòng ${m.n} bắt đầu! Thả tim cho cá vượt thác`)], { note: true, duration: 2600 });
    toastUntil = performance.now() + 2600;
    [0, 300, 600].forEach((delay) => setTimeout(sound.drum, delay));
  }
}

const mmss = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const secondsLeft = () => Math.max(0, Math.ceil((roundState.endsAt - Date.now()) / 1000));
let panelKey = '';
let lastLeft = -1;
function updateRoundPanel() {
  const left = secondsLeft();
  const { n, phase } = roundState;
  const counting = phase === 'racing' || phase === 'join';
  if (counting && left <= 5 && left > 0 && left !== lastLeft) sound.tick();
  lastLeft = left;
  const key = `${phase}|${n}|${left}|${fishes.size}|${aquarium.size}`;
  if (key === panelKey) return;
  panelKey = key;
  timerText.classList.toggle('urgent', counting && left <= 10);
  if (phase === 'racing') {
    roundTitle.textContent = `⏳ Vòng ${n}`;
    timerText.textContent = mmss(left);
    roundNote.textContent = `${fishes.size} cá đang đua`;
  } else if (phase === 'join') {
    roundTitle.textContent = `📝 Vòng ${n + 1}`;
    timerText.textContent = mmss(left);
    roundNote.textContent = `Đăng ký · ${fishes.size} cá ở vạch`;
  } else if (phase === 'break') {
    roundTitle.textContent = `🐉 Hết vòng ${n}`;
    timerText.textContent = mmss(left);
    roundNote.textContent = 'Sắp mở đăng ký';
  } else {
    roundTitle.textContent = `⏳ Vòng ${n + 1}`;
    timerText.textContent = '--:--';
    roundNote.textContent = aquarium.size ? `${aquarium.size} cá trong bể · chờ người chơi` : 'Chờ người chơi';
  }
}

function drawPrompt() {
  const { phase } = roundState;
  if (win || (phase !== 'idle' && phase !== 'join')) return;
  ctx.globalAlpha = 0.75 + 0.25 * Math.sin(clock * 3);
  outlinedText(`Comment “${joinWord}” để tham gia!`, 540, 1060, 52, '#ffe08a', 800);
  ctx.globalAlpha = 1;
  const sub = phase === 'join' ? `Còn ${secondsLeft()} giây · ${fishes.size} cá đã lên vạch xuất phát` : aquarium.size ? 'Cá trong bể sẽ bơi lên vạch xuất phát' : 'Vòng mới mở khi có người tham gia';
  outlinedText(sub, 540, 1128, 36, '#ffffff', 800);
}

// ---------- HUD ----------
function renderTop(list) {
  if (!list.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Chưa ai hóa rồng, hãy là người đầu tiên!';
    topList.replaceChildren(empty);
    return;
  }
  topList.replaceChildren(
    ...list.map((entry, i) => {
      const li = document.createElement('li');
      for (const [className, text] of [['rank', MEDALS[i]], ['name', entry.name], ['pts', `×${entry.count}`]]) {
        li.append(Object.assign(document.createElement('span'), { className, textContent: text }));
      }
      return li;
    }),
  );
}

function giftIcon(src) {
  const image = Object.assign(new Image(), { className: 'gift-icon', alt: '', src });
  image.onerror = () => image.replaceWith('🎁');
  return image;
}

let joinWord = 'chơi';
function renderGuide(guide) {
  joinWord = guide.joinWord;
  noteText.textContent = `Comment “${joinWord}” để tham gia · thả tim cho cá vượt thác`;
  const item = (what, result) => {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.append(...what, ': ');
    li.append(b, result);
    return li;
  };
  guideList.replaceChildren(
    ...(guide.roomJoin ? [item(['👋 Vào phòng'], 'có cá bơi trong bể')] : []),
    item([`💬 Comment “${joinWord}”`], 'lên vạch xuất phát'),
    item(['❤️ Thả tim, bình luận'], 'bơi lên'),
    item(['➕ Follow · 🔁 Share'], 'nhảy vọt'),
    item([...[...guide.tiers].reverse().map((tier) => giftIcon(tier.icon)), ' Quà'], `nước dâng cả đàn, người tặng ×${guide.giverBonus}`),
  );
}

// ---------- Main loop & server events ----------
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock += dt;
  ctx.clearRect(0, 0, W, H);
  drawGateGlow();
  drawWater(dt);
  drawFoam(dt);
  drawRipples(dt);
  drawStartLine();
  drawSchool(dt);
  drawDrops(dt);
  drawHearts(dt);
  drawGoldRain(dt);
  drawRings(dt);
  // Dragons fly behind the winner card so the name stays readable.
  drawDragons(dt);
  drawWin(dt);
  drawSparks(dt);
  drawTexts(dt);
  drawPrompt();
  drawFlash(dt);
  updateRoundPanel();
  pumpToasts(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const events = new EventSource('/events');
events.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  // Succeeds once this page has been clicked.
  if (audio.state === 'suspended' && ['action', 'speak', 'win'].includes(msg.type)) audio.resume().catch(() => {});
  switch (msg.type) {
    case 'snapshot':
      renderGuide(msg.guide);
      setRoster(msg.fish, msg.pond, true);
      setPositions(msg.pos, true);
      setRound(msg.round, true);
      renderTop(msg.top);
      break;
    case 'roster':
      setRoster(msg.fish, msg.pond);
      break;
    case 'race':
      setPositions(msg.pos);
      break;
    case 'round':
      setRound(msg);
      break;
    case 'action':
      act(msg);
      break;
    case 'win':
      onWin(msg);
      break;
    case 'board':
      renderTop(msg.top);
      break;
    case 'join':
      welcome(msg);
      break;
    case 'speak':
      speak(msg.id);
      break;
  }
};
