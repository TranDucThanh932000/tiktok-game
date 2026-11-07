// Vẽ bản đồ 63 tỉnh từ /map/vietnam.json (dựng sẵn bằng scripts/build-map.mjs).
// Mỗi tỉnh: nền màu nhạt dần đậm lên theo điểm, viền màu riêng nằm phía trong ranh giới (cắt theo vùng đất của tỉnh,
// nên hai tỉnh kề nhau hiện hai màu viền khác nhau), đường trắng mảnh ở đúng ranh giới, số biển số ở giữa tỉnh.
const SVG = 'http://www.w3.org/2000/svg';
export const PALETTE = ['#ffd166', '#ff9f6b', '#ff7aa2', '#c3a1ff', '#6cc6ff', '#4fd8b9', '#a5e36d'];
// Độ đậm nền tỉnh (phần trăm màu tỉnh pha với nền tối): tỉnh chưa có điểm, tỉnh dẫn đầu là 100.
const BASE_HEAT = 44;

// Hai quần đảo đặt vào khung biển bên phải: Hoàng Sa gần đúng vị trí thật, Trường Sa thu nhỏ vào ô riêng.
const PLACE = {
  'hoang-sa': { shift: [-46, 34], scale: 1, label: 'below' },
  'truong-sa': { center: [962, 1586], scale: 0.48, label: 'above' },
};

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function div(className, text) {
  const node = document.createElement('div');
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export async function loadMap() {
  const res = await fetch('/map/vietnam.json');
  if (!res.ok) throw new Error(`Không tải được bản đồ (${res.status})`);
  return res.json();
}

// meta: Map id -> { name, short, plate }
export function buildMap({ root, layer, data, meta, scores = true }) {
  const { projection: pj } = data;
  const project = (lon, lat) => [pj.left + ((lon * Math.PI) / 180 - pj.minX) * pj.k, pj.top + (pj.maxY - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) * pj.k];

  const defs = svg('defs');
  defs.innerHTML = `
    <filter id="land-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#020c18" flood-opacity=".75"/>
    </filter>
    <filter id="gold-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
  root.append(defs);

  // Lưới kinh tuyến, vĩ tuyến mờ cho có cảm giác bản đồ.
  const grid = svg('path', { class: 'graticule' });
  let d = '';
  for (let lon = 98; lon <= 122; lon += 2) {
    const [x] = project(lon, 0);
    d += `M${x.toFixed(1)} 0V1920`;
  }
  for (let lat = 4; lat <= 28; lat += 2) {
    const [, y] = project(100, lat);
    d += `M0 ${y.toFixed(1)}H1080`;
  }
  grid.setAttribute('d', d);
  root.append(grid);

  const sea = [
    { text: 'BIỂN ĐÔNG', at: [108.4, 9.6], cls: 'sea-label big' },
    { text: 'Vịnh Bắc Bộ', at: [107.25, 19.35], cls: 'sea-label' },
    { text: 'Vịnh Thái Lan', at: [103.1, 9.0], cls: 'sea-label' },
  ];
  for (const { text, at, cls } of sea) {
    const [x, y] = project(...at);
    const node = svg('text', { x: x.toFixed(1), y: y.toFixed(1), class: cls });
    node.textContent = text;
    root.append(node);
  }

  // Bóng đổ vẽ một lần trên lớp tĩnh bên dưới, để hiệu ứng nhấp nháy của từng tỉnh không phải tính lại bộ lọc.
  root.append(svg('path', { d: data.provinces.map((p) => p.d).join(''), class: 'land-base', filter: 'url(#land-shadow)' }));
  const land = svg('g', { class: 'land' });
  const items = new Map();
  for (const p of data.provinces) {
    const color = PALETTE[p.color % PALETTE.length];
    const clip = svg('clipPath', { id: `cp-${p.id}` });
    clip.append(svg('path', { d: p.d }));
    defs.append(clip);
    const group = svg('g', { class: 'prov', style: `--c:${color};--heat:${BASE_HEAT}%` });
    const fill = svg('path', { d: p.d, class: 'fill', 'fill-rule': 'evenodd' });
    const edge = svg('path', { d: p.d, class: 'edge', 'clip-path': `url(#cp-${p.id})` });
    group.append(fill, edge);
    land.append(group);

    const info = meta.get(p.id);
    const size = Math.round(Math.max(26, Math.min(34, p.room * 2 + 3)));
    const badge = div('badge');
    badge.style.cssText = `left:${p.label[0]}px;top:${p.label[1]}px;--c:${color};--s:${size}px`;
    const plate = div('plate', String(info.plate));
    const pts = div('pts');
    badge.append(plate, pts);
    layer.append(badge);
    items.set(p.id, { group, fill, edge, badge, pts, x: p.label[0], y: p.label[1], size, color, d: p.d });
  }
  root.append(land);
  root.append(svg('path', { d: data.borders, class: 'borders' }));
  root.append(svg('path', { d: data.outline, class: 'outline' }));
  const ring = svg('path', { class: 'leader-ring', filter: 'url(#gold-glow)' });
  root.append(ring);

  // Hoàng Sa, Trường Sa: chấm đảo cùng màu tỉnh quản lý, khung nét đứt và tên quần đảo.
  for (const a of data.archipelagos) {
    const place = PLACE[a.id];
    const [x0, y0, x1, y1] = a.bbox;
    let move;
    if (place.center) {
      const [cx, cy] = place.center;
      move = ([x, y]) => [cx + (x - (x0 + x1) / 2) * place.scale, cy + (y - (y0 + y1) / 2) * place.scale];
    } else {
      move = ([x, y]) => [x + place.shift[0], y + place.shift[1]];
    }
    const dots = a.dots.map(([x, y, r]) => [...move([x, y]), r]);
    const xs = dots.map((dot) => dot[0]);
    const ys = dots.map((dot) => dot[1]);
    const box = [Math.min(...xs) - 16, Math.min(...ys) - 14, Math.max(...xs) + 16, Math.max(...ys) + 14];
    const color = items.get(a.province).color;
    const group = svg('g', { class: 'archipelago', style: `--c:${color}` });
    group.append(svg('rect', { x: box[0], y: box[1], width: box[2] - box[0], height: box[3] - box[1], rx: 14, class: 'frame' }));
    const isles = dots.map(([x, y, r]) => svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r, class: 'isle' }));
    group.append(...isles);
    const midX = (box[0] + box[2]) / 2;
    const name = svg('text', { x: midX, y: place.label === 'below' ? box[3] + 26 : box[1] - 30, class: 'isle-name' });
    name.textContent = `QĐ. ${a.name.toUpperCase()}`;
    const owner = svg('text', { x: midX, y: place.label === 'below' ? box[3] + 48 : box[1] - 9, class: 'isle-owner' });
    owner.textContent = `(${meta.get(a.province).name})`;
    group.append(name, owner);
    root.append(group);
    items.get(a.province).isles = isles;
  }

  let leader = null;
  return {
    items,
    // heat 0..1: tỉnh càng nhiều điểm so với tỉnh dẫn đầu thì nền càng đậm.
    setScore(id, score, heat) {
      const item = items.get(id);
      item.group.style.setProperty('--heat', `${Math.round(BASE_HEAT + heat * (100 - BASE_HEAT))}%`);
      // Chỉ đổi chữ khi điểm đổi, để không phải dàn lại cả 63 nhãn mỗi lần vẽ.
      const text = score > 0 && scores ? score.toLocaleString('vi-VN') : '';
      if (item.pts.textContent !== text) item.pts.textContent = text;
    },
    setRank(id, rank) {
      const { badge } = items.get(id);
      for (let r = 1; r <= 3; r++) badge.classList.toggle(`r${r}`, rank === r);
    },
    setLeader(id) {
      if (id === leader) return;
      leader = id;
      ring.setAttribute('d', id ? items.get(id).d : '');
    },
    // Web Animations, không đổi class: đông người điểm danh liên tục cũng không bắt trình duyệt tính lại bố cục.
    flash(id, big = false) {
      if (document.hidden) return;
      const item = items.get(id);
      const glow = { fill: '#fffbe6' };
      item.fill.animate([glow, { ...glow, offset: 0.15 }], { duration: big ? 1600 : 800, easing: 'ease-out' });
      item.badge.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.5)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: big ? 1000 : 550, easing: 'ease-out' });
      for (const isle of item.isles ?? []) isle.animate([glow, { ...glow, offset: 0.2 }], { duration: 900, easing: 'ease-out' });
    },
    point(id) {
      const { x, y, size } = items.get(id);
      return { x, y, size };
    },
  };
}
