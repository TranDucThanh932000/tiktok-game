// Danh mục quà. Giá trong config chỉ là giá mục tiêu; giá được công nhận phải đến từ TikTok
// (danh sách quà của phòng hoặc chính sự kiện quà). Không đoán giá, và thẻ hướng dẫn chỉ hiện giá đã xác minh.

const key = (name) => String(name ?? '').normalize('NFKC').toLowerCase().trim();

export class GiftCatalog {
  constructor(list) {
    this.items = list.map((gift) => ({
      key: gift.key,
      label: gift.label,
      registers: gift.registers ?? null,
      target: gift.coins ?? null,
      names: gift.names.map(key),
      id: null,
      coins: null,
      source: null,
      mismatch: false,
    }));
  }

  // Chế độ thử (chưa nối LIVE): dùng giá mục tiêu để chơi được, không phải giá đã xác minh.
  useTargets() {
    for (const item of this.items) {
      if (item.target !== null) Object.assign(item, { coins: item.target, source: 'target' });
    }
  }

  // Vào LIVE thật: bỏ giá mục tiêu và giá từ quà mô phỏng, chỉ tin giá TikTok từ đây trở đi.
  resetForLive() {
    for (const item of this.items) {
      if (item.source !== 'tiktok') Object.assign(item, { coins: null, source: null, mismatch: false });
    }
  }

  find({ id, name } = {}) {
    const wanted = key(name);
    return this.items.find((item) => (id && item.id === String(id)) || (wanted && item.names.includes(wanted))) ?? null;
  }

  // Quà nhận được: { key, label, registers, coins }; coins null nghĩa là chưa biết giá, phải chờ xác minh.
  resolve({ id, name, coins } = {}) {
    const item = this.find({ id, name });
    const reported = Number(coins) > 0 ? Number(coins) : null;
    if (item && reported !== null) this.#record(item, id, reported, 'event');
    return {
      key: item?.key ?? 'other',
      label: item?.label ?? (String(name ?? '').slice(0, 30) || 'Quà'),
      registers: item?.registers ?? null,
      known: Boolean(item),
      coins: reported ?? item?.coins ?? null,
    };
  }

  // Đối chiếu với danh sách quà TikTok trả về cho phòng này. Trả về số quà khớp được.
  verifyFrom(roomGifts) {
    let matched = 0;
    for (const gift of roomGifts ?? []) {
      const item = this.find({ name: gift?.name ?? gift?.giftName });
      const coins = Number(gift?.diamond_count ?? gift?.diamondCount);
      if (!item || !(coins > 0)) continue;
      this.#record(item, gift.id ?? gift.giftId, coins, 'tiktok');
      matched++;
    }
    return matched;
  }

  #record(item, id, coins, source) {
    if (id) item.id = String(id);
    if (item.source === 'tiktok' && source === 'event' && item.coins === coins) return;
    Object.assign(item, { coins, source: source === 'event' && item.source === 'tiktok' ? 'tiktok' : source, mismatch: item.target !== null && item.target !== coins });
  }

  // Thẻ quà cổ vũ trên màn hình: chỉ các món đã có giá.
  guide() {
    return this.items.filter((item) => !item.registers && item.coins !== null).map(({ key: k, label, coins }) => ({ key: k, label, coins }));
  }

  status() {
    return this.items.map(({ key: k, label, registers, target, id, coins, source, mismatch }) => ({ key: k, label, registers, target, id, coins, source, mismatch }));
  }
}
