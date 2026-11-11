import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import express from 'express';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { createTikTokNormalizer, safeImageUrl } from '../shared/tiktok-events.mjs';
import { EventDeduplicator } from '../shared/event-deduplicator.mjs';
import { Game } from './src/game.js';

const root = import.meta.dirname;
const config = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const username = (process.argv[2] ?? config.tiktokUsername ?? '').trim().replace(/^@/, '');
const port = Number(process.env.PORT) || config.port || 3017;
const host = '127.0.0.1';

const whole = (value, min) => Number.isInteger(value) && value >= min;
const timing = config.timing ?? {};
const problems = [
  [config.saveChance >= 0 && config.saveChance <= 1, 'saveChance là tỉ lệ thủ môn bắt được, từ 0 đến 1 (0.5 là 50%)'],
  [Array.isArray(config.teams) && config.teams.length >= 2 && config.teams.every((t) => /^[a-z0-9-]+$/.test(t.id ?? '') && t.name), 'teams cần ít nhất 2 đội, mỗi đội có id (chữ thường không dấu) và name'],
  [Array.isArray(config.gifts) && config.gifts.every((g) => whole(g.coins, 1) && whole(g.shots, 1)), 'mỗi quà trong gifts cần coins và shots, số nguyên từ 1'],
  [Number(config.otherGiftShotsPerCoin ?? 0) >= 0, 'otherGiftShotsPerCoin là số lượt sút cho mỗi xu của quà khác, từ 0'],
  [config.likesPerShot === undefined || whole(config.likesPerShot, 0), 'likesPerShot là số tim đổi 1 lượt sút, số nguyên từ 1 (0 là tắt)'],
  [whole(timing.shotMs, 100) && whole(timing.fastestShotMs, 50) && timing.fastestShotMs <= timing.shotMs && timing.speedupEvery > 0, 'timing cần shotMs, fastestShotMs (mili giây, fastestShotMs <= shotMs) và speedupEvery > 0'],
].filter(([ok]) => !ok);
if (problems.length) throw new Error(`config.json: ${problems.map(([, text]) => text).join('; ')}`);

const guide = {
  title: config.title,
  subtitle: config.subtitle,
  gifts: [...config.gifts].sort((a, b) => a.coins - b.coins).map(({ coins, shots, giftLabel, icon }) => ({ coins, shots, giftLabel: giftLabel ?? '', icon: icon ?? '' })),
  likesPerShot: config.likesPerShot ?? 0,
};

const clients = new Set();
let status = { connected: false, text: username ? `Chuẩn bị kết nối @${username}` : 'Chế độ thử: chưa đặt kênh TikTok' };
const send = (res, message) => res.write(`data: ${JSON.stringify(message)}\n\n`);
const broadcast = (message) => clients.forEach((res) => send(res, message));

function setStatus(connected, text) {
  status = { connected, text };
  console.log(`[TikTok] ${text}`);
  broadcast({ type: 'status', ...status });
}

// ---------- Trận đấu ----------
const teamName = Object.fromEntries(config.teams.map((t) => [t.id, t.name]));
function logEvent(msg) {
  if (msg.type === 'join') console.log(`[Vào đội] ${msg.fan.name} → ${teamName[msg.team]}${msg.auto ? ' (tự xếp vì tặng quà khi chưa chọn đội)' : ''}`);
  if (msg.type === 'gift') console.log(`[Quà] ${msg.fan.name}: ${msg.giftName || 'quà'} x${msg.count} → ${teamName[msg.team]} +${msg.shots} lượt sút`);
  if (msg.type === 'likes') console.log(`[Tim] ${msg.fan.name}: ${msg.likes} tim → ${teamName[msg.team]} +${msg.shots} lượt sút`);
  if (msg.type === 'reset') console.log('[Trận mới] Tỉ số về 0');
}

const statePath = path.join(root, 'data', 'state.json');
let saveTimer = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(saveNow, 2000);
}
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(`${statePath}.tmp`, JSON.stringify(game));
    renameSync(`${statePath}.tmp`, statePath);
  } catch (err) {
    console.error(`[Lưu] Không lưu được trạng thái: ${err.message}`);
  }
}

const game = new Game(config, {
  emit(msg) {
    broadcast(msg);
    logEvent(msg);
    saveSoon();
  },
});
if (existsSync(statePath)) {
  try {
    game.restore(JSON.parse(readFileSync(statePath, 'utf8')));
    const { stats, pending } = game.board();
    console.log(`[Khôi phục] ${config.teams.map((t) => `${t.name} ${stats[t.id].goals}`).join(' · ')} · còn ${Object.values(pending).reduce((a, b) => a + b, 0)} lượt sút chờ`);
  } catch (err) {
    console.error(`[Khôi phục] Bỏ qua data/state.json hỏng: ${err.message}`);
  }
}
setInterval(() => game.tick(), 25);
// SIGHUP: bấm X đóng cửa sổ server trên Windows.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
  process.on(signal, () => {
    saveNow();
    process.exit(0);
  });
}

// Ảnh chibi đã cắt (public/nhan-vat/*.png); thiếu ảnh nào thì màn hình tự vẽ nhân vật thay.
function spriteList() {
  try {
    return readdirSync(path.join(root, 'public', 'nhan-vat')).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4));
  } catch {
    return [];
  }
}

// Logo đội do người dùng tự đặt: public/logo/<id đội>.png|webp|svg|jpg. Không có file thì ô kết quả không có nền logo.
const LOGO_TYPES = ['.png', '.webp', '.svg', '.jpg', '.jpeg'];
function logoMap() {
  let files = [];
  try {
    files = readdirSync(path.join(root, 'public', 'logo'));
  } catch {
    return {};
  }
  const logos = {};
  for (const t of config.teams) {
    const file = LOGO_TYPES.map((ext) => `${t.id}${ext}`).find((name) => files.some((f) => f.toLowerCase() === name));
    if (file) logos[t.id] = `/logo/${files.find((f) => f.toLowerCase() === file)}`;
  }
  return logos;
}

// ---------- TikTok LIVE ----------
let session = { roomId: '', diamonds: 0, gifts: 0, since: 0 };
const normalizer = createTikTokNormalizer({ likeGapToCommunity: false });
let dedup = new EventDeduplicator();
const viewerOf = (event) => (event.userId ? { id: event.userId, name: event.nickname || event.username || 'Guest', avatar: event.avatar } : null);

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

  conn.on(WebcastEvent.CHAT, receive('comment', (event, who) => game.comment(who, event.message.slice(0, 200))));
  conn.on(WebcastEvent.LIKE, receive('like', (event, who) => game.like(who, event.count)));
  conn.on(
    WebcastEvent.GIFT,
    receive('gift', (event, who) => {
      session.diamonds += event.diamonds * event.repeatCount;
      session.gifts += event.repeatCount;
      broadcast({ type: 'session', ...session });
      if (!game.gift(who, { coins: event.diamonds, name: event.giftName }, event.repeatCount)) {
        console.log(`[Quà không đổi lượt sút] ${who.name}: ${event.giftName} #${event.giftId} (${event.diamonds} xu) x${event.repeatCount}`);
      }
    }),
  );
  conn.on(WebcastEvent.STREAM_END, () => {
    console.log(`[Phiên live] Tổng: ${session.diamonds.toLocaleString('vi-VN')} kim cương từ ${session.gifts} quà`);
    setStatus(false, `@${username} đã kết thúc live`);
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
// Chỉ trả lời yêu cầu gửi tới chính máy này (chặn DNS rebinding).
app.use((req, res, next) => (['127.0.0.1', 'localhost'].includes(req.hostname) ? next() : res.status(403).end()));
app.use(express.static(path.join(root, 'public')));
app.use(express.json({ limit: '4kb' }));

app.get('/health', (req, res) => res.json({ app: 'sut-penalty' }));

app.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  send(res, { type: 'snapshot', status, guide, session, sprites: spriteList(), logos: logoMap(), game: game.snapshot() });
  clients.add(res);
  res.on('close', () => clients.delete(res));
});
setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 20_000);

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || min));

// Chỉ nhận JSON: trình duyệt không gửi được application/json sang trang khác nếu không qua CORS preflight.
app.post('/api/simulate', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const { kind, name, text, coins, count, avatar } = req.body ?? {};
  const nickname = Array.from(typeof name === 'string' && name.trim() ? name.trim() : 'Bạn thử').slice(0, 24).join('');
  const who = { id: `sim:${nickname}`, name: nickname, avatar: safeImageUrl(avatar ?? '') };
  if (kind === 'chat') return res.json({ result: game.comment(who, String(text ?? '').slice(0, 200)) });
  if (kind === 'gift') return res.json({ result: game.gift(who, { coins: clampInt(coins, 1, 50_000), name: 'Quà thử' }, clampInt(count, 1, 999)) });
  if (kind === 'like') return res.json({ result: game.like(who, clampInt(count, 1, 10_000)) });
  res.status(400).json({ error: 'kind không hợp lệ' });
});

const controls = {
  reset: () => game.reset(),
  clear: () => game.clearQueue(),
  pause: () => game.pause(true),
  resume: () => game.pause(false),
};
app.post('/api/control', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const action = controls[req.body?.action];
  if (!action) return res.status(400).json({ error: 'action không hợp lệ' });
  res.json({ ok: action() });
});

app.listen(port, host, (err) => {
  if (err) throw err;
  console.log(`Màn hình game:   http://${host}:${port}/`);
  console.log(`Bảng điều khiển: http://${host}:${port}/panel.html`);
  console.log(`Thủ môn bắt được ${Math.round(config.saveChance * 100)}% cú sút · ảnh nhân vật: ${spriteList().length} hình · logo đội: ${Object.keys(logoMap()).length}/${config.teams.length}`);
  if (username) connectTikTok();
  else console.log('Chưa đặt kênh TikTok (npm start -- ten_kenh, hoặc tiktokUsername trong config.json). Đang ở chế độ thử.');
});
