// Âm thanh tổng hợp bằng WebAudio, không cần file. Thêm ?mute vào địa chỉ để tắt tiếng.
const muted = new URLSearchParams(location.search).has('mute');
const ctx = new AudioContext();
const master = new GainNode(ctx, { gain: muted ? 0 : 0.7 });
master.connect(ctx.destination);
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

const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
{
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

// Tiếng xào xạc lọc qua một bộ lọc, from -> to là tần số đầu và cuối.
function hiss(start, duration, peak, type, from, to) {
  const src = new AudioBufferSourceNode(ctx, { buffer: noise });
  const filter = new BiquadFilterNode(ctx, { type, frequency: from, Q: 1.2 });
  if (to) filter.frequency.exponentialRampToValueAtTime(to, start + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter).connect(gain).connect(master);
  src.start(start, Math.random(), duration + 0.05);
}

export const sfx = {
  // có người vào phe
  join: () => notes([660, 990], 0.08, 0.16, 0.13, 'triangle'),
  // từ mới
  word: () => notes([523, 784], 0.08, 0.22, 0.12, 'triangle'),
  // mở thêm một chữ
  hint: () => notes([1320, 1760], 0.07, 0.2, 0.1),
  // đá núi bay trúng
  rock() {
    const t = ctx.currentTime;
    tone(140, t, 0.4, 0.45, 'sine', 45);
    hiss(t, 0.3, 0.5, 'lowpass', 900, 200);
  },
  // nước dội trúng
  splash() {
    const t = ctx.currentTime;
    hiss(t, 0.55, 0.45, 'bandpass', 2600, 500);
    tone(700, t, 0.3, 0.12, 'sine', 180);
  },
  // tiếng vút lúc ném
  whoosh: () => hiss(ctx.currentTime, 0.5, 0.18, 'bandpass', 600, 2400),
  // hết giờ một từ
  timeout: () => notes([392, 311], 0.18, 0.35, 0.13, 'triangle'),
  // quà tới
  gift: () => notes([1047, 1319, 1568, 2093], 0.06, 0.3, 0.13),
  // trống mở hiệp
  drum() {
    const t = ctx.currentTime;
    [0, 0.18, 0.36, 0.62].forEach((at, i) => {
      tone(i === 3 ? 90 : 120, t + at, 0.35, i === 3 ? 0.6 : 0.4, 'sine', 50);
      hiss(t + at, 0.12, 0.2, 'lowpass', 500);
    });
  },
  // thắng hiệp
  fanfare: () => notes([523, 659, 784, 1047, 784, 1047], 0.12, 0.45, 0.17, 'triangle'),
  // hòa
  draw: () => notes([523, 523, 392], 0.2, 0.35, 0.13, 'triangle'),
  // rước Mị Nương
  wedding: () => notes([659, 784, 880, 1047, 880, 1047, 1175, 1319, 1568], 0.16, 0.5, 0.16, 'triangle'),
  // 10 giây cuối hiệp
  tick: () => tone(1320, ctx.currentTime, 0.06, 0.12, 'square'),
};
