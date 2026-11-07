import { bellSvg, buoySvg } from './art.js';
import { sfx, wake, onAudioState, speak, stopSpeech } from './audio.js';

const W = 1080;
const H = 1920;
// Sàn hiện tối đa 32 người (8 cột x 4 hàng); đông hơn thì người im lâu nhất nhường chỗ.
const COLS = 8;
const MAX_SHOWN = 32;
const SEAT_W = 132;
const SEAT_H = 124;
const LETTERS = 'ABCD';
const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const secs = (ms) => Math.max(0, Math.ceil(ms / 1000));

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

$('title-bell').innerHTML = bellSvg();
$('finale-bell').innerHTML = bellSvg();

let guide = null;
let state = null;
const players = new Map(); // pid -> người chơi
// Kết quả câu vừa công bố, giữ tới lúc hỏi câu sau.
const reveal = { picks: new Map(), leaving: new Set(), back: new Set(), saved: new Set(), fastest: null };
const seatNodes = new Map(); // pid -> ô trên sàn

const later = (ms, fn) => setTimeout(fn, ms);
const buoy = (className = 'buoy') => {
  const node = el('i', className);
  node.innerHTML = buoySvg();
  return node;
};
function restart(node, className) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

// Ảnh đại diện TikTok, lỗi ảnh hoặc không có ảnh thì là vòng tròn màu có chữ cái đầu tên.
function avatar(p) {
  const fallback = () => {
    const node = el('div', 'ava', Array.from(p.name.trim())[0]?.toUpperCase() ?? '?');
    node.style.background = `hsl(${(p.pid * 67) % 360} 65% 48%)`;
    return node;
  };
  if (!p.avatar) return fallback();
  const img = Object.assign(new Image(), { className: 'ava', alt: '', referrerPolicy: 'no-referrer', src: p.avatar });
  img.onerror = () => img.replaceWith(fallback());
  return img;
}

// ---------- Phần không đổi trong trận ----------
function setupStatic() {
  $('title-text').textContent = guide.title;
  $('subtitle').textContent = guide.subtitle ?? '';
  const how = el('div', 'cell');
  how.append(el('b', '', 'Comment VÀO'), el('span', '', 'Trả lời: A B C D'));
  const cells = guide.gifts.map((gift) => {
    const cell = el('div', 'cell gift');
    cell.dataset.effect = gift.effect;
    const text = el('div');
    text.append(el('b', '', gift.label), el('span', '', `${gift.giftLabel || 'Quà'} ${gift.coins} xu`));
    cell.append(Object.assign(new Image(), { src: gift.icon, alt: '' }), text);
    return cell;
  });
  $('guide').replaceChildren(how, ...cells);
}

// ---------- Sàn thi đấu ----------
function seatOf(p) {
  let node = seatNodes.get(p.pid);
  if (!node) {
    node = el('div', 'seat');
    const face = el('div', 'face');
    face.append(avatar(p), el('span', 'board'), el('span', 'shield'));
    node.append(face, el('div', 'name'));
    node.dataset.avatar = p.avatar;
    seatNodes.set(p.pid, node);
  } else if (node.dataset.avatar !== p.avatar) {
    node.dataset.avatar = p.avatar;
    node.querySelector('.ava').replaceWith(avatar(p));
  }
  return node;
}

function paintSeat(node, p) {
  node.querySelector('.name').textContent = p.name;
  const shield = node.querySelector('.shield');
  shield.hidden = !p.shields;
  shield.replaceChildren(buoy(), p.shields > 1 ? String(p.shields) : '');
  const pick = reveal.picks.get(p.pid);
  const shown = state?.phase === 'reveal' && state.result && (pick !== undefined || reveal.leaving.has(p.pid) || reveal.saved.has(p.pid));
  const ok = shown && pick === state.result.correct;
  node.querySelector('.board').textContent = shown ? (pick === undefined ? '–' : LETTERS[pick]) : '✓';
  node.classList.toggle('answered', state?.phase === 'asking' && Boolean(p.answered));
  node.classList.toggle('shown', Boolean(shown));
  node.classList.toggle('ok', Boolean(ok));
  node.classList.toggle('bad', Boolean(shown && !ok));
  node.classList.toggle('fastest', reveal.fastest === p.pid);
  node.classList.toggle('saved', reveal.saved.has(p.pid));
  node.classList.toggle('leaving', reveal.leaving.has(p.pid));
  node.classList.toggle('back', reveal.back.has(p.pid));
}

function renderFloor() {
  const finalist = state && state.mode === 'golden' && !['lobby', 'end'].includes(state.phase) ? players.get(state.finalist) : null;
  $('spotlight').hidden = !finalist;
  $('seats').hidden = Boolean(finalist);
  if (finalist) {
    const box = $('spotlight').querySelector('.seat.big');
    // Số người chơi đánh lại từ 1 mỗi trận, nên so cả ảnh đại diện để không giữ ảnh người của trận trước.
    if (box.dataset.pid !== String(finalist.pid) || box.dataset.avatar !== finalist.avatar) {
      box.dataset.pid = finalist.pid;
      box.dataset.avatar = finalist.avatar;
      const face = el('div', 'face');
      face.append(avatar(finalist), el('span', 'board'), el('span', 'shield'));
      box.replaceChildren(face, el('div', 'name'));
    }
    paintSeat(box, finalist);
    $('floor-title').textContent = 'NGƯỜI CUỐI CÙNG TRÊN SÀN';
    $('floor-more').textContent = '';
    $('spot-note').textContent = `Câu hỏi vàng ${state.goldenNo || 1}/${state.goldenTotal}`;
    return;
  }

  const onFloor = [...players.values()].filter((p) => p.alive || reveal.leaving.has(p.pid));
  // Người mới hoạt động được ưu tiên hiện, rồi xếp lại theo thứ tự lên sàn cho chỗ ngồi ít xáo trộn.
  const shown = onFloor.sort((a, b) => b.at - a.at).slice(0, MAX_SHOWN).sort((a, b) => a.pid - b.pid);
  const keep = new Set();
  const seats = $('seats');
  shown.forEach((p, i) => {
    const node = seatOf(p);
    keep.add(p.pid);
    const row = Math.floor(i / COLS);
    Object.assign(node.style, { left: `${12 + (i % COLS) * SEAT_W}px`, top: `${row * SEAT_H}px` });
    paintSeat(node, p);
    if (!node.isConnected) {
      seats.append(node);
      restart(node, 'pop');
    }
  });
  for (const [pid, node] of seatNodes) {
    if (!keep.has(pid)) {
      node.remove();
      seatNodes.delete(pid);
    }
  }
  let empty = seats.querySelector('.empty');
  if (!shown.length) {
    if (!empty) seats.append((empty = el('div', 'empty')));
    empty.textContent = state?.phase === 'lobby' ? 'Chưa có ai trên sàn, comment VÀO nhé!' : 'Sàn đang trống';
  } else empty?.remove();
  const alive = state?.alive ?? 0;
  $('floor-title').textContent = `SÀN THI ĐẤU · ${alive} NGƯỜI`;
  const hidden = onFloor.length - shown.length;
  $('floor-more').textContent = hidden > 0 ? `+${hidden} người nữa` : '';
}

// ---------- Câu hỏi ----------
let questionKey = '';
function renderCard() {
  const s = state;
  const card = $('card');
  card.classList.toggle('rescue', s.mode === 'rescue' && s.phase !== 'lobby');
  card.classList.toggle('golden', s.mode === 'golden' && s.phase !== 'lobby' && s.phase !== 'end');
  const lobby = s.phase === 'lobby';
  $('lobby').hidden = !lobby;
  $('ask').hidden = lobby;
  if (lobby) {
    renderLobbyCount();
    questionKey = '';
    return;
  }
  // Lúc giới thiệu cứu trợ / câu hỏi vàng hay lúc kết thúc thì chưa có câu nào, để trống thẻ.
  const q = s.question ?? { subject: '', text: '', options: [], correct: null };
  const key = `${q.text}|${q.options.join('|')}`;
  if (key !== questionKey) {
    questionKey = key;
    $('subject').textContent = q.subject;
    $('subject').hidden = !q.subject;
    const text = $('q-text');
    text.textContent = q.text;
    text.classList.toggle('long', q.text.length > 70 && q.text.length <= 110);
    text.classList.toggle('xlong', q.text.length > 110);
    $('options').replaceChildren(
      ...q.options.map((option, i) => {
        const node = el('div', 'opt');
        node.append(el('span', 'key', LETTERS[i]), el('span', `text${option.length > 28 ? ' small' : ''}`, option), el('span', 'count'));
        return node;
      }),
    );
  }
  $('ask-tag').textContent = !s.question ? '' : s.mode === 'rescue' ? 'CÂU CỨU TRỢ' : s.mode === 'golden' ? `CÂU HỎI VÀNG ${s.goldenNo}/${s.goldenTotal}` : `CÂU ${s.questionNo}`;
  const shown = s.phase === 'reveal' && s.result;
  [...$('options').children].forEach((node, i) => {
    node.classList.toggle('right', Boolean(shown) && i === q.correct);
    node.classList.toggle('dim', Boolean(shown) && i !== q.correct);
    const count = node.querySelector('.count');
    count.hidden = !shown;
    if (shown) count.textContent = `${s.result.counts[i]} người`;
  });
}

let lobbySecs = -1;
function renderLobbyCount() {
  const s = state;
  const left = secs(s.endsAt - Date.now());
  lobbySecs = left;
  const box = $('lobby-count');
  const need = s.minPlayers - s.alive;
  box.replaceChildren(`${s.alive} người đã lên sàn`, el('small', '', need > 0 ? `Cần thêm ${need} người để bắt đầu` : left > 0 ? `Câu hỏi đầu tiên sau ${left} giây` : 'Chuẩn bị câu hỏi đầu tiên...'));
}

// ---------- Câu số, số người, đồng hồ ----------
function renderHud() {
  const s = state;
  const label = $('q-label');
  label.className = `pill${s.phase !== 'lobby' && s.mode !== 'main' ? ` ${s.mode}` : ''}`;
  if (s.phase !== 'lobby' && s.phase !== 'end' && s.mode === 'rescue') label.replaceChildren(buoy(), 'CỨU TRỢ');
  else {
    label.textContent =
      s.phase === 'lobby' ? '🔓 MỞ SÀN' : s.phase === 'end' ? '🏁 KẾT THÚC' : s.mode === 'golden' ? `🔔 CÂU VÀNG ${Math.max(1, s.goldenNo)}/${s.goldenTotal}` : `CÂU ${s.questionNo}`;
  }
  $('alive-label').textContent = `👥 ${s.alive}`;
  const pips = $('rescue-pips');
  pips.title = 'Lượt cứu trợ còn lại';
  pips.replaceChildren(...Array.from({ length: guide.rescueTimes }, (_, i) => buoy(i < s.rescuesLeft ? 'buoy' : 'buoy used')));
}

let lastSec = -1;
function clockLoop() {
  requestAnimationFrame(clockLoop);
  if (!state || !guide) return;
  const s = state;
  const remaining = s.endsAt - Date.now();
  const timed = s.phase === 'asking' || s.phase === 'lobby';
  // MC đang đọc câu hỏi thì đồng hồ đứng ở số giây trả lời, đọc xong mới chạy.
  const reading = s.phase === 'asking' && Date.now() < s.timerFrom;
  const total = (s.phase === 'asking' ? guide.askSeconds : guide.lobbySeconds) * 1000;
  const sec = reading ? guide.askSeconds : secs(remaining);
  const frac = reading ? 1 : timed ? Math.min(1, Math.max(0, remaining / total)) : s.phase === 'reveal' ? 1 : 0;
  $('clock-arc').style.strokeDashoffset = String(326.7 * (1 - frac));
  $('clock-num').textContent = timed ? String(sec) : s.phase === 'reveal' ? '✓' : '';
  const urgent = s.phase === 'asking' && !reading && sec <= 5;
  $('clock').classList.toggle('urgent', urgent);
  $('clock').classList.toggle('reading', reading);
  if (sec !== lastSec) {
    lastSec = sec;
    if (urgent && sec > 0) sfx.tick();
    if (s.phase === 'lobby' && sec !== lobbySecs) renderLobbyCount();
    if (s.phase === 'end') $('finale-next').textContent = `Trận mới sau ${sec} giây`;
  }
}
requestAnimationFrame(clockLoop);

// ---------- Dòng trạng thái ----------
function renderStatus() {
  const s = state;
  const box = $('status');
  const parts = [];
  const add = (text, cls) => parts.push(cls ? el(cls === 'b' ? 'b' : 'span', cls === 'b' ? '' : cls, text) : text);
  if (s.phase === 'lobby') add('Sai một câu là rời sàn · trụ lại cuối cùng để rung chuông');
  else if (s.phase === 'asking') {
    if (s.mode === 'rescue') {
      add('Người đã rời sàn trả lời đúng sẽ quay lại · ');
      add(`${s.answered}/${s.eligible}`, 'b');
      add(' đã trả lời');
    } else if (s.mode === 'golden') add(`🔔 Chỉ ${players.get(s.finalist)?.name ?? 'người cuối cùng'} được trả lời`);
    else {
      add(`${s.answered}/${s.eligible}`, 'b');
      add(' người trên sàn đã chốt đáp án');
    }
  } else if (s.phase === 'reveal' && s.result) {
    const r = s.result;
    add('Đáp án ');
    add(LETTERS[r.correct], 'b');
    if (r.mode === 'main') {
      if (r.allWrong) add(' · Cả sàn cùng sai, không ai phải rời sàn!', 'ok');
      else {
        if (r.out.length) add(` · ${r.out.length} người rời sàn`, 'bad');
        else add(' · Cả sàn cùng đúng!', 'ok');
        if (r.saved.length) add(` · ${r.saved.length} người dùng phao`);
      }
    } else if (r.mode === 'rescue') add(r.back.length ? ` · ${r.back.length} người quay lại sàn!` : ' · Không ai được cứu', r.back.length ? 'ok' : 'bad');
    else add(r.passed ? ' · CHÍNH XÁC!' : ' · Rất tiếc!', r.passed ? 'ok' : 'bad');
    if (r.fastest && r.mode !== 'golden') add(` · ⚡ ${r.fastest.name} ${(r.fastest.ms / 1000).toFixed(1).replace('.', ',')}s`);
  }
  box.replaceChildren(...parts);
}

function renderAll() {
  if (!state || !guide) return;
  renderHud();
  renderCard();
  renderStatus();
  renderFloor();
}
let pending = false;
function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    renderAll();
  });
}

// ---------- Thông báo, hiệu ứng ----------
const fx = $('fx');
let toastTimer;
function toast(parts, icon = '') {
  const node = $('toast');
  const items = parts.map((part) => (typeof part === 'string' ? part : el('b', '', part.b)));
  if (icon) items.unshift(Object.assign(new Image(), { src: icon, alt: '' }));
  node.replaceChildren(...items);
  node.hidden = false;
  restart(node, 'pop');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (node.hidden = true), 2600);
}

function banner(text, top = 640) {
  const node = el('div', 'banner', text);
  node.style.top = `${top}px`;
  fx.append(node);
  node.animate(
    [
      { transform: 'scale(.3)', opacity: 0 },
      { transform: 'scale(1.1)', opacity: 1, offset: 0.25 },
      { transform: 'scale(1)', opacity: 1, offset: 0.75 },
      { transform: 'scale(1.3)', opacity: 0 },
    ],
    { duration: 1800, easing: 'ease-out', fill: 'forwards' },
  );
  later(1900, () => node.remove());
}

const CONFETTI = ['#ffcf3f', '#fff1b0', '#ff5d8f', '#4ad6ff', '#7dffb0', '#ffffff'];
function confetti(count = 80) {
  for (let i = 0; i < count; i++) {
    const node = el('i', 'bit');
    Object.assign(node.style, { left: `${Math.random() * W}px`, top: '-30px', background: CONFETTI[i % CONFETTI.length] });
    fx.append(node);
    const drift = (Math.random() - 0.5) * 300;
    const duration = 2200 + Math.random() * 1800;
    node.animate([{ transform: 'translate(0, 0) rotate(0)' }, { transform: `translate(${drift}px, ${H + 60}px) rotate(${720 + Math.random() * 720}deg)` }], {
      duration,
      delay: Math.random() * 1200,
      easing: 'cubic-bezier(.3,.1,.7,1)',
      fill: 'both',
    });
    later(duration + 1300, () => node.remove());
  }
}

function burst(x, y, colors = CONFETTI, count = 18) {
  for (let i = 0; i < count; i++) {
    const node = el('i', 'bit');
    Object.assign(node.style, { left: `${x}px`, top: `${y}px`, background: colors[i % colors.length] });
    fx.append(node);
    const angle = Math.random() * Math.PI * 2;
    const reach = 80 + Math.random() * 160;
    node.animate(
      [
        { transform: 'translate(0, 0) rotate(0)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * reach}px, ${Math.sin(angle) * reach + 80}px) rotate(320deg)`, opacity: 0 },
      ],
      { duration: 800 + Math.random() * 500, easing: 'cubic-bezier(.15,.7,.4,1)', fill: 'forwards' },
    );
    later(1400, () => node.remove());
  }
}

function hearts(count = 14) {
  const kinds = ['❤️', '💖', '🌸', '💛'];
  for (let i = 0; i < count; i++) {
    const node = el('div', 'heart', kinds[i % kinds.length]);
    Object.assign(node.style, { left: `${80 + Math.random() * 920}px`, top: '1640px' });
    fx.append(node);
    node.animate(
      [
        { transform: 'translateY(0) scale(.6)', opacity: 0 },
        { transform: `translate(${(Math.random() - 0.5) * 120}px, -260px) scale(1.1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${(Math.random() - 0.5) * 200}px, -700px) scale(.9)`, opacity: 0 },
      ],
      { duration: 2400 + Math.random() * 1400, delay: Math.random() * 900, easing: 'ease-out', fill: 'both' },
    );
    later(4000, () => node.remove());
  }
}

// ---------- Màn giới thiệu và màn kết thúc ----------
function showIntro() {
  const s = state;
  const box = $('intro');
  box.hidden = !(s.phase === 'intro');
  if (box.hidden) return;
  box.className = s.mode;
  const icon = $('intro-icon');
  if (s.mode === 'rescue') {
    icon.replaceChildren(buoy());
    $('intro-title').textContent = 'CỨU TRỢ!';
    $('intro-sub').textContent = `Người đã rời sàn: trả lời đúng câu tiếp theo để quay lại sàn thi (${s.out} người đang chờ)`;
  } else {
    const finalist = players.get(s.finalist);
    icon.replaceChildren(finalist ? avatar(finalist) : '🔔');
    $('intro-title').textContent = 'CÂU HỎI VÀNG';
    $('intro-sub').textContent = `${finalist?.name ?? 'Người chơi'} là người cuối cùng trên sàn! Trả lời đúng ${s.goldenTotal} câu để rung chuông vàng`;
  }
}

function showFinale() {
  const c = state.champion;
  const box = $('finale');
  box.hidden = state.phase !== 'end' || !c;
  if (box.hidden) return;
  box.className = c.kind;
  const titles = { bell: 'RUNG CHUÔNG VÀNG!', fail: 'NGƯỜI CUỐI CÙNG TRÊN SÀN', many: 'CÙNG VỀ ĐÍCH', empty: 'SÀN ĐÃ TRỐNG' };
  $('finale-title').textContent = titles[c.kind];
  const winners = $('finale-winners');
  winners.classList.toggle('solo', c.winners.length === 1);
  winners.replaceChildren(
    ...c.winners.map((w) => {
      const node = el('div', 'w');
      node.append(avatar(w), el('span', '', w.name));
      return node;
    }),
  );
  const subs = {
    bell: `Trả lời đúng cả ${state.goldenTotal} câu hỏi vàng 🎉`,
    fail: `Dừng lại ở câu hỏi vàng thứ ${c.goldenNo}. Chuông vàng vẫn đang chờ!`,
    many: `${c.winners.length + c.moreWinners} người trụ vững qua ${c.questions} câu hỏi${c.moreWinners ? ` (+${c.moreWinners} người nữa)` : ''}`,
    empty: 'Hẹn mọi người ở trận sau',
  };
  $('finale-sub').textContent = subs[c.kind];
  const medals = ['🥇', '🥈', '🥉'];
  $('finale-top').replaceChildren(...c.top.map((p, i) => el('li', '', `${medals[i]} ${p.name} · ${p.correct} câu đúng`)));
  $('finale-next').textContent = `Trận mới sau ${secs(state.endsAt - Date.now())} giây`;
}

// ---------- Giọng MC ----------
let ttsOn = false;
function highlightOption(index) {
  [...$('options').children].forEach((node, i) => node.classList.toggle('reading', i === index));
}

function say(msg) {
  const done = () => {
    $('mc').classList.remove('talking');
    highlightOption(-1);
  };
  if (!msg.clips.length) {
    if (msg.cut) stopSpeech();
    done();
    return;
  }
  speak(msg, {
    onClip(clip) {
      $('mc').classList.add('talking');
      highlightOption(clip.opt ?? -1);
      if (clip.sfx) sfx[clip.sfx]?.();
    },
    onDone: done,
  });
}

// ---------- Nhận tin từ server ----------
function clearReveal() {
  reveal.picks = new Map();
  reveal.leaving.clear();
  reveal.back.clear();
  reveal.saved.clear();
  reveal.fastest = null;
}

function loadGame(game) {
  players.clear();
  for (const node of seatNodes.values()) node.remove();
  seatNodes.clear();
  const spot = $('spotlight').querySelector('.seat.big');
  spot.replaceChildren();
  delete spot.dataset.pid;
  delete spot.dataset.avatar;
  clearReveal();
  for (const p of game.players ?? []) players.set(p.pid, p);
  state = game;
  showIntro();
  showFinale();
  renderAll();
}

const handlers = {
  say,
  'mc-muted'(msg) {
    $('mc').hidden = !ttsOn || msg.on;
  },
  snapshot(msg) {
    guide = msg.guide;
    ttsOn = Boolean(msg.tts?.enabled);
    $('mc').hidden = !ttsOn || msg.mcMuted?.on;
    setupStatic();
    loadGame(msg.game);
    if (msg.game.phase === 'reveal' && msg.game.result) {
      reveal.picks = new Map(msg.game.result.picks);
      renderAll();
    }
  },
  reset(msg) {
    loadGame({ ...msg.state, players: [] });
    banner('TRẬN MỚI');
  },
  join(msg) {
    players.set(msg.player.pid, msg.player);
    sfx.join();
    toast([{ b: msg.player.name }, ' đã lên sàn thi']);
  },
  nudge(msg) {
    toast([{ b: msg.name }, msg.reason === 'closed' ? ' ơi, sàn đã đóng, chờ trận sau nhé' : ' ơi, comment VÀO để lên sàn trước nhé']);
  },
  start() {
    wake();
    banner('BẮT ĐẦU!');
  },
  ask() {
    clearReveal();
    for (const p of players.values()) p.answered = false;
    $('intro').hidden = true;
    sfx.ask();
  },
  answer(msg) {
    const p = players.get(msg.pid);
    if (p) {
      p.answered = true;
      p.at = Date.now();
    }
    sfx.blip();
  },
  reveal(msg) {
    const r = msg.result;
    clearReveal();
    reveal.picks = new Map(r.picks);
    reveal.fastest = r.fastest?.pid ?? null;
    for (const [pid, choice] of r.picks) {
      const p = players.get(pid);
      if (p && choice === r.correct) p.correct++;
    }
    for (const pid of r.out) {
      const p = players.get(pid);
      if (p) p.alive = false;
      reveal.leaving.add(pid);
    }
    for (const pid of r.saved) {
      const p = players.get(pid);
      if (p) p.shields = Math.max(0, p.shields - 1);
      reveal.saved.add(pid);
    }
    for (const pid of r.back) {
      const p = players.get(pid);
      if (p) {
        p.alive = true;
        p.at = Date.now();
      }
      reveal.back.add(pid);
    }
    sfx.reveal();
    later(500, () => {
      const right = $('options').children[r.correct];
      if (right) {
        const box = right.getBoundingClientRect();
        const scale = box.width / right.offsetWidth;
        const origin = stage.getBoundingClientRect();
        burst((box.left - origin.left + box.width / 2) / scale, (box.top - origin.top + box.height / 2) / scale);
      }
    });
    if (r.mode === 'main') later(700, () => (r.allWrong ? sfx.phew() : r.out.length ? sfx.out() : null));
    if (r.mode === 'rescue' && r.back.length) later(700, sfx.back);
    if (r.mode === 'golden') later(700, r.passed ? sfx.back : sfx.fail);
  },
  intro(msg) {
    if (msg.finalist) players.set(msg.finalist.pid, { ...players.get(msg.finalist.pid), ...msg.finalist });
    clearReveal();
    (msg.mode === 'rescue' ? sfx.rescue : sfx.golden)();
  },
  skip(msg) {
    toast(['Đổi câu khác, đáp án câu vừa rồi: ', { b: msg.answer }]);
  },
  gift(msg) {
    const p = msg.pid ? players.get(msg.pid) : null;
    if (p) {
      p.shields += msg.shields;
      p.at = Date.now();
      if (msg.revived) {
        p.alive = true;
        reveal.leaving.delete(p.pid);
        reveal.back.add(p.pid);
      }
    }
    sfx.gift();
    const cell = document.querySelector(`#guide .gift[data-effect="${msg.effect}"]`);
    if (cell) restart(cell, 'flash');
    const count = msg.count > 1 ? ` x${msg.count}` : '';
    if (msg.revived) {
      later(300, sfx.back);
      toast([{ b: msg.name }, ` quay lại sàn thi!${msg.shields ? ` · +${msg.shields} phao` : ''}`], msg.icon);
    } else if (msg.shields) toast([{ b: msg.name }, ` nhận +${msg.shields} phao`], msg.icon);
    else {
      toast([{ b: msg.name }, ` cổ vũ${count} ❤️`], msg.icon);
      hearts(Math.min(30, 8 + msg.count * 2));
    }
  },
  end(msg) {
    const kind = msg.champion.kind;
    $('intro').hidden = true;
    if (kind === 'bell') {
      sfx.bell();
      confetti(140);
      later(1500, () => confetti(100));
    } else if (kind === 'many') {
      sfx.finish();
      confetti(90);
    } else sfx.fail();
  },
};

const events = new EventSource('/events');
events.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'snapshot') return handlers.snapshot(msg);
  if (!guide) return;
  handlers[msg.type]?.(msg);
  if (msg.state && msg.type !== 'reset') {
    state = msg.state;
    if (['intro', 'ask', 'end', 'reset', 'reveal'].includes(msg.type)) {
      showIntro();
      showFinale();
    }
    schedule();
  }
};
