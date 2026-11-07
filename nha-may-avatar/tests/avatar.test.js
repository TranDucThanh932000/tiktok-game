import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarUrl, createAvatarLoader } from '../src/avatar.js';

test('avatar proxy restricts scheme, port, credentials and exact TikTok CDN suffixes', () => {
  assert.equal(avatarUrl('https://p16.tiktokcdn.com/a.png').hostname, 'p16.tiktokcdn.com');
  for (const url of ['http://p16.tiktokcdn.com/a', 'https://127.0.0.1/a', 'https://tiktokcdn.com.evil.test/a', 'https://user:pass@p16.tiktokcdn.com/a', 'https://p16.tiktokcdn.com:444/a', 'file:///secret']) {
    assert.throws(() => avatarUrl(url));
  }
});

test('redirects are checked before fetching and cannot escape the CDN allowlist', async () => {
  const calls = [];
  const load = createAvatarLoader({ fetchImage: async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
  } });
  await assert.rejects(() => load('https://p16.tiktokcdn.com/a.png'), /HTTPS/);
  assert.equal(calls.length, 1);
});

test('small supported images are cached and simultaneous requests share one download', async () => {
  let calls = 0;
  const load = createAvatarLoader({ fetchImage: async () => {
    calls += 1;
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } });
  } });
  const [first, second] = await Promise.all([load('https://p16.tiktokcdn.com/a.webp'), load('https://p16.tiktokcdn.com/a.webp')]);
  assert.equal(first, second);
  assert.equal(first.buffer.length, 3);
  await load('https://p16.tiktokcdn.com/a.webp');
  assert.equal(calls, 1);
});

test('bad content, oversized streams and failed downloads produce explicit errors', async () => {
  for (const response of [
    new Response('<html>bad</html>', { headers: { 'content-type': 'text/html' } }),
    new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
    new Response(new Uint8Array(2_000_001), { headers: { 'content-type': 'image/png' } }),
  ]) {
    const load = createAvatarLoader({ fetchImage: async () => response });
    await assert.rejects(() => load('https://p16.tiktokcdn.com/a.png'));
  }
  const failed = createAvatarLoader({ fetchImage: async () => { throw new Error('Network failure'); } });
  await assert.rejects(() => failed('https://p16.tiktokcdn.com/a.png'), /Image download failed/);
});
