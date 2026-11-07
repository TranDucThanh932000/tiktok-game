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

// Tiếng chuông: các họa âm không chẵn của chuông đồng, tắt dần chậm.
function bellStrike(at, base, peak) {
  for (const [ratio, level, decay] of [[0.5, 0.5, 4], [1, 1, 3.2], [1.19, 0.45, 2.4], [1.5, 0.35, 2], [2, 0.5, 1.6], [2.74, 0.25, 1.1], [3.76, 0.15, 0.8]]) {
    tone(base * ratio, at, decay, peak * level, 'sine');
  }
}

let lastBlip = 0;

export const sfx = {
  // có người lên sàn
  join: () => notes([660, 990], 0.08, 0.16, 0.1, 'triangle'),
  // câu hỏi mới
  ask: () => notes([784, 1047, 1319], 0.1, 0.35, 0.12, 'triangle'),
  // có người chốt đáp án (nhiều người cùng lúc thì chỉ kêu thưa)
  blip() {
    const t = ctx.currentTime;
    if (t - lastBlip < 0.12) return;
    lastBlip = t;
    tone(1500 + Math.random() * 300, t, 0.06, 0.05, 'sine');
  },
  // 5 giây cuối
  tick: () => tone(1320, ctx.currentTime, 0.06, 0.12, 'square'),
  // công bố đáp án
  reveal: () => notes([523, 659, 784, 1047], 0.07, 0.4, 0.14, 'triangle'),
  // có người rời sàn
  out: () => notes([392, 330, 262], 0.14, 0.35, 0.12, 'triangle'),
  // cả sàn cùng sai
  phew: () => {
    const t = ctx.currentTime;
    tone(300, t, 0.5, 0.15, 'sine', 900);
  },
  // cứu trợ
  rescue: () => notes([880, 660, 880, 660, 880, 1175], 0.13, 0.22, 0.12, 'square'),
  // vào câu hỏi vàng
  golden: () => notes([523, 659, 784, 1047, 1319, 1568], 0.12, 0.5, 0.15, 'triangle'),
  // người quay lại sàn
  back: () => notes([523, 784, 1047, 1568], 0.08, 0.3, 0.13),
  // quà tới
  gift: () => notes([1047, 1319, 1568, 2093], 0.06, 0.3, 0.12),
  // rung chuông vàng
  bell() {
    const t = ctx.currentTime;
    [0, 0.7, 1.4, 2.1].forEach((at) => bellStrike(t + at, 523, 0.22));
    notes([523, 659, 784, 1047, 784, 1047, 1319, 1568], 0.18, 0.5, 0.1, 'triangle');
  },
  // dừng ở câu hỏi vàng
  fail: () => notes([523, 494, 466, 440], 0.25, 0.5, 0.13, 'triangle'),
  // cùng về đích
  finish: () => notes([523, 659, 784, 1047, 784, 1047], 0.12, 0.45, 0.15, 'triangle'),
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

// clips: [{ id, opt?, sfx? }]. Server đã lo để không có hai câu chồng nhau.
// onClip chạy lúc từng mẩu bắt đầu, onDone lúc nói xong hoặc bị cắt ngang. Lúc MC nói, tiếng hiệu ứng nhỏ lại.
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
