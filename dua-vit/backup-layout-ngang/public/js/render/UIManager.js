import { BAR, BOARD, FONT, H, HEADER, RIVER, W, WATER, clamp, easeOutBack, fitText, fmtInt, outlinedText, roundRect } from './layout.js';
import { duckSprite } from './DuckRenderer.js';

// Everything around the river: header (A), leaderboard (C), how-to bar (D), notifications (E),
// plus banners, the registration card, the sprint top 3 and the results podium.
const PHASE = {
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
    // Logo.
    ctx.drawImage(duckSprite(48), 14, 2, 104, 91);
    outlinedText(ctx, 'THẢ VỊT', 128, 40, { size: 54, fill: '#ffe066', stroke: '#e8590c', line: 10, align: 'left' });
    outlinedText(ctx, 'ĐẠI CHIẾN DÒNG SÔNG', 132, 78, { size: 22, fill: '#fff', stroke: '#1864ab', line: 6, align: 'left' });

    const f = s.frame;
    const [label, color] = PHASE[f.phase] ?? PHASE.idle;
    // Round + phase.
    const cx = 640;
    outlinedText(ctx, `VÒNG ${Math.max(1, f.round)}`, cx, 32, { size: 30, fill: '#fff', stroke: '#0b3d91', line: 6 });
    ctx.fillStyle = color;
    roundRect(ctx, cx - 100, 52, 200, 34, 17);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `800 21px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(f.paused ? 'TẠM DỪNG' : label, cx, 70);

    // Timer.
    const tx = 900;
    const total = s.phaseTotal || 1;
    const left = s.left;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(tx, 48, 38, 0, Math.PI * 2);
    ctx.fill();
    if (f.phase !== 'waiting' && f.phase !== 'idle') {
      ctx.strokeStyle = left <= 5 ? '#ff6b6b' : '#ffe066';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(tx, 48, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(left / total, 0, 1));
      ctx.stroke();
    }
    const time = f.phase === 'waiting' || f.phase === 'idle' ? '--' : `${Math.ceil(left)}`;
    outlinedText(ctx, time, tx, 50, { size: left <= 5 && f.phase !== 'waiting' ? 40 + Math.sin(t * 12) * 3 : 36, fill: '#fff', stroke: '#0b3d91', line: 6 });
    ctx.font = `700 14px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('GIÂY', tx, 76);

    // Players.
    const px = 1010;
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(ctx, px, 18, 200, 60, 30);
    ctx.fill();
    ctx.drawImage(duckSprite(200), px + 6, 18, 66, 58);
    outlinedText(ctx, fmtInt(f.players), px + 80, 40, { size: 32, fill: '#fff', stroke: '#0b3d91', line: 6, align: 'left' });
    ctx.font = `700 16px ${FONT}`;
    ctx.fillStyle = '#d0ebff';
    ctx.textAlign = 'left';
    ctx.fillText('VỊT THAM GIA', px + 80, 66);

    // Source status and community bonus.
    const live = s.settings.testMode ? ['TEST MODE', '#ff922b'] : f.conn ? ['LIVE', '#fa5252'] : ['MẤT KẾT NỐI', '#868e96'];
    const lx = 1240;
    ctx.fillStyle = live[1];
    roundRect(ctx, lx, 22, 170, 52, 26);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(lx + 26, 48, 7 + (live[0] === 'LIVE' ? Math.sin(t * 6) * 2 : 0), 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `800 ${live[0].length > 6 ? 20 : 26}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(live[0], lx + 98, 49);

    outlinedText(ctx, 'VỀ ĐÍCH TRƯỚC LÀ THẮNG!', 1670, 49, { size: 34, fill: '#ffe066', stroke: '#0b3d91', line: 7 });
  }

  // ---------- leaderboard ----------
  drawBoard(s, t, dt) {
    const ctx = this.ctx;
    const { x, y, w, h } = BOARD;
    this.panel(x, y, w, h);
    ctx.fillStyle = '#ff922b';
    roundRect(ctx, x, y, w, 54, 22);
    ctx.fill();
    ctx.fillRect(x, y + 30, w, 24);
    outlinedText(ctx, 'BẢNG XẾP HẠNG', x + w / 2, y + 28, { size: 30, fill: '#fff', stroke: '#d9480f', line: 6 });

    const race = s.rank.race ?? [];
    const rowH = 50;
    const top = y + 62;
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
    if (!race.length) {
      ctx.fillStyle = '#868e96';
      ctx.font = `700 22px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('Chưa có vịt nào trên sông', x + w / 2, top + 120);
      ctx.font = `600 18px ${FONT}`;
      ctx.fillText('Comment gì cũng được để thả vịt!', x + w / 2, top + 152);
    }
    ctx.save();
    roundRect(ctx, x, top - 4, w, rowH * 10 + 8, 0);
    ctx.clip();
    for (const row of [...this.rows.values()].sort((a, b) => b.y - a.y)) {
      const r = row.data;
      const ry = row.y;
      if (row.flash > 0) {
        ctx.fillStyle = row.dir > 0 ? `rgba(81,207,102,${row.flash * 0.35})` : `rgba(255,107,107,${row.flash * 0.25})`;
        roundRect(ctx, x + 8, ry + 2, w - 16, rowH - 4, 12);
        ctx.fill();
      } else if (r.rank % 2 === 0) {
        ctx.fillStyle = '#f1f3f5';
        roundRect(ctx, x + 8, ry + 2, w - 16, rowH - 4, 12);
        ctx.fill();
      }
      const medal = ['#fcc419', '#adb5bd', '#e8590c'][r.rank - 1] ?? '#339af0';
      ctx.fillStyle = medal;
      ctx.beginPath();
      ctx.arc(x + 32, ry + rowH / 2, 17, 0, Math.PI * 2);
      ctx.fill();
      outlinedText(ctx, String(r.rank), x + 32, ry + rowH / 2 + 1, { size: 20, fill: '#fff', stroke: 'rgba(0,0,0,0.35)', line: 4 });
      this.face(x + 74, ry + rowH / 2, 19, r.avatar, r.color);
      ctx.fillStyle = '#212529';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      fitText(ctx, r.name, x + 102, ry + 17, 180, 23, 800);
      if (r.test) {
        ctx.fillStyle = '#ff922b';
        ctx.font = `800 11px ${FONT}`;
        ctx.fillText('TEST', x + 102, ry + 38);
      }
      const prog = clamp(1 - r.left / (s.meters || 500), 0, 1);
      ctx.fillStyle = '#e9ecef';
      roundRect(ctx, x + (r.test ? 136 : 102), ry + 33, r.test ? 146 : 180, 7, 4);
      ctx.fill();
      ctx.fillStyle = r.done ? '#40c057' : `hsl(${r.color} 75% 55%)`;
      roundRect(ctx, x + (r.test ? 136 : 102), ry + 33, (r.test ? 146 : 180) * prog, 7, 4);
      ctx.fill();
      ctx.textAlign = 'right';
      ctx.fillStyle = r.done ? '#2b8a3e' : '#1c7ed6';
      ctx.font = `800 22px ${FONT}`;
      ctx.fillText(r.done ? 'VỀ ĐÍCH' : `còn ${r.left}m`, x + w - 14, ry + rowH / 2);
    }
    ctx.restore();

    // Viewers who keep coming back see their name here.
    const by = top + rowH * 10 + 14;
    const bh = y + h - by - 10;
    ctx.fillStyle = '#e7f5ff';
    roundRect(ctx, x + 10, by, w - 20, bh, 16);
    ctx.fill();
    ctx.fillStyle = '#1864ab';
    ctx.font = `900 21px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('TOP VÔ ĐỊCH', x + 24, by + 22);
    const list = s.rank.wins ?? [];
    if (!list.length) {
      ctx.fillStyle = '#74c0fc';
      ctx.font = `700 17px ${FONT}`;
      ctx.fillText('Chưa có ai vô địch', x + 24, by + 60);
    }
    list.slice(0, 5).forEach((r, i) => {
      const ry = by + 50 + i * 30;
      ctx.fillStyle = '#495057';
      ctx.font = `800 18px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}.`, x + 24, ry);
      ctx.fillStyle = '#212529';
      fitText(ctx, `${r.name}${r.test ? ' (test)' : ''}`, x + 52, ry, 200, 18, 700);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#1c7ed6';
      ctx.font = `800 18px ${FONT}`;
      ctx.fillText(`${r.value} lần`, x + w - 24, ry);
    });
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

  // Always on screen and big enough to read on a phone: everything a new viewer needs is in this one bar.
  drawHowTo(s, t) {
    const ctx = this.ctx;
    const { x, y, w, h } = BAR;
    this.panel(x, y, w, h, 24, 'rgba(16, 42, 67, 0.94)');
    const r = s.settings.rewards ?? {};
    const gifts = s.settings.giftMeters ?? [];
    const cells = [
      ['comment', 'COMMENT', `Gõ gì cũng được: +${r.commentMeters ?? 5}m`],
      ['like', 'THẢ TIM', 'Càng nhiều, vịt càng nhanh'],
      ['share', 'SHARE', `+${r.shareMeters ?? 20}m, bay qua vật cản`],
      ['gift', gifts.length ? `+${Math.min(...gifts)}m đến +${Math.max(...gifts)}m` : '', 'Vịt lao vút lên'],
    ];
    const cellW = 350;
    cells.forEach(([kind, title, text], i) => {
      const cx = x + 12 + i * cellW;
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      roundRect(ctx, cx, y + 12, cellW - 10, h - 24, 18);
      ctx.fill();
      this.icon(kind, cx + 50, y + h / 2, 36);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffe066';
      fitText(ctx, title, cx + 98, y + 58, cellW - 118, 38, 900);
      ctx.fillStyle = '#fff';
      fitText(ctx, text, cx + 98, y + 104, cellW - 118, 25, 700);
    });

    // What the whole room is working towards. Only the events switched on in the config are shown.
    const progress = (s.frame.community.progress ?? []).filter((p) => p.enabled);
    const mx = x + 12 + cells.length * cellW;
    const cardW = progress.length ? (x + w - mx - 12 - (progress.length - 1) * 10) / progress.length : 0;
    progress.forEach((p, i) => {
      const meta = COMMUNITY[p.id];
      const cx = mx + i * (cardW + 10);
      const cy = y + 12;
      const active = p.active > 0;
      ctx.fillStyle = active ? 'rgba(255, 212, 59, 0.22)' : 'rgba(255,255,255,0.07)';
      roundRect(ctx, cx, cy, cardW, h - 24, 18);
      ctx.fill();
      if (active) {
        ctx.strokeStyle = `rgba(255, 212, 59, ${0.6 + Math.sin(t * 8) * 0.4})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.fillStyle = meta.color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      fitText(ctx, meta.title, cx + 16, cy + 28, cardW - 32, 32, 900);
      const ratio = clamp(p.value / p.target, 0, 1);
      const bx = cx + 16;
      const bw = cardW - 32;
      const by = cy + 52;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      roundRect(ctx, bx, by, bw, 24, 12);
      ctx.fill();
      ctx.fillStyle = active ? '#ffd43b' : meta.color;
      roundRect(ctx, bx, by, Math.max(ratio > 0 ? 24 : 0, bw * (active ? 1 : ratio)), 24, 12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      const status = active ? 'ĐANG DIỄN RA!' : p.cooldown > 0 ? `Quay lại sau ${p.cooldown} giây` : `${fmtInt(p.value)} / ${fmtInt(p.target)} ${meta.unit}`;
      fitText(ctx, status, bx, by + 50, bw, 26, 800);
    });
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
      ctx.font = `800 24px ${FONT}`;
      const tw = Math.min(600, ctx.measureText(n.text).width);
      const w = tw + 82 + (n.test ? 58 : 0);
      ctx.globalAlpha = 1 - out;
      ctx.fillStyle = NOTE_COLORS[n.kind] ?? '#364fc7';
      roundRect(ctx, x, y, w, 46, 23);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.stroke();
      this.face(x + 24, y + 23, 17, n.avatar, (n.id ?? 0) * 137.508 % 360);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      fitText(ctx, n.text, x + 50, y + 24, 600, 24, 800);
      if (n.test) {
        ctx.fillStyle = '#ffe8cc';
        roundRect(ctx, x + w - 62, y + 11, 50, 24, 8);
        ctx.fill();
        ctx.fillStyle = '#d9480f';
        ctx.font = `900 15px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('TEST', x + w - 37, y + 24);
      }
      ctx.globalAlpha = 1;
      y += 54;
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
    roundRect(ctx, -560, -70, 1120, b.sub ? 150 : 120, 40);
    ctx.fill();
    outlinedText(ctx, b.title, 0, -6, { size: b.big ? 84 : 68, fill: b.color ?? '#ffe066', stroke: '#1d3557', line: 14 });
    if (b.sub) outlinedText(ctx, b.sub, 0, 54, { size: 30, fill: '#fff', stroke: '#1d3557', line: 7 });
    ctx.restore();
  }

  // ---------- phase scenes ----------
  drawJoinCard(s, t) {
    const f = s.frame;
    if (!['waiting', 'registration', 'idle'].includes(f.phase)) return;
    const ctx = this.ctx;
    const cx = 790;
    const cy = WATER.y + WATER.h / 2;
    const w = 860;
    const h = 330;
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
    outlinedText(ctx, 'COMMENT ĐỂ CÓ VỊT!', 0, -h / 2 + 66, { size: 70, fill: '#ffe066', stroke: '#e8590c', line: 12 });
    ctx.fillStyle = '#343a40';
    ctx.font = `800 36px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Gõ gì cũng được, thả tim cũng được', 0, -h / 2 + 136);
    if (f.phase === 'registration') {
      const left = Math.ceil(s.left);
      outlinedText(ctx, `${left}`, 0, h / 2 - 62, { size: 76 + (left <= 3 ? Math.sin(t * 14) * 6 : 0), fill: left <= 3 ? '#ff6b6b' : '#339af0', stroke: '#fff', line: 10 });
      ctx.fillStyle = '#495057';
      ctx.font = `800 24px ${FONT}`;
      ctx.fillText(`${f.players} chú vịt đã sẵn sàng · xuất phát sau`, 0, h / 2 - 118);
    } else {
      ctx.fillStyle = '#495057';
      ctx.font = `800 28px ${FONT}`;
      ctx.fillText('Đang chờ chú vịt đầu tiên...', 0, h / 2 - 70);
    }
    ctx.restore();
  }

  drawTop3(s, t) {
    if (s.frame.phase !== 'sprint') return;
    const ctx = this.ctx;
    const race = (s.rank.race ?? []).slice(0, 3);
    if (!race.length) return;
    const y = RIVER.y + 6;
    const w = 330;
    const x0 = RIVER.w / 2 - (race.length * (w + 14)) / 2;
    race.forEach((r, i) => {
      const x = x0 + i * (w + 14);
      ctx.fillStyle = ['#fcc419', '#dee2e6', '#ff922b'][i];
      roundRect(ctx, x, y, w, 52, 26);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
      outlinedText(ctx, `#${i + 1}`, x + 30, y + 27, { size: 26, fill: '#fff', stroke: 'rgba(0,0,0,0.4)', line: 5 });
      this.face(x + 76, y + 26, 20, r.avatar, r.color);
      ctx.fillStyle = '#212529';
      ctx.textAlign = 'left';
      fitText(ctx, r.name, x + 104, y + 27, 130, 22, 900);
      ctx.textAlign = 'right';
      ctx.font = `800 18px ${FONT}`;
      ctx.fillText(r.done ? 'VỀ ĐÍCH' : `${r.left}m`, x + w - 16, y + 27);
    });
    // Pulsing red edge for the sprint.
    ctx.strokeStyle = `rgba(255, 70, 70, ${0.35 + Math.sin(t * 6) * 0.25})`;
    ctx.lineWidth = 10;
    ctx.strokeRect(RIVER.x + 5, RIVER.y + 5, RIVER.w - 10, RIVER.h - 10);
  }

  drawResults(s, t) {
    const f = s.frame;
    const result = s.result;
    if (f.phase !== 'finish' || !result) return;
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(10, 30, 60, 0.62)';
    ctx.fillRect(RIVER.x, RIVER.y, RIVER.w, RIVER.h);
    outlinedText(ctx, `VÒNG ${result.round} KẾT THÚC!`, RIVER.w / 2, RIVER.y + 64, { size: 58, fill: '#ffe066', stroke: '#e8590c', line: 12 });
    const top = result.top;
    const podiumX = 520;
    const baseY = RIVER.y + 640;
    // Podium blocks: 2nd on the left, 1st in the middle, 3rd on the right.
    for (const [index, px, height, color] of [[1, podiumX - 250, 170, '#ced4da'], [0, podiumX, 230, '#fcc419'], [2, podiumX + 250, 130, '#ff922b']]) {
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
      ctx.drawImage(duckSprite(Math.round(hue)), px - 84, baseY - hh - 150 - bounce, 168, 147);
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
      outlinedText(ctx, `${top[0].name} đã vô địch ${s.winnerWins} lần!`, podiumX, RIVER.y + 130, { size: 32, fill: '#fff', stroke: '#c92a2a', line: 7 });
    }
    // Places 4–10.
    const lx = 960;
    let ly = RIVER.y + 150;
    this.panel(lx, ly - 16, 480, 460, 24, 'rgba(255,255,255,0.95)');
    ctx.fillStyle = '#1864ab';
    ctx.font = `900 28px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('TOP 10', lx + 24, ly + 18);
    ly += 52;
    top.forEach((r, i) => {
      ctx.fillStyle = i < 3 ? '#e67700' : '#495057';
      ctx.font = `900 22px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}`, lx + 24, ly);
      ctx.fillStyle = '#212529';
      fitText(ctx, r.name, lx + 64, ly, 230, 22, 800);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#1c7ed6';
      ctx.font = `800 19px ${FONT}`;
      ctx.fillText(r.finished ? `${r.time}s` : `còn ${r.left}m`, lx + 456, ly);
      ly += 38;
    });
    ctx.fillStyle = '#fff';
    ctx.font = `800 26px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`Vòng mới sau ${Math.ceil(s.left)} giây. Comment ngay để giữ chỗ!`, RIVER.w / 2, RIVER.y + RIVER.h - 40);
  }

  drawPaused(s) {
    if (!s.frame.paused) return;
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(RIVER.x, RIVER.y, RIVER.w, RIVER.h);
    outlinedText(ctx, 'TẠM DỪNG', RIVER.w / 2, H / 2 - 40, { size: 90, fill: '#fff', stroke: '#1d3557', line: 14 });
  }
}
