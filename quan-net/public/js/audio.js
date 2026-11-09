// Âm thanh tổng hợp bằng WebAudio, không cần file. Thêm ?mute vào địa chỉ để tắt tiếng.
const muted = new URLSearchParams(location.search).has('mute');
const VOLUME = muted ? 0 : 0.6;
const ctx = new AudioContext();
const master = new GainNode(ctx, { gain: VOLUME });
master.connect(ctx.destination);
const voiceOut = new GainNode(ctx, { gain: muted ? 0 : 1 });
voiceOut.connect(ctx.destination);
addEventListener('pointerdown', () => ctx.resume());

export function wake() {
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}
export function onAudioState(fn) {
  ctx.addEventListener('statechange', () => fn(muted || ctx.state === 'running'));
  fn(muted || ctx.state === 'running');
}

function tone(freq, start, duration, peak, type = 'sine', glideTo) {
  const osc = new OscillatorNode(ctx, { type, frequency: freq });
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

const notes = (list, gap, duration, peak, type) => {
  const t = ctx.currentTime;
  list.forEach((f, i) => tone(f, t + i * gap, duration, peak, type));
};

const noiseBuffer = (() => {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
})();

function noise(start, duration, peak, { type = 'highpass', freq = 2000, to } = {}) {
  const src = new AudioBufferSourceNode(ctx, { buffer: noiseBuffer });
  const filter = new BiquadFilterNode(ctx, { type, frequency: freq, Q: 0.8 });
  if (to) filter.frequency.exponentialRampToValueAtTime(to, start + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter).connect(gain).connect(master);
  src.start(start, Math.random() * 0.5);
  src.stop(start + duration + 0.05);
}

export const sfx = {
  // máy khởi động
  sit: () => notes([523, 659, 784, 1047], 0.08, 0.3, 0.1, 'triangle'),
  // tắt máy ra về
  leave: () => notes([784, 587, 440], 0.09, 0.25, 0.08, 'triangle'),
  // hết giờ: bíp bíp
  expire: () => notes([988, 988], 0.16, 0.1, 0.07, 'square'),
  // cô Tám đuổi
  kick: () => {
    noise(ctx.currentTime, 0.35, 0.12, { type: 'bandpass', freq: 600, to: 3000 });
    tone(140, ctx.currentTime + 0.05, 0.2, 0.15, 'sine', 70);
  },
  // nạp giờ
  coin: () => notes([1319, 1760], 0.06, 0.16, 0.09),
  // quà to
  fanfare: () => notes([523, 659, 784, 1047, 784, 1047, 1319], 0.1, 0.42, 0.13, 'triangle'),
  // thả tim, comment được thêm giờ
  pop: () => tone(700, ctx.currentTime, 0.08, 0.05, 'triangle', 1100),
  // rung máy kiểu Yahoo
  buzz: () => {
    const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) tone(i % 2 ? 90 : 70, t + i * 0.07, 0.07, 0.12, 'square');
  },
  // đập phím
  rage: () => {
    const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) noise(t + i * 0.07 + Math.random() * 0.02, 0.05, 0.2, { freq: 1800 });
  },
  golden: () => notes([784, 988, 1175, 1568, 1175, 1568], 0.09, 0.35, 0.12, 'triangle'),
  powerDown: () => tone(420, ctx.currentTime, 0.7, 0.12, 'sawtooth', 50),
  powerUp: () => {
    tone(60, ctx.currentTime, 0.5, 0.08, 'sawtooth', 500);
    notes([523, 784], 0.12, 0.25, 0.08, 'triangle');
  },
  // mẹ tới: dum dum
  mom: () => notes([196, 147, 196, 147], 0.18, 0.2, 0.15, 'triangle'),
  hide: () => notes([660, 880, 660, 990], 0.08, 0.16, 0.09, 'triangle'),
  drag: () => notes([392, 330, 262], 0.14, 0.3, 0.1, 'triangle'),
};

// Tiếng gõ phím lách cách nhỏ, dày hơn khi tiệm đông.
let typists = 0;
export function setTypists(count) {
  typists = count;
}
(function clatter() {
  const gap = typists ? 900 / Math.min(12, typists) : 1500;
  if (typists && ctx.state === 'running') noise(ctx.currentTime, 0.025, 0.012 + Math.random() * 0.01, { freq: 2500 + Math.random() * 2000 });
  setTimeout(clatter, gap * (0.3 + Math.random()));
})();

// ---------- Giọng cô Tám: các mẩu /tts/:id phát nối nhau ----------
const buffers = new Map(); // id -> Promise<AudioBuffer | null>

// Bỏ khoảng lặng đầu/cuối, chừa 30 ms cho tự nhiên.
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
    if (buffers.size > 300) buffers.delete(buffers.keys().next().value);
  }
  return buffers.get(id);
}

let run = 0;
let timers = [];
const playing = new Set();

export function stopSpeech() {
  run++;
  timers.forEach(clearTimeout);
  timers = [];
  for (const src of playing) src.stop();
  playing.clear();
  master.gain.setTargetAtTime(VOLUME, ctx.currentTime, 0.1);
}

// clips: [{ id }]
export async function speak({ clips }) {
  if (!clips?.length) return;
  const mine = run;
  const parts = await Promise.all(clips.map((clip) => load(clip.id)));
  if (mine !== run) return;
  const begin = ctx.currentTime + 0.02;
  let at = begin;
  for (const buffer of parts) {
    if (!buffer) continue;
    const src = new AudioBufferSourceNode(ctx, { buffer });
    src.connect(voiceOut);
    playing.add(src);
    src.onended = () => playing.delete(src);
    src.start(at);
    at += buffer.duration + 0.04;
  }
  // Tiếng hiệu ứng nhỏ lại khi cô Tám nói.
  master.gain.setTargetAtTime(VOLUME * 0.45, begin, 0.1);
  timers.push(setTimeout(() => master.gain.setTargetAtTime(VOLUME, ctx.currentTime, 0.2), (at - ctx.currentTime) * 1000));
}
