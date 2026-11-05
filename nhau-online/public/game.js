import { W, H, TABLES, KITCHEN, ENTRANCE, AISLE_X, STAGE_FRONT, table as tableById, walkInPath, moveSeatPath, pathLength, pointAt, runnerPath, WALK_OUT_SPEED, HOME_BIKE_GAP, HOME_TO_BIKE_MS, homeRideDelay } from './layout.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const canvas = $('game');
const ctx = canvas.getContext('2d');
const FONT = '"Baloo 2", "Segoe UI", Arial, sans-serif';
const HAND = '"Patrick Hand", "Baloo 2", "Segoe UI", sans-serif';

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const lerp = (a, b, t) => a + (b - a) * t;

function fit() {
  const scale = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
}
addEventListener('resize', fit);
fit();

// ---------- Âm thanh tổng hợp (không cần file) ----------
const muted = new URLSearchParams(location.search).has('mute');
const audio = new AudioContext();
const master = audio.createGain();
master.gain.value = muted ? 0 : 0.55;
master.connect(audio.destination);
const soundHint = $('sound-hint');
const syncHint = () => (soundHint.hidden = muted || audio.state === 'running');
audio.addEventListener('statechange', syncHint);
setTimeout(syncHint, 800);
addEventListener('pointerdown', () => audio.resume());

const noiseBuffer = (() => {
  const buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
})();

function tone(freq, start, duration, peak, type = 'sine') {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.05);
  return osc;
}

function noise(start, duration, peak, { type = 'bandpass', freq = 1200, q = 1, attack = 0.01 } = {}) {
  const src = audio.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = audio.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter).connect(gain).connect(master);
  src.start(start);
  src.stop(start + duration + 0.05);
  return { src, filter, gain };
}

const ready = () => audio.state === 'running';
const sound = {
  bell() {
    if (!ready()) return;
    const t = audio.currentTime;
    tone(2093, t, 0.9, 0.18);
    tone(2637, t, 0.7, 0.08);
    tone(2093, t + 0.18, 0.9, 0.14);
  },
  clink() {
    if (!ready()) return;
    const t = audio.currentTime;
    tone(1800 + Math.random() * 400, t, 0.25, 0.08, 'triangle');
    tone(3200, t + 0.03, 0.15, 0.04);
  },
  pour() {
    if (!ready()) return;
    const n = noise(audio.currentTime, 0.7, 0.07, { freq: 900, q: 2, attack: 0.08 });
    n.filter.frequency.exponentialRampToValueAtTime(2400, audio.currentTime + 0.6);
  },
  sizzle() {
    if (!ready()) return;
    noise(audio.currentTime, 1.4, 0.05, { type: 'highpass', freq: 3500, attack: 0.05 });
  },
  cheer(big = 1) {
    if (!ready()) return;
    const t = audio.currentTime;
    const n = noise(t, 2.2 * big, 0.16 * big, { freq: 900, q: 0.7, attack: 0.15 });
    n.filter.frequency.linearRampToValueAtTime(1400, t + 0.6);
    for (let i = 0; i < 10 * big; i++) noise(t + Math.random() * 1.6, 0.06, 0.12, { freq: 2200, q: 3 });
  },
  groan() {
    if (!ready()) return;
    const t = audio.currentTime;
    const n = noise(t, 1.3, 0.1, { freq: 500, q: 1.2, attack: 0.1 });
    n.filter.frequency.exponentialRampToValueAtTime(250, t + 1.2);
  },
  whistle(long = false) {
    if (!ready()) return;
    const t = audio.currentTime;
    const osc = tone(2600, t, long ? 1.1 : 0.45, 0.07, 'sine');
    const lfo = audio.createOscillator();
    const depth = audio.createGain();
    lfo.frequency.value = 28;
    depth.gain.value = 90;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + 1.2);
  },
  jingle() {
    if (!ready()) return;
    const t = audio.currentTime;
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, t + i * 0.11, 0.35, 0.1, 'triangle'));
  },
  tick() {
    if (!ready()) return;
    tone(1400, audio.currentTime, 0.04, 0.06, 'square');
  },
  win() {
    if (!ready()) return;
    const t = audio.currentTime;
    [659, 784, 988, 1319].forEach((f, i) => tone(f, t + i * 0.09, 0.6, 0.11, 'triangle'));
  },
  motorbike(dir) {
    if (!ready()) return;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.linearRampToValueAtTime(95, t + 1.2);
    osc.frequency.linearRampToValueAtTime(60, t + 2.6);
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 1.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    const pan = audio.createStereoPanner();
    pan.pan.setValueAtTime(-dir, t);
    pan.pan.linearRampToValueAtTime(dir, t + 2.6);
    osc.connect(filter).connect(gain).connect(pan).connect(master);
    osc.start(t);
    osc.stop(t + 2.9);
  },
  crash() {
    if (!ready()) return;
    const t = audio.currentTime;
    noise(t, 0.6, 0.35, { type: 'lowpass', freq: 900, attack: 0.005 });
    noise(t + 0.02, 0.35, 0.18, { freq: 3000, q: 0.8, attack: 0.005 });
    [420, 637, 911, 1290].forEach((f, i) => tone(f, t + i * 0.04, 0.5, 0.05, 'square'));
    for (let i = 0; i < 6; i++) tone(1800 + Math.random() * 2000, t + 0.15 + Math.random() * 0.5, 0.12, 0.04, 'triangle');
  },
  powerOff() {
    if (!ready()) return;
    const t = audio.currentTime;
    const osc = tone(180, t, 0.6, 0.12, 'sawtooth');
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.55);
    noise(t, 0.08, 0.15, { freq: 2500, q: 1, attack: 0.002 });
  },
  siren() {
    if (!ready()) return;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    osc.type = 'triangle';
    for (let i = 0; i < 8; i++) {
      osc.frequency.setValueAtTime(i % 2 ? 640 : 860, t + i * 0.35);
    }
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.3);
    gain.gain.setValueAtTime(0.05, t + 2.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.9);
    const pan = audio.createStereoPanner();
    pan.pan.setValueAtTime(0.8, t);
    pan.pan.linearRampToValueAtTime(0.1, t + 2.5);
    osc.connect(gain).connect(pan).connect(master);
    osc.start(t);
    osc.stop(t + 3);
  },
  vomit() {
    if (!ready()) return;
    const t = audio.currentTime;
    // Hai tiếng "ọe": giọng trầm trượt xuống, kèm tiếng ọc ọc.
    for (const [at, len] of [[0, 0.42], [0.62, 0.75]]) {
      const osc = audio.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(230, t + at);
      osc.frequency.exponentialRampToValueAtTime(85, t + at + len);
      const filter = audio.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 650;
      filter.Q.value = 2.2;
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0.0001, t + at);
      gain.gain.exponentialRampToValueAtTime(0.13, t + at + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
      osc.connect(filter).connect(gain).connect(master);
      osc.start(t + at);
      osc.stop(t + at + len + 0.05);
      noise(t + at + 0.08, len, 0.07, { type: 'lowpass', freq: 520, attack: 0.04 });
    }
    noise(t + 1.15, 0.5, 0.12, { type: 'lowpass', freq: 380, attack: 0.01 });
  },
  whoosh() {
    if (!ready()) return;
    const t = audio.currentTime;
    const n = noise(t, 0.55, 0.09, { freq: 500, q: 1.4, attack: 0.05 });
    n.filter.frequency.exponentialRampToValueAtTime(2200, t + 0.5);
  },
  mop() {
    if (!ready()) return;
    const t = audio.currentTime;
    for (let i = 0; i < 5; i++) noise(t + i * 0.5, 0.32, 0.06, { freq: 1500, q: 0.9, attack: 0.08 });
  },
  meow() {
    if (!ready()) return;
    const t = audio.currentTime;
    const osc = tone(700, t, 0.5, 0.06, 'triangle');
    osc.frequency.linearRampToValueAtTime(950, t + 0.15);
    osc.frequency.linearRampToValueAtTime(600, t + 0.45);
  },
  karaoke() {
    if (!ready()) return;
    const t = audio.currentTime;
    // Một đoạn giai điệu tự sáng tác, vui vui kiểu loa kéo.
    const notes = [392, 440, 494, 587, 494, 440, 392, 330, 392, 440, 392, 330, 294, 330, 392, 0, 392, 440, 494, 587, 659, 587, 494, 440, 392, 440, 494, 440, 392];
    notes.forEach((f, i) => {
      if (f) tone(f, t + i * 0.32, 0.3, 0.06, 'square');
      if (i % 2 === 0) tone(f ? f / 2 : 196, t + i * 0.32, 0.3, 0.05, 'triangle');
      if (i % 4 === 2) noise(t + i * 0.32, 0.08, 0.08, { freq: 1800, q: 1.5 });
    });
  },
};

// Khách gọi món bằng quà: "Tiểu nhị, 1 cốc!"... mỗi món có sẵn vài giọng Vbee (public/voice/manifest.json,
// tạo bằng scripts/make-voices.mjs), mỗi lần gọi bốc ngẫu nhiên một giọng. Không gọi Vbee lúc live.
const FALLBACK_CALL = 'Tiểu nhị, mang đồ đến đây!';
const callClips = {};
let fallbackClip = null;

async function loadClip(file) {
  const res = await fetch(`voice/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return audio.decodeAudioData(await res.arrayBuffer());
}

fetch('voice/manifest.json')
  .then((res) => (res.ok ? res.json() : {}))
  .then((manifest) =>
    Promise.all(
      Object.entries(manifest).map(async ([item, files]) => {
        const loaded = await Promise.allSettled(files.map(loadClip));
        callClips[item] = loaded.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      }),
    ),
  )
  .catch((err) => console.warn('Không tải được giọng gọi món:', err.message));
loadClip('tieu-nhi.mp3')
  .then((buffer) => (fallbackClip = buffer))
  .catch(() => {});
// Tí đáp lại ngay sau khi khách gọi xong.
let replyClip = null;
loadClip('co_ngay.mp3')
  .then((buffer) => (replyClip = buffer))
  .catch(() => console.warn('Không tải được voice/co_ngay.mp3, Tí sẽ không đáp bằng giọng'));
// Cô lao công kêu lúc phi vào dọn bãi nôn.
let troiOiClip = null;
loadClip('troi_oi_la_troi.mp3')
  .then((buffer) => (troiOiClip = buffer))
  .catch(() => console.warn('Không tải được voice/troi_oi_la_troi.mp3, cô lao công sẽ không kêu bằng giọng'));
let callBusyUntil = 0;

function playClip(buffer, when = 0) {
  const src = audio.createBufferSource();
  const gain = audio.createGain();
  gain.gain.value = 1.6;
  src.buffer = buffer;
  src.connect(gain).connect(master);
  src.start(when);
}

// Trả về câu để hiện bong bóng, hoặc null nếu đang đọc dở (quà dồn dập thì không đọc chồng lên nhau).
function callWaiter(item, text) {
  const now = performance.now();
  if (now < callBusyUntil) return null;
  callBusyUntil = now + 2500;
  const clips = callClips[item] ?? [];
  const line = clips.length || !fallbackClip ? text || FALLBACK_CALL : FALLBACK_CALL;
  if (muted || !ready()) return line;
  const clip = clips.length ? clips[Math.floor(Math.random() * clips.length)] : fallbackClip;
  if (clip) {
    playClip(clip);
    let total = clip.duration;
    if (replyClip) {
      // Khách gọi xong, nghỉ một nhịp ngắn rồi Tí đáp "Có ngay".
      const gap = 0.2;
      playClip(replyClip, audio.currentTime + clip.duration + gap);
      total += gap + replyClip.duration;
    }
    callBusyUntil = now + total * 1000 + 400;
  } else if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(line);
    u.lang = 'vi-VN';
    const vi = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('vi'));
    if (vi) u.voice = vi;
    speechSynthesis.speak(u);
  }
  return line;
}

let rainSound = null;
function setRainSound(on) {
  if (on && !rainSound && ready()) {
    rainSound = noise(audio.currentTime, 600, 0.05, { type: 'lowpass', freq: 1800, attack: 1.5 });
  } else if (!on && rainSound) {
    rainSound.gain.gain.cancelScheduledValues(audio.currentTime);
    rainSound.gain.gain.setTargetAtTime(0.0001, audio.currentTime, 0.6);
    rainSound.src.stop(audio.currentTime + 3);
    rainSound = null;
  }
}

// ---------- Trạng thái nhận từ máy chủ ----------
let state = null;
let items = {};
let offset = 0;
let serverOk = false;
let tiktok = { connected: false, text: '' };
const serverNow = () => Date.now() + offset;
const icons = new Map();
const image = (src) => {
  if (!src) return null;
  if (!icons.has(src)) {
    const img = new Image();
    img.src = src;
    icons.set(src, img);
  }
  const img = icons.get(src);
  return img.complete && img.naturalWidth ? img : null;
};

const people = new Map();
const pendingNotices = new Map();
const pendingBubbles = new Map();
const ghosts = [];
const bubbles = { coba: [], ti: [], chutu: [] };
const tickets = [];
const floaters = [];
const particles = [];
const flashes = [];
let cheerUntil = 0;
let wheelView = null;
let lastWheelTick = -1;
let coBaFront = 0;

function syncPeople() {
  const now = performance.now();
  const seen = new Set();
  for (const c of state.customers) {
    seen.add(c.id);
    let p = people.get(c.id);
    if (!p) {
      p = { id: c.id, bubble: null, sipUntil: 0, deliverAt: 0, walk: null, created: now };
      people.set(c.id, p);
      const early = pendingBubbles.get(c.id);
      if (early) {
        pendingBubbles.delete(c.id);
        if (now - early.at < 2000) p.bubble = { text: early.text, until: now + 3000 };
      }
      const notice = pendingNotices.get(c.id);
      if (notice) {
        pendingNotices.delete(c.id);
        if (now - notice.at < 3000) p.bubble = { text: notice.text, until: now + 4000, notice: true };
      }
      // Khách mới vào (trong vài giây) thì đi từ đầu hẻm vào chỗ.
      if (c.seat && serverNow() - c.seatedAt < 2500) p.walk = { points: walkInPath(c.seat.table, c.seat.index), start: now };
    } else if (c.seat && (!p.data?.seat || p.data.seat.table !== c.seat.table || p.data.seat.index !== c.seat.index)) {
      // Đổi bàn thì đi từ ghế cũ sang; mới có ghế (hết chờ) thì đi từ đầu ngõ vào.
      const from = p.data?.seat;
      p.walk = { points: from ? moveSeatPath(from.table, from.index, c.seat.table, c.seat.index) : walkInPath(c.seat.table, c.seat.index), start: now };
    }
    p.data = c;
  }
  for (const id of [...people.keys()]) if (!seen.has(id)) people.delete(id);
}

function onFx(type, data) {
  const now = performance.now();
  switch (type) {
    case 'say':
      setTimeout(() => {
        const list = bubbles[data.who];
        if (!list) return;
        if (list.length > 3) list.splice(1, list.length - 3);
        list.push({ text: data.text, dur: 2600 + data.text.length * 55 });
      }, data.delay ?? 0);
      break;
    case 'chat': {
      const p = people.get(data.id);
      if (p && data.text && !state?.safeMode) p.bubble = { text: data.text, until: now + 3500 };
      if (p) {
        p.sipUntil = now + 900;
        // Đang gục ngủ mà gõ comment thì giật mình dậy.
        if (p.sleeping) p.ohUntil = now + 700;
        p.lastChat = now;
      }
      break;
    }
    case 'notice': {
      // Thông báo hệ thống cho riêng khách (ví dụ bàn muốn đổi đã đầy): hiện ngay, nổi bật hơn bong bóng chat.
      const p = people.get(data.id);
      if (p) p.bubble = { text: data.text, until: now + 4000, notice: true };
      else pendingNotices.set(data.id, { text: data.text, at: now });
      break;
    }
    case 'sip': {
      const p = people.get(data.id);
      if (p) p.sipUntil = now + 1400;
      break;
    }
    case 'order':
      queueFocus(data);
      markActive(data.customerId, now);
      if (data.item === 'squid') flameUntil = now + 2600;
      // Chỉ món gọi bằng quà mới gọi tiểu nhị (món từ thả tim thì không).
      const call = data.gift !== '__likes' && callWaiter(data.item, state?.menu.find((m) => m.gift === data.gift)?.call);
      if (call) {
        const p = people.get(data.customerId);
        const bubble = { text: call, until: now + 3000 };
        if (p) p.bubble = bubble;
        else pendingBubbles.set(data.customerId, { ...bubble, at: now });
      }
      tickets.push({ ...data, born: 0 });
      if (tickets.length > 6) tickets.splice(0, tickets.length - 6);
      sound.bell();
      if (data.item !== 'beer') setTimeout(() => sound.sizzle(), 400);
      break;
    case 'delivered':
      for (const id of data.ids) {
        const p = people.get(id);
        if (p) p.deliverAt = now;
      }
      for (const h of data.handed ?? []) {
        const p = people.get(h.id);
        const seat = p?.data?.seat && tableById(p.data.seat.table).seats[p.data.seat.index];
        if (!seat) continue;
        // Nhận bia thì nốc ngay một hơi.
        if (h.item === 'beer') {
          p.eat = { kind: 'beer', item: 'beer', start: now + 500, dur: 2000 };
          p.nextBite = now + rand(4000, 6000);
          p.gulpAt = now + 1300;
        }
        const info = items[h.item] ?? { unit: '', name: h.item };
        const label = `+${h.qty} ${info.unit} ${info.name}${h.large ? ' lớn' : ''}${h.side ? ` +${h.side} đậu phộng` : ''}`;
        floaters.push({ text: label, x: seat.item.x, y: seat.item.y - 50 - (p.floatStack = ((p.floatStack ?? 0) + 1) % 3) * 30, age: 0 });
      }
      if (data.items.length) sound.clink();
      if (data.waters.length) sound.pour();
      if (data.big) {
        cheerUntil = now + 2500;
        sound.cheer(1.3);
        burst(tableById(data.table).x, tableById(data.table).y - 40, 50, ['#ffd166', '#ff6b6b', '#fff', '#7bdff2']);
      }
      break;
    case 'join':
      if (Math.random() < 0.5) sound.clink();
      startStoolRun(data.table, now);
      break;
    case 'leave':
      if (data.seat && data.reason !== 'reset') {
        const pts = walkInPath(data.seat.table, data.seat.index).reverse();
        // Bị vợ lôi về thì cảnh vợ tới kiếm tự vẽ người đó.
        if (data.reason !== 'wife') ghosts.push({ points: pts, start: now, look: data.look, name: data.name });
        if (data.reason === 'home') startHome(data, now);
      }
      break;
    case 'promo':
      sound.jingle();
      burst(540, 260, 60, ['#ffd166', '#ef476f', '#fff']);
      coBaFront = now + 5000;
      break;
    case 'wheel':
      wheelView = { start: now, result: data.result, slots: data.slots, gift: data.gift, spinMs: data.spinEnd - data.startAt };
      coBaFront = now + data.spinEnd - data.startAt + 2500;
      break;
    case 'kickoff':
      sound.whistle();
      break;
    case 'goal':
      if (data.team === 'home') {
        cheerUntil = now + 2600;
        flashes.push({ text: 'VÀOOO!', sub: `${data.score.home} - ${data.score.away}`, born: now, color: '#ffd166' });
        sound.cheer(1.2);
        napkins();
      } else {
        flashes.push({ text: 'Ối!', sub: `${data.score.home} - ${data.score.away}`, born: now, color: '#9ad1ff', small: true });
        sound.groan();
      }
      break;
    case 'fulltime':
      sound.whistle(true);
      if (data.outcome === 'win') {
        setTimeout(() => sound.win(), 900);
        cheerUntil = now + 3000;
        napkins();
      }
      break;
    case 'nearMiss':
      break;
    case 'bigTray':
      cheerUntil = now + 1200;
      break;
    case 'like':
      for (let i = 0; i < data.count; i++) particles.push({ kind: 'heart', x: rand(860, 1040), y: rand(1440, 1500), vx: rand(-20, 20), vy: rand(-160, -110), life: 2.2, age: 0, size: rand(18, 30) });
      break;
    case 'vomit':
      startVomit(data, now);
      break;
    case 'toast':
      startCheers(now);
      break;
    case 'shift':
      break;
  }
}

// ---------- Say, nôn, cô lao công ----------
const FOOD_BIT = { peanut: '#c98a4a', nem: '#d9733a', squid: '#f3e2c4', hotpot: '#e8574a' };
const VOMIT_COLORS = ['#9cbf3e', '#b5cf52', '#c9d96a', '#d9a94a'];
const CLEANER_LOOK = { skin: '#e0ac85', shirt: '#f08a24', hair: '#2a1d17', style: 1, glasses: false };
const MOP_MS = 2600;
const puddles = [];
const cleaner = { phase: 'off', jobs: [], x: ENTRANCE.x, y: H + 80, walk: null, say: '', sayUntil: 0 };
const flushOf = (beers) => (beers > 0 ? 1 - 0.7 ** beers : 0);

function startVomit(data, now) {
  const t = tableById(data.table);
  const seat = t?.seats[data.index];
  if (!seat) return;
  const side = seat.side === 'back' ? 0 : seat.side === 'left' ? -1 : 1;
  // Khách ngồi sau bàn thì nôn ra mặt bàn; khách ngồi đầu bàn thì quay ra ngoài nôn xuống đất.
  const spot = side === 0 ? { x: seat.x, y: t.y + 14 } : { x: seat.x + side * 36, y: seat.y + 66 };
  // Cô đứng chỗ không che mặt khách: trước bàn lệch ra ngoài, hoặc chéo phía trong ghế đầu bàn.
  // Bong bóng lời khuyên đặt lệch để không đè lên mặt khách.
  const out = data.index === 0 ? -1 : 1;
  const stand = side === 0 ? { x: seat.x + out * 58, y: t.y + 104 } : { x: seat.x - side * 60, y: seat.y + 120 };
  const talk = side === 0 ? { dx: out * 90, dy: 0 } : { dx: -side * 130, dy: 80 };
  const puddle = {
    table: data.table,
    x: spot.x,
    y: spot.y,
    onTable: side === 0,
    growStart: now + 700,
    growEnd: now + 2300,
    clean: 0,
    blobs: Array.from({ length: 7 }, (_, i) => ({ a: (i / 7) * Math.PI * 2 + rand(-0.3, 0.3), d: rand(8, 26), r: rand(12, 22) })),
    chunks: Array.from({ length: 6 }, () => ({ x: rand(-30, 30), y: rand(-10, 10), r: rand(3, 5), c: Math.random() < 0.5 ? '#e0b04a' : '#d9773a' })),
  };
  puddles.push(puddle);
  if (puddles.length > 8) puddles.shift();
  cleaner.jobs.push({ callAt: now + 900, puddle, stand, talk });
  const p = people.get(data.id);
  if (p) {
    p.vomit = { start: now, spot };
    p.eat = null;
    p.bubble = { text: 'Ọe... ọe...', until: now + 2600 };
  }
  setTimeout(() => sound.vomit(), 550);
  // Người cùng bàn giật mình.
  for (const o of people.values()) {
    if (o === p || o.data?.seat?.table !== data.table || o.walk || Math.random() < 0.4) continue;
    setTimeout(() => {
      const at = performance.now();
      if (!o.bubble || at > o.bubble.until) o.bubble = { text: ['Eo ơi!', 'Trời đất!', 'Ối giời!', 'Say rồi!'][Math.floor(Math.random() * 4)], until: at + 2200 };
    }, rand(700, 1300));
  }
}

function cleanerGo(points, speed, now) {
  cleaner.path = points;
  cleaner.start = now;
  cleaner.speed = speed;
  cleaner.len = pathLength(points);
}

function updateCleaner(now) {
  const c = cleaner;
  if (c.phase === 'off') {
    const job = c.jobs.find((j) => now >= j.callAt);
    if (!job) return;
    c.jobs.splice(c.jobs.indexOf(job), 1);
    c.job = job;
    c.phase = 'run';
    cleanerGo([{ x: AISLE_X, y: H + 80 }, { x: AISLE_X, y: job.stand.y }, job.stand], 980, now);
    c.say = 'Trời ơi là trời!';
    c.sayUntil = now + Math.max(1700, (troiOiClip?.duration ?? 0) * 1000 + 300);
    sound.whoosh();
    if (troiOiClip && !muted && ready()) playClip(troiOiClip);
  }
  if (c.phase === 'run' || c.phase === 'leave') {
    const d = ((now - c.start) / 1000) * c.speed;
    const pt = pointAt(c.path, d);
    c.x = pt.x;
    c.y = pt.y;
    c.walk = d / 60;
    if (c.phase === 'run' && Math.random() < 0.6) particles.push({ kind: 'dust', x: c.x + rand(-14, 14), y: c.y + 26, vx: rand(-40, 40), vy: rand(-50, -20), life: 0.6, age: 0, size: rand(8, 14) });
    if (d < c.len) return;
    c.walk = null;
    if (c.phase === 'leave') {
      c.phase = 'off';
      return;
    }
    c.phase = 'mop';
    c.mopStart = Math.max(now + 150, c.job.puddle.growEnd);
  }
  if (c.phase === 'mop') {
    const k = (now - c.mopStart) / MOP_MS;
    if (k >= 0 && !c.job.said) {
      c.job.said = true;
      c.say = 'Trời ơi là trời!';
      c.sayUntil = now + Math.max(4200, (troiOiClip?.duration ?? 0) * 1000 + 300);
      sound.mop();
      if (troiOiClip && !muted && ready()) playClip(troiOiClip);
    }
    c.job.puddle.clean = clamp(k, 0, 1);
    if (k < 1) return;
    const pd = c.job.puddle;
    const i = puddles.indexOf(pd);
    if (i >= 0) puddles.splice(i, 1);
    for (let n = 0; n < 8; n++) particles.push({ kind: 'sparkle', x: pd.x + rand(-40, 40), y: pd.y + rand(-14, 10), vx: rand(-20, 20), vy: rand(-90, -40), life: rand(0.7, 1.1), age: 0, size: rand(18, 28) });
    const next = c.jobs.sort((a, b) => a.callAt - b.callAt).shift();
    if (next) {
      c.job = next;
      c.phase = 'run';
      cleanerGo([{ x: c.x, y: c.y }, { x: AISLE_X, y: c.y }, { x: AISLE_X, y: next.stand.y }, next.stand], 900, now);
    } else {
      c.job = null;
      c.phase = 'leave';
      cleanerGo([{ x: c.x, y: c.y }, { x: AISLE_X, y: c.y }, { x: AISLE_X, y: H + 80 }], 520, now);
    }
  }
}

function nonLa(c, hy) {
  c.fillStyle = '#ecd89c';
  c.beginPath();
  c.moveTo(-46, hy - 12);
  c.lineTo(0, hy - 62);
  c.lineTo(46, hy - 12);
  c.quadraticCurveTo(0, hy - 2, -46, hy - 12);
  c.fill();
  c.strokeStyle = 'rgba(140,105,45,0.55)';
  c.lineWidth = 2;
  for (const k of [0.35, 0.65]) {
    c.beginPath();
    c.moveTo(-46 * k, hy - 62 + 50 * k);
    c.quadraticCurveTo(0, hy - 58 + 52 * k, 46 * k, hy - 62 + 50 * k);
    c.stroke();
  }
}

function drawMop(c, hx, hy, mx, my) {
  c.strokeStyle = '#a0713e';
  c.lineWidth = 6;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(hx, hy);
  c.lineTo(mx, my - 6);
  c.stroke();
  c.fillStyle = '#5d6b78';
  rr(c, mx - 16, my - 10, 32, 8, 3);
  c.fill();
  c.strokeStyle = '#e8e4da';
  c.lineWidth = 4;
  for (let i = -3; i <= 3; i++) {
    c.beginPath();
    c.moveTo(mx + i * 4.5, my - 3);
    c.lineTo(mx + i * 5.5 + Math.sin(performance.now() / 90 + i) * 2, my + 12);
    c.stroke();
  }
}

function drawCleaner(now) {
  const c = cleaner;
  const pd = c.job?.puddle;
  const mopping = c.phase === 'mop' && now >= c.mopStart;
  drawPerson(ctx, c.x, c.y, CLEANER_LOOK, { walk: c.walk, legs: c.walk == null, hat: nonLa, stripe: true, talk: now < c.sayUntil, phase: 3 });
  if (c.phase === 'mop' && pd) {
    const dir = pd.x < c.x ? -1 : 1;
    // Xô nước bên cạnh
    const bx = c.x - dir * 44;
    ctx.fillStyle = '#2f7fd1';
    ctx.beginPath();
    ctx.moveTo(bx - 16, c.y + 2);
    ctx.lineTo(bx + 16, c.y + 2);
    ctx.lineTo(bx + 12, c.y + 30);
    ctx.lineTo(bx - 12, c.y + 30);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9ad1ff';
    ctx.fillRect(bx - 15, c.y + 2, 30, 5);
    const swing = mopping ? Math.sin(now / 110) * 26 : 0;
    drawMop(ctx, c.x + dir * 30, c.y - 18, pd.x + swing, pd.y + (mopping ? Math.sin(now / 55) * 3 : 0));
    if (mopping && Math.random() < 0.25) particles.push({ kind: 'sparkle', x: pd.x + rand(-30, 30), y: pd.y - 6, vx: 0, vy: -50, life: 0.5, age: 0, size: 14 });
  } else {
    drawMop(ctx, c.x + 28, c.y - 22, c.x + 46, c.y + 30);
  }
}

function drawPuddle(pd, now) {
  const grow = clamp((now - pd.growStart) / (pd.growEnd - pd.growStart), 0, 1);
  const s = ease(grow) * (1 - pd.clean * 0.85);
  if (s <= 0.02) return;
  ctx.save();
  ctx.translate(pd.x, pd.y);
  ctx.scale(s * (pd.onTable ? 0.8 : 1), s * (pd.onTable ? 0.36 : 0.42));
  ctx.globalAlpha = 1 - pd.clean * 0.7;
  ctx.fillStyle = '#93b83a';
  ctx.beginPath();
  ctx.ellipse(0, 0, 40, 30, 0, 0, Math.PI * 2);
  for (const b of pd.blobs) {
    const bx = Math.cos(b.a) * b.d * 1.4;
    const by = Math.sin(b.a) * b.d;
    ctx.moveTo(bx + b.r, by);
    ctx.ellipse(bx, by, b.r, b.r, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = '#c3d966';
  ctx.beginPath();
  ctx.ellipse(-8, -8, 22, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const ch of pd.chunks) {
    ctx.fillStyle = ch.c;
    ctx.beginPath();
    ctx.arc(ch.x, ch.y * 2, ch.r * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Khách say: mặt đỏ dần theo số cốc, thỉnh thoảng nấc; đang nôn thì phun xuống chỗ đã định.
function updateDrinker(p, pos, walking, now, dt) {
  p.flush = lerp(p.flush ?? 0, flushOf(p.data.beers ?? 0), Math.min(1, dt / 2500));
  if (walking) return;
  if (p.vomit) {
    const t = now - p.vomit.start;
    if (t > 4200) p.vomit = null;
    else if (t > 700 && t < 2300) {
      const ox = pos.x;
      const oy = pos.y - 60;
      for (let i = 0; i < 2; i++) {
        const fly = rand(0.32, 0.45);
        const tx = p.vomit.spot.x + rand(-22, 22);
        const ty = p.vomit.spot.y + rand(-6, 6);
        particles.push({ kind: 'vomit', x: ox + rand(-4, 4), y: oy, vx: (tx - ox) / fly, vy: (ty - oy - 350 * fly * fly) / fly, life: fly, age: 0, size: rand(5, 10), color: VOMIT_COLORS[Math.floor(Math.random() * VOMIT_COLORS.length)] });
      }
    }
  }
  if (p.flush > 0.4 && !p.vomit && now > (p.hicAt ?? 0) + 1500 && Math.random() < dt / 6000) p.hicAt = now;
  if (p.eat && now > p.eat.start + p.eat.dur) p.eat = null;
  if (!p.eat && !p.vomit) {
    p.nextBite ??= now + rand(800, 4000);
    if (now >= p.nextBite) {
      p.nextBite = now + rand(3500, 7500);
      const foods = p.data.stacks.filter((s) => s.item !== 'beer').map((s) => s.item);
      const hasBeer = p.data.stacks.some((s) => s.item === 'beer');
      if (hasBeer || foods.length) {
        const beer = hasBeer && (!foods.length || Math.random() < 0.5);
        p.eat = { kind: beer ? 'beer' : 'food', item: beer ? 'beer' : foods[Math.floor(Math.random() * foods.length)], start: now, dur: beer ? 1500 : 1300 };
      }
    }
  }
}

function sickness(p, now) {
  if (!p.vomit) return 0;
  const t = now - p.vomit.start;
  return clamp(Math.min(t / 500, (4200 - t) / 1200), 0, 1);
}

function connect() {
  const events = new EventSource('/events');
  events.onopen = () => (serverOk = true);
  events.onerror = () => (serverOk = false);
  events.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'snapshot') {
      items = msg.config.items;
      tiktok = msg.status;
      state = msg.state;
      offset = state.now - Date.now();
      syncPeople();
      serverOk = true;
    } else if (msg.type === 'state') {
      state = msg.state;
      offset = state.now - Date.now();
      syncPeople();
    } else if (msg.type === 'fx') onFx(msg.fx, msg.data);
    else if (msg.type === 'status') tiktok = msg;
    else if (msg.type === 'safe-mode' && state) state.safeMode = msg.on;
  };
}
connect();

// ---------- Hàm vẽ cơ bản ----------
function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function text(c, str, x, y, { size = 28, weight = 700, color = '#fff', align = 'center', base = 'middle', stroke, strokeWidth = 6, font = FONT, maxWidth } = {}) {
  c.font = `${weight} ${size}px ${font}`;
  c.textAlign = align;
  c.textBaseline = base;
  if (maxWidth) {
    let s = size;
    while (s > 12 && c.measureText(str).width > maxWidth) {
      s -= 1;
      c.font = `${weight} ${s}px ${font}`;
    }
  }
  if (stroke) {
    c.lineJoin = 'round';
    c.strokeStyle = stroke;
    c.lineWidth = strokeWidth;
    c.strokeText(str, x, y);
  }
  c.fillStyle = color;
  c.fillText(str, x, y);
}

function fitText(c, str, maxWidth) {
  if (c.measureText(str).width <= maxWidth) return str;
  const chars = Array.from(str);
  while (chars.length > 1 && c.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop();
  return `${chars.join('')}…`;
}

function wrap(c, str, maxWidth) {
  const words = str.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (c.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else current = test;
  }
  if (current) lines.push(current);
  return lines;
}

// ---------- Nền tĩnh (vẽ một lần) ----------
const bg = document.createElement('canvas');
bg.width = W;
bg.height = H;

function drawBackground() {
  const c = bg.getContext('2d');
  // Trời đêm
  let g = c.createLinearGradient(0, 0, 0, 200);
  g.addColorStop(0, '#120c24');
  g.addColorStop(1, '#2b1d3d');
  c.fillStyle = g;
  c.fillRect(0, 0, W, 220);
  // Tán cây
  c.fillStyle = '#16301f';
  for (const [x, y, r] of [[40, 30, 110], [150, -10, 90], [960, 20, 120], [1060, 90, 90], [860, -20, 80], [260, 20, 60]]) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = '#1f4029';
  for (const [x, y, r] of [[80, 50, 60], [990, 60, 70], [200, 10, 50], [900, 10, 50]]) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  // Tường quán
  g = c.createLinearGradient(0, 150, 0, 620);
  g.addColorStop(0, '#b77a3a');
  g.addColorStop(0.35, '#e0aa5e');
  g.addColorStop(1, '#c48a47');
  c.fillStyle = g;
  c.fillRect(0, 150, W, 470);
  // Vết loang tường
  c.globalAlpha = 0.12;
  c.fillStyle = '#6b4220';
  for (let i = 0; i < 40; i++) {
    c.beginPath();
    c.ellipse(rand(0, W), rand(170, 600), rand(10, 60), rand(6, 30), rand(0, 3), 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
  // Chân tường
  c.fillStyle = '#7b4f2a';
  c.fillRect(0, 596, W, 18);

  // Bạt sọc
  for (let i = 0; i < 18; i++) {
    c.fillStyle = i % 2 ? '#e9e2cf' : '#2f6fb3';
    c.beginPath();
    c.moveTo(i * 62 - 10, 70);
    c.lineTo((i + 1) * 62 - 10, 70);
    c.lineTo((i + 1) * 62 - 10, 150);
    c.quadraticCurveTo(i * 62 + 21, 186, i * 62 - 10, 150);
    c.fill();
  }
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(0, 66, W, 8);

  // Bếp bên trái
  c.fillStyle = '#5b3a24';
  rr(c, 20, 330, 400, 200, 10);
  c.fill();
  c.fillStyle = '#3c2516';
  for (let i = 0; i < 4; i++) c.fillRect(30, 350 + i * 44, 380, 4);
  // Kệ và chồng đĩa
  c.fillStyle = '#8a5a32';
  c.fillRect(250, 360, 160, 10);
  for (let i = 0; i < 6; i++) {
    c.fillStyle = i % 2 ? '#f4f1ea' : '#dcd7cc';
    rr(c, 270, 348 - i * 6, 60, 8, 4);
    c.fill();
  }
  // Muôi treo
  c.strokeStyle = '#9aa3ab';
  c.lineWidth = 5;
  for (const x of [60, 90, 120]) {
    c.beginPath();
    c.moveTo(x, 340);
    c.lineTo(x, 400);
    c.stroke();
    c.beginPath();
    c.arc(x, 408, 10, 0, Math.PI);
    c.stroke();
  }
  // Quầy inox
  g = c.createLinearGradient(0, 510, 0, 600);
  g.addColorStop(0, '#e4e8ec');
  g.addColorStop(1, '#8d969e');
  c.fillStyle = g;
  rr(c, 10, 505, 420, 95, 8);
  c.fill();
  c.fillStyle = '#c6ccd2';
  c.fillRect(10, 505, 420, 12);
  // Bếp than
  c.fillStyle = '#2b2b2b';
  rr(c, 40, 470, 150, 40, 6);
  c.fill();
  c.fillStyle = '#555';
  for (let i = 0; i < 9; i++) c.fillRect(48 + i * 16, 466, 4, 30);
  // Chảo
  c.fillStyle = '#222';
  c.beginPath();
  c.ellipse(260, 488, 50, 18, 0, 0, Math.PI * 2);
  c.fill();
  c.fillRect(300, 482, 70, 8);
  // Thùng đá xanh
  c.fillStyle = '#2b7bd6';
  rr(c, 440, 520, 90, 80, 10);
  c.fill();
  c.fillStyle = '#e8f2ff';
  rr(c, 436, 512, 98, 18, 8);
  c.fill();
  text(c, 'ĐÁ', 485, 566, { size: 26, color: '#e8f2ff' });

  // Bảng hiệu
  c.fillStyle = '#7a1f1f';
  rr(c, 300, 186, 480, 82, 14);
  c.fill();
  c.strokeStyle = '#f2c14e';
  c.lineWidth = 5;
  rr(c, 306, 192, 468, 70, 10);
  c.stroke();
  text(c, 'QUÁN CÔ BA ĐẦU HẺM', 540, 222, { size: 44, weight: 800, color: '#ffe8a3', maxWidth: 450 });
  text(c, 'Bàn nhỏ, chuyện to - vô quán là có bạn!', 540, 252, { size: 20, weight: 600, color: '#ffd8c2' });

  // Giá tivi
  c.fillStyle = '#3a3a3a';
  c.fillRect(880, 470, 20, 30);
  c.fillRect(840, 494, 100, 10);

  // Vỉa hè gạch
  g = c.createLinearGradient(0, 614, 0, 1480);
  g.addColorStop(0, '#8f7f70');
  g.addColorStop(0.5, '#a29280');
  g.addColorStop(1, '#8a7b6c');
  c.fillStyle = g;
  c.fillRect(0, 614, W, 866);
  c.strokeStyle = 'rgba(60,45,35,0.22)';
  c.lineWidth = 2;
  for (let y = 614; y < 1480; y += 72) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  for (let y = 614, row = 0; y < 1480; y += 72, row++) {
    for (let x = row % 2 ? 0 : 60; x < W; x += 120) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y + 72);
      c.stroke();
    }
  }
  // Vệt sáng đèn trên sàn
  for (const x of [270, 810]) {
    g = c.createRadialGradient(x, 1000, 50, x, 1000, 520);
    g.addColorStop(0, 'rgba(255,214,140,0.22)');
    g.addColorStop(1, 'rgba(255,214,140,0)');
    c.fillStyle = g;
    c.fillRect(0, 614, W, 866);
  }
  // Thùng giấy của Mèo Mướp
  c.fillStyle = '#b07a43';
  rr(c, 600, 624, 104, 48, 6);
  c.fill();
  c.fillStyle = '#c99358';
  c.fillRect(600, 624, 104, 10);

  // Mép vỉa hè và đường
  c.fillStyle = '#c9c1b5';
  c.fillRect(0, 1480, W, 22);
  g = c.createLinearGradient(0, 1502, 0, 1620);
  g.addColorStop(0, '#3a3a44');
  g.addColorStop(1, '#25252d');
  c.fillStyle = g;
  c.fillRect(0, 1502, W, 118);
  c.fillStyle = '#d8d0b0';
  for (let x = 20; x < W; x += 110) c.fillRect(x, 1558, 60, 6);
  // Đầu hẻm phía dưới
  g = c.createLinearGradient(0, 1620, 0, H);
  g.addColorStop(0, '#231a2c');
  g.addColorStop(1, '#0d0912');
  c.fillStyle = g;
  c.fillRect(0, 1620, W, H - 1620);
  // Biển hẻm
  c.fillStyle = '#1f5fa8';
  rr(c, 40, 1630, 360, 60, 8);
  c.fill();
  c.strokeStyle = '#fff';
  c.lineWidth = 3;
  rr(c, 46, 1636, 348, 48, 6);
  c.stroke();
  text(c, 'NGÕ 68 TRIỀU KHÚC', 220, 1661, { size: 32, weight: 800, color: '#fff', maxWidth: 330 });
  c.fillStyle = '#777';
  c.fillRect(215, 1690, 10, 80);
}

// ---------- Nhân vật ----------
const SKINS = ['#f6d3b3', '#eec29f', '#e0ac85', '#c98f68'];
const SHIRTS = ['#e85d5d', '#4f9de0', '#58b368', '#f2a541', '#9b6ad6', '#e86fb0', '#3fbfb0', '#f0d34a', '#6f7de8', '#e8774a'];
const HAIRS = ['#1d1816', '#3a271c', '#5a3a22', '#2a2a36', '#7a4a2a'];

function lookOf(seed) {
  const r = (n, k) => Math.floor(seed / k) % n;
  return { skin: SKINS[r(4, 1)], shirt: SHIRTS[r(10, 4)], hair: HAIRS[r(5, 40)], style: r(5, 200), glasses: r(6, 1000) === 0 };
}

function drawStool(c, x, y, color) {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x - 22, y);
  c.lineTo(x + 22, y);
  c.lineTo(x + 28, y + 46);
  c.lineTo(x + 18, y + 46);
  c.lineTo(x, y + 14);
  c.lineTo(x - 18, y + 46);
  c.lineTo(x - 28, y + 46);
  c.closePath();
  c.fill();
  c.beginPath();
  c.ellipse(x, y, 25, 8, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.25)';
  c.beginPath();
  c.ellipse(x, y - 1, 18, 4, 0, 0, Math.PI * 2);
  c.fill();
}

// (x, y) là điểm hông/ghế. opts: walk (pha bước), legs, cheer, sip, sway, apron, tray, scale
function drawPerson(c, x, y, look, opts = {}) {
  const t = performance.now() / 1000;
  const s = opts.scale ?? 1;
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  let bob = 0;
  if (opts.walk != null) bob = -Math.abs(Math.sin(opts.walk * Math.PI)) * 6;
  if (opts.cheer) bob = -Math.abs(Math.sin(t * 9 + (opts.phase ?? 0))) * 16;
  if (opts.sway) c.rotate(Math.sin(t * 3 + (opts.phase ?? 0)) * 0.08);
  const flush = opts.flush ?? 0;
  const sick = opts.sick ?? 0;
  if (flush > 0.4) c.rotate(Math.sin(t * 2.3 + (opts.phase ?? 0)) * 0.08 * flush);
  if (sick > 0) bob += sick * (5 + Math.sin(t * 22) * 3);
  c.translate(0, bob);
  if (opts.sleep) {
    // Say gục: người đổ nghiêng xuống bàn
    c.translate(0, 12);
    c.rotate(opts.sleep);
  }
  // Chân
  if (opts.walk != null) {
    const k = Math.sin(opts.walk * Math.PI * 2) * 10;
    c.fillStyle = '#34405a';
    rr(c, -16 + k * 0.4, -6, 13, 34, 6);
    c.fill();
    rr(c, 3 - k * 0.4, -6, 13, 34, 6);
    c.fill();
    c.fillStyle = '#222';
    rr(c, -18 + k, 24, 17, 8, 4);
    c.fill();
    rr(c, 3 - k, 24, 17, 8, 4);
    c.fill();
  } else if (opts.legs) {
    c.fillStyle = '#34405a';
    rr(c, -20, -6, 15, 30, 7);
    c.fill();
    rr(c, 5, -6, 15, 30, 7);
    c.fill();
    c.fillStyle = '#333';
    rr(c, -22, 20, 18, 8, 4);
    c.fill();
    rr(c, 4, 20, 18, 8, 4);
    c.fill();
  }
  // Thân
  c.fillStyle = look.shirt;
  rr(c, -27, -54, 54, 56, 18);
  c.fill();
  if (opts.apron) {
    c.fillStyle = '#f4f1ea';
    rr(c, -18, -40, 36, 42, 8);
    c.fill();
  }
  if (opts.stripe) {
    c.fillStyle = '#f7e04a';
    c.fillRect(-27, -34, 54, 7);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillRect(-27, -32, 54, 2);
  }
  c.fillStyle = 'rgba(0,0,0,0.12)';
  rr(c, -27, -12, 54, 14, 8);
  c.fill();
  // Tay
  const armUp = opts.cheer;
  c.fillStyle = look.shirt;
  if (armUp) {
    rr(c, -40, -96, 13, 46, 7);
    c.fill();
    rr(c, 27, -96, 13, 46, 7);
    c.fill();
    c.fillStyle = look.skin;
    c.beginPath();
    c.arc(-33, -98, 8, 0, Math.PI * 2);
    c.arc(33, -98, 8, 0, Math.PI * 2);
    c.fill();
    if (opts.mug) drawMug(c, 33, -114);
  } else if (opts.tray) {
    rr(c, -40, -50, 13, 30, 7);
    c.fill();
    rr(c, 27, -50, 13, 30, 7);
    c.fill();
  } else {
    rr(c, -36, -50, 12, 38, 6);
    c.fill();
    if (!opts.eat) {
      rr(c, 24, -50, 12, 38, 6);
      c.fill();
    }
    c.fillStyle = look.skin;
    c.beginPath();
    c.arc(-30, -12, 7, 0, Math.PI * 2);
    c.fill();
    if (!opts.sip && !opts.eat) {
      c.beginPath();
      c.arc(30, -12, 7, 0, Math.PI * 2);
      c.fill();
    }
  }
  // Đầu
  const hy = -82;
  c.fillStyle = look.skin;
  c.beginPath();
  c.arc(0, hy, 28, 0, Math.PI * 2);
  c.fill();
  // Say thì mặt đỏ dần; sắp nôn thì xanh mặt.
  for (const [k, color] of [[flush * 0.65, '230,40,40'], [sick * 0.6, '120,185,70']]) {
    if (k <= 0.01) continue;
    c.fillStyle = `rgba(${color},${k})`;
    c.beginPath();
    c.arc(0, hy, 28, 0, Math.PI * 2);
    c.fill();
  }
  // Tóc
  c.fillStyle = look.hair;
  switch (look.style) {
    case 0:
      c.beginPath();
      c.arc(0, hy - 4, 29, Math.PI * 1.05, Math.PI * 1.95);
      c.fill();
      for (let i = -2; i <= 2; i++) {
        c.beginPath();
        c.moveTo(i * 10 - 6, hy - 26);
        c.lineTo(i * 10, hy - 38);
        c.lineTo(i * 10 + 6, hy - 26);
        c.fill();
      }
      break;
    case 1:
      c.beginPath();
      c.arc(0, hy - 2, 31, Math.PI, Math.PI * 2);
      c.fill();
      rr(c, -31, hy - 4, 12, 40, 6);
      c.fill();
      rr(c, 19, hy - 4, 12, 40, 6);
      c.fill();
      break;
    case 2:
      c.beginPath();
      c.arc(0, hy - 3, 30, Math.PI * 1.02, Math.PI * 1.98);
      c.fill();
      c.beginPath();
      c.arc(0, hy - 34, 12, 0, Math.PI * 2);
      c.fill();
      break;
    case 3:
      c.fillStyle = look.shirt === '#e85d5d' ? '#2f6fb3' : '#e85d5d';
      c.beginPath();
      c.arc(0, hy - 6, 29, Math.PI, Math.PI * 2);
      c.fill();
      rr(c, -4, hy - 12, 44, 9, 4);
      c.fill();
      break;
    default:
      c.beginPath();
      c.arc(0, hy - 2, 30, Math.PI * 0.95, Math.PI * 2.05);
      c.fill();
  }
  if (opts.hat) opts.hat(c, hy);
  // Mặt
  const blink = (t + (opts.phase ?? 0)) % 4 < 0.12;
  c.fillStyle = '#2a1d17';
  if (opts.sleep) {
    c.lineWidth = 3;
    c.strokeStyle = '#2a1d17';
    for (const ex of [-10, 10]) {
      c.beginPath();
      c.moveTo(ex - 6, hy + 1);
      c.quadraticCurveTo(ex, hy + 5, ex + 6, hy + 1);
      c.stroke();
    }
  } else if (sick > 0.3) {
    c.lineWidth = 3;
    c.strokeStyle = '#2a1d17';
    for (const d of [-1, 1]) {
      c.beginPath();
      c.moveTo(d * 15, hy - 5);
      c.lineTo(d * 7, hy);
      c.lineTo(d * 15, hy + 5);
      c.stroke();
    }
  } else if (flush > 0.55 && !blink && !opts.happy) {
    // Mắt lim dim
    c.lineWidth = 3;
    c.strokeStyle = '#2a1d17';
    for (const ex of [-10, 10]) {
      c.beginPath();
      c.moveTo(ex - 6, hy - 1);
      c.lineTo(ex + 6, hy - 1);
      c.stroke();
      c.beginPath();
      c.arc(ex, hy - 1, 4, 0, Math.PI);
      c.fill();
    }
  } else if (blink || opts.happy) {
    c.lineWidth = 3;
    c.strokeStyle = '#2a1d17';
    for (const ex of [-10, 10]) {
      c.beginPath();
      c.arc(ex, hy + 2, 5, Math.PI * 1.1, Math.PI * 1.9);
      c.stroke();
    }
  } else {
    for (const ex of [-10, 10]) {
      c.beginPath();
      c.ellipse(ex, hy, 3.6, 5, 0, 0, Math.PI * 2);
      c.fill();
    }
  }
  if (look.glasses) {
    c.strokeStyle = '#222';
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(-10, hy, 8, 0, Math.PI * 2);
    c.moveTo(18, hy);
    c.arc(10, hy, 8, 0, Math.PI * 2);
    c.moveTo(-2, hy);
    c.lineTo(2, hy);
    c.stroke();
  }
  c.fillStyle = `rgba(255,${Math.round(120 - flush * 70)},${Math.round(120 - flush * 70)},${0.35 + flush * 0.45})`;
  c.beginPath();
  c.arc(-17, hy + 9, 5 + flush * 3, 0, Math.PI * 2);
  c.moveTo(22 + flush * 3, hy + 9);
  c.arc(17, hy + 9, 5 + flush * 3, 0, Math.PI * 2);
  c.fill();
  if (flush > 0.5) {
    c.fillStyle = 'rgba(215,30,30,0.85)';
    c.beginPath();
    c.arc(0, hy + 4, 4, 0, Math.PI * 2);
    c.fill();
  }
  const eat = opts.eat;
  const chew = eat?.kind === 'food' && eat.k > 0.5;
  c.strokeStyle = '#7a2e22';
  c.lineWidth = 3;
  c.beginPath();
  if (sick > 0.3) {
    c.fillStyle = '#5a1e18';
    c.ellipse(0, hy + 14, 8, 8 + Math.abs(Math.sin(t * 22)) * 3, 0, 0, Math.PI * 2);
    c.fill();
  } else if (chew) {
    c.fillStyle = '#7a2e22';
    c.ellipse(0, hy + 12, 6, 1.5 + Math.abs(Math.sin(t * 16)) * 3.5, 0, 0, Math.PI * 2);
    c.fill();
  } else if (opts.cheer || opts.talk) {
    c.fillStyle = '#7a2e22';
    c.ellipse(0, hy + 13, 7, 6 + (opts.talk ? Math.abs(Math.sin(t * 14)) * 3 : 2), 0, 0, Math.PI * 2);
    c.fill();
  } else {
    c.arc(0, hy + 8, 8, Math.PI * 0.15, Math.PI * 0.85);
    c.stroke();
  }
  // Nhấp nước: tay đưa ly lên miệng
  if (opts.sip) {
    c.fillStyle = look.shirt;
    rr(c, 14, -60, 12, 30, 6);
    c.fill();
    drawGlass(c, 16, hy + 18, 0.7, 0.85);
    c.fillStyle = look.skin;
    c.beginPath();
    c.arc(20, hy + 26, 7, 0, Math.PI * 2);
    c.fill();
  }
  // Ăn uống: tay đưa cốc bia hoặc đũa gắp món lên miệng
  if (eat) {
    const lift = Math.sin(clamp(eat.k, 0, 1) * Math.PI);
    const up = Math.min(1, lift * (eat.kind === 'beer' ? 1.7 : 1.4));
    const hx = lerp(30, 20, up);
    const hh = lerp(-12, hy + 24, up);
    c.strokeStyle = look.shirt;
    c.lineWidth = 12;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(30, -46);
    c.lineTo(hx + 3, hh + 6);
    c.stroke();
    if (eat.kind === 'beer') {
      c.save();
      c.translate(hx - 2, hh + 12);
      c.rotate(-0.95 * up);
      drawBeer(c, 0, 0, 0.6);
      c.restore();
    } else {
      const tx = hx - 18;
      const ty = hh - 10;
      c.strokeStyle = '#c8935a';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(hx + 4, hh + 2);
      c.lineTo(tx, ty);
      c.moveTo(hx + 6, hh - 2);
      c.lineTo(tx + 2, ty - 4);
      c.stroke();
      if (eat.k < 0.5) {
        c.fillStyle = FOOD_BIT[eat.item] ?? '#d9a94a';
        c.beginPath();
        c.arc(tx, ty - 2, 5, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.fillStyle = look.skin;
    c.beginPath();
    c.arc(hx, hh, 7, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function nameTag(c, name, x, y, maxWidth = 136, highlight = false) {
  c.font = `700 24px ${FONT}`;
  const label = fitText(c, name, maxWidth - 14);
  const w = Math.min(maxWidth, c.measureText(label).width + 16);
  c.fillStyle = highlight ? 'rgba(122,31,31,0.92)' : 'rgba(25,16,30,0.8)';
  rr(c, x - w / 2, y - 16, w, 32, 16);
  c.fill();
  text(c, label, x, y + 1, { size: 24, color: highlight ? '#ffe8a3' : '#fff' });
}

function speech(c, str, x, y, { maxWidth = 360, color = '#fff', ink = '#2a1d17', who, size = 25, alpha = 1 } = {}) {
  c.save();
  c.globalAlpha = alpha;
  c.font = `700 ${size}px ${FONT}`;
  const lines = wrap(c, str, maxWidth - 30);
  const w = Math.min(maxWidth, Math.max(...lines.map((l) => c.measureText(l).width)) + 30);
  const lh = size * 1.18;
  const h = lines.length * lh + (who ? 44 : 20);
  const left = clamp(x - w / 2, 12, W - 12 - w);
  const top = y - h - 16;
  c.fillStyle = 'rgba(0,0,0,0.25)';
  rr(c, left + 4, top + 5, w, h, 18);
  c.fill();
  c.fillStyle = color;
  rr(c, left, top, w, h, 18);
  c.fill();
  c.beginPath();
  c.moveTo(clamp(x - 12, left + 16, left + w - 40), top + h - 1);
  c.lineTo(clamp(x + 12, left + 40, left + w - 16), top + h - 1);
  c.lineTo(x, y);
  c.fill();
  let ty = top + 12;
  if (who) {
    text(c, who, left + 14, ty + 10, { size: 20, color: '#b5452a', align: 'left' });
    ty += 26;
  }
  lines.forEach((l, i) => text(c, l, left + w / 2, ty + lh / 2 + i * lh, { size, color: ink }));
  c.restore();
}

// ---------- Món ----------
function drawGlass(c, x, y, s = 1, level = 1) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.fillStyle = 'rgba(210,235,255,0.35)';
  c.beginPath();
  c.moveTo(-11, -30);
  c.lineTo(11, -30);
  c.lineTo(8, 0);
  c.lineTo(-8, 0);
  c.closePath();
  c.fill();
  const top = -30 + 28 * (1 - level);
  c.fillStyle = 'rgba(150,205,255,0.7)';
  c.beginPath();
  c.moveTo(-11 + 3 * (1 - level), top);
  c.lineTo(11 - 3 * (1 - level), top);
  c.lineTo(8, 0);
  c.lineTo(-8, 0);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-11, -30);
  c.lineTo(-8, 0);
  c.lineTo(8, 0);
  c.lineTo(11, -30);
  c.stroke();
  c.restore();
}

function drawBeer(c, x, y, s = 1) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.strokeStyle = '#e8eef2';
  c.lineWidth = 5;
  c.beginPath();
  c.arc(13, -16, 9, -Math.PI / 2, Math.PI / 2);
  c.stroke();
  const g = c.createLinearGradient(-13, 0, 13, 0);
  g.addColorStop(0, '#d98a12');
  g.addColorStop(0.5, '#ffc93c');
  g.addColorStop(1, '#d98a12');
  c.fillStyle = g;
  rr(c, -13, -32, 26, 32, 4);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.fillRect(-8, -26, 3, 20);
  c.fillStyle = '#fffaf0';
  c.beginPath();
  c.arc(-8, -33, 7, 0, Math.PI * 2);
  c.arc(1, -36, 8, 0, Math.PI * 2);
  c.arc(9, -33, 7, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function plate(c, w, h) {
  c.fillStyle = '#f7f4ee';
  c.beginPath();
  c.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#cfc8bb';
  c.lineWidth = 2;
  c.beginPath();
  c.ellipse(0, 0, w * 0.72, h * 0.66, 0, 0, Math.PI * 2);
  c.stroke();
}

function drawPeanut(c, x, y, s = 1) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  plate(c, 24, 10);
  c.fillStyle = '#b06a32';
  for (const [px, py] of [[-10, -3], [-3, -6], [5, -3], [11, -5], [-6, 1], [2, 0], [9, 1], [-1, -10], [6, -9]]) {
    c.beginPath();
    c.ellipse(px, py, 4, 3, 0.4, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

// Đĩa nem rán: mấy cuốn nem vàng giòn, lá rau và chén nước chấm có lát ớt.
function drawNem(c, x, y, s = 1) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  plate(c, 26, 11);
  c.fillStyle = '#6fbf4a';
  c.beginPath();
  c.ellipse(-12, -3, 9, 4, -0.5, 0, Math.PI * 2);
  c.fill();
  for (const [dx, dy, rot] of [[-7, -2, -0.25], [4, -4, -0.25], [-2, -9, -0.25]]) {
    c.save();
    c.translate(dx, dy);
    c.rotate(rot);
    const g = c.createLinearGradient(0, -4, 0, 4);
    g.addColorStop(0, '#f2b44a');
    g.addColorStop(1, '#b8681f');
    c.fillStyle = g;
    rr(c, -13, -4, 26, 8, 4);
    c.fill();
    // Vỏ bánh đa nem sần
    c.fillStyle = 'rgba(255,240,190,0.55)';
    for (const px of [-8, -2, 4, 9]) {
      c.beginPath();
      c.arc(px, -1, 1.3, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
  // Chén nước chấm
  c.fillStyle = '#f7f4ee';
  c.beginPath();
  c.ellipse(24, 2, 8, 4, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#e8a35a';
  c.beginPath();
  c.ellipse(24, 1, 5.5, 2.5, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#d7263d';
  c.beginPath();
  c.arc(23, 0.5, 1.4, 0, Math.PI * 2);
  c.arc(26, 1.5, 1.2, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function drawSquid(c, x, y, s = 1) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  plate(c, 30, 12);
  c.fillStyle = '#e07b39';
  c.beginPath();
  c.ellipse(-4, -4, 14, 6, -0.2, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#c4581f';
  c.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    c.beginPath();
    c.moveTo(8, -6 + i * 2);
    c.quadraticCurveTo(16, -8 + i * 3, 22, -3 + i * 2);
    c.stroke();
  }
  c.strokeStyle = '#7a3a12';
  c.lineWidth = 2;
  for (const dx of [-12, -5, 2]) {
    c.beginPath();
    c.moveTo(dx, -9);
    c.lineTo(dx + 4, 0);
    c.stroke();
  }
  c.restore();
}

function drawHotpot(c, x, y, s = 1) {
  const t = performance.now() / 1000;
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.fillStyle = '#333';
  c.beginPath();
  c.ellipse(0, 10, 30, 9, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#ff7a2a';
  c.beginPath();
  c.ellipse(0, 10, 16, 4, 0, 0, Math.PI * 2);
  c.fill();
  const g = c.createLinearGradient(-36, 0, 36, 0);
  g.addColorStop(0, '#8d969e');
  g.addColorStop(0.5, '#eef1f4');
  g.addColorStop(1, '#8d969e');
  c.fillStyle = g;
  rr(c, -36, -22, 72, 30, 10);
  c.fill();
  c.fillStyle = '#c7362a';
  c.beginPath();
  c.ellipse(0, -22, 34, 10, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#5bb24a';
  c.fillRect(-14, -26, 10, 4);
  c.fillStyle = '#f2e0c0';
  c.beginPath();
  c.arc(10, -23, 4 + Math.sin(t * 6) * 1, 0, Math.PI * 2);
  c.arc(-20, -21, 3, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#ffd9a0';
  for (let i = 0; i < 3; i++) {
    const p = (t * 1.6 + i / 3) % 1;
    c.beginPath();
    c.arc(-15 + i * 15, -22 - Math.sin(p * Math.PI) * 3, 2.5, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = '#555';
  rr(c, -46, -16, 12, 8, 3);
  c.fill();
  rr(c, 34, -16, 12, 8, 3);
  c.fill();
  c.restore();
}

const DRAW_ITEM = { beer: drawBeer, peanut: drawPeanut, nem: drawNem, squid: drawSquid, hotpot: drawHotpot };
const ITEM_W = { water: 26, beer: 36, peanut: 50, nem: 64, squid: 62, hotpot: 80 };

function badge(c, n, x, y, gold = false) {
  const label = typeof n === 'number' ? `×${n}` : n;
  c.font = `800 19px ${FONT}`;
  const w = c.measureText(label).width + 12;
  c.fillStyle = gold ? '#ffd166' : '#fff';
  rr(c, x - w / 2, y - 12, w, 24, 12);
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.25)';
  c.lineWidth = 2;
  c.stroke();
  text(c, label, x, y + 1, { size: 19, weight: 800, color: '#3b1d0e' });
}

function steam(c, x, y, k = 1) {
  const t = performance.now() / 1000;
  c.strokeStyle = `rgba(255,255,255,${0.45 * k})`;
  c.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const p = (t * 0.8 + i / 3) % 1;
    c.globalAlpha = (1 - p) * k;
    c.beginPath();
    c.moveTo(x - 10 + i * 10, y - p * 34);
    c.quadraticCurveTo(x - 4 + i * 10 + Math.sin(t * 3 + i) * 6, y - 12 - p * 34, x - 10 + i * 10, y - 24 - p * 34);
    c.stroke();
  }
  c.globalAlpha = 1;
}

// Món trước chỗ ngồi của khách: ly nước, bia, tối đa hai loại đồ ăn, phần còn lại gộp thành nhãn.
function drawTableItems(c, customer, spot, fresh) {
  const list = [];
  if (customer.water.has) list.push({ kind: 'water', level: customer.water.level });
  const totals = new Map();
  for (const s of customer.stacks) {
    if (s.item === 'hotpot') continue;
    const key = `${s.item}${s.large ? ':L' : ''}`;
    totals.set(key, { item: s.item, large: s.large, qty: (totals.get(key)?.qty ?? 0) + s.qty });
  }
  const order = ['beer', 'squid', 'nem', 'peanut'];
  const foods = [...totals.values()].sort((a, b) => order.indexOf(a.item) - order.indexOf(b.item));
  const shown = foods.slice(0, 3);
  const extra = foods.slice(3).reduce((n, f) => n + f.qty, 0);
  for (const f of shown) list.push({ kind: f.item, qty: f.qty, large: f.large });
  const widths = list.map((i) => (ITEM_W[i.kind] ?? 40) * (i.large ? 1.25 : 1));
  const total = widths.reduce((a, b) => a + b, 0) + (extra ? 34 : 0);
  let x = spot.x - total / 2;
  list.forEach((it, i) => {
    const w = widths[i];
    const cx = x + w / 2;
    const s = it.large ? 1.3 : 1;
    if (it.kind === 'water') drawGlass(c, cx, spot.y + 8, 0.9, it.level);
    else {
      DRAW_ITEM[it.kind](c, cx, spot.y + 8, s);
      if (it.kind === 'squid' && fresh) steam(c, cx, spot.y - 6, fresh);
      if (it.qty > 1) badge(c, it.qty, cx + w / 2 - 6, spot.y - 30, it.large);
      if (it.large) text(c, 'LỚN', cx, spot.y + 22, { size: 15, weight: 800, color: '#ffd166', stroke: '#5a2a0a', strokeWidth: 4 });
    }
    x += w;
  });
  if (extra) badge(c, `+${extra}`, x + 16, spot.y - 6);
}

// ---------- Cảnh động ----------
const bikes = [];
let nextBike = performance.now() + 5000;
const smoke = [];
const rainDrops = Array.from({ length: 160 }, () => ({ x: rand(0, W), y: rand(0, H), v: rand(1300, 1700) }));

function burst(x, y, n, colors) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const v = rand(150, 520);
    particles.push({ kind: 'confetti', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200, life: rand(1.2, 2.2), age: 0, size: rand(8, 14), color: colors[i % colors.length], spin: rand(-8, 8) });
  }
}

function napkins() {
  for (const p of people.values()) {
    const seat = p.data?.seat && tableById(p.data.seat.table)?.seats[p.data.seat.index];
    if (!seat) continue;
    for (let i = 0; i < 3; i++) particles.push({ kind: 'napkin', x: seat.x, y: seat.y - 100, vx: rand(-140, 140), vy: rand(-520, -320), life: rand(1.6, 2.4), age: 0, size: rand(14, 20), spin: rand(-6, 6) });
  }
  burst(540, 900, 40, ['#ffffff', '#f2f2f2', '#ffd166']);
}

function personPosition(p) {
  const c = p.data;
  if (!c.seat) return null;
  const seat = tableById(c.seat.table).seats[c.seat.index];
  if (p.walk) {
    const len = pathLength(p.walk.points);
    const d = ((performance.now() - p.walk.start) / 1000) * 330;
    if (d < len) {
      const pt = pointAt(p.walk.points, d);
      return { x: pt.x, y: pt.y, walking: d / 70, seat };
    }
    p.walk = null;
  }
  const inward = state.ambient.rain && seat.side !== 'back' ? (seat.side === 'left' ? 14 : -14) : 0;
  return { x: seat.x + inward, y: seat.y, seat };
}

function runnerState(now) {
  const r = state?.runner;
  if (!r || now >= r.endAt) return { x: KITCHEN.x, y: KITCHEN.y, idle: true };
  const len = pathLength(r.points);
  if (now < r.arriveAt) {
    const k = (now - r.startAt) / (r.arriveAt - r.startAt);
    const pt = pointAt(r.points, len * k);
    return { x: pt.x, y: pt.y, walk: (k * len) / 70, carrying: true, r };
  }
  const putDown = r.arriveAt + 900;
  if (now < putDown) {
    const last = r.points.at(-1);
    return { x: last.x, y: last.y, carrying: now < r.arriveAt + 450, serving: true, r };
  }
  const k = (now - putDown) / (r.endAt - putDown);
  const back = [...r.points].reverse();
  const pt = pointAt(back, len * k);
  return { x: pt.x, y: pt.y, walk: (k * len) / 70, r };
}

function drawTray(c, x, y, r) {
  const big = r.big;
  c.save();
  c.translate(x, y);
  c.fillStyle = big ? '#f2c14e' : '#c8ced4';
  c.beginPath();
  c.ellipse(0, 0, big ? 70 : 52, big ? 16 : 12, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = big ? '#b98a1e' : '#8d969e';
  c.lineWidth = 3;
  c.stroke();
  const list = [];
  for (const it of r.items) if (!list.includes(it.item)) list.push(it.item);
  const shown = list.slice(0, 3);
  if (!shown.length) drawGlass(c, 0, -2, 0.9, 1);
  shown.forEach((item, i) => DRAW_ITEM[item](c, (i - (shown.length - 1) / 2) * 34, -4, 0.8));
  if (r.tray > 1) badge(c, r.tray, big ? 70 : 54, -26, big);
  if (big) {
    const t = performance.now() / 200;
    c.fillStyle = '#fff6c2';
    for (let i = 0; i < 4; i++) {
      const a = t + (i * Math.PI) / 2;
      c.beginPath();
      c.arc(Math.cos(a) * 80, Math.sin(a) * 20 - 20, 4, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}

const TI_LOOK = { skin: '#eec29f', shirt: '#2f6fb3', hair: '#1d1816', style: 0, glasses: false };
const BA_LOOK = { skin: '#e9b98f', shirt: '#c0392b', hair: '#2a1d17', style: 2, glasses: false };
const TU_LOOK = { skin: '#d9a27a', shirt: '#e8e2d0', hair: '#9a9a9a', style: 4, glasses: true };

function drawBubbles(list, x, y, who, dt) {
  const b = list[0];
  if (!b) return;
  b.age = (b.age ?? 0) + dt;
  const alpha = clamp(Math.min(b.age / 150, (b.dur - b.age) / 300), 0, 1);
  speech(ctx, b.text, x, y, { who, alpha, maxWidth: 420 });
  if (b.age >= b.dur) list.shift();
  return true;
}

function drawMenu(now) {
  // Mỗi hàng chỉ có icon quà và tên món (to, dễ đọc); ưu đãi thì tô vàng và hiện số phần mới.
  const x = 416;
  const y = 310;
  const w = 318;
  const h = 288;
  ctx.fillStyle = '#6b4220';
  rr(ctx, x - 8, y - 8, w + 16, h + 16, 12);
  ctx.fill();
  ctx.fillStyle = '#22382b';
  rr(ctx, x, y, w, h, 8);
  ctx.fill();
  text(ctx, 'THỰC ĐƠN', x + w / 2, y + 20, { size: 26, font: HAND, color: '#fff7d6' });
  const menu = state?.menu ?? [];
  const rowH = (h - 40) / Math.max(1, menu.length);
  const icon = Math.min(50, rowH - 2);
  menu.forEach((m, i) => {
    const ry = y + 40 + i * rowH;
    if (m.promo) {
      const pulse = 0.55 + Math.sin(now / 250) * 0.15;
      ctx.fillStyle = `rgba(255,209,102,${pulse * 0.35})`;
      rr(ctx, x + 4, ry + 1, w - 8, rowH - 2, 8);
      ctx.fill();
    }
    const img = image(m.icon);
    if (img) ctx.drawImage(img, x + 6, ry + (rowH - icon) / 2, icon, icon);
    let offer = `${m.promo && m.bonus ? m.total : m.base} ${m.unit} ${m.itemName}`;
    if (m.promo && m.side) offer += ' + đậu phộng';
    if (m.promo && m.large) offer += ' (lớn)';
    text(ctx, offer, x + icon + 14, ry + rowH / 2 + 2, { size: 32, font: HAND, color: m.promo ? '#ffd166' : '#fff', align: 'left', maxWidth: w - icon - 22 });
  });
}

function promoLine(m, promo) {
  if (promo.effect === 'side') return `${m.label}: ${m.base} ${m.unit} ${m.itemName} + 1 đĩa đậu phộng`;
  if (promo.effect === 'large') return `${m.label}: ${m.base} ${m.unit} ${m.itemName} phần lớn`;
  return `${m.label}: ${m.base} ${m.unit} + ${m.bonus} ${m.unit} tặng`;
}

function drawEventBoard(now) {
  const promo = state?.promo;
  const st = state?.stage;
  let title;
  let big;
  let sub;
  let remain = null;
  if (promo && serverNow() < promo.endAt) {
    title = promo.title;
    big = promo.short;
    remain = Math.max(0, Math.ceil((promo.endAt - serverNow()) / 1000));
    const applied = state.menu.filter((m) => m.promo);
    if (applied.length) sub = promoLine(applied[Math.floor(now / 2600) % applied.length], promo);
  } else if (st?.kind === 'match' && st.phase !== 'promo') {
    title = 'BÓNG LĂN, QUÁN CÓ LỘC';
    big = st.phase === 'result' ? (st.outcome === 'win' ? 'ĐỘI NHÀ THẮNG!' : st.outcome === 'draw' ? 'HÒA RỒI!' : 'THUA RỒI...') : `CỔ VŨ ${st.home.toUpperCase()}!`;
    sub = st.phase === 'result' && st.outcome !== 'win' ? 'Trận sau gỡ nha bà con!' : 'Đội nhà thắng: mua 1 tặng 3 trong 90 giây';
  } else if (st?.kind === 'wheel' && st.phase === 'spin') {
    title = 'CHIẾC QUẠT SỐ HÊN';
    big = 'ĐANG QUAY...';
    const m = state.menu.find((x) => x.gift === st.gift);
    sub = `Quà được chỉ định: ${m?.label ?? st.gift}`;
  } else return false;
  const x = 150;
  const y = 176;
  const w = 780;
  const h = 128;
  const wob = Math.sin(now / 400) * 0.006;
  ctx.save();
  ctx.translate(540, y);
  ctx.rotate(wob);
  ctx.translate(-540, -y);
  ctx.strokeStyle = '#3a2a1a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 60, y - 30);
  ctx.lineTo(x + 60, y);
  ctx.moveTo(x + w - 60, y - 30);
  ctx.lineTo(x + w - 60, y);
  ctx.stroke();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#d7263d');
  g.addColorStop(1, '#8e1328');
  ctx.fillStyle = g;
  rr(ctx, x, y, w, h, 18);
  ctx.fill();
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 5;
  ctx.setLineDash([14, 10]);
  ctx.lineDashOffset = -now / 40;
  rr(ctx, x + 8, y + 8, w - 16, h - 16, 12);
  ctx.stroke();
  ctx.setLineDash([]);
  text(ctx, title, 540, y + 28, { size: 24, weight: 800, color: '#ffe8a3' });
  text(ctx, big, remain != null ? 500 : 540, y + 68, { size: 46, weight: 800, color: '#fff', stroke: '#5a0a16', strokeWidth: 8, maxWidth: 560 });
  if (remain != null) {
    const m = Math.floor(remain / 60);
    const sLeft = String(remain % 60).padStart(2, '0');
    ctx.fillStyle = remain <= 10 && Math.floor(now / 300) % 2 ? '#fff' : '#ffd166';
    rr(ctx, x + w - 150, y + 46, 124, 46, 23);
    ctx.fill();
    text(ctx, `${m}:${sLeft}`, x + w - 88, y + 70, { size: 34, weight: 800, color: '#7a1020' });
  }
  if (sub) text(ctx, sub, 540, y + 106, { size: 23, weight: 700, color: '#ffe8a3', maxWidth: w - 40 });
  ctx.restore();
  return true;
}

function drawTV(now) {
  const x = 744;
  const y = 300;
  const w = 296;
  const h = 176;
  ctx.fillStyle = '#2a2a2a';
  rr(ctx, x - 10, y - 10, w + 20, h + 20, 12);
  ctx.fill();
  ctx.fillStyle = '#4a4a4a';
  ctx.beginPath();
  ctx.arc(x + w - 4, y + h + 2, 4, 0, Math.PI * 2);
  ctx.fill();
  const st = state?.stage?.kind === 'match' ? state.stage : null;
  ctx.save();
  rr(ctx, x, y, w, h, 6);
  ctx.clip();
  // Sân cỏ
  ctx.fillStyle = '#2f8a3a';
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
    ctx.fillRect(x + (i * w) / 8, y, w / 8, h);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 10, y + 40, w - 20, h - 50);
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 40);
  ctx.lineTo(x + w / 2, y + h - 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + w / 2, y + 40 + (h - 50) / 2, 22, 0, Math.PI * 2);
  ctx.stroke();
  const t = now / 1000;
  if (st && st.phase === 'live') {
    // Cầu thủ chấm tròn và bóng
    const bx = x + w / 2 + Math.sin(t * 1.3) * 110 + Math.sin(t * 3.1) * 20;
    const by = y + 95 + Math.cos(t * 1.7) * 40;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.arc(bx - 40 + Math.sin(t * 2 + i) * 50, by + Math.cos(t * 1.5 + i * 2) * 35, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f1faee';
      ctx.beginPath();
      ctx.arc(bx + 40 + Math.cos(t * 2.2 + i) * 50, by + Math.sin(t * 1.4 + i * 2) * 35, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(bx, by, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Bảng tỉ số
  ctx.fillStyle = 'rgba(10,10,30,0.85)';
  ctx.fillRect(x, y, w, 34);
  if (st) {
    const home = st.home.length > 10 ? st.home.slice(0, 10) : st.home;
    const away = st.away.split(' ')[0];
    text(ctx, `${home} ${st.score.home} - ${st.score.away} ${away}`, x + 8, y + 18, { size: 19, color: '#fff', align: 'left', maxWidth: w - 70 });
    let clock = '';
    if (st.phase === 'intro') clock = 'SẮP ĐÁ';
    else if (st.phase === 'live') clock = `${Math.min(90, Math.floor(((serverNow() - st.startAt) / (st.endAt - st.startAt)) * 90))}'`;
    else clock = 'HẾT';
    text(ctx, clock, x + w - 8, y + 18, { size: 18, color: '#ffd166', align: 'right' });
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y + h - 24, w, 24);
    text(ctx, 'TRẬN MÔ PHỎNG TRONG GAME', x + w / 2, y + h - 12, { size: 15, color: '#fff' });
    if (st.phase === 'intro') text(ctx, `${st.home} vs ${st.away}`, x + w / 2, y + 100, { size: 26, color: '#fff', stroke: '#000', strokeWidth: 5, maxWidth: w - 20 });
    if (st.phase === 'result' || st.phase === 'promo') text(ctx, `${st.score.home} - ${st.score.away}`, x + w / 2, y + 100, { size: 52, color: '#ffd166', stroke: '#000', strokeWidth: 6 });
  } else {
    text(ctx, 'KÊNH BÓNG ĐÁ HẺM', x + w / 2, y + 18, { size: 18, color: '#fff' });
    text(ctx, 'Lát nữa có trận nha!', x + w / 2, y + 102, { size: 24, color: '#fff', stroke: '#000', strokeWidth: 4 });
  }
  // Nhiễu tivi cũ
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 6; i++) ctx.fillRect(x, y + ((now / 8 + i * 37) % h), w, 2);
  ctx.restore();
}

function drawWheel(now) {
  if (!wheelView) return;
  const elapsed = now - wheelView.start;
  const total = wheelView.spinMs + 2600;
  if (elapsed > total) {
    wheelView = null;
    return;
  }
  const slots = wheelView.slots;
  const n = slots.length;
  const seg = (Math.PI * 2) / n;
  // Kim ở trên cùng; quay nhiều vòng rồi dừng đúng ô kết quả.
  const final = Math.PI * 2 * 6 - (wheelView.result * seg + seg / 2);
  const k = clamp(elapsed / wheelView.spinMs, 0, 1);
  const angle = final * (1 - (1 - k) ** 3);
  const tickIndex = Math.floor((angle + seg / 2) / seg);
  if (tickIndex !== lastWheelTick && k < 1) {
    lastWheelTick = tickIndex;
    sound.tick();
  }
  const appear = clamp(elapsed / 400, 0, 1) * clamp((total - elapsed) / 400, 0, 1);
  const cx = 540;
  const cy = 1010;
  const R = 230;
  ctx.save();
  ctx.globalAlpha = appear;
  ctx.fillStyle = 'rgba(10,6,20,0.55)';
  ctx.fillRect(0, 620, W, 860);
  ctx.translate(cx, cy);
  ctx.scale(0.8 + appear * 0.2, 0.8 + appear * 0.2);
  // Lồng quạt
  ctx.fillStyle = '#d9dee3';
  ctx.beginPath();
  ctx.arc(0, 0, R + 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.rotate(angle);
  const colors = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#9b5de5'];
  const NAMES = { double: 'GẤP ĐÔI', side: 'KÈM ĐẬU PHỘNG', large: 'PHẦN LỚN', b1g2: 'MUA 1 TẶNG 2', b1g3: 'MUA 1 TẶNG 3' };
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, -Math.PI / 2 + i * seg, -Math.PI / 2 + (i + 1) * seg);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.rotate(-Math.PI / 2 + i * seg + seg / 2);
    text(ctx, NAMES[slots[i]] ?? slots[i], R * 0.6, 0, { size: 26, font: HAND, color: '#2a1d17', maxWidth: R * 0.7 });
    ctx.restore();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(80,80,90,0.55)';
  ctx.lineWidth = 3;
  for (let r = 60; r <= R; r += 42) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#2f6fb3';
  ctx.beginPath();
  ctx.arc(0, 0, 44, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, 'QUẠT', 0, 0, { size: 22, weight: 800, color: '#fff' });
  // Kim
  ctx.fillStyle = '#d7263d';
  ctx.beginPath();
  ctx.moveTo(-22, -R - 34);
  ctx.lineTo(22, -R - 34);
  ctx.lineTo(0, -R + 16);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (k >= 1) {
    const m = state?.menu.find((x) => x.gift === wheelView.gift);
    const NAMES2 = { double: 'GẤP ĐÔI MÓN', side: 'CÓ ĐỒ NHẮM KÈM', large: 'PHẦN LỚN CÔ MỜI', b1g2: 'MUA 1 TẶNG 2', b1g3: 'MUA 1 TẶNG 3' };
    ctx.globalAlpha = appear;
    text(ctx, NAMES2[slots[wheelView.result]], cx, cy + R + 60, { size: 54, weight: 800, color: '#ffd166', stroke: '#3a0a14', strokeWidth: 10 });
    text(ctx, `Áp dụng cho: ${m?.label ?? wheelView.gift}`, cx, cy + R + 110, { size: 32, color: '#fff', stroke: '#3a0a14', strokeWidth: 7 });
    ctx.globalAlpha = 1;
  }
}

function drawTickets(dt) {
  let y = 312;
  for (let i = tickets.length - 1, shown = 0; i >= 0 && shown < 2; i--, shown++) {
    const t = tickets[i];
    t.born += dt;
    const life = 4200;
    if (t.born > life) {
      tickets.splice(i, 1);
      continue;
    }
    const k = clamp(t.born / 250, 0, 1) * clamp((life - t.born) / 300, 0, 1);
    const x = 24 - (1 - k) * 420;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(x, y);
    ctx.rotate(-0.02);
    ctx.fillStyle = '#fffaf0';
    rr(ctx, 0, 0, 392, 92, 8);
    ctx.fill();
    ctx.fillStyle = '#d7263d';
    ctx.fillRect(0, 0, 392, 8);
    const img = image(t.icon);
    if (img) ctx.drawImage(img, 10, 18, 56, 56);
    const where = t.table ? `bàn ${t.table}` : 'đang chờ ghế';
    ctx.font = `800 24px ${FONT}`;
    text(ctx, `${fitText(ctx, t.name, 180)} · ${where}`, 76, 30, { size: 24, color: '#3b1d0e', align: 'left', maxWidth: 300 });
    let what = t.bonus ? `${t.base} + ${t.bonus} tặng = ${t.qty} ${t.unit} ${t.itemName}` : `${t.qty} ${t.unit} ${t.itemName}`;
    if (t.side) what += ` + ${t.side} đĩa đậu phộng`;
    if (t.large) what += ' (phần lớn)';
    text(ctx, `${t.giftLabel} ×${t.units} → ${what}`, 76, 64, { size: 22, color: '#7a1020', align: 'left', maxWidth: 304, font: FONT });
    ctx.restore();
    y += 100;
  }
}

function drawFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.age += dt;
    if (f.age > 1800) {
      floaters.splice(i, 1);
      continue;
    }
    const k = f.age / 1800;
    ctx.globalAlpha = 1 - k;
    text(ctx, f.text, f.x, f.y - k * 60, { size: 26, color: '#ffd166', stroke: '#3b1d0e', strokeWidth: 6 });
    ctx.globalAlpha = 1;
  }
}

function drawParticles(dt) {
  const s = dt / 1000;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += s;
    if (p.age > p.life) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * s;
    p.y += p.vy * s;
    if (p.kind !== 'heart' && p.kind !== 'dust' && p.kind !== 'sparkle') p.vy += 700 * s;
    ctx.globalAlpha = clamp((p.life - p.age) / 0.4, 0, 1);
    if (p.kind === 'heart') {
      text(ctx, '❤', p.x, p.y, { size: p.size, color: '#ff4d6d' });
    } else if (p.kind === 'vomit') {
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'dust') {
      ctx.globalAlpha = clamp(1 - p.age / p.life, 0, 1) * 0.6;
      ctx.fillStyle = '#d8d0c4';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 + p.age * 2), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'sparkle') {
      ctx.globalAlpha = clamp(1 - p.age / p.life, 0, 1);
      text(ctx, '✦', p.x, p.y, { size: p.size, color: '#fff7b0', stroke: 'rgba(90,140,200,0.6)', strokeWidth: 3 });
    } else {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.age * p.spin);
      ctx.fillStyle = p.kind === 'napkin' ? '#fbfbf7' : p.color;
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, (p.size * 2) / 3);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

function drawSmoke(dt, now) {
  if (Math.random() < 0.25) smoke.push({ x: rand(50, 180), y: 466, age: 0, life: rand(2.2, 3.4), r: rand(10, 18) });
  if (tickets.length && Math.random() < 0.3) smoke.push({ x: rand(220, 300), y: 480, age: 0, life: 1.8, r: rand(8, 14) });
  const s = dt / 1000;
  for (let i = smoke.length - 1; i >= 0; i--) {
    const p = smoke[i];
    p.age += s;
    if (p.age > p.life) {
      smoke.splice(i, 1);
      continue;
    }
    const k = p.age / p.life;
    ctx.fillStyle = `rgba(230,230,235,${0.32 * (1 - k)})`;
    ctx.beginPath();
    ctx.arc(p.x + Math.sin(now / 600 + i) * 14 * k, p.y - k * 150, p.r + k * 26, 0, Math.PI * 2);
    ctx.fill();
  }
  // Lửa bùng khi nướng mực
  const flame = clamp((flameUntil - now) / 600, 0, 1);
  if (flame > 0) {
    if (Math.random() < 0.5) smoke.push({ x: rand(50, 180), y: 470, age: 0, life: rand(1.6, 2.4), r: rand(12, 20) });
    for (let i = 0; i < 8; i++) {
      const fx = 56 + i * 18;
      const h = (30 + Math.abs(Math.sin(now / 70 + i * 1.9)) * 46) * flame;
      const g = ctx.createLinearGradient(0, 488, 0, 488 - h);
      g.addColorStop(0, 'rgba(255,90,30,0.95)');
      g.addColorStop(1, 'rgba(255,220,90,0.1)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(fx - 10, 490);
      ctx.quadraticCurveTo(fx - 6, 488 - h * 0.5, fx + Math.sin(now / 90 + i) * 5, 488 - h);
      ctx.quadraticCurveTo(fx + 6, 488 - h * 0.5, fx + 10, 490);
      ctx.fill();
    }
  }
  // Than hồng
  ctx.fillStyle = `rgba(255,110,40,${0.5 + Math.sin(now / 180) * 0.15})`;
  ctx.fillRect(46, 488, 140, 8);
}

function drawLights(now) {
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 160);
  for (let x = 0; x <= W; x += 10) ctx.lineTo(x, 166 + Math.sin((x / W) * Math.PI * 4) * 10);
  ctx.stroke();
  for (let i = 0; i < 14; i++) {
    const x = 30 + i * 78;
    const y = 172 + Math.sin((x / W) * Math.PI * 4) * 10;
    const flicker = 0.75 + Math.sin(now / 300 + i * 1.7) * 0.08 + (i === 9 && Math.sin(now / 90) > 0.95 ? -0.4 : 0);
    const g = ctx.createRadialGradient(x, y, 2, x, y, 46);
    g.addColorStop(0, `rgba(255,220,140,${0.55 * flicker})`);
    g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 46, y - 46, 92, 92);
    ctx.fillStyle = `rgba(255,236,170,${flicker})`;
    ctx.beginPath();
    ctx.arc(x, y + 6, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  // Thiêu thân bay vòng quanh vài bóng đèn
  ctx.fillStyle = 'rgba(245,235,205,0.9)';
  for (const i of [2, 6, 11]) {
    const x = 30 + i * 78;
    const y = 178 + Math.sin((x / W) * Math.PI * 4) * 10;
    for (let m = 0; m < 2; m++) {
      const a = now / (320 + m * 90) + i + m * 2;
      const mx = x + Math.cos(a) * (20 + m * 10);
      const my = y + Math.sin(a * 1.3) * 15;
      const flap = 1.5 + Math.abs(Math.sin(now / 35 + m + i)) * 2.5;
      ctx.beginPath();
      ctx.ellipse(mx - 3, my, 4, flap, 0, 0, Math.PI * 2);
      ctx.ellipse(mx + 3, my, 4, flap, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawFan(now) {
  const x = 1010;
  const y = 236;
  ctx.fillStyle = '#d9dee3';
  ctx.beginPath();
  ctx.arc(x, y, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(now / 180);
  ctx.fillStyle = 'rgba(47,111,179,0.8)';
  for (let i = 0; i < 3; i++) {
    ctx.rotate((Math.PI * 2) / 3);
    ctx.beginPath();
    ctx.ellipse(0, -20, 11, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(120,120,130,0.8)';
  ctx.lineWidth = 2;
  for (const r of [16, 30, 42]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawTable(t) {
  const { x, y } = t;
  // Bóng
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y + 108, 165, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  // Chân
  ctx.fillStyle = '#8d969e';
  for (const dx of [-135, 127]) ctx.fillRect(x + dx, y + 48, 8, 60);
  ctx.fillStyle = '#6f777e';
  for (const dx of [-110, 102]) ctx.fillRect(x + dx, y + 40, 6, 52);
  // Mặt bàn inox
  const g = ctx.createLinearGradient(0, y - 56, 0, y + 46);
  g.addColorStop(0, '#f1f4f6');
  g.addColorStop(1, '#bfc6cc');
  ctx.fillStyle = g;
  rr(ctx, x - 150, y - 56, 300, 102, 12);
  ctx.fill();
  ctx.fillStyle = '#9aa3ab';
  rr(ctx, x - 150, y + 38, 300, 18, 8);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(x - 130, y - 46, 120, 4);
  // Số bàn
  // Bảng số bàn treo dưới mép bàn để không đè nhãn "Lẩu" ở giữa mặt bàn.
  ctx.fillStyle = '#7a1f1f';
  rr(ctx, x - 44, y + 58, 88, 30, 8);
  ctx.fill();
  ctx.strokeStyle = '#f2c14e';
  ctx.lineWidth = 2;
  rr(ctx, x - 41, y + 61, 82, 24, 6);
  ctx.stroke();
  text(ctx, `BÀN ${t.id}`, x, y + 74, { size: 22, weight: 800, color: '#ffe8a3' });
}

const CAT_HOME = { x: 652, y: 646 };
function drawCat(now) {
  const cat = state?.ambient?.cat;
  let x = CAT_HOME.x;
  let y = CAT_HOME.y;
  let sleeping = true;
  if (cat) {
    const seat = tableById(cat.table).seats[cat.index];
    const target = { x: seat.x + (seat.side === 'right' ? -40 : 40), y: seat.y + 40 };
    const start = cat.startAt - offset;
    const elapsed = Date.now() - start;
    const total = cat.endAt - cat.startAt;
    const walk = 3500;
    if (elapsed < walk) {
      const k = ease(elapsed / walk);
      x = lerp(CAT_HOME.x, target.x, k);
      y = lerp(CAT_HOME.y, target.y, k);
    } else if (elapsed < total - walk) {
      x = target.x;
      y = target.y;
    } else {
      const k = ease(clamp((elapsed - (total - walk)) / walk, 0, 1));
      x = lerp(target.x, CAT_HOME.x, k);
      y = lerp(target.y, CAT_HOME.y, k);
    }
    sleeping = false;
    if (elapsed > walk && elapsed < total - walk && Math.random() < 0.01) particles.push({ kind: 'heart', x, y: y - 40, vx: 0, vy: -60, life: 1.4, age: 0, size: 22 });
  }
  const t = now / 1000;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#d9913a';
  if (sleeping) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 34, 18 + Math.sin(t * 2) * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-26, -4, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b06a22';
    for (const dx of [-8, 4, 16]) ctx.fillRect(dx, -16, 5, 14);
    text(ctx, 'z', -40, -30 - ((t * 20) % 20), { size: 22, color: 'rgba(255,255,255,0.8)' });
  } else {
    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-24, -14, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-34, -22);
    ctx.lineTo(-30, -36);
    ctx.lineTo(-24, -26);
    ctx.moveTo(-20, -26);
    ctx.lineTo(-14, -36);
    ctx.lineTo(-12, -22);
    ctx.fill();
    ctx.strokeStyle = '#d9913a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(26, -2);
    ctx.quadraticCurveTo(46, -10 + Math.sin(t * 4) * 8, 40, -30);
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(-29, -15, 2.5, 0, Math.PI * 2);
    ctx.arc(-19, -15, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawKaraoke(now) {
  const k = state?.ambient?.karaoke;
  if (!k) return false;
  const p = clamp((serverNow() - k.startAt) / (k.endAt - k.startAt), 0, 1);
  const x = lerp(-120, W + 120, p);
  const y = 1560;
  // Loa kéo
  ctx.fillStyle = '#222';
  rr(ctx, x + 30, y - 70, 54, 76, 8);
  ctx.fill();
  ctx.fillStyle = '#555';
  ctx.beginPath();
  ctx.arc(x + 57, y - 46, 14 + Math.sin(now / 60) * 2, 0, Math.PI * 2);
  ctx.arc(x + 57, y - 12, 10, 0, Math.PI * 2);
  ctx.fill();
  drawPerson(ctx, x, y, { skin: '#e0ac85', shirt: '#9b5de5', hair: '#1d1816', style: 3, glasses: false }, { walk: (now / 400) % 2, talk: true, scale: 0.9 });
  for (let i = 0; i < 3; i++) {
    const q = (now / 1400 + i / 3) % 1;
    ctx.globalAlpha = 1 - q;
    text(ctx, i % 2 ? '♪' : '♫', x + 20 + i * 30, y - 130 - q * 80, { size: 34, color: '#ffd166', stroke: '#3b1d0e', strokeWidth: 4 });
    ctx.globalAlpha = 1;
  }
  return true;
}

function drawBikes(now, dt) {
  if (now > nextBike && !state.ambient.crash) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    bikes.push({ x: dir > 0 ? -160 : W + 160, dir, y: dir > 0 ? 1588 : 1540, color: SHIRTS[Math.floor(Math.random() * SHIRTS.length)], v: rand(380, 520) });
    sound.motorbike(dir);
    nextBike = now + rand(9000, 22000);
  }
  for (let i = bikes.length - 1; i >= 0; i--) {
    const b = bikes[i];
    b.x += (b.dir * b.v * dt) / 1000;
    if (b.x < -200 || b.x > W + 200) {
      bikes.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(b.dir, 1);
    // Đèn pha
    const g = ctx.createLinearGradient(50, 0, 220, 0);
    g.addColorStop(0, 'rgba(255,240,180,0.45)');
    g.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(50, -20);
    ctx.lineTo(220, -50);
    ctx.lineTo(220, 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(-40, 0, 16, 0, Math.PI * 2);
    ctx.arc(40, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = b.color;
    rr(ctx, -50, -34, 100, 26, 12);
    ctx.fill();
    ctx.fillStyle = '#333';
    rr(ctx, -30, -44, 50, 12, 6);
    ctx.fill();
    // Người lái
    ctx.fillStyle = '#34405a';
    rr(ctx, -12, -90, 30, 50, 10);
    ctx.fill();
    ctx.fillStyle = '#d7263d';
    ctx.beginPath();
    ctx.arc(3, -104, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(50, -22, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function tarpPull() {
  const rain = state?.ambient?.rain;
  if (!rain) return 0;
  const s = serverNow();
  return clamp((s - rain.startAt) / 3000, 0, 1) * clamp((rain.endAt - s) / 3000, 0, 1);
}

// Bạt kéo ra che quán khi mưa (vẽ dưới bảng sự kiện để không che chữ).
function drawTarp() {
  const pull = tarpPull();
  if (!pull) return;
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = i % 2 ? '#e9e2cf' : '#2f6fb3';
    ctx.beginPath();
    ctx.moveTo(i * 62 - 10, 148);
    ctx.lineTo((i + 1) * 62 - 10, 148);
    ctx.lineTo((i + 1) * 62 - 10, 148 + 60 * pull);
    ctx.quadraticCurveTo(i * 62 + 21, 148 + 76 * pull, i * 62 - 10, 148 + 60 * pull);
    ctx.fill();
  }
}

function drawRain(now, dt) {
  const rain = state?.ambient?.rain;
  setRainSound(Boolean(rain));
  if (!rain) return;
  const s = serverNow();
  const k = clamp(Math.min((s - rain.startAt) / 2500, (rain.endAt - s) / 2500), 0, 1);
  const pull = tarpPull();
  ctx.fillStyle = `rgba(20,30,60,${0.18 * k})`;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = `rgba(190,210,255,${0.5 * k})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const d of rainDrops) {
    d.y += (d.v * dt) / 1000;
    d.x -= (d.v * 0.15 * dt) / 1000;
    if (d.y > H) {
      d.y = -20;
      d.x = rand(0, W + 200);
    }
    if (d.y > 220 && d.y < 1480 && d.x > 0) continue;
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + 5, d.y - 30);
  }
  ctx.stroke();
  // Giọt rơi từ mép bạt
  ctx.fillStyle = `rgba(190,210,255,${0.7 * k})`;
  for (let i = 0; i < 18; i++) {
    const p = (now / 700 + i * 0.37) % 1;
    ctx.beginPath();
    ctx.arc(i * 62 + 21, 150 + 70 * pull + p * 60, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFlashes(dt) {
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    const age = performance.now() - f.born;
    const life = f.life ?? 1800;
    if (age > life) {
      flashes.splice(i, 1);
      continue;
    }
    const k = age / life;
    const s = f.small ? 0.7 : 1 + Math.sin(Math.min(1, age / 300) * Math.PI) * 0.3;
    ctx.save();
    ctx.globalAlpha = clamp((1 - k) * 2, 0, 1);
    ctx.translate(540, 900);
    ctx.scale(s, s);
    ctx.rotate(-0.06);
    text(ctx, f.text, 0, 0, { size: 130, weight: 800, color: f.color, stroke: '#3a0a14', strokeWidth: 16 });
    text(ctx, f.sub, 0, 100, { size: 60, weight: 800, color: '#fff', stroke: '#3a0a14', strokeWidth: 10 });
    ctx.restore();
  }
}

// Hai dòng hướng dẫn, mỗi dòng gồm các đoạn chữ khác màu.
const GUIDE_LINES = [
  [
    ['Comment “vào”', '#ffd166'],
    [' vô quán  |  ', '#fff'],
    ['“về”', '#ffd166'],
    [' ra về  |  ', '#fff'],
    ['“dô”', '#ffd166'],
    [' cụng ly', '#fff'],
  ],
  [
    ['Comment “vào bàn 3”', '#ffd166'],
    [' để đổi chỗ  |  Thả 100 tim: ', '#fff'],
    ['1 sinh tố lúa mạch', '#ffd166'],
  ],
];

function drawGuide() {
  const widthOf = (parts) => parts.reduce((n, [s]) => n + ctx.measureText(s).width, 0);
  let size = 25;
  ctx.font = `700 ${size}px ${FONT}`;
  let widest = Math.max(...GUIDE_LINES.map(widthOf));
  while (widest > 980 && size > 16) {
    size--;
    ctx.font = `700 ${size}px ${FONT}`;
    widest = Math.max(...GUIDE_LINES.map(widthOf));
  }
  const lineH = size + 10;
  const top = 1500 - GUIDE_LINES.length * lineH - 14;
  ctx.fillStyle = 'rgba(25,16,30,0.82)';
  rr(ctx, 540 - widest / 2 - 30, top, widest + 60, GUIDE_LINES.length * lineH + 14, 24);
  ctx.fill();
  GUIDE_LINES.forEach((parts, i) => {
    ctx.font = `700 ${size}px ${FONT}`;
    let x = 540 - widthOf(parts) / 2;
    const y = top + 7 + lineH * i + lineH / 2;
    for (const [s, color] of parts) {
      text(ctx, s, x, y, { size, color, align: 'left' });
      ctx.font = `700 ${size}px ${FONT}`;
      x += ctx.measureText(s).width;
    }
  });
}

// ---------- Va chạm xe ngoài đường: cả quán hóng biến, công an tới giải quyết ----------
const CRASH_Y = 1572;
const RIDER_A = { skin: '#eec29f', shirt: '#e8774a', hair: '#1d1816', style: 4, glasses: false };
const RIDER_B = { skin: '#d9a27a', shirt: '#4f9de0', hair: '#2a2a36', style: 0, glasses: false };
const POLICE = { skin: '#e0ac85', shirt: '#c9b84a', hair: '#1d1816', style: 4, glasses: false };
const OH = ['Ồ!', 'Ồ ồ!', 'Hóng biến!', 'Có biến!', 'Trời ơi!', 'Uầy!', 'Ối dồi ôi!', 'Gì vậy trời?'];
const CRASH_TALK = [
  [3300, 5000, 'a', ['Ui da...', 'Trời ơi cái xe!', 'Đau quá trời!']],
  [5000, 6600, 'a', ['Đi kiểu gì vậy?!', 'Sao không nhìn đường?', 'Bộ không thấy tui hả?']],
  [6600, 8300, 'b', ['Ông chạy ẩu thì có!', 'Tui đi đúng làn mà!', 'Ai biểu ông quẹo không xi nhan!']],
  [9600, 11900, 'p', ['Bình tĩnh! Cho xem giấy tờ nào.', 'Từ từ nói, có ai bị sao không?', 'Dừng cãi nhau, để chú xem!']],
  [12000, 13700, 'a', ['Dạ con không sao chú...', 'Dạ tại con vội quá...']],
  [13700, 15300, 'b', ['Dạ tụi con cũng sơ ý.', 'Dạ con cũng chạy hơi nhanh.']],
  [15300, 17400, 'p', ['Lần sau chạy chậm lại nha!', 'Bắt tay làm hòa, rồi đi cẩn thận!', 'Không ai sao là tốt rồi, giải tán!']],
];
let crashSeen = 0;

function helmet(color) {
  return (c, hy) => {
    c.fillStyle = color;
    c.beginPath();
    c.arc(0, hy - 6, 31, Math.PI, Math.PI * 2);
    c.fill();
    c.fillRect(-31, hy - 8, 62, 7);
  };
}

function policeCap(c, hy) {
  c.fillStyle = '#f4f1ea';
  c.beginPath();
  c.ellipse(0, hy - 24, 32, 12, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#c0261f';
  c.fillRect(-26, hy - 22, 52, 6);
  c.fillStyle = '#f2c14e';
  c.beginPath();
  c.arc(0, hy - 28, 5, 0, Math.PI * 2);
  c.fill();
}

function drawMoto(x, y, dir, color, { tilt = 0, police = false, lights = false, now = 0 } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir * 0.85, 0.85);
  ctx.rotate(tilt);
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(-40, 0, 16, 0, Math.PI * 2);
  ctx.arc(40, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#777';
  ctx.beginPath();
  ctx.arc(-40, 0, 6, 0, Math.PI * 2);
  ctx.arc(40, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  rr(ctx, -50, -34, 100, 26, 12);
  ctx.fill();
  ctx.fillStyle = '#333';
  rr(ctx, -30, -44, 50, 12, 6);
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(38, -30);
  ctx.lineTo(30, -58);
  ctx.stroke();
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(50, -22, 6, 0, Math.PI * 2);
  ctx.fill();
  if (police) {
    const blink = Math.floor(now / 160) % 2;
    ctx.fillStyle = blink && lights ? '#ff3b3b' : '#7a1f1f';
    rr(ctx, -46, -66, 14, 14, 4);
    ctx.fill();
    ctx.fillStyle = !blink && lights ? '#3b8bff' : '#1f3f7a';
    rr(ctx, -30, -66, 14, 14, 4);
    ctx.fill();
    if (lights) {
      const g = ctx.createRadialGradient(-30, -60, 4, -30, -60, 90);
      g.addColorStop(0, blink ? 'rgba(255,60,60,0.45)' : 'rgba(60,140,255,0.45)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-120, -150, 180, 180);
    }
  }
  ctx.restore();
}

function drawRider(x, y, look, dir, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  drawPerson(ctx, 0, 0, look, { scale: 0.85, ...opts });
  ctx.restore();
}

function dizzy(x, y, now) {
  for (let i = 0; i < 3; i++) {
    const a = now / 250 + (i * Math.PI * 2) / 3;
    text(ctx, '★', x + Math.cos(a) * 30, y + Math.sin(a) * 9, { size: 22, color: '#ffd166', stroke: '#5a2a0a', strokeWidth: 3 });
  }
}

function crashReact(now) {
  sound.crash();
  // Cả quán quay ra hóng: phần lớn khách bật dậy "Ồ!", lệch nhau một chút cho tự nhiên.
  for (const p of people.values()) {
    if (!p.data.seat || p.walk || Math.random() > 0.75) continue;
    const delay = rand(0, 700);
    setTimeout(() => {
      const at = performance.now();
      p.ohUntil = at + rand(1600, 2600);
      if (!p.bubble || at > p.bubble.until) p.bubble = { text: OH[Math.floor(Math.random() * OH.length)], until: at + rand(2600, 4000) };
    }, delay);
  }
}

function drawCrash(now) {
  const crash = state?.ambient?.crash;
  if (!crash) return false;
  const t = serverNow() - crash.startAt;
  const T = crash.endAt - crash.startAt;
  const cx = crash.x;
  if (crashSeen !== crash.startAt && t >= 2000 && t < 4000) {
    crashSeen = crash.startAt;
    crashReact(now);
  }
  if (t >= 6000 && t < 6100 && crash.siren !== crash.startAt) {
    crash.siren = crash.startAt;
    sound.siren();
  }
  const pick = (list, k) => list[(crash.seed + k) % list.length];
  // Hai xe
  let ax;
  let bx;
  let tiltA = 0;
  let tiltB = 0;
  const end = T - 5000;
  if (t < 2000) {
    const k = t / 2000;
    ax = lerp(-180, cx - 48, k);
    bx = lerp(W + 180, cx + 48, k);
  } else if (t < end) {
    const k = clamp((t - 2000) / 500, 0, 1);
    ax = lerp(cx - 48, cx - 95, ease(k));
    bx = lerp(cx + 48, cx + 95, ease(k));
    const up = clamp((t - (end - 2500)) / 1200, 0, 1);
    tiltA = lerp(-1.25 * k, 0, up);
    tiltB = lerp(-1.25 * k, 0, up);
  } else {
    const k = ease(clamp((t - end) / 3500, 0, 1));
    ax = lerp(cx - 95, -220, k);
    bx = lerp(cx + 95, W + 220, k);
  }
  const lying = t >= 2000 && t < end - 1300;
  drawMoto(ax, CRASH_Y + 6, 1, '#e8774a', { tilt: tiltA });
  drawMoto(bx, CRASH_Y + 6, -1, '#4f9de0', { tilt: tiltB });
  // Người lái: ngồi bệt sau cú va, đứng dậy cãi, rồi lên xe đi
  const riding = t < 2000 || t >= end;
  const shake = t > 14500 && t < 16500;
  const sitting = t >= 2000 && t < 5000;
  const spread = shake ? 62 : sitting ? 168 : 132;
  const ra = riding ? { x: ax - 4, y: CRASH_Y - 26 } : { x: cx - spread, y: CRASH_Y + 24 };
  const rb = riding ? { x: bx + 4, y: CRASH_Y - 26 } : { x: cx + spread, y: CRASH_Y + 24 };
  const angry = t >= 5000 && t < 9400;
  drawRider(ra.x, ra.y + (sitting ? 6 : 0), RIDER_A, 1, { legs: !riding, hat: helmet('#e85d5d'), talk: angry, cheer: shake, phase: 1 });
  drawRider(rb.x, rb.y + (sitting ? 6 : 0), RIDER_B, -1, { legs: !riding, hat: helmet('#2f6fb3'), talk: angry, cheer: shake, phase: 3 });
  if (sitting) {
    dizzy(ra.x, ra.y - 110, now);
    dizzy(rb.x, rb.y - 110, now);
  }
  if (angry) {
    text(ctx, '💢', ra.x + 30, ra.y - 120 + Math.sin(now / 120) * 3, { size: 30 });
    text(ctx, '💢', rb.x - 30, rb.y - 120 + Math.cos(now / 120) * 3, { size: 30 });
  }
  if (shake) text(ctx, '🤝', cx, CRASH_Y - 90, { size: 40 });
  // Công an
  let px = null;
  let pBike = null;
  let onBike = true;
  if (t >= 6000 && t < 8500) pBike = lerp(W + 200, cx + 230, ease((t - 6000) / 2500));
  else if (t >= 8500 && t < end + 600) {
    pBike = cx + 230;
    onBike = false;
    px = t < 9500 ? lerp(cx + 190, cx, ease((t - 8500) / 1000)) : t > end - 400 ? lerp(cx, cx + 190, ease((t - (end - 400)) / 1000)) : cx;
  } else if (t >= end + 600) pBike = lerp(cx + 230, W + 240, ease(clamp((t - end - 600) / 3000, 0, 1)));
  if (pBike != null) {
    drawMoto(pBike, CRASH_Y + 10, -1, '#f4f1ea', { police: true, lights: t < end + 600, now });
    if (onBike) drawRider(pBike + 4, CRASH_Y - 22, POLICE, -1, { hat: policeCap, phase: 5 });
  }
  if (px != null) {
    drawRider(px, CRASH_Y + 26, POLICE, -1, { legs: true, hat: policeCap, talk: t > 9500 && t < 17400, phase: 5 });
    if (t > 9600 && t < 15300) {
      // Sổ ghi biên bản
      ctx.fillStyle = '#fffaf0';
      rr(ctx, px - 34, CRASH_Y - 30, 26, 32, 3);
      ctx.fill();
    }
  }
  // RẦM!
  if (t >= 2000 && t < 3400) {
    const k = (t - 2000) / 1400;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.translate(cx, CRASH_Y - 120);
    ctx.scale(1 + k * 0.4, 1 + k * 0.4);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 ? 40 : 90;
      const a = (i / 16) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * r * 1.4, Math.sin(a) * r * 0.8);
    }
    ctx.closePath();
    ctx.fill();
    text(ctx, 'RẦM!', 0, 0, { size: 60, weight: 800, color: '#d7263d', stroke: '#fff', strokeWidth: 8 });
    ctx.restore();
  }
  // Thoại người đi đường
  for (const [from, to, who, lines] of CRASH_TALK) {
    if (t < from || t >= to) continue;
    const pos = who === 'a' ? ra : who === 'b' ? rb : { x: px ?? cx, y: CRASH_Y + 26 };
    const k = Math.min((t - from) / 150, (to - t) / 250, 1);
    speech(ctx, pick(lines, from), pos.x, pos.y - 152, { size: 23, maxWidth: 330, alpha: clamp(k, 0, 1), color: who === 'p' ? '#fff8d6' : '#fff' });
  }
  return true;
}

// ---------- Khách gõ "về": ra đầu hẻm lên xe về; ai đã uống thì công an chặn, đo nồng độ cồn, giữ xe ----------
// Mốc giờ tính từ lúc khách lên xe (u = 0). Máy chủ cho Chú Tư, Cô Ba nói theo đúng các mốc này (src/shop.js goHome).
const HOME_Y = 1576;
// Bảng hướng dẫn comment nằm ngay trên đường: thoại đặt phía trên bảng, tên khách đặt dưới bánh xe cho khỏi bị che.
const HOME_TALK_Y = 1404;
const HOME_TAG_Y = HOME_Y + 66;
const POLICE_B = { skin: '#d9a27a', shirt: '#c9b84a', hair: '#2a2a36', style: 0, glasses: false };
const goers = [];
let goerSide = 1;
const DRUNK_TALK = [
  [600, 2200, 'r', ['Về thôi... hic!', 'Tui tỉnh mà... hic!', 'Chạy chầm chậm thôi... hic!']],
  [2400, 3800, 'a', ['Dừng xe! Kiểm tra nồng độ cồn!']],
  [3900, 5200, 'r', ['Dạ con uống có chút xíu à...', 'Dạ con tỉnh lắm chú ơi...']],
  [6000, 9300, 'b', ['Đã uống thì không lái xe!']],
  [10300, 12000, 'r', ['Huhu... xe của con...', 'Dạ... con đi bộ về...']],
];
const BUSTED = ['Công an kìa!', 'Bị tóm rồi!', 'Ối giời ơi!', 'Uống rồi còn chạy xe!', 'Toang rồi!'];

function startHome(data, now) {
  goerSide = -goerSide;
  goers.push({
    name: data.name,
    look: lookOf(data.look),
    drunk: data.drunk,
    seed: data.look,
    ride: now + homeRideDelay(data.seat.table, data.seat.index),
    bikeX: ENTRANCE.x + goerSide * HOME_BIKE_GAP,
    dir: -goerSide,
    color: SHIRTS[(data.look >> 2) % SHIRTS.length],
    hat: helmet(SHIRTS[(data.look >> 5) % SHIRTS.length]),
    fired: new Set(),
  });
}

function once(g, key, fn) {
  if (g.fired.has(key)) return;
  g.fired.add(key);
  fn();
}

// Đi từ đầu hẻm sang chỗ xe đậu (u < 0). Trả về true nếu đã vẽ.
function drawWalkToBike(g, u) {
  if (u >= 0) return false;
  const k = clamp(1 + u / HOME_TO_BIKE_MS, 0, 1);
  const x = lerp(ENTRANCE.x, g.bikeX - g.dir * 10, k);
  drawMoto(g.bikeX, HOME_Y + 6, g.dir, g.color);
  drawRider(x, HOME_Y + 24, g.look, Math.sign(g.bikeX - ENTRANCE.x), { walk: k * 4, flush: g.drunk ? 0.8 : 0 });
  nameTag(ctx, g.name, x, HOME_TAG_Y, 180);
  return true;
}

function drawSoberGoer(g, u) {
  if (drawWalkToBike(g, u)) return true;
  if (u < 400) {
    drawMoto(g.bikeX, HOME_Y + 6, g.dir, g.color);
    drawRider(g.bikeX - g.dir * 10, HOME_Y + 24, g.look, g.dir, { legs: true, hat: g.hat });
    nameTag(ctx, g.name, g.bikeX, HOME_TAG_Y, 180);
    return true;
  }
  once(g, 'go', () => sound.motorbike(g.dir));
  const s = (u - 400) / 1000;
  const x = g.bikeX + g.dir * (s < 1 ? 240 * s * s : 240 + 480 * (s - 1));
  if (x < -220 || x > W + 220) return false;
  drawMoto(x, HOME_Y + 6, g.dir, g.color);
  drawRider(x - g.dir * 4, HOME_Y - 26, g.look, g.dir, { hat: g.hat });
  nameTag(ctx, g.name, x, HOME_TAG_Y, 180);
  return true;
}

function drawDrunkGoer(g, u, now) {
  if (drawWalkToBike(g, u)) return true;
  const dir = g.dir;
  const stopX = g.bikeX + dir * 180;
  const pStop = stopX + dir * 230;
  const officerX = stopX + dir * 75;
  // Âm thanh và cả quán quay ra hóng
  if (u >= 500) once(g, 'go', () => sound.motorbike(dir));
  if (u >= 1200) once(g, 'siren', () => sound.siren());
  if (u >= 1300)
    once(g, 'busted', () => {
      for (const p of people.values()) {
        if (!p.data.seat || p.walk || Math.random() > 0.5) continue;
        setTimeout(() => {
          const at = performance.now();
          p.ohUntil = at + rand(1200, 2000);
          if (!p.bubble || at > p.bubble.until) p.bubble = { text: BUSTED[Math.floor(Math.random() * BUSTED.length)], until: at + rand(2200, 3200) };
        }, rand(0, 900));
      }
    });
  if (u >= 2400) once(g, 'whistle', () => sound.whistle());
  if (u >= 5000) once(g, 'beep', () => [0, 160, 320].forEach((d) => setTimeout(() => sound.tick(), d)));
  if (u >= 10300) once(g, 'away', () => sound.motorbike(dir));

  // Xe khách: lạng lách rồi bị chặn; sau khi bị giữ thì chú công an thứ hai chạy xe này về phường.
  const awayDist = (t) => (t <= 0 ? 0 : t < 1 ? 200 * t * t : 200 + 420 * (t - 1));
  let bx = g.bikeX;
  let tilt = 0;
  if (u >= 500 && u < 2300) {
    const k = (u - 500) / 1800;
    bx = g.bikeX + dir * 180 * (1 - (1 - k) ** 2);
    tilt = Math.sin(u / 120) * 0.14 * (1 - k * 0.6);
  } else if (u >= 2300) bx = stopX + dir * awayDist((u - 10600) / 1000);
  // Xe công an: hai chú chạy tới ngược chiều, đậu chắn đầu xe.
  let px;
  let pFace = -dir;
  if (u < 1200) px = null;
  else if (u < 3000) px = lerp(dir > 0 ? W + 220 : -220, pStop, ease((u - 1200) / 1800));
  else if (u < 10300) px = pStop;
  else {
    px = pStop + dir * awayDist((u - 10300) / 1000);
    pFace = dir;
  }
  const lights = u >= 1200 && u < 10300;
  if (px != null && Math.abs(px - W / 2) < W / 2 + 260) {
    drawMoto(px, HOME_Y + 10, pFace, '#f4f1ea', { police: true, lights, now });
    if (u < 3000) drawRider(px - pFace * 30, HOME_Y - 22, POLICE_B, pFace, { hat: policeCap, phase: 4 });
    drawRider(px + pFace * 6, HOME_Y - 22, POLICE, pFace, { hat: policeCap, phase: 5 });
  }
  // Chú công an thứ hai: xuống xe, đo nồng độ cồn, khuyên, rồi lên xe khách
  let ob = null;
  if (u >= 3000 && u < 3800) ob = { x: lerp(pStop, officerX, ease((u - 3000) / 800)), walk: (u - 3000) / 200, face: -dir };
  else if (u >= 3800 && u < 9500) ob = { x: officerX, face: -dir, talk: u > 6000 && u < 9300 };
  else if (u >= 9500 && u < 10300) ob = { x: lerp(officerX, stopX + dir * 10, ease((u - 9500) / 800)), walk: (u - 9500) / 200, face: -dir };
  const bikeVisible = Math.abs(bx - W / 2) < W / 2 + 260;
  if (bikeVisible) drawMoto(bx, HOME_Y + 6, dir, g.color, { tilt });
  if (ob) drawRider(ob.x, HOME_Y + 26, POLICE_B, ob.face, ob.walk != null ? { walk: ob.walk, hat: policeCap } : { legs: true, hat: policeCap, talk: ob.talk, phase: 4 });
  if (u >= 10300 && bikeVisible) drawRider(bx - dir * 4, HOME_Y - 26, POLICE_B, dir, { hat: policeCap, phase: 4 });
  if (u >= 7000 && bikeVisible) {
    // Biển tạm giữ xe
    const tx = bx - dir * 34;
    ctx.fillStyle = '#c0261f';
    rr(ctx, tx - 46, HOME_Y - 6, 92, 28, 6);
    ctx.fill();
    text(ctx, 'TẠM GIỮ', tx, HOME_Y + 9, { size: 18, weight: 800, color: '#fff' });
  }
  // Khách: ngồi trên xe tới lúc bị giữ, xuống xe đứng tiếc, rồi lủi thủi đi bộ về
  const flush = 0.9;
  let r;
  if (u < 9500) r = { x: bx - dir * 4, y: HOME_Y - 26, opts: { hat: g.hat, flush, sick: u > 2300 && u < 3000 ? 0.3 : 0 } };
  else if (u < 12000) r = { x: stopX - dir * 70, y: HOME_Y + 26, opts: { legs: true, flush, talk: u > 10300 && u < 12000 } };
  else {
    const x = stopX - dir * 70 - dir * 160 * ((u - 12000) / 1000);
    if (x < -120 || x > W + 120) return Math.abs(px - W / 2) < W / 2 + 260;
    r = { x, y: HOME_Y + 26, face: -dir, opts: { walk: (u - 12000) / 220, flush } };
  }
  drawRider(r.x, r.y, g.look, r.face ?? dir, r.opts);
  nameTag(ctx, g.name, r.x, HOME_TAG_Y, 180);
  // Máy đo nồng độ cồn
  if (u >= 3800 && u < 6400) {
    const dx = stopX + dir * 34;
    const dy = HOME_Y - 14;
    ctx.fillStyle = '#2b2f36';
    rr(ctx, dx - 11, dy - 22, 22, 40, 5);
    ctx.fill();
    const alarm = u >= 5000;
    ctx.fillStyle = alarm ? (Math.floor(now / 140) % 2 ? '#ff3b3b' : '#7a1f1f') : '#7fd17f';
    rr(ctx, dx - 7, dy - 16, 14, 12, 3);
    ctx.fill();
    if (u >= 4200 && u < 5000) text(ctx, 'phù...', r.x + dir * 44, HOME_Y - 44, { size: 20, color: '#dff3ff', stroke: '#1d3557', strokeWidth: 4 });
    if (alarm) {
      const k = clamp((u - 5000) / 400, 0, 1);
      text(ctx, 'CÓ CỒN!', dx, dy - 50 - k * 6, { size: 30, weight: 800, color: '#ff3b3b', stroke: '#fff', strokeWidth: 6 });
    }
  }
  // Thoại
  for (const [from, to, who, lines] of DRUNK_TALK) {
    if (u < from || u >= to) continue;
    const pos = { x: who === 'r' ? r.x : who === 'a' ? px : officerX, y: HOME_TALK_Y };
    const k = Math.min((u - from) / 150, (to - u) / 250, 1);
    const police = who !== 'r';
    speech(ctx, lines[(g.seed + from) % lines.length], pos.x, pos.y, { size: who === 'b' ? 27 : 23, maxWidth: 360, alpha: clamp(k, 0, 1), color: police ? '#fff8d6' : '#fff', who: police ? 'Chú công an' : undefined });
  }
  return true;
}

function drawGoers(now) {
  for (let i = goers.length - 1; i >= 0; i--) {
    const g = goers[i];
    const u = now - g.ride;
    if (u < -HOME_TO_BIKE_MS) continue; // Còn đang đi trong quán (vẽ như khách ra về).
    if (!(g.drunk ? drawDrunkGoer(g, u, now) : drawSoberGoer(g, u))) goers.splice(i, 1);
  }
}

// ---------- Dì Năm bán hàng rong: gánh hàng đi từng bàn mời khách, khách mua hay từ chối tùy người ----------
// Máy chủ tính sẵn lộ trình (frames) và lời qua lại ở mỗi bàn (stops); mốc giờ trong một bàn tính từ lúc dì đứng lại.
const VENDOR_LOOK = { skin: '#d9a27a', shirt: '#7b4fa0', hair: '#2a1d17', style: 1, glasses: false };
const vendorFired = new Set();

function khanRan(c, hy) {
  c.save();
  c.beginPath();
  c.arc(0, hy - 2, 31, Math.PI * 0.95, Math.PI * 2.05);
  c.closePath();
  c.clip();
  c.fillStyle = '#f4f1ea';
  c.fillRect(-32, hy - 36, 64, 36);
  c.fillStyle = '#2a2a36';
  for (let i = -4; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) c.fillRect(i * 8, hy - 34 + j * 8, 8, 8);
  c.restore();
}

// Bong bóng của người đứng nói chuyện với khách: đẩy ra phía ngoài khách để không đè lên mặt khách.
const awayFrom = (x, tb, seat) => (Math.sign(x - seat.x) || Math.sign(seat.x - tb.x) || 1) * 150;

function vendorAt(v, s) {
  const f = v.frames;
  if (s <= f[0].t) return { x: f[0].x, y: f[0].y, walk: null };
  for (let i = 1; i < f.length; i++) {
    if (s >= f[i].t) continue;
    const a = f[i - 1];
    const b = f[i];
    const k = (s - a.t) / (b.t - a.t);
    const moving = a.x !== b.x || a.y !== b.y;
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), walk: moving ? s / 260 : null };
  }
  const last = f.at(-1);
  return { x: last.x, y: last.y, walk: null };
}

// Vị trí, câu đang nói của dì; đồng thời cho khách đáp lời đúng lúc (mỗi bàn một lần).
function vendorState(now) {
  const v = state?.ambient?.vendor;
  if (!v) return null;
  const s = serverNow();
  const pos = vendorAt(v, s);
  let say = null;
  if (s - v.startAt < 4500) say = { text: v.call, from: v.startAt + 1800, to: v.startAt + 4500 };
  v.stops.forEach((stop, i) => {
    const u = s - stop.at;
    // Bong bóng của dì đẩy ra phía ngoài khách để không đè lên mặt khách.
    const tb = tableById(stop.table);
    const away = { dx: awayFrom(pos.x, tb, tb.seats[stop.index]) };
    if (u >= 200 && u < 2600) say = { text: stop.ask, from: stop.at + 200, to: stop.at + 2600, ...away };
    if (u >= 4400 && u < 6000) say = { text: stop.after, from: stop.at + 4400, to: stop.at + 6000, ...away };
    const key = `${v.startAt}:${i}`;
    if (u >= 2500 && u < 4500 && !vendorFired.has(key)) {
      vendorFired.add(key);
      if (vendorFired.size > 200) vendorFired.delete(vendorFired.values().next().value);
      const p = people.get(stop.id);
      // Khách đã về hoặc đổi bàn thì thôi, dì vẫn đứng mời rồi đi tiếp.
      if (!p || p.data.seat?.table !== stop.table || p.data.seat.index !== stop.index) return;
      p.bubble = { text: stop.reply, until: now + Math.max(1200, 4300 - u) };
      if (!stop.buy) return;
      p.deliverAt = now;
      [0, 140].forEach((d) => setTimeout(() => sound.tick(), d));
      const seat = tableById(stop.table).seats[stop.index];
      floaters.push({ text: `+${stop.qty} ${v.product.unit} ${v.product.name}`, x: seat.item.x, y: seat.item.y - 50, age: 0 });
    }
  });
  return { ...pos, say, product: v.product, s };
}

function drawVendor(vd, now) {
  const { x, y } = vd;
  const bob = vd.walk != null ? Math.sin(vd.walk * Math.PI * 2) * 3 : 0;
  drawPerson(ctx, x, y, VENDOR_LOOK, { walk: vd.walk, legs: vd.walk == null, hat: khanRan, talk: Boolean(vd.say), phase: 6 });
  // Đòn gánh trên vai, hai thúng hàng hai bên
  const py = y - 56;
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 92, py + 4 + bob);
  ctx.quadraticCurveTo(x, py - 6, x + 92, py + 4 - bob);
  ctx.stroke();
  for (const side of [-1, 1]) {
    const bx = x + side * 86;
    const by = y - 6 + side * bob;
    ctx.strokeStyle = 'rgba(60,40,20,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, py + 4);
    ctx.lineTo(bx - 20, by - 18);
    ctx.moveTo(bx, py + 4);
    ctx.lineTo(bx + 20, by - 18);
    ctx.stroke();
    ctx.fillStyle = vd.product.color ?? '#efe6d2';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(bx + i * 11, by - 20 - (i === 0 ? 5 : 0), 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#c99a52';
    ctx.beginPath();
    ctx.moveTo(bx - 26, by - 20);
    ctx.lineTo(bx + 26, by - 20);
    ctx.lineTo(bx + 18, by + 8);
    ctx.lineTo(bx - 18, by + 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,30,0.6)';
    ctx.lineWidth = 2;
    for (const k of [-6, 2]) {
      ctx.beginPath();
      ctx.moveTo(bx - 24, by + k);
      ctx.lineTo(bx + 24, by + k);
      ctx.stroke();
    }
  }
}

function drawVendorSpeech(vd) {
  if (!vd?.say) return;
  const k = Math.min((vd.s - vd.say.from) / 150, (vd.say.to - vd.s) / 250, 1);
  speech(ctx, vd.say.text, vd.x + (vd.say.dx ?? 0), vd.y - 150, { who: 'Dì Năm', maxWidth: 360, alpha: clamp(k, 0, 1) });
}

// ---------- Một, hai, ba, dô! ----------
let toastUntil = 0;

function startCheers(now) {
  toastUntil = now + 5800;
  cheerUntil = Math.max(cheerUntil, now + 5800);
  ['MỘT!', 'HAI!', 'BA!'].forEach((word, i) =>
    setTimeout(() => {
      flashes.push({ text: word, sub: '', born: performance.now(), color: '#ffffff', small: true, life: 620 });
      sound.tick();
    }, i * 650),
  );
  setTimeout(() => {
    flashes.push({ text: 'DÔ!!!', sub: '🍻 🍻 🍻', born: performance.now(), color: '#ffd166' });
    sound.cheer(1.4);
    for (let i = 0; i < 6; i++) setTimeout(() => sound.clink(), i * 80);
    for (const t of TABLES) {
      if ([...people.values()].some((p) => p.data.seat?.table === t.id)) burst(t.x, t.y - 90, 16, ['#fffbe6', '#ffe08a', '#ffffff', '#f5b93c']);
    }
  }, 1950);
}

function drawMug(c, x, y) {
  c.fillStyle = 'rgba(245,185,60,0.95)';
  rr(c, x - 9, y - 12, 18, 24, 4);
  c.fill();
  c.fillStyle = '#fffbe6';
  c.beginPath();
  c.arc(x - 5, y - 13, 6, 0, Math.PI * 2);
  c.arc(x + 4, y - 14, 7, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x - 4, y - 6);
  c.lineTo(x - 4, y + 8);
  c.stroke();
}

// Lúc đang gom tiếng "dô" thì thanh đếm thay chỗ bảng hướng dẫn (đã có sẵn lời nhắc comment "dô").
function drawToastMeter() {
  const r = state?.ambient?.toast;
  if (!r || r.phase !== 'open') return false;
  const left = Math.max(0, Math.ceil((r.endAt - serverNow()) / 1000));
  const w = 760;
  const x = 540 - w / 2;
  const top = 1404;
  ctx.fillStyle = 'rgba(25,16,30,0.9)';
  rr(ctx, x, top, w, 96, 24);
  ctx.fill();
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 3;
  ctx.stroke();
  text(ctx, `🍻 Comment “dô” để cả quán cụng ly!  ⏱ ${left}s`, 540, top + 27, { size: 26, color: '#ffd166' });
  const bx = x + 30;
  const bw = w - 60;
  const by = top + 52;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  rr(ctx, bx, by, bw, 28, 14);
  ctx.fill();
  const k = clamp(r.count / r.need, 0, 1);
  if (k > 0) {
    ctx.fillStyle = '#f5b93c';
    rr(ctx, bx, by, Math.max(28, bw * k), 28, 14);
    ctx.fill();
  }
  ctx.font = `700 19px ${FONT}`;
  const label = fitText(ctx, `${r.count}/${r.need}${r.names.length ? `  ·  ${r.names.join(', ')}` : ''}`, bw - 30);
  text(ctx, label, 540, by + 15, { size: 19, color: '#fff' });
  return true;
}

// ---------- Vợ tới kiếm ----------
const WIFE_LOOK = { skin: '#eec29f', shirt: '#e86fb0', hair: '#1d1816', style: 2, glasses: false };
const wifeFired = new Set();
const OOPS = ['Ối...', 'Chết rồi!', 'Toang!', 'Ui...', 'Im im!'];
const LAUGH = ['Hahaha!', 'Há há há!', 'Tội ghê!', 'Về đi, về đi!'];

function crowdSay(list, filter, chance) {
  for (const p of people.values()) {
    if (!p.data.seat || p.walk || (filter && !filter(p)) || Math.random() > chance) continue;
    setTimeout(() => {
      const at = performance.now();
      if (!p.bubble || at > p.bubble.until) p.bubble = { text: list[Math.floor(Math.random() * list.length)], until: at + 2400 };
    }, rand(0, 700));
  }
}

function wifeOnce(w, key, fn) {
  const k = `${w.startAt}:${key}`;
  if (wifeFired.has(k)) return;
  wifeFired.add(k);
  if (wifeFired.size > 100) wifeFired.delete(wifeFired.values().next().value);
  fn();
}

function wifeState() {
  const w = state?.ambient?.wife;
  if (!w) return null;
  const s = serverNow();
  const pos = vendorAt(w, s);
  const u = s - w.arriveAt;
  const seat = tableById(w.table).seats[w.index];
  const dx = awayFrom(pos.x, tableById(w.table), seat);
  let say = null;
  if (u >= 200 && u < 2600) say = { text: w.scold, from: w.arriveAt + 200, to: w.arriveAt + 2600, dx };
  if (u >= 4400 && u < 6800) say = { text: w.verdict, from: w.arriveAt + 4400, to: w.arriveAt + 6800, dx };
  if (u >= 500) wifeOnce(w, 'oops', () => crowdSay(OOPS, (p) => p.id !== w.id, 0.5));
  if (u >= 2400) {
    wifeOnce(w, 'plead', () => {
      const p = people.get(w.id);
      if (p) p.bubble = { text: w.plead, until: performance.now() + 1900 };
    });
  }
  if (w.spare && u >= 6900) {
    wifeOnce(w, 'spare', () => {
      const p = people.get(w.id);
      if (p) p.bubble = { text: 'Dạ dạ, ly cuối thôi!', until: performance.now() + 2200 };
    });
  }
  if (w.saved && u >= 6700) {
    wifeOnce(w, 'saved', () => {
      const p = people.get(w.id);
      if (p) p.bubble = { text: 'Món mới gọi tới rồi, ăn xong về liền!', until: performance.now() + 2600 };
    });
  }
  const dragging = w.dragged && s >= w.dragAt;
  let victim = null;
  if (dragging) {
    wifeOnce(w, 'laugh', () => {
      sound.whoosh();
      crowdSay(LAUGH, null, 0.6);
    });
    const back = vendorAt(w, s - 450);
    const k = clamp((s - w.dragAt) / 500, 0, 1);
    victim = { x: lerp(seat.x, back.x, k), y: lerp(seat.y, back.y + 6, k), walk: s / 200 };
  }
  return { ...pos, say, s, u, w, victim, scolding: u >= 0 && u < 6800 };
}

function drawWife(wd, now) {
  const { x, y } = wd;
  drawPerson(ctx, x, y, WIFE_LOOK, { walk: wd.walk, legs: wd.walk == null, talk: Boolean(wd.say), phase: 7 });
  // Đồ bộ hoa
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [fx, fy] of [[-14, -42], [10, -30], [-6, -16], [16, -48], [-18, -22]]) {
    ctx.beginPath();
    ctx.arc(x + fx, y + fy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (wd.scolding) {
    // Tay giơ chiếc dép lên réo
    const wave = Math.sin(now / 110) * 0.5;
    ctx.strokeStyle = WIFE_LOOK.shirt;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 26, y - 44);
    ctx.lineTo(x + 38, y - 96);
    ctx.stroke();
    ctx.save();
    ctx.translate(x + 40, y - 104);
    ctx.rotate(-0.4 + wave);
    ctx.fillStyle = '#ff7eb3';
    ctx.beginPath();
    ctx.ellipse(0, -14, 9, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2f6fb3';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -18, 8, Math.PI, 0);
    ctx.stroke();
    ctx.restore();
  }
  if (wd.victim) {
    // Nắm tai lôi về
    const v = wd.victim;
    ctx.strokeStyle = WIFE_LOOK.skin;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y - 50);
    ctx.lineTo(v.x + Math.sign(x - v.x || 1) * 26, v.y - 84);
    ctx.stroke();
  }
}

function drawVictim(wd) {
  const v = wd.victim;
  drawPerson(ctx, v.x, v.y, lookOf(wd.w.look), { walk: v.walk, flush: 0.45 });
  text(ctx, '💢', v.x + 30, v.y - 118, { size: 24 });
}

function drawWifeSpeech(wd) {
  if (!wd) return;
  if (wd.say) {
    const k = Math.min((wd.s - wd.say.from) / 150, (wd.say.to - wd.s) / 250, 1);
    speech(ctx, wd.say.text, wd.x + wd.say.dx, wd.y - 150, { who: `Vợ ${wd.w.name}`, maxWidth: 360, alpha: clamp(k, 0, 1), color: '#ffe3f0' });
  }
  if (wd.victim) {
    const v = wd.victim;
    nameTag(ctx, wd.w.name, v.x, v.y - 132, 180);
    const t = wd.s - wd.w.dragAt;
    if (t < 2600) speech(ctx, 'Á á á! Đau đau!', v.x, v.y - 152, { maxWidth: 260, size: 21, alpha: clamp((2600 - t) / 300, 0, 1) });
  }
}

// ---------- Cúp điện ----------
let darkCanvas = null;
const blackoutFired = new Set();
const POWER_OFF = ['Ơ!', 'Cúp điện rồi!', 'Tối thui!', 'Ủa ủa?', 'Ai tắt đèn vậy?'];
const POWER_ON = ['Có điện rồi!', 'Yeah!', 'Sáng rồi!'];

// Độ tối 0..1: chập chờn lúc cúp, tối hẳn, chập chờn lúc có điện lại.
function blackoutLevel(t, T) {
  if (t < 0 || t >= T) return 0;
  if (t < 700) return [0.2, 1, 0.35, 1][Math.floor(t / 175)];
  if (t > T - 900) return [0.2, 1, 0.3, 0][Math.min(3, Math.floor((t - (T - 900)) / 225))];
  return 1;
}

function drawBlackout(now, ti) {
  const b = state?.ambient?.blackout;
  if (!b) return;
  const t = serverNow() - b.startAt;
  const T = b.endAt - b.startAt;
  if (!blackoutFired.has(`${b.startAt}:off`) && t < 3000) {
    blackoutFired.add(`${b.startAt}:off`);
    sound.powerOff();
    crowdSay(POWER_OFF, null, 0.7);
  }
  if (!blackoutFired.has(`${b.startAt}:on`) && t > T - 400 && t < T + 2000) {
    blackoutFired.add(`${b.startAt}:on`);
    cheerUntil = Math.max(cheerUntil, now + 1800);
    crowdSay(POWER_ON, null, 0.6);
  }
  const level = blackoutLevel(t, T);
  if (level <= 0) return;
  if (!darkCanvas) {
    darkCanvas = document.createElement('canvas');
    darkCanvas.width = W;
    darkCanvas.height = H;
  }
  const d = darkCanvas.getContext('2d');
  d.globalCompositeOperation = 'source-over';
  d.clearRect(0, 0, W, H);
  d.fillStyle = `rgba(6,8,22,${0.86 * level})`;
  d.fillRect(0, 0, W, H);
  d.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, a = 1) => {
    const g = d.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g;
    d.fillRect(x - r, y - r, r * 2, r * 2);
  };
  // Đèn đường ngoài hẻm vẫn sáng mờ
  hole(540, 1640, 420, 0.55);
  // Cô Ba thắp đèn cầy trên quầy
  const candle = t > 4000;
  if (candle) hole(232, 462, 200 + Math.sin(now / 90) * 10, 0.9);
  // Khách bật đèn điện thoại
  const phones = [];
  if (t > 2500) {
    for (const p of people.values()) {
      if (p.data.look % 3 !== 0) continue;
      const pos = personPosition(p);
      if (!pos || pos.walking != null) continue;
      phones.push(pos);
      hole(pos.x + 18, pos.y - 80, 95, 0.7);
    }
  }
  // Tí soi đèn pin quét quanh quán
  let beam = null;
  if (t > 1600) {
    const a = Math.PI / 2 + Math.sin(now / 650) * 0.95;
    const ox = ti.x + 22;
    const oy = ti.y - 62;
    beam = { ox, oy };
    const len = 560;
    const g = d.createRadialGradient(ox, oy, 10, ox, oy, len);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g;
    d.beginPath();
    d.moveTo(ox, oy);
    d.lineTo(ox + Math.cos(a - 0.3) * len, oy + Math.sin(a - 0.3) * len);
    d.lineTo(ox + Math.cos(a + 0.3) * len, oy + Math.sin(a + 0.3) * len);
    d.closePath();
    d.fill();
    hole(ox, oy, 60, 0.9);
  }
  d.globalCompositeOperation = 'source-over';
  ctx.drawImage(darkCanvas, 0, 0);
  // Nguồn sáng vẽ đè lên cho thấy rõ
  if (candle) {
    ctx.fillStyle = '#f4f1ea';
    rr(ctx, 224, 446, 16, 34, 4);
    ctx.fill();
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.ellipse(232, 438 + Math.sin(now / 70) * 1.5, 6, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.ellipse(232, 441, 3, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#eaf6ff';
  for (const pos of phones) {
    rr(ctx, pos.x + 12, pos.y - 90, 12, 18, 3);
    ctx.fill();
  }
  if (beam) {
    ctx.fillStyle = '#fffbe0';
    ctx.beginPath();
    ctx.arc(beam.ox, beam.oy, 7, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------- Animation nhỏ ----------
// Tí trượt chân khi bưng món tới bàn có vũng nôn chưa lau xong (sàn còn ướt, kể cả lúc cô lao công đang lau).
let slip = null;
const slipped = new Set();
function checkSlip(ti, now) {
  const r = ti.r;
  if (ti.carrying && r && !slipped.has(r.startAt)) {
    const last = r.points.at(-1);
    if (Math.hypot(ti.x - last.x, ti.y - last.y) < 170 && puddles.some((pd) => pd.table === r.table && pd.clean < 1)) {
      slipped.add(r.startAt);
      if (slipped.size > 50) slipped.delete(slipped.values().next().value);
      slip = { start: now };
      bubbles.ti.push({ text: 'Oái oái oái!', dur: 1800 });
      sound.whoosh();
      for (let i = 0; i < 8; i++) particles.push({ kind: 'dust', x: ti.x + rand(-20, 20), y: ti.y + 28, vx: rand(-90, 90), vy: rand(-60, -20), life: 0.7, age: 0, size: rand(6, 10) });
    }
  }
  if (!slip) return 0;
  const k = (now - slip.start) / 1100;
  if (k >= 1) {
    slip = null;
    return 0;
  }
  return Math.sin(k * Math.PI * 4) * 0.32 * (1 - k);
}

// Quán đông mà Tí đang rảnh: có khách mới thì Tí bưng chồng ghế nhựa ra bàn đó.
let stoolRun = null;
function startStoolRun(tableId, now) {
  if (stoolRun || !state || state.runner || state.customers.length < 12) return;
  stoolRun = { start: now, points: runnerPath(tableId), said: false };
}

function stoolTrip(base, now) {
  if (!stoolRun) return base;
  if (!base.idle) {
    stoolRun = null;
    return base;
  }
  const len = pathLength(stoolRun.points);
  const out = len / 0.52;
  const t = now - stoolRun.start;
  if (t < out) {
    const d = (t / out) * len;
    const pt = pointAt(stoolRun.points, d);
    return { x: pt.x, y: pt.y, walk: d / 70, stools: true, idle: true };
  }
  if (t < out + 700) {
    if (!stoolRun.said) {
      stoolRun.said = true;
      bubbles.ti.push({ text: 'Thêm ghế nè!', dur: 1800 });
    }
    const last = stoolRun.points.at(-1);
    return { x: last.x, y: last.y, idle: true };
  }
  const k = (t - out - 700) / out;
  if (k >= 1) {
    stoolRun = null;
    return base;
  }
  const back = [...stoolRun.points].reverse();
  const pt = pointAt(back, k * len);
  return { x: pt.x, y: pt.y, walk: (k * len) / 70, idle: true };
}

function drawStoolStack(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(0.95, 0.95);
  ['#d9433b', '#2f7fd1', '#d9433b'].forEach((color, i) => drawStool(ctx, 0, -i * 14, color));
  ctx.restore();
}

// Đông khách thì Tí đổ mồ hôi, thỉnh thoảng Cô Ba hối.
let nextHurry = 0;
const HURRY = ['Lẹ lên Tí ơi!', 'Tí ơi khách chờ kìa con!', 'Chạy lẹ lên con!'];
function hurryUp(busy, now) {
  if (!busy || now < nextHurry || bubbles.coba.length) return;
  nextHurry = now + 25_000;
  bubbles.coba.push({ text: HURRY[Math.floor(Math.random() * HURRY.length)], dur: 2400 });
}

function drawSweat(x, y, now) {
  ctx.fillStyle = 'rgba(140,200,255,0.9)';
  for (let i = 0; i < 2; i++) {
    const k = (now / 500 + i * 0.5) % 1;
    const sx = x + (i ? 30 : -30);
    const sy = y - 104 + k * 26;
    ctx.globalAlpha = 1 - k;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 8);
    ctx.quadraticCurveTo(sx + 6, sy + 2, sx, sy + 4);
    ctx.quadraticCurveTo(sx - 6, sy + 2, sx, sy - 8);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Lá rơi lác đác từ hai tán cây phía trên.
const leaves = [];
function drawLeaves(dt, now) {
  if (leaves.length < 7 && Math.random() < dt / 2800) {
    const left = Math.random() < 0.5;
    leaves.push({ x: left ? rand(10, 260) : rand(820, 1070), y: rand(10, 70), vy: rand(35, 60), sway: rand(0, 6), age: 0, life: rand(8, 11), color: ['#6fa84f', '#9cbf3e', '#d9b44a', '#c97b3a'][Math.floor(Math.random() * 4)] });
  }
  const s = dt / 1000;
  for (let i = leaves.length - 1; i >= 0; i--) {
    const l = leaves[i];
    l.age += s;
    l.y += l.vy * s;
    const x = l.x + Math.sin(l.age * 1.6 + l.sway) * 26;
    if (l.age > l.life || l.y > 760) {
      leaves.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = clamp((l.life - l.age) / 1.5, 0, 0.9);
    ctx.translate(x, l.y);
    ctx.rotate(Math.sin(l.age * 2 + l.sway) * 0.9);
    ctx.fillStyle = l.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Bếp than bùng lửa khi có người gọi mực nướng.
let flameUntil = 0;

function markActive(id, now) {
  const p = people.get(id);
  if (p) p.lastChat = now;
}

// ---------- Camera: zoom vào khách vừa tặng quà gọi món ----------
const CAM_ZOOM = 1.75;
const CAM_ANCHOR = { x: 540, y: 900 };
const cam = { k: 0, x: 540, y: 960 };
const focusQueue = [];
let focus = null;

function orderLabel(d) {
  let label = `${d.qty} ${d.unit} ${d.itemName}`;
  if (d.side) label += ` + ${d.side} đĩa đậu phộng`;
  if (d.large) label += ' (phần lớn)';
  return label;
}

function queueFocus(d) {
  // Khách đang chờ ghế chưa có chỗ để zoom vào.
  if (!d.table) return;
  const label = orderLabel(d);
  const now = performance.now();
  if (focus?.id === d.customerId) {
    // Cùng người tặng tiếp: giữ camera thêm, nhưng không quá 12 giây cho một người.
    focus.label = label;
    focus.start = now;
    focus.limit = Math.min(12_000, focus.t + 6000);
    return;
  }
  const queued = focusQueue.find((f) => f.id === d.customerId);
  if (queued) queued.label = label;
  else if (focusQueue.length < 6) focusQueue.push({ id: d.customerId, name: d.name, label });
}

function updateCamera(now, dt) {
  const paused = Boolean(wheelView);
  if (!focus && focusQueue.length && !paused) focus = { ...focusQueue.shift(), start: now, t: 0, limit: 9000 };
  let target = null;
  if (focus) {
    const p = people.get(focus.id);
    const pos = p && personPosition(p);
    if (!pos) {
      // Khách vừa được tự đón vào có thể chưa kịp có trong trạng thái: chờ một chút.
      focus.t += dt;
      if (p || focus.t > 2500) focus = null;
    } else {
      if (!paused) focus.t += dt;
      const busy = focusQueue.length > 0;
      const served = p.deliverAt > focus.start;
      const limit = busy ? Math.min(focus.limit, 4500) : focus.limit;
      // Giữ tới khi Tí đặt món xuống bàn rồi thêm chút cho khách vui.
      if (focus.t >= limit || (focus.t >= (busy ? 2500 : 3500) && served && now - p.deliverAt > 1800)) focus = null;
      else target = { x: pos.x, y: pos.y - 70 };
    }
  }
  cam.k = clamp(cam.k + ((target && !paused ? 1 : -1) * dt) / 650, 0, 1);
  if (target) {
    if (cam.k < 0.05) {
      cam.x = target.x;
      cam.y = target.y;
    } else {
      const r = Math.min(1, dt / 260);
      cam.x = lerp(cam.x, target.x, r);
      cam.y = lerp(cam.y, target.y, r);
    }
    cam.target = target;
  }
  const e = cam.k * cam.k * (3 - 2 * cam.k);
  const zoom = 1 + (CAM_ZOOM - 1) * e;
  const tx = clamp(CAM_ANCHOR.x - cam.x * zoom, W - W * zoom, 0);
  const ty = clamp(CAM_ANCHOR.y - cam.y * zoom, H - H * zoom, 0);
  return { zoom, tx, ty, e, target: cam.target };
}

function drawSpotlight(target, e, now) {
  const r = 150 + Math.sin(now / 300) * 8;
  const g = ctx.createRadialGradient(target.x, target.y, 10, target.x, target.y, r);
  g.addColorStop(0, `rgba(255,220,130,${0.55 * e})`);
  g.addColorStop(1, 'rgba(255,220,130,0)');
  ctx.fillStyle = g;
  ctx.fillRect(target.x - r, target.y - r, r * 2, r * 2);
}

function drawFocusOverlay(e, now) {
  // Viền tối để mắt dồn vào khách
  const g = ctx.createRadialGradient(540, CAM_ANCHOR.y, 380, 540, CAM_ANCHOR.y, 1150);
  g.addColorStop(0, 'rgba(10,6,20,0)');
  g.addColorStop(1, `rgba(10,6,20,${0.5 * e})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = e;
  // Ưu đãi vẫn hiện khi đang zoom
  const promo = state.promo;
  if (promo && serverNow() < promo.endAt) {
    const remain = Math.max(0, Math.ceil((promo.endAt - serverNow()) / 1000));
    const label = `${promo.short} · ${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, '0')}`;
    ctx.font = `800 34px ${FONT}`;
    const w = ctx.measureText(label).width + 48;
    ctx.fillStyle = '#c51f36';
    rr(ctx, 540 - w / 2, 190, w, 58, 29);
    ctx.fill();
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 4;
    ctx.stroke();
    text(ctx, label, 540, 220, { size: 34, weight: 800, color: '#fff' });
  }
  // Chú thích: ai gọi món gì
  if (focus) {
    const y = 1330;
    const name = focus.name;
    ctx.font = `800 40px ${FONT}`;
    const nameW = Math.min(ctx.measureText(name).width, 600);
    ctx.font = `700 30px ${FONT}`;
    const lineW = Math.min(ctx.measureText(`gọi ${focus.label}`).width, 900);
    const w = Math.max(nameW, lineW) + 70;
    const bob = Math.sin(now / 350) * 3;
    ctx.fillStyle = 'rgba(122,31,31,0.94)';
    rr(ctx, 540 - w / 2, y - 52 + bob, w, 110, 26);
    ctx.fill();
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 4;
    ctx.stroke();
    text(ctx, `🎁 ${name}`, 540, y - 18 + bob, { size: 40, weight: 800, color: '#ffe8a3', maxWidth: 640 });
    text(ctx, `gọi ${focus.label}`, 540, y + 28 + bob, { size: 30, color: '#fff', maxWidth: 940 });
  }
  ctx.restore();
}

// ---------- Vòng lặp vẽ ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(100, now - last);
  last = now;
  if (!state) {
    ctx.drawImage(bg, 0, 0);
    text(ctx, 'Đang mở quán...', 540, 960, { size: 48, color: '#fff' });
    requestAnimationFrame(frame);
    return;
  }
  // Cảnh quán vẽ qua camera; bảng ưu đãi, phiếu order, vòng quay vẽ cố định trên màn hình.
  const view = updateCamera(now, dt);
  ctx.save();
  ctx.setTransform(view.zoom, 0, 0, view.zoom, view.tx, view.ty);
  ctx.drawImage(bg, 0, 0);
  drawLights(now);
  drawLeaves(dt, now);
  drawFan(now);
  drawSmoke(dt, now);
  drawTarp();
  drawMenu(now);
  drawTV(now);
  if (!drawEventBoard(now)) {
    // Bảng hiệu nằm trong nền; không có sự kiện thì để nguyên.
  }
  // Kitchen bell
  ctx.fillStyle = '#f2c14e';
  ctx.beginPath();
  ctx.arc(398, 506, 12, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(384, 504, 28, 5);

  const sNow = serverNow();
  const cheering = now < cheerUntil;
  const karaoke = Boolean(state.ambient.karaoke);

  // Danh sách vật thể cần vẽ theo chiều sâu
  const drawables = [];
  for (const t of TABLES) drawables.push({ y: t.y, draw: () => drawTable(t), after: () => drawTableContents(t, now) });

  // Cô Ba
  const front = now < coBaFront;
  const baTarget = front ? { x: STAGE_FRONT.x + 150, y: STAGE_FRONT.y + 40 } : { x: 340, y: 500 };
  drawBa.x = lerp(drawBa.x ?? baTarget.x, baTarget.x, Math.min(1, dt / 350));
  drawBa.y = lerp(drawBa.y ?? baTarget.y, baTarget.y, Math.min(1, dt / 350));
  const baWalking = Math.hypot(baTarget.x - drawBa.x, baTarget.y - drawBa.y) > 6;
  drawables.push({
    y: drawBa.y < 560 ? 0 : drawBa.y,
    draw: () =>
      drawPerson(ctx, drawBa.x, drawBa.y, BA_LOOK, {
        apron: true,
        walk: baWalking ? now / 300 : null,
        legs: !baWalking && drawBa.y > 560,
        talk: bubbles.coba.length > 0,
        cheer: cheering && drawBa.y > 560,
        scale: 1.08,
      }),
  });
  // Chú Tư ngồi dưới tivi
  drawables.push({
    y: 600,
    draw: () => {
      drawStool(ctx, 1010, 606, '#2f7fd1');
      drawPerson(ctx, 1010, 600, TU_LOOK, { legs: true, cheer: cheering && state.stage?.kind === 'match', talk: bubbles.chutu.length > 0, phase: 2 });
    },
  });
  // Tí
  const ti = stoolTrip(runnerState(sNow), now);
  const slipAngle = checkSlip(ti, now);
  const busy = (state.queueLength ?? 0) >= 3 && !ti.idle;
  hurryUp(busy, now);
  drawables.push({
    y: ti.y,
    draw: () => {
      const stop = cheering && state.stage?.kind === 'match';
      ctx.save();
      if (slipAngle) {
        ctx.translate(ti.x, ti.y + 28);
        ctx.rotate(slipAngle);
        ctx.translate(-ti.x, -ti.y - 28);
      }
      drawPerson(ctx, ti.x, ti.y, TI_LOOK, { apron: true, walk: ti.walk != null && !stop ? ti.walk : null, legs: ti.walk == null || stop, tray: ti.carrying || ti.stools, talk: bubbles.ti.length > 0, phase: 1 });
      if (ti.carrying) drawTray(ctx, ti.x, ti.y - 60, ti.r);
      if (ti.stools) drawStoolStack(ti.x, ti.y - 160);
      ctx.restore();
      if (busy) drawSweat(ti.x, ti.y, now);
      if (stop) text(ctx, '!', ti.x + 30, ti.y - 130, { size: 40, color: '#ffd166', stroke: '#3b1d0e', strokeWidth: 6 });
    },
  });
  drawTi.x = ti.x;
  drawTi.y = ti.y;
  // Khách đang ngồi / đi vào
  const tagQueue = [];
  for (const p of people.values()) {
    const pos = personPosition(p);
    if (!pos) continue;
    const look = lookOf(p.data.look);
    const seat = pos.seat;
    const walking = pos.walking != null;
    const phase = (p.data.look % 100) / 16;
    updateDrinker(p, pos, walking, now, dt);
    const sick = sickness(p, now);
    // Say từ 2 cốc mà ngồi im lâu (không comment, không nhận món) thì gục xuống ngủ.
    const lastAct = Math.max(p.lastChat ?? 0, p.deliverAt ?? 0, p.created ?? 0);
    p.sleeping = !walking && !sick && !cheering && (p.data.beers ?? 0) >= 2 && now - lastAct > 40_000 && now >= (p.ohUntil ?? 0);
    const sipping = !walking && !p.sleeping && now < p.sipUntil && p.data.water.has;
    const eating = !walking && !sipping && !sick && !p.sleeping && p.eat && now >= p.eat.start ? { ...p.eat, k: (now - p.eat.start) / p.eat.dur } : null;
    drawables.push({
      y: walking ? pos.y : seat.side === 'back' ? seat.y : seat.y + 8,
      draw: () => {
        if (!walking && seat.side !== 'back') drawStool(ctx, pos.x, pos.y + 4, (p.data.look >> 3) % 2 ? '#d9433b' : '#2f7fd1');
        drawPerson(ctx, pos.x, pos.y, look, {
          walk: walking ? pos.walking : null,
          legs: !walking && seat.side !== 'back',
          cheer: (cheering || now < (p.ohUntil ?? 0)) && !walking && !sick,
          sway: karaoke && !walking,
          sip: sipping,
          eat: eating,
          flush: p.flush ?? 0,
          sick,
          happy: now - p.deliverAt < 2500 && !sick,
          sleep: p.sleeping ? (phase % 2 < 1 ? 0.16 : -0.16) : 0,
          mug: now < toastUntil && !walking,
          phase,
        });
      },
    });
    tagQueue.push({ p, pos, walking });
  }
  // Khách đang ra về
  for (let i = ghosts.length - 1; i >= 0; i--) {
    const g = ghosts[i];
    const len = pathLength(g.points);
    const d = ((now - g.start) / 1000) * WALK_OUT_SPEED;
    if (d >= len) {
      ghosts.splice(i, 1);
      continue;
    }
    const pt = pointAt(g.points, d);
    drawables.push({ y: pt.y, draw: () => drawPerson(ctx, pt.x, pt.y, lookOf(g.look), { walk: d / 70 }) });
  }
  updateCleaner(now);
  if (cleaner.phase !== 'off') drawables.push({ y: cleaner.y, draw: () => drawCleaner(now) });
  const vendor = vendorState(now);
  if (vendor) drawables.push({ y: vendor.y, draw: () => drawVendor(vendor, now) });
  const wife = wifeState();
  if (wife) {
    drawables.push({ y: wife.y, draw: () => drawWife(wife, now) });
    if (wife.victim) drawables.push({ y: wife.victim.y, draw: () => drawVictim(wife) });
  }
  drawables.push({ y: state.ambient.cat ? 2000 : 660, draw: () => drawCat(now) });
  if (view.target && view.e > 0.01) drawSpotlight(view.target, view.e, now);
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) {
    d.draw();
    d.after?.();
  }

  drawBikes(now, dt);
  drawKaraoke(now);
  drawRain(now, dt);
  drawBlackout(now, ti);

  // Tên khách và bong bóng thoại luôn nằm trên cùng để dễ đọc
  for (const { p, pos, walking } of tagQueue) {
    const y = pos.y - 132;
    nameTag(ctx, p.data.name, pos.x, y, walking ? 180 : 136, now - p.deliverAt < 2500 || focus?.id === p.id);
    if (p.sleeping) {
      const k = (now / 1600) % 1;
      ctx.globalAlpha = clamp((1 - k) * 1.5, 0, 1);
      text(ctx, 'z Z z', pos.x + 50 + k * 14, pos.y - 100 - k * 30, { size: 22, color: '#dff3ff', stroke: '#1d3557', strokeWidth: 4 });
      ctx.globalAlpha = 1;
    }
    if (!walking && p.gulpAt && now >= p.gulpAt && now < p.gulpAt + 1200) {
      const k = (now - p.gulpAt) / 1200;
      ctx.globalAlpha = clamp((1 - k) * 2, 0, 1);
      text(ctx, 'Ực ực!', pos.x + 60, pos.y - 66 - k * 24, { size: 22, color: '#ffe8a3', stroke: '#5a2a0a', strokeWidth: 4 });
      ctx.globalAlpha = 1;
    }
    if (!walking && p.hicAt && now < p.hicAt + 1000) {
      const k = (now - p.hicAt) / 1000;
      ctx.globalAlpha = clamp((1 - k) * 2, 0, 1);
      text(ctx, 'hic!', pos.x - 44, pos.y - 100 - k * 22, { size: 22, color: '#ffd0d0', stroke: '#7a1020', strokeWidth: 4 });
      ctx.globalAlpha = 1;
    }
    if (p.bubble && now < p.bubble.until) {
      const notice = p.bubble.notice;
      speech(ctx, notice ? `⚠️ ${p.bubble.text}` : p.bubble.text, pos.x, y - 20, { maxWidth: notice ? 320 : 260, size: notice ? 25 : 21, color: notice ? '#ffe08a' : '#fff', ink: notice ? '#7a1020' : '#2a1d17', alpha: clamp((p.bubble.until - now) / 300, 0, 1) });
    }
  }

  // Khách chờ ghế
  if (state.waitlist.length) {
    ctx.fillStyle = 'rgba(122,31,31,0.9)';
    rr(ctx, 380, 1512, 320, 44, 22);
    ctx.fill();
    text(ctx, `Đang chờ ghế: ${state.waitlist.length} khách`, 540, 1535, { size: 24, color: '#ffe8a3' });
  }
  drawCrash(now);
  drawGoers(now);

  drawParticles(dt);
  drawFloaters(dt);

  // Bong bóng NPC
  drawBubbles(bubbles.coba, drawBa.x, drawBa.y - 130, 'Cô Ba', dt);
  drawBubbles(bubbles.ti, ti.x, ti.y - (ti.carrying ? 150 : 130), 'Tí', dt);
  drawBubbles(bubbles.chutu, 980, 470, 'Chú Tư', dt);
  const talk = (cleaner.phase === 'mop' && cleaner.job?.talk) || { dx: 0, dy: 0 };
  drawVendorSpeech(vendor);
  drawWifeSpeech(wife);
  if (cleaner.phase !== 'off' && now < cleaner.sayUntil) speech(ctx, cleaner.say, cleaner.x + talk.dx, cleaner.y - 150 + talk.dy, { who: 'Cô lao công', maxWidth: 380, alpha: clamp((cleaner.sayUntil - now) / 300, 0, 1) });
  ctx.restore();

  // ---- Lớp cố định trên màn hình ----
  if (view.e > 0.01) drawFocusOverlay(view.e, now);
  if (!drawToastMeter()) drawGuide();
  drawTickets(dt);
  drawWheel(now);
  drawFlashes(dt);

  if (!serverOk) {
    ctx.fillStyle = 'rgba(160,30,30,0.92)';
    rr(ctx, 300, 640, 480, 56, 28);
    ctx.fill();
    text(ctx, 'Mất kết nối máy chủ game', 540, 668, { size: 28, color: '#fff' });
  }
  requestAnimationFrame(frame);
}
const drawBa = {};
const drawTi = {};

function drawTableContents(t, now) {
  for (const pd of puddles) if (pd.table === t.id) drawPuddle(pd, now);
  const seated = [...people.values()].filter((p) => p.data.seat?.table === t.id && !p.walk);
  const pots = [];
  for (const p of seated) {
    const seat = t.seats[p.data.seat.index];
    const fresh = clamp(1 - (now - p.deliverAt) / 6000, 0, 1);
    drawTableItems(ctx, p.data, seat.item, fresh);
    const hot = p.data.stacks.filter((s) => s.item === 'hotpot').reduce((n, s) => n + s.qty, 0);
    if (hot) pots.push({ name: p.data.name, qty: hot });
  }
  if (pots.length) {
    drawHotpot(ctx, t.x, t.y + 20, 1);
    steam(ctx, t.x, t.y - 8, 1);
    const total = pots.reduce((n, p) => n + p.qty, 0);
    if (total > 1) badge(ctx, total, t.x + 46, t.y - 8, true);
    ctx.font = `700 17px ${FONT}`;
    const owners = fitText(ctx, `Lẩu: ${pots.map((p) => p.name).join(', ')}`, 200);
    ctx.fillStyle = 'rgba(25,16,30,0.75)';
    const w = ctx.measureText(owners).width + 14;
    rr(ctx, t.x - w / 2, t.y + 36, w, 22, 11);
    ctx.fill();
    text(ctx, owners, t.x, t.y + 48, { size: 17, color: '#ffd166' });
  }
}

drawBackground();
document.fonts?.ready.then(drawBackground);
requestAnimationFrame(frame);
