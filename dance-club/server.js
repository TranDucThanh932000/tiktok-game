import path from 'node:path';
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseEnv } from 'node:util';
import express from 'express';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { Club, GiftCounter, validateConfig } from './src/club.js';

const root = import.meta.dirname;
const config = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const problems = validateConfig(config);
if (problems.length) throw new Error(`config.json không hợp lệ:\n- ${problems.join('\n- ')}`);

const username = (process.argv[2] ?? config.tiktokUsername ?? '').trim().replace(/^@/, '');
const port = Number(process.env.PORT) || config.port || 3005;
const host = '127.0.0.1';

const club = new Club(config);
const clients = new Set();
let status = { connected: false, text: username ? `Chuẩn bị kết nối @${username}` : 'Chế độ thử: chưa đặt kênh TikTok' };
const feed = [];

const send = (res, message) => res.write(`data: ${JSON.stringify(message)}\n\n`);
const broadcast = (message) => clients.forEach((res) => send(res, message));

function log(text) {
  const line = { at: Date.now(), text };
  feed.push(line);
  if (feed.length > 60) feed.shift();
  broadcast({ type: 'log', ...line });
}

// Trạng thái gửi gộp tối đa ~8 lần/giây; sự kiện ngắn (quà, vẫy tay...) gửi ngay.
let stateTimer;
function pushState() {
  stateTimer ??= setTimeout(() => {
    stateTimer = undefined;
    broadcast({ type: 'state', state: club.snapshot() });
  }, 120);
}

const TIER_NAME = Object.fromEntries(config.tiers.map((t) => [t.tier, t.name]));
club.on((type, data) => {
  if (type === 'changed') return pushState();
  if (type === 'gift') log(`🎁 ${data.name}: ${data.giftName || 'quà'} x${data.units} (${data.coins} xu)`);
  if (type === 'perform') log(`💃 ${data.name} biểu diễn ${TIER_NAME[data.tier]} · ${data.choreoId}${data.rush ? ' (rút gọn vì hàng dài)' : ''}`);
  if (type === 'queued') log(`⏳ ${data.name} xếp lượt diễn ${TIER_NAME[data.tier]} (#${data.position})`);
  if (type === 'upgraded') log(`⬆️ ${data.name} được nâng lên ${TIER_NAME[data.tier]} (${data.coins} xu)`);
  if (type === 'dropped') log(`⚠️ Hàng quà đầy, bỏ lượt ${TIER_NAME[data.tier]} của ${data.name}`);
  if (type === 'joined') log(`🕺 ${data.name} lên sàn`);
  if (type === 'swapped') log(`🎭 ${data.name} đổi nhân vật (lần ${data.look})`);
  if (type === 'left' && data.reason !== 'make-room') log(`👋 ${data.name} rời sàn (${data.reason})`);
  if (type === 'left' && data.reason === 'make-room') log(`↩️ ${data.name} nhường chỗ, về đầu hàng chờ`);
  broadcast({ type: 'fx', fx: type, data, now: Date.now() });
});
setInterval(() => club.tick(), 100);

function setStatus(connected, text) {
  status = { connected, text };
  console.log(`[TikTok] ${text}`);
  broadcast({ type: 'status', ...status });
}

function safeImageUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

// Nhận diện bằng ID tài khoản; tên chỉ để hiển thị.
function viewer(user) {
  const raw = String(user?.nickname || user?.uniqueId || user?.displayId || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const name = Array.from(raw).slice(0, 18).join('') || 'Khách';
  const urls = user?.avatarThumb?.urlList ?? user?.avatarMedium?.urlList ?? [];
  const avatar = safeImageUrl(urls.find((url) => !/\.heic\b/i.test(url)) ?? urls[0] ?? '');
  return { id: String(user?.userId || user?.id || user?.uniqueId || user?.displayId || name), name, avatar };
}

const lastSeen = new Map();
function cooledDown(key, ms) {
  const now = Date.now();
  if (now - (lastSeen.get(key) ?? 0) < ms) return false;
  lastSeen.set(key, now);
  if (lastSeen.size > 5000) lastSeen.delete(lastSeen.keys().next().value);
  return true;
}

// ---------- Cảnh báo kiểm duyệt TikTok → moderation.log + Telegram (giống các game khác) ----------
const MODERATION_TYPES = new Set(['WebcastPerceptionMessage', 'WebcastNoticeMessage', 'WebcastPartnershipPunishMessage', 'WebcastRoomVerifyMessage']);
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
  log(`🚨 TikTok cảnh báo: ${text}`);
  if (cooledDown(`telegram:${text}`, 600_000)) {
    alertTelegram(`⚠️ TikTok cảnh báo phiên live @${username} lúc ${new Date().toLocaleTimeString('vi-VN')}\n${text}\n(Virtual Dance Club)`);
  }
}

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
}

// ---------- TikTok LIVE adapter: chuẩn hóa sự kiện rồi mới đưa vào Club ----------
let session = { roomId: '', diamonds: 0, gifts: 0, since: 0 };
const giftCounter = new GiftCounter();

function connectTikTok() {
  const conn = new TikTokLiveConnection(username, { processInitialData: false });

  conn.on(ControlEvent.DECODED_DATA, (type, event) => {
    const data = event?.data ?? event ?? {};
    const { common, ...fields } = data;
    const warning = type === 'WebcastControlMessage' ? [data.punishInfo, data.perceptionDialog] : MODERATION_TYPES.has(type) ? [fields, common?.displayText] : [];
    if (hasContent(warning)) reportModeration(type, data);
  });
  conn.on(WebcastEvent.CHAT, (e) => {
    const who = viewer(e.user);
    if (!cooledDown(`chat:${who.id}`, config.join.commentCooldownMs)) return;
    club.comment(who, String(e.comment ?? e.content ?? '').slice(0, 200));
  });
  conn.on(WebcastEvent.GIFT, (e) => {
    if (!e.gift && !e.giftDetails) return;
    const gift = e.giftDetails ?? e.gift;
    const units = giftCounter.count({
      msgId: e.common?.msgId ? String(e.common.msgId) : '',
      userId: e.user?.userId ?? e.user?.id,
      giftId: e.giftId,
      groupId: e.groupId,
      repeatCount: e.repeatCount,
      repeatEnd: Number(e.repeatEnd) === 1,
      combo: Number(gift.giftType ?? gift.type) === 1,
    });
    if (units <= 0) return;
    const who = viewer(e.user);
    const giftName = String(gift.giftName ?? gift.name ?? '').slice(0, 40);
    const coins = Number(gift.diamondCount) || 0;
    console.log(`[Quà] ${who.name}: ${giftName} (${coins} xu) x${units}`);
    session.diamonds += coins * units;
    session.gifts += units;
    broadcast({ type: 'session', ...session });
    club.gift(who, { coins, units, giftName, giftId: e.giftId ?? gift.id });
  });
  conn.on(WebcastEvent.LIKE, (e) => {
    club.like(viewer(e.user));
    if (cooledDown('like', 400)) broadcast({ type: 'fx', fx: 'like', data: { count: Math.min(5, Math.max(1, Number(e.likeCount) || 1)) } });
  });
  conn.on(WebcastEvent.STREAM_END, ({ action }) => {
    console.log(`[Phiên live] Tổng: ${session.diamonds.toLocaleString('vi-VN')} kim cương từ ${session.gifts} quà`);
    if (action === 4) reportModeration('StreamSuspended', { tips: 'TikTok đã đình chỉ phiên live' });
    setStatus(false, action === 4 ? `TikTok đã đình chỉ phiên live của @${username}` : `@${username} đã kết thúc live`);
  });
  conn.on(ControlEvent.ERROR, (err) => console.error('[TikTok]', err?.message ?? err));
  conn.on(ControlEvent.DISCONNECTED, () => retry(10_000, 'Mất kết nối TikTok'));

  // Thử lại với thời gian chờ tăng dần (10s → 20s → ... tối đa 60s).
  let timer;
  let busy = false;
  let failures = 0;
  function retry(ms, reason) {
    setStatus(false, `${reason}, thử lại sau ${Math.round(ms / 1000)} giây`);
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
      failures = 0;
      if (state.roomId !== session.roomId) {
        if (session.roomId) club.resetBoard();
        session = { roomId: state.roomId, diamonds: 0, gifts: 0, since: Date.now() };
        broadcast({ type: 'session', ...session });
      }
      setStatus(true, `Đã kết nối live @${username} (room ${state.roomId})`);
    } catch (err) {
      failures++;
      retry(Math.min(60_000, 10_000 * failures), `Lỗi: ${err?.message ?? err}`);
    } finally {
      busy = false;
    }
  }
  run();
}

// ---------- Web ----------
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => (['127.0.0.1', 'localhost'].includes(req.hostname) ? next() : res.status(403).end()));
app.use(express.static(path.join(root, 'public')));
app.use('/vendor/three', express.static(path.join(root, 'node_modules', 'three')));

// ---------- Meme GIF: chép file vào thư mục meme/ là game tự dùng (tải lại trang để nhận file mới) ----------
const memeDir = process.env.MEME_DIR || path.join(root, 'meme');
const MEME_FOLDERS = ['nguoi-xem', 'san-khau', ...config.tiers.map((t) => `bieu-dien/${t.tier}`)];
for (const sub of MEME_FOLDERS) mkdirSync(path.join(memeDir, sub), { recursive: true });
if (!existsSync(path.join(memeDir, 'HUONG-DAN.txt'))) {
  writeFileSync(
    path.join(memeDir, 'HUONG-DAN.txt'),
    [
      'Chép file GIF (hoặc .webp/.png) vào các thư mục sau rồi tải lại cửa sổ game (Ctrl + F5):',
      '',
      'nguoi-xem/      GIF cho người xem trên sàn. Mỗi người xem được gán cố định 1 GIF trong thư mục này.',
      '                Thư mục trống = dùng nhân vật 3D như cũ.',
      'bieu-dien/1..5  GIF cho người biểu diễn theo tier quà (1 Khởi Động ... 5 Huyền Thoại). Trống thì dùng GIF của người đó.',
      'san-khau/       dj.gif, mc.gif, vu-cong-1.gif, vu-cong-2.gif cho DJ, MC và 2 vũ công. Thiếu file nào thì người đó vẫn là 3D.',
      '',
      'Nên dùng GIF nền trong suốt, đứng thẳng (cao hơn rộng), dưới 2 MB. Chỉ dùng GIF bạn có quyền sử dụng.',
    ].join('\r\n'),
  );
}
app.use('/meme', express.static(memeDir));
const MEME_EXT = /\.(gif|webp|png|apng)$/i;
function listMemes(sub) {
  try {
    return readdirSync(path.join(memeDir, sub))
      .filter((f) => MEME_EXT.test(f))
      .sort()
      .map((f) => `/meme/${sub}/${encodeURIComponent(f)}`);
  } catch {
    return [];
  }
}
function scanMemes() {
  const stageFiles = listMemes('san-khau');
  const stage = (name) => stageFiles.find((u) => decodeURIComponent(u.split('/').pop()).replace(MEME_EXT, '').toLowerCase() === name) ?? '';
  return {
    crowd: listMemes('nguoi-xem'),
    perform: Object.fromEntries(config.tiers.map((t) => [t.tier, listMemes(`bieu-dien/${t.tier}`)])),
    stage: { dj: stage('dj'), mc: stage('mc'), dancer1: stage('vu-cong-1'), dancer2: stage('vu-cong-2') },
    height: config.meme?.height ?? 1.75,
    performerScale: config.meme?.performerScale ?? 1.5,
  };
}
app.use(express.json({ limit: '4kb' }));

// Dữ liệu cấu hình mà màn hình 3D cần (tương đương ScriptableObject trong Unity).
const clientConfig = {
  tiers: config.tiers,
  choreographies: config.choreographies,
  crowdReactionPresets: config.crowdReactionPresets,
  cameraPresets: config.cameraPresets,
  chillCamera: config.chillCamera,
  dance: config.dance,
  auraFx: config.auraFx,
  lightingPresets: config.lightingPresets,
  music: config.music,
  display: config.display,
  join: { keywords: config.join.keywords },
  joinFocus: config.joinFocus,
  swapGift: config.swapGift,
  maxDancers: config.floor.maxDancers,
};

app.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  send(res, { type: 'snapshot', state: club.snapshot(), status, session, feed, config: { ...clientConfig, memes: scanMemes() } });
  clients.add(res);
  res.on('close', () => clients.delete(res));
});
setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 20_000);

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || min));
const json = (handler) => (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  handler(req, res);
};

const NAMES = ['Nam', 'Lan', 'Hùng', 'Mai', 'Tuấn', 'Thảo', 'Bình', 'Hoa', 'Long', 'Vy', 'Phúc', 'Trang', 'Khoa', 'Linh', 'Đạt', 'Ngọc', 'Sơn', 'Yến', 'Quân', 'Hà', 'Minh', 'Châu', 'Kiệt', 'My', 'Duy', 'Nhi'];
let simSeq = 0;
function simViewer(name, id) {
  const nickname = typeof name === 'string' && name.trim() ? name.trim() : `${NAMES[Math.floor(Math.random() * NAMES.length)]} ${Math.floor(Math.random() * 900 + 100)}`;
  return viewer({ id: `sim:${typeof id === 'string' && id.trim() ? id.trim().slice(0, 40) : nickname}`, nickname });
}

// Lấy một người đang trên sàn (để thử quà nhanh mà không tạo thêm người).
function randomDancer() {
  const list = [...club.dancers.values()].filter((d) => d.status === 'chill');
  const d = list[Math.floor(Math.random() * list.length)];
  return d ? { id: d.id, name: d.name } : simViewer();
}

app.post(
  '/api/sim/comment',
  json((req, res) => {
    const { name, id, text } = req.body ?? {};
    res.json(club.comment(simViewer(name, id), String(text ?? 'hey').slice(0, 200)));
  }),
);

app.post(
  '/api/sim/crowd',
  json((req, res) => {
    const n = clampInt(req.body?.count, 1, 300);
    for (let i = 0; i < n; i++) {
      const who = simViewer(`${NAMES[(simSeq + i) % NAMES.length]} ${100 + ((simSeq * 7 + i * 13) % 900)}`);
      club.comment(who, 'hey');
    }
    simSeq += n;
    res.json({ dancers: club.dancers.size, waiting: club.waitlist.length });
  }),
);

app.post(
  '/api/sim/gift',
  json((req, res) => {
    const { name, id, coins, count, combo, giftName } = req.body ?? {};
    const who = name || id ? simViewer(name, id) : randomDancer();
    const units = clampInt(count, 1, 999);
    const value = clampInt(coins, 1, 100_000);
    const label = String(giftName ?? 'Quà thử').slice(0, 40);
    if (combo) {
      // Mô phỏng TikTok gửi combo: nhiều bản cập nhật tổng dồn, có bản lặp lại.
      const groupId = `${Date.now()}`;
      let total = 0;
      for (let i = 1; i <= units; i++) {
        total += giftCounter.count({ msgId: `sim-${groupId}-${i}`, userId: who.id, giftId: label, groupId, repeatCount: i, combo: true });
        total += giftCounter.count({ msgId: `sim-${groupId}-${i}`, userId: who.id, giftId: label, groupId, repeatCount: i, combo: true });
      }
      total += giftCounter.count({ msgId: `sim-${groupId}-end`, userId: who.id, giftId: label, groupId, repeatCount: units, repeatEnd: true, combo: true });
      return res.json({ units: total, ...club.gift(who, { coins: value, units: total, giftName: label }) });
    }
    res.json(club.gift(who, { coins: value, units, giftName: label }));
  }),
);

app.post(
  '/api/sim/tier',
  json((req, res) => {
    const tier = config.tiers.find((t) => t.tier === Number(req.body?.tier));
    if (!tier) return res.status(400).json({ error: 'tier không hợp lệ' });
    const who = req.body?.name ? simViewer(req.body.name) : randomDancer();
    res.json(club.gift(who, { coins: tier.minCoins, units: 1, giftName: `Thử ${tier.name}` }));
  }),
);

app.post(
  '/api/sim/swap',
  json((req, res) => {
    const sg = config.swapGift ?? {};
    const who = req.body?.name ? simViewer(req.body.name) : randomDancer();
    res.json(club.gift(who, { coins: 1, units: 1, giftName: sg.names?.[0] ?? sg.gift ?? 'TikTok' }));
  }),
);

app.post(
  '/api/chill',
  json((req, res) => {
    club.forceChill();
    res.status(204).end();
  }),
);

app.post(
  '/api/clear-queue',
  json((req, res) => {
    club.clearQueue();
    log('🧹 Đã xóa hàng chờ biểu diễn');
    res.status(204).end();
  }),
);

app.post(
  '/api/reset',
  json((req, res) => {
    club.reset();
    log('♻️ Đã làm mới sàn nhảy');
    res.status(204).end();
  }),
);

// Ảnh đại diện TikTok đi qua server để màn LED (canvas) vẽ được; chỉ nhận ảnh từ CDN của TikTok.
const AVATAR_HOSTS = /(^|\.)(tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|byteimg\.com|ibyteimg\.com|tiktokv\.com|muscdn\.com)$/i;
const avatarCache = new Map();
app.get('/api/avatar', async (req, res) => {
  let url;
  try {
    url = new URL(String(req.query.u ?? ''));
  } catch {
    return res.status(400).end();
  }
  if (url.protocol !== 'https:' || !AVATAR_HOSTS.test(url.hostname)) return res.status(403).end();
  let hit = avatarCache.get(url.href);
  if (!hit) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const type = r.headers.get('content-type') ?? '';
      if (!r.ok || !type.startsWith('image/')) return res.status(502).end();
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 2_000_000) return res.status(413).end();
      hit = { type, buf };
      avatarCache.set(url.href, hit);
      if (avatarCache.size > 300) avatarCache.delete(avatarCache.keys().next().value);
    } catch {
      return res.status(502).end();
    }
  }
  res.set({ 'Content-Type': hit.type, 'Cache-Control': 'public, max-age=3600' }).send(hit.buf);
});

app.post(
  '/api/reset-board',
  json((req, res) => {
    club.resetBoard();
    log('🏆 Đã xóa bảng xếp hạng');
    res.status(204).end();
  }),
);

app.post(
  '/api/telegram-test',
  json(async (req, res) => {
    const error = await sendTelegram('✅ Virtual Dance Club đã kết nối Telegram. Nếu TikTok cảnh báo phiên live, tin sẽ được gửi vào đây.');
    res.json({ message: error || 'Đã gửi tin thử, bạn kiểm tra Telegram nhé.' });
  }),
);

app.listen(port, host, (err) => {
  if (err) throw err;
  console.log(`Màn hình game:   http://${host}:${port}/`);
  console.log(`Bảng điều khiển: http://${host}:${port}/panel.html`);
  if (username) connectTikTok();
  else console.log('Chưa đặt kênh TikTok (npm start -- ten_kenh, hoặc tiktokUsername trong config.json). Đang ở chế độ thử.');
});
