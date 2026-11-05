// Giao diện vòng quay: bánh xe quay giữa màn hình, thanh trạng thái (đếm ngược, vòng vàng, thời gian sự kiện)
// và khung diễn biến của thi câu nhanh / cá mập. Server đã chốt ô trúng, ở đây chỉ diễn hoạt cảnh.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clock = (ms) => {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const LAND_MS = 1800; // bánh xe dừng trước khi hết giờ quay một đoạn, để kịp đọc kết quả
const TURNS = 6;
const SIZE = 640;
const HUB_ROOM = 72; // bán kính trục giữa cộng khoảng hở, chữ không được lấn vào đây

function drawFace(canvas, slots, golden) {
  const ctx = canvas.getContext('2d');
  const r = SIZE / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.translate(r, r);
  ctx.rotate(-Math.PI / 2); // ô đầu tiên bắt đầu ở đỉnh, đi theo chiều kim đồng hồ
  let from = 0;
  slots.forEach((slot, i) => {
    const sweep = slot.share * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r - 2, from, from + sweep);
    ctx.closePath();
    ctx.fillStyle = golden ? (i % 2 ? '#e8a200' : '#b97800') : slot.color || '#1c7ed6';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = golden ? '#fff3bf' : 'rgba(255, 255, 255, 0.85)';
    ctx.stroke();
    // chữ chạy dọc theo bán kính; ô càng hẹp chữ càng nhỏ để không tràn sang ô bên cạnh
    ctx.save();
    ctx.rotate(from + sweep / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const fontOf = (px) => `800 ${px}px "Baloo 2", "Segoe UI", sans-serif`;
    const text = `${slot.label} ${slot.icon}`;
    const room = r - 22 - HUB_ROOM; // từ mép bánh xe vào tới sát trục giữa
    let font = Math.round(Math.max(23, Math.min(36, 20 + slot.share * 110)));
    ctx.font = fontOf(font);
    const wide = ctx.measureText(text).width;
    if (wide > room) font = Math.floor((font * room) / wide);
    ctx.font = fontOf(font);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.strokeText(text, r - 22, 2);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, r - 22, 2);
    ctx.restore();
    from += sweep;
  });
}

export function createWheelUi({ sfx, onEvent }) {
  const box = $('wheel');
  const face = $('wheel-face');
  face.width = face.height = SIZE;
  const chip = $('wheel-chip');
  const live = $('live');
  let view = null;
  let spin = null;
  let nextAt = 0;
  let endAt = 0;
  let gold = null;
  let chipTick = 1;
  let liveHold = 0;
  let eventId = null;

  function openSpin(s) {
    const start = performance.now() - (s.elapsed ?? 0);
    const slot = s.slots[s.index];
    const before = s.slots.slice(0, s.index).reduce((n, x) => n + x.share, 0);
    // dừng ở một điểm bất kỳ trong ô trúng, tránh sát vạch chia
    const mid = before + slot.share * (0.2 + Math.random() * 0.6);
    spin = { start, runMs: Math.max(1200, s.ms - LAND_MS), target: 360 * TURNS - mid * 360, slots: s.slots, slot, lastSlice: -1, landed: false, golden: s.golden };
    drawFace(face, s.slots, s.golden);
    box.classList.add('on');
    box.classList.toggle('golden', s.golden);
    box.classList.remove('landed');
    $('wheel-title').textContent = s.golden ? '👑 VÒNG QUAY VÀNG 👑' : '🎡 VÒNG QUAY THẦN HỒ';
    $('wheel-who').textContent = s.spinner ? `✨ ${s.spinner.name} đang quay!` : 'Thần Hồ đang quay...';
    $('wheel-result').innerHTML = `<div class="big">${esc(slot.icon)} ${esc(slot.label)}</div><div class="sub">${esc(slot.text)}</div>`;
  }

  function closeSpin() {
    spin = null;
    box.classList.remove('on', 'landed');
  }

  function renderChip() {
    if (!view || !view.auto && view.phase === 'idle') {
      chip.hidden = true;
      return;
    }
    chip.hidden = false;
    const now = performance.now();
    let text;
    let fill = 0;
    let cls = '';
    if (view.phase === 'event' && view.event) {
      const left = endAt - now;
      // số giây đứng trước để câu dài có bị cắt bớt thì vẫn thấy đồng hồ
      text = `${view.event.icon} ${Math.ceil(Math.max(0, left) / 1000)}s · ${view.event.text}`;
      fill = Math.max(0, left / view.event.total);
      cls = 'event';
    } else if (view.phase === 'spin') {
      text = '🎡 Đang quay...';
      fill = 1;
      cls = 'event';
    } else {
      const ready = gold?.ready;
      const left = clock(nextAt - now);
      fill = gold?.goal > 0 ? Math.min(1, gold.likes / gold.goal) : 0;
      if (view.phase === 'warn') {
        text = `${ready ? '👑 VÒNG VÀNG' : '🎡 SẮP QUAY'} · ${left}`;
        cls = ready ? 'warn gold' : 'warn';
      } else if (view.waiting) {
        text = '🎡 Xuống hồ để mở vòng quay';
      } else if (ready) {
        text = `👑 Vòng vàng sau ${left}`;
        cls = 'gold';
      } else if (gold?.goal > 0) {
        text = `🎡 Quay sau ${left} · 💛 ${gold.likes.toLocaleString('vi-VN')}/${gold.goal.toLocaleString('vi-VN')} tim`;
      } else {
        text = `🎡 Quay sau ${left}`;
      }
    }
    $('wheel-chip-text').textContent = text;
    $('wheel-chip-fill').style.width = `${fill * 100}%`;
    chip.className = cls;
  }

  function hideLive() {
    live.classList.remove('on');
  }

  return {
    // just: bước vừa chuyển sang; null khi chỉ là cập nhật hoặc lúc mới tải trang.
    set(v, just = null) {
      view = v;
      if (v.nextIn !== null) nextAt = performance.now() + v.nextIn;
      if (v.gold) gold = v.gold;
      if (v.event) endAt = performance.now() + v.event.left;
      if (v.phase === 'spin' && v.spin) {
        if (!spin) openSpin(v.spin);
      } else if (spin) closeSpin();
      if (just === 'warn') sfx.fanfare(gold?.ready);
      if (just === 'spin') sfx.fanfare(v.spin?.golden);
      const id = v.event?.id ?? null;
      if (id !== eventId) {
        eventId = id;
        onEvent(v.event ?? null, Boolean(just));
      }
      chipTick = 1;
      renderChip();
    },
    setGold(g) {
      gold = g;
      chipTick = 1;
    },
    update(dt) {
      if ((chipTick += dt) > 0.25) {
        chipTick = 0;
        renderChip();
      }
      if (!spin) return;
      const now = performance.now();
      const u = Math.min(1, (now - spin.start) / spin.runMs);
      const rot = spin.target * (1 - (1 - u) ** 4);
      face.style.transform = `rotate(${rot}deg)`;
      // ô đang nằm dưới kim
      const at = ((360 - (rot % 360)) % 360) / 360;
      let sum = 0;
      let slice = 0;
      for (let i = 0; i < spin.slots.length; i++) {
        sum += spin.slots[i].share;
        if (at < sum) {
          slice = i;
          break;
        }
      }
      if (slice !== spin.lastSlice) {
        if (spin.lastSlice >= 0) sfx.tick();
        spin.lastSlice = slice;
      }
      if (u >= 1 && !spin.landed) {
        spin.landed = true;
        box.classList.add('landed');
        sfx.win(spin.golden);
      }
    },
    // Khung diễn biến thi câu nhanh / cá mập.
    setLive(msg) {
      // Vừa có kết quả thì giữ dòng kết quả thêm một lúc: bản tin cuối (hết sự kiện, thanh máu về 0) không được ghi đè.
      if (performance.now() < liveHold && (!msg?.mode || msg.hp === 0)) return;
      if (!msg?.mode) {
        hideLive();
        return;
      }
      clearTimeout(this.liveTimer);
      liveHold = 0;
      live.classList.add('on');
      live.classList.toggle('boss', msg.mode === 'boss');
      $('live-title').textContent = msg.mode === 'boss' ? '🦈 CÁ MẬP VÀO HỒ' : msg.closing ? '⏱️ Đang chốt kết quả...' : '⏱️ THI CÂU NHANH';
      const hasHp = msg.mode === 'boss';
      $('live-hp').hidden = !hasHp;
      if (hasHp) {
        $('live-hp-fill').style.width = `${msg.max ? (msg.hp / msg.max) * 100 : 0}%`;
        $('live-hp-text').textContent = `${msg.hp}/${msg.max}`;
      }
      const unit = msg.mode === 'boss' ? 'điểm' : 'kg';
      const medals = ['🥇', '🥈', '🥉'];
      $('live-top').innerHTML = msg.top.length
        ? msg.top.map((r, i) => `<span>${medals[i]} ${esc(r.name)} <b>${r.n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} ${unit}</b></span>`).join('')
        : `<span>${msg.mode === 'boss' ? 'Mỗi lần giật cá là thêm một nhịp kéo!' : 'Câu nhiều nhất để thắng!'}</span>`;
    },
    // Kết quả cuối, hiện trong khung vì thông báo nhỏ bị ẩn khi camera đang quay cận.
    liveResult(text, ms = 4500) {
      liveHold = performance.now() + ms;
      live.classList.add('on');
      $('live-hp').hidden = true;
      $('live-title').textContent = text;
      $('live-top').innerHTML = '';
      clearTimeout(this.liveTimer);
      this.liveTimer = setTimeout(hideLive, ms);
    },
  };
}
