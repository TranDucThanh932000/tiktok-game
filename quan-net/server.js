import path from 'node:path';
import { appendFileSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseEnv } from 'node:util';
import express from 'express';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { NetCafe } from './src/net.js';
import { OwnerVoice } from './src/owner.js';
import { createVoice } from './src/voice.js';

const root = import.meta.dirname;
const config = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const lines = JSON.parse(readFileSync(path.join(root, 'lines.json'), 'utf8'));
const username = (process.argv[2] ?? config.tiktokUsername ?? '').trim().replace(/^@/, '');
// DATA_DIR để chạy thử song song mà không đụng bảng điểm đang có.
const dataDir = process.env.DATA_DIR?.trim() || path.join(root, 'data');
const port = Number(process.env.PORT) || config.port || 3016;
const host = '127.0.0.1';

const positive = (value) => Number.isFinite(value) && value > 0;
const atLeast0 = (value) => Number.isFinite(value) && value >= 0;
const time = config.time ?? {};
const problems = [
  [Number.isInteger(config.room?.rows) && Number.isInteger(config.room?.cols) && config.room.rows * config.room.cols >= 4 && config.room.rows * config.room.cols <= 40 && Number.isInteger(config.room?.vip) && config.room.vip >= 0 && config.room.vip <= 6, 'room: rows x cols từ 4 đến 40 máy, vip từ 0 đến 6'],
  [positive(config.clock?.secondsPerMinute) && /^\d{1,2}:\d{2}$/.test(config.clock?.start ?? ''), 'clock: start dạng "19:00", secondsPerMinute lớn hơn 0'],
  [['freeMinutes', 'likesPerMinute', 'kickSeconds', 'idleKickMinutes'].every((key) => positive(time[key])) && ['commentMinutes', 'commentGapSeconds', 'followMinutes', 'shareMinutes', 'shareGapSeconds', 'itemMinutes'].every((key) => atLeast0(time[key])), 'time: các số phút/giây phải từ 0 trở lên (freeMinutes, likesPerMinute, kickSeconds, idleKickMinutes lớn hơn 0)'],
  [['boost', 'vip', 'golden'].every((key) => Number.isFinite(config.rates?.[key]) && config.rates[key] >= 1), 'rates: boost, vip, golden là hệ số từ 1'],
  [positive(config.minutesPerCoin), 'minutesPerCoin lớn hơn 0'],
  [Array.isArray(config.gifts) && config.gifts.length && config.gifts.every((g) => Number.isInteger(g.coins) && g.coins >= 1 && g.label && g.icon), 'mỗi mức trong gifts cần coins, label, icon'],
  [Array.isArray(config.games) && config.games.length && config.games.every((g) => /^[a-z0-9]{1,8}$/.test(g.code) && g.label && g.screen), 'mỗi game cần code (chữ thường không dấu), label, screen'],
  [['join', 'leave', 'check', 'buzz', 'rage', 'hide'].every((key) => Array.isArray(config.commands?.[key]) && config.commands[key].length), 'commands cần đủ join, leave, check, buzz, rage, hide'],
  [['golden', 'blackout', 'mom'].every((key) => atLeast0(config.events?.[key]?.everySeconds) && positive(config.events[key].seconds)), 'events: everySeconds (0 = tắt) và seconds cho golden, blackout, mom'],
].filter(([ok]) => !ok);
if (problems.length) throw new Error(`config.json: ${problems.map(([, text]) => text).join('; ')}`);

const guide = {
  title: config.title,
  subtitle: config.subtitle,
  room: config.room,
  free: time.freeMinutes,
  likes: time.likesPerMinute,
  follow: time.followMinutes,
  share: time.shareMinutes,
  rates: config.rates,
  words: Object.fromEntries(Object.entries(config.commands).map(([key, list]) => [key, list[0]])),
  games: config.games.map(({ code, label, screen }) => ({ code, label, screen })),
  gifts: [...config.gifts].sort((a, b) => a.coins - b.coins).map(({ coins, label, icon }) => ({ coins, label, icon })),
  hideMinutes: config.events.mom.hideMinutes ?? 0,
};

const vbee = {
  token: process.env.VBEE_TOKEN?.trim(),
  appId: process.env.VBEE_APP_ID?.trim(),
  // Giọng cô Tám đặt trong config.json; VBEE_VOICE trong .env (chép từ game khác) chỉ dùng khi config không có.
  voice: config.voice?.code?.trim() || process.env.VBEE_VOICE?.trim() || 'sg_female_thaotrinh_full_48k-fhg',
  speed: Number(config.voice?.speed) || Number(process.env.VBEE_SPEED) || 1,
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

// Chế độ an toàn: tắt các chuyện tự động (mẹ tới kiếm, cúp điện, giờ vàng), lời nói vu vơ và giọng cô Tám, game vẫn chạy.
let safeMode = false;
function setSafeMode(on, reason) {
  if (safeMode === on) return;
  safeMode = on;
  cafe.setSafe(on);
  console.log(`[Chế độ an toàn] ${on ? `Bật: ${reason}` : 'Tắt'}`);
  broadcast({ type: 'safe-mode', on });
  if (on) owner.stop();
}

// ---------- Giọng cô Tám ----------
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

const owner = new OwnerVoice({ voice, lines, emit: broadcast, enabled: () => !safeMode });

// Tạo sẵn lời cố định, kể cả câu có số phút follow/share, tên game, vị trí hàng chờ hay gặp.
function warmVoice() {
  const perCoin = config.minutesPerCoin;
  const minutes = (list) => [...new Set(list)].map((value) => ({ minutes: value }));
  const texts = owner.staticParts({
    follow: minutes([time.followMinutes]),
    share: minutes([time.shareMinutes]),
    gift: minutes([1, 2, 3, 5].map((n) => n * perCoin)),
    treat: minutes(config.gifts.filter((gift) => gift.everyoneMinutes).map((gift) => gift.everyoneMinutes)),
    queue: [1, 2, 3, 4, 5].map((pos) => ({ pos })),
    checkQueue: [1, 2, 3].map((pos) => ({ pos })),
    golden: config.games.map((game) => ({ game: game.label, code: game.code })),
  });
  const missing = texts.filter((text) => !voice.ready(text));
  if (!missing.length) return console.log(`[Vbee] Đã có sẵn ${texts.length} mẩu lời cô Tám`);
  console.log(`[Vbee] Đang tạo ${missing.length} mẩu lời cô Tám, chỉ lần đầu...`);
  Promise.all(missing.map((text) => voice.clip(text))).then((ids) => console.log(`[Vbee] Xong lời cô Tám: ${ids.filter(Boolean).length}/${missing.length} mẩu`));
}

// ---------- Tiệm net ----------
const seatLabel = (index) => (index < config.room.vip ? `V${index + 1}` : String(index - config.room.vip + 1));
function logEvent(msg) {
  if (msg.type === 'seat' && typeof msg.from !== 'number') console.log(`[Vào máy] ${msg.player.name} · máy ${seatLabel(msg.seat)}`);
  if (msg.type === 'gift') console.log(`[Quà] ${msg.name}: ${msg.label} · +${msg.minutes} phút`);
  if (msg.type === 'leave' && msg.reason !== 'move') console.log(`[Rời máy] ${msg.name} (${msg.reason})`);
  if (msg.type === 'mom' && msg.mom) console.log(`[Mẹ tới kiếm] ${msg.mom.name}: ${msg.mom.phase}`);
}

const STATE_FILE = path.join(dataDir, 'board.json');
const cafe = new NetCafe(config, {
  lines,
  emit(msg) {
    // Lời cô Tám đi qua phần giọng đọc, bong bóng hiện lúc cô bắt đầu nói.
    if (msg.type === 'say') return owner.say(msg);
    broadcast(msg);
    logEvent(msg);
  },
});
try {
  cafe.importState(JSON.parse(readFileSync(STATE_FILE, 'utf8')));
  if (cafe.players.size) console.log(`Đã nạp sổ tiệm cũ: ${cafe.players.size} người chơi`);
} catch {
  // Chưa có sổ cũ.
}
function saveState() {
  if (!cafe.stateDirty) return;
  cafe.stateDirty = false;
  try {
    mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    writeFileSync(`${STATE_FILE}.tmp`, JSON.stringify(cafe.exportState()));
    renameSync(`${STATE_FILE}.tmp`, STATE_FILE);
  } catch (err) {
    console.error(`[Sổ tiệm] Không lưu được: ${err.message}`);
  }
}
setInterval(saveState, 3000);
setInterval(() => {
  cafe.tick();
  owner.tick();
}, 100);

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
  const urls = user?.avatarThumb?.urlList ?? user?.avatarMedium?.urlList ?? user?.profilePicture?.url ?? [];
  // Trình duyệt không hiện được ảnh HEIC.
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

// Người vào phòng live thì hiện "đang ngó vào" ở cửa sổ, mỗi người 5 phút một lần, cách nhau ít nhất 2,5 giây.
function peek(who) {
  if (!cooledDown(`peek:${who.id}`, 300_000) || !cooledDown('peek', 2500)) return;
  broadcast({ type: 'peek', name: who.name });
}

let viewers = 0;
let viewersSentAt = 0;
function setViewers(count) {
  if (!Number.isFinite(count) || count < 0 || count === viewers) return;
  viewers = count;
  if (Date.now() - viewersSentAt < 3000) return;
  viewersSentAt = Date.now();
  broadcast({ type: 'viewers', count });
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
    const at = new Date(alert.at).toLocaleTimeString('vi-VN');
    alertTelegram(`⚠️ TikTok cảnh báo phiên live @${username} lúc ${at}\n${text}\nHãy kiểm tra hộp thư TikTok.`);
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
  conn.on(WebcastEvent.CHAT, (e) => cafe.comment(viewer(e.user), String(e.comment ?? e.content ?? '').slice(0, 200)));
  conn.on(WebcastEvent.LIKE, (e) => cafe.like(viewer(e.user), Math.max(1, Number(e.count ?? e.likeCount) || 1)));
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
    console.log(`[Quà TikTok] ${who.name}: ${String(gift.giftName ?? gift.name ?? '').slice(0, 40)} (${coins} xu) x${count}`);
    session.diamonds += coins * count;
    session.gifts += count;
    broadcast({ type: 'session', ...session });
    cafe.gift(who, coins, count);
  });
  conn.on(WebcastEvent.FOLLOW, (e) => cafe.social(viewer(e.user), 'follow'));
  conn.on(WebcastEvent.SHARE, (e) => cafe.social(viewer(e.user), 'share'));
  conn.on(WebcastEvent.MEMBER, (e) => {
    // action 1 = vào phòng, 3 = đăng ký.
    if (Number(e.action) > 1) return;
    peek(viewer(e.user));
  });
  conn.on(WebcastEvent.ROOM_USER, (e) => setViewers(Number(e.total ?? e.viewerCount)));
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

// ---------- Ảnh nhân vật riêng (public/nhan-vat) ----------
const SPRITE_DIR = path.join(root, 'public', 'nhan-vat');
const IMAGE = /\.(png|webp|jpe?g)$/i;

function listSprites() {
  let names = [];
  try {
    names = readdirSync(SPRITE_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && IMAGE.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    // Chưa có thư mục: dùng hình vẽ sẵn.
  }
  const url = (name) => `/nhan-vat/${encodeURIComponent(name)}?v=${Math.round(statSync(path.join(SPRITE_DIR, name)).mtimeMs)}`;
  const guests = new Map();
  const owner = {};
  const mom = {};
  const unknown = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    const guest = /^khach-(\d{1,2})-(ngoi|dung|sau|ngang)\.(png|webp|jpe?g)$/.exec(lower);
    const boss = /^chu-tiem(?:-(la|vui))?\.(png|webp|jpe?g)$/.exec(lower);
    const mother = /^me(?:-(sau))?\.(png|webp|jpe?g)$/.exec(lower);
    if (guest) {
      const no = Number(guest[1]);
      const entry = guests.get(no) ?? { no };
      entry[guest[2]] = url(name);
      guests.set(no, entry);
    } else if (boss) owner[boss[1] ?? 'thuong'] = url(name);
    else if (mother) mom[mother[1] ?? 'dung'] = url(name);
    else unknown.push(name);
  }
  return { khach: [...guests.values()].sort((a, b) => a.no - b.no), chuTiem: owner, me: mom, unknown };
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
  send(res, { type: 'snapshot', status, guide, alerts, session, safeMode, viewers, tts: { enabled: vbee.enabled, voice: vbee.voice }, game: cafe.snapshot() });
  clients.add(res);
  res.on('close', () => clients.delete(res));
});
setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 20_000);

app.get('/api/nhan-vat', (req, res) => res.set('Cache-Control', 'no-store').json(listSprites()));

app.get('/tts/:id', (req, res) => {
  const audio = voice.audio(req.params.id);
  if (!audio) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type('audio/mpeg').send(audio);
});

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || min));

// JSON-only endpoints: browsers cannot send application/json cross-site without a CORS preflight.
app.post('/api/simulate', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const { kind, name, text, coins, count, avatar } = req.body ?? {};
  const nickname = typeof name === 'string' && name.trim() ? name : 'Bạn thử';
  const who = viewer({ id: `sim:${nickname}`, nickname, avatarThumb: { urlList: typeof avatar === 'string' ? [avatar.slice(0, 1000)] : [] } });
  if (kind === 'chat') return res.json({ result: cafe.comment(who, String(text ?? '').slice(0, 200)) });
  if (kind === 'like') return res.json({ result: cafe.like(who, clampInt(count, 1, 500)) });
  if (kind === 'gift') return res.json({ result: cafe.gift(who, clampInt(coins, 1, 50_000), clampInt(count, 1, 999)) });
  if (kind === 'follow' || kind === 'share') return res.json({ result: cafe.social(who, kind) });
  if (kind === 'peek') {
    broadcast({ type: 'peek', name: who.name });
    return res.json({ result: true });
  }
  res.status(400).json({ error: 'kind không hợp lệ' });
});

const controls = {
  golden: () => cafe.startEvent('golden'),
  blackout: () => cafe.startEvent('blackout'),
  mom: () => cafe.startEvent('mom'),
  talk: () => cafe.say('idle', {}, { priority: 3 }),
  reset: () => {
    cafe.reset();
    return true;
  },
};
app.post('/api/control', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const action = controls[req.body?.action];
  if (!action) return res.status(400).json({ error: 'action không hợp lệ' });
  const ok = action();
  saveState();
  res.json({ ok });
});

app.post('/api/safe-mode', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  setSafeMode(req.body?.on === true, 'bật tay từ bảng điều khiển');
  res.status(204).end();
});

app.post('/api/telegram-test', async (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const error = await sendTelegram('✅ Tiệm Net đã kết nối Telegram. Nếu TikTok cảnh báo phiên live, tin sẽ được gửi vào đây.');
  res.json({ message: error || 'Đã gửi tin thử, bạn kiểm tra Telegram nhé.' });
});

app.listen(port, host, (err) => {
  if (err) throw err;
  console.log(`Màn hình game:   http://${host}:${port}/`);
  console.log(`Bảng điều khiển: http://${host}:${port}/panel.html`);
  const sprites = listSprites();
  const owner = Object.keys(sprites.chuTiem).length;
  console.log(`Nhân vật riêng: ${sprites.khach.length} khách, ${owner} ảnh chủ tiệm, ${Object.keys(sprites.me).length} ảnh mẹ${sprites.unknown.length ? ` · sai tên: ${sprites.unknown.join(', ')}` : ''}`);
  const { token, chatId } = telegramConfig();
  console.log(token && chatId ? 'Báo cảnh báo qua Telegram: bật' : 'Báo cảnh báo qua Telegram: tắt (thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_ADMIN_CHAT_ID trong .env)');
  if (vbee.enabled) {
    console.log(`Giọng cô Tám: Vbee ${vbee.voice}, tốc độ ${vbee.speed}`);
    warmVoice();
  } else console.log('Giọng cô Tám: tắt (thiếu VBEE_TOKEN hoặc VBEE_APP_ID trong .env, nhớ chạy bằng start.bat hoặc npm start)');
  if (username) connectTikTok();
  else console.log('Chưa đặt kênh TikTok (npm start -- ten_kenh, hoặc tiktokUsername trong config.json). Đang ở chế độ thử.');
});

process.on('SIGINT', () => {
  saveState();
  process.exit(0);
});
