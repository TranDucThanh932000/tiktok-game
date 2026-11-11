import { sfx, wake, onAudioState, speak, stopSpeech } from './audio.js';
import { buildMap, loadMap, LAND } from './map.js';
import { createCamera } from './camera.js';

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
let camera = null;
// Vị trí tỉnh trên màn hình theo góc nhìn camera 3D đang hướng tới (hiệu ứng là lớp HTML nằm trên bản đồ).
const spot = (id) => map.point(id);
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
  // Tỉnh càng nhiều điểm so với tỉnh dẫn đầu thì khối đất càng cao.
  for (const [id, t] of tally) map.setHeat(id, top ? Math.sqrt(t.score / top) : 0);
  map.setLeader(list[0]?.id ?? null);
  renderBoard(list.slice(0, guide.boardSize), top);
  $('totals').textContent = `👥 ${fmt(members)} người`;
}

// ---------- Bảng xếp hạng ----------
const rows = new Map(); // id tỉnh -> các ô của dòng

function makeRow(id) {
  const info = meta.get(id);
  const root = el('div', 'row');
  root.style.setProperty('--c', LAND);
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
  // Quà không ghi tên, chỉ hiện hình; quà cùng số điểm (Hoa hồng, Tim cam) chung một dòng.
  const byPoints = new Map();
  for (const gift of guide.gifts) {
    if (!byPoints.has(gift.points)) byPoints.set(gift.points, []);
    byPoints.get(gift.points).push(gift);
  }
  const giftLine = (points, gifts) => {
    const icons = el('span', 'icons');
    icons.append(...gifts.map((gift) => Object.assign(new Image(), { src: gift.icon, alt: gift.label, title: gift.label })));
    const row = el('div', 'line gifts');
    row.append(icons, el('b', '', `+${points}`));
    return row;
  };
  $('guide').replaceChildren(
    el('h3', '', 'CÁCH CHƠI'),
    line(el('i', 'icon', '💬'), 'Comment tên tỉnh', 'Mỗi người tính 1 lần', `+${guide.commentPoints}`),
    ...(guide.quiz ? [line(el('i', 'icon', '✏️'), 'Đoán đúng ô chữ', 'Mỗi câu đố', `+${guide.quiz.points}`)] : []),
    ...[...byPoints].map(([points, gifts]) => giftLine(points, gifts)),
    el('p', 'note', 'Điểm cộng cho tỉnh của bạn'),
  );
  // Có đố chữ: cách chơi nằm ở cột phải ngay dưới bảng xếp hạng (bảng dài ngắn theo boardSize).
  if (guide.quiz) {
    const board = $('board');
    $('rows').style.setProperty('--rows', guide.boardSize);
    $('guide').style.top = `${board.offsetTop + board.offsetHeight + 14}px`;
  }
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
  // Đông người thì không hiện hết người điểm danh / trả lời đúng, để quà luôn có chỗ.
  if (kind === 'join' || kind.startsWith('quiz')) {
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
  const { x, y, size } = spot(id);
  const node = el('div', 'tag');
  node.style.setProperty('--c', LAND);
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
  const { x, y } = spot(id);
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
  const { x, y } = spot(id);
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
  const { x, y } = spot(id);
  sparks(x, y, 30);
}

// ---------- Người tặng quà: thẻ to cạnh tỉnh trong lúc camera focus tỉnh đó ----------
// Thẻ gắn với tỉnh: camera bay tới tỉnh nào thì hiện người vừa tặng cho tỉnh đó, kể cả khi camera phải chờ lượt.
const GIVER_FRESH_MS = 30_000;
const GIVER_COMBO_MS = 8_000;
const givers = new Map(); // id tỉnh -> { name, avatar, icon, points, at }
let giverShown = null; // tỉnh đang hiện thẻ
let giverTimer = 0;
// Thẻ chỉ hiện khi camera focus; tắt camera thì dùng thẻ tên nhỏ trên tỉnh như trước.
const cardOn = () => guide.camera?.enabled !== false;

// total: điểm đã cộng sẵn cả combo (MC đọc). Không có thì cùng một người tặng liên tiếp được cộng dồn.
function noteGiver(province, { name, avatar, icon, points, total = false }) {
  const prev = givers.get(province);
  const now = performance.now();
  const same = prev?.name === name && now - prev.at < GIVER_COMBO_MS;
  givers.set(province, {
    name,
    avatar: avatar || (same ? prev.avatar : ''),
    icon: icon || (same ? prev.icon : ''),
    points: total || !same ? points : prev.points + points,
    at: now,
  });
  if (giverShown === province) drawGiver(province, same);
}

function drawGiver(province, sameGiver = false) {
  const g = givers.get(province);
  const box = $('giver');
  clearTimeout(giverTimer);
  box.classList.remove('out');
  // Combo của cùng một người: chỉ cập nhật điểm.
  if (sameGiver && !box.hidden) {
    box.querySelector('.pts').textContent = `+${fmt(g.points)}`;
    restart(box, 'bump');
    return;
  }
  const gift = el('span', 'gift');
  gift.append(g.icon ? Object.assign(new Image(), { src: g.icon, alt: '' }) : el('i', '', '🎁'), el('b', 'pts', `+${fmt(g.points)}`));
  const line = el('span', 'line', 'tiếp sức ');
  line.append(el('strong', '', shortName(province)));
  const info = el('div', 'info');
  info.append(el('b', 'name', g.name), line, gift);
  box.replaceChildren(avatar(g.name, g.avatar, 'ava'), info);
  // Ngay dưới bảng xếp hạng (bảng dài ngắn theo boardSize), cạnh tỉnh đang được focus.
  // Có đố chữ thì cách chơi nằm dưới bảng xếp hạng, thẻ xuống dưới cách chơi.
  const above = guide.quiz ? $('guide') : $('board');
  box.style.top = `${above.offsetTop + above.offsetHeight + 14}px`;
  box.classList.remove('bump');
  box.hidden = false;
  restart(box, 'in');
}

function showGiver(province) {
  const g = givers.get(province);
  if (!g || performance.now() - g.at > GIVER_FRESH_MS) return hideGiver();
  giverShown = province;
  drawGiver(province);
}

function hideGiver() {
  if (!giverShown) return;
  giverShown = null;
  const box = $('giver');
  box.classList.add('out');
  clearTimeout(giverTimer);
  giverTimer = setTimeout(() => {
    box.hidden = true;
    box.classList.remove('out');
  }, 350);
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
      // MC đọc câu tiếp sức: camera giữ ở tỉnh đó cho tới khi nói xong, thẻ hiện đúng người MC đang đọc tên.
      if (msg.province) {
        if (msg.giver) noteGiver(msg.province, { ...msg.giver, total: true });
        camera.focus(msg.province, { lockMs: 20000 });
      }
      if (!msg.text) return;
      $('mc-text').textContent = msg.text;
      $('mc').hidden = false;
    },
    onDone() {
      if (msg.province) camera.unlock(msg.province);
      hideMc();
    },
  });
}

// ---------- Đố chữ ----------
// Màn hình chỉ biết các chữ đã mở; đáp án đầy đủ chỉ tới lúc công bố.
const quiz = { no: 0, phase: 'idle', endsAt: 0, startedAt: 0, total: 1, count: 0, first: null, timer: 0 };
const TILE_SIZES = [54, 50, 46, 42, 38, 34, 30];
const TILE_ROW = 1000; // bề ngang dành cho ô chữ trong khung đố chữ

// Số dòng khi xếp các tiếng với cỡ ô này (xuống dòng giữa các tiếng); Infinity nếu một tiếng dài quá một dòng.
function tileRows(words, size) {
  let rows = 1;
  let used = 0;
  for (const word of words) {
    const width = word.length * (size + 4) - 4;
    if (width > TILE_ROW) return Infinity;
    if (used && used + 16 + width > TILE_ROW) {
      rows++;
      used = width;
    } else used += (used ? 16 : 0) + width;
  }
  return rows;
}

// Ưu tiên cả từ nằm một dòng với ô vừa đủ to; không được thì hai dòng với ô to nhất có thể.
function tileSize(words) {
  return TILE_SIZES.find((size) => size >= 34 && tileRows(words, size) === 1) ?? TILE_SIZES.find((size) => tileRows(words, size) <= 2) ?? TILE_SIZES.at(-1);
}

// tiles: mỗi ô là '' (chưa mở), ' ' (cách giữa hai tiếng) hoặc chữ đã mở.
function drawTiles(tiles, solved = false) {
  const words = [[]];
  tiles.forEach((ch, i) => (ch === ' ' ? words.push([]) : words.at(-1).push({ ch, i })));
  const box = $('quiz-tiles');
  box.style.setProperty('--t', `${tileSize(words.filter((w) => w.length))}px`);
  box.replaceChildren(
    ...words
      .filter((w) => w.length)
      .map((word) => {
        const group = el('div', 'word');
        for (const { ch, i } of word) {
          const tile = el('div', solved ? 'tile solved' : 'tile', ch);
          tile.dataset.i = i;
          group.append(tile);
        }
        return group;
      }),
  );
}

function openTile(index, letter) {
  const tile = [...$('quiz-tiles').querySelectorAll('.tile')].find((node) => node.dataset.i === String(index));
  if (!tile) return;
  tile.textContent = letter;
  restart(tile, 'open');
}

function quizTimer() {
  clearInterval(quiz.timer);
  const tick = () => {
    const left = Math.max(0, quiz.endsAt - Date.now());
    const time = $('quiz-time');
    time.textContent = `${Math.ceil(left / 1000)}`;
    time.classList.toggle('low', quiz.phase === 'asking' && left <= 5000);
    $('quiz-bar').style.transform = `scaleX(${Math.min(1, left / quiz.total)})`;
    if (!left) clearInterval(quiz.timer);
  };
  tick();
  quiz.timer = setInterval(tick, 250);
}

const quizWho = (name, url, extra) => {
  const who = el('div', 'who');
  who.append(avatar(name, url, 'ava'), el('span', '', name));
  if (extra) who.append(el('small', '', extra));
  return who;
};

function quizFoot() {
  const foot = $('quiz-foot');
  if (quiz.phase === 'reveal') return;
  if (!quiz.count) {
    const line = el('div', '', '💬 Comment đáp án, tỉnh bạn ');
    line.append(el('b', '', `+${guide.quiz.points}`));
    foot.replaceChildren(line);
    return;
  }
  const rows = [el('div', '', `✅ ${fmt(quiz.count)} người đã trả lời đúng`)];
  if (quiz.first) rows.unshift(quizWho(`⚡ ${quiz.first.name}`, quiz.first.avatar, quiz.first.province ? shortName(quiz.first.province) : ''));
  foot.replaceChildren(...rows);
}

function showQuiz(word, { animate = true } = {}) {
  Object.assign(quiz, { no: word.no, phase: 'asking', endsAt: word.endsAt, total: Math.max(1000, word.endsAt - Date.now()), count: 0, first: null });
  const box = $('quiz');
  box.classList.remove('reveal');
  box.querySelector('.quiz-label').textContent = 'ĐỐ CHỮ';
  $('quiz-topic').textContent = word.topic;
  $('quiz-hint').textContent = word.hint;
  drawTiles(word.tiles);
  quizFoot();
  clearTimeout(quiz.hideTimer);
  box.classList.remove('out');
  box.hidden = false;
  if (animate) restart(box, 'in');
  quizTimer();
}

// Công bố xong thì ẩn ô đố chữ vài giây cho bản đồ thoáng, rồi câu mới mới hiện lại.
function hideQuiz({ animate = true } = {}) {
  quiz.phase = 'break';
  clearInterval(quiz.timer);
  const box = $('quiz');
  clearTimeout(quiz.hideTimer);
  if (!animate || box.hidden) {
    box.hidden = true;
    return;
  }
  restart(box, 'out');
  quiz.hideTimer = setTimeout(() => {
    box.hidden = true;
    box.classList.remove('out');
  }, 400);
}

function quizCorrect(msg) {
  if (msg.no !== quiz.no) return;
  quiz.count = msg.count;
  quiz.endsAt = msg.endsAt;
  if (msg.first) {
    quiz.first = { name: msg.name, avatar: msg.avatar, province: msg.province };
    quiz.total = Math.max(1000, msg.endsAt - Date.now());
  }
  quizFoot();
  if (msg.first) restart($('quiz-foot'), 'bump');
}

function revealQuiz(msg, { animate = true } = {}) {
  Object.assign(quiz, { no: msg.no, phase: 'reveal', endsAt: msg.endsAt, total: Math.max(1000, msg.endsAt - Date.now()) });
  const box = $('quiz');
  clearTimeout(quiz.hideTimer);
  box.classList.remove('out');
  box.hidden = false;
  box.classList.add('reveal');
  box.querySelector('.quiz-label').textContent = 'ĐÁP ÁN';
  drawTiles(Array.from(msg.answer), true);
  if (animate) for (const tile of $('quiz-tiles').querySelectorAll('.tile')) restart(tile, 'open');
  const rows = [];
  if (msg.fastest) rows.push(quizWho(msg.fastest.name, msg.fastest.avatar, `${msg.fastest.province ? `${shortName(msg.fastest.province)} · ` : ''}⚡${msg.fastest.seconds}s`));
  if (msg.best) {
    const line = el('div', '', '🏆 ');
    line.append(el('b', '', shortName(msg.best.province)), ` nhiều người đúng nhất (${fmt(msg.best.count)})`);
    rows.push(line);
  }
  rows.push(el('div', '', msg.count ? `✅ ${fmt(msg.count)} người đúng` : 'Chưa ai trả lời đúng câu này'));
  $('quiz-foot').replaceChildren(...rows);
  quizTimer();
}

function applyQuiz(state) {
  if (!state) return;
  if (state.phase === 'break') hideQuiz({ animate: false });
  else if (state.phase === 'reveal' && state.reveal) revealQuiz(state.reveal, { animate: false });
  else if (state.word) {
    showQuiz(state.word, { animate: false });
    quiz.count = state.count;
    quiz.first = state.first;
    quizFoot();
  }
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
    map ??= buildMap({ canvas: $('map'), crown: $('crown'), data: mapData, meta, maxZoom: guide.camera?.maxZoom });
    camera ??= createCamera({
      // Camera bay tới tỉnh nào thì hiện thẻ người vừa tặng cho tỉnh đó, lùi về toàn cảnh thì cất thẻ.
      map: {
        focus(id) {
          map.focus(id);
          showGiver(id);
        },
        unfocus() {
          map.unfocus();
          hideGiver();
        },
      },
      options: guide.camera,
    });
    stage.classList.toggle('with-quiz', Boolean(guide.quiz));
    renderGuide();
    applyRace(msg.race);
    applyQuiz(msg.quiz);
  },
  'quiz-ask'(msg) {
    showQuiz(msg);
    sfx.quizAsk();
  },
  'quiz-letter'(msg) {
    if (msg.no !== quiz.no) return;
    openTile(msg.index, msg.letter);
    sfx.quizLetter();
  },
  'quiz-correct'(msg) {
    wake();
    quizCorrect(msg);
    sfx.quizCorrect(msg.first);
    // Người đầu tiên luôn hiện trong cột bên phải; đông người thì bớt cho đỡ rối.
    if (msg.first) lastJoinFeed = 0;
    if (!msg.province) {
      addFeed({ kind: 'quiz pending', name: msg.name, url: msg.avatar, line: 'Đúng! Comment tên tỉnh', plus: `+${fmt(msg.held)}` });
      return;
    }
    update(msg);
    const { x, y } = spot(msg.province);
    map.flash(msg.province, msg.first);
    floatText(x, y - 18, `+${fmt(msg.points)}`, msg.first);
    nameTag(msg.province, msg.name, msg.avatar, { force: msg.first });
    addFeed({ kind: 'quiz', name: msg.name, url: msg.avatar, line: `✏️ Đúng → ${shortName(msg.province)}`, plus: `+${fmt(msg.points)}` });
  },
  'quiz-break'() {
    hideQuiz();
  },
  'quiz-reveal'(msg) {
    revealQuiz(msg);
    sfx.quizReveal();
    if (msg.best) {
      const { x, y } = spot(msg.best.province);
      map.flash(msg.best.province, true);
      sparks(x, y, 24);
    }
  },
  reset(msg) {
    camera.reset();
    givers.clear();
    applyRace(msg.race);
    $('feed').replaceChildren();
    sfx.reset();
  },
  join(msg) {
    wake();
    update(msg);
    members = msg.members;
    const boosted = msg.held > 0;
    // Quà gửi trước khi chọn tỉnh giờ mới được cộng: camera tới tỉnh và hiện người tặng như khi có quà.
    if (boosted) {
      noteGiver(msg.province, { name: msg.name, avatar: msg.avatar, icon: '', points: msg.points });
      camera.focus(msg.province);
    } else if (guide.camera?.onComment) camera.focus(msg.province, { holdMs: 3000, soft: true });
    const { x, y } = spot(msg.province);
    map.flash(msg.province, boosted);
    floatText(x, y - 18, `+${fmt(msg.points)}`, boosted);
    if (!boosted || !cardOn()) nameTag(msg.province, msg.name, msg.avatar, { force: boosted });
    sfx.join();
    addFeed({ kind: boosted ? 'gift' : 'join', name: msg.name, url: msg.avatar, line: `→ ${shortName(msg.province)}`, plus: `+${fmt(msg.points)}` });
  },
  gift(msg) {
    wake();
    update(msg);
    const big = msg.points >= BIG_GIFT;
    noteGiver(msg.province, msg);
    camera.focus(msg.province);
    const { x, y } = spot(msg.province);
    flyGift(msg.icon, msg.province, () => {
      map.flash(msg.province, true);
      floatText(x, y - 18, `+${fmt(msg.points)}`, true);
      sparks(x, y, big ? 34 : 16);
    });
    // Thẻ người tặng to đã hiện cạnh tỉnh; chỉ khi tắt camera mới hiện thẻ tên nhỏ trên tỉnh như cũ.
    if (!cardOn()) nameTag(msg.province, msg.name, msg.avatar, { force: true, ms: 2800 });
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
