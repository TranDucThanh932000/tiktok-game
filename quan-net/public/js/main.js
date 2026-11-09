import { itemSvg, momSvg, monitorSvg, ownerSvg, screenSvg, seatedSvg, standingSvg, stoolSvg } from './art.js';
import { loadSprites } from './sprites.js';
import { onAudioState, setTypists, sfx, speak, stopSpeech, wake } from './audio.js';

const W = 1080;
const H = 1920;
const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function restart(node, className) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

const stage = $('stage');
let scale = 1;
function fit() {
  scale = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
}
addEventListener('resize', fit);
fit();
onAudioState((running) => {
  $('sound-hint').hidden = running;
});

// ---------- Nhân vật: ảnh riêng nếu có, không thì hình vẽ sẵn ----------
let sprites = { khach: [], chuTiem: {}, me: {} };
const img = (pic, flip = false) => `<img src="${pic.src}" alt=""${flip ? ' class="flip"' : ''}>`;
const variant = (look) => (sprites.khach.length ? sprites.khach[look % sprites.khach.length] : null);
const seatedArt = (look) => (variant(look)?.ngoi ? img(variant(look).ngoi) : seatedSvg(look));
// view: dung (nhìn trước), sau (sau lưng), ngang (đi sang phải; flip là sang trái).
const standingArt = (look, { view = 'dung', flip = false, mood } = {}) => {
  const pic = variant(look)?.[view] ?? variant(look)?.dung;
  return pic ? img(pic, flip) : standingSvg(look, { mood });
};
const ownerArt = (mood) => (sprites.chuTiem[mood] ? img(sprites.chuTiem[mood]) : ownerSvg(mood));
const momArt = (view = 'dung') => (sprites.me[view] ? img(sprites.me[view]) : momSvg());

loadSprites().then((loaded) => {
  sprites = loaded;
  for (const cell of cells) if (cell) cell.whoKey = undefined;
  for (const cell of cells) if (cell) renderSeat(cell.index, cell.data);
  ownerMood = '';
  setOwner(currentMood);
  if (lastQueue) renderQueue(lastQueue, { rebuild: true });
});

// ---------- Phòng máy: hàng VIP sát quầy, các dãy máy thường gần dần về phía người xem ----------
const ROOM_TOP = 762;
const ROOM_BOTTOM = 1340;
const VIP_TOP = 634;
const DOOR_Y = 1530;
const cells = [];
let guide = null;

function buildRoom(seats, room) {
  const root = $('room');
  root.replaceChildren();
  cells.length = 0;
  const vips = seats.filter((seat) => seat.vip);
  const normal = seats.filter((seat) => !seat.vip);
  const mat = $('vip-mat');
  mat.hidden = !vips.length;
  if (vips.length) {
    const s = 0.8;
    const cw = Math.min(156, 640 / vips.length);
    const left = 372 - (cw * vips.length) / 2;
    Object.assign(mat.style, { left: `${left - 14}px`, width: `${cw * vips.length + 28}px` });
    addDesk(left, VIP_TOP, cw * vips.length, s, 4, true);
    vips.forEach((seat, i) => makeCell(seat, left + i * cw, VIP_TOP, cw, 160 * s, s, 5, true));
  }
  const rows = room.rows;
  const cols = room.cols;
  const base = Array.from({ length: rows }, (_, r) => 0.86 + (0.14 * r) / Math.max(1, rows - 1));
  const k = (ROOM_BOTTOM - ROOM_TOP) / (160 * base.reduce((sum, v) => sum + v, 0));
  let y = ROOM_TOP;
  for (let r = 0; r < rows; r++) {
    const s = base[r] * k;
    const rh = 160 * s;
    const cw = Math.min(170 * s, 1050 / cols);
    const left = (W - cw * cols) / 2;
    addDesk(left, y, cw * cols, s, 9 + r * 10, false);
    for (let c = 0; c < cols; c++) {
      const seat = normal[r * cols + c];
      if (seat) makeCell(seat, left + c * cw, y, cw, rh, s, 10 + r * 10, false);
    }
    y += rh;
  }
}

function addDesk(left, top, width, s, z, vip) {
  const desk = el('div', vip ? 'desk vip' : 'desk');
  Object.assign(desk.style, { left: `${left - 6}px`, top: `${top + 88 * s}px`, width: `${width + 12}px`, height: `${26 * s}px`, zIndex: z });
  $('room').append(desk);
}

function makeCell(seat, x, y, w, h, s, z, vip) {
  const root = el('div', 'pc empty');
  Object.assign(root.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, zIndex: z });
  const monitor = el('div', 'monitor');
  Object.assign(monitor.style, { top: `${24 * s}px`, width: `${100 * s}px`, height: `${76 * s}px` });
  const frame = el('div');
  frame.style.cssText = 'position:absolute;inset:0';
  const screen = el('div', 'screen');
  const no = el('b', 'no', seat.label);
  no.style.fontSize = `${Math.round(12 * s)}px`;
  monitor.append(frame, screen, no);
  const item = el('div', 'item');
  item.innerHTML = itemSvg();
  Object.assign(item.style, { left: `${Math.max(-6, w / 2 - 92 * s)}px`, top: `${66 * s}px`, width: `${46 * s}px`, height: `${34 * s}px` });
  const who = el('div', 'who');
  Object.assign(who.style, { top: `${72 * s}px`, width: `${Math.min(w * 0.88, 118 * s)}px`, height: `${100 * s}px` });
  // Mỗi máy gõ phím lệch nhịp nhau.
  who.style.setProperty('--d', `${(-Math.random()).toFixed(2)}s`);
  const zzz = el('b', 'zzz', 'z Z');
  Object.assign(zzz.style, { top: `${58 * s}px`, fontSize: `${Math.round(22 * s)}px` });
  const tag = el('div', 'tag');
  Object.assign(tag.style, { height: `${32 * s}px`, fontSize: `${Math.round(16 * s)}px` });
  const line = el('div', 'line');
  const nm = el('span', 'nm');
  const tm = el('span', 'tm');
  tm.style.fontSize = `${Math.round(14 * s)}px`;
  line.append(nm, tm);
  const bar = el('i', 'bar');
  const fill = el('b');
  bar.append(fill);
  tag.append(line, bar);
  const mark = el('div', 'mark');
  Object.assign(mark.style, { right: '2px', top: `${32 * s}px` });
  root.append(monitor, item, who, zzz, tag, mark);
  $('room').append(root);
  cells[seat.index] = { index: seat.index, root, frame, screen, who, nm, tm, fill, mark, x, y, w, h, s, vip, data: null, whoKey: undefined, screenKind: '', rig: null, arriving: false, buzzing: false };
  setRig(cells[seat.index], vip);
  setScreen(cells[seat.index], 'idle');
  setWho(cells[seat.index], null);
}

const fmtMin = (m) => (m >= 1000 ? `${Math.floor(m / 60)}g` : `${m}'`);
const fmtLong = (m) => (m >= 600 ? `${Math.round(m / 60).toLocaleString('vi-VN')} giờ` : `${m} phút`);
const screenOf = (code) => guide?.games.find((game) => game.code === code)?.screen ?? 'kiemhiep';

function setWho(cell, key, look) {
  if (cell.whoKey === key) return;
  cell.whoKey = key;
  cell.who.innerHTML = key ? seatedArt(look) : stoolSvg();
}

function setScreen(cell, kind) {
  if (cell.buzzing || cell.screenKind === kind) return;
  cell.screenKind = kind;
  cell.screen.innerHTML = screenSvg(kind);
}

function setRig(cell, rig) {
  if (cell.rig === rig) return;
  cell.rig = rig;
  cell.root.classList.toggle('rig', rig);
  cell.frame.innerHTML = monitorSvg(rig);
}

let golden = null;
let dark = null;

function renderSeat(index, player) {
  const cell = cells[index];
  if (!cell) return;
  cell.data = player;
  const root = cell.root;
  root.classList.toggle('empty', !player);
  root.classList.toggle('dark', Boolean(dark));
  if (!player) {
    setWho(cell, null);
    setRig(cell, cell.vip);
    setScreen(cell, 'idle');
    for (const name of ['out', 'boost', 'vip', 'boss', 'boosted', 'mi', 'gold']) root.classList.remove(name);
    return;
  }
  if (!cell.arriving) setWho(cell, player.key, player.look);
  cell.nm.textContent = player.name;
  cell.tm.textContent = player.out ? 'HẾT GIỜ' : `còn ${fmtMin(player.minutes)}`;
  const ratio = player.out ? 0 : Math.min(1, player.minutes / 60);
  cell.fill.style.transform = `scaleX(${ratio})`;
  cell.fill.className = ratio < 0.25 ? 'low' : ratio < 0.5 ? 'mid' : '';
  root.classList.toggle('out', player.out);
  root.classList.toggle('boost', player.boost);
  root.classList.toggle('vip', player.vip);
  root.classList.toggle('boss', player.boss);
  root.classList.toggle('mi', player.item === 'mi');
  root.classList.toggle('boosted', player.rate > 1);
  root.classList.toggle('gold', Boolean(golden && player.game === golden.code));
  cell.mark.textContent = `x${player.rate}`;
  setRig(cell, cell.vip || player.rig);
  setScreen(cell, player.out ? 'out' : screenOf(player.game));
}

function updateCounts() {
  const total = cells.filter(Boolean).length;
  const free = cells.filter((cell) => cell && !cell.data).length;
  $('free').textContent = `${free}/${total}`;
  setTypists(cells.filter((cell) => cell?.data && !cell.data.out).length);
}

// ---------- Vị trí trên sân khấu ----------
const seatFeet = (index) => {
  const c = cells[index];
  return { x: c.x + c.w / 2, y: c.y + c.h + 8 * c.s, s: c.s };
};
const seatTop = (index) => ({ x: cells[index].x + cells[index].w / 2, y: cells[index].y + 6 });
const seatMid = (index) => ({ x: cells[index].x + cells[index].w / 2, y: cells[index].y + cells[index].h * 0.55 });

function stagePoint(node) {
  const r = node.getBoundingClientRect();
  const s = stage.getBoundingClientRect();
  const k = s.width / W || 1;
  return { x: (r.left + r.width / 2 - s.left) / k, y: (r.top + r.height / 2 - s.top) / k };
}

// ---------- Người đi lại ----------
function walker(html, { mom = false } = {}) {
  const node = el('div', mom ? 'walker mom walking' : 'walker walking');
  const who = el('div', 'who');
  who.innerHTML = html;
  node.append(who);
  if (!mom) Object.assign(node.style, { width: '84px', height: '104px' });
  $('walkers').append(node);
  return node;
}

function walk(node, from, to, ms) {
  const w = node.offsetWidth || 84;
  const h = node.offsetHeight || 104;
  const tf = (p) => `translate(${p.x - w / 2}px, ${p.y - h}px) scale(${p.s})`;
  node.style.transform = tf(to);
  node.animate([{ transform: tf(from) }, { transform: tf(to) }], { duration: ms, easing: 'linear' });
  return later(ms);
}

const travel = (a, b) => clamp(Math.hypot(a.x - b.x, a.y - b.y) / 0.55, 250, 1700);

// Đi ngang thì quay nghiêng, đi lên thì quay lưng, đi xuống thì nhìn trước.
function viewFor(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return { view: 'ngang', flip: dx < 0 };
  return { view: dy < 0 ? 'sau' : 'dung', flip: false };
}

async function walkRoute(node, points, artFor) {
  for (let i = 1; i < points.length; i++) {
    node.firstChild.innerHTML = artFor(viewFor(points[i - 1], points[i]));
    await walk(node, points[i - 1], points[i], travel(points[i - 1], points[i]));
  }
}

// Đi ngang tới đúng cột rồi mới đi lên/xuống.
const route = (from, to) => (Math.abs(to.x - from.x) > 30 ? [from, { x: to.x, y: from.y, s: from.s }, to] : [from, to]);

function arrive(index, player, from) {
  const cell = cells[index];
  const end = seatFeet(index);
  let start = null;
  if (from === 'queue') {
    const waiter = waiterEls.get(player.key);
    if (waiter) {
      start = { ...waiterFeet(waiter), s: 1 };
      waiter.style.visibility = 'hidden';
    }
  } else if (typeof from === 'number' && cells[from]) start = seatFeet(from);
  start ??= { x: end.x + rand(-50, 50), y: DOOR_Y, s: 1.1 };
  cell.arriving = true;
  setWho(cell, null);
  const node = walker('');
  walkRoute(node, route(start, end), (pose) => standingArt(player.look, pose)).then(() => {
    node.remove();
    cell.arriving = false;
    if (cell.data?.key !== player.key) return;
    setWho(cell, player.key, player.look);
    restart(cell.root, 'popin');
  });
}

function depart(index, data, reason) {
  const start = seatFeet(index);
  const sad = reason === 'kick' || reason === 'mom' || reason === 'idle';
  const node = walker('');
  const end = { x: start.x + rand(-40, 40), y: DOOR_Y + 80, s: 1.15 };
  const ms = travel(start, end);
  node.animate([{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: ms });
  walkRoute(node, [start, end], (pose) => standingArt(data.look, { ...pose, mood: sad ? 'sad' : 'smile' })).then(() => node.remove());
}

// ---------- Hàng chờ ----------
const waiterEls = new Map();
const SLOTS = 9;
let lastQueue = null;
const slotLeft = (i) => 78 + i * 82;
const waiterFeet = (node) => ({ x: parseFloat(node.style.left) + 42, y: 1346 + 112 - 2 - 20 });

function renderQueue(queue, { rebuild = false } = {}) {
  lastQueue = queue;
  const shown = queue.list.slice(0, SLOTS);
  const keep = new Set(shown.map((p) => p.key));
  for (const [key, node] of waiterEls) {
    if (rebuild || !keep.has(key)) {
      node.remove();
      waiterEls.delete(key);
    }
  }
  shown.forEach((p, i) => {
    let node = waiterEls.get(p.key);
    if (!node) {
      node = el('div', rebuild ? 'waiter' : 'waiter new');
      const who = el('div', 'who');
      who.innerHTML = standingArt(p.look);
      node.append(who, el('span', 'nm', p.name));
      $('waiters').append(node);
      waiterEls.set(p.key, node);
    }
    node.classList.toggle('paid', p.paid);
    node.style.left = `${slotLeft(i)}px`;
  });
  const extra = queue.total - shown.length;
  $('more').hidden = extra <= 0;
  $('more').textContent = `+${extra} đang chờ`;
  $('waiting').textContent = queue.total;
}

// ---------- Bảng cày net ----------
let board = [];
let page = 0;
function renderBoard() {
  const pages = Math.max(1, Math.ceil(board.length / 5));
  page %= pages;
  const rows = board.slice(page * 5, page * 5 + 5);
  const list = $('ranks');
  if (!rows.length) {
    list.replaceChildren(el('li', 'empty', `Chưa ai cày. Gõ ${guide?.words.join ?? 'ngoi'} để vào máy!`));
  } else {
    list.replaceChildren(
      ...rows.map((p, i) => {
        const rank = page * 5 + i + 1;
        const li = el('li', `r${rank}`);
        li.append(el('span', 'rk', rank), el('span', 'nm', p.name), el('span', 'sc', `${p.score.toLocaleString('vi-VN')}'`));
        return li;
      }),
    );
  }
  $('pages').replaceChildren(...(pages > 1 ? Array.from({ length: pages }, (_, i) => el('i', i === page ? 'on' : '')) : []));
}
setInterval(() => {
  if (board.length > 5) {
    page++;
    renderBoard();
  }
}, 6000);

// ---------- Bảng dịch vụ, cú pháp, bảng hiệu ----------
function renderGuide() {
  $('menu-list').replaceChildren(
    ...guide.gifts.map((gift) => {
      const row = el('div');
      row.dataset.coins = gift.coins;
      row.append(Object.assign(new Image(), { src: gift.icon, alt: '' }), el('span', '', gift.label));
      return row;
    }),
  );
  const w = guide.words;
  const pair = (code, text) => {
    const row = el('div');
    row.append(el('code', '', code), text);
    return row;
  };
  const games = el('div', 'games');
  games.append('Đổi game:', ...guide.games.map((game) => el('code', '', game.code)));
  const free = el('div', 'free', `❤️ ${guide.likes} tim = +1 phút · Follow +${guide.follow}' · Share +${guide.share}'`);
  $('guide-list').replaceChildren(
    pair(w.join, 'vào máy'),
    pair(w.check, 'xem giờ'),
    pair(w.leave, 'về nhà'),
    pair(w.buzz, 'rung máy bạn'),
    pair(w.rage, 'đập phím'),
    pair(w.hide, 'trốn mẹ'),
    games,
    free,
  );
}

let boss = null;
// Chữ dài thì thu nhỏ lại cho vừa bảng hiệu.
function fitTitle(max) {
  const title = $('title');
  let size = max;
  title.style.fontSize = `${size}px`;
  while (title.scrollWidth > 810 && size > 30) title.style.fontSize = `${(size -= 2)}px`;
}
function renderSign() {
  const sign = $('sign');
  sign.classList.toggle('boss', Boolean(boss));
  if (boss) {
    const chars = Array.from(boss.name.toUpperCase());
    $('title').textContent = `NET ${chars.length > 18 ? `${chars.slice(0, 17).join('')}…` : chars.join('')}`;
    $('subtitle').textContent = 'CHỦ TIỆM MỚI · MỜI CẢ XÓM CHƠI';
    fitTitle(58);
    return;
  }
  const title = guide?.title ?? 'TIỆM NET';
  // Một chữ chập chờn như bảng neon cũ.
  const chars = Array.from(title);
  const i = chars.findLastIndex((ch) => ch !== ' ');
  $('title').replaceChildren(chars.slice(0, i).join(''), el('span', 'flick', chars[i] ?? ''), chars.slice(i + 1).join(''));
  $('subtitle').textContent = guide?.subtitle ?? '';
  fitTitle(66);
}

// ---------- Đồng hồ tiệm, trời ngoài cửa sổ ----------
let clockInfo = null;
let clockOffset = 0;
const SKIES = [
  [5, '#0b1640', '#29407a'],
  [7, '#f6a96b', '#ffd9a0'],
  [17, '#4fb3ff', '#cdeeff'],
  [19, '#ff8a65', '#5c4b8a'],
  [24, '#0b1640', '#29407a'],
];
function tickClock() {
  if (!clockInfo) return;
  const now = Date.now() + clockOffset;
  const minutes = (((clockInfo.start + Math.floor((now - clockInfo.openedAt) / clockInfo.msPerMinute)) % 1440) + 1440) % 1440;
  const h = Math.floor(minutes / 60);
  $('clock').textContent = `${String(h).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  const [, top, bottom] = SKIES.find(([until]) => h < until);
  const win = $('window');
  win.style.setProperty('--sky-top', top);
  win.style.setProperty('--sky-bottom', bottom);
  win.classList.toggle('day', h >= 7 && h < 17);
}
setInterval(tickClock, 500);

// ---------- Cô Tám nói ----------
let ownerMood = '';
let currentMood = 'thuong';
function setOwner(mood) {
  currentMood = mood;
  if (ownerMood === mood) return;
  ownerMood = mood;
  const owner = $('owner');
  owner.innerHTML = ownerArt(mood);
  owner.className = '';
  if (mood !== 'thuong') restart(owner, mood);
}
setOwner('thuong');

let bubbleTimer = 0;
function say(msg) {
  const bubble = $('bubble');
  if (msg.cut) stopSpeech();
  clearTimeout(bubbleTimer);
  if (!msg.text) {
    bubble.hidden = true;
    setOwner('thuong');
    return;
  }
  bubble.textContent = msg.text;
  bubble.hidden = false;
  restart(bubble, 'show');
  setOwner(msg.mood ?? 'thuong');
  bubbleTimer = setTimeout(() => {
    bubble.hidden = true;
    setOwner('thuong');
  }, Math.max(2600, (msg.ms ?? 0) + 700));
  if (msg.clips?.length) speak(msg);
}

// ---------- Thông báo ----------
const toasts = [];
let toastTimer = 0;
function toast(parts, { icon = '', info = false, first = false } = {}) {
  const item = { parts, icon, info };
  if (first) toasts.unshift(item);
  else if (toasts.length < 4) toasts.push(item);
  else toasts[toasts.length - 1] = item;
  if (!toastTimer) nextToast();
}
function nextToast() {
  const item = toasts.shift();
  const box = $('toast');
  if (!item) {
    box.hidden = true;
    toastTimer = 0;
    return;
  }
  box.className = item.info ? 'info' : '';
  box.replaceChildren();
  if (item.icon) box.append(Object.assign(new Image(), { src: item.icon, alt: '' }));
  for (const part of item.parts) box.append(typeof part === 'string' ? part : el('b', '', part.b));
  box.hidden = false;
  restart(box, 'show');
  toastTimer = setTimeout(nextToast, 2600);
}

const peeks = [];
let peekTimer = 0;
function peek(name) {
  if (peeks.length >= 3) peeks.shift();
  peeks.push(name);
  if (!peekTimer) nextPeek();
}
function nextPeek() {
  const name = peeks.shift();
  const box = $('peek');
  if (!name) {
    box.hidden = true;
    peekTimer = 0;
    return;
  }
  box.replaceChildren(el('span', '', `👀 ${name}`), el('small', '', 'đang ngó vào...'));
  box.hidden = false;
  restart(box, 'show');
  peekTimer = setTimeout(nextPeek, 2600);
}

// ---------- Hiệu ứng ----------
const fx = $('fx');
function floatAt(point, text, { cls = '', ms = 1600, rise = 80 } = {}) {
  const node = el('div', `float ${cls}`, text);
  Object.assign(node.style, { left: `${point.x}px`, top: `${point.y}px` });
  fx.append(node);
  node.animate(
    [
      { transform: 'translate(-50%, 0) scale(.6)', opacity: 0 },
      { transform: 'translate(-50%, -16px) scale(1.1)', opacity: 1, offset: 0.15 },
      { transform: `translate(-50%, -${rise}px) scale(1)`, opacity: 0 },
    ],
    { duration: ms, easing: 'ease-out' },
  );
  setTimeout(() => node.remove(), ms);
}
function sparks({ x, y }, count = 14) {
  const colors = ['#ffe066', '#ff6f91', '#7bdff2', '#ffffff', '#b2f7a1'];
  for (let i = 0; i < count; i++) {
    const node = el('i', 'spark');
    Object.assign(node.style, { left: `${x}px`, top: `${y}px`, background: colors[i % colors.length] });
    fx.append(node);
    const angle = Math.random() * Math.PI * 2;
    const reach = 40 + Math.random() * 100;
    const ms = 700 + Math.random() * 500;
    node.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${Math.cos(angle) * reach}px, ${Math.sin(angle) * reach + 40}px) rotate(300deg)`, opacity: 0 }], { duration: ms, easing: 'cubic-bezier(.15,.7,.4,1)' });
    setTimeout(() => node.remove(), ms);
  }
}
function flyIcon(src, from, to) {
  const node = Object.assign(new Image(), { className: 'flyer', src, alt: '' });
  Object.assign(node.style, { left: `${to.x - 42}px`, top: `${to.y - 42}px` });
  fx.append(node);
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  node.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 70}px) scale(1.3)`, opacity: 1, offset: 0.5 },
      { transform: 'translate(0,0) scale(.8)', opacity: 1, offset: 0.92 },
      { transform: 'translate(0,0) scale(1.4)', opacity: 0 },
    ],
    { duration: 950, easing: 'ease-in-out' },
  );
  setTimeout(() => node.remove(), 950);
  return later(900);
}
function keycaps({ x, y }) {
  for (let i = 0; i < 8; i++) {
    const node = el('i', 'key');
    Object.assign(node.style, { left: `${x}px`, top: `${y}px` });
    fx.append(node);
    const dx = rand(-90, 90);
    const ms = rand(600, 1000);
    node.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${dx * 0.6}px, ${rand(-120, -60)}px) rotate(${dx * 3}deg)`, opacity: 1, offset: 0.45 }, { transform: `translate(${dx}px, ${rand(20, 60)}px) rotate(${dx * 6}deg)`, opacity: 0 }], { duration: ms, easing: 'ease-out' });
    setTimeout(() => node.remove(), ms);
  }
}

function giftTarget(msg) {
  if (msg.seat !== null && cells[msg.seat]) return seatMid(msg.seat);
  const waiter = waiterEls.get(msg.key);
  if (waiter) {
    const feet = waiterFeet(waiter);
    return { x: feet.x, y: feet.y - 60 };
  }
  return { x: 540, y: 1380 };
}

// ---------- Mẹ tới kiếm ----------
let momScene = null;
function momSay(text) {
  if (!momScene?.node) return;
  momScene.node.querySelector('.say')?.remove();
  if (!text) return;
  momScene.node.append(el('div', 'say', text));
}
function momLeave() {
  const scene = momScene;
  if (!scene) return;
  momScene = null;
  clearInterval(scene.timer);
  scene.badge?.remove();
  const cell = cells[scene.seat];
  cell?.root.classList.remove('hunted');
  if (!scene.node) return;
  const node = scene.node;
  const end = { x: scene.at.x + rand(-30, 30), y: DOOR_Y + 120, s: 1.15 };
  node.firstChild.innerHTML = momArt('dung');
  node.classList.add('walking');
  node.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 1500 });
  walk(node, scene.at, end, 1500).then(() => node.remove());
}
function startMom(mom, { instant = false } = {}) {
  momLeave();
  const cell = cells[mom.seat];
  if (!cell) return;
  const feet = seatFeet(mom.seat);
  const at = { x: Math.min(W - 60, feet.x + cell.w * 0.5), y: feet.y + 6, s: cell.s };
  const node = walker(momArt(instant ? 'dung' : 'sau'), { mom: true });
  const badge = el('div', 'hunt');
  Object.assign(badge.style, { left: `${cell.x + cell.w / 2}px`, top: `${cell.y + 46 * cell.s}px` });
  fx.append(badge);
  cell.root.classList.add('hunted');
  const scene = { seat: mom.seat, key: mom.key, node, at, badge, timer: 0 };
  momScene = scene;
  const tick = () => {
    const secs = Math.max(0, Math.ceil((mom.endsAt - Date.now() - clockOffset) / 1000));
    badge.textContent = `⏰ ${secs} · gõ ${guide?.words.hide ?? 'tron'}`;
  };
  tick();
  scene.timer = setInterval(tick, 250);
  const ms = instant ? 0 : 1500;
  (instant ? Promise.resolve() : walk(node, { x: at.x + 30, y: DOOR_Y, s: 1.1 }, at, ms)).then(() => {
    if (momScene !== scene) return;
    if (instant) node.style.transform = `translate(${at.x - node.offsetWidth / 2}px, ${at.y - node.offsetHeight}px) scale(${at.s})`;
    node.firstChild.innerHTML = momArt('dung');
    node.classList.remove('walking');
    momSay(mom.text);
  });
}

// ---------- Nhận tin từ server ----------
function applyGame(game) {
  $('walkers').replaceChildren();
  if (momScene) {
    clearInterval(momScene.timer);
    momScene.badge?.remove();
    momScene = null;
  }
  golden = game.golden;
  dark = game.blackout;
  boss = game.boss;
  for (const seat of game.seats) renderSeat(seat.index, seat.player);
  renderQueue(game.queue, { rebuild: true });
  board = game.board;
  renderBoard();
  clockInfo = game.clock;
  clockOffset = game.clock.now - Date.now();
  tickClock();
  renderGolden();
  $('dark').hidden = !dark;
  renderSign();
  if (game.mom?.phase === 'come') startMom(game.mom, { instant: true });
  updateCounts();
}

function renderGolden() {
  const box = $('golden');
  $('stats').style.visibility = golden ? 'hidden' : '';
  box.hidden = !golden;
  if (!golden) return;
  const secs = Math.max(0, Math.ceil((golden.endsAt - Date.now() - clockOffset) / 1000));
  box.replaceChildren(`⭐ GIỜ VÀNG ${golden.label.toUpperCase()} x${guide?.rates.golden ?? 2} · gõ`, el('code', '', golden.code), el('small', '', `${secs}s`));
}
setInterval(() => golden && renderGolden(), 1000);

const REASON_ICON = { like: '❤️', comment: '💬', follow: '➕', share: '↗️', hide: '🙈' };

const handlers = {
  snapshot(msg) {
    guide = msg.guide;
    renderGuide();
    buildRoom(msg.game.seats, guide.room);
    applyGame(msg.game);
    $('viewers').textContent = msg.viewers ?? 0;
  },
  'snapshot-game'(msg) {
    applyGame(msg.game);
  },
  seat(msg) {
    renderSeat(msg.seat, msg.player);
    if (msg.from === 'restore') return;
    arrive(msg.seat, msg.player, msg.from);
    if (typeof msg.from !== 'number') sfx.sit();
    updateCounts();
  },
  leave(msg) {
    const cell = cells[msg.seat];
    const data = cell?.data;
    if (data && msg.reason !== 'move') depart(msg.seat, data, msg.reason);
    if (cell) cell.arriving = false;
    renderSeat(msg.seat, null);
    if (msg.reason === 'kick') {
      sfx.kick();
      floatAt(seatTop(msg.seat), '👋 nhường máy', { cls: 'red' });
    } else if (msg.reason === 'home' || msg.reason === 'idle') sfx.leave();
    updateCounts();
  },
  times(msg) {
    const seen = new Set();
    for (const [index, player] of msg.list) {
      seen.add(index);
      renderSeat(index, player);
    }
    for (const cell of cells) if (cell?.data && !seen.has(cell.index)) renderSeat(cell.index, null);
    updateCounts();
  },
  expire() {
    sfx.expire();
  },
  revive(msg) {
    if (cells[msg.seat]) floatAt(seatTop(msg.seat), '⚡ chơi tiếp');
  },
  queue: (msg) => renderQueue(msg),
  board(msg) {
    board = msg.board;
    renderBoard();
  },
  topup(msg) {
    const icon = REASON_ICON[msg.reason] ?? '+';
    if (msg.seat !== null && cells[msg.seat]) {
      floatAt(seatTop(msg.seat), `${icon} +${msg.minutes}'`, { ms: 1300, rise: 60 });
      if (msg.reason !== 'comment') sfx.pop();
    } else if (msg.reason === 'follow' || msg.reason === 'share') {
      toast([{ b: msg.name }, ` ${msg.reason === 'follow' ? 'follow' : 'share'} · +${msg.minutes} phút vào tài khoản`], { info: true });
    }
  },
  gift(msg) {
    wake();
    const big = msg.coins * msg.count >= 100;
    if (big) sfx.fanfare();
    else sfx.coin();
    const row = $('menu-list').querySelector(`[data-coins="${msg.tierCoins}"]`);
    const from = row ? stagePoint(row) : { x: 480, y: 500 };
    const to = giftTarget(msg);
    flyIcon(msg.icon, from, to).then(() => {
      floatAt(to, `+${fmtLong(msg.minutes)}`, { cls: 'big', ms: 1800 });
      sparks(to, big ? 30 : 14);
    });
    if (msg.tierCoins >= 5 || msg.count >= 5 || msg.seat === null) {
      const times = msg.count > 1 ? ` x${msg.count}` : '';
      toast([{ b: msg.name }, ` · ${msg.label}${times} · +${fmtLong(msg.minutes)}`], { icon: msg.icon, first: big });
    }
  },
  treat(msg) {
    toast([{ b: msg.name }, ` BAO NET CẢ TIỆM · mỗi máy +${msg.minutes}'`], { first: true });
    msg.seats.forEach((index, i) => {
      if (!cells[index]) return;
      setTimeout(() => {
        floatAt(seatTop(index), `+${msg.minutes}'`, { cls: 'big' });
        sparks(seatMid(index), 8);
      }, i * 60);
    });
  },
  boss(msg) {
    boss = msg.boss;
    renderSign();
    if (boss) {
      sfx.fanfare();
      toast([{ b: boss.name }, ' MUA LẠI TIỆM! 👑'], { first: true });
      sparks({ x: 540, y: 230 }, 40);
    }
  },
  game(msg) {
    const cell = cells[msg.seat];
    if (!cell?.data) return;
    cell.data.game = msg.code;
    renderSeat(msg.seat, cell.data);
    const label = guide?.games.find((game) => game.code === msg.code)?.label ?? msg.code;
    floatAt(seatTop(msg.seat), `🎮 ${label}`, { ms: 1300, rise: 50 });
  },
  check(msg) {
    if (msg.seat !== null && cells[msg.seat]) {
      floatAt(seatTop(msg.seat), msg.out ? '⏰ HẾT GIỜ' : `⏰ còn ${msg.minutes} phút`, { cls: 'note', ms: 2600, rise: 30 });
      return;
    }
    const waiter = waiterEls.get(msg.key);
    if (waiter && msg.pos) {
      const feet = waiterFeet(waiter);
      floatAt({ x: feet.x, y: feet.y - 110 }, `chờ thứ ${msg.pos}`, { cls: 'note', ms: 2600, rise: 30 });
    }
  },
  buzz(msg) {
    const cell = cells[msg.to];
    if (!cell) return;
    sfx.buzz();
    if (cells[msg.from]) floatAt(seatTop(msg.from), '📳', { ms: 1000 });
    restart(cell.root, 'shake');
    setScreen(cell, 'buzz');
    cell.buzzing = true;
    floatAt(seatTop(msg.to), 'BUZZ!!!', { cls: 'big red', ms: 1500 });
    setTimeout(() => {
      cell.buzzing = false;
      cell.root.classList.remove('shake');
      renderSeat(cell.index, cell.data);
    }, 1600);
  },
  rage(msg) {
    const cell = cells[msg.seat];
    if (!cell) return;
    sfx.rage();
    restart(cell.root, 'rage');
    keycaps(seatMid(msg.seat));
    floatAt(seatTop(msg.seat), '💢 ĐẬP PHÍM!', { cls: 'red', ms: 1500 });
    setTimeout(() => cell.root.classList.remove('rage'), 900);
  },
  mom(msg) {
    const mom = msg.mom;
    if (!mom) {
      momLeave();
      return;
    }
    if (mom.phase === 'come') {
      sfx.mom();
      startMom(mom);
      return;
    }
    const scene = momScene;
    if (!scene) return;
    clearInterval(scene.timer);
    scene.badge?.remove();
    scene.badge = null;
    const cell = cells[scene.seat];
    cell?.root.classList.remove('hunted');
    if (mom.phase === 'hide') {
      sfx.hide();
      cell?.root.classList.add('hiding');
      momSay(mom.text);
      setTimeout(() => {
        momLeave();
        setTimeout(() => {
          cell?.root.classList.remove('hiding');
          if (cell?.data) floatAt(seatTop(scene.seat), '😜 trốn kịp!', { cls: 'big' });
        }, 900);
      }, 1800);
    } else if (mom.phase === 'drag') {
      sfx.drag();
      momSay('Về!!!');
      setTimeout(momLeave, 250);
    } else if (mom.phase === 'home') {
      momSay('Ngoan!');
      setTimeout(momLeave, 900);
    }
  },
  golden(msg) {
    golden = msg.golden;
    renderGolden();
    for (const cell of cells) if (cell?.data) renderSeat(cell.index, cell.data);
    if (golden) sfx.golden();
  },
  blackout(msg) {
    dark = msg.blackout;
    $('dark').hidden = !dark;
    for (const cell of cells) if (cell) cell.root.classList.toggle('dark', Boolean(dark));
    if (dark) sfx.powerDown();
    else sfx.powerUp();
  },
  say,
  peek: (msg) => peek(msg.name),
  viewers(msg) {
    $('viewers').textContent = msg.count.toLocaleString('vi-VN');
  },
};

const events = new EventSource('/events');
events.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  handlers[msg.type]?.(msg);
};
