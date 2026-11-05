import { BOARD, FONT, GIFTS, GOAL, HEADER, HOWTO, RIVER, W, WATER, clamp, easeOutBack, fitText, fmtInt, outlinedText, roundRect } from './layout.js';
import { drawDuck, drawPosedDuck, duckSprite } from './DuckRenderer.js';

// Everything around the river: header, how-to, leaderboard, room-wide goal, notifications,
// plus banners, the registration card and the results podium.
const PHASE = {
  paused: ['TẠM DỪNG', '#868e96'],
  idle: ['ĐANG DỪNG', '#868e96'],
  waiting: ['CHỜ NGƯỜI CHƠI', '#20c997'],
  registration: ['SẮP XUẤT PHÁT', '#20c997'],
  race: ['ĐANG ĐUA', '#339af0'],
  sprint: ['NƯỚC RÚT', '#f03e3e'],
  finish: ['KẾT THÚC', '#fab005'],
};
const NOTE_COLORS = {
  join: '#2f9e44', gift: '#d6336c', share: '#1c7ed6',
  community: '#f59f00', finish: '#0ca678', system: '#364fc7', win: '#f59f00',
};
const SHOT = {
  leader: { color: '#f59f00', stroke: '#7a4a00', lines: 'rgba(255,255,255,' },
  small: { color: '#e64980', stroke: '#7a1140', lines: 'rgba(255,214,231,' },
  medium: { color: '#1c7ed6', stroke: '#0b3d91', lines: 'rgba(165,216,255,' },
  large: { color: '#f76707', stroke: '#7a2c00', lines: 'rgba(255,196,120,' },
  special: { color: '#9c36b5', stroke: '#4a0d5e', lines: 'rgba(255,240,170,' },
  skin: { color: '#2f9e44', stroke: '#0b4f1f', lines: 'rgba(200,255,210,' },
};
const COMMUNITY = {
  wind: { title: 'GIÓ THUẬN', unit: 'người share', color: '#63e6be' },
  tsunami: { title: 'SÓNG THẦN ĐẨY CẢ ĐÀN', unit: 'tim', color: '#4dabf7' },
  cheer: { title: 'ĐẠI HỘI CỔ VŨ', unit: 'comment', color: '#ffa94d' },
  giftStorm: { title: 'BÃO GIFT', unit: 'quà', color: '#e599f7' },
};
export class UIManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.avatars = new Map();
    this.notes = [];
    this.pending = [];
    this.banners = [];
    this.rows = new Map();
  }

  // ---------- helpers ----------
  avatar(url) {
    if (!url) return null;
    let entry = this.avatars.get(url);
    if (!entry) {
      entry = { img: new Image(), ok: false };
      entry.img.referrerPolicy = 'no-referrer';
      entry.img.onload = () => (entry.ok = true);
      entry.img.src = url;
      this.avatars.set(url, entry);
      if (this.avatars.size > 600) this.avatars.delete(this.avatars.keys().next().value);
    }
    return entry.ok ? entry.img : null;
  }

  face(x, y, r, url, hue) {
    const ctx = this.ctx;
    const img = this.avatar(url);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue ?? 48} 85% 80%)`;
    ctx.fill();
    ctx.clip();
    if (img) ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    else ctx.drawImage(duckSprite(Math.round(hue ?? 48)), x - r * 1.25, y - r * 1.05, r * 2.6, r * 2.3);
    ctx.restore();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  panel(x, y, w, h, r = 22, fill = 'rgba(255,255,255,0.96)') {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }

  // ---------- notifications ----------
  notify(note, now, max) {
    if (note.kind === 'community' || note.kind === 'win') return;
    this.pending.push({ ...note, born: 0 });
    // Under heavy traffic, joins collapse into one line and the oldest minor notes give way.
    if (this.pending.length > 6) {
      const joins = this.pending.filter((n) => n.kind === 'join');
      if (joins.length > 1) {
        this.pending = this.pending.filter((n) => n.kind !== 'join');
        this.pending.unshift({ text: `+${joins.length} chú vịt mới vừa xuống sông!`, kind: 'join', count: joins.length });
      }
      while (this.pending.length > 8) {
        const i = this.pending.findIndex((n) => n.kind !== 'gift');
        this.pending.splice(i >= 0 ? i : 0, 1);
      }
    }
    this.flushNotes(now, max);
  }

  flushNotes(now, max) {
    this.notes = this.notes.filter((n) => now - n.born < 3600);
    while (this.notes.length < max && this.pending.length) this.notes.push({ ...this.pending.shift(), born: now });
  }

  banner(title, sub, color, now, big = false) {
    if (this.banners.length > 3) this.banners.shift();
    this.banners.push({ title, sub, color, born: 0, big, queued: now });
  }

  // ---------- header ----------
  // The first ~96 px stay empty: TikTok draws the streamer's name and the viewer count there.
  drawHeader(s, t) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#1864ab');
    g.addColorStop(0.5, '#1c7ed6');
    g.addColorStop(1, '#0b7285');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, HEADER.h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let x = 0; x < W; x += 60) {
      ctx.beginPath();
      ctx.arc(x + ((t * 20) % 60), HEADER.h + 10, 30, Math.PI, 0);
      ctx.fill();
    }
    ctx.drawImage(duckSprite(48), 14, 96, 128, 112);
    outlinedText(ctx, 'THẢ VỊT', 146, 150, { size: 84, fill: '#ffe066', stroke: '#e8590c', line: 12, align: 'left' });
    outlinedText(ctx, 'VỀ ĐÍCH TRƯỚC LÀ THẮNG!', 24, 226, { size: 38, fill: '#fff', stroke: '#0b3d91', line: 8, align: 'left' });

    const f = s.frame;
    const [label, color] = PHASE[f.paused ? 'paused' : f.phase] ?? PHASE.idle;
    ctx.fillStyle = color;
    roundRect(ctx, 590, 112, 300, 54, 27);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, label, 740, 140, 270, 30, 800);

    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(ctx, 590, 178, 300, 66, 33);
    ctx.fill();
    ctx.drawImage(duckSprite(200), 598, 180, 72, 63);
    outlinedText(ctx, `${fmtInt(f.players)} vịt`, 680, 212, { size: 40, fill: '#fff', stroke: '#0b3d91', line: 7, align: 'left' });

    // Timer.
    const tx = 980;
    const ty = 178;
    const total = s.phaseTotal || 1;
    const left = s.left;
    const counting = f.phase !== 'waiting' && f.phase !== 'idle';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(tx, ty, 72, 0, Math.PI * 2);
    ctx.fill();
    if (counting) {
      ctx.strokeStyle = left <= 5 ? '#ff6b6b' : '#ffe066';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(tx, ty, 66, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(left / total, 0, 1));
      ctx.stroke();
    }
    outlinedText(ctx, counting ? `${Math.ceil(left)}` : '--', tx, ty - 4, { size: left <= 5 && counting ? 70 + Math.sin(t * 12) * 4 : 64, fill: '#fff', stroke: '#0b3d91', line: 8 });
    ctx.font = `700 20px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'center';
    ctx.fillText('GIÂY', tx, ty + 42);

    // Only for the streamer, and only when something is off: a real, connected LIVE needs no label.
    const status = s.settings.testMode ? ['TEST MODE', '#ff922b'] : f.conn ? null : ['MẤT KẾT NỐI', '#868e96'];
    if (status) {
      ctx.fillStyle = status[1];
      roundRect(ctx, 430, 30, 220, 44, 22);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `800 24px ${FONT}`;
      ctx.fillText(status[0], 540, 53);
    }
  }

  // ---------- leaderboard ----------
  // During the race: who is ahead. Otherwise everyone is level, so it shows the champions instead.
  drawBoard(s, t, dt) {
    const ctx = this.ctx;
    const { x, y, w, h } = BOARD;
    const racing = s.frame.phase === 'race' || s.frame.phase === 'sprint';
    this.panel(x, y, w, h);
    ctx.fillStyle = '#ff922b';
    roundRect(ctx, x, y, w, 58, 22);
    ctx.fill();
    ctx.fillRect(x, y + 30, w, 28);
    outlinedText(ctx, racing ? 'BẢNG XẾP HẠNG' : 'TOP VÔ ĐỊCH', x + w / 2, y + 30, { size: 36, fill: '#fff', stroke: '#d9480f', line: 7 });

    const rowH = 53;
    const top = y + 62;
    if (!racing) {
      this.rows.clear();
      const wins = s.rank.wins ?? [];
      if (!wins.length) {
        ctx.fillStyle = '#868e96';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        fitText(ctx, 'Chưa có ai vô địch', x + w / 2, top + rowH * 2.5, w - 40, 30, 700);
      }
      wins.slice(0, 5).forEach((r, i) => {
        const ry = top + i * rowH + rowH / 2;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#495057';
        ctx.font = `900 30px ${FONT}`;
        ctx.fillText(`${i + 1}.`, x + 18, ry);
        ctx.fillStyle = '#212529';
        fitText(ctx, `${r.name}${r.test ? ' (test)' : ''}`, x + 60, ry, w - 170, 30, 800);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#1c7ed6';
        ctx.font = `800 28px ${FONT}`;
        ctx.fillText(`${r.value} lần`, x + w - 16, ry);
      });
      return;
    }

    const race = (s.rank.race ?? []).slice(0, 5);
    const seen = new Set();
    race.forEach((r, i) => {
      seen.add(r.id);
      let row = this.rows.get(r.id);
      const target = top + i * rowH;
      if (!row) {
        row = { y: target + 30, rank: r.rank, flash: 0, dir: 0 };
        this.rows.set(r.id, row);
      }
      if (r.rank !== row.rank) {
        row.dir = r.rank < row.rank ? 1 : -1;
        row.flash = 1;
        row.rank = r.rank;
      }
      row.y += (target - row.y) * Math.min(1, dt * 8);
      row.flash = Math.max(0, row.flash - dt * 1.2);
      row.data = r;
    });
    for (const id of this.rows.keys()) if (!seen.has(id)) this.rows.delete(id);
    ctx.save();
    roundRect(ctx, x, top - 2, w, rowH * 5 + 6, 0);
    ctx.clip();
    for (const row of [...this.rows.values()].sort((a, b) => b.y - a.y)) {
      const r = row.data;
      const ry = row.y;
      if (row.flash > 0) {
        ctx.fillStyle = row.dir > 0 ? `rgba(81,207,102,${row.flash * 0.35})` : `rgba(255,107,107,${row.flash * 0.25})`;
        roundRect(ctx, x + 6, ry + 2, w - 12, rowH - 4, 12);
        ctx.fill();
      } else if (r.rank % 2 === 0) {
        ctx.fillStyle = '#f1f3f5';
        roundRect(ctx, x + 6, ry + 2, w - 12, rowH - 4, 12);
        ctx.fill();
      }
      const medal = ['#fcc419', '#adb5bd', '#e8590c'][r.rank - 1] ?? '#339af0';
      ctx.fillStyle = medal;
      ctx.beginPath();
      ctx.arc(x + 28, ry + rowH / 2, 19, 0, Math.PI * 2);
      ctx.fill();
      outlinedText(ctx, String(r.rank), x + 28, ry + rowH / 2 + 1, { size: 24, fill: '#fff', stroke: 'rgba(0,0,0,0.35)', line: 4 });
      this.face(x + 72, ry + rowH / 2, 21, r.avatar, r.color);
      ctx.fillStyle = '#212529';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      fitText(ctx, r.name, x + 100, ry + 20, 250, 28, 800);
      const prog = clamp(1 - r.left / (s.meters || 500), 0, 1);
      ctx.fillStyle = '#e9ecef';
      roundRect(ctx, x + 100, ry + 39, 250, 7, 4);
      ctx.fill();
      ctx.fillStyle = r.done ? '#40c057' : `hsl(${r.color} 75% 55%)`;
      roundRect(ctx, x + 100, ry + 39, 250 * prog, 7, 4);
      ctx.fill();
      ctx.textAlign = 'right';
      ctx.fillStyle = r.done ? '#2b8a3e' : '#1c7ed6';
      ctx.font = `800 26px ${FONT}`;
      ctx.fillText(r.done ? 'VỀ ĐÍCH' : `${r.left}m`, x + w - 14, ry + rowH / 2);
    }
    ctx.restore();
  }

  // ---------- how to play ----------
  icon(kind, x, y, r) {
    const ctx = this.ctx;
    const colors = { like: '#ff6b81', comment: '#4dabf7', share: '#51cf66', gift: '#cc5de8' };
    ctx.fillStyle = colors[kind];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.save();
    ctx.translate(x, y);
    const k = r / 22;
    ctx.scale(k, k);
    if (kind === 'like') {
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.bezierCurveTo(-16, -2, -10, -14, 0, -6);
      ctx.bezierCurveTo(10, -14, 16, -2, 0, 10);
      ctx.fill();
    } else if (kind === 'comment') {
      roundRect(ctx, -12, -10, 24, 17, 6);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-4, 6);
      ctx.lineTo(-8, 13);
      ctx.lineTo(3, 6);
      ctx.fill();
    } else if (kind === 'share') {
      ctx.beginPath();
      ctx.moveTo(-10, 10);
      ctx.quadraticCurveTo(-8, -4, 6, -4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(4, -11);
      ctx.lineTo(13, -4);
      ctx.lineTo(4, 3);
      ctx.fill();
    } else {
      // A gift box: body, a lid with a gap under it, a ribbon and a bow on top.
      ctx.fillRect(-11, -1, 22, 13);
      ctx.fillRect(-13, -7, 26, 5);
      ctx.beginPath();
      ctx.ellipse(-5, -11, 5, 3.2, -0.5, 0, Math.PI * 2);
      ctx.ellipse(5, -11, 5, 3.2, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.gift;
      ctx.fillRect(-2, -7, 4, 19);
    }
    ctx.restore();
  }

  // Always on screen and big enough to read on a phone: this panel and the gift list are all a new viewer needs.
  drawHowTo(s) {
    const ctx = this.ctx;
    const { x, y, w, h } = HOWTO;
    this.panel(x, y, w, h, 22, 'rgba(16, 42, 67, 0.97)');
    const r = s.settings.rewards ?? {};
    const rows = [
      ['comment', 'COMMENT', `Gõ gì cũng được: +${r.commentMeters ?? 5}m`],
      ['like', 'THẢ TIM', 'Càng nhiều, vịt càng nhanh'],
      ['share', 'SHARE', `+${r.shareMeters ?? 20}m, bay qua vật cản`],
    ];
    const rowH = (h - 16) / rows.length;
    rows.forEach(([kind, title, text], i) => {
      const ry = y + 8 + i * rowH;
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        roundRect(ctx, x + 8, ry, w - 16, rowH, 14);
        ctx.fill();
      }
      this.icon(kind, x + 54, ry + rowH / 2, 38);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffe066';
      fitText(ctx, title, x + 104, ry + rowH / 2 - 20, w - 120, 44, 900);
      ctx.fillStyle = '#fff';
      fitText(ctx, text, x + 104, ry + rowH / 2 + 24, w - 120, 30, 700);
    });
  }

  // Which gift does what: picture, name, how far it sends the duck, and what it costs.
  drawGiftList(s, t) {
    const ctx = this.ctx;
    const gifts = s.settings.gifts ?? [];
    if (!gifts.length) return;
    const { x, y, w, h } = GIFTS;
    const gap = 6;
    const cardW = (w - (gifts.length - 1) * gap) / gifts.length;
    const size = Math.min(92, cardW * 0.4);
    gifts.forEach((gift, i) => {
      const cx = x + i * (cardW + gap);
      this.panel(cx, y, cardW, h, 18, gift.randomSkin ? 'rgba(255,243,191,0.98)' : 'rgba(255,255,255,0.97)');
      const img = this.avatar(gift.icon);
      if (img) ctx.drawImage(img, cx + 5, y + 42, size, size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#212529';
      fitText(ctx, gift.randomSkin ? `${gift.label}: đổi skin` : gift.label, cx + cardW / 2, y + 21, cardW - 12, 28, 800);
      const right = cx + 5 + size + (cardW - size - 10) / 2;
      if (gift.randomSkin) {
        this.drawSkinPreview(s, right, y + 88, cx, cardW, t);
      } else {
        const big = `+${gift.meters}m`;
        outlinedText(ctx, big, right, y + 72, { size: Math.min(42, ((cardW - size - 14) / big.length) * 1.45), fill: '#ffd43b', stroke: '#c2410c', line: 6 });
      }
      ctx.fillStyle = gift.randomSkin ? '#845d00' : '#868e96';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 23px ${FONT}`;
      ctx.fillText(`${gift.coins} xu`, right, y + 116);
    });
  }

  // A little duck trying on every skin in turn: it says what this gift does without any words.
  drawSkinPreview(s, x, y, cardX, cardW, t) {
    const skins = s.settings.skins ?? [];
    if (!skins.length) return;
    const ctx = this.ctx;
    ctx.save();
    roundRect(ctx, cardX, GIFTS.y + 36, cardW, GIFTS.h - 36, 12);
    ctx.clip();
    drawDuck(ctx, { hue: 48, x: x - 2, y: y - 2, scale: 0.56, anim: t * 7, flags: 0, mult: 1, skin: skins[Math.floor(t / 1.1) % skins.length] }, t, s.settings.flags ?? {});
    ctx.restore();
  }

  // What the whole room is working towards. Only the events switched on in the config are shown.
  drawGoal(s, t) {
    const ctx = this.ctx;
    const { x, y, w, h } = GOAL;
    const progress = (s.frame.community.progress ?? []).filter((p) => p.enabled);
    if (!progress.length) return;
    const gap = 8;
    const cardW = (w - (progress.length - 1) * gap) / progress.length;
    progress.forEach((p, i) => {
      const meta = COMMUNITY[p.id];
      const cx = x + i * (cardW + gap);
      const active = p.active > 0;
      this.panel(cx, y, cardW, h, 18, active ? 'rgba(92, 72, 10, 0.97)' : 'rgba(16, 42, 67, 0.97)');
      if (active) {
        ctx.strokeStyle = `rgba(255, 212, 59, ${0.6 + Math.sin(t * 8) * 0.4})`;
        ctx.lineWidth = 4;
        roundRect(ctx, cx, y, cardW, h, 18);
        ctx.stroke();
      }
      const bx = cx + 7;
      const bw = cardW - 14;
      const by = y + 7;
      const bh = h - 14;
      const ratio = clamp(p.value / p.target, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      roundRect(ctx, bx, by, bw, bh, bh / 2);
      ctx.fill();
      ctx.fillStyle = active ? '#ffd43b' : meta.color;
      roundRect(ctx, bx, by, Math.max(ratio > 0 ? bh : 0, bw * (active ? 1 : ratio)), bh, bh / 2);
      ctx.fill();
      const status = active ? 'ĐANG DIỄN RA!' : p.cooldown > 0 ? `quay lại sau ${p.cooldown} giây` : `${fmtInt(p.value)} / ${fmtInt(p.target)} ${meta.unit}`;
      const text = `${meta.title}: ${status}`;
      outlinedText(ctx, text, bx + bw / 2, by + bh / 2, { size: Math.min(30, (bw / text.length) * 1.7), fill: '#fff', stroke: '#102a43', line: 6 });
    });
  }

  // ---------- camera close-up ----------
  // Everything here is in screen space on top of the river: speed lines, a darker edge, a burst when a gift lands,
  // and a caption with who it is and what just happened.
  drawCloseUp(s, camera, view, t) {
    const k = camera.k;
    const shot = camera.last;
    if (k < 0.02 || !shot) return;
    const ctx = this.ctx;
    const look = SHOT[shot.kind === 'gift' ? shot.tier : 'leader'] ?? SHOT.small;
    const duck = s.ducks.get(shot.id);
    ctx.save();
    ctx.beginPath();
    ctx.rect(RIVER.x, RIVER.y, RIVER.w, RIVER.h);
    ctx.clip();

    // Lines racing past.
    ctx.lineCap = 'round';
    for (let i = 0; i < 34; i++) {
      const y = RIVER.y + ((i * 137.5) % RIVER.h);
      const len = 120 + ((i * 53) % 260);
      const x = RIVER.w + 200 - ((t * (1300 + (i % 7) * 170) + i * 211) % (RIVER.w + 600));
      ctx.strokeStyle = `${look.lines}${(0.14 + (i % 3) * 0.13) * k})`;
      ctx.lineWidth = 2 + (i % 3) * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.stroke();
    }
    const cx = RIVER.x + RIVER.w / 2;
    const cy = RIVER.y + RIVER.h / 2;
    const edge = ctx.createRadialGradient(cx, cy, RIVER.h * 0.35, cx, cy, RIVER.h * 0.85);
    edge.addColorStop(0, 'rgba(0, 25, 60, 0)');
    edge.addColorStop(1, `rgba(0, 25, 60, ${0.55 * k})`);
    ctx.fillStyle = edge;
    ctx.fillRect(RIVER.x, RIVER.y, RIVER.w, RIVER.h);

    // A gift lands: a flash and lines bursting out from the duck.
    if (camera.kick > 0 && shot.kind === 'gift' && duck) {
      const dx = cx + (duck.x - view.x) * view.zoom;
      const dy = cy + (duck.y - 30 - view.y) * view.zoom;
      ctx.fillStyle = `${look.lines}${camera.kick * 0.32})`;
      ctx.fillRect(RIVER.x, RIVER.y, RIVER.w, RIVER.h);
      const inner = 150 + (1 - camera.kick) * 260;
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2 + i * 0.37;
        const reach = inner + 180 + (i % 5) * 70;
        ctx.strokeStyle = `${look.lines}${camera.kick * 0.9})`;
        ctx.lineWidth = 3 + (i % 3) * 2.5;
        ctx.beginPath();
        ctx.moveTo(dx + Math.cos(a) * inner, dy + Math.sin(a) * inner);
        ctx.lineTo(dx + Math.cos(a) * reach, dy + Math.sin(a) * reach);
        ctx.stroke();
      }
    }

    // Caption, sliding in from the top of the river.
    const name = duck?.name ?? '';
    const h = 124;
    const y = RIVER.y + 14 - (1 - k) * (h + 30);
    const w = RIVER.w - 32;
    const x = RIVER.x + 16;
    ctx.globalAlpha = Math.min(1, k * 1.4);
    this.panel(x, y, w, h, 34, look.color);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 4;
    roundRect(ctx, x, y, w, h, 34);
    ctx.stroke();
    this.face(x + 66, y + h / 2, 48, duck?.avatar, duck?.hue);
    const left = duck ? Math.max(0, Math.round((1 - duck.pos / s.frame.track) * (s.meters || 500))) : 0;
    const big = shot.skinLabel ?? (shot.kind === 'gift' ? `+${shot.meters}m` : shot.finishing ? 'VỀ ĐÍCH!' : `còn ${left}m`);
    const pop = 1 + camera.kick * 0.25;
    ctx.font = `900 ${66 * pop}px ${FONT}`;
    const bigSize = 66 * pop * Math.min(1, (w * 0.52) / ctx.measureText(big).width);
    ctx.font = `900 ${bigSize}px ${FONT}`;
    const bigW = ctx.measureText(big).width;
    const textW = w - 132 - bigW - 36;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    fitText(ctx, name, x + 128, y + 44, textW, 50, 900);
    ctx.fillStyle = '#fff3bf';
    fitText(ctx, shot.skinLabel ? `${shot.name} · +${shot.meters}m` : shot.kind === 'gift' ? `${shot.name} x${shot.count}` : 'ĐANG DẪN ĐẦU!', x + 128, y + 92, textW, 32, 800);
    outlinedText(ctx, big, x + w - 24, y + h / 2, { size: bigSize, fill: '#ffe066', stroke: look.stroke, line: 10, align: 'right' });
    ctx.restore();
  }

  // ---------- notifications & banners ----------
  drawNotes(now, max) {
    this.flushNotes(now, max);
    const ctx = this.ctx;
    let y = WATER.y + 12;
    for (const n of this.notes) {
      const age = now - n.born;
      const k = Math.min(1, age / 250);
      const out = age > 3200 ? (age - 3200) / 400 : 0;
      const x = 18 - (1 - easeOutBack(k)) * 400 - out * 500;
      ctx.font = `800 30px ${FONT}`;
      const tw = Math.min(820, ctx.measureText(n.text).width);
      const w = tw + 92 + (n.test ? 58 : 0);
      ctx.globalAlpha = 1 - out;
      ctx.fillStyle = NOTE_COLORS[n.kind] ?? '#364fc7';
      roundRect(ctx, x, y, w, 56, 28);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.stroke();
      this.face(x + 29, y + 28, 21, n.avatar, (n.id ?? 0) * 137.508 % 360);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      fitText(ctx, n.text, x + 60, y + 29, 820, 30, 800);
      if (n.test) {
        ctx.fillStyle = '#ffe8cc';
        roundRect(ctx, x + w - 62, y + 16, 50, 24, 8);
        ctx.fill();
        ctx.fillStyle = '#d9480f';
        ctx.font = `900 15px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('TEST', x + w - 37, y + 29);
      }
      ctx.globalAlpha = 1;
      y += 64;
    }
  }

  drawBanners(now) {
    const b = this.banners[0];
    if (!b) return;
    if (!b.born) b.born = now;
    const age = (now - b.born) / 1000;
    const life = b.big ? 2.8 : 2.2;
    if (age > life) {
      this.banners.shift();
      return;
    }
    const ctx = this.ctx;
    const k = easeOutBack(Math.min(1, age / 0.35));
    const fade = age > life - 0.4 ? (life - age) / 0.4 : 1;
    const cx = RIVER.w / 2;
    const cy = WATER.y + WATER.h * 0.42;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, -510, -80, 1020, b.sub ? 180 : 130, 40);
    ctx.fill();
    outlinedText(ctx, b.title, 0, -8, { size: b.big ? 96 : 78, fill: b.color ?? '#ffe066', stroke: '#1d3557', line: 14 });
    if (b.sub) outlinedText(ctx, b.sub, 0, 62, { size: 40, fill: '#fff', stroke: '#1d3557', line: 8 });
    ctx.restore();
  }

  // ---------- phase scenes ----------
  drawJoinCard(s, t) {
    const f = s.frame;
    if (!['waiting', 'registration', 'idle'].includes(f.phase)) return;
    const ctx = this.ctx;
    const cx = W / 2;
    const cy = WATER.y + WATER.h / 2;
    const w = 980;
    const h = 430;
    const pulse = 1 + Math.sin(t * 3) * 0.015;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);
    this.panel(-w / 2, -h / 2, w, h, 36, 'rgba(255,255,255,0.93)');
    if (f.phase === 'idle') {
      outlinedText(ctx, 'GAME ĐANG TẠM NGHỈ', 0, -30, { size: 60, fill: '#ffe066', stroke: '#1864ab', line: 12 });
      ctx.fillStyle = '#495057';
      ctx.font = `700 28px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('Vòng đua mới sẽ bắt đầu sớm!', 0, 50);
      ctx.restore();
      return;
    }
    outlinedText(ctx, 'COMMENT ĐỂ CÓ VỊT!', 0, -h / 2 + 76, { size: 80, fill: '#ffe066', stroke: '#e8590c', line: 13 });
    ctx.fillStyle = '#343a40';
    ctx.font = `800 42px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Gõ gì cũng được, thả tim cũng được', 0, -h / 2 + 158);
    if (f.phase === 'registration') {
      const left = Math.ceil(s.left);
      outlinedText(ctx, `${left}`, 0, h / 2 - 66, { size: 96 + (left <= 3 ? Math.sin(t * 14) * 6 : 0), fill: left <= 3 ? '#ff6b6b' : '#339af0', stroke: '#fff', line: 10 });
      ctx.fillStyle = '#495057';
      ctx.font = `800 34px ${FONT}`;
      ctx.fillText(`${f.players} chú vịt đã sẵn sàng · xuất phát sau`, 0, h / 2 - 140);
    } else {
      ctx.fillStyle = '#495057';
      ctx.font = `800 38px ${FONT}`;
      ctx.fillText('Đang chờ chú vịt đầu tiên...', 0, h / 2 - 96);
    }
    ctx.restore();
  }

  drawSprintEdge(s, t) {
    if (s.frame.phase !== 'sprint') return;
    const ctx = this.ctx;
    ctx.strokeStyle = `rgba(255, 70, 70, ${0.35 + Math.sin(t * 6) * 0.25})`;
    ctx.lineWidth = 10;
    ctx.strokeRect(RIVER.x + 5, RIVER.y + 5, RIVER.w - 10, RIVER.h - 10);
  }

  drawResults(s, t) {
    const f = s.frame;
    const result = s.result;
    if (f.phase !== 'finish' || !result) return;
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(10, 30, 60, 0.86)';
    ctx.fillRect(RIVER.x, RIVER.y, RIVER.w, RIVER.h);
    outlinedText(ctx, `VÒNG ${result.round} KẾT THÚC!`, RIVER.w / 2, RIVER.y + 50, { size: 66, fill: '#ffe066', stroke: '#e8590c', line: 12 });
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    fitText(ctx, `Vòng mới sau ${Math.ceil(s.left)} giây. Comment ngay để giữ chỗ!`, RIVER.w / 2, RIVER.y + 108, RIVER.w - 60, 36, 800);
    const top = result.top;
    const podiumX = RIVER.w / 2;
    const baseY = RIVER.y + 590;
    // Podium blocks: 2nd on the left, 1st in the middle, 3rd on the right.
    for (const [index, px, height, color] of [[1, podiumX - 250, 120, '#ced4da'], [0, podiumX, 170, '#fcc419'], [2, podiumX + 250, 90, '#ff922b']]) {
      const r = top[index];
      if (!r) continue;
      const rise = clamp((s.finishAge - index * 0.3) / 0.6, 0, 1);
      const hh = height * easeOutBack(rise);
      ctx.fillStyle = color;
      roundRect(ctx, px - 105, baseY - hh, 210, hh, 16);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 5;
      ctx.stroke();
      if (rise < 0.95) continue;
      outlinedText(ctx, String(index + 1), px, baseY - hh / 2 + 10, { size: 80, fill: '#fff', stroke: 'rgba(0,0,0,0.3)', line: 8 });
      const hue = r.hue ?? 48;
      const bounce = Math.abs(Math.sin(t * 4 + index)) * 12;
      drawPosedDuck(ctx, Math.round(hue), r.skin, px - 84, baseY - hh - 150 - bounce, 1.75, t);
      if (index === 0) {
        ctx.fillStyle = '#ffd43b';
        ctx.strokeStyle = '#e67700';
        ctx.lineWidth = 4;
        ctx.beginPath();
        const cx = px + 12;
        const cy = baseY - hh - 150 - bounce;
        ctx.moveTo(cx - 34, cy + 16);
        ctx.lineTo(cx - 40, cy - 22);
        ctx.lineTo(cx - 16, cy - 2);
        ctx.lineTo(cx, cy - 30);
        ctx.lineTo(cx + 16, cy - 2);
        ctx.lineTo(cx + 40, cy - 22);
        ctx.lineTo(cx + 34, cy + 16);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      this.face(px, baseY - hh - 186 - bounce - (index === 0 ? 30 : 0), 30, r.avatar, hue);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      outlinedText(ctx, r.name, px, baseY + 30, { size: 30, fill: '#fff', stroke: '#1d3557', line: 7 });
      ctx.font = `700 20px ${FONT}`;
      ctx.fillStyle = '#d0ebff';
      ctx.fillText(r.finished ? `${r.time}s` : `còn ${r.left}m`, px, baseY + 62);
    }
    if (s.winnerWins > 1 && top[0]) {
      outlinedText(ctx, `${top[0].name} đã vô địch ${s.winnerWins} lần!`, podiumX, RIVER.y + 156, { size: 34, fill: '#fff', stroke: '#c92a2a', line: 7 });
    }
    // Places 4–10, in two columns under the podium.
    top.slice(3).forEach((r, i) => {
      const lx = 40 + (i % 4 === i ? 0 : 510);
      const ly = RIVER.y + 694 + (i % 4) * 28;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffe066';
      ctx.font = `900 24px ${FONT}`;
      ctx.fillText(`${i + 4}`, lx, ly);
      ctx.fillStyle = '#fff';
      fitText(ctx, r.name, lx + 40, ly, 300, 24, 800);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#a5d8ff';
      ctx.font = `800 22px ${FONT}`;
      ctx.fillText(r.finished ? `${r.time}s` : `còn ${r.left}m`, lx + 470, ly);
    });
  }

  drawPaused(s) {
    if (!s.frame.paused) return;
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(RIVER.x, RIVER.y, RIVER.w, RIVER.h);
    outlinedText(ctx, 'TẠM DỪNG', RIVER.w / 2, WATER.y + WATER.h / 2, { size: 90, fill: '#fff', stroke: '#1d3557', line: 14 });
  }
}
