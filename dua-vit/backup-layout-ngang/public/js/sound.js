// Procedural sound effects with WebAudio: no audio files needed. Each sound has a minimum gap so a flood of
// events never turns into noise.
export class Sound {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.last = new Map();
    const unlock = () => this.context()?.resume();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  context() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
        this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  ready(name, gapMs) {
    if (!this.enabled) return null;
    const ctx = this.context();
    if (!ctx || ctx.state !== 'running') {
      ctx?.resume();
      if (!ctx || ctx.state !== 'running') return null;
    }
    const now = performance.now();
    if (now - (this.last.get(name) ?? 0) < gapMs) return null;
    this.last.set(name, now);
    return ctx;
  }

  tone(ctx, { type = 'sine', from, to = from, at = 0, dur = 0.15, vol = 0.4 }) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(ctx, { at = 0, dur = 0.3, vol = 0.3, from = 800, to = 300, type = 'bandpass', q = 1 }) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name) {
    const sounds = {
      quack: [140, (c) => {
        const pitch = 0.9 + Math.random() * 0.3;
        this.tone(c, { type: 'sawtooth', from: 520 * pitch, to: 380 * pitch, dur: 0.09, vol: 0.12 });
        this.tone(c, { type: 'square', from: 480 * pitch, to: 300 * pitch, at: 0.1, dur: 0.12, vol: 0.08 });
      }],
      splash: [120, (c) => this.noise(c, { dur: 0.35, vol: 0.25, from: 1800, to: 300 })],
      energy: [90, (c) => this.tone(c, { type: 'triangle', from: 660, to: 990, dur: 0.08, vol: 0.12 })],
      coin: [100, (c) => {
        this.tone(c, { type: 'square', from: 988, dur: 0.07, vol: 0.08 });
        this.tone(c, { type: 'square', from: 1319, at: 0.07, dur: 0.18, vol: 0.08 });
      }],
      turbo: [160, (c) => {
        this.noise(c, { dur: 0.45, vol: 0.22, from: 300, to: 3000, q: 2 });
        this.tone(c, { type: 'sawtooth', from: 200, to: 800, dur: 0.35, vol: 0.08 });
      }],
      shield: [200, (c) => this.tone(c, { type: 'sine', from: 400, to: 1200, dur: 0.3, vol: 0.18 })],
      hit: [150, (c) => {
        this.tone(c, { type: 'square', from: 200, to: 90, dur: 0.18, vol: 0.12 });
        this.noise(c, { dur: 0.2, vol: 0.2, from: 900, to: 200 });
      }],
      combo: [150, (c) => [523, 659, 784].forEach((f, i) => this.tone(c, { type: 'triangle', from: f, at: i * 0.06, dur: 0.12, vol: 0.12 }))],
      gift: [180, (c) => [784, 988, 1175, 1568].forEach((f, i) => this.tone(c, { type: 'sine', from: f, at: i * 0.07, dur: 0.2, vol: 0.14 }))],
      wind: [800, (c) => this.noise(c, { dur: 2.2, vol: 0.25, from: 400, to: 1400, q: 0.7 })],
      tsunami: [1500, (c) => {
        this.noise(c, { dur: 2.5, vol: 0.45, from: 200, to: 900, type: 'lowpass' });
        this.tone(c, { type: 'sine', from: 60, to: 40, dur: 2, vol: 0.3 });
      }],
      cheer: [1200, (c) => {
        this.noise(c, { dur: 2, vol: 0.3, from: 1200, to: 1500, q: 0.5 });
        [523, 659, 784, 1047].forEach((f, i) => this.tone(c, { type: 'square', from: f, at: i * 0.12, dur: 0.18, vol: 0.06 }));
      }],
      storm: [1200, (c) => {
        this.noise(c, { dur: 1.6, vol: 0.3, from: 3000, to: 200 });
        [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(c, { type: 'sine', from: f, at: 0.2 + i * 0.1, dur: 0.3, vol: 0.1 }));
      }],
      start: [500, (c) => {
        this.tone(c, { type: 'square', from: 440, dur: 0.2, vol: 0.12 });
        this.tone(c, { type: 'square', from: 880, at: 0.25, dur: 0.5, vol: 0.14 });
      }],
      tick: [300, (c) => this.tone(c, { type: 'square', from: 660, dur: 0.08, vol: 0.08 })],
      fanfare: [3000, (c) => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(c, { type: 'triangle', from: f, at: i * 0.14, dur: i === 5 ? 0.7 : 0.16, vol: 0.16 }))],
      firework: [180, (c) => this.noise(c, { dur: 0.5, vol: 0.22, from: 2500, to: 100, type: 'lowpass' })],
    };
    const entry = sounds[name];
    if (!entry) return;
    const ctx = this.ready(name, entry[0]);
    if (ctx) entry[1](ctx);
  }
}
