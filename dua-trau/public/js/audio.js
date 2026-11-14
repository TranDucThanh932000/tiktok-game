// Âm thanh tự tổng hợp bằng Web Audio, không cần file. Comment dồn dập thì mỗi loại tiếng bị giới hạn nhịp.
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
    master.gain.value = 0.5;
    master.connect(ctx.destination);
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

function noise({ at, dur, type = 'bandpass', freq = 1000, q = 1, peak = 0.5, attack = 0.01 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  env(gain, at, peak, attack, dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(at, Math.random());
  src.stop(at + attack + dur + 0.05);
}

function tone({ at, freq, to = freq, dur, type = 'sine', peak = 0.4 }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + dur);
  const gain = ctx.createGain();
  env(gain, at, peak, 0.005, dur);
  osc.connect(gain).connect(master);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

export const sfx = {
  // Tiếng vó trâu nhỏ cho mỗi comment.
  step() {
    if (!gate('step', 90)) return;
    const at = ctx.currentTime;
    tone({ at, freq: 220 + Math.random() * 80, to: 90, dur: 0.08, type: 'triangle', peak: 0.18 });
    noise({ at, dur: 0.05, type: 'lowpass', freq: 600, peak: 0.12 });
  },
  gift(big) {
    if (!gate('gift', 200)) return;
    const at = ctx.currentTime;
    const notes = big ? [784, 988, 1175, 1568] : [784, 988, 1319];
    notes.forEach((f, i) => tone({ at: at + i * 0.07, freq: f, dur: 0.25, type: 'triangle', peak: 0.25 }));
    noise({ at, dur: 0.35, type: 'highpass', freq: 2500, peak: 0.08 });
  },
  lead() {
    if (!gate('lead', 1500)) return;
    const at = ctx.currentTime;
    [523, 659, 784].forEach((f, i) => tone({ at: at + i * 0.09, freq: f, dur: 0.18, type: 'square', peak: 0.08 }));
  },
  tick(final) {
    if (!gate('tick', 500)) return;
    tone({ at: ctx.currentTime, freq: final ? 1320 : 880, dur: 0.07, type: 'square', peak: 0.12 });
  },
  start() {
    if (!gate('start', 1000)) return;
    const at = ctx.currentTime;
    tone({ at, freq: 440, dur: 0.6, type: 'sawtooth', peak: 0.12 });
    tone({ at, freq: 554, dur: 0.6, type: 'sawtooth', peak: 0.1 });
    noise({ at: at + 0.05, dur: 0.9, freq: 1200, q: 0.6, peak: 0.25, attack: 0.1 });
  },
  win() {
    if (!gate('win', 2000)) return;
    const at = ctx.currentTime;
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone({ at: at + i * 0.13, freq: f, dur: i === 5 ? 0.7 : 0.16, type: 'triangle', peak: 0.3 }));
    noise({ at: at + 0.1, dur: 1.8, freq: 1100, q: 0.5, peak: 0.35, attack: 0.2 });
  },
};

// ---------- Giọng đọc tên nước khi có quà ----------
// Mỗi nước một mẩu mp3 tạo sẵn ở server. Combo quà gửi liên tục thì cùng một nước không đọc lại trong `gapMs`,
// hàng chờ giữ tối đa `maxQueue` nước, để giọng không bị dồn và trễ xa so với quà.
const voice = { buffers: new Map(), loading: new Map(), queue: [], playing: null, lastStart: new Map(), gapMs: 2500, maxQueue: 2 };

export function setVoice({ clips = {}, gapMs, maxQueue } = {}) {
  if (gapMs != null) voice.gapMs = gapMs;
  if (maxQueue != null) voice.maxQueue = maxQueue;
  if (muted) return;
  for (const [nation, id] of Object.entries(clips)) {
    const url = `/voice/${id}.mp3`;
    if (voice.loading.get(nation) === url) continue;
    voice.loading.set(nation, url);
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        audioReady();
        return ctx.decodeAudioData(data);
      })
      .then((buffer) => voice.buffers.set(nation, trimSilence(buffer)))
      .catch((err) => console.warn(`Không tải được giọng đọc ${nation}: ${err.message}`));
  }
}

// Vbee để khoảng lặng hơn 1 giây sau mỗi câu; cắt đi (chừa 40 ms) để hàng chờ đọc nước kế tiếp ngay.
function trimSilence(buffer, threshold = 0.012, padMs = 40) {
  const data = buffer.getChannelData(0);
  let start = 0;
  let end = data.length - 1;
  while (start < end && Math.abs(data[start]) < threshold) start++;
  while (end > start && Math.abs(data[end]) < threshold) end--;
  const pad = Math.round((buffer.sampleRate * padMs) / 1000);
  start = Math.max(0, start - pad);
  end = Math.min(data.length, end + pad);
  if (end - start < buffer.sampleRate * 0.1) return buffer;
  const out = ctx.createBuffer(buffer.numberOfChannels, end - start, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) out.copyToChannel(buffer.getChannelData(c).subarray(start, end), c);
  return out;
}

export function sayNation(nation) {
  if (muted || !ctx || ctx.state !== 'running' || !voice.buffers.has(nation)) return;
  if (voice.playing === nation || voice.queue.includes(nation)) return;
  if (performance.now() - (voice.lastStart.get(nation) ?? -Infinity) < voice.gapMs) return;
  voice.queue.push(nation);
  // Hàng chờ dài quá thì bỏ nước cũ nhất, ưu tiên quà mới nhất.
  while (voice.queue.length > voice.maxQueue) voice.queue.shift();
  if (!voice.playing) playNext();
}

function playNext() {
  const nation = voice.queue.shift();
  if (!nation) {
    voice.playing = null;
    return;
  }
  voice.playing = nation;
  voice.lastStart.set(nation, performance.now());
  const src = ctx.createBufferSource();
  src.buffer = voice.buffers.get(nation);
  const gain = ctx.createGain();
  gain.gain.value = 1.6;
  src.connect(gain).connect(master);
  src.onended = playNext;
  src.start();
}
