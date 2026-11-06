// Mực trên tờ sớ. Mỗi chặng có một bản mực hoàn chỉnh (source) và đường bút (path): bút đi tới đâu, mực hiện tới đó,
// nên chữ và avatar của bất kỳ ai đều lộ ra như đang được viết tay. Toạ độ tính từ góc tờ giấy.
import { PAPER, FONTS, makeCanvas } from './scene.js';

const INK = '#17100a';
const RED_INK = '#a01d10';
const BROWN = '#7a4a1e';
const WISH_INK = '#5a3a1e';
const CENTER_X = PAPER.w / 2;
const TAGLINE = 'Cầu bình an · vạn sự như ý';
// Vị trí trên tờ sớ theo nội dung: càng nhiều chữ thì ảnh càng nhỏ. Dấu đỏ nằm góc dưới bên phải, các dòng chữ đều kết thúc phía trên nó.
const LAYOUTS = {
  name: { nameY: 384, nameMax: 132, taglineY: 456 },
  avatar: { box: { x: CENTER_X, y: 288, r: 160 }, nameY: 564, nameMax: 104, taglineY: 616 },
  wish: { box: { x: CENTER_X, y: 262, r: 132 }, nameY: 498, nameMax: 92, wish: { y: 552, size: 31, width: 470 } },
  thanks: { box: { x: CENTER_X, y: 232, r: 104 }, nameY: 428, nameMax: 78, wish: { y: 478, size: 27, width: 470 }, thanks: { y: 556, size: 27, width: 400 } },
};
const segmenter = new Intl.Segmenter('vi', { granularity: 'grapheme' });
const graphemes = (text) => Array.from(segmenter.segment(text), (part) => part.segment);

function wrap(c, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && c.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// Xuống dòng cho đều: thu hẹp khổ tới khi sắp phải thêm dòng, để dòng cuối không trơ một chữ.
function balancedWrap(c, text, maxWidth) {
  const rows = wrap(c, text, maxWidth);
  let best = rows;
  for (let width = maxWidth - 20; rows.length > 1 && width > 200; width -= 20) {
    const next = wrap(c, text, width);
    if (next.length > rows.length) break;
    best = next;
  }
  return best;
}

function fitSize(c, text, maxWidth, maxSize, minSize, font) {
  let size = maxSize;
  c.font = font(size);
  while (size > minSize && c.measureText(text).width > maxWidth) {
    size -= 2;
    c.font = font(size);
  }
  return size;
}

// Cỡ chữ lớn nhất để câu nằm gọn trong hai dòng.
function fitRows(c, text, maxWidth, maxSize, font) {
  for (let size = maxSize; size > 18; size--) {
    c.font = font(size);
    const rows = balancedWrap(c, text, maxWidth);
    if (rows.length <= 2) return { size, rows };
  }
  c.font = font(18);
  return { size: 18, rows: balancedWrap(c, text, maxWidth) };
}

// Đường bút cho nhiều dòng chữ: mỗi ký tự là vài nét lên xuống; lift = nhấc bút không để lại mực.
function textPath(c, lines, size, font) {
  const points = [];
  const passWidth = size * 0.16;
  c.font = font(size);
  for (const { text, x, y } of lines) {
    const parts = graphemes(text);
    let prefix = '';
    let lifted = true;
    for (const part of parts) {
      const x0 = x + c.measureText(prefix).width;
      prefix += part;
      const x1 = x + c.measureText(prefix).width;
      if (!part.trim()) {
        lifted = true;
        continue;
      }
      const passes = Math.max(2, Math.ceil((x1 - x0) / passWidth));
      for (let i = 0; i <= passes; i++) {
        const px = x0 + ((x1 - x0) * i) / passes;
        const py = i % 2 ? y - size * 1.05 : y + size * 0.42;
        points.push({ x: px, y: py, lift: lifted });
        lifted = false;
      }
    }
  }
  return { points, width: Math.max(passWidth * 1.9, size * 0.3) };
}

// Tính sẵn quãng đường để bút đi đều theo thời gian của chặng.
function measure(path) {
  let total = 0;
  path.points.forEach((point, i) => {
    if (i && !point.lift) total += Math.hypot(point.x - path.points[i - 1].x, point.y - path.points[i - 1].y);
    point.at = total;
  });
  path.total = total || 1;
  path.index = 1;
  return path;
}

function positionAt(path, distance) {
  const { points } = path;
  let i = 1;
  while (i < points.length - 1 && points[i].at < distance) i++;
  const a = points[i - 1];
  const b = points[i];
  const span = b.at - a.at || 1;
  const k = Math.max(0, Math.min(1, (distance - a.at) / span));
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

// Lớp mực của một tờ.
export class Sheet {
  constructor() {
    this.canvas = makeCanvas(PAPER.w, PAPER.h);
    this.c = this.canvas.getContext('2d');
    this.stages = [];
    this.overlay = null;
    this.stamp = null;
  }

  clear() {
    this.c.clearRect(0, 0, PAPER.w, PAPER.h);
    this.stages = [];
    this.overlay = null;
    this.stamp = null;
  }

  // Dựng bản mực và đường bút cho từng chặng của tờ sớ.
  begin(job, getAvatar) {
    this.clear();
    this.job = job;
    const c = this.c;
    // phần in sẵn, hiện ngay khi trải giấy
    this.printHead(`SỚ SỐ ${job.no.toLocaleString('vi-VN')}`);
    if (job.gifts > 1) {
      c.fillStyle = RED_INK;
      c.font = FONTS.serif(36);
      c.textAlign = 'right';
      c.fillText(`× ${job.gifts}`, PAPER.w - 28, 66);
    }
    const has = (kind) => job.stages.some((stage) => stage.kind === kind);
    const layout = LAYOUTS[has('thanks') ? 'thanks' : has('wish') ? 'wish' : has('avatar') ? 'avatar' : 'name'];
    if (layout.taglineY) {
      c.fillStyle = WISH_INK;
      c.font = FONTS.italic(26);
      c.textAlign = 'center';
      c.fillText(TAGLINE, CENTER_X, layout.taglineY);
    }
    for (const stage of job.stages) {
      if (stage.kind === 'avatar') this.stages.push(this.avatarStage(job, layout, getAvatar));
      else if (['name', 'wish', 'thanks'].includes(stage.kind)) this.stages.push(this.textStage(stage, job, layout));
      else this.stages.push({ kind: stage.kind });
    }
  }

  // Dòng tiêu đề và đường kẻ có hình thoi đỏ ở đầu mỗi tờ.
  printHead(title) {
    const c = this.c;
    c.textBaseline = 'alphabetic';
    c.textAlign = 'center';
    c.fillStyle = BROWN;
    c.font = FONTS.sans(26, 700);
    c.letterSpacing = '4px';
    c.fillText(title, CENTER_X, 62);
    c.letterSpacing = '0px';
    c.strokeStyle = '#b8945a';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(CENTER_X - 160, 100);
    c.lineTo(CENTER_X - 23, 100);
    c.moveTo(CENTER_X + 23, 100);
    c.lineTo(CENTER_X + 160, 100);
    c.stroke();
    c.fillStyle = '#b3261e';
    c.beginPath();
    c.moveTo(CENTER_X, 90);
    c.lineTo(CENTER_X + 10, 100);
    c.lineTo(CENTER_X, 110);
    c.lineTo(CENTER_X - 10, 100);
    c.closePath();
    c.fill();
  }

  textStage(stage, job, layout) {
    const measureCtx = this.c;
    const source = makeCanvas(PAPER.w, PAPER.h);
    const s = source.getContext('2d');
    let lines;
    let size;
    let font;
    let color = INK;
    if (stage.kind === 'name') {
      font = FONTS.script;
      size = fitSize(measureCtx, job.name, 480, layout.nameMax, 40, font);
      lines = [{ text: job.name, x: CENTER_X - measureCtx.measureText(job.name).width / 2, y: layout.nameY }];
    } else {
      const spot = layout[stage.kind];
      font = FONTS.italic;
      color = stage.kind === 'thanks' ? RED_INK : WISH_INK;
      const fitted = fitRows(measureCtx, stage.text, spot.width, spot.size, font);
      size = fitted.size;
      lines = fitted.rows.map((text, i) => ({ text, x: CENTER_X - measureCtx.measureText(text).width / 2, y: spot.y + i * Math.round(size * 1.3) }));
    }
    s.font = font(size);
    s.fillStyle = color;
    s.shadowColor = color === RED_INK ? 'rgba(120, 20, 0, 0.3)' : 'rgba(30, 15, 0, 0.35)';
    s.shadowBlur = 2;
    s.textBaseline = 'alphabetic';
    for (const line of lines) s.fillText(line.text, line.x, line.y);
    const path = measure(textPath(measureCtx, lines, size, font));
    return { kind: stage.kind, source, pattern: this.c.createPattern(source, 'no-repeat'), path, drawn: 0 };
  }

  avatarStage(job, layout, getAvatar) {
    const { box } = layout;
    const made = { kind: 'avatar', box, job, getAvatar, drawn: 0, ringDrawn: 0, image: undefined };
    made.ring = measure({ points: this.ringPoints(box), width: 7 });
    made.hatch = measure({ points: this.hatchPoints(box), width: 34 });
    this.buildAvatarSources(made);
    return made;
  }

  ringPoints({ x, y, r }) {
    const points = [];
    for (let i = 0; i <= 48; i++) {
      const a = -Math.PI / 2 + (i / 48) * Math.PI * 2;
      points.push({ x: x + Math.cos(a) * (r + 5), y: y + Math.sin(a) * (r + 5), lift: i === 0 });
    }
    return points;
  }

  // Tô chéo như vẽ phác: đường zigzag quét hết khung tròn.
  hatchPoints({ x, y, r }) {
    const points = [];
    const rows = 11;
    for (let i = 0; i <= rows; i++) {
      const off = -r + (2 * r * i) / rows;
      const half = Math.sqrt(Math.max(0, r * r - off * off)) + 8;
      // trục chéo 45 độ
      const ux = Math.SQRT1_2;
      const uy = -Math.SQRT1_2;
      const vx = Math.SQRT1_2;
      const vy = Math.SQRT1_2;
      const a = { x: x + ux * off - vx * half, y: y + uy * off - vy * half };
      const b = { x: x + ux * off + vx * half, y: y + uy * off + vy * half };
      const [first, second] = i % 2 ? [b, a] : [a, b];
      points.push({ ...first, lift: i === 0 }, { ...second, lift: false });
    }
    return points;
  }

  // Bản phác mực nâu và bản màu của avatar. Chưa tải được ảnh thì vẽ chữ cái đầu của tên.
  buildAvatarSources(stage) {
    const { box, job } = stage;
    const image = stage.getAvatar(job.avatar);
    stage.image = image ?? null;
    const sketch = makeCanvas(PAPER.w, PAPER.h);
    const color = makeCanvas(PAPER.w, PAPER.h);
    const { x, y, r } = box;
    const clip = (c) => {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.clip();
    };
    const s = sketch.getContext('2d');
    const f = color.getContext('2d');
    s.save();
    clip(s);
    f.save();
    clip(f);
    if (image) {
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const sx = (image.naturalWidth - side) / 2;
      const sy = (image.naturalHeight - side) / 2;
      s.filter = 'grayscale(1) contrast(1.5) brightness(1.08)';
      s.drawImage(image, sx, sy, side, side, x - r, y - r, r * 2, r * 2);
      s.filter = 'none';
      s.globalCompositeOperation = 'multiply';
      s.fillStyle = '#e9cf9f';
      s.fillRect(x - r, y - r, r * 2, r * 2);
      f.drawImage(image, sx, sy, side, side, x - r, y - r, r * 2, r * 2);
    } else {
      const letter = graphemes(job.name)[0] ?? '?';
      for (const c of [s, f]) {
        c.fillStyle = c === s ? '#d9bc85' : '#8e1712';
        c.fillRect(x - r, y - r, r * 2, r * 2);
        c.fillStyle = c === s ? INK : '#ffe39a';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = FONTS.serif(r * 1.1);
        c.fillText(letter, x, y);
      }
    }
    s.restore();
    f.restore();
    stage.source = sketch;
    stage.color = color;
    stage.pattern = this.c.createPattern(sketch, 'no-repeat');
  }

  paintPath(path, style, width, upTo) {
    const c = this.c;
    const { points } = path;
    c.save();
    c.strokeStyle = style;
    c.lineWidth = width;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    let open = false;
    while (path.index < points.length && points[path.index].at <= upTo) {
      const point = points[path.index];
      const previous = points[path.index - 1];
      if (!point.lift) {
        if (!open) c.moveTo(previous.x, previous.y);
        c.lineTo(point.x, point.y);
        open = true;
      } else open = false;
      path.index++;
    }
    // đoạn đang vẽ dở: chưa tăng index, lần sau vẽ tiếp
    if (path.index < points.length && !points[path.index].lift) {
      const pos = positionAt(path, upTo);
      if (!open) c.moveTo(points[path.index - 1].x, points[path.index - 1].y);
      c.lineTo(pos.x, pos.y);
    }
    c.stroke();
    c.restore();
  }

  // p trong khoảng 0..1 của chặng; trả về vị trí ngòi bút (toạ độ tờ giấy) hoặc null nếu bút đang nhấc.
  update(index, p) {
    const stage = this.stages[index];
    if (!stage?.path && stage?.kind !== 'avatar') return null;
    if (stage.kind === 'avatar') return this.updateAvatar(stage, p);
    if (!stage.before) {
      stage.before = makeCanvas(PAPER.w, PAPER.h);
      stage.before.getContext('2d').drawImage(this.canvas, 0, 0);
    }
    const target = p * stage.path.total;
    this.paintPath(stage.path, stage.pattern, stage.path.width, target);
    return positionAt(stage.path, target);
  }

  updateAvatar(stage, p) {
    // Ảnh tải xong khi đang vẽ thì đổi sang ảnh thật ngay.
    if (!stage.image && stage.getAvatar(stage.job.avatar)) this.buildAvatarSources(stage);
    const RING = 0.15;
    const HATCH = 0.82;
    if (p < RING) {
      const target = (p / RING) * stage.ring.total;
      this.paintPath(stage.ring, INK, stage.ring.width, target);
      return positionAt(stage.ring, target);
    }
    if (p < HATCH) {
      if (!stage.ringDone) {
        this.paintPath(stage.ring, INK, stage.ring.width, stage.ring.total);
        stage.ringDone = true;
      }
      const target = ((p - RING) / (HATCH - RING)) * stage.hatch.total;
      this.paintPath(stage.hatch, stage.pattern, stage.hatch.width, target);
      return positionAt(stage.hatch, target);
    }
    if (!stage.hatchDone) {
      this.c.drawImage(stage.source, 0, 0);
      stage.hatchDone = true;
    }
    this.overlay = { image: stage.color, alpha: (p - HATCH) / (1 - HATCH) };
    return null;
  }

  // Chốt chặng: bảo đảm mực hiện đủ, kể cả khi trang mở giữa chừng.
  finish(index) {
    const stage = this.stages[index];
    if (!stage) return;
    if (stage.kind === 'avatar') {
      if (!stage.ringDone) this.paintPath(stage.ring, INK, stage.ring.width, stage.ring.total);
      this.c.drawImage(stage.color, 0, 0);
      this.overlay = null;
      const { x, y, r } = stage.box;
      const gold = this.job.tier === 'wish' || this.job.tier === 'thanks';
      this.c.save();
      this.c.strokeStyle = gold ? '#c9952f' : INK;
      this.c.lineWidth = gold ? 9 : 7;
      this.c.beginPath();
      this.c.arc(x, y, r + 5, 0, Math.PI * 2);
      this.c.stroke();
      this.c.strokeStyle = '#b8945a';
      this.c.lineWidth = 3;
      this.c.beginPath();
      this.c.arc(x, y, r + 14, 0, Math.PI * 2);
      this.c.stroke();
      this.c.restore();
    } else if (stage.source) {
      // Nét bút đè nhiều lượt làm chữ đậm và nhòe, nên trả giấy về lúc chưa viết rồi in bản mực sạch.
      if (stage.before) {
        this.c.clearRect(0, 0, PAPER.w, PAPER.h);
        this.c.drawImage(stage.before, 0, 0);
        stage.before = null;
      }
      this.c.drawImage(stage.source, 0, 0);
    }
  }

  // Đóng dấu đỏ góc dưới bên phải tờ sớ.
  stampAt() {
    return { x: PAPER.w - 58, y: PAPER.h - 62 };
  }

  applyStamp() {
    const { x, y } = this.stampAt();
    const c = this.c;
    const size = 92;
    const words = this.job.seal.split(' ');
    c.save();
    c.translate(x, y);
    c.rotate(-0.14);
    c.globalAlpha = 0.9;
    c.strokeStyle = '#b91c12';
    c.lineWidth = 4;
    c.beginPath();
    c.roundRect(-size / 2, -size / 2, size, size, 9);
    c.stroke();
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(-size / 2 + 7, -size / 2 + 7, size - 14, size - 14, 6);
    c.stroke();
    c.fillStyle = '#b91c12';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const longest = words.reduce((a, b) => (Array.from(b).length > Array.from(a).length ? b : a));
    const wordSize = fitSize(c, longest, size - 30, 30, 16, FONTS.serif);
    words.forEach((word, i) => c.fillText(word, 0, (i - (words.length - 1) / 2) * (wordSize + 3) + 1));
    // mực dấu loang lổ
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 50; i++) {
      c.fillStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.5})`;
      c.beginPath();
      c.arc((Math.random() - 0.5) * size, (Math.random() - 0.5) * size, 0.8 + Math.random() * 1.8, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  // Tờ trống khi không có ai: chữ to mời tương tác.
  drawIdle(guide) {
    this.clear();
    const c = this.c;
    this.printHead('SỔ CẦU AN');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = INK;
    c.font = FONTS.script(96);
    c.fillText('Mời ghi danh', CENTER_X, 295);
    c.fillStyle = RED_INK;
    c.font = FONTS.serif(68);
    c.fillText(`Thả ${guide.likesForName} tim`, CENTER_X, 435);
    c.fillStyle = WISH_INK;
    c.font = FONTS.italic(36);
    c.fillText('là được ghi tên lên sớ', CENTER_X, 515);
  }
}
