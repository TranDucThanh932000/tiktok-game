import { sfx, wake, onAudioState, speak, stopSpeech } from './audio.js';
import { buildMap, loadMap } from './map.js';

const W = 1080;
const H = 1920;
const ROW_H = 48;
const FEED_SIZE = 4;
const MAX_TAGS = 4;
const MAX_FLYERS = 6;
const BIG_GIFT = 50;
const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const fmt = (n) => Number(n).toLocaleString('vi-VN');
const restart = (node, className) => {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
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

// ---------- Trạng thái ----------
let guide = null;
let map = null;
const meta = new Map(); // id tỉnh -> { name, short, plate, region }
const tally = new Map(); // id tỉnh -> { people, gift, score, at }
let members = 0;

const shortName = (id) => {
  const info = meta.get(id);
  return info.name.length > 15 ? info.short : info.name;
};

// Cùng luật xếp hạng với server: điểm cao trước, bằng điểm thì tỉnh đạt mức đó trước đứng trên.
function ranking() {
  return [...tally]
    .filter(([, t]) => t.score > 0)
    .sort(([a, x], [b, y]) => y.score - x.score || x.at - y.at || meta.get(a).plate - meta.get(b).plate)
    .map(([id, t]) => ({ id, ...t }));
}

// ---------- Vẽ lại: gộp các sự kiện dồn dập vào một lần vẽ ----------
let renderTimer = 0;
function scheduleRender() {
  if (!renderTimer) renderTimer = setTimeout(render, 120);
}

function render() {
  clearTimeout(renderTimer);
  renderTimer = 0;
  if (!map) return;
  const list = ranking();
  const top = list[0]?.score ?? 0;
  const rankOf = new Map(list.map((row, i) => [row.id, i + 1]));
  for (const [id, t] of tally) {
    map.setScore(id, t.score, top ? Math.sqrt(t.score / top) : 0);
    map.setRank(id, rankOf.get(id) ?? 0);
  }
  map.setLeader(list[0]?.id ?? null);
  renderBoard(list.slice(0, guide.boardSize), top);
  $('totals').textContent = `👥 ${fmt(members)} người`;
}

// ---------- Bảng xếp hạng ----------
const rows = new Map(); // id tỉnh -> các ô của dòng

function makeRow(id) {
  const info = meta.get(id);
  const root = el('div', 'row');
  root.style.setProperty('--c', map.items.get(id).color);
  const name = el('span', 'name', shortName(id));
  if (name.textContent.length > 12) name.classList.add('long');
  const row = { root, bar: el('i', 'bar'), rank: el('b', 'rank'), name, people: el('span', 'people'), score: el('b', 'score'), last: null };
  root.append(row.bar, row.rank, el('span', 'chip', String(info.plate)), name, row.people, row.score);
  return row;
}

function renderBoard(list, top) {
  const box = $('rows');
  box.style.setProperty('--rows', guide.boardSize);
  $('board-empty').hidden = list.length > 0;
  const shown = new Set(list.map((entry) => entry.id));
  for (const [id, row] of rows) {
    if (shown.has(id)) continue;
    rows.delete(id);
    row.root.style.opacity = '0';
    setTimeout(() => row.root.remove(), 450);
  }
  list.forEach((entry, i) => {
    let row = rows.get(entry.id);
    if (!row) {
      // Dòng mới trượt lên từ đáy bảng.
      row = makeRow(entry.id);
      rows.set(entry.id, row);
      Object.assign(row.root.style, { transition: 'none', transform: `translateY(${guide.boardSize * ROW_H}px)`, opacity: '0' });
      box.append(row.root);
      void row.root.offsetWidth;
      Object.assign(row.root.style, { transition: '', opacity: '' });
    }
    row.root.style.transform = `translateY(${i * ROW_H}px)`;
    for (let r = 1; r <= 3; r++) row.root.classList.toggle(`r${r}`, i === r - 1);
    const rank = String(i + 1);
    if (row.rank.textContent !== rank) row.rank.textContent = rank;
    row.bar.style.setProperty('--w', `${Math.max(8, (entry.score / top) * 100)}%`);
    const people = `👥${fmt(entry.people)}`;
    if (row.people.textContent !== people) row.people.textContent = people;
    if (row.last !== entry.score) {
      if (row.last !== null) restart(row.score, 'bump');
      row.score.textContent = fmt(entry.score);
      row.last = entry.score;
    }
  });
}

// ---------- Cách chơi ----------
function renderGuide() {
  const line = (icon, label, note, points) => {
    const row = el('div', 'line');
    const text = el('span', '', label);
    if (note) text.append(el('small', '', note));
    row.append(icon, text, el('b', '', points));
    return row;
  };
  $('guide').replaceChildren(
    el('h3', '', 'CÁCH CHƠI'),
    line(el('i', 'icon', '💬'), 'Comment tên tỉnh', 'Mỗi người tính 1 lần', `+${guide.commentPoints}`),
    ...guide.gifts.map((gift) => line(Object.assign(new Image(), { src: gift.icon, alt: '' }), gift.label, '', `+${gift.points}`)),
    el('p', 'note', 'Điểm cộng cho tỉnh của bạn'),
  );
}

// Vị trí (theo tọa độ khung 1080x1920) của hình quà trong ô cách chơi, để quà bay ra từ đó.
function giftOrigin(icon) {
  const node = icon ? [...$('guide').querySelectorAll('img')].find((img) => img.getAttribute('src') === icon) : null;
  const box = (node ?? $('guide')).getBoundingClientRect();
  const frame = stage.getBoundingClientRect();
  const scale = frame.width / W;
  return { x: (box.left + box.width / 2 - frame.left) / scale, y: (box.top + box.height / 2 - frame.top) / scale };
}

// ---------- Vừa điểm danh / tiếp sức ----------
function avatar(name, url, className) {
  const fallback = () => el('i', className, Array.from(name.trim())[0]?.toUpperCase() ?? '?');
  if (!url) return fallback();
  const img = Object.assign(new Image(), { className, src: url, alt: '', referrerPolicy: 'no-referrer' });
  img.onerror = () => img.replaceWith(fallback());
  return img;
}

let lastJoinFeed = 0;
let lastGiftFeed = null;
function addFeed({ kind, name, url, line, plus, icon, key, points }) {
  // Đông người thì không hiện hết người điểm danh, để quà luôn có chỗ.
  if (kind === 'join') {
    if (performance.now() - lastJoinFeed < 700) return;
    lastJoinFeed = performance.now();
  }
  // Combo quà của cùng một người: cộng dồn vào dòng vừa hiện thay vì thêm dòng mới.
  if (key && lastGiftFeed?.key === key && lastGiftFeed.node.isConnected && performance.now() - lastGiftFeed.at < 6000) {
    lastGiftFeed.points += points;
    lastGiftFeed.at = performance.now();
    lastGiftFeed.label.textContent = `+${fmt(lastGiftFeed.points)}`;
    restart(lastGiftFeed.node, 'bump');
    return;
  }
  const item = el('div', `item ${kind}`);
  const text = el('div', 'txt');
  text.append(el('b', '', name), el('span', '', line));
  const amount = el('div', 'plus');
  if (icon) amount.append(Object.assign(new Image(), { src: icon, alt: '' }));
  const label = el('span', '', plus);
  amount.append(label);
  item.append(avatar(name, url, 'ava'), text, amount);
  const feed = $('feed');
  feed.prepend(item);
  while (feed.children.length > FEED_SIZE) feed.lastElementChild.remove();
  lastGiftFeed = key ? { key, node: item, label, points, at: performance.now() } : lastGiftFeed;
}

// ---------- Hiệu ứng ----------
const fx = $('fx');
// Đông người điểm danh dồn dập thì bỏ bớt chữ bay, tim bay; tỉnh vẫn nháy và bảng vẫn cập nhật.
// Cửa sổ bị ẩn thì hiệu ứng không chạy, bỏ qua luôn để không dồn lại hàng trăm hình chờ chạy.
const MAX_FX = 70;
const busyFx = () => document.hidden || fx.childElementCount > MAX_FX;

function floatText(x, y, text, big = false) {
  if (document.hidden || (!big && busyFx())) return;
  const node = el('div', big ? 'float big' : 'float', text);
  Object.assign(node.style, { left: `${x}px`, top: `${y}px` });
  fx.append(node);
  node.animate(
    [
      { transform: 'translate(-50%, -50%) scale(.5)', opacity: 0 },
      { transform: 'translate(-50%, -90%) scale(1.15)', opacity: 1, offset: 0.2 },
      { transform: `translate(-50%, ${big ? -330 : -250}%) scale(1)`, opacity: 0 },
    ],
    { duration: big ? 2200 : 1400, easing: 'ease-out' },
  ).onfinish = () => node.remove();
}

let tags = 0;
const shownTags = new Set();
function nameTag(id, name, url, { force = false, ms = 1800 } = {}) {
  const key = `${id}:${name}`;
  if (document.hidden || (tags >= MAX_TAGS && !force) || shownTags.has(key)) return;
  tags++;
  shownTags.add(key);
  const { x, y, size } = map.point(id);
  const node = el('div', 'tag');
  node.style.setProperty('--c', map.items.get(id).color);
  node.append(avatar(name, url, ''), name);
  Object.assign(node.style, { left: `${x}px`, top: `${y - size / 2 - 30}px` });
  fx.append(node);
  node.animate(
    [
      { transform: 'translate(-50%, -60%) scale(.6)', opacity: 0 },
      { transform: 'translate(-50%, -100%) scale(1)', opacity: 1, offset: 0.15 },
      { transform: 'translate(-50%, -100%) scale(1)', opacity: 1, offset: 0.8 },
      { transform: 'translate(-50%, -150%) scale(.95)', opacity: 0 },
    ],
    { duration: ms, easing: 'ease-out' },
  ).onfinish = () => {
    node.remove();
    tags--;
    shownTags.delete(key);
  };
}

function sparks(x, y, count) {
  if (busyFx()) return;
  const colors = ['#ffe066', '#ff6f91', '#7bdff2', '#ffffff', '#b2f7a1'];
  for (let i = 0; i < count; i++) {
    const node = el('i', 'spark');
    Object.assign(node.style, { left: `${x}px`, top: `${y}px`, background: colors[i % colors.length] });
    fx.append(node);
    const angle = Math.random() * Math.PI * 2;
    const reach = 50 + Math.random() * 120;
    node.animate(
      [{ transform: 'translate(0, 0) rotate(0)', opacity: 1 }, { transform: `translate(${Math.cos(angle) * reach}px, ${Math.sin(angle) * reach + 40}px) rotate(320deg)`, opacity: 0 }],
      { duration: 800 + Math.random() * 500, easing: 'cubic-bezier(.15, .7, .4, 1)' },
    ).onfinish = () => node.remove();
  }
}

let flyers = 0;
function flyGift(icon, id, done) {
  // Combo lớn bắn rất nhiều sự kiện: quá số quà đang bay thì chỉ nháy tỉnh, không thêm quà bay.
  if (document.hidden || flyers >= MAX_FLYERS) return done();
  flyers++;
  const { x, y } = map.point(id);
  const from = giftOrigin(icon);
  const node = icon ? Object.assign(new Image(), { className: 'flyer', src: icon, alt: '' }) : el('div', 'flyer', '🎁');
  if (!icon) Object.assign(node.style, { fontSize: '70px', textAlign: 'center' });
  Object.assign(node.style, { left: `${x - 45}px`, top: `${y - 45}px` });
  fx.append(node);
  const dx = from.x - x;
  const dy = from.y - y;
  node.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(.5)`, opacity: 0 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 140}px) scale(1.3)`, opacity: 1, offset: 0.5 },
      { transform: 'translate(0, 0) scale(.7)', opacity: 1, offset: 0.88 },
      { transform: 'translate(0, 0) scale(1.5)', opacity: 0 },
    ],
    { duration: 1150, easing: 'ease-in-out' },
  ).onfinish = () => {
    node.remove();
    flyers--;
    done();
  };
}

function hearts(id, n) {
  if (busyFx()) return;
  const { x, y } = map.point(id);
  for (let i = 0; i < n; i++) {
    const node = el('div', 'heart', ['❤️', '💖', '💗'][i % 3]);
    Object.assign(node.style, { left: `${x + (Math.random() - 0.5) * 24}px`, top: `${y - 10}px` });
    fx.append(node);
    const drift = (Math.random() - 0.5) * 60;
    node.animate(
      [{ transform: 'translate(-50%, -50%) scale(.4)', opacity: 0 }, { transform: 'translate(-50%, -90%) scale(1)', opacity: 1, offset: 0.2 }, { transform: `translate(calc(-50% + ${drift}px), -420%) scale(.8)`, opacity: 0 }],
      { duration: 1300 + Math.random() * 500, delay: i * 120, easing: 'ease-out' },
    ).onfinish = () => node.remove();
  }
}

let bannerTimer = 0;
let lastBanner = -Infinity;
function leadBanner(id) {
  // Hai tỉnh giành nhau ngôi đầu liên tục thì không hiện băng rôn dồn dập; vương miện vẫn đổi chỗ ngay.
  if (performance.now() - lastBanner < 8000) return;
  lastBanner = performance.now();
  const box = $('banner');
  const name = meta.get(id).name.toUpperCase();
  box.replaceChildren(`👑 ${name}`, el('small', '', 'ĐANG DẪN ĐẦU CUỘC ĐUA!'));
  box.classList.toggle('long', name.length > 12);
  box.hidden = true;
  void box.offsetWidth;
  box.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    box.hidden = true;
  }, 3300);
  sfx.lead();
  const { x, y } = map.point(id);
  sparks(x, y, 30);
}

// ---------- MC ----------
function hideMc() {
  $('mc').hidden = true;
}

function say(msg) {
  if (!msg.clips?.length) {
    if (msg.cut) stopSpeech();
    hideMc();
    return;
  }
  speak(msg, {
    onStart() {
      if (!msg.text) return;
      $('mc-text').textContent = msg.text;
      $('mc').hidden = false;
    },
    onDone: hideMc,
  });
}

// ---------- Nhận tin từ server ----------
function applyRace(race) {
  for (const id of meta.keys()) tally.set(id, { people: 0, gift: 0, score: 0, at: 0 });
  for (const row of race.tally) tally.set(row.id, { people: row.people, gift: row.gift, score: row.score, at: row.at });
  members = race.members;
  render();
}

function update(msg) {
  tally.set(msg.province, { people: msg.people, gift: msg.gift, score: msg.score, at: msg.at });
  scheduleRender();
}

const mapData = await loadMap();

const handlers = {
  snapshot(msg) {
    guide = msg.guide;
    $('title-text').textContent = guide.title;
    $('subtitle').textContent = guide.subtitle;
    for (const p of msg.provinces) meta.set(p.id, p);
    map ??= buildMap({ root: $('map'), layer: $('badges'), data: mapData, meta, scores: guide.mapScores });
    renderGuide();
    applyRace(msg.race);
  },
  reset(msg) {
    applyRace(msg.race);
    $('feed').replaceChildren();
    sfx.reset();
  },
  join(msg) {
    wake();
    update(msg);
    members = msg.members;
    const { x, y } = map.point(msg.province);
    const boosted = msg.held > 0;
    map.flash(msg.province, boosted);
    floatText(x, y - 18, `+${fmt(msg.points)}`, boosted);
    nameTag(msg.province, msg.name, msg.avatar, { force: boosted });
    sfx.join();
    addFeed({ kind: boosted ? 'gift' : 'join', name: msg.name, url: msg.avatar, line: `→ ${shortName(msg.province)}`, plus: `+${fmt(msg.points)}` });
  },
  gift(msg) {
    wake();
    update(msg);
    const big = msg.points >= BIG_GIFT;
    const { x, y } = map.point(msg.province);
    flyGift(msg.icon, msg.province, () => {
      map.flash(msg.province, true);
      floatText(x, y - 18, `+${fmt(msg.points)}`, true);
      sparks(x, y, big ? 34 : 16);
    });
    nameTag(msg.province, msg.name, msg.avatar, { force: true, ms: 2800 });
    sfx.gift(big);
    addFeed({ kind: 'gift', name: msg.name, url: msg.avatar, line: `→ ${shortName(msg.province)}`, plus: `+${fmt(msg.points)}`, icon: msg.icon, key: `${msg.name}|${msg.province}|${msg.icon}`, points: msg.points });
  },
  pending(msg) {
    wake();
    sfx.pending();
    addFeed({ kind: 'pending', name: msg.name, url: msg.avatar, line: 'Comment tên tỉnh!', plus: `+${fmt(msg.held)}`, icon: msg.icon });
  },
  like(msg) {
    hearts(msg.province, msg.n);
  },
  lead(msg) {
    render();
    leadBanner(msg.province);
  },
  say,
  'safe-mode'(msg) {
    if (msg.on) say({ clips: [], cut: true });
  },
};

const events = new EventSource('/events');
events.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  handlers[msg.type]?.(msg);
};
