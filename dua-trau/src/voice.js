// Giọng đọc tên nước khi có quà. Chỉ có vài câu cố định nên tạo sẵn hết lúc bật server bằng Vbee,
// lưu ra data/tts/<mã>.mp3 để lần sau dùng lại ngay, không tốn lượt Vbee. Đổi câu hay đổi giọng thì mã đổi theo, tự tạo lại.
import path from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

export function vbeeFromEnv(env = process.env) {
  const vbee = {
    token: env.VBEE_TOKEN?.trim(),
    appId: env.VBEE_APP_ID?.trim(),
    voice: env.VBEE_VOICE?.trim() || 'n_hanoi_male_nhabaohoangnam_news_vc',
    speed: Number(env.VBEE_SPEED) || 1,
  };
  vbee.enabled = Boolean(vbee.token && vbee.appId);
  return vbee;
}

export const clipId = (vbee, text) => createHash('sha1').update(`${vbee.voice}|${vbee.speed}|${text}`).digest('hex').slice(0, 16);

async function vbeeJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body.error ?? body).slice(0, 300)}`);
  return body;
}

// Gói Vbee không phải lúc nào cũng có chế độ đọc ngay, nên tạo việc rồi hỏi lại đến khi xong (giống các game khác).
async function synthesize(vbee, text) {
  const headers = { Authorization: `Bearer ${vbee.token}`, 'App-Id': vbee.appId };
  const job = await vbeeJson('https://api.vbee.vn/v1/tts', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceCode: vbee.voice, mode: 'async', outputFormat: 'mp3', speed: vbee.speed, webhookUrl: 'https://callback.invalid/vbee' }),
  });
  if (!job.requestId) throw new Error(`Vbee không trả requestId: ${JSON.stringify(job).slice(0, 300)}`);
  for (let attempt = 0; attempt < 66; attempt++) {
    await sleep(300);
    const result = await vbeeJson(`https://api.vbee.vn/v1/tts/requests/${encodeURIComponent(job.requestId)}`, { headers });
    if (result.status === 'FAILED') throw new Error(`Vbee báo FAILED: ${JSON.stringify(result).slice(0, 300)}`);
    if (result.status === 'COMPLETED' && result.audioLink) {
      const audio = await fetch(result.audioLink, { signal: AbortSignal.timeout(15_000) });
      if (!audio.ok) throw new Error(`Tải audio lỗi HTTP ${audio.status}`);
      return Buffer.from(await audio.arrayBuffer());
    }
  }
  throw new Error('Quá 20 giây Vbee chưa trả audio');
}

// lines: { mã nước: câu đọc }. Trả về { mã nước: mã file mp3 } của các câu đã có (tạo thiếu thì gọi Vbee).
export async function prepareLines({ vbee, lines, dir, log = console.log }) {
  const ready = {};
  if (!vbee.enabled) return ready;
  mkdirSync(dir, { recursive: true });
  const missing = [];
  for (const [key, text] of Object.entries(lines)) {
    const id = clipId(vbee, text);
    if (existsSync(path.join(dir, `${id}.mp3`))) ready[key] = id;
    else missing.push([key, text, id]);
  }
  if (!missing.length) return ready;
  log(`[Vbee] Đang tạo ${missing.length} câu đọc tên nước, chỉ lần đầu...`);
  await Promise.all(
    missing.map(async ([key, text, id]) => {
      try {
        writeFileSync(path.join(dir, `${id}.mp3`), await synthesize(vbee, text));
        ready[key] = id;
      } catch (err) {
        log(`[Vbee] Lỗi đọc "${text}": ${err.message}`);
      }
    }),
  );
  log(`[Vbee] Xong: ${Object.keys(ready).length}/${Object.keys(lines).length} câu`);
  return ready;
}
