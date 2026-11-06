// Bố cục "Sổ Cầu An" vẽ bằng code: khung nền, tiêu đề, bộ đếm, tờ sớ khổ dọc, hàng chờ dọc, bốn thẻ cách chơi và ba dòng "vừa ghi danh".
export const W = 1080;
export const H = 1920;
// Khổ giấy tính theo toạ độ màn hình; nội dung tờ sớ dùng toạ độ riêng tính từ góc này.
export const PAPER = { x: 338, y: 311, w: 540, h: 722 };

const FALLBACK = '"Segoe UI", "Segoe UI Symbol", "Segoe UI Emoji", sans-serif';
export const FONTS = {
  script: (size) => `700 ${size}px "Dancing Script", ${FALLBACK}`,
  serif: (size) => `700 ${size}px "Playfair Display", ${FALLBACK}`,
  italic: (size) => `italic 700 ${size}px "Playfair Display", ${FALLBACK}`,
  sans: (size, weight = 500) => `${weight} ${size}px "Be Vietnam Pro", ${FALLBACK}`,
};

export const COLOR = {
  bg: '#3b0b0f',
  panel: '#2a0609',
  raised: '#4a1014',
  edge: '#6b1f20',
  gold: '#e8b85a',
  cream: '#f3e3bf',
  soft: 'rgba(243, 227, 191, 0.82)',
  wood: '#8e5a2a',
  woodMid: '#6b4220',
  woodDark: '#5a3618',
  darkText: '#2a1408',
};

const TIER_COLOR = { thanks: COLOR.gold, wish: '#ffb74d', avatar: '#ff9e9e', name: COLOR.cream };
const TIER_LABEL = {
  name: 'Ghi tên',
  avatar: 'Tên + ảnh',
  wish: 'Tên + ảnh + chúc lành',
  thanks: 'Tên + ảnh + chúc lành + đa tạ',
};

export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function fitText(c, text, maxWidth) {
  if (c.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length && c.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop();
  return `${chars.join('')}…`;
}

function box(c, x, y, w, h, r, fill, stroke, lineWidth = 2) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  if (!stroke) return;
  c.strokeStyle = stroke;
  c.lineWidth = lineWidth;
  c.stroke();
}

export function heartPath(c, x, y, s) {
  c.beginPath();
  c.moveTo(x, y + s * 0.34);
  c.bezierCurveTo(x - s * 0.8, y - s * 0.26, x - s * 0.36, y - s * 0.74, x, y - s * 0.3);
  c.bezierCurveTo(x + s * 0.36, y - s * 0.74, x + s * 0.8, y - s * 0.26, x, y + s * 0.34);
  c.closePath();
}

// Phần hình của thẻ "Ghi tên": tim đỏ kèm số tim, không có ảnh quà.
function drawLikes(c, count, mid, cy) {
  const text = String(count);
  c.font = FONTS.sans(42, 700);
  const heartW = 66;
  const left = mid - (heartW + 10 + c.measureText(text).width) / 2;
  c.fillStyle = '#ff3b5c';
  heartPath(c, left + heartW / 2, cy + 8, 58);
  c.fill();
  c.fillStyle = COLOR.cream;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText(text, left + heartW + 10, cy + 2);
}

function drawCards(c, guide, icons) {
  const y = 1163;
  const h = 202;
  const gap = 17;
  const w = (990 - gap * 3) / 4;
  const iconSize = 112;
  guide.tiers.slice(0, 4).forEach((tier, i) => {
    const x = 45 + i * (w + gap);
    const mid = x + w / 2;
    box(c, x, y, w, h, 26, COLOR.panel, COLOR.edge);
    const image = icons.get(tier.icon);
    if (tier.icon === 'heart') drawLikes(c, guide.likesForName, mid, y + 72);
    else if (image?.naturalWidth) c.drawImage(image, mid - iconSize / 2, y + 16, iconSize, iconSize);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = COLOR.cream;
    c.font = FONTS.sans(27, 700);
    c.fillText(tier.board, mid, y + 160, w - 20);
  });
}

// Phần tĩnh của màn hình. Bốn thẻ cần cấu hình từ server và ảnh quà nên vẽ lại khi nhận được.
export function buildBackground(guide, icons) {
  const canvas = makeCanvas(W, H);
  const c = canvas.getContext('2d');
  c.fillStyle = COLOR.bg;
  c.fillRect(0, 0, W, H);
  // khung viền đôi
  c.strokeStyle = '#8e5f30';
  c.lineWidth = 2;
  c.beginPath();
  c.roundRect(20, 20, 1038, 1878, 56);
  c.stroke();
  c.strokeStyle = '#6e3a22';
  c.lineWidth = 1.5;
  c.beginPath();
  c.roundRect(31, 31, 1016, 1856, 46);
  c.stroke();
  // tiêu đề: dòng nhỏ đặt cao hơn để dấu của chữ "Sổ Cầu" không đè lên
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = COLOR.gold;
  c.font = FONTS.sans(22, 700);
  c.letterSpacing = '5px';
  c.fillText('LIVE · GHI DANH', 56, 74);
  c.letterSpacing = '0px';
  c.fillStyle = COLOR.cream;
  c.font = FONTS.italic(72);
  c.fillText('Sổ Cầu An', 54, 166);
  // tiêu đề danh sách
  c.fillStyle = COLOR.gold;
  c.font = FONTS.italic(38);
  c.fillText('Vừa ghi danh', 55, 1437);
  c.strokeStyle = COLOR.edge;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(55 + c.measureText('Vừa ghi danh').width + 22, 1421);
  c.lineTo(1028, 1421);
  c.stroke();
  if (guide) drawCards(c, guide, icons);
  return canvas;
}

// Giấy ngà phẳng, thêm chút xơ giấy rất nhẹ.
export function buildPaper() {
  const canvas = makeCanvas(PAPER.w, PAPER.h);
  const c = canvas.getContext('2d');
  c.fillStyle = COLOR.cream;
  c.fillRect(0, 0, PAPER.w, PAPER.h);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * PAPER.w;
    const y = Math.random() * PAPER.h;
    const a = Math.random() * Math.PI;
    const len = 5 + Math.random() * 18;
    c.strokeStyle = Math.random() < 0.5 ? 'rgba(140, 100, 50, 0.05)' : 'rgba(255, 250, 225, 0.25)';
    c.lineWidth = 0.6 + Math.random() * 0.6;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    c.stroke();
  }
  return canvas;
}

// Trục cuốn giấy, cy là tâm trục.
export function drawRoller(c, cy) {
  const h = 28;
  const left = PAPER.x + 14;
  const width = PAPER.w - 28;
  c.fillStyle = COLOR.wood;
  c.fillRect(left, cy - h / 2, width, h);
  c.fillStyle = COLOR.woodMid;
  c.fillRect(left, cy - h / 2, width, 5);
  c.fillRect(left, cy + h / 2 - 5, width, 5);
  for (const x of [PAPER.x - 6, PAPER.x + PAPER.w + 6]) {
    c.fillStyle = COLOR.gold;
    c.strokeStyle = COLOR.woodDark;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(x, cy, 18, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
}

// Ô đếm góc phải, rộng ra theo số tờ.
export function drawCounter(c, written) {
  const text = written.toLocaleString('vi-VN');
  const right = 1023;
  const top = 57;
  const h = 123;
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  c.font = FONTS.serif(62);
  const numberWidth = c.measureText(text).width;
  const width = Math.max(230, 30 + numberWidth + 14 + 76 + 24);
  const x = right - width;
  box(c, x, top, width, h, 28, COLOR.panel, COLOR.gold);
  c.fillStyle = COLOR.gold;
  c.fillText(text, x + 30, top + 76);
  const labelX = x + 30 + numberWidth + 14;
  c.fillStyle = COLOR.soft;
  c.font = FONTS.sans(25);
  c.fillText('tờ', labelX, top + 73);
  c.fillText('đã ghi', labelX, top + 102);
}

function verticalText(c, text, x, y) {
  c.save();
  c.translate(x, y);
  c.rotate(Math.PI / 2);
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText(text, 0, 0);
  c.restore();
}

// Hàng chờ dạng thẻ dọc bên phải tờ sớ. Có người thì hiện hai tên kế tiếp theo chiều dọc.
export function drawQueue(c, queue) {
  const x = 925;
  const y = 380;
  const w = 110;
  const h = 585;
  const mid = x + w / 2;
  box(c, x, y, w, h, w / 2, COLOR.panel, COLOR.gold);
  c.fillStyle = COLOR.gold;
  c.font = FONTS.sans(27, 700);
  c.letterSpacing = '4px';
  verticalText(c, 'HÀNG CHỜ', mid, y + 40);
  c.letterSpacing = '0px';
  const count = queue.total.toLocaleString('vi-VN');
  let size = 66;
  c.font = FONTS.serif(size);
  while (size > 30 && c.measureText(count).width > 88) {
    size -= 2;
    c.font = FONTS.serif(size);
  }
  c.fillStyle = COLOR.cream;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(count, mid, y + 270);
  c.strokeStyle = 'rgba(232, 184, 90, 0.5)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(mid - 24, y + 325);
  c.lineTo(mid + 24, y + 325);
  c.stroke();
  const top = y + 345;
  const room = h - 345 - 34;
  c.font = FONTS.sans(26);
  if (!queue.next.length) {
    c.fillStyle = COLOR.soft;
    verticalText(c, 'Chưa có ai', mid, top);
    return;
  }
  const rows = queue.next.slice(0, 2);
  rows.forEach((row, i) => {
    c.fillStyle = TIER_COLOR[row.tier] ?? COLOR.cream;
    verticalText(c, fitText(c, row.name, room), mid + (rows.length > 1 ? (i ? -18 : 18) : 0), top);
  });
}

function initials(name) {
  const words = name.trim().split(/\s+/).slice(0, 2);
  return words.map((word) => Array.from(word)[0] ?? '').join('').toLocaleUpperCase('vi-VN');
}

function rowAvatar(c, row, cx, cy, r, avatarOf) {
  const image = row.avatar && avatarOf(row.avatar);
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fillStyle = COLOR.cream;
  c.fill();
  if (image) {
    c.save();
    c.clip();
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    c.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, cx - r, cy - r, r * 2, r * 2);
    c.restore();
  } else {
    c.fillStyle = COLOR.wood;
    c.font = FONTS.serif(34);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(initials(row.name), cx, cy + 2, r * 1.6);
  }
  c.strokeStyle = image ? COLOR.cream : COLOR.gold;
  c.lineWidth = 4;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.stroke();
}

// Ba dòng dưới cùng. Dòng đầu là tờ đang ở trên giấy, các dòng sau là tờ đã ghi xong.
export function drawRecent(c, rows, avatarOf) {
  const x = 45;
  const w = 990;
  const h = 122;
  for (let i = 0; i < 3; i++) {
    const y = 1465 + i * (h + 17);
    const row = rows[i];
    box(c, x, y, w, h, 28, row?.live ? COLOR.raised : COLOR.panel, row?.live ? COLOR.gold : COLOR.edge);
    if (!row) continue;
    rowAvatar(c, row, x + 70, y + h / 2, 43, avatarOf);
    // nhãn bên phải
    c.font = FONTS.sans(24, row.live ? 700 : 500);
    const pillW = c.measureText(row.pill).width + 44;
    const pillX = x + w - 26 - pillW;
    box(c, pillX, y + h / 2 - 22, pillW, 44, 22, row.live ? COLOR.gold : 'transparent', row.live ? null : 'rgba(232, 184, 90, 0.6)');
    c.fillStyle = row.live ? COLOR.darkText : COLOR.cream;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(row.pill, pillX + pillW / 2, y + h / 2 + 1);
    // tên và dòng phụ
    const textX = x + 140;
    const room = pillX - textX - 20;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillStyle = COLOR.cream;
    c.font = FONTS.script(46);
    c.fillText(fitText(c, row.name, room), textX, y + 62);
    c.fillStyle = COLOR.soft;
    c.font = FONTS.sans(24);
    c.fillText(fitText(c, `Sớ số ${row.no.toLocaleString('vi-VN')} · ${TIER_LABEL[row.tier] ?? ''}`, room), textX, y + 99);
  }
}
