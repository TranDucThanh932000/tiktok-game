import path from 'node:path';
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseEnv } from 'node:util';
import express from 'express';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { Game } from './src/game.js';
import { GiftCatalog } from './src/gifts.js';
import { Director } from './src/director.js';
import { createVoice } from './src/voice.js';

const APP_ID = 'san-khau-co-duyen-game';
const APP_VERSION = 1; // start.bat kiểm tra số này; đổi khi server cũ không còn hợp với trang mới.

const root = import.meta.dirname;
const config = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const lines = JSON.parse(readFileSync(path.join(root, 'lines.json'), 'utf8'));
const username = (process.argv[2] ?? config.tiktokUsername ?? '').trim().replace(/^@/, '');
const dataDir = process.env.DATA_DIR?.trim() || path.join(root, 'data');
const port = Number(process.env.PORT) || config.port || 3130;
const host = '127.0.0.1';

const vbee = {
  token: process.env.VBEE_TOKEN?.trim(),
  appId: process.env.VBEE_APP_ID?.trim(),
  duy: process.env.VBEE_VOICE_MALE?.trim() || config.voices.duy,
  linh: process.env.VBEE_VOICE_FEMALE?.trim() || config.voices.linh,
  speed: Number(process.env.VBEE_SPEED) || 1,
};
vbee.enabled = Boolean(vbee.token && vbee.appId);

const clients = new Set();
let status = { connected: false, text: username ? `Chuẩn bị kết nối @${username}` : 'Chế độ thử: chưa đặt kênh TikTok' };
let session = { roomId: '', diamonds: 0, gifts: 0 };
let commentLagMs = null;
let safeMode = false;
let liveEver = false; // Đã từng nối LIVE trong lần chạy này thì không mô phỏng nữa, kể cả lúc rớt mạng.
const alerts = [];

const send = (res, message) => res.write(`data: ${JSON.stringify(message)}\n\n`);
const broadcast = (message) => clients.forEach((res) => send(res, message));

function setStatus(connected, text) {
  status = { connected, text, simLocked: liveEver };
  console.log(`[TikTok] ${text}`);
  broadcast({ type: 'status', ...status });
}

function setSafeMode(on, reason) {
  if (safeMode === on) return;
  safeMode = on;
  console.log(`[Chế độ an toàn] ${on ? `Bật: ${reason}` : 'Tắt'}`);
  broadcast({ type: 'safe-mode', on });
}

// ---------- Giọng hai MC ----------
async function vbeeJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body.error ?? body).slice(0, 300)}`);
  return body;
}

// Chế độ realtime không có ở mọi gói Vbee, nên tạo job rồi hỏi kết quả; không cần webhook công khai.
async function synthesize(text, voiceCode) {
  const headers = { Authorization: `Bearer ${vbee.token}`, 'App-Id': vbee.appId };
  const job = await vbeeJson('https://api.vbee.vn/v1/tts', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceCode, mode: 'async', outputFormat: 'mp3', speed: vbee.speed, webhookUrl: 'https://callback.invalid/vbee' }),
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

const makeVoice = (who) =>
  createVoice({
    enabled: vbee.enabled,
    voice: vbee[who],
    speed: vbee.speed,
    dir: path.join(root, 'data', 'tts'),
    concurrency: 2, // Hai giọng dùng chung một tài khoản Vbee.
    synthesize: (text) => synthesize(text, vbee[who]),
    onError(err, text) {
      console.error(`[Vbee ${who}] Lỗi đọc "${text}": ${err.message}`);
      broadcast({ type: 'speak-error', message: err.message });
    },
  });
const voices = { duy: makeVoice('duy'), linh: makeVoice('linh') };

// ---------- Game ----------
const catalog = new GiftCatalog(config.gifts);
if (!username) catalog.useTargets();

const director = new Director({ lines, voices, emit: broadcast, enabled: () => !safeMode, bigGiftScore: config.bigGiftScore });
const game = new Game({
  config,
  catalog,
  director,
  emit(message) {
    broadcast(message);
    if (message.type === 'gift') broadcast({ type: 'catalog', catalog: catalog.status() });
    if (message.type === 'card' && message.kind === 'queued') console.log(`[Hàng ${message.side === 'male' ? 'Nam' : 'Nữ'}] ${message.name} vị trí ${message.position}`);
    if (message.type === 'reveal') console.log(`[Cặp ${game.pair?.no}] ${message.result} · ${game.pair?.score} điểm`);
  },
});
director.attach(game);

const STATE_FILE = path.join(dataDir, 'state.json');
try {
  const saved = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  game.importState(saved.game);
  session.roomId = saved.roomId ?? '';
  console.log(`Đã nạp phiên cũ: cặp số ${game.pairNo}, hàng Nam ${game.queues.male.length}, hàng Nữ ${game.queues.female.length}`);
} catch {
  // Chưa có phiên cũ.
}
function saveState() {
  if (!game.stateDirty) return;
  game.stateDirty = false;
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(`${STATE_FILE}.tmp`, JSON.stringify({ roomId: session.roomId, game: game.exportState() }));
    renameSync(`${STATE_FILE}.tmp`, STATE_FILE);
  } catch (err) {
    console.error(`[Lưu] Không lưu được: ${err.message}`);
  }
}
setInterval(saveState, 3000);
setInterval(() => {
  game.tick();
  director.tick();
}, 50);

function warmVoice() {
  const parts = director.staticParts();
  for (const who of ['duy', 'linh']) {
    const missing = parts[who].filter((text) => !voices[who].ready(text));
    if (!missing.length) {
      console.log(`[Vbee ${who}] Đã có sẵn ${parts[who].length} mẩu lời`);
      continue;
    }
    console.log(`[Vbee ${who}] Đang tạo ${missing.length} mẩu lời, chỉ lần đầu...`);
    Promise.all(missing.map((text) => voices[who].clip(text))).then((ids) => {
      console.log(`[Vbee ${who}] Xong: ${ids.filter(Boolean).length}/${missing.length} mẩu`);
      broadcast({ type: 'tts', tts: ttsStatus() });
    });
  }
}

const ttsStatus = () => {
  const parts = director.staticParts();
  const count = (who) => parts[who].filter((text) => voices[who].ready(text)).length;
  return {
    enabled: vbee.enabled,
    duy: vbee.duy,
    linh: vbee.linh,
    ready: vbee.enabled ? count('duy') + count('linh') : 0,
    total: parts.duy.length + parts.linh.length,
  };
};

function safeImageUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

// Ảnh đầu tiên trình duyệt hiển thị được (không nhận .heic) trong các định dạng connector có thể trả về.
function firstImage(...images) {
  for (const image of images) {
    const urls = image?.urlList ?? image?.mUrls ?? image?.urls ?? image?.url;
    const url = Array.isArray(urls) ? urls.find((item) => !/\.heic\b/i.test(item)) : '';
    if (url) return safeImageUrl(url);
  }
  return '';
}

// Nhận diện bằng ID tài khoản, không bằng tên hiển thị.
function viewer(user) {
  const name = String(user?.nickname || user?.displayId || user?.uniqueId || '').slice(0, 60);
  const avatar = firstImage(user?.avatarThumb, user?.avatarMedium, user?.avatarLarge, user?.profilePicture);
  return { id: String(user?.userId || user?.id || user?.uniqueId || user?.displayId || name), name, avatar };
}

// Chế độ thử không có ảnh TikTok thật: vẽ một ảnh đại diện theo tên, để thấy được đầu nhân vật. LIVE thật không dùng tới.
function simAvatar(seed) {
  let hash = 2166136261;
  for (const ch of String(seed)) hash = Math.imul(hash ^ ch.codePointAt(0), 16777619) >>> 0;
  const pick = (list, shift) => list[(hash >>> shift) % list.length];
  const bg = pick(['#8ecae6', '#ffb4a2', '#b5e48c', '#ffd6a5', '#cdb4db', '#90dbf4', '#fcd5ce'], 0);
  const skin = pick(['#f6c9a8', '#e8b48f', '#d69b76', '#f2d3b8'], 5);
  const hair = pick(['#2b1b2e', '#4a2a22', '#7a4a2a', '#1f2a44', '#8c3b5e'], 9);
  const long = (hash >>> 13) % 2 === 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/>${long ? `<path d="M12 62V30a20 20 0 0 1 40 0v32z" fill="${hair}"/>` : ''}<rect x="10" y="50" width="44" height="20" rx="12" fill="${pick(['#ffffff', '#3a5a98', '#d1495b', '#2a9d8f'], 17)}"/><circle cx="32" cy="32" r="16" fill="${skin}"/><path d="M15 30a17 17 0 0 1 34 0c-7-1-11-6-13-9-3 5-12 9-21 9z" fill="${hair}"/><circle cx="26" cy="33" r="2" fill="#2b1b2e"/><circle cx="38" cy="33" r="2" fill="#2b1b2e"/><path d="M27 40q5 4 10 0" fill="none" stroke="#9b3b4a" stroke-width="2" stroke-linecap="round"/></svg>`;
}

// ---------- Cảnh báo TikTok, Telegram ----------
const MODERATION_TYPES = new Set(['WebcastPerceptionMessage', 'WebcastNoticeMessage', 'WebcastPartnershipPunishMessage', 'WebcastRoomVerifyMessage']);
const lastSent = new Map();
const textOf = (t) => (typeof t === 'string' ? t : t?.defaultPattern || '');
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
  const key = `telegram:${text}`;
  if (Date.now() - (lastSent.get(key) ?? 0) >= 600_000) {
    lastSent.set(key, Date.now());
    const time = new Date(alert.at).toLocaleTimeString('vi-VN');
    alertTelegram(`⚠️ TikTok cảnh báo phiên live @${username} lúc ${time}\n${text}\nĐã tự bật chế độ an toàn, hai MC tạm im. Hãy kiểm tra hộp thư TikTok.`);
  }
}

// Đọc .env mỗi lần gửi, nên đổi Telegram không cần khởi động lại.
function telegramConfig() {
  let file = {};
  try {
    file = parseEnv(readFileSync(path.join(root, '.env'), 'utf8'));
  } catch {
    // Không có .env: chỉ dùng biến môi trường.
  }
  const read = (key) => String(file[key] ?? process.env[key] ?? '').trim();
  return { token: read('TELEGRAM_BOT_TOKEN'), chatId: read('TELEGRAM_ADMIN_CHAT_ID') };
}

// Trả về thông báo lỗi, hoặc '' khi đã gửi. Token nằm trong URL nên URL không bao giờ được ghi log.
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

async function alertTelegram(text) {
  for (let attempt = 1; attempt <= 30; attempt++) {
    const error = await sendTelegram(text);
    if (!error) return;
    if (attempt === 1) console.error(`[Telegram] ${error}. Sẽ thử lại mỗi phút trong 30 phút.`);
    await sleep(60_000);
  }
  console.error('[Telegram] Sau 30 phút vẫn không gửi được cảnh báo, bỏ qua.');
}

// ---------- TikTok LIVE ----------
function connectTikTok() {
  const conn = new TikTokLiveConnection(username, { processInitialData: false });
  let wasConnected = false;

  conn.on(ControlEvent.DECODED_DATA, (type, event) => {
    game.eventReceived(); // Thấy sự kiện thật mới coi là kết nối đã phục hồi.
    const data = event?.data ?? event ?? {};
    const { common, ...fields } = data;
    const warning = type === 'WebcastControlMessage' ? [data.punishInfo, data.perceptionDialog] : MODERATION_TYPES.has(type) ? [fields, common?.displayText] : [];
    if (hasContent(warning)) reportModeration(type, data);
  });
  conn.on(WebcastEvent.MEMBER, (e) => game.join(viewer(e.user)));
  conn.on(WebcastEvent.CHAT, (e) => {
    const sentAt = Number(e.common?.createTime);
    if (sentAt > 1e12) commentLagMs = Math.max(0, Date.now() - sentAt);
    game.comment({ eventId: e.common?.msgId ? `c:${e.common.msgId}` : '', user: viewer(e.user), text: String(e.comment ?? e.content ?? '').slice(0, 200) });
  });
  conn.on(WebcastEvent.GIFT, (e) => {
    if (!e.gift && !e.giftDetails) return;
    const gift = e.giftDetails ?? e.gift;
    const coins = Number(gift.diamondCount) || 0;
    const name = String(gift.giftName ?? gift.name ?? '').slice(0, 40);
    console.log(`[Quà] ${viewer(e.user).name}: ${name} (${coins} xu) x${e.repeatCount ?? 1}`);
    game.gift({
      eventId: e.common?.msgId ? `g:${e.common.msgId}` : '',
      user: viewer(e.user),
      gift: { id: e.giftId, name, coins, image: firstImage(gift.image, gift.giftImage, gift.icon) },
      repeatCount: e.repeatCount,
      combo: Number(gift.giftType ?? gift.type) === 1,
      groupId: String(e.groupId ?? ''),
      repeatEnd: Number(e.repeatEnd) === 1,
    });
  });
  conn.on(WebcastEvent.STREAM_END, ({ action }) => {
    if (action === 4) reportModeration('StreamSuspended', { tips: 'TikTok đã đình chỉ phiên live' });
    setStatus(false, action === 4 ? `TikTok đã đình chỉ phiên live của @${username}` : `@${username} đã kết thúc live`);
  });
  conn.on(ControlEvent.ERROR, (err) => console.error('[TikTok]', err?.message ?? err));
  conn.on(ControlEvent.DISCONNECTED, () => {
    if (wasConnected) game.pause('connection');
    retry(10_000, 'Mất kết nối TikTok');
  });

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
        if (session.roomId) game.newSession();
        session = { roomId: state.roomId, diamonds: 0, gifts: 0 };
        game.stateDirty = true;
      }
      wasConnected = true;
      if (!liveEver) {
        liveEver = true;
        game.purgeSimulated();
        console.log('[Mô phỏng] Đã xóa người giả và tắt chế độ thử: phiên LIVE thật chỉ có người thật');
      }
      catalog.resetForLive();
      setStatus(true, `Đã kết nối live @${username} (room ${state.roomId})`);
      game.connectionRestored();
      // Đối chiếu ID, tên, giá quà từ chính TikTok. Lỗi thì vẫn chơi được: quà nhận giá từ sự kiện hoặc chờ xác minh.
      conn.fetchAvailableGifts().then(
        (gifts) => {
          const matched = catalog.verifyFrom(gifts);
          console.log(`[Quà] Đã đối chiếu ${matched} mục với danh sách quà của phòng`);
          for (const item of catalog.status()) {
            if (item.mismatch) console.warn(`[Quà] ${item.label}: giá mục tiêu ${item.target} xu, TikTok báo ${item.coins} xu. Màn hình dùng giá TikTok.`);
            if (item.coins === null) console.warn(`[Quà] ${item.label}: chưa khớp được trong danh sách quà, cần kiểm tra lại "names" trong config.json.`);
          }
          broadcast({ type: 'state', game: game.snapshot() });
          broadcast({ type: 'catalog', catalog: catalog.status() });
        },
        (err) => console.error(`[Quà] Không lấy được danh sách quà: ${err.message}`),
      );
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
// Chỉ trả lời yêu cầu gửi tới chính máy này (chặn DNS rebinding).
app.use((req, res, next) => (['127.0.0.1', 'localhost'].includes(req.hostname) ? next() : res.status(403).end()));
app.use(express.static(path.join(root, 'public')));
app.use(express.json({ limit: '4kb' }));

app.get('/health', (req, res) => res.json({ app: APP_ID, version: APP_VERSION }));

app.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  send(res, {
    type: 'snapshot',
    title: config.title,
    status,
    alerts,
    safeMode,
    commentLagMs,
    tts: ttsStatus(),
    catalog: catalog.status(),
    viewers: game.recentViewers(),
    game: game.snapshot(),
  });
  clients.add(res);
  res.on('close', () => clients.delete(res));
});
setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 20_000);
setInterval(() => broadcast({ type: 'lag', commentLagMs }), 5000);

app.get('/tts/:id', (req, res) => {
  const audio = voices.duy.audio(req.params.id) ?? voices.linh.audio(req.params.id);
  if (!audio) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type('audio/mpeg').send(audio);
});

app.get('/api/sim-avatar', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400').type('image/svg+xml').send(simAvatar(String(req.query.seed ?? '').slice(0, 80)));
});

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || min));
// Chỉ nhận JSON: trình duyệt không gửi application/json sang trang khác nếu không qua CORS preflight.
const post = (route, handler) =>
  app.post(route, (req, res) => {
    if (!req.is('application/json')) return res.status(415).end();
    return handler(req, res);
  });

// Không bịa người xem hay quà trên LIVE thật: mô phỏng chỉ chạy khi chưa nối TikTok.
post('/api/simulate', (req, res) => {
  if (status.connected || liveEver) return res.status(409).json({ error: 'Đang dùng LIVE thật nên mô phỏng đã tắt' });
  const { kind, name, text, eventId, gift, count, combo, groupId, repeatEnd } = req.body ?? {};
  const nickname = typeof name === 'string' && name.trim() ? name : 'Bạn thử';
  const user = { id: `sim:${nickname}`, name: nickname, avatar: `/api/sim-avatar?seed=${encodeURIComponent(nickname)}` };
  const event = typeof eventId === 'string' ? eventId.slice(0, 80) : '';
  if (kind === 'join') game.join(user);
  else if (kind === 'chat') game.comment({ eventId: event, user, text: String(text ?? '').slice(0, 200) });
  else if (kind === 'gift') {
    game.gift({
      eventId: event,
      user,
      gift: { name: String(gift?.name ?? '').slice(0, 40), coins: gift?.coins === null || gift?.coins === undefined ? 0 : clampInt(gift.coins, 0, 100_000) },
      repeatCount: clampInt(count, 1, 9999),
      combo: combo === true,
      groupId: String(groupId ?? ''),
      repeatEnd: repeatEnd === true,
    });
  } else return res.status(400).json({ error: 'kind không hợp lệ' });
  res.status(204).end();
});

post('/api/demo', (req, res) => {
  game.setDemo(req.body?.on === true);
  res.status(204).end();
});

post('/api/pause', (req, res) => {
  game.pause(req.body?.reason === 'connection' ? 'connection' : 'operator');
  res.status(204).end();
});
post('/api/resume', (req, res) => {
  game.resume();
  res.status(204).end();
});
post('/api/remove', (req, res) => {
  game.removePlayer(String(req.body?.id ?? ''), { ban: req.body?.ban === true });
  res.status(204).end();
});
post('/api/reconcile', (req, res) => {
  res.status(game.reconcile(req.body?.id, req.body?.coins) ? 204 : 404).end();
});
post('/api/reset', (req, res) => {
  game.reset();
  saveState();
  console.log('[Game] Đã mở lại phiên mới');
  res.status(204).end();
});
post('/api/safe-mode', (req, res) => {
  setSafeMode(req.body?.on === true, 'bật tay từ bảng điều khiển');
  res.status(204).end();
});
post('/api/telegram-test', async (req, res) => {
  const error = await sendTelegram('✅ Sân Khấu Có Duyên đã kết nối Telegram. Nếu TikTok cảnh báo phiên live, tin sẽ được gửi vào đây.');
  res.json({ message: error || 'Đã gửi tin thử, bạn kiểm tra Telegram nhé.' });
});

app.listen(port, host, (err) => {
  if (err) throw err;
  console.log(`Màn hình game:   http://${host}:${port}/`);
  console.log(`Bảng điều khiển: http://${host}:${port}/panel.html`);
  if (!vbee.enabled) console.log('Vbee: tắt, MC chỉ hiện phụ đề (thiếu VBEE_TOKEN hoặc VBEE_APP_ID trong .env)');
  else {
    console.log(`Giọng Duy: ${vbee.duy} · Giọng Linh: ${vbee.linh}`);
    warmVoice();
  }
  if (username) connectTikTok();
  else console.log('Chưa đặt kênh TikTok (npm start -- ten_kenh, hoặc tiktokUsername trong config.json). Đang ở chế độ thử.');
});

process.on('SIGINT', () => {
  saveState();
  process.exit(0);
});
