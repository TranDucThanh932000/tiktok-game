// Trang game: nhận lịch viết từ server rồi vẽ theo. Mở lại trang giữa chừng vẫn đúng chỗ vì mọi thứ tính từ thời điểm tờ sớ bắt đầu.
import { W, H, FONTS, COLOR, PAPER, buildBackground, buildPaper, drawRoller, drawCounter, drawQueue, drawRecent, heartPath } from './scene.js';
import { drawOfficial, drawDesk, drawArms, drawBubble, HEAD, PEN_REST, SEAL_REST } from './official.js';
import { Sheet } from './paper.js';
import { sfx, say, cutSpeech, wake, onAudioState, setBrush, isSpeaking } from './audio.js';

const canvas = document.getElementById('game');
const c = canvas.getContext('2d');
const stage = document.getElementById('stage');
function fit() {
  const scale = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
}
addEventListener('resize', fit);
fit();
onAudioState((ok) => (document.getElementById('sound-hint').hidden = ok));

// Nền có chữ nên phải đợi font trước khi vẽ.
await Promise.all(
  ['700 40px "Dancing Script"', '700 40px "Playfair Display"', 'italic 700 40px "Playfair Display"', '500 40px "Be Vietnam Pro"', '700 40px "Be Vietnam Pro"'].map((font) => document.fonts.load(font, 'Aaăđệữ')),
);

const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// ---------- Ảnh ----------
const images = new Map();
function loadImage(url) {
  if (!url || images.has(url)) return;
  const image = new Image();
  image.decoding = 'async';
  images.set(url, image);
  image.src = url;
  if (images.size > 400) images.delete(images.keys().next().value);
}
const readyImage = (url) => {
  if (!url) return null;
  loadImage(url);
  const image = images.get(url);
  return image?.complete && image.naturalWidth ? image : null;
};

// ---------- Trạng thái ----------
let bg = buildBackground();
const paperBase = buildPaper();
let guide = null;
const queue = { total: 0, written: 0, next: [] };
let recent = [];
let shown = null; // tờ đang nằm trên giấy, đứng đầu danh sách "Vừa ghi danh"
let current = new Sheet();
let leaving = null; // tờ cũ đang cuộn lên
let job = null;
let idleSince = performance.now();
let idleDrawn = false;

const pen = { x: PEN_REST.x, y: PEN_REST.y };
const seal = { x: SEAL_REST.x, y: SEAL_REST.y };
const anim = { lookX: 0, lookY: 0, blink: 0, nextBlink: 2, bow: 0, shake: 0, mouth: 0, bubble: null, bubbleUntil: 0, happyUntil: 0, flash: 0 };
const particles = [];
const chips = [];

const giftIcons = new Map();
function buildScreen() {
  bg = buildBackground(guide, giftIcons);
  for (const { icon } of guide.tiers) {
    if (icon === 'heart' || giftIcons.has(icon)) continue;
    const image = new Image();
    giftIcons.set(icon, image);
    image.onload = () => (bg = buildBackground(guide, giftIcons));
    image.src = icon;
  }
}

function recentRows(writing) {
  const done = recent.filter((row) => row.no !== shown?.no).map((row) => ({ ...row, pill: 'Đã ghi' }));
  return shown ? [{ ...shown, live: true, pill: writing ? 'Đang viết' : 'Đang hiện' }, ...done] : done;
}

// ---------- Hiệu ứng ----------
function burst(kind, count, x, y, spread) {
  for (let i = 0; i < count && particles.length < 260; i++) {
    const coin = kind === 'coin';
    particles.push({
      kind,
      x: x + (Math.random() - 0.5) * spread,
      y: y + (Math.random() - 0.5) * (coin ? 120 : spread * 0.4),
      vx: (Math.random() - 0.5) * (kind === 'spark' ? 520 : 160),
      vy: kind === 'spark' ? -160 - Math.random() * 420 : kind === 'heart' ? -140 - Math.random() * 120 : 60 + Math.random() * 180,
      g: kind === 'spark' ? 620 : kind === 'heart' ? -120 : 240,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 8,
      size: kind === 'spark' ? 8 + Math.random() * 12 : 13 + Math.random() * 13,
      life: 0,
      max: kind === 'spark' ? 0.9 + Math.random() * 0.5 : 1.8 + Math.random() * 1.2,
    });
  }
}

function drawParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.max) {
      particles.splice(i, 1);
      continue;
    }
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    c.save();
    c.globalAlpha = Math.min(1, (p.max - p.life) * 2.5);
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    if (p.kind === 'coin') {
      c.fillStyle = '#ffd24a';
      c.strokeStyle = '#a06b10';
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(0, 0, p.size, p.size * (0.45 + 0.55 * Math.abs(Math.sin(p.rot * 2))), 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    } else if (p.kind === 'petal') {
      c.fillStyle = '#e63c52';
      c.beginPath();
      c.ellipse(0, 0, p.size, p.size * 0.52, 0, 0, Math.PI * 2);
      c.fill();
    } else if (p.kind === 'heart') {
      c.fillStyle = '#ff4d6d';
      heartPath(c, 0, 0, p.size * 1.6);
      c.fill();
    } else {
      c.fillStyle = '#ffe69a';
      c.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const r = k % 2 ? p.size * 0.25 : p.size;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      c.fill();
    }
    c.restore();
  }
}

// Dòng thông báo ngay dưới tờ giấy: ai làm gì cũng thấy tên mình hiện lên liền. Dòng có xu nổi bật bằng nền vàng.
const TIER_WORD = { avatar: 'Tên + ảnh', wish: 'Chúc lành', thanks: 'Đa tạ' };
function chipText(msg) {
  switch (msg.kind) {
    case 'likes':
      return { text: `${msg.name}  ${msg.have}/${msg.need} tim`, heart: true };
    case 'earned':
      return { text: `${msg.name} đủ ${msg.need} tim, vào hàng chờ!`, heart: true };
    case 'gift':
      return { text: `${msg.name} vào hàng chờ · ${TIER_WORD[msg.tier] ?? ''}`, gold: true };
    case 'upgraded':
      return { text: `${msg.name} lên hạng · ${TIER_WORD[msg.tier] ?? ''}`, gold: true };
    case 'follow':
      return { text: `${msg.name} đã theo dõi, đa tạ!` };
    case 'share':
      return { text: `${msg.name} đã chia sẻ, đa tạ!` };
    default:
      return { text: `${msg.name} ghé công đường` };
  }
}

function addChip(msg) {
  const chip = chipText(msg);
  // Đông người thì bỏ dòng đếm tim cũ, giữ dòng quan trọng hơn.
  if (chips.length >= 2) {
    const drop = chips.findIndex((row) => row.minor);
    chips.splice(drop >= 0 ? drop : 0, 1);
  }
  chips.push({ ...chip, minor: msg.kind === 'likes', born: performance.now() });
}

function drawChips(now) {
  // Hai dòng nằm gọn giữa trục giấy dưới và bốn thẻ.
  const bottom = 1132;
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  c.font = FONTS.sans(27, 700);
  for (let i = chips.length - 1; i >= 0; i--) {
    const chip = chips[i];
    const age = (now - chip.born) / 1000;
    if (age > 3.4) {
      chips.splice(i, 1);
      continue;
    }
    const row = chips.length - 1 - i;
    const y = bottom - row * 44 + (1 - easeOut(clamp01(age * 5))) * 16;
    const alpha = Math.min(1, age * 7, (3.4 - age) * 3);
    const lead = chip.heart ? 52 : 22;
    const textWidth = Math.min(980 - lead - 22, c.measureText(chip.text).width);
    const width = lead + textWidth + 22;
    const x = (W - width) / 2;
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = chip.gold ? COLOR.gold : COLOR.panel;
    c.strokeStyle = COLOR.gold;
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(x, y - 20, width, 40, 20);
    c.fill();
    c.stroke();
    c.fillStyle = chip.gold ? COLOR.darkText : COLOR.cream;
    c.fillText(chip.text, x + lead + textWidth / 2, y + 1, textWidth);
    if (chip.heart) {
      c.fillStyle = '#ff6b85';
      heartPath(c, x + 30, y + 3, 24);
      c.fill();
    }
    c.restore();
  }
}

// ---------- Viết sớ ----------
function startJob(next, serverNow) {
  if (job?.current >= 0) current.finish(job.current);
  leaving = current;
  current = new Sheet();
  idleDrawn = false;
  shown = { no: next.no, name: next.name, avatar: next.hasAvatar ? next.avatar : '', tier: next.tier };
  loadImage(next.avatar);
  current.begin(next, readyImage);
  job = {
    ...next,
    localStart: performance.now() - Math.max(0, serverNow - next.startedAt),
    current: -1,
    stamped: false,
  };
}

// Đi qua các chặng theo thời gian. Mở trang giữa chừng thì tua nhanh các chặng đã qua trong một khung hình.
function stepJob(now) {
  if (!job) return { pen: null };
  const elapsed = now - job.localStart;
  let at = 0;
  let index = job.stages.length - 1;
  let p = 1;
  for (let i = 0; i < job.stages.length; i++) {
    if (elapsed < at + job.stages[i].ms) {
      index = i;
      p = clamp01((elapsed - at) / job.stages[i].ms);
      break;
    }
    at += job.stages[i].ms;
  }
  const fresh = (i) => elapsed - job.stages.slice(0, i).reduce((sum, row) => sum + row.ms, 0) < 300;
  while (job.current < index) {
    if (job.current >= 0) current.finish(job.current);
    job.current++;
    enterStage(job.stages[job.current], fresh(job.current));
  }
  const kind = job.stages[index].kind;
  if (kind === 'seal') return { seal: p };
  if (kind === 'sheet' || kind === 'hold') {
    if (kind === 'sheet') return { sheet: p };
    return { hold: p };
  }
  // chặng viết: dành chút đầu để nhấc bút đi tới chỗ viết
  const travel = Math.min(0.22, 240 / job.stages[index].ms);
  if (p < travel) return { pen: firstPoint(index) };
  const position = current.update(index, (p - travel) / (1 - travel));
  return { pen: position, writing: Boolean(position) };
}

function firstPoint(index) {
  const row = current.stages[index];
  const path = row?.kind === 'avatar' ? row.ring : row?.path;
  return path?.points[0] ?? null;
}

function enterStage(stageInfo, isFresh) {
  if (stageInfo.kind !== 'hold') return;
  if (!job.stamped) stampNow(false);
  anim.bubble = job.bubble;
  anim.bubbleUntil = performance.now() + Math.min(stageInfo.ms, 2600) + 300;
  anim.happyUntil = performance.now() + stageInfo.ms + 200;
  if (!isFresh) return;
  if (job.tier === 'thanks') {
    sfx.gong();
    anim.flash = 1;
    burst('coin', 26, W / 2, PAPER.y - 60, W);
    burst('petal', 24, W / 2, PAPER.y - 60, W);
    burst('spark', 34, PAPER.x + current.stampAt().x, PAPER.y + current.stampAt().y, 120);
  } else if (job.tier === 'wish') {
    sfx.chime();
    burst('spark', 34, PAPER.x + current.stampAt().x, PAPER.y + current.stampAt().y, 100);
    burst('petal', 14, W / 2, PAPER.y - 60, W);
  } else if (job.tier === 'avatar') {
    burst('spark', 16, PAPER.x + current.stampAt().x, PAPER.y + current.stampAt().y, 90);
  }
}

function stampNow(withEffect) {
  job.stamped = true;
  current.applyStamp();
  if (withEffect) {
    anim.shake = 1;
    sfx.seal();
  }
}

// Tay cầm dấu: đưa tới, dập xuống, nhấc lên, trả về chỗ cũ.
function sealPosition(p) {
  const stamp = current.stampAt();
  const target = { x: PAPER.x + stamp.x, y: PAPER.y + stamp.y - 9 };
  if (p < 0.42) {
    const k = easeInOut(p / 0.42);
    return { x: SEAL_REST.x + (target.x - SEAL_REST.x) * k, y: SEAL_REST.y + (target.y - 45 - SEAL_REST.y) * k };
  }
  if (p < 0.55) return { x: target.x, y: target.y - 45 + 45 * easeOut((p - 0.42) / 0.13) };
  if (p < 0.72) return target;
  const k = easeInOut((p - 0.72) / 0.28);
  return { x: target.x + (SEAL_REST.x - target.x) * k, y: target.y + (SEAL_REST.y - target.y) * k };
}

// ---------- Vòng vẽ ----------
let lastFrame = performance.now();
let lastPen = { x: pen.x, y: pen.y };

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  const t = now / 1000;

  const step = stepJob(now);
  if (job && now - job.localStart >= job.total) {
    // chờ server mở tờ kế tiếp, tờ này giữ nguyên trên giấy
    if (job.current >= 0) current.finish(job.current);
    job = null;
    idleSince = now;
  }
  if (!job && guide && !idleDrawn && now - idleSince > 6000) {
    leaving = current;
    current = new Sheet();
    current.drawIdle(guide);
    idleDrawn = true;
    shown = null;
    sheetAnim = now;
  }

  // ngòi bút: đi theo đường viết, hết viết thì về chỗ nghỉ trên bàn
  const penTarget = step.pen ? { x: PAPER.x + step.pen.x, y: PAPER.y + step.pen.y } : { x: PEN_REST.x, y: PEN_REST.y };
  const follow = 1 - Math.exp(-dt * (step.writing ? 34 : 9));
  pen.x += (penTarget.x - pen.x) * follow;
  pen.y += (penTarget.y - pen.y) * follow;
  const speed = Math.hypot(pen.x - lastPen.x, pen.y - lastPen.y) / Math.max(dt, 0.001);
  lastPen = { x: pen.x, y: pen.y };
  setBrush(step.writing ? clamp01(speed / 1400) : 0);

  // đóng dấu
  let sealHand = { x: SEAL_REST.x, y: SEAL_REST.y };
  if (step.seal !== undefined) {
    sealHand = sealPosition(step.seal);
    if (step.seal >= 0.55 && !job.stamped) stampNow(true);
  }
  const sealFollow = 1 - Math.exp(-dt * 26);
  seal.x += (sealHand.x - seal.x) * sealFollow;
  seal.y += (sealHand.y - seal.y) * sealFollow;

  // nét mặt
  const happy = now < anim.happyUntil;
  const lookSource = step.seal !== undefined ? seal : pen;
  anim.lookX += ((lookSource.x - HEAD.x) / 380 - anim.lookX) * (1 - Math.exp(-dt * 8));
  anim.lookY += ((lookSource.y - HEAD.y) / 420 - anim.lookY) * (1 - Math.exp(-dt * 8));
  if (t > anim.nextBlink) {
    anim.blink = 1;
    anim.nextBlink = t + 2 + Math.random() * 3.5;
  }
  anim.blink = Math.max(0, anim.blink - dt * 7);
  anim.shake = Math.max(0, anim.shake - dt * 4);
  anim.flash = Math.max(0, anim.flash - dt * 0.7);
  const talking = isSpeaking() || (happy && now < anim.bubbleUntil - 900);
  const mouthGoal = talking ? 0.35 + 0.65 * Math.abs(Math.sin(t * 11)) : 0;
  anim.mouth += (mouthGoal - anim.mouth) * (1 - Math.exp(-dt * 22));
  // vái: 10 xu vái hai lần, 5 xu một lần, còn lại gật nhẹ
  let bow = 0;
  if (step.hold !== undefined && job) {
    const times = job.tier === 'thanks' ? 2 : 1;
    const strength = job.tier === 'thanks' ? 1 : job.tier === 'wish' ? 0.7 : 0.35;
    bow = strength * Math.sin(clamp01(step.hold * 1.2) * Math.PI * times) ** 2;
  }
  anim.bow += (bow - anim.bow) * (1 - Math.exp(-dt * 14));

  // ---------- vẽ ----------
  c.drawImage(bg, 0, 0);
  drawCounter(c, queue.written);
  drawQueue(c, queue);
  const pose = {
    t,
    lookX: anim.lookX,
    lookY: anim.lookY,
    blink: anim.blink,
    mouth: anim.mouth,
    happy,
    bow: anim.bow,
    sway: Math.sin(t * 0.9) * 1 + (step.writing ? Math.sin(t * 6) * 1.5 : 0),
  };
  drawOfficial(c, pose);
  drawDesk(c);

  const shakeX = anim.shake ? Math.sin(now / 16) * anim.shake * 7 : 0;
  const shakeY = anim.shake ? Math.cos(now / 19) * anim.shake * 9 : 0;
  c.save();
  c.translate(shakeX, shakeY);
  c.drawImage(paperBase, PAPER.x, PAPER.y);
  if (anim.flash) {
    c.fillStyle = `rgba(255, 215, 90, ${anim.flash * 0.4})`;
    c.fillRect(PAPER.x, PAPER.y, PAPER.w, PAPER.h);
  }
  // Tờ cũ cuộn lên trục, tờ mới trải ra.
  c.save();
  c.beginPath();
  c.rect(PAPER.x, PAPER.y, PAPER.w, PAPER.h);
  c.clip();
  const slide = sheetProgress(now, step);
  if (leaving && slide < 1) c.drawImage(leaving.canvas, PAPER.x, PAPER.y - easeInOut(slide) * PAPER.h);
  else leaving = null;
  c.globalAlpha = slide;
  c.drawImage(current.canvas, PAPER.x, PAPER.y);
  if (current.overlay) {
    c.globalAlpha = clamp01(current.overlay.alpha);
    c.drawImage(current.overlay.image, PAPER.x, PAPER.y);
  }
  c.restore();
  drawRoller(c, PAPER.y - 20);
  drawRoller(c, PAPER.y + PAPER.h + 20);
  c.restore();

  drawRecent(c, recentRows(Boolean(job) && step.hold === undefined), readyImage);
  drawArms(c, pen, seal, step.writing ? Math.sin(t * 20) : 0, pose);
  drawParticles(dt);
  drawBubble(c, anim.bubble, clamp01((anim.bubbleUntil - now) / 300));
  drawChips(now);
}

// Tiến độ cuộn giấy (0..1): theo chặng trải giấy khi có tờ mới, theo đồng hồ riêng khi về tờ mời.
let sheetAnim = 0;
function sheetProgress(now, step) {
  if (step.sheet !== undefined) return step.sheet;
  if (sheetAnim) {
    const k = (now - sheetAnim) / 500;
    if (k < 1) return clamp01(k);
    sheetAnim = 0;
  }
  return 1;
}

// ---------- Server ----------
function applyQueue(msg) {
  queue.total = msg.total;
  queue.written = msg.written;
  queue.next = msg.next;
  msg.next.forEach((row) => loadImage(row.avatar));
}

function handle(msg) {
  switch (msg.type) {
    case 'snapshot':
      guide = msg.guide;
      buildScreen();
      applyQueue(msg);
      recent = msg.recent;
      recent.forEach((row) => loadImage(row.avatar));
      if (msg.job) startJob(msg.job, msg.serverNow);
      else if (!idleDrawn) {
        current.drawIdle(guide);
        idleDrawn = true;
      }
      break;
    case 'write':
      wake();
      if (msg.preempted) {
        cutSpeech();
        anim.bubbleUntil = 0;
        anim.happyUntil = 0;
      }
      startJob(msg.job, msg.serverNow);
      break;
    case 'done':
      recent = msg.recent;
      queue.written = msg.written;
      recent.forEach((row) => loadImage(row.avatar));
      break;
    case 'queue':
      applyQueue(msg);
      break;
    case 'chip':
      wake();
      addChip(msg);
      if (msg.kind !== 'likes' && msg.kind !== 'greet') sfx.tick();
      break;
    case 'heart':
      // Tim bay lên từ thẻ "Ghi tên".
      burst('heart', msg.n, 162 + Math.random() * 40 - 20, 1170, 40);
      break;
    case 'avatar':
      loadImage(msg.url);
      break;
    case 'say':
      wake();
      say(msg.ids, msg.first);
      break;
    default:
  }
}

new EventSource('/events').onmessage = (event) => handle(JSON.parse(event.data));
requestAnimationFrame(frame);
