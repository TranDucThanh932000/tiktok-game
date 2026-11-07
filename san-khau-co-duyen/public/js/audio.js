// Âm thanh: giọng MC phát từ các mẩu Vbee nối nhau; chuông, chúc mừng và nhạc nền do code tự tạo, không cần file ngoài.
// Nhạc nền, âm thanh quà và tiếng khán đài hạ xuống khi MC nói. Không có tiếng còi sai hay tiếng cười chế nhạo.
import { CROWD_LENGTH, crowd, crowdBus } from './crowdsound.js';

const VOLUME = 0.5;
const CROWD_LEVEL = 0.85; // Mức hò reo lớn đo được đỉnh 0,95; chừa chỗ để cộng với nhạc nền không vỡ tiếng.
const CROWD_DUCKED = 0.38;
const MUSIC_LEVEL = 0.11;
const MUSIC_DUCKED = 0.035;

let ctx = null;
let master;
let musicBus;
let sfxBus;
let voiceBus;
let crowdOut;
let musicTimer = 0;

function ensure() {
  if (ctx) return ctx;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = MUSIC_LEVEL;
  musicBus.connect(master);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = VOLUME;
  sfxBus.connect(master);
  voiceBus = ctx.createGain();
  voiceBus.gain.value = 1.2;
  voiceBus.connect(master);
  crowdOut = crowdBus(ctx, master);
  crowdOut.gain.value = CROWD_LEVEL;
  ctx.onstatechange = () => stateListener?.(ctx.state === 'running');
  return ctx;
}

let stateListener = null;
export function onAudioState(callback) {
  stateListener = callback;
  callback(Boolean(ctx && ctx.state === 'running'));
}

export function wake() {
  ensure();
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  startMusic();
  stateListener?.(ctx.state === 'running');
}

function note(freq, at, length, { type = 'sine', level = 0.3, bus = sfxBus } = {}) {
  const osc = new OscillatorNode(ctx, { type, frequency: freq });
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(level, at + 0.015);
  env.gain.exponentialRampToValueAtTime(0.0008, at + length);
  osc.connect(env).connect(bus);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

const SOUNDS = {
  // Chuông mở cửa quyết định: rõ, không gắt.
  bell(t) {
    note(1046.5, t, 1.2, { level: 0.42 });
    note(2093, t, 0.8, { level: 0.14 });
    note(1567.98, t + 0.01, 1, { level: 0.14 });
  },
  chime(t) {
    note(987.77, t, 0.28, { level: 0.14 });
    note(1318.51, t + 0.07, 0.34, { level: 0.14 });
  },
  rose(t) {
    note(1174.66, t, 0.25, { level: 0.1 });
  },
  sparkle(t) {
    [1046.5, 1318.51, 1567.98, 2093].forEach((freq, i) => note(freq, t + i * 0.07, 0.4, { level: 0.14 }));
  },
  invite(t) {
    note(659.25, t, 0.35, { level: 0.2 });
    note(880, t + 0.16, 0.5, { level: 0.2 });
  },
  tick(t) {
    note(880, t, 0.09, { type: 'triangle', level: 0.13 });
  },
  // Kết quả chúc mừng.
  joy(t) {
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((freq, i) => note(freq, t + i * 0.11, 0.8, { type: 'triangle', level: 0.2 }));
  },
  // Kết nhẹ: hợp âm ấm, không phải âm thanh thất bại.
  warm(t) {
    [392, 493.88, 587.33].forEach((freq) => note(freq, t, 1.6, { level: 0.1 }));
  },
};

export function sfx(name) {
  if (!ctx || ctx.state !== 'running') return;
  SOUNDS[name]?.(ctx.currentTime + 0.005);
}

// Khán đài phản ứng: tiếng nhỏ không chen vào lúc tràng lớn đang vang, cùng mức thì không dồn liên tục.
let crowdBusyUntil = 0;
const STRENGTH = { small: 1, polite: 2, medium: 2, big: 3 };
let crowdStrength = 0;
export function crowdReact(kind) {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  if (now < crowdBusyUntil && STRENGTH[kind] <= crowdStrength) return;
  crowd(ctx, crowdOut, now + 0.01, kind);
  crowdStrength = STRENGTH[kind];
  crowdBusyUntil = now + CROWD_LENGTH[kind] * 0.55;
}

// ---------- Nhạc nền: vòng hòa âm viết riêng cho game, nhẹ để không lấn lời ----------
const CHORDS = [
  [261.63, 329.63, 392],
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [196, 246.94, 293.66],
];
const MELODY = [659.25, 587.33, 523.25, 587.33, 659.25, 783.99, 659.25, 587.33];
let chordIndex = 0;

function startMusic() {
  if (musicTimer || !ctx) return;
  const bar = 3.2;
  let next = ctx.currentTime + 0.1;
  const schedule = () => {
    if (ctx.state !== 'running') return;
    while (next < ctx.currentTime + 1.5) {
      const chord = CHORDS[chordIndex % CHORDS.length];
      chord.forEach((freq) => note(freq, next, bar * 1.05, { level: 0.2, bus: musicBus }));
      for (let i = 0; i < 4; i++) {
        note(MELODY[(chordIndex * 4 + i) % MELODY.length], next + i * (bar / 4), 0.65, { type: 'triangle', level: 0.07, bus: musicBus });
      }
      chordIndex++;
      next += bar;
    }
  };
  schedule();
  musicTimer = setInterval(schedule, 500);
}

function duck(on) {
  if (!ctx) return;
  musicBus.gain.setTargetAtTime(on ? MUSIC_DUCKED : MUSIC_LEVEL, ctx.currentTime, 0.12);
  sfxBus.gain.setTargetAtTime(on ? VOLUME * 0.5 : VOLUME, ctx.currentTime, 0.12);
  crowdOut.gain.setTargetAtTime(on ? CROWD_DUCKED : CROWD_LEVEL, ctx.currentTime, 0.15);
}

// ---------- Giọng MC ----------
const buffers = new Map();

// Bỏ khoảng lặng hai đầu mẩu để câu ghép nghe liền, chừa 30 ms cho tự nhiên.
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
    if (buffers.size > 500) buffers.delete(buffers.keys().next().value);
  }
  return buffers.get(id);
}

let run = 0;
const playing = new Set();

export function stopSpeech() {
  run++;
  for (const src of playing) src.stop();
  playing.clear();
  duck(false);
}

// Mỗi lúc chỉ một giọng: câu mới luôn dừng câu trước.
export async function speak(clips, ms) {
  stopSpeech();
  if (!ctx || ctx.state !== 'running' || !clips.length) return;
  const mine = run;
  duck(true);
  const parts = await Promise.all(clips.map(load));
  if (mine !== run) return;
  let at = ctx.currentTime + 0.02;
  for (const buffer of parts) {
    if (!buffer) continue;
    const src = new AudioBufferSourceNode(ctx, { buffer });
    src.connect(voiceBus);
    playing.add(src);
    src.onended = () => playing.delete(src);
    src.start(at);
    at += buffer.duration + 0.04;
  }
  setTimeout(() => {
    if (mine === run) duck(false);
  }, Math.max(ms, (at - ctx.currentTime) * 1000));
}

export function preload(ids) {
  if (ctx) ids.forEach(load);
}
