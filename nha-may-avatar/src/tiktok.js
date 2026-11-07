import { EventEmitter } from 'node:events';
import { createTikTokNormalizer } from '../../shared/tiktok-events.mjs';
import { EventDeduplicator } from '../../shared/event-deduplicator.mjs';

export function channelName(value) {
  const name = typeof value === 'string' ? value.trim().replace(/^@/, '') : '';
  if (!/^[a-zA-Z0-9_.]{1,24}$/.test(name)) throw new TypeError('Enter a TikTok name, not a URL.');
  return name;
}

function messageOf(error) {
  return String(error?.exception?.message ?? error?.message ?? error?.info ?? 'TikTok connection failed')
    .replace(/(api[_-]?key|token|sessionid)([=:]\s*)[^\s&]+/gi, '$1$2[hidden]')
    .slice(0, 240);
}

export class TikTokSource extends EventEmitter {
  constructor({ load = () => import('tiktok-live-connector'), signApiKey = '', retryMs = 15_000 } = {}) {
    super();
    this.load = load;
    this.signApiKey = signApiKey;
    this.retryMs = retryMs;
    this.generation = 0;
    this.wanted = '';
    this.connection = null;
    this.timer = null;
    this.roomId = '';
    this.normalizer = createTikTokNormalizer({ likeGapToCommunity: false });
    this.dedup = new EventDeduplicator();
    this.status = { phase: 'idle', username: '', roomId: '', text: 'Test mode' };
  }

  setStatus(phase, text) {
    this.status = { phase, username: this.wanted, roomId: this.roomId, text };
    this.emit('status', this.status);
  }

  connect(value) {
    const username = channelName(value);
    if (this.wanted) throw new Error('Disconnect first.');
    this.wanted = username;
    this.generation += 1;
    this.setStatus('connecting', `Connecting @${username}...`);
    this.pending = this.attempt(this.generation);
  }

  async closeConnection(connection) {
    if (!connection) return;
    try {
      await connection.disconnect();
    } catch (error) {
      this.emit('warning', `Disconnect failed: ${messageOf(error)}`);
    }
  }

  retry(generation, connection, reason) {
    if (generation !== this.generation || !this.wanted || this.connection !== connection) return;
    this.connection = null;
    void this.closeConnection(connection);
    this.setStatus('retrying', `${reason} · retry in ${Math.ceil(this.retryMs / 1000)}s`);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.pending = this.attempt(generation);
    }, this.retryMs);
    this.timer.unref?.();
  }

  consume(type, raw) {
    const rawId = raw?.common?.msgId;
    if (rawId && String(rawId) !== '0' && !this.dedup.accept(`${this.roomId}:${type}:${rawId}`)) return;
    try {
      for (const event of this.normalizer[type](raw)) {
        this.emit('event', { ...event, nickname: event.username ? event.nickname : 'Guest', eventId: `${this.roomId}:${type}:${event.eventId}` });
      }
    } catch (error) {
      this.emit('warning', `Event failed: ${messageOf(error)}`);
    }
  }

  async attempt(generation) {
    if (generation !== this.generation || !this.wanted) return;
    let connection = null;
    try {
      this.setStatus('connecting', `Connecting @${this.wanted}...`);
      const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await this.load();
      if (generation !== this.generation || !this.wanted) return;
      connection = new TikTokLiveConnection(this.wanted, {
        processInitialData: false,
        // No enableExtendedGiftInfo: its gift list needs a paid signing plan and aborts connect(). Gift events carry their own price.
        authenticateWs: false,
        webClientOptions: { timeout: { request: 12_000 }, retry: { limit: 1 } },
        wsClientOptions: { handshakeTimeout: 12_000 },
        ...(this.signApiKey ? { signApiKey: this.signApiKey } : {}),
      });
      this.connection = connection;
      const current = () => generation === this.generation && this.connection === connection && Boolean(this.wanted);
      const buffered = [];
      const receive = type => raw => {
        if (!current()) return;
        if (this.status.phase === 'connected') this.consume(type, raw);
        else if (buffered.length < 2000) buffered.push({ type, raw });
        else this.emit('warning', 'Too many events while connecting. Some were missed.');
      };
      connection.on(WebcastEvent.LIKE, receive('like'));
      connection.on(WebcastEvent.GIFT, receive('gift'));
      connection.on(WebcastEvent.STREAM_END, () => this.retry(generation, connection, 'LIVE ended'));
      connection.on(ControlEvent.DISCONNECTED, () => this.retry(generation, connection, 'TikTok disconnected'));
      connection.on(ControlEvent.ERROR, error => {
        if (current()) {
          const text = messageOf(error);
          this.emit('warning', `TikTok: ${text}`);
          this.setStatus(this.status.phase, `TikTok error: ${text}`);
        }
      });
      const state = await connection.connect();
      if (!current()) {
        await this.closeConnection(connection);
        return;
      }
      const roomId = String(state.roomId ?? '');
      if (!roomId) throw new Error('No LIVE room ID.');
      if (roomId !== this.roomId) {
        this.roomId = roomId;
        this.normalizer.reset();
        this.dedup = new EventDeduplicator();
        this.emit('room', roomId);
      }
      this.setStatus('connected', `LIVE @${this.wanted}`);
      for (const event of buffered) this.consume(event.type, event.raw);
    } catch (error) {
      if (generation !== this.generation || !this.wanted) {
        await this.closeConnection(connection);
        return;
      }
      this.emit('warning', `Connection failed: ${messageOf(error)}`);
      this.retry(generation, connection, messageOf(error));
    }
  }

  async disconnect() {
    this.wanted = '';
    this.generation += 1;
    clearTimeout(this.timer);
    const connection = this.connection;
    this.connection = null;
    await this.closeConnection(connection);
    this.setStatus('idle', 'Test mode');
  }
}
