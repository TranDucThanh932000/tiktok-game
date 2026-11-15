// Vẽ con trâu quay mặt sang phải, gốc toạ độ là điểm giữa dưới chân (x, mặt đất).
// Có ảnh chibi (public/chibi/trau-<sprite>-<dáng>.png, sprite đặt trong config.json) thì dùng ảnh, chưa có thì vẽ bằng hình khối.

// Hai bảng ảnh: trau-chay.png (4 khung chạy) và trau-dang.png (đứng, mừng, buồn), có thể vẽ khác cỡ nhau,
// nên mỗi bảng lấy một dáng làm chuẩn chiều cao riêng.
const RUN = ['chay1', 'chay2', 'chay3', 'chay4'];
const POSES = [...RUN, 'dung', 'mung', 'buon'];
const sprites = new Map();

export function loadSprites(files, buffaloes) {
  const have = new Set(files);
  for (const n of buffaloes) {
    const set = {};
    for (const pose of POSES) {
      const file = `trau-${n.sprite ?? n.id}-${pose}.png`;
      if (!have.has(file)) continue;
      const img = new Image();
      img.src = `/chibi/${file}`;
      set[pose] = img;
    }
    sprites.set(n.id, set);
  }
}

const ready = (img) => img?.complete && img.naturalWidth > 0;
// Chiều cao trâu trên màn hình; các dáng khác dùng cùng tỉ lệ nên không bị nhảy cỡ.
export const BUFFALO_H = 162;

function spriteFor(id, pose, frame) {
  const set = sprites.get(id);
  if (!set) return null;
  const runs = RUN.map((k) => set[k]).filter(ready);
  let img;
  let ref;
  if (pose === 'run') {
    img = runs[frame % Math.max(1, runs.length)];
    ref = set.chay1;
  } else {
    img = set[{ stand: 'dung', happy: 'mung', sad: 'buon' }[pose]] ?? set.dung;
    ref = set.dung;
  }
  if (!ready(img)) return null;
  // Thiếu dáng chuẩn của bảng thì mượn bảng kia.
  if (!ready(ref)) ref = ready(set.chay1) ? set.chay1 : set.dung;
  if (!ready(ref)) ref = img;
  // Dáng chạy cao hơn dáng đứng một chút do chân co lên, nên đứng lấy 0,95 cho đều mắt.
  const target = pose === 'run' ? BUFFALO_H : BUFFALO_H * 0.95;
  return { img, scale: target / ref.naturalHeight };
}

// Trả về điểm đỉnh lưng (để cắm cờ) so với gốc.
export function drawBuffalo(g, { x, y, buffalo, pose, frame, phase, size = 1 }) {
  const sprite = spriteFor(buffalo.id, pose, frame);
  if (sprite) {
    const { img, scale } = sprite;
    const w = img.naturalWidth * scale * size;
    const h = img.naturalHeight * scale * size;
    const bob = pose === 'run' && RUN.filter((k) => ready(sprites.get(buffalo.id)?.[k])).length < 3 ? Math.abs(Math.sin(phase * Math.PI)) * -6 : 0;
    g.drawImage(img, x - w / 2, y - h + bob, w, h);
    return { backX: x - w * 0.2, backY: y - BUFFALO_H * size * 0.6 + bob };
  }
  g.save();
  g.translate(x, y);
  g.scale(size, size);
  const back = drawShape(g, buffalo, pose, phase);
  g.restore();
  return { backX: x + back.x * size, backY: y + back.y * size };
}

const SKIN = '#5b6472';
const SKIN_DARK = '#454c58';
const OUTLINE = '#2c2a33';
const HORN = '#f1e7d0';

function blob(g, fill, draw) {
  g.beginPath();
  draw();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = OUTLINE;
  g.stroke();
}

function leg(g, x, y, angle, len = 44) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  blob(g, SKIN_DARK, () => g.roundRect(-9, -4, 18, len, 8));
  g.fillStyle = OUTLINE;
  g.beginPath();
  g.roundRect(-10, len - 12, 20, 12, 5);
  g.fill();
  g.restore();
}

function drawShape(g, buffalo, pose, phase) {
  const run = pose === 'run';
  const lying = pose === 'sad';
  const swing = run ? Math.sin(phase * Math.PI * 2) * 0.55 : 0;
  const bob = run ? -Math.abs(Math.sin(phase * Math.PI * 2)) * 7 : 0;
  const lift = lying ? 36 : 0;
  g.save();
  if (pose === 'happy') {
    g.translate(-50, -10);
    g.rotate(-0.38);
    g.translate(50, 10);
  }
  g.translate(0, bob + lift);

  // Chân sau xa, chân trước xa (tối hơn), rồi thân, rồi hai chân gần.
  if (!lying) {
    leg(g, -42, -50, -swing * 0.8);
    leg(g, 40, -50, pose === 'happy' ? -1.1 : swing * 0.8);
  }
  // Đuôi
  g.strokeStyle = OUTLINE;
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(-70, -88);
  g.quadraticCurveTo(-92, -70 + swing * 10, -86, -48 + swing * 12);
  g.stroke();
  blob(g, OUTLINE, () => g.ellipse(-86, -46 + swing * 12, 6, 9, 0, 0, Math.PI * 2));
  // Thân
  blob(g, SKIN, () => g.ellipse(0, -82, 74, 44, 0, 0, Math.PI * 2));
  // Bụng sáng
  g.fillStyle = 'rgba(255,255,255,.12)';
  g.beginPath();
  g.ellipse(0, -62, 52, 18, 0, 0, Math.PI * 2);
  g.fill();
  // Áo yên theo màu của trâu
  blob(g, buffalo.color, () => g.roundRect(-46, -128, 74, 52, 12));
  g.fillStyle = '#ffd34d';
  g.fillRect(-46, -86, 74, 8);
  if (!lying) {
    leg(g, -30, -48, swing);
    leg(g, 52, -48, pose === 'happy' ? -1.3 : -swing);
  }
  // Đầu
  const headY = lying ? -78 : -100;
  const hx = 70;
  g.strokeStyle = HORN;
  g.lineCap = 'round';
  for (const [dx, w] of [[-10, 12], [8, 13]]) {
    g.lineWidth = w + 6;
    g.strokeStyle = OUTLINE;
    g.beginPath();
    g.arc(hx + dx - 18, headY - 22, 26, -0.1, -2.2, true);
    g.stroke();
    g.lineWidth = w;
    g.strokeStyle = HORN;
    g.stroke();
  }
  blob(g, SKIN, () => g.ellipse(hx, headY, 36, 32, 0, 0, Math.PI * 2));
  blob(g, SKIN, () => g.ellipse(hx - 30, headY - 14, 14, 8, -0.5, 0, Math.PI * 2));
  blob(g, '#f4b2b0', () => g.ellipse(hx + 26, headY + 12, 22, 17, 0, 0, Math.PI * 2));
  g.fillStyle = OUTLINE;
  for (const dx of [20, 32]) {
    g.beginPath();
    g.ellipse(hx + dx, headY + 10, 3, 4, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Mắt: buồn thì nhắm, còn lại mắt tròn long lanh
  if (lying) {
    g.lineWidth = 4;
    g.beginPath();
    g.arc(hx + 6, headY - 6, 7, 0.2, Math.PI - 0.2);
    g.stroke();
  } else {
    g.fillStyle = OUTLINE;
    g.beginPath();
    g.ellipse(hx + 6, headY - 6, 8, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(hx + 9, headY - 10, 3.5, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(255,120,140,.45)';
  g.beginPath();
  g.ellipse(hx - 8, headY + 10, 8, 5, 0, 0, Math.PI * 2);
  g.fill();
  accessory(g, buffalo.sprite ?? buffalo.id, hx, headY);
  g.restore();
  return { x: -20, y: -128 + bob + lift };
}

function accessory(g, id, hx, hy) {
  if (id === 'vietnam') {
    blob(g, '#efd593', () => {
      g.moveTo(hx - 34, hy - 26);
      g.lineTo(hx + 2, hy - 64);
      g.lineTo(hx + 36, hy - 26);
      g.closePath();
    });
    g.strokeStyle = '#c99b46';
    g.lineWidth = 2;
    for (const k of [0.4, 0.7]) {
      g.beginPath();
      g.moveTo(hx - 34 + 36 * (1 - k), hy - 26 - 38 * k);
      g.lineTo(hx + 36 - 34 * (1 - k), hy - 26 - 38 * k);
      g.stroke();
    }
  } else if (id === 'thailand') {
    for (let i = 0; i < 7; i++) {
      const a = 0.9 + i * 0.32;
      blob(g, i % 2 ? '#ffb300' : '#ff7a00', () => g.arc(hx - 8 + Math.cos(a) * 30, hy + 4 + Math.sin(a) * 30, 8, 0, Math.PI * 2));
    }
  } else if (id === 'china') {
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      blob(g, '#e8322d', () => g.arc(hx - 14 + Math.cos(a) * 8, hy - 30 + Math.sin(a) * 8, 7, 0, Math.PI * 2));
    }
    blob(g, '#ffd34d', () => g.arc(hx - 14, hy - 30, 5, 0, Math.PI * 2));
  } else if (id === 'cambodia') {
    g.save();
    g.beginPath();
    g.roundRect(hx - 44, hy + 18, 44, 18, 8);
    g.clip();
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      g.fillStyle = (i + j) % 2 ? '#fff' : '#d8343a';
      g.fillRect(hx - 44 + i * 8, hy + 18 + j * 6, 8, 6);
    }
    g.restore();
    g.lineWidth = 3;
    g.strokeStyle = OUTLINE;
    g.beginPath();
    g.roundRect(hx - 44, hy + 18, 44, 18, 8);
    g.stroke();
  } else if (id === 'philippines') {
    blob(g, '#a8743e', () => g.ellipse(hx - 2, hy - 30, 44, 10, -0.1, 0, Math.PI * 2));
    blob(g, '#c48c4f', () => g.ellipse(hx - 2, hy - 40, 22, 16, -0.1, Math.PI, Math.PI * 2));
  }
}
