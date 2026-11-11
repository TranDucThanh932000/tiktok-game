// Âm thanh tự tổng hợp bằng Web Audio, không cần file. Sút liên hoàn thì mỗi loại tiếng bị giới hạn nhịp và nhỏ đi.
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
    master.gain.value = 0.55;
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
  kick(fast) {
    if (!gate('kick', fast ? 110 : 0)) return;
    const at = ctx.currentTime;
    const v = fast ? 0.35 : 0.7;
    tone({ at, freq: 150, to: 45, dur: 0.14, peak: v });
    noise({ at, dur: 0.04, freq: 2500, q: 0.8, peak: v * 0.4 });
  },
  goal(fast) {
    const at = ctx?.currentTime ?? 0;
    if (gate('swish', fast ? 120 : 0)) noise({ at, dur: 0.22, type: 'highpass', freq: 3000, peak: fast ? 0.15 : 0.3 });
    if (!gate('cheer', fast ? 900 : 300)) return;
    noise({ at, dur: fast ? 0.7 : 1.6, freq: 1100, q: 0.6, peak: fast ? 0.25 : 0.5, attack: 0.12 });
    noise({ at: at + 0.05, dur: fast ? 0.6 : 1.4, freq: 2400, q: 0.9, peak: fast ? 0.12 : 0.25, attack: 0.15 });
  },
  save(fast) {
    const at = ctx?.currentTime ?? 0;
    if (gate('glove', fast ? 120 : 0)) noise({ at, dur: 0.08, type: 'lowpass', freq: 700, peak: fast ? 0.3 : 0.6 });
    if (!gate('ooh', fast ? 1000 : 300)) return;
    noise({ at: at + 0.05, dur: fast ? 0.5 : 0.9, freq: 450, q: 1.4, peak: fast ? 0.2 : 0.4, attack: 0.1 });
  },
  gift() {
    if (!gate('gift', 250)) return;
    const at = ctx.currentTime;
    [784, 988, 1319].forEach((f, i) => tone({ at: at + i * 0.07, freq: f, dur: 0.25, type: 'triangle', peak: 0.25 }));
  },
  join() {
    if (!gate('join', 300)) return;
    tone({ at: ctx.currentTime, freq: 660, to: 880, dur: 0.12, type: 'triangle', peak: 0.15 });
  },
};
