// Màu áo từng đội (theo id trong config.json). Đội lạ thêm vào config mà không có ở đây thì dùng màu xám.
export const KITS = {
  mu: { shirt: '#da291c', trim: '#ffffff', shorts: '#ffffff', socks: '#111111', number: '#ffffff', hair: '#2a1a10', skin: '#c68b59', strip: '#da291c', pill: '#da291c', pillText: '#fff', color: '#ff4b3a' },
  real: { shirt: '#f7f7f7', trim: '#c9a63f', shorts: '#ffffff', socks: '#ffffff', number: '#1d2b5a', hair: '#6b4423', skin: '#e0ac7e', strip: '#f2f2f2', pill: '#f2f2f2', pillText: '#1d2b5a', color: '#ffffff' },
  barca: { shirt: '#1f4fa8', stripe: '#a50044', shorts: '#1f3f8f', socks: '#a50044', number: '#ffd23f', hair: '#141414', skin: '#8d5a3b', strip: 'linear-gradient(90deg,#1f4fa8 50%,#a50044 50%)', pill: '#a50044', pillText: '#fff', color: '#ff3d8b' },
  psg: { shirt: '#0b1f4a', center: '#da291c', shorts: '#0b1f4a', socks: '#0b1f4a', number: '#ffffff', hair: '#3a2414', skin: '#d39b6a', strip: 'linear-gradient(90deg,#0b1f4a 60%,#da291c 60%)', pill: '#0b1f4a', pillText: '#fff', pillBorder: '#3b5aa0', color: '#4d7cff' },
};
export const KEEPER_KIT = { shirt: '#f5a623', shorts: '#151515', socks: '#f5a623', number: '#151515', hair: '#2a1a10', skin: '#c68b59', glove: '#ffffff' };
const GREY = { shirt: '#888', shorts: '#555', socks: '#555', number: '#fff', hair: '#222', skin: '#c68b59', strip: '#888', pill: '#666', pillText: '#fff', color: '#ccc' };
export const kitOf = (id) => KITS[id] ?? GREY;

// Nhân vật vẽ bằng hình khối, gốc tọa độ ở giữa hai bàn chân. Góc tay/chân tính bằng radian, 0 là buông thẳng xuống,
// dương là giơ sang phải màn hình. Cầu thủ nhìn từ sau lưng (thấy số áo), thủ môn nhìn từ trước mặt.
export function drawPuppet(ctx, { x, y, scale = 1, rot = 0, back = true, kit, number, pose = {} }) {
  const p = { armL: -0.2, armR: 0.2, legL: -0.05, legR: 0.05, lift: 0, ...pose };
  ctx.save();
  ctx.translate(x, y - p.lift * scale);
  ctx.scale(scale, scale);
  ctx.translate(0, -60);
  ctx.rotate(rot);
  ctx.translate(0, 60);

  const limb = (sx, sy, angle, len, width, color, end, endR) => {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-angle);
    ctx.fillStyle = color;
    roundRect(ctx, -width / 2, 0, width, len, width / 2);
    ctx.fill();
    if (end) {
      ctx.fillStyle = end;
      ctx.beginPath();
      ctx.arc(0, len, endR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  // Chân: tất + giày
  for (const [sx, a] of [[-18, p.legL], [18, p.legR]]) {
    ctx.save();
    ctx.translate(sx, -62);
    ctx.rotate(-a);
    ctx.fillStyle = kit.skin;
    ctx.fillRect(-9, 0, 18, 22);
    ctx.fillStyle = kit.socks;
    roundRect(ctx, -10, 20, 20, 36, 6);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.ellipse(0, 58, 15, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Quần
  ctx.fillStyle = kit.shorts;
  roundRect(ctx, -40, -100, 80, 44, 8);
  ctx.fill();
  // Tay (sau áo để vai che chỗ nối)
  const hand = kit.glove ?? kit.skin;
  limb(-44, -178, p.armL, 78, 18, kit.skin, hand, kit.glove ? 15 : 10);
  limb(44, -178, p.armR, 78, 18, kit.skin, hand, kit.glove ? 15 : 10);
  // Áo
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-50, -186);
  ctx.quadraticCurveTo(0, -196, 50, -186);
  ctx.lineTo(58, -150);
  ctx.lineTo(44, -146);
  ctx.lineTo(42, -96);
  ctx.lineTo(-42, -96);
  ctx.lineTo(-44, -146);
  ctx.lineTo(-58, -150);
  ctx.closePath();
  ctx.fillStyle = kit.shirt;
  ctx.fill();
  ctx.clip();
  if (kit.stripe) {
    ctx.fillStyle = kit.stripe;
    for (let sx = -48; sx < 50; sx += 24) ctx.fillRect(sx + 12, -200, 12, 110);
  }
  if (kit.center) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-16, -200, 32, 110);
    ctx.fillStyle = kit.center;
    ctx.fillRect(-12, -200, 24, 110);
  }
  if (kit.trim) {
    ctx.fillStyle = kit.trim;
    ctx.fillRect(-60, -152, 120, 5);
  }
  ctx.restore();
  if (number != null) {
    ctx.fillStyle = kit.number;
    ctx.font = `700 ${back ? 44 : 34}px "Be Vietnam Pro", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), 0, back ? -134 : -138);
  }
  // Cổ + đầu
  ctx.fillStyle = kit.skin;
  ctx.fillRect(-9, -204, 18, 16);
  ctx.beginPath();
  ctx.arc(0, -228, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = kit.hair;
  ctx.beginPath();
  if (back) ctx.arc(0, -230, 31, 0, Math.PI * 2);
  else ctx.arc(0, -236, 31, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  if (!back) {
    ctx.fillStyle = '#1a1a1a';
    const mood = p.face ?? 'calm';
    ctx.beginPath();
    ctx.arc(-10, -226, 3.5, 0, Math.PI * 2);
    ctx.arc(10, -226, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (mood === 'happy') ctx.arc(0, -214, 8, 0.1 * Math.PI, 0.9 * Math.PI);
    else if (mood === 'sad') ctx.arc(0, -204, 8, 1.15 * Math.PI, 1.85 * Math.PI);
    else ctx.moveTo(-6, -212), ctx.lineTo(6, -212);
    ctx.stroke();
  }
  if (p.ball) {
    ctx.translate(0, -132);
    drawBall(ctx, 20, 0);
  }
  ctx.restore();
}

export function drawBall(ctx, r, spin) {
  ctx.save();
  ctx.rotate(spin);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    ctx.lineTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
