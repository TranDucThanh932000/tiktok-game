import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { createApp } from '../server.js';

class LiveStub extends EventEmitter {
  constructor() {
    super();
    this.wanted = '';
    this.status = { phase: 'idle', text: 'Demo mode', username: '' };
  }
  connect(username) {
    this.wanted = username;
    this.status = { phase: 'connecting', text: 'Connecting...', username };
    this.emit('status', this.status);
  }
  async disconnect() {
    this.wanted = '';
    this.status = { phase: 'idle', text: 'Demo mode', username: '' };
    this.emit('status', this.status);
  }
}

async function runtime(t) {
  const game = createApp({ live: new LiveStub(), log: { warn() {}, error() {} } });
  const server = game.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await game.dispose();
    await new Promise(resolve => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(`${url}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  return { ...game, url, post };
}

test('HTTP API supports all exact quality levels and unit quantities', async t => {
  const game = await runtime(t);
  assert.deepEqual(await (await fetch(`${game.url}/health`)).json(), { app: 'nha-may-avatar', version: 1 });
  for (const [giftId, columns] of [['rose', 36], ['heart', 52], ['pig', 72]]) {
    await game.post('/api/demo/reset', {});
    const response = await game.post('/api/demo', { kind: 'gift', giftId, count: 10, viewerId: 'demo:miu' });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.tickets, 10);
    assert.equal(data.state.active.quality.columns, columns);
    assert.equal(data.state.pending, 9);
  }
  assert.equal((await fetch(`${game.url}/`)).status, 200);
  assert.equal((await fetch(`${game.url}/factory.svg`)).headers.get('content-type'), 'image/svg+xml');
});

test('live connection locks out demo input, keeps pause control, and reports validation errors', async t => {
  const game = await runtime(t);
  assert.equal((await game.post('/api/connect', { username: 'https://tiktok.com' })).status, 400);
  assert.equal((await game.post('/api/connect', { username: '@test_channel' })).status, 202);
  assert.equal((await game.post('/api/demo', { kind: 'like', count: 50, viewerId: 'demo:miu' })).status, 409);
  assert.equal((await game.post('/api/demo/reset', {})).status, 409);
  assert.equal((await game.post('/api/pause', { paused: true })).status, 200);
  assert.equal(game.factory.snapshot().paused, true);
  assert.equal((await game.post('/api/pause', { paused: 'false' })).status, 400);
  assert.equal((await game.post('/api/disconnect', {})).status, 200);
  assert.equal((await game.post('/api/demo', { kind: 'like', count: 50, viewerId: 'demo:miu' })).status, 200);
});

test('local API rejects foreign origins, invalid simulation data and untrusted avatar URLs', async t => {
  const game = await runtime(t);
  assert.equal((await game.post('/api/pause', { paused: true }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await fetch(`${game.url}/api/pause`, { method: 'POST', body: 'paused=true' })).status, 415);
  for (const body of [{ kind: 'like', count: 0 }, { kind: 'gift', giftId: 'bad' }, { kind: 'like', viewerId: 'custom', count: 50, customName: 'A', customAvatar: 'https://evil.example/a.png' }]) {
    assert.equal((await game.post('/api/demo', body)).status, 400);
  }
  assert.equal((await fetch(`${game.url}/api/avatar?url=${encodeURIComponent('http://127.0.0.1/secret')}`)).status, 403);
});

test('an OBS client receives an authoritative SSE snapshot and can reconnect without issuing jobs', async t => {
  const game = await runtime(t);
  await game.post('/api/demo', { kind: 'like', count: 50, viewerId: 'demo:an' });
  const response = await fetch(`${game.url}/events`);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  const state = JSON.parse(text.split('data: ')[1].split('\n')[0]);
  assert.equal(state.active.viewer.nickname, 'Alex');
  assert.equal(state.active.quality.columns, 24);
  await reader.cancel();
  const restored = await (await fetch(`${game.url}/api/state`)).json();
  assert.equal(restored.active.id, state.active.id);
  assert.equal(restored.pending, 0);
});

test('large uploaded avatars do not disconnect a healthy SSE client under normal backpressure', async t => {
  const game = await runtime(t);
  game.factory.ingest({
    type: 'like', source: 'demo', eventId: 'large-image', userId: 'large', nickname: 'Large image',
    count: 50, avatar: `data:image/jpeg;base64,${'A'.repeat(120_000)}`,
  });
  const response = await fetch(`${game.url}/events`, { signal: AbortSignal.timeout(5000) });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  const nextFrame = async () => {
    while (!buffered.includes('\n\n')) {
      const { value, done } = await reader.read();
      if (done) return false;
      buffered += decoder.decode(value, { stream: true });
    }
    buffered = buffered.slice(buffered.indexOf('\n\n') + 2);
    return true;
  };
  try {
    assert.ok(await nextFrame(), 'initial snapshot');
    game.factory.setPaused(true);
    assert.ok(await nextFrame(), 'paused snapshot');
    game.factory.setPaused(false);
    assert.ok(await nextFrame(), 'resumed snapshot must arrive on the same connection');
  } finally {
    await reader.cancel();
  }
});
