import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Fisher, setLineResolution, hookMesh } from './fisher.js';
import { makeFish, addSwimmers } from './fish.js';
import { createFx } from './fx.js';
import { createWeather, weatherIcon } from './weather.js';
import { sfx, speak, say, wake, onAudioState, setWeatherSound } from './audio.js';
import { createWheelUi } from './wheel.js';
import { createBossShark } from './boss.js';
import { createEpic } from './epic.js';

const W = 1080;
const H = 1920;
const $ = (id) => document.getElementById(id);
const stage = $('stage');

function fit() {
  const scale = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
}
addEventListener('resize', fit);
fit();
onAudioState((ok) => ($('sound-hint').hidden = ok));

const kgText = (kg) => kg.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const smooth = (t) => t * t * (3 - 2 * t);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------------------------------------------------------------- Three.js
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
function setRenderScale(s) {
  renderer.setSize(Math.round(W * s), Math.round(H * s), false);
  setLineResolution(W * s, H * s);
}
setRenderScale(1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 1200);

let world = null;
let swimmers = null;
let fx = null;
let weather = null;
let guide = null;
let bossShark = null;
let epic = null;
// Sự kiện vòng quay đang chạy, đổi số tim mỗi lần giật và bước đếm cá hiếm.
let wheelEvent = null;
const likesPer = () => wheelEvent?.likesPerPull ?? guide?.likesPerPull ?? 100;
const wheelUi = createWheelUi({ sfx, onEvent: setWheelEvent });
const fishers = new Map(); // key -> Fisher
const tags = new Map(); // key -> { el, bar }
const leftovers = []; // hoạt cảnh còn chạy sau khi camera đã rời đi
const floaters = [];
let spot = null;

function init(g) {
  guide = g;
  if (world) return;
  world = buildWorld(scene, { seats: g.seats });
  swimmers = addSwimmers(scene);
  fx = createFx(scene);
  bossShark = createBossShark(scene, fx, g.tiers.shark.fish[0]);
  epic = createEpic({ scene, fx, sfx, toScreen });
  weather = createWeather(scene, world);
  weather.onThunder = (power, delay) => setTimeout(() => sfx.thunder(power), delay * 1000);
  weather.onNews = (text) => toast(text, 'sky');
  const d = g.display ?? {};
  renderer.shadowMap.enabled = d.shadows !== false;
  setRenderScale(d.renderScale || 1);
  renderGuide(g);
}

// ---------------------------------------------------------------- Camera
// Nhìn chếch từ trên xuống để thấy cả mặt bằng hang; hồ nằm ở nửa dưới khung hình, nửa trên là vách hang phía sau các bảng.
const OVERVIEW = { pos: new THREE.Vector3(0, 38.6, 22.8), look: new THREE.Vector3(0, 0, -12), fov: 60 };
// ?cam=x,y,z,lookX,lookY,lookZ,fov để căn lại góc máy khi cần.
{
  const c = new URLSearchParams(location.search).get('cam')?.split(',').map(Number);
  if (c?.length === 7 && c.every(Number.isFinite)) {
    OVERVIEW.pos.set(c[0], c[1], c[2]);
    OVERVIEW.look.set(c[3], c[4], c[5]);
    OVERVIEW.fov = c[6];
  }
}
const cam = { pos: OVERVIEW.pos.clone(), look: OVERVIEW.look.clone(), fov: OVERVIEW.fov };
const camTarget = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 52, rate: 2.5 };

function aimCamera(t, dt) {
  if (spot && spot.f && !spot.f.removed) {
    const s = spot.seat;
    // máy đặt chéo phía trên mặt hồ, nhìn vào mặt người câu; cá ở nửa dưới khung hình
    // cá hiếm, cá mập: máy áp sát dần lúc giằng co, lộ kết quả thì bật lùi lại
    // ghế càng cao, phao càng xa thì máy càng lùi để vẫn thấy cả người lẫn cá dưới nước
    const push = spot.big && spot.phase === 'struggle' ? Math.min(1, (performance.now() / 1000 - spot.t0) / (spot.msg.revealMs / 1000)) : 0;
    const lift = s.pos.y * 0.55;
    const far = Math.max(spot.big ? 9.0 - push * 2.2 : 6.2, s.reach + (spot.big ? 3 : 2.8) + lift);
    const up = (spot.big ? 5.0 - push * 0.8 : 3.0) + lift * 0.3;
    camTarget.pos.copy(s.pos).addScaledVector(s.inward, far).addScaledVector(s.side, spot.big ? 1.6 * (far / 9) : 0.6);
    camTarget.pos.y = s.pos.y + up;
    // hướng nhìn vào người câu, độ cúi nằm giữa đỉnh đầu và con cá để cả hai cùng lọt khung hình
    const camY = camTarget.pos.y;
    const headDown = Math.atan2(camY - (s.pos.y + 2.9), far);
    const fishDown = Math.atan2(camY, Math.max(0.6, far - s.reach));
    const down = (headDown + fishDown) / 2;
    camTarget.look.copy(s.pos).setY(camY).sub(camTarget.pos).normalize().multiplyScalar(4).add(camTarget.pos);
    camTarget.look.y = camY - Math.tan(down) * 4;
    camTarget.fov = 55;
    camTarget.rate = 5.5;
  } else {
    camTarget.pos.copy(OVERVIEW.pos);
    camTarget.pos.x += Math.sin(t * 0.11) * 1.2;
    camTarget.pos.y += Math.sin(t * 0.07) * 0.4;
    camTarget.look.copy(OVERVIEW.look);
    camTarget.fov = OVERVIEW.fov;
    camTarget.rate = 2.6;
  }
  const k = damp(camTarget.rate, dt);
  cam.pos.lerp(camTarget.pos, k);
  cam.look.lerp(camTarget.look, k);
  cam.fov = lerp(cam.fov, camTarget.fov, k);
  camera.position.copy(cam.pos);
  // đèn phụ chiếu từ phía máy quay, mạnh lên khi quay cận
  const sky = world.sky;
  sky.focus = lerp(sky.focus, spot ? 1 : 0, damp(4, dt));
  sky.fill.position.copy(cam.pos);
  sky.fill.target.position.copy(cam.look);
  sky.fill.intensity = 0.3 + sky.focus * 1.25;
  if (spot && spot.phase === 'struggle') {
    // rung nhẹ khi đang gồng
    camera.position.x += (Math.random() - 0.5) * (spot.big ? 0.08 : 0.03);
    camera.position.y += (Math.random() - 0.5) * (spot.big ? 0.08 : 0.03);
  }
  const quake = epic?.shake() ?? 0;
  if (quake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * quake;
    camera.position.y += (Math.random() - 0.5) * quake;
  }
  camera.fov = cam.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(cam.look);
}

// ---------------------------------------------------------------- Người câu
function addFisher(player, drop) {
  if (!world) return;
  const seat = world.seats[player.seat];
  if (!seat) return;
  fishers.get(player.key)?.dispose();
  for (const [key, other] of fishers) {
    if (other.seat === seat) {
      other.dispose();
      fishers.delete(key);
      removeTag(key);
    }
  }
  const f = new Fisher(player, seat, scene, gearLook(player.gear));
  fishers.set(player.key, f);
  if (!drop) {
    f.root.position.y = seat.pos.y;
    f.setState('idle');
  } else {
    sfx.whoosh();
    f.onLand = () => {
      fx.dust(seat.pos.clone().setY(seat.pos.y + 0.3));
      sfx.land();
    };
  }
  addTag(player);
  setLikes(player.key, player.likes);
  showGear(player.key, f.look);
  showPerks(player.key, f, player.perks);
  setKing(player.key, f, player.king);
  if (drop) touch(player.key);
}

function removeFisher(key) {
  const f = fishers.get(key);
  if (!f) return;
  fishers.delete(key);
  removeTag(key);
  f.leave();
  leftovers.push({ update: () => !f.removed && (f.update(1 / 60), true) });
}

// ---------------------------------------------------------------- Trang bị
// gear = { rod, hook } là id món đang dùng; đổi sang dữ liệu đầy đủ (tên, màu) trong guide.gear.
function gearItem(slot, id) {
  return guide?.gear?.[slot]?.items.find((item) => item.id === id) ?? null;
}
function gearLook(gear) {
  return { rod: gearItem('rod', gear?.rod), hook: gearItem('hook', gear?.hook) };
}
function showGear(key, look) {
  const tag = tags.get(key);
  if (!tag) return;
  const names = [look.rod?.name, look.hook?.name].filter(Boolean);
  tag.el.classList.toggle('geared', names.length > 0);
  tag.gear.textContent = names.join(' · ');
  tag.w = undefined;
}
function onGear(msg) {
  const item = gearItem(msg.slot, msg.item);
  if (!item) return;
  toast(`${msg.slot === 'rod' ? '🎣' : '⚓'} ${msg.name} đổi được ${item.name}!`, 'gift');
  const f = fishers.get(msg.key);
  if (!f) return;
  touch(msg.key);
  f.setGear(msg.slot, item);
  showGear(msg.key, f.look);
  fx.sparkle(f.headPos, 14, item.color);
}

// ---------------------------------------------------------------- Đạo cụ
const PROP_ICON = { net: '🕸️', bait: '🐛', vip: '💺', charm: '🧿', otter: '🦦' };
function showPerks(key, f, perks) {
  f.setPerks(perks);
  const tag = tags.get(key);
  if (!tag) return;
  const on = ['net', 'bait', 'vip', 'charm', 'otter'].filter((slot) => perks?.[slot]);
  tag.perks.textContent = on.map((slot) => PROP_ICON[slot]).join('');
  tag.w = undefined;
}
function setKing(key, f, on) {
  f.setKing(Boolean(on));
  tags.get(key)?.el.classList.toggle('king', Boolean(on));
}
function onProp(msg) {
  const item = guide?.shop?.find((x) => x.slot === msg.slot);
  if (!item) return;
  toast(`${PROP_ICON[msg.slot] ?? '🎁'} ${msg.name} vừa có ${item.label}!`, 'gift');
  touch(msg.key);
  const f = fishers.get(msg.key);
  if (f) fx.sparkle(f.headPos, 14, '#ffe066');
}
function onOtter(msg) {
  const f = fishers.get(msg.key);
  if (!f) return;
  f.otterHop();
  flyToBucket(f, { fish: msg.fish, kg: msg.kg }, 0);
  floater(`🦦 +${kgText(msg.kg)} kg`, f.headPos, 'otter', 1.6, 0.7);
}

// ---------------------------------------------------------------- Thẻ tên
function addTag(player) {
  removeTag(player.key);
  const el = document.createElement('div');
  el.className = 'tag';
  const img = player.avatar ? `<img class="real" src="${esc(player.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.classList.add('gone')">` : '<img class="blank" alt="">';
  const ava = `<span class="ava">${img}<b class="ini">${esc([...player.name][0] ?? '?')}</b></span>`;
  el.innerHTML = `<div class="pill">${ava}<span>${esc(player.name)}</span><em class="perks"></em></div><div class="bar"><i></i></div><div class="gear-line"></div>`;
  $('tags').append(el);
  tags.set(player.key, { el, bar: el.querySelector('.bar i'), gear: el.querySelector('.gear-line'), perks: el.querySelector('.perks') });
}
function removeTag(key) {
  tags.get(key)?.el.remove();
  tags.delete(key);
}
function setLikes(key, likes) {
  const tag = tags.get(key);
  if (!tag || !guide) return;
  tag.el.classList.toggle('likes', likes > 0);
  tag.bar.style.width = `${Math.min(100, (likes / likesPer()) * 100)}%`;
}

const proj = new THREE.Vector3();
function toScreen(v) {
  proj.copy(v).project(camera);
  return { x: ((proj.x + 1) / 2) * W, y: ((1 - proj.y) / 2) * H, behind: proj.z > 1 };
}
// Đông người (hơn 20) thì chỉ hiện tên người vừa hoạt động, tránh tên chồng lên nhau.
const activeAt = new Map();
const touch = (key) => activeAt.set(key, performance.now());
function placeTags() {
  const crowded = fishers.size > 20;
  const now = performance.now();
  // tối đa 12 tên người vừa hoạt động trong 25 giây
  const recent = crowded
    ? new Set([...activeAt].filter(([k, at]) => now - at < 25_000 && tags.has(k)).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => k))
    : null;
  for (const [key, tag] of tags) {
    const f = fishers.get(key);
    if (!f) continue;
    const focused = spot && spot.f === f;
    const quiet = crowded && !recent.has(key);
    const hidden = (spot && !focused) || f.state === 'fall' || (quiet && !focused);
    const s = toScreen(f.headPos);
    tag.el.classList.toggle('hidden', hidden || s.behind);
    tag.el.classList.toggle('big', Boolean(focused));
    // giữ thẻ trong màn hình (ghế sát mép trái/phải)
    const half = (tag.w ??= tag.el.offsetWidth) / 2;
    const x = Math.min(W - half - 6, Math.max(half + 6, s.x));
    // thẻ của người đang quay cận luôn nằm trong màn hình, dưới dải đen của hiệu ứng cá lớn
    const y = focused ? Math.max(180, s.y - 40) : s.y - 6;
    tag.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    if (focused !== tag.wasFocused) {
      tag.wasFocused = focused;
      tag.w = undefined;
    }
  }
}

// ---------------------------------------------------------------- Chữ bay
function floater(text, pos, cls = '', life = 1.8, rise = 1.2) {
  const el = document.createElement('div');
  el.className = `floater ${cls}`;
  el.textContent = text;
  $('floaters').append(el);
  floaters.push({ el, pos: pos.clone(), age: 0, life, rise });
}
function updateFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.age += dt;
    const k = f.age / f.life;
    if (k >= 1) {
      f.el.remove();
      floaters.splice(i, 1);
      continue;
    }
    const p = f.pos.clone();
    p.y += f.rise * smooth(Math.min(1, k * 1.4));
    const s = toScreen(p);
    const scale = k < 0.15 ? 0.5 + (k / 0.15) * 0.6 : 1.1 - Math.min(0.1, (k - 0.15) * 0.4);
    f.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${scale})`;
    f.el.style.opacity = k > 0.8 ? (1 - k) / 0.2 : 1;
  }
}

// ---------------------------------------------------------------- Giật cá (camera quay cận)
function speciesOf(tier, name) {
  const list = guide?.tiers?.[tier]?.fish ?? [];
  // cá của lưới và rái cá có thể thuộc loại khác với lượt giật, nên tìm thêm ở mọi loại
  const named = list.find((f) => f.name === name) ?? Object.values(guide?.tiers ?? {}).flatMap((t) => t.fish).find((f) => f.name === name);
  return named ?? list[0] ?? { name, color: '#d98c2b', belly: '#f8dd9c' };
}

function startPull(msg, elapsed = 0) {
  if (!world) return;
  endSpot();
  const f = fishers.get(msg.key);
  if (!f || f.removed) return showResultOnly(msg);
  const okList = msg.results.filter((r) => r.ok);
  const best = okList.length ? okList.reduce((a, b) => (b.kg > a.kg ? b : a)) : msg.results[0];
  const shark = msg.tier === 'shark' || msg.tier === 'boss';
  const rare = msg.tier === 'rare';
  const fish = makeFish(speciesOf(msg.tier, best.fish), best.kg);
  const hook = new THREE.Object3D();
  hook.position.set(0.55, 0, 0);
  hook.add(hookMesh(f.look.hook));
  fish.add(hook);
  const start = f.seat.bobber.clone();
  fish.position.copy(start).setY(shark ? -0.32 : -0.22);
  scene.add(fish);
  f.heavy = shark || rare || msg.tier === 'large';
  f.hook = null;
  spot = {
    msg,
    f,
    seat: f.seat,
    fish,
    hook,
    start,
    best,
    ok: okList.length > 0,
    wins: okList.length,
    kg: Math.round(okList.reduce((s, r) => s + r.kg, 0) * 10) / 10,
    shark,
    rare,
    // cá to (cá mập, cá hiếm): máy lùi xa hơn, cá quẫy mạnh hơn
    big: shark || rare,
    t0: performance.now() / 1000 - elapsed / 1000,
    phase: 'struggle',
    nextSplash: 0,
    nextSweat: 0,
  };
  if (spot.big) {
    const text = rare ? '🌟 CÁ HIẾM CẮN CÂU!' : msg.tier === 'boss' ? '🦈 KÉO CÁ MẬP LÊN!' : '🦈 CÁ MẬP CẮN CÂU!';
    epic.start({ kind: rare ? 'rare' : 'shark', at: start, text, left: (msg.revealMs - elapsed) / 1000 });
  }
  stage.classList.add('focus');
  clearTimeout(bannerTimer);
  $('banner').className = '';
  const pulling = $('pulling');
  if (rare) setRare({ n: rareState.every, every: rareState.every }, true);
  pulling.classList.toggle('rare', rare);
  pulling.textContent = rare ? `🌟 ${msg.name} dính CÁ HIẾM!` : msg.count > 1 ? `💪 ${msg.name} giật ${msg.count} lần...` : shark ? `🦈 ${msg.name} đang kéo cá mập...` : `💪 ${msg.name} đang giật cá...`;
  pulling.classList.add('on');
  sfx.reel(msg.revealMs / 1000);
  sfx.splash(spot.big ? 2.5 : 1);
}

function updateSpot(dt) {
  if (!spot) return;
  const { msg, f, fish, start } = spot;
  const e = performance.now() / 1000 - spot.t0;
  const R = msg.revealMs / 1000;
  const M = msg.ms / 1000;
  const t = performance.now() / 1000;
  if (f.removed) return endSpot();

  if (e < R) {
    // vật lộn: cá quẫy dưới mặt nước, nước bắn, người đổ mồ hôi
    if (f.state !== 'struggle' && f.state !== 'fall' && f.state !== 'leave') f.struggle();
    const amp = spot.big ? 0.5 : 0.25;
    fish.position.set(start.x + Math.sin(t * 13) * amp, (spot.big ? -0.3 : -0.2) + Math.sin(t * 21) * 0.08, start.z + Math.cos(t * 11) * amp);
    fish.rotation.set(Math.sin(t * 17) * 0.4, t * 4, Math.sin(t * 9) * 0.3);
    fish.userData.tail.rotation.y = Math.sin(t * 40) * 0.7;
    f.lineEnd.copy(spot.hook.getWorldPosition(new THREE.Vector3()));
    if (e > spot.nextSplash) {
      spot.nextSplash = e + (spot.big ? 0.1 : 0.16);
      fx.splash(fish.position.clone().setY(0), spot.big ? 1.8 : 0.6);
    }
    if (e > spot.nextSweat) {
      spot.nextSweat = e + 0.12;
      fx.sweat(f.headPos);
    }
    return;
  }

  if (spot.phase === 'struggle') reveal();
  const k = e - R;
  if (spot.ok) {
    // cá bay lên theo đường vòng cung rồi treo lủng lẳng dưới đầu cần (cá hiếm, cá mập bay cao và lâu hơn)
    const hang = hangPoint(spot.seat, fish);
    const flight = spot.big ? 0.85 : 0.45;
    if (k < flight) {
      const u = smooth(k / flight);
      fish.position.lerpVectors(start, hang, u);
      fish.position.y += Math.sin(u * Math.PI) * (spot.big ? 3.4 : 1.6);
      fish.rotation.set(0, spot.seat.rotY, u * Math.PI * 2.5);
    } else {
      fish.position.copy(hang);
      fish.rotation.set(Math.sin(t * 9) * 0.5, spot.seat.rotY, Math.PI / 2 + Math.sin(t * 7) * 0.15);
    }
    fish.userData.tail.rotation.y = Math.sin(t * 25) * 0.6;
  } else {
    // cá vọt lên rồi lao ngược ra giữa hồ
    const flight = 0.75;
    const u = Math.min(1, k / flight);
    const away = start.clone().addScaledVector(spot.seat.inward, 2.4);
    fish.position.lerpVectors(start, away, u);
    fish.position.y = Math.sin(u * Math.PI) * (spot.big ? 2.6 : 1.4) - (u >= 1 ? 2 : 0);
    fish.rotation.set(0, Math.atan2(-spot.seat.inward.z, spot.seat.inward.x), Math.cos(u * Math.PI) * 0.9);
    fish.userData.tail.rotation.y = Math.sin(t * 30) * 0.6;
    if (u >= 1 && !spot.dived) {
      spot.dived = true;
      fish.visible = false;
      fx.splash(away.clone().setY(0), spot.big ? 2.5 : 1.2);
      sfx.splash(1);
    }
  }
  if (e >= M) endSpot();
}

// Cá treo thẳng đứng (đầu lên trên) ngay trước mặt người câu, mặt bên quay về phía máy quay.
function hangPoint(seat, fish) {
  const len = fish.userData.length;
  const p = seat.pos.clone().addScaledVector(seat.inward, 1.6 + len * 0.3).addScaledVector(seat.side, 0.9 + len * 0.15);
  p.y = seat.pos.y + 1.15 + len * 0.5;
  return p;
}

function reveal() {
  const { msg, f, fish, big, rare } = spot;
  spot.phase = 'reveal';
  if (big) epic.reveal(spot.ok, msg.tier);
  $('pulling').classList.remove('on');
  fx.splash(fish.position.clone().setY(0), big ? 4 : 1.6);
  sfx.splash(big ? 3 : 1.4);
  if (spot.ok) {
    f.cheer();
    f.hook = spot.hook;
    sfx.win(big || msg.tier === 'large');
    const above = f.headPos.clone();
    above.y += 0.55;
    floater(`+${kgText(spot.kg)} kg`, above, rare ? 'rare' : '', 2.2, 0.6);
    if (big || msg.tier === 'large') fx.confetti(above, big ? 120 : 50);
    // các con cá khác (giật nhiều lần) bay thẳng vào xô
    const extra = msg.results.filter((r) => r.ok && r !== spot.best).slice(0, 5);
    extra.forEach((r, i) => flyToBucket(f, r, i * 0.14));
    showBanner(msg, spot);
  } else {
    f.fail();
    sfx.fail();
    const above = f.headPos.clone();
    above.y += 0.15;
    floater('Xổng rồi! 😭', above, 'fail', 2.0, 0.9);
    showBanner(msg, spot);
  }
}

function endSpot() {
  if (!spot) return;
  const s = spot;
  spot = null;
  if (s.big) epic.end();
  stage.classList.remove('focus');
  $('pulling').classList.remove('on');
  if (s.phase === 'struggle') {
    // bị cắt ngang (trang tải lại, người rời hồ): dọn luôn
    scene.remove(s.fish);
    if (s.f.state === 'struggle') s.f.setState('idle');
    return;
  }
  if (!s.ok) {
    scene.remove(s.fish);
    return;
  }
  // cá treo thêm một lúc rồi nhảy vào xô
  let age = 0;
  const hold = 0.9;
  leftovers.push({
    update(dt) {
      age += dt;
      const f = s.f;
      const t = performance.now() / 1000;
      const stolen = f.removed || f.hook !== s.hook;
      if (age < hold && !stolen) {
        s.fish.position.copy(hangPoint(s.seat, s.fish));
        s.fish.rotation.set(Math.sin(t * 9) * 0.5, s.seat.rotY, Math.PI / 2 + Math.sin(t * 7) * 0.15);
        s.fish.userData.tail.rotation.y = Math.sin(t * 25) * 0.6;
        return true;
      }
      if (f.hook === s.hook) f.hook = null;
      if (!s.into) s.into = { age: 0, from: s.fish.position.clone(), scale: s.fish.scale.x };
      s.into.age += dt;
      const u = Math.min(1, s.into.age / 0.4);
      const bucket = s.seat.bucket.getWorldPosition(new THREE.Vector3());
      bucket.y += 0.4;
      s.fish.position.lerpVectors(s.into.from, bucket, smooth(u));
      s.fish.position.y += Math.sin(u * Math.PI) * 0.6;
      s.fish.scale.setScalar(s.into.scale * (1 - u * 0.85));
      if (u >= 1) {
        scene.remove(s.fish);
        fx.splash(bucket, 0.3);
        return false;
      }
      return true;
    },
  });
}

function flyToBucket(f, result, delay) {
  const seat = f.seat;
  const fish = makeFish(speciesOf(null, result.fish), result.kg);
  const from = seat.bobber.clone().addScaledVector(seat.side, (Math.random() - 0.5) * 1.6);
  fish.visible = false;
  scene.add(fish);
  let age = -delay;
  leftovers.push({
    update(dt) {
      age += dt;
      if (age < 0) return true;
      if (!fish.visible) {
        fish.visible = true;
        fx.splash(from.clone().setY(0), 0.6);
      }
      const u = Math.min(1, age / 0.7);
      const bucket = seat.bucket.getWorldPosition(new THREE.Vector3());
      bucket.y += 0.4;
      fish.position.lerpVectors(from, bucket, u);
      fish.position.y += Math.sin(u * Math.PI) * 2.2;
      fish.rotation.set(0, 0, u * Math.PI * 3);
      fish.userData.tail.rotation.y = Math.sin(age * 30) * 0.6;
      if (u >= 1 || f.removed) {
        scene.remove(fish);
        return false;
      }
      return true;
    },
  });
}

// Người giật cá không còn trên hồ (hiếm): vẫn báo kết quả.
function showResultOnly(msg) {
  const okList = msg.results.filter((r) => r.ok);
  const best = okList.length ? okList.reduce((a, b) => (b.kg > a.kg ? b : a)) : msg.results[0];
  setTimeout(() => showBanner(msg, { ok: okList.length > 0, wins: okList.length, kg: okList.reduce((s, r) => s + r.kg, 0), best, shark: msg.tier === 'shark' || msg.tier === 'boss', rare: msg.tier === 'rare' }), msg.revealMs);
}

let bannerTimer = 0;
function showBanner(msg, s) {
  const el = $('banner');
  const [who, what, sub] = el.children;
  who.textContent = s.ok ? `🎉 ${msg.name} giật được${s.rare ? ' CÁ HIẾM' : ''}` : `${msg.name}`;
  if (s.ok) {
    what.textContent = `${s.shark ? '🦈 ' : s.rare ? '🌟 ' : '🐟 '}${s.best.fish} ${kgText(s.best.kg)} kg`;
    sub.textContent = msg.count > 1 ? `Dính ${s.wins}/${msg.count} con · tổng +${kgText(s.kg)} kg` : `+${kgText(s.kg)} kg vào bảng xếp hạng`;
  } else {
    what.textContent = s.rare ? 'Cá hiếm xổng mất! 😭' : 'Xổng mất rồi! 😭';
    sub.textContent = msg.count > 1 ? `Trượt cả ${msg.count} lần giật` : `${s.best.fish} ~${kgText(s.best.kg)} kg đã bơi mất`;
  }
  el.className = s.ok ? (s.shark ? 'on shark' : s.rare ? 'on rare' : 'on') : 'on fail';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => (el.className = el.className.replace('on', '').trim()), Math.max(1400, (msg.ms - msg.revealMs) + 900));
}

// ---------------------------------------------------------------- Bảng, hướng dẫn, thông báo
// Bảng xếp hạng dạng slide: mỗi lần hiện một người, cứ SLIDE_MS trượt sang người tiếp theo.
// Thẻ được cập nhật tại chỗ nên điểm đổi giữa lúc đang trượt không làm giật hoạt cảnh.
const SLIDE_MS = 3000;
let lastTop = [];
let slideAt = 0;
function showDots() {
  const dots = $('top-dots');
  const n = lastTop.length > 1 ? lastTop.length : 0;
  while (dots.children.length > n) dots.lastChild.remove();
  while (dots.children.length < n) dots.append(document.createElement('i'));
  [...dots.children].forEach((d, i) => d.classList.toggle('on', i === slideAt));
}
function renderTop(top) {
  const list = $('top');
  if (!top.length) {
    list.innerHTML = '<li class="empty">Chưa ai câu được cá.<br>Comment “câu” để bắt đầu!</li>';
    lastTop = [];
    slideAt = 0;
    showDots();
    return;
  }
  const medals = ['🥇', '🥈', '🥉'];
  const before = new Map(lastTop.map((r) => [r.name, r.kg]));
  if (!lastTop.length) list.innerHTML = '';
  while (list.children.length > top.length) list.lastChild.remove();
  if (slideAt >= top.length) slideAt = 0;
  top.forEach((r, i) => {
    const li = list.children[i] ?? list.appendChild(document.createElement('li'));
    const ava = r.avatar ? `<img class="ava" src="${esc(r.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : `<span class="ava ini">${esc([...r.name][0] ?? '?')}</span>`;
    const rank = medals[i] ? `<span class="rank">${medals[i]}</span>` : `<span class="rank num">${i + 1}</span>`;
    const html = `<span class="pic">${ava}${rank}</span><span class="info"><span class="name">${esc(r.name)}</span><span class="kg">${kgText(r.kg)} kg</span><span class="wins">🎣 ${r.wins} lần</span></span>`;
    if (li.dataset.html !== html) {
      li.innerHTML = html;
      li.dataset.html = html;
    }
    li.style.transform = i === slideAt ? 'translateX(0)' : 'translateX(100%)';
    if (before.has(r.name) && before.get(r.name) !== r.kg) {
      li.classList.remove('flash');
      void li.offsetWidth; // chạy lại hoạt cảnh nháy
      li.classList.add('flash');
    }
  });
  lastTop = top;
  showDots();
}
// Thẻ mới đi vào từ bên trái, thẻ đang hiện đi ra bên phải; hết người thứ 5 thì quay lại người đầu.
function nextSlide() {
  const items = $('top').children;
  if (lastTop.length < 2) return;
  const current = items[slideAt];
  slideAt = (slideAt + 1) % lastTop.length;
  const next = items[slideAt];
  next.style.transition = 'none';
  next.style.transform = 'translateX(-100%)';
  void next.offsetWidth;
  next.style.transition = '';
  next.style.transform = 'translateX(0)';
  current.style.transform = 'translateX(100%)';
  showDots();
}
setInterval(nextSlide, SLIDE_MS);

function renderGuide(g) {
  const t = g.tiers;
  const range = (tier) => `${kgText(t[tier].minKg)}–${kgText(t[tier].maxKg)} kg`;
  const rows = [];
  // display.giftGuide: true hiện bảng ảnh quà; false thì chỉ giới thiệu các loại cá.
  if (g.display?.giftGuide) {
    for (const gift of g.gifts) {
      const label = gift.tier === 'shark' ? `🦈 ${t[gift.tier].label}` : t[gift.tier].label;
      rows.push(`<div class="row"><img class="icon" src="${esc(gift.icon)}" alt=""><div class="what">${label} <em>${range(gift.tier)}</em></div></div>`);
    }
  } else {
    for (const [tier, icon] of [['small', '🐟'], ['medium', '🐠'], ['large', '🐡'], ['shark', '🦈']]) {
      rows.push(`<div class="row"><div class="icon">${icon}</div><div class="what">${t[tier].label} <em>${range(tier)}</em></div></div>`);
    }
  }
  const per = g.freePullCooldownSeconds >= 60 && g.freePullCooldownSeconds % 60 === 0 ? `${g.freePullCooldownSeconds / 60 === 1 ? '' : g.freePullCooldownSeconds / 60 + ' '}phút` : `${g.freePullCooldownSeconds} giây`;
  $('free').innerHTML =
    `<div class="free-head">🎣 ${t.like.label} <em>${range('like')}</em></div>` +
    `<div class="free-ways"><span id="free-likes">❤️ ${likesPer()} tim</span>` +
    (g.freePullCooldownSeconds > 0 ? `<span>Follow/Share: 1 lần mỗi ${per}</span>` : '') +
    '</div>';
  $('guide-rows').innerHTML = rows.join('');
  // Bảng trang bị có ảnh quà nên đi cùng tuỳ chọn giftGuide.
  const shop = g.shop ?? [];
  $('gear').hidden = !(shop.length && g.display?.giftGuide);
  const shopRows = shop
    .map((item) => {
      const icon = item.icon ? `<img class="icon" src="${esc(item.icon)}" alt="">` : `<div class="icon">${esc(item.emoji ?? '')}</div>`;
      return `<div class="row">${icon}<div class="text"><b>${esc(item.label)}</b><small>${esc(item.desc ?? '')}</small></div></div>`;
    })
    .join('');
  // hai bản nối tiếp nhau để cuộn lặp không thấy chỗ nối; mỗi dòng dừng trong tầm mắt khoảng 3 giây
  $('gear-track').innerHTML = shopRows + shopRows;
  $('gear-track').style.setProperty('--scroll', `${shop.length * 3}s`);
  $('join-hint').innerHTML = `Comment <b>“${esc(g.joinWord)}”</b> để xuống hồ`;
}

function toast(text, cls = '') {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.textContent = text;
  box.append(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), 3300);
}

// Thanh tiến trình cá hiếm: con cá thứ `every` là cá hiếm. hit: đang giật đúng con cá hiếm.
const rareState = { n: 0, every: 0 };
function setRare(r, hit = false) {
  const el = $('rare');
  if (!r?.every) return (el.hidden = true);
  rareState.n = r.n;
  rareState.every = r.every;
  el.hidden = false;
  // Săn cá hiếm: mỗi lần giật tính nhiều lần, nên có thể tới mốc sớm hơn một con.
  const next = !hit && r.n >= r.every - (wheelEvent?.rareStep ?? 1);
  el.classList.toggle('hit', hit);
  el.classList.toggle('next', next);
  $('rare-text').textContent = hit ? '🌟 CÁ HIẾM ĐÃ CẮN CÂU!' : next ? '🌟 Con tiếp theo là CÁ HIẾM!' : `🌟 Cá hiếm ${r.n}/${r.every}`;
  $('rare-fill').style.width = `${Math.min(100, (r.n / r.every) * 100)}%`;
}

function setQueue(n) {
  const el = $('queue');
  el.textContent = `⏳ Chờ giật: ${n}`;
  el.classList.toggle('on', n > 0);
}

// Sự kiện đổi: cập nhật số tim trên bảng hướng dẫn và thanh cá hiếm. live: vừa diễn ra, không phải lúc tải lại trang.
function setWheelEvent(event, live) {
  wheelEvent = event;
  const free = $('free-likes');
  if (free) {
    free.textContent = `❤️ ${likesPer()} tim`;
    free.classList.toggle('boost', Boolean(event?.likesPerPull));
  }
  if (rareState.every) setRare(rareState);
  if (live && event) toast(`${event.icon} ${event.label}: ${event.text}`, 'gift');
}

// Thi câu nhanh và cá mập: khung diễn biến, kèm cá mập 3D khi có sự kiện cá mập.
function setLive(msg) {
  wheelUi.setLive(msg);
  if (!bossShark) return;
  if (msg.mode === 'boss' && msg.hp > 0 && !bossShark.active) bossShark.show();
}

let bossHitAt = 0;
function bossHit(msg) {
  touch(msg.key);
  bossShark?.hit(msg.dmg);
  const now = performance.now();
  // nhiều phát dồn dập thì chỉ hiện chữ và phát tiếng cách quãng, tránh rối màn hình
  if (now - bossHitAt < 120 || !bossShark?.active) return;
  bossHitAt = now;
  sfx.thud();
  floater(`💪 +${msg.dmg}`, bossShark.top(), 'hit', 0.9, 1.4);
}

const heartAt = new Map();
function likeHeart(key) {
  const f = fishers.get(key);
  if (!f || f.state === 'fall') return;
  const now = performance.now();
  if (now - (heartAt.get(key) ?? 0) < 350) return;
  heartAt.set(key, now);
  const p = f.headPos.clone();
  p.x += (Math.random() - 0.5) * 0.5;
  floater('❤️', p, 'heart', 1.1, 0.9);
}

// ---------------------------------------------------------------- Vòng lặp vẽ
let last = performance.now();
let shadowTick = 0;
let skyTick = 1;
renderer.shadowMap.autoUpdate = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!world) return;
  const t = now / 1000;
  world.update(t, dt);
  swimmers.update(t, dt);
  bossShark.update(t, dt);
  wheelUi.update(dt);
  for (const f of fishers.values()) f.update(dt);
  updateSpot(dt);
  epic.update(t, dt, spot?.big ? spot.fish : null);
  for (let i = leftovers.length - 1; i >= 0; i--) if (!leftovers[i].update(dt)) leftovers.splice(i, 1);
  fx.update(dt);
  aimCamera(t, dt);
  weather.update(t, dt, camera);
  if ((skyTick += dt) > 0.25) {
    skyTick = 0;
    const s = weather.state;
    setWeatherSound({ rain: s.rain, wind: world.env.wind, night: weather.night });
    const h = weather.hour();
    $('sky-chip').textContent = `${weatherIcon(weather.weather(), weather.night > 0.5)} ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
  }
  placeTags();
  updateFloaters(dt);
  // bóng đổ vẽ lại mỗi 3 khung hình ở toàn cảnh (đỡ nặng khi đông người), mỗi khung hình khi quay cận
  if (spot || ++shadowTick % 3 === 0) renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- Sự kiện từ server
const events = new EventSource('/events');
events.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (['join', 'pull', 'gift', 'speak', 'say', 'wheel'].includes(msg.type)) wake();
  switch (msg.type) {
    case 'snapshot': {
      init(msg.guide);
      if (msg.sky) weather.set(msg.sky);
      endSpot();
      for (const key of [...fishers.keys()]) {
        fishers.get(key).dispose();
        fishers.delete(key);
        removeTag(key);
      }
      for (const p of msg.players) addFisher(p, false);
      renderTop(msg.top);
      setQueue(msg.queue);
      setRare(msg.rare);
      if (msg.wheel) wheelUi.set(msg.wheel);
      setLive(msg.live ?? { mode: null });
      if (msg.pull) startPull(msg.pull, msg.pull.elapsed);
      break;
    }
    case 'wheel':
      wheelUi.set(msg, msg.just);
      break;
    case 'wheel-gold':
      wheelUi.setGold(msg);
      break;
    case 'live':
      setLive(msg);
      break;
    case 'boss-hit':
      bossHit(msg);
      break;
    case 'boss-end':
      if (msg.down) {
        bossShark?.defeat();
        sfx.win(true);
        wheelUi.liveResult(msg.name ? `🏆 ${msg.name} kéo được cá mập!` : '🏆 Cả hồ đã kéo được cá mập!');
      } else {
        bossShark?.flee();
        wheelUi.liveResult('💨 Cá mập đã bơi đi mất!');
      }
      break;
    case 'sprint-end':
      if (msg.name) {
        sfx.win(true);
        wheelUi.liveResult(`🏆 ${msg.name} thắng thi câu nhanh: +${kgText(msg.bonus)} kg!`);
      } else {
        wheelUi.liveResult('⏱️ Hết giờ, chưa ai câu được cá!');
      }
      break;
    case 'join':
      addFisher(msg.player, true);
      toast(`🎣 ${msg.player.name} đã xuống hồ câu!`);
      break;
    case 'leave':
      removeFisher(msg.key);
      break;
    case 'likes':
      setLikes(msg.key, msg.likes);
      touch(msg.key);
      likeHeart(msg.key);
      break;
    case 'bite': {
      // phao giật: cá đang cắn câu
      const f = fishers.get(msg.key);
      if (f) {
        f.bite();
        touch(msg.key);
        fx?.ripple(f.seat.bobber.x, f.seat.bobber.z, 0.7, 1.0);
      }
      break;
    }
    case 'pull':
      touch(msg.key);
      startPull(msg);
      break;
    case 'board':
      renderTop(msg.top);
      break;
    case 'sky':
      weather?.set(msg, msg.changed);
      break;
    case 'queue':
      setQueue(msg.n);
      break;
    case 'rare':
      // vừa lộ kết quả con cá hiếm: giữ thanh đầy thêm một lúc rồi mới về 0
      if (spot?.rare) setTimeout(() => setRare(msg), 2500);
      else setRare(msg);
      break;
    case 'gift':
      sfx.pop();
      break;
    case 'gear':
      onGear(msg);
      break;
    case 'prop':
      onProp(msg);
      break;
    case 'perks': {
      const f = fishers.get(msg.key);
      if (f) showPerks(msg.key, f, msg.perks);
      break;
    }
    case 'otter':
      onOtter(msg);
      break;
    case 'king':
      for (const [key, f] of fishers) setKing(key, f, key === msg.key);
      break;
    case 'free':
      toast(msg.kind === 'share' ? `↗️ ${msg.name} vừa chia sẻ live, cảm ơn bạn!` : `➕ ${msg.name} vừa theo dõi, cảm ơn bạn!`, 'gift');
      break;
    case 'full':
      toast(`Hồ đã kín chỗ, ${msg.name} chờ chút nhé!`);
      break;
    case 'speak':
      speak(msg.id, msg.first);
      break;
    case 'say':
      say(msg.ids, msg.first);
      break;
  }
};

// Cho bảng điều khiển / kiểm thử: window.__pond
window.__pond = { fishers, camera, renderer, scene, startPull, get spot() { return spot; }, get weather() { return weather; } };
