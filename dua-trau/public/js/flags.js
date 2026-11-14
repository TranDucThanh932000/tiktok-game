// Cờ vẽ bằng SVG (Windows không hiện emoji cờ). Khung 30×20.
function star(cx, cy, r, rot = -90, fill = '#ff0') {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = ((rot + i * 36) * Math.PI) / 180;
    const rr = i % 2 ? r * 0.382 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
}

// Ngôi sao nhỏ cờ Trung Quốc quay một đỉnh về ngôi sao lớn.
const towards = (x, y) => (Math.atan2(5 - y, 5 - x) * 180) / Math.PI;

const BODY = {
  thailand: () =>
    '<rect width="30" height="20" fill="#a51931"/><rect y="3.33" width="30" height="13.34" fill="#f4f5f8"/><rect y="6.67" width="30" height="6.66" fill="#2d2a4a"/>',
  vietnam: () => `<rect width="30" height="20" fill="#da251d"/>${star(15, 10.6, 6, -90, '#ffef00')}`,
  china: () =>
    `<rect width="30" height="20" fill="#ee1c25"/>${star(5, 5, 3, -90, '#ffde00')}${[[10, 2], [12, 4], [12, 7], [10, 9]].map(([x, y]) => star(x, y, 1, towards(x, y), '#ffde00')).join('')}`,
  cambodia: () =>
    '<rect width="30" height="20" fill="#032ea1"/><rect y="5" width="30" height="10" fill="#e00025"/>' +
    '<g fill="#fff"><rect x="8.6" y="12.6" width="12.8" height="1.2"/><rect x="9.6" y="11" width="10.8" height="1.6"/>' +
    '<path d="M10.2 11 L11 8.4 L11.8 11Z M12.6 11 L13.5 7.6 L14.4 11Z M13.9 11 L15 5.6 L16.1 11Z M15.6 11 L16.5 7.6 L17.4 11Z M18.2 11 L19 8.4 L19.8 11Z"/></g>',
  philippines: () => {
    const rays = Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      const x = (r) => (6.2 + r * Math.cos(a)).toFixed(2);
      const y = (r) => (10 + r * Math.sin(a)).toFixed(2);
      return `<line x1="${x(1.9)}" y1="${y(1.9)}" x2="${x(3.4)}" y2="${y(3.4)}"/>`;
    }).join('');
    return (
      '<rect width="30" height="10" fill="#0038a8"/><rect y="10" width="30" height="10" fill="#ce1126"/><path d="M0 0 L17.3 10 L0 20Z" fill="#fff"/>' +
      `<circle cx="6.2" cy="10" r="1.7" fill="#fcd116"/><g stroke="#fcd116" stroke-width=".7">${rays}</g>` +
      `${star(1.9, 2.2, 1, -90, '#fcd116')}${star(1.9, 17.8, 1, -90, '#fcd116')}${star(14.6, 10, 1, -90, '#fcd116')}`
    );
  },
};

export function flagSvg(id) {
  const body = BODY[id]?.() ?? '<rect width="30" height="20" fill="#888"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" width="300" height="200" preserveAspectRatio="none">${body}</svg>`;
}

export const flagUrl = (id) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(flagSvg(id))}`;

const cache = new Map();
export function flagImage(id) {
  if (!cache.has(id)) {
    const img = new Image();
    img.src = flagUrl(id);
    cache.set(id, img);
  }
  return cache.get(id);
}
