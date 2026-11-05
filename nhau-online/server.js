import path from 'node:path';
import { appendFileSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseEnv } from 'node:util';
import express from 'express';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { Shop, GiftCounter } from './src/shop.js';

const config = JSON.parse(readFileSync(path.join(import.meta.dirname, 'config.json'), 'utf8'));
const username = (process.argv[2] ?? config.tiktokUsername ?? '').trim().replace(/^@/, '');
const port = Number(process.env.PORT) || config.port || 3004;
const host = '127.0.0.1';

for (const entry of config.menu) {
  if (!config.items[entry.item]) throw new Error(`config.json: món "${entry.item}" của quà ${entry.gift} không có trong items`);
}

const shop = new Shop(config);
const clients = new Set();
let status = {
  connected: false,
  text: username ? `Chuẩn bị kết nối @${username}` : 'Chế độ thử: chưa đặt kênh TikTok',
};

const send = (res, message) => res.write(`data: ${JSON.stringify(message)}\n\n`);
const broadcast = (message) => clients.forEach((res) => send(res, message));

// Trạng thái quán gửi gộp tối đa 6 lần/giây; các sự kiện ngắn (thoại, chuông, bàn thắng) gửi ngay.
let stateTimer;
function pushState() {
  stateTimer ??= setTimeout(() => {
    stateTimer = undefined;
    broadcast({ type: 'state', state: shop.snapshot() });
  }, 160);
}
shop.on((type, data) => {
  if (type === 'changed') return pushState();
  if (type === 'unmapped') console.warn(`[Quà chưa có món] ${data.name}: ${data.gift} x${data.units}${data.reason ? ` (${data.reason})` : ''}`);
  if (type === 'order') console.log(`[Đơn #${data.id}] ${data.name} bàn ${data.table ?? 'chờ'}: ${data.giftLabel} x${data.units} -> ${data.qty} ${data.unit} ${data.itemName}${data.side ? ` + ${data.side} đĩa đậu phộng` : ''}${data.large ? ' (phần lớn)' : ''}${data.promo ? ` [${data.promo.label}]` : ''}`);
  broadcast({ type: 'fx', fx: type, data, now: Date.now() });
});
setInterval(() => shop.tick(), 200);

// Chế độ an toàn tắt sự kiện tự động và bong bóng bình luận cho tới khi chủ quán tắt.
function setSafeMode(on, reason) {
  if (shop.safeMode === on) return;
  shop.safeMode = on;
  console.log(`[Chế độ an toàn] ${on ? `Bật: ${reason}` : 'Tắt'}`);
  broadcast({ type: 'safe-mode', on });
  pushState();
}

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

// Nhận diện bằng ID tài khoản, tên chỉ để hiển thị.
function viewer(user) {
  const raw = String(user?.nickname || user?.uniqueId || user?.displayId || '').replace(/\s+/g, ' ').trim();
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

// ---------- Cảnh báo kiểm duyệt TikTok và Telegram (giống Chùa Online) ----------
const MODERATION_TYPES = new Set(['WebcastPerceptionMessage', 'WebcastNoticeMessage', 'WebcastPartnershipPunishMessage', 'WebcastRoomVerifyMessage']);
const alerts = [];
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
  appendFileSync(path.join(import.meta.dirname, 'moderation.log'), `${new Date().toISOString()} ${type} ${raw}\n`);
  const alert = { at: Date.now(), text };
  alerts.push(alert);
  if (alerts.length > 10) alerts.shift();
  broadcast({ type: 'moderation', ...alert });
  setSafeMode(true, 'có cảnh báo TikTok');
  if (cooledDown(`telegram:${text}`, 600_000)) {
    const time = new Date(alert.at).toLocaleTimeString('vi-VN');
    alertTelegram(`⚠️ TikTok cảnh báo phiên live @${username} lúc ${time}\n${text}\nQuán Cô Ba đã tự bật chế độ an toàn. Hãy kiểm tra hộp thư TikTok.`);
  }
}

function telegramConfig() {
  let file = {};
  try {
    file = parseEnv(readFileSync(path.join(import.meta.dirname, '.env'), 'utf8'));
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

// ---------- TikTok ----------
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
    // Chặn spam cùng một người dưới 1,5 giây; bình luận thường chỉ hiện bong bóng thoại.
    if (!cooledDown(`chat:${who.id}`, 1500)) return;
    shop.comment(who, String(e.comment ?? e.content ?? '').slice(0, 300));
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
    const name = String(gift.giftName ?? gift.name ?? '');
    const coins = Number(gift.diamondCount) || 0;
    console.log(`[Quà] ${who.name}: ${name} (${coins} xu) x${units}`);
    session.diamonds += coins * units;
    session.gifts += units;
    broadcast({ type: 'session', ...session });
    shop.gift(who, name, units, coins);
  });
  conn.on(WebcastEvent.LIKE, (e) => {
    const count = Math.max(1, Number(e.count ?? e.likeCount) || 1);
    // Cứ đủ 100 tim (cộng dồn từng người) thì được 1 cốc sinh tố lúa mạch, xem likes trong config.json.
    shop.like(viewer(e.user), count);
    if (cooledDown('like', 400)) broadcast({ type: 'fx', fx: 'like', data: { count: Math.min(5, count) } });
  });
  conn.on(WebcastEvent.STREAM_END, ({ action }) => {
    console.log(`[Phiên live] Tổng: ${session.diamonds.toLocaleString('vi-VN')} kim cương từ ${session.gifts} quà`);
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

// ---------- Web ----------
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => (['127.0.0.1', 'localhost'].includes(req.hostname) ? next() : res.status(403).end()));
app.use(express.static(path.join(import.meta.dirname, 'public')));
app.use(express.json({ limit: '4kb' }));

app.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  send(res, { type: 'snapshot', state: shop.snapshot(), status, alerts, session, config: { items: config.items, wheel: config.wheel.slots.map((s) => s.effect), promos: config.promos } });
  clients.add(res);
  res.on('close', () => clients.delete(res));
});
setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 20_000);

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || min));
const json = (handler) => (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  handler(req, res);
};

app.post(
  '/api/simulate',
  json((req, res) => {
    const { kind, name, id, text, gift, count, combo } = req.body ?? {};
    const nickname = typeof name === 'string' && name.trim() ? name : 'Khách thử';
    const who = viewer({ id: `sim:${typeof id === 'string' && id.trim() ? id.trim().slice(0, 40) : nickname}`, nickname });
    if (kind === 'comment') return res.json(shop.comment(who, String(text ?? '').slice(0, 300)));
    if (kind === 'gift') {
      const units = clampInt(count, 1, 999);
      const giftName = String(gift ?? '').slice(0, 40);
      if (combo) {
        // Mô phỏng TikTok gửi combo: nhiều bản cập nhật với tổng dồn, có bản lặp lại.
        const groupId = `${Date.now()}`;
        let total = 0;
        for (let i = 1; i <= units; i++) {
          total += giftCounter.count({ msgId: `sim-${groupId}-${i}`, userId: who.id, giftId: giftName, groupId, repeatCount: i, combo: true });
          total += giftCounter.count({ msgId: `sim-${groupId}-${i}`, userId: who.id, giftId: giftName, groupId, repeatCount: i, combo: true });
        }
        total += giftCounter.count({ msgId: `sim-${groupId}-end`, userId: who.id, giftId: giftName, groupId, repeatCount: units, repeatEnd: true, combo: true });
        const order = shop.gift(who, giftName, total);
        return res.json({ units: total, order });
      }
      return res.json({ units, order: shop.gift(who, giftName, units) });
    }
    if (kind === 'like') {
      const likes = clampInt(count, 1, 1000);
      broadcast({ type: 'fx', fx: 'like', data: { count: 3 } });
      const order = shop.like(who, likes);
      return res.json({ likes: shop.likes.get(who.id) ?? 0, order });
    }
    res.status(400).json({ error: 'kind không hợp lệ' });
  }),
);

app.post(
  '/api/crowd',
  json((req, res) => {
    const n = clampInt(req.body?.count, 1, 30);
    const names = ['Nam', 'Lan', 'Hùng', 'Mai', 'Tuấn', 'Thảo', 'Bình', 'Hoa', 'Long', 'Vy', 'Phúc', 'Trang', 'Khoa', 'Linh', 'Đạt', 'Ngọc', 'Sơn', 'Yến', 'Quân', 'Hà'];
    for (let i = 0; i < n; i++) {
      const name = `${names[Math.floor(Math.random() * names.length)]} ${Math.floor(Math.random() * 90 + 10)}`;
      setTimeout(() => shop.comment(viewer({ id: `crowd:${name}`, nickname: name }), 'vào'), i * 350);
    }
    res.status(204).end();
  }),
);

app.post(
  '/api/event',
  json((req, res) => {
    const { kind, slot, outcome } = req.body ?? {};
    const result = shop.trigger(String(kind), { slot: Number.isInteger(slot) ? slot : undefined, outcome });
    res.json({ result });
  }),
);

app.post(
  '/api/stop-promo',
  json((req, res) => {
    if (shop.promo) shop.promo.endAt = Date.now();
    else if (shop.stage) shop.endStage();
    shop.tick();
    res.status(204).end();
  }),
);

app.post(
  '/api/new-shift',
  json((req, res) => {
    shop.startShift(true);
    res.status(204).end();
  }),
);

app.post(
  '/api/reset',
  json((req, res) => {
    for (const customer of [...shop.customers.values()]) shop.leave(customer, 'reset');
    shop.orders = [];
    shop.runner = null;
    shop.unmapped = [];
    pushState();
    res.status(204).end();
  }),
);

app.post(
  '/api/safe-mode',
  json((req, res) => {
    setSafeMode(req.body?.on === true, 'bật tay từ bảng điều khiển');
    res.status(204).end();
  }),
);

app.post(
  '/api/telegram-test',
  json(async (req, res) => {
    const error = await sendTelegram('✅ Quán Cô Ba đã kết nối Telegram. Nếu TikTok cảnh báo phiên live, tin sẽ được gửi vào đây.');
    res.json({ message: error || 'Đã gửi tin thử, bạn kiểm tra Telegram nhé.' });
  }),
);

app.listen(port, host, (err) => {
  if (err) throw err;
  console.log(`Màn hình game:   http://${host}:${port}/`);
  console.log(`Bảng điều khiển: http://${host}:${port}/panel.html`);
  const { token, chatId } = telegramConfig();
  console.log(token && chatId ? 'Báo cảnh báo qua Telegram: bật' : 'Báo cảnh báo qua Telegram: tắt (thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_ADMIN_CHAT_ID trong .env)');
  if (username) connectTikTok();
  else console.log('Chưa đặt kênh TikTok (npm start -- ten_kenh, hoặc tiktokUsername trong config.json). Đang ở chế độ thử.');
});
