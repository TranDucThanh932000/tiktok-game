// Game sounds made in code, no audio files. Every action has its own sound; samples play softer than real turns.
const noiseCache = new WeakMap();
function noiseBuffer(ctx) {
  if (noiseCache.has(ctx)) return noiseCache.get(ctx);
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseCache.set(ctx, buffer);
  return buffer;
}

function tone(ctx, out, at, frequency, { level = 0.3, decay = 0.2, type = 'sine', glide = 0 } = {}) {
  const osc = new OscillatorNode(ctx, { type, frequency });
  if (glide) osc.frequency.exponentialRampToValueAtTime(glide, at + decay * 0.8);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(level, at + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0005, at + decay);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + decay + 0.01);
}

function air(ctx, out, at, { seconds = 0.1, level = 0.3, frequency = 2000, to = 0, q = 1 } = {}) {
  const src = new AudioBufferSourceNode(ctx, { buffer: noiseBuffer(ctx) });
  const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency, Q: q });
  if (to) band.frequency.exponentialRampToValueAtTime(to, at + seconds);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(level, at + Math.min(0.03, seconds * 0.3));
  env.gain.exponentialRampToValueAtTime(0.0005, at + seconds);
  src.connect(band).connect(env).connect(out);
  src.start(at, Math.random() * 0.5, seconds + 0.01);
}

const notes = (ctx, out, at, list, gap, options) => list.forEach((frequency, index) => {
  tone(ctx, out, at + index * gap, frequency, options);
  tone(ctx, out, at + index * gap, frequency * 2.01, { ...options, level: (options.level ?? 0.3) * 0.25, decay: (options.decay ?? 0.2) * 0.5 });
});

// One glass ball touching another: a tiny tap, then two bright partials that die quickly.
export function marbleClick(ctx, out, at, { level = 0.5, pitch = 1, pan = 0 } = {}) {
  const panner = new StereoPannerNode(ctx, { pan });
  panner.connect(out);
  air(ctx, panner, at, { seconds: 0.012, level: level * 0.55, frequency: 3800 * pitch, q: 1.2 });
  tone(ctx, panner, at, 2900 * pitch, { level: level * 0.7, decay: 0.05 });
  tone(ctx, panner, at, 4840 * pitch, { level: level * 0.35, decay: 0.028 });
}

export const SOUNDS = {
  // A viewer tapped likes: a small soft pop.
  like: (ctx, out, at) => tone(ctx, out, at, 720, { level: 0.6, decay: 0.1, glide: 1250 }),
  // Enough likes for a turn.
  turn: (ctx, out, at) => notes(ctx, out, at, [1046.5, 1318.51], 0.09, { level: 0.3, decay: 0.3, type: 'triangle' }),
  // Each gift sounds bigger than the one below it.
  'gift-like': (ctx, out, at) => notes(ctx, out, at, [1318.51], 0.08, { level: 0.28, decay: 0.3 }),
  'gift-rose': (ctx, out, at) => notes(ctx, out, at, [1174.66, 1567.98], 0.08, { level: 0.3, decay: 0.4 }),
  'gift-heart': (ctx, out, at) => notes(ctx, out, at, [1174.66, 1567.98, 2093], 0.075, { level: 0.32, decay: 0.45 }),
  'gift-pig': (ctx, out, at) => {
    notes(ctx, out, at, [1046.5, 1318.51, 1567.98, 2093, 2637.02], 0.07, { level: 0.34, decay: 0.55 });
    [0, 0.09, 0.2].forEach(delay => tone(ctx, out, at + delay, 3520, { level: 0.14, decay: 0.16, type: 'square' }));
  },
  // The machine wakes up and balls drop into the hoppers.
  start: (ctx, out, at) => {
    tone(ctx, out, at, 70, { level: 0.3, decay: 0.75, type: 'sawtooth', glide: 190 });
    air(ctx, out, at, { seconds: 0.6, level: 0.1, frequency: 500, to: 1500 });
    for (let i = 0; i < 6; i += 1) marbleClick(ctx, out, at + 0.2 + i * 0.09, { level: 0.4, pitch: 0.75 + i * 0.05 });
  },
  // A sample steps aside for a real viewer.
  cut: (ctx, out, at) => air(ctx, out, at, { seconds: 0.32, level: 1.1, frequency: 700, to: 4200, q: 0.8 }),
  // The portrait is finished.
  done: (ctx, out, at) => notes(ctx, out, at, [1567.98, 2093, 2637.02], 0.11, { level: 0.4, decay: 0.55 }),
  // The finished box lands on the belt, only for a real viewer's portrait.
  // Phone speakers lose the low thud, so the cardboard slap carries it there.
  box: (ctx, out, at) => {
    tone(ctx, out, at, 190, { level: 0.8, decay: 0.16, glide: 85 });
    air(ctx, out, at, { seconds: 0.11, level: 1, frequency: 1100, q: 0.7 });
  },
  pause: (ctx, out, at) => notes(ctx, out, at, [660, 440], 0.1, { level: 0.3, decay: 0.18, type: 'triangle' }),
  resume: (ctx, out, at) => notes(ctx, out, at, [440, 660], 0.1, { level: 0.3, decay: 0.18, type: 'triangle' }),
  connected: (ctx, out, at) => notes(ctx, out, at, [659.25, 830.61, 987.77], 0.09, { level: 0.3, decay: 0.3, type: 'triangle' }),
  lost: (ctx, out, at) => notes(ctx, out, at, [392, 311.13], 0.16, { level: 0.3, decay: 0.3, type: 'triangle' }),
  tap: (ctx, out, at) => air(ctx, out, at, { seconds: 0.03, level: 0.7, frequency: 2400, q: 1.4 }),
};

// Some sounds would annoy if every event played one: likes can arrive many times a second.
const MIN_GAP = { like: 0.13, tap: 0.04 };
const DEFAULT_GAP = 0.09;

// Which sounds a change of game state calls for. Connection news is for the operator, never the LIVE window.
export function soundsForChange(previous, next, { isOverlay = false } = {}) {
  if (!previous) return [];
  const names = [];
  const seen = new Set(previous.activity.map(item => item.id));
  for (const item of [...next.activity].reverse()) {
    if (seen.has(item.id)) continue;
    if (item.kind === 'gift') names.push(`gift-${item.tier ?? 'rose'}`);
    else if (item.kind === 'like') names.push(item.tickets ? 'turn' : 'like');
  }
  if (next.active && next.active.id !== previous.active?.id) {
    if (previous.active?.viewer.source === 'sample' && next.active.viewer.source !== 'sample') names.push('cut');
    names.push('start');
  }
  if (next.paused !== previous.paused) names.push(next.paused ? 'pause' : 'resume');
  if (!isOverlay) {
    const was = previous.connection?.phase;
    const now = next.connection?.phase;
    if (was !== 'connected' && now === 'connected') names.push('connected');
    if (was === 'connected' && now !== 'connected') names.push('lost');
  }
  return [...new Set(names)];
}

export function soundBus(ctx, destination, volume = 0.6) {
  const gain = ctx.createGain();
  gain.gain.value = volume;
  const squeeze = new DynamicsCompressorNode(ctx, { threshold: -14, ratio: 6, attack: 0.002, release: 0.12 });
  gain.connect(squeeze).connect(destination);
  return gain;
}

// Thousands of balls land in nine seconds; a click for each would be a buzz, so finer grids only click faster.
export const clicksPerSecond = columns => 8 + columns / 4;

const VOLUME = 0.7;
const SAMPLE_VOLUME = 0.38;

export class GameSound {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
    this.ctx = null;
    this.bus = null;
    this.nextClick = 0;
    this.lastPlayed = new Map();
    this.soft = false;
  }

  wake() {
    if (!this.enabled) return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.bus = soundBus(this.ctx, this.ctx.destination, this.soft ? SAMPLE_VOLUME : VOLUME);
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  get playing() {
    return this.enabled && this.ctx?.state === 'running';
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) this.wake();
  }

  // Samples run for hours, so they stay in the background; real viewers stand out.
  setSoft(soft) {
    this.soft = soft;
    if (this.bus) this.bus.gain.setTargetAtTime(soft ? SAMPLE_VOLUME : VOLUME, this.ctx.currentTime, 0.05);
  }

  play(name) {
    if (!this.playing || !SOUNDS[name]) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < (MIN_GAP[name] ?? DEFAULT_GAP)) return;
    this.lastPlayed.set(name, now);
    SOUNDS[name](this.ctx, this.bus, now + 0.005);
  }

  land(count, columns) {
    if (count <= 0 || !this.playing) return;
    const now = this.ctx.currentTime;
    if (now < this.nextClick) return;
    this.nextClick = now + (0.55 + Math.random() * 0.9) / clicksPerSecond(columns);
    marbleClick(this.ctx, this.bus, now + 0.002, {
      level: 0.35 + Math.random() * 0.35,
      pitch: 0.82 + Math.random() * 0.5,
      pan: Math.random() * 1.2 - 0.6,
    });
  }
}
