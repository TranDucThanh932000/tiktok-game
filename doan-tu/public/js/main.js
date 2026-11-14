import { KID, KF, TF, TEACHER, kidLook, kidFrame, teacherFrame } from './art.js';
import { sfx, wake, onAudioState, speak, stopSpeech } from './audio.js';

const W = 1080;
const H = 1920;
const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const stage = $('stage');
function fit() {
  const scale = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
}
addEventListener('resize', fit);
fit();

onAudioState((running) => {
  $('sound-hint').hidden = running;
});

// ---------- Lớp học: top bảng điểm ngồi theo thứ hạng, hàng đầu (sát bảng) là 8 bạn cao điểm nhất ----------
// Trong một hàng, hạng cao ngồi giữa, thấp dần ra hai bên.
const PER_ROW = 8;
const PER_BLOCK = PER_ROW / 2;
const COL_ORDER = [3, 4, 2, 5, 1, 6, 0, 7];
const SCALE_BACK = 0.8;
const SCALE_FRONT = 1.05;
const ROWS_TOP = 1080; // sàn gỗ của ảnh nền bắt đầu ở đây
const ROWS_BOTTOM = 1912;
const AISLE = 40;
const TITLES = ['Lớp trưởng', 'Lớp phó', 'Lớp phó'];
const GUIDE_SCALE = 0.84; // khớp #guide trong style.css
// Cỡ hình học sinh: hệ số so với ảnh gốc ở hàng có scale = 1.
const KID_SIZE = 0.8;
// Cửa lớp ở mép trái bục giảng; học sinh đi trên bục ở độ cao này rồi xuống lối giữa (x = 540).
const DOOR = { x: 34, y: 1052, s: 0.74 };
const AISLE_X = W / 2;

const seats = [];
const rows = [];
function buildClass(total) {
  const root = $('class');
  root.replaceChildren();
  seats.length = 0;
  rows.length = 0;
  for (const w of walkers.values()) w.node.remove();
  walkers.clear();
  const ROWS = Math.ceil(total / PER_ROW);
  const scales = Array.from({ length: ROWS }, (_, row) => SCALE_BACK + ((SCALE_FRONT - SCALE_BACK) * row) / Math.max(1, ROWS - 1));
  const baseH = (ROWS_BOTTOM - ROWS_TOP) / scales.reduce((sum, s) => sum + s, 0);
  let y = ROWS_TOP;
  for (let row = 0; row < ROWS; row++) {
    const s = scales[row];
    const rowH = baseH * s;
    const rowW = 1000 + ((1064 - 1000) * row) / Math.max(1, ROWS - 1);
    const cell = (rowW - AISLE) / PER_ROW;
    const left = (W - rowW) / 2;
    const z = row * 10 + 10;
    const plateH = Math.max(30, 34 * s);
    const front = row === 0;

    for (let block = 0; block < 2; block++) {
      const x = left + block * (cell * PER_BLOCK + AISLE);
      const desk = el('div', front ? 'desk front' : 'desk');
      Object.assign(desk.style, { left: `${x}px`, top: `${y + rowH * 0.44}px`, width: `${cell * PER_BLOCK}px`, height: `${rowH * 0.2}px`, zIndex: z });
      const bench = el('div', front ? 'bench front' : 'bench');
      Object.assign(bench.style, { left: `${x}px`, top: `${y + rowH - plateH + 2}px`, width: `${cell * PER_BLOCK}px`, height: `${plateH}px`, zIndex: z + 2 });
      root.append(desk, bench);
    }

    for (let k = 0; k < PER_ROW && seats.length < total; k++) {
      const col = COL_ORDER[k];
      const x = left + col * cell + (col >= PER_BLOCK ? AISLE : 0);
      const seat = el('div', 'seat ghost');
      Object.assign(seat.style, { left: `${x}px`, top: `${y}px`, width: `${cell}px`, height: `${rowH}px` });

      const look = (seats.length * 37 + 11) % 360;
      const d = KID_SIZE * s;
      const spriteW = KID.FW * d;
      const spriteH = KID.FH * d;
      const spriteBottom = plateH * 0.45;
      const sprite = el('div', 'sprite');
      Object.assign(sprite.style, { width: `${spriteW}px`, height: `${spriteH}px`, bottom: `${spriteBottom}px`, zIndex: z + 1 });
      const kid = el('i', 'kid');
      sprite.append(kid);

      const plate = el('div', 'plate');
      Object.assign(plate.style, { height: `${plateH}px`, fontSize: '20px', zIndex: z + 3 });
      const rank = el('b', 'rank');
      const name = el('span', 'name');
      plate.append(rank, name);
      const score = el('div', 'score');
      Object.assign(score.style, { right: '2px', bottom: `${plateH + 2}px`, fontSize: `${Math.round(22 * s)}px`, zIndex: z + 4 });

      // Đỉnh đầu lúc ngồi: hình ngồi cao khoảng 160/216 khung.
      const spriteTop = rowH - spriteBottom - 165 * d;
      const size = Math.round(46 * s);
      const cardCenter = Math.min(x + cell / 2 + spriteW * 0.42, W - size / 2 - 4) - x;
      const card = el('div', 'card');
      Object.assign(card.style, { width: `${size}px`, height: `${size}px`, left: `${cardCenter}px`, top: `${spriteTop}px`, fontSize: `${size * 0.5}px`, zIndex: 100 });

      const badge = el('div', 'badge');
      Object.assign(badge.style, { left: `${cell / 2}px`, top: `${spriteTop - 14}px`, zIndex: 101 });
      const turns = el('div', 'turns');
      Object.assign(turns.style, { left: '2px', bottom: `${plateH + 2}px`, zIndex: z + 4 });
      const giftSize = Math.round(42 * s);
      const gift = Object.assign(new Image(), { className: 'gifticon', alt: '' });
      Object.assign(gift.style, { width: `${giftSize}px`, height: `${giftSize}px`, left: `${Math.max(0, cell / 2 - spriteW * 0.5 - giftSize * 0.35)}px`, top: `${spriteTop + spriteH * 0.22}px`, zIndex: z + 4 });

      seat.append(sprite, plate, score, card, badge, turns, gift);
      root.append(seat);
      const entry = { root: seat, sprite, kid, rank, name, score, card, badge, turns, gift, data: null, ghostLook: look, center: { x: x + cell / 2, y: y + rowH * 0.35 }, foot: { x: x + cell / 2, y: y + rowH - spriteBottom } };
      paintKid(entry, look);
      seats.push(entry);
    }
    rows.push({ top: y, foot: y + rowH - plateH * 0.45, s, z });
    y += rowH;
  }
}

function paintKid(seat, look) {
  const { variant, flip } = kidLook(look);
  seat.look = look;
  kidFrame(seat.kid, variant, seat.root.classList.contains('up') ? KF.wave : KF.sit, flip);
}

// ---------- Học sinh đi lại: vào lớp từ cửa, đổi chỗ khi đổi hạng ----------
// Đường đi: theo hàng ngang tới lối giữa, đi dọc lối giữa, rẽ ngang vào chỗ. Đi đâu thì dùng đúng dáng đi hướng đó.
const walkers = new Map(); // key -> { node, kid, variant, path, seg, x, y, t, seatIndex }
const MAX_WALKERS = 8;

// Cỡ và lớp vẽ theo độ sâu: xa bảng (dưới màn hình) to hơn, đứng sau bàn ghế của hàng mình.
function depthAt(y) {
  if (!rows.length || y < rows[0].top) return { s: DOOR.s + ((rows[0]?.s ?? 0.8) - DOOR.s) * Math.max(0, Math.min(1, (y - DOOR.y) / Math.max(1, (rows[0]?.foot ?? y) - DOOR.y))), z: 7 };
  let r = 0;
  while (r + 1 < rows.length && rows[r + 1].top <= y - 8) r++;
  const a = rows[r];
  const b = rows[r + 1];
  const s = b ? a.s + ((b.s - a.s) * Math.max(0, Math.min(1, (y - a.foot) / (b.foot - a.foot)))) : a.s;
  return { s, z: a.z + 1 };
}

function walkTo(key, look, index, from) {
  const seat = seats[index];
  const old = walkers.get(key);
  const start = old ? { x: old.x, y: old.y } : from ?? { x: DOOR.x, y: DOOR.y };
  const end = seat.foot;
  const path = [start, { x: AISLE_X, y: start.y }, { x: AISLE_X, y: end.y }, end].filter((p, i, list) => i === 0 || Math.hypot(p.x - list[i - 1].x, p.y - list[i - 1].y) > 1);
  let w = old;
  if (!w) {
    const node = el('div', 'walker');
    const kid = el('i', 'kid');
    node.append(kid);
    $('class').append(node);
    w = { node, kid, t: 0 };
    if (!from) node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350 });
    walkers.set(key, w);
  }
  Object.assign(w, { variant: kidLook(look).variant, path, seg: 1, x: start.x, y: start.y, seatIndex: index, key });
  seat.root.classList.add('arriving');
  placeWalker(w, 0, 1);
  ensureLoop();
}

function placeWalker(w, dx, dy) {
  const { s, z } = depthAt(w.y);
  const d = KID_SIZE * s;
  const width = KID.FW * d;
  const height = KID.FH * d;
  Object.assign(w.node.style, { left: `${w.x - width / 2}px`, top: `${w.y - height}px`, width: `${width}px`, height: `${height}px`, zIndex: z });
  const step = Math.floor(w.t / 0.15) % 2;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const frames = horizontal ? KF.left : dy < 0 ? KF.up : KF.down;
  kidFrame(w.kid, w.variant, frames[step], horizontal && dx > 0);
  return s;
}

function arrive(w) {
  walkers.delete(w.key);
  w.node.remove();
  const seat = seats[w.seatIndex];
  if (seat?.data?.key === w.key) {
    seat.root.classList.remove('arriving');
    restart(seat.root, 'popin');
  }
}

function walkersTick(dt) {
  for (const w of [...walkers.values()]) {
    w.t += dt;
    const { s } = depthAt(w.y);
    let budget = 330 * s * dt;
    let dx = 0;
    let dy = 0;
    while (budget > 0 && w.seg < w.path.length) {
      const p = w.path[w.seg];
      dx = p.x - w.x;
      dy = p.y - w.y;
      const len = Math.hypot(dx, dy);
      if (len <= budget) {
        w.x = p.x;
        w.y = p.y;
        budget -= len;
        w.seg++;
      } else {
        w.x += (dx / len) * budget;
        w.y += (dy / len) * budget;
        budget = 0;
      }
    }
    if (w.seg >= w.path.length) arrive(w);
    else placeWalker(w, dx, dy);
  }
}

function stopWalker(key) {
  const w = walkers.get(key);
  if (!w) return;
  walkers.delete(key);
  w.node.remove();
}

function restart(node, className) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

// Ai đã đoán đúng từ đang hỏi: key -> số điểm vừa được cộng.
const solved = new Map();
const pendingFloats = new Map();
const seatOf = (key) => seats.findIndex((seat) => seat.data?.key === key);

function setTurns(seat, player) {
  const turns = player?.turns ?? 0;
  seat.root.classList.toggle('boosted', turns > 0);
  seat.root.classList.toggle('vip', Boolean(player?.icon && turns > 0));
  seat.turns.textContent = `x2 · ${turns}`;
  if (player?.icon && seat.gift.getAttribute('src') !== player.icon) seat.gift.src = player.icon;
}

function markSolved(seat, key) {
  const delta = solved.get(key);
  seat.root.classList.toggle('up', delta !== undefined);
  seat.card.textContent = delta > 1 ? `x${delta}` : '✓';
  seat.card.classList.toggle('x2', delta > 1);
  paintKid(seat, seat.look);
}

function setUp(seat, up) {
  seat.root.classList.toggle('up', up);
  paintKid(seat, seat.look);
}

// walk: bạn mới vào bảng điểm thì đi từ cửa vào chỗ, bạn đổi hạng thì đi từ chỗ cũ sang chỗ mới.
// Mở trang (walk = false) thì ai cũng ngồi sẵn.
function renderBoard(list, { walk = false } = {}) {
  const before = new Map();
  seats.forEach((seat, i) => seat.data && before.set(seat.data.key, i));
  const keys = new Set(list.map((p) => p.key));
  for (const key of [...walkers.keys()]) if (!keys.has(key)) stopWalker(key);
  const moves = [];
  seats.forEach((seat, i) => {
    const player = list[i] ?? null;
    if ((seat.data?.key ?? null) !== (player?.key ?? null)) {
      seat.root.classList.toggle('ghost', !player);
      seat.root.classList.remove('arriving');
      paintKid(seat, player ? player.look : seat.ghostLook);
      if (player && walk) moves.push({ index: i, player, from: before.get(player.key) });
      else if (player) {
        stopWalker(player.key);
        restart(seat.root, 'popin');
      }
    }
    seat.data = player;
    seat.rank.textContent = player ? i + 1 : '';
    seat.name.textContent = player?.name ?? '';
    seat.score.textContent = player ? player.score : '';
    setTurns(seat, player);
    const top = player && player.score > 0 && i < 3 ? i + 1 : 0;
    for (let n = 1; n <= 3; n++) seat.root.classList.toggle(`top-${n}`, top === n);
    seat.badge.textContent = top ? TITLES[top - 1] : '';
    if (player) markSolved(seat, player.key);
    else setUp(seat, false);
  });
  // Đông người đổi chỗ cùng lúc thì chỉ vài bạn đi (ưu tiên bạn mới vào lớp), còn lại ngồi luôn.
  moves.sort((a, b) => (a.from === undefined ? 0 : 1) - (b.from === undefined ? 0 : 1));
  moves.forEach(({ index, player, from }, n) => {
    if (n < MAX_WALKERS || walkers.has(player.key)) walkTo(player.key, player.look, index, from === undefined ? null : seats[from].foot);
    else restart(seats[index].root, 'popin');
  });
  for (const [key, delta] of pendingFloats) {
    const index = seatOf(key);
    if (index >= 0) floatText(index, `+${delta}`, delta > 1);
  }
  pendingFloats.clear();
}

// ---------- Bảng ----------
let guide = null;
let timerTotal = 1;
let timerEnds = 0;
let timerPhase = 'idle';
let lastTick = 0;

function fitByLength(node, text, long, xlong) {
  node.classList.toggle('long', text.length > long);
  node.classList.toggle('xlong', text.length > xlong);
}

// Ô chữ: cỡ ô tính theo độ dài từ để luôn nằm gọn một hàng.
function renderTiles(tiles) {
  const letters = tiles.filter((ch) => ch !== ' ').length;
  const spaces = tiles.length - letters;
  const unit = Math.min(104, Math.floor((960 - 8 * (tiles.length - 1)) / (letters + spaces * 0.4)));
  const box = $('tiles');
  box.style.fontSize = `${Math.round(unit * 0.62)}px`;
  box.replaceChildren(
    ...tiles.map((ch) => {
      const tile = el('div', ch === ' ' ? 'tile space' : ch ? 'tile open' : 'tile', ch === ' ' ? '' : ch || '?');
      Object.assign(tile.style, { width: `${ch === ' ' ? unit * 0.4 : unit}px`, height: `${Math.round(unit * 1.12)}px` });
      return tile;
    }),
  );
}

function openTile(index, letter) {
  const tile = $('tiles').children[index];
  if (!tile) return;
  tile.textContent = letter;
  tile.classList.add('open');
}

function setFootline(state) {
  const foot = $('footline');
  if (state === 'closing') foot.replaceChildren(el('span', 'closing', 'Đã có bạn đoán ra · nhanh tay lên các bạn ơi!'));
  else if (state === 'reveal') foot.replaceChildren(el('small', '', 'Từ mới sắp tới, chuẩn bị nha...'));
  else foot.replaceChildren(el('span', '', 'Comment đáp án · đúng +1 điểm · '), el('small', '', 'gõ không dấu cũng được'));
}

function setSolvedCount(count) {
  $('solved-count').textContent = count ? `✓ ${count} bạn đoán đúng` : 'Chưa có ai đoán ra...';
}

const MAX_CHIPS = 9;
function addChip({ name, boosted, first }) {
  const chips = $('chips');
  if (chips.children.length >= MAX_CHIPS) return;
  const chip = el('div', first ? 'chip first' : 'chip');
  chip.append(el('span', '', `${first ? '⚡ ' : ''}${name}`));
  if (boosted) chip.append(el('i', '', 'x2'));
  chips.append(chip);
}

function showWord(word) {
  $('topic').textContent = word.topic;
  $('counter').textContent = `Từ số ${word.no}`;
  $('hint').textContent = word.hint;
  fitByLength($('hint'), word.hint, 30, 46);
  renderTiles(word.tiles);
  const syllables = word.tiles.join('').split(' ').length;
  $('meta').textContent = `${word.letters} chữ cái · ${syllables} tiếng`;
  $('chips').replaceChildren();
  setSolvedCount(0);
  setFootline('ask');
}

function showReveal({ answer, count }, { quiet = false } = {}) {
  [...answer].forEach((ch, i) => {
    const tile = $('tiles').children[i];
    if (!tile || ch === ' ') return;
    tile.textContent = ch;
    tile.className = 'tile solved';
    tile.style.animationDelay = quiet ? '0s' : `${i * 0.06}s`;
  });
  $('meta').replaceChildren('Đáp án: ', el('b', '', answer));
  setSolvedCount(count);
  setFootline('reveal');
}

function startTimer(phase, endsAt) {
  timerPhase = phase;
  timerEnds = endsAt;
  timerTotal = Math.max(1, endsAt - Date.now());
  lastTick = 0;
}

setInterval(() => {
  const left = Math.min(timerTotal, Math.max(0, timerEnds - Date.now()));
  const secs = Math.ceil(left / 1000);
  const asking = timerPhase === 'asking';
  $('timer').textContent = `${secs}s`;
  const urgent = asking && secs <= 5;
  $('timer').classList.toggle('urgent', urgent && secs > 0);
  $('timefill').classList.toggle('urgent', urgent);
  $('timefill').style.transform = `scaleX(${Math.min(1, left / timerTotal)})`;
  if (urgent && secs > 0 && secs !== lastTick) {
    lastTick = secs;
    sfx.tick();
    // Sắp hết giờ mà chưa ai đoán ra: cô ôm má ngạc nhiên.
    if (secs === 5 && solved.size === 0) teacherAct('surprised', 1600);
  }
}, 100);

setInterval(() => {
  const now = new Date();
  const minutes = now.getMinutes();
  $('hand-m').setAttribute('transform', `rotate(${minutes * 6} 60 60)`);
  $('hand-h').setAttribute('transform', `rotate(${(now.getHours() % 12) * 30 + minutes / 2} 60 60)`);
}, 1000);

// ---------- Cô giáo: đi lại trên bục giảng, chỉ bảng, nói, vỗ tay, reo hò ----------
// Đứng ở góc phải bục; từ mới hoặc mở thêm chữ thì đi sang trái, cầm thước chỉ lên bảng rồi về chỗ.
// Thỉnh thoảng tự đi dạo vài bước cho hình không đứng yên.
const T_SIZE = 0.58;
const T_FOOT = 1046;
const T_HOME = 985;
const T_POINT = 790;
const teacher = { x: T_HOME, goal: T_HOME, mode: 'idle', until: 0, t: 0, talking: false, blinkAt: 2, wanderAt: 12, after: null };
const teacherNode = $('teacher');
const teacherSprite = el('i', 'tch');
teacherNode.append(teacherSprite);
Object.assign(teacherNode.style, { width: `${TEACHER.FW * T_SIZE}px`, height: `${TEACHER.FH * T_SIZE}px`, top: `${T_FOOT - TEACHER.FH * T_SIZE}px` });

function teacherWalk(x, after = null) {
  teacher.goal = x;
  teacher.after = after;
  teacher.mode = Math.abs(x - teacher.x) > 2 ? 'walk' : 'idle';
  if (teacher.mode === 'idle') after?.();
}

// Làm một động tác tại chỗ trong ms mili giây, xong thì về góc phải.
function teacherAct(mode, ms) {
  teacher.mode = mode;
  teacher.t = 0;
  teacher.until = performance.now() + ms;
  teacher.after = null;
  if (mode === 'happy' || mode === 'cheer') restart(teacherNode, 'hop');
}

function teacherPoint(ms) {
  if (teacher.mode === 'point') {
    teacher.until = Math.max(teacher.until, performance.now() + ms);
    return;
  }
  teacherWalk(T_POINT, () => teacherAct('point', ms));
}

function teacherTick(dt, now) {
  const T = teacher;
  T.t += dt;
  if (T.mode === 'walk') {
    const dir = Math.sign(T.goal - T.x);
    T.x += dir * Math.min(Math.abs(T.goal - T.x), 210 * dt);
    if (Math.abs(T.goal - T.x) < 1) {
      T.x = T.goal;
      T.mode = 'idle';
      const after = T.after;
      T.after = null;
      after?.();
    }
  } else if (T.mode !== 'idle' && now >= T.until) {
    T.mode = 'idle';
    if (Math.abs(T.x - T_HOME) > 2) teacherWalk(T_HOME);
  } else if (T.mode === 'idle' && T.t > T.wanderAt && !T.talking) {
    T.t = 0;
    T.wanderAt = 9 + Math.random() * 9;
    const spot = Math.abs(T.x - T_HOME) > 30 ? T_HOME : T_HOME - 90 - Math.random() * 110;
    teacherWalk(spot);
  }
  let frame = TF.idle;
  let flip = false;
  if (T.mode === 'walk') {
    frame = TF.walk[Math.floor(T.t / 0.18) % 2];
    flip = T.goal > T.x;
  } else if (T.mode === 'point') frame = T.talking && Math.floor(T.t / 0.28) % 2 ? TF.pointTalk : TF.point;
  else if (T.mode === 'happy') frame = T.t < 1.1 ? (Math.floor(T.t / 0.22) % 2 ? TF.idle : TF.clap) : TF.thumbs;
  else if (T.mode === 'cheer') frame = TF.cheer;
  else if (T.mode === 'surprised') frame = TF.surprised;
  else if (T.talking) frame = [TF.talk[0], TF.idle, TF.talk[1], TF.idle][Math.floor(T.t / 0.32) % 4];
  else {
    T.blinkAt -= dt;
    if (T.blinkAt < 0.14) frame = TF.blink;
    if (T.blinkAt < 0) T.blinkAt = 2.5 + Math.random() * 3;
  }
  teacherFrame(teacherSprite, frame, flip);
  const w = TEACHER.FW * T_SIZE;
  teacherNode.style.left = `${T.x - w / 2}px`;
  // Bong bóng lời cô luôn nằm bên trái cô, mũi nhọn chỉ vào cô.
  const bubble = $('bubble');
  bubble.style.right = `${W - (T.x - 62)}px`;
  bubble.style.maxWidth = `${Math.min(860, T.x - 90)}px`;
}

// Một vòng lặp cho cô giáo và các bạn đang đi.
let lastFrame = performance.now();
let looping = false;
function loop(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  teacherTick(dt, now);
  walkersTick(dt);
  requestAnimationFrame(loop);
}
function ensureLoop() {
  if (looping) return;
  looping = true;
  lastFrame = performance.now();
  requestAnimationFrame(loop);
}
ensureLoop();

// ---------- Lời cô hiện thành bong bóng cho người xem đang tắt tiếng ----------
let bubbleTimer = 0;
function say(msg) {
  const bubble = $('bubble');
  if (msg.cut) stopSpeech();
  clearTimeout(bubbleTimer);
  if (!msg.text) {
    bubble.hidden = true;
    teacher.talking = false;
    return;
  }
  bubble.textContent = msg.text;
  bubble.hidden = false;
  teacher.talking = true;
  bubbleTimer = setTimeout(() => {
    bubble.hidden = true;
    teacher.talking = false;
  }, Math.max(2600, msg.ms + 600));
  if (msg.clips.length) speak(msg);
}
const teacherHappy = () => teacherAct('happy', 1900);

// ---------- Hiệu ứng ----------
const toasts = [];
let toastTimer = 0;
function toast(parts, { big = false, icon = '', first = false } = {}) {
  const item = { parts, big, icon };
  if (first) toasts.unshift(item);
  else if (toasts.length < 4) toasts.push(item);
  else toasts[toasts.length - 1] = item; // Đông người thì bỏ bớt, giữ tin mới nhất.
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
  box.className = item.big ? 'big' : '';
  box.replaceChildren();
  if (item.icon) box.append(Object.assign(new Image(), { src: item.icon, alt: '' }));
  for (const part of item.parts) box.append(typeof part === 'string' ? part : el('b', '', part.b));
  box.hidden = false;
  toastTimer = setTimeout(nextToast, item.big ? 2400 : 1300);
}

const fx = $('fx');
function floatText(index, text, x2 = false) {
  const { center } = seats[index];
  const node = el('div', x2 ? 'float x2' : 'float', text);
  Object.assign(node.style, { left: `${center.x - 26}px`, top: `${center.y - 10}px` });
  fx.append(node);
  node.animate([{ transform: 'translateY(0) scale(.6)', opacity: 0 }, { transform: 'translateY(-24px) scale(1.15)', opacity: 1, offset: 0.2 }, { transform: 'translateY(-96px) scale(1)', opacity: 0 }], { duration: 1700, easing: 'ease-out' }).onfinish = () => node.remove();
}
function sparks(x, y, count = 16) {
  const colors = ['#ffe066', '#ff6f91', '#7bdff2', '#ffffff', '#b2f7a1'];
  for (let i = 0; i < count; i++) {
    const node = el('i', 'spark');
    Object.assign(node.style, { left: `${x}px`, top: `${y}px`, background: colors[i % colors.length] });
    fx.append(node);
    const angle = Math.random() * Math.PI * 2;
    const reach = 50 + Math.random() * 110;
    node.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${Math.cos(angle) * reach}px, ${Math.sin(angle) * reach + 50}px) rotate(320deg)`, opacity: 0 }], { duration: 800 + Math.random() * 500, easing: 'cubic-bezier(.15,.7,.4,1)' }).onfinish = () => node.remove();
  }
}
function flyIcon(src, index) {
  const { center } = seats[index];
  const node = Object.assign(new Image(), { className: 'flyer', src, alt: '' });
  node.style.left = `${center.x - 48}px`;
  node.style.top = `${center.y - 48}px`;
  fx.append(node);
  // Hình quà bay ra từ bảng x2 (đứng trước bàn cô).
  const g = $('guide');
  const fromX = g.offsetLeft + (g.offsetWidth * GUIDE_SCALE) / 2 - center.x;
  const fromY = g.offsetTop + (g.offsetHeight * GUIDE_SCALE) / 2 - center.y;
  node.animate([{ transform: `translate(${fromX}px, ${fromY}px) scale(.6)`, opacity: 0 }, { transform: `translate(${fromX * 0.5}px, ${fromY * 0.5 - 60}px) scale(1.3)`, opacity: 1, offset: 0.5 }, { transform: 'translate(0,0) scale(.8)', opacity: 1, offset: 0.92 }, { transform: 'translate(0,0) scale(1.5)', opacity: 0 }], { duration: 950, easing: 'ease-in-out' }).onfinish = () => {
    node.remove();
    sparks(center.x, center.y, 12);
  };
}

// ---------- Nhanh nhất: ảnh TikTok (không tải được thì mặt chibi) và tên, hiện trong lúc công bố ----------
let spotTimer = 0;
function showSpotlight(fastest, endsAt, { quiet = false } = {}) {
  const box = $('spotlight');
  clearTimeout(spotTimer);
  const ms = endsAt - Date.now() - 500;
  if (!fastest || ms < 1000) return hideSpotlight(true);
  const img = $('spot-img');
  const face = $('spot-face');
  const { variant, flip } = kidLook(fastest.look);
  const faceKid = el('i', 'kid');
  kidFrame(faceKid, variant, KF.wave, flip);
  face.replaceChildren(faceKid);
  img.hidden = !fastest.avatar;
  face.hidden = Boolean(fastest.avatar);
  img.onerror = () => {
    img.hidden = true;
    face.hidden = false;
  };
  if (fastest.avatar) img.src = fastest.avatar;
  else img.removeAttribute('src');
  $('spot-name').textContent = fastest.name;
  $('spot-info').replaceChildren(`Đoán đúng sau ${fastest.seconds} giây · `, el('b', '', `+${fastest.delta} điểm`));
  box.hidden = false;
  box.className = '';
  if (!quiet) {
    restart(box, 'show');
    setTimeout(() => sparks(540, 1040, 40), 300);
  }
  spotTimer = setTimeout(() => hideSpotlight(), ms);
}
function hideSpotlight(now = false) {
  const box = $('spotlight');
  clearTimeout(spotTimer);
  if (now || box.hidden) {
    box.hidden = true;
    return;
  }
  restart(box, 'hide');
  spotTimer = setTimeout(() => (box.hidden = true), 450);
}

// ---------- Nhận tin từ server ----------
function setPlayers(count) {
  $('players').textContent = count ? `👥 ${count} bạn có điểm` : '';
}

function applyGame(game) {
  solved.clear();
  for (const key of game.solved) solved.set(key, 1);
  setPlayers(game.players);
  renderBoard(game.board);
  if (!game.word) return;
  showWord(game.word);
  game.solvers.forEach((s, i) => addChip({ ...s, first: i === 0 }));
  setSolvedCount(game.count);
  if (game.phase === 'reveal' && game.reveal) {
    showReveal(game.reveal, { quiet: true });
    startTimer('reveal', game.reveal.endsAt);
    showSpotlight(game.reveal.fastest, game.reveal.endsAt, { quiet: true });
  } else {
    hideSpotlight(true);
    startTimer('asking', game.word.endsAt);
    if (game.count) setFootline('closing');
  }
}

function socialGuide() {
  const row = el('div', 'social');
  row.append(el('small', '', 'Follow, Share'), `${guide.socialTurns} lượt`);
  return row;
}

const handlers = {
  snapshot(msg) {
    guide = msg.guide;
    $('banner').textContent = guide.title;
    $('guide').replaceChildren(
      el('h3', '', `ĐIỂM x${guide.multiplier}`),
      ...guide.tiers.map((tier) => {
        const row = el('div');
        row.append(Object.assign(new Image(), { src: tier.icon, alt: tier.label }), `${tier.turns} lượt`);
        return row;
      }),
      ...(guide.socialTurns ? [socialGuide()] : []),
    );
    if (seats.length !== guide.seats) buildClass(guide.seats);
    applyGame(msg.game);
  },
  'snapshot-game'(msg) {
    applyGame(msg.game);
  },
  word(msg) {
    wake();
    sfx.bell();
    solved.clear();
    seats.forEach((seat) => setUp(seat, false));
    hideSpotlight();
    showWord(msg);
    startTimer('asking', msg.endsAt);
    teacherPoint(3800);
  },
  letter(msg) {
    sfx.letter();
    openTile(msg.index, msg.letter);
    teacherPoint(2200);
  },
  correct(msg) {
    solved.set(msg.key, msg.delta);
    setSolvedCount(msg.count);
    addChip(msg);
    const index = seatOf(msg.key);
    if (index >= 0) {
      const seat = seats[index];
      seat.data.score = msg.score;
      seat.data.turns = msg.turns;
      seat.score.textContent = msg.score;
      setTurns(seat, seat.data);
      markSolved(seat, msg.key);
      floatText(index, `+${msg.delta}`, msg.boosted);
    } else pendingFloats.set(msg.key, msg.delta);
    if (msg.first) {
      sfx.first();
      teacherHappy();
      timerEnds = msg.endsAt;
      setFootline('closing');
      sparks(540, 470, 30);
      toast([{ b: msg.name }, ` đoán ra đầu tiên · +${msg.delta}`], { big: true, first: true });
    } else {
      sfx.right();
      toast(['✓ ', { b: msg.name }, ` +${msg.delta}`]);
    }
  },
  reveal(msg) {
    startTimer('reveal', msg.endsAt);
    showReveal(msg);
    showSpotlight(msg.fastest, msg.endsAt);
    if (msg.count) {
      sfx.fanfare();
      if (msg.fastest) teacherAct('cheer', 2200);
      else teacherHappy();
    } else {
      sfx.none();
      teacherAct('surprised', 1500);
    }
  },
  board(msg) {
    setPlayers(msg.players);
    renderBoard(msg.board, { walk: true });
  },
  say,
  boost(msg) {
    sfx.boost();
    const index = seatOf(msg.key);
    if (index >= 0 && msg.icon) flyIcon(msg.icon, index);
    if (msg.kind) toast([{ b: msg.name }, ` x2 điểm · ${msg.added} lượt`]);
    else toast([{ b: msg.name }, ` x2 điểm · ${msg.added} lượt`], { icon: msg.icon, first: true });
  },
};

const events = new EventSource('/events');
events.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  handlers[msg.type]?.(msg);
};
