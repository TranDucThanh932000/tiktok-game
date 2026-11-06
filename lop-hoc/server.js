import path from 'node:path';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseEnv } from 'node:util';
import express from 'express';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { Classroom } from './src/classroom.js';
import { createQuestions, validateBank } from './src/questions.js';
import { Teacher } from './src/teacher.js';
import { createVoice } from './src/voice.js';

const root = import.meta.dirname;
const config = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const bank = JSON.parse(readFileSync(path.join(root, 'questions.json'), 'utf8'));
const teacherLines = JSON.parse(readFileSync(path.join(root, 'teacher.json'), 'utf8'));
const username = (process.argv[2] ?? config.tiktokUsername ?? '').trim().replace(/^@/, '');
// DATA_DIR để chạy thử song song mà không đụng lớp đang có; giọng đọc vẫn dùng chung để khỏi tốn lượt Vbee.
const dataDir = process.env.DATA_DIR?.trim() || path.join(root, 'data');
const port = Number(process.env.PORT) || config.port || 3008;
const host = '127.0.0.1';

const bankProblems = validateBank(bank);
if (bankProblems.length) throw new Error(`questions.json: ${bankProblems.join('; ')}`);

const guide = {
  title: config.title,
  seats: config.seats,
  tiers: config.boost.tiers.map(({ coins, turns, label, icon }) => ({ coins, turns, label, icon })),
  socialTurns: config.boost.socialTurns,
};

const vbee = {
  token: process.env.VBEE_TOKEN?.trim(),
  appId: process.env.VBEE_APP_ID?.trim(),
  voice: process.env.VBEE_VOICE?.trim() || 'hn_female_ngochuyen_full_48k-fhg',
  speed: Number(process.env.VBEE_SPEED) || 1,
};
vbee.enabled = Boolean(vbee.token && vbee.appId);

const clients = new Set();
let status = {
  connected: false,
  text: username ? `Chuẩn bị kết nối @${username}` : 'Chế độ thử: chưa đặt kênh TikTok',
};

const send = (res, message) => res.write(`data: ${JSON.stringify(message)}\n\n`);
const broadcast = (message) => clients.forEach((res) => send(res, message));

function setStatus(connected, text) {
  status = { connected, text };
  console.log(`[TikTok] ${text}`);
  broadcast({ type: 'status', ...status });
}

// Safe mode silences the teacher until the host turns it off; the class keeps running.
let safeMode = false;
function setSafeMode(on, reason) {
  if (safeMode === on) return;
  safeMode = on;
  console.log(`[Chế độ an toàn] ${on ? `Bật: ${reason}` : 'Tắt'}`);
  broadcast({ type: 'safe-mode', on });
  if (on) teacher.stop();
}

// ---------- Giọng cô giáo ----------
const voice = createVoice({
  enabled: vbee.enabled,
  voice: vbee.voice,
  speed: vbee.speed,
  dir: path.join(root, 'data', 'tts'),
  synthesize,
  onError(err, text) {
    console.error(`[Vbee] Lỗi đọc "${text}": ${err.message}`);
    broadcast({ type: 'speak-error', message: err.message });
  },
});

async function vbeeJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body.error ?? body).slice(0, 300)}`);
  return body;
}

// Realtime (sync) mode is not in every Vbee package, so create a batch job and poll it; no public webhook needed.
async function synthesize(text) {
  const headers = { Authorization: `Bearer ${vbee.token}`, 'App-Id': vbee.appId };
  const job = await vbeeJson('https://api.vbee.vn/v1/tts', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceCode: vbee.voice, mode: 'async', outputFormat: 'mp3', speed: vbee.speed, webhookUrl: 'https://callback.invalid/vbee' }),
  });
  if (!job.requestId) throw new Error(`Vbee không trả requestId: ${JSON.stringify(job).slice(0, 300)}`);
  for (let attempt = 0; attempt < 66; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 300));
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

const teacher = new Teacher({
  voice,
  lines: teacherLines,
  enabled: () => !safeMode,
  emit: broadcast,
  tiers: config.boost.tiers,
  subjects: [...new Set(bank.map((row) => row.s))],
});

// ---------- Lớp học ----------
const STATE_FILE = path.join(dataDir, 'class.json');
const room = new Classroom(config, {
  questions: createQuestions(bank),
  director: teacher,
  emit(msg) {
    broadcast(msg);
    teacher.onEvent(msg);
    if (msg.type === 'join') console.log(`[Vào lớp] ${msg.student.name}${msg.kicked ? ` thay chỗ ${msg.kicked.name} (${msg.kicked.score} điểm)` : ''} · sĩ số ${msg.count}`);
    if (msg.type === 'reveal') console.log(`[Câu ${room.no}] ${msg.results.filter((r) => r.ok).length}/${msg.results.length} bạn đúng`);
  },
});
teacher.attach(room);
try {
  room.importState(JSON.parse(readFileSync(STATE_FILE, 'utf8')));
  console.log(`Đã nạp lớp cũ: ${room.count} học sinh, đang ở câu ${room.no}`);
} catch {
  // Chưa có lớp cũ.
}
function saveState() {
  if (!room.stateDirty) return;
  room.stateDirty = false;
  try {
    mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    writeFileSync(`${STATE_FILE}.tmp`, JSON.stringify(room.exportState()));
    renameSync(`${STATE_FILE}.tmp`, STATE_FILE);
  } catch (err) {
    console.error(`[Lớp] Không lưu được: ${err.message}`);
  }
}
setInterval(saveState, 3000);
setInterval(() => {
  room.tick();
  teacher.tick();
}, 100);

// Đáp án và "vào" do lớp xử lý, comment còn lại cô đáp theo từ khóa.
function handleComment(who, text) {
  if (!room.comment(who, text)) teacher.reply(who, text);
}

function warmVoice() {
  const texts = teacher.staticParts();
  const missing = texts.filter((text) => !voice.ready(text));
  // Câu sắp hỏi được chen lên trước, để không phải chờ cả bộ lời thoại.
  teacher.prepareUpcoming(3);
  if (!missing.length) return console.log(`[Vbee] Đã có sẵn ${texts.length} mẩu lời cô`);
  console.log(`[Vbee] Đang tạo ${missing.length} mẩu lời cô, chỉ lần đầu...`);
  Promise.all(missing.map((text) => voice.clip(text))).then((ids) => console.log(`[Vbee] Xong lời cô: ${ids.filter(Boolean).length}/${missing.length} mẩu`));
}

function viewer(user) {
  const raw = String(user?.nickname || user?.displayId || user?.uniqueId || '').replace(/\s+/g, ' ').trim();
  const name = Array.from(raw).slice(0, 20).join('') || 'Ẩn danh';
  return { id: String(user?.userId || user?.id || user?.displayId || user?.uniqueId || name), name };
}

const lastSeen = new Map();
function cooledDown(key, ms) {
  const now = Date.now();
  if (now - (lastSeen.get(key) ?? 0) < ms) return false;
  lastSeen.delete(key);
  lastSeen.set(key, now);
  if (lastSeen.size > 20_000) lastSeen.delete(lastSeen.keys().next().value);
  return true;
}

// Combo gifts resend a running total; only the increase is new. msgId drops exact duplicates.
class GiftCounter {
  constructor() {
    this.streaks = new Map();
    this.seen = new Set();
  }

  count({ msgId, userId, giftId, groupId, repeatCount, repeatEnd, combo }) {
    if (msgId) {
      if (this.seen.has(msgId)) return 0;
      this.seen.add(msgId);
      if (this.seen.size > 5000) this.seen.delete(this.seen.values().next().value);
    }
    const repeat = Math.max(1, Number(repeatCount) || 1);
    if (!combo) return repeat;
    const key = `${userId}:${giftId}:${groupId}`;
    const previous = this.streaks.get(key) ?? 0;
    const count = repeat >= previous ? repeat - previous : repeat;
    if (repeatEnd) this.streaks.delete(key);
    else this.streaks.set(key, Math.max(previous, repeat));
    if (this.streaks.size > 2000) this.streaks.delete(this.streaks.keys().next().value);
    return count;
  }
}

// ---------- TikTok warnings, Telegram ----------
// TikTok may push moderation notices into the room: violation warnings, punishments, presence checks.
// Exact names: look-alikes such as WebcastGiftDynamicRestrictionMessage (hidden gifts) or battle punishments are routine.
const MODERATION_TYPES = new Set(['WebcastPerceptionMessage', 'WebcastNoticeMessage', 'WebcastPartnershipPunishMessage', 'WebcastRoomVerifyMessage']);
const alerts = [];
const textOf = (t) => (typeof t === 'string' ? t : t?.defaultPattern || '');
// TikTok also pushes these messages with every field empty; those are not warnings.
const hasContent = (value) =>
  Array.isArray(value) ? value.some(hasContent) : value && typeof value === 'object' ? Object.values(value).some(hasContent) : Boolean(value) && value !== '0';

function reportModeration(type, data) {
  const punish = data.punishInfo ?? {};
  const dialog = data.dialog ?? data.perceptionDialog ?? {};
  const parts = [punish.showReason, punish.punishReason, dialog.title, dialog.subTitle, dialog.policyTip, data.noticeTitle, data.noticeContent, data.violationReason, data.content, data.tips, data.toast, data.floatText, data.common?.displayText];
  const text = parts.map(textOf).filter((part) => part && part !== '0').join(' · ').slice(0, 300) || type;
  console.warn(`[TikTok cảnh báo] ${type}: ${text}`);
  const raw = JSON.stringify(data, (key, value) => (typeof value === 'bigint' ? String(value) : value));
  appendFileSync(path.join(root, 'moderation.log'), `${new Date().toISOString()} ${type} ${raw}\n`);
  const alert = { at: Date.now(), text };
  alerts.push(alert);
  if (alerts.length > 10) alerts.shift();
  broadcast({ type: 'moderation', ...alert });
  setSafeMode(true, 'có cảnh báo TikTok');
  // The same warning repeated within 10 minutes is sent to Telegram once.
  if (cooledDown(`telegram:${text}`, 600_000)) {
    const time = new Date(alert.at).toLocaleTimeString('vi-VN');
    alertTelegram(`⚠️ TikTok cảnh báo phiên live @${username} lúc ${time}\n${text}\nĐã tự bật chế độ an toàn, cô giáo tạm im. Hãy kiểm tra hộp thư TikTok.`);
  }
}

// Read from .env on every send, so Telegram details can change without a restart.
function telegramConfig() {
  let file = {};
  try {
    file = parseEnv(readFileSync(path.join(root, '.env'), 'utf8'));
  } catch {
    // No .env file: use the process environment only.
  }
  const read = (key) => String(file[key] ?? process.env[key] ?? '').trim();
  return { token: read('TELEGRAM_BOT_TOKEN'), chatId: read('TELEGRAM_ADMIN_CHAT_ID') };
}

// Returns an error message, or '' once sent. The token is part of the URL, so the URL is never logged.
async function sendTelegram(text) {
  const { token, chatId } = telegramConfig();
  if (!token || !chatId) return 'Thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_ADMIN_CHAT_ID trong .env';
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return '';
    const body = await res.json().catch(() => ({}));
    return `Telegram báo lỗi ${res.status}: ${body.description ?? ''}`.trim();
  } catch (err) {
    return `Không gửi được Telegram: ${err.message}`;
  }
}

// Telegram can be unreachable from this network for minutes at a time.
async function alertTelegram(text) {
  for (let attempt = 1; attempt <= 30; attempt++) {
    const error = await sendTelegram(text);
    if (!error) {
      if (attempt > 1) console.log(`[Telegram] Đã gửi được cảnh báo ở lần thử thứ ${attempt}`);
      return;
    }
    if (attempt === 1) console.error(`[Telegram] ${error}. Sẽ thử lại mỗi phút trong 30 phút.`);
    await sleep(60_000);
  }
  console.error('[Telegram] Sau 30 phút vẫn không gửi được cảnh báo, bỏ qua.');
}

// ---------- TikTok LIVE ----------
// Diamonds from real TikTok gifts in the current LIVE room (panel test gifts don't count); reconnects keep the count.
let session = { roomId: '', diamonds: 0, gifts: 0, since: 0 };
const giftCounter = new GiftCounter();

function connectTikTok() {
  const conn = new TikTokLiveConnection(username, { processInitialData: false });

  conn.on(ControlEvent.DECODED_DATA, (type, event) => {
    const data = event?.data ?? event ?? {};
    const { common, ...fields } = data;
    // Control messages (pause, end...) count only when they carry a punishment.
    const warning = type === 'WebcastControlMessage' ? [data.punishInfo, data.perceptionDialog] : MODERATION_TYPES.has(type) ? [fields, common?.displayText] : [];
    if (hasContent(warning)) reportModeration(type, data);
  });
  conn.on(WebcastEvent.CHAT, (e) => handleComment(viewer(e.user), String(e.comment ?? e.content ?? '').slice(0, 200)));
  conn.on(WebcastEvent.GIFT, (e) => {
    if (!e.gift && !e.giftDetails) return;
    const gift = e.giftDetails ?? e.gift;
    const count = giftCounter.count({
      msgId: e.common?.msgId ? String(e.common.msgId) : '',
      userId: e.user?.userId ?? e.user?.id,
      giftId: e.giftId,
      groupId: e.groupId,
      repeatCount: e.repeatCount,
      repeatEnd: Number(e.repeatEnd) === 1,
      combo: Number(gift.giftType ?? gift.type) === 1,
    });
    if (count <= 0) return;
    const who = viewer(e.user);
    const coins = Number(gift.diamondCount) || 0;
    console.log(`[Quà] ${who.name}: ${String(gift.giftName ?? gift.name ?? '').slice(0, 40)} (${coins} xu) x${count}`);
    session.diamonds += coins * count;
    session.gifts += count;
    broadcast({ type: 'session', ...session });
    room.gift(who, coins, count);
  });
  conn.on(WebcastEvent.FOLLOW, (e) => room.social(viewer(e.user), 'follow'));
  conn.on(WebcastEvent.SHARE, (e) => room.social(viewer(e.user), 'share'));
  conn.on(WebcastEvent.STREAM_END, ({ action }) => {
    console.log(`[Phiên live] Tổng: ${session.diamonds.toLocaleString('vi-VN')} kim cương từ ${session.gifts} quà`);
    // Action 4: TikTok suspended the LIVE (3 is the host ending it).
    if (action === 4) reportModeration('StreamSuspended', { tips: 'TikTok đã đình chỉ phiên live' });
    setStatus(false, action === 4 ? `TikTok đã đình chỉ phiên live của @${username}` : `@${username} đã kết thúc live`);
  });
  conn.on(ControlEvent.ERROR, (err) => console.error('[TikTok]', err?.message ?? err));
  conn.on(ControlEvent.DISCONNECTED, () => retry(10_000, 'Mất kết nối TikTok'));

  let timer;
  let busy = false;
  function retry(ms, reason) {
    setStatus(false, `${reason}, thử lại sau ${ms / 1000} giây`);
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  }
  async function run() {
    if (busy || conn.isConnected) return;
    busy = true;
    try {
      setStatus(false, `Đang chờ @${username} lên live...`);
      await conn.waitUntilLive(30);
      const state = await conn.connect();
      if (state.roomId !== session.roomId) {
        session = { roomId: state.roomId, diamonds: 0, gifts: 0, since: Date.now() };
        broadcast({ type: 'session', ...session });
      }
      setStatus(true, `Đã kết nối live @${username} (room ${state.roomId})`);
    } catch (err) {
      retry(30_000, `Lỗi: ${err?.message ?? err}`);
    } finally {
      busy = false;
    }
  }
  run();
}

// ---------- Web server ----------
const app = express();
app.disable('x-powered-by');
// Only answer requests addressed to this machine (blocks DNS rebinding).
app.use((req, res, next) => (['127.0.0.1', 'localhost'].includes(req.hostname) ? next() : res.status(403).end()));
app.use(express.static(path.join(root, 'public')));
app.use(express.json({ limit: '4kb' }));

app.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  send(res, { type: 'snapshot', status, guide, alerts, session, safeMode, tts: { enabled: vbee.enabled, voice: vbee.voice }, bankSize: bank.length, game: room.snapshot() });
  clients.add(res);
  res.on('close', () => clients.delete(res));
});
setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 20_000);

app.get('/tts/:id', (req, res) => {
  const audio = voice.audio(req.params.id);
  if (!audio) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type('audio/mpeg').send(audio);
});

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || min));

// JSON-only endpoints: browsers cannot send application/json cross-site without a CORS preflight.
app.post('/api/simulate', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const { kind, name, text, count, coins } = req.body ?? {};
  const nickname = typeof name === 'string' && name.trim() ? name : 'Bạn thử';
  const who = viewer({ id: `sim:${nickname}`, nickname });
  if (kind === 'chat') handleComment(who, String(text ?? '').slice(0, 200));
  else if (kind === 'gift') room.gift(who, clampInt(coins, 1, 100_000), clampInt(count, 1, 999));
  else if (kind === 'follow' || kind === 'share') room.social(who, kind);
  else return res.status(400).json({ error: 'kind không hợp lệ' });
  res.status(204).end();
});

app.post('/api/skip', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  room.skip();
  res.status(204).end();
});

app.post('/api/reset', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  room.reset();
  saveState();
  console.log('[Lớp] Đã mở lớp mới');
  res.status(204).end();
});

app.post('/api/safe-mode', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  setSafeMode(req.body?.on === true, 'bật tay từ bảng điều khiển');
  res.status(204).end();
});

app.post('/api/telegram-test', async (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const error = await sendTelegram('✅ Lớp Học đã kết nối Telegram. Nếu TikTok cảnh báo phiên live, tin sẽ được gửi vào đây.');
  res.json({ message: error || 'Đã gửi tin thử, bạn kiểm tra Telegram nhé.' });
});

app.listen(port, host, (err) => {
  if (err) throw err;
  console.log(`Màn hình game:   http://${host}:${port}/`);
  console.log(`Bảng điều khiển: http://${host}:${port}/panel.html`);
  console.log(`Bộ câu hỏi: ${bank.length} câu`);
  const { token, chatId } = telegramConfig();
  console.log(token && chatId ? 'Báo cảnh báo qua Telegram: bật' : 'Báo cảnh báo qua Telegram: tắt (thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_ADMIN_CHAT_ID trong .env)');
  if (!vbee.enabled) console.log('Vbee: tắt, cô giáo không có tiếng (thiếu VBEE_TOKEN hoặc VBEE_APP_ID trong .env)');
  else {
    console.log(`Cô giáo đọc bằng giọng ${vbee.voice}`);
    warmVoice();
  }
  if (username) connectTikTok();
  else console.log('Chưa đặt kênh TikTok (npm start -- ten_kenh, hoặc tiktokUsername trong config.json). Đang ở chế độ thử.');
});

process.on('SIGINT', () => {
  saveState();
  process.exit(0);
});
