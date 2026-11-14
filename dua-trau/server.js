import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import express from 'express';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { createTikTokNormalizer, safeImageUrl } from '../shared/tiktok-events.mjs';
import { EventDeduplicator } from '../shared/event-deduplicator.mjs';
import { Race } from './src/race.js';
import { vbeeFromEnv, prepareLines } from './src/voice.js';

const root = import.meta.dirname;
const config = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const username = (process.argv[2] ?? config.tiktokUsername ?? '').trim().replace(/^@/, '');
const port = Number(process.env.PORT) || config.port || 3019;
const host = '127.0.0.1';

const meters = (v) => Number.isFinite(v) && v >= 0 && Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;
const problems = [
  [config.roundSeconds >= 10, 'roundSeconds là số giây mỗi vòng, từ 10'],
  [config.resultSeconds >= 2, 'resultSeconds là số giây công bố kết quả, từ 2'],
  [meters(config.commentMeters) && meters(config.giftMeters) && meters(config.otherGiftMeters ?? 0), 'commentMeters, giftMeters, otherGiftMeters là số mét, lẻ tối đa 1 chữ số (0.1, 1, 2.5...)'],
  [Array.isArray(config.nations) && config.nations.length >= 2 && config.nations.every((n) => /^[a-z0-9-]+$/.test(n.id ?? '') && n.name && n.gift?.icon), 'nations cần ít nhất 2 nước, mỗi nước có id (chữ thường không dấu), name và gift.icon'],
  [!config.voice || (config.voice.repeatGapSeconds >= 0 && Number.isInteger(config.voice.maxQueue) && config.voice.maxQueue >= 1), 'voice cần repeatGapSeconds (giây, từ 0) và maxQueue (số nguyên từ 1)'],
].filter(([ok]) => !ok);
if (problems.length) throw new Error(`config.json: ${problems.map(([, text]) => text).join('; ')}`);

const clients = new Set();
let status = { connected: false, text: username ? `Chuẩn bị kết nối @${username}` : 'Chế độ thử: chưa đặt kênh TikTok' };
const send = (res, message) => res.write(`data: ${JSON.stringify(message)}\n\n`);
const broadcast = (message) => clients.forEach((res) => send(res, message));

function setStatus(connected, text) {
  status = { connected, text };
  console.log(`[TikTok] ${text}`);
  broadcast({ type: 'status', ...status });
}

// ---------- Cuộc đua ----------
const nameOf = Object.fromEntries(config.nations.map((n) => [n.id, n.name]));
const m = (units) => (units / 10).toLocaleString('vi-VN');
function logEvent(msg) {
  if (msg.type === 'boost' && msg.kind === 'gift') console.log(`[Quà] ${msg.who.name}: ${msg.giftName || 'quà'} x${msg.count} → ${nameOf[msg.nation]} +${m(msg.units)} m${msg.banked ? ' (để dành cho vòng sau)' : ''}`);
  if (msg.type === 'round') console.log(`[Vòng ${msg.round}] Bắt đầu`);
  if (msg.type === 'result') {
    const scores = msg.ranking.map((id) => `${nameOf[id]} ${m(msg.scores[id])}`).join(' · ');
    console.log(`[Vòng ${msg.round}] ${msg.winner ? `${nameOf[msg.winner]} thắng` : 'Không ai chạy'} · ${scores}${msg.top ? ` · tiếp sức nhiều nhất: ${msg.top.name}` : ''}`);
  }
}

// DATA_DIR để chạy thử song song mà không đụng vòng đua đang chạy; giọng đọc vẫn dùng chung data/tts.
const statePath = path.join(process.env.DATA_DIR?.trim() || path.join(root, 'data'), 'state.json');
let saveTimer = null;
function saveSoon() {
  if (!saveTimer) saveTimer = setTimeout(saveNow, 2000);
}
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(`${statePath}.tmp`, JSON.stringify(race));
    renameSync(`${statePath}.tmp`, statePath);
  } catch (err) {
    console.error(`[Lưu] Không lưu được trạng thái: ${err.message}`);
  }
}

const race = new Race(config, {
  emit(msg) {
    broadcast(msg);
    logEvent(msg);
    saveSoon();
  },
});
if (existsSync(statePath)) {
  try {
    race.restore(JSON.parse(readFileSync(statePath, 'utf8')));
    console.log(`[Khôi phục] Vòng ${race.round}, còn ${Math.ceil(race.left() / 1000)} giây · thắng: ${config.nations.map((n) => `${n.name} ${race.wins[n.id]}`).join(' · ')}`);
  } catch (err) {
    console.error(`[Khôi phục] Bỏ qua data/state.json hỏng: ${err.message}`);
  }
}
setInterval(() => race.tick(), 100);
// Lưu đồng hồ đều đặn để tắt máy đột ngột vẫn chạy tiếp gần đúng chỗ cũ.
setInterval(saveSoon, 5000);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
  process.on(signal, () => {
    saveNow();
    process.exit(0);
  });
}

// Ảnh chibi đã cắt (public/chibi/*.png); thiếu ảnh nào thì màn hình tự vẽ thay.
function spriteList() {
  try {
    return readdirSync(path.join(root, 'public', 'chibi')).filter((f) => /\.(png|webp|jpg)$/.test(f));
  } catch {
    return [];
  }
}

// ---------- Giọng đọc tên nước khi có quà ----------
const vbee = vbeeFromEnv();
// Giọng riêng của game (tiếng Anh) đặt trong config.json, không thì dùng VBEE_VOICE trong .env.
if (config.voice?.code) vbee.voice = config.voice.code;
const ttsDir = path.join(root, 'data', 'tts');
const voiceOn = config.voice?.enabled !== false && vbee.enabled;
let voiceClips = {};
const voiceInfo = () => ({
  clips: voiceClips,
  gapMs: Math.round((config.voice?.repeatGapSeconds ?? 2.5) * 1000),
  maxQueue: config.voice?.maxQueue ?? 2,
});
function startVoice() {
  if (config.voice?.enabled === false) return console.log('[Giọng] Đang tắt (voice.enabled: false)');
  if (!vbee.enabled) return console.log('[Giọng] Chưa có VBEE_TOKEN/VBEE_APP_ID trong .env, game chạy không có giọng đọc');
  const lines = Object.fromEntries(config.nations.filter((n) => n.say).map((n) => [n.id, n.say]));
  prepareLines({ vbee, lines, dir: ttsDir }).then((clips) => {
    voiceClips = clips;
    console.log(`[Giọng] Đọc tên nước khi có quà: ${Object.keys(clips).length}/${Object.keys(lines).length} nước (giọng ${vbee.voice})`);
    broadcast({ type: 'voice', ...voiceInfo() });
  });
}

// ---------- TikTok LIVE ----------
let session = { roomId: '', diamonds: 0, gifts: 0 };
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

  conn.on(WebcastEvent.CHAT, receive('comment', (event, who) => race.comment(who, event.message.slice(0, 200))));
  conn.on(
    WebcastEvent.GIFT,
    receive('gift', (event, who) => {
      session.diamonds += event.diamonds * event.repeatCount;
      session.gifts += event.repeatCount;
      broadcast({ type: 'session', ...session });
      if (!race.gift(who, { id: event.giftId, name: event.giftName, coins: event.diamonds }, event.repeatCount)) {
        console.log(`[Quà chưa tính] ${who.name}: ${event.giftName} #${event.giftId} (${event.diamonds} xu) x${event.repeatCount} · chưa comment tên nước`);
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
        session = { roomId: state.roomId, diamonds: 0, gifts: 0 };
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

app.get('/health', (req, res) => res.json({ app: 'dua-trau' }));

app.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  send(res, { type: 'snapshot', title: config.title, status, session, sprites: spriteList(), voice: voiceInfo(), race: race.snapshot() });
  clients.add(res);
  res.on('close', () => clients.delete(res));
});
setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 20_000);

app.get('/voice/:id', (req, res) => {
  const id = /^([0-9a-f]{16})\.mp3$/.exec(req.params.id)?.[1];
  if (!voiceOn || !id || !Object.values(voiceClips).includes(id)) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(ttsDir, `${id}.mp3`));
});

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || min));

// Chỉ nhận JSON: trình duyệt không gửi được application/json sang trang khác nếu không qua CORS preflight.
app.post('/api/simulate', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const { kind, name, text, gift, count, avatar } = req.body ?? {};
  const nickname = Array.from(typeof name === 'string' && name.trim() ? name.trim() : 'Bạn thử').slice(0, 24).join('');
  const who = { id: `sim:${nickname}`, name: nickname, avatar: safeImageUrl(avatar ?? '') };
  if (kind === 'chat') return res.json({ result: race.comment(who, String(text ?? '').slice(0, 200)) });
  if (kind === 'gift') return res.json({ result: race.gift(who, { name: String(gift ?? '').slice(0, 40) }, clampInt(count, 1, 999)) });
  res.status(400).json({ error: 'kind không hợp lệ' });
});

const controls = {
  pause: () => race.pause(true),
  resume: () => race.pause(false),
  end: () => race.endNow(),
  restart: () => race.restart(),
  resetWins: () => race.resetWins(),
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
  console.log(`Mỗi vòng ${config.roundSeconds} giây · comment +${config.commentMeters} m · quà +${config.giftMeters} m · ảnh chibi: ${spriteList().length} file`);
  startVoice();
  if (username) connectTikTok();
  else console.log('Chưa đặt kênh TikTok (npm start -- ten_kenh, hoặc tiktokUsername trong config.json). Đang ở chế độ thử.');
});
