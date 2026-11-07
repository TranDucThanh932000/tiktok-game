import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { TikTokSource, channelName } from '../src/tiktok.js';
import { createTikTokNormalizer, userOf } from '../../shared/tiktok-events.mjs';
import { Factory } from '../src/factory.js';

const user = { id: '123', displayId: 'miu', nickname: 'Miu', avatarMedium: { urlList: ['https://p16.tiktokcdn.com/miu.heic', 'https://p16.tiktokcdn.com/miu.webp'] } };
let message = 0;
const common = () => ({ msgId: String(++message), createTime: String(Date.now()) });
const rawGift = (repeatCount, repeatEnd = 0, groupId = 'group-1') => ({
  common: common(), user, giftId: '5655', gift: { type: 1, name: 'Rose', diamondCount: 1 },
  repeatCount, repeatEnd, groupId,
});

function connector(connect = async () => ({ roomId: 'room-1' })) {
  const instances = [];
  class Connection extends EventEmitter {
    constructor(username, options) {
      super();
      this.username = username;
      this.options = options;
      this.disconnects = 0;
      instances.push(this);
    }
    connect() { return connect(this, instances.length); }
    async disconnect() { this.disconnects += 1; this.emit('disconnected'); }
  }
  return {
    instances,
    load: async () => ({
      TikTokLiveConnection: Connection,
      WebcastEvent: { LIKE: 'like', GIFT: 'gift', STREAM_END: 'streamEnd' },
      ControlEvent: { ERROR: 'error', DISCONNECTED: 'disconnected' },
    }),
  };
}

test('normalizer keeps combo high-water marks through duplicate final and out-of-order updates', () => {
  const normalizer = createTikTokNormalizer();
  const updates = [rawGift(1), rawGift(3), rawGift(10), rawGift(4), rawGift(10, 1), rawGift(10, 1)];
  assert.equal(updates.flatMap(raw => normalizer.gift(raw)).reduce((total, event) => total + event.repeatCount, 0), 10);
  assert.equal(normalizer.gift(rawGift(2, 1, 'next-group'))[0].repeatCount, 2);
});

test('avatar mapping falls back from empty medium to thumbnails and supports legacy users', () => {
  assert.equal(userOf(user).avatar, 'https://p16.tiktokcdn.com/miu.webp');
  assert.equal(userOf({ ...user, avatarMedium: { urlList: [] }, avatarThumb: { urlList: ['https://p16.tiktokcdn.com/thumb.png'] } }).avatar, 'https://p16.tiktokcdn.com/thumb.png');
  assert.equal(userOf({ userId: '55', nickname: 'N', profilePicture: { urls: ['https://p16.tiktokcdn.com/legacy.png'] } }).avatar, 'https://p16.tiktokcdn.com/legacy.png');
});

test('extended gift info fills missing name and coin values', () => {
  const normalizer = createTikTokNormalizer();
  const [event] = normalizer.gift({
    common: common(), user, giftId: '5', repeatCount: 1, repeatEnd: 1,
    gift: { type: 2, name: '', diamondCount: 0 },
    extendedGiftInfo: { name: 'Finger Heart', diamond_count: 5 },
  });
  assert.equal(event.giftName, 'Finger Heart');
  assert.equal(event.diamonds, 5);
});

test('live adapter wires actual event names to personal like thresholds and exact gift-unit credits', async t => {
  const fake = connector();
  const source = new TikTokSource({ load: fake.load });
  t.after(() => source.disconnect());
  const factory = new Factory();
  source.on('event', event => factory.ingest(event));
  source.connect('@test_channel');
  await source.pending;
  assert.equal(source.status.phase, 'connected');
  const connection = fake.instances[0];
  assert.equal(connection.options.processInitialData, false);
  assert.equal(connection.options.authenticateWs, false);
  assert.notEqual(connection.options.enableExtendedGiftInfo, true, 'needs a paid signing plan and aborts connect()');
  const like = { common: common(), user, count: 49, total: 1000000 };
  connection.emit('like', like);
  connection.emit('like', like);
  assert.equal(factory.snapshot().active, null);
  connection.emit('like', { common: common(), user, count: 1, total: 1000050 });
  for (const raw of [rawGift(1), rawGift(10), rawGift(10, 1), rawGift(10, 1)]) connection.emit('gift', raw);
  assert.equal(factory.snapshot().stats.likes, 50);
  assert.equal(factory.snapshot().stats.gifts, 10);
  assert.equal(factory.snapshot().pending, 10);
});

test('failed connections are visible and retry; intentional disconnect never retries', async t => {
  const fake = connector(async (_connection, attempt) => {
    if (attempt === 1) throw new Error('Channel is offline');
    return { roomId: 'room-1' };
  });
  const source = new TikTokSource({ load: fake.load, retryMs: 5 });
  t.after(() => source.disconnect());
  const warnings = [];
  source.on('warning', message => warnings.push(message));
  source.connect('test_channel');
  await source.pending;
  assert.equal(source.status.phase, 'retrying');
  assert.match(source.status.text, /Channel is offline/);
  assert.equal(warnings.length, 1);
  await delay(30);
  await source.pending;
  assert.equal(source.status.phase, 'connected');
  await source.disconnect();
  const count = fake.instances.length;
  await delay(20);
  assert.equal(fake.instances.length, count);
  assert.equal(source.status.phase, 'idle');
});

test('a late handshake after disconnect cannot reactivate or publish old events', async () => {
  let finish;
  const fake = connector(() => new Promise(resolve => { finish = resolve; }));
  const source = new TikTokSource({ load: fake.load });
  const events = [];
  source.on('event', event => events.push(event));
  source.connect('test_channel');
  await delay(0);
  const connection = fake.instances[0];
  connection.emit('gift', rawGift(1));
  await source.disconnect();
  finish({ roomId: 'old-room' });
  await source.pending;
  connection.emit('like', { common: common(), user, count: 50 });
  assert.equal(source.status.phase, 'idle');
  assert.equal(events.length, 0);
  assert.ok(connection.disconnects >= 2);
});

test('invalid channels and malformed numeric payloads fail explicitly', () => {
  assert.equal(channelName(' @hello.world '), 'hello.world');
  for (const value of ['', 'https://tiktok.com/@a', 'a/b', 'a b']) assert.throws(() => channelName(value));
  const normalizer = createTikTokNormalizer();
  assert.throws(() => normalizer.like({ count: Infinity }));
  assert.throws(() => normalizer.gift({ repeatCount: Infinity }));
});
