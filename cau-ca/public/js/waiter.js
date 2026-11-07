// Người phục vụ của quán nước: bưng trà đá, cà phê, mì, bánh mì ra tận chỗ từng người đang câu rồi quay về quán.
// Người ngồi trên ghe neo được xuồng bán hàng chèo ra. Chỉ để làm cảnh, không ảnh hưởng tới luật chơi.
// Toạ độ cục bộ: +z là hướng đang đi, gốc ở dưới chân.
import * as THREE from 'three';
import { mat, bake, boat } from './world.js';

const MENU = [
  { emoji: '🥤', tray: 'drink' }, // trà đá (trà sữa 🧋 không có trên Windows 10)
  { emoji: '☕', tray: 'drink' }, // cà phê đá
  { emoji: '🍜', tray: 'food' }, // mì gói
  { emoji: '🥖', tray: 'food' }, // bánh mì
];
const LOOKS = [
  { skin: '#f6caa4', shirt: '#e84f7a', pants: '#2b2421', hair: '#2b2121' },
  { skin: '#eab48a', shirt: '#f2e9d8', pants: '#3a4a5c', hair: '#1a1a1a' },
  { skin: '#ffe0c7', shirt: '#3f8fcb', pants: '#2b2421', hair: '#3b2a20' },
];
const SKIFF_LOOK = { skin: '#d79f72', shirt: '#6a4fb3', pants: '#2b2421', hair: '#1a1a1a', hat: true };

const FIRST_SERVE = [8, 25]; // ngồi xuống bao lâu thì được phục vụ lần đầu (giây)
const COOLDOWN = 45; // mỗi người được phục vụ lại sau ngần này giây
const TREAT_SECONDS = 20; // ly, tô đặt cạnh ghế bao lâu
const WALK_SPEED = 2.4;
const SKIFF_SPEED = 1;

const part = (geo, material, pos, rot) => {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  return m;
};
const sphere = (r) => new THREE.SphereGeometry(r, 12, 10);

// Ly và tô đặt trên khay và cạnh ghế.
const iceTea = mat('#b5651d', { rough: 0.25 });
const glassRim = mat('#f4f1e6', { rough: 0.3 });
const bowlMat = mat('#f7f4ea', { rough: 0.4 });
const noodle = mat('#f2cf63', { rough: 0.8 });
const glassGeo = new THREE.CylinderGeometry(0.075, 0.058, 0.2, 10);
const rimGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.03, 10);
const bowlGeo = new THREE.CylinderGeometry(0.17, 0.09, 0.12, 12);
const soupGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12);
const stickGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.36, 4);

function addGlass(group, x, y, z) {
  group.add(part(glassGeo, iceTea, [x, y + 0.1, z]));
  group.add(part(rimGeo, glassRim, [x, y + 0.2, z]));
}
function addBowl(group, x, y, z) {
  group.add(part(bowlGeo, bowlMat, [x, y + 0.06, z]));
  group.add(part(soupGeo, noodle, [x, y + 0.115, z]));
  group.add(part(stickGeo, mat('#7a4a1e'), [x + 0.03, y + 0.17, z], [0.2, 0, 1.3]));
}

// Nhân vật chibi đứng, cùng tỉ lệ với người câu, hai tay bưng khay trước ngực.
function figure({ skin, shirt, pants, hair, hat }) {
  const skinM = mat(skin, { rough: 0.7 });
  const shirtM = mat(shirt, { rough: 0.8 });
  const pantsM = mat(pants, { rough: 0.85 });
  const dark = mat('#1b1b1f', { rough: 0.3 });
  const root = new THREE.Group();
  const scaler = new THREE.Group();
  scaler.scale.setScalar(1.3);
  root.add(scaler);

  const upper = new THREE.Group();
  const hipY = 0.66;
  upper.add(part(sphere(0.24), pantsM, [0, hipY, 0]));
  upper.add(part(new THREE.CapsuleGeometry(0.25, 0.26, 6, 12), shirtM, [0, hipY + 0.27, 0]));
  const headY = hipY + 0.9;
  upper.add(part(new THREE.SphereGeometry(0.34, 18, 14), skinM, [0, headY, 0]));
  upper.add(part(new THREE.SphereGeometry(0.355, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(hair, { rough: 0.9 }), [0, headY + 0.02, -0.02], [-0.35, 0, 0]));
  for (const s of [-1, 1]) {
    upper.add(part(sphere(0.055), dark, [s * 0.12, headY + 0.01, 0.3]));
    upper.add(part(sphere(0.05), mat('#ffa3b1', { rough: 0.9 }), [s * 0.2, headY - 0.09, 0.26]));
    // tay co lại đỡ khay
    upper.add(part(new THREE.CapsuleGeometry(0.08, 0.34, 4, 8), shirtM, [s * 0.3, hipY + 0.32, 0.17], [1.15, 0, s * 0.1]));
    upper.add(part(sphere(0.085), skinM, [s * 0.27, hipY + 0.2, 0.42]));
  }
  upper.add(part(new THREE.TorusGeometry(0.05, 0.014, 6, 10, Math.PI), dark, [0, headY - 0.11, 0.325], [0, 0, Math.PI]));
  if (hat) {
    // nón lá: người trên xuồng đứng giữa sông nắng
    upper.add(part(new THREE.ConeGeometry(0.62, 0.38, 20, 1, true), mat('#f1d38a', { rough: 0.9, side: THREE.DoubleSide }), [0, headY + 0.43, 0]));
    upper.add(part(new THREE.CircleGeometry(0.6, 20), mat('#f1d38a', { rough: 0.9 }), [0, headY + 0.24, 0], [Math.PI / 2, 0, 0]));
  } else {
    // khăn rằn quấn đầu: không đội nón để nhìn từ trên cao vẫn thấy khay
    upper.add(part(new THREE.TorusGeometry(0.33, 0.055, 6, 18), mat('#a8322a', { rough: 0.9 }), [0, headY + 0.13, -0.02], [Math.PI / 2 - 0.2, 0, 0]));
    upper.add(part(new THREE.TorusGeometry(0.33, 0.02, 4, 18), mat('#f4efe2', { rough: 0.9 }), [0, headY + 0.13, -0.02], [Math.PI / 2 - 0.2, 0, 0]));
    upper.add(part(new THREE.ConeGeometry(0.07, 0.24, 5), mat('#a8322a', { rough: 0.9 }), [0.1, headY + 0.1, -0.38], [-2.2, 0, 0]));
  }
  // khay
  const trayY = hipY + 0.26;
  upper.add(part(new THREE.CylinderGeometry(0.42, 0.38, 0.05, 18), mat('#c0392b', { rough: 0.5 }), [0, trayY, 0.52]));
  bake(upper);
  scaler.add(upper);

  // hai loại đồ trên khay, bưng cái nào thì hiện cái đó
  const drink = new THREE.Group();
  addGlass(drink, -0.15, trayY + 0.03, 0.44);
  addGlass(drink, 0.15, trayY + 0.03, 0.44);
  addGlass(drink, 0, trayY + 0.03, 0.68);
  const food = new THREE.Group();
  addBowl(food, 0, trayY + 0.03, 0.52);
  for (const g of [drink, food]) {
    bake(g);
    g.visible = false;
    upper.add(g);
  }

  const legs = [-1, 1].map((s) => {
    const leg = new THREE.Group();
    leg.position.set(s * 0.13, hipY, 0);
    const shin = new THREE.CapsuleGeometry(0.095, 0.42, 4, 8).translate(0, -0.3, 0);
    leg.add(part(shin, pantsM, [0, 0, 0]));
    leg.add(part(sphere(0.1), mat('#3a2a20'), [0, -0.6, 0.05]));
    bake(leg);
    scaler.add(leg);
    return leg;
  });
  // bong bóng hình món đang bưng, để xem trên điện thoại vẫn biết người này đang mang gì
  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
  bubble.position.y = hat ? 2.95 : 2.75;
  bubble.scale.setScalar(1.25);
  bubble.renderOrder = 4;
  bubble.visible = false;
  root.add(bubble);
  return { root, upper, legs, trays: { drink, food }, bubble };
}

// Ảnh bong bóng của từng món: nền trắng tròn, emoji ở giữa.
const bubbleMaps = new Map();
function bubbleMap(emoji) {
  if (!bubbleMaps.has(emoji)) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#c0392b';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(64, 64, 56, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.font = '72px "Segoe UI Emoji", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#000000';
    g.fillText(emoji, 64, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    bubbleMaps.set(emoji, tex);
  }
  return bubbleMaps.get(emoji);
}

// Xuồng con có người bán hàng đứng trên, mũi xuồng hướng theo +z.
function skiff() {
  const f = figure(SKIFF_LOOK);
  const hull = boat(2, 0.8, '#7a4a1e');
  bake(hull);
  hull.rotation.y = -Math.PI / 2;
  const group = new THREE.Group();
  group.add(hull);
  f.root.position.set(0, 0.12, 0.1);
  group.add(f.root);
  f.root = group;
  f.legs = [];
  return f;
}

// fishers: Map người đang câu của main.js. onServe(fisher, item): gọi lúc đưa đồ tới tay.
export function createWaiters(scene, world, { fishers, onServe }) {
  const makeWaiter = (body, home, speed, isSkiff) => {
    body.root.position.copy(home);
    scene.add(body.root);
    return { ...body, home, speed, isSkiff, pos: body.root.position, phase: 'idle', wait: 2 + Math.random() * 3, path: [], seg: 0, yaw: Math.PI, yawTo: Math.PI, stride: Math.random() * 6, target: null, item: null };
  };
  const toVec = ([x, y, z]) => new THREE.Vector3(x, y, z);
  const staff = world.service.homes.map((h, i) => makeWaiter(figure(LOOKS[i % LOOKS.length]), toVec(h), WALK_SPEED, false));
  const boatSeat = world.seats.find((s) => s.kind === 'boat');
  if (boatSeat) staff.push(makeWaiter(skiff(), toVec(world.service.moor), SKIFF_SPEED, true));

  const nextServe = new WeakMap(); // Fisher -> thời điểm được phục vụ tiếp
  const treats = [];
  const treatMeshes = new Map();
  let clock = 0;

  function treatMesh(item) {
    if (!treatMeshes.has(item.tray)) {
      const g = new THREE.Group();
      if (item.tray === 'drink') addGlass(g, 0, 0, 0);
      else addBowl(g, 0, 0, 0);
      bake(g);
      treatMeshes.set(item.tray, g);
    }
    const out = treatMeshes.get(item.tray).clone();
    out.position.set(-0.42, 0.03, -0.02);
    out.traverse((o) => (o.castShadow = false));
    return out;
  }

  function pickTarget(w) {
    const taken = new Set(staff.map((other) => other.target?.f));
    const ready = [];
    for (const f of fishers.values()) {
      if (f.removed || taken.has(f) || f.state === 'fall' || f.state === 'leave') continue;
      if ((f.seat.kind === 'boat') !== w.isSkiff) continue;
      if (!nextServe.has(f)) nextServe.set(f, clock + FIRST_SERVE[0] + Math.random() * (FIRST_SERVE[1] - FIRST_SERVE[0]));
      if (clock >= nextServe.get(f)) ready.push(f);
    }
    return ready.length ? ready[Math.floor(Math.random() * ready.length)] : null;
  }

  function depart(w, f) {
    w.target = { f, key: f.player.key };
    w.item = MENU[Math.floor(Math.random() * MENU.length)];
    w.trays[w.item.tray].visible = true;
    w.bubble.material.map = bubbleMap(w.item.emoji);
    w.bubble.material.needsUpdate = true;
    w.bubble.visible = true;
    w.path = (w.isSkiff ? f.seat.route : [[w.home.x, f.seat.route[0][1], f.seat.route[0][2]], ...f.seat.route]).map(toVec);
    w.seg = 0;
    w.phase = 'go';
  }

  function goHome(w) {
    const walked = w.path.slice(0, w.seg).reverse();
    w.path = [...walked, w.home.clone()];
    w.seg = 0;
    w.phase = 'back';
    w.target = null;
    w.item = null;
    w.trays.drink.visible = w.trays.food.visible = false;
    w.bubble.visible = false;
  }

  function hand(w, f) {
    w.trays[w.item.tray].visible = false;
    w.bubble.visible = false;
    nextServe.set(f, clock + COOLDOWN + Math.random() * 20);
    if (f.state === 'idle') f.cheer();
    const treat = treatMesh(w.item);
    f.seat.group.add(treat);
    treats.push({ mesh: treat, seat: f.seat, until: clock + TREAT_SECONDS });
    onServe?.(f, w.item);
  }

  function move(w, dt) {
    let left = w.speed * dt;
    while (left > 0 && w.seg < w.path.length) {
      const to = w.path[w.seg];
      const d = w.pos.distanceTo(to);
      const dx = to.x - w.pos.x;
      const dz = to.z - w.pos.z;
      if (Math.hypot(dx, dz) > 0.02) w.yawTo = Math.atan2(dx, dz);
      if (d <= left) {
        w.pos.copy(to);
        left -= d;
        w.seg++;
      } else {
        w.pos.lerp(to, left / d);
        left = 0;
      }
    }
    return w.seg >= w.path.length;
  }

  return {
    staff,
    // camera, spot: đang quay cận thì ẩn người đứng ngay dưới máy, kẻo che hết khung hình.
    update(dt, camera, spot) {
      clock += dt;
      for (let i = treats.length - 1; i >= 0; i--) {
        if (clock < treats[i].until) continue;
        treats[i].seat.group.remove(treats[i].mesh);
        treats.splice(i, 1);
      }
      for (const w of staff) {
        const walking = w.phase === 'go' || w.phase === 'back';
        const f = w.target?.f;
        if (f && fishers.get(w.target.key) !== f) goHome(w);
        switch (w.phase) {
          case 'idle':
            if ((w.wait -= dt) <= 0) {
              const next = pickTarget(w);
              if (next) depart(w, next);
              else w.wait = 1;
            }
            break;
          case 'go':
            if (move(w, dt)) {
              w.phase = 'serve';
              w.wait = 2.4;
              w.handed = false;
              w.patience = 8;
            }
            break;
          case 'serve': {
            const seat = w.target.f.seat;
            w.yawTo = Math.atan2(seat.pos.x - w.pos.x, seat.pos.z - w.pos.z);
            // đang giật cá thì đứng chờ, không đưa đồ giữa chừng
            const busy = w.target.f.state === 'struggle' && (w.patience -= dt) > 0;
            if (!busy) w.wait -= dt;
            if (!w.handed && w.wait <= 1.4) {
              w.handed = true;
              hand(w, w.target.f);
            }
            if (w.wait <= 0) goHome(w);
            break;
          }
          case 'back':
            if (move(w, dt)) {
              w.phase = 'idle';
              w.wait = 1 + Math.random() * 4;
              w.yawTo = Math.PI;
            }
            break;
        }
        // quay người mượt, chân bước, người nhún theo nhịp
        let turn = w.yawTo - w.yaw;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        w.yaw += turn * (1 - Math.exp(-9 * dt));
        w.root.rotation.y = w.yaw;
        if (walking) w.stride += dt * w.speed * 4.2;
        const swing = walking ? Math.sin(w.stride) * 0.6 : 0;
        w.legs.forEach((leg, k) => (leg.rotation.x += ((k ? swing : -swing) - leg.rotation.x) * 0.35));
        w.upper.position.y = walking && !w.isSkiff ? Math.abs(Math.sin(w.stride)) * 0.035 : 0;
        if (w.isSkiff) w.root.rotation.z = Math.sin(clock * 1.6) * 0.02;
        w.root.visible = !(spot && Math.hypot(w.pos.x - camera.x, w.pos.z - camera.z) < 2.6);
      }
    },
  };
}
