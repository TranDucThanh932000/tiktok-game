// 63 tỉnh thành trước đợt sáp nhập 2025: đúng với biển số xe mà người xem vẫn quen gọi (Nam Định 18, Thái Bình 17...).
// plates[0] là số in trên bản đồ, các số còn lại chỉ để ghi chú. Comment chỉ được tính khi ghi tên tỉnh, không tính số.
// aliases: cách gọi khác của chính tỉnh đó. Tên chính luôn được nhận, có dấu hay không dấu, viết liền hay cách đều được.
// spoken: chữ để giọng đọc đọc tên tỉnh (mặc định là name). geo: tên vùng trong dữ liệu bản đồ geoBoundaries.

export const REGIONS = { bac: 'Miền Bắc', trung: 'Miền Trung', nam: 'Miền Nam' };

export const PROVINCES = [
  { id: 'ha-giang', name: 'Hà Giang', plates: [23], region: 'bac' },
  { id: 'cao-bang', name: 'Cao Bằng', plates: [11], region: 'bac' },
  { id: 'bac-kan', name: 'Bắc Kạn', plates: [97], region: 'bac', aliases: ['Bắc Cạn'] },
  { id: 'tuyen-quang', name: 'Tuyên Quang', plates: [22], region: 'bac' },
  { id: 'lao-cai', name: 'Lào Cai', plates: [24], region: 'bac' },
  { id: 'dien-bien', name: 'Điện Biên', plates: [27], region: 'bac' },
  { id: 'lai-chau', name: 'Lai Châu', plates: [25], region: 'bac' },
  { id: 'son-la', name: 'Sơn La', plates: [26], region: 'bac' },
  { id: 'yen-bai', name: 'Yên Bái', plates: [21], region: 'bac' },
  { id: 'hoa-binh', name: 'Hòa Bình', plates: [28], region: 'bac' },
  { id: 'thai-nguyen', name: 'Thái Nguyên', plates: [20], region: 'bac' },
  { id: 'lang-son', name: 'Lạng Sơn', plates: [12], region: 'bac' },
  { id: 'quang-ninh', name: 'Quảng Ninh', plates: [14], region: 'bac' },
  { id: 'bac-giang', name: 'Bắc Giang', plates: [98], region: 'bac' },
  { id: 'phu-tho', name: 'Phú Thọ', plates: [19], region: 'bac' },
  { id: 'vinh-phuc', name: 'Vĩnh Phúc', plates: [88], region: 'bac' },
  { id: 'bac-ninh', name: 'Bắc Ninh', plates: [99], region: 'bac' },
  { id: 'hai-duong', name: 'Hải Dương', plates: [34], region: 'bac' },
  { id: 'hung-yen', name: 'Hưng Yên', plates: [89], region: 'bac' },
  { id: 'thai-binh', name: 'Thái Bình', plates: [17], region: 'bac' },
  { id: 'ha-nam', name: 'Hà Nam', plates: [90], region: 'bac' },
  { id: 'nam-dinh', name: 'Nam Định', plates: [18], region: 'bac' },
  { id: 'ninh-binh', name: 'Ninh Bình', plates: [35], region: 'bac' },
  { id: 'ha-noi', name: 'Hà Nội', plates: [29, 30, 31, 32, 33, 40], region: 'bac' },
  { id: 'hai-phong', name: 'Hải Phòng', plates: [15, 16], region: 'bac' },

  { id: 'thanh-hoa', name: 'Thanh Hóa', plates: [36], region: 'trung' },
  { id: 'nghe-an', name: 'Nghệ An', plates: [37], region: 'trung' },
  { id: 'ha-tinh', name: 'Hà Tĩnh', plates: [38], region: 'trung' },
  { id: 'quang-binh', name: 'Quảng Bình', plates: [73], region: 'trung' },
  { id: 'quang-tri', name: 'Quảng Trị', plates: [74], region: 'trung' },
  { id: 'thua-thien-hue', name: 'Thừa Thiên Huế', short: 'Huế', plates: [75], region: 'trung', aliases: ['Huế'] },
  { id: 'da-nang', name: 'Đà Nẵng', plates: [43], region: 'trung' },
  { id: 'quang-nam', name: 'Quảng Nam', plates: [92], region: 'trung' },
  { id: 'quang-ngai', name: 'Quảng Ngãi', plates: [76], region: 'trung' },
  { id: 'binh-dinh', name: 'Bình Định', plates: [77], region: 'trung' },
  { id: 'phu-yen', name: 'Phú Yên', plates: [78], region: 'trung' },
  { id: 'khanh-hoa', name: 'Khánh Hòa', plates: [79], region: 'trung' },
  { id: 'ninh-thuan', name: 'Ninh Thuận', plates: [85], region: 'trung' },
  { id: 'binh-thuan', name: 'Bình Thuận', plates: [86], region: 'trung' },
  { id: 'kon-tum', name: 'Kon Tum', plates: [82], region: 'trung' },
  { id: 'gia-lai', name: 'Gia Lai', plates: [81], region: 'trung' },
  { id: 'dak-lak', name: 'Đắk Lắk', plates: [47], region: 'trung', aliases: ['Đắc Lắc', 'Đắk Lắc', 'Đắc Lắk'] },
  { id: 'dak-nong', name: 'Đắk Nông', plates: [48], region: 'trung', aliases: ['Đắc Nông'] },
  { id: 'lam-dong', name: 'Lâm Đồng', plates: [49], region: 'trung' },

  { id: 'binh-phuoc', name: 'Bình Phước', plates: [93], region: 'nam' },
  { id: 'tay-ninh', name: 'Tây Ninh', plates: [70], region: 'nam' },
  { id: 'binh-duong', name: 'Bình Dương', plates: [61], region: 'nam' },
  { id: 'dong-nai', name: 'Đồng Nai', plates: [60, 39], region: 'nam' },
  {
    id: 'ba-ria-vung-tau', name: 'Bà Rịa - Vũng Tàu', short: 'Vũng Tàu', spoken: 'Bà Rịa Vũng Tàu', plates: [72], region: 'nam',
    aliases: ['Vũng Tàu', 'Bà Rịa', 'BRVT'], geo: ['Bà Rịa–Vũng Tàu', 'Côn Đảo'],
  },
  {
    id: 'ho-chi-minh', name: 'TP. Hồ Chí Minh', short: 'TP.HCM', spoken: 'Thành phố Hồ Chí Minh', plates: [51, 50, 52, 53, 54, 55, 56, 57, 58, 59, 41], region: 'nam',
    aliases: ['Hồ Chí Minh', 'Sài Gòn', 'HCM', 'TPHCM', 'HCMC'], geo: ['Ho Chi Minh'],
  },
  { id: 'long-an', name: 'Long An', plates: [62], region: 'nam' },
  { id: 'tien-giang', name: 'Tiền Giang', plates: [63], region: 'nam' },
  { id: 'ben-tre', name: 'Bến Tre', plates: [71], region: 'nam' },
  { id: 'tra-vinh', name: 'Trà Vinh', plates: [84], region: 'nam' },
  { id: 'vinh-long', name: 'Vĩnh Long', plates: [64], region: 'nam' },
  { id: 'dong-thap', name: 'Đồng Tháp', plates: [66], region: 'nam' },
  { id: 'an-giang', name: 'An Giang', plates: [67], region: 'nam' },
  { id: 'kien-giang', name: 'Kiên Giang', plates: [68], region: 'nam' },
  { id: 'can-tho', name: 'Cần Thơ', plates: [65], region: 'nam' },
  { id: 'hau-giang', name: 'Hậu Giang', plates: [95], region: 'nam' },
  { id: 'soc-trang', name: 'Sóc Trăng', plates: [83], region: 'nam' },
  { id: 'bac-lieu', name: 'Bạc Liêu', plates: [94], region: 'nam' },
  { id: 'ca-mau', name: 'Cà Mau', plates: [69], region: 'nam' },
];

export const BY_ID = new Map(PROVINCES.map((p) => [p.id, p]));

// Thông tin gửi cho trang game và bảng điều khiển.
export const publicProvinces = () =>
  PROVINCES.map(({ id, name, short, plates, region }) => ({ id, name, short: short ?? name, plate: plates[0], region }));

export const spokenName = (id) => {
  const p = BY_ID.get(id);
  return p ? p.spoken ?? p.name : '';
};

// ---------- Nhận tên tỉnh trong comment ----------
// Bỏ dấu: "Nam Định" -> "nam dinh". Giữ chữ cái và số, mọi ký tự khác thành dấu cách.
export const strip = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC');
export const words = (text) =>
  String(text ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);

const ASCII = /^[a-z]+$/;

// Tên nhiều chữ so theo dạng bỏ dấu, nên "nam dinh", "Nam Đinh", "NAM ĐỊNH" đều được, kể cả viết liền "namdinh".
// Tên một chữ ("Huế") phải đúng dấu nếu có gõ dấu, để tên người như "Huệ" không bị nhầm thành Huế; gõ không dấu "hue" vẫn được.
const ENTRIES = PROVINCES.flatMap((p) =>
  [p.name, ...(p.aliases ?? [])].map((alias) => {
    const tokens = words(alias);
    const bare = tokens.map(strip);
    return { id: p.id, tokens, bare, compact: tokens.length > 1 ? bare.join('') : null };
  }),
).sort((a, b) => b.tokens.length - a.tokens.length);
const COMPACT = new Map(ENTRIES.filter((e) => e.compact).map((e) => [e.compact, e.id]));

function matchAt(tokens, bare, i, entry) {
  const n = entry.tokens.length;
  if (i + n > tokens.length) return false;
  if (n === 1) return tokens[i] === entry.tokens[0] || (ASCII.test(tokens[i]) && tokens[i] === entry.bare[0]);
  return entry.bare.every((word, k) => bare[i + k] === word);
}

// Tỉnh được nhắc đầu tiên trong comment, hoặc null. "Nam Định đây cả nhà ơi" -> Nam Định.
// Bỏ phần nhắc tên người khác trước (@hanoi_boy Nam Định), kẻo tên tài khoản bị nhận nhầm thành tỉnh.
export function findProvince(text) {
  const tokens = words(String(text ?? '').replace(/@[\p{L}\p{M}\p{N}_.]+/gu, ' '));
  const bare = tokens.map(strip);
  for (let i = 0; i < tokens.length; i++) {
    const entry = ENTRIES.find((e) => matchAt(tokens, bare, i, e));
    if (entry) return BY_ID.get(entry.id);
    const id = COMPACT.get(bare[i]);
    if (id) return BY_ID.get(id);
  }
  return null;
}
