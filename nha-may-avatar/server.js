import express from 'express';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { Factory } from './src/factory.js';
import { TikTokSource, channelName } from './src/tiktok.js';
import { createAvatarLoader } from './src/avatar.js';
import { listPhotoAccounts, sampleAvatar, SampleDeck } from './src/samples.js';
import { DEMO_VIEWERS, GIFT_PRESETS } from './public/rules.js';

export function createApp({ factory = new Factory(), live = new TikTokSource(), loadAvatar = createAvatarLoader(), log = console } = {}) {
  const app = express();
  const clients = new Set();
  const snapshot = () => ({ ...factory.snapshot(), connection: live.status });
  const broadcast = () => {
    const message = `data: ${JSON.stringify(snapshot())}\n\n`;
    // Snapshots supersede older frames; a large avatar filling the buffer is not a disconnection.
    for (const client of clients) if (!client.writableNeedDrain && !client.writableEnded) client.write(message);
  };
  const warning = text => {
    log.warn(`[Factory] ${text}`);
  };
  const liveWarning = text => {
    factory.record(text, 'warning');
    broadcast();
  };
  const liveEvent = event => {
    try { factory.ingest(event); }
    catch (error) { liveWarning(`Turn failed: ${error.message}`); }
  };
  const newRoom = () => factory.newLiveRoom();
  factory.on('change', broadcast);
  factory.on('warning', warning);
  live.on('status', broadcast);
  live.on('event', liveEvent);
  live.on('warning', liveWarning);
  live.on('room', newRoom);
  const tick = setInterval(() => factory.tick(), 100);
  const pulse = setInterval(broadcast, 1000);
  tick.unref();
  pulse.unref();

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (!['127.0.0.1', 'localhost'].includes(req.hostname)) return res.status(403).json({ error: 'Local access only.' });
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
    });
    if (req.method === 'POST') {
      if (!req.is('application/json')) return res.status(415).json({ error: 'JSON required.' });
      const origin = req.get('origin');
      if (origin && origin !== `http://${req.get('host')}`) return res.status(403).json({ error: 'Other websites cannot control this game.' });
    }
    next();
  });
  app.use(express.json({ limit: '200kb' }));
  app.get('/health', (_req, res) => res.json({ app: 'nha-may-avatar', version: 1 }));
  app.get('/api/state', (_req, res) => res.json(snapshot()));
  app.get('/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write(`retry: 1500\ndata: ${JSON.stringify(snapshot())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
  });
  app.post('/api/connect', (req, res) => {
    const username = channelName(req.body?.username);
    if (live.wanted) return res.status(409).json({ error: 'Disconnect first.' });
    factory.clearDemo();
    live.connect(username);
    res.status(202).json(snapshot());
  });
  app.post('/api/disconnect', async (_req, res) => {
    await live.disconnect();
    res.json(snapshot());
  });
  app.post('/api/pause', (req, res) => {
    factory.setPaused(req.body?.paused);
    res.json(snapshot());
  });
  app.post('/api/demo/reset', (_req, res) => {
    if (live.wanted) return res.status(409).json({ error: 'Disconnect LIVE to use test.' });
    factory.clearDemo();
    res.json(snapshot());
  });
  app.post('/api/demo', (req, res) => {
    if (live.wanted) return res.status(409).json({ error: 'Test off during LIVE.' });
    const { kind, viewerId, count = 1, giftId, customName, customAvatar } = req.body ?? {};
    if (!['like', 'gift'].includes(kind) || !Number.isInteger(count) || count < 1 || count > 1000) {
      return res.status(400).json({ error: 'Use a valid event and count (1-1000).' });
    }
    let viewer = DEMO_VIEWERS.find(person => person.userId === viewerId);
    if (viewerId === 'custom') {
      if (typeof customName !== 'string' || !customName.trim() || customName.length > 40
        || typeof customAvatar !== 'string' || customAvatar.length > 180_000
        || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(customAvatar)) {
        return res.status(400).json({ error: 'Enter a name and choose a PNG, JPEG or WebP photo.' });
      }
      viewer = {
        userId: `demo:custom:${createHash('sha256').update(customAvatar).digest('hex').slice(0, 16)}`,
        nickname: customName.trim(), avatar: customAvatar,
      };
    }
    if (!viewer) return res.status(400).json({ error: 'Choose a test name.' });
    const gift = GIFT_PRESETS.find(item => item.id === giftId);
    if (kind === 'gift' && !gift) return res.status(400).json({ error: 'Invalid test gift.' });
    const result = factory.ingest({
      ...viewer, type: kind, source: 'demo', eventId: `demo:${randomUUID()}`,
      count, repeatCount: count, diamonds: gift?.coins ?? 0, giftName: gift?.name ?? '',
    });
    res.json({ ...result, state: snapshot() });
  });
  app.post('/api/samples', (req, res) => {
    factory.setSamples(req.body?.on);
    res.json(snapshot());
  });
  app.get('/sample-avatar/:file', (req, res) => {
    const match = /^(\d{1,6})\.svg$/.exec(req.params.file);
    if (!match) return res.status(404).json({ error: 'Picture not found.' });
    res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' }).send(sampleAvatar(Number(match[1])));
  });
  app.get('/api/avatar', async (req, res) => {
    if (typeof req.query.url !== 'string') return res.status(400).json({ error: 'Photo URL required.' });
    const image = await loadAvatar(req.query.url);
    res.set({ 'Content-Type': image.type, 'Cache-Control': 'private, max-age=600' }).send(image.buffer);
  });
  app.use(express.static(path.join(import.meta.dirname, 'public')));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Action not found.' }));
  app.use((error, _req, res, _next) => {
    const status = Number.isInteger(error.status) ? error.status : error instanceof TypeError || error instanceof RangeError ? 400 : 500;
    log.error(`[Factory] ${error.message}`);
    res.status(status).json({ error: status === 413 ? 'Data too large.' : error.message });
  });

  return {
    app, factory, live,
    async dispose() {
      clearInterval(tick);
      clearInterval(pulse);
      await live.disconnect();
      for (const client of clients) client.end();
      factory.off('change', broadcast);
      factory.off('warning', warning);
      live.off('status', broadcast);
      live.off('event', liveEvent);
      live.off('warning', liveWarning);
      live.off('room', newRoom);
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 3140);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError('PORT must be 1-65535.');
  const username = process.argv[2] || process.env.TIKTOK_USERNAME || '';
  if (username) channelName(username);
  const photoFolder = path.join(import.meta.dirname, 'public', 'samples');
  const samples = new SampleDeck({ photos: () => listPhotoAccounts(photoFolder, 5) });
  const runtime = createApp({
    factory: new Factory({ samples }),
    live: new TikTokSource({ signApiKey: process.env.TIKTOK_SIGN_API_KEY || '' }),
  });
  const server = runtime.app.listen(port, '127.0.0.1', () => {
    console.log(`Ball Factory: http://127.0.0.1:${port}`);
    console.log(`OBS / LIVE Studio: http://127.0.0.1:${port}/?overlay=1 (540 × 960)`);
    if (username) runtime.live.connect(username);
  });
  server.on('error', async error => {
    console.error(`Game start failed: ${error.message}`);
    await runtime.dispose();
    process.exitCode = 1;
  });
  const shutdown = async () => {
    await runtime.dispose();
    server.close();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
