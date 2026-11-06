import path from 'node:path';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseEnv } from 'node:util';
import express from 'express';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { Ledger } from './src/ledger.js';
import { createVoice } from './src/voice.js';
import { readableName } from './src/spoken.js';

const root = import.meta.dirname;
const config = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const username = (process.argv[2] ?? config.tiktokUsername ?? '').trim().replace(/^@/, '');
const port = Number(process.env.PORT) || config.port || 3007;
const host = '127.0.0.1';

const problems = [
  [Number.isInteger(config.likesForName) && config.likesForName >= 1, 'likesForName là số tim để được ghi tên, số nguyên từ 1 trở lên'],
  [Array.isArray(config.tiers) && config.tiers.some((t) => t.minCoins === 0), 'tiers cần một mức minCoins = 0 cho người thả tim'],
  [config.tiers?.every((t) => t.id && t.board && t.seal && t.holdMs > 0), 'mỗi mức trong tiers cần id, board, seal, holdMs'],
  [config.wishes?.length > 0 && config.thanks?.length > 0, 'wishes và thanks cần ít nhất một câu'],
  [Number.isInteger(config.fairEvery) && config.fairEvery >= 1, 'fairEvery là số nguyên từ 1 trở lên'],
  [config.rush?.backlog >= 1 && config.rush.nameSpeed >= 1 && config.rush.paidSpeed >= 1, 'rush cần backlog ≥ 1, nameSpeed ≥ 1, paidSpeed ≥ 1'],
  [
    !config.demo ||
      (config.demo.idleSeconds > 0 && config.demo.gapSeconds?.[0] > 0 && config.demo.gapSeconds[1] >= config.demo.gapSeconds[0] && config.demo.inviteEvery >= 1 && config.demo.inviteSeconds > 0 && config.tiers.some((t) => config.demo.weights?.[t.id] > 0)),
    'demo cần idleSeconds > 0, gapSeconds [ít nhất, nhiều nhất], inviteEvery ≥ 1, inviteSeconds > 0 và ít nhất một mức trong weights lớn hơn 0',
  ],
].filter(([ok]) => !ok);
if (problems.length) throw new Error(`config.json: ${problems.map(([, text]) => text).join('; ')}`);

const guide = {
  likesForName: config.likesForName,
  tiers: config.tiers.map(({ id, minCoins, board, icon }) => ({ id, minCoins, board, icon })),
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

// Safe mode silences the Vbee voice until the host turns it off.
let safeMode = false;
function setSafeMode(on, reason) {
  if (safeMode === on) return;
  safeMode = on;
  console.log(`[Chế độ an toàn] ${on ? `Bật: ${reason}` : 'Tắt'}`);
  broadcast({ type: 'safe-mode', on });
}

function setStatus(connected, text) {
  status = { connected, text };
  console.log(`[TikTok] ${text}`);
  broadcast({ type: 'status', ...status });
}

// ---------- Sổ ghi danh ----------
const LEDGER_FILE = path.join(root, 'data', 'ledger.json');
const people = JSON.parse(readFileSync(path.join(root, 'demo-people.json'), 'utf8'));
const ledger = new Ledger(config, {
  people,
  // Chế độ an toàn dừng mọi thứ tự chạy khi không có chủ kênh.
  canDemo: () => !safeMode,
  emit(msg) {
    broadcast(msg);
    if (msg.type === 'write') {
      console.log(`[Ghi sớ] Số ${msg.job.no}: ${msg.job.name} (${msg.job.tier}${msg.job.demo ? ', tự chạy' : ''})${msg.preempted ? ' — dừng tờ tự chạy để nhường lượt' : ''}`);
      jobVoice(msg.job).catch((err) => console.error(`[Vbee] Lỗi đọc tờ số ${msg.job.no}: ${err.message}`));
    }
  },
});
try {
  ledger.importState(JSON.parse(readFileSync(LEDGER_FILE, 'utf8')));
  console.log(`Đã nạp sổ: ${ledger.written} tờ đã ghi, ${ledger.size} người đang chờ`);
} catch {
  // Chưa có sổ cũ.
}
function saveLedger() {
  if (!ledger.stateDirty) return;
  ledger.stateDirty = false;
  try {
    mkdirSync(path.dirname(LEDGER_FILE), { recursive: true });
    writeFileSync(`${LEDGER_FILE}.tmp`, JSON.stringify(ledger.exportState()));
    renameSync(`${LEDGER_FILE}.tmp`, LEDGER_FILE);
  } catch (err) {
    console.error(`[Sổ] Không lưu được: ${err.message}`);
  }
}
setInterval(saveLedger, 3000);
setInterval(() => ledger.tick(), 100);

// ---------- Giọng đọc: ghép từ các mẩu có sẵn ----------
const VOICE = { enabled: true, nameTierMaxQueue: 5, nameWaitMs: 8000, ...config.voice };
const V = { record: 'Ghi danh', thanks: 'Đa tạ', guest: 'quý khách', ...config.voice?.text };
const spokenName = (name) => readableName(name) || V.guest;

function say(texts, first = false) {
  if (!voice.enabled || safeMode || !VOICE.enabled) return;
  const ids = texts.map((t) => voice.ready(t)).filter(Boolean);
  if (ids.length) broadcast({ type: 'say', ids, first });
}

async function jobVoice(job) {
  if (!voice.enabled || safeMode || !VOICE.enabled || (job.demo && !VOICE.demo)) return;
  if (job.tier === 'name' && ledger.size > VOICE.nameTierMaxQueue) return;
  const name = job.spoken ?? spokenName(job.name);
  // Tên mới cần vài giây để Vbee tạo giọng: chờ có giọng rồi mới đọc, không đọc "quý khách" thay tên.
  // Chờ có giới hạn, vì Vbee có thể đang bận tạo cả bộ giọng lúc mới bật server.
  const ready = voice.ready(name) || (await Promise.race([voice.clip(name, { urgent: !job.demo }), sleep(VOICE.nameWaitMs).then(() => null)]));
  // Tờ tự chạy đã xong hoặc đã nhường lượt thì thôi; người thật thì đọc muộn vẫn hơn không được đọc.
  if (job.demo && ledger.job !== job) return;
  if (job.demo && !ready) return;
  const spoken = ready ? name : V.guest;
  const line = (kind) => job.stages.find((stage) => stage.kind === kind)?.text;
  if (line('thanks')) return say([V.thanks, spoken, line('wish'), line('thanks')], true);
  if (line('wish')) return say([V.record, spoken, line('wish')], true);
  say([V.record, spoken]);
}

function warmVoice() {
  const texts = [V.record, V.thanks, V.guest, ...config.wishes, ...config.thanks];
  if (VOICE.demo && ledger.demoOn) texts.push(...people.map((person) => person.spoken ?? spokenName(person.name)));
  const missing = texts.filter((t) => !voice.ready(t));
  if (!missing.length) return console.log(`[Vbee] Đã có sẵn ${texts.length} mẩu giọng đọc`);
  console.log(`[Vbee] Đang tạo ${missing.length} mẩu giọng đọc dùng chung, chỉ lần đầu...`);
  Promise.all(missing.map((t) => voice.clip(t))).then((ids) => console.log(`[Vbee] Xong thư viện giọng đọc: ${ids.filter(Boolean).length}/${missing.length} mẩu`));
}

// Tạo sẵn mẩu tên để lúc bắt đầu viết là đọc được ngay. Người chỉ thả tim chỉ tạo khi hàng chờ ngắn, kẻo tốn lượt Vbee.
function prepareName(entry) {
  if (!VOICE.enabled) return;
  if (entry.coins > 0 || ledger.size <= VOICE.nameTierMaxQueue) voice.clip(spokenName(entry.name), { urgent: entry.coins > 0 });
}

// ---------- Tương tác ----------
const handle = {
  comment(who) {
    if (cooledDown(`greet:${who.id}`, 600_000)) broadcast({ type: 'chip', kind: 'greet', name: who.name });
  },
  like(who, count) {
    const result = ledger.like(who, count);
    broadcast({ type: 'heart', n: Math.min(3, count) });
    if (result.earned) {
      prepareName(result.entry);
      broadcast({ type: 'chip', kind: 'earned', name: who.name, need: result.need });
    } else if (!result.waiting && cooledDown(`likes:${who.id}`, 2000)) {
      broadcast({ type: 'chip', kind: 'likes', name: who.name, have: result.have, need: result.need });
    }
  },
  social(who, kind) {
    if (cooledDown(`${kind}:${who.id}`, 60_000)) broadcast({ type: 'chip', kind, name: who.name });
  },
  gift(who, gift, count) {
    const { entry, upgraded } = ledger.gift(who, gift.coins, count);
    prepareName(entry);
    broadcast({ type: 'avatar', url: entry.avatar });
    broadcast({ type: 'chip', kind: upgraded ? 'upgraded' : 'gift', name: who.name, tier: ledger.tierFor(entry.coins).id });
  },
};

function safeImageUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function viewer(user) {
  const raw = String(user?.nickname || user?.displayId || user?.uniqueId || '').replace(/\s+/g, ' ').trim();
  const name = Array.from(raw).slice(0, 20).join('') || 'Ẩn danh';
  // Browsers cannot render HEIC, which TikTok sometimes lists first.
  const urls = user?.avatarThumb?.urlList ?? user?.avatarMedium?.urlList ?? user?.profilePicture?.url ?? [];
  const avatar = safeImageUrl(urls.find((url) => !/\.heic\b/i.test(url)) ?? urls[0] ?? '');
  return { id: String(user?.userId || user?.id || user?.displayId || user?.uniqueId || name), name, avatar };
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

// ---------- Vbee voice ----------
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
    alertTelegram(`⚠️ TikTok cảnh báo phiên live @${username} lúc ${time}\n${text}\nĐã tự bật chế độ an toàn. Hãy kiểm tra hộp thư TikTok.`);
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
  conn.on(WebcastEvent.CHAT, (e) => handle.comment(viewer(e.user)));
  conn.on(WebcastEvent.FOLLOW, (e) => handle.social(viewer(e.user), 'follow'));
  conn.on(WebcastEvent.SHARE, (e) => handle.social(viewer(e.user), 'share'));
  conn.on(WebcastEvent.LIKE, (e) => handle.like(viewer(e.user), Math.max(1, Number(e.likeCount ?? e.count) || 1)));
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
    const info = { name: String(gift.giftName ?? gift.name ?? '').slice(0, 40), coins: Number(gift.diamondCount) || 0 };
    console.log(`[Quà] ${who.name}: ${info.name} (${info.coins} xu) x${count}`);
    session.diamonds += info.coins * count;
    session.gifts += count;
    broadcast({ type: 'session', ...session });
    handle.gift(who, info, count);
  });
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
  send(res, {
    type: 'snapshot',
    status,
    guide,
    alerts,
    safeMode,
    session,
    ...ledger.snapshot(),
    tts: { enabled: vbee.enabled, voice: vbee.voice },
  });
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

// Người thử không có ảnh thì lấy ảnh mẫu, để bảng điều khiển vẫn xem được cảnh vẽ avatar.
const sampleAvatar = (name) => `/sim/a${(Array.from(name).reduce((sum, ch) => sum + ch.codePointAt(0), 0) % 4) + 1}.svg`;

// JSON-only endpoints: browsers cannot send application/json cross-site without a CORS preflight.
app.post('/api/simulate', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const { kind, name, count, coins, avatar } = req.body ?? {};
  const nickname = typeof name === 'string' && name.trim() ? name : 'Khách thử';
  const who = viewer({ id: `sim:${nickname}`, nickname, avatarThumb: { urlList: [String(avatar ?? '').slice(0, 1000)] } });
  who.avatar ||= sampleAvatar(who.name);
  switch (kind) {
    case 'like':
      handle.like(who, clampInt(count, 1, 9999));
      break;
    case 'chat':
      handle.comment(who);
      break;
    case 'follow':
    case 'share':
      handle.social(who, kind);
      break;
    case 'gift':
      handle.gift(who, { coins: clampInt(coins, 1, 100_000) }, clampInt(count, 1, 999));
      break;
    default:
      return res.status(400).json({ error: 'kind không hợp lệ' });
  }
  res.status(204).end();
});

app.post('/api/clear', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  ledger.clearQueue();
  saveLedger();
  res.status(204).end();
});

app.post('/api/demo', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  ledger.setDemo(req.body?.on === true);
  console.log(`[Tự chạy] ${ledger.demoOn ? 'Bật' : 'Tắt'}`);
  res.status(204).end();
});

app.post('/api/safe-mode', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  setSafeMode(req.body?.on === true, 'bật tay từ bảng điều khiển');
  res.status(204).end();
});

app.post('/api/telegram-test', async (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const error = await sendTelegram('✅ Ghi Sớ đã kết nối Telegram. Nếu TikTok cảnh báo phiên live, tin sẽ được gửi vào đây.');
  res.json({ message: error || 'Đã gửi tin thử, bạn kiểm tra Telegram nhé.' });
});

app.listen(port, host, (err) => {
  if (err) throw err;
  console.log(`Màn hình game:   http://${host}:${port}/`);
  console.log(`Bảng điều khiển: http://${host}:${port}/panel.html`);
  const { token, chatId } = telegramConfig();
  console.log(token && chatId ? 'Báo cảnh báo qua Telegram: bật' : 'Báo cảnh báo qua Telegram: tắt (thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_ADMIN_CHAT_ID trong .env)');
  if (!vbee.enabled) console.log('Vbee: tắt (thiếu VBEE_TOKEN hoặc VBEE_APP_ID trong .env)');
  else {
    console.log(`Vbee đọc (giọng ${vbee.voice})`);
    warmVoice();
  }
  if (username) connectTikTok();
  else console.log('Chưa đặt kênh TikTok (npm start -- ten_kenh, hoặc tiktokUsername trong config.json). Đang ở chế độ thử.');
});

process.on('SIGINT', () => {
  saveLedger();
  process.exit(0);
});
