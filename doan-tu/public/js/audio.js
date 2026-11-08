// Âm thanh tổng hợp bằng WebAudio, không cần file. Thêm ?mute vào địa chỉ để tắt tiếng.
const muted = new URLSearchParams(location.search).has('mute');
const VOLUME = muted ? 0 : 0.7;
const ctx = new AudioContext();
const master = new GainNode(ctx, { gain: VOLUME });
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

export const sfx = {
  // chuông trường báo từ mới
  bell: () => notes([880, 1175, 880, 1175], 0.13, 0.32, 0.17, 'triangle'),
  // đếm ngược 5 giây cuối
  tick: () => tone(1320, ctx.currentTime, 0.06, 0.14, 'square'),
  // mở thêm một chữ
  letter: () => notes([700, 1050], 0.07, 0.18, 0.13, 'triangle'),
  // có người đoán đúng
  right: () => notes([988, 1319], 0.06, 0.2, 0.12),
  // người đầu tiên đoán ra
  first: () => notes([784, 988, 1175, 1568], 0.09, 0.42, 0.17),
  // không ai đoán ra
  none: () => notes([392, 330], 0.2, 0.4, 0.15, 'triangle'),
  // lượt x2
  boost: () => notes([1047, 1319, 1568, 2093], 0.06, 0.32, 0.15),
  // công bố đáp án có người đúng
  fanfare: () => notes([523, 659, 784, 1047, 784, 1047, 1319], 0.1, 0.42, 0.19, 'triangle'),
  // vào top lớp: tiếng "pop"
  pop: () => tone(520, ctx.currentTime, 0.12, 0.14, 'triangle', 1040),
};
