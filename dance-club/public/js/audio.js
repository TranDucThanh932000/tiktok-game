// Nhạc house tự tổng hợp bằng WebAudio (không dùng bài hát có bản quyền) + hiệu ứng âm thanh.
// Đây cũng là đồng hồ beat cho toàn bộ điệu nhảy: dancer nhún đúng phách nhạc.

const CHORDS = [
  { root: 45, notes: [57, 60, 64] }, // Am
  { root: 41, notes: [53, 57, 60] }, // F
  { root: 48, notes: [55, 60, 64] }, // C
  { root: 43, notes: [55, 59, 62] }, // G
];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  constructor({ bpm = 124, volume = 0.5, enabled = true } = {}) {
    this.bpm = bpm;
    this.volume = volume;
    this.enabled = enabled;
    this.ctx = null;
    this.level = 0; // 0 chill .. 5 legend
    this.filterTarget = 1;
    this.dropKick = false;
    this.started = false;
    this.t0 = 0;
    this.clockStart = performance.now();
    this.kickTimes = [];
  }

  // Gọi được nhiều lần; trả về true nếu âm thanh đang chạy.
  async start() {
    if (!this.enabled) return false;
    if (!this.ctx) this.setup();
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    return this.ctx.state === 'running';
  }

  get running() {
    return Boolean(this.ctx && this.ctx.state === 'running');
  }

  setup() {
    const ctx = new AudioContext({ latencyHint: 'playback' });
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.15;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.75;
    this.spectrumData = new Uint8Array(this.analyser.frequencyBinCount);
    this.spectrum = new Float32Array(48);
    master.connect(comp).connect(this.analyser).connect(ctx.destination);
    this.master = master;

    this.drums = ctx.createGain();
    this.drums.connect(master);
    this.musicBus = ctx.createGain();
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 2400;
    this.musicFilter.Q.value = 0.8;
    this.musicBus.connect(this.musicFilter).connect(master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    this.reverb.connect(wet).connect(master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.t0 = ctx.currentTime + 0.15;
    this.step = 0;
    this.nextStep = this.t0;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  impulse(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  // Beat hiện tại (số thực). Không có âm thanh thì chạy theo đồng hồ máy.
  beat() {
    if (this.running) {
      const latency = this.ctx.outputLatency || this.ctx.baseLatency || 0;
      return ((this.ctx.currentTime - latency - this.t0) * this.bpm) / 60;
    }
    return ((performance.now() - this.clockStart) / 1000) * (this.bpm / 60);
  }

  // Độ "đập" của kick 0..1 cho hiệu ứng ánh sáng.
  kick() {
    const b = this.beat();
    if (this.dropKick) return 0;
    return Math.pow(1 - (((b % 1) + 1) % 1), 4);
  }

  getSpectrum() {
    if (!this.running) return null;
    this.analyser.getByteFrequencyData(this.spectrumData);
    const n = this.spectrum.length;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.pow(i / n, 1.6) * (this.spectrumData.length * 0.7)) + 1;
      this.spectrum[i] = this.spectrumData[idx] / 255;
    }
    return this.spectrum;
  }

  setLevel(level) {
    this.level = level;
  }

  // ---------- Bộ tạo nhịp ----------

  schedule() {
    const ctx = this.ctx;
    const stepDur = 60 / this.bpm / 4;
    while (this.nextStep < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextStep);
      this.step++;
      this.nextStep += stepDur;
    }
    const target = this.filterTarget * (this.level > 0 ? 5200 : 2600);
    this.musicFilter.frequency.setTargetAtTime(Math.max(300, target), ctx.currentTime, 0.4);
  }

  playStep(step, t) {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const chord = CHORDS[bar % 4];
    const L = this.level;

    if (s % 4 === 0 && !this.dropKick) this.kickAt(t);
    if (s % 4 === 2) this.hat(t, 0.16 + 0.04 * L, true);
    if (L >= 1 && s % 2 === 1) this.hat(t, 0.05 + 0.01 * L, false);
    if (s === 4 || s === 12) this.clap(t, L >= 1 ? 0.5 : 0.22);
    if (L >= 4 && (s === 7 || s === 15) && bar % 2 === 1) this.clap(t, 0.25);

    // Bass nhịp lệch.
    if (s % 4 === 2 || (L >= 2 && s === 15)) this.bass(t, chord.root + (s === 15 ? 12 : 0), 0.22);

    // Pad mỗi ô nhịp, stab khi có biểu diễn.
    if (s === 0) this.pad(t, chord.notes, (60 / this.bpm) * 4, L === 0 ? 0.07 : 0.045);
    if (L >= 1 && (s === 3 || s === 6 || s === 10 || s === 14)) this.stab(t, chord.notes, 0.09);

    // Arp từ Hype trở lên.
    if (L >= 3) {
      const notes = [...chord.notes, chord.notes[0] + 12];
      this.arp(t, notes[(step * (L >= 5 ? 3 : 1)) % notes.length] + 12, 0.045);
    }
    if (L >= 4 && s === 0 && bar % 4 === 0) this.crash(t, 0.25);
  }

  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  kickAt(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, 0.003, 0.9, 0.38);
    o.connect(g).connect(this.drums);
    o.start(t);
    o.stop(t + 0.45);
  }

  noiseHit(t, { type = 'highpass', freq = 7000, q = 0.7, gain = 0.2, dur = 0.05, dest = this.drums }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, 0.002, gain, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    return g;
  }

  hat(t, gain, open) {
    this.noiseHit(t, { freq: open ? 6500 : 9000, gain, dur: open ? 0.16 : 0.035 });
  }

  clap(t, gain) {
    for (let i = 0; i < 3; i++) this.noiseHit(t + i * 0.011, { type: 'bandpass', freq: 1500, q: 1.2, gain: gain * (i === 2 ? 1 : 0.6), dur: i === 2 ? 0.16 : 0.02 });
    const g = this.noiseHit(t, { type: 'bandpass', freq: 1800, q: 0.8, gain: gain * 0.25, dur: 0.25, dest: this.reverb });
    void g;
  }

  bass(t, midi, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(900 + this.level * 200, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.18);
    const g = ctx.createGain();
    this.env(g, t, 0.005, gain, 0.2);
    o.connect(f).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.3);
  }

  pad(t, notes, dur, gain) {
    const ctx = this.ctx;
    for (const n of notes) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n);
        o.detune.value = det;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 1100;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(gain / 2, t + 0.4);
        g.gain.linearRampToValueAtTime(gain / 2.5, t + dur * 0.8);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(f).connect(g).connect(this.musicBus);
        g.connect(this.reverb);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  stab(t, notes, gain) {
    const ctx = this.ctx;
    for (const n of notes) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = mtof(n + 12);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(3200, t);
      f.frequency.exponentialRampToValueAtTime(600, t + 0.15);
      const g = ctx.createGain();
      this.env(g, t, 0.004, gain / notes.length, 0.16);
      o.connect(f).connect(g).connect(this.musicBus);
      g.connect(this.reverb);
      o.start(t);
      o.stop(t + 0.22);
    }
  }

  arp(t, midi, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = mtof(midi);
    const g = ctx.createGain();
    this.env(g, t, 0.003, gain, 0.1);
    o.connect(g).connect(this.musicBus);
    g.connect(this.reverb);
    o.start(t);
    o.stop(t + 0.14);
  }

  crash(t, gain) {
    this.noiseHit(t, { freq: 4000, gain, dur: 1.4, dest: this.master });
  }

  // ---------- Hiệu ứng theo màn biểu diễn ----------

  now() {
    return this.ctx.currentTime + 0.02;
  }

  riser(seconds) {
    if (!this.running) return;
    const ctx = this.ctx;
    const t = this.now();
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2.5;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + seconds);
    g.gain.linearRampToValueAtTime(0.0001, t + seconds + 0.05);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + seconds + 0.1);
  }

  impact(gain = 0.8) {
    if (!this.running) return;
    const ctx = this.ctx;
    const t = this.now();
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.8);
    const g = ctx.createGain();
    this.env(g, t, 0.005, gain, 1.0);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1.1);
    this.crash(t, 0.35 * gain);
  }

  airhorn() {
    if (!this.running) return;
    const ctx = this.ctx;
    const t0 = this.now();
    for (let k = 0; k < 3; k++) {
      const t = t0 + k * 0.17;
      const len = k === 2 ? 0.55 : 0.12;
      for (const ratio of [1, 1.26, 1.5]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(440 * ratio * 0.97, t);
        o.frequency.linearRampToValueAtTime(440 * ratio, t + 0.05);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.02);
        g.gain.setValueAtTime(0.05, t + len - 0.03);
        g.gain.linearRampToValueAtTime(0.0001, t + len);
        o.connect(g).connect(this.master);
        o.start(t);
        o.stop(t + len + 0.02);
      }
    }
  }

  sparkle() {
    if (!this.running) return;
    const ctx = this.ctx;
    const t0 = this.now();
    [84, 88, 91, 96].forEach((m, i) => {
      const t = t0 + i * 0.05;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = mtof(m);
      const g = ctx.createGain();
      this.env(g, t, 0.003, 0.08, 0.25);
      o.connect(g).connect(this.master);
      g.connect(this.reverb);
      o.start(t);
      o.stop(t + 0.3);
    });
  }

  // Tiếng đám đông hò reo (nhiễu lọc dải giọng nói, lên xuống ngẫu nhiên).
  cheer(seconds = 2.5, gain = 0.25) {
    if (!this.running) return;
    const ctx = this.ctx;
    const t = this.now();
    for (let v = 0; v < 4; v++) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 700 + v * 380 + Math.random() * 200;
      f.Q.value = 1.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain * (0.6 + Math.random() * 0.4), t + 0.25 + Math.random() * 0.2);
      g.gain.setTargetAtTime(0.0001, t + seconds * 0.6, seconds * 0.25);
      src.connect(f).connect(g).connect(this.master);
      src.start(t, Math.random() * 0.5);
      src.stop(t + seconds + 0.5);
    }
  }

  setMuffled(on) {
    this.filterTarget = on ? 0.25 : 1;
  }
}
