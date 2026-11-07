// Tiếng khán đài do code tạo ra, không dùng file ngoài: vỗ tay, hò hét, huýt sáo.
// Không phụ thuộc trang game, nên bảng điều khiển phát thử được và có thể render offline để đo.

const clapCache = new WeakMap();
// Tiếng vỗ tay thưa và đã lọc nên rất nhỏ so với giọng MC; bù lại ở đây, đo bằng render offline.
const APPLAUSE_BOOST = 4;

// Một tràng vỗ tay dài 6 giây: rất nhiều tiếng vỗ ngắn ngẫu nhiên, trải rộng hai kênh trái phải.
function clapBuffer(ctx, density) {
  let perDensity = clapCache.get(ctx);
  if (!perDensity) clapCache.set(ctx, (perDensity = new Map()));
  if (perDensity.has(density)) return perDensity.get(density);
  const seconds = 6;
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(2, seconds * rate, rate);
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
  for (let clap = 0; clap < density * seconds; clap++) {
    const start = Math.floor(Math.random() * (seconds - 0.05) * rate);
    const span = Math.floor((0.005 + Math.random() * 0.016) * rate);
    const loudness = 0.2 + Math.random() ** 2 * 0.8;
    const pan = Math.random();
    let previous = 0;
    for (let i = 0; i < span; i++) {
      const white = Math.random() * 2 - 1;
      const bright = white - 0.82 * previous; // Bỏ bớt tiếng trầm để nghe ra tiếng tay vỗ, không phải tiếng mưa.
      previous = white;
      const sample = bright * loudness * Math.exp((-5 * i) / span);
      channels[0][start + i] += sample * (1 - pan);
      channels[1][start + i] += sample * pan;
    }
  }
  let peak = 0;
  for (const data of channels) for (const value of data) peak = Math.max(peak, Math.abs(value));
  for (const data of channels) for (let i = 0; i < data.length; i++) data[i] /= peak || 1;
  perDensity.set(density, buffer);
  return buffer;
}

export function applause(ctx, out, at, { seconds = 3, level = 0.5, density = 110 } = {}) {
  const buffer = clapBuffer(ctx, density);
  const src = new AudioBufferSourceNode(ctx, { buffer });
  const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 2400, Q: 0.45 });
  const env = ctx.createGain();
  const rise = Math.min(0.3, seconds * 0.15);
  const fall = Math.min(1.6, seconds * 0.45);
  const loud = level * APPLAUSE_BOOST;
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(loud, at + rise);
  env.gain.setValueAtTime(loud, at + seconds - fall);
  env.gain.linearRampToValueAtTime(0, at + seconds);
  src.connect(band).connect(env).connect(out);
  src.start(at, Math.random() * Math.max(0, buffer.duration - seconds), seconds);
}

const VOWELS = [[750, 1250], [550, 1850], [650, 1500]];

// Hò hét: nhiều giọng cùng kêu "ê", cao độ vọt lên rồi hạ xuống, mỗi người vào lệch nhau một chút.
export function cheer(ctx, out, at, { seconds = 4, level = 0.4, voices = 12 } = {}) {
  const mix = ctx.createGain();
  mix.gain.value = level / Math.sqrt(voices);
  const soft = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 3600, Q: 0.4 });
  mix.connect(soft).connect(out);
  for (let voice = 0; voice < voices; voice++) {
    const base = voice % 2 ? 150 + Math.random() * 90 : 250 + Math.random() * 170;
    const begin = at + Math.random() * 0.55;
    const length = seconds * (0.55 + Math.random() * 0.4);
    const end = begin + length;
    const osc = new OscillatorNode(ctx, { type: 'sawtooth', frequency: base * 0.8 });
    osc.frequency.linearRampToValueAtTime(base * 1.18, begin + 0.35);
    osc.frequency.linearRampToValueAtTime(base * 1.05, begin + length * 0.7);
    osc.frequency.linearRampToValueAtTime(base * 0.82, end);
    const wobble = new OscillatorNode(ctx, { frequency: 4.5 + Math.random() * 3 });
    const depth = ctx.createGain();
    depth.gain.value = base * 0.018;
    wobble.connect(depth).connect(osc.frequency);
    const [low, high] = VOWELS[voice % VOWELS.length];
    const one = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: low, Q: 4 });
    const two = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: high, Q: 5 });
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, begin);
    env.gain.linearRampToValueAtTime(1, begin + 0.14);
    env.gain.setValueAtTime(1, begin + length * 0.6);
    env.gain.linearRampToValueAtTime(0, end);
    const panner = new StereoPannerNode(ctx, { pan: Math.random() * 1.6 - 0.8 });
    osc.connect(one).connect(env);
    osc.connect(two).connect(env);
    env.connect(panner).connect(mix);
    osc.start(begin);
    wobble.start(begin);
    osc.stop(end + 0.05);
    wobble.stop(end + 0.05);
  }
}

// Huýt sáo cổ vũ kiểu sân vận động: một nốt cao vút lên dứt khoát, có chút hơi gió.
// Không dùng kiểu lên-xuống "trêu gái", vì người trên sân khấu có thể thấy bị trêu chọc.
export function whistle(ctx, out, at, { level = 0.2, pan = 0, pitch = 1, twice = false } = {}) {
  const blow = (begin, top, length) => {
    const osc = new OscillatorNode(ctx, { type: 'sine', frequency: 1900 * top });
    osc.frequency.exponentialRampToValueAtTime(3050 * top, begin + 0.12);
    osc.frequency.linearRampToValueAtTime(3250 * top, begin + length);
    const wobble = new OscillatorNode(ctx, { frequency: 9 + Math.random() * 3 });
    const depth = ctx.createGain();
    depth.gain.value = 26 * top;
    wobble.connect(depth).connect(osc.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, begin);
    env.gain.linearRampToValueAtTime(level, begin + 0.05);
    env.gain.setValueAtTime(level, begin + length - 0.08);
    env.gain.linearRampToValueAtTime(0, begin + length);
    const panner = new StereoPannerNode(ctx, { pan });
    osc.connect(env).connect(panner).connect(out);
    osc.start(begin);
    wobble.start(begin);
    osc.stop(begin + length + 0.02);
    wobble.stop(begin + length + 0.02);
    // Hơi gió đi kèm để nghe ra tiếng thổi, không phải tiếng máy.
    const samples = Math.floor(ctx.sampleRate * length);
    const air = ctx.createBuffer(1, samples, ctx.sampleRate);
    const data = air.getChannelData(0);
    for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
    const src = new AudioBufferSourceNode(ctx, { buffer: air });
    const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 3100 * top, Q: 6 });
    const airEnv = ctx.createGain();
    airEnv.gain.setValueAtTime(0, begin);
    airEnv.gain.linearRampToValueAtTime(level * 0.5, begin + 0.05);
    airEnv.gain.linearRampToValueAtTime(0, begin + length);
    src.connect(band).connect(airEnv).connect(panner);
    src.start(begin);
  };
  blow(at, pitch, 0.55);
  if (twice) blow(at + 0.68, pitch * 1.04, 0.7);
}

const randomPan = () => Math.random() * 1.4 - 0.7;

// Thời lượng từng mức, để không chồng quá nhiều lớp lên nhau.
export const CROWD_LENGTH = { small: 1.3, polite: 3, medium: 2.8, big: 6 };

export function crowd(ctx, out, at, kind) {
  if (kind === 'small') applause(ctx, out, at, { seconds: CROWD_LENGTH.small, level: 0.3, density: 28 });
  else if (kind === 'polite') applause(ctx, out, at, { seconds: CROWD_LENGTH.polite, level: 0.3, density: 40 });
  else if (kind === 'medium') {
    applause(ctx, out, at, { seconds: CROWD_LENGTH.medium, level: 0.45, density: 90 });
    whistle(ctx, out, at + 0.25 + Math.random() * 0.5, { level: 0.16, pan: randomPan(), pitch: 0.92 + Math.random() * 0.16 });
  } else if (kind === 'big') {
    applause(ctx, out, at, { seconds: CROWD_LENGTH.big, level: 0.6, density: 140 });
    cheer(ctx, out, at + 0.1, { seconds: 4.2, level: 0.9 });
    whistle(ctx, out, at + 0.2, { level: 0.2, pan: -0.5, pitch: 1.02 });
    whistle(ctx, out, at + 0.95, { level: 0.18, pan: 0.55, pitch: 0.92, twice: true });
    whistle(ctx, out, at + 2.1, { level: 0.15, pan: randomPan(), pitch: 1.08 });
  }
}

// Bus chung có nén để nhiều tiếng chồng lên nhau không bị vỡ.
export function crowdBus(ctx, destination) {
  const gain = ctx.createGain();
  const squeeze = new DynamicsCompressorNode(ctx, { threshold: -16, ratio: 5, attack: 0.004, release: 0.2 });
  gain.connect(squeeze).connect(destination);
  return gain;
}
