import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import express from 'express';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { createTikTokNormalizer, safeImageUrl } from '../shared/tiktok-events.mjs';
import { EventDeduplicator } from '../shared/event-deduplicator.mjs';
import { Wedding, ACTIONS, giftMatcher, normalize } from './src/wedding.js';
import { createVoice } from './src/voice.js';
import { MC } from './src/mc.js';

const root = import.meta.dirname;
const config = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const args = process.argv.slice(2);
const testMode = args.includes('--test');
const username = testMode ? '' : (args.find((a) => !a.startsWith('--')) ?? config.tiktokUsername ?? '').trim().replace(/^@/, '');
const port = Number(process.env.PORT) || config.port || 3018;
const host = '127.0.0.1';

const whole = (value, min) => Number.isInteger(value) && value >= min;
const timing = config.timing ?? {};
const problems = [
  [Array.isArray(config.gifts) && config.gifts.every((g) => ACTIONS.includes(g.action) && g.label), `mỗi quà trong gifts cần action (một trong ${ACTIONS.join(', ')}) và label`],
  [Array.isArray(config.goals) && config.goals.length > 0 && config.goals.every((g) => whole(g, 1)), 'goals là danh sách mốc chỉ vàng, số nguyên từ 1'],
  [whole(config.goalStepAfter ?? 5000, 1), 'goalStepAfter là khoảng cách mốc sau khi hết danh sách goals, số nguyên từ 1'],
  [whole(timing.claimMs, 500) && whole(timing.stealMs, 1000) && whole(timing.cancelMs, 1000), 'timing cần claimMs, stealMs, cancelMs (mili giây)'],
  [Object.values(config.chatCommands ?? {}).every((a) => ACTIONS.includes(a)), 'chatCommands: mỗi lệnh phải trỏ tới một action hợp lệ'],
].filter(([ok]) => !ok);
if (problems.length) throw new Error(`config.json: ${problems.map(([, text]) => text).join('; ')}`);

const matchGift = giftMatcher(config.gifts);
const chatCommands = new Map(Object.entries(config.chatCommands ?? {}).map(([cmd, action]) => [normalize(cmd), action]));
const guide = {
  title: config.title,
  gifts: config.gifts.map(({ action, label, giftLabel, icon, coins }) => ({ action, label, giftLabel: giftLabel ?? '', icon: icon ?? '', coins: coins ?? 0 })),
  goldIcon: config.goldIcon ?? '',
  goldPerCoin: config.goldPerCoin ?? 1,
  renderScale: config.renderScale ?? 1,
  chatCommands: Object.fromEntries(chatCommands),
  ceremony: (config.ceremony?.steps ?? []).map(({ id, title }) => ({ id, title })),
};

const clients = new Set();
let status = { connected: false, text: testMode ? 'Chế độ thử (--test): quà giả mỗi vài giây' : username ? `Chuẩn bị kết nối @${username}` : 'Chế độ thử: chưa đặt kênh TikTok' };
const send = (res, message) => res.write(`data: ${JSON.stringify(message)}\n\n`);
const broadcast = (message) => clients.forEach((res) => send(res, message));

function setStatus(connected, text) {
  status = { connected, text };
  console.log(`[TikTok] ${text}`);
  broadcast({ type: 'status', ...status });
}

// ---------- Đám cưới ----------
const statePath = process.env.STATE_FILE ? path.resolve(process.env.STATE_FILE) : path.join(root, 'data', 'state.json');
let saveTimer = null;
function saveSoon() {
  if (!saveTimer) saveTimer = setTimeout(saveNow, 2000);
}
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(`${statePath}.tmp`, JSON.stringify(wedding));
    renameSync(`${statePath}.tmp`, statePath);
  } catch (err) {
    console.error(`[Lưu] Không lưu được trạng thái: ${err.message}`);
  }
}

// ---------- Hai MC đọc bằng Vbee (giọng nam, giọng nữ trong .env) ----------
const vbee = {
  token: process.env.VBEE_TOKEN?.trim(),
  appId: process.env.VBEE_APP_ID?.trim(),
  speed: Number(process.env.VBEE_SPEED) || 1,
  voices: { nam: process.env.VBEE_VOICE_MALE?.trim(), nu: process.env.VBEE_VOICE_FEMALE?.trim() },
};
vbee.enabled = Boolean(vbee.token && vbee.appId);

async function vbeeJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body.error ?? body).slice(0, 300)}`);
  return body;
}

// Gói Vbee nào cũng có chế độ async: tạo yêu cầu rồi hỏi lại tới khi xong, không cần webhook công khai.
const synthesizer = (voiceCode) => async (text) => {
  const headers = { Authorization: `Bearer ${vbee.token}`, 'App-Id': vbee.appId };
  const job = await vbeeJson('https://api.vbee.vn/v1/tts', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceCode, mode: 'async', outputFormat: 'mp3', speed: vbee.speed, webhookUrl: 'https://callback.invalid/vbee' }),
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
};

const ttsDir = path.join(root, 'data', 'tts');
const voices = Object.fromEntries(Object.entries(vbee.voices).map(([who, code]) => [who, createVoice({
  enabled: vbee.enabled && Boolean(code),
  voice: code ?? '',
  speed: vbee.speed,
  dir: ttsDir,
  synthesize: synthesizer(code),
  onError: (err, text) => console.error(`[Vbee ${who}] Lỗi đọc "${text}": ${err.message}`),
})]));
const mcLines = JSON.parse(readFileSync(path.join(root, 'mc.json'), 'utf8'));
const mc = new MC({ lines: mcLines, voices, emit: (msg) => broadcast(msg), idleMs: (config.mc?.idleSeconds ?? 40) * 1000 });

// Diễn biến trong game -> lời MC.
function mcReact(msg) {
  const { groom, bride } = wedding.roles;
  const couple = { chure: groom?.name, codau: bride?.name };
  if (msg.type === 'scene') {
    if (msg.kind === 'claim') mc.say(`claim_${msg.role}`, { ten: msg.who.name }, { priority: 3 });
    if (msg.kind === 'steal') mc.say(`steal_${msg.role}`, { ten: msg.who.name, cu: msg.from?.name }, { priority: 3 });
    if (msg.kind === 'cancel') mc.say('cancel', { ten: msg.who.name }, { priority: 3 });
    if (msg.kind === 'farewell') mc.say('farewell', { chure: msg.from.groom?.name, codau: msg.from.bride?.name }, { priority: 3, ttl: 12_000 });
  }
  if (msg.type === 'ritual') mc.say(msg.step < 0 ? (msg.restart ? 'restart' : 'ceremony_start') : `step_${msg.id}`, couple, { priority: 3, ttl: 9000 });
  if (msg.type === 'registered') mc.say(`register_${msg.role}`, { ten: msg.who.name, so: msg.position });
  if (msg.type === 'cheer' && msg.role) mc.say('cheer', { ten: msg.who.name });
  if (msg.type === 'gold' && !msg.withAction && msg.amount >= 10) mc.say(msg.amount >= 100 ? 'gold_huge' : 'gold_big', { ten: msg.who.name }, { priority: msg.amount >= 100 ? 2 : 1 });
  if (msg.type === 'goal') mc.say('goal', { moc: msg.goal }, { priority: 3 });
}

const wedding = new Wedding(config, {
  emit(msg) {
    broadcast(msg);
    if (msg.text && msg.type !== 'gold') console.log(`[${msg.type}] ${msg.text}`);
    if (msg.type === 'dropped') console.log(`[Hàng chờ đầy] Bỏ qua ${msg.action} của ${msg.who.name}`);
    mcReact(msg);
    saveSoon();
  },
});
if (existsSync(statePath)) {
  try {
    wedding.restore(JSON.parse(readFileSync(statePath, 'utf8')));
    const { groom, bride, progress } = wedding.snapshot();
    console.log(`[Khôi phục] Chú rể: ${groom?.name ?? '—'} · Cô dâu: ${bride?.name ?? '—'} · ${progress.gold} chỉ vàng · ${wedding.queue.length} kịch bản chờ`);
  } catch (err) {
    console.error(`[Khôi phục] Bỏ qua data/state.json hỏng: ${err.message}`);
  }
}
setInterval(() => wedding.tick(), 50);
setInterval(() => mc.tick({ groom: wedding.roles.groom, bride: wedding.roles.bride, ceremony: wedding.ceremony }), 400);

// Tạo sẵn mọi mẩu lời cố định (chỉ lần đầu, sau đó lấy từ data/tts).
async function pregenerate() {
  const fixed = mc.fixedTexts();
  const missing = [];
  for (const [who, texts] of Object.entries(fixed)) for (const t of texts) if (!voices[who].ready(t)) missing.push([who, t]);
  const total = Object.values(fixed).reduce((n, set) => n + set.size, 0);
  if (!missing.length) return console.log(`[Vbee] Đã có sẵn ${total} mẩu lời MC`);
  console.log(`[Vbee] Đang tạo ${missing.length}/${total} mẩu lời MC, chỉ lần đầu (vài phút). Trong lúc này MC bỏ qua câu chưa có tiếng.`);
  let done = 0;
  let ok = 0;
  await Promise.all(missing.map(([who, t]) => voices[who].clip(t, { background: true }).then((id) => {
    done++;
    if (id) ok++;
    if (done % 25 === 0 || done === missing.length) console.log(`[Vbee] Lời MC: ${ok}/${missing.length} mẩu xong${done < missing.length ? '...' : ''}`);
  })));
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
  process.on(signal, () => {
    saveNow();
    process.exit(0);
  });
}

// Tin gửi màn hình theo đúng định dạng trong GAME_PLAN.md mục 3.
function gift(who, { giftId = '', giftName = '', coins = 0, count = 1 }) {
  const mapped = matchGift({ giftId, giftName });
  const action = mapped?.action ?? 'gold';
  broadcast({ type: 'action', action, user: who.id, nickname: who.name, avatarUrl: who.avatar, giftName, count });
  return wedding.act(who, action, { giftName: mapped?.giftLabel || giftName, count, coins });
}

function comment(who, text, live) {
  if (live && !config.chatCommandsLive) return null;
  const action = chatCommands.get(normalize(text).split(' ')[0]);
  if (!action) return null;
  return wedding.act(who, action, { giftName: 'lệnh chat', count: 1, coins: 0 });
}

// ---------- TikTok LIVE ----------
let session = { roomId: '', diamonds: 0, gifts: 0, since: 0 };
const normalizer = createTikTokNormalizer({ likeGapToCommunity: false });
let dedup = new EventDeduplicator();
const viewerOf = (event) => (event.userId ? { id: event.userId, name: event.nickname || event.username || 'Khách', avatar: event.avatar } : null);

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

  conn.on(WebcastEvent.CHAT, receive('comment', (event, who) => comment(who, event.message.slice(0, 200), true)));
  conn.on(WebcastEvent.LIKE, receive('like', (event, who) => broadcast({ type: 'like', count: event.count, who: { name: who.name } })));
  // In mọi quà (kể cả từng nhịp combo) để chép tên và mã thật vào config.json.
  conn.on(WebcastEvent.GIFT, (raw) => {
    const d = raw?.giftDetails ?? {};
    console.log(`[Quà gốc] ${raw?.user?.nickname ?? raw?.user?.uniqueId ?? '?'}: "${d.giftName ?? raw?.giftName ?? ''}" mã ${raw?.giftId} · giftType ${d.giftType ?? raw?.giftType} · ${d.diamondCount ?? '?'} xu · repeatCount ${raw?.repeatCount} · repeatEnd ${raw?.repeatEnd}`);
  });
  conn.on(
    WebcastEvent.GIFT,
    receive('gift', (event, who) => {
      session.diamonds += event.diamonds * event.repeatCount;
      session.gifts += event.repeatCount;
      broadcast({ type: 'session', ...session });
      const result = gift(who, { giftId: event.giftId, giftName: event.giftName, coins: event.diamonds, count: event.repeatCount });
      if (!matchGift(event)) console.log(`[Quà chưa gắn hành động → chỉ vàng] ${who.name}: ${event.giftName} #${event.giftId} (${event.diamonds} xu) x${event.repeatCount}`);
      else if (!result.ok) console.log(`[Quà] ${who.name}: ${event.giftName} không chạy được (${result.reason})`);
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
      retry(10_000, `Lỗi: ${err?.message ?? err}`);
    } finally {
      busy = false;
    }
  }
  run();
}

// ---------- Chế độ --test: quà giả đều đặn ----------
const FAKE = ['Nam', 'Huy', 'Lan', 'Thảo', 'Tuấn', 'Vy', 'Minh Anh', 'Long', 'Ngọc', 'Phúc', 'Trang', 'Đức', 'Hà My', 'Quân'];
function fakeGift() {
  const name = FAKE[Math.floor(Math.random() * FAKE.length)];
  const who = { id: `sim:${name}`, name, avatar: '' };
  const weight = { become_groom: 3, become_bride: 3, steal_groom: 2, steal_bride: 2, cancel_wedding: 0.6, gold: 1.5 };
  const total = config.gifts.reduce((sum, x) => sum + (weight[x.action] ?? 1), 0);
  let roll = Math.random() * total;
  const g = config.gifts.find((x) => (roll -= weight[x.action] ?? 1) < 0);
  if (g) gift(who, { giftName: g.giftLabel || g.names?.[0] || '', coins: g.coins ?? 1, count: 1 });
  else gift(who, { giftName: 'Quà thử', coins: [5, 10, 99][Math.floor(Math.random() * 3)], count: 1 });
}

// ---------- Web server ----------
const app = express();
app.disable('x-powered-by');
// Chỉ trả lời yêu cầu gửi tới chính máy này (chặn DNS rebinding).
app.use((req, res, next) => (['127.0.0.1', 'localhost'].includes(req.hostname) ? next() : res.status(403).end()));
app.use(express.static(path.join(root, 'public')));
app.use('/vendor/three', express.static(path.join(root, 'node_modules', 'three')));
app.use(express.json({ limit: '4kb' }));

app.get('/health', (req, res) => res.json({ app: 'dam-cuoi' }));

app.get('/tts/:id', (req, res) => {
  const audio = voices.nam.audio(req.params.id) ?? voices.nu.audio(req.params.id);
  if (!audio) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type('audio/mpeg').send(audio);
});

app.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  send(res, { type: 'snapshot', status, guide, session, testMode, mc: { enabled: mc.enabled, on: mc.on }, game: wedding.snapshot() });
  clients.add(res);
  res.on('close', () => clients.delete(res));
});
setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 20_000);

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || min));

// Chỉ nhận JSON: trình duyệt không gửi được application/json sang trang khác nếu không qua CORS preflight.
app.post('/api/simulate', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const { kind, name, action, text, coins, count, avatar } = req.body ?? {};
  const nickname = Array.from(typeof name === 'string' && name.trim() ? name.trim() : 'Bạn thử').slice(0, 24).join('');
  const who = { id: `sim:${nickname}`, name: nickname, avatar: safeImageUrl(avatar ?? '') };
  if (kind === 'chat') return res.json({ result: comment(who, String(text ?? '').slice(0, 200), false) });
  if (kind === 'like') return res.json({ result: broadcast({ type: 'like', count: clampInt(count, 1, 10_000), who: { name: nickname } }) ?? true });
  if (kind === 'gift') {
    const g = config.gifts.find((x) => x.action === action);
    return res.json({ result: gift(who, { giftName: g ? g.giftLabel || g.names?.[0] || '' : 'Quà thử', coins: clampInt(coins ?? g?.coins, 0, 50_000), count: clampInt(count, 1, 999) }) });
  }
  res.status(400).json({ error: 'kind không hợp lệ' });
});

let testTimer = null;
const controls = {
  reset: () => wedding.reset(),
  clear: () => wedding.clearQueue(),
  pause: () => wedding.pause(true),
  resume: () => wedding.pause(false),
  mc: () => {
    const on = mc.setOn(!mc.on);
    broadcast({ type: 'mc', enabled: mc.enabled, on });
    return on;
  },
  autotest: () => {
    if (testTimer) clearInterval(testTimer);
    testTimer = testTimer ? null : setInterval(fakeGift, config.testIntervalMs ?? 2000);
    broadcast({ type: 'autotest', on: !!testTimer });
    return !!testTimer;
  },
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
  console.log(`Quà: ${config.gifts.map((g) => `${g.giftLabel} → ${g.label}`).join(' · ')} · quà khác → chỉ vàng`);
  if (mc.enabled) {
    console.log(`MC nam: ${vbee.voices.nam || '(chưa có VBEE_VOICE_MALE)'} · MC nữ: ${vbee.voices.nu || '(chưa có VBEE_VOICE_FEMALE)'}`);
    pregenerate();
  } else console.log('MC không có tiếng: cần VBEE_TOKEN, VBEE_APP_ID, VBEE_VOICE_MALE, VBEE_VOICE_FEMALE trong .env');
  if (testMode) {
    console.log(`Chế độ thử: mỗi ${(config.testIntervalMs ?? 2000) / 1000} giây một quà giả.`);
    controls.autotest();
  } else if (username) connectTikTok();
  else console.log('Chưa đặt kênh TikTok (npm start -- ten_kenh, hoặc tiktokUsername trong config.json). Đang ở chế độ thử.');
});
