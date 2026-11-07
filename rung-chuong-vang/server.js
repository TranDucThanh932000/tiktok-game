import path from 'node:path';
import { appendFileSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseEnv } from 'node:util';
import express from 'express';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { createTikTokNormalizer, safeImageUrl } from '../shared/tiktok-events.mjs';
import { EventDeduplicator } from '../shared/event-deduplicator.mjs';
import { Game } from './src/game.js';
import { MC } from './src/mc.js';
import { createQuestions, validateBank } from './src/questions.js';
import { createVoice } from './src/voice.js';

const root = import.meta.dirname;
const config = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const mcLines = JSON.parse(readFileSync(path.join(root, 'mc.json'), 'utf8'));
const bank = JSON.parse(readFileSync(path.join(root, config.questionsFile ?? 'questions.json'), 'utf8'));
const username = (process.argv[2] ?? config.tiktokUsername ?? '').trim().replace(/^@/, '');
const port = Number(process.env.PORT) || config.port || 3013;
const host = '127.0.0.1';

const timing = config.timing ?? {};
const positive = (key) => Number.isFinite(timing[key]) && timing[key] > 0;
const whole = (value, min) => Number.isInteger(value) && value >= min;
const EFFECTS = ['cheer', 'shield', 'revive'];
const problems = [
  [whole(config.minPlayers, 1), 'minPlayers là số người tối thiểu trên sàn trước khi hỏi câu 1, từ 1 trở lên'],
  [whole(config.joinUntilQuestion, 0), 'joinUntilQuestion là câu cuối cùng còn cho lên sàn bằng comment, từ 0 trở lên'],
  [whole(config.maxQuestions, 1), 'maxQuestions là số câu thường tối đa mỗi trận, từ 1 trở lên'],
  [whole(config.goldenQuestions, 1), 'goldenQuestions là số câu hỏi vàng, từ 1 trở lên'],
  [whole(config.rescue?.minQuestion, 0) && whole(config.rescue?.maxTimes, 0) && config.rescue?.alivePercent >= 0 && config.rescue.alivePercent <= 100, 'rescue cần minQuestion, maxTimes (số nguyên từ 0) và alivePercent (0 đến 100)'],
  [['lobbySeconds', 'introSeconds', 'askSeconds', 'earlyCloseSeconds', 'revealSeconds', 'endSeconds'].every(positive), 'timing cần số giây lớn hơn 0'],
  [Array.isArray(config.gifts) && config.gifts.every((g) => whole(g.coins, 1) && EFFECTS.includes(g.effect) && g.label), 'mỗi quà trong gifts cần coins (từ 1 xu), effect (cheer, shield hoặc revive) và label'],
].filter(([ok]) => !ok);
if (problems.length) throw new Error(`config.json: ${problems.map(([, text]) => text).join('; ')}`);
const bankProblems = validateBank(bank);
if (bankProblems.length) throw new Error(`questions.json: ${bankProblems.slice(0, 10).join('; ')}`);

const guide = {
  title: config.title,
  subtitle: config.subtitle,
  minPlayers: config.minPlayers,
  joinUntilQuestion: config.joinUntilQuestion,
  goldenQuestions: config.goldenQuestions,
  rescueTimes: config.rescue.maxTimes,
  lobbySeconds: timing.lobbySeconds,
  askSeconds: timing.askSeconds,
  gifts: [...config.gifts].sort((a, b) => a.coins - b.coins).map(({ coins, effect, shields, label, giftLabel, icon }) => ({ coins, effect, shields: shields ?? 1, label, giftLabel: giftLabel ?? '', icon: icon ?? '' })),
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

// ---------- Giọng MC (Vbee) ----------
const vbee = {
  token: process.env.VBEE_TOKEN?.trim(),
  appId: process.env.VBEE_APP_ID?.trim(),
  voice: process.env.VBEE_VOICE?.trim() || 'n_hanoi_male_bountintuc_news_vc',
  speed: Number(process.env.VBEE_SPEED) || 1,
};
vbee.enabled = Boolean(vbee.token && vbee.appId);

// MC im lặng khi bị tắt ở bảng điều khiển hoặc khi TikTok cảnh báo phiên live; trận vẫn chạy bình thường.
let mcMuted = { on: false, reason: '' };
function setMcMuted(on, reason = '') {
  if (mcMuted.on === on) return;
  mcMuted = { on, reason: on ? reason : '' };
  console.log(`[MC] ${on ? `Tắt tiếng: ${reason}` : 'Bật tiếng'}`);
  broadcast({ type: 'mc-muted', ...mcMuted });
  if (on) mc.stop();
}

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

const mc = new MC({ voice, lines: mcLines, emit: broadcast, enabled: () => !mcMuted.on });

// ---------- Trận đấu ----------
const MODE_NAMES = { main: 'Câu', rescue: 'Cứu trợ', golden: 'Câu hỏi vàng' };
function logEvent(msg) {
  const { state } = msg;
  if (msg.type === 'join') console.log(`[Lên sàn] ${msg.player.name} · ${state.alive} người trên sàn`);
  if (msg.type === 'ask') {
    const no = state.mode === 'main' ? ` ${state.questionNo}` : state.mode === 'golden' ? ` ${state.goldenNo}/${state.goldenTotal}` : '';
    console.log(`[${MODE_NAMES[state.mode]}${no}] ${state.question.text} → ${game.answerText()}`);
  }
  if (msg.type === 'reveal') {
    const r = msg.result;
    const parts = [`đúng ${r.right}`];
    if (r.out.length) parts.push(`rời sàn ${r.out.length}`);
    if (r.saved.length) parts.push(`dùng phao ${r.saved.length}`);
    if (r.back.length) parts.push(`quay lại ${r.back.length}`);
    if (r.allWrong) parts.push('cả sàn cùng sai, giữ nguyên');
    console.log(`[Đáp án] ${r.answer} · ${parts.join(', ')} · còn ${state.alive} người trên sàn`);
  }
  if (msg.type === 'intro') console.log(msg.mode === 'rescue' ? '[Cứu trợ] Người đã rời sàn trả lời đúng sẽ được quay lại' : `[Câu hỏi vàng] ${msg.finalist?.name ?? ''} là người cuối cùng trên sàn`);
  if (msg.type === 'gift') console.log(`[Quà] ${msg.name}: ${msg.giftName || msg.label} x${msg.count} → ${msg.revived ? 'quay lại sàn' : msg.shields ? `+${msg.shields} phao` : 'cổ vũ'}`);
  if (msg.type === 'end') {
    const c = msg.champion;
    const names = c.winners.map((w) => w.name).join(', ');
    const text = { bell: `${names} RUNG CHUÔNG VÀNG`, fail: `${names} là người cuối cùng, dừng ở câu hỏi vàng ${c.goldenNo}`, many: `Cùng về đích: ${names}`, empty: 'Sàn trống' }[c.kind];
    console.log(`[Kết thúc] ${text}`);
  }
  if (msg.type === 'reset') console.log('[Trận mới] Mở sàn, comment VÀO để tham gia');
}

const game = new Game(config, {
  questions: createQuestions(bank),
  director: mc,
  emit(msg) {
    broadcast(msg);
    mc.onEvent(msg);
    logEvent(msg);
  },
});
mc.attach(game);
setInterval(() => {
  game.tick();
  mc.tick();
}, 100);

// Lời MC dùng chung chỉ phải tạo một lần, lưu ở data/tts; câu sắp hỏi được chen lên trước.
function warmVoice() {
  const texts = mc.staticParts();
  const missing = texts.filter((text) => !voice.ready(text));
  mc.prepareUpcoming(3);
  if (!missing.length) return console.log(`[Vbee] Đã có sẵn ${texts.length} mẩu lời MC`);
  console.log(`[Vbee] Đang tạo ${missing.length} mẩu lời MC, chỉ lần đầu...`);
  Promise.all(missing.map((text) => voice.clip(text))).then((ids) => console.log(`[Vbee] Xong lời MC: ${ids.filter(Boolean).length}/${missing.length} mẩu`));
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
  setMcMuted(true, 'TikTok cảnh báo phiên live');
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
const normalizer = createTikTokNormalizer({ likeGapToCommunity: false });
let dedup = new EventDeduplicator();

// Người xem không có id thì không theo dõi được trên sàn, nên bỏ qua.
const viewerOf = (event) => (event.userId ? { id: event.userId, name: event.nickname || event.username || 'Ẩn danh', avatar: event.avatar } : null);

function connectTikTok() {
  const conn = new TikTokLiveConnection(username, { processInitialData: false });
  const receive = (type, handle) => (raw) => {
    try {
      for (const event of normalizer[type](raw)) {
        if (!dedup.accept(event.eventId)) continue;
        const who = viewerOf(event);
        if (who) handle(event, who);
      }
    } catch (err) {
      console.error(`[TikTok] Không đọc được ${type}: ${err.message}`);
    }
  };

  conn.on(ControlEvent.DECODED_DATA, (type, event) => {
    const data = event?.data ?? event ?? {};
    const { common, ...fields } = data;
    // Control messages (pause, end...) count only when they carry a punishment.
    const warning = type === 'WebcastControlMessage' ? [data.punishInfo, data.perceptionDialog] : MODERATION_TYPES.has(type) ? [fields, common?.displayText] : [];
    if (hasContent(warning)) reportModeration(type, data);
  });
  conn.on(WebcastEvent.CHAT, receive('comment', (event, who) => game.comment(who, event.message.slice(0, 200))));
  conn.on(
    WebcastEvent.GIFT,
    receive('gift', (event, who) => {
      session.diamonds += event.diamonds * event.repeatCount;
      session.gifts += event.repeatCount;
      broadcast({ type: 'session', ...session });
      if (!game.gift(who, { coins: event.diamonds, name: event.giftName }, event.repeatCount)) {
        console.log(`[Quà khác] ${who.name}: ${event.giftName} #${event.giftId} (${event.diamonds} xu) x${event.repeatCount}`);
      }
    }),
  );
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
        // Phòng live mới: combo quà và id tin nhắn của phòng cũ không còn ý nghĩa.
        normalizer.reset();
        dedup = new EventDeduplicator();
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

app.get('/health', (req, res) => res.json({ app: 'rung-chuong-vang' }));

app.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  send(res, { type: 'snapshot', status, guide, alerts, session, tts: { enabled: vbee.enabled, voice: vbee.voice }, mcMuted, bankSize: bank.length, game: game.snapshot() });
  clients.add(res);
  res.on('close', () => clients.delete(res));
});
setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 20_000);

app.get('/tts/:id', (req, res) => {
  const audio = voice.audio(req.params.id);
  if (!audio) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type('audio/mpeg').send(audio);
});

// Đáp án câu đang hỏi chỉ cho bảng điều khiển, màn hình game không bao giờ nhận trước.
app.get('/api/answer', (req, res) => {
  const choice = game.correctChoice();
  res.json(choice === null ? { choice: null } : { choice, letter: 'ABCD'[choice], text: game.answerText() });
});

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || min));

// JSON-only endpoints: browsers cannot send application/json cross-site without a CORS preflight.
app.post('/api/simulate', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const { kind, name, text, coins, count, avatar } = req.body ?? {};
  const nickname = Array.from(typeof name === 'string' && name.trim() ? name.trim() : 'Bạn thử').slice(0, 24).join('');
  const who = { id: `sim:${nickname}`, name: nickname, avatar: safeImageUrl(avatar ?? '') };
  if (kind === 'chat') return res.json({ result: game.comment(who, String(text ?? '').slice(0, 200)) });
  if (kind === 'right' || kind === 'wrong') {
    const correct = game.correctChoice();
    if (correct === null) return res.json({ result: null, message: 'Chưa có câu hỏi nào đang chờ trả lời.' });
    const choice = kind === 'right' ? correct : [0, 1, 2, 3].filter((c) => c !== correct)[Math.floor(Math.random() * 3)];
    return res.json({ result: game.comment(who, 'ABCD'[choice]) });
  }
  if (kind === 'gift') return res.json({ result: game.gift(who, { coins: clampInt(coins, 1, 50_000), name: 'Quà thử' }, clampInt(count, 1, 999)) });
  res.status(400).json({ error: 'kind không hợp lệ' });
});

const controls = {
  next: () => game.advance(),
  skip: () => game.skip(),
  stop: () => game.stop(),
  reset: () => {
    game.reset();
    return true;
  },
};
app.post('/api/control', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const action = controls[req.body?.action];
  if (!action) return res.status(400).json({ error: 'action không hợp lệ' });
  res.json({ ok: action() });
});

app.post('/api/mc-mute', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  setMcMuted(req.body?.on === true, 'tắt tay từ bảng điều khiển');
  res.status(204).end();
});

app.post('/api/telegram-test', async (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const error = await sendTelegram('✅ Rung Chuông Vàng đã kết nối Telegram. Nếu TikTok cảnh báo phiên live, tin sẽ được gửi vào đây.');
  res.json({ message: error || 'Đã gửi tin thử, bạn kiểm tra Telegram nhé.' });
});

app.listen(port, host, (err) => {
  if (err) throw err;
  console.log(`Màn hình game:   http://${host}:${port}/`);
  console.log(`Bảng điều khiển: http://${host}:${port}/panel.html`);
  console.log(`Bộ câu hỏi: ${bank.length} câu`);
  const { token, chatId } = telegramConfig();
  console.log(token && chatId ? 'Báo cảnh báo qua Telegram: bật' : 'Báo cảnh báo qua Telegram: tắt (thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_ADMIN_CHAT_ID trong .env)');
  if (!vbee.enabled) console.log('Vbee: tắt, MC không có tiếng (thiếu VBEE_TOKEN hoặc VBEE_APP_ID trong .env)');
  else {
    console.log(`MC đọc bằng giọng ${vbee.voice}`);
    warmVoice();
  }
  if (username) connectTikTok();
  else console.log('Chưa đặt kênh TikTok (npm start -- ten_kenh, hoặc tiktokUsername trong config.json). Đang ở chế độ thử.');
});
