const W = 1080;
const H = 1920;
const $ = (id) => document.getElementById(id);

const stage = $('stage');
const ctx = $('fx').getContext('2d');
const toast = $('toast');
const welcomeBox = $('welcome');
const totalValue = $('total-value');
const topList = $('top');
const guideList = $('guide');
const bell = $('bell');
const mo = $('mo');
const mallet = $('mallet');
const halo = $('halo');
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
const BOWL = { x: 540, y: 988 };

const rand = (min, max) => min + Math.random() * (max - min);
const fmt = (n) => Math.round(n).toLocaleString('vi-VN');

function fit() {
  const scale = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
}
addEventListener('resize', fit);
fit();

for (let i = 0; i < 70; i++) {
  const star = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  star.setAttribute('cx', rand(0, W).toFixed(0));
  star.setAttribute('cy', rand(0, 700).toFixed(0));
  star.setAttribute('r', rand(0.8, 2.4).toFixed(1));
  star.setAttribute('fill', '#fff');
  star.classList.add('star');
  star.style.animationDelay = `${rand(-3, 0).toFixed(2)}s`;
  star.style.animationDuration = `${rand(1.5, 4).toFixed(2)}s`;
  $('stars').append(star);
}

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

// ---------- Background music (generated live, no recordings) ----------
// Wind-chime notes wander over A minor pentatonic above a soft breathing drone, so it never loops.
const MUSIC_VOLUME = 1.0;
const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];
const music = audio.createGain();
music.gain.value = MUSIC_VOLUME;
music.connect(master);
const reverb = audio.createConvolver();
{
  const length = Math.round(audio.sampleRate * 3.5);
  const impulse = audio.createBuffer(2, length, audio.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  reverb.buffer = impulse;
}
reverb.connect(music);

let musicOn = false;
let nextNote = 0;
let step = 5;

function startMusic() {
  if (musicOn || muted || audio.state !== 'running') return;
  musicOn = true;
  const drone = new GainNode(audio, { gain: 0.035 });
  const lowpass = new BiquadFilterNode(audio, { type: 'lowpass', frequency: 600 });
  lowpass.connect(drone).connect(music);
  for (const frequency of [110, 110.3, 164.81]) {
    const osc = new OscillatorNode(audio, { frequency });
    osc.connect(lowpass);
    osc.start();
  }
  const breath = new OscillatorNode(audio, { frequency: 0.07 });
  breath.connect(new GainNode(audio, { gain: 0.015 })).connect(drone.gain);
  breath.start();
  scheduleMusic();
}

// Schedules a few seconds ahead on the audio clock, so slow timers never cause gaps or glitches.
function scheduleMusic() {
  if (!musicOn) return;
  const now = audio.currentTime;
  nextNote = Math.max(nextNote, now + 0.3);
  while (nextNote < now + 4) {
    step = Math.random() < 0.1 ? 5 : Math.min(SCALE.length - 1, Math.max(0, step + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
    const pan = new StereoPannerNode(audio, { pan: rand(-0.6, 0.6) });
    pan.connect(music);
    pan.connect(reverb);
    tone(SCALE[step], nextNote, 4.5, 0.1, 'sine', pan);
    tone(SCALE[step] * 2.76, nextNote, 1.2, 0.012, 'sine', pan);
    nextNote += [1.6, 2.4, 2.4, 3.2, 4.8, 7][Math.floor(Math.random() * 6)];
  }
}
setInterval(scheduleMusic, 1000);
audio.addEventListener('statechange', startMusic);
startMusic();

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
  ctx.strokeStyle = 'rgba(30, 8, 0, 0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function addSticks(count) {
  for (let i = 0; i < count; i++) {
    sticks.push({ x: BOWL.x + rand(-30, 30), y: BOWL.y + rand(-3, 3), tilt: rand(-0.12, 0.12), len: rand(95, 115), age: 0, life: rand(80, 100), puff: 0 });
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
    const hx = s.x + dx * 26;
    const hy = s.y + dy * 26;
    const tx = s.x + dx * length;
    const ty = s.y + dy * length;
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.strokeStyle = '#6e4a2a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    glow(tx, ty, 12, '255, 120, 30', 0.9);
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath();
    ctx.arc(tx, ty, 2.5, 0, Math.PI * 2);
    ctx.fill();
    s.puff += dt;
    while (s.puff > 0.22) {
      s.puff -= 0.22;
      smoke.push({ x: tx, y: ty - 4, vx: rand(-6, 6), vy: rand(-55, -38), r: rand(5, 8), age: 0, life: rand(3.5, 5), seed: rand(0, 6) });
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
    p.x += (p.vx + Math.sin(p.age * 1.6 + p.seed) * 14) * dt;
    p.y += p.vy * dt;
    p.r += 9 * dt;
    ctx.globalAlpha = 0.32 * (1 - p.age / p.life) * Math.min(1, p.age * 3);
    ctx.drawImage(puff, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  }
  ctx.globalAlpha = 1;
}

const PETAL_COLORS = ['#ff9ec4', '#ffc4dc', '#ff6f96', '#ffe1ec'];
function addPetals(count, x0, x1, gold = false) {
  for (let i = 0; i < count; i++) {
    petals.push({
      x: rand(x0, x1),
      y: rand(320, 640),
      vx: rand(-20, 20),
      vy: rand(70, 140),
      rot: rand(0, Math.PI * 2),
      spin: rand(-3, 3),
      size: rand(7, 12),
      color: gold && Math.random() < 0.4 ? '#ffd54a' : PETAL_COLORS[i % PETAL_COLORS.length],
      age: 0,
      seed: rand(0, 6),
    });
  }
  cap(petals, 400);
}

function drawPetals(dt) {
  for (let i = petals.length - 1; i >= 0; i--) {
    const p = petals[i];
    p.age += dt;
    p.x += (p.vx + Math.sin(p.age * 2 + p.seed) * 30) * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
    if (p.y > 1180) {
      petals.splice(i, 1);
      continue;
    }
    ctx.save();
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
    ctx.arc(ring.x, ring.y, 40 + k * ring.max, 0, Math.PI * 2);
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
    grad.addColorStop(0, '#e0507a');
    grad.addColorStop(1, '#f2a03d');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(r * 0.95)}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial(name), x, y + r * 0.06);
  }
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#f2c14e';
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

// Same speed for every lantern plus a 150px spawn gap, so lanterns never overlap.
function addLanterns(name, count) {
  for (let i = 0; i < count && lanterns.length < 14; i++) {
    const behind = lanterns.length ? lanterns[lanterns.length - 1].x - 150 : -70;
    lanterns.push({ name, x: Math.min(-70, behind), y: 1215 + rand(-22, 22), phase: rand(0, 6), age: 0 });
  }
}

function drawPetalShape(x, y, angle, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  const grad = ctx.createLinearGradient(0, 0, 0, -72);
  grad.addColorStop(0, '#e0507a');
  grad.addColorStop(1, '#ffe0ec');
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
    l.x += 48 * dt;
    if (l.x > W + 80) {
      lanterns.splice(i, 1);
      continue;
    }
    const y = l.y + Math.sin(l.phase + l.age * 1.3) * 4;
    glow(l.x, y + 16, 80, '255, 170, 80', 0.22);
    ctx.fillStyle = '#1f5a3a';
    ctx.beginPath();
    ctx.ellipse(l.x, y + 14, 46, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const [angle, scale] of [[-1.1, 0.46], [1.1, 0.46], [-0.55, 0.56], [0.55, 0.56], [0, 0.62]]) {
      drawPetalShape(l.x, y + 10, angle, scale);
    }
    const flicker = Math.sin(l.age * 20 + l.phase) * 1.5;
    glow(l.x, y - 30, 46, '255, 210, 110', 0.55);
    ctx.fillStyle = '#ffe9a6';
    ctx.beginPath();
    ctx.ellipse(l.x, y - 30, 4, 9 + flicker, 0, 0, Math.PI * 2);
    ctx.fill();
    outlinedText(l.name, l.x, y + 42, 22, '#ffffff');
  }
}

function drawWishCards(dt) {
  ctx.font = '700 28px "Segoe UI", Arial, sans-serif';
  for (let i = wishCards.length - 1; i >= 0; i--) {
    const card = wishCards[i];
    card.age += dt;
    if (card.age > card.life) {
      wishCards.splice(i, 1);
      continue;
    }
    const k = card.age / card.life;
    const width = ctx.measureText(card.text).width + 44;
    // Keep cards left of the leaderboard panel (x >= 812).
    const x = Math.min(800 - width / 2, Math.max(width / 2 + 10, card.x));
    // Start just above the praying viewer's avatar.
    const y = card.y - 420 * (1 - (1 - k) ** 2);
    ctx.globalAlpha = Math.min(1, card.age * 3) * (1 - Math.max(0, (k - 0.7) / 0.3));
    ctx.fillStyle = 'rgba(120, 20, 16, 0.85)';
    ctx.strokeStyle = '#f2c14e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - 26, width, 52, 26);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff6da';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.text, x, y + 1);
  }
  ctx.globalAlpha = 1;
}

// ---------- Praying viewers ----------
// Praying viewers stay on the lily pads; once every pad is taken, a newcomer replaces whoever prayed least recently.
// Four staggered rows fill back to front; each row sits in the gaps between the seats of the row behind it.
const PRAY_SLOTS = [1300, 1490, 1680, 1870].flatMap((y, row) =>
  (row % 2 ? [228, 383, 538, 693, 848] : [150, 305, 460, 615, 770]).map((x) => ({ x, y })),
);
const PRAY_FADE = 0.6;
const prayers = [];
let prayerSeq = 0;
let idleBowIn = rand(5, 10);

const SEAT_BOW_START = 1;
const SEAT_BOW_TIME = 2.6;
const SEAT_BOWS_END = SEAT_BOW_START + 3 * SEAT_BOW_TIME;

// Three bows (vái ba vái), counted from when the bow was triggered.
function bowAngle(age) {
  const t = (age - SEAT_BOW_START) / SEAT_BOW_TIME;
  return t < 0 || t >= 3 ? 0 : Math.sin(Math.PI * (t % 1)) ** 2 * 0.6;
}

function drawKneeler(x, y, facing, bow) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#174a31';
  ctx.beginPath();
  ctx.ellipse(0, 2, 72, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#23653f';
  ctx.beginPath();
  ctx.ellipse(0, 0, 64, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.scale(facing, 1);
  ctx.fillStyle = '#7a1f17';
  ctx.beginPath();
  ctx.ellipse(0, -6, 44, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a8322a';
  ctx.strokeStyle = '#e0b45a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, -10, 40, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Legs folded under, sitting on the heels, knees to the front.
  ctx.fillStyle = '#6b4c33';
  ctx.beginPath();
  ctx.moveTo(-38, -12);
  ctx.lineTo(28, -12);
  ctx.quadraticCurveTo(42, -12, 40, -26);
  ctx.quadraticCurveTo(38, -38, 22, -40);
  ctx.lineTo(-22, -42);
  ctx.quadraticCurveTo(-42, -40, -38, -12);
  ctx.fill();
  // The upper body bows around the hip.
  ctx.translate(-14, -38);
  ctx.rotate(bow);
  ctx.fillStyle = '#8a6a4a';
  ctx.beginPath();
  ctx.moveTo(-20, 4);
  ctx.quadraticCurveTo(-26, -26, -12, -50);
  ctx.quadraticCurveTo(0, -60, 12, -52);
  ctx.quadraticCurveTo(22, -36, 22, -16);
  ctx.lineTo(24, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f0c9a0';
  ctx.fillRect(0, -62, 8, 10);
  ctx.beginPath();
  ctx.arc(5, -73, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b1d14';
  ctx.beginPath();
  ctx.arc(5, -73, 15, Math.PI * 0.6, Math.PI * 1.9);
  ctx.fill();
  // Arm bent up to palms joined in front of the chest.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#7a5a3c';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(4, -46);
  ctx.lineTo(18, -22);
  ctx.lineTo(26, -38);
  ctx.stroke();
  ctx.strokeStyle = '#f0c9a0';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(27, -42);
  ctx.lineTo(31, -62);
  ctx.stroke();
  ctx.restore();
}

function drawPrayers(dt) {
  for (let i = prayers.length - 1; i >= 0; i--) {
    const p = prayers[i];
    p.age += dt;
    if (p.leaving !== undefined && (p.leaving += dt) > PRAY_FADE) prayers.splice(i, 1);
  }
  // Every 5-10 s one seated viewer who isn't already bowing bows three times, so the pond never looks frozen.
  idleBowIn -= dt;
  if (idleBowIn <= 0) {
    idleBowIn = rand(5, 10);
    const resting = prayers.filter((p) => p.leaving === undefined && p.age - p.bowAt >= SEAT_BOWS_END);
    const chosen = resting[Math.floor(Math.random() * resting.length)];
    if (chosen) chosen.bowAt = chosen.age;
  }
  // Back row first, so the front row overlaps it.
  for (const p of [...prayers].sort((a, b) => PRAY_SLOTS[a.slot].y - PRAY_SLOTS[b.slot].y)) {
    const { x } = PRAY_SLOTS[p.slot];
    const y = PRAY_SLOTS[p.slot].y + Math.sin(p.age * 1.4 + p.slot) * 3;
    ctx.globalAlpha = Math.min(1, p.age / PRAY_FADE, 1 - (p.leaving ?? 0) / PRAY_FADE);
    glow(x, y - 130, 120, '255, 196, 110', 0.16);
    drawKneeler(x, y, x < 540 ? 1 : -1, bowAngle(p.age - p.bowAt));
    drawAvatar(p.image, p.name, x, y - 208, 40);
    outlinedText(p.label, x, y - 150, 24, '#ffffff');
  }
  ctx.globalAlpha = 1;
}

function fitText(text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && ctx.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop();
  return `${chars.join('')}…`;
}

// ---------- Focus cam ----------
// A newcomer first bows three times alone, filmed from behind, then takes a seat on the pond.
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
  focus = { m, repent, bowTime, depth: repent ? 1.2 : 0.9, bowsEnd, out, end: out + FOCUS_FADE, verse, motes: [], spawn: 0, t: 0, rung: 0, released: false, seated: false, image: avatarImage(m.avatar), label };
  stage.classList.add('focusing');
  if (repent) music.gain.setTargetAtTime(MUSIC_VOLUME * 0.3, audio.currentTime, 0.4);
}

function drawAltar(t) {
  glow(540, 720, 640, '255, 180, 100', 0.28);
  glow(540, 650, 260, '255, 214, 140', 0.5);
  glow(540, 650, 150, '255, 240, 200', 0.35);
  ctx.strokeStyle = 'rgba(255, 224, 138, 0.75)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(540, 650, 150, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#5e1a14';
  ctx.fillRect(360, 870, 360, 110);
  ctx.fillStyle = '#e0b45a';
  ctx.fillRect(350, 862, 380, 12);
  ctx.strokeStyle = 'rgba(224, 180, 90, 0.7)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(375, 905);
  ctx.lineTo(705, 905);
  ctx.stroke();
  for (const [angle, scale] of [[-1.12, 1.17], [1.12, 1.17], [-0.58, 1.35], [0.58, 1.35], [0, 1.5]]) drawPetalShape(540, 868, angle, scale);
  for (const x of [400, 680]) {
    ctx.fillStyle = '#f4e4c1';
    ctx.fillRect(x - 8, 812, 16, 52);
    glow(x, 800, 40, '255, 200, 90', 0.6);
    ctx.fillStyle = '#ffcf4d';
    ctx.beginPath();
    ctx.ellipse(x, 800, 6, 12 + Math.sin(t * 18 + x) * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = 'round';
  for (const [i, x] of [520, 540, 560].entries()) {
    const tipX = x + (i - 1) * 6;
    ctx.strokeStyle = '#6e4a2a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, 985);
    ctx.lineTo(tipX, 880);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(235, 235, 245, 0.16)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    for (let d = 0; d <= 260; d += 10) ctx.lineTo(tipX + Math.sin(d / 40 - t * 1.6 + i * 2) * (4 + d / 14), 880 - d);
    ctx.stroke();
    glow(tipX, 880, 14, '255, 120, 30', 0.9);
  }
  const bronze = ctx.createLinearGradient(468, 0, 612, 0);
  bronze.addColorStop(0, '#5a3b12');
  bronze.addColorStop(0.35, '#e2bb63');
  bronze.addColorStop(0.6, '#a77a2b');
  bronze.addColorStop(1, '#46300f');
  ctx.fillStyle = bronze;
  ctx.beginPath();
  ctx.moveTo(468, 988);
  ctx.quadraticCurveTo(474, 1032, 512, 1038);
  ctx.lineTo(568, 1038);
  ctx.quadraticCurveTo(606, 1032, 612, 988);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#3a2a1a';
  ctx.strokeStyle = '#e2bb63';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(540, 988, 72, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// Kneeling on a cushion, seen from behind; a bow tips the upper body away from the camera.
function drawBackKneeler(x, y, bow) {
  const k = Math.cos(bow);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#7a1f17';
  ctx.beginPath();
  ctx.ellipse(0, -12, 215, 52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a8322a';
  ctx.strokeStyle = '#e0b45a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(0, -26, 198, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#5e4330';
  ctx.beginPath();
  ctx.moveTo(-175, -28);
  ctx.quadraticCurveTo(-192, -120, -150, -168);
  ctx.quadraticCurveTo(0, -208, 150, -168);
  ctx.quadraticCurveTo(192, -120, 175, -28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c8936a';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 62, -36, 44, 20, side * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.translate(0, -150);
  // Head first, so it sinks behind the shoulders during the bow.
  const headY = -365 * k;
  ctx.fillStyle = '#e2ad84';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 70, headY + 6, 11, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2a1c14';
  ctx.beginPath();
  ctx.arc(0, headY, 72, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b120c';
  ctx.beginPath();
  ctx.arc(0, headY - 22, 34, 0, Math.PI * 2);
  ctx.fill();
  const robe = ctx.createLinearGradient(-185, 0, 185, 0);
  robe.addColorStop(0, '#5f4530');
  robe.addColorStop(0.5, '#93714f');
  robe.addColorStop(1, '#5f4530');
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(-165, 10);
  ctx.quadraticCurveTo(-185, -140 * k, -172, -235 * k);
  ctx.quadraticCurveTo(-170, -290 * k, -110, -295 * k);
  ctx.lineTo(110, -295 * k);
  ctx.quadraticCurveTo(170, -290 * k, 172, -235 * k);
  ctx.quadraticCurveTo(185, -140 * k, 165, 10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#4e3826';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -288 * k);
  ctx.lineTo(0, 4);
  ctx.stroke();
  ctx.strokeStyle = '#7a5a3c';
  ctx.lineWidth = 50;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 150, -255 * k);
    ctx.lineTo(side * 182, -105 * k);
    ctx.stroke();
  }
  ctx.restore();
}

// The altar light swells while the smoke turns to light.
function drawHaloFlare(t) {
  const k = Math.min(1, (t - focus.bowsEnd) / RELEASE_TIME);
  glow(540, 650, 170 + 330 * k, '255, 226, 150', 0.7 - 0.4 * k);
}

// Gray smoke rises from the kneeling viewer during the bows; at the release it turns gold and sparks fly up to the altar.
function drawMotes(dt, t, alpha) {
  const motes = focus.motes;
  if (t < focus.out) {
    focus.spawn += dt * (focus.released ? 40 : 8);
    for (; focus.spawn >= 1; focus.spawn--) {
      motes.push(
        focus.released
          ? { x: 540 + rand(-160, 160), y: rand(1250, 1450), vx: rand(-20, 20), vy: rand(-340, -200), r: rand(4, 8), age: 0, life: rand(1.2, 2), gold: 1 }
          : { x: 540 + rand(-170, 170), y: rand(1200, 1380), vx: rand(-12, 12), vy: rand(-70, -40), r: rand(16, 28), age: 0, life: rand(3, 4.5), gold: 0 },
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
    if (focus.repent) {
      music.gain.setTargetAtTime(MUSIC_VOLUME, audio.currentTime, 0.8);
      repented(focus.m);
    } else {
      seat(focus.m, true);
    }
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
  const backdrop = ctx.createLinearGradient(0, 0, 0, H);
  backdrop.addColorStop(0, '#140b20');
  backdrop.addColorStop(1, '#050208');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  // Slow dolly-in.
  const zoom = 1.06 - 0.06 * Math.min(1, t / focus.out);
  ctx.translate(540, 1100);
  ctx.scale(zoom, zoom);
  ctx.translate(-540, -1100);
  drawAltar(t);
  if (focus.released) drawHaloFlare(t);
  glow(540, 1150, 300, '255, 190, 110', 0.14);
  drawBackKneeler(540, 1660, focusBow(t));
  if (focus.repent) drawMotes(dt * speed, t, alpha);
  ctx.restore();
  const vignette = ctx.createRadialGradient(540, 1000, 450, 540, 1000, 1150);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
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
  const grad = ctx.createRadialGradient(540, 920, 0, 540, 920, 900);
  grad.addColorStop(0, `rgba(255, 220, 120, ${0.55 * flash})`);
  grad.addColorStop(1, 'rgba(255, 220, 120, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
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
  for (let i = 0; i < 3; i++) rings.push({ x: 140, y: 830, age: -i * 0.35, life: 1.8, max: 420 });
  addSparks(140, 830, 30, 200);
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
    addText(`+${fmt(m.merit)} công đức`, 905, 925 + slot * 60, { size: 30, color: '#fff1b8', name: m.user, kind: 'like', merit: m.merit, slot, rise: 12 });
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

function wish(m) {
  const seated = prayers.find((p) => p.leaving === undefined && p.name === m.user);
  if (seated) {
    // Praying again: bow three more times in place.
    seated.bowAt = seated.age;
    seated.image = avatarImage(m.avatar);
    seated.seq = ++prayerSeq;
    wishCards.push({ text: `🙏 ${m.user} cầu ${m.detail}`, x: PRAY_SLOTS[seated.slot].x, y: PRAY_SLOTS[seated.slot].y - 290, age: 0, life: 7 });
    wishChime();
  } else if (focus?.m.user !== m.user && !focusQueue.some((q) => q.user === m.user)) {
    // A long line skips the close-up, so nobody waits too long for a seat.
    if (focusQueue.length >= 3) seat(m, false);
    else focusQueue.push(m);
  }
}

function seat(m, bowed, card = `🙏 ${m.user} cầu ${m.detail}`) {
  const staying = prayers.filter((p) => p.leaving === undefined);
  let slot = PRAY_SLOTS.findIndex((_, i) => !staying.some((p) => p.slot === i));
  if (slot === -1) {
    const oldest = staying.reduce((a, b) => (b.seq < a.seq ? b : a));
    oldest.leaving = 0;
    slot = oldest.slot;
  }
  ctx.font = '700 24px "Segoe UI", Arial, sans-serif';
  prayers.push({ name: m.user, label: fitText(m.user, 148), image: avatarImage(m.avatar), slot, age: 0, bowAt: bowed ? -Infinity : 0, seq: ++prayerSeq });
  const { x, y } = PRAY_SLOTS[slot];
  addSparks(x, y - 60, 14, 140);
  wishCards.push({ text: card, x, y: y - 290, age: 0, life: 7 });
  wishChime();
}

// After the close-up the viewer joins the pond, or keeps their seat, under a card saying they repented.
function repented(m) {
  const card = `🙇 ${m.user} thành tâm sám hối`;
  const seated = prayers.find((p) => p.leaving === undefined && p.name === m.user);
  if (!seated) return seat(m, true, card);
  seated.image = avatarImage(m.avatar);
  seated.seq = ++prayerSeq;
  wishCards.push({ text: card, x: PRAY_SLOTS[seated.slot].x, y: PRAY_SLOTS[seated.slot].y - 290, age: 0, life: 7 });
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
  if (m.merit > 0 && !['bell', 'mo', 'flower', 'repent'].includes(m.action)) addText(`+${fmt(m.merit)} công đức`, 540, 850, { name: m.user });
  switch (m.action) {
    case 'incense':
      addSticks(Math.min(m.count, 5));
      sound.chime(660);
      return 900;
    case 'flower':
      addPetals(30 + Math.min(m.count, 20) * 5, 260, 820);
      vases.forEach((vase) => vase.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 900, easing: 'ease-out' }));
      // One offering portrait at a time; the newest replaces the previous one.
      for (let i = texts.length - 1; i >= 0; i--) if (texts[i].kind === 'offering') texts.splice(i, 1);
      addText(`+${fmt(m.merit)} công đức`, 540, 990, { name: m.user, kind: 'offering', avatar: m.avatar ?? '', wreath: true, rise: 30, life: 3.6 });
      sound.chime(784);
      return 1500;
    case 'lantern':
      addLanterns(m.user, Math.min(m.count, 4));
      sound.chime(523);
      return 1200;
    case 'bell':
      ringBell();
      addText(`+${fmt(m.merit)} công đức`, 140, 690, { name: m.user });
      return 2200;
    case 'ceremony':
      flash = 1;
      ringBell();
      addPetals(160, 30, 1050, true);
      addSparks(540, 925, 90, 420);
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
  const items = [
    { what: '❤️ Like', result: LABEL.mo },
    { what: '➕ Follow', result: LABEL[guide.social.follow] },
    { what: '🔁 Share', result: LABEL[guide.social.share] },
    // Named gifts fill the rows before the long comment line, so the guide stays three rows high above the toast.
    ...guide.gifts.map((gift) => ({ icon: gift.icon, what: gift.icon ? '' : gift.label, result: LABEL[gift.action] })),
    { what: '💬 Bình luận', result: guide.wishes.map((text) => text.toLowerCase()).join(' · ') },
    ...[...guide.tiers].reverse().map((tier) => ({ icon: tier.icon, what: tier.icon ? '' : `🎁 ${tier.minCoins}+ xu`, result: LABEL[tier.action] })),
  ];
  guideList.replaceChildren(
    ...items.map(({ icon, what, result }) => {
      const li = document.createElement('li');
      const b = document.createElement('b');
      if (icon) b.append(giftIcon(icon));
      if (what) b.append(`${what}: `);
      li.append(b, result);
      return li;
    }),
  );
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
  if (!focus && queue.length && now >= nextAt) {
    const m = queue.shift();
    nextAt = now + perform(m) * (queue.length > 6 ? 0.35 : 1);
  }
  if (!focus && !queue.length && focusQueue.length && now >= nextAt) startFocus(focusQueue.shift());
  if (shownTotal !== targetTotal) {
    shownTotal += (targetTotal - shownTotal) * Math.min(1, dt * 5);
    if (Math.abs(targetTotal - shownTotal) < 1) shownTotal = targetTotal;
    totalValue.textContent = fmt(shownTotal);
  }
  ctx.clearRect(0, 0, W, H);
  drawFlash(dt);
  drawRings(dt);
  drawSticks(dt);
  drawSmoke(dt);
  drawLanterns(dt);
  drawPrayers(dt);
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
  if (msg.type === 'join') welcome(msg);
  if (msg.type === 'action') {
    if (msg.via === 'like') knock(msg);
    else if (msg.action === 'wish') wish(msg);
    else if (!joinRepent(msg)) {
      queue.push(msg);
      cap(queue, 80);
    }
  }
};
