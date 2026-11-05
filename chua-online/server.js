import path from 'node:path';
import { appendFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseEnv } from 'node:util';
import express from 'express';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const config = JSON.parse(readFileSync(path.join(import.meta.dirname, 'config.json'), 'utf8'));
const username = (process.argv[2] ?? config.tiktokUsername ?? '').trim().replace(/^@/, '');
const port = Number(process.env.PORT) || config.port || 3000;
const host = '127.0.0.1';

const ACTIONS = ['mo', 'incense', 'flower', 'lantern', 'bell', 'ceremony', 'repent'];
const tiers = [...config.giftTiers].sort((a, b) => b.minCoins - a.minCoins);
for (const action of [...tiers.map((t) => t.action), ...config.gifts.map((g) => g.action), ...Object.values(config.socialActions)]) {
  if (!ACTIONS.includes(action)) {
    throw new Error(`config.json: hành động "${action}" không hợp lệ, chỉ dùng: ${ACTIONS.join(', ')}`);
  }
}
const RITUALS = ['mo', 'incense', 'bell', 'speak'];
for (const ritual of config.rituals ?? []) {
  if (!RITUALS.includes(ritual.action) || !Number.isInteger(ritual.everyMinutes) || ritual.everyMinutes < 1) {
    throw new Error(`config.json: rituals cần action là ${RITUALS.join(', ')} và everyMinutes là số phút nguyên dương`);
  }
}

// "Sức Khoẻ!" -> "suc khoe", so comments match with or without diacritics.
const normalize = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const wishes = config.wishes.map((wish) => {
  const words = [wish.text, ...wish.keywords].map(normalize).filter(Boolean);
  return { text: wish.text, pattern: new RegExp(`(?:^| )(?:${words.join('|')})(?: |$)`) };
});
const wishFor = (comment) => {
  const text = normalize(comment);
  return wishes.find((wish) => wish.pattern.test(text))?.text;
};

const guide = {
  social: config.socialActions,
  wishes: config.wishes.map((wish) => wish.text),
  gifts: config.gifts.map(({ name, label, icon, action, coins }) => ({ name, label: label || name, icon, action, coins: coins ?? 1 })),
  tiers: tiers.map(({ minCoins, action, icon }) => ({ minCoins, action, icon })),
  rituals: (config.rituals ?? []).map(({ everyMinutes, action, count }) => ({ everyMinutes, action, count: count ?? 1 })),
  repentVerse: config.repentVerse ?? [],
};

const vbee = {
  token: process.env.VBEE_TOKEN?.trim(),
  appId: process.env.VBEE_APP_ID?.trim(),
  voice: process.env.VBEE_VOICE?.trim() || 'hn_female_ngochuyen_full_48k-fhg',
  speed: Number(process.env.VBEE_SPEED) || 1,
  template: process.env.VBEE_TEXT?.trim(),
};
vbee.enabled = Boolean(vbee.token && vbee.appId);

let total = 0;
const viewers = new Map();
const clients = new Set();
let status = {
  connected: false,
  text: username ? `Chuẩn bị kết nối @${username}` : 'Chế độ thử: chưa đặt kênh TikTok',
};

const send = (res, message) => res.write(`data: ${JSON.stringify(message)}\n\n`);
const broadcast = (message) => clients.forEach((res) => send(res, message));
const leaderboard = () => [...viewers.values()].sort((a, b) => b.merit - a.merit).slice(0, 5);

// Safe mode pauses everything that runs without the host (timed rituals, Vbee voice) until the host turns it off.
let safeMode = false;
function setSafeMode(on, reason) {
  if (safeMode === on) return;
  safeMode = on;
  console.log(`[Chế độ an toàn] ${on ? `Bật: ${reason}` : 'Tắt'}`);
  broadcast({ type: 'safe-mode', on });
}

// Each minute, play the rituals that are due; several due at once run 4 s apart.
let ritualMinute = 0;
setInterval(() => {
  ritualMinute++;
  if (safeMode) return;
  (config.rituals ?? [])
    .filter((ritual) => ritualMinute % ritual.everyMinutes === 0)
    .forEach((ritual, i) => setTimeout(() => runRitual(ritual), i * 4000));
}, 60_000);

let lastBlessing = -1;
function runRitual(ritual) {
  if (ritual.action !== 'speak') return broadcast({ type: 'ritual', action: ritual.action, count: ritual.count ?? 1 });
  const blessings = config.blessings ?? [];
  if (!blessings.length) return;
  let index = Math.floor(Math.random() * blessings.length);
  if (blessings.length > 1 && index === lastBlessing) index = (index + 1) % blessings.length;
  lastBlessing = index;
  broadcast({ type: 'ritual', action: 'speak', text: blessings[index] });
  if (config.readBlessings) speakText(blessings[index]);
}

let stateTimer;
function pushState() {
  stateTimer ??= setTimeout(() => {
    stateTimer = undefined;
    broadcast({ type: 'state', total, top: leaderboard() });
  }, 250);
}

function setStatus(connected, text) {
  status = { connected, text };
  console.log(`[TikTok] ${text}`);
  broadcast({ type: 'status', ...status });
}

function emit(action, who, { count = 1, merit = 0, via, detail } = {}) {
  if (merit > 0) {
    total += merit;
    const entry = viewers.get(who.id) ?? { name: who.name, merit: 0 };
    entry.name = who.name;
    entry.merit += merit;
    viewers.set(who.id, entry);
    pushState();
  }
  broadcast({ type: 'action', action, user: who.name, avatar: who.avatar, count, merit, via, detail });
}

const handle = {
  like: (who, count) => emit('mo', who, { count, merit: count * config.merit.like, via: 'like' }),
  wish(who, text) {
    emit('wish', who, { merit: config.merit.wish, via: 'chat', detail: text });
    if (config.readWishes) speak(who.name, text);
  },
  follow: (who) => emit(config.socialActions.follow, who, { merit: config.merit.follow, via: 'follow' }),
  share: (who) => emit(config.socialActions.share, who, { merit: config.merit.share, via: 'share' }),
  join: (who) => broadcast({ type: 'join', user: who.name, avatar: who.avatar }),
  gift(who, gift, count) {
    const rule = config.gifts.find((g) => g.name.toLowerCase() === gift.name.toLowerCase());
    const action = rule?.action ?? (tiers.find((t) => gift.coins >= t.minCoins) ?? tiers.at(-1)).action;
    const merit = Math.max(1, gift.coins) * count * config.merit.perCoin;
    emit(action, who, { count, merit, via: 'gift', detail: rule?.label || gift.name });
    // A combo arrives as several events; read the name once.
    if (action === 'repent' && config.readWishes && cooledDown(`repent:${who.id}`, 30_000)) {
      speakText(nextVoiceLine('repent', who.name));
    }
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
  const raw = String(user?.nickname || user?.displayId || '').replace(/\s+/g, ' ').trim();
  const name = Array.from(raw).slice(0, 20).join('') || 'Ẩn danh';
  // Browsers cannot render HEIC, which TikTok sometimes lists first.
  const urls = user?.avatarThumb?.urlList ?? user?.avatarMedium?.urlList ?? [];
  const avatar = safeImageUrl(urls.find((url) => !/\.heic\b/i.test(url)) ?? urls[0] ?? '');
  return { id: String(user?.id || user?.displayId || name), name, avatar };
}

const lastSeen = new Map();
function cooledDown(key, ms) {
  const now = Date.now();
  if (now - (lastSeen.get(key) ?? 0) < ms) return false;
  lastSeen.set(key, now);
  return true;
}

// Vbee TTS clips kept in memory and served from /tts/:id, keyed by a hash so repeated sentences cost nothing.
const clips = new Map();
let speechQueue = Promise.resolve();
let speechPending = 0;

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
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
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

const spokenName = (name) => name.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim() || 'Một bạn';
const voiceIndexes = new Map();

function nextVoiceLine(kind, name, wish = '') {
  const fallback = kind === 'wish'
    ? '{name} xin gửi lời nguyện cầu về {wish}.'
    : '{name} thành kính xin sám hối.';
  const templates = kind === 'wish' && vbee.template ? [vbee.template] : config.voiceTemplates?.[kind];
  const lines = Array.isArray(templates) && templates.length ? templates : [fallback];
  const index = (voiceIndexes.get(kind) ?? 0) % lines.length;
  voiceIndexes.set(kind, (index + 1) % lines.length);
  return lines[index].replaceAll('{name}', spokenName(name)).replaceAll('{wish}', wish.toLowerCase());
}

function speak(name, wish) {
  speakText(nextVoiceLine('wish', name, wish));
}

function speakText(sentence) {
  if (!vbee.enabled || safeMode) return;
  const text = sentence.slice(0, 500);
  const id = createHash('sha1').update(`${vbee.voice}|${vbee.speed}|${text}`).digest('hex').slice(0, 16);
  if (clips.has(id)) return broadcast({ type: 'speak', id });
  // Sequential requests keep reading order and stay under Vbee's concurrency limit; skip when backed up.
  if (speechPending >= 3) return console.warn(`[Vbee] Đang chờ đọc quá nhiều, bỏ qua: ${text}`);
  speechPending++;
  speechQueue = speechQueue
    .then(async () => {
      if (!clips.has(id)) {
        clips.set(id, await synthesize(text));
        console.log(`[Vbee] Đã tạo giọng đọc: ${text}`);
      }
      if (clips.size > 50) clips.delete(clips.keys().next().value);
      broadcast({ type: 'speak', id });
    })
    .catch((err) => {
      console.error(`[Vbee] Lỗi đọc "${text}": ${err.message}`);
      broadcast({ type: 'speak-error', message: err.message });
    })
    .finally(() => speechPending--);
}

// TikTok may push moderation notices into the room: violation warnings, punishments, presence checks.
// A viewer connection may not receive all of them, so alerts are a hint; TikTok's inbox stays authoritative.
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
  appendFileSync(path.join(import.meta.dirname, 'moderation.log'), `${new Date().toISOString()} ${type} ${raw}\n`);
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

// Read from .env on every send, so Telegram details can change without a restart (which would wipe the board).
function telegramConfig() {
  let file = {};
  try {
    file = parseEnv(readFileSync(path.join(import.meta.dirname, '.env'), 'utf8'));
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

// Telegram can be unreachable from this network for minutes at a time (both alerts on 2026-10-30 timed out).
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

function sessionReport() {
  if (!session.roomId) return '💎 Chưa có phiên live nào từ lúc bật server.';
  const since = new Date(session.since).toLocaleTimeString('vi-VN');
  const ended = status.connected ? '' : ', đã kết thúc';
  return `💎 Phiên live @${username} (từ ${since}${ended}): ${session.diamonds.toLocaleString('vi-VN')} kim cương từ ${session.gifts.toLocaleString('vi-VN')} quà.`;
}

// Long polling needs no public URL. Only the admin chat gets answers, and commands older than 2 minutes are skipped.
async function pollTelegram(offset = 0) {
  const { token, chatId } = telegramConfig();
  if (!token || !chatId) return setTimeout(pollTelegram, 60_000, offset);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?timeout=50&offset=${offset}`, { signal: AbortSignal.timeout(60_000) });
    // 409: another program already receives this bot's messages; stop rather than fight over them.
    if (res.status === 409) return console.warn('[Telegram] Bot đang được chương trình khác nhận tin, nên tắt lệnh /count. Hãy dùng một bot riêng cho game.');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    for (const update of body.result ?? []) {
      offset = update.update_id + 1;
      const message = update.message;
      if (String(message?.chat?.id) !== chatId || Date.now() / 1000 - message.date > 120) continue;
      if (/^\/count(@\w+)?(\s|$)/.test(message.text ?? '')) await sendTelegram(sessionReport());
    }
  } catch (err) {
    console.error(`[Telegram] Lỗi nhận lệnh: ${err.message}`);
    return setTimeout(pollTelegram, 30_000, offset);
  }
  pollTelegram(offset);
}

// Diamonds from real TikTok gifts in the current LIVE room (panel test gifts don't count); reconnects keep the count.
let session = { roomId: '', diamonds: 0, gifts: 0, since: 0 };

function connectTikTok() {
  const conn = new TikTokLiveConnection(username, { processInitialData: false });
  const streaks = new Map();

  conn.on(ControlEvent.DECODED_DATA, (type, event) => {
    const data = event?.data ?? event ?? {};
    const { common, ...fields } = data;
    // Control messages (pause, end...) count only when they carry a punishment.
    const warning = type === 'WebcastControlMessage' ? [data.punishInfo, data.perceptionDialog] : MODERATION_TYPES.has(type) ? [fields, common?.displayText] : [];
    if (hasContent(warning)) reportModeration(type, data);
  });
  conn.on(WebcastEvent.LIKE, (e) => handle.like(viewer(e.user), Math.max(1, Number(e.count) || 1)));
  conn.on(WebcastEvent.CHAT, (e) => {
    const who = viewer(e.user);
    const wish = wishFor(e.content);
    if (wish && cooledDown(`wish:${who.id}`, 10_000)) handle.wish(who, wish);
  });
  conn.on(WebcastEvent.FOLLOW, (e) => {
    const who = viewer(e.user);
    if (cooledDown(`follow:${who.id}`, 600_000)) handle.follow(who);
  });
  conn.on(WebcastEvent.SHARE, (e) => {
    const who = viewer(e.user);
    if (cooledDown(`share:${who.id}`, 60_000)) handle.share(who);
  });
  conn.on(WebcastEvent.MEMBER, (e) => {
    // action 1 = joined the room, 3 = subscribed.
    if (Number(e.action) > 1) return;
    const who = viewer(e.user);
    if (cooledDown(`join:${who.id}`, 300_000)) handle.join(who);
  });
  conn.on(WebcastEvent.GIFT, (e) => {
    if (!e.gift) return;
    const repeat = Math.max(1, Number(e.repeatCount) || 1);
    let count = repeat;
    if (e.gift.type === 1) {
      // Combo gifts resend a running total; only the increase is new.
      const key = `${e.user?.id}:${e.giftId}:${e.groupId}`;
      const previous = streaks.get(key) ?? 0;
      count = repeat >= previous ? repeat - previous : repeat;
      if (e.repeatEnd === 1) streaks.delete(key);
      else streaks.set(key, repeat);
    }
    if (count <= 0) return;
    const who = viewer(e.user);
    const gift = { name: String(e.gift.name ?? ''), coins: Number(e.gift.diamondCount) || 0 };
    console.log(`[Quà] ${who.name}: ${gift.name} (${gift.coins} xu) x${count}`);
    session.diamonds += gift.coins * count;
    session.gifts += count;
    broadcast({ type: 'session', ...session });
    handle.gift(who, gift, count);
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

const app = express();
app.disable('x-powered-by');
// Only answer requests addressed to this machine (blocks DNS rebinding).
app.use((req, res, next) => (['127.0.0.1', 'localhost'].includes(req.hostname) ? next() : res.status(403).end()));
app.use(express.static(path.join(import.meta.dirname, 'public')));
app.use(express.json({ limit: '4kb' }));

app.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  send(res, { type: 'snapshot', total, top: leaderboard(), status, guide, alerts, safeMode, session, tts: { enabled: vbee.enabled, voice: vbee.voice, readWishes: Boolean(config.readWishes), readBlessings: Boolean(config.readBlessings) } });
  clients.add(res);
  res.on('close', () => clients.delete(res));
});
setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 20_000);

app.get('/tts/:id', (req, res) => {
  const audio = clips.get(req.params.id);
  if (!audio) return res.status(404).end();
  res.type('audio/mpeg').send(audio);
});

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || min));

// JSON-only endpoints: browsers cannot send application/json cross-site without a CORS preflight.
app.post('/api/simulate', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const { kind, name, count, text, gift, coins, avatar, index } = req.body ?? {};
  const nickname = typeof name === 'string' && name.trim() ? name : 'Khách thử';
  const who = viewer({ id: `sim:${nickname}`, nickname, avatarThumb: { urlList: [String(avatar ?? '').slice(0, 1000)] } });
  switch (kind) {
    case 'like':
      handle.like(who, clampInt(count, 1, 999));
      break;
    case 'chat': {
      const wish = wishFor(String(text ?? '').slice(0, 200));
      if (wish) handle.wish(who, wish);
      return res.json({ wish: wish ?? null });
    }
    case 'follow':
      handle.follow(who);
      break;
    case 'share':
      handle.share(who);
      break;
    case 'join':
      handle.join(who);
      break;
    case 'gift':
      handle.gift(who, { name: String(gift ?? 'Quà').slice(0, 40), coins: clampInt(coins, 1, 100_000) }, clampInt(count, 1, 999));
      break;
    case 'ritual': {
      const ritual = (config.rituals ?? [])[clampInt(index, 0, 99)];
      if (!ritual) return res.status(400).json({ error: 'index không hợp lệ' });
      runRitual(ritual);
      break;
    }
    default:
      return res.status(400).json({ error: 'kind không hợp lệ' });
  }
  res.status(204).end();
});

app.post('/api/reset', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  total = 0;
  viewers.clear();
  broadcast({ type: 'state', total, top: [] });
  res.status(204).end();
});

app.post('/api/safe-mode', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  setSafeMode(req.body?.on === true, 'bật tay từ bảng điều khiển');
  res.status(204).end();
});

app.post('/api/telegram-test', async (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const error = await sendTelegram('✅ Chùa Online đã kết nối Telegram. Nếu TikTok cảnh báo phiên live, tin sẽ được gửi vào đây.');
  res.json({ message: error || 'Đã gửi tin thử, bạn kiểm tra Telegram nhé.' });
});

app.listen(port, host, (err) => {
  if (err) throw err;
  console.log(`Màn hình game:   http://${host}:${port}/`);
  console.log(`Bảng điều khiển: http://${host}:${port}/panel.html`);
  const { token, chatId } = telegramConfig();
  console.log(token && chatId ? 'Báo cảnh báo qua Telegram: bật · lệnh /count: bật' : 'Báo cảnh báo qua Telegram: tắt (thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_ADMIN_CHAT_ID trong .env)');
  pollTelegram();
  if (!vbee.enabled) console.log('Vbee: tắt (thiếu VBEE_TOKEN hoặc VBEE_APP_ID trong .env)');
  else console.log(`Vbee đọc bình luận: ${config.readWishes ? `bật (giọng ${vbee.voice})` : 'tắt'} · đọc lời chúc tự động: ${config.readBlessings ? 'bật' : 'tắt'} (readWishes, readBlessings trong config.json)`);
  if (username) connectTikTok();
  else console.log('Chưa đặt kênh TikTok (npm start -- ten_kenh, hoặc tiktokUsername trong config.json). Đang ở chế độ thử.');
});
