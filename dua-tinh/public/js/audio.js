// Âm thanh tổng hợp bằng WebAudio, không cần file. Thêm ?mute vào địa chỉ để tắt tiếng.
const muted = new URLSearchParams(location.search).has('mute');
const VOLUME = muted ? 0 : 0.6;
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

// Đông người thì tiếng điểm danh dồn dập; giới hạn để không ồn.
let lastJoin = 0;

export const sfx = {
  // có người điểm danh
  join() {
    if (ctx.currentTime - lastJoin < 0.12) return;
    lastJoin = ctx.currentTime;
    notes([988, 1319], 0.06, 0.14, 0.06, 'triangle');
  },
  // có quà, quà to thì dài và vang hơn
  gift: (big) => (big ? notes([784, 988, 1175, 1568, 1976, 2349], 0.07, 0.5, 0.15) : notes([1047, 1319, 1568], 0.07, 0.36, 0.12)),
  // quà gửi trước khi chọn tỉnh
  pending: () => notes([880, 1175], 0.1, 0.3, 0.1, 'triangle'),
  // đổi ngôi đầu
  lead: () => notes([523, 659, 784, 1047, 784, 1047, 1319], 0.1, 0.42, 0.17, 'triangle'),
  // vòng mới
  reset: () => notes([392, 523, 659, 784], 0.12, 0.4, 0.14, 'triangle'),
  // đố chữ: câu mới, mở thêm chữ, trả lời đúng (người đầu tiên thì vang hơn), công bố đáp án
  quizAsk: () => notes([659, 880, 1175], 0.09, 0.3, 0.1, 'triangle'),
  quizLetter: () => notes([1568], 0.05, 0.12, 0.05, 'sine'),
  quizCorrect(first) {
    if (first) return notes([784, 1047, 1319, 1568], 0.07, 0.34, 0.13, 'triangle');
    if (ctx.currentTime - lastJoin < 0.12) return;
    lastJoin = ctx.currentTime;
    notes([1175, 1568], 0.06, 0.16, 0.07, 'triangle');
  },
  quizReveal: () => notes([523, 784, 1047], 0.11, 0.42, 0.12, 'triangle'),
};

// ---------- Giọng MC: các mẩu /tts/:id phát nối nhau ----------
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

// clips: [{ id }]. Server đã lo để không có hai câu chồng nhau.
// onStart chạy lúc bắt đầu nói, onDone lúc nói xong hoặc bị cắt ngang.
export async function speak({ clips, cut }, { onStart, onDone } = {}) {
  if (cut) stopSpeech();
  if (!clips?.length) return;
  const mine = run;
  const parts = await Promise.all(clips.map((clip) => load(clip.id)));
  if (mine !== run) return;
  doneCallback?.();
  doneCallback = onDone ?? null;
  const begin = ctx.currentTime + 0.02;
  let at = begin;
  clips.forEach((clip, i) => {
    const buffer = parts[i];
    if (!buffer) return;
    const src = new AudioBufferSourceNode(ctx, { buffer });
    src.connect(voiceOut);
    playing.add(src);
    src.onended = () => playing.delete(src);
    src.start(at);
    at += buffer.duration + (clip.gap ?? 0.04);
  });
  onStart?.();
  master.gain.setTargetAtTime(VOLUME * 0.45, begin, 0.1);
  timers.push(
    setTimeout(() => {
      master.gain.setTargetAtTime(VOLUME, ctx.currentTime, 0.2);
      doneCallback?.();
      doneCallback = null;
    }, (at - ctx.currentTime) * 1000 + 400),
  );
}
