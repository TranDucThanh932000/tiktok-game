// Lớp chữ trên màn hình (toạ độ khung 1080x1920): name tag, banner người biểu diễn,
// hàng chờ, số người trên sàn, thông báo quà. Nửa dưới để trống cho bình luận TikTok.
import * as THREE from 'three';

const W = 1080;
const H = 1920;
const tmp = new THREE.Vector3();

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class Hud {
  constructor(root, config) {
    this.root = root;
    this.config = config;
    this.tiers = new Map(config.tiers.map((t) => [t.tier, t]));
    this.tagLayer = root.querySelector('#tags');
    this.tagEls = new Map();
    this.banner = root.querySelector('#banner');
    this.nextEl = root.querySelector('#next');
    this.countEl = root.querySelector('#count');
    this.toastsEl = root.querySelector('#toasts');
    this.heartsEl = root.querySelector('#hearts');
    this.debugEl = root.querySelector('#debug');
    this.performing = false;
    this.showTags = config.display?.nameTags !== false;

    const kw = config.join.keywords[0] ?? 'hey';
    root.querySelector('#join-hint').innerHTML = `💬 Comment <b>${esc(kw)}</b> để lên sàn nhảy`;
    root.querySelector('#tier-row').innerHTML = config.tiers
      .map((t) => `<span class="chip" style="--c:${t.color}">${t.icon ? `<img src="${esc(t.icon)}" alt="${esc(t.gift ?? '')}">` : `<b>${t.minCoins} xu</b>`} ${esc(t.name)}</span>`)
      .join('');
    const sg = config.swapGift;
    const swapEl = root.querySelector('#swap-hint');
    if (swapEl) {
      swapEl.hidden = !sg?.enabled;
      if (sg?.enabled) {
        swapEl.style.setProperty('--c', sg.color ?? '#25f4ee');
        swapEl.innerHTML = `${sg.icon ? `<img src="${esc(sg.icon)}" alt="${esc(sg.gift ?? '')}">` : '🎁'} Tặng <b>${esc(sg.gift ?? 'TikTok')}</b> để ${esc((sg.label ?? 'đổi nhân vật').toLowerCase())}`;
      }
    }
  }

  // ---------- Name tag ----------

  updateTags(list, camera) {
    if (!this.showTags) return;
    const seen = new Set();
    for (const t of list) {
      seen.add(t.id);
      let el = this.tagEls.get(t.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'tag';
        el.textContent = t.name;
        this.tagLayer.appendChild(el);
        this.tagEls.set(t.id, el);
      }
      if (el.textContent !== t.name) el.textContent = t.name;
      tmp.set(t.x, t.y + 0.1, t.z).project(camera);
      const visible = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && tmp.y > -1.1 && tmp.y < 1.1;
      if (!visible) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = '';
      const x = ((tmp.x + 1) / 2) * W;
      const y = ((1 - tmp.y) / 2) * H;
      const dist = camera.position.distanceTo(tmp.set(t.x, t.y, t.z));
      const scale = Math.max(0.55, Math.min(1.5, 9 / dist));
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
      el.style.zIndex = String(1000 - Math.round(dist * 10));
      el.classList.toggle('performer', t.performer);
      el.classList.toggle('fresh', t.fresh && !t.performer);
      el.classList.toggle('dim', this.performing && !t.performer && !t.crew);
      el.classList.toggle('crew', Boolean(t.crew));
    }
    for (const [id, el] of this.tagEls) {
      if (!seen.has(id)) {
        el.remove();
        this.tagEls.delete(id);
      }
    }
  }

  // ---------- Banner ----------

  showBanner(session, choreo) {
    const tier = this.tiers.get(session.tier);
    this.performing = true;
    const avatar = session.avatar ? `<img src="${esc(session.avatar)}" alt="" referrerpolicy="no-referrer">` : '';
    this.banner.style.setProperty('--c', tier.color);
    this.banner.innerHTML = `
      <div class="b-tier">★ ${esc(tier.name.toUpperCase())} ★</div>
      <div class="b-main">${avatar}<span class="b-name">${esc(session.name)}</span></div>
      <div class="b-sub">${esc(choreo.name)} · ${session.coins} xu</div>`;
    this.banner.classList.remove('show', 'compact');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    this.root.classList.add('performing');
    clearTimeout(this.compactTimer);
    // Sau vài giây thu gọn banner lên trên cùng để không che người biểu diễn.
    this.compactTimer = setTimeout(() => this.banner.classList.add('compact'), 3800);
  }

  hideBanner() {
    this.performing = false;
    clearTimeout(this.compactTimer);
    this.root.classList.remove('performing');
    this.banner.classList.remove('show', 'compact');
  }

  // ---------- Hàng chờ ----------

  updateState(state) {
    const lines = [];
    if (state.queue.length) {
      lines.push('<div class="n-title">🎤 Lượt diễn tiếp theo</div>');
      for (const r of state.queue.slice(0, 3)) {
        const tier = this.tiers.get(r.tier);
        lines.push(`<div class="n-row"><span class="dot" style="--c:${tier.color}"></span>${esc(r.name)} <i style="color:${tier.color}">${esc(tier.name)}</i></div>`);
      }
      if (state.queueLength > 3) lines.push(`<div class="n-more">+${state.queueLength - 3} lượt nữa</div>`);
    }
    this.nextEl.innerHTML = lines.join('');
    this.nextEl.classList.toggle('show', lines.length > 0);
    const waiting = state.waitlist.count ? ` · ⏳ ${state.waitlist.count} chờ vào` : '';
    this.countEl.innerHTML = `🕺 ${state.dancers.length}/${state.maxDancers}${waiting}`;
  }

  // ---------- Thông báo ----------

  toast(html, color = '#ffd166', ms = 4200) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.setProperty('--c', color);
    el.innerHTML = html;
    this.toastsEl.prepend(el);
    while (this.toastsEl.children.length > 4) this.toastsEl.lastChild.remove();
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 600);
  }

  giftToast(d) {
    const tierColor = [...this.tiers.values()].reduce((c, t) => (d.coins >= t.minCoins ? t.color : c), this.config.tiers[0].color);
    this.toast(`🎁 <b>${esc(d.name)}</b> tặng ${esc(d.giftName || 'quà')}${d.units > 1 ? ` x${d.units}` : ''} <span class="coins">+${d.coins}</span>`, tierColor);
  }

  hearts(count) {
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'heart';
      el.textContent = ['💖', '💜', '💙', '🩷'][Math.floor(Math.random() * 4)];
      el.style.left = `${880 + Math.random() * 120}px`;
      el.style.animationDelay = `${i * 0.12}s`;
      this.heartsEl.appendChild(el);
      setTimeout(() => el.remove(), 3200);
    }
  }

  debug(text) {
    this.debugEl.textContent = text;
  }
}
