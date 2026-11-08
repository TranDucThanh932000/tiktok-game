import path from 'node:path';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseEnv } from 'node:util';
import express from 'express';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { WordGame } from './src/game.js';
import { bankSize, createDeck, validateBank } from './src/words.js';

const root = import.meta.dirname;
const config = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const bank = JSON.parse(readFileSync(path.join(root, 'words.json'), 'utf8'));
const username = (process.argv[2] ?? config.tiktokUsername ?? '').trim().replace(/^@/, '');
// DATA_DIR để chạy thử song song mà không đụng bảng điểm đang có.
const dataDir = process.env.DATA_DIR?.trim() || path.join(root, 'data');
const port = Number(process.env.PORT) || config.port || 3015;
const host = '127.0.0.1';

const timing = config.timing ?? {};
const positive = (key) => Number.isFinite(timing[key]) && timing[key] > 0;
const tiers = config.boost?.tiers;
const problems = [
  [Number.isInteger(config.seats) && config.seats >= 8 && config.seats <= 64, 'seats là số chỗ ngồi trong lớp (top bảng điểm), từ 8 đến 64'],
  [['wordSeconds', 'afterFirstSeconds', 'revealSeconds'].every(positive) && timing.graceSeconds >= 0 && timing.hintEverySeconds >= 0, 'timing cần số giây lớn hơn 0 (graceSeconds, hintEverySeconds để 0 được)'],
  [config.hints?.start >= 0 && config.hints.max <= 1 && config.hints.max >= config.hints.start, 'hints.start và hints.max là tỉ lệ chữ cái được mở, từ 0 đến 1, max không nhỏ hơn start'],
  [Number.isInteger(config.boost?.multiplier) && config.boost.multiplier >= 1, 'boost.multiplier là số lần nhân điểm, số nguyên từ 1'],
  [Number.isInteger(config.boost?.socialTurns) && config.boost.socialTurns >= 0 && config.boost.socialGapSeconds >= 0, 'boost.socialTurns và boost.socialGapSeconds từ 0 trở lên'],
  [Array.isArray(tiers) && tiers.length && tiers.every((t) => t.coins >= 1 && Number.isInteger(t.turns) && t.turns >= 1 && t.label && t.icon), 'mỗi mức trong boost.tiers cần coins, turns, label, icon'],
].filter(([ok]) => !ok);
if (problems.length) throw new Error(`config.json: ${problems.map(([, text]) => text).join('; ')}`);
const bankProblems = validateBank(bank);
if (bankProblems.length) throw new Error(`words.json:\n${bankProblems.join('\n')}`);

const guide = {
  title: config.title,
  seats: config.seats,
  multiplier: config.boost.multiplier,
  socialTurns: config.boost.socialTurns,
  tiers: [...tiers].sort((a, b) => a.coins - b.coins).map(({ coins, turns, label, icon }) => ({ coins, turns, label, icon })),
};

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

// ---------- Trò chơi ----------
let current = null;
function logEvent(msg) {
  if (msg.type === 'word') current = msg;
  if (msg.type === 'correct') console.log(`[Đoán đúng] ${msg.name} +${msg.delta}${msg.boosted ? ' (x2)' : ''} · ${msg.score} điểm${msg.first ? ' · đầu tiên' : ''}`);
  if (msg.type === 'reveal') console.log(`[Từ ${current?.no ?? '?'}] ${msg.answer} · ${msg.count} bạn đoán đúng`);
  if (msg.type === 'boost') console.log(`[x2] ${msg.name} +${msg.added} lượt (${msg.kind ?? 'quà'}), còn ${msg.turns}`);
}

const STATE_FILE = path.join(dataDir, 'board.json');
const game = new WordGame(config, {
  deck: createDeck(bank),
  emit(msg) {
    broadcast(msg);
    logEvent(msg);
  },
});
try {
  game.importState(JSON.parse(readFileSync(STATE_FILE, 'utf8')));
  if (game.players.size) console.log(`Đã nạp bảng điểm cũ: ${game.players.size} người chơi`);
} catch {
  // Chưa có bảng điểm cũ.
}
function saveState() {
  if (!game.stateDirty) return;
  game.stateDirty = false;
  try {
    mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    writeFileSync(`${STATE_FILE}.tmp`, JSON.stringify(game.exportState()));
    renameSync(`${STATE_FILE}.tmp`, STATE_FILE);
  } catch (err) {
    console.error(`[Bảng điểm] Không lưu được: ${err.message}`);
  }
}
setInterval(saveState, 3000);
setInterval(() => game.tick(), 100);

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
  // The same warning repeated within 10 minutes is sent to Telegram once.
  if (cooledDown(`telegram:${text}`, 600_000)) {
    const time = new Date(alert.at).toLocaleTimeString('vi-VN');
    alertTelegram(`⚠️ TikTok cảnh báo phiên live @${username} lúc ${time}\n${text}\nHãy kiểm tra hộp thư TikTok.`);
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
  conn.on(WebcastEvent.CHAT, (e) => game.comment(viewer(e.user), String(e.comment ?? e.content ?? '').slice(0, 200)));
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
    game.gift(who, coins, count);
  });
  conn.on(WebcastEvent.FOLLOW, (e) => game.social(viewer(e.user), 'follow'));
  conn.on(WebcastEvent.SHARE, (e) => game.social(viewer(e.user), 'share'));
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
  send(res, { type: 'snapshot', status, guide, alerts, session, bankSize: bankSize(bank), game: game.snapshot() });
  clients.add(res);
  res.on('close', () => clients.delete(res));
});
setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 20_000);

// Đáp án từ đang hỏi, cho bảng điều khiển (màn hình game không gọi tới).
app.get('/api/word', (req, res) => res.json({ answer: game.puzzle?.display ?? '' }));

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || min));

// JSON-only endpoints: browsers cannot send application/json cross-site without a CORS preflight.
app.post('/api/simulate', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const { kind, name, text, coins, count } = req.body ?? {};
  const nickname = typeof name === 'string' && name.trim() ? name : 'Bạn thử';
  const who = viewer({ id: `sim:${nickname}`, nickname });
  if (kind === 'chat') return res.json({ result: game.comment(who, String(text ?? '').slice(0, 200)) });
  if (kind === 'right') {
    if (game.phase !== 'asking') return res.json({ result: false, message: 'Đang công bố đáp án, chờ từ mới nhé.' });
    return res.json({ result: game.comment(who, game.puzzle.answer) });
  }
  if (kind === 'gift') return res.json({ result: game.gift(who, clampInt(coins, 1, 50_000), clampInt(count, 1, 999)) });
  if (kind === 'follow' || kind === 'share') return res.json({ result: game.social(who, kind) });
  res.status(400).json({ error: 'kind không hợp lệ' });
});

const controls = {
  letter: () => game.openLetter(),
  skip: () => game.skip(),
  reset: () => {
    game.reset();
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

app.post('/api/telegram-test', async (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const error = await sendTelegram('✅ Lớp Học Đoán Từ đã kết nối Telegram. Nếu TikTok cảnh báo phiên live, tin sẽ được gửi vào đây.');
  res.json({ message: error || 'Đã gửi tin thử, bạn kiểm tra Telegram nhé.' });
});

app.listen(port, host, (err) => {
  if (err) throw err;
  console.log(`Màn hình game:   http://${host}:${port}/`);
  console.log(`Bảng điều khiển: http://${host}:${port}/panel.html`);
  console.log(`Bộ từ: ${bankSize(bank)} từ, ${Object.keys(bank).length} chủ đề`);
  const { token, chatId } = telegramConfig();
  console.log(token && chatId ? 'Báo cảnh báo qua Telegram: bật' : 'Báo cảnh báo qua Telegram: tắt (thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_ADMIN_CHAT_ID trong .env)');
  if (username) connectTikTok();
  else console.log('Chưa đặt kênh TikTok (npm start -- ten_kenh, hoặc tiktokUsername trong config.json). Đang ở chế độ thử.');
});

process.on('SIGINT', () => {
  saveState();
  process.exit(0);
});
