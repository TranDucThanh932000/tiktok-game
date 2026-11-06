// Giờ trong ngày và thời tiết của hồ câu. Server giữ trạng thái để mọi cửa sổ game (và lúc tải lại trang)
// thấy cùng một cảnh; trình duyệt chỉ lo vẽ và chuyển cảnh mượt.

export const WEATHER = {
  clear: '☀️ Nắng đẹp',
  cloudy: '⛅ Nhiều mây',
  windy: '🌬️ Gió to',
  rain: '🌧️ Mưa',
  storm: '⛈️ Giông bão',
};

const DEFAULT_WEIGHTS = { clear: 4, cloudy: 2, windy: 1.5, rain: 2, storm: 1 };
const mod24 = (h) => ((h % 24) + 24) % 24;

export class Sky {
  constructor({ cycleMinutes = 24, realClock = false, weatherSeconds = [40, 150], weather = DEFAULT_WEIGHTS } = {}, { now = Date.now, random = Math.random } = {}) {
    this.now = now;
    this.random = random;
    this.realClock = realClock;
    this.msPerHour = realClock ? 3_600_000 : (cycleMinutes * 60_000) / 24;
    this.span = weatherSeconds;
    this.weights = Object.entries(weather).filter(([name, w]) => name in WEATHER && w > 0);
    if (!this.weights.length) this.weights = [['clear', 1]];
    this.offset = 0; // số giờ cộng thêm khi bảng điều khiển chỉnh giờ
    this.frozen = null; // giờ đứng yên khi dừng đồng hồ
    this.forced = false;
    this.held = null; // trời cũ trong lúc sự kiện giữ thời tiết
    this.weather = this.pick(null);
    this.until = this.now() + this.duration();
  }

  duration() {
    const [min, max] = this.span;
    return (min + this.random() * (max - min)) * 1000;
  }

  // Bốc thời tiết kế tiếp theo trọng số, không lặp lại thời tiết đang có (nếu còn lựa chọn khác).
  pick(current) {
    const list = this.weights.length > 1 ? this.weights.filter(([name]) => name !== current) : this.weights;
    let x = this.random() * list.reduce((s, [, w]) => s + w, 0);
    for (const [name, w] of list) {
      if ((x -= w) < 0) return name;
    }
    return list.at(-1)[0];
  }

  baseHour(at) {
    if (!this.realClock) return mod24(at / this.msPerHour);
    const d = new Date(at);
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  hour(at = this.now()) {
    return this.frozen ?? mod24(this.baseHour(at) + this.offset);
  }

  setHour(h) {
    if (!Number.isFinite(h)) return;
    if (this.frozen !== null) this.frozen = mod24(h);
    else this.offset = mod24(h - this.baseHour(this.now()));
  }

  freeze(on) {
    if (on && this.frozen === null) this.frozen = this.hour();
    else if (!on && this.frozen !== null) {
      const h = this.frozen;
      this.frozen = null;
      this.setHour(h);
    }
  }

  // Sự kiện giữ một kiểu thời tiết; release() trả lại trời cũ. Chủ live bấm chọn thời tiết thì lựa chọn đó thắng.
  hold(name) {
    if (!(name in WEATHER)) return false;
    this.held ??= { weather: this.weather, forced: this.forced };
    this.weather = name;
    this.forced = true;
    return true;
  }

  release() {
    if (!this.held) return false;
    const { weather, forced } = this.held;
    this.held = null;
    this.weather = weather;
    this.forced = forced;
    if (!forced) this.until = this.now() + this.duration();
    return true;
  }

  // 'auto' trả về chế độ đổi ngẫu nhiên.
  force(name) {
    this.held = null;
    if (name === 'auto') {
      this.forced = false;
      this.until = this.now() + this.duration();
      return true;
    }
    if (!(name in WEATHER)) return false;
    this.weather = name;
    this.forced = true;
    return true;
  }

  // Gọi định kỳ; trả về true khi vừa đổi thời tiết.
  tick() {
    if (this.forced || this.now() < this.until) return false;
    this.weather = this.pick(this.weather);
    this.until = this.now() + this.duration();
    return true;
  }

  snapshot() {
    return {
      weather: this.weather,
      label: WEATHER[this.weather],
      forced: this.forced,
      held: Boolean(this.held),
      left: this.forced ? null : Math.max(0, this.until - this.now()),
      hour: this.hour(),
      msPerHour: this.frozen === null ? this.msPerHour : 0,
      frozen: this.frozen !== null,
      realClock: this.realClock,
    };
  }
}
