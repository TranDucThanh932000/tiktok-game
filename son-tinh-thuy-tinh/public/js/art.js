// Nhân vật chibi vẽ bằng SVG, không cần file ảnh: Sơn Tinh, Thủy Tinh, Mị Nương và lính hai phe.
const INK = '#2b1a12';
const SKIN = '#ffe0c4';
const SOLDIER_SKINS = ['#ffe0c4', '#f6cfaa', '#e9b98e'];
const GOLD = '#ffcf3f';

// Mắt to kiểu chibi: tròng đen và hai đốm sáng.
function bigEyes(left, right, y, r = 1) {
  return [left, right]
    .map((x) => `<ellipse cx="${x}" cy="${y}" rx="${11 * r}" ry="${14 * r}" fill="${INK}"/><circle cx="${x + 4 * r}" cy="${y - 6 * r}" r="${4.6 * r}" fill="#fff"/><circle cx="${x - 3.5 * r}" cy="${y + 5 * r}" r="${2.1 * r}" fill="#fff"/>`)
    .join('');
}

const blush = (left, right, y) => `<ellipse cx="${left}" cy="${y}" rx="10" ry="6" fill="#ff8f8f" opacity=".55"/><ellipse cx="${right}" cy="${y}" rx="10" ry="6" fill="#ff8f8f" opacity=".55"/>`;

function sonTinh() {
  return `
  <ellipse cx="120" cy="292" rx="76" ry="9" fill="rgba(0,0,0,.22)"/>
  <path d="M74 170 C44 212 40 258 54 288 L186 288 C200 258 196 212 166 170 Z" fill="#23612f"/>
  <g>
    <rect x="28" y="74" width="12" height="214" rx="6" fill="#7a4a22"/>
    <rect x="24" y="88" width="20" height="9" rx="3" fill="${GOLD}"/>
    <path d="M10 92 L25 60 L32 72 L41 46 L58 92 Z" fill="#3e9b4f" stroke="#1f5a2c" stroke-width="3" stroke-linejoin="round"/>
    <path d="M35 60 L41 46 L47 60 L41 56 Z" fill="#fff"/>
  </g>
  <rect x="92" y="260" width="24" height="30" rx="10" fill="#5a3416"/>
  <rect x="124" y="260" width="24" height="30" rx="10" fill="#5a3416"/>
  <path d="M82 170 Q120 158 158 170 L176 272 Q120 286 64 272 Z" fill="#3e9b4f" stroke="#1f5a2c" stroke-width="3" stroke-linejoin="round"/>
  <path d="M108 178 L132 178 L140 278 L100 278 Z" fill="#6cc070"/>
  <path d="M66 266 Q120 282 174 266" stroke="${GOLD}" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M98 170 L120 196 L142 170" stroke="${GOLD}" stroke-width="6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
  <rect x="72" y="214" width="96" height="16" rx="7" fill="#8a5a2b"/>
  <path d="M108 231 L120 208 L132 231 Z" fill="${GOLD}" stroke="#c98d12" stroke-width="2" stroke-linejoin="round"/>
  <ellipse cx="80" cy="180" rx="21" ry="13" fill="#8a5a2b"/>
  <ellipse cx="160" cy="180" rx="21" ry="13" fill="#8a5a2b"/>
  <path d="M78 186 Q56 204 44 216" stroke="#3e9b4f" stroke-width="18" stroke-linecap="round" fill="none"/>
  <circle cx="38" cy="218" r="11" fill="${SKIN}"/>
  <path d="M162 186 Q186 202 188 226" stroke="#3e9b4f" stroke-width="18" stroke-linecap="round" fill="none"/>
  <circle cx="188" cy="230" r="11" fill="${SKIN}"/>
  <g class="head">
    <path d="M52 104 C50 46 90 24 120 24 C150 24 190 46 188 104 C188 132 176 150 166 158 L74 158 C64 150 52 132 52 104 Z" fill="${INK}"/>
    <ellipse cx="56" cy="114" rx="10" ry="13" fill="${SKIN}"/>
    <ellipse cx="184" cy="114" rx="10" ry="13" fill="${SKIN}"/>
    <ellipse cx="120" cy="112" rx="64" ry="58" fill="${SKIN}"/>
    <path d="M56 104 C58 60 90 44 120 44 C150 44 182 60 184 104 C172 88 160 82 150 84 C146 94 136 98 126 94 C118 104 104 106 96 96 C86 100 70 98 56 104 Z" fill="${INK}"/>
    <circle cx="120" cy="30" r="17" fill="${INK}"/>
    <path d="M62 74 Q120 52 178 74 L174 86 Q120 66 66 86 Z" fill="${GOLD}" stroke="#c98d12" stroke-width="2"/>
    <path d="M84 72 L100 36 L112 58 L120 18 L128 58 L140 36 L156 72 Z" fill="#3e9b4f" stroke="#1f5a2c" stroke-width="3" stroke-linejoin="round"/>
    <path d="M113 34 L120 18 L127 34 L120 29 Z" fill="#fff"/>
    <path d="M85 96 Q98 87 111 93" stroke="${INK}" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M129 93 Q142 87 155 96" stroke="${INK}" stroke-width="6" stroke-linecap="round" fill="none"/>
    ${bigEyes(98, 142, 118)}
    ${blush(80, 160, 137)}
    <path d="M107 140 Q120 158 133 140 Z" fill="#8c2f24"/>
    <path d="M113 148 Q120 153 127 148 Q120 145 113 148 Z" fill="#ff7b7b"/>
  </g>`;
}

function thuyTinh() {
  return `
  <ellipse cx="120" cy="292" rx="76" ry="9" fill="rgba(0,0,0,.22)"/>
  <path d="M72 170 C42 212 36 262 50 288 Q64 278 78 288 Q92 278 106 288 Q120 278 134 288 Q148 278 162 288 Q176 278 190 288 C204 262 198 212 168 170 Z" fill="#18487f"/>
  <g>
    <rect x="196" y="64" width="10" height="224" rx="5" fill="#d9a520"/>
    <path d="M182 84 L182 50 M201 84 L201 34 M220 84 L220 50 M182 84 Q201 98 220 84" stroke="${GOLD}" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path d="M176 54 L182 38 L188 54 Z M195 38 L201 20 L207 38 Z M214 54 L220 38 L226 54 Z" fill="${GOLD}"/>
  </g>
  <rect x="92" y="260" width="24" height="30" rx="10" fill="#16365e"/>
  <rect x="124" y="260" width="24" height="30" rx="10" fill="#16365e"/>
  <path d="M82 170 Q120 158 158 170 L176 272 Q120 286 64 272 Z" fill="#2f7fd8" stroke="#18487f" stroke-width="3" stroke-linejoin="round"/>
  <path d="M108 178 L132 178 L140 278 L100 278 Z" fill="#5aa2ec"/>
  <path d="M68 268 q9 -9 18 0 t18 0 t18 0 t18 0 t18 0 t18 0" stroke="#e8f6ff" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M98 170 L120 196 L142 170" stroke="#39c0c8" stroke-width="6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
  <rect x="72" y="214" width="96" height="16" rx="7" fill="${GOLD}"/>
  <circle cx="120" cy="222" r="9" fill="#eafaff" stroke="#39c0c8" stroke-width="3"/>
  <path d="M58 188 Q76 160 100 178 Z" fill="#39c0c8" stroke="#1f7f8a" stroke-width="2" stroke-linejoin="round"/>
  <path d="M182 188 Q164 160 140 178 Z" fill="#39c0c8" stroke="#1f7f8a" stroke-width="2" stroke-linejoin="round"/>
  <path d="M78 188 Q58 200 52 214" stroke="#2f7fd8" stroke-width="18" stroke-linecap="round" fill="none"/>
  <circle cx="48" cy="212" r="17" fill="#8fdcff" opacity=".85"/>
  <path d="M40 210 q8 -10 16 0 q-8 8 -14 2" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="52" cy="220" r="10" fill="${SKIN}"/>
  <path d="M162 186 Q188 200 198 214" stroke="#2f7fd8" stroke-width="18" stroke-linecap="round" fill="none"/>
  <circle cx="201" cy="216" r="11" fill="${SKIN}"/>
  <g class="head">
    <path d="M50 108 C46 44 92 24 120 24 C150 24 194 44 190 108 C192 140 198 160 186 172 C178 162 172 154 166 158 L74 158 C68 154 62 162 54 172 C42 160 48 140 50 108 Z" fill="#1b2b55"/>
    <path d="M56 104 L30 90 L38 110 L26 124 L58 124 Z" fill="#39c0c8" stroke="#1f7f8a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M184 104 L210 90 L202 110 L214 124 L182 124 Z" fill="#39c0c8" stroke="#1f7f8a" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="120" cy="112" rx="64" ry="58" fill="${SKIN}"/>
    <path d="M56 104 C58 60 90 44 120 44 C150 44 182 60 184 104 C176 92 168 86 158 86 L152 70 L142 88 C134 84 126 82 120 84 L112 66 L104 86 C96 84 88 86 82 90 L76 74 L70 96 C64 98 60 100 56 104 Z" fill="#1b2b55"/>
    <path d="M66 74 Q120 52 174 74 L170 86 Q120 66 70 86 Z" fill="${GOLD}" stroke="#c98d12" stroke-width="2"/>
    <path d="M82 70 q6 -24 24 -16 q-13 4 -7 16 Z M106 60 q8 -34 30 -20 q-16 4 -10 20 Z M138 66 q6 -24 24 -14 q-13 4 -7 14 Z" fill="#39c0c8" stroke="#1f7f8a" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="120" cy="64" r="7" fill="#fff" stroke="#39c0c8" stroke-width="2.5"/>
    <path d="M85 90 L111 99" stroke="#1b2b55" stroke-width="6" stroke-linecap="round"/>
    <path d="M155 90 L129 99" stroke="#1b2b55" stroke-width="6" stroke-linecap="round"/>
    ${bigEyes(98, 142, 119)}
    ${blush(80, 160, 137)}
    <path d="M104 140 Q120 152 138 136" stroke="#7a2b20" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <path d="M127 145 L130 153 L134 143 Z" fill="#fff" stroke="#7a2b20" stroke-width="1.2" stroke-linejoin="round"/>
  </g>`;
}

export function heroSvg(side, viewBox = '0 0 240 300') {
  return `<svg viewBox="${viewBox}" aria-hidden="true">${side === 'son' ? sonTinh() : thuyTinh()}</svg>`;
}

export function miSvg() {
  return `<svg viewBox="0 0 200 260" aria-hidden="true">
  <ellipse cx="100" cy="252" rx="62" ry="7" fill="rgba(0,0,0,.2)"/>
  <path d="M44 92 C40 40 76 16 100 16 C124 16 160 40 156 92 C158 140 164 190 152 216 L48 216 C36 190 42 140 44 92 Z" fill="#20130e"/>
  <path d="M64 166 L136 166 L160 246 Q100 260 40 246 Z" fill="#ff8fab" stroke="#d94f73" stroke-width="3" stroke-linejoin="round"/>
  <path d="M48 238 Q100 252 152 238" stroke="${GOLD}" stroke-width="4" fill="none" stroke-dasharray="2 9" stroke-linecap="round"/>
  <path d="M70 148 Q100 138 130 148 L138 198 Q100 208 62 198 Z" fill="#e8436b" stroke="#b8274f" stroke-width="3" stroke-linejoin="round"/>
  <path d="M88 150 L112 150 L106 174 L94 174 Z" fill="#ffd34d"/>
  <path d="M64 192 Q100 202 136 192 L134 204 Q100 214 66 204 Z" fill="${GOLD}"/>
  <path d="M116 206 L124 236 L114 232 L108 240 L106 208 Z" fill="${GOLD}"/>
  <path d="M74 158 Q64 184 90 194" stroke="#e8436b" stroke-width="16" stroke-linecap="round" fill="none"/>
  <path d="M126 158 Q136 184 110 194" stroke="#e8436b" stroke-width="16" stroke-linecap="round" fill="none"/>
  <path d="M100 166 Q86 182 100 196 Q114 182 100 166 Z" fill="#ffb3cc" stroke="#e05a86" stroke-width="2"/>
  <path d="M100 196 Q82 192 80 176 Q94 178 100 196 Z M100 196 Q118 192 120 176 Q106 178 100 196 Z" fill="#ff8fb4" stroke="#e05a86" stroke-width="2"/>
  <circle cx="92" cy="196" r="7" fill="${SKIN}"/>
  <circle cx="108" cy="196" r="7" fill="${SKIN}"/>
  <g class="head">
    <circle cx="100" cy="26" r="18" fill="#20130e"/>
    <ellipse cx="100" cy="92" rx="56" ry="52" fill="${SKIN}"/>
    <path d="M46 92 C48 50 76 34 100 34 C124 34 152 50 154 92 C142 72 122 64 100 70 C78 64 58 72 46 92 Z" fill="#20130e"/>
    <path d="M70 52 Q100 34 130 52" stroke="${GOLD}" stroke-width="6" fill="none" stroke-linecap="round"/>
    <circle cx="100" cy="42" r="7" fill="#ff5c8a" stroke="${GOLD}" stroke-width="3"/>
    <g transform="translate(146 56)">
      <circle r="6" cx="0" cy="-8" fill="#ff9ec0"/><circle r="6" cx="8" cy="-2" fill="#ff9ec0"/><circle r="6" cx="5" cy="7" fill="#ff9ec0"/><circle r="6" cx="-5" cy="7" fill="#ff9ec0"/><circle r="6" cx="-8" cy="-2" fill="#ff9ec0"/><circle r="4" fill="${GOLD}"/>
    </g>
    <path d="M66 86 Q78 78 90 84" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M110 84 Q122 78 134 86" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${bigEyes(80, 120, 100, 0.92)}
    <path d="M66 94 L62 90 M134 94 L138 90" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="66" cy="118" rx="9" ry="5.5" fill="#ff8fa3" opacity=".6"/>
    <ellipse cx="134" cy="118" rx="9" ry="5.5" fill="#ff8fa3" opacity=".6"/>
    <path d="M92 120 Q100 127 108 120" stroke="#c0485a" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;
}

function sonGear(variant) {
  if (variant === 1) return '<path d="M64 92 L64 14" stroke="#7a4a22" stroke-width="4" stroke-linecap="round"/><path d="M64 14 L80 20 L64 30 Z" fill="#3e9b4f" stroke="#1f5a2c" stroke-width="1.5" stroke-linejoin="round"/>';
  if (variant === 2) return '<path d="M62 92 L62 42" stroke="#7a4a22" stroke-width="5" stroke-linecap="round"/><ellipse cx="62" cy="36" rx="8" ry="12" fill="#8a5a2b" stroke="#5a3416" stroke-width="2"/>';
  return '<rect x="60" y="20" width="4" height="74" rx="2" fill="#7a4a22"/><path d="M56 24 L62 6 L68 24 Z" fill="#dfe6ea" stroke="#8a969c" stroke-width="1.5" stroke-linejoin="round"/>';
}

function thuyGear(variant) {
  if (variant === 1) return '<rect x="60" y="22" width="4" height="72" rx="2" fill="#8a969c"/><path d="M56 26 L62 8 L68 26 Z" fill="#dfe6ea"/><path d="M58 30 q4 8 8 0" stroke="#39c0c8" stroke-width="4" fill="none"/>';
  if (variant === 2) return '<path d="M64 92 L64 14" stroke="#d9a520" stroke-width="4" stroke-linecap="round"/><path d="M64 16 Q76 14 80 22 Q76 30 64 28 Z" fill="#39c0c8" stroke="#1f7f8a" stroke-width="1.5"/><circle cx="73" cy="21" r="1.6" fill="#1b2b55"/>';
  return '<rect x="60" y="22" width="4" height="72" rx="2" fill="#d9a520"/><path d="M54 28 L54 12 M62 28 L62 6 M70 28 L70 12 M54 28 L70 28" stroke="#ffcf3f" stroke-width="3" stroke-linecap="round" fill="none"/>';
}

function soldierEyes(kind) {
  if (kind === 1) return `<path d="M28 47 q4 -5 8 0 M44 47 q4 -5 8 0" stroke="${INK}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
  const dots = `<circle cx="32" cy="46" r="3.6" fill="${INK}"/><circle cx="48" cy="46" r="3.6" fill="${INK}"/><circle cx="33.4" cy="44.6" r="1.2" fill="#fff"/><circle cx="49.4" cy="44.6" r="1.2" fill="#fff"/>`;
  if (kind === 2) return `${dots}<path d="M26 40 L36 42 M54 40 L44 42" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
  return dots;
}

// look quyết định màu da, vũ khí, nét mặt, màu áo, để mỗi người xem có một chú lính riêng.
export function soldierSvg(side, look = 0) {
  const son = side === 'son';
  const skin = SOLDIER_SKINS[look % 3];
  const variant = Math.floor(look / 3) % 3;
  const face = Math.floor(look / 9) % 3;
  const shade = Math.floor(look / 27) % 2;
  const cloth = son ? ['#3e9b4f', '#52b05c'][shade] : ['#2f7fd8', '#4095ea'][shade];
  const dark = son ? '#1f5a2c' : '#18487f';
  const boots = son ? '#5a3416' : '#16365e';
  const helmet = son
    ? `<path d="M11 38 L40 9 L69 38 Q40 45 11 38 Z" fill="#e0bd6e" stroke="#a8813d" stroke-width="2" stroke-linejoin="round"/><path d="M16 36 Q40 42 64 36" stroke="#3e9b4f" stroke-width="4" fill="none"/><circle cx="40" cy="9" r="4" fill="#d9342b"/>`
    : `<path d="M30 20 Q40 1 53 17 Q45 13 40 20 Z" fill="#39c0c8" stroke="#1f7f8a" stroke-width="1.5" stroke-linejoin="round"/><path d="M17 40 Q17 17 40 17 Q63 17 63 40 Z" fill="#2f7fd8" stroke="#18487f" stroke-width="2"/><rect x="15" y="35" width="50" height="6" rx="3" fill="${GOLD}"/>`;
  const shield = son
    ? '<circle cx="19" cy="72" r="13" fill="#8a5a2b" stroke="#5a3416" stroke-width="2"/><path d="M11 77 L19 64 L27 77 Z" fill="#3e9b4f"/>'
    : '<circle cx="19" cy="72" r="13" fill="#39c0c8" stroke="#1f7f8a" stroke-width="2"/><path d="M10 73 q4.5 -5 9 0 t9 0" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>';
  const trim = son
    ? '<rect x="23" y="72" width="34" height="6" rx="3" fill="#8a5a2b"/>'
    : '<path d="M23 86 q4 -4 8 0 t8 0 t8 0 t8 0" stroke="#e8f6ff" stroke-width="2.5" fill="none" stroke-linecap="round"/>';
  return `<svg viewBox="0 0 80 100" aria-hidden="true">
  <ellipse cx="40" cy="96" rx="24" ry="4" fill="rgba(0,0,0,.22)"/>
  ${son ? sonGear(variant) : thuyGear(variant)}
  <rect x="28" y="84" width="10" height="12" rx="4" fill="${boots}"/>
  <rect x="42" y="84" width="10" height="12" rx="4" fill="${boots}"/>
  <path d="M24 60 Q40 54 56 60 L60 88 Q40 94 20 88 Z" fill="${cloth}" stroke="${dark}" stroke-width="2" stroke-linejoin="round"/>
  ${trim}
  <circle cx="62" cy="70" r="5.5" fill="${skin}"/>
  ${shield}
  <circle cx="40" cy="42" r="22" fill="${skin}"/>
  ${helmet}
  ${soldierEyes(face)}
  <ellipse cx="27" cy="53" rx="4" ry="2.5" fill="#ff8f8f" opacity=".6"/>
  <ellipse cx="53" cy="53" rx="4" ry="2.5" fill="#ff8f8f" opacity=".6"/>
  <path d="M36 55 Q40 59 44 55" stroke="#7a2b20" stroke-width="2" fill="none" stroke-linecap="round"/>
</svg>`;
}

// Biểu tượng nhỏ cho hai phe: núi và sóng.
export function sideIcon(side) {
  return side === 'son'
    ? '<svg viewBox="0 0 48 40" aria-hidden="true"><path d="M2 38 L17 12 L24 22 L32 6 L46 38 Z" fill="#3e9b4f" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M28 13 L32 6 L36 13 Z" fill="#fff"/></svg>'
    : '<svg viewBox="0 0 48 40" aria-hidden="true"><path d="M2 30 q7 -12 15 -4 q7 -16 18 -6 q6 -10 11 0 L46 38 L2 38 Z" fill="#2f7fd8" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M8 32 q5 -5 10 0 t10 0 t10 0" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>';
}

// Đạn: Sơn Tinh ném đá núi, Thủy Tinh phun cột nước.
export function shotSvg(side) {
  return side === 'son'
    ? '<svg viewBox="0 0 80 80" aria-hidden="true"><path d="M14 46 L22 20 L46 10 L68 24 L70 50 L50 70 L24 66 Z" fill="#8a6a4a" stroke="#4e3826" stroke-width="4" stroke-linejoin="round"/><path d="M26 28 L40 22 M48 40 L58 52 M30 50 L38 58" stroke="#5f4630" stroke-width="3" stroke-linecap="round"/><path d="M20 22 L28 14 L34 20 Z" fill="#3e9b4f"/></svg>'
    : '<svg viewBox="0 0 80 80" aria-hidden="true"><path d="M40 6 C54 26 70 38 70 52 A30 26 0 0 1 10 52 C10 38 26 26 40 6 Z" fill="#59b8ff" stroke="#1f5fae" stroke-width="4"/><path d="M24 50 q6 12 18 10" stroke="#e8f6ff" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="50" cy="40" r="5" fill="#e8f6ff"/></svg>';
}
