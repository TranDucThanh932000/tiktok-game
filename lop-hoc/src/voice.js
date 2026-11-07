// Thư viện mẩu giọng đọc Vbee: mỗi mẩu (một cụm từ: "Chúc mừng", tên người chơi, "câu được cá chép", "nặng 4 ký"...)
// được tạo một lần, lưu ra đĩa (data/tts/<id>.mp3) để lần bật server sau dùng lại ngay, không tốn lượt Vbee.
// Lúc cần đọc, trang game ghép các mẩu đã có sẵn nên câu được đọc tức thì, không phải chờ Vbee (~5 giây/câu).
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mp3Seconds } from '../../shared/mp3.mjs';
export { mp3Seconds };

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
