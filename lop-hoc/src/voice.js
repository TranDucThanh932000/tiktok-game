// Thư viện mẩu giọng đọc Vbee: mỗi mẩu (một cụm từ: "Chúc mừng", tên người chơi, "câu được cá chép", "nặng 4 ký"...)
// được tạo một lần, lưu ra đĩa (data/tts/<id>.mp3) để lần bật server sau dùng lại ngay, không tốn lượt Vbee.
// Lúc cần đọc, trang game ghép các mẩu đã có sẵn nên câu được đọc tức thì, không phải chờ Vbee (~5 giây/câu).
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const MP3_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
const MP3_KBPS_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MP3_KBPS_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

// Số giây của một file MP3 (Layer III), tính bằng cách đếm frame. Cô giáo cần con số này để biết khi nào đọc xong.
export function mp3Seconds(buf) {
  let at = 0;
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    at = 10 + (((buf[6] & 127) << 21) | ((buf[7] & 127) << 14) | ((buf[8] & 127) << 7) | (buf[9] & 127));
  }
  while (at < buf.length - 4 && !(buf[at] === 0xff && (buf[at + 1] & 0xe0) === 0xe0)) at++;
  let seconds = 0;
  while (at < buf.length - 4 && buf[at] === 0xff && (buf[at + 1] & 0xe0) === 0xe0) {
    const version = (buf[at + 1] >> 3) & 3;
    const rate = MP3_RATES[version]?.[(buf[at + 2] >> 2) & 3];
    const kbps = (version === 3 ? MP3_KBPS_V1 : MP3_KBPS_V2)[buf[at + 2] >> 4];
    if (!rate || !kbps) break;
    const samples = version === 3 ? 1152 : 576;
    seconds += samples / rate;
    at += Math.floor((samples / 8) * ((kbps * 1000) / rate)) + ((buf[at + 2] >> 1) & 1);
  }
  return seconds;
}

export function createVoice({ enabled, voice, speed, dir, synthesize, onError = () => {}, concurrency = 3 }) {
  const mem = new Map(); // id -> Buffer mp3
  const known = new Map(); // cụm từ -> id (đã có âm thanh)
  const pending = new Map(); // cụm từ -> Promise<id | null>
  if (enabled) mkdirSync(dir, { recursive: true });

  const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const idOf = (text) => createHash('sha1').update(`${voice}|${speed}|${text}`).digest('hex').slice(0, 16);
  const file = (id) => path.join(dir, `${id}.mp3`);

  function remember(map, key, value, limit) {
    map.delete(key);
    map.set(key, value);
    if (map.size > limit) map.delete(map.keys().next().value);
  }

  // Âm thanh của một mẩu (bộ nhớ, rồi tới đĩa); null nếu chưa có.
  function audio(id) {
    if (!/^[0-9a-f]{16}$/.test(String(id))) return null;
    let buf = mem.get(id);
    if (!buf) {
      try {
        buf = readFileSync(file(id));
      } catch {
        return null;
      }
      remember(mem, id, buf, 400);
    }
    return buf;
  }

  // Vbee chỉ cho vài yêu cầu cùng lúc: tối đa `concurrency` mẩu được tạo song song, còn lại xếp hàng.
  let active = 0;
  const waiting = [];
  function slot(task, urgent) {
    return new Promise((resolve, reject) => {
      const run = () => {
        active++;
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            waiting.shift()?.();
          });
      };
      if (active < concurrency) run();
      else if (urgent) waiting.unshift(run);
      else waiting.push(run);
    });
  }

  // id của mẩu nếu đã sẵn sàng để phát ngay, không thì null (không gọi Vbee).
  function ready(text) {
    const t = clean(text);
    if (!t || !enabled) return null;
    if (known.has(t)) return known.get(t);
    const id = idOf(t);
    if (!audio(id)) return null;
    remember(known, t, id, 5000);
    return id;
  }

  // Lấy (hoặc tạo) mẩu; trả về Promise<id | null>. Cùng một cụm từ đang tạo thì dùng chung một yêu cầu.
  // urgent: chen lên đầu hàng chờ (tên người chơi mới, cần trước các mẩu dùng chung).
  function clip(text, { urgent = false } = {}) {
    const t = clean(text);
    if (!t || !enabled) return Promise.resolve(null);
    const id = ready(t);
    if (id) return Promise.resolve(id);
    if (pending.has(t)) return pending.get(t);
    const newId = idOf(t);
    const job = slot(async () => {
      const buf = await synthesize(t);
      try {
        writeFileSync(file(newId), buf);
      } catch {
        // Không ghi được đĩa thì vẫn dùng bản trong bộ nhớ.
      }
      remember(mem, newId, buf, 400);
      remember(known, t, newId, 5000);
      return newId;
    }, urgent)
      .catch((err) => {
        onError(err, t);
        return null;
      })
      .finally(() => pending.delete(t));
    pending.set(t, job);
    return job;
  }

  const lengths = new Map(); // id -> mili giây
  function duration(id) {
    if (!lengths.has(id)) {
      const buf = audio(id);
      if (!buf) return 0;
      remember(lengths, id, Math.round(mp3Seconds(buf) * 1000), 5000);
    }
    return lengths.get(id);
  }

  return { enabled, clip, ready, audio, duration, busy: () => active + waiting.length };
}
