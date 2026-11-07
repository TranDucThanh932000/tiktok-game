import { DEMO_VIEWERS, GIFT_PRESETS, JOB_MS, LIKE_THRESHOLD, QUALITY_TIERS, TIMING } from './rules.js';
import { coverRect, imageUrl, loadImage, PortraitRenderer } from './portrait.js';
import { GameSound, soundsForChange } from './sound.js';

const $ = id => document.getElementById(id);
const number = value => new Intl.NumberFormat('en-US').format(value);
const stage = $('stage');
const viewport = document.querySelector('.stage-viewport');
let state = null;
let receivedAt = performance.now();
let displayJob = null;
let serverOnline = false;
let busy = false;
let customViewer = null;
let queueSignature = '';
let historySignature = '';
let activitySignature = '';
let toastTimer;

const isOverlay = new URLSearchParams(location.search).get('overlay') === '1';
if (isOverlay) document.body.classList.add('overlay');
// Only the LIVE window plays by default, so the control page open beside it does not double the sound.
const sound = new GameSound({ enabled: isOverlay });
sound.wake();
addEventListener('pointerdown', () => sound.wake());
addEventListener('click', event => {
  if (event.target.closest('button')) sound.play('tap');
});
let heardJob = null;
let heardSettled = 0;
let heardDrawing = false;
let chimedJob = null;

function playMarbles(drawing, progress) {
  const id = displayJob?.id ?? null;
  if (id !== heardJob) {
    heardJob = id;
    heardSettled = 0;
    heardDrawing = false;
  }
  const landed = renderer.settled - heardSettled;
  heardSettled = renderer.settled;
  if (!id) return;
  if (drawing) {
    heardDrawing = true;
    if (!state.paused && serverOnline) sound.land(landed, displayJob.quality.columns);
  }
  // Reloading the page during the reveal must not ring again.
  if (progress === 1 && heardDrawing && chimedJob !== id) {
    chimedJob = id;
    sound.play('done');
    if (displayJob.viewer.source !== 'sample') sound.play('box');
  }
}
new ResizeObserver(([entry]) => stage.style.setProperty('--stage-scale', String(entry.contentRect.width / 540))).observe(viewport);

function element(tag, className = '', text = '') {
  const result = document.createElement(tag);
  result.className = className;
  result.textContent = text;
  return result;
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 7000);
}

function report(error) {
  console.error('[Factory]', error);
  toast(error.message || 'Something went wrong. Try again.');
}

function avatar(viewer) {
  const node = element('div', 'avatar', Array.from(viewer.nickname ?? '?').slice(0, 1).join(''));
  const source = imageUrl(viewer.avatar);
  if (source) {
    const image = new Image();
    image.alt = viewer.nickname;
    image.src = source;
    image.addEventListener('error', () => {
      image.remove();
      node.title = `${viewer.nickname}: photo unavailable. Initials only.`;
    }, { once: true });
    node.append(image);
  }
  return node;
}

const renderer = new PortraitRenderer($('portrait'), message => {
  $('avatar-notice').textContent = message;
  $('avatar-notice').hidden = false;
  toast(message);
});

async function api(path, body = {}) {
  const response = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

function refreshControls() {
  const live = state && state.connection.phase !== 'idle';
  const unavailable = busy || !serverOnline;
  $('connect-button').disabled = unavailable || live;
  $('username').disabled = unavailable || live;
  $('disconnect-button').hidden = !live;
  $('disconnect-button').disabled = unavailable;
  $('demo-locked').hidden = !live;
  $('pause-button').disabled = unavailable;
  for (const button of document.querySelectorAll('.demo-card button, .demo-card select, #reset-demo')) button.disabled = unavailable || live;
  $('avatar-file').disabled = unavailable || live;
  $('pause-button').setAttribute('aria-pressed', String(Boolean(state?.paused)));
  $('pause-button').textContent = state?.paused ? '▶ Play' : 'Ⅱ Pause';
}

async function action(callback) {
  if (busy || !serverOnline) return toast('Not ready. Try again.');
  busy = true;
  refreshControls();
  try { await callback(); }
  catch (error) { report(error); }
  finally {
    busy = false;
    refreshControls();
  }
}

function selectedViewer() {
  return $('demo-viewer').value === 'custom' ? customViewer : DEMO_VIEWERS.find(viewer => viewer.userId === $('demo-viewer').value);
}

function updateViewer() {
  const viewer = selectedViewer();
  $('demo-avatar').replaceChildren();
  if (viewer) {
    const image = avatar(viewer);
    $('demo-avatar').replaceChildren(...image.childNodes);
  }
  $('custom-fields').hidden = $('demo-viewer').value !== 'custom';
  $('like-hint').textContent = `${LIKE_THRESHOLD} likes = 1 turn.`;
}

for (const viewer of DEMO_VIEWERS) {
  const option = element('option', '', viewer.nickname);
  option.value = viewer.userId;
  $('demo-viewer').append(option);
}
$('demo-viewer').addEventListener('change', updateViewer);
updateViewer();

function simulate(kind, count, giftId) {
  return action(async () => {
    const custom = $('demo-viewer').value === 'custom';
    const result = await api('/api/demo', {
      kind, count, giftId, viewerId: $('demo-viewer').value,
      ...(custom ? { customName: $('custom-name').value, customAvatar: customViewer?.avatar } : {}),
    });
    receive(result.state);
    if (kind === 'like') $('like-hint').textContent = `${result.tickets ? `+${result.tickets} ${result.tickets === 1 ? 'turn' : 'turns'} · ` : ''}${result.remainder}/${LIKE_THRESHOLD} likes`;
  });
}

// Real TikTok gift images, the same set the other games use.
const giftImages = { rose: '/gifts/rose.webp', heart: '/gifts/finger-heart.webp', pig: '/gifts/lucky-pig.webp' };
const giftIcon = id => {
  const image = element('img', 'gift-icon');
  image.src = giftImages[id];
  image.alt = '';
  image.draggable = false;
  return image;
};
for (const gift of GIFT_PRESETS) {
  const quality = QUALITY_TIERS.find(tier => tier.id === gift.id);
  const button = element('button', 'gift-button');
  button.type = 'button';
  button.dataset.gift = gift.id;
  button.setAttribute('aria-label', `Send ${gift.name}, ${quality.columns} × ${quality.columns} balls`);
  const info = element('span', 'gift-info');
  info.append(element('strong', '', gift.name), element('small', '', quality.label));
  const detail = element('span', 'gift-quality');
  detail.append(element('span', '', `${quality.columns} × ${quality.columns}`));
  button.append(giftIcon(gift.id), info, detail);
  button.addEventListener('click', () => simulate('gift', Number($('gift-repeat').value), gift.id));
  $('gift-buttons').append(button);
  const tile = element('li', 'gift-tile');
  tile.dataset.tier = gift.id;
  const meta = element('div', 'gift-meta');
  meta.append(element('small', '', `${quality.columns} × ${quality.columns}`));
  tile.append(giftIcon(gift.id), element('strong', '', gift.name), meta);
  $('stage-gifts').append(tile);
}

$('sound-toggle').checked = sound.enabled;
$('sound-toggle').addEventListener('change', event => sound.setEnabled(event.target.checked));
$('sample-toggle').addEventListener('change', event => action(async () => {
  receive(await api('/api/samples', { on: event.target.checked }));
}));
$('like-ten').addEventListener('click', () => simulate('like', 10));
$('like-fifty').addEventListener('click', () => simulate('like', 50));
$('connect-form').addEventListener('submit', event => {
  event.preventDefault();
  void action(async () => receive(await api('/api/connect', { username: $('username').value })));
});
$('disconnect-button').addEventListener('click', () => action(async () => receive(await api('/api/disconnect'))));
$('pause-button').addEventListener('click', () => action(async () => receive(await api('/api/pause', { paused: !state.paused }))));
$('reset-demo').addEventListener('click', () => action(async () => {
  receive(await api('/api/demo/reset'));
  updateViewer();
  toast('Test cleared.');
}));

$('avatar-file').addEventListener('change', () => action(async () => {
  const file = $('avatar-file').files[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8_000_000) throw new Error('Use PNG, JPEG or WebP. Max 8 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const crop = coverRect(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    context.fillStyle = '#faf3e1';
    context.fillRect(0, 0, 256, 256);
    context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, 256, 256);
    customViewer = { userId: 'custom', nickname: $('custom-name').value, avatar: canvas.toDataURL('image/jpeg', .88) };
    if (!$('demo-viewer').querySelector('option[value="custom"]')) {
      const option = element('option', '', 'Your photo');
      option.value = 'custom';
      $('demo-viewer').append(option);
    }
    $('demo-viewer').value = 'custom';
    updateViewer();
  } finally {
    URL.revokeObjectURL(url);
    $('avatar-file').value = '';
  }
}));
$('custom-name').addEventListener('input', () => { if (customViewer) customViewer.nickname = $('custom-name').value; });

function updateQueue(next) {
  const signature = next.queue.slice(0, 3).map(batch => `${batch.id}:${batch.remaining}`).join('|');
  if (signature === queueSignature && $('stage-queue').childElementCount) return;
  queueSignature = signature;
  const children = next.queue.slice(0, 3).map(batch => {
    const node = element('div', 'queue-item');
    const text = element('div');
    text.append(element('strong', '', batch.viewer.nickname), element('small', '', batch.quality.label));
    node.append(avatar(batch.viewer), text);
    if (batch.remaining > 1) node.append(element('span', 'ticket-count', `×${number(batch.remaining)}`));
    return node;
  });
  while (children.length < 3) children.push(element('div', 'queue-item empty', '♡'));
  $('stage-queue').replaceChildren(...children);
}

function receive(next) {
  sound.setSoft(next.active?.viewer.source === 'sample');
  for (const name of soundsForChange(state, next, { isOverlay })) sound.play(name);
  state = next;
  receivedAt = performance.now();
  serverOnline = true;
  $('server-dot').classList.remove('offline');
  $('server-status').textContent = 'Ready';
  const connection = next.connection;
  const live = connection.phase !== 'idle';
  $('live-badge').dataset.phase = connection.phase;
  $('live-badge').replaceChildren(element('i'), document.createTextNode(connection.phase === 'connected' ? 'LIVE' : live ? 'WAIT' : ''));
  $('source-pill').textContent = connection.phase === 'connected' ? 'LIVE' : live ? 'Wait' : 'Test';
  $('source-pill').classList.toggle('live', connection.phase === 'connected');
  $('connection-message').textContent = connection.text;
  $('connection-message').classList.toggle('error', connection.phase === 'retrying');
  const waiting = live && connection.phase !== 'connected';
  $('connection-strip').hidden = !waiting;
  // "Lost" only after a room was actually joined; before that the channel simply has not gone live yet.
  $('connection-strip').textContent = connection.phase !== 'retrying' ? 'Connecting...' : connection.roomId ? 'Live lost. Retrying...' : 'Waiting for LIVE...';
  $('connection-strip').classList.toggle('warning', waiting);
  if (connection.username && !$('username').value) $('username').value = connection.username;
  $('pending-count').textContent = number(next.pending);
  $('pending-count').setAttribute('aria-label', `${number(next.pending)} waiting`);
  $('stat-portraits').textContent = number(next.stats.completed);
  $('stat-likes').textContent = number(next.stats.likes);
  $('stat-gifts').textContent = number(next.stats.gifts);
  // A server started before samples existed sends none: the page must keep working until it restarts.
  $('sample-toggle').checked = next.samples?.on ?? false;
  $('sample-toggle').disabled = !next.samples?.total;
  $('sample-count').textContent = next.samples?.total ? `${number(next.samples.total)} accounts` : 'Restart server';
  updateQueue(next);
  const job = next.active ?? next.history[0] ?? null;
  if (job?.id !== displayJob?.id || renderer.jobId === undefined) {
    displayJob = job;
    // A sample is no one's gift: no thank-you and no gift lit up.
    const sample = job?.viewer.source === 'sample';
    stage.classList.toggle('is-sample', sample);
    $('avatar-notice').hidden = true;
    $('order-reason').hidden = !job;
    for (const tile of $('stage-gifts').children) tile.classList.toggle('is-active', !sample && tile.dataset.tier === job?.quality.id);
    if (job) {
      $('order-avatar').replaceChildren(...avatar(job.viewer).childNodes);
      $('order-name').textContent = job.viewer.nickname;
      $('order-reason').textContent = `${job.trigger.name}${job.batchSize > 1 ? ` · ${job.batchIndex}/${job.batchSize}` : ''}`;
      $('quality-badge').querySelector('span').textContent = `${job.quality.label}\n${job.quality.columns} × ${job.quality.columns}`;
      $('quality-badge').style.color = job.quality.color;
      $('thank-detail').textContent = job.viewer.nickname;
    } else {
      $('order-avatar').textContent = '♡';
      $('order-name').textContent = 'Your photo';
      $('order-reason').textContent = '';
      $('quality-badge').querySelector('span').textContent = '♡';
      $('quality-badge').style.removeProperty('color');
    }
    void renderer.setJob(job).catch(report);
  }
  const recent = next.history.map(item => item.id).join('|');
  if (historySignature !== recent) {
    historySignature = recent;
    $('recent-gallery').replaceChildren(...next.history.map(item => {
      const node = avatar(item.viewer);
      node.title = `${item.viewer.nickname} · ${item.quality.columns} × ${item.quality.columns}`;
      node.style.setProperty('--tier-color', item.quality.color);
      return node;
    }));
  }
  const activity = next.activity[0]?.id ?? '';
  if (activitySignature !== activity) {
    activitySignature = activity;
    $('activity-list').replaceChildren(...next.activity.map(item => element('li', item.kind, item.text)));
    $('activity-count').textContent = String(next.activity.length);
  }
  refreshControls();
}

let phase = '';
function frame(now) {
  if (state) {
    const elapsed = state.active ? state.active.elapsedMs + (state.paused || !serverOnline ? 0 : now - receivedAt) : JOB_MS;
    const progress = displayJob ? Math.max(0, Math.min(1, (elapsed - TIMING.prepareMs) / TIMING.drawMs)) : 0;
    const drawing = Boolean(state.active) && elapsed < TIMING.prepareMs + TIMING.drawMs;
    stage.classList.toggle('is-working', drawing);
    const revealed = Boolean(displayJob) && progress === 1;
    stage.classList.toggle('is-revealed', revealed);
    $('thank-you').setAttribute('aria-hidden', String(!revealed));
    stage.classList.toggle('is-paused', state.paused || !serverOnline);
    if (displayJob) renderer.paint(elapsed - TIMING.prepareMs);
    playMarbles(drawing, progress);
    $('progress-fill').style.width = `${progress * 100}%`;
    const nextPhase = !serverOnline ? 'OFFLINE' : state.paused ? 'PAUSED' : !displayJob ? 'READY' : !state.active ? 'DONE' : elapsed < TIMING.prepareMs ? 'LOADING' : progress < 1 ? 'DRAWING' : 'DONE';
    if (phase !== nextPhase) {
      phase = nextPhase;
      $('order-eyebrow').textContent = phase;
    }
    $('progress-text').textContent = displayJob ? `${Math.round(progress * 100)}%` : '';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const events = new EventSource('/events');
events.onmessage = event => {
  try { receive(JSON.parse(event.data)); }
  catch (error) { report(error); }
};
events.onerror = () => {
  if (serverOnline && state?.active && !state.paused) {
    state.active.elapsedMs += performance.now() - receivedAt;
    receivedAt = performance.now();
  }
  serverOnline = false;
  $('server-dot').classList.add('offline');
  $('server-status').textContent = 'Offline. Retrying...';
  $('connection-message').textContent = 'Server offline.';
  $('connection-message').classList.add('error');
  $('source-pill').textContent = 'Offline';
  $('source-pill').classList.remove('live');
  $('connection-strip').hidden = false;
  $('connection-strip').textContent = 'Offline. Reconnecting...';
  $('connection-strip').classList.add('warning');
  $('live-badge').dataset.phase = 'offline';
  $('live-badge').replaceChildren(element('i'), document.createTextNode('OFFLINE'));
  refreshControls();
};
refreshControls();
