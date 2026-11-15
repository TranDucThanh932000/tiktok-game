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
  wisher?.node.remove();
  wisher = null;
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

      seat.append(sprite, plate, score, card, badge, turns);
      root.append(seat);
      const entry = { root: seat, sprite, kid, rank, name, score, card, badge, turns, data: null, ghostLook: look, center: { x: x + cell / 2, y: y + rowH * 0.35 }, foot: { x: x + cell / 2, y: y + rowH - spriteBottom } };
      paintKid(entry, look);
      seats.push(entry);
    }
    rows.push({ top: y, foot: y + rowH - plateH * 0.45, s, z });
    y += rowH;
  }
}

// Cả lớp quay lại cười (quà, phát kẹo) hoặc bạn đã đoán đúng: dáng quay mặt giơ tay; còn lại ngồi quay lưng.
function paintKid(seat, look) {
  const { variant, flip } = kidLook(look);
  seat.look = look;
  const cheering = $('class').classList.contains('cheer') && !seat.root.classList.contains('ghost');
  kidFrame(seat.kid, variant, cheering || seat.root.classList.contains('up') ? KF.wave : KF.sit, flip);
}

// ---------- Học sinh đi lại: vào lớp từ cửa, đổi chỗ khi đổi hạng ----------
// Đường đi: theo hàng ngang tới lối giữa, đi dọc lối giữa, rẽ ngang vào chỗ. Đi đâu thì dùng đúng dáng đi hướng đó.
const walkers = new Map(); // key -> { node, kid, variant, path, seg, x, y, t, seatIndex }
const MAX_WALKERS = 8;
// Bạn đang lên chúc cô 20/11 (chỉ một bạn mỗi lúc): chỗ của bạn ấy để trống tới khi về.
let wisher = null;

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
  // Đang đứng trên bục chúc cô thì không đi đổi chỗ; lúc về sẽ về thẳng chỗ mới.
  if (wisher?.key === key) {
    seat.root.classList.add('arriving');
    return;
  }
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
  seat.turns.textContent = `x2 · ${turns}`;
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
  if (wisher) {
    const index = seatOf(wisher.key);
    if (index >= 0) seats[index].root.classList.add('arriving');
  }
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

// ---------- Cô giáo: đi lại trên bục giảng, chỉ bảng, nói, vỗ tay, reo hò ----------
// Đứng ở góc phải bục; từ mới hoặc mở thêm chữ thì đi sang trái, cầm thước chỉ lên bảng rồi về chỗ.
// Thỉnh thoảng tự đi dạo vài bước cho hình không đứng yên.
const T_SIZE = 0.58;
const T_FOOT = 1046;
const T_HOME = 985;
const T_POINT = 880;
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
  // Không tràn sang khung ảnh treo dưới mép trái bảng (#photo, mép phải khoảng x = 200).
  bubble.style.maxWidth = `${Math.min(860, T.x - 62 - 215)}px`;
}

// Một vòng lặp cho cô giáo và các bạn đang đi.
let lastFrame = performance.now();
let looping = false;
function loop(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  teacherTick(dt, now);
  walkersTick(dt);
  visitorsTick(dt);
  wisherTick(dt);
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
function toast(parts, { big = false, icon = '', avatar = '', first = false } = {}) {
  const item = { parts, big, icon, avatar };
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
  if (item.avatar) {
    const face = Object.assign(new Image(), { className: 'avatar', src: item.avatar, alt: '', referrerPolicy: 'no-referrer' });
    face.onerror = () => face.remove();
    box.append(face);
  }
  if (item.icon) box.append(Object.assign(new Image(), { src: item.icon, alt: '', referrerPolicy: 'no-referrer' }));
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
// Toạ độ giữa một phần tử trên sân khấu 1080×1920 (sân khấu đang được thu nhỏ cho vừa cửa sổ).
function stagePoint(node) {
  const r = node.getBoundingClientRect();
  const box = stage.getBoundingClientRect();
  const k = box.width / W;
  return { x: (r.left + r.width / 2 - box.left) / k, y: (r.top + r.height / 2 - box.top) / k };
}

// Một hình (quà, kẹo) bay vòng cung từ a tới b.
function fly(node, a, b, { size = 90, ms = 900, lift = 120, delay = 0, end = 1, onDone } = {}) {
  Object.assign(node.style, { left: `${b.x - size / 2}px`, top: `${b.y - size / 2}px`, width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.8}px` });
  node.classList.add('flyer');
  fx.append(node);
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  node.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(.7)` },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(1.15)`, offset: 0.5 },
      { transform: `translate(0, 0) scale(${end})` },
    ],
    { duration: ms, delay, easing: 'ease-in-out', fill: 'backwards' },
  ).onfinish = () => {
    node.remove();
    onDone?.();
  };
}

// Hình quà thật từ TikTok; tải lỗi thì dùng hình của mức cảnh.
function giftImage(src, fallback) {
  const img = Object.assign(new Image(), { src: src || fallback, alt: '', referrerPolicy: 'no-referrer' });
  img.onerror = () => {
    img.onerror = null;
    img.src = fallback;
  };
  return img;
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


// ---------- Quà: cảnh vui trong lớp (không đụng tới điểm) ----------
// rose: chibi của người gửi chạy từ cửa lên đưa quà cho cô. kem: như vậy, thêm cả lớp quay lại cười.
// pig: hình quà chạy một vòng quanh lớp, cô giật mình rồi reo. Xong cảnh, quà bay vào quỹ lớp.
const sceneQueue = [];
const visitors = new Set();
const MAX_VISITORS = 3;
const VISITOR_SIZE = 0.85;
const VISIT_GAP_MS = 700;
const SCENE_QUEUE = 8;
let visitorsOut = 0;
let lastVisitAt = 0;
let pigBusy = false;

const sceneIcon = (scene) => guide?.scenes.find((row) => row.scene === scene)?.icon ?? '/gifts/rose.webp';
const teacherHand = () => ({ x: teacher.x - 62, y: 900 });

function queueScene(msg) {
  // Một người bấm liên tục (combo) thì gộp vào cảnh đang chờ của người đó.
  const waiting = sceneQueue.find((row) => row.key === msg.key && row.scene === msg.scene);
  if (waiting) waiting.count += msg.count;
  else {
    sceneQueue.push({ ...msg });
    // Quá đông thì bỏ bớt cảnh nhỏ cũ nhất (thông báo và lời cô vẫn có).
    if (sceneQueue.length > SCENE_QUEUE) sceneQueue.splice(Math.max(0, sceneQueue.findIndex((row) => row.scene === 'rose')), 1);
  }
  runScenes();
}

function runScenes() {
  for (let i = 0; i < sceneQueue.length; ) {
    const row = sceneQueue[i];
    const free = row.scene === 'pig' ? !pigBusy : visitorsOut < MAX_VISITORS;
    if (!free) {
      i++;
      continue;
    }
    sceneQueue.splice(i, 1);
    if (row.scene === 'pig') pigRun(row);
    else {
      visitorsOut++;
      const wait = Math.max(0, lastVisitAt + VISIT_GAP_MS - Date.now());
      lastVisitAt = Date.now() + wait;
      setTimeout(() => visit(row), wait);
    }
  }
}

// Quà vào quỹ lớp: bay từ tay cô xuống thanh quỹ.
function giftToFund(src, scene, from) {
  const bar = $('fund-bar');
  if (!bar) return;
  fly(giftImage(src, sceneIcon(scene)), from, stagePoint(bar), { size: 70, ms: 800, lift: 60, end: 0.4, onDone: () => restart($('guide'), 'pulse') });
}

function visit(row) {
  const node = el('div', 'walker visitor');
  const kid = el('i', 'kid');
  const held = giftImage(row.icon, sceneIcon(row.scene));
  held.className = 'held';
  const tag = el('span', 'visitor-name', row.count > 1 ? `${row.name} x${row.count}` : row.name);
  node.append(kid, held, tag);
  $('class').append(node);
  node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  const v = { node, kid, held, row, variant: kidLook(row.look).variant, x: DOOR.x, t: 0, stage: 'in', wait: 0 };
  visitors.add(v);
  placeVisitor(v, 1);
  ensureLoop();
}

function placeVisitor(v, dx) {
  // To hơn bạn ngồi trong lớp; đứng sau bong bóng lời cô để lời cảm ơn không bị che.
  const d = VISITOR_SIZE;
  const width = KID.FW * d;
  const height = KID.FH * d;
  Object.assign(v.node.style, { left: `${v.x - width / 2}px`, top: `${DOOR.y - height}px`, width: `${width}px`, height: `${height}px`, zIndex: 130 });
  // Đứng đưa quà thì quay mặt ra giơ tay; chạy thì dùng dáng đi ngang.
  if (v.stage === 'give') kidFrame(v.kid, v.variant, KF.wave);
  else kidFrame(v.kid, v.variant, KF.left[Math.floor(v.t / 0.12) % 2], dx > 0);
}

function visitorsTick(dt) {
  for (const v of [...visitors]) {
    v.t += dt;
    if (v.stage === 'give') {
      v.wait -= dt;
      if (v.wait <= 0) v.stage = 'out';
      placeVisitor(v, 0);
      continue;
    }
    // Cô có thể đang đi chỉ bảng, nên đích là chỗ cô đang đứng.
    const goal = v.stage === 'in' ? Math.max(DOOR.x + 80, teacher.x - 125) : DOOR.x;
    const dx = goal - v.x;
    const step = 560 * dt;
    if (Math.abs(dx) > step) v.x += Math.sign(dx) * step;
    else if (v.stage === 'in') {
      v.x = goal;
      v.stage = 'give';
      v.wait = 1.5;
      giveGift(v);
    } else {
      leave(v);
      continue;
    }
    placeVisitor(v, dx);
  }
}

function giveGift(v) {
  const { row } = v;
  const from = { x: v.x + 20, y: DOOR.y - KID.FH * VISITOR_SIZE * 0.95 };
  v.held.hidden = true;
  sfx.gift();
  teacherAct('happy', 1900);
  if (row.scene === 'kem') classCheer(2600);
  const hand = teacherHand();
  fly(giftImage(row.icon, sceneIcon(row.scene)), from, hand, {
    size: 84,
    ms: 600,
    lift: 70,
    onDone: () => {
      sparks(hand.x, hand.y, row.scene === 'kem' ? 22 : 12);
      hearts(hand.x, hand.y - 30, row.scene === 'kem' ? 6 : 3);
      setTimeout(() => giftToFund(row.icon, row.scene, teacherHand()), 400);
    },
  });
}

function leave(v) {
  visitors.delete(v);
  v.node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).onfinish = () => v.node.remove();
  visitorsOut--;
  runScenes();
}

function hearts(x, y, count) {
  for (let i = 0; i < count; i++) {
    const node = el('span', 'heart', '❤');
    Object.assign(node.style, { left: `${x - 16 + (Math.random() - 0.5) * 80}px`, top: `${y}px` });
    fx.append(node);
    node.animate([{ transform: 'translateY(0) scale(.5)', opacity: 0 }, { transform: 'translateY(-30px) scale(1.1)', opacity: 1, offset: 0.25 }, { transform: `translateY(-${120 + Math.random() * 60}px) scale(1)`, opacity: 0 }], { duration: 1300 + Math.random() * 400, delay: i * 120, easing: 'ease-out', fill: 'backwards' }).onfinish = () => node.remove();
  }
}

let cheerTimer = 0;
function classCheer(ms) {
  $('class').classList.add('cheer');
  seats.forEach((seat) => paintKid(seat, seat.look));
  clearTimeout(cheerTimer);
  cheerTimer = setTimeout(() => {
    $('class').classList.remove('cheer');
    seats.forEach((seat) => paintKid(seat, seat.look));
  }, ms);
}

// Heo chạy vòng quanh lớp: từ cửa sang phải, xuống cuối lớp, sang trái, lên lại bục giảng tới chỗ cô.
function pigRun(row) {
  pigBusy = true;
  const size = 140;
  const node = el('div', 'pig');
  const img = giftImage(row.icon, sceneIcon('pig'));
  node.append(img, el('span', 'visitor-name', row.count > 1 ? `${row.name} x${row.count}` : row.name));
  Object.assign(node.style, { width: `${size}px`, height: `${size}px` });
  fx.append(node);
  const end = { x: Math.max(200, teacher.x - 150), y: 1040 };
  const points = [{ x: DOOR.x + 30, y: 1050 }, { x: 1010, y: 1090 }, { x: 1010, y: 1850 }, { x: 70, y: 1850 }, { x: 70, y: 1120 }, end];
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  const total = lengths.reduce((a, b) => a + b, 0);
  const ms = (total / 760) * 1000;
  let at = 0;
  const moves = points.map((p, i) => {
    if (i > 0) at += lengths[i - 1] / total;
    return { transform: `translate(${p.x - size / 2}px, ${p.y - size}px)`, offset: Math.min(1, at) };
  });
  // Quay mặt theo hướng chạy ngang (đoạn chạy dọc giữ hướng cũ), đổi hướng tức thì ở điểm rẽ.
  const faces = [];
  let face = 1;
  points.slice(0, -1).forEach((p, i) => {
    const next = points[i + 1];
    if (Math.abs(next.x - p.x) < 40) return;
    const want = next.x > p.x ? 1 : -1;
    if (faces.length && want === face) return;
    if (faces.length) faces.push({ transform: `scaleX(${face})`, offset: Math.max(0, moves[i].offset - 0.0001) });
    face = want;
    faces.push({ transform: `scaleX(${face})`, offset: faces.length ? moves[i].offset : 0 });
  });
  faces.push({ transform: `scaleX(${face})`, offset: 1 });
  img.animate(faces, { duration: ms, fill: 'forwards' });
  sfx.oink();
  teacherAct('surprised', 1600);
  classCheer(ms + 1500);
  const dust = setInterval(() => {
    const p = stagePoint(img);
    sparks(p.x, p.y + size * 0.4, 4);
  }, 220);
  node.animate(moves, { duration: ms, easing: 'linear', fill: 'forwards' }).onfinish = () => {
    clearInterval(dust);
    sfx.oink();
    teacherAct('cheer', 2200);
    sparks(end.x, end.y - 80, 40);
    hearts(end.x, end.y - 120, 8);
    setTimeout(() => {
      const from = stagePoint(img);
      node.remove();
      giftToFund(row.icon, 'pig', from);
      pigBusy = false;
      runScenes();
    }, 900);
  };
}

// ---------- 20/11: một bạn trong lớp đứng dậy cầm hoa chạy lên chúc cô ----------
// Server chọn bạn và câu chúc, cô đáp lời sau msg.replyMs: bạn chạy theo lối giữa lên bục, tới trước lời cô một chút,
// đứng giơ tay với bong bóng lời chúc, đưa hoa cho cô, đợi cô cảm ơn rồi về chỗ (đổi hạng thì về chỗ mới).
const WISH_ARRIVE = 0.75;
const WISH_STAY_MS = 5200;
const wishSpot = () => ({ x: Math.max(AISLE_X + 60, teacher.x - 125), y: DOOR.y });
const pathLength = (path) => path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0);

// Trong lớp thì to nhỏ theo hàng như các bạn đi đổi chỗ; lên tới bục thì to dần bằng bạn lên tặng quà.
function placeWisher(w, dx, dy) {
  placeWalker(w, dx, dy);
  const front = rows[0];
  if (!front || w.y >= front.top) return;
  const k = Math.max(0, Math.min(1, (w.y - DOOR.y) / Math.max(1, front.foot - DOOR.y)));
  const d = VISITOR_SIZE + (KID_SIZE * front.s - VISITOR_SIZE) * k;
  const width = KID.FW * d;
  const height = KID.FH * d;
  Object.assign(w.node.style, { left: `${w.x - width / 2}px`, top: `${w.y - height}px`, width: `${width}px`, height: `${height}px` });
}

function wish(msg) {
  const index = seatOf(msg.key);
  if (wisher || index < 0 || walkers.has(msg.key)) return;
  const seat = seats[index];
  const node = el('div', 'walker visitor');
  const kid = el('i', 'kid');
  const held = giftImage('', sceneIcon('rose'));
  held.className = 'held';
  const bubble = el('div', 'wish-say', msg.text);
  bubble.hidden = true;
  node.append(kid, held, el('span', 'visitor-name', msg.name), bubble);
  $('class').append(node);
  seat.root.classList.add('arriving');
  const start = seat.foot;
  const path = [start, { x: AISLE_X, y: start.y }, { x: AISLE_X, y: DOOR.y }, wishSpot()];
  const speed = Math.max(260, pathLength(path) / ((msg.replyMs * WISH_ARRIVE) / 1000));
  wisher = { key: msg.key, node, kid, held, bubble, variant: kidLook(seat.look).variant, path, seg: 1, x: start.x, y: start.y, t: 0, stage: 'in', speed, wait: 0 };
  placeWisher(wisher, 0, -1);
  ensureLoop();
}

function wisherTick(dt) {
  const w = wisher;
  if (!w) return;
  w.t += dt;
  if (w.stage === 'give') {
    w.wait -= dt;
    if (w.wait > 0) return;
    wishBack(w);
    if (wisher !== w) return;
  }
  // Cô có thể đang đi chỉ bảng, nên đích là chỗ cô đang đứng.
  if (w.stage === 'in') w.path[w.path.length - 1] = wishSpot();
  let budget = w.speed * dt;
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
  if (w.seg < w.path.length) placeWisher(w, dx, dy);
  else if (w.stage === 'in') wishArrive(w);
  else wishHome(w);
}

function wishArrive(w) {
  w.stage = 'give';
  w.wait = WISH_STAY_MS / 1000;
  placeWisher(w, 0, 0);
  // Đứng trước cô, quay mặt ra giơ tay; nằm trên bảng x2 để bong bóng lời chúc không bị che.
  kidFrame(w.kid, w.variant, KF.wave);
  w.node.style.zIndex = 130;
  w.held.hidden = true;
  w.bubble.hidden = false;
  sfx.gift();
  teacherAct('happy', 1900);
  const hand = teacherHand();
  fly(giftImage('', sceneIcon('rose')), { x: w.x + 20, y: w.y - KID.FH * VISITOR_SIZE * 0.8 }, hand, {
    size: 84,
    ms: 600,
    lift: 70,
    onDone: () => {
      sparks(hand.x, hand.y, 16);
      hearts(hand.x, hand.y - 30, 5);
    },
  });
}

function wishBack(w) {
  w.stage = 'out';
  w.bubble.hidden = true;
  const index = seatOf(w.key);
  // Đã rời bảng điểm, hoặc đang có hình đi đổi chỗ (hình đó tự ngồi vào chỗ), thì chỉ mờ đi.
  if (index < 0 || walkers.has(w.key)) {
    wisher = null;
    w.node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250 }).onfinish = () => w.node.remove();
    return;
  }
  const foot = seats[index].foot;
  w.path = [{ x: w.x, y: w.y }, { x: AISLE_X, y: w.y }, { x: AISLE_X, y: foot.y }, foot];
  w.seg = 1;
  w.speed = 330;
}

function wishHome(w) {
  wisher = null;
  w.node.remove();
  const index = seatOf(w.key);
  if (index < 0 || walkers.has(w.key)) return;
  seats[index].root.classList.remove('arriving');
  restart(seats[index].root, 'popin');
}

// ---------- Ảnh treo trên bảng và quỹ lớp ----------
// Người gửi Tim cam cuối cùng được treo ảnh TikTok (không tải được thì mặt chibi). Chưa có ai thì khung trống chỉ cách lên.
function setPhoto(honor, { pop = false } = {}) {
  const box = $('photo');
  box.classList.toggle('empty', !honor);
  $('photo-name').textContent = honor?.name ?? '';
  const img = $('photo-img');
  const face = $('photo-face');
  if (!honor) {
    img.hidden = true;
    face.hidden = true;
    return;
  }
  const { variant, flip } = kidLook(honor.look);
  const faceKid = el('i', 'kid');
  kidFrame(faceKid, variant, KF.wave, flip);
  face.replaceChildren(faceKid);
  img.hidden = !honor.avatar;
  face.hidden = Boolean(honor.avatar);
  img.onerror = () => {
    img.hidden = true;
    face.hidden = false;
  };
  if (honor.avatar) img.src = honor.avatar;
  else img.removeAttribute('src');
  if (pop) {
    restart(box, 'pop');
    const p = stagePoint(box);
    sparks(p.x, p.y, 30);
    sfx.gift();
  }
}

let fundShown = { coins: 0, goal: 1 };
function setFund({ coins, goal }) {
  fundShown = { coins, goal };
  const fill = $('fund-fill');
  if (!fill) return;
  fill.style.width = `${Math.min(100, (coins / goal) * 100)}%`;
  $('fund-num').textContent = `${coins.toLocaleString('vi-VN')}/${goal.toLocaleString('vi-VN')}`;
  $('guide').classList.toggle('near', coins >= goal * 0.9);
}

// Dải quà dưới bảng: Hoa hồng, Kem, Heo may mắn, Tim cam. Có quà tới thì ô của quà đó nảy lên.
function buildMenu() {
  const items = [...guide.scenes.map((row) => ({ ...row, key: row.scene })), { ...guide.photoGift, key: 'photo' }];
  $('menu').replaceChildren(
    ...items.map((row) => {
      const item = el('div', 'menu-item');
      item.dataset.key = row.key;
      item.append(Object.assign(new Image(), { src: row.icon, alt: row.label }), el('span', '', row.hint));
      return item;
    }),
  );
}

function pulseMenu(msg) {
  const item = $('menu').querySelector(`[data-key="${msg.photo ? 'photo' : msg.scene}"]`);
  if (item) restart(item, 'hit');
}

function buildGuide() {
  const x2 = el('div', 'g-x2');
  x2.append(el('h3', '', `ĐIỂM x${guide.multiplier}`));
  if (guide.socialTurns) x2.append(socialGuide());
  const head = el('div', 'fund-head');
  const num = el('b');
  num.id = 'fund-num';
  head.append('🍬 QUỸ LỚP ', num);
  const bar = el('div', 'fund-bar');
  bar.id = 'fund-bar';
  const fill = el('i');
  fill.id = 'fund-fill';
  bar.append(fill);
  const fund = el('div', 'g-fund');
  fund.append(head, bar, el('small', '', 'Đủ sẽ có sự kiện 🎉'));
  $('guide').replaceChildren(x2, fund);
  setFund(fundShown);
}

// ---------- Quỹ đủ: cô phát kẹo cả lớp ----------
const CANDIES = ['🍬', '🍭', '🍫', '🍬', '🍡'];
function candyParty(msg, tries = 0) {
  // Chờ phần "bạn nhanh nhất" và cảnh heo chạy xong cho đỡ rối.
  if ((!$('spotlight').hidden || pigBusy) && tries < 20) return setTimeout(() => candyParty(msg, tries + 1), 500);
  const card = $('candy');
  const thanks = $('candy-thanks');
  thanks.replaceChildren();
  if (msg.thanks.length) thanks.append(el('small', '', 'Cảm ơn'));
  for (const row of msg.thanks) {
    const who = el('span', 'candy-who');
    if (row.avatar) {
      const face = Object.assign(new Image(), { src: row.avatar, alt: '', referrerPolicy: 'no-referrer' });
      face.onerror = () => face.remove();
      who.append(face);
    }
    who.append(el('b', '', row.name));
    thanks.append(who);
  }
  card.hidden = false;
  restart(card, 'show');
  sfx.candy();
  teacherAct('cheer', 3200);
  classCheer(5000);
  // Thanh quỹ đầy rồi mới về số mới.
  const fill = $('fund-fill');
  if (fill) fill.style.width = '100%';
  setTimeout(() => setFund({ coins: msg.coins, goal: msg.goal }), 1600);
  const targets = seats.filter((seat) => seat.data).map((seat) => seat.center);
  while (targets.length < 12) targets.push({ x: 80 + Math.random() * 920, y: 1150 + Math.random() * 700 });
  const from = teacherHand();
  targets.forEach((to, i) => {
    fly(el('span', 'candy-bit', CANDIES[i % CANDIES.length]), from, to, { size: 54, ms: 900, lift: 160, delay: 300 + i * 70, onDone: () => sparks(to.x, to.y, 5) });
  });
  setTimeout(() => sparks(540, 700, 50), 200);
  setTimeout(() => {
    restart(card, 'hide');
    setTimeout(() => (card.hidden = true), 450);
  }, 5500);
}

// ---------- Nhận tin từ server ----------
function setPlayers(count) {
  $('players').textContent = count ? `👥 ${count} bạn có điểm` : '';
}

function applyGame(game) {
  solved.clear();
  for (const key of game.solved) solved.set(key, 1);
  setPlayers(game.players);
  setFund(game.fund);
  setPhoto(game.honor);
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
    buildMenu();
    buildGuide();
    $('photo-pin').src = guide.photoGift.icon;
    $('photo-how-icon').src = guide.photoGift.icon;
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
    toast([{ b: msg.name }, ` x2 điểm · ${msg.added} lượt`]);
  },
  // Quà nhỏ: tên đã hiện trên đầu bạn chạy lên đưa quà, không cần thêm thông báo.
  gift(msg) {
    pulseMenu(msg);
    if (msg.scene !== 'rose') toast(['❤ ', { b: msg.name }, msg.count > 1 ? ` x${msg.count}` : ''], { big: true, icon: msg.icon, avatar: msg.avatar, first: true });
    queueScene(msg);
  },
  honor(msg) {
    setPhoto(msg, { pop: true });
  },
  fund(msg) {
    setFund(msg);
  },
  candy(msg) {
    candyParty(msg);
  },
  wish,
};

const events = new EventSource('/events');
events.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  handlers[msg.type]?.(msg);
};
