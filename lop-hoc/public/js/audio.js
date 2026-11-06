// Âm thanh tổng hợp bằng WebAudio, không cần file. Thêm ?mute vào địa chỉ để tắt tiếng.
const muted = new URLSearchParams(location.search).has('mute');
const VOLUME = muted ? 0 : 0.7;
const ctx = new AudioContext();
const master = new GainNode(ctx, { gain: VOLUME });
master.connect(ctx.destination);
const voiceOut = new GainNode(ctx, { gain: muted ? 0 : 1 });
voiceOut.connect(ctx.destination);
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
  // chuông trường báo câu mới
  bell: () => notes([880, 1175, 880, 1175], 0.13, 0.32, 0.17, 'triangle'),
  // đếm ngược 5 giây cuối
  tick: () => tone(1320, ctx.currentTime, 0.06, 0.14, 'square'),
  // có người giơ tay
  tap: () => tone(1500, ctx.currentTime, 0.05, 0.07, 'triangle'),
  // có người vào lớp
  join: () => notes([660, 990], 0.08, 0.16, 0.16, 'triangle'),
  // nhường chỗ
  leave: () => tone(520, ctx.currentTime, 0.28, 0.14, 'triangle', 220),
  // công bố có người đúng
  right: () => notes([784, 988, 1175, 1568], 0.09, 0.42, 0.17),
  // không ai đúng
  none: () => notes([392, 330], 0.2, 0.4, 0.15, 'triangle'),
  // lượt x2
  boost: () => notes([1047, 1319, 1568, 2093], 0.06, 0.32, 0.15),
  // lên chức
  fanfare: () => notes([523, 659, 784, 1047, 784, 1047, 1319], 0.1, 0.42, 0.19, 'triangle'),
  // cả lớp vỗ tay: nhiều tiếng vỗ ngắn chồng lên nhau, nhỏ dần
  applause() {
    const t = ctx.currentTime;
    for (let i = 0; i < 70; i++) {
      const start = t + Math.random() * 2.2;
      const src = new AudioBufferSourceNode(ctx, { buffer: noise });
      const filter = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1400 + Math.random() * 1800, Q: 1.1 });
      const gain = ctx.createGain();
      const peak = 0.34 * (1 - (start - t) / 2.6);
      gain.gain.setValueAtTime(peak, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);
      src.connect(filter).connect(gain).connect(master);
      src.start(start, Math.random() * 1.5, 0.08);
    }
  },
};

const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
{
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

// ---------- Giọng cô giáo: các mẩu /tts/:id phát nối nhau ----------
const buffers = new Map(); // id -> Promise<AudioBuffer | null>

// Bỏ khoảng lặng đầu/cuối, chừa 30 ms cho tự nhiên.
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

let run = 0;
let timers = [];
const playing = new Set();
let doneCallback = null;

export function stopSpeech() {
  run++;
  timers.forEach(clearTimeout);
  timers = [];
  for (const src of playing) src.stop();
  playing.clear();
  master.gain.setTargetAtTime(VOLUME, ctx.currentTime, 0.1);
  doneCallback?.();
  doneCallback = null;
}

// clips: [{ id, opt?, sfx? }]. Server đã lo để không có hai câu chồng nhau.
// onClip chạy lúc từng mẩu bắt đầu, onDone lúc nói xong hoặc bị cắt ngang.
export async function speak({ clips, cut, delayMs = 0 }, { onClip, onDone } = {}) {
  if (cut) stopSpeech();
  if (!clips?.length) return;
  const mine = run;
  const parts = await Promise.all(clips.map((clip) => load(clip.id)));
  if (mine !== run) return;
  doneCallback?.();
  doneCallback = onDone ?? null;
  const begin = ctx.currentTime + delayMs / 1000 + 0.02;
  let at = begin;
  clips.forEach((clip, i) => {
    const buffer = parts[i];
    if (!buffer) return;
    const src = new AudioBufferSourceNode(ctx, { buffer });
    src.connect(voiceOut);
    playing.add(src);
    src.onended = () => playing.delete(src);
    src.start(at);
    timers.push(setTimeout(() => onClip?.(clip), (at - ctx.currentTime) * 1000));
    at += buffer.duration + 0.04;
  });
  master.gain.setTargetAtTime(VOLUME * 0.45, begin, 0.1);
  timers.push(
    setTimeout(() => {
      master.gain.setTargetAtTime(VOLUME, ctx.currentTime, 0.2);
      doneCallback?.();
      doneCallback = null;
    }, (at - ctx.currentTime) * 1000),
  );
}
