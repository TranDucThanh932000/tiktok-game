// Cắt bảng nhân vật AI (nền xanh, trong anh-goc/) thành từng hình nền trong suốt cho game (public/nhan-vat/).
// Chạy lại mỗi khi thay bảng: node scripts/cat-anh.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SRC = path.join(root, 'anh-goc');
const OUT = path.join(root, 'public', 'nhan-vat');
const POSES = ['dung', 'sau', 'ngang', 'ngoi'];
// Bố cục đúng như prompt: (hàng, cột) -> tên file.
const SHEETS = [
  { file: 'bo-1.png', rows: 5, cols: 4, name: (r, c) => (r < 4 ? `khach-${r + 1}-${POSES[c]}` : ['chu-tiem', 'chu-tiem-la', 'me', 'me-sau'][c]) },
  { file: 'bo-2.png', rows: 4, cols: 4, name: (r, c) => `khach-${r + 5}-${POSES[c]}` },
];
// Các tư thế đứng/đi của cùng một nhân vật được kê cùng chiều cao, chân sát đáy, để đổi dáng không bị nhảy cỡ;
// tư thế ngồi nằm ở ô máy riêng nên cắt sát.
const groupOf = (name) => (name.endsWith('-ngoi') ? name : name.replace(/-(dung|sau|ngang|la|vui)$/, ''));
const PAD = 4;

// ---------- PNG ----------
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('không phải file PNG');
  let pos = 8;
  let head = null;
  let palette = null;
  let alpha = null;
  const parts = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') head = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') alpha = data;
    else if (type === 'IDAT') parts.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[head?.color];
  if (!channels || head.depth !== 8 || head.interlace) throw new Error('chỉ đọc được PNG 8 bit, không xen dòng (ảnh tải từ ChatGPT/Gemini là loại này)');
  const { width, height, color } = head;
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = (line[x] + add) & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const i = x * channels;
      if (color === 2 || color === 6) {
        out[o] = line[i];
        out[o + 1] = line[i + 1];
        out[o + 2] = line[i + 2];
        out[o + 3] = color === 6 ? line[i + 3] : 255;
      } else if (color === 0 || color === 4) {
        out[o] = out[o + 1] = out[o + 2] = line[i];
        out[o + 3] = color === 4 ? line[i + 1] : 255;
      } else {
        const k = line[i];
        out[o] = palette[k * 3];
        out[o + 1] = palette[k * 3 + 1];
        out[o + 2] = palette[k * 3 + 2];
        out[o + 3] = alpha && k < alpha.length ? alpha[k] : 255;
      }
    }
    prev = line;
  }
  return { width, height, data: out };
}

function encodePng({ width, height, data }) {
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc32(typed));
    return Buffer.concat([len, typed, sum]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8;
  head[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- Tách nền xanh (giống public/js/sprites.js) ----------
function removeBackground({ width: w, height: h, data }) {
  const counts = new Map();
  const tally = (p) => {
    const i = p * 4;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const row = counts.get(key) ?? [0, 0, 0, 0];
    row[0]++;
    row[1] += data[i];
    row[2] += data[i + 1];
    row[3] += data[i + 2];
    counts.set(key, row);
  };
  for (let x = 0; x < w; x++) {
    tally(x);
    tally((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    tally(y * w);
    tally(y * w + w - 1);
  }
  const [n, sr, sg, sb] = [...counts.values()].sort((a, b) => b[0] - a[0])[0];
  const key = [sr / n, sg / n, sb / n];
  if (!(key[1] > key[0] + 40 && key[1] > key[2] + 40)) throw new Error(`nền không phải màu xanh lá (màu nền đọc được: ${key.map(Math.round).join(', ')})`);
  const dist = (i) => Math.hypot(data[i] - key[0], data[i + 1] - key[1], data[i + 2] - key[2]);
  const near = 70;
  const soft = 130;
  const bg = new Uint8Array(w * h);
  const stack = [];
  const seed = (p) => {
    if (!bg[p] && dist(p * 4) < near) {
      bg[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (p >= w) seed(p - w);
    if (p < w * (h - 1)) seed(p + w);
  }
  for (let p = 0; p < w * h; p++) if (!bg[p] && dist(p * 4) < near * 0.75) bg[p] = 1;
  // Viền 3 điểm ảnh quanh nền: chỗ hay bị ám xanh.
  let band = bg;
  for (let step = 0; step < 3; step++) {
    const grown = new Uint8Array(band);
    for (let p = 0; p < w * h; p++) {
      if (band[p]) continue;
      const x = p % w;
      if ((x > 0 && band[p - 1]) || (x < w - 1 && band[p + 1]) || (p >= w && band[p - w]) || (p < w * (h - 1) && band[p + w])) grown[p] = 1;
    }
    band = grown;
  }
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (bg[p]) {
      data[i + 3] = 0;
      continue;
    }
    const x = p % w;
    const edge = (x > 0 && bg[p - 1]) || (x < w - 1 && bg[p + 1]) || (p >= w && bg[p - w]) || (p < w * (h - 1) && bg[p + w]);
    if (edge) {
      const d = dist(i);
      if (d < soft) data[i + 3] = Math.max(0, Math.round((data[i + 3] * (d - near * 0.5)) / (soft - near * 0.5)));
    }
    if (band[p]) data[i + 1] = Math.min(data[i + 1], Math.max(data[i], data[i + 2]) + 8);
  }
}

// ---------- Tìm từng hình, xếp vào ô lưới ----------
function components({ width: w, height: h, data }) {
  const label = new Int32Array(w * h).fill(-1);
  const found = [];
  const stack = [];
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || data[start * 4 + 3] < 40) continue;
    const id = found.length;
    const box = { area: 0, sx: 0, sy: 0, x0: w, y0: h, x1: 0, y1: 0 };
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      const x = p % w;
      const y = (p - x) / w;
      box.area++;
      box.sx += x;
      box.sy += y;
      if (x < box.x0) box.x0 = x;
      if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y;
      if (y > box.y1) box.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (label[q] === -1 && data[q * 4 + 3] >= 40) {
            label[q] = id;
            stack.push(q);
          }
        }
      }
    }
    found.push({ ...box, cx: box.sx / box.area, cy: box.sy / box.area });
  }
  return found;
}

// Chia n giá trị đã sắp xếp thành k nhóm ở k-1 khoảng hở lớn nhất; trả về tâm từng nhóm.
function clusterCenters(values, k) {
  const sorted = [...values].sort((a, b) => a - b);
  const cuts = sorted
    .slice(1)
    .map((v, i) => ({ gap: v - sorted[i], at: i + 1 }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, k - 1)
    .map((cut) => cut.at)
    .sort((a, b) => a - b);
  const groups = [];
  let from = 0;
  for (const at of [...cuts, sorted.length]) {
    const part = sorted.slice(from, at);
    groups.push(part.reduce((s, v) => s + v, 0) / part.length);
    from = at;
  }
  return groups;
}

const nearest = (centers, v) => centers.reduce((best, c, i) => (Math.abs(c - v) < Math.abs(centers[best] - v) ? i : best), 0);

function cutSheet(sheet) {
  const image = decodePng(readFileSync(path.join(SRC, sheet.file)));
  removeBackground(image);
  const all = components(image).filter((c) => c.area >= 0.0003 * image.width * image.height);
  const expected = sheet.rows * sheet.cols;
  const byArea = [...all].sort((a, b) => b.area - a.area);
  const typical = byArea[Math.min(byArea.length, expected) >> 1]?.area ?? 0;
  const big = all.filter((c) => c.area >= typical * 0.2);
  const problems = [];
  if (big.length !== expected) problems.push(`thấy ${big.length} hình lớn, cần ${expected}`);
  const rows = clusterCenters(big.map((c) => c.cy), sheet.rows);
  const cols = clusterCenters(big.map((c) => c.cx), sheet.cols);
  const cells = new Map();
  for (const c of all) {
    const key = `${nearest(rows, c.cy)},${nearest(cols, c.cx)}`;
    const cell = cells.get(key) ?? { x0: Infinity, y0: Infinity, x1: -1, y1: -1, big: 0 };
    cell.x0 = Math.min(cell.x0, c.x0);
    cell.y0 = Math.min(cell.y0, c.y0);
    cell.x1 = Math.max(cell.x1, c.x1);
    cell.y1 = Math.max(cell.y1, c.y1);
    if (big.includes(c)) cell.big++;
    cells.set(key, cell);
  }
  const out = [];
  for (let r = 0; r < sheet.rows; r++) {
    for (let c = 0; c < sheet.cols; c++) {
      const cell = cells.get(`${r},${c}`);
      const name = sheet.name(r, c);
      if (!cell?.big) problems.push(`ô hàng ${r + 1} cột ${c + 1} (${name}) trống`);
      else if (cell.big > 1) problems.push(`ô hàng ${r + 1} cột ${c + 1} (${name}) có ${cell.big} hình`);
      if (cell?.big) out.push({ name, image, box: cell });
    }
  }
  return { out, problems };
}

function crop(image, box, height) {
  const w = box.x1 - box.x0 + 1 + PAD * 2;
  const h = height + PAD * 2;
  const data = Buffer.alloc(w * h * 4);
  const top = h - PAD - (box.y1 - box.y0 + 1);
  for (let y = box.y0; y <= box.y1; y++) {
    const from = (y * image.width + box.x0) * 4;
    image.data.copy(data, ((top + y - box.y0) * w + PAD) * 4, from, from + (box.x1 - box.x0 + 1) * 4);
  }
  return { width: w, height: h, data };
}

// ---------- Chạy ----------
const pieces = [];
let failed = false;
for (const sheet of SHEETS) {
  if (!existsSync(path.join(SRC, sheet.file))) {
    console.log(`Bỏ qua ${sheet.file}: chưa có file`);
    continue;
  }
  const { out, problems } = cutSheet(sheet);
  console.log(`${sheet.file}: ${out.length}/${sheet.rows * sheet.cols} hình${problems.length ? ` · LỖI: ${problems.join('; ')}` : ''}`);
  if (problems.length) failed = true;
  pieces.push(...out);
}
if (failed) {
  console.log('Bảng có lỗi bố cục, chưa ghi file nào. Tạo lại bảng đó hoặc nhờ cắt tay.');
  process.exit(1);
}
const heights = new Map();
for (const { name, box } of pieces) heights.set(groupOf(name), Math.max(heights.get(groupOf(name)) ?? 0, box.y1 - box.y0 + 1));
mkdirSync(OUT, { recursive: true });
for (const { name, image, box } of pieces) {
  const png = crop(image, box, heights.get(groupOf(name)));
  writeFileSync(path.join(OUT, `${name}.png`), encodePng(png));
  console.log(`  ${name}.png ${png.width}x${png.height}`);
}
console.log(`Xong: ${pieces.length} hình trong public/nhan-vat. Bấm F5 ở cửa sổ game.`);
