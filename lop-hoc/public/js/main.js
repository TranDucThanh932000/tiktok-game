import { studentSvg, teacherSvg } from './art.js';
import { sfx, wake, onAudioState, speak, stopSpeech } from './audio.js';

const W = 1080;
const H = 1920;
const LETTERS = ['A', 'B', 'C', 'D'];
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

$('teacher').innerHTML = teacherSvg();

// ---------- Chỗ ngồi: mỗi hàng 5 + 5, số hàng theo sĩ số, càng xuống dưới càng gần và càng to ----------
// Các hàng giãn ra cho kín từ bục giảng tới đáy màn hình.
const PER_ROW = 10;
const PER_BLOCK = PER_ROW / 2;
const SCALE_BACK = 0.72;
const SCALE_FRONT = 1.02;
const ROWS_TOP = 1036;
const ROWS_BOTTOM = 1912;
const AISLE = 34;
const PLATE_H = 36;

const seats = [];
function buildClass(total, vipSeats = 0) {
  const root = $('class');
  root.replaceChildren();
  seats.length = 0;
  const ROWS = Math.ceil(total / PER_ROW);
  const scales = Array.from({ length: ROWS }, (_, row) => SCALE_BACK + ((SCALE_FRONT - SCALE_BACK) * row) / Math.max(1, ROWS - 1));
  const baseH = (ROWS_BOTTOM - ROWS_TOP) / scales.reduce((sum, s) => sum + s, 0);
  let y = ROWS_TOP;
  for (let row = 0; row < ROWS; row++) {
    const s = scales[row];
    const rowH = baseH * s;
    const rowW = 1020 + ((1064 - 1020) * row) / Math.max(1, ROWS - 1);
    const cell = (rowW - AISLE) / PER_ROW;
    const left = (W - rowW) / 2;
    const z = row * 10 + 10;
    const plateH = Math.max(32, PLATE_H * s);
    const frontRow = row * PER_ROW < vipSeats;

    for (let block = 0; block < 2; block++) {
      const x = left + block * (cell * PER_BLOCK + AISLE);
      const desk = el('div', frontRow ? 'desk front' : 'desk');
      Object.assign(desk.style, { left: `${x}px`, top: `${y + rowH * 0.42}px`, width: `${cell * PER_BLOCK}px`, height: `${rowH * 0.2}px`, zIndex: z });
      const bench = el('div', frontRow ? 'bench front' : 'bench');
      Object.assign(bench.style, { left: `${x}px`, top: `${y + rowH - plateH + 2}px`, width: `${cell * PER_BLOCK}px`, height: `${plateH}px`, zIndex: z + 2 });
      root.append(desk, bench);
    }

    for (let col = 0; col < PER_ROW; col++) {
      if (seats.length >= total) break;
      const x = left + col * cell + (col >= PER_BLOCK ? AISLE : 0);
      const seat = el('div', 'seat ghost');
      Object.assign(seat.style, { left: `${x}px`, top: `${y}px`, width: `${cell}px`, height: `${rowH}px` });

      const look = seats.length * 7 + 3;
      const spriteW = 118 * s;
      const spriteH = (spriteW * 132) / 120;
      const sprite = el('div', 'sprite');
      Object.assign(sprite.style, { width: `${spriteW}px`, height: `${spriteH}px`, bottom: `${plateH - 12}px`, zIndex: z + 1 });
      sprite.innerHTML = studentSvg(look);

      const plate = el('div', 'plate');
      // Cùng một cỡ chữ cho mọi hàng: ô hàng dưới gần như không rộng hơn, chữ to thì mất tên.
      Object.assign(plate.style, { height: `${plateH}px`, fontSize: '19px', zIndex: z + 3 });
      const name = el('span', 'name');
      plate.append(name);
      // Điểm nằm trên bảng tên, để ô hẹp vẫn đủ chỗ cho tên.
      const score = el('div', 'score');
      Object.assign(score.style, { right: '2px', bottom: `${plateH + 2}px`, fontSize: `${Math.max(19, 22 * s)}px`, zIndex: z + 4 });

      // Thẻ đáp án nằm trong hàng của mình, cạnh đầu, để không che tên của hàng trên.
      // Ghế sát mép phải thì đẩy thẻ vào trong, kẻo bị cắt mất chữ.
      const spriteTop = rowH - plateH + 12 - spriteH;
      const size = Math.round(50 * s);
      const cardCenter = Math.min(x + cell / 2 + spriteW * 0.48, W - size / 2 - 4) - x;
      const card = el('div', 'card');
      Object.assign(card.style, { width: `${size}px`, height: `${size}px`, left: `${cardCenter}px`, top: `${spriteTop}px`, fontSize: `${size * 0.68}px`, zIndex: 100 });

      const badge = el('div', 'badge');
      Object.assign(badge.style, { left: '2px', top: `${spriteTop + 2}px`, zIndex: z + 4 });
      const turns = el('div', 'turns');
      Object.assign(turns.style, { left: '2px', bottom: `${plateH + 2}px`, zIndex: z + 4 });
      // Hình quà của bạn ngồi bàn đầu, cạnh đầu phía bên kia thẻ đáp án.
      const giftSize = Math.round(44 * s);
      const gift = Object.assign(new Image(), { className: 'gifticon', alt: '' });
      Object.assign(gift.style, { width: `${giftSize}px`, height: `${giftSize}px`, left: `${Math.max(0, cell / 2 - spriteW * 0.5 - giftSize * 0.4)}px`, top: `${spriteTop + spriteH * 0.18}px`, zIndex: z + 4 });
      const stars = el('div', 'stars');
      Object.assign(stars.style, { right: '2px', top: `${spriteTop + 2}px`, zIndex: z + 4 });

      seat.append(sprite, plate, score, card, badge, turns, gift, stars);
      root.append(seat);
      seats.push({ root: seat, sprite, name, score, card, badge, turns, gift, stars, data: null, ghostLook: look, center: { x: x + cell / 2, y: y + rowH * 0.3 } });
    }
    y += rowH;
  }
}

function setStudent(index, student, { pop = false } = {}) {
  const seat = seats[index];
  seat.data = student;
  seat.root.classList.toggle('ghost', !student);
  seat.sprite.innerHTML = studentSvg(student ? student.look : seat.ghostLook);
  seat.name.textContent = student?.name ?? '';
  seat.score.textContent = student?.score ?? '';
  setStars(index, student?.stars ?? 0);
  setTurns(index, student?.turns ?? 0);
  clearAnswer(index);
  seat.root.classList.remove('duelist');
  if (pop) restart(seat.root, 'popin');
}

// Còn lượt x2 thì không bị mời ra (khóa); có lượt từ quà thì thêm viền bàn đầu và hình quà.
function setTurns(index, turns) {
  const seat = seats[index];
  if (seat.data) seat.data.turns = turns;
  const vip = Boolean(seat.data?.patron && turns > 0);
  seat.root.classList.toggle('boosted', turns > 0);
  seat.root.classList.toggle('vip', vip);
  seat.turns.textContent = `🔒 x2 · ${turns}`;
  if (vip && seat.data.icon && seat.gift.getAttribute('src') !== seat.data.icon) seat.gift.src = seat.data.icon;
}

function setStars(index, stars) {
  const seat = seats[index];
  if (seat.data) seat.data.stars = stars;
  seat.stars.textContent = stars > 0 ? `⭐${stars > 1 ? stars : ''}` : '';
}

// Đổi chỗ hai ghế, giữ nguyên thẻ đáp án, đúng sai và thách đấu đang hiện.
const CARRIED = ['up', 'ok', 'wrong', 'duelist'];
function swapSeats(a, b) {
  const grab = (index) => {
    const { root, card, data } = seats[index];
    return { data, classes: CARRIED.filter((c) => root.classList.contains(c)), text: card.textContent, x2: card.classList.contains('x2') };
  };
  const put = (index, state) => {
    setStudent(index, state.data, { pop: Boolean(state.data) });
    const { root, card } = seats[index];
    CARRIED.forEach((c) => root.classList.toggle(c, state.classes.includes(c)));
    card.textContent = state.text;
    card.classList.toggle('x2', state.x2);
  };
  const [first, second] = [grab(a), grab(b)];
  put(a, second);
  put(b, first);
}

function restart(node, className) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

function clearAnswer(index) {
  const { root, card } = seats[index];
  root.classList.remove('up', 'ok', 'wrong');
  card.classList.remove('x2');
}

function showAnswer(index, choice, boosted) {
  const { root, card } = seats[index];
  card.textContent = LETTERS[choice];
  card.classList.toggle('x2', boosted);
  root.classList.add('up');
}

function setOfficerGlow(list) {
  seats.forEach((seat) => {
    seat.root.classList.remove('officer-1', 'officer-2', 'officer-3');
    seat.badge.textContent = '';
  });
  for (const officer of list) {
    const seat = seats[officer.seat];
    if (!seat) continue;
    seat.root.classList.add(`officer-${officer.rank + 1}`);
    seat.badge.textContent = officer.rank === 0 ? 'Lớp trưởng' : 'Lớp phó';
  }
}

function renderOfficers(list) {
  setOfficerGlow(list);
  const titles = ['Lớp trưởng', 'Lớp phó học tập', 'Lớp phó học tập'];
  $('officers').replaceChildren(
    ...titles.map((title, rank) => {
      const officer = list[rank];
      const box = el('div', officer ? 'officer on' : 'officer');
      box.append(el('label', '', title));
      const line = el('p');
      line.append(el('span', '', officer ? officer.name : '· · ·'));
      if (officer) line.append(el('b', '', officer.score));
      box.append(line);
      return box;
    }),
  );
}

// ---------- Bảng ----------
let guide = null;
let timerTotal = 1;
let timerEnds = 0;
let timerPhase = 'idle';
let lastTick = 0;

function setRoster(count, waiting) {
  $('roster').textContent = `Sĩ số ${count}/${guide.seats}${waiting ? ` · ${waiting} bạn chờ ngoài cửa` : ''}`;
}

function fitByLength(node, text, long, xlong) {
  node.classList.toggle('long', text.length > long);
  node.classList.toggle('xlong', text.length > xlong);
}

function showQuestion(msg) {
  $('play').hidden = false;
  $('recap').hidden = true;
  const q = msg.question;
  $('subject').textContent = q.subject;
  $('counter').textContent = `Tiết ${msg.period} · ${msg.inSet}/${msg.setSize}`;
  $('question').textContent = q.text;
  fitByLength($('question'), q.text, 44, 76);
  $('options').replaceChildren(
    ...q.options.map((text, i) => {
      const box = el('div', 'opt');
      box.append(el('b', '', LETTERS[i]), el('span', '', text), el('em'));
      fitByLength(box, text, 13, 24);
      return box;
    }),
  );
  setAskFootline(msg);
  setDuel(msg.duel);
}

function setAskFootline({ inSet, setSize }) {
  const foot = $('footline');
  const left = setSize - inSet;
  const closing = left === 0 ? 'Câu cuối tiết · ai làm lớp trưởng?' : left === 1 ? 'Còn 2 câu là hết tiết' : 'Đúng đầu tiên được x2 điểm';
  foot.replaceChildren(el('span', '', 'Comment A, B, C, D · '), el('small', '', 'Chat "VÀO" để vào lớp'), el('br'), el('span', left <= 1 ? 'closing' : '', closing));
}

// Thách đấu: băng rôn đổi thành "người thách ⚔ lớp trưởng", hai ghế được viền đỏ.
function setDuel(duel) {
  const banner = $('banner');
  seats.forEach((seat) => seat.root.classList.remove('duelist'));
  banner.classList.toggle('duel', Boolean(duel));
  if (!duel) {
    banner.textContent = guide?.title ?? '';
    return;
  }
  banner.replaceChildren(el('span', '', duel.challenger), el('i', '', 'thách đấu'), el('span', 'leader', `👑 ${duel.leader}`));
  for (const index of duel.seats) seats[index]?.root.classList.add('duelist');
}

function showDuelResult(duel, { quiet = false } = {}) {
  const banner = $('banner');
  banner.classList.add('duel', 'done');
  const winner = duel.outcome === 'won' ? duel.challenger : duel.leader;
  if (duel.outcome === 'void') banner.replaceChildren(el('span', '', `👑 ${duel.leader.name} giữ ghế`));
  else banner.replaceChildren(el('span', '', `🏆 ${winner.name} thắng`));
  for (const side of [duel.challenger, duel.leader]) {
    const seat = seats[side.seat];
    if (!seat?.data) continue;
    seat.data.score = side.score;
    seat.score.textContent = side.score;
  }
  if (quiet) return;
  const seat = seats[winner.seat];
  if (duel.outcome !== 'void' && seat) {
    sparks(seat.center.x, seat.center.y, 30);
    floatText(winner.seat, duel.outcome === 'won' ? '👑' : `+${duel.bonus}`);
  }
  if (duel.outcome === 'won') toast([{ b: duel.challenger.name }, ' thắng thách đấu, giành ghế lớp trưởng!'], { big: true, first: true });
  else if (duel.outcome === 'defended') toast(['Lớp trưởng ', { b: duel.leader.name }, ` giữ ghế · +${duel.bonus} điểm`], { big: true, first: true });
  else toast(['Không ai thắng · ', { b: duel.leader.name }, ' giữ ghế'], { first: true });
}

function setTally(tally) {
  const boxes = $('options').children;
  tally.forEach((n, i) => {
    if (boxes[i]) boxes[i].lastChild.textContent = n || '';
  });
}

function showReveal({ correct, explain, tally }) {
  [...$('options').children].forEach((box, i) => box.classList.add(i === correct ? 'right' : 'dim'));
  setTally(tally);
  $('footline').textContent = `Đáp án đúng: ${LETTERS[correct]} — ${explain}`;
}

function showRecap({ period, officers, others, hall = [], star }) {
  $('play').hidden = true;
  $('recap').hidden = false;
  $('recap-title').textContent = `TỔNG KẾT TIẾT ${period}`;
  $('recap-officers').replaceChildren(
    ...officers.map((officer, i) => {
      const row = el('div', 'recap-row');
      row.style.animationDelay = `${i * 0.25}s`;
      row.append(el('label', '', officer.title), el('span', '', officer.name), el('b', '', officer.score));
      return row;
    }),
  );
  $('recap-others').replaceChildren(
    ...others.map((other) => {
      const row = el('div');
      row.append(el('span', '', other.name), el('b', '', other.score));
      return row;
    }),
  );
  // Bảng vàng: lớp trưởng các tiết trước (tiết này đã ở dòng đầu).
  const past = hall.filter((row) => row.period !== period).slice(0, 4);
  $('recap-hall').hidden = !past.length;
  $('recap-hall').replaceChildren(el('label', '', '🏆 Bảng vàng'), ...past.map((row) => el('span', '', `T${row.period} ${row.name}`)));
  if (star && seats[star.seat]?.data) setStars(star.seat, star.stars);
}

// from: lúc đồng hồ bắt đầu chạy; trước đó (cô đang đọc) đồng hồ đứng nguyên ở mức đầy.
function startTimer(phase, from, endsAt) {
  timerPhase = phase;
  timerEnds = endsAt;
  timerTotal = Math.max(1, endsAt - from);
  lastTick = 0;
}

function highlightOption(index) {
  [...$('options').children].forEach((box, i) => box.classList.toggle('reading', i === index));
}

function say(msg) {
  const done = () => {
    $('teacher').classList.remove('talking');
    $('bubble').hidden = true;
    highlightOption(-1);
  };
  if (!msg.clips.length) {
    if (msg.cut) stopSpeech();
    done();
    return;
  }
  speak(msg, {
    onClip(clip) {
      $('teacher').classList.add('talking');
      if (msg.text) {
        $('bubble').textContent = msg.text;
        $('bubble').hidden = false;
      }
      highlightOption(clip.opt ?? -1);
      if (clip.sfx) sfx[clip.sfx]?.();
    },
    onDone: done,
  });
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
  }
}, 100);

setInterval(() => {
  const now = new Date();
  const minutes = now.getMinutes();
  $('hand-m').setAttribute('transform', `rotate(${minutes * 6} 60 60)`);
  $('hand-h').setAttribute('transform', `rotate(${(now.getHours() % 12) * 30 + minutes / 2} 60 60)`);
}, 1000);

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
  toastTimer = setTimeout(nextToast, item.big ? 2600 : 1500);
}

const fx = $('fx');
function floatText(index, text) {
  const { center } = seats[index];
  const node = el('div', 'float', text);
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
  // Hình quà bay ra từ bảng x2 giữa màn.
  const fromX = 540 - center.x;
  const fromY = 894 - center.y;
  node.animate([{ transform: `translate(${fromX}px, ${fromY}px) scale(.6)`, opacity: 0 }, { transform: `translate(${fromX * 0.5}px, ${fromY * 0.5 - 60}px) scale(1.3)`, opacity: 1, offset: 0.5 }, { transform: 'translate(0,0) scale(.8)', opacity: 1, offset: 0.92 }, { transform: 'translate(0,0) scale(1.5)', opacity: 0 }], { duration: 950, easing: 'ease-in-out' }).onfinish = () => {
    node.remove();
    sparks(center.x, center.y, 12);
  };
}
function teacherHappy() {
  restart($('teacher'), 'happy');
}

// ---------- Nhận tin từ server ----------
function applyGame(game) {
  seats.forEach((_, i) => setStudent(i, game.seats[i]));
  renderOfficers(game.officers);
  setRoster(game.count, game.waiting);
  if (!game.question) return setDuel(null);
  showQuestion({ question: game.question, inSet: game.inSet, setSize: game.setSize, period: game.period, duel: game.duel });
  for (const { seat, choice, boosted } of game.answers) showAnswer(seat, choice, boosted);
  setTally(game.tally);
  startTimer(game.phase, game.phase === 'asking' ? game.timerFrom : Date.now(), game.endsAt);
  if (game.phase === 'reveal' && game.reveal) {
    showReveal({ ...game.reveal, tally: game.tally });
    markResults(game.reveal.results, false);
    if (game.reveal.duel) showDuelResult(game.reveal.duel, { quiet: true });
  }
  if (game.phase === 'recap' && game.recap) showRecap(game.recap);
}

function markResults(results, animate) {
  for (const r of results) {
    const seat = seats[r.seat];
    if (!seat?.data) continue;
    seat.data.score = r.score;
    seat.score.textContent = r.score;
    seat.root.classList.add(r.ok ? 'ok' : 'wrong');
    if (animate && r.ok) floatText(r.seat, `+${r.delta}`);
  }
}

function socialGuide() {
  const row = el('div', 'social');
  row.append(el('small', '', 'Follow, Share'), `${guide.socialTurns} lượt`);
  return row;
}

function challengeGuide() {
  const row = el('div', 'challenge');
  row.append(Object.assign(new Image(), { src: guide.challenge.icon, alt: guide.challenge.label }), el('small', '', 'Thách đấu\nlớp trưởng'));
  return row;
}

const handlers = {
  snapshot(msg) {
    guide = msg.guide;
    $('banner').textContent = guide.title;
    $('guide').replaceChildren(
      el('h3', '', 'ĐIỂM x2'),
      ...guide.tiers.map((tier) => {
        const row = el('div');
        row.append(Object.assign(new Image(), { src: tier.icon, alt: tier.label }), `${tier.turns} lượt`);
        return row;
      }),
      socialGuide(),
      ...(guide.challenge ? [challengeGuide()] : []),
    );
    if (seats.length !== guide.seats) buildClass(guide.seats, guide.vipSeats);
    applyGame(msg.game);
  },
  'snapshot-game'(msg) {
    applyGame(msg.game);
  },
  question(msg) {
    wake();
    sfx.bell();
    seats.forEach((_, i) => clearAnswer(i));
    showQuestion(msg);
    startTimer('asking', msg.timerFrom, msg.endsAt);
  },
  say,
  'safe-mode'(msg) {
    if (msg.on) say({ clips: [], cut: true });
  },
  hurry(msg) {
    timerEnds = msg.endsAt;
  },
  answer(msg) {
    sfx.tap();
    showAnswer(msg.seat, msg.choice, msg.boosted);
    setTurns(msg.seat, msg.turns);
    setTally(msg.tally);
  },
  reveal(msg) {
    startTimer('reveal', Date.now(), msg.endsAt);
    showReveal(msg);
    markResults(msg.results, true);
    renderOfficers(msg.officers);
    if (msg.duel) showDuelResult(msg.duel);
    const anyRight = msg.results.some((r) => r.ok);
    if (anyRight) {
      sfx.right();
      teacherHappy();
    } else if (msg.results.length) sfx.none();
    const fastest = msg.results.find((r) => r.first);
    if (fastest && seats[fastest.seat]?.data) {
      const { center, data } = seats[fastest.seat];
      sparks(center.x, center.y, 24);
      toast([{ b: data.name }, ' đúng đầu tiên · x2 điểm'], { big: true, first: true });
    }
    if (msg.promoted.length) {
      const top = msg.promoted[0];
      setTimeout(() => {
        sfx.fanfare();
        for (const officer of msg.officers) sparks(seats[officer.seat].center.x, seats[officer.seat].center.y, 20);
      }, 700);
      toast([{ b: top.name }, ` lên ${top.title}!`], { big: true, first: true });
    }
  },
  recap(msg) {
    startTimer('recap', Date.now(), msg.endsAt);
    showRecap(msg);
    sfx.fanfare();
    teacherHappy();
  },
  join(msg) {
    setStudent(msg.seat, msg.student, { pop: true });
    setRoster(msg.count, msg.waiting);
    sfx.join();
    const { center } = seats[msg.seat];
    sparks(center.x, center.y, 8);
    if (msg.kicked) {
      sfx.leave();
      toast([{ b: msg.student.name }, ' vào thay ', { b: msg.kicked.name }]);
    } else {
      toast([{ b: msg.student.name }, ' vào lớp']);
    }
  },
  wave(msg) {
    restart(seats[msg.seat].root, 'wave');
  },
  waiting(msg) {
    setRoster(seats.filter((seat) => seat.data).length, msg.count);
    toast([{ b: msg.name }, ' chờ ngoài cửa']);
  },
  hint(msg) {
    toast([{ b: msg.name }, ' ơi, chat VÀO để vào lớp nhé']);
  },
  boost(msg) {
    sfx.boost();
    if (msg.seat >= 0) {
      const { data } = seats[msg.seat];
      if (data && msg.patron) Object.assign(data, { patron: true, icon: msg.icon ?? data.icon });
      setTurns(msg.seat, msg.turns);
      if (msg.icon) flyIcon(msg.icon, msg.seat);
    }
    if (msg.kind) toast([{ b: msg.name }, ' x2 điểm câu tiếp theo']);
    else toast([{ b: msg.name }, ` x2 điểm · ${msg.added} lượt`], { icon: msg.icon, first: true });
  },
  move(msg) {
    swapSeats(msg.from, msg.to);
    renderOfficers(msg.officers);
    const { data, center } = seats[msg.to];
    if (!data) return;
    sparks(center.x, center.y, 18);
    toast([{ b: data.name }, ' lên bàn đầu'], { icon: data.icon });
  },
  period(msg) {
    seats.forEach((seat) => {
      if (!seat.data) return;
      seat.data.score = 0;
      seat.score.textContent = 0;
    });
    renderOfficers([]);
    toast([`Tiết ${msg.period} · điểm tính lại từ đầu`], { big: true, first: true });
  },
  challenge(msg) {
    sfx.fanfare();
    toast([{ b: msg.name }, msg.leader ? ` thách đấu lớp trưởng ${msg.leader}` : ' xin thách đấu lớp trưởng'], { big: true, first: true, icon: guide.challenge?.icon });
  },
};

const events = new EventSource('/events');
events.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  handlers[msg.type]?.(msg);
};
