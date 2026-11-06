// Âm thanh tổng hợp bằng WebAudio (không có file): tiếng bút sột soạt, dấu đóng, chuông, cồng. Giọng Vbee (/tts/:id) phát lần lượt.
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

const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
{
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
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

// Bút lông quệt trên giấy: tiếng xào xạc to nhỏ theo tốc độ ngòi bút.
let brushGain = null;
function startBrush() {
  if (brushGain || muted) return;
  const src = new AudioBufferSourceNode(ctx, { buffer: noise, loop: true });
  const filter = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 3200, Q: 0.7 });
  brushGain = new GainNode(ctx, { gain: 0 });
  src.connect(filter).connect(brushGain).connect(master);
  src.start();
}
export function setBrush(level) {
  startBrush();
  brushGain?.gain.setTargetAtTime(Math.min(1, level) * 0.11, ctx.currentTime, 0.03);
}

export const sfx = {
  // dấu đóng xuống bàn gỗ
  seal() {
    const t = ctx.currentTime;
    tone(150, t, 0.22, 0.75, 'sine', 55);
    tone(420, t, 0.05, 0.3, 'square', 180);
  },
  // chuông nhỏ cho lời chúc an lành
  chime() {
    const t = ctx.currentTime;
    [988, 1319, 1760].forEach((f, i) => tone(f, t + i * 0.09, 0.8, 0.14));
  },
  // cồng cho lời đa tạ
  gong() {
    const t = ctx.currentTime;
    for (const [f, peak] of [[98, 0.5], [147, 0.3], [233, 0.2], [311, 0.13], [466, 0.08]]) tone(f, t, 2.6, peak, 'sine', f * 0.985);
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, t + 0.25 + i * 0.1, 0.9, 0.11));
  },
  // có người vừa vào hàng chờ
  tick() {
    tone(1240, ctx.currentTime, 0.09, 0.1, 'triangle');
  },
};

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

const speechQueue = [];
const playing = new Set();
let speechRun = 0;
let speechTimer = 0;
let speaking = false;
export const isSpeaking = () => speaking;

// ids: các mẩu của một câu. first: tờ có xu, đọc trước các câu đang chờ.
export function say(ids, first = false) {
  if (muted || !ids?.length) return;
  ids.forEach(load);
  if (first) speechQueue.unshift(ids);
  else if (speechQueue.length < 4) speechQueue.push(ids);
  else return;
  if (speechQueue.length > 6) speechQueue.length = 6;
  if (!speaking) playNext();
}

// Cắt ngay câu đang đọc và các câu đang chờ, để người thật không phải nghe nốt tờ tự chạy.
export function cutSpeech() {
  speechRun++;
  speechQueue.length = 0;
  clearTimeout(speechTimer);
  for (const src of playing) src.stop();
  playing.clear();
  speaking = false;
  master.gain.setTargetAtTime(VOLUME, ctx.currentTime, 0.1);
}

async function playNext() {
  const ids = speechQueue.shift();
  speaking = Boolean(ids);
  master.gain.setTargetAtTime(speaking ? VOLUME * 0.45 : VOLUME, ctx.currentTime, 0.1);
  if (!ids) return;
  const run = speechRun;
  const parts = (await Promise.all(ids.map(load))).filter(Boolean);
  if (run !== speechRun) return;
  let at = ctx.currentTime + 0.02;
  for (const buffer of parts) {
    const src = new AudioBufferSourceNode(ctx, { buffer });
    src.connect(voiceOut);
    playing.add(src);
    src.onended = () => playing.delete(src);
    src.start(at);
    at += buffer.duration + 0.04;
  }
  speechTimer = setTimeout(playNext, Math.max(0, (at - ctx.currentTime) * 1000) + 120);
}
