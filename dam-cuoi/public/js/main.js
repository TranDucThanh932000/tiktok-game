// Đám Cưới Online – màn hình 3D cho TikTok LIVE.
// Server gửi từng kịch bản (claim / steal / cancel) theo hàng đợi; màn hình diễn kịch bản đó trong đúng thời lượng
// server cho (đã tính tốc độ khi hàng chờ dài). Mở lại trang thì vẽ thẳng trạng thái hiện tại.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Character, hashSeed } from './character.js';
import { Hall, SLOT, ENTRY, MC_SPOT } from './world.js';
import { Effects, comicBurst, floatHearts } from './fx.js';
import { sfx, audioReady, unlockAudio, speak } from './audio.js';
import { Props, RITUALS } from './ritual.js';
import { loadHumans, humansReady, HumanCharacter } from './human.js';

const W = 1080;
const H = 1920;
const $ = (id) => document.getElementById(id);
const stageEl = $('stage');
const params = new URLSearchParams(location.search);
const ROLES = ['groom', 'bride'];
const ROLE_VI = { groom: 'chú rể', bride: 'cô dâu' };

let guide = null;
let fitScale = 1;
let serverOffset = 0;
const serverNow = () => Date.now() + serverOffset;

// ---------------------------------------------------------------- Khung 9:16

function fit() {
  fitScale = Math.min(innerWidth / W, innerHeight / H);
  stageEl.style.transform = `translate(${(innerWidth - W * fitScale) / 2}px, ${(innerHeight - H * fitScale) / 2}px) scale(${fitScale})`;
  resizeRenderer();
}
addEventListener('resize', fit);

// ---------------------------------------------------------------- Cảnh 3D

const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 60);
const hall = new Hall(scene);
hall.loadEnvironment(renderer);
const fx = new Effects(scene);
fx.onBoom = () => sfx.firework();
const props = new Props(scene);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.4, 0.35, 1.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let renderScale = Number(params.get('scale')) || 1;

function resizeRenderer() {
  const pr = Math.min(2, Math.max(0.25, fitScale * renderScale * (devicePixelRatio || 1)));
  renderer.setPixelRatio(pr);
  renderer.setSize(W, H, false);
  composer.setPixelRatio(pr);
  composer.setSize(W, H);
}

// Camera: góc chính nhìn hai nhân vật từ trước, hơi cao; góc cận cảnh cho cú đá.
const CAM_MAIN = { pos: new THREE.Vector3(0, 2.7, 14.6), look: new THREE.Vector3(0, 0.7, 1.0), fov: 32 };
const cam = { from: null, to: CAM_MAIN, t: 1, dur: 1, pos: CAM_MAIN.pos.clone(), look: CAM_MAIN.look.clone(), fov: CAM_MAIN.fov };
let shake = 0;

// dur = 0 là cắt cảnh. then: sau khi tới nơi thì trôi chậm tới góc tiếp theo (camera không đứng yên).
function cameraTo(target, dur, then = null) {
  cam.from = { pos: cam.pos.clone(), look: cam.look.clone(), fov: cam.fov };
  cam.to = target;
  cam.t = dur > 0 ? 0 : 1;
  cam.dur = Math.max(0.01, dur);
  cam.then = then;
  if (dur <= 0) {
    cam.pos.copy(target.pos);
    cam.look.copy(target.look);
    cam.fov = target.fov;
  }
}

// ---------------------------------------------------------------- Đạo diễn camera
// Lúc không có màn diễn, camera tự đổi góc mỗi vài giây (lúc cắt cảnh, lúc lia mượt) và trôi chậm trong mỗi góc.
// Màn đá văng / hủy hôn / trao nhẫn tự điều khiển camera; MC đang nói thì quay sang MC.
const shot = (px, py, pz, lx, ly, lz, fov) => ({ pos: new THREE.Vector3(px, py, pz), look: new THREE.Vector3(lx, ly, lz), fov });
const director = { until: 0, last: '', lock: 0 };

function shotList(ceremony) {
  const g = SLOT.groom;
  const b = SLOT.bride;
  const list = [
    { name: 'wide', a: CAM_MAIN, b: shot(0.9, 2.4, 13.3, 0.15, 0.8, 0.9, 31), hold: 8, w: 3 },
    { name: 'couple', a: shot(-0.5, 1.6, 8.6, 0, 1.12, 0.3, 30), b: shot(0.5, 1.55, 7.9, 0, 1.15, 0.3, 30), hold: 7, w: 3 },
    { name: 'audience', a: shot(-1.35, 0.85, 6.6, 0, 1.15, 0.3, 34), b: shot(-0.9, 0.95, 5.9, 0.1, 1.15, 0.3, 33), hold: 7, w: 2 },
    { name: 'sideL', a: shot(-4.6, 1.8, 6.6, 0.3, 1.0, 0.3, 28), b: shot(-3.9, 1.95, 6.1, 0.3, 1.05, 0.3, 28), hold: 7, w: 2 },
    { name: 'sideR', a: shot(4.6, 1.8, 6.6, -0.3, 1.0, 0.3, 28), b: shot(3.9, 1.95, 6.1, -0.3, 1.05, 0.3, 28), hold: 7, w: 2 },
    { name: 'crane', a: shot(-1.2, 6.6, 12.2, 0, 0.5, 0.9, 33), b: shot(1.4, 5.7, 11.0, 0, 0.6, 0.6, 32), hold: 7, w: 1.5 },
    { name: 'groom', a: shot(g.x - 0.6, 1.55, 4.9, g.x, 1.32, g.z, 26), b: shot(g.x - 0.2, 1.6, 4.4, g.x, 1.36, g.z, 26), hold: 6, w: 1.5 },
    { name: 'bride', a: shot(b.x + 0.6, 1.55, 4.9, b.x, 1.3, b.z, 26), b: shot(b.x + 0.2, 1.6, 4.4, b.x, 1.34, b.z, 26), hold: 6, w: 1.5 },
  ];
  if (!ceremony) {
    list.push({ name: 'tablesL', a: shot(-4.2, 1.5, 7.4, -2.3, 0.55, 3.1, 30), b: shot(-3.6, 1.6, 6.9, -2.1, 0.6, 3.0, 30), hold: 5, w: 1 });
    list.push({ name: 'tablesR', a: shot(4.2, 1.5, 7.4, 2.3, 0.55, 3.1, 30), b: shot(3.6, 1.6, 6.9, 2.1, 0.6, 3.0, 30), hold: 5, w: 1 });
  }
  return list;
}

function nextShot() {
  const list = shotList(!!ritualToken).filter((s) => s.name !== director.last);
  let r = Math.random() * list.reduce((n, s) => n + s.w, 0);
  const s = list.find((x) => (r -= x.w) < 0) ?? list[0];
  const cut = Math.random() < 0.5;
  cameraTo(s.a, cut ? 0 : 1.4, { target: s.b, dur: s.hold });
  director.last = s.name;
  director.until = clockTime + s.hold + (cut ? 0 : 1.4);
}

function directorTick() {
  // Đang có màn diễn hoặc kịch bản vừa giữ camera: đợi xong rồi mới đổi góc.
  if (running || clockTime < director.lock) {
    director.until = Math.max(director.until, clockTime + 1.2);
    return;
  }
  if (clockTime >= director.until) nextShot();
}

// MC đang nói: camera quay sang MC đó vài giây.
function focusMC(who) {
  const c = mcs[who];
  if (!c || running || clockTime < director.lock || Math.random() < 0.35) return;
  const p = c.root.position;
  const side = Math.sign(p.x) || 1;
  cameraTo(shot(p.x - side * 1.2, 1.65, p.z + 3.9, p.x, 1.38, p.z, 27), Math.random() < 0.5 ? 0 : 0.9, { target: shot(p.x - side * 0.7, 1.7, p.z + 3.4, p.x, 1.4, p.z, 27), dur: 5 });
  director.last = `mc-${who}`;
  director.until = clockTime + 5;
}

function closeUp(x) {
  return { pos: new THREE.Vector3(x * 0.6 + 1.1 * Math.sign(-x || 1), 1.4, 10.2), look: new THREE.Vector3(x, 0.98, 0.35), fov: 29 };
}

const CAM_PAIR = { pos: new THREE.Vector3(0, 1.55, 11.2), look: new THREE.Vector3(0, 0.95, 0.35), fov: 25 };
const closeUpCenter = () => CAM_PAIR;

function updateCamera(dt, realDt) {
  if (cam.t >= 1 && cam.then) {
    const next = cam.then;
    cameraTo(next.target, next.dur);
  }
  if (cam.t < 1) {
    cam.t = Math.min(1, cam.t + dt / cam.dur);
    const k = cam.t * cam.t * (3 - 2 * cam.t);
    cam.pos.lerpVectors(cam.from.pos, cam.to.pos, k);
    cam.look.lerpVectors(cam.from.look, cam.to.look, k);
    cam.fov = cam.from.fov + (cam.to.fov - cam.from.fov) * k;
  }
  camera.position.copy(cam.pos);
  if (shake > 0) {
    shake = Math.max(0, shake - realDt * 1.8);
    const s = shake * shake * 0.18;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
  }
  camera.position.x += Math.sin(clockTime * 0.25) * 0.08;
  camera.lookAt(cam.look);
  camera.fov = cam.fov;
  camera.updateProjectionMatrix();
}

function toScreen(v) {
  const p = v.clone().project(camera);
  return { x: (p.x + 1) * 0.5 * W, y: (1 - p.y) * 0.5 * H, behind: p.z > 1 };
}

// ---------------------------------------------------------------- Nhân vật & nhãn tên

// Người thật nếu đã tải xong, không thì nhân vật chibi.
function makeChar(kind, opts) {
  return humansReady() ? new HumanCharacter(kind, opts) : new Character(kind, opts);
}

const slots = { groom: { char: null, owner: null }, bride: { char: null, owner: null } };
const actors = new Set();
const tags = new Map();

function initialOf(name) {
  return Array.from(String(name || '?').trim())[0]?.toUpperCase() ?? '?';
}

function avatarEl(owner, cls = '') {
  if (owner?.avatar) {
    const img = document.createElement('img');
    img.src = owner.avatar;
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => img.replaceWith(Object.assign(document.createElement('div'), { className: `ini ${cls}`, textContent: initialOf(owner.name) }));
    return img;
  }
  return Object.assign(document.createElement('div'), { className: `ini ${cls}`, textContent: initialOf(owner?.name) });
}

function spawn(role, owner, at) {
  const c = makeChar(role, { seed: owner ? hashSeed(owner.id) : 0, blank: !owner, scale: role === 'bride' && !humansReady() ? 0.96 : 1 });
  c.root.position.copy(at ?? SLOT[role]);
  c.role = role;
  scene.add(c.root);
  actors.add(c);
  const tag = document.createElement('div');
  tag.className = owner ? 'tag' : 'tag blank';
  if (owner) {
    tag.append(avatarEl(owner));
    tag.append(Object.assign(document.createElement('span'), { textContent: owner.name }));
  } else {
    tag.textContent = `Chờ ${ROLE_VI[role]}…`;
  }
  $('tags').append(tag);
  tags.set(c, tag);
  return c;
}

function despawn(c) {
  scene.remove(c.root);
  actors.delete(c);
  tags.get(c)?.remove();
  tags.delete(c);
}

function hideTag(c) {
  tags.get(c)?.classList.add('gone');
}

function setSlot(role, owner, char) {
  const s = slots[role];
  if (s.char && s.char !== char) despawn(s.char);
  s.char = char ?? spawn(role, owner);
  s.owner = owner;
  s.char.root.position.copy(SLOT[role]);
  s.char.faceYaw(0);
}

// ---------------------------------------------------------------- Khung avatar, vàng, thông báo

let couple = { groom: null, bride: null, coupleSince: 0, record: null };

function renderCard(role, owner, anim) {
  const card = $(`card-${role}`);
  const img = card.querySelector('.avatar');
  const ini = card.querySelector('.initial');
  const empty = card.querySelector('.empty');
  const name = card.querySelector('.name');
  const gift = guide?.gifts.find((g) => g.action === `become_${role}`);
  empty.querySelector('img').src = gift?.icon ?? '';
  img.hidden = ini.hidden = true;
  empty.hidden = !!owner;
  if (owner) {
    ini.textContent = initialOf(owner.name);
    ini.hidden = false;
    if (owner.avatar) {
      img.onload = () => (ini.hidden = true, img.hidden = false);
      img.onerror = () => (img.hidden = true, ini.hidden = false);
      img.referrerPolicy = 'no-referrer';
      img.src = owner.avatar;
    }
  }
  name.textContent = owner ? owner.name : gift ? gift.label : `Chờ ${ROLE_VI[role]}`;
  name.classList.toggle('waiting', !owner);
  if (anim) {
    card.classList.remove('pop', 'out');
    void card.offsetWidth;
    card.classList.add(anim);
  }
}

const fmtTime = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

function renderTogether() {
  const both = couple.groom && couple.bride && couple.coupleSince;
  $('heart').classList.toggle('broken', !both);
  $('together').innerHTML = both ? `Bên nhau<b>${fmtTime(serverNow() - couple.coupleSince)}</b>` : 'Chờ đủ<br>cô dâu chú rể';
  const r = couple.record;
  const married = couple.married ? `💒 Đã cưới ${couple.married} cặp` : '';
  const rec = r ? `🏆 Kỷ lục bên nhau: ${r.groom} ♥ ${r.bride} · ${fmtTime(r.ms)}` : '';
  $('record').textContent = [married, rec].filter(Boolean).join(' · ');
}
setInterval(renderTogether, 1000);

const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
function renderGold(p, bump) {
  const span = Math.max(1, p.goal - p.from);
  $('gold').querySelector('.fill').style.width = `${Math.min(100, ((p.gold - p.from) / span) * 100)}%`;
  $('gold').querySelector('.text').textContent = `${fmt(p.gold)} / ${fmt(p.goal)} chỉ vàng → pháo hoa`;
  if (bump) {
    $('gold').classList.remove('bump');
    void $('gold').offsetWidth;
    $('gold').classList.add('bump');
  }
}

// Bảng cách chơi chạy như cuộn phim từ phải sang trái khi không đủ chỗ cho mọi ô quà.
function giftCell(g) {
  const el = document.createElement('div');
  el.className = 'cell';
  el.dataset.action = g.action;
  el.innerHTML = `<img alt=""><div class="act"></div>`;
  el.querySelector('img').src = g.icon;
  el.querySelector('img').alt = g.giftLabel;
  el.querySelector('.act').textContent = g.label;
  return el;
}

function renderGuide() {
  $('gold-icon').src = guide.goldIcon || '';
  const track = $('cells');
  const film = guide.gifts.length > 4;
  $('howto').classList.toggle('film', film);
  const cells = guide.gifts.map(giftCell);
  // Hai bản nối tiếp nhau: chạy hết một bản thì vòng lại đúng chỗ, không bị giật.
  track.replaceChildren(...cells, ...(film ? guide.gifts.map(giftCell) : []));
  track.style.animationDuration = `${guide.gifts.length * 3.2}s`;
}

function flashCell(action) {
  for (const el of document.querySelectorAll(`.cell[data-action="${action}"]`)) {
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }
}

// Hàng chờ đăng ký dưới mỗi khung avatar.
function renderWaitlist(w) {
  for (const role of ROLES) {
    const el = $(`card-${role}`).querySelector('.wait');
    const list = w?.[role] ?? { count: 0, first: [] };
    el.hidden = !list.count;
    if (!list.count) continue;
    const more = list.count - list.first.length;
    el.replaceChildren(
      Object.assign(document.createElement('i'), { textContent: `⏳ Chờ ${list.count}:` }),
      ...list.first.map((p) => avatarEl(p)),
      ...(more > 0 ? [Object.assign(document.createElement('i'), { textContent: `+${more}` })] : []),
    );
    el.title = list.first.map((p) => p.name).join(', ');
  }
}

// Thông báo chạy: lần lượt, mỗi dòng ~2,6 giây, dồn nhiều thì bỏ bớt dòng cũ.
const tickQueue = [];
let tickBusy = false;
function announce(text, kind = '') {
  tickQueue.push({ text, kind });
  if (tickQueue.length > 4) tickQueue.splice(0, tickQueue.length - 4);
  if (!tickBusy) nextTick();
}
function nextTick() {
  const item = tickQueue.shift();
  if (!item) {
    tickBusy = false;
    return;
  }
  tickBusy = true;
  const el = document.createElement('div');
  el.className = `tick ${item.kind}`;
  el.textContent = item.text;
  $('ticker').replaceChildren(el);
  const hold = tickQueue.length ? 1600 : 2800;
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(nextTick, 300);
  }, hold);
}

function goldFeed(who, amount) {
  const el = document.createElement('div');
  el.className = 'feed';
  el.append(avatarEl(who));
  el.append(Object.assign(document.createElement('span'), { textContent: who.name }));
  el.append(Object.assign(document.createElement('b'), { textContent: ` +${fmt(amount)} 💰` }));
  const feed = $('gold-feed');
  feed.prepend(el);
  while (feed.children.length > 3) feed.lastChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 500);
  }, 3500);
}

function showBanner(html) {
  const b = $('banner');
  b.innerHTML = html;
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
}

function setQueue(n) {
  $('queue').hidden = !n;
  $('queue').textContent = `⏳ Còn ${n} lượt chờ`;
}

// ---------------------------------------------------------------- Đạo diễn kịch bản

let clockTime = 0;
let sceneClock = 0;
let speed = 1;
let hitstop = 0;
const waits = [];
let running = null;

class Cancelled extends Error {}
function wait(sec, token) {
  return new Promise((resolve, reject) => waits.push({ at: sceneClock + sec, resolve, reject, token }));
}

function chest(c) {
  return c.root.position.clone().add(new THREE.Vector3(0, c.headHeight ? c.headHeight * 0.78 : 0.95, 0));
}

function knock(c, v) {
  c.knockAway(v);
  hideTag(c);
  if (slots[c.role]?.char === c) slots[c.role].char = null;
}

// Về đúng trạng thái (dùng khi mở trang, khi kịch bản bị cắt ngang).
function snapTo(state) {
  stopRitual();
  for (const c of [...actors]) {
    if (c.flight) despawn(c);
  }
  for (const role of ROLES) {
    const owner = state[role];
    const s = slots[role];
    const same = s.char && !s.char.flight && (s.owner?.id ?? null) === (owner?.id ?? null);
    if (!same) setSlot(role, owner);
    else {
      s.char.move = null;
      s.char.root.position.copy(SLOT[role]);
      s.char.faceYaw(0);
      s.char.setFace('happy');
      s.char.play('idle');
    }
    renderCard(role, owner);
  }
  for (const c of [...actors]) {
    if (c !== slots.groom.char && c !== slots.bride.char) despawn(c);
  }
  cameraTo(CAM_MAIN, 0.3);
}

async function runScene(msg) {
  stopRitual();
  renderRitual(null);
  for (const role of ROLES) {
    const c = slots[role].char;
    if (c && !c.flight) {
      c.move?.resolve();
      c.move = null;
      c.root.position.copy(SLOT[role]);
      c.faceYaw(0);
      c.play('idle');
    }
  }
  cameraTo(CAM_MAIN, 0.3);
  if (running) {
    running.cancelled = true;
    waits.splice(0).forEach((w) => w.reject(new Cancelled()));
    snapTo(running.after);
  }
  const token = { cancelled: false, after: { groom: msg.groom, bride: msg.bride } };
  running = token;
  speed = msg.speed || 1;
  const step = (sec) => wait(sec, token).then(() => {
    if (token.cancelled) throw new Cancelled();
  });
  try {
    if (msg.kind === 'claim') await claimScene(msg, step);
    else if (msg.kind === 'steal') await stealScene(msg, step);
    else if (msg.kind === 'cancel') await cancelScene(msg, step);
    else if (msg.kind === 'farewell') await farewellScene(msg, step);
  } catch (err) {
    if (!(err instanceof Cancelled)) console.error(err);
  } finally {
    if (running === token) {
      running = null;
      speed = 1;
    }
  }
}

async function claimScene(msg, step) {
  const role = msg.role;
  const old = slots[role].char;
  announce(msg.text);
  flashCell(msg.action);
  sfx.fanfare();
  if (old) {
    fx.burst(chest(old), 80, { colors: ['#ffffff', '#ffd1dc', '#fff3b0'], speed: 2.2, life: 0.7 });
    despawn(old);
  }
  const c = spawn(role, msg.who);
  slots[role] = { char: c, owner: msg.who };
  c.play('spin');
  renderCard(role, msg.who, 'pop');
  couple[role] = msg.who;
  Object.assign(couple, { coupleSince: msg.coupleSince, record: msg.record });
  renderTogether();
  fx.confetti(chest(c), 140);
  hall.react('clap', 2.4);
  const partner = slots[role === 'groom' ? 'bride' : 'groom'].char;
  partner?.play('wave');
  await step(0.8);
  sfx.cheer();
  await step(1.4);
  c.play('idle');
  partner?.play('idle');
}

async function stealScene(msg, step) {
  const role = msg.role;
  const side = role === 'groom' ? -1 : 1;
  const slot = SLOT[role];
  let old = slots[role].char;
  if (!old || old.flight) old = setSlot(role, msg.from) ?? slots[role].char;
  old = slots[role].char;
  flashCell(msg.action);
  announce(`🚶 ${msg.who.name} đang tới giành vai ${ROLE_VI[role]}…`, 'steal');

  const newC = spawn(role, msg.who, ENTRY[role]);
  sfx.whoosh();
  const standX = slot.x + side * 0.6;
  await Promise.race([newC.walkTo(standX, slot.z, 1.5), step(1.6)]);
  newC.facePoint(old.root.position.x, old.root.position.z);
  old.facePoint(standX, slot.z);
  old.setFace('shock');
  old.play('shock');
  sfx.shock();
  cameraTo(closeUp((standX + slot.x) / 2), 0.35 / speed);
  await step(0.25);

  newC.play('kick');
  await step(0.36);
  // Trúng!
  hitstop = 0.12;
  shake = 1;
  sfx.kick();
  const p = toScreen(chest(old));
  comicBurst($('fx'), p.x, p.y, ['BỐP!', 'BỊCH!', 'ỐI!', 'BÙM!'][Math.floor(Math.random() * 4)]);
  fx.burst(chest(old), 70, { colors: ['#fff3b0', '#ffd166', '#ffffff', '#ff8fab'], speed: 3, life: 0.6 });
  knock(old, new THREE.Vector3(-side * 0.7, 7.2, -1.4));
  sfx.fly();
  slots[role] = { char: newC, owner: msg.who };
  couple[role] = msg.who;
  Object.assign(couple, { coupleSince: msg.coupleSince, record: msg.record });
  renderCard(role, msg.who, 'pop');
  renderTogether();
  announce(msg.text, 'steal');
  hall.react('cheer', 1.8);

  await step(0.9);
  cameraTo(CAM_MAIN, 0.5 / speed);
  await step(0.2);
  await Promise.race([newC.walkTo(slot.x, slot.z, 0.55), step(0.65)]);
  newC.root.position.copy(slot);
  newC.faceYaw(0);
  newC.play('cheer');
  fx.confetti(chest(newC), 120);
  sfx.cheer();
  await step(1.0);
  newC.play('idle');
}

async function cancelScene(msg, step) {
  flashCell('cancel_wedding');
  announce(msg.text, 'cancel');
  for (const role of ROLES) {
    const c = slots[role].char;
    if (slots[role].owner && c) {
      c.setFace('shock');
      c.play('shock');
    }
  }
  sfx.shock();
  const mid = toScreen(new THREE.Vector3(0, 1.25, SLOT.groom.z));
  const heart = Object.assign(document.createElement('div'), { className: 'broken-heart', textContent: '💔' });
  heart.style.left = `${mid.x}px`;
  heart.style.top = `${mid.y}px`;
  $('fx').append(heart);
  setTimeout(() => heart.remove(), 1300);
  setTimeout(() => sfx.sadTrombone(), 250 / speed);
  await step(0.9);

  shake = 1.1;
  hitstop = 0.1;
  sfx.boom();
  comicBurst($('fx'), mid.x, mid.y, 'BÙM!', { fill: '#ffffff', stroke: '#3a3a4a', size: 480 });
  fx.burst(new THREE.Vector3(0, 1, SLOT.groom.z), 120, { colors: ['#ffffff', '#cccccc', '#ff8fab'], speed: 3.5, life: 0.8 });
  for (const role of ROLES) {
    const c = slots[role].char;
    const side = role === 'groom' ? -1 : 1;
    if (c && slots[role].owner) knock(c, new THREE.Vector3(side * 1.5, 7, -1.2));
    else if (c) despawn(c);
    slots[role] = { char: null, owner: null };
    couple[role] = null;
    renderCard(role, null, 'out');
  }
  Object.assign(couple, { coupleSince: 0, record: msg.record });
  renderTogether();
  sfx.fly();
  hall.react('shock', 1.2);

  await step(1.3);
  const fresh = ROLES.map((role) => {
    const c = spawn(role, null, ENTRY[role]);
    slots[role] = { char: c, owner: null };
    c.walkTo(SLOT[role].x, SLOT[role].z, 1.6);
    return c;
  });
  await step(1.75);
  fresh.forEach((c) => {
    c.root.position.copy(SLOT[c.role]);
    c.faceYaw(0);
    c.play('idle');
  });
}

// Làm xong lễ: cô dâu chú rể cùng đi xuống lễ đường rồi rời sân khấu, hai chỗ trống chờ cặp sau.
async function farewellScene(msg, step) {
  const pair = ROLES.map((role) => slots[role].char).filter((c) => c && !c.flight);
  announce(msg.text);
  showBanner(`💒 TRĂM NĂM HẠNH PHÚC 💒<small>${msg.from.groom?.name ?? ''} ♥ ${msg.from.bride?.name ?? ''} đã nên vợ nên chồng</small>`);
  sfx.fanfare();
  sfx.cheer();
  fx.petals(220);
  fx.fireworkShow(6);
  hall.react('cheer', 5);
  couple = { ...couple, groom: null, bride: null, coupleSince: 0, record: msg.record, married: msg.married };
  pair.forEach((c, i) => c.walkTo(i ? 0.24 : -0.24, SLOT.groom.z, 0.8));
  await step(0.9);
  pair.forEach((c) => {
    c.faceYaw(0);
    c.play('wave');
  });
  await step(1.0);
  pair.forEach((c, i) => c.walkTo(i ? 0.24 : -0.24, 3.0, 3.2, -0.33));
  await step(3.3);
  for (const role of ROLES) {
    const c = slots[role].char;
    if (c) {
      fx.burst(chest(c), 70, { colors: ['#ffffff', '#ffd1dc', '#fff3b0'], speed: 2.2, life: 0.7 });
      despawn(c);
    }
    const blank = spawn(role, null);
    slots[role] = { char: blank, owner: null };
    renderCard(role, null, 'out');
  }
  renderTogether();
}

// ---------------------------------------------------------------- Phụ đề MC

function showSubtitle(lines) {
  const el = $('mc-sub');
  el.replaceChildren(...(lines ?? []).map((l) => {
    const row = document.createElement('div');
    row.className = `line ${l.speaker}`;
    row.append(Object.assign(document.createElement('b'), { textContent: l.speaker === 'nu' ? '🎤 MC nữ' : '🎤 MC nam' }), ` ${l.text}`);
    return row;
  }));
  el.classList.add('show');
}

// ---------------------------------------------------------------- Nghi lễ

let ritualToken = null;
const rwaits = [];
const extras = new Set();

function rwait(sec) {
  return new Promise((resolve, reject) => rwaits.push({ at: clockTime + sec, resolve, reject }));
}

function spawnExtra(seed, at) {
  const c = makeChar('guest', { seed, scale: humansReady() ? 1 : 0.85 });
  c.root.position.copy(at);
  scene.add(c.root);
  actors.add(c);
  extras.add(c);
  return c;
}

function despawnExtra(c) {
  extras.delete(c);
  despawn(c);
}

function stopRitual() {
  director.lock = 0;
  if (ritualToken) ritualToken.dead = true;
  ritualToken = null;
  rwaits.splice(0).forEach((w) => w.reject(new Cancelled()));
  props.clear();
  for (const c of [...extras]) despawnExtra(c);
}

function bigEmoji(text) {
  const el = Object.assign(document.createElement('div'), { className: 'broken-heart', textContent: text });
  el.style.left = `${W / 2}px`;
  el.style.top = '900px';
  $('fx').append(el);
  setTimeout(() => el.remove(), 1300);
}

function renderRitual(r) {
  const el = $('ritual');
  el.hidden = !r;
  $('record').hidden = !!r;
  if (!r) return;
  const steps = guide?.ceremony ?? [];
  el.querySelector('.title').textContent = r.step < 0 ? (r.restart ? '🔁 Làm lại từ đầu' : '💒 Chuẩn bị làm lễ') : `💒 ${r.step + 1}/${steps.length} · ${r.title}`;
  el.querySelector('.dots').replaceChildren(...steps.map((st, i) => Object.assign(document.createElement('i'), { className: i < r.step ? 'done' : i === r.step ? 'now' : '', title: st.title })));
}

async function runRitual(r, { quiet = false } = {}) {
  stopRitual();
  renderRitual(r);
  if (!quiet) announce(r.text, r.restart ? 'steal' : 'ritual');
  const groom = slots.groom.char;
  const bride = slots.bride.char;
  if (!groom || !bride || groom.flight || bride.flight || !slots.groom.owner || !slots.bride.owner || running) return;
  const token = { dead: false };
  ritualToken = token;
  const ctx = {
    groom, bride, props, fx, hall, sfx, CAM_MAIN,
    cameraTo: (target, dur) => {
      director.lock = target === CAM_MAIN ? 0 : clockTime + 8;
      cameraTo(target, dur);
    },
    closeUp: closeUpCenter,
    now: () => clockTime,
    wait: (sec) => rwait(sec).then(() => {
      if (token.dead) throw new Cancelled();
    }),
    heartsAt: (c, n) => {
      const p = toScreen(c.headTop());
      floatHearts($('fx'), p.x, p.y, n);
    },
    bigEmoji,
    smoke: (at) => fx.burst(at, 6, { colors: ['#8d8189', '#b9aeb5'], speed: 0.12, gravity: -0.45, life: 1.8 }),
    spawnExtra,
    despawnExtra,
  };
  try {
    await RITUALS[r.id]?.(ctx);
  } catch (err) {
    if (!(err instanceof Cancelled)) console.error(err);
  }
}

// ---------------------------------------------------------------- Hai MC trên sân khấu

const mcs = {};
const mcTags = new Map();

function spawnMCs() {
  for (const [who, gender, label] of [['nam', 'm', 'MC'], ['nu', 'f', 'MC']]) {
    const c = new HumanCharacter('mc', { gender, mic: true });
    const at = MC_SPOT[who];
    c.root.position.copy(at);
    c.faceYaw(Math.atan2(-at.x * 0.35, 4));
    c.yaw = c.targetYaw;
    c.lastTalk = '';
    scene.add(c.root);
    mcs[who] = c;
    const tag = Object.assign(document.createElement('div'), { className: `tag mc ${who}`, textContent: `🎤 ${label}` });
    $('tags').append(tag);
    mcTags.set(c, tag);
  }
}

// Kiểu nói theo tình huống; MC nói tay trái làm động tác, tay phải cầm micro. Không lặp kiểu vừa dùng.
function talkStyles(event = '', who) {
  const toCouple = who === 'nam' ? 'presentL' : 'presentR';
  if (/^(steal|cancel)/.test(event)) return ['talk3', 'laugh', 'talk3', 'moderate'];
  if (/^(claim|register|ceremony_start|restart|step_ruoc|step_trao|step_giao)/.test(event)) return [toCouple, 'talk1', toCouple, 'moderate'];
  if (/^(goal|farewell|step_cam_on|gold_huge)/.test(event)) return ['talk3', 'moderate', toCouple];
  if (/^gold/.test(event)) return ['talk2', 'talk1', 'laugh'];
  if (/^idle/.test(event)) return ['moderate', 'talk2', toCouple, 'talk1'];
  return ['talk1', 'talk2', 'moderate', toCouple];
}

function mcTalk(who, event) {
  const c = mcs[who];
  if (!c) return;
  const styles = talkStyles(event, who).filter((s) => s !== c.lastTalk);
  const style = styles[Math.floor(Math.random() * styles.length)];
  c.lastTalk = style;
  c.play(style);
  focusMC(who);
  // MC còn lại nghe: cười khi có chuyện vui, còn không thì đứng nghe.
  const other = mcs[who === 'nam' ? 'nu' : 'nam'];
  if (other) other.play(/^(steal|cancel|gold_huge)/.test(event) && Math.random() < 0.6 ? 'laugh' : 'idle');
}

function mcQuiet() {
  for (const c of Object.values(mcs)) c.play(Math.random() < 0.5 ? 'idle' : 'idle2');
}

// Người đang giữ vai tặng tiếp: vẫy tay, tim bay.
function cheerHolder(msg) {
  announce(msg.text);
  if (!msg.role) return;
  flashCell(msg.action ?? `become_${msg.role}`);
  const c = slots[msg.role].char;
  if (!c || c.flight || slots[msg.role].owner?.id !== msg.who.id) return;
  c.play('cheer');
  setTimeout(() => c.anim === 'cheer' && c.play('idle'), 1300);
  const p = toScreen(c.headTop());
  floatHearts($('fx'), p.x, p.y, 4);
}

// ---------------------------------------------------------------- Server

function applySnapshot(game) {
  serverOffset = game.serverNow - Date.now();
  couple = { groom: game.groom, bride: game.bride, coupleSince: game.coupleSince, record: game.record, married: game.married };
  if (running) {
    running.cancelled = true;
    waits.splice(0).forEach((w) => w.reject(new Cancelled()));
    running = null;
  }
  snapTo({ groom: game.groom, bride: game.bride });
  renderGold(game.progress);
  renderWaitlist(game.waitlist);
  renderTogether();
  if (game.ritual) runRitual(game.ritual, { quiet: true });
  else renderRitual(null);
  setQueue(game.waiting);
}

const handlers = {
  snapshot(msg) {
    guide = msg.guide;
    renderScale = Number(params.get('scale')) || guide.renderScale || 1;
    resizeRenderer();
    renderGuide();
    applySnapshot(msg.game);
    handlers.status(msg.status, msg.testMode);
  },
  status(s, test) {
    const el = $('status');
    el.hidden = !params.has('dev');
    el.textContent = `${s.connected ? '🟢' : test ? '🧪' : '🔴'} ${s.text}`;
    el.classList.toggle('off', !s.connected);
  },
  scene(msg) {
    setQueue(msg.waiting);
    runScene(msg);
  },
  cheer: cheerHolder,
  say(msg) {
    let speaker = null;
    speak(msg, {
      onStart: () => showSubtitle(msg.lines),
      onClip: (i) => {
        const who = msg.clips[i]?.speaker;
        if (who && who !== speaker) {
          speaker = who;
          mcTalk(who, msg.event);
        }
      },
      onDone: () => {
        $('mc-sub').classList.remove('show');
        mcQuiet();
      },
    });
  },
  ritual(msg) {
    runRitual(msg);
  },
  waitlist(msg) {
    renderWaitlist(msg.waitlist);
  },
  registered(msg) {
    announce(msg.text);
    flashCell(`become_${msg.role}`);
    sfx.coin();
    const card = $(`card-${msg.role}`).querySelector('.wait');
    card.classList.remove('pop');
    void card.offsetWidth;
    card.classList.add('pop');
  },
  queued(msg) {
    setQueue(msg.size);
  },
  gold(msg) {
    renderGold(msg.progress, true);
    goldFeed(msg.who, msg.amount);
    sfx.coin();
    flashCell('gold');
    if (msg.withAction) return;
    if (msg.amount >= 10) announce(msg.text, 'gold');
    if (msg.amount >= 30) fx.confetti(new THREE.Vector3(0, 1.2, 0.4), Math.min(220, 40 + msg.amount), { spread: 2.2, up: 3.8 });
  },
  goal(msg) {
    renderGold(msg.progress, true);
    showBanner(`🎆 ${fmt(msg.goal)} CHỈ VÀNG! 🎆<small>Cảm ơn cả nhà đã mừng cưới</small>`);
    fx.fireworkShow(9);
    fx.petals(220);
    sfx.launch();
    setTimeout(() => sfx.cheer(), 900);
    hall.react('cheer', 3.5);
    for (const role of ROLES) {
      const c = slots[role].char;
      if (c && !c.flight && slots[role].owner) {
        c.play('cheer');
        setTimeout(() => c.anim === 'cheer' && c.play('idle'), 3000);
      }
    }
  },
  like(msg) {
    const p = toScreen(new THREE.Vector3(0, 1.6, SLOT.groom.z));
    floatHearts($('fx'), p.x, p.y, Math.min(3, Math.ceil(msg.count / 10)));
  },
  reset(msg) {
    applySnapshot(msg.snapshot);
    $('gold-feed').replaceChildren();
  },
  dropped() {},
  paused() {},
};

let source = null;
function connect() {
  source = new EventSource('/events');
  source.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    try {
      handlers[msg.type]?.(msg);
    } catch (err) {
      console.error(msg.type, err);
    }
  };
  source.onopen = () => ($('status').hidden = !params.has('dev'));
  source.onerror = () => {
    const el = $('status');
    el.hidden = false;
    el.classList.add('off');
    el.textContent = '🔴 Mất kết nối server, đang thử lại…';
  };
}

// ---------------------------------------------------------------- Âm thanh

function trySound() {
  if (audioReady()) {
    $('sound-hint').hidden = true;
  } else {
    $('sound-hint').hidden = params.has('mute');
  }
}
$('sound-hint').onclick = () => unlockAudio()?.then(trySound);
addEventListener('pointerdown', () => unlockAudio()?.then(trySound));

// ---------------------------------------------------------------- Vòng lặp

const clock = new THREE.Timer();
const tmp = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  clock.update();
  const realDt = Math.min(0.05, clock.getDelta());
  let dt = realDt * speed;
  if (hitstop > 0) {
    hitstop -= realDt;
    dt *= 0.05;
  }
  clockTime += realDt;
  sceneClock += dt;
  for (let i = waits.length - 1; i >= 0; i--) {
    if (sceneClock >= waits[i].at) waits.splice(i, 1)[0].resolve();
  }
  for (let i = rwaits.length - 1; i >= 0; i--) {
    if (clockTime >= rwaits[i].at) rwaits.splice(i, 1)[0].resolve();
  }
  props.update(realDt, clockTime);

  for (const c of [...actors]) {
    c.update(dt);
    if (c.done) despawn(c);
  }
  hall.update(realDt, clockTime);
  fx.update(dt);
  directorTick();
  updateCamera(dt, realDt);
  scene.updateMatrixWorld();

  // Nhãn tên bám trên đầu nhân vật.
  for (const [c, tag] of mcTags) {
    c.update(realDt);
    tmp.copy(c.headTop());
    const p = toScreen(tmp);
    tag.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
  }
  for (const [c, tag] of tags) {
    tmp.copy(c.headTop());
    tmp.y += 0.18;
    const p = toScreen(tmp);
    tag.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
  }
  composer.render();
}

if (params.has('dev')) window.__dbg = { THREE, scene, renderer, hall, bloom, mcTalk, mcs, director };
fit();
trySound();
frame();
// Tải nhân vật người thật trước khi nhận trạng thái từ server; lỗi thì vẫn chơi bằng nhân vật chibi.
$('loading').hidden = false;
loadHumans((done, total) => ($('loading').textContent = `Đang tải nhân vật… ${done}/${total}`))
  .then((ok) => {
    if (!ok) return;
    hall.setGuests((kind, opts) => new HumanCharacter(kind, opts), { diners: true });
    spawnMCs();
  })
  .catch((err) => console.error('Không tải được nhân vật người thật', err))
  .finally(() => {
    $('loading').hidden = true;
    connect();
  });
