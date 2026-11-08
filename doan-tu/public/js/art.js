// Hình chibi vẽ bằng SVG, không dùng file ảnh: học sinh đầu to (nhìn từ sau lưng, đoán đúng thì quay lại cười)
// và cô giáo áo dài.
const SKIN = ['#f6d2b0', '#efc39c', '#e3b089'];
const HAIR = ['#231713', '#3a261c', '#5b3a26', '#1b1b2a'];
const TIE = ['#ff6f9f', '#ffb347', '#6fc3ff', '#b78cff'];
const SHIRT = '#fdfcf6';
const SCARF = '#e23a4c';

// Phụ kiện tóc phía sau đầu (vẽ trước đầu) và trên đỉnh đầu (vẽ sau đầu).
const styles = {
  short: { back: () => '', top: (hair) => `<path d="M58 14c-2-8 4-13 9-11-5 2-6 6-4 11Z" fill="${hair}"/>` },
  tail: { back: (hair, tie) => `<path d="M88 52c22 6 24 34 12 46 2-14-4-24-16-30Z" fill="${hair}"/><circle cx="90" cy="54" r="6" fill="${tie}"/>`, top: () => '' },
  twin: {
    back: (hair, tie) => `<ellipse cx="16" cy="78" rx="11" ry="20" fill="${hair}"/><ellipse cx="104" cy="78" rx="11" ry="20" fill="${hair}"/><circle cx="20" cy="60" r="6" fill="${tie}"/><circle cx="100" cy="60" r="6" fill="${tie}"/>`,
    top: () => '',
  },
  bun: { back: () => '', top: (hair, tie) => `<circle cx="60" cy="14" r="14" fill="${hair}"/><rect x="47" y="22" width="26" height="6" rx="3" fill="${tie}"/>` },
  bow: {
    back: () => '',
    top: (hair, tie) => `<path d="M74 22 90 12 92 32Z M74 22 66 6 84 8Z" fill="${tie}"/><circle cx="76" cy="21" r="4.5" fill="${tie}" stroke="rgba(0,0,0,.15)"/>`,
  },
};
const STYLE_NAMES = ['short', 'tail', 'short', 'twin', 'bun', 'bow'];

function pick(look) {
  return {
    skin: SKIN[look % SKIN.length],
    hair: HAIR[Math.floor(look / 3) % HAIR.length],
    tie: TIE[Math.floor(look / 12) % TIE.length],
    style: styles[STYLE_NAMES[Math.floor(look / 48) % STYLE_NAMES.length]],
    glasses: look % 7 === 3,
  };
}

const body = (skin) => `
  <path d="M28 142c0-26 14-40 32-40s32 14 32 40Z" fill="${SHIRT}" stroke="#e2dccb" stroke-width="2"/>
  <rect x="53" y="94" width="14" height="12" fill="${skin}"/>`;

// Tay giơ lên (chỉ hiện khi đoán đúng).
const arm = (skin) => `<g class="arm">
    <path d="M86 118 104 92" stroke="${SHIRT}" stroke-width="13" stroke-linecap="round"/>
    <path d="M104 92 111 70" stroke="${skin}" stroke-width="10" stroke-linecap="round"/>
    <circle cx="112" cy="66" r="8" fill="${skin}"/>
  </g>`;

export function studentSvg(look = 0) {
  const { skin, hair, tie, style } = pick(look);
  return `<svg viewBox="0 0 120 142" aria-hidden="true">
    <g class="back">
      ${body(skin)}
      <path d="M50 104 60 118 70 104Z" fill="${SCARF}"/>
      <circle cx="17" cy="64" r="8" fill="${skin}"/><circle cx="103" cy="64" r="8" fill="${skin}"/>
      ${style.back(hair, tie)}
      <circle cx="60" cy="58" r="42" fill="${hair}"/>
      <path d="M34 34Q60 18 86 34" stroke="rgba(255,255,255,.16)" stroke-width="7" fill="none" stroke-linecap="round"/>
      ${style.top(hair, tie)}
    </g>
    <g class="front">${frontFace(look)}</g>
    ${arm(skin)}
  </svg>`;
}

function frontFace(look) {
  const { skin, hair, tie, style, glasses } = pick(look);
  const lens = glasses ? `<g fill="none" stroke="#3a2a22" stroke-width="2.5"><circle cx="45" cy="70" r="10"/><circle cx="75" cy="70" r="10"/><path d="M55 70h10"/></g>` : '';
  return `
    ${body(skin)}
    <path d="M44 104 60 120 76 104" fill="none" stroke="#e2dccb" stroke-width="3"/>
    <path d="M52 105 60 113 68 105 65 130 60 121 55 130Z" fill="${SCARF}"/>
    ${style.back(hair, tie)}
    <circle cx="60" cy="58" r="42" fill="${hair}"/>
    <ellipse cx="60" cy="68" rx="35" ry="32" fill="${skin}"/>
    <path d="M23 64C22 26 98 26 97 64 92 48 80 40 70 42 66 50 58 52 52 46 42 44 30 50 23 64Z" fill="${hair}"/>
    ${style.top(hair, tie)}
    <path d="M39 70Q45 62 51 70" stroke="#2a1a14" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M69 70Q75 62 81 70" stroke="#2a1a14" stroke-width="4" fill="none" stroke-linecap="round"/>
    ${lens}
    <ellipse cx="38" cy="82" rx="7" ry="4" fill="#ff9d9d" opacity=".75"/>
    <ellipse cx="82" cy="82" rx="7" ry="4" fill="#ff9d9d" opacity=".75"/>
    <path d="M52 82Q60 94 68 82Z" fill="#b5392c"/>
    <path d="M55 86Q60 90 65 86" stroke="#ff8a8a" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
}

export function teacherSvg() {
  return `<svg viewBox="0 0 150 300" aria-hidden="true">
    <path class="pointer" d="M30 160 -50 206" stroke="#7a4b28" stroke-width="5" stroke-linecap="round"/>
    <path d="M30 70C30 10 120 10 120 70L126 168H24Z" fill="#231713"/>
    <path d="M52 176H98L112 286H38Z" fill="#fdfcf6" stroke="#ddd6c6" stroke-width="1.5"/>
    <path d="M50 128C64 118 86 118 100 128L104 188 98 278C86 284 64 284 54 278L46 188Z" fill="#59a8ea"/>
    <path d="M54 186 75 200 96 186" stroke="#3c86c8" stroke-width="3" fill="none"/>
    <circle cx="75" cy="160" r="5" fill="#ffd6e6"/><circle cx="66" cy="230" r="4" fill="#ffd6e6"/><circle cx="86" cy="250" r="4" fill="#ffd6e6"/>
    <path d="M52 130C40 138 36 152 30 160" stroke="#59a8ea" stroke-width="14" fill="none" stroke-linecap="round"/>
    <circle cx="29" cy="161" r="8" fill="#f6d2b0"/>
    <path d="M98 130C110 142 112 168 112 196" stroke="#59a8ea" stroke-width="13" fill="none" stroke-linecap="round"/>
    <rect x="100" y="186" width="26" height="36" rx="3" fill="#e23a4c"/><path d="M104 194h18M104 202h14" stroke="#ffd6d6" stroke-width="2.5"/>
    <circle cx="112" cy="204" r="7" fill="#f6d2b0"/>
    <rect x="66" y="108" width="18" height="18" fill="#efc39c"/>
    <ellipse cx="75" cy="72" rx="40" ry="40" fill="#f6d2b0"/>
    <path d="M33 74C30 24 120 24 117 74 108 50 90 42 76 44 70 54 56 58 46 52 40 58 36 66 33 74Z" fill="#231713"/>
    <path d="M110 34 128 22 130 46Z M110 34 104 14 122 16Z" fill="#ff6f9f"/><circle cx="112" cy="33" r="5" fill="#ff6f9f"/>
    <ellipse cx="60" cy="78" rx="5" ry="7" fill="#2a1a14"/><ellipse cx="90" cy="78" rx="5" ry="7" fill="#2a1a14"/>
    <circle cx="62" cy="75" r="2.2" fill="#fff"/><circle cx="92" cy="75" r="2.2" fill="#fff"/>
    <ellipse cx="50" cy="92" rx="7" ry="4" fill="#ff9d9d" opacity=".75"/><ellipse cx="100" cy="92" rx="7" ry="4" fill="#ff9d9d" opacity=".75"/>
    <path class="smile" d="M68 94C72 100 78 100 82 94" stroke="#a7482f" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <ellipse class="mouth" cx="75" cy="96" rx="6" ry="5" fill="#a5352a"/>
    <ellipse cx="60" cy="290" rx="15" ry="7" fill="#33281f"/><ellipse cx="90" cy="290" rx="15" ry="7" fill="#33281f"/>
  </svg>`;
}

// Cờ đuôi nheo treo tường cho vui mắt.
export function buntingSvg(width = 1080) {
  const colors = ['#ff6f9f', '#ffd25e', '#6fc3ff', '#8be38b', '#b78cff'];
  const flags = [];
  for (let x = 6, i = 0; x < width; x += 54, i++) {
    const y = 6 + 10 * Math.sin((x / width) * Math.PI);
    flags.push(`<path d="M${x} ${y}h44l-22 30Z" fill="${colors[i % colors.length]}"/>`);
  }
  return `<svg viewBox="0 0 ${width} 50" aria-hidden="true">
    <path d="M0 6Q${width / 2} 26 ${width} 6" stroke="#8c5a33" stroke-width="3" fill="none"/>
    ${flags.join('')}
  </svg>`;
}
