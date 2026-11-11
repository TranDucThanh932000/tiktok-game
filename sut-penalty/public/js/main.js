import { createScene } from './scene.js';
import { kitOf } from './art.js';
import { sfx, unlockAudio, audioReady } from './audio.js';

const W = 1080;
const H = 1920;
const stage = document.getElementById('stage');
const $ = (id) => document.getElementById(id);

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
function avatar(fan, className = '') {
  const initial = () => el('i', { className, textContent: Array.from(String(fan?.name ?? '').trim())[0]?.toUpperCase() ?? '' });
  if (fan?.avatar) {
    const img = el('img', { className, src: fan.avatar, alt: '', referrerPolicy: 'no-referrer' });
    img.onerror = () => img.replaceWith(initial());
    return img;
  }
  return initial();
}

let teams = [];
let guide = { gifts: [] };
let shown = {};
const cards = new Map();
const slots = new Map();
const nameOf = (id) => teams.find((t) => t.id === id)?.name ?? id;

const scene = createScene($('pitch'), {
  onLaunch: (msg) => sfx.kick(msg.gap < 500),
  onResolve(msg) {
    const fast = msg.gap < 500;
    const now = msg.board.stats[msg.team];
    const cur = shown[msg.team] ?? { goals: 0, saved: 0 };
    shown[msg.team] = { goals: Math.max(cur.goals, now.goals), saved: Math.max(cur.saved, now.saved) };
    renderTeam(msg.team, msg.saved ? null : 'scored');
    renderLeaders(msg.board.leaders);
    if (msg.saved) sfx.save(fast);
    else sfx.goal(fast);
  },
});

const fmt = (n) => n.toLocaleString('en-US');
const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? '' : 's'}`;

// ---------- Đầu trang ----------
function buildHeader(snapshot, logos) {
  $('title').textContent = guide.title ?? 'PENALTY SHOOTOUT';
  $('subtitle').textContent = guide.subtitle ?? '';
  const likeCard = guide.likesPerShot > 0 ? el('div', { className: 'gift like', title: 'Likes' }, el('span', { className: 'heart' }, '❤️', el('small', { textContent: `×${fmt(guide.likesPerShot)}` })), el('b', { textContent: '1 shot' })) : null;
  $('gifts').replaceChildren(
    ...guide.gifts.map((g) => el('div', { className: 'gift', title: g.giftLabel }, el('img', { src: g.icon, alt: '' }), el('b', { textContent: plural(g.shots, 'shot') }))),
    ...(likeCard ? [likeCard] : []),
  );
  cards.clear();
  $('board').replaceChildren(
    ...snapshot.teams.map((t) => {
      const kit = kitOf(t.id);
      const card = el('div', { className: 'team' }, el('span', { className: 'crown', textContent: '👑' }), el('div', { className: 'name', textContent: t.name }), el('div', { className: 'goals', textContent: '0' }), el('div', { className: 'sub' }));
      card.style.setProperty('--strip', kit.strip);
      const logo = logos[t.id];
      if (logo) {
        card.classList.add('has-logo');
        card.style.setProperty('--logo', `url("${encodeURI(logo)}")`);
      }
      cards.set(t.id, card);
      return card;
    }),
  );
}

function renderTeam(id, flash) {
  const card = cards.get(id);
  if (!card) return;
  const s = shown[id] ?? { goals: 0, saved: 0 };
  card.querySelector('.goals').textContent = fmt(s.goals);
  card.querySelector('.sub').textContent = s.goals === 1 ? 'goal' : 'goals';
  if (flash) {
    card.classList.remove('scored');
    void card.offsetWidth;
    card.classList.add(flash);
  }
  const top = Math.max(...teams.map((t) => shown[t.id]?.goals ?? 0));
  for (const t of teams) cards.get(t.id)?.classList.toggle('leading', top > 0 && (shown[t.id]?.goals ?? 0) === top);
}

function renderLeaders(list) {
  const box = $('leaders');
  box.hidden = !list?.length;
  if (!list?.length) return;
  box.replaceChildren(
    el('span', { className: 'label', textContent: '👑 Top scorers' }),
    ...list.map((f) => {
      const who = el('span', { className: 'who' }, avatar(f), el('span', { textContent: f.name }), el('em', { textContent: String(f.goals) }));
      who.style.setProperty('--team', kitOf(f.team).color);
      return who;
    }),
  );
}

// ---------- Cầu thủ: tên người đang sút, số fan ----------
function buildSquad() {
  slots.clear();
  $('squad').replaceChildren(
    ...teams.map((t) => {
      const kit = kitOf(t.id);
      const tag = el('div', { className: 'tag' });
      const fans = el('small');
      const pill = el('div', { className: 'pill' }, `${t.name} `, fans);
      pill.style.setProperty('--pill', kit.pill);
      pill.style.setProperty('--pill-text', kit.pillText);
      if (kit.pillBorder) pill.style.setProperty('--pill-border', kit.pillBorder);
      const slot = el('div', { className: 'slot' }, tag, pill);
      slot.style.left = `${scene.playerX(t.id)}px`;
      slot.style.top = '1452px';
      slot.style.setProperty('--team', kit.color);
      slots.set(t.id, { tag, fans });
      return slot;
    }),
  );
}

function renderBoard(board) {
  scene.setBoard(board);
  let total = 0;
  for (const t of teams) {
    const slot = slots.get(t.id);
    if (!slot) continue;
    const left = board.pending[t.id] ?? 0;
    total += left;
    const head = board.heads[t.id];
    slot.tag.classList.toggle('on', Boolean(head));
    if (head) slot.tag.replaceChildren(avatar(head), el('span', { textContent: head.name }), el('em', { textContent: `⚽${fmt(left)}` }));
    const fans = board.fans[t.id] ?? 0;
    slot.fans.textContent = fans ? `· ${fans}` : '';
  }
  const turbo = $('turbo');
  turbo.hidden = total < 20;
  if (total >= 20) turbo.replaceChildren('⚡ RAPID FIRE · ', el('b', { textContent: fmt(total) }), ' shots left');
  $('paused').hidden = !board.paused;
}

// ---------- Thông báo ----------
function toast(color, ...children) {
  const box = $('toasts');
  const node = el('div', { className: 'toast' }, ...children);
  node.style.setProperty('--team', color);
  box.append(node);
  while (box.children.length > 2) box.firstElementChild.remove();
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 400);
  }, 3200);
}

let lastJoinToast = 0;
function onJoin(msg) {
  scene.wave(msg.team);
  sfx.join();
  if (msg.auto || performance.now() - lastJoinToast < 700) return;
  lastJoinToast = performance.now();
  const team = el('b', { textContent: nameOf(msg.team) });
  team.style.color = kitOf(msg.team).color;
  toast(kitOf(msg.team).color, avatar(msg.fan, 'avatar'), el('span', { className: 'name', textContent: msg.fan.name }), msg.from ? ' switched to ' : ' joined ', team);
}

function onGift(msg) {
  sfx.gift();
  const index = guide.gifts.findIndex((g) => g.coins === msg.coins);
  const card = $('gifts').children[index];
  if (card) {
    card.classList.remove('pop');
    void card.offsetWidth;
    card.classList.add('pop');
  }
  const icon = guide.gifts[index]?.icon;
  const team = el('b', { textContent: nameOf(msg.team) });
  team.style.color = kitOf(msg.team).color;
  toast(
    kitOf(msg.team).color,
    avatar(msg.fan, 'avatar'),
    el('span', { className: 'name', textContent: msg.fan.name }),
    icon ? el('img', { className: 'icon', src: icon, alt: '' }) : el('span', { textContent: msg.giftName || '🎁' }),
    `x${msg.count}`,
    el('em', { textContent: ` +${plural(msg.shots, 'shot')} ` }),
    team,
  );
}

// Tim đổi lượt sút đến dồn dập nên chỉ báo mỗi 1,2 giây một lần.
let lastLikeToast = 0;
function onLikes(msg) {
  const card = $('gifts').querySelector('.like');
  if (card) {
    card.classList.remove('pop');
    void card.offsetWidth;
    card.classList.add('pop');
  }
  if (performance.now() - lastLikeToast < 1200) return;
  lastLikeToast = performance.now();
  const team = el('b', { textContent: nameOf(msg.team) });
  team.style.color = kitOf(msg.team).color;
  toast(
    kitOf(msg.team).color,
    avatar(msg.fan, 'avatar'),
    el('span', { className: 'name', textContent: msg.fan.name }),
    ` ❤️${fmt(msg.likes)}`,
    el('em', { textContent: ` +${plural(msg.shots, 'shot')} ` }),
    team,
  );
}

// ---------- Sự kiện từ server ----------
function onSnapshot(msg) {
  guide = msg.guide;
  teams = msg.game.teams;
  shown = structuredClone(msg.game.board.stats);
  scene.setTeams(teams);
  scene.setSprites(msg.sprites ?? []);
  buildHeader(msg.game, msg.logos ?? {});
  buildSquad();
  for (const t of teams) renderTeam(t.id);
  renderLeaders(msg.game.board.leaders);
  renderBoard(msg.game.board);
  showStatus(msg.status);
}

function showStatus(status) {
  $('status').hidden = status.connected;
  $('status').textContent = 'Not connected to TikTok LIVE';
}

const handlers = {
  snapshot: onSnapshot,
  status: showStatus,
  join(msg) {
    onJoin(msg);
    renderBoard(msg.board);
  },
  gift(msg) {
    onGift(msg);
    renderBoard(msg.board);
  },
  likes(msg) {
    onLikes(msg);
    renderBoard(msg.board);
  },
  shot(msg) {
    scene.shot(msg);
    renderBoard(msg.board);
  },
  board(msg) {
    renderBoard(msg.board);
  },
  reset(msg) {
    shown = structuredClone(msg.board.stats);
    for (const t of teams) renderTeam(t.id);
    renderLeaders([]);
    renderBoard(msg.board);
  },
};

const events = new EventSource('/events');
events.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  handlers[msg.type]?.(msg);
};

// Cửa sổ game mở bằng Edge --autoplay-policy=no-user-gesture-required thì tự có tiếng; trình duyệt thường cần bấm một lần.
const hint = $('sound-hint');
Promise.resolve(unlockAudio()).finally(() => {
  setTimeout(() => (hint.hidden = audioReady()), 300);
});
addEventListener('pointerdown', () => Promise.resolve(unlockAudio()).then(() => (hint.hidden = audioReady())));
