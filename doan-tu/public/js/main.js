import { KID, KF, TF, TEACHER, MONITOR, MF, kidLook, kidFrame, teacherFrame, monitorFrame } from './art.js';
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
  for (const v of [...victims.values()]) dropVictim(v);
  wisher?.node.remove();
  wisher = null;
  monitorClear();
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
      // Ngủ gật: 💤 bay lên trên đầu.
      const zzz = el('div', 'zzz', '💤');
      Object.assign(zzz.style, { left: `${cardCenter}px`, top: `${spriteTop - size * 0.3}px`, fontSize: `${size * 0.8}px`, zIndex: 100 });

      seat.append(sprite, plate, score, card, badge, turns, zzz);
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

function walkTo(key, look, index, from, victim = null) {
  const seat = seats[index];
  // Đang đứng trên bục chúc cô, hoặc đang bị thầy giám thị kéo ra, thì không đi đổi chỗ; lúc về sẽ về thẳng chỗ mới.
  if (wisher?.key === key || dragKey === key) {
    seat.root.classList.add('arriving');
    return;
  }
  const old = walkers.get(key);
  const start = old ? { x: old.x, y: old.y } : from ?? { x: DOOR.x, y: DOOR.y };
  const end = seat.foot;
  // Lớp hết chỗ: bạn mới vào ghé chỗ bạn bị mất chỗ, đứng phía lối giữa đá đít bạn ấy, rồi mới về chỗ mình.
  const kick = victim ?? (old?.kick && !old.kick.done ? old.kick : null);
  const spot = kick && { x: kick.x + (kick.x < AISLE_X ? KICK_GAP : -KICK_GAP), y: kick.y };
  const points = spot ? [start, { x: AISLE_X, y: start.y }, { x: AISLE_X, y: spot.y }, spot, { x: AISLE_X, y: spot.y }, { x: AISLE_X, y: end.y }, end] : [start, { x: AISLE_X, y: start.y }, { x: AISLE_X, y: end.y }, end];
  const path = points.filter((p, i, list) => i === 0 || p === spot || Math.hypot(p.x - list[i - 1].x, p.y - list[i - 1].y) > 1);
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
  Object.assign(w, { variant: kidLook(look).variant, path, seg: 1, x: start.x, y: start.y, seatIndex: index, key, kick, kickAt: spot ? path.indexOf(spot) : -1, hold: 0 });
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
    // Đang đứng đá: đứng yên một nhịp rồi đi tiếp về chỗ.
    if (w.hold > 0) {
      w.hold -= dt;
      continue;
    }
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
        if (w.kick && w.seg - 1 === w.kickAt) {
          kickOut(w);
          budget = 0;
        }
      } else {
        w.x += (dx / len) * budget;
        w.y += (dy / len) * budget;
        budget = 0;
      }
    }
    if (w.hold > 0) continue;
    if (w.seg >= w.path.length) arrive(w);
    else placeWalker(w, dx, dy);
  }
}

// ---------- Lớp hết chỗ: bạn mới vào đá đít bạn bị mất chỗ bay ra khỏi lớp ----------
// Bạn bị mất chỗ ngồi yên ở chỗ cũ (đã rời bảng điểm) tới khi bạn mới tới đá; bạn mới không đi được (đông quá) thì quá KICK_WAIT_MS tự bay.
const KICK_GAP = 58;
const KICK_HOLD = 0.6;
const KICK_WAIT_MS = 9000;
const MAX_KICKS = 3;
const KICK_CRIES = ['Á á á!', 'Oái!', 'Ui da!', 'Bay đây!', 'Chỗ của tui mà!'];
const victims = new Map(); // key -> bạn đang chờ bị đá

function makeVictim({ key, name, look, x, y, seated }, kickerName) {
  const node = el('div', 'walker victim');
  const kid = el('i', 'kid');
  node.append(kid, el('span', 'visitor-name', name));
  $('class').append(node);
  const { variant, flip } = kidLook(look);
  const v = { key, name, kickerName, node, kid, variant, x, y, done: false };
  const { s, z } = depthAt(y);
  const d = KID_SIZE * s;
  Object.assign(node.style, { left: `${x - (KID.FW * d) / 2}px`, top: `${y - KID.FH * d}px`, width: `${KID.FW * d}px`, height: `${KID.FH * d}px`, zIndex: z });
  kidFrame(kid, variant, seated ? KF.sit : KF.down[0], flip);
  v.timer = setTimeout(() => launchVictim(v), KICK_WAIT_MS);
  victims.set(key, v);
  return v;
}

function dropVictim(v) {
  v.done = true;
  clearTimeout(v.timer);
  victims.delete(v.key);
  v.node.remove();
}

function kickOut(w) {
  const v = w.kick;
  w.kick = null;
  if (!v || v.done) return;
  w.hold = KICK_HOLD;
  // Quay ngang về phía bạn bị đá, nhún tới một cái.
  const dir = v.x > w.x ? 1 : -1;
  placeWalker(w, dir, 0);
  kidFrame(w.kid, w.variant, KF.left[1], dir > 0);
  w.kid.animate([{ translate: '0 0' }, { translate: `${dir * 22}px -6px`, offset: 0.35 }, { translate: '0 0' }], { duration: 380, easing: 'ease-out' });
  setTimeout(() => launchVictim(v), 120);
}

// Bay vòng lên rồi ra khỏi mép lớp phía tường gần nhất, xoay tròn.
function launchVictim(v) {
  if (v.done) return;
  v.done = true;
  clearTimeout(v.timer);
  victims.delete(v.key);
  const dir = v.x < AISLE_X ? -1 : 1;
  kidFrame(v.kid, v.variant, KF.wave, dir > 0);
  v.node.style.zIndex = 190;
  v.node.append(el('div', `kick-say${dir < 0 ? ' right' : ''}`, KICK_CRIES[Math.floor(Math.random() * KICK_CRIES.length)]));
  sfx.kick();
  const boom = el('span', 'kick-boom', '💥');
  Object.assign(boom.style, { left: `${v.x - dir * 30 - 30}px`, top: `${v.y - 90}px` });
  fx.append(boom);
  boom.animate([{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(1.4)', opacity: 1, offset: 0.4 }, { transform: 'scale(1.6)', opacity: 0 }], { duration: 600, easing: 'ease-out' }).onfinish = () => boom.remove();
  sparks(v.x, v.y - 60, 14);
  const dx = dir > 0 ? W - v.x + 240 : -(v.x + 240);
  const lift = 260 + Math.random() * 120;
  const ms = 1150;
  v.kid.animate([{ rotate: '0deg' }, { rotate: `${dir * 720}deg` }], { duration: ms, easing: 'linear', fill: 'forwards' });
  v.node.animate(
    [
      { transform: 'translate(0, 0) scale(1)' },
      { transform: `translate(${dx * 0.4}px, ${-lift}px) scale(1.2)`, offset: 0.45 },
      { transform: `translate(${dx}px, ${-lift * 0.5}px) scale(.9)` },
    ],
    { duration: ms, easing: 'cubic-bezier(.25,.6,.45,1)', fill: 'forwards' },
  ).onfinish = () => v.node.remove();
  if (v.kickerName) toast(['🦶 ', { b: v.kickerName }, ' đá ', { b: v.name }, ' ra khỏi lớp']);
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
  for (const v of [...victims.values()]) if (keys.has(v.key)) dropVictim(v);
  // Bạn rời lớp vì có bạn mới vào (không phải bị thầy giám thị kéo ra, không phải đang lên chúc cô): chờ bị đá.
  const leavers = walk
    ? [...before]
        .filter(([key]) => !keys.has(key) && key !== wisher?.key && key !== dragKey && !expelled.has(key))
        .map(([key, i]) => {
          const walking = walkers.get(key);
          const { name, look } = seats[i].data;
          return { key, name, look, x: walking?.x ?? seats[i].foot.x, y: walking?.y ?? seats[i].foot.y, seated: !walking };
        })
    : [];
  expelled.clear();
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
    seat.root.classList.toggle('sleepy', Boolean(player?.sleepy));
    const top = player && player.score > 0 && i < 3 ? i + 1 : 0;
    for (let n = 1; n <= 3; n++) seat.root.classList.toggle(`top-${n}`, top === n);
    seat.badge.textContent = top ? TITLES[top - 1] : '';
    if (player) markSolved(seat, player.key);
    else setUp(seat, false);
  });
  // Đông người đổi chỗ cùng lúc thì chỉ vài bạn đi (ưu tiên bạn mới vào lớp), còn lại ngồi luôn.
  // Bạn mới vào mà có bạn vừa mất chỗ thì ghé đá bạn ấy trước (tối đa MAX_KICKS cảnh cùng lúc, bạn còn lại rời lớp luôn).
  moves.sort((a, b) => (a.from === undefined ? 0 : 1) - (b.from === undefined ? 0 : 1));
  let kicks = 0;
  moves.forEach(({ index, player, from }, n) => {
    if (n < MAX_WALKERS || walkers.has(player.key)) {
      const victim = from === undefined && kicks < Math.min(MAX_KICKS, leavers.length) ? makeVictim(leavers[kicks++], player.name) : null;
      walkTo(player.key, player.look, index, from === undefined ? null : seats[from].foot, victim);
    } else restart(seats[index].root, 'popin');
  });
  if (wisher) {
    const index = seatOf(wisher.key);
    if (index >= 0) seats[index].root.classList.add('arriving');
  }
  if (dragKey) {
    const index = seatOf(dragKey);
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
  // Không tràn sang ghế VIP dưới mép trái bảng (#vip, mép phải khoảng x = 205).
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
  dancerTick(dt);
  wisherTick(dt);
  monitorTick(dt);
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
    runScenes();
    return;
  }
  restart(box, 'hide');
  spotTimer = setTimeout(() => {
    box.hidden = true;
    runScenes();
  }, 450);
}


// ---------- Quà: cảnh vui trong lớp (không đụng tới điểm) ----------
// rose: chibi của người gửi chạy từ cửa lên đưa quà cho cô. kem: chạy lên giữa bục nhảy một bài khoảng 5 giây, ảnh đại diện hiện trên đầu.
// pig: người gửi cưỡi heo chạy một vòng quanh lớp, cô giật mình rồi reo. Xong cảnh, quà bay vào quỹ lớp.
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
    // Kem: chờ khung "bạn nhanh nhất" tắt rồi mới lên nhảy, kẻo bị che.
    const free = row.scene === 'pig' ? !pigBusy : row.scene === 'kem' ? !dancer && $('spotlight').hidden : visitorsOut < MAX_VISITORS;
    if (!free) {
      i++;
      continue;
    }
    sceneQueue.splice(i, 1);
    if (row.scene === 'pig') pigRun(row);
    else if (row.scene === 'kem') danceShow(row);
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
  const hand = teacherHand();
  fly(giftImage(row.icon, sceneIcon(row.scene)), from, hand, {
    size: 84,
    ms: 600,
    lift: 70,
    onDone: () => {
      sparks(hand.x, hand.y, 12);
      hearts(hand.x, hand.y - 30, 3);
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

// ---------- Kem: người gửi chạy lên giữa bục nhảy một bài trước lớp, ảnh đại diện TikTok hiện trên đầu ----------
// Mỗi lúc một bạn nhảy (người gửi sau chờ tới lượt). Nhảy xong quà bay vào quỹ lớp, bạn chạy ra cửa.
const DANCE_MS = 5000;
const DANCER_SIZE = 1;
const DANCE_X = AISLE_X;
const DANCE_BEAT = 0.29;
// Dáng nhảy theo nhịp: giơ tay, nhún, lật trái phải, xoay lưng.
const DANCE_STEPS = [[KF.wave, false], [KF.down[0], false], [KF.wave, true], [KF.down[1], true], [KF.left[0], false], [KF.left[1], true], [KF.wave, false], [KF.up[0], false]];
const NOTES = ['♪', '♫', '♬'];
let dancer = null;

function danceShow(row) {
  const look = kidLook(row.look);
  const node = el('div', 'walker visitor dancer');
  const kid = el('i', 'kid');
  const held = giftImage(row.icon, sceneIcon(row.scene));
  held.className = 'held';
  // Ảnh TikTok, không tải được thì mặt chibi.
  const face = el('div', 'dance-face');
  const chibi = el('i', 'kid');
  kidFrame(chibi, look.variant, KF.wave, look.flip);
  face.append(chibi);
  if (row.avatar) {
    const img = Object.assign(new Image(), { src: row.avatar, alt: '', referrerPolicy: 'no-referrer' });
    img.onerror = () => img.remove();
    face.append(img);
  }
  const star = el('div', 'dance-star');
  star.append(face, el('span', 'dance-name', row.count > 1 ? `${row.name} x${row.count}` : row.name));
  star.hidden = true;
  node.append(el('i', 'dance-rays'), kid, held, star, el('span', 'visitor-name', row.name));
  $('class').append(node);
  node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  dancer = { row, node, kid, held, star, variant: look.variant, x: DOOR.x, t: 0, stage: 'in', wait: 0, noteAt: 0 };
  placeDancer(dancer, 1);
  ensureLoop();
}

function placeDancer(d, dx) {
  const width = KID.FW * DANCER_SIZE;
  const height = KID.FH * DANCER_SIZE;
  // Nằm trên cả khung "bạn nhanh nhất" nếu lúc đang nhảy thì tới giờ công bố.
  Object.assign(d.node.style, { left: `${d.x - width / 2}px`, top: `${DOOR.y - height}px`, width: `${width}px`, height: `${height}px`, zIndex: 185 });
  if (d.stage === 'dance') {
    const [frame, flip] = DANCE_STEPS[Math.floor(d.t / DANCE_BEAT) % DANCE_STEPS.length];
    kidFrame(d.kid, d.variant, frame, flip);
  } else kidFrame(d.kid, d.variant, KF.left[Math.floor(d.t / 0.12) % 2], dx > 0);
}

function dancerTick(dt) {
  const d = dancer;
  if (!d) return;
  d.t += dt;
  if (d.stage === 'dance') {
    d.wait -= dt;
    if (d.t >= d.noteAt) {
      d.noteAt = d.t + 0.4;
      danceNote(d);
    }
    placeDancer(d, 0);
    if (d.wait <= 0) danceEnd(d);
    return;
  }
  const goal = d.stage === 'in' ? DANCE_X : DOOR.x;
  const dx = goal - d.x;
  const step = 560 * dt;
  if (Math.abs(dx) > step) d.x += Math.sign(dx) * step;
  else if (d.stage === 'in') {
    d.x = goal;
    danceStart(d);
  } else {
    dancer = null;
    d.node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).onfinish = () => d.node.remove();
    runScenes();
    return;
  }
  placeDancer(d, dx);
}

function danceStart(d) {
  d.stage = 'dance';
  d.t = 0;
  d.wait = DANCE_MS / 1000;
  d.node.classList.add('dancing');
  d.star.hidden = false;
  // Lời cô và thông báo nhường chỗ cho bạn đang nhảy.
  stage.classList.add('dance-on');
  sfx.dance();
  teacherAct('happy', 1900);
  sparks(d.x, DOOR.y - 120, 24);
}

function danceEnd(d) {
  d.stage = 'out';
  d.node.classList.remove('dancing');
  d.star.hidden = true;
  d.held.hidden = true;
  stage.classList.remove('dance-on');
  const from = { x: d.x + 20, y: DOOR.y - KID.FH * DANCER_SIZE * 0.95 };
  teacherAct('cheer', 1600);
  sparks(from.x, from.y, 22);
  hearts(d.x, from.y - 20, 6);
  giftToFund(d.row.icon, d.row.scene, from);
}

function danceNote(d) {
  const node = el('span', 'dance-note', NOTES[Math.floor(Math.random() * NOTES.length)]);
  const side = Math.random() < 0.5 ? -1 : 1;
  Object.assign(node.style, { left: `${d.x + side * (60 + Math.random() * 50)}px`, top: `${DOOR.y - 140 - Math.random() * 60}px`, color: ['#ff6f91', '#ffd84d', '#7bdff2', '#b2f7a1'][Math.floor(Math.random() * 4)] });
  fx.append(node);
  node.animate([{ transform: 'translate(0, 0) scale(.5)', opacity: 0 }, { transform: `translate(${side * 10}px, -30px) scale(1.2)`, opacity: 1, offset: 0.25 }, { transform: `translate(${side * 40}px, -130px) scale(1)`, opacity: 0 }], { duration: 1400, easing: 'ease-out' }).onfinish = () => node.remove();
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

// Cưỡi heo: chibi của người gửi ngồi trên lưng heo vẫy tay, chạy vòng quanh lớp: từ cửa sang phải, xuống cuối lớp, sang trái,
// lên lại bục giảng tới chỗ cô.
function pigRun(row) {
  pigBusy = true;
  const size = 160;
  const node = el('div', 'pig');
  const body = el('div', 'pig-body');
  const img = giftImage(row.icon, sceneIcon('pig'));
  const rider = el('i', 'kid pig-rider');
  const look = kidLook(row.look);
  kidFrame(rider, look.variant, KF.wave, look.flip);
  body.append(img, rider);
  node.append(body, el('span', 'visitor-name', row.count > 1 ? `${row.name} x${row.count}` : row.name));
  Object.assign(node.style, { width: `${size}px`, height: `${size}px` });
  fx.append(node);
  const end = { x: Math.max(200, teacher.x - 150), y: 1040 };
  // Hai đoạn chạy dọc cách mép đủ xa để tên trên đầu không bị cắt.
  const points = [{ x: DOOR.x + 30, y: 1050 }, { x: 945, y: 1090 }, { x: 945, y: 1850 }, { x: 140, y: 1850 }, { x: 140, y: 1120 }, end];
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  const total = lengths.reduce((a, b) => a + b, 0);
  const ms = (total / 640) * 1000;
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
  // Heo và bạn cưỡi quay mặt cùng nhau.
  body.animate(faces, { duration: ms, fill: 'forwards' });
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
    // Tới chỗ cô: bạn cưỡi heo nhảy lên reo một cái.
    node.classList.add('arrived');
    setTimeout(() => {
      const from = stagePoint(img);
      node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).onfinish = () => node.remove();
      giftToFund(row.icon, 'pig', from);
      pigBusy = false;
      runScenes();
    }, 1100);
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
  if (wisher || index < 0 || walkers.has(msg.key) || dragKey === msg.key) return;
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

// ---------- Thầy giám thị: kéo tai bạn ngủ gật ra khỏi lớp ----------
// Server chọn bạn (ngồi trong lớp mà im lặng mấy từ liền) và cho msg.ms để diễn: thầy từ cửa lớp theo lối giữa tới chỗ bạn ấy,
// thổi còi mắng một câu, rồi kéo tai bạn ra cửa. Hết msg.ms server báo 'expel': kịp comment thì được về chỗ, không thì rời lớp.
// Hình thầy: ảnh public/chibi/thay-giam-thi.webp nếu có (xem PROMPT-CHIBI.md), chưa có thì vẽ tạm bằng SVG.
const MON_H = 300; // chiều cao thầy ở độ sâu s = 1, đứng ở cửa lớp thì bằng cô giáo
const MON_IN = 0.36; // phần thời gian đi tới chỗ bạn ngủ gật
const MON_GRAB = 0.16; // đứng mắng
const MON_OUT = 0.4; // kéo ra cửa
const MON_SVG = `<svg viewBox="0 0 120 170" aria-hidden="true">
  <g class="m-leg m-leg-l"><path d="M47 116v40" stroke="#5a3a24" stroke-width="17" stroke-linecap="round"/><path d="M47 116v40" stroke="#33405f" stroke-width="13" stroke-linecap="round"/><ellipse cx="44" cy="161" rx="11" ry="6" fill="#2b1d14"/></g>
  <g class="m-leg m-leg-r"><path d="M73 116v40" stroke="#5a3a24" stroke-width="17" stroke-linecap="round"/><path d="M73 116v40" stroke="#33405f" stroke-width="13" stroke-linecap="round"/><ellipse cx="76" cy="161" rx="11" ry="6" fill="#2b1d14"/></g>
  <path d="M38 80Q60 71 82 80L87 121Q60 128 33 121Z" fill="#fffdf6" stroke="#5a3a24" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M34 113H86L87 123Q60 130 33 123Z" fill="#33405f" stroke="#5a3a24" stroke-width="2" stroke-linejoin="round"/>
  <rect x="34" y="111" width="52" height="5" fill="#3a2414"/><rect x="56" y="110" width="8" height="7" rx="1" fill="#f0c95a"/>
  <path d="M57 78h6l2 6-3 22-2 4-2-4-3-22z" fill="#c8323c" stroke="#7a1f25" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M49 76l9 8 2-6 2 6 9-8" fill="#fffdf6" stroke="#5a3a24" stroke-width="2" stroke-linejoin="round"/>
  <g class="m-arm m-arm-l"><path d="M37 84L30 112" stroke="#5a3a24" stroke-width="15" stroke-linecap="round"/><path d="M37 84L30 112" stroke="#fffdf6" stroke-width="10.5" stroke-linecap="round"/><path d="M35.6 92L33.4 101" stroke="#d8343f" stroke-width="11.5"/><path d="M35.2 95.5l-1.2 4" stroke="#ffd84d" stroke-width="2.4"/><circle cx="29" cy="116" r="6" fill="#f9d7b5" stroke="#5a3a24" stroke-width="2"/></g>
  <g class="m-arm m-arm-r"><path d="M83 84L90 112" stroke="#5a3a24" stroke-width="15" stroke-linecap="round"/><path d="M83 84L90 112" stroke="#fffdf6" stroke-width="10.5" stroke-linecap="round"/><circle cx="91" cy="116" r="6" fill="#f9d7b5" stroke="#5a3a24" stroke-width="2"/></g>
  <circle cx="29" cy="47" r="6" fill="#f9d7b5" stroke="#5a3a24" stroke-width="2"/><circle cx="91" cy="47" r="6" fill="#f9d7b5" stroke="#5a3a24" stroke-width="2"/>
  <ellipse cx="60" cy="45" rx="31" ry="30" fill="#f9d7b5" stroke="#5a3a24" stroke-width="2.5"/>
  <path d="M29 44Q27 12 60 11Q93 12 91 44Q88 28 75 25Q64 33 45 27Q33 31 29 44Z" fill="#2a2320" stroke="#15100e" stroke-width="2" stroke-linejoin="round"/>
  <path class="m-brow" d="M39 34l15 5M81 34l-15 5" stroke="#2a2320" stroke-width="4.5" stroke-linecap="round"/>
  <circle cx="47" cy="48" r="3.2" fill="#2a1d14"/><circle cx="73" cy="48" r="3.2" fill="#2a1d14"/>
  <circle cx="47" cy="48" r="9.5" fill="rgba(255,255,255,.3)" stroke="#3a2a20" stroke-width="2.6"/><circle cx="73" cy="48" r="9.5" fill="rgba(255,255,255,.3)" stroke="#3a2a20" stroke-width="2.6"/><path d="M56.5 48h7" stroke="#3a2a20" stroke-width="2.6"/>
  <path d="M49 62Q55 57 60 60Q65 57 71 62Q65 65 60 63Q55 65 49 62Z" fill="#2a2320"/>
  <path class="m-mouth" d="M55 69Q60 66.5 65 69" stroke="#5a3a24" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <ellipse class="m-shout" cx="60" cy="69.5" rx="5" ry="4.5" fill="#8a2c2c" stroke="#5a3a24" stroke-width="1.6"/>
  <path class="m-vein" d="M80 18q3 3 0 6M86 18q-3 3 0 6M80 18q3-3 6 0M80 24q3 3 6 0" stroke="#e8343f" stroke-width="2.4" fill="none" stroke-linecap="round"/>
</svg>`;
const monSheet = { size: null }; // { FW, FH } khi tải được ảnh thầy
{
  const img = new Image();
  img.onload = () => (monSheet.size = { FW: img.naturalWidth / MONITOR.COLS, FH: img.naturalHeight / MONITOR.ROWS });
  img.src = '/chibi/thay-giam-thi.webp';
}
let monitor = null; // thầy đang trong lớp
let dragKey = null; // bạn đang bị kéo: chỗ ngồi để trống tới khi server báo 'expel'
const expelled = new Set(); // vừa bị thầy kéo ra: bảng điểm tới sau đưa ra khỏi lớp, không phải bị bạn mới đá

// Đứng cạnh chỗ bạn ngủ gật, phía lối giữa.
const monitorSpot = (foot) => ({ x: foot.x + (foot.x < AISLE_X ? 62 : -62), y: foot.y + 4 });

function monitorCome(msg) {
  monitorClear();
  const index = seatOf(msg.key);
  if (index < 0 || wisher?.key === msg.key) return;
  const node = el('div', 'monitor');
  const body = el('div', monSheet.size ? 'mon-sheet' : 'mon-svg');
  if (!monSheet.size) body.innerHTML = MON_SVG;
  const say = el('div', 'mon-say', msg.line);
  say.hidden = true;
  node.append(body, el('span', 'visitor-name mon-tag', 'Thầy giám thị'), say);
  $('class').append(node);
  node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  const spot = monitorSpot(seats[index].foot);
  const start = { x: DOOR.x, y: DOOR.y };
  const path = [start, { x: AISLE_X, y: DOOR.y }, { x: AISLE_X, y: spot.y }, spot];
  monitor = { msg, node, body, say, path, seg: 1, x: start.x, y: start.y, t: 0, stage: 'in', speed: Math.max(300, pathLength(path) / ((msg.ms * MON_IN) / 1000)), wait: 0, kid: null };
  placeMonitor(monitor, 1, 0);
  sfx.whistle();
  ensureLoop();
}

function placeMonitor(m, dx, dy) {
  const { s, z } = depthAt(m.y);
  const h = MON_H * s;
  const w = monSheet.size ? (h * monSheet.size.FW) / monSheet.size.FH : h * 0.71;
  Object.assign(m.node.style, { left: `${m.x - w / 2}px`, top: `${m.y - h}px`, width: `${w}px`, height: `${h}px`, zIndex: z });
  // Lời thầy nằm bên phía giữa màn hình cho khỏi tràn ra mép.
  m.say.classList.toggle('right', m.x < W / 2);
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const walking = dx || dy;
  const pulling = m.stage === 'out' && m.kid;
  // Đứng mắng thì quay về phía bạn ngủ gật (dáng mắng chỉ sang trái, bạn ấy ở bên phải thì lật).
  const flip = m.stage === 'grab' ? Boolean(m.faceRight) : horizontal && dx > 0;
  m.node.className = `monitor${walking ? ' walk' : ''}${m.stage === 'grab' ? ' scold' : ''}${pulling && horizontal ? ' pull' : ''}`;
  if (!monSheet.size) {
    m.body.style.scale = flip ? '-1 1' : '';
    return;
  }
  const step = Math.floor(m.t / 0.16) % 2;
  let frame = MF.stand;
  if (m.stage === 'grab') frame = MF.scold;
  else if (walking) frame = horizontal ? (pulling ? MF.pull : MF.left)[step] : (dy < 0 ? MF.up : MF.down)[step];
  monitorFrame(m.body, frame, flip);
}

// Đi theo đường m.path với tốc độ m.speed, trả về hướng vừa đi.
function stepPath(m, dt) {
  let budget = m.speed * dt;
  let dx = 0;
  let dy = 0;
  while (budget > 0 && m.seg < m.path.length) {
    const p = m.path[m.seg];
    dx = p.x - m.x;
    dy = p.y - m.y;
    const len = Math.hypot(dx, dy);
    if (len <= budget) {
      m.x = p.x;
      m.y = p.y;
      budget -= len;
      m.seg++;
    } else {
      m.x += (dx / len) * budget;
      m.y += (dy / len) * budget;
      budget = 0;
    }
  }
  return { dx, dy };
}

function monitorTick(dt) {
  const m = monitor;
  if (!m || m.stage === 'gone') return;
  m.t += dt;
  if (m.stage === 'grab') {
    m.wait -= dt;
    placeMonitor(m, 0, 0);
    if (m.wait <= 0) monitorDrag(m);
    return;
  }
  // Bạn ngủ gật có thể đã đổi chỗ trong lúc thầy đi tới.
  if (m.stage === 'in') {
    const index = seatOf(m.msg.key);
    if (index >= 0) {
      const spot = monitorSpot(seats[index].foot);
      m.path[m.path.length - 1] = spot;
      if (m.seg <= 2) m.path[2].y = spot.y;
    }
  }
  const { dx, dy } = stepPath(m, dt);
  if (m.kid) dragKid(m, dt);
  if (m.seg < m.path.length) placeMonitor(m, dx, dy);
  else if (m.stage === 'in') monitorGrab(m);
  else monitorLeave(m);
}

// Tới chỗ: thổi còi, mắng; bạn ngủ gật đứng dậy (chỗ ngồi để trống).
function monitorGrab(m) {
  m.stage = 'grab';
  m.wait = (m.msg.ms * MON_GRAB) / 1000;
  m.say.hidden = !m.msg.line;
  const target = seatOf(m.msg.key);
  m.faceRight = target >= 0 && seats[target].foot.x > m.x;
  placeMonitor(m, 0, 0);
  sfx.whistle();
  const index = seatOf(m.msg.key);
  if (index < 0) return;
  const seat = seats[index];
  const walking = walkers.get(m.msg.key);
  const from = walking ? { x: walking.x, y: walking.y } : { ...seat.foot };
  stopWalker(m.msg.key);
  dragKey = m.msg.key;
  seat.root.classList.add('arriving');
  const node = el('div', 'walker dragged');
  const kid = el('i', 'kid');
  const cry = el('div', 'drag-say', m.msg.reply);
  cry.hidden = true;
  node.append(kid, el('span', 'visitor-name', m.msg.name), cry);
  $('class').append(node);
  m.kid = { node, kid, cry, variant: kidLook(seat.look).variant, x: from.x, y: from.y, t: 0 };
  m.trail = [from, { x: m.x, y: m.y }];
  placeWalker(m.kid, 0, 1);
}

function monitorDrag(m) {
  m.stage = 'out';
  m.say.hidden = true;
  const door = { x: DOOR.x - 30, y: DOOR.y };
  m.path = [{ x: m.x, y: m.y }, { x: AISLE_X, y: m.y }, { x: AISLE_X, y: DOOR.y }, door];
  m.seg = 1;
  m.speed = Math.max(300, pathLength(m.path) / ((m.msg.ms * MON_OUT) / 1000));
  if (m.kid) {
    m.kid.cry.hidden = !m.msg.reply;
    m.kid.node.classList.add('caught');
    sfx.ouch();
  }
}

// Bạn bị kéo đi theo sau thầy (theo đúng đường thầy vừa đi), tay thầy nắm tai bạn.
function dragKid(m, dt) {
  const k = m.kid;
  m.trail.push({ x: m.x, y: m.y });
  let left = MON_H * depthAt(m.y).s * 0.27;
  let at = m.trail[0];
  for (let i = m.trail.length - 1; i > 0; i--) {
    const a = m.trail[i];
    const b = m.trail[i - 1];
    const len = Math.hypot(a.x - b.x, a.y - b.y);
    if (len >= left) {
      at = { x: a.x + ((b.x - a.x) * left) / len, y: a.y + ((b.y - a.y) * left) / len };
      break;
    }
    left -= len;
  }
  const dx = at.x - k.x;
  const dy = at.y - k.y;
  k.t += dt;
  k.x = at.x;
  k.y = at.y;
  if (!dx && !dy) return;
  placeWalker(k, dx, dy);
  // Đầu nghiêng về phía tay thầy.
  k.kid.style.rotate = Math.abs(dx) > Math.abs(dy) ? `${dx < 0 ? -12 : 12}deg` : '';
  k.cry.classList.toggle('right', k.x < W / 2);
}

function monitorLeave(m) {
  m.stage = 'gone';
  const nodes = [m.node, m.kid?.node].filter(Boolean);
  for (const node of nodes) node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).onfinish = () => node.remove();
  m.kid = null;
}

// Xoá hết cảnh (mở lại trang, xóa bảng điểm): ai đang bị kéo thì ngồi lại chỗ.
function monitorClear() {
  if (monitor) {
    monitor.node.remove();
    monitor.kid?.node.remove();
    monitor = null;
  }
  if (dragKey) {
    const index = seatOf(dragKey);
    dragKey = null;
    if (index >= 0 && !walkers.has(seats[index].data.key)) seats[index].root.classList.remove('arriving');
  }
}

// Server báo xong: kịp comment thì thầy tha, bạn đi từ chỗ đang đứng (hoặc từ cửa) về chỗ; không thì bảng điểm mới đưa bạn ra khỏi lớp.
function monitorDone(msg) {
  if (dragKey === msg.key) dragKey = null;
  const m = monitor?.msg.key === msg.key ? monitor : null;
  if (msg.woke) {
    let from = null;
    if (m?.kid) {
      from = { x: m.kid.x, y: m.kid.y };
      m.kid.node.remove();
      m.kid = null;
    }
    const index = seatOf(msg.key);
    if (index >= 0) walkTo(msg.key, seats[index].look, index, from);
    toast(['☀️ ', { b: msg.name }, ' tỉnh rồi, thầy cho về chỗ']);
  } else {
    expelled.add(msg.key);
    toast(['😴 ', { b: msg.name }, ' ngủ gật · thầy mời ra khỏi lớp']);
  }
  // Màn hình chậm hơn server (cửa sổ bị ẩn...): thầy chưa kéo ra tới nơi thì thôi khỏi diễn tiếp.
  if (m && m.stage !== 'out' && m.stage !== 'gone') monitorLeave(m);
}

// ---------- Ghế VIP và quỹ lớp ----------
// Người gửi Tim cam cuối cùng ngồi ghế VIP: chibi của bạn ấy quay mặt ra người xem vẫy tay, ảnh TikTok trên lưng ghế
// (không tải được thì mặt chibi). Chưa có ai thì ghế trống chỉ cách lên.
function setVip(honor, { pop = false } = {}) {
  const box = $('vip');
  box.classList.toggle('empty', !honor);
  $('vip-name').textContent = honor?.name ?? '';
  const img = $('vip-img');
  const face = $('vip-face');
  if (!honor) {
    img.hidden = true;
    face.hidden = true;
    return;
  }
  const { variant, flip } = kidLook(honor.look);
  kidFrame($('vip-kid').firstElementChild, variant, KF.wave, flip);
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
    const p = stagePoint($('vip-kid'));
    sparks(p.x, p.y, 34);
    hearts(p.x, p.y - 40, 5);
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
  setVip(game.honor);
  monitorClear();
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
    $('vip-how-icon').src = guide.photoGift.icon;
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
      seat.root.classList.remove('sleepy');
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
  // Quà nhỏ: tên đã hiện trên đầu bạn chạy lên đưa quà, không cần thêm thông báo. Kem: bạn nhảy đã có ảnh và tên to.
  gift(msg) {
    pulseMenu(msg);
    if (msg.scene === 'pig') toast(['❤ ', { b: msg.name }, msg.count > 1 ? ` x${msg.count}` : ''], { big: true, icon: msg.icon, avatar: msg.avatar, first: true });
    queueScene(msg);
  },
  honor(msg) {
    setVip(msg, { pop: true });
  },
  fund(msg) {
    setFund(msg);
  },
  candy(msg) {
    candyParty(msg);
  },
  wish,
  monitor: monitorCome,
  expel: monitorDone,
};

const events = new EventSource('/events');
events.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  handlers[msg.type]?.(msg);
};
