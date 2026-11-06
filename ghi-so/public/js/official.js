// Ông đồ: khăn đóng, áo dài xanh viền vàng, râu bạc, ngồi bên trái tờ sớ. Vẽ hoàn toàn bằng code, tay dài như sợi mì để với tới mọi chỗ trên giấy.
import { COLOR, FONTS } from './scene.js';

const SKIN = '#f3cfa9';
const CHEEK = '#eeb0a0';
const BEARD = '#ede6da';
const NAVY = '#1c2a4d';
const GOLD = COLOR.gold;
const INK = '#2a1a10';

export const HEAD = { x: 156, y: 636 };
const SHOULDER_L = { x: 100, y: 714 };
const SHOULDER_R = { x: 204, y: 708 };
// Lúc nghỉ: tay phải cầm bút trên tờ giấy nhỏ, tay trái giữ con dấu trên bàn.
export const PEN_REST = { x: 270, y: 832 };
export const SEAL_REST = { x: 132, y: 815 };

function torso(c, sway) {
  c.save();
  c.translate(sway, 0);
  c.fillStyle = NAVY;
  c.strokeStyle = GOLD;
  c.lineWidth = 3;
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(124, 680);
  c.quadraticCurveTo(92, 694, 90, 730);
  c.lineTo(77, 836);
  c.lineTo(237, 836);
  c.lineTo(224, 760);
  c.quadraticCurveTo(222, 700, 190, 680);
  c.closePath();
  c.fill();
  c.stroke();
  // nẹp áo và hàng khuy
  c.strokeStyle = 'rgba(232, 184, 90, 0.6)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(156, 730);
  c.lineTo(156, 836);
  c.stroke();
  c.fillStyle = GOLD;
  for (const y of [726, 748, 770]) {
    c.beginPath();
    c.arc(168, y, 3.5, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function hat(c) {
  c.fillStyle = NAVY;
  c.strokeStyle = GOLD;
  c.lineWidth = 3;
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(-63, -24);
  c.bezierCurveTo(-60, -76, -30, -101, 0, -101);
  c.bezierCurveTo(30, -101, 60, -76, 63, -24);
  c.quadraticCurveTo(0, -70, -63, -24);
  c.closePath();
  c.fill();
  c.stroke();
  c.lineWidth = 2.5;
  for (const [edge, top, half] of [[-52, -82, 55], [-35, -67, 59]]) {
    c.beginPath();
    c.moveTo(-half, edge);
    c.quadraticCurveTo(0, top, half, edge);
    c.stroke();
  }
}

function face(c, o) {
  c.fillStyle = SKIN;
  for (const dir of [-1, 1]) {
    c.beginPath();
    c.ellipse(dir * 60, 0, 11, 12, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.beginPath();
  c.ellipse(0, -2, 60, 53, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = CHEEK;
  for (const dir of [-1, 1]) {
    c.beginPath();
    c.arc(dir * 36, 7, 10, 0, Math.PI * 2);
    c.fill();
  }
  // lông mày bạc
  c.strokeStyle = BEARD;
  c.lineWidth = 5;
  c.lineCap = 'round';
  for (const dir of [-1, 1]) {
    c.beginPath();
    c.moveTo(dir * 11, -27);
    c.quadraticCurveTo(dir * 21, -33, dir * 33, -27);
    c.stroke();
  }
  // mắt: cười híp khi vui, còn lại là mắt tròn nhìn theo ngòi bút
  const lookX = Math.max(-1, Math.min(1, o.lookX));
  const lookY = Math.max(-1, Math.min(1, o.lookY));
  for (const dir of [-1, 1]) {
    const ex = dir * 21;
    if (o.happy) {
      c.strokeStyle = INK;
      c.lineWidth = 3.5;
      c.beginPath();
      c.arc(ex, -8, 9, 1.15 * Math.PI, 1.85 * Math.PI);
      c.stroke();
    } else {
      c.fillStyle = INK;
      c.beginPath();
      c.ellipse(ex + lookX * 2.5, -11 + lookY * 2.5, 4.5, 4.5 * (1 - o.blink * 0.9), 0, 0, Math.PI * 2);
      c.fill();
    }
  }
  // mũi
  c.strokeStyle = '#c8926a';
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(0, -6);
  c.quadraticCurveTo(5, 2, 0, 8);
  c.stroke();
  // chòm râu dê
  c.fillStyle = BEARD;
  c.beginPath();
  c.moveTo(-14, 28);
  c.lineTo(14, 28);
  c.quadraticCurveTo(10, 62, 0, 94);
  c.quadraticCurveTo(-10, 62, -14, 28);
  c.closePath();
  c.fill();
  // miệng chỉ lộ ra khi nói
  if (o.mouth > 0.05) {
    c.fillStyle = '#6d1410';
    c.beginPath();
    c.ellipse(0, 27, 7, 1 + o.mouth * 6, 0, 0, Math.PI * 2);
    c.fill();
  }
  // ria mép
  c.fillStyle = BEARD;
  c.beginPath();
  c.moveTo(-34, 22);
  c.quadraticCurveTo(-18, 9, -3, 13);
  c.quadraticCurveTo(0, 15, 3, 13);
  c.quadraticCurveTo(18, 9, 34, 22);
  c.quadraticCurveTo(14, 19, 0, 24);
  c.quadraticCurveTo(-14, 19, -34, 22);
  c.closePath();
  c.fill();
}

// o: { t, lookX, lookY, blink, mouth, happy, bow, sway }
export function drawOfficial(c, o) {
  const breathe = Math.sin(o.t * 1.6) * 1.5;
  const sway = o.sway ?? 0;
  torso(c, sway);
  c.save();
  c.translate(HEAD.x + sway + o.lookX * 2, HEAD.y + breathe + o.bow * 12);
  c.rotate(o.lookX * 0.03);
  // gật đầu: bóp nhẹ theo chiều dọc
  c.scale(1, 1 - o.bow * 0.06);
  face(c, o);
  hat(c);
  c.restore();
}

// Bàn nhỏ che phần dưới người, trên bàn có nghiên mực và tờ giấy nháp.
export function drawDesk(c) {
  c.fillStyle = COLOR.woodDark;
  c.beginPath();
  c.roundRect(74, 876, 19, 62, 3);
  c.roundRect(275, 876, 19, 62, 3);
  c.fill();
  c.fillStyle = COLOR.woodMid;
  c.fillRect(66, 860, 235, 18);
  c.fillStyle = COLOR.wood;
  c.strokeStyle = COLOR.woodDark;
  c.lineWidth = 3;
  c.beginPath();
  c.roundRect(52, 834, 265, 27, 7);
  c.fill();
  c.stroke();
  // nghiên mực
  c.fillStyle = '#2a1510';
  c.beginPath();
  c.roundRect(56, 821, 41, 13, 4);
  c.fill();
  c.fillStyle = '#08070a';
  c.beginPath();
  c.ellipse(76, 825, 12, 3, 0, 0, Math.PI * 2);
  c.fill();
  // tờ giấy nháp
  c.fillStyle = COLOR.cream;
  c.fillRect(212, 825, 101, 9);
  c.fillStyle = INK;
  for (const [x, w] of [[226, 22], [248, 12], [282, 22]]) c.fillRect(x, 828, w, 3);
}

// Ống tay dài từ vai tới bàn tay, viền vàng như áo.
function arm(c, from, to, bend) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = (from.x + to.x) / 2 + (-dy / len) * bend;
  const cy = (from.y + to.y) / 2 + (dx / len) * bend;
  const path = () => {
    c.beginPath();
    c.moveTo(from.x, from.y);
    c.quadraticCurveTo(cx, cy, to.x, to.y);
  };
  c.lineCap = 'round';
  c.strokeStyle = GOLD;
  c.lineWidth = 36;
  path();
  c.stroke();
  c.strokeStyle = NAVY;
  c.lineWidth = 30;
  path();
  c.stroke();
}

function fist(c, x, y) {
  c.fillStyle = SKIN;
  c.strokeStyle = '#d9a67c';
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(x, y, 13, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.beginPath();
  c.moveTo(x - 7, y - 2);
  c.quadraticCurveTo(x, y + 1, x + 7, y - 2);
  c.stroke();
}

// Ngòi bút nằm đúng điểm pen, cán nghiêng về bên trái để bàn tay không che dòng đang viết.
function brush(c, pen) {
  c.lineCap = 'round';
  c.strokeStyle = '#b57b38';
  c.lineWidth = 7;
  c.beginPath();
  c.moveTo(pen.x - 24, pen.y - 105);
  c.lineTo(pen.x - 7, pen.y - 32);
  c.stroke();
  c.fillStyle = '#17100a';
  c.beginPath();
  c.moveTo(pen.x - 13, pen.y - 32);
  c.quadraticCurveTo(pen.x - 13, pen.y - 12, pen.x, pen.y);
  c.quadraticCurveTo(pen.x + 4, pen.y - 16, pen.x - 1, pen.y - 34);
  c.closePath();
  c.fill();
}

// Bàn tay trái cầm con dấu đỏ; toạ độ là đỉnh con dấu.
function sealHand(c, hand) {
  c.fillStyle = '#7a1212';
  c.strokeStyle = '#3b0707';
  c.lineWidth = 2.5;
  c.beginPath();
  c.roundRect(hand.x - 20, hand.y, 40, 18, 4);
  c.fill();
  c.stroke();
  c.fillStyle = GOLD;
  c.fillRect(hand.x - 20, hand.y + 12, 40, 3);
  fist(c, hand.x, hand.y - 6);
}

// Tay trái lúc nghỉ phình ra ngoài theo dáng người, với xa thì vòng lên trên; tay phải cũng vòng lên để không đè dòng đang viết.
export function drawArms(c, pen, seal, press, pose) {
  const sway = pose.sway ?? 0;
  const hand = { x: pen.x - 11, y: pen.y - 47 + press * 1.5 };
  const left = { x: SHOULDER_L.x + sway, y: SHOULDER_L.y };
  const right = { x: SHOULDER_R.x + sway, y: SHOULDER_R.y };
  const reach = Math.max(0, Math.min(1, (Math.hypot(seal.x - left.x, seal.y - left.y) - 110) / 250));
  arm(c, left, { x: seal.x - 6, y: seal.y - 12 }, 40 - 110 * reach);
  const span = Math.hypot(hand.x - right.x, hand.y - right.y);
  arm(c, right, { x: hand.x - 7, y: hand.y - 8 }, -Math.min(70, span * 0.14));
  sealHand(c, seal);
  brush(c, pen);
  fist(c, hand.x, hand.y);
}

export function drawBubble(c, text, alpha) {
  if (alpha <= 0) return;
  c.save();
  c.globalAlpha = alpha;
  c.font = FONTS.script(48);
  const x = 51;
  const y = 400;
  const w = c.measureText(text).width + 60;
  c.fillStyle = COLOR.cream;
  c.beginPath();
  c.roundRect(x, y, w, 70, [28, 28, 28, 8]);
  c.fill();
  c.fillStyle = COLOR.darkText;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, x + w / 2, y + 36);
  c.restore();
}
