// Cắt ảnh nhân vật thành atlas khung đều nhau (neo chân ở đáy, đầu ở giữa), ghép nền lớp, cắt khung bảng và mặt đồng hồ.
const OUT = 'public/chibi/';

function canvasOf(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  return { c, g, d: g.getImageData(0, 0, c.width, c.height) };
}

function runs(arr, thr, minLen) {
  const r = [];
  let s = -1;
  arr.forEach((v, i) => {
    if (v > thr && s < 0) s = i;
    if (v <= thr && s >= 0) { r.push([s, i - 1]); s = -1; }
  });
  if (s >= 0) r.push([s, arr.length - 1]);
  return r.filter(([a, b]) => b - a >= minLen);
}

// Ranh giới ô: giữa hai khoảng có hình liền nhau.
function cellsOf({ c, d }, cols, rows) {
  const colSum = new Array(c.width).fill(0);
  const rowSum = new Array(c.height).fill(0);
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d.data[(y * c.width + x) * 4 + 3] > 128) { colSum[x]++; rowSum[y]++; }
  const cr = runs(colSum, 2, 10);
  const rr = runs(rowSum, 2, 10);
  if (cr.length !== cols || rr.length !== rows) throw new Error(`grid ${cr.length}x${rr.length}, expected ${cols}x${rows}`);
  const edges = (r, max) => r.map(([a, b], i) => [i ? Math.floor((r[i - 1][1] + a) / 2) : 0, i < r.length - 1 ? Math.floor((b + r[i + 1][0]) / 2) : max - 1]);
  return { xs: edges(cr, c.width), ys: edges(rr, c.height) };
}

// Một khung: khung bao các điểm ảnh rõ, tâm đầu (trung bình x của 30% phía trên).
function frameOf({ c, d }, [x0, x1], [y0, y1]) {
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (d.data[(y * c.width + x) * 4 + 3] > 40) {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const band = minY + (maxY - minY) * 0.3;
  let sx = 0, n = 0;
  for (let y = minY; y <= band; y++) for (let x = minX; x <= maxX; x++) if (d.data[(y * c.width + x) * 4 + 3] > 128) { sx += x; n++; }
  return { minX, minY, maxX, maxY, head: n ? sx / n : (minX + maxX) / 2 };
}

// Dọn viền: điểm gần trong suốt bỏ hẳn, điểm nửa trong suốt lấy màu của điểm đặc gần nhất (hết viền đỏ/vàng lem).
function defringe(g, w, h) {
  const im = g.getImageData(0, 0, w, h);
  const p = im.data;
  const src = new Uint8ClampedArray(p);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const a = src[i + 3];
    if (a === 0 || a === 255) continue;
    if (a < 70) { p[i + 3] = 0; continue; }
    let best = -1;
    for (let r = 1; r <= 2 && best < 0; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = (yy * w + xx) * 4;
        if (src[j + 3] === 255) { best = j; break; }
      }
    }
    if (best >= 0) { p[i] = src[best]; p[i + 1] = src[best + 1]; p[i + 2] = src[best + 2]; }
  }
  g.putImageData(im, 0, 0);
}

function atlas(img, cols, rows, pad) {
  const src = canvasOf(img);
  const { xs, ys } = cellsOf(src, cols, rows);
  const frames = [];
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) frames.push(frameOf(src, xs[k], ys[r]));
  const left = Math.max(...frames.map((f) => f.head - f.minX));
  const right = Math.max(...frames.map((f) => f.maxX - f.head));
  const FW = Math.ceil(2 * Math.max(left, right) + pad * 2);
  const FH = Math.ceil(Math.max(...frames.map((f) => f.maxY - f.minY)) + pad * 2);
  const out = document.createElement('canvas');
  out.width = FW * cols; out.height = FH * rows;
  const g = out.getContext('2d');
  frames.forEach((f, i) => {
    const cx = (i % cols) * FW + FW / 2;
    const by = Math.floor(i / cols) * FH + FH - pad;
    const w = f.maxX - f.minX + 1, h = f.maxY - f.minY + 1;
    g.drawImage(src.c, f.minX, f.minY, w, h, Math.round(cx - (f.head - f.minX)), by - h, w, h);
  });
  defringe(g, out.width, out.height);
  // Xem thử trên nền trắng.
  const prev = document.createElement('canvas');
  prev.width = out.width; prev.height = out.height;
  const pg = prev.getContext('2d');
  pg.fillStyle = '#f4efe2'; pg.fillRect(0, 0, prev.width, prev.height);
  pg.strokeStyle = 'rgba(255,0,0,.25)';
  for (let i = 0; i <= cols; i++) { pg.beginPath(); pg.moveTo(i * FW, 0); pg.lineTo(i * FW, prev.height); pg.stroke(); }
  for (let i = 0; i <= rows; i++) { pg.beginPath(); pg.moveTo(0, i * FH); pg.lineTo(prev.width, i * FH); pg.stroke(); }
  pg.drawImage(out, 0, 0);
  return { out, prev, FW, FH, frames: frames.map((f) => ({ w: f.maxX - f.minX + 1, h: f.maxY - f.minY + 1 })) };
}

async function main(imgs) {
  const files = {};
  const json = {};
  const kids = atlas(imgs['hoc-sinh.png'], 8, 6, 4);
  files[OUT + 'hoc-sinh.webp'] = kids.out.toDataURL('image/webp', 0.92);
  files['art-src/xem-thu-hoc-sinh.png'] = kids.prev.toDataURL('image/png');
  json.kids = { FW: kids.FW, FH: kids.FH, heights: kids.frames.map((f) => f.h) };
  const teacher = atlas(imgs['co-giao.png'], 6, 2, 4);
  files[OUT + 'co-giao.webp'] = teacher.out.toDataURL('image/webp', 0.92);
  files['art-src/xem-thu-co-giao.png'] = teacher.prev.toDataURL('image/png');
  json.teacher = { FW: teacher.FW, FH: teacher.FH, heights: teacher.frames.map((f) => f.h) };

  // Nền: ảnh lớp phóng theo bề ngang 1080, dịch xuống để bục giảng ở y ≈ 990; phần trên (sau bảng) tô màu tường, dải cờ đặt lại ở trên cùng.
  const bg = imgs['lop-hoc.png'];
  const k = 1080 / bg.width;
  const Y0 = 166;
  const nen = document.createElement('canvas');
  nen.width = 1080; nen.height = 1920;
  const g = nen.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(bg, 0, Y0, 1080, bg.height * k);
  const wallTop = 186 * k + Y0; // mép trên khung bảng trong ảnh
  const grad = g.createLinearGradient(0, 0, 0, wallTop);
  grad.addColorStop(0, '#a4d0c9');
  grad.addColorStop(1, '#acd5ce');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1080, wallTop);
  const flagsH = 66;
  g.drawImage(bg, 0, 6, bg.width, flagsH, 0, 0, 1080, flagsH * k);
  files[OUT + 'lop-nen.webp'] = nen.toDataURL('image/webp', 0.9);
  json.bg = { k, Y0, platformTop: 718 * k + Y0, floorTop: 794 * k + Y0, doorBottom: 728 * k + Y0 };

  // Khung bảng (viền gỗ, khay phấn) để kéo giãn bằng border-image.
  const bw = 908 - 68, bh = 552 - 186;
  const board = document.createElement('canvas');
  board.width = bw; board.height = bh;
  const bgc = board.getContext('2d');
  bgc.drawImage(bg, 68, 186, bw, bh, 0, 0, bw, bh);
  // Góc bo tròn: xóa phần tường lọt ở bốn góc ngoài khung.
  bgc.globalCompositeOperation = 'destination-in';
  bgc.beginPath();
  bgc.roundRect(0, 0, bw, bh, 14);
  bgc.fill();
  files[OUT + 'bang.webp'] = board.toDataURL('image/webp', 0.92);
  json.board = { w: bw, h: bh };

  // Mặt đồng hồ (không kim), cắt tròn.
  const clock = document.createElement('canvas');
  clock.width = clock.height = 128;
  const cg = clock.getContext('2d');
  cg.beginPath();
  cg.arc(64, 64, 63, 0, Math.PI * 2);
  cg.clip();
  cg.drawImage(bg, 852 - 61, 125 - 61, 122, 122, 0, 0, 128, 128);
  files[OUT + 'dong-ho.webp'] = clock.toDataURL('image/webp', 0.92);
  return { json, files };
}
