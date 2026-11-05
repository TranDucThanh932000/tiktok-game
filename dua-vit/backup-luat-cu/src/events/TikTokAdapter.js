import { EventAdapter } from './EventAdapter.js';
import { createTikTokNormalizer } from './EventNormalizer.js';

// Real TikTok LIVE source, built on tiktok-live-connector 2.x (an unofficial library that reads the public
// LIVE webcast of a username; no TikTok login or developer key involved). Only the events below are used:
//   WebcastEvent.CHAT / LIKE / SHARE / GIFT / STREAM_END, ControlEvent.DISCONNECTED / ERROR
// The connector is imported lazily so the game still runs (TEST MODE) when the package is missing.
export class TikTokAdapter extends EventAdapter {
  constructor({ username, likeGapToCommunity = true, log = console } = {}) {
    super('live');
    this.username = username;
    this.log = log;
    this.normalizer = createTikTokNormalizer({ source: 'live', likeGapToCommunity });
    this.roomId = '';
    this.timer = null;
    this.stopped = false;
  }

  async start() {
    if (!this.username) return this.setStatus(false, 'Chưa đặt kênh TikTok (game.json → tiktokUsername)');
    let lib;
    try {
      lib = await import('tiktok-live-connector');
    } catch (err) {
      return this.setStatus(false, `Thiếu thư viện tiktok-live-connector (chạy npm install): ${err.message}`);
    }
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = lib;
    // processInitialData: false → a reconnect does not replay the messages TikTok bundles with the handshake.
    const conn = new TikTokLiveConnection(this.username, { processInitialData: false });
    this.conn = conn;
    const n = this.normalizer;
    const guard = (fn) => (payload) => {
      try {
        this.publish(fn(payload));
      } catch (err) {
        this.log.error(`[TikTok] Lỗi đọc sự kiện: ${err.message}`);
      }
    };
    conn.on(WebcastEvent.CHAT, guard((e) => n.comment(e)));
    conn.on(WebcastEvent.LIKE, guard((e) => n.like(e)));
    conn.on(WebcastEvent.SHARE, guard((e) => n.share(e)));
    conn.on(WebcastEvent.GIFT, guard((e) => n.gift(e)));
    conn.on(WebcastEvent.STREAM_END, ({ action } = {}) => {
      this.setStatus(false, action === 4 ? `TikTok đã đình chỉ phiên live của @${this.username}` : `@${this.username} đã kết thúc live`);
      this.retry(30_000, 'Live đã tắt');
    });
    conn.on(ControlEvent.ERROR, (err) => this.log.error('[TikTok]', err?.message ?? err));
    conn.on(ControlEvent.DISCONNECTED, () => this.retry(10_000, 'Mất kết nối TikTok'));
    this.run();
  }

  retry(ms, reason) {
    if (this.stopped) return;
    this.setStatus(false, `${reason}, thử lại sau ${ms / 1000} giây`);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), ms);
  }

  async run() {
    if (this.busy || this.stopped || this.conn.isConnected) return;
    this.busy = true;
    try {
      this.setStatus(false, `Đang chờ @${this.username} lên live...`);
      await this.conn.waitUntilLive(30);
      const state = await this.conn.connect();
      if (state.roomId !== this.roomId) {
        this.roomId = state.roomId;
        this.normalizer.reset();
        this.emit('room', { roomId: state.roomId });
      }
      this.setStatus(true, `Đã kết nối live @${this.username} (room ${state.roomId})`);
    } catch (err) {
      this.retry(30_000, `Lỗi: ${err?.message ?? err}`);
    } finally {
      this.busy = false;
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    // Already closed is fine.
    this.conn?.disconnect()?.catch?.(() => {});
  }
}
