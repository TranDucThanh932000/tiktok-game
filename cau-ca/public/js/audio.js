// Âm thanh tổng hợp bằng WebAudio (không có file): tiếng quạt nước, dế kêu ban đêm, mưa, gió, sấm, bõm nước, guồng quay, nhạc thắng/thua, nhạc bolero qua loa.
// Giọng Vbee (/tts/:id) phát lần lượt, các tiếng khác nhỏ lại khi đang đọc.
const muted = new URLSearchParams(location.search).has('mute');
const VOLUME = muted ? 0 : 0.6;
const ctx = new AudioContext();
const master = ctx.createGain();
master.gain.value = VOLUME;
master.connect(ctx.destination);
addEventListener('pointerdown', () => ctx.resume());

export const audioState = () => ctx.state;
export function wake() {
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}
export function onAudioState(fn) {
  ctx.addEventListener('statechange', () => fn(muted || ctx.state === 'running'));
  fn(muted || ctx.state === 'running');
}

const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
{
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

function tone(freq, start, duration, peak, type = 'sine', glideTo) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function hiss(start, duration, peak, frequency, Q = 0.8, type = 'bandpass') {
  const src = new AudioBufferSourceNode(ctx, { buffer: noise, loop: true });
  const filter = new BiquadFilterNode(ctx, { type, frequency, Q });
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter).connect(gain).connect(master);
  src.start(start, Math.random());
  src.stop(start + duration + 0.05);
  return filter;
}

// nền: máy quạt nước chạy đều + nước sục; mưa, gió và dế to nhỏ theo thời tiết, giờ trong ngày
let ambient = false;
const weather = { rain: 0, wind: 0, night: 0 };
let rainHigh, rainLow, windGain, windFilter;
function noiseLoop(type, frequency, Q, gain) {
  const src = new AudioBufferSourceNode(ctx, { buffer: noise, loop: true });
  const f = new BiquadFilterNode(ctx, { type, frequency, Q });
  const g = new GainNode(ctx, { gain });
  src.connect(f).connect(g).connect(master);
  src.start(0, Math.random() * 2);
  return { f, g };
}
function startAmbient() {
  if (ambient || muted) return;
  ambient = true;
  noiseLoop('bandpass', 620, 0.7, 0.03);
  noiseLoop('bandpass', 1900, 0.8, 0.012);
  // tiếng máy quạt ù đều
  for (const [f, g] of [[98, 0.012], [196, 0.006]]) {
    const hum = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f });
    const low = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 420 });
    hum.connect(low).connect(new GainNode(ctx, { gain: g })).connect(master);
    hum.start();
  }
  rainHigh = noiseLoop('highpass', 1400, 0.4, 0).g;
  rainLow = noiseLoop('bandpass', 420, 0.7, 0).g;
  ({ g: windGain, f: windFilter } = noiseLoop('bandpass', 300, 1.4, 0));
  setWeatherSound(weather);
  // tối xuống thì dế kêu, mưa to thì im
  setInterval(() => {
    const loud = weather.night * (1 - weather.rain);
    if (ctx.state !== 'running' || loud < 0.1) return;
    for (let k = 0; k < 2; k++) {
      const t = ctx.currentTime + Math.random() * 0.8;
      const base = 3900 + Math.random() * 900;
      for (let i = 0; i < 4; i++) tone(base, t + i * 0.055, 0.035, 0.018 * loud, 'sine');
    }
  }, 900);
}

// rain 0..1, wind có dấu (độ lớn 0..~1.5), night 0..1. Gọi vài lần mỗi giây là đủ.
export function setWeatherSound({ rain, wind, night }) {
  Object.assign(weather, { rain, wind, night });
  if (!rainHigh) return;
  const t = ctx.currentTime;
  const w = Math.min(1.5, Math.abs(wind));
  rainHigh.gain.setTargetAtTime(rain * 0.1, t, 0.4);
  rainLow.gain.setTargetAtTime(rain * rain * 0.07, t, 0.4);
  windGain.gain.setTargetAtTime(Math.max(0, w - 0.1) ** 1.5 * 0.11, t, 0.25);
  windFilter.frequency.setTargetAtTime(220 + w * 480, t, 0.25);
}
ctx.addEventListener('statechange', () => ctx.state === 'running' && startAmbient());
if (ctx.state === 'running') startAmbient();

const running = () => ctx.state === 'running' && !muted;

export const sfx = {
  whoosh() {
    if (!running()) return;
    const t = ctx.currentTime;
    const f = hiss(t, 1.0, 0.12, 400, 1.2);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.9);
  },
  land() {
    if (!running()) return;
    const t = ctx.currentTime;
    tone(140, t, 0.25, 0.4, 'sine', 50);
    hiss(t, 0.2, 0.15, 900, 0.7);
    tone(520, t + 0.08, 0.14, 0.12, 'triangle', 780);
  },
  splash(power = 1) {
    if (!running()) return;
    const t = ctx.currentTime;
    hiss(t, 0.35 + power * 0.25, 0.18 * Math.min(2, power), 1300, 0.6);
    hiss(t + 0.03, 0.5, 0.08 * Math.min(2, power), 500, 0.8);
    tone(300, t, 0.18, 0.1 * power, 'sine', 120);
  },
  reel(seconds) {
    if (!running()) return;
    const t = ctx.currentTime;
    const n = Math.floor(seconds * 22);
    for (let i = 0; i < n; i++) tone(1800 + Math.random() * 300, t + i / 22 + Math.random() * 0.01, 0.018, 0.05, 'square');
    hiss(t, seconds, 0.04, 2500, 2);
  },
  win(big = false) {
    if (!running()) return;
    const t = ctx.currentTime;
    const notes = big ? [523, 659, 784, 1047, 1319, 1568] : [659, 784, 1047, 1319];
    notes.forEach((f, i) => tone(f, t + i * 0.09, 0.35, 0.16, 'triangle'));
    if (big) {
      for (let i = 0; i < 6; i++) tone(70, t + i * 0.16, 0.2, 0.35, 'sine', 45);
      notes.forEach((f, i) => tone(f * 2, t + 0.6 + i * 0.07, 0.4, 0.08, 'sine'));
    }
  },
  fail() {
    if (!running()) return;
    const t = ctx.currentTime;
    tone(1900, t, 0.05, 0.2, 'square', 300); // tưng: dây đứt
    tone(440, t + 0.15, 0.25, 0.14, 'triangle', 330);
    tone(330, t + 0.38, 0.45, 0.14, 'triangle', 196);
  },
  thunder(power = 1) {
    if (!running()) return;
    const t = ctx.currentTime;
    hiss(t, 0.3, 0.22 * power, 2200, 0.4);
    const rumble = hiss(t + 0.04, 3.4, 0.55 * power, 180, 0.7, 'lowpass');
    rumble.frequency.exponentialRampToValueAtTime(55, t + 3.2);
    tone(52, t, 1.8, 0.3 * power, 'sine', 30);
  },
  pop() {
    if (!running()) return;
    tone(880, ctx.currentTime, 0.12, 0.08, 'sine', 1320);
  },
  // Hồi hộp lúc cá đang giằng co: tim đập nhanh dần, tiếng gió dâng lên. Cá hiếm thêm chuỗi nốt lấp lánh.
  tension(kind, seconds) {
    if (!running() || !(seconds > 0)) return;
    const t = ctx.currentTime;
    let at = t;
    let gap = 0.62;
    while (at < t + seconds - 0.1) {
      tone(58, at, 0.16, 0.42, 'sine', 40);
      tone(52, at + 0.17, 0.2, 0.3, 'sine', 36);
      at += gap;
      gap = Math.max(0.26, gap * 0.9);
    }
    const riser = hiss(t, seconds, 0.09, 300, 2.5);
    riser.frequency.exponentialRampToValueAtTime(kind === 'rare' ? 3800 : 1500, t + seconds);
    if (kind === 'shark') tone(46, t, seconds, 0.16, 'sawtooth', 62);
    else {
      const scale = [659, 784, 880, 1047, 1175, 1319, 1568, 1760];
      const n = Math.floor(seconds * 5);
      for (let i = 0; i < n; i++) tone(scale[Math.min(scale.length - 1, Math.floor((i / n) * scale.length))], t + i * 0.2, 0.3, 0.035, 'sine');
    }
  },
  // Lúc lộ kết quả thắng: tiếng nổ trầm, cá hiếm thêm tiếng chuông.
  boom(kind) {
    if (!running()) return;
    const t = ctx.currentTime;
    tone(92, t, 0.9, 0.55, 'sine', 32);
    hiss(t, 0.7, 0.26, 700, 0.6);
    if (kind === 'rare') [1319, 1568, 1976, 2637].forEach((f, i) => tone(f, t + 0.05 + i * 0.07, 0.8, 0.08, 'sine'));
    else tone(130, t, 0.7, 0.2, 'sawtooth', 48);
  },
  // Kim vòng quay gõ qua từng ô.
  tick() {
    if (!running()) return;
    tone(1500, ctx.currentTime, 0.03, 0.09, 'square', 900);
  },
  // Báo sắp quay, vòng vàng thì thêm nốt cao.
  fanfare(golden = false) {
    if (!running()) return;
    const t = ctx.currentTime;
    const notes = golden ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
    notes.forEach((f, i) => tone(f, t + i * 0.12, 0.28, 0.14, 'triangle'));
  },
  // Cá mập nhô lên.
  roar() {
    if (!running()) return;
    const t = ctx.currentTime;
    tone(95, t, 1.3, 0.34, 'sawtooth', 42);
    hiss(t, 1.1, 0.16, 420, 0.7);
  },
  // Một phát đánh trúng cá mập.
  thud() {
    if (!running()) return;
    const t = ctx.currentTime;
    tone(170, t, 0.16, 0.26, 'sine', 70);
    hiss(t, 0.1, 0.09, 1200, 0.8);
  },
};

// ---------- Nhạc bolero phát qua loa ----------
// Bài do code tự chơi, giai điệu viết riêng cho game (không lấy từ bài hát nào): nhịp bolero chậm, guitar rải, bass, maracas, giai điệu kèn.
// Tất cả đi qua bộ lọc giống loa phóng thanh, trộn nhỏ dưới nền.
const NOTE = { A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, GS3: 207.65, A3: 220, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, GS4: 415.3, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880 };
const CHORDS = {
  Am: ['A2', 'E3', 'A3', 'C4', 'E4'],
  Dm: ['D3', 'A3', 'D4', 'F4', 'A4'],
  E7: ['E3', 'GS3', 'D4', 'E4', 'GS4'],
  C: ['C3', 'G3', 'C4', 'E4', 'G4'],
  G: ['G3', 'B3', 'D4', 'G4', 'B4'],
  F: ['F3', 'C4', 'F4', 'A4', 'C5'],
};
const PROGRESSION = ['Am', 'Am', 'Dm', 'Am', 'F', 'C', 'E7', 'E7', 'Am', 'Am', 'Dm', 'G', 'C', 'F', 'E7', 'Am'];
// mỗi ô nhịp có 8 ô nhỏ: [ô bắt đầu, nốt, độ dài tính theo ô nhỏ]
const MELODY = [
  [[0, 'E5', 3], [3, 'D5', 1], [4, 'C5', 2], [6, 'A4', 2]],
  [[0, 'B4', 2], [2, 'C5', 2], [4, 'A4', 4]],
  [[0, 'F5', 3], [3, 'E5', 1], [4, 'D5', 2], [6, 'F5', 2]],
  [[0, 'E5', 6], [6, 'C5', 2]],
  [[0, 'A4', 2], [2, 'C5', 2], [4, 'F5', 3], [7, 'E5', 1]],
  [[0, 'G5', 3], [3, 'E5', 1], [4, 'C5', 4]],
  [[0, 'D5', 2], [2, 'E5', 2], [4, 'GS4', 2], [6, 'B4', 2]],
  [[0, 'E5', 8]],
  [[0, 'A5', 3], [3, 'G5', 1], [4, 'E5', 2], [6, 'C5', 2]],
  [[0, 'D5', 2], [2, 'E5', 2], [4, 'A4', 4]],
  [[0, 'A4', 2], [2, 'D5', 2], [4, 'F5', 3], [7, 'E5', 1]],
  [[0, 'D5', 3], [3, 'B4', 1], [4, 'G4', 4]],
  [[0, 'C5', 2], [2, 'E5', 2], [4, 'G5', 3], [7, 'E5', 1]],
  [[0, 'F5', 2], [2, 'E5', 2], [4, 'D5', 2], [6, 'C5', 2]],
  [[0, 'B4', 3], [3, 'C5', 1], [4, 'D5', 2], [6, 'GS4', 2]],
  [[0, 'A4', 6]],
];
const MUSIC_BPM = 76;
let musicBus = null;

function musicNote(freq, start, duration, peak, type, attack = 0.006) {
  const osc = new OscillatorNode(ctx, { type, frequency: freq });
  const gain = new GainNode(ctx, { gain: 0.0001 });
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(musicBus);
  osc.start(start);
  osc.stop(start + duration + 0.05);
  return osc;
}
function musicShake(start, peak) {
  const src = new AudioBufferSourceNode(ctx, { buffer: noise });
  const f = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 3600 });
  const gain = new GainNode(ctx, { gain: peak });
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);
  src.connect(f).connect(gain).connect(musicBus);
  src.start(start, Math.random());
  src.stop(start + 0.1);
}

export function startMusic(cfg) {
  if (musicBus || muted || cfg?.on === false) return;
  // loa phóng thanh: cắt trầm và bổng, méo nhẹ
  const lowCut = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 240, Q: 0.7 });
  const highCut = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 3200, Q: 0.9 });
  const honk = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 1300, Q: 1, gain: 7 });
  const shaper = new WaveShaperNode(ctx, { curve: Float32Array.from({ length: 257 }, (_, i) => Math.tanh(((i - 128) / 128) * 1.6)) });
  musicBus = new GainNode(ctx, { gain: 1.25 * Math.min(2, Math.max(0, cfg?.volume ?? 1)) });
  musicBus.connect(lowCut).connect(honk).connect(shaper).connect(highCut).connect(master);

  const beat = 60 / MUSIC_BPM;
  const slot = beat / 2;
  let bar = 0;
  let at = 0;
  const scheduleBar = (i, t) => {
    const chord = CHORDS[PROGRESSION[i]].map((n) => NOTE[n]);
    // bass: phách 1 và phách 3, kèm nốt đón ngay trước phách 3
    musicNote(chord[0], t, beat * 1.5, 0.3, 'triangle');
    musicNote(chord[1] / 2, t + beat * 1.5, slot, 0.16, 'triangle');
    musicNote(chord[1], t + beat * 2, beat * 1.5, 0.26, 'triangle');
    // guitar rải kiểu bolero
    for (const [s, n] of [[1, 2], [2, 3], [3, 4], [5, 2], [6, 3], [7, 4]]) musicNote(chord[n], t + s * slot, 0.55, 0.075, 'triangle', 0.003);
    // maracas: dày ở phách yếu; trống conga nhỏ đánh dấu nhịp bolero
    for (let s = 0; s < 8; s++) musicShake(t + s * slot, s % 2 ? 0.05 : 0.025);
    for (const [s, f] of [[3, 310], [4, 230], [6, 310], [7, 230]]) musicNote(f, t + s * slot, 0.12, 0.09, 'sine', 0.002);
    // giai điệu có rung nhẹ
    for (const [s, n, len] of MELODY[i]) {
      const start = t + s * slot;
      const dur = len * slot * 0.96;
      const osc = musicNote(NOTE[n], start, dur + 0.15, 0.16, 'sawtooth', 0.05);
      const lfo = new OscillatorNode(ctx, { frequency: 5.2 });
      const depth = new GainNode(ctx, { gain: NOTE[n] * 0.007 });
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(start + 0.12);
      lfo.stop(start + dur + 0.2);
    }
  };
  // xếp lịch trước vài giây; AudioContext chưa chạy thì chờ
  setInterval(() => {
    if (ctx.state !== 'running') return;
    if (at < ctx.currentTime) at = ctx.currentTime + 0.15;
    while (at < ctx.currentTime + 1.5) {
      scheduleBar(bar, at);
      at += beat * 4;
      bar = (bar + 1) % PROGRESSION.length;
    }
  }, 400);
}

// ---------- Giọng Vbee ----------
// Mỗi câu là một dãy mẩu (/tts/:id) được ghép liền bằng WebAudio: cắt khoảng lặng đầu/cuối từng mẩu
// rồi xếp sát nhau, nghe như một câu. Mẩu đã tải được giữ lại để lần sau phát tức thì.
const voiceOut = ctx.createGain();
voiceOut.gain.value = muted ? 0 : 1;
voiceOut.connect(ctx.destination);
const buffers = new Map(); // id -> Promise<AudioBuffer | null>

// Bỏ khoảng lặng đầu/cuối (biên độ < 1,5%), chừa 30 ms cho tự nhiên.
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

const speechQueue = [];
let speaking = false;
// ids: các mẩu của một câu. first: lời chúc mừng, đọc trước các câu chào đang chờ.
export function say(ids, first = false) {
  if (muted || !ids?.length) return;
  ids.forEach(load);
  if (first) speechQueue.unshift(ids);
  else if (speechQueue.length < 4) speechQueue.push(ids);
  else return;
  if (speechQueue.length > 6) speechQueue.length = 6;
  if (!speaking) playNext();
}
export const speak = (id, first) => say([id], first);

async function playNext() {
  const ids = speechQueue.shift();
  speaking = Boolean(ids);
  master.gain.setTargetAtTime(speaking ? VOLUME * 0.4 : VOLUME, ctx.currentTime, 0.1);
  if (!ids) return;
  const parts = (await Promise.all(ids.map(load))).filter(Boolean);
  let at = ctx.currentTime + 0.02;
  for (const buffer of parts) {
    const src = new AudioBufferSourceNode(ctx, { buffer });
    src.connect(voiceOut);
    src.start(at);
    at += buffer.duration + 0.04;
  }
  setTimeout(playNext, Math.max(0, (at - ctx.currentTime) * 1000) + 120);
}
