// Bản đồ 3D 63 tỉnh, dựng bằng three.js từ /map/vietnam.json (scripts/build-map.mjs).
// Mọi tỉnh cùng một màu đất. Tỉnh càng nhiều điểm thì khối đất của tỉnh càng nhô cao. Camera nhìn chéo từ phía Nam
// để thấy rõ độ cao. Trên bản đồ không ghi số cho gọn, chỉ có vương miện (thẻ HTML) trên đỉnh tỉnh dẫn đầu.
// Chỉ vẽ lại khi có gì thay đổi (điểm, camera, hiệu ứng), lúc đứng yên không tốn GPU.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const W = 1080;
const H = 1920;
export const LAND = '#5fcf8f';
const WALL = '#3a9a68';
const GOLD = '#ffd54a';
const GLOW = '#fff3c4';

// Độ cao khối đất (đơn vị bản đồ): lúc chưa có điểm, phần cao thêm của tỉnh dẫn đầu, phần nhô thêm khi được focus.
const BASE_H = 5;
const MAX_H = 210;
const FOCUS_LIFT = 30;
// Lúc focus, các tỉnh khác tạm thấp xuống còn ngần này phần độ cao, để không khối nào che tỉnh đang được rọi.
const SINK = 0.3;

// Camera: góc nghiêng (độ, tính từ phương thẳng đứng) lúc nhìn toàn cảnh và lúc focus một tỉnh.
const FOV = 30;
const TILT = 40;
const FOCUS_TILT = 52;
const FLY_MS = 1200;
// Mặt trên của tỉnh được focus nằm ở chỗ trống giữa ô "Cách chơi" và bảng xếp hạng, zoom tới khi to cỡ FIT_PX.
const FOCAL = { x: 490, y: 820 };
// Dời bản đồ lên sát mép trên: mép Bắc đất liền lên LIFT_N px, mép Nam lên LIFT_S px so với khung bản đồ phẳng
// (MAP trong scripts/build-map.mjs). Mép Bắc lên nhiều hơn nên bản đồ cũng cao thêm một chút.
const LIFT_N = 110;
const LIFT_S = 70;
const FIT_PX = 330;
const MIN_ZOOM = 1.5;
// Vương miện, chữ và quà bay to nhỏ theo khoảng cách tới camera, trong giới hạn này.
const MARK_SCALE = [0.8, 1.45];

const rad = THREE.MathUtils.degToRad;
const { clamp, lerp } = THREE.MathUtils;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
// Tiêu cự tính theo px: vật cách camera FOCAL_PX đơn vị thì 1 đơn vị bản đồ hiện thành 1 px.
const FOCAL_PX = H / 2 / Math.tan(rad(FOV / 2));

// Hai quần đảo đặt vào khung biển bên phải, theo vị trí trên màn hình lúc nhìn toàn cảnh:
// Hoàng Sa gần đúng vị trí thật, Trường Sa thu nhỏ vào ô riêng.
const PLACE = {
  // Tọa độ màn hình: khi dời bản đồ lên (LIFT_N, LIFT_S) thì dời hai ô này lên theo, khoảng 90px ở vĩ độ của chúng.
  'hoang-sa': { shift: [-46, -56], scale: 1, label: 'below' },
  'truong-sa': { center: [962, 1500], scale: 0.48, label: 'above' },
};

const SEA_LABELS = [
  { text: 'BIỂN ĐÔNG', at: [108.4, 9.6], font: 'italic 700 40px', spacing: 12, color: 'rgba(175, 212, 255, .3)' },
  { text: 'Vịnh Bắc Bộ', at: [107.25, 19.35], font: 'italic 500 24px', spacing: 2, color: 'rgba(175, 212, 255, .4)' },
  { text: 'Vịnh Thái Lan', at: [103.1, 9.0], font: 'italic 500 24px', spacing: 2, color: 'rgba(175, 212, 255, .4)' },
];
const FONT = '"Be Vietnam Pro", "Segoe UI", sans-serif';

// "M1 2L3 4L5 6Z M..." -> [[[1, 2], [3, 4], [5, 6]], ...]
function ringsOf(d) {
  return d
    .split('M')
    .filter((part) => part.trim())
    .map((part) => {
      const ring = part.replace(/Z/g, '').trim().split('L').map((pt) => pt.trim().split(/[\s,]+/).map(Number));
      const [first, end] = [ring[0], ring.at(-1)];
      if (ring.length > 1 && first[0] === end[0] && first[1] === end[1]) ring.pop();
      return ring;
    });
}

export async function loadMap() {
  const res = await fetch('/map/vietnam.json');
  if (!res.ok) throw new Error(`Không tải được bản đồ (${res.status})`);
  return res.json();
}

// meta: Map id -> { name, short, plate }. crown: thẻ vương miện đặt trên đỉnh tỉnh dẫn đầu.
export function buildMap({ canvas, crown, data, meta, maxZoom = 4 }) {
  const pj = data.projection;
  const lonLat = (lon, lat) => [pj.left + (rad(lon) - pj.minX) * pj.k, pj.top + (pj.maxY - Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2))) * pj.k];

  // ---------- Hệ tọa độ ----------
  // Bản đồ phẳng dùng px, trục y hướng xuống. Thế giới 3D: trục y hướng Bắc, trục z hướng lên.
  // Lúc nhìn toàn cảnh, camera nhìn vào gốc tọa độ, cách FOCAL_PX: ở giữa màn hình 1 đơn vị = 1 px như bản đồ cũ.
  // Kéo dãn theo chiều Bắc-Nam (stretch) và chọn hàng giữa (CY) để mép Bắc, mép Nam của đất liền vẫn nằm đúng chỗ cũ
  // trên màn hình, nên nhìn nghiêng mà bản đồ không bị lùn đi và không đè lên bảng xếp hạng.
  const north = Math.min(...data.provinces.map((p) => p.bbox[1]));
  const south = Math.max(...data.provinces.map((p) => p.bbox[3]));
  const tilt = rad(TILT);
  // Điểm trên mặt đất cách tâm bao nhiêu đơn vị (theo chiều Bắc-Nam) thì hiện lệch `px` px so với giữa màn hình.
  const groundOffset = (px) => px / (Math.cos(tilt) - (px * Math.sin(tilt)) / FOCAL_PX);
  const reachNorth = groundOffset(H / 2 - (north + 24 - LIFT_N));
  const reachSouth = groundOffset(H / 2 - (south - LIFT_S));
  const stretch = (reachNorth - reachSouth) / (south - north);
  const CX = W / 2;
  const CY = north + reachNorth / stretch;
  const wx = (x) => x - CX;
  const wy = (y) => stretch * (CY - y);

  // ---------- Khung cảnh ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();

  scene.add(new THREE.HemisphereLight('#e6f3ff', '#1d3550', 1.5));
  // Nắng chiếu từ phía Đông Nam: mặt trước các khối đất sáng, bóng đổ về phía Tây Bắc.
  const sun = new THREE.DirectionalLight('#fff4e0', 2.6);
  sun.position.set(700, -1100, 1700);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -900, right: 900, top: 1300, bottom: -1300, near: 100, far: 5000 });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);

  // Mặt biển trong suốt (nền biển là màu của trang), chỉ hiện bóng đổ.
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.ShadowMaterial({ color: '#01060f', opacity: 0.45, depthWrite: false }));
  sea.receiveShadow = true;
  sea.renderOrder = 1;
  scene.add(sea);

  // ---------- Camera ----------
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 50, 30000);
  // Camera phụ để tính vị trí trên màn hình theo góc nhìn camera đang bay tới.
  const probe = camera.clone();
  for (const cam of [camera, probe]) cam.up.set(0, 0, 1);
  const HOME = { x: 0, y: 0, z: 0, dist: FOCAL_PX, tilt: TILT, ox: 0, oy: 0 };
  let fly = { from: HOME, to: HOME, start: -Infinity };

  function aim(cam, v) {
    const t = rad(v.tilt);
    cam.position.set(v.x, v.y - v.dist * Math.sin(t), v.z + v.dist * Math.cos(t));
    cam.lookAt(v.x, v.y, v.z);
    // Lệch khung hình để điểm camera nhìn vào hiện ở chỗ mong muốn trên màn hình, không phải chính giữa.
    cam.setViewOffset(W, H, v.ox, v.oy, W, H);
    cam.updateMatrixWorld();
  }

  function viewAt(now) {
    const { from: a } = fly;
    const b = followed(fly.to, (item) => item.h);
    const e = ease(clamp((now - fly.start) / FLY_MS, 0, 1));
    return {
      x: lerp(a.x, b.x, e),
      y: lerp(a.y, b.y, e),
      z: lerp(a.z, b.z, e),
      dist: a.dist * (b.dist / a.dist) ** e,
      tilt: lerp(a.tilt, b.tilt, e),
      ox: lerp(a.ox, b.ox, e),
      oy: lerp(a.oy, b.oy, e),
    };
  }

  aim(camera, HOME);

  // ---------- Các tỉnh ----------
  const capColor = new THREE.Color(LAND);
  const wallColor = new THREE.Color(WALL);
  const glowColor = new THREE.Color(GLOW);
  // Ranh giới: đường trắng trên mặt mỗi khối đất. Tỉnh dẫn đầu viền vàng, tỉnh đang được focus viền trắng đậm.
  const lineMat = new LineMaterial({ color: '#ffffff', linewidth: 2.2, transparent: true, opacity: 0.85, depthWrite: false });
  const focusMat = new LineMaterial({ color: '#ffffff', linewidth: 4.5, transparent: true, depthWrite: false });
  const goldMat = new LineMaterial({ color: GOLD, linewidth: 5, transparent: true, depthWrite: false });

  const items = new Map();
  for (const p of data.provinces) {
    const rings = ringsOf(p.d);
    const shapes = rings.map((ring) => new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(wx(x), wy(y)))));
    // Khối cao 1 đơn vị, kéo theo trục z thành độ cao thật. Nhóm 0 là mặt trên/dưới, nhóm 1 là vách.
    // Tô màu theo từng đỉnh (mặt trên màu đất, vách tối hơn) để cả khối chỉ tốn một lần vẽ.
    const geometry = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false });
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (const group of geometry.groups) {
      const { r, g, b } = group.materialIndex === 0 ? capColor : wallColor;
      for (let i = group.start; i < group.start + group.count; i++) colors.set([r, g, b], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.clearGroups();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.87, metalness: 0, emissive: glowColor, emissiveIntensity: 0 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.scale.z = BASE_H;
    scene.add(mesh);

    const segments = [];
    for (const ring of rings) {
      ring.forEach(([x, y], i) => {
        const [x2, y2] = ring[(i + 1) % ring.length];
        segments.push(wx(x), wy(y), 0, wx(x2), wy(y2), 0);
      });
    }
    const border = new LineSegments2(new LineSegmentsGeometry().setPositions(segments), lineMat);
    border.renderOrder = 2;
    scene.add(border);

    items.set(p.id, {
      id: p.id,
      mesh,
      material,
      border,
      bbox: p.bbox,
      // Bán kính chỗ trống quanh tâm tỉnh (px): hiệu ứng như tên người xem đặt cách tâm một khoảng theo cỡ này.
      size: Math.round(Math.max(26, Math.min(34, p.room * 2 + 3))),
      x: wx(p.label[0]),
      y: wy(p.label[1]),
      h: BASE_H,
      goal: BASE_H,
      dim: 1,
      flash: 0,
      flashFor: 1,
      big: false,
    });
  }

  let focused = null;
  let leader = null;
  // Có gì thay đổi cần vẽ lại ở khung hình tới.
  let dirty = true;
  // Độ cao tỉnh đang hướng tới: lúc focus, tỉnh được rọi nhô thêm, các tỉnh khác thấp xuống.
  const heightGoal = (item) => {
    if (!focused) return item.goal;
    return item.id === focused ? item.goal + FOCUS_LIFT : BASE_H + (item.goal - BASE_H) * SINK;
  };
  // Góc nhìn focus bám theo độ cao tỉnh (điểm mới tới thì khối đất cao thêm, camera nâng theo cho mặt trên vẫn ở giữa).
  // height(item): độ cao đang hiện (camera thật) hoặc độ cao sắp tới (tính chỗ cho hiệu ứng).
  const followed = (view, height) => (view.follow ? { ...view, z: height(items.get(view.follow)) } : view);

  function styleBorder(item) {
    const special = item.id === leader || item.id === focused;
    item.border.material = item.id === leader ? goldMat : item.id === focused ? focusMat : lineMat;
    item.border.renderOrder = special ? 3 : 2;
  }

  // ---------- Mặt biển: lưới kinh vĩ tuyến, tên biển, Hoàng Sa, Trường Sa ----------
  // Hình vẽ phẳng nằm trên mặt biển. rect là khung theo tọa độ bản đồ, scale là số px ảnh cho mỗi đơn vị bản đồ.
  function decal(rect, scale, draw) {
    const [x0, y0, x1, y1] = rect;
    const image = document.createElement('canvas');
    image.width = Math.ceil((x1 - x0) * scale);
    image.height = Math.ceil((y1 - y0) * scale);
    const ctx = image.getContext('2d');
    ctx.scale(scale, scale);
    ctx.translate(-x0, -y0);
    draw(ctx);
    const texture = new THREE.CanvasTexture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(x1 - x0, (y1 - y0) * stretch),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    plane.position.set(wx((x0 + x1) / 2), wy((y0 + y1) / 2), 0.3);
    scene.add(plane);
  }

  // Điểm trên mặt biển hiện ở vị trí (sx, sy) màn hình lúc nhìn toàn cảnh; k là số px cho mỗi đơn vị bản đồ ở đó.
  const ray = new THREE.Raycaster();
  const seaLevel = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  function groundAt(sx, sy) {
    aim(probe, HOME);
    ray.setFromCamera(new THREE.Vector2((sx / W) * 2 - 1, 1 - (sy / H) * 2), probe);
    const hit = ray.ray.intersectPlane(seaLevel, new THREE.Vector3());
    const depth = -hit.clone().applyMatrix4(probe.matrixWorldInverse).z;
    return { x: hit.x + CX, y: CY - hit.y / stretch, k: FOCAL_PX / depth };
  }

  // Hình phẳng vẽ theo px màn hình (area là khung trên màn hình lúc nhìn toàn cảnh), đặt xuống mặt biển đúng chỗ đó.
  function onSea(area, draw) {
    const cx = (area[0] + area[2]) / 2;
    const cy = (area[1] + area[3]) / 2;
    const at = groundAt(cx, cy);
    const halfW = (area[2] - area[0]) / at.k / 2;
    const halfH = (area[3] - area[1]) / at.k / 2;
    decal([at.x - halfW, at.y - halfH, at.x + halfW, at.y + halfH], 2 * at.k, (ctx) => {
      ctx.translate(at.x, at.y);
      ctx.scale(1 / at.k, 1 / at.k);
      ctx.translate(-cx, -cy);
      draw(ctx);
    });
  }

  function buildSea() {
    // Lưới mờ: nhìn nghiêng thấy các đường chụm dần về phía xa, rõ cảm giác 3D.
    const grid = [];
    const [, yFar] = lonLat(100, 38);
    const [, yNear] = lonLat(100, -6);
    const [xWest] = lonLat(88, 0);
    const [xEast] = lonLat(130, 0);
    for (let lon = 88; lon <= 130; lon += 2) {
      const [x] = lonLat(lon, 0);
      grid.push(wx(x), wy(yFar), 0.2, wx(x), wy(yNear), 0.2);
    }
    for (let lat = -6; lat <= 38; lat += 2) {
      const [, y] = lonLat(100, lat);
      grid.push(wx(xWest), wy(y), 0.2, wx(xEast), wy(y), 0.2);
    }
    const lines = new LineSegments2(
      new LineSegmentsGeometry().setPositions(grid),
      new LineMaterial({ color: '#a0cdff', linewidth: 1.5, transparent: true, opacity: 0.1, depthWrite: false }),
    );
    scene.add(lines);

    // Tên biển, Hoàng Sa, Trường Sa: bố cục tính theo màn hình như bản đồ phẳng cũ (tọa độ bản đồ cũ chính là px
    // màn hình), rồi đặt xuống mặt biển đúng chỗ đó. Nhìn nghiêng vẫn nằm gọn trong khung, không bị cắt ở mép.
    const measure = document.createElement('canvas').getContext('2d');
    for (const label of SEA_LABELS) {
      const [x, y] = lonLat(...label.at);
      const font = `${label.font} ${FONT}`;
      const px = Number(label.font.match(/(\d+)px/)[1]);
      Object.assign(measure, { font, letterSpacing: `${label.spacing}px` });
      const half = measure.measureText(label.text).width / 2 + 12;
      onSea([x - half, y - px * 1.1, x + half, y + px * 0.5], (ctx) => {
        Object.assign(ctx, { font, letterSpacing: `${label.spacing}px`, fillStyle: label.color, textAlign: 'center' });
        ctx.fillText(label.text, x, y);
      });
    }

    // Hoàng Sa, Trường Sa: khung nét đứt, chấm đảo, tên quần đảo và tỉnh quản lý.
    for (const a of data.archipelagos) {
      const place = PLACE[a.id];
      const [x0, y0, x1, y1] = a.bbox;
      const move = place.center
        ? ([x, y]) => [place.center[0] + (x - (x0 + x1) / 2) * place.scale, place.center[1] + (y - (y0 + y1) / 2) * place.scale]
        : ([x, y]) => [x + place.shift[0], y + place.shift[1]];
      const dots = a.dots.map(([x, y, r]) => [...move([x, y]), r]);
      const xs = dots.map((dot) => dot[0]);
      const ys = dots.map((dot) => dot[1]);
      const box = [Math.min(...xs) - 16, Math.min(...ys) - 14, Math.max(...xs) + 16, Math.max(...ys) + 14];
      const midX = (box[0] + box[2]) / 2;
      const below = place.label === 'below';
      const nameY = below ? box[3] + 26 : box[1] - 30;
      const ownerY = below ? box[3] + 48 : box[1] - 9;
      const name = `QĐ. ${a.name.toUpperCase()}`;
      const owner = `(${meta.get(a.province).name})`;
      measure.letterSpacing = '1px';
      measure.font = `700 21px ${FONT}`;
      const half = Math.max(measure.measureText(name).width, 120) / 2 + 10;
      const area = [Math.min(box[0], midX - half), Math.min(box[1], nameY - 24) - 6, Math.max(box[2], midX + half), Math.max(box[3], ownerY + 8) + 6];
      onSea(area, (ctx) => {
        ctx.beginPath();
        ctx.roundRect(box[0], box[1], box[2] - box[0], box[3] - box[1], 14);
        Object.assign(ctx, { fillStyle: 'rgba(4, 18, 36, .35)', strokeStyle: 'rgba(200, 228, 255, .45)', lineWidth: 2 });
        ctx.setLineDash([7, 6]);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        for (const [x, y, r] of dots) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          Object.assign(ctx, { fillStyle: LAND, strokeStyle: '#ffffff', lineWidth: 1.2 });
          ctx.fill();
          ctx.stroke();
        }
        Object.assign(ctx, { textAlign: 'center', lineJoin: 'round', strokeStyle: 'rgba(4, 16, 31, .7)', lineWidth: 4 });
        for (const [text, y, font, color, spacing] of [
          [name, nameY, `700 21px ${FONT}`, '#eaf4ff', '1px'],
          [owner, ownerY, `500 18px ${FONT}`, '#a9bdd6', '0px'],
        ]) {
          Object.assign(ctx, { font, fillStyle: color, letterSpacing: spacing });
          ctx.strokeText(text, midX, y);
          ctx.fillText(text, midX, y);
        }
      });
    }
    dirty = true;
  }

  // ---------- Vẽ ----------
  let last = performance.now();
  let shadowStale = true;
  const tmp = new THREE.Vector3();

  // Vị trí trên màn hình (px của khung 1080x1920) và số px cho mỗi đơn vị bản đồ ở đó.
  function screenOf(cam, x, y, z) {
    tmp.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
    const k = FOCAL_PX / Math.max(1, -tmp.z);
    tmp.set(x, y, z).project(cam);
    return { x: ((tmp.x + 1) / 2) * W, y: ((1 - tmp.y) / 2) * H, k };
  }

  const approach = (value, goal, rate, dt, epsilon) => (Math.abs(goal - value) < epsilon ? goal : value + (goal - value) * (1 - Math.exp(-rate * dt)));

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    let busy = dirty || focused !== null || now - fly.start < FLY_MS + 50;
    for (const item of items.values()) {
      const h = approach(item.h, heightGoal(item), 3.5, dt, 0.05);
      const dim = approach(item.dim, focused && item.id !== focused ? 0.55 : 1, 5, dt, 0.003);
      const flash = Math.max(0, item.flash - dt / item.flashFor);
      if (h !== item.h) shadowStale = true;
      if (h !== item.h || dim !== item.dim || flash !== item.flash) busy = true;
      Object.assign(item, { h, dim, flash });
    }
    if (!busy) return;
    dirty = false;

    aim(camera, viewAt(now));
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    for (const item of items.values()) {
      item.mesh.scale.z = item.h;
      item.border.position.z = item.h + 0.6;
      item.material.color.setScalar(item.dim);
      item.material.emissiveIntensity = Math.max(item.flash * (item.big ? 0.9 : 0.6), item.id === focused ? 0.15 + 0.2 * pulse : 0);
    }
    // Bóng đổ chỉ phụ thuộc độ cao các khối, camera bay hay tỉnh nhấp nháy thì không cần tính lại.
    renderer.shadowMap.needsUpdate = shadowStale;
    shadowStale = false;
    renderer.render(scene, camera);
    // Vương miện lơ lửng trên đỉnh tỉnh dẫn đầu, đi theo camera và độ cao của tỉnh.
    const top = leader && items.get(leader);
    crown.hidden = !top;
    if (top) {
      const at = screenOf(camera, top.x, top.y, top.h);
      crown.style.translate = `${at.x.toFixed(1)}px ${at.y.toFixed(1)}px`;
      crown.style.scale = clamp(at.k, ...MARK_SCALE).toFixed(3);
    }
  }
  requestAnimationFrame(frame);

  // Font phải có sẵn trước khi viết chữ lên mặt biển.
  Promise.all([`700 21px ${FONT}`, `500 18px ${FONT}`, `italic 700 40px ${FONT}`, `italic 500 24px ${FONT}`].map((font) => document.fonts.load(font)))
    .catch(() => {})
    .then(buildSea);

  function flyTo(view) {
    const now = performance.now();
    fly = { from: viewAt(now), to: view, start: now };
    dirty = true;
  }

  // Camera nhìn vào giữa mặt trên của tỉnh, nghiêng hơn lúc toàn cảnh để thấy rõ khối đất nhô lên.
  function focusView(item) {
    const [x0, y0, x1, y1] = item.bbox;
    const wide = x1 - x0;
    const deep = (y1 - y0) * stretch * Math.cos(rad(FOCUS_TILT));
    const zoom = clamp(FIT_PX / Math.max(wide, deep, 1), MIN_ZOOM, Math.max(MIN_ZOOM, maxZoom));
    return { x: item.x, y: item.y, z: 0, follow: item.id, dist: FOCAL_PX / zoom, tilt: FOCUS_TILT, ox: W / 2 - FOCAL.x, oy: H / 2 - FOCAL.y };
  }

  return {
    // heat 0..1: điểm của tỉnh so với tỉnh dẫn đầu (đã lấy căn), tỉnh dẫn đầu là 1 và cao nhất.
    setHeat(id, heat) {
      const item = items.get(id);
      const goal = BASE_H + heat * MAX_H;
      if (goal !== item.goal) {
        item.goal = goal;
        dirty = true;
      }
    },
    setLeader(id) {
      if (id === leader) return;
      const previous = leader;
      leader = id;
      if (previous) styleBorder(items.get(previous));
      if (id) styleBorder(items.get(id));
      dirty = true;
    },
    flash(id, big = false) {
      if (document.hidden) return;
      Object.assign(items.get(id), { flash: 1, flashFor: big ? 1.6 : 0.8, big });
      dirty = true;
    },
    // Vị trí tỉnh trên màn hình theo góc nhìn camera đang bay tới, để hiệu ứng (quà bay, chữ +điểm) rơi đúng chỗ.
    point(id) {
      const item = items.get(id);
      aim(probe, followed(fly.to, heightGoal));
      const at = screenOf(probe, item.x, item.y, heightGoal(item));
      return { x: at.x, y: at.y, size: item.size * clamp(at.k, ...MARK_SCALE) };
    },
    // Camera bay tới tỉnh: tỉnh đó nhô thêm, sáng lên, các tỉnh khác tối đi.
    focus(id) {
      if (id === focused) return;
      const previous = focused;
      focused = id;
      if (previous) styleBorder(items.get(previous));
      const item = items.get(id);
      styleBorder(item);
      flyTo(focusView(item));
    },
    unfocus() {
      if (!focused) return;
      const item = items.get(focused);
      focused = null;
      styleBorder(item);
      flyTo(HOME);
    },
  };
}
