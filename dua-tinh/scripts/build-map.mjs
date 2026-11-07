// Dựng public/map/vietnam.json từ ranh giới 63 tỉnh của geoBoundaries (Public Domain, bản ghim theo commit).
// Chạy lại khi muốn đổi khung bản đồ: npm run map. Trang game chỉ đọc file kết quả, không cần mạng.
//
// - Chiếu Mercator rồi đặt đất liền vừa khung MAP (tọa độ màn hình 1080x1920).
// - Đơn giản hóa từng cạnh chung của TopoJSON một lần, nên hai tỉnh kề nhau luôn khít, không hở không chồng.
// - Số biển số đặt ở điểm xa mép nhất của phần đất lớn nhất (polylabel), kèm bán kính trống quanh điểm đó.
// - Tô màu: tỉnh kề nhau không bao giờ trùng màu.
// - Hoàng Sa (Đà Nẵng) và Trường Sa (Khánh Hòa) xuất riêng thành các chấm đảo, trang game tự đặt vào khung biển.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PROVINCES, strip } from '../src/provinces.js';

const SOURCE = 'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/VNM/ADM1/geoBoundaries-VNM-ADM1.topojson';
const root = path.resolve(import.meta.dirname, '..');
const cacheFile = path.join(root, 'scripts', '.cache', 'geoBoundaries-VNM-ADM1.topojson');
const outFile = path.join(root, 'public', 'map', 'vietnam.json');

const MAP = { left: 12, top: 196, right: 830, bottom: 1786 };
const TOLERANCE = 0.45; // px
const COLORS = 7;
const OFFSHORE_LON = 110.5;
const ARCHIPELAGOS = { 'da-nang': { id: 'hoang-sa', name: 'Hoàng Sa' }, 'khanh-hoa': { id: 'truong-sa', name: 'Trường Sa' } };

// Vị trí gần đúng các đảo, bãi chính của hai quần đảo (kinh độ, vĩ độ, cỡ chấm), để vẽ cụm chấm dễ nhìn.
const ISLANDS = {
  'hoang-sa': [
    [112.33, 16.83, 3.2], [112.27, 16.98, 2], [112.3, 16.96, 1.6], [112.34, 16.95, 1.6], [112.35, 16.93, 1.6], [112.21, 16.95, 1.6],
    [112.73, 16.67, 2.6], [112.6, 16.33, 1.6], [112.5, 16.03, 1.8], [111.6, 16.53, 2.8], [111.58, 16.46, 2], [111.73, 16.47, 2],
    [111.71, 16.44, 1.8], [111.75, 16.05, 1.6], [111.2, 15.78, 2.2], [112.65, 16.55, 1.4],
  ],
  'truong-sa': [
    [114.33, 11.43, 2.8], [114.3, 11.45, 2], [114.28, 11.05, 2], [114.42, 10.67, 1.8], [114.36, 10.38, 2.4], [114.48, 10.38, 2.2],
    [114.36, 10.18, 2.6], [114.33, 9.88, 2.6], [114.66, 8.86, 2], [113.69, 8.97, 2], [113.3, 8.1, 1.8], [112.92, 7.87, 2.2],
    [112.6, 8.84, 1.8], [112.2, 8.85, 1.8], [111.92, 8.64, 3], [111.67, 8.67, 1.8], [115.5, 9.9, 1.6], [114.9, 10.5, 1.6],
    [113.9, 10.0, 1.6], [113.0, 9.5, 1.4],
  ],
};

// ---------- Nguồn ----------
async function loadTopology() {
  if (!existsSync(cacheFile)) {
    console.log(`Tải ranh giới tỉnh từ geoBoundaries...`);
    const res = await fetch(SOURCE, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Tải dữ liệu lỗi HTTP ${res.status}`);
    mkdirSync(path.dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(readFileSync(cacheFile, 'utf8'));
}

const key = (name) => strip(String(name).toLowerCase()).replace(/[^a-z]/g, '');
const provinceOf = new Map();
for (const p of PROVINCES) for (const name of p.geo ?? [p.name]) provinceOf.set(key(name), p.id);

const merc = ([lon, lat]) => [(lon * Math.PI) / 180, Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];

function decodeArcs(topology) {
  const [sx, sy] = topology.transform.scale;
  const [tx, ty] = topology.transform.translate;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * sx + tx, y * sy + ty];
    });
  });
}

// ---------- Hình học ----------
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
}

function ringCentroid(ring) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const k = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += k;
    cx += (ring[j][0] + ring[i][0]) * k;
    cy += (ring[j][1] + ring[i][1]) * k;
  }
  return a ? [cx / (3 * a), cy / (3 * a)] : ring[0];
}

function segDist2(p, a, b) {
  let [x, y] = a;
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx || dy) {
    const t = Math.max(0, Math.min(1, ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy)));
    x += dx * t;
    y += dy * t;
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [first, last] = stack.pop();
    let max = 0;
    let index = 0;
    for (let i = first + 1; i < last; i++) {
      const d = segDist2(points[i], points[first], points[last]);
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (max > tol2) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// Cạnh khép kín (đảo): cắt ở điểm xa điểm đầu nhất rồi giản lược hai nửa.
function simplifyArc(points, tolerance) {
  const [x0, y0] = points[0];
  const [xn, yn] = points.at(-1);
  if (x0 !== xn || y0 !== yn) return douglasPeucker(points, tolerance);
  let far = 0;
  let best = -1;
  points.forEach(([x, y], i) => {
    const d = (x - x0) ** 2 + (y - y0) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  });
  const a = douglasPeucker(points.slice(0, far + 1), tolerance);
  const b = douglasPeucker(points.slice(far), tolerance);
  return [...a, ...b.slice(1)];
}

function pointToRingsDistance(x, y, rings) {
  let inside = false;
  let min = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
      min = Math.min(min, segDist2([x, y], a, b));
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(min);
}

// Điểm trong vùng xa mép nhất (thuật toán polylabel của Mapbox, bản rút gọn).
function polylabel(rings, precision = 0.5) {
  const outer = rings[0];
  const xs = outer.map((p) => p[0]);
  const ys = outer.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX;
  const height = Math.max(...ys) - minY;
  const size = Math.min(width, height);
  const cell = (x, y, h) => {
    const d = pointToRingsDistance(x, y, rings);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };
  const queue = [];
  for (let x = minX; x < minX + width; x += size) for (let y = minY; y < minY + height; y += size) queue.push(cell(x + size / 2, y + size / 2, size / 2));
  const [cx, cy] = ringCentroid(outer);
  let best = cell(cx, cy, 0);
  const box = cell(minX + width / 2, minY + height / 2, 0);
  if (box.d > best.d) best = box;
  while (queue.length) {
    queue.sort((a, b) => a.max - b.max);
    const c = queue.pop();
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    const h = c.h / 2;
    queue.push(cell(c.x - h, c.y - h, h), cell(c.x + h, c.y - h, h), cell(c.x - h, c.y + h, h), cell(c.x + h, c.y + h, h));
  }
  return { x: best.x, y: best.y, r: best.d };
}

const num = (v) => {
  const s = v.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
};
const pathOf = (rings) => rings.map((ring) => `M${ring.map(([x, y]) => `${num(x)} ${num(y)}`).join('L')}Z`).join('');
const lineOf = (lines) => lines.map((line) => `M${line.map(([x, y]) => `${num(x)} ${num(y)}`).join('L')}`).join('');

// ---------- Dựng ----------
const topology = await loadTopology();
const object = Object.values(topology.objects)[0];
const lonlatArcs = decodeArcs(topology);

// Gom các vùng của dữ liệu về 63 tỉnh (Côn Đảo nằm riêng trong dữ liệu, gộp về Bà Rịa - Vũng Tàu).
const features = new Map(PROVINCES.map((p) => [p.id, { id: p.id, polygons: [], offshore: [] }]));
for (const geometry of object.geometries) {
  const id = provinceOf.get(key(geometry.properties.shapeName));
  if (!id) throw new Error(`Không biết vùng "${geometry.properties.shapeName}" thuộc tỉnh nào`);
  const polygons = geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs;
  for (const polygon of polygons) {
    const outer = polygon[0].flatMap((a) => lonlatArcs[a < 0 ? ~a : a]);
    const [lon] = ringCentroid(outer);
    features.get(id)[ARCHIPELAGOS[id] && lon > OFFSHORE_LON ? 'offshore' : 'polygons'].push(polygon);
  }
}
for (const [id, f] of features) if (!f.polygons.length) throw new Error(`Thiếu ranh giới của ${id}`);

// Khung đất liền theo Mercator, đặt sát trái và giữa theo chiều dọc của khung MAP.
const used = new Set();
for (const f of features.values()) for (const polygon of f.polygons) for (const ring of polygon) for (const a of ring) used.add(a < 0 ? ~a : a);
let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
for (const a of used) {
  for (const point of lonlatArcs[a]) {
    const [x, y] = merc(point);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
}
const k = Math.min((MAP.right - MAP.left) / (maxX - minX), (MAP.bottom - MAP.top) / (maxY - minY));
const offsetY = MAP.top + (MAP.bottom - MAP.top - (maxY - minY) * k) / 2;
const project = (point) => {
  const [x, y] = merc(point);
  return [MAP.left + (x - minX) * k, offsetY + (maxY - y) * k];
};

const arcs = lonlatArcs.map((arc) => simplifyArc(arc.map(project), TOLERANCE));
const ringOf = (indices) => {
  const out = [];
  for (const a of indices) {
    const points = a < 0 ? [...arcs[~a]].reverse() : arcs[a];
    out.push(...(out.length ? points.slice(1) : points));
  }
  if (out.length > 1 && out[0][0] === out.at(-1)[0] && out[0][1] === out.at(-1)[1]) out.pop();
  return out;
};

// Cạnh dùng chung -> hai tỉnh kề nhau.
const arcOwners = new Map();
for (const f of features.values()) {
  for (const polygon of f.polygons) {
    for (const ring of polygon) {
      for (const a of ring) {
        const i = a < 0 ? ~a : a;
        if (!arcOwners.has(i)) arcOwners.set(i, new Set());
        arcOwners.get(i).add(f.id);
      }
    }
  }
}
const neighbors = new Map(PROVINCES.map((p) => [p.id, new Set()]));
for (const owners of arcOwners.values()) {
  const list = [...owners];
  for (const a of list) for (const b of list) if (a !== b) neighbors.get(a).add(b);
}

// Tô màu DSatur: chọn tỉnh có nhiều màu láng giềng nhất trước; trong các màu còn trống lấy màu đang ít dùng nhất.
const colorOf = new Map();
const usage = Array(COLORS).fill(0);
while (colorOf.size < PROVINCES.length) {
  let pick = null;
  let pickSat = -1;
  for (const p of PROVINCES) {
    if (colorOf.has(p.id)) continue;
    const sat = new Set([...neighbors.get(p.id)].map((n) => colorOf.get(n)).filter((c) => c !== undefined)).size;
    if (sat > pickSat || (sat === pickSat && neighbors.get(p.id).size > neighbors.get(pick.id).size)) {
      pick = p;
      pickSat = sat;
    }
  }
  const taken = new Set([...neighbors.get(pick.id)].map((n) => colorOf.get(n)));
  const free = [...Array(COLORS).keys()].filter((c) => !taken.has(c)).sort((a, b) => usage[a] - usage[b] || a - b);
  if (!free.length) throw new Error(`Không đủ ${COLORS} màu cho ${pick.id}`);
  colorOf.set(pick.id, free[0]);
  usage[free[0]]++;
}

const provinces = PROVINCES.map((p) => {
  const f = features.get(p.id);
  const polygons = f.polygons.map((polygon) => polygon.map(ringOf).filter((ring) => ring.length >= 3)).filter((rings) => rings.length);
  const main = polygons.reduce((best, rings) => (Math.abs(ringArea(rings[0])) > Math.abs(ringArea(best[0])) ? rings : best));
  const label = polylabel(main);
  const all = polygons.flat(2);
  const xs = all.map((pt) => pt[0]);
  const ys = all.map((pt) => pt[1]);
  return {
    id: p.id,
    d: pathOf(polygons.flat()),
    label: [+label.x.toFixed(1), +label.y.toFixed(1)],
    room: +label.r.toFixed(1),
    bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => +v.toFixed(1)),
    area: Math.round(polygons.reduce((sum, rings) => sum + Math.abs(ringArea(rings[0])), 0)),
    color: colorOf.get(p.id),
    neighbors: [...neighbors.get(p.id)].sort(),
  };
});

// Ranh giới trong (giữa hai tỉnh) và đường bao ngoài (bờ biển, biên giới).
const inner = [];
const outer = [];
for (const [i, owners] of arcOwners) (owners.size > 1 ? inner : outer).push(arcs[i]);

const archipelagos = Object.entries(ARCHIPELAGOS).map(([province, { id, name }]) => {
  const dots = ISLANDS[id].map(([lon, lat, r]) => {
    const [x, y] = project([lon, lat]);
    return [+x.toFixed(1), +y.toFixed(1), r];
  });
  const xs = dots.map((d) => d[0]);
  const ys = dots.map((d) => d[1]);
  return { id, name, province, dots, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => +v.toFixed(1)) };
});

const out = {
  source: 'geoBoundaries VNM ADM1 (Public Domain)',
  width: 1080,
  height: 1920,
  colors: COLORS,
  // x = left + (kinh độ radian - minX) * k; y = top + (maxY - Mercator(vĩ độ)) * k
  projection: { left: MAP.left, top: +offsetY.toFixed(3), k: +k.toFixed(3), minX: +minX.toFixed(6), maxY: +maxY.toFixed(6) },
  provinces,
  borders: lineOf(inner),
  outline: lineOf(outer),
  archipelagos,
};
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(out));

// ---------- Báo cáo để căn bố cục ----------
const vertices = provinces.reduce((sum, p) => sum + (p.d.match(/[ML]/g)?.length ?? 0), 0);
console.log(`Đã ghi ${path.relative(root, outFile)}: ${(JSON.stringify(out).length / 1024).toFixed(0)} KB, ${vertices} đỉnh, ${usage.join('/')} tỉnh mỗi màu`);
const box = provinces.reduce((b, p) => [Math.min(b[0], p.bbox[0]), Math.min(b[1], p.bbox[1]), Math.max(b[2], p.bbox[2]), Math.max(b[3], p.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity]);
console.log(`Đất liền nằm trong x ${box[0].toFixed(0)}-${box[2].toFixed(0)}, y ${box[1].toFixed(0)}-${box[3].toFixed(0)}, ${(k / (180 / Math.PI)).toFixed(1)} px mỗi độ kinh`);
for (const a of archipelagos) console.log(`${a.name}: vị trí thật x ${a.bbox[0]}-${a.bbox[2]}, y ${a.bbox[1]}-${a.bbox[3]}`);
const tight = provinces.filter((p) => p.room < 14).map((p) => `${p.id} ${p.room}`);
console.log(`Tỉnh chật chỗ ghi số (bán kính trống < 14 px): ${tight.join(', ') || 'không có'}`);
