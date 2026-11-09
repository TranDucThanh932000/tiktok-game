// Hình vẽ sẵn bằng SVG, dùng khi chưa có ảnh nhân vật riêng trong public/nhan-vat.
// Khách: ngồi máy nhìn từ sau lưng, đứng chờ nhìn từ phía trước. Kiểu tóc, màu áo cố định theo tài khoản (look).
const SKIN = ['#f8d5b5', '#efc29a', '#dca77f'];
const HAIR = ['#1f1714', '#3b2619', '#5d3a22', '#e3b34a', '#8a3b22'];
const SHIRT = ['#fdfcf6', '#2b2f3a', '#3f7fd8', '#ff7aa8', '#ffcf3f', '#e5484d', '#8f9aa8', '#3fb37f'];
const PANTS = ['#2c3e66', '#1f2430', '#6b5a48', '#3b6fb0'];
const ACCENT = ['#ff5d8f', '#4fc3f7', '#ffd54f', '#b388ff', '#69f0ae'];
const STYLES = ['short', 'spiky', 'pony', 'long', 'buns', 'cap', 'hood'];

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
};

export function pick(look = 0) {
  return {
    skin: SKIN[look % SKIN.length],
    hair: HAIR[Math.floor(look / 3) % HAIR.length],
    shirt: SHIRT[Math.floor(look / 15) % SHIRT.length],
    pants: PANTS[look % PANTS.length],
    accent: ACCENT[Math.floor(look / 7) % ACCENT.length],
    style: STYLES[Math.floor(look / 120) % STYLES.length],
    phones: look % 5 === 2,
    glasses: look % 7 === 4,
  };
}

// ---------- Khách ngồi máy, nhìn từ sau lưng ----------
export function seatedSvg(look = 0) {
  const { skin, hair, shirt, accent, style, phones } = pick(look);
  const dark = shade(shirt, 0.82);
  const behind = {
    long: `<path d="M27 44C24 82 34 104 60 108 86 104 96 82 93 44Z" fill="${hair}"/>`,
  }[style] ?? '';
  const over = {
    short: `<path d="M57 10c-6 2-7 8-2 10 4 1 6-3 3-5" stroke="${shade(hair, 0.7)}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
    spiky: `<path d="M25 38 29 14 39 24 45 3 55 17 61 -1 68 16 79 3 83 22 94 12 95 38Z" fill="${hair}"/>`,
    pony: `<path d="M51 54C44 76 52 96 60 104 68 96 76 76 69 54Z" fill="${hair}"/><ellipse cx="60" cy="55" rx="12" ry="6" fill="${accent}"/>`,
    long: '',
    buns: `<circle cx="34" cy="14" r="13" fill="${hair}"/><circle cx="86" cy="14" r="13" fill="${hair}"/><rect x="27" y="22" width="14" height="5" rx="2.5" fill="${accent}"/><rect x="79" y="22" width="14" height="5" rx="2.5" fill="${accent}"/>`,
    cap: `<path d="M23 42C22 10 98 10 97 42Z" fill="${accent}"/><path d="M49 42Q60 31 71 42Z" fill="${hair}"/><path d="M33 41Q60 60 87 41 60 50 33 41Z" fill="${shade(accent, 0.7)}"/><circle cx="60" cy="13" r="3" fill="${shade(accent, 0.7)}"/>`,
    hood: `<path d="M30 72Q60 94 90 72 87 100 60 102 33 100 30 72Z" fill="${dark}"/><path d="M40 80Q60 92 80 80" stroke="${shade(shirt, 0.65)}" stroke-width="2" fill="none"/>`,
  }[style];
  const cups = phones
    ? `<path d="M25 42Q60 -8 95 42" stroke="#30333d" stroke-width="6" fill="none"/><rect x="15" y="36" width="13" height="21" rx="6" fill="${accent}"/><rect x="92" y="36" width="13" height="21" rx="6" fill="${accent}"/>`
    : '';
  const hoodFirst = style === 'hood';
  return `<svg viewBox="0 0 120 130" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  <path d="M40 116 35 129M80 116 85 129M50 118 48 129M70 118 72 129" stroke="#b52a2a" stroke-width="5" stroke-linecap="round"/>
  <ellipse cx="60" cy="116" rx="28" ry="7" fill="#e5403f"/>
  ${behind}
  <path d="M29 118C27 92 36 73 60 71 84 73 93 92 91 118Z" fill="${shirt}" stroke="${dark}" stroke-width="2"/>
  <path d="M33 84C22 88 18 98 21 108" stroke="${shirt}" stroke-width="15" stroke-linecap="round" fill="none"/>
  <path d="M87 84C98 88 102 98 99 108" stroke="${shirt}" stroke-width="15" stroke-linecap="round" fill="none"/>
  ${hoodFirst ? over : ''}
  <rect x="52" y="60" width="16" height="16" rx="5" fill="${shade(skin, 0.9)}"/>
  <circle cx="24" cy="46" r="7.5" fill="${skin}"/><circle cx="96" cy="46" r="7.5" fill="${skin}"/>
  <circle cx="60" cy="40" r="36" fill="${hair}"/>
  <path d="M44 68Q60 80 76 68 60 72 44 68Z" fill="${hair}"/>
  <path d="M38 20Q60 6 82 20" stroke="rgba(255,255,255,.2)" stroke-width="6" fill="none" stroke-linecap="round"/>
  ${hoodFirst ? '' : over}
  ${cups}
</svg>`;
}

// Ghế nhựa đỏ ở máy trống.
export function stoolSvg() {
  return `<svg viewBox="0 0 120 130" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  <path d="M40 116 35 129M80 116 85 129M50 118 48 129M70 118 72 129" stroke="#b52a2a" stroke-width="5" stroke-linecap="round"/>
  <ellipse cx="60" cy="116" rx="28" ry="7" fill="#e5403f"/>
  <ellipse cx="60" cy="114" rx="19" ry="3.5" fill="#f2706b"/>
</svg>`;
}

// ---------- Khách đứng, nhìn từ phía trước ----------
export function standingSvg(look = 0, { mood = 'smile' } = {}) {
  const { skin, hair, shirt, pants, accent, style, phones, glasses } = pick(look);
  const dark = shade(shirt, 0.82);
  const behind = {
    long: `<path d="M18 48C14 92 24 108 50 110 76 108 86 92 82 48Z" fill="${hair}"/>`,
    pony: `<path d="M78 36C96 44 98 74 86 88 88 72 82 58 74 50Z" fill="${hair}"/><circle cx="80" cy="40" r="6" fill="${accent}"/>`,
    buns: `<circle cx="24" cy="18" r="13" fill="${hair}"/><circle cx="76" cy="18" r="13" fill="${hair}"/>`,
    hood: `<path d="M18 62C14 32 86 32 82 62 84 84 16 84 18 62Z" fill="${dark}"/>`,
  }[style] ?? '';
  const top = {
    short: `<path d="M17 52C14 16 86 16 83 52 78 38 66 30 54 34 48 40 38 40 32 36 24 40 20 46 17 52Z" fill="${hair}"/>`,
    spiky: `<path d="M16 54 14 26 24 30 26 10 38 20 44 2 54 16 64 4 68 20 80 12 78 30 88 28 84 54C78 38 66 32 54 36 46 40 34 38 16 54Z" fill="${hair}"/>`,
    pony: `<path d="M17 52C14 16 86 16 83 52 76 36 60 30 44 36 34 40 24 44 17 52Z" fill="${hair}"/>`,
    long: `<path d="M17 56C14 14 86 14 83 56 80 40 70 30 50 32 30 30 20 40 17 56Z" fill="${hair}"/>`,
    buns: `<path d="M17 52C14 16 86 16 83 52 74 36 62 32 50 34 38 32 26 36 17 52Z" fill="${hair}"/><rect x="17" y="24" width="14" height="5" rx="2.5" fill="${accent}"/><rect x="69" y="24" width="14" height="5" rx="2.5" fill="${accent}"/>`,
    cap: `<path d="M16 46C16 10 84 10 84 46Z" fill="${accent}"/><path d="M16 46H84" stroke="${shade(accent, 0.7)}" stroke-width="4"/><path d="M18 50C20 46 26 44 30 46 24 48 22 52 18 54Z" fill="${hair}"/><path d="M82 50C80 46 74 44 70 46 76 48 78 52 82 54Z" fill="${hair}"/>`,
    hood: `<path d="M17 52C14 18 86 18 83 52 76 38 64 32 50 36 36 32 24 38 17 52Z" fill="${hair}"/>`,
  }[style];
  const eyes =
    mood === 'sad'
      ? '<path d="M33 60q5 -4 10 0M57 60q5 -4 10 0" stroke="#2a1a14" stroke-width="3" fill="none" stroke-linecap="round"/>'
      : '<ellipse cx="38" cy="60" rx="4" ry="5.5" fill="#2a1a14"/><ellipse cx="62" cy="60" rx="4" ry="5.5" fill="#2a1a14"/><circle cx="39.5" cy="58" r="1.6" fill="#fff"/><circle cx="63.5" cy="58" r="1.6" fill="#fff"/>';
  const mouth = mood === 'sad' ? '<path d="M44 76q6 -5 12 0" stroke="#7a2b20" stroke-width="2.6" fill="none" stroke-linecap="round"/>' : '<path d="M43 72q7 8 14 0Z" fill="#b5392c"/>';
  const lens = glasses ? '<g fill="none" stroke="#2f2f3a" stroke-width="2.4"><circle cx="38" cy="60" r="9"/><circle cx="62" cy="60" r="9"/><path d="M47 60h6"/></g>' : '';
  const cups = phones ? `<path d="M22 92Q50 108 78 92" stroke="#30333d" stroke-width="5" fill="none"/><rect x="18" y="84" width="11" height="15" rx="5" fill="${accent}"/><rect x="71" y="84" width="11" height="15" rx="5" fill="${accent}"/>` : '';
  return `<svg viewBox="0 0 100 160" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  <ellipse cx="50" cy="156" rx="26" ry="4" fill="rgba(0,0,0,.2)"/>
  <rect x="36" y="116" width="12" height="32" rx="5" fill="${pants}"/><rect x="52" y="116" width="12" height="32" rx="5" fill="${pants}"/>
  <ellipse cx="41" cy="151" rx="9" ry="5" fill="#2b2b33"/><ellipse cx="59" cy="151" rx="9" ry="5" fill="#2b2b33"/>
  ${behind}
  <path d="M28 124C26 98 34 84 50 82 66 84 74 98 72 124Z" fill="${shirt}" stroke="${dark}" stroke-width="2"/>
  <path d="M31 92Q22 104 24 116" stroke="${shirt}" stroke-width="10" stroke-linecap="round" fill="none"/>
  <path d="M69 92Q78 104 76 116" stroke="${shirt}" stroke-width="10" stroke-linecap="round" fill="none"/>
  <circle cx="24" cy="119" r="5" fill="${skin}"/><circle cx="76" cy="119" r="5" fill="${skin}"/>
  <rect x="43" y="76" width="14" height="10" fill="${shade(skin, 0.9)}"/>
  <circle cx="50" cy="50" r="34" fill="${hair}"/>
  <ellipse cx="50" cy="58" rx="28" ry="26" fill="${skin}"/>
  ${top}
  ${eyes}${lens}
  <ellipse cx="30" cy="70" rx="5" ry="3" fill="#ff9d9d" opacity=".75"/><ellipse cx="70" cy="70" rx="5" ry="3" fill="#ff9d9d" opacity=".75"/>
  ${mouth}
  ${cups}
</svg>`;
}

// ---------- Cô Tám chủ tiệm: tóc cuốn lô, đồ bộ hoa, cầm quạt nan; la thì cầm loa ----------
export function ownerSvg(mood = 'thuong') {
  const skin = '#f3c9a3';
  const dots = [
    [70, 190], [96, 206], [128, 186], [158, 204], [84, 228], [142, 228], [112, 214], [176, 226], [54, 222],
  ]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="6" fill="${i % 2 ? '#fff6c2' : '#ffffff'}"/><circle cx="${x}" cy="${y}" r="2.2" fill="#ff9f43"/>`)
    .join('');
  const curlers = [
    [70, 46, '#4fc3f7'], [94, 32, '#ff8a65'], [120, 28, '#81c784'], [146, 34, '#ba68c8'], [168, 50, '#ffd54f'],
  ]
    .map(([x, y, c]) => `<rect x="${x - 11}" y="${y - 9}" width="22" height="18" rx="7" fill="${c}"/><path d="M${x - 11} ${y}h22" stroke="rgba(0,0,0,.18)" stroke-width="2"/>`)
    .join('');
  const face = {
    thuong: `<path d="M92 104q8 -7 16 0M132 104q8 -7 16 0" stroke="#3a2418" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M106 132q14 12 28 0" stroke="#a5352a" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    la: `<path d="M88 92l20 8M152 92l-20 8" stroke="#3a2418" stroke-width="5" stroke-linecap="round"/>
      <circle cx="100" cy="108" r="5.5" fill="#3a2418"/><circle cx="140" cy="108" r="5.5" fill="#3a2418"/>
      <ellipse cx="120" cy="136" rx="15" ry="13" fill="#8e2a20"/><ellipse cx="120" cy="142" rx="9" ry="5" fill="#ff7b7b"/>`,
    vui: `<path d="M90 108q10 -12 20 0M130 108q10 -12 20 0" stroke="#3a2418" stroke-width="4.5" fill="none" stroke-linecap="round"/>
      <path d="M102 126q18 22 36 0Z" fill="#a5352a"/><path d="M108 130q12 8 24 0" fill="#fff"/>`,
  }[mood];
  const hands = {
    thuong: `<path d="M172 196C190 176 192 150 182 130" stroke="#f48fb1" stroke-width="22" fill="none" stroke-linecap="round"/>
      <g class="fan"><path d="M182 124 150 70A60 60 0 0 1 226 92Z" fill="#e8c27a" stroke="#b8893e" stroke-width="3"/>
      <path d="M182 124 162 76M182 124 178 70M182 124 196 74M182 124 212 84" stroke="#b8893e" stroke-width="2"/></g>
      <circle cx="182" cy="128" r="11" fill="${skin}"/>`,
    la: `<path d="M60 196C40 176 40 150 52 134" stroke="#f48fb1" stroke-width="22" fill="none" stroke-linecap="round"/>
      <g><path d="M70 124 24 100 24 160Z" fill="#e53935"/><rect x="58" y="120" width="22" height="22" rx="6" fill="#c62828"/>
      <ellipse cx="24" cy="130" rx="7" ry="30" fill="#ff6f60"/></g><circle cx="58" cy="138" r="11" fill="${skin}"/>
      <path d="M8 96l-8-6M6 130H-4M8 164l-8 6" stroke="#e53935" stroke-width="5" stroke-linecap="round"/>`,
    vui: `<path d="M64 200C70 176 92 168 108 170M176 200C170 176 148 168 132 170" stroke="#f48fb1" stroke-width="22" fill="none" stroke-linecap="round"/>
      <circle cx="120" cy="170" r="16" fill="${skin}"/>`,
  }[mood];
  return `<svg viewBox="0 0 240 250" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  <path d="M36 252C32 196 64 160 120 156 176 160 208 196 204 252Z" fill="#f48fb1"/>
  ${dots}
  <path d="M96 158l24 26 24 -26" fill="#fde2ec" stroke="#e57399" stroke-width="3"/>
  <rect x="106" y="138" width="28" height="24" rx="8" fill="#e8b892"/>
  <path d="M58 92C50 40 190 40 182 92 186 128 176 150 160 156H80C64 150 54 128 58 92Z" fill="#3b2418"/>
  <ellipse cx="120" cy="112" rx="52" ry="50" fill="${skin}"/>
  <circle cx="68" cy="122" r="6" fill="#ffc83d"/><circle cx="172" cy="122" r="6" fill="#ffc83d"/>
  <path d="M68 96C70 58 170 58 172 96 158 74 134 68 120 72 104 66 82 74 68 96Z" fill="#3b2418"/>
  ${curlers}
  <ellipse cx="88" cy="126" rx="10" ry="6" fill="#ff8f8f" opacity=".7"/><ellipse cx="152" cy="126" rx="10" ry="6" fill="#ff8f8f" opacity=".7"/>
  ${face}
  ${hands}
</svg>`;
}

// ---------- Mẹ đi kiếm con: đồ bộ tím, búi tóc, cầm chổi lông gà ----------
export function momSvg() {
  const skin = '#efc29a';
  return `<svg viewBox="0 0 120 190" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  <ellipse cx="58" cy="186" rx="30" ry="5" fill="rgba(0,0,0,.22)"/>
  <rect x="40" y="132" width="15" height="48" rx="6" fill="#3a2f4a"/><rect x="62" y="132" width="15" height="48" rx="6" fill="#3a2f4a"/>
  <ellipse cx="46" cy="182" rx="10" ry="5" fill="#8d6e63"/><ellipse cx="71" cy="182" rx="10" ry="5" fill="#8d6e63"/>
  <path d="M30 140C26 106 38 88 58 86 78 88 90 106 86 140Z" fill="#8e5bd6" stroke="#6a3fb0" stroke-width="2"/>
  <path d="M58 90V140" stroke="#6a3fb0" stroke-width="2"/><circle cx="58" cy="104" r="2.5" fill="#fff"/><circle cx="58" cy="118" r="2.5" fill="#fff"/>
  <path d="M33 100Q18 112 22 128" stroke="#8e5bd6" stroke-width="11" stroke-linecap="round" fill="none"/><circle cx="23" cy="131" r="6" fill="${skin}"/>
  <path d="M83 100Q100 86 98 64" stroke="#8e5bd6" stroke-width="11" stroke-linecap="round" fill="none"/>
  <g class="duster"><path d="M100 64 108 10" stroke="#8d5a2b" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="110" cy="10" rx="13" ry="16" fill="#e57373"/><ellipse cx="102" cy="6" rx="8" ry="11" fill="#ffd54f"/><ellipse cx="117" cy="4" rx="8" ry="10" fill="#4fc3f7"/></g>
  <circle cx="98" cy="64" r="6" fill="${skin}"/>
  <rect x="51" y="76" width="14" height="12" fill="#e2ad85"/>
  <circle cx="58" cy="16" r="12" fill="#2b1d16"/>
  <circle cx="58" cy="50" r="30" fill="#2b1d16"/>
  <ellipse cx="58" cy="56" rx="25" ry="24" fill="${skin}"/>
  <path d="M33 52C32 24 84 24 83 52 76 38 66 34 58 36 48 34 38 40 33 52Z" fill="#2b1d16"/>
  <path d="M41 48l10 4M75 48l-10 4" stroke="#2b1d16" stroke-width="3.5" stroke-linecap="round"/>
  <circle cx="47" cy="57" r="3.6" fill="#2b1d16"/><circle cx="69" cy="57" r="3.6" fill="#2b1d16"/>
  <ellipse cx="58" cy="71" rx="7" ry="6" fill="#8e2a20"/>
  <path d="M30 30l-8-6M28 42l-10 0" stroke="#e53935" stroke-width="3" stroke-linecap="round"/>
</svg>`;
}

// ---------- Màn hình máy tính ----------
// Khung CRT kem (máy thường) hoặc màn mỏng viền đèn (máy khủng, VIP); ruột màn hình vẽ riêng ở screenSvg.
export function monitorSvg(rig = false) {
  if (rig) {
    return `<svg viewBox="0 0 100 76" aria-hidden="true">
    <path d="M40 60h20l6 12H34Z" fill="#2a2d36"/><rect x="28" y="70" width="44" height="5" rx="2" fill="#1d2027"/>
    <rect x="2" y="2" width="96" height="60" rx="4" fill="#15171d" stroke="url(#g-rgb)" stroke-width="3"/>
  </svg>`;
  }
  return `<svg viewBox="0 0 100 76" aria-hidden="true">
    <path d="M36 58h28l8 13H28Z" fill="#cfc6ae"/><rect x="24" y="68" width="52" height="7" rx="3" fill="#bdb39a"/>
    <rect x="2" y="1" width="96" height="62" rx="7" fill="#e9e2cc" stroke="#bdb39a" stroke-width="2"/>
    <rect x="80" y="55" width="6" height="3" rx="1.5" fill="#62d26f"/>
  </svg>`;
}

const SCREENS = {
  kiemhiep: `<rect width="88" height="52" fill="url(#g-sky)"/><path d="M0 34 14 20 26 30 40 14 56 30 70 18 88 32V52H0Z" fill="#5b9f6a"/>
    <path d="M0 42Q30 34 88 42V52H0Z" fill="#7cc36b"/><path d="M58 22h16l-3-4H61Z" fill="#c0392b"/><rect x="61" y="22" width="10" height="7" fill="#f1e3c4"/>
    <circle cx="30" cy="36" r="3" fill="#f6d2b0"/><path d="M27 39h6l1 7h-8Z" fill="#3949ab"/><path d="M34 40 44 30" stroke="#eceff1" stroke-width="1.6"/>
    <rect x="3" y="3" width="22" height="3" fill="#c62828"/><rect x="3" y="7" width="16" height="2.5" fill="#1565c0"/>`,
  nhay: `<rect width="88" height="52" fill="url(#g-dance)"/><ellipse cx="44" cy="38" rx="26" ry="5" fill="#ffd1f0" opacity=".5"/>
    <circle cx="44" cy="17" r="4" fill="#f6d2b0"/><path d="M40 21h8l2 11h-12Z" fill="#fff"/><path d="M40 23 32 16M48 23l8-7" stroke="#fff" stroke-width="2"/>
    <g fill="#fff" font-family="Arial" font-weight="700" font-size="7"><rect x="10" y="42" width="14" height="8" rx="2" fill="#2a1450"/><text x="13" y="49">◀</text>
    <rect x="28" y="42" width="14" height="8" rx="2" fill="#2a1450"/><text x="31" y="49">▲</text><rect x="46" y="42" width="14" height="8" rx="2" fill="#2a1450"/><text x="49" y="49">▶</text>
    <rect x="64" y="42" width="14" height="8" rx="2" fill="#2a1450"/><text x="67" y="49">▼</text></g>
    <text x="44" y="9" text-anchor="middle" font-family="Arial" font-weight="900" font-size="8" fill="#ffe14f">PERFECT</text>`,
  sung: `<rect width="88" height="52" fill="#a98458"/><rect x="0" y="0" width="88" height="20" fill="#c9a777"/><rect x="34" y="12" width="20" height="26" fill="#3b2c1c"/>
    <rect x="6" y="20" width="14" height="22" fill="#8c6a42"/><rect x="66" y="16" width="16" height="26" fill="#8c6a42"/>
    <g stroke="#7cff6b" stroke-width="1.4"><path d="M44 22v5M44 31v5M37 29h5M46 29h5"/></g>
    <path d="M62 52 70 36 84 40 80 52Z" fill="#37474f"/><text x="4" y="49" font-family="Arial" font-weight="700" font-size="6" fill="#ffe082">100 · 30/90</text>`,
  dechet: `<rect width="88" height="52" fill="#6aa84f"/><path d="M0 30Q22 24 40 34T88 28V36Q66 40 44 42T0 38Z" fill="#3d85c6"/>
    <g fill="#38761d"><circle cx="10" cy="10" r="5"/><circle cx="18" cy="14" r="4"/><circle cx="76" cy="46" r="5"/><circle cx="68" cy="8" r="4"/></g>
    <g><rect x="30" y="8" width="8" height="6" fill="#d9c08f"/><path d="M29 8h10l-5-4Z" fill="#a61c00"/><rect x="48" y="12" width="8" height="6" fill="#d9c08f"/><path d="M47 12h10l-5-4Z" fill="#a61c00"/>
    <rect x="20" y="40" width="12" height="9" fill="#bfbfbf"/><path d="M19 40h14l-7-6Z" fill="#666"/></g>
    <g fill="#ffd966"><circle cx="40" cy="20" r="1.5"/><circle cx="44" cy="22" r="1.5"/><circle cx="58" cy="44" r="1.5"/></g>`,
  bong: `<rect width="88" height="52" fill="#3f9b3f"/><g fill="#48ad48"><rect x="0" width="11" height="52"/><rect x="22" width="11" height="52"/><rect x="44" width="11" height="52"/><rect x="66" width="11" height="52"/></g>
    <g stroke="#fff" stroke-width="1.2" fill="none"><rect x="3" y="3" width="82" height="46"/><path d="M44 3v46"/><circle cx="44" cy="26" r="8"/><rect x="3" y="16" width="10" height="20"/><rect x="75" y="16" width="10" height="20"/></g>
    <g fill="#e53935"><circle cx="30" cy="18" r="2.2"/><circle cx="34" cy="34" r="2.2"/></g><g fill="#1e88e5"><circle cx="58" cy="22" r="2.2"/><circle cx="62" cy="36" r="2.2"/></g>
    <circle cx="47" cy="27" r="1.8" fill="#fff"/>`,
  chat: `<rect width="88" height="52" fill="#f4f1fb"/><rect width="88" height="9" fill="#6a3fb0"/><text x="4" y="7" font-family="Arial" font-weight="700" font-size="6" fill="#fff">Chat · online</text>
    <g fill="#c8bde3"><rect x="5" y="13" width="44" height="5" rx="2.5"/><rect x="5" y="22" width="30" height="5" rx="2.5"/><rect x="5" y="40" width="40" height="5" rx="2.5"/></g>
    <g fill="#ffd54f"><rect x="38" y="31" width="44" height="5" rx="2.5"/></g>
    <circle cx="74" cy="18" r="6" fill="#ffd54f"/><circle cx="72" cy="17" r="1" fill="#333"/><circle cx="76" cy="17" r="1" fill="#333"/><path d="M71 20q3 3 6 0" stroke="#333" stroke-width="1" fill="none"/>`,
  idle: `<rect width="88" height="52" fill="url(#g-idle)"/><g fill="#fff" opacity=".7"><circle cx="12" cy="10" r=".9"/><circle cx="70" cy="8" r="1.1"/><circle cx="80" cy="30" r=".8"/><circle cx="20" cy="40" r=".9"/></g>
    <text x="44" y="30" text-anchor="middle" font-family="Arial" font-weight="900" font-size="9" fill="#9fd3ff">MÁY TRỐNG</text>`,
  out: `<rect width="88" height="52" fill="#d32f2f"/><circle cx="44" cy="16" r="8" fill="none" stroke="#fff" stroke-width="2"/><path d="M44 11v5l4 2" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>
    <text x="44" y="41" text-anchor="middle" font-family="Arial" font-weight="900" font-size="13" fill="#fff">HẾT GIỜ</text>`,
  buzz: `<rect width="88" height="52" fill="#f4f1fb"/><rect width="88" height="9" fill="#6a3fb0"/>
    <text x="44" y="36" text-anchor="middle" font-family="Arial" font-weight="900" font-size="15" fill="#e53935">BUZZ!!!</text>`,
};

export function screenSvg(kind) {
  return `<svg viewBox="0 0 88 52" preserveAspectRatio="none" aria-hidden="true">${SCREENS[kind] ?? SCREENS.idle}</svg>`;
}

// Tô mì tôm bốc khói và chai nước tăng lực đặt cạnh màn hình.
export function itemSvg() {
  return `<svg viewBox="0 0 60 44" aria-hidden="true">
  <g class="steam" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".85"><path d="M14 12q-4 -5 0 -10M22 12q-4 -5 0 -10"/></g>
  <path d="M4 20h30q-2 16 -15 16T4 20Z" fill="#fff" stroke="#d0d0d0" stroke-width="1.5"/><path d="M6 20h26" stroke="#f0b429" stroke-width="4"/>
  <path d="M10 18c4 -3 6 2 10 -1s6 2 9 -1" stroke="#ffd36b" stroke-width="2" fill="none"/>
  <rect x="42" y="8" width="11" height="30" rx="3" fill="#e53935"/><rect x="44" y="4" width="7" height="5" rx="1.5" fill="#ffd54f"/><rect x="42" y="18" width="11" height="8" fill="#ffd54f"/>
</svg>`;
}
