import { bibEl, drawBib } from './bib.js';
import { drawBuffalo, loadSprites } from './buffalo.js';
import { sfx, unlockAudio, audioReady, setVoice, sayBuffalo } from './audio.js';

const W = 1080;
const H = 1920;
const LANE_TOP = 482;
const LANE_H = 194;
const START_X = 300;
const END_X = 790;
const MIN_SCALE = 30; // 3 m: đầu vòng chạy được vài mét đã thấy trâu nhích rõ.

const stage = document.getElementById('stage');
const $ = (id) => document.getElementById(id);
const field = $('field');
const g = field.getContext('2d');

function fit() {
  const scale = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
}
addEventListener('resize', fit);
fit();

// Tên người xem chỉ được gắn bằng textContent, không bao giờ qua innerHTML.
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children) if (child != null) node.append(child);
  return node;
}
function avatar(who, className = 'ava') {
  const initial = () => el('i', { className, textContent: Array.from(String(who?.name ?? '').trim())[0]?.toUpperCase() ?? '' });
  if (who?.avatar) {
    const img = el('img', { className, src: who.avatar, alt: '', referrerPolicy: 'no-referrer' });
    img.onerror = () => img.replaceWith(initial());
    return img;
  }
  return initial();
}
const bibOf = (id, className) => bibEl(buffaloOf(id), className);
const meters = (units) => (units / 10).toFixed(1);
const short = (units) => (units % 10 ? meters(units) : String(units / 10));

// ---------- Trạng thái ----------
let buffaloes = [];
let scores = {};
let wins = {};
let leader = null;
let phase = 'race';
let paused = false;
let round = 1;
let endsAt = performance.now();
let result = null;
let resultMs = 12_000;
let teams = {};
let unitsComment = 1;
const lanes = new Map();
let shownScale = MIN_SCALE;
let groundShift = 0;
const dust = [];

const laneY = (i) => LANE_TOP + i * LANE_H;
const buffaloOf = (id) => buffaloes.find((n) => n.id === id);

// ---------- Nền ----------
const background = new Image();
let hasBackground = false;
background.onload = () => (hasBackground = true);
// Vị trí dải đất trong ảnh nền (npm run cat-anh đo và ghi vào nen.json).
let track = { top: 0.25, bottom: 0.76, color: '#6fbb1a' };

function paintBackground() {
  if (hasBackground) {
    // Phóng và dời ảnh để dải đất trùng đúng vùng làn đua, không đủ rộng thì phóng thêm cho kín ngang.
    const bh = background.naturalHeight;
    const bw = background.naturalWidth;
    const lanesH = LANE_H * buffaloes.length;
    const s = Math.max(lanesH / ((track.bottom - track.top) * bh), W / bw);
    const w = bw * s;
    const top = LANE_TOP + lanesH / 2 - ((track.top + track.bottom) / 2) * bh * s;
    g.fillStyle = track.color;
    g.fillRect(0, 0, W, H);
    g.drawImage(background, (W - w) / 2, top, w, bh * s);
  } else {
    let grad = g.createLinearGradient(0, 0, 0, 470);
    grad.addColorStop(0, '#7cc6f0');
    grad.addColorStop(1, '#cfeefa');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, 470);
    g.fillStyle = '#ffffff';
    for (const [x, y, r] of [[120, 120, 50], [190, 110, 40], [880, 90, 46], [950, 110, 36]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#7fb466';
    g.beginPath();
    g.moveTo(0, 470);
    g.bezierCurveTo(200, 320, 420, 330, 600, 420);
    g.bezierCurveTo(760, 330, 960, 300, 1080, 400);
    g.lineTo(1080, 470);
    g.fill();
    g.fillStyle = '#5e9c4c';
    g.beginPath();
    g.moveTo(0, 470);
    g.bezierCurveTo(260, 390, 520, 400, 760, 440);
    g.bezierCurveTo(900, 420, 1000, 410, 1080, 430);
    g.lineTo(1080, 480);
    g.lineTo(0, 480);
    g.fill();
    g.fillStyle = '#cf9f68';
    g.fillRect(0, 470, W, 1010);
    g.fillStyle = '#5aa043';
    g.fillRect(0, 1460, W, H - 1460);
  }
  // Làn đua vẽ bằng code để luôn khớp với thẻ tên và số mét.
  for (let i = 0; i < buffaloes.length; i++) {
    const y = laneY(i);
    g.fillStyle = i % 2 ? 'rgba(120, 72, 30, .10)' : 'rgba(255, 235, 200, .10)';
    g.fillRect(0, y, W, LANE_H);
    g.fillStyle = 'rgba(255, 255, 255, .75)';
    g.fillRect(0, y - 3, W, 6);
    // Sỏi và cỏ trôi về sau cho cảm giác đang chạy.
    g.fillStyle = 'rgba(110, 66, 28, .28)';
    for (let k = 0; k < 9; k++) {
      const px = (((k * 137 + i * 61 - groundShift) % 1240) + 1240) % 1240 - 80;
      const py = y + 34 + ((k * 53 + i * 29) % (LANE_H - 60));
      g.beginPath();
      g.ellipse(px, py, 9 + (k % 3) * 4, 4 + (k % 2) * 2, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const last = laneY(buffaloes.length);
  g.fillStyle = 'rgba(255, 255, 255, .75)';
  g.fillRect(0, last - 3, W, 6);
  // Vạch xuất phát
  g.save();
  g.setLineDash([16, 14]);
  g.strokeStyle = 'rgba(255, 255, 255, .8)';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(228, LANE_TOP);
  g.lineTo(228, last);
  g.stroke();
  g.restore();
}

// ---------- Trâu ----------
function spawnDust(x, y, n, strong) {
  for (let k = 0; k < n; k++) {
    dust.push({ x: x - 60 + Math.random() * 20, y: y - 6 - Math.random() * 16, vx: -60 - Math.random() * (strong ? 200 : 80), vy: -20 - Math.random() * 40, r: 8 + Math.random() * (strong ? 16 : 8), life: 0, max: 0.6 + Math.random() * 0.5 });
  }
  if (dust.length > 400) dust.splice(0, dust.length - 400);
}

function draw(now, dt) {
  const racing = phase === 'race' && !paused;
  const top = Math.max(0, ...buffaloes.map((n) => scores[n.id] ?? 0));
  const scale = Math.max(MIN_SCALE, top);
  shownScale += (scale - shownScale) * Math.min(1, dt * 3);
  const hurry = Math.max(0, ...buffaloes.map((n) => (lanes.get(n.id)?.boostUntil ?? 0) - now)) > 0;
  if (racing) groundShift += dt * (hurry ? 420 : 160);

  g.clearRect(0, 0, W, H);
  paintBackground();

  for (let i = dust.length - 1; i >= 0; i--) {
    const d = dust[i];
    d.life += dt;
    if (d.life > d.max) {
      dust.splice(i, 1);
      continue;
    }
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    const k = d.life / d.max;
    g.fillStyle = `rgba(222, 190, 140, ${0.55 * (1 - k)})`;
    g.beginPath();
    g.arc(d.x, d.y, d.r * (1 + k), 0, Math.PI * 2);
    g.fill();
  }

  buffaloes.forEach((n, i) => {
    const lane = lanes.get(n.id);
    const target = START_X + Math.min(1, (scores[n.id] ?? 0) / shownScale) * (END_X - START_X);
    lane.x += (target - lane.x) * Math.min(1, dt * 4);
    const boosted = lane.boostUntil > now;
    if (racing) lane.phase += dt * (boosted ? 5 : 2.2);
    const ground = laneY(i) + LANE_H - 20;
    let pose = 'run';
    if (phase === 'result') pose = result?.winner === n.id ? 'happy' : 'sad';
    else if (paused) pose = 'stand';
    if (racing && boosted && Math.random() < dt * 30) spawnDust(lane.x, ground, 1, true);
    if (pose === 'happy') lane.phase += dt * 2;
    const hop = pose === 'happy' ? -Math.abs(Math.sin(lane.phase * Math.PI)) * 26 : 0;
    // Bóng dưới chân
    g.fillStyle = 'rgba(70, 40, 10, .22)';
    g.beginPath();
    g.ellipse(lane.x, ground + 2, 86, 14, 0, 0, Math.PI * 2);
    g.fill();
    const back = drawBuffalo(g, { x: lane.x, y: ground + hop, buffalo: n, pose, frame: Math.floor(lane.phase * 4), phase: lane.phase });
    drawBib(g, back.backX, back.backY, n, now / 1000 + i);
    if (leader === n.id && phase === 'race') {
      g.font = '44px "Segoe UI Emoji", sans-serif';
      g.textAlign = 'center';
      g.fillText('👑', back.backX + 94, back.backY - 6 + Math.sin(now / 250) * 4);
    }
    lane.head = { x: lane.x + 70, y: ground - 150 };
  });
}

let lastFrame = performance.now();
let lastSecond = -1;
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  draw(now, dt);
  tickClock(now);
  requestAnimationFrame(frame);
}

// ---------- Đồng hồ ----------
function tickClock(now) {
  const left = paused ? pausedLeft : Math.max(0, endsAt - now);
  const sec = Math.ceil(left / 1000);
  if (phase === 'race') {
    $('time').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    $('clock').classList.toggle('hurry', sec <= 10 && !paused);
    $('clock').classList.remove('done');
    if (sec !== lastSecond && sec <= 10 && sec > 0 && !paused) sfx.tick(sec <= 3);
  } else {
    $('time').textContent = '0:00';
    $('clock').classList.remove('hurry');
    $('clock').classList.add('done');
    if (resultPage && resultPageAt(left) !== resultPage) showResult(resultPageAt(left));
    const next = $('result').querySelector('.next b');
    if (next) next.textContent = String(Math.max(1, sec));
  }
  lastSecond = sec;
}
let pausedLeft = 0;
function setClock(left) {
  pausedLeft = left;
  endsAt = performance.now() + left;
}

// ---------- Đầu trang và làn ----------
function renderWins(bumped) {
  const order = [...buffaloes].sort((a, b) => (wins[b.id] ?? 0) - (wins[a.id] ?? 0));
  const best = wins[order[0]?.id] ?? 0;
  $('wins-list').replaceChildren(
    ...order.map((n) => el('li', { className: `${best > 0 && wins[n.id] === best ? 'first' : ''} ${bumped === n.id ? 'bump' : ''}` }, bibEl(n), el('span', { textContent: String(wins[n.id] ?? 0) }))),
  );
  if (bumped) setTimeout(() => $('wins-list').querySelector('.bump')?.classList.remove('bump'), 600);
  $('round').textContent = `VÒNG ${round}`;
}

function buildLanes() {
  $('lanes').replaceChildren();
  lanes.clear();
  buffaloes.forEach((n, i) => {
    const rank = el('div', { className: 'rank' });
    const faces = el('span', { className: 'faces' });
    const count = el('span', { className: 'cnt' });
    const crowd = el('div', { className: 'crowd' }, faces, count);
    const tag = el('div', { className: 'tag' }, el('div', { className: 'top' }, bibEl(n), rank), crowd);
    tag.style.top = `${laneY(i) + (LANE_H - 148) / 2}px`;
    const value = el('span');
    const meter = el('div', { className: 'meter' }, value, el('small', { textContent: 'm' }));
    meter.style.top = `${laneY(i) + (LANE_H - 74) / 2}px`;
    $('lanes').append(tag, meter);
    lanes.set(n.id, { x: START_X, phase: i * 0.37, boostUntil: 0, rank, meter, value, faces, count, crowdKey: '', head: { x: START_X, y: laneY(i) } });
  });
  renderCrowd();
}

// Hàng cổ vũ trên thẻ làn: ảnh đại diện 3 người trong đội vừa tương tác gần nhất và số người đã chọn trâu đó.
function renderCrowd() {
  for (const n of buffaloes) {
    const lane = lanes.get(n.id);
    const team = teams[n.id] ?? { count: 0, recent: [] };
    const key = JSON.stringify(team);
    if (!lane || key === lane.crowdKey) continue;
    const grew = team.count > (lane.shownCount ?? team.count);
    lane.crowdKey = key;
    lane.shownCount = team.count;
    lane.faces.replaceChildren(...team.recent.slice(0, 3).map((who) => avatar(who, 'ava')));
    lane.count.textContent = `👥${team.count}`;
    if (grew) {
      lane.count.classList.remove('bump');
      void lane.count.offsetWidth;
      lane.count.classList.add('bump');
    }
  }
}

function renderScores(bumped) {
  const order = [...buffaloes].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0) || (a.id === leader ? -1 : b.id === leader ? 1 : 0));
  order.forEach((n, i) => {
    const lane = lanes.get(n.id);
    lane.rank.textContent = `#${i + 1}`;
    lane.rank.className = `rank ${i === 0 && scores[n.id] > 0 ? 'r1' : ''}`;
    lane.value.textContent = meters(scores[n.id] ?? 0);
    lane.meter.classList.toggle('lead', leader === n.id);
  });
  if (bumped) {
    const meter = lanes.get(bumped)?.meter;
    meter?.classList.remove('bump');
    void meter?.offsetWidth;
    meter?.classList.add('bump');
  }
}

function buildPanel() {
  $('cards').replaceChildren(
    ...buffaloes.map((n) =>
      el('div', { className: 'gcard', id: `card-${n.id}` }, bibEl(n), el('img', { className: 'gift', src: n.gift?.icon ?? '', alt: '' }), el('div', { className: 'plus', textContent: `+${short(unitsGift)}m` })),
    ),
  );
  showHow();
}
let unitsGift = 10;
let unitsLike = 1;
let likesPerStep = 30;

// Dòng hướng dẫn đổi qua lại: "💬 1 2 3 4 5 PICK" (comment số để chọn trâu) và "❤️ TAP x30 +0.1m".
function howFrames() {
  const pick = [el('span', { className: 'bubble', textContent: '💬' }), el('span', { className: 'bibs' }, ...buffaloes.map((n) => bibEl(n))), el('b', { textContent: 'CHỌN TRÂU' })];
  if (unitsComment) pick.push(el('em', { textContent: `+${short(unitsComment)}m` }));
  const frames = [pick];
  if (unitsLike) frames.push([el('span', { className: 'bubble', textContent: '❤️' }), el('b', { textContent: `THẢ ${likesPerStep} TIM` }), el('em', { textContent: `+${short(unitsLike)}m` })]);
  return frames;
}
let howIndex = 0;
function showHow() {
  const frames = howFrames();
  howIndex %= frames.length;
  $('how').replaceChildren(el('div', {}, ...frames[howIndex]));
}
setInterval(() => {
  if (!buffaloes.length) return;
  $('how').classList.add('swap');
  setTimeout(() => {
    howIndex++;
    showHow();
    $('how').classList.remove('swap');
  }, 250);
}, 3000);

// ---------- Phản hồi khi có người tiếp sức ----------
let tickerHold = 0;
function showTicker(msg) {
  const now = performance.now();
  const gift = msg.kind === 'gift';
  if (!gift && now < tickerHold) return;
  tickerHold = now + (gift ? 1800 : 400);
  const parts = [avatar(msg.who), el('span', { className: 'name', textContent: msg.who.name }), el('span', { className: 'arrow', textContent: '➜' }), bibOf(msg.buffalo)];
  if (gift && msg.icon) parts.push(el('img', { className: 'gift', src: msg.icon, alt: '' }));
  if (msg.kind === 'like' || msg.type === 'like') parts.push(el('span', { textContent: '❤️' }));
  const label = { pick: msg.joined ? 'VÀO ĐỘI!' : '✔', like: `x${msg.count}` }[msg.type] ?? `+${short(msg.units)}m`;
  parts.push(el('em', { textContent: label }));
  $('ticker').replaceChildren(el('div', { className: 'tick' }, ...parts));
}

const lastFloat = new Map();
function floatText(lane, text, big) {
  const node = el('div', { className: `float ${big ? 'big' : ''}`, textContent: text });
  node.style.left = `${lane.head.x + (Math.random() * 40 - 20)}px`;
  node.style.top = `${lane.head.y}px`;
  $('fx').append(node);
  setTimeout(() => node.remove(), 1200);
}

// Tim bay lên từ trâu được thả tim, mỗi làn tối đa ~7 tim mỗi giây.
const lastHeart = new Map();
function heart(lane, id) {
  const now = performance.now();
  if (now - (lastHeart.get(id) ?? 0) < 140) return;
  lastHeart.set(id, now);
  const node = el('div', { className: 'heart', textContent: '❤️' });
  node.style.left = `${lane.x - 40 + Math.random() * 80}px`;
  node.style.top = `${lane.head.y + 60}px`;
  node.style.setProperty('--dx', `${Math.round(Math.random() * 80 - 40)}px`);
  $('fx').append(node);
  setTimeout(() => node.remove(), 1300);
}

// Người mới vào đội: ảnh đại diện bay từ dải tên xuống hàng cổ vũ của làn, trên trâu hiện "Tên · VÀO ĐỘI!".
// Nhiều người vào cùng lúc thì mỗi 250 ms chỉ diễn một người để màn hình không rối (hàng cổ vũ vẫn cập nhật đủ).
let lastJoin = 0;
function joinFx(msg) {
  const lane = lanes.get(msg.buffalo);
  const now = performance.now();
  if (!lane || now - lastJoin < 250) return;
  lastJoin = now;
  const i = buffaloes.findIndex((n) => n.id === msg.buffalo);
  const fly = avatar(msg.who, 'ava joiner');
  const from = { x: 540, y: 434 };
  const to = { x: 46, y: laneY(i) + (LANE_H - 148) / 2 + 104 };
  fly.style.left = `${from.x}px`;
  fly.style.top = `${from.y}px`;
  $('fx').append(fly);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fly.style.transform = `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(.6)`;
  }));
  setTimeout(() => fly.remove(), 900);
  const pop = el('div', { className: 'pop join' }, avatar(msg.who), el('span', { className: 'name', textContent: msg.who.name }), el('em', { textContent: 'VÀO ĐỘI!' }));
  pop.style.left = `${Math.min(760, Math.max(330, lane.x))}px`;
  pop.style.top = `${lane.head.y + 20}px`;
  $('fx').querySelectorAll(`.pop[data-n="${msg.buffalo}"]`).forEach((p) => p.remove());
  pop.dataset.n = msg.buffalo;
  $('fx').append(pop);
  setTimeout(() => pop.remove(), 2300);
  sfx.join();
}

function giftFlight(msg, lane) {
  const card = $(`card-${msg.buffalo}`);
  if (card) {
    card.classList.remove('hit');
    void card.offsetWidth;
    card.classList.add('hit');
  }
  if (msg.icon) {
    const fly = el('img', { className: 'flyer', src: msg.icon, alt: '' });
    const i = buffaloes.findIndex((n) => n.id === msg.buffalo);
    const fromX = 22 + 16 + (i + 0.5) * (1036 - 32) / buffaloes.length;
    fly.style.left = `${fromX}px`;
    fly.style.top = '1660px';
    $('fx').append(fly);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fly.style.transform = `translate(${lane.head.x - fromX}px, ${lane.head.y + 40 - 1660}px) scale(.7)`;
      fly.style.opacity = '0';
    }));
    setTimeout(() => fly.remove(), 1000);
  }
  const pop = el('div', { className: 'pop' }, avatar(msg.who), el('span', { className: 'name', textContent: msg.who.name }));
  if (msg.count > 1) pop.append(el('em', { textContent: `x${msg.count}` }));
  pop.style.left = `${Math.min(760, Math.max(250, lane.x))}px`;
  pop.style.top = `${lane.head.y - 30}px`;
  $('fx').querySelectorAll(`.pop[data-n="${msg.buffalo}"]`).forEach((p) => p.remove());
  pop.dataset.n = msg.buffalo;
  $('fx').append(pop);
  setTimeout(() => pop.remove(), 2300);
}

function onBoost(msg) {
  const lane = lanes.get(msg.buffalo);
  if (!lane) return;
  const prevLeader = leader;
  applyBoard(msg);
  renderScores(msg.buffalo);
  showTicker(msg);
  const now = performance.now();
  // Quà lúc công bố hay tạm dừng vẫn được đọc số trâu, dù số mét để dành cho vòng sau.
  if (msg.kind === 'gift') sayBuffalo(msg.buffalo);
  if (msg.banked) return;
  lane.boostUntil = Math.max(lane.boostUntil, now + (msg.kind === 'gift' ? 1600 : 500));
  if (msg.kind === 'gift') {
    floatText(lane, `+${short(msg.units)}m`, true);
    giftFlight(msg, lane);
    spawnDust(lane.x, lane.head.y + 150, 14, true);
    sfx.gift(msg.units >= 100);
  } else {
    if (msg.kind === 'like') heart(lane, msg.buffalo);
    // Tương tác dồn dập: mỗi làn hiện "+0.1" tối đa 4 lần mỗi giây.
    if (now - (lastFloat.get(msg.buffalo) ?? 0) > 250) {
      lastFloat.set(msg.buffalo, now);
      floatText(lane, `+${short(msg.units)}`, false);
    }
    sfx.step();
  }
  if (leader && leader !== prevLeader && phase === 'race') sfx.lead();
}

// ---------- Vòng mới, kết quả ----------
function banner(text) {
  const b = $('banner');
  b.hidden = true;
  void b.offsetWidth;
  b.textContent = text;
  b.hidden = false;
  clearTimeout(banner.timer);
  banner.timer = setTimeout(() => (b.hidden = true), 1500);
}

// Bảng kết quả có 2 trang: nửa đầu thời gian công bố là trâu thắng + bục vinh danh,
// nửa sau là bảng vàng cả buổi live (nếu đã có người tiếp sức).
let resultPage = null;
function resultPageAt(left) {
  return result?.session?.length && left <= resultMs / 2 ? 'hall' : 'win';
}

function podiumEl(list) {
  const medals = ['🥇', '🥈', '🥉'];
  // Bục kiểu Olympic: hạng 2 bên trái, hạng 1 ở giữa cao nhất, hạng 3 bên phải.
  const order = [1, 0, 2].filter((k) => list[k]);
  return el(
    'div',
    { className: 'podium' },
    ...order.map((k) =>
      el('div', { className: `step s${k + 1}` }, el('span', { className: 'medal', textContent: medals[k] }), avatar(list[k]), el('span', { className: 'name', textContent: list[k].name }), el('em', { textContent: `+${short(list[k].units)}m` })),
    ),
  );
}

function showResult(page = resultPageAt(paused ? pausedLeft : endsAt - performance.now())) {
  const box = $('result');
  if (phase !== 'result' || !result) {
    box.hidden = true;
    resultPage = null;
    return;
  }
  resultPage = page;
  const parts = [];
  const winner = buffaloOf(result.winner);
  if (page === 'hall') {
    parts.push(
      el('div', { className: 'hall-title', textContent: '🏅 BẢNG VÀNG BUỔI LIVE' }),
      el('ol', { className: 'hall' }, ...result.session.map((p, k) => el('li', {}, el('b', { textContent: String(k + 1) }), avatar(p), el('span', { className: 'name', textContent: p.name }), el('em', { textContent: `${short(p.units)}m` })))),
    );
  } else if (winner) {
    // Trâu thắng nhảy mừng ngay trong bảng kết quả (làn đua bị bảng che).
    const hero = el('canvas', { className: 'hero', width: 460, height: 320 });
    drawBuffalo(hero.getContext('2d'), { x: 230, y: 312, buffalo: winner, pose: 'happy', frame: 0, phase: 0.25, size: 1.9 });
    const fans = result.team ? ` · 👥 ${result.team} NGƯỜI CỔ VŨ` : '';
    parts.push(
      el('div', { className: 'stage' }, el('span', { className: 'trophy', textContent: '🏆' }), hero),
      el('div', { className: 'who' }, bibEl(winner), el('span', { textContent: winner.name })),
      el('div', { className: 'wins', textContent: 'VỀ NHẤT!' }),
      el('div', { className: 'meters', textContent: `${meters(scores[winner.id] ?? 0)}m${fans}` }),
    );
    const podium = result.podium ?? (result.top ? [result.top] : []);
    if (podium.length) parts.push(podiumEl(podium));
  } else {
    parts.push(el('div', { className: 'empty', textContent: '🐃💤' }));
  }
  parts.push(el('div', { className: 'next' }, 'VÒNG MỚI SAU ', el('b', { textContent: String(Math.max(1, Math.ceil((endsAt - performance.now()) / 1000))) }), ' GIÂY'));
  box.replaceChildren(...parts);
  box.classList.toggle('hall-mode', page === 'hall');
  box.hidden = false;
}

function applyBoard(msg) {
  if (msg.scores) scores = msg.scores;
  if (msg.wins) wins = msg.wins;
  if ('leader' in msg) leader = msg.leader;
  if (msg.round) round = msg.round;
  if (msg.teams) {
    teams = msg.teams;
    renderCrowd();
  }
}

const handlers = {
  snapshot(msg) {
    const r = msg.race;
    buffaloes = r.buffaloes;
    unitsComment = r.units.comment;
    unitsLike = r.units.like;
    likesPerStep = r.units.likesPerStep;
    unitsGift = r.units.gift;
    phase = r.phase;
    paused = r.paused;
    result = r.result;
    resultMs = r.resultMs ?? resultMs;
    applyBoard(r);
    setClock(r.left);
    loadSprites(msg.sprites, buffaloes);
    setVoice(msg.voice);
    if (msg.sprites.includes('nen.png')) {
      fetch('/chibi/nen.json').then((r) => (r.ok ? r.json() : null)).then((t) => t && (track = { ...track, ...t })).catch(() => {}).finally(() => (background.src = '/chibi/nen.png'));
    }
    $('title').textContent = msg.title || 'ĐUA TRÂU';
    buildLanes();
    buildPanel();
    renderWins();
    renderScores();
    showResult();
    $('paused').hidden = !paused;
    handlers.status(msg.status);
  },
  status(s) {
    $('status').textContent = s.connected ? '' : s.text;
    $('status').hidden = s.connected;
  },
  boost: onBoost,
  // Tim chưa đủ để trâu đi: chỉ hiện tim bay trên trâu và người vừa thả tim.
  like(msg) {
    applyBoard(msg);
    const lane = lanes.get(msg.buffalo);
    if (!lane || phase !== 'race' || paused) return;
    heart(lane, msg.buffalo);
    showTicker(msg);
  },
  pick(msg) {
    applyBoard(msg);
    showTicker(msg);
    if (msg.joined) joinFx(msg);
  },
  voice: setVoice,
  round(msg) {
    phase = 'race';
    result = null;
    applyBoard(msg);
    setClock(msg.left);
    for (const lane of lanes.values()) lane.x = START_X;
    shownScale = MIN_SCALE;
    renderScores();
    renderWins();
    showResult();
    if (!paused) {
      banner('CHẠY!');
      sfx.start();
    }
  },
  result(msg) {
    phase = 'result';
    result = msg;
    applyBoard(msg);
    setClock(msg.left);
    renderScores();
    renderWins(msg.winner);
    showResult();
    if (msg.winner) sfx.win();
  },
  pause(msg) {
    paused = msg.paused;
    phase = msg.phase;
    applyBoard(msg);
    setClock(msg.left);
    renderScores();
    $('paused').hidden = !paused;
  },
};

const events = new EventSource('/events');
events.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  handlers[msg.type]?.(msg);
};
events.onerror = () => handlers.status({ connected: false, text: 'Mất kết nối server game, đang thử lại...' });

// Trình duyệt chặn âm thanh tới khi người dùng bấm (cửa sổ start.bat đã cho phép tự phát).
if (!audioReady()) {
  $('sound-hint').hidden = false;
  addEventListener('pointerdown', () => unlockAudio()?.then(() => ($('sound-hint').hidden = audioReady())), { once: false });
}
requestAnimationFrame(frame);
