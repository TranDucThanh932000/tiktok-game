// Màn hình game: chỉ vẽ theo trạng thái máy chủ gửi về, không tự quyết định điểm hay kết quả.
import { icon, esc, looks } from './art.js';
import { Crowd } from './crowd.js';
import { crowdReact, onAudioState, sfx, speak, stopSpeech, wake } from './audio.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const crowd = new Crowd($('crowd'));

document.querySelectorAll('[data-icon]').forEach((el) => {
  el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size));
});

function fit() {
  const scale = Math.min(innerWidth / 450, innerHeight / 800);
  const x = (innerWidth - 450 * scale) / 2;
  const y = (innerHeight - 800 * scale) / 2;
  stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}
addEventListener('resize', fit);
fit();

let game = null;
let decideEnd = 0;
let lastSecond = null;
let shownScore = 0;
let renderedKey = '';

const PILLS = {
  opening: ['MỞ PHÒNG', '#b79cff', '#1e1033'],
  waiting: ['CHỜ ĐỦ CẶP', '#b79cff', '#1e1033'],
  invite: ['MỜI LÊN', '#ffd25e', '#2a1a05'],
  intro: ['LÀM QUEN · CỔ VŨ', '#ffd25e', '#2a1a05'],
  cheer: ['LÀM QUEN · CỔ VŨ', '#ffd25e', '#2a1a05'],
  guide: ['HƯỚNG DẪN', '#ff9b5e', '#2a1205'],
  decide: ['QUYẾT ĐỊNH · 10s', '#ffd25e', '#2a1a05'],
  result: ['KẾT QUẢ · 15s', '#ffd25e', '#2a1a05'],
  transition: ['CHUYỂN CẶP', '#cdbfe0', '#1e1033'],
  paused: ['TẠM DỪNG', '#cdbfe0', '#1e1033'],
  reconfirm: ['XÁC NHẬN LẠI', '#ff9b5e', '#2a1205'],
};
const RESULT_PILLS = { matched: '#ffd25e', mismatch: '#ffae6b', noresponse: '#b79cff', withdrawn: '#b79cff', removed: '#b79cff' };

const short = (name) => esc(name);
const SHOW_CHOICE = { yes: 'ĐỒNG Ý', no: 'KHÔNG ĐỒNG Ý' };

// ---------- Khu quyết định theo từng cảnh ----------
function howToJoin() {
  return `<div class="card"><h3 class="d">Cách tham gia</h3><div class="howto">
    <div>${icon('pig', 18)}<span>Gửi quà <b>Heo</b> → vào hàng Nam</span></div>
    <div>${icon('clover', 18)}<span>Gửi quà <b>Cỏ ba lá</b> → vào hàng Nữ</span></div>
    <div class="note">Đăng ký = lên sân khấu công khai</div>
  </div></div>`;
}

function queueColumn(side, list) {
  const cls = side === 'male' ? 'm' : 'f';
  const head = side === 'male' ? 'HÀNG NAM' : 'HÀNG NỮ';
  const ic = icon(side === 'male' ? 'pig' : 'clover', 18);
  if (!list.length) {
    return `<div class="q ${cls} empty"><div class="head">${ic}${head} · 0</div><div class="who sub w" style="font-size:12px;font-weight:600">Đang chờ</div><div class="sub">Gửi ${side === 'male' ? 'Heo' : 'Cỏ ba lá'} để vào</div></div>`;
  }
  const more = list.length > 2 ? `+${list.length - 2} bạn nữa` : 'Đã sẵn sàng';
  return `<div class="q ${cls}"><div class="head">${ic}${head} · ${list.length}</div>${list.slice(0, 2).map((v, i) => `<div class="who">${i + 1}. ${short(v.name)}</div>`).join('')}<div class="sub">${more}</div></div>`;
}

function waitBoard() {
  return `<div class="card" style="padding:10px 12px"><div class="cap-mini">HÀNG CHỜ</div><div class="queues">${queueColumn('male', game.queues.male)}${queueColumn('female', game.queues.female)}</div></div>`;
}

function inviteCard(pair) {
  const top = pair.demo ? 'DIỄN VIÊN CỦA CHƯƠNG TRÌNH' : 'ĐÃ ĐỦ CẶP · MỜI LÊN SÂN KHẤU';
  const big = pair.demo ? 'CẶP DIỄN MẪU' : `CẶP SỐ ${String(pair.no).padStart(2, '0')}`;
  return `<div class="invite"><div class="top">${top}</div><div class="big d">${big}</div><div class="names">${short(pair.male.name)} &amp; ${short(pair.female.name)}</div></div>`;
}

function askCard(pair) {
  const rows = [];
  if (pair.shared.male) rows.push(`<div class="share m"><span class="dot" style="background:#ff8fb5"></span><span><b style="color:#ffc6da">${short(pair.male.name)}:</b> ${esc(pair.shared.male)}</span></div>`);
  if (pair.shared.female) rows.push(`<div class="share f"><span class="dot" style="background:#5ed39a"></span><span><b style="color:#b5efd1">${short(pair.female.name)}:</b> ${esc(pair.shared.female)}</span></div>`);
  return `<div class="card ask"><div class="cap-mini" style="font-size:10.5px">LÀM QUEN · KHÔNG BẮT BUỘC TRẢ LỜI</div><div class="q-text d">Một điều bạn thích trong buổi gặp đầu tiên?</div>${rows.join('')}</div>`;
}

function prepCard() {
  return `<div class="prep"><div class="line"><span>Khi chuông vang, mỗi bạn gõ:</span><span class="tag">CHUẨN BỊ · 10 GIÂY</span></div>
    <div class="opts"><div class="opt d">đồng ý</div><div class="opt d">không đồng ý</div></div>
    <div class="fine">Chỉ nhận từ 2 tài khoản trên sân khấu · Được đổi ý, tính lần cuối · Chưa công khai trước khi hết giờ</div></div>`;
}

function pickRow(pair, side) {
  const cls = side === 'male' ? 'm' : 'f';
  const done = pair.chosen[side];
  return `<div class="pick ${cls} ${done ? 'done' : 'wait'}"><span class="nm2">${icon(side === 'male' ? 'pig' : 'clover', 15)}<span>${short(pair[side].name)}</span></span><span class="st">${done ? 'ĐÃ CHỌN' : 'ĐANG CHỌN…'}</span></div>`;
}

function clockCard(pair) {
  return `<div class="clock"><div class="ring" id="ring"><div class="in"><div class="n d" id="ring-n">10</div><div class="u">GIÂY</div></div></div>
    <div class="right"><div class="live">● ĐANG NHẬN LỰA CHỌN</div>${pickRow(pair, 'male')}${pickRow(pair, 'female')}</div></div>`;
}

function resultBox(pair, side) {
  const label = side === 'male' ? 'Nam' : 'Nữ';
  const value = pair.choices?.[side];
  if (!value) return `<div class="box dash">${label} · CHƯA PHẢN HỒI</div>`;
  return `<div class="box ${side === 'male' ? 'm' : 'f'}">${label} · ${SHOW_CHOICE[value]}</div>`;
}

function resultCard(pair) {
  if (pair.result === 'withdrawn' || pair.result === 'removed') {
    const text = pair.result === 'withdrawn' ? 'Một bạn đã chọn dừng lượt này. Mình tôn trọng lựa chọn của bạn.' : 'Lượt này xin dừng tại đây.';
    return `<div class="res none"><div class="top">LƯỢT ĐÃ DỪNG</div><div class="big d">ĐÃ DỪNG LƯỢT</div><div class="sub">${text}</div></div>`;
  }
  const titles = { matched: 'GHÉP ĐÔI THÀNH CÔNG', mismatch: 'CHƯA CÙNG NHỊP', noresponse: 'CHƯA ĐỦ PHẢN HỒI' };
  const cls = { matched: 'matched', mismatch: 'mismatch', noresponse: 'none' }[pair.result];
  return `<div class="res ${cls}"><div class="top">HẾT GIỜ · MỞ CÙNG LÚC</div><div class="big d">${titles[pair.result]}</div><div class="two">${resultBox(pair, 'male')}${resultBox(pair, 'female')}</div></div>`;
}

function memoryCard(card) {
  return `<div class="keep">${icon('heart-gold', 34)}<div class="mid"><div class="t1">CẶP SỐ ${String(card.no).padStart(2, '0')} · GHÉP ĐÔI THÀNH CÔNG</div><div class="t2">${short(card.male)} &amp; ${short(card.female)}</div></div>
    <div class="right"><div class="pts d">${card.score}</div>${card.tentative ? '<div class="tt">TẠM TÍNH</div>' : ''}</div></div>`;
}

function reconfirmCard(pair) {
  const tick = (side) => (pair.confirm[side] === true ? 'ĐÃ XÁC NHẬN' : 'ĐANG CHỜ…');
  return `<div class="card" style="padding:10px 12px"><div class="cap-mini" style="color:#ffe7a3">KẾT NỐI ĐÃ ỔN ĐỊNH</div><div class="d" style="font-size:17px;font-weight:700;line-height:1.15;margin-top:3px">Còn muốn tiếp tục thì gõ “tiếp tục”</div>
    <div class="queues" style="margin-top:6px"><div class="q m" style="padding:5px 8px"><div class="who" style="margin:0">${short(pair.male.name)}</div><div class="sub">${tick('male')}</div></div><div class="q f" style="padding:5px 8px"><div class="who" style="margin:0">${short(pair.female.name)}</div><div class="sub">${tick('female')}</div></div></div></div>`;
}

function zoneHtml() {
  const pair = game.pair;
  switch (game.phase) {
    case 'opening':
      return howToJoin();
    case 'waiting':
      return waitBoard();
    case 'invite':
      return inviteCard(pair);
    case 'intro':
    case 'cheer':
      return askCard(pair);
    case 'guide':
      return prepCard();
    case 'decide':
      return clockCard(pair);
    case 'result':
      return resultCard(pair);
    case 'transition':
      if (game.memory) return memoryCard(game.memory);
      return `<div class="next">${pair?.demo ? 'Cặp diễn mẫu xin nhường sân khấu.' : 'Cảm ơn hai bạn. Mời trở lại khán đài.'}</div>`;
    case 'paused':
      return prepCard();
    case 'reconfirm':
      return reconfirmCard(pair);
    default:
      return '';
  }
}

// ---------- Ghế ----------
function setChair(side, person, { coming = false } = {}) {
  const av = $(`av-${side}`);
  const nm = $(`nm-${side}`).firstElementChild;
  const empty = !person;
  av.classList.toggle('empty', empty);
  av.classList.toggle('coming', coming);
  nm.textContent = empty ? (side === 'male' ? 'Ghế Nam' : 'Ghế Nữ') : coming ? 'Đang lên…' : person.name;
  if (empty) {
    av.innerHTML = 'Trống';
    av.style.backgroundImage = '';
    av.dataset.who = '';
    av.dataset.drawn = '';
    return;
  }
  const drawn = `${person.id}|${person.avatar ?? ''}`;
  if (av.dataset.drawn === drawn) return;
  av.dataset.drawn = drawn;
  av.dataset.who = person.id;
  const look = looks(person.id);
  av.style.backgroundImage = '';
  av.innerHTML = `<div class="body" style="background:${look.body}"></div><div class="face" style="background:${look.skin}"></div>`;
  if (person.avatar) {
    const image = new Image();
    image.onload = () => {
      if (av.dataset.who !== person.id) return;
      av.innerHTML = '';
      av.style.backgroundImage = `url("${person.avatar.replace(/"/g, '%22')}")`;
    };
    image.src = person.avatar;
  }
}

function renderChairs() {
  const pair = game.pair;
  for (const side of ['male', 'female']) {
    const person = pair && !(game.phase === 'transition') ? pair[side] : null;
    setChair(side, person, { coming: Boolean(person) && !crowd.isSeated(side) });
    const silent = game.phase === 'result' && pair?.result === 'noresponse' && !pair.choices?.[side];
    $(`nr-${side}`).classList.toggle('hide', !silent);
  }
}
addEventListener('stage-seat', () => game && renderChairs());

// ---------- Thẻ hướng dẫn: quà đã xác minh, và lưu ý Heo/Cỏ khi có cặp ----------
let guideIndex = 0;
function guideLines() {
  const lines = [];
  if (game.guide.length) lines.push(`${game.guide.map((g) => `<span class="gi">${icon(g.key, 14)}${esc(g.label)} ${g.coins} xu</span>`).join(' · ')} — mỗi xu = 1 điểm`);
  if (game.pair?.demo) return ['Cặp diễn mẫu: quà chưa cộng điểm · Gửi Heo hoặc Cỏ ba lá để lên thật'];
  if (game.pair?.scoreOpen) {
    lines.push('Mỗi món quà là một lời chúc tới hai bạn');
    lines.push('Heo/Cỏ lúc này: đăng ký lượt sau và cộng điểm cho cặp đang chơi');
  }
  lines.push('Điểm là lời cổ vũ, hai bạn tự quyết định · Gõ “rời hàng” để huỷ');
  return lines;
}
function renderGuide() {
  const lines = guideLines();
  $('guide-line').innerHTML = lines[guideIndex % lines.length];
}
setInterval(() => {
  guideIndex++;
  if (game) renderGuide();
}, 5000);

// ---------- Vẽ theo trạng thái ----------
function render() {
  if (!game) return;
  const pair = game.pair;
  const phase = game.phase;

  const [label, bg, fg] = PILLS[phase];
  const pill = $('phase-pill');
  const stopped = phase === 'result' && (pair?.result === 'withdrawn' || pair?.result === 'removed');
  pill.textContent = stopped ? 'DỪNG LƯỢT' : label;
  pill.style.background = phase === 'result' ? RESULT_PILLS[pair?.result] ?? bg : bg;
  pill.style.color = fg;
  $('pair-pill').textContent = pair?.demo ? 'DIỄN MẪU' : pair ? `CẶP SỐ ${String(pair.no).padStart(2, '0')}` : 'CHƯA CÓ CẶP';
  $('demo-tag').classList.toggle('hide', !pair?.demo);

  // Bảng điểm hay dải chờ.
  const noPair = !pair;
  $('score').classList.toggle('hide', noPair);
  $('waitstrip').classList.toggle('hide', !noPair);
  if (pair) {
    if (shownScore !== pair.score) setScore(pair.score);
    const state = $('score-state');
    const tentative = pair.pendingCount > 0 || pair.status === 'aborted';
    state.className = tentative ? 'tag' : pair.scoreOpen ? '' : 'locked';
    state.textContent = tentative ? 'TẠM TÍNH' : pair.demo ? '● diễn mẫu' : pair.scoreOpen ? '● đang nhận' : '● đã khoá';
  }

  // Chỉ dựng lại khu quyết định khi nội dung đổi, để không giật đồng hồ.
  const key = JSON.stringify([phase, pair?.id, pair?.chosen, pair?.shared, pair?.result, pair?.confirm, game.queues.male.map((v) => v.id), game.queues.female.map((v) => v.id), game.memory]);
  if (key !== renderedKey) {
    renderedKey = key;
    $('zone').innerHTML = zoneHtml();
    tickClock(true);
  }

  // Sân khấu ấm dần khi chưa cùng nhịp, sáng lên khi ghép đôi; không đổi sang màu "thua".
  stage.classList.toggle('joy', phase === 'result' && pair?.result === 'matched');
  stage.classList.toggle('warm', phase === 'result' && pair?.result !== 'matched');
  $('ribbon').classList.toggle('hide', !(phase === 'result' && pair?.result === 'matched'));

  crowd.setStage(pair, phase === 'transition');
  crowd.setQueued(game.queues);
  renderChairs();
  renderGuide();
  renderPause();
  renderBanner();
}

function renderBanner() {
  const banner = $('banner');
  const pair = game.pair;
  const text = game.phase === 'result' && pair?.result === 'matched' ? 'Khán đài vỗ tay chúc mừng' : game.phase === 'result' && pair?.result === 'mismatch' ? 'Khán đài gửi lời chúc tử tế' : game.phase === 'invite' ? 'Khán đài nhường lối' : '';
  banner.classList.toggle('hide', !text);
  banner.classList.toggle('soft', pair?.result === 'mismatch');
  banner.textContent = text;
}

function renderPause() {
  const paused = game.paused;
  $('pause-dim').classList.toggle('hide', !paused);
  $('pause-card').classList.toggle('hide', !paused);
  if (!paused) return;
  const hadPair = Boolean(game.pair);
  const title = paused.reason === 'connection' ? (paused.restored ? 'Kết nối đã trở lại, đang kiểm tra' : 'Kết nối nhận tương tác đang gián đoạn') : 'Chương trình tạm dừng';
  const text = hadPair
    ? 'Lượt này đã huỷ, không công bố lựa chọn nào. Điểm của lượt được giữ lại để đối soát. Khi kết nối ổn định, hai bạn được hỏi lại có muốn tiếp tục không, rồi mở một cửa 10 giây mới.'
    : 'Hàng chờ vẫn được giữ nguyên. Chương trình sẽ tiếp tục ngay khi sẵn sàng.';
  $('pause-card').innerHTML = `<div class="h d">${icon('pause', 20)}<span>TẠM DỪNG</span></div><div class="t1">${title}</div><div class="t2">${text}</div>`;
}

function setScore(value) {
  shownScore = value;
  $('score-num').textContent = value.toLocaleString('vi-VN');
}

// ---------- Đồng hồ: đếm theo mốc máy chủ, chỉ để hiển thị ----------
function tickClock(force) {
  if (game?.phase !== 'decide') {
    lastSecond = null;
    return;
  }
  const ring = $('ring');
  if (!ring) return;
  const left = Math.max(0, decideEnd - performance.now());
  const second = Math.ceil(left / 1000);
  ring.style.background = `conic-gradient(#ffd25e 0 ${(left / 10000) * 100}%, rgba(255,255,255,.14) ${(left / 10000) * 100}% 100%)`;
  if (second !== lastSecond || force) {
    if (second !== lastSecond && second <= 3 && second > 0) sfx('tick');
    lastSecond = second;
    $('ring-n').textContent = String(second);
  }
}
(function clockLoop() {
  tickClock(false);
  requestAnimationFrame(clockLoop);
})();

// ---------- MC ----------
let talkTimer = 0;
let mouthTimer = 0;
let capTimer = 0;

function setTalking(who) {
  clearInterval(mouthTimer);
  for (const name of ['duy', 'linh']) {
    const el = $(`mc-${name}`);
    el.classList.toggle('talk', name === who);
    el.querySelector('.mo').classList.remove('on');
  }
  if (!who) return;
  const mouth = $(`mc-${who}`).querySelector('.mo');
  mouthTimer = setInterval(() => mouth.classList.toggle('on'), 130);
  mouth.classList.add('on');
}

function say({ who, text, clips, ms }) {
  clearTimeout(talkTimer);
  clearTimeout(capTimer);
  setTalking(who);
  const cap = $('cap');
  cap.classList.remove('hide');
  cap.classList.toggle('long', Array.from(text).length > 85);
  cap.innerHTML = `<b class="${who}">${who === 'duy' ? 'Duy' : 'Linh'}:</b> “${esc(text)}”`;
  speak(clips, ms);
  talkTimer = setTimeout(() => setTalking(null), ms);
  capTimer = setTimeout(() => cap.classList.add('hide'), ms + 1200);
}

function stopTalking() {
  clearTimeout(talkTimer);
  setTalking(null);
  stopSpeech();
}

// ---------- Hiệu ứng ----------
function flyFromCrowd(id, name, { size = 22, target = { x: 225, y: 400 }, spread = 40, image = '' } = {}) {
  const from = id ? crowd.spot(id) : crowd.randomSpot();
  const el = document.createElement('div');
  el.className = 'fly';
  el.innerHTML = icon(name, size, image);
  stage.appendChild(el);
  const end = { x: target.x + (Math.random() - 0.5) * spread, y: target.y + (Math.random() - 0.5) * spread };
  const middle = { x: (from.x + end.x) / 2 + (Math.random() - 0.5) * 60, y: (from.y + end.y) / 2 };
  el.animate(
    [
      { transform: `translate(${from.x}px, ${from.y}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${from.x}px, ${from.y - 12}px) scale(1)`, opacity: 1, offset: 0.12 },
      { transform: `translate(${middle.x}px, ${middle.y}px) scale(1.1)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${end.x}px, ${end.y}px) scale(.8)`, opacity: 0 },
    ],
    { duration: 1100 + Math.random() * 300, easing: 'ease-in-out' },
  ).onfinish = () => el.remove();
}

function confetti() {
  const colors = ['#6ea8ff', '#5ed39a', '#ffd25e', '#ff8fb5', '#b79cff'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.className = 'conf';
    el.style.background = colors[i % colors.length];
    stage.appendChild(el);
    const x = Math.random() * 450;
    const fall = 300 + Math.random() * 260;
    el.animate(
      [
        { transform: `translate(${x}px, ${190 + Math.random() * 60}px) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${x + (Math.random() - 0.5) * 90}px, ${190 + fall}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ],
      { duration: 2200 + Math.random() * 1500, delay: Math.random() * 1200, easing: 'cubic-bezier(.2,.5,.6,1)', fill: 'backwards' },
    ).onfinish = () => el.remove();
  }
  for (let i = 0; i < 12; i++) {
    setTimeout(() => flyFromCrowd(null, i % 3 === 0 ? 'flower' : 'heart-deco', { target: { x: 225, y: 240 }, spread: 200 }), i * 180);
  }
}

// Gom +N trong khoảng ngắn cho dễ nhìn; điểm đã cộng đủ ở máy chủ.
let plusValue = 0;
let plusTimer = 0;
function showPlus(delta) {
  plusValue += delta;
  clearTimeout(plusTimer);
  plusTimer = setTimeout(() => {
    const el = document.createElement('div');
    el.className = 'plus d';
    el.textContent = `+${plusValue.toLocaleString('vi-VN')}`;
    stage.appendChild(el);
    setTimeout(() => el.remove(), 1150);
    plusValue = 0;
  }, 220);
  const board = $('score');
  board.classList.add('bump');
  setTimeout(() => board.classList.remove('bump'), 130);
}

let cardTimer = 0;
function showCard({ kind, side, position, name }) {
  const el = $('card');
  const cls = side === 'male' ? 'm' : 'f';
  const row = side === 'male' ? 'Nam' : 'Nữ';
  const content = {
    queued: [`Đã vào hàng ${row} · Vị trí ${position}`, `${name} · gõ “rời hàng” để huỷ`, cls],
    already: ['Vị trí của bạn đã được ghi nhận', 'Gửi thêm không tạo suất mới', ''],
    other: [`Bạn đang ở hàng ${row} · Vị trí ${position}`, 'Muốn đổi: gõ “rời hàng” rồi đăng ký lại', ''],
    left: ['Đã rời hàng', 'Muốn đổi hàng: đăng ký lại', ''],
    onstage: ['Bạn đang trên sân khấu', 'Hết lượt rồi đăng ký lại nếu muốn', ''],
  }[kind];
  if (!content) return;
  el.className = `a${kind === 'queued' ? '' : ' soft'}`;
  el.innerHTML = `<div class="h ${content[2]}">${esc(content[0])}</div><div class="s">${esc(content[1])}</div>`;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => el.classList.add('hide'), 3500);
}

function showToast({ name, key, label, count, points, state, image, wish }) {
  const box = $('toasts');
  box.classList.remove('hide');
  const el = document.createElement('div');
  if (state === 'pending') {
    el.className = 'toast soft';
    el.innerHTML = `${icon('clock', 18)}<div class="tx"><b>${esc(label)}</b>chờ xác minh giá</div><div class="wait">chưa cộng</div>`;
  } else {
    el.className = `toast${key === 'box' ? ' box' : ''}`;
    el.innerHTML = `${icon(key, 22, image)}<div class="tx"><b>${esc(name)}${count > 1 ? ` ×${count}` : ''}</b>${esc(wish || label)}</div><div class="pt d">+${points.toLocaleString('vi-VN')}</div>`;
  }
  box.prepend(el);
  while (box.children.length > 3) box.lastElementChild.remove();
  setTimeout(() => {
    el.remove();
    if (!box.children.length) box.classList.add('hide');
  }, 3200);
}

let noteTimer = 0;
function showNote(text) {
  const el = $('note');
  el.textContent = text;
  el.classList.remove('hide');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => el.classList.add('hide'), 2400);
}

let helloTimer = 0;
let helloCount = 0;
let helloName = '';
function greetAtDoor(name) {
  helloCount++;
  helloName = name;
  clearTimeout(helloTimer);
  helloTimer = setTimeout(() => {
    const el = document.createElement('div');
    el.className = 'hello';
    el.textContent = helloCount > 1 ? `+${helloCount} bạn mới vào khán đài` : `${helloName} vừa vào`;
    stage.appendChild(el);
    setTimeout(() => el.remove(), 2050);
    helloCount = 0;
  }, 400);
}

// ---------- Nhận dữ liệu ----------
// Tiếng khán đài đi theo chuyện thật trên sân khấu. Trong 10 giây quyết định chỉ để tiếng nhẹ, không reo hò gây áp lực.
function crowdCheer(kind) {
  crowdReact(game?.phase === 'decide' ? 'small' : kind);
}

function applyGame(next) {
  if (game && game.phase !== next.phase && next.phase === 'invite') crowdReact('medium');
  game = next;
  decideEnd = performance.now() + next.decideLeft;
  render();
}

function setStatus(status) {
  $('testmark').classList.toggle('hide', status.connected);
}

const source = new EventSource('/events');
source.onmessage = (event) => {
  const message = JSON.parse(event.data);
  switch (message.type) {
    case 'snapshot':
      $('title').textContent = message.title;
      setStatus(message.status);
      crowd.restore(message.viewers, message.game.pair);
      applyGame(message.game);
      break;
    case 'state':
      applyGame(message.game);
      break;
    case 'status':
      setStatus(message);
      break;
    case 'say':
      say(message);
      break;
    case 'say-stop':
      stopTalking();
      break;
    case 'viewer-in':
      crowd.add(message.viewer);
      greetAtDoor(message.viewer.name);
      break;
    case 'viewer-update':
      crowd.add(message.viewer, { greet: false });
      break;
    case 'score':
      setScore(message.score);
      if (message.delta > 0) showPlus(message.delta);
      break;
    case 'cheer':
      crowd.cheer(message.by);
      if (message.counted) {
        sfx('rose');
        crowdCheer('small');
        if (Math.random() < 0.5) flyFromCrowd(message.by, 'heart-deco', { size: 16 });
      }
      break;
    case 'gift': {
      crowd.touch(message.by);
      if (message.state === 'demo') {
        if (!['pig', 'clover'].includes(message.key)) showNote('Đây là cặp diễn mẫu nên quà chưa cộng điểm');
        break;
      }
      if (message.state === 'nopair') {
        if (!['pig', 'clover'].includes(message.key)) showNote('Chưa có cặp nên quà này chưa cộng điểm');
        break;
      }
      showToast(message);
      crowdCheer(message.points >= 100 ? 'big' : message.points >= 5 ? 'medium' : 'small');
      if (message.state === 'counted') {
        const big = message.key === 'box';
        sfx(big ? 'sparkle' : message.key === 'rose' ? 'rose' : 'chime');
        const flights = Math.min(big ? 1 : 6, message.count);
        for (let i = 0; i < flights; i++) setTimeout(() => flyFromCrowd(message.by, message.key, { size: big ? 44 : 28, image: message.image }), i * 120);
      }
      break;
    }
    case 'card':
      showCard(message);
      if (message.kind === 'queued') crowdCheer('small');
      break;
    case 'viewer-out':
      crowd.remove(message.id);
      break;
    case 'chosen':
      sfx('tick');
      break;
    case 'choice-note':
      showNote(message.note === 'early' ? 'Chưa tới lúc chọn, đợi tiếng chuông nhé' : 'Đã hết thời gian nhận lựa chọn');
      break;
    case 'bell':
      sfx('bell');
      showNote('BẮT ĐẦU');
      break;
    case 'reveal':
      if (message.result === 'matched') {
        sfx('joy');
        crowdReact('big');
        confetti();
        crowd.clapAll();
      } else {
        // Chưa cùng nhịp: vỗ tay nhẹ cảm ơn hai bạn, không hò reo.
        sfx('warm');
        crowdReact('polite');
      }
      break;
    case 'milestone': {
      const el = $('mile');
      el.innerHTML = `<span class="n d">${message.mark.toLocaleString('vi-VN')}</span><span class="t">Cặp mình vừa qua mốc ${message.mark.toLocaleString('vi-VN')} điểm đẹp đôi!</span>`;
      el.classList.remove('hide');
      sfx('sparkle');
      crowdCheer('big');
      setTimeout(() => el.classList.add('hide'), 3000);
      break;
    }
    default:
  }
};

// Trình duyệt thường chỉ cho phát tiếng sau khi người dùng bấm; cửa sổ --app của start.bat tự bật được.
const unmute = $('unmute');
onAudioState((on) => unmute.classList.toggle('hide', on));
wake();
addEventListener('pointerdown', wake);
