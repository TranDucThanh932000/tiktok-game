import express from 'express';
import { performance } from 'node:perf_hooks';
import { EDITABLE, checkSetting, deepMerge, getPath, loadConfig, paths, readJson, saveOverrides, setPath, validate } from './src/config/loadConfig.js';
import { GameEngine, FLAGS } from './src/game/GameEngine.js';
import { ResultStore } from './src/game/ResultStore.js';
import { TikTokAdapter } from './src/events/TikTokAdapter.js';
import { MockAdapter, MOCK_GIFTS, mockUser } from './src/events/MockAdapter.js';
import { createScenarios } from './src/events/mockScenarios.js';
import path from 'node:path';

let { config, overrides } = loadConfig();
const username = (process.argv[2] ?? config.game.tiktokUsername ?? '').trim().replace(/^@/, '');
const port = Number(process.env.PORT) || config.game.port || 3003;
const host = '127.0.0.1';

const results = new ResultStore(paths.data);
const engine = new GameEngine({ config, results });
engine.start();

// ---------- event sources ----------
// TikTok LIVE Event Source → TikTokAdapter → EventNormalizer → engine.ingest (dedup + EventQueue) → GameEngine.
const connections = {
  live: { connected: false, text: username ? `Chuẩn bị kết nối @${username}` : 'Chưa đặt kênh TikTok, chỉ chạy TEST MODE' },
  mock: { connected: true, text: 'Mock Adapter sẵn sàng' },
};
const mock = new MockAdapter();
const scenarios = createScenarios(mock, engine);
const live = new TikTokAdapter({ username, likeGapToCommunity: config.game.likeGapToCommunity });

for (const adapter of [mock, live]) {
  adapter.on('event', (event) => engine.ingest(event));
  adapter.on('status', ({ source, connected, text }) => {
    connections[source] = { connected, text };
    console.log(`[${source === 'live' ? 'TikTok' : 'Mock'}] ${text}`);
    broadcast({ t: 'conn', connections });
  });
}
live.on('room', ({ roomId }) => console.log(`[TikTok] Phòng live mới ${roomId}`));

// ---------- clients (Server-Sent Events) ----------
const gameClients = new Set();
const adminClients = new Set();
const send = (res, message) => res.write(`data: ${JSON.stringify(message)}\n\n`);
function broadcast(message, { admin = true, game = true } = {}) {
  const data = `data: ${JSON.stringify(message)}\n\n`;
  if (game) for (const res of gameClients) res.write(data);
  if (admin) for (const res of adminClients) res.write(data);
}

const clientSettings = () => ({
  sound: config.game.sound,
  notifications: config.game.notifications,
  maxNotifications: config.game.maxNotifications,
  testMode: config.game.testMode,
  lanes: config.game.lanes,
  phases: config.game.phases,
  rewards: config.balance.rewards,
  camera: config.game.camera,
  gifts: (config.gifts.list ?? []).map(({ tier, label, icon, coins }) => ({ label, icon, coins, meters: config.gifts.tiers[tier].meters, randomSkin: Boolean(config.gifts.tiers[tier].randomSkin) })),
  skins: (config.gifts.skins ?? []).map((skin) => skin.id),
  obstacleTypes: Object.fromEntries(Object.entries(config.balance.obstacles.types).map(([id, t]) => [id, t.kind])),
  community: Object.fromEntries(['wind', 'tsunami', 'cheer', 'giftStorm'].map((id) => [id, config.balance.community[id]])),
  flags: FLAGS,
});

const editable = () => EDITABLE.map(([key, kind, min, max]) => ({ key, kind, min, max, value: getPath(config, key) }));

const adminState = () => ({ t: 'admin', ...engine.adminState(), connections, settings: editable(), testMode: config.game.testMode, username, tiers: Object.keys(config.gifts.tiers), byId: config.gifts.byId });

// ---------- game loop ----------
// The simulation runs here at 20 Hz on delta time; the browser only draws and interpolates.
let last = performance.now();
let frameAt = 0;
let rankAt = 0;
let adminAt = 0;
setInterval(() => {
  const now = performance.now();
  engine.tick((now - last) / 1000);
  last = now;
  const fx = engine.takeFx();
  if (fx.length) broadcast({ t: 'fx', fx }, { admin: false });
  if (fx.some((f) => f.k === 'roster')) broadcast({ t: 'roster', roster: engine.roster() }, { admin: false });
  if (engine.obstacles.changed) broadcast({ t: 'obstacles', items: engine.obstaclesView() }, { admin: false });
  if (now - frameAt >= 100) {
    frameAt = now;
    if (gameClients.size) broadcast({ t: 'frame', ...engine.frame(), conn: connections.live.connected }, { admin: false });
  }
  if (now - rankAt >= 500) {
    rankAt = now;
    if (gameClients.size) broadcast({ t: 'rank', ...engine.rankings() }, { admin: false });
  }
  if (now - adminAt >= 1000) {
    adminAt = now;
    if (adminClients.size) broadcast(adminState(), { game: false });
  }
}, 50);

// ---------- settings ----------
function rebuildConfig() {
  const base = {
    game: readJson(path.join(paths.config, 'game.json')),
    balance: readJson(path.join(paths.config, 'balance.json')),
    gifts: readJson(path.join(paths.config, 'gifts.json')),
  };
  config = validate(deepMerge(base, overrides));
  engine.setConfig(config);
  broadcast({ t: 'settings', settings: clientSettings() });
}

function applyOverride(key, value) {
  const next = structuredClone(overrides);
  if (value === null) {
    const keys = key.split('.');
    const parent = getPath(next, keys.slice(0, -1).join('.'));
    if (parent) delete parent[keys.at(-1)];
  } else setPath(next, key, value);
  const previous = overrides;
  overrides = next;
  try {
    rebuildConfig();
  } catch (err) {
    overrides = previous;
    throw err;
  }
  saveOverrides(overrides);
}

function setTestMode(on) {
  applyOverride('game.testMode', on);
  if (!on) {
    scenarios.stop();
    mock.stop();
    engine.purgeMock();
  }
}

// ---------- web server ----------
const app = express();
app.disable('x-powered-by');
// Only answer requests addressed to this machine (blocks DNS rebinding).
app.use((req, res, next) => (['127.0.0.1', 'localhost'].includes(req.hostname) ? next() : res.status(403).end()));
app.use(express.static(paths.public));
app.use(express.json({ limit: '8kb' }));
// JSON-only endpoints: browsers cannot send application/json cross-site without a CORS preflight.
app.use('/api', (req, res, next) => (req.method !== 'POST' || req.is('application/json') ? next() : res.status(415).end()));

app.get('/events', (req, res) => {
  const admin = req.query.admin === '1';
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  if (admin) {
    send(res, { t: 'conn', connections });
    send(res, adminState());
    send(res, { t: 'scenarios', list: scenarios.list(), mockGifts: MOCK_GIFTS });
    adminClients.add(res);
  } else {
    send(res, {
      t: 'snapshot',
      settings: clientSettings(),
      roster: engine.roster(),
      frame: { ...engine.frame(), conn: connections.live.connected },
      rank: engine.rankings(),
      obstacles: engine.obstaclesView(),
      result: engine.lastResult ?? null,
    });
    gameClients.add(res);
  }
  res.on('close', () => (admin ? adminClients : gameClients).delete(res));
});
setInterval(() => broadcast({ t: 'ping' }), 20_000);

app.post('/api/control', (req, res) => {
  const action = req.body?.action;
  const actions = {
    start: () => (engine.start(), 'Game đã chạy.'),
    stop: () => (engine.stop(), 'Game đã dừng.'),
    pause: () => (engine.pause(), 'Đã tạm dừng.'),
    resume: () => (engine.resume(), 'Tiếp tục.'),
    reset: () => (engine.reset(), 'Đã reset toàn bộ (kể cả bảng vô địch và skin).'),
    newRound: () => (engine.newRound(), 'Đã mở vòng mới.'),
    skip: () => engine.skip(),
    reload: () => (rebuildConfig(), 'Đã nạp lại file cấu hình.'),
  };
  if (!actions[action]) return res.status(400).json({ error: 'action không hợp lệ' });
  try {
    res.json({ message: actions[action]() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/settings', (req, res) => {
  const { key, value } = req.body ?? {};
  const problem = checkSetting(key, value);
  if (problem) return res.status(400).json({ error: problem });
  try {
    applyOverride(key, value);
    res.json({ message: `${key} = ${value}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/testmode', (req, res) => {
  setTestMode(req.body?.on === true);
  res.json({ message: config.game.testMode ? 'Đã bật TEST MODE' : 'Đã tắt TEST MODE, chỉ nhận sự kiện LIVE thật' });
});

// Maps a real gift id (seen in the admin list) to a logical tier, or removes the mapping with tier: null.
app.post('/api/gift-map', (req, res) => {
  const { giftId, tier } = req.body ?? {};
  if (typeof giftId !== 'string' || !giftId || giftId.length > 64 || /[.]/.test(giftId)) return res.status(400).json({ error: 'giftId không hợp lệ' });
  if (tier !== null && !config.gifts.tiers[tier]) return res.status(400).json({ error: 'Nhóm quà không tồn tại' });
  try {
    applyOverride(`gifts.byId.${giftId}`, tier);
    res.json({ message: tier ? `Quà ${giftId} → ${tier}` : `Đã bỏ gán quà ${giftId}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || min));
const testOnly = (res) => {
  if (config.game.testMode) return false;
  res.status(403).json({ error: 'TEST MODE đang tắt: không nhận sự kiện giả lập trong chế độ LIVE.' });
  return true;
};

app.post('/api/simulate', (req, res) => {
  if (testOnly(res)) return;
  const { kind, name, count, text, tier, streak } = req.body ?? {};
  const user = mockUser(typeof name === 'string' && name.trim() ? name : 'khachthu');
  switch (kind) {
    case 'like':
      mock.like(user, clampInt(count, 1, 999));
      break;
    case 'comment':
      mock.comment(user, String(text ?? 'GO').slice(0, 200));
      break;
    case 'share':
      mock.share(user);
      break;
    case 'gift': {
      const gift = MOCK_GIFTS[tier] ?? MOCK_GIFTS.small;
      const n = clampInt(count, 1, 99);
      if (streak && n > 1) mock.giftStreak(user, { ...gift, type: 1 }, [Math.ceil(n / 3), Math.ceil((2 * n) / 3), n]);
      else mock.gift(user, gift, n);
      break;
    }
    case 'communityLikes':
      mock.anonymousLikes(clampInt(count, 1, 100_000));
      break;
    default:
      return res.status(400).json({ error: 'kind không hợp lệ' });
  }
  res.status(204).end();
});

app.post('/api/scenario', (req, res) => {
  if (testOnly(res)) return;
  const message = scenarios.run(String(req.body?.id ?? ''));
  if (message === null) return res.status(400).json({ error: 'Không có kịch bản này' });
  res.json({ message });
});

app.get('/api/state', (req, res) => res.json({ frame: engine.frame(), rank: engine.rankings(), connections }));

app.listen(port, host, (err) => {
  if (err) throw err;
  console.log(`Màn hình game (OBS):  http://${host}:${port}/`);
  console.log(`Bảng điều khiển:      http://${host}:${port}/admin.html`);
  console.log(`TEST MODE: ${config.game.testMode ? 'BẬT (nhận sự kiện giả lập)' : 'TẮT'}`);
  if (username) live.start();
  else console.log('Chưa đặt kênh TikTok (npm start -- ten_kenh, hoặc tiktokUsername trong config/game.json).');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    live.stop();
    mock.stop();
    scenarios.stop();
    process.exit(0);
  });
}
