import { heroSvg, miSvg, soldierSvg, sideIcon, shotSvg } from './art.js';
import { sfx, wake, onAudioState } from './audio.js';

const W = 1080;
const H = 1920;
const SIDES = ['son', 'thuy'];
// Mỗi phe hiện tối đa 30 chú lính (6 cột x 5 hàng); đông hơn thì người im lâu nhất nhường chỗ.
const COLS = 6;
const MAX_SHOWN = 30;
const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const other = (side) => (side === 'son' ? 'thuy' : 'son');
const secs = (ms) => Math.ceil(ms / 1000);
const mmss = (ms) => `${Math.floor(secs(ms) / 60)}:${String(secs(ms) % 60).padStart(2, '0')}`;

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

for (const side of SIDES) {
  document.querySelector(`#hero-${side} .body`).innerHTML = heroSvg(side);
  document.querySelector(`#hud-${side} .portrait`).innerHTML = heroSvg(side, '48 6 144 144');
  document.querySelector(`#lobby .card.${side} .icon`).innerHTML = sideIcon(side);
}
document.querySelector('#mi .body').innerHTML = miSvg();

const HUD = Object.fromEntries(
  SIDES.map((side) => {
    const root = $(`hud-${side}`);
    const pick = (selector) => root.querySelector(selector);
    return [side, { name: pick('.name b'), troops: pick('.troops'), hp: pick('.hp'), fill: pick('.hp .fill'), trail: pick('.hp .trail'), num: pick('.hp .num'), pips: pick('.pips'), dmg: pick('.dmg') }];
  }),
);
// Tay ném và thân của hai nhân vật, theo tọa độ sân khấu.
const SPOT = {
  son: { hand: { x: 262, y: 700 }, body: { x: 171, y: 640 } },
  thuy: { hand: { x: 818, y: 700 }, body: { x: 909, y: 640 } },
};

let guide = null;
let state = null;
const name = (side) => guide.sides[side].name;

function restart(node, className) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}
function flash(node, className, ms) {
  restart(node, className);
  clearTimeout(node.flashTimer);
  node.flashTimer = setTimeout(() => node.classList.remove(className), ms);
}

// Vị trí giữa một phần tử trên sân khấu 1080x1920 (offset* không bị phép scale của #stage làm lệch).
function stagePos(node) {
  let x = node.offsetWidth / 2;
  let y = node.offsetHeight / 2;
  for (let n = node; n && n !== stage; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y };
}

// ---------- Phần không đổi trong trận ----------
function setupStatic() {
  $('title-text').textContent = guide.title;
  $('subtitle').textContent = guide.subtitle ?? '';
  for (const side of SIDES) {
    HUD[side].name.textContent = name(side).toUpperCase();
    const card = document.querySelector(`#lobby .card.${side}`);
    card.querySelector('b').textContent = name(side).toUpperCase();
    const words = [...new Set([name(side), ...guide.sides[side].keywords].map((k) => k.toUpperCase()))];
    card.querySelector('small').textContent = `Comment: ${words.join(' · ')}`;
  }
  $('guide').replaceChildren(
    ...SIDES.map((side) => {
      const box = el('div', `gside ${side}`);
      box.append(el('span', 'cap', `Quà phe ${name(side)} · mỗi từ đúng trừ thêm`));
      for (const gift of guide.gifts.filter((g) => g.side === side)) {
        const item = el('span', 'gitem');
        item.dataset.icon = gift.icon;
        item.append(Object.assign(new Image(), { src: gift.icon, alt: gift.label }), `+${gift.bonus}`);
        box.append(item);
      }
      return box;
    }),
  );
}

// ---------- Hai đạo quân ----------
const players = new Map(); // pid -> người chơi
const slots = { son: [], thuy: [] };

function buildArmies() {
  for (const side of SIDES) {
    const field = document.querySelector(`#army-${side} .troop-field`);
    field.replaceChildren();
    slots[side] = [];
    for (let i = 0; i < MAX_SHOWN; i++) {
      const row = Math.floor(i / COLS);
      // Hai đạo quân đứng dồn về giữa, mặt đối mặt.
      const col = side === 'son' ? COLS - 1 - (i % COLS) : i % COLS;
      const node = el('div', 'soldier');
      Object.assign(node.style, { left: `${10 + col * 84 + (row % 2 ? 22 : 0)}px`, top: `${row * 104}px`, zIndex: row });
      node.hidden = true;
      const sv = el('div', 'sv');
      const tag = el('div', 'tag');
      node.append(sv, tag);
      field.append(node);
      slots[side].push({ node, sv, tag, pid: 0 });
    }
  }
}
buildArmies();

function clearArmies() {
  players.clear();
  for (const side of SIDES) {
    for (const slot of slots[side]) {
      slot.pid = 0;
      slot.node.hidden = true;
    }
  }
}

function showPlayer(player, { pop = false } = {}) {
  const list = slots[player.side];
  let index = list.findIndex((slot) => slot.pid === player.pid);
  if (index >= 0) {
    list[index].tag.textContent = player.name;
    return index;
  }
  index = list.findIndex((slot) => !slot.pid);
  if (index < 0) {
    let oldest = Infinity;
    list.forEach((slot, i) => {
      const at = players.get(slot.pid)?.at ?? 0;
      if (at < oldest) {
        oldest = at;
        index = i;
      }
    });
  }
  const slot = list[index];
  slot.pid = player.pid;
  slot.node.hidden = false;
  slot.node.classList.remove('cheer');
  slot.sv.innerHTML = soldierSvg(player.side, player.look);
  slot.tag.textContent = player.name;
  if (pop) restart(slot.node, 'pop');
  return index;
}

function cheer(pid) {
  const player = players.get(pid);
  if (!player) return;
  player.at = Date.now();
  const index = showPlayer(player);
  flash(slots[player.side][index].node, 'cheer', 1500);
}

function updateArmies(s) {
  for (const side of SIDES) {
    const shown = slots[side].filter((slot) => slot.pid).length;
    const extra = s.counts[side] - shown;
    document.querySelector(`#army-${side} h4`).textContent = `QUÂN ${name(side).toUpperCase()} · ${s.counts[side]}`;
    document.querySelector(`#army-${side} .more`).textContent = extra > 0 ? `+${extra} quân` : '';
  }
}

// ---------- Thanh sức, tỉ số ----------
const holdHp = { son: 0, thuy: 0 }; // đang chờ đạn bay tới thì chưa trừ trên thanh

function setHp(side, hp) {
  const h = HUD[side];
  const pct = Math.max(0, Math.min(100, (hp / guide.hp) * 100));
  h.fill.style.width = `${pct}%`;
  h.trail.style.width = `${pct}%`;
  h.num.textContent = `${hp}/${guide.hp}`;
  h.hp.classList.toggle('low', pct <= 25);
}

function setPips(side, wins) {
  const pips = HUD[side].pips;
  if (pips.children.length !== guide.winsToMarry) pips.replaceChildren(...Array.from({ length: guide.winsToMarry }, () => el('i')));
  [...pips.children].forEach((pip, i) => pip.classList.toggle('on', i < wins));
}

function setDamage(side, s) {
  const dmg = HUD[side].dmg;
  dmg.replaceChildren('Mỗi từ ', el('b', '', `−${s.damage[side]}`));
  if (s.bonus[side] > 0) dmg.append(el('em', '', `+${s.bonus[side]}`));
}

// ---------- Bảng chữ ----------
let wordNo = 0;
let shownTiles = [];

function renderWord(word) {
  if (!word) return;
  $('topic').textContent = `Chủ đề: ${word.topic}`;
  const box = $('tiles');
  if (word.no !== wordNo) {
    wordNo = word.no;
    const letters = word.tiles.filter((ch) => ch !== ' ').length;
    const gaps = word.tiles.length - letters;
    const size = Math.min(92, Math.floor((960 - (word.tiles.length - 1) * 8) / (letters + gaps * 0.34)));
    box.style.setProperty('--t', `${size}px`);
    box.replaceChildren(...word.tiles.map((ch) => (ch === ' ' ? el('i', 'gap') : el('span', 'tile'))));
    shownTiles = word.tiles.map(() => null);
  }
  const nodes = box.children;
  word.tiles.forEach((ch, i) => {
    if (ch === ' ' || shownTiles[i] === ch) return;
    const node = nodes[i];
    node.textContent = ch || '?';
    node.classList.toggle('hidden', !ch);
    // Chữ vừa được mở thì lật lên; lúc mới dựng từ thì chỉ hiện ra.
    if (ch && shownTiles[i] !== null) restart(node, 'new');
    shownTiles[i] = ch;
  });
  const play = $('play');
  const done = word.done;
  play.classList.toggle('solved', done?.kind === 'solved');
  play.classList.toggle('timeout', Boolean(done) && done.kind !== 'solved');
  for (const side of SIDES) play.classList.toggle(side, done?.side === side);

  const foot = $('foot');
  if (done?.kind === 'solved') {
    foot.replaceChildren(el('b', done.side, done.name), ` (${name(done.side)}) đoán đúng! `, el('strong', '', `${name(other(done.side))} −${done.damage}`));
  } else if (done) {
    foot.replaceChildren(done.kind === 'skip' ? 'Đổi sang từ khác' : 'Hết giờ, chưa ai đoán ra');
  } else {
    foot.replaceChildren('Comment đáp án! Đoán đúng thì phe kia mất sức', el('small', '', `Chưa có phe? Comment ${name('son').toUpperCase()} hoặc ${name('thuy').toUpperCase()}`));
  }
}

function renderResult(s) {
  const r = s.result;
  if (!r) return;
  const title = $('result-title');
  title.className = r.winner ?? '';
  title.textContent = r.winner ? `${name(r.winner).toUpperCase()} THẮNG HIỆP ${r.round}` : `HIỆP ${r.round} HÒA`;
  const how = r.reason === 'ko' && r.winner ? `${name(other(r.winner))} đã cạn sức` : `Hết giờ · ${r.hp.son} – ${r.hp.thuy}`;
  $('result-sub').textContent = r.answer ? `${how} · Từ vừa rồi: ${r.answer}` : how;
  $('result-score').querySelector('.son').textContent = s.wins.son;
  $('result-score').querySelector('.thuy').textContent = s.wins.thuy;
  $('result-mvp').textContent = r.mvp ? `Đoán giỏi nhất hiệp: ${r.mvp.name} (${name(r.mvp.side)}) · ${r.mvp.words} từ` : '';
}

function renderWedding(s) {
  const c = s.champion;
  if (!c) return;
  $('wed-title').textContent = `${name(c.side).toUpperCase()} RƯỚC ĐƯỢC MỊ NƯƠNG!`;
  $('wed-score').textContent = `${c.wins.son} : ${c.wins.thuy}`;
  const medals = ['🥇', '🥈', '🥉'];
  $('wed-top').replaceChildren(...c.top.map((p, i) => el('li', '', `${medals[i]} ${p.name} (${name(p.side)}) · ${p.words} từ`)));
}

function setMood(s) {
  const winner = s.phase === 'roundEnd' ? s.result?.winner : s.phase === 'matchEnd' ? s.champion?.side : null;
  for (const side of SIDES) {
    const hero = $(`hero-${side}`);
    hero.classList.toggle('win', Boolean(winner) && side === winner);
    hero.classList.toggle('lose', Boolean(winner) && side !== winner);
  }
  for (const side of SIDES) $('mi').classList.toggle(`go-${side}`, s.phase === 'matchEnd' && s.champion?.side === side);
}

function applyState(s) {
  const previous = state;
  state = s;
  for (const side of SIDES) {
    if (!holdHp[side]) setHp(side, s.hp[side]);
    HUD[side].troops.textContent = `${s.counts[side]} quân`;
    setPips(side, s.wins[side]);
    setDamage(side, s);
    if (previous && s.bonus[side] > previous.bonus[side]) restart(HUD[side].dmg, 'pulse');
    $(`lobby-${side}`).textContent = `${s.counts[side]} quân`;
  }
  $('round-label').textContent = s.phase === 'lobby' ? (s.round ? `SẮP HIỆP ${s.round + 1}` : 'CHỌN PHE') : `HIỆP ${s.round}`;
  updateArmies(s);
  const mode = s.phase === 'lobby' ? 'lobby' : s.phase === 'round' ? 'play' : 'result';
  for (const id of ['lobby', 'play', 'result']) $(id).hidden = id !== mode;
  if (mode === 'play') renderWord(s.word);
  if (mode === 'result') renderResult(s);
  $('wedding').hidden = s.phase !== 'matchEnd';
  if (s.phase === 'matchEnd') renderWedding(s);
  setMood(s);
  tickClock();
}

// ---------- Đồng hồ ----------
const ready = (s) => SIDES.every((side) => s.counts[side] >= guide.minPlayersPerSide);
let lastTick = 0;

function tickClock() {
  if (!state || !guide) return;
  const now = Date.now();
  const left = Math.max(0, state.endsAt - now);
  const clock = $('clock');
  const waiting = state.phase === 'lobby' && left <= 0 && !ready(state);
  clock.textContent = waiting ? '--:--' : mmss(left);
  if (state.phase === 'lobby') {
    $('lobby-note').textContent = waiting
      ? `Chờ mỗi phe có ít nhất ${guide.minPlayersPerSide} người`
      : `Hiệp ${state.round + 1} bắt đầu sau ${secs(left)} giây`;
  }
  const urgent = state.phase === 'round' && left > 0 && left <= 10_000;
  clock.classList.toggle('urgent', urgent);
  if (urgent && secs(left) !== lastTick) {
    lastTick = secs(left);
    sfx.tick();
  }
  const word = state.phase === 'round' ? state.word : null;
  if (word) {
    const wordLeft = word.done ? 0 : Math.max(0, word.endsAt - now);
    $('wordfill').style.transform = `scaleX(${Math.min(1, wordLeft / (guide.wordSeconds * 1000))})`;
    $('hint-note').textContent = word.done ? '' : `còn ${secs(wordLeft)} giây`;
  }
  if (state.phase === 'roundEnd') {
    const final = SIDES.some((side) => state.wins[side] >= guide.winsToMarry);
    $('result-next').textContent = final ? 'Chuẩn bị rước Mị Nương...' : `Hiệp ${state.round + 1} bắt đầu sau ${secs(left)} giây`;
  }
  if (state.phase === 'matchEnd') $('wed-note').textContent = `Trận mới sau ${secs(left)} giây · mọi người chọn phe lại nhé`;
}
setInterval(tickClock, 200);

// ---------- Thông báo ----------
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
  for (const part of item.parts) box.append(typeof part === 'string' ? part : el('b', part.side ?? '', part.b));
  box.hidden = false;
  toastTimer = setTimeout(nextToast, item.big ? 2600 : 1600);
}

// ---------- Hiệu ứng ----------
const fx = $('fx');
function later(ms, fn) {
  setTimeout(fn, ms);
}

function floatText(x, y, text) {
  const node = el('div', 'float', text);
  Object.assign(node.style, { left: `${x}px`, top: `${y}px` });
  fx.append(node);
  node.animate(
    [
      { transform: 'translate(-50%, 0) scale(.5)', opacity: 0 },
      { transform: 'translate(-50%, -30px) scale(1.2)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%, -130px) scale(1)', opacity: 0 },
    ],
    { duration: 1500, easing: 'ease-out', fill: 'forwards' },
  );
  later(1600, () => node.remove());
}

function burst(x, y, colors, count = 14) {
  for (let i = 0; i < count; i++) {
    const node = el('i', 'bit');
    Object.assign(node.style, { left: `${x}px`, top: `${y}px`, background: colors[i % colors.length] });
    fx.append(node);
    const angle = Math.random() * Math.PI * 2;
    const reach = 60 + Math.random() * 130;
    node.animate(
      [
        { transform: 'translate(0, 0) rotate(0)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * reach}px, ${Math.sin(angle) * reach + 70}px) rotate(320deg)`, opacity: 0 },
      ],
      { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(.15,.7,.4,1)', fill: 'forwards' },
    );
    later(1300, () => node.remove());
  }
}

function banner(text, top = 560) {
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

// Sơn Tinh ném đá núi, Thủy Tinh phun nước; thanh sức bên kia chỉ tụt lúc đạn tới.
function attack(side, target, damage) {
  const from = SPOT[side].hand;
  const to = SPOT[target].body;
  const lean = side === 'son' ? 1 : -1;
  $(`hero-${side}`).animate([{ transform: 'none' }, { transform: `translateX(${36 * lean}px) rotate(${5 * lean}deg)`, offset: 0.35 }, { transform: 'none' }], { duration: 650, easing: 'ease-out' });
  sfx.whoosh();
  const shot = el('div', `shot ${side}`);
  shot.innerHTML = shotSvg(side);
  fx.append(shot);
  const peak = Math.min(from.y, to.y) - 230;
  const midX = (from.x + to.x) / 2;
  shot.animate(
    [
      { transform: `translate(${from.x - 40}px, ${from.y - 40}px) scale(.5) rotate(0deg)` },
      { transform: `translate(${midX - 40}px, ${peak}px) scale(1.3) rotate(${220 * lean}deg)`, offset: 0.5 },
      { transform: `translate(${to.x - 40}px, ${to.y - 40}px) scale(1.05) rotate(${440 * lean}deg)` },
    ],
    { duration: 700, easing: 'ease-in', fill: 'forwards' },
  );
  holdHp[target]++;
  later(700, () => {
    shot.remove();
    holdHp[target]--;
    (side === 'son' ? sfx.rock : sfx.splash)();
    flash($(`hero-${target}`), 'hurt', 600);
    flash(HUD[target].hp, 'hit', 450);
    if (state) setHp(target, state.hp[target]);
    const at = SPOT[target].body;
    burst(at.x, at.y, side === 'son' ? ['#8a6a4a', '#5f4630', '#3e9b4f', '#c9a26b'] : ['#59b8ff', '#e8f6ff', '#2f7fd8', '#9fd8ff'], 18);
    floatText(at.x, at.y - 120, `−${damage}`);
  });
}

function flyGift(icon, side) {
  const source = document.querySelector(`#guide .gside.${side} .gitem[data-icon="${CSS.escape(icon)}"]`) ?? document.querySelector(`#guide .gside.${side}`);
  const from = stagePos(source);
  const to = stagePos(HUD[side].dmg);
  const node = Object.assign(new Image(), { className: 'flyer', src: icon, alt: '' });
  fx.append(node);
  node.animate(
    [
      { transform: `translate(${from.x - 48}px, ${from.y - 48}px) scale(.7)`, opacity: 0 },
      { transform: `translate(${(from.x + to.x) / 2 - 48}px, ${Math.min(from.y, to.y) - 160}px) scale(1.5)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${to.x - 48}px, ${to.y - 48}px) scale(.6)`, opacity: 1, offset: 0.9 },
      { transform: `translate(${to.x - 48}px, ${to.y - 48}px) scale(1.2)`, opacity: 0 },
    ],
    { duration: 1000, easing: 'ease-in-out', fill: 'forwards' },
  );
  later(1000, () => {
    node.remove();
    burst(to.x, to.y, ['#ffcf3f', '#fff', '#ff8fab'], 10);
    restart(HUD[side].dmg, 'pulse');
  });
}

function hearts() {
  const kinds = ['❤️', '💖', '🌸', '💗'];
  for (let i = 0; i < 26; i++) {
    const node = el('div', 'heart', kinds[i % kinds.length]);
    const x = 80 + Math.random() * 920;
    Object.assign(node.style, { left: `${x}px`, top: '1000px' });
    fx.append(node);
    node.animate(
      [
        { transform: 'translateY(0) scale(.6)', opacity: 0 },
        { transform: `translate(${(Math.random() - 0.5) * 120}px, -300px) scale(1.1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${(Math.random() - 0.5) * 200}px, -760px) scale(.9)`, opacity: 0 },
      ],
      { duration: 2600 + Math.random() * 1600, delay: Math.random() * 1500, easing: 'ease-out', fill: 'both' },
    );
    later(4400, () => node.remove());
  }
}

// ---------- Nhận tin từ server ----------
function loadGame(game) {
  clearArmies();
  const recent = [...game.players].sort((a, b) => b.at - a.at);
  for (const player of recent) players.set(player.pid, player);
  for (const side of SIDES) recent.filter((p) => p.side === side).slice(0, MAX_SHOWN).forEach((p) => showPlayer(p));
  wordNo = 0;
  applyState(game);
}

const handlers = {
  snapshot(msg) {
    guide = msg.guide;
    setupStatic();
    loadGame(msg.game);
  },
  reset(msg) {
    loadGame({ ...msg.state, players: [] });
  },
  join(msg) {
    players.set(msg.player.pid, msg.player);
    showPlayer(msg.player, { pop: true });
    applyState(msg.state);
    sfx.join();
    toast([{ b: msg.player.name, side: msg.player.side }, ` theo phe ${name(msg.player.side)}`]);
  },
  wave(msg) {
    cheer(msg.pid);
  },
  nudge(msg) {
    toast([{ b: msg.name }, ` ơi, comment ${name('son').toUpperCase()} hoặc ${name('thuy').toUpperCase()} để chọn phe`]);
  },
  'round-start'(msg) {
    wake();
    applyState(msg.state);
    sfx.drum();
    banner(`HIỆP ${msg.round}`);
  },
  word(msg) {
    applyState(msg.state);
    sfx.word();
  },
  hint(msg) {
    applyState(msg.state);
    sfx.hint();
  },
  timeout(msg) {
    applyState(msg.state);
    sfx.timeout();
  },
  hit(msg) {
    // Giữ thanh sức bên bị trúng tới lúc đạn bay tới.
    holdHp[msg.target]++;
    applyState(msg.state);
    holdHp[msg.target]--;
    cheer(msg.pid);
    attack(msg.side, msg.target, msg.damage);
  },
  'round-end'(msg) {
    const show = () => {
      applyState(latest);
      if (msg.winner) sfx.fanfare();
      else sfx.draw();
    };
    // Hạ gục thì để đạn bay tới đã rồi mới hiện kết quả; lúc đó có thể đã có tin mới hơn (bảng điều khiển bấm sang bước tiếp).
    if (msg.reason === 'ko') later(1100, show);
    else show();
  },
  'match-end'(msg) {
    applyState(msg.state);
    sfx.wedding();
    hearts();
  },
  gift(msg) {
    applyState(msg.state);
    sfx.gift();
    if (msg.icon) flyGift(msg.icon, msg.side);
    if (msg.pid) cheer(msg.pid);
    const times = msg.count > 1 ? ` x${msg.count}` : '';
    toast([{ b: msg.name, side: msg.side }, ` · ${msg.label}${times} → ${name(msg.side)} mỗi từ +${msg.added}${msg.later ? ' (hiệp sau)' : ''}`], { icon: msg.icon, first: true });
  },
};

let latest = null; // trạng thái mới nhất server gửi xuống
const events = new EventSource('/events');
events.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.state) latest = msg.state;
  handlers[msg.type]?.(msg);
};
