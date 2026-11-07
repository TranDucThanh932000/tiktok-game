// Quà dùng đúng ảnh quà TikTok (public/gifts). SVG chỉ còn cho phần trang trí không phải quà.
const GIFTS = { pig: 'lucky-pig', clover: 'clover', rose: 'rose', heart: 'finger-heart', box: 'gift-box' };

const PATHS = {
  flower: '<circle cx="16" cy="10" r="6" fill="#FF6B8F"/><circle cx="10" cy="16" r="6" fill="#FF6B8F"/><circle cx="22" cy="16" r="6" fill="#FF6B8F"/><circle cx="16" cy="21" r="6" fill="#FF6B8F"/><circle cx="16" cy="16" r="4" fill="#E0A800"/>',
  'heart-deco': '<path d="M16 28 C 6 20, 2 14, 6 8 C 9 4, 14 5, 16 9 C 18 5, 23 4, 26 8 C 30 14, 26 20, 16 28 Z" fill="#FF8FB5" stroke="#FFD25E" stroke-width="2.2"/>',
  'heart-gold': '<path d="M16 28 C 6 20, 2 14, 6 8 C 9 4, 14 5, 16 9 C 18 5, 23 4, 26 8 C 30 14, 26 20, 16 28 Z" fill="#FF6B9A" stroke="#FFD25E" stroke-width="2"/>',
  clock: '<circle cx="16" cy="16" r="12" fill="none" stroke="#1E1033" stroke-width="2.6"/><path d="M16 9v7l4 3" fill="none" stroke="#1E1033" stroke-width="2.6" stroke-linecap="round"/>',
  other: '<rect x="5" y="13" width="22" height="15" rx="3" fill="#B79CFF"/><path d="M3 13h26M16 13v15M16 13c-3-6-9-6-9-2s9 2 9 2zM16 13c3-6 9-6 9-2s-9 2-9 2z" fill="none" stroke="#3A2860" stroke-width="2"/>',
  pause: '<rect x="8" y="6" width="5" height="20" rx="1.5" fill="none" stroke="#1E1033" stroke-width="2.6"/><rect x="19" y="6" width="5" height="20" rx="1.5" fill="none" stroke="#1E1033" stroke-width="2.6"/>',
};

// image: ảnh TikTok gửi kèm sự kiện, dùng cho những quà ngoài danh mục.
export function icon(name, size = 16, image = '') {
  const src = GIFTS[name] ? `/gifts/${GIFTS[name]}.webp` : image;
  if (src) return `<img src="${esc(src)}" width="${size}" height="${size}" alt="" draggable="false" style="display:block;flex:none;object-fit:contain">`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true" style="display:block;flex:none">${PATHS[name] ?? PATHS.other}</svg>`;
}

// Tải sẵn để icon không chớp trắng lần đầu xuất hiện.
for (const file of Object.values(GIFTS)) new Image().src = `/gifts/${file}.webp`;

export const SKINS = ['#F6C9A8', '#E8B48F', '#D69B76', '#F2D3B8'];
export const CLOTHES = ['#6EA8FF', '#FF8FB5', '#5ED39A', '#FFD25E', '#B79CFF', '#FF9B5E'];

function hash(text) {
  let value = 2166136261;
  for (const ch of String(text)) value = Math.imul(value ^ ch.codePointAt(0), 16777619);
  return value >>> 0;
}

// Màu nhân vật đi theo ID tài khoản, nên một người luôn có một dáng.
export function looks(id) {
  const value = hash(id);
  return { skin: SKINS[value % SKINS.length], body: CLOTHES[(value >>> 8) % CLOTHES.length] };
}

export const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
