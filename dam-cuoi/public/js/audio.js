// Âm thanh: vài tiếng hiệu ứng tự tổng hợp bằng Web Audio và giọng hai MC (mẩu mp3 Vbee).
let ctx = null;
let master = null;
let noiseBuffer = null;
const last = {};
const muted = new URLSearchParams(location.search).has('mute');

export function audioReady() {
  if (muted) return true;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return ctx.state === 'running';
}

export function unlockAudio() {
  audioReady();
  return ctx?.resume();
}


function gate(name, ms) {
  const t = performance.now();
  if (muted || !ctx || ctx.state !== 'running' || t - (last[name] ?? 0) < ms) return false;
  last[name] = t;
  return true;
}

function env(gain, at, peak, attack, release) {
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
}

function noise({ at, dur, type = 'bandpass', freq = 1000, to, q = 1, peak = 0.5, attack = 0.01, out = master }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, at);
  if (to) filter.frequency.exponentialRampToValueAtTime(to, at + attack + dur);
  filter.Q.value = q;
  const gain = ctx.createGain();
  env(gain, at, peak, attack, dur);
  src.connect(filter).connect(gain).connect(out);
  src.start(at, Math.random());
  src.stop(at + attack + dur + 0.05);
}

function tone({ at, freq, to = freq, dur, type = 'sine', peak = 0.4, attack = 0.005, out = master, filter }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
  const gain = ctx.createGain();
  env(gain, at, peak, attack, dur);
  let node = osc;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    node = osc.connect(f);
  }
  node.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + attack + dur + 0.05);
}

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);
const M = { C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, Bb4: 70, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79 };

// ---------------------------------------------------------------- Hiệu ứng

// Người dùng chỉ muốn vài tiếng hiệu ứng chính (2026-11-13): cú đá, tiếng nổ, vỗ tay, kèn mừng, pháo hoa.
// Các tiếng khác vẫn gọi được nhưng im lặng.
const QUIET = new Set(['whoosh', 'step', 'fly', 'twinkle', 'shock', 'sadTrombone', 'coin', 'launch']);
const allSfx = {
  whoosh() {
    if (!gate('whoosh', 200)) return;
    noise({ at: ctx.currentTime, dur: 0.45, freq: 400, to: 2400, q: 1.2, peak: 0.25, attack: 0.15 });
  },
  step() {
    if (!gate('step', 120)) return;
    tone({ at: ctx.currentTime, freq: 180, to: 90, dur: 0.06, peak: 0.08 });
  },
  kick() {
    if (!gate('kick', 80)) return;
    const at = ctx.currentTime;
    tone({ at, freq: 160, to: 40, dur: 0.25, peak: 0.9 });
    noise({ at, dur: 0.12, freq: 2200, q: 0.6, peak: 0.6 });
    tone({ at: at + 0.01, freq: 620, to: 300, dur: 0.12, type: 'square', peak: 0.12, filter: 2000 });
  },
  fly() {
    if (!gate('fly', 200)) return;
    const at = ctx.currentTime;
    tone({ at, freq: 500, to: 1700, dur: 0.9, type: 'sine', peak: 0.18 });
    setTimeout(() => sfx.twinkle(), 950);
  },
  twinkle() {
    if (!gate('twinkle', 150)) return;
    const at = ctx.currentTime;
    [2093, 2637, 3136].forEach((f, i) => tone({ at: at + i * 0.06, freq: f, dur: 0.4, peak: 0.1 }));
  },
  cheer() {
    if (!gate('cheer', 600)) return;
    const at = ctx.currentTime;
    noise({ at, dur: 1.6, freq: 1100, q: 0.5, peak: 0.28, attack: 0.15 });
    noise({ at: at + 0.05, dur: 1.4, freq: 2600, q: 0.8, peak: 0.14, attack: 0.2 });
    for (let i = 0; i < 10; i++) noise({ at: at + 0.1 + Math.random() * 1.2, dur: 0.03, type: 'highpass', freq: 1500, peak: 0.12 });
  },
  fanfare() {
    if (!gate('fanfare', 300)) return;
    const at = ctx.currentTime;
    [M.F4, M.A4, M.C5, M.F5].forEach((n, i) => {
      tone({ at: at + i * 0.09, freq: NOTE(n), dur: i === 3 ? 0.8 : 0.2, type: 'triangle', peak: 0.22 });
      tone({ at: at + i * 0.09, freq: NOTE(n) * 2, dur: 0.15, type: 'sine', peak: 0.06 });
    });
  },
  shock() {
    if (!gate('shock', 200)) return;
    tone({ at: ctx.currentTime, freq: 300, to: 900, dur: 0.18, type: 'square', peak: 0.08, filter: 1800 });
  },
  sadTrombone() {
    if (!gate('trombone', 500)) return;
    const at = ctx.currentTime;
    [[466, 0.32], [440, 0.32], [415, 0.32], [392, 1.0]].forEach(([f, d], i) => {
      tone({ at: at + i * 0.36, freq: f, to: i === 3 ? f * 0.94 : f, dur: d, type: 'sawtooth', peak: 0.16, attack: 0.03, filter: 1100 });
    });
  },
  boom() {
    if (!gate('boom', 120)) return;
    const at = ctx.currentTime;
    tone({ at, freq: 90, to: 30, dur: 0.6, peak: 0.6 });
    noise({ at, dur: 0.5, type: 'lowpass', freq: 900, peak: 0.5 });
  },
  coin() {
    if (!gate('coin', 90)) return;
    const at = ctx.currentTime;
    tone({ at, freq: 1976, dur: 0.08, type: 'square', peak: 0.05, filter: 5000 });
    tone({ at: at + 0.07, freq: 2637, dur: 0.3, type: 'square', peak: 0.05, filter: 5000 });
  },
  firework() {
    if (!gate('fw', 150)) return;
    const at = ctx.currentTime;
    noise({ at, dur: 0.7, type: 'lowpass', freq: 700, peak: 0.45 });
    for (let i = 0; i < 12; i++) noise({ at: at + 0.15 + Math.random() * 0.8, dur: 0.02, type: 'highpass', freq: 3000, peak: 0.1 });
  },
  launch() {
    if (!gate('launch', 150)) return;
    tone({ at: ctx.currentTime, freq: 600, to: 2400, dur: 0.8, peak: 0.05 });
  },
};
export const sfx = Object.fromEntries(Object.entries(allSfx).map(([name, fn]) => [name, QUIET.has(name) ? () => {} : fn]));

// ---------------------------------------------------------------- Giọng MC: các mẩu /tts/:id phát nối nhau

const buffers = new Map(); // id -> Promise<AudioBuffer | null>
let voiceOut = null;

// Bỏ khoảng lặng đầu/cuối mỗi mẩu, chừa 30 ms cho tự nhiên.
function trim(buffer) {
  const data = buffer.getChannelData(0);
  const limit = 0.015;
  let start = 0;
  let end = data.length - 1;
  while (start < end && Math.abs(data[start]) < limit) start++;
  while (end > start && Math.abs(data[end]) < limit) end--;
  const pad = Math.round(buffer.sampleRate * 0.03);
  start = Math.max(0, start - pad);
  end = Math.min(data.length, end + pad);
  if (end - start < 16) return buffer;
  const out = ctx.createBuffer(buffer.numberOfChannels, end - start, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) out.copyToChannel(buffer.getChannelData(c).subarray(start, end), c);
  return out;
}

function load(id) {
  if (!buffers.has(id)) {
    buffers.set(
      id,
      fetch(`/tts/${id}`)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(res.status))))
        .then((data) => ctx.decodeAudioData(data))
        .then(trim)
        .catch(() => {
          buffers.delete(id);
          return null;
        }),
    );
    if (buffers.size > 400) buffers.delete(buffers.keys().next().value);
  }
  return buffers.get(id);
}

let speechRun = 0;
let speechTimers = [];
const speaking = new Set();

export function stopSpeech() {
  speechRun++;
  speechTimers.forEach(clearTimeout);
  speechTimers = [];
  for (const src of speaking) src.stop();
  speaking.clear();
}

// clips: [{ id, gap, speaker }]. Server lo để hai câu không chồng nhau. onLine(i) báo đang tới câu thứ mấy.
export async function speak({ clips, cut }, { onStart, onDone, onClip } = {}) {
  if (cut) stopSpeech();
  if (!clips?.length || muted || !audioReady()) return;
  if (!voiceOut) {
    voiceOut = ctx.createGain();
    voiceOut.gain.value = 1.15;
    voiceOut.connect(master);
  }
  const mine = ++speechRun;
  const parts = await Promise.all(clips.map((c) => load(c.id)));
  if (mine !== speechRun) return;
  const begin = ctx.currentTime + 0.03;
  let at = begin;
  clips.forEach((clip, i) => {
    const buffer = parts[i];
    if (!buffer) return;
    const src = new AudioBufferSourceNode(ctx, { buffer });
    src.connect(voiceOut);
    speaking.add(src);
    src.onended = () => speaking.delete(src);
    src.start(at);
    if (onClip) speechTimers.push(setTimeout(() => mine === speechRun && onClip(i), Math.max(0, (at - ctx.currentTime) * 1000)));
    at += buffer.duration + (clip.gap ?? 0.04);
  });
  onStart?.();
  speechTimers.push(setTimeout(() => {
    if (mine !== speechRun) return;
    onDone?.();
  }, (at - ctx.currentTime) * 1000 + 300));
}
