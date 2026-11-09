// Ảnh nhân vật riêng trong public/nhan-vat. Ảnh AI thường có nền một màu (xanh lá, trắng...) nên tự tách nền:
// loang từ mép ảnh vào những điểm cùng màu nền, làm mềm viền, bớt ám màu nền ở viền, rồi cắt sát nhân vật.
const MAX_SIDE = 640;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`không tải được ${url}`));
    img.src = url;
  });
}

const dist = (data, i, key) => {
  const dr = data[i] - key[0];
  const dg = data[i + 1] - key[1];
  const db = data[i + 2] - key[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

// Màu nền: màu hay gặp nhất trên mép ảnh (làm tròn để gom các điểm gần giống nhau).
function borderColor(data, w, h) {
  const counts = new Map();
  const add = (x, y) => {
    const i = (y * w + x) * 4;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const row = counts.get(key) ?? [0, 0, 0, 0];
    row[0]++;
    row[1] += data[i];
    row[2] += data[i + 1];
    row[3] += data[i + 2];
    counts.set(key, row);
  };
  for (let x = 0; x < w; x++) {
    add(x, 0);
    add(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    add(0, y);
    add(w - 1, y);
  }
  const [n, r, g, b] = [...counts.values()].sort((a, b) => b[0] - a[0])[0];
  return [r / n, g / n, b / n];
}

function removeBackground(image) {
  const { data, width: w, height: h } = image;
  const key = borderColor(data, w, h);
  const max = Math.max(...key);
  const min = Math.min(...key);
  // Nền màu rực (xanh lá, hồng...) thì tách mạnh tay hơn nền trắng/xám, vì áo trắng dễ bị ăn mất.
  const vivid = max > 90 && (max - min) / max > 0.45;
  const near = vivid ? 70 : 34;
  const soft = vivid ? 130 : 70;
  const bg = new Uint8Array(w * h);
  const stack = [];
  const seed = (p) => {
    if (!bg[p] && dist(data, p * 4, key) < near) {
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
  // Nền rực lọt vào giữa (khe tay, giữa hai chân): bỏ luôn những điểm rất giống màu nền.
  if (vivid) for (let p = 0; p < w * h; p++) if (!bg[p] && dist(data, p * 4, key) < near * 0.75) bg[p] = 1;
  const green = vivid && key[1] > key[0] + 40 && key[1] > key[2] + 40;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (bg[p]) {
      data[i + 3] = 0;
      continue;
    }
    const x = p % w;
    const edge = (x > 0 && bg[p - 1]) || (x < w - 1 && bg[p + 1]) || (p >= w && bg[p - w]) || (p < w * (h - 1) && bg[p + w]);
    if (!edge) continue;
    const d = dist(data, i, key);
    if (d < soft) data[i + 3] = Math.round((data[i + 3] * (d - near * 0.5)) / (soft - near * 0.5));
    // Viền còn ám xanh của phông xanh.
    if (green) data[i + 1] = Math.min(data[i + 1], Math.max(data[i], data[i + 2]) + 12);
  }
}

function trimBox({ data, width: w, height: h }) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] < 24) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

async function cutout(url) {
  const img = await loadImage(url);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  // Ảnh đã trong suốt (cắt sẵn bằng scripts/cat-anh.mjs) giữ nguyên cả khoảng trống: các tư thế của một nhân vật
  // được kê cùng chiều cao để hiện cùng một tỉ lệ.
  const corners = [0, w - 1, (h - 1) * w, h * w - 1];
  if (corners.filter((p) => image.data[p * 4 + 3] < 16).length >= 3) return { src: url, w, h };
  removeBackground(image);
  const box = trimBox(image);
  if (!box) throw new Error(`ảnh ${url} trống sau khi tách nền`);
  ctx.putImageData(image, 0, 0);
  const out = document.createElement('canvas');
  out.width = box.w;
  out.height = box.h;
  out.getContext('2d').drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  return { src: URL.createObjectURL(blob), w: box.w, h: box.h };
}

async function safeCut(url) {
  if (!url) return null;
  try {
    return await cutout(url);
  } catch (err) {
    console.warn('[nhân vật]', err.message);
    return null;
  }
}

// { khach: [{ no, ngoi, dung, sau, ngang }], chuTiem: { thuong, la, vui }, me: { dung, sau } }; mỗi ảnh là { src, w, h } hoặc null.
export async function loadSprites() {
  let list = { khach: [], chuTiem: {}, me: {} };
  try {
    list = await (await fetch('/api/nhan-vat', { cache: 'no-store' })).json();
  } catch {
    // Không đọc được danh sách: dùng hình vẽ sẵn.
  }
  const poses = ['ngoi', 'dung', 'sau', 'ngang'];
  const khach = (
    await Promise.all(
      list.khach.map(async (row) => {
        const pics = await Promise.all(poses.map((pose) => safeCut(row[pose])));
        return { no: row.no, ...Object.fromEntries(poses.map((pose, i) => [pose, pics[i]])) };
      }),
    )
  ).filter((row) => row.ngoi || row.dung);
  const [thuong, la, vui, me, meSau] = await Promise.all([safeCut(list.chuTiem.thuong), safeCut(list.chuTiem.la), safeCut(list.chuTiem.vui), safeCut(list.me?.dung), safeCut(list.me?.sau)]);
  return { khach, chuTiem: { thuong, la: la ?? thuong, vui: vui ?? thuong }, me: { dung: me, sau: meSau ?? me } };
}
