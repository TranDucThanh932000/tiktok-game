// Tạo sẵn giọng "Tiểu nhị, 1 ..." cho từng món × từng giọng Vbee, lưu vào public/voice/.
// Chạy: node scripts/make-voices.mjs [đường-dẫn-.env]   (mặc định .env của nhau-online)
// File đã có thì bỏ qua, nên chạy lại không tốn token. Muốn tạo lại một câu thì xóa file mp3 đó.
// Đổi callSpeed trong config.json thì toàn bộ file được tạo lại theo tốc độ mới.
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const root = path.join(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const envFile = process.argv[2] ?? path.join(root, '.env');
const env = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
const token = String(env.VBEE_TOKEN ?? process.env.VBEE_TOKEN ?? '').trim();
const appId = String(env.VBEE_APP_ID ?? process.env.VBEE_APP_ID ?? '').trim();
if (!token || !appId) {
  console.error(`Thiếu VBEE_TOKEN hoặc VBEE_APP_ID (đọc từ ${envFile})`);
  process.exit(1);
}
const headers = { Authorization: `Bearer ${token}`, 'App-Id': appId };
const outDir = path.join(root, 'public', 'voice');
mkdirSync(outDir, { recursive: true });

// Vbee đọc số "1" không chắc đúng, nên gửi chữ "một" còn bong bóng thoại vẫn ghi "1".
const spoken = (text) => text.replace(/\b1\b/g, 'một');
const fileName = (item, voice) => `${item}__${voice.replace(/[^a-z0-9_-]/gi, '_')}.mp3`;

async function json(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body.error ?? body).slice(0, 200)}`);
  return body;
}

const speed = Number(config.callSpeed) || 1;
const metaFile = path.join(outDir, 'voices-meta.json');
const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
const regenerate = (meta.speed ?? 1) !== speed;
if (regenerate) console.log(`Tốc độ đổi từ ${meta.speed ?? 1} sang ${speed}: tạo lại toàn bộ giọng.`);

async function synthesize(text, voice) {
  const job = await json('https://api.vbee.vn/v1/tts', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceCode: voice, mode: 'async', outputFormat: 'mp3', speed, webhookUrl: 'https://callback.invalid/vbee' }),
  });
  if (!job.requestId) throw new Error(`Không có requestId: ${JSON.stringify(job).slice(0, 200)}`);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const r = await json(`https://api.vbee.vn/v1/tts/requests/${encodeURIComponent(job.requestId)}`, { headers });
    if (r.status === 'FAILED') throw new Error(`Vbee báo FAILED`);
    if (r.status === 'COMPLETED' && r.audioLink) {
      const audio = await fetch(r.audioLink, { signal: AbortSignal.timeout(15_000) });
      if (!audio.ok) throw new Error(`Tải audio lỗi HTTP ${audio.status}`);
      return Buffer.from(await audio.arrayBuffer());
    }
  }
  throw new Error('Quá 20 giây chưa có audio');
}

const voices = config.callVoices ?? [];
const manifest = {};
let made = 0;
let failed = 0;
for (const entry of config.menu) {
  if (!entry.call) continue;
  manifest[entry.item] = [];
  for (const voice of voices) {
    const file = fileName(entry.item, voice);
    const full = path.join(outDir, file);
    if (regenerate || !existsSync(full)) {
      try {
        writeFileSync(full, await synthesize(spoken(entry.call), voice));
        made++;
        console.log(`✔ ${file}  "${entry.call}"`);
      } catch (err) {
        failed++;
        console.error(`✖ ${file}: ${err.message}`);
        continue;
      }
    }
    manifest[entry.item].push(file);
  }
}
writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
if (!failed) writeFileSync(metaFile, `${JSON.stringify({ speed }, null, 2)}\n`);
console.log(`Xong: tạo mới ${made}, lỗi ${failed}. Danh sách ở public/voice/manifest.json`);
