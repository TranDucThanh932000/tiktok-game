// Âm thanh tổng hợp bằng WebAudio (không có file): tiếng nước, chim hót, dế đêm, mưa, gió, sấm, bõm nước, guồng quay, nhạc thắng/thua.
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

// nền: nước róc rách + thác xa; mưa và gió to nhỏ theo thời tiết
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
  noiseLoop('bandpass', 500, 0.6, 0.025);
  noiseLoop('bandpass', 1600, 0.6, 0.012);
  rainHigh = noiseLoop('highpass', 1400, 0.4, 0).g;
  rainLow = noiseLoop('bandpass', 420, 0.7, 0).g;
  ({ g: windGain, f: windFilter } = noiseLoop('bandpass', 300, 1.4, 0));
  setWeatherSound(weather);
  // ban ngày chim hót, ban đêm dế kêu (mưa thì im)
  setInterval(() => {
    if (ctx.state !== 'running' || Math.random() < 0.5 || weather.rain > 0.25) return;
    const t = ctx.currentTime;
    if (weather.night > 0.6) {
      const base = 4200 + Math.random() * 500;
      for (let r = 0; r < 2 + Math.floor(Math.random() * 2); r++) {
        for (let i = 0; i < 3; i++) tone(base, t + r * 0.32 + i * 0.055, 0.035, 0.018, 'sine');
      }
      return;
    }
    if (weather.night > 0.3) return;
    const base = 2200 + Math.random() * 1400;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) tone(base, t + i * 0.13, 0.1, 0.03, 'sine', base * 1.35);
  }, 4000);
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
