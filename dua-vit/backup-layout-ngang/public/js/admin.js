const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const time = (ms) => new Date(ms).toLocaleTimeString('vi-VN');
const PHASES = { idle: 'Đang dừng', waiting: 'Chờ người chơi', registration: 'Đăng ký', race: 'Đang đua', sprint: 'Nước rút', finish: 'Kết thúc' };
const SETTING_LABELS = {
  'game.phases.registration': 'Thời gian đăng ký (giây)',
  'game.phases.race': 'Thời gian đua chính (giây)',
  'game.phases.sprint': 'Thời gian nước rút (giây)',
  'game.phases.finish': 'Thời gian kết thúc (giây)',
  'game.autoNextRound': 'Tự động mở vòng mới',
  'game.maxDucks': 'Số vịt tối đa',
  'game.sound': 'Âm thanh',
  'game.notifications': 'Notification',
  'game.maxNotifications': 'Số notification cùng lúc',
  'balance.baseSpeed': 'Tốc độ cơ bản',
  'balance.rewards.likesPerMeter': 'Số tim = 1 mét',
  'balance.rewards.commentMeters': 'Số mét mỗi comment',
  'balance.rewards.commentCooldownSeconds': 'Giãn cách giữa 2 comment được tính (giây)',
  'balance.rewards.shareMeters': 'Số mét khi share',
  'balance.rewards.maxDashBonus': 'Tốc độ lao tối đa (1.5 = thêm 150%)',
  'balance.maxCommunityBonus': 'Giới hạn buff cộng đồng',
  'balance.community.enabled': 'Bật Community Buff',
  'balance.community.wind.enabled': '· Gió Thuận',
  'balance.community.tsunami.enabled': '· Sóng Thần',
  'balance.community.cheer.enabled': '· Đại Hội Cổ Vũ',
  'balance.community.giftStorm.enabled': '· Cơn Bão Gift',
  'balance.community.giftStorm.gifts': 'Số quà cho Bão Gift (30 giây)',
  'balance.community.tsunami.likes': 'Số like cho Sóng Thần',
  'balance.community.cheer.comments': 'Số comment cho Cổ Vũ (30 giây)',
  'balance.obstacles.enabled': 'Bật vật cản & power-up',
};

let tiers = [];
let byId = {};
let renderedSettings = '';

const say = (text) => ($('log').textContent = text);

async function post(url, body) {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 204) return say('Đã gửi.');
    const data = await res.json().catch(() => ({}));
    say(data.error ?? data.message ?? `HTTP ${res.status}`);
  } catch (err) {
    say(`Lỗi: ${err.message}`);
  }
}

document.querySelectorAll('[data-action]').forEach((button) =>
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'reset' && !confirm('Reset toàn bộ: xóa vịt, tổng tương tác và bảng vô địch?')) return;
    post('/api/control', { action });
  }),
);

document.querySelectorAll('[data-sim]').forEach((button) =>
  button.addEventListener('click', () =>
    post('/api/simulate', {
      kind: button.dataset.sim,
      name: $('sim-name').value,
      count: Number($('sim-count').value),
      text: $('sim-text').value,
      tier: $('sim-tier').value,
      streak: $('sim-streak').checked,
    }),
  ),
);

$('testmode').addEventListener('change', (e) => {
  if (!e.target.checked && !confirm('Tắt TEST MODE: xóa vịt giả lập và chỉ nhận sự kiện LIVE thật?')) {
    e.target.checked = true;
    return;
  }
  post('/api/testmode', { on: e.target.checked });
});

function renderSettings(list) {
  const key = JSON.stringify(list);
  if (key === renderedSettings || document.activeElement?.closest?.('#settings')) return;
  renderedSettings = key;
  $('settings').innerHTML = list
    .map((s) => {
      const input = s.kind === 'boolean'
        ? `<input type="checkbox" data-key="${esc(s.key)}" ${s.value ? 'checked' : ''}>`
        : `<input type="number" data-key="${esc(s.key)}" value="${esc(s.value)}" min="${s.min}" max="${s.max}" step="${s.kind === 'integer' ? 1 : 'any'}">`;
      return `<tr><td>${esc(SETTING_LABELS[s.key] ?? s.key)}<br><span class="muted">${esc(s.key)}</span></td><td>${input}</td></tr>`;
    })
    .join('');
  $('settings').querySelectorAll('input').forEach((input) =>
    input.addEventListener('change', () => post('/api/settings', { key: input.dataset.key, value: input.type === 'checkbox' ? input.checked : Number(input.value) })),
  );
}

function renderGifts(gifts) {
  if (document.activeElement?.closest?.('#gifts')) return;
  if (!gifts.length) {
    $('gifts').innerHTML = '<tr><td class="muted">Chưa nhận quà nào trong phiên này.</td></tr>';
    return;
  }
  $('gifts').innerHTML =
    '<tr><th>Gift ID</th><th>Tên</th><th>💎</th><th>SL</th><th>Nhóm</th></tr>' +
    gifts
      .map((g) => {
        const options = ['<option value="">(theo kim cương)</option>', ...tiers.map((t) => `<option value="${t}" ${byId[g.giftId] === t ? 'selected' : ''}>${t}</option>`)].join('');
        return `<tr><td>${esc(g.giftId)} ${g.source === 'mock' ? '<span class="tag mock">TEST</span>' : ''}</td><td>${esc(g.name)}</td><td>${g.diamonds}</td><td>${g.count}</td><td>${g.giftId ? `<select data-gift="${esc(g.giftId)}">${options}</select>` : esc(g.tier)}</td></tr>`;
      })
      .join('');
  $('gifts').querySelectorAll('select').forEach((select) => select.addEventListener('change', () => post('/api/gift-map', { giftId: select.dataset.gift, tier: select.value || null })));
}

function render(m) {
  const r = m.round;
  $('round').textContent = `Vòng ${r.n} · ${PHASES[r.phase] ?? r.phase}${r.paused ? ' · TẠM DỪNG' : ''}${r.left ? ` · ${Math.ceil(r.left)}s` : ''}`;
  $('testmode').checked = m.testMode;
  $('testbox').classList.toggle('disabled', !m.testMode);
  document.querySelectorAll('#testbox button').forEach((b) => (b.disabled = !m.testMode));
  tiers = m.tiers;
  byId = m.byId ?? {};
  const s = m.stats;
  const t = m.totals;
  $('stats').innerHTML = [
    ['Người chơi', m.players.length],
    ['Sự kiện/giây', s.perSecond],
    ['Đã xử lý (LIVE / TEST)', `${s.live ?? 0} / ${s.mock ?? 0}`],
    ['Trùng bị lọc', s.duplicates],
    ['Đến trễ', s.late],
    ['Hàng đợi (gộp / bỏ)', `${s.queue} (${s.merged} / ${s.dropped})`],
    ['Like · Comment được tính', `${t.likes} · ${t.comments}`],
    ['Share · Quà · 💎', `${t.shares} · ${t.gifts} · ${t.diamonds}`],
  ].map(([label, value]) => `<div class="stat"><span class="muted">${label}</span><b>${esc(value)}</b></div>`).join('');

  $('players').innerHTML =
    '<tr><th>#</th><th>Tên</th><th>%</th><th>Tốc độ</th><th>Mét đã nhận</th><th>❤/💬/↗/🎁</th><th>Hiệu ứng</th></tr>' +
    m.players
      .map((p) => `<tr><td>${p.rank}</td><td>${esc(p.name)} <span class="tag ${p.src}">${p.src === 'mock' ? 'TEST' : 'LIVE'}</span><br><span class="muted">@${esc(p.user)}</span></td><td>${p.finished ? '🏁' : p.progress}</td><td>${p.speed}</td><td>${p.meters}</td><td>${p.likes}/${p.comments}/${p.shares}/${p.gifts}</td><td>${esc(p.buffs.join(', '))}</td></tr>`)
      .join('');

  $('recent').innerHTML =
    '<tr><th>Giờ</th><th>Nguồn</th><th>Loại</th><th>Người</th><th>Chi tiết</th><th>Kết quả</th></tr>' +
    m.recent.map((e) => `<tr><td>${time(e.at)}</td><td><span class="tag ${e.src}">${e.src === 'mock' ? 'TEST' : 'LIVE'}</span></td><td>${e.type}</td><td>${esc(e.user)}</td><td>${esc(e.detail)}</td><td>${esc(e.result)}</td></tr>`).join('');

  $('results').innerHTML = '<tr><th>Vòng</th><th>Vô địch</th><th>Vịt</th></tr>' + m.results.map((x) => `<tr><td>${x.round}${x.test ? ' <span class="tag mock">TEST</span>' : ''}</td><td>${esc(x.top[0]?.name ?? '-')}</td><td>${x.players}</td></tr>`).join('');
  $('wins').innerHTML = '<tr><th>Người chơi</th><th>Số lần thắng</th></tr>' + m.wins.map((w) => `<tr><td>${esc(w.name)}${w.test ? ' <span class="tag mock">TEST</span>' : ''}</td><td>${w.count}</td></tr>`).join('');

  renderSettings(m.settings);
  renderGifts(m.gifts);
}

function renderConnections(c) {
  const live = $('conn-live');
  live.textContent = `TikTok: ${c.live.text}`;
  live.className = `pill ${c.live.connected ? 'on' : 'off'}`;
  const mock = $('conn-mock');
  mock.textContent = `Mock: ${c.mock.text}`;
  mock.className = `pill ${c.mock.connected ? 'on' : 'off'}`;
}

const source = new EventSource('/events?admin=1');
source.onmessage = (msg) => {
  const m = JSON.parse(msg.data);
  if (m.t === 'admin') render(m);
  else if (m.t === 'conn') renderConnections(m.connections);
  else if (m.t === 'scenarios') {
    $('scenarios').innerHTML = m.list.map((s) => `<button class="warn" data-scenario="${esc(s.id)}">${esc(s.label)}</button>`).join('');
    $('scenarios').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => post('/api/scenario', { id: b.dataset.scenario })));
  }
};
source.onerror = () => say('Mất kết nối tới server game, đang thử lại...');
