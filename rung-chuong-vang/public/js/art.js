// Phao cứu sinh vẽ bằng SVG, vì emoji 🛟 không có trong font emoji của Windows 10.
export function buoySvg() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" fill="none" stroke="#ff5a1f" stroke-width="22"/>
  <g stroke="#fff" stroke-width="22" fill="none">
    <path d="M50 10 A40 40 0 0 1 78.3 21.7" />
    <path d="M90 50 A40 40 0 0 1 78.3 78.3" />
    <path d="M50 90 A40 40 0 0 1 21.7 78.3" />
    <path d="M10 50 A40 40 0 0 1 21.7 21.7" />
  </g>
  <circle cx="50" cy="50" r="51" fill="none" stroke="#7a2a08" stroke-width="3"/>
  <circle cx="50" cy="50" r="29" fill="none" stroke="#7a2a08" stroke-width="3"/>
</svg>`;
}

// Chuông vàng vẽ bằng SVG, dùng cho tiêu đề, màn rung chuông và chỗ ngồi của người cuối cùng.
export function bellSvg() {
  return `<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bell-body" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#b8760c"/>
      <stop offset=".28" stop-color="#ffe27a"/>
      <stop offset=".5" stop-color="#ffcf3f"/>
      <stop offset=".78" stop-color="#e09a14"/>
      <stop offset="1" stop-color="#8f5a06"/>
    </linearGradient>
    <linearGradient id="bell-rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe9a0"/>
      <stop offset="1" stop-color="#c47f0e"/>
    </linearGradient>
  </defs>
  <path d="M86 26 q14 -22 28 0" stroke="#c47f0e" stroke-width="10" fill="none" stroke-linecap="round"/>
  <path d="M100 30 C58 30 46 70 44 110 C42 140 34 158 18 172 L182 172 C166 158 158 140 156 110 C154 70 142 30 100 30 Z" fill="url(#bell-body)" stroke="#8f5a06" stroke-width="4"/>
  <path d="M70 52 C58 72 56 100 56 126" stroke="#fff6c8" stroke-width="9" fill="none" stroke-linecap="round" opacity=".75"/>
  <rect x="10" y="166" width="180" height="22" rx="11" fill="url(#bell-rim)" stroke="#8f5a06" stroke-width="4"/>
  <circle class="clapper" cx="100" cy="200" r="15" fill="#e09a14" stroke="#8f5a06" stroke-width="4"/>
  <path d="M60 140 h80" stroke="#b8760c" stroke-width="4" opacity=".55"/>
</svg>`;
}
