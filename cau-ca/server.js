import path from 'node:path';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseEnv } from 'node:util';
import express from 'express';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { Pond, TIERS } from './src/pond.js';
import { createVoice } from './src/voice.js';
import { Sky, WEATHER } from './src/sky.js';
import { Wheel } from './src/wheel.js';

const root = import.meta.dirname;
const config = JSON.parse(readFileSync(path.join(root, 'config.json'), 'utf8'));
const username = (process.argv[2] ?? config.tiktokUsername ?? '').trim().replace(/^@/, '');
const port = Number(process.env.PORT) || config.port || 3006;
const host = '127.0.0.1';

const inRange = (n, min, max) => typeof n === 'number' && n >= min && n <= max;
const wheelCfg = config.wheel;
const slotOk = (s) => {
  const e = s?.effect ?? {};
  return (
    s?.id && s.label && s.icon && s.text &&
    (s.weight === undefined || inRange(s.weight, 0, 1e6)) && (s.goldWeight === undefined || inRange(s.goldWeight, 0, 1e6)) &&
    (e.rate === undefined || inRange(e.rate, 0, 1)) &&
    (e.kgMul === undefined || inRange(e.kgMul, 0.1, 100)) &&
    (e.likesPerPull === undefined || inRange(e.likesPerPull, 1, 100_000)) &&
    (e.rareStep === undefined || (Number.isInteger(e.rareStep) && e.rareStep >= 1 && config.rare)) &&
    (e.weather === undefined || e.weather in WEATHER) &&
    (e.sprint === undefined || inRange(e.sprint.bonusKg, 0, 1e6)) &&
    (e.boss === undefined || (inRange(e.boss.hpBase, 1, 1e6) && config.tiers?.boss?.fish?.length))
  );
};
const problems = [
  [
    !wheelCfg ||
      (inRange(wheelCfg.warnSeconds, 0, 600) && inRange(wheelCfg.spinSeconds, 2, 60) && inRange(wheelCfg.eventSeconds, 5, 3600) &&
        inRange(wheelCfg.everySeconds, wheelCfg.warnSeconds + wheelCfg.spinSeconds + wheelCfg.eventSeconds, 86_400)),
    'wheel: everySeconds phải lớn hơn hoặc bằng tổng warnSeconds + spinSeconds + eventSeconds',
  ],
  [!wheelCfg || (Array.isArray(wheelCfg.slots) && wheelCfg.slots.every(slotOk) && wheelCfg.slots.some((s) => s.weight > 0) && new Set(wheelCfg.slots.map((s) => s.id)).size === wheelCfg.slots.length), 'wheel.slots: mỗi ô cần id riêng, label, icon, text, weight và effect hợp lệ (rareStep cần mục rare, boss cần tiers.boss), và ít nhất một ô có weight > 0'],
  [!wheelCfg?.goldenLikes || wheelCfg.slots?.some((s) => s.goldWeight > 0), 'wheel.goldenLikes cần ít nhất một ô có goldWeight > 0, hoặc đặt goldenLikes bằng 0 để tắt vòng vàng'],
  [Array.isArray(config.joinWords) && config.joinWords.length > 0, 'joinWords là danh sách từ để xuống hồ, ví dụ ["câu", "cau"]'],
  [Number.isInteger(config.seats) && config.seats >= 4 && config.seats <= 20, 'seats (số chỗ câu đang mở) là số nguyên từ 4 đến 20, vì bản đồ có 20 chỗ'],
  [
    !config.bots ||
      (Array.isArray(config.bots.names) && config.bots.names.length < config.seats && config.bots.names.every((n) => typeof n === 'string' && n.trim()) &&
        inRange(config.bots.tapEverySeconds?.[0], 0.1, 3600) && config.bots.tapEverySeconds[1] >= config.bots.tapEverySeconds[0] &&
        Number.isInteger(config.bots.tapLikes?.[0]) && Number.isInteger(config.bots.tapLikes[1]) && config.bots.tapLikes[0] >= 1 && config.bots.tapLikes[1] >= config.bots.tapLikes[0]),
    'bots cần names (ít hơn số chỗ seats), tapEverySeconds là [ít nhất, nhiều nhất] số giây giữa hai lần thả tim, tapLikes là [ít nhất, nhiều nhất] số tim mỗi lần',
  ],
  [inRange(config.likesPerPull, 1, 100_000) && inRange(config.maxLikePullsQueued, 1, 100), 'likesPerPull là số tim cho 1 lần giật, maxLikePullsQueued từ 1 đến 100'],
  [inRange(config.successRate, 0, 1), 'successRate là tỉ lệ thành công từ 0 đến 1, ví dụ 0.6'],
  [inRange(config.focusMs, 800, 10_000) && inRange(config.rushFocusMs, 500, 10_000) && (config.sharkFocusMs === undefined || inRange(config.sharkFocusMs, 800, 20_000)), 'focusMs, rushFocusMs, sharkFocusMs là thời gian quay cận (ms)'],
  [inRange(config.idleLeaveSeconds, 10, 36_000), 'idleLeaveSeconds (ngồi bao nhiêu giây không giật cá thì tự về) từ 10 đến 36000'],
  [inRange(config.freePullCooldownSeconds, 0, 3600), 'freePullCooldownSeconds (mỗi người follow/share được câu free mấy giây một lần) từ 0 đến 3600'],
  [TIERS.every((t) => config.tiers?.[t]?.fish?.length && config.tiers[t].minKg <= config.tiers[t].maxKg), `tiers cần đủ ${TIERS.join(', ')} với minKg ≤ maxKg và danh sách fish`],
  [config.gifts.every((g) => TIERS.includes(g.tier) && g.names?.length), 'gifts: mỗi quà cần tier và names'],
  [!config.gear || (inRange(config.gear.bonus, 0, 1) && ['rod', 'hook'].every((slot) => config.gear[slot]?.names?.length && config.gear[slot].items?.length >= 2 && new Set(config.gear[slot].items.map((item) => item.id)).size === config.gear[slot].items.length)), 'gear (trang bị) cần bonus từ 0 đến 1, và rod, hook đều có names cùng ít nhất 2 món trong items với id khác nhau'],
  [!config.props || (config.props.net?.names?.length && config.tiers?.[config.props.net.tier]?.fish?.length && config.props.bait?.names?.length && config.props.bait.pulls >= 1 && config.props.bait.kgMul > 0 && config.props.vip?.names?.length && config.props.vip.seconds >= 1 && config.props.charm?.names?.length && inRange(config.props.charm.bonus, 0, 1) && config.props.otter?.names?.length && config.props.otter.seconds >= 1 && config.props.otter.everySeconds >= 1 && config.tiers?.[config.props.otter.tier]?.fish?.length), 'props (đạo cụ) cần net (names, tier), bait (names, pulls, kgMul), vip (names, seconds), charm (names, bonus từ 0 đến 1), otter (names, seconds, everySeconds, tier)'],
  [!config.rare || (Number.isInteger(config.rare.every) && config.rare.every >= 2 && inRange(config.rare.successRate, 0, 1) && config.tiers?.rare?.fish?.length && config.tiers.rare.minKg <= config.tiers.rare.maxKg), 'rare (cá hiếm) cần every (con cá thứ mấy là cá hiếm, số nguyên ≥ 2), successRate từ 0 đến 1 và tiers.rare có fish, minKg ≤ maxKg'],
  [!config.sky?.cycleMinutes || inRange(config.sky.cycleMinutes, 2, 1440), 'sky.cycleMinutes (một ngày đêm trong game dài bao nhiêu phút) từ 2 đến 1440'],
  [!config.sky?.weatherSeconds || (inRange(config.sky.weatherSeconds[0], 5, 36_000) && config.sky.weatherSeconds[1] >= config.sky.weatherSeconds[0]), 'sky.weatherSeconds là [ít nhất, nhiều nhất] số giây mỗi kiểu thời tiết, ví dụ [40, 150]'],
  [!config.sky?.weather || Object.keys(config.sky.weather).every((k) => k in WEATHER), `sky.weather chỉ gồm ${Object.keys(WEATHER).join(', ')}`],
].filter(([ok]) => !ok);
if (problems.length) throw new Error(`config.json: ${problems.map(([, text]) => text).join('; ')}`);

const guide = {
  joinWord: config.joinWords[0],
  likesPerPull: config.likesPerPull,
  freePullCooldownSeconds: config.freePullCooldownSeconds,
  successRate: config.successRate,
  seats: config.seats,
  tiers: config.tiers,
  gifts: config.gifts.map(({ tier, label, icon, names, coins }) => ({ tier, label, icon, name: names[0], coins })),
  // Không gửi gear.bonus: người xem chỉ thấy "Tăng tỉ lệ câu thành công".
  gear: config.gear ? Object.fromEntries(['rod', 'hook'].map((slot) => {
    const { label, icon, names, coins = 1, items } = config.gear[slot];
    return [slot, { label, icon, name: names[0], coins, items }];
  })) : null,
  // Bảng Trang bị Cần Thủ: giá thấp lên cao, Vua Câu không có quà nên đứng cuối. Không gửi hệ số và tỉ lệ.
  shop: [
    ...Object.entries({ rod: config.gear?.rod, hook: config.gear?.hook, ...config.props }).filter(([, item]) => item),
  ]
    .map(([slot, { label, desc, icon, emoji, names, coins }]) => ({ slot, label, desc, icon: icon ?? null, emoji: emoji ?? null, name: names?.[0] ?? null, coins: coins ?? null }))
    .sort((a, b) => (a.coins ?? Infinity) - (b.coins ?? Infinity)),
  display: config.display ?? {},
  // Chỉ để bảng điều khiển vẽ nút thử; không có hiệu ứng và tỉ lệ.
  wheel: wheelCfg ? { slots: wheelCfg.slots.map(({ id, label, icon }) => ({ id, label, icon })) } : null,
};

const vbee = {
  token: process.env.VBEE_TOKEN?.trim(),
  appId: process.env.VBEE_APP_ID?.trim(),
  voice: process.env.VBEE_VOICE?.trim() || 'hn_female_ngochuyen_full_48k-fhg',
  speed: Number(process.env.VBEE_SPEED) || 1,
};
vbee.enabled = Boolean(vbee.token && vbee.appId);

const clients = new Set();
let status = {
  connected: false,
  text: username ? `Chuẩn bị kết nối @${username}` : 'Chế độ thử: chưa đặt kênh TikTok',
};

const send = (res, message) => res.write(`data: ${JSON.stringify(message)}\n\n`);
const broadcast = (message) => clients.forEach((res) => send(res, message));

// Safe mode silences the Vbee voice until the host turns it off.
let safeMode = false;
function setSafeMode(on, reason) {
  if (safeMode === on) return;
  safeMode = on;
  console.log(`[Chế độ an toàn] ${on ? `Bật: ${reason}` : 'Tắt'}`);
  broadcast({ type: 'safe-mode', on });
}

function setStatus(connected, text) {
  status = { connected, text };
  console.log(`[TikTok] ${text}`);
  broadcast({ type: 'status', ...status });
}

// ---------- Hồ câu ----------
const BOARD_FILE = path.join(root, 'data', 'board.json');
let boardDirty = false;
// Bộ đếm cá hiếm lưu riêng để bật lại server vẫn đếm tiếp.
const RARE_FILE = path.join(root, 'data', 'rare.json');
let rareDirty = false;
// Người mới vào hồ (nhất là người tặng quà tự xuống hồ) có thể chưa có mẩu giọng tên mình:
// lượt giật đầu tiên chờ tối đa nameWaitMs để lời chúc mừng đọc được tên.
const NAME_WAIT_MS = config.voice?.nameWaitMs ?? 2500;
const pond = new Pond(config, {
  ready(job, now) {
    if (!voice.enabled || safeMode) return true;
    const p = pond.players.get(job.pid);
    return !p || pond.isBot(p.id) || Boolean(voice.ready(spokenName(p.name))) || now - job.createdAt >= NAME_WAIT_MS;
  },
  emit(msg) {
    if (msg.type === 'board') boardDirty = true;
    if (msg.type === 'rare') rareDirty = true;
    // 'queued' chỉ dùng trong server, không gửi xuống trang game.
    if (msg.type === 'queued') return;
    // Tạo sẵn mẩu giọng tên người chơi ngay khi họ xuống hồ (bot không được đọc tên).
    if (msg.type === 'join' && !msg.player.bot) voice.clip(spokenName(msg.player.name), { urgent: true });
    broadcast(msg);
    eventVoice(msg);
  },
});
try {
  pond.importStats(JSON.parse(readFileSync(BOARD_FILE, 'utf8')));
  console.log(`Đã nạp bảng xếp hạng: ${pond.stats.size} người`);
} catch {
  // Chưa có bảng xếp hạng cũ.
}
try {
  pond.setHooked(JSON.parse(readFileSync(RARE_FILE, 'utf8')).hooked);
  rareDirty = false;
} catch {
  // Chưa có bộ đếm cá hiếm.
}
function saveRare() {
  if (!rareDirty) return;
  rareDirty = false;
  try {
    mkdirSync(path.dirname(RARE_FILE), { recursive: true });
    writeFileSync(RARE_FILE, JSON.stringify({ hooked: pond.rareShown }));
  } catch (err) {
    console.error(`[Cá hiếm] Không lưu được bộ đếm: ${err.message}`);
  }
}
setInterval(saveRare, 5000);
function saveBoard() {
  if (!boardDirty) return;
  boardDirty = false;
  try {
    mkdirSync(path.dirname(BOARD_FILE), { recursive: true });
    writeFileSync(`${BOARD_FILE}.tmp`, JSON.stringify(pond.exportStats()));
    renameSync(`${BOARD_FILE}.tmp`, BOARD_FILE);
  } catch (err) {
    console.error(`[Bảng xếp hạng] Không lưu được: ${err.message}`);
  }
}
setInterval(saveBoard, 5000);

// Giờ trong ngày + thời tiết (nắng, mây, gió, mưa, giông) đổi ngẫu nhiên.
const sky = new Sky(config.sky ?? {});
const broadcastSky = (changed = false) => broadcast({ type: 'sky', ...sky.snapshot(), changed });
setInterval(() => {
  if (!sky.tick()) return;
  console.log(`[Thời tiết] ${WEATHER[sky.weather]}`);
  broadcastSky(true);
}, 1000);

// Vòng quay sự kiện: Wheel lo hẹn giờ và bốc ô, Pond áp hiệu ứng, Sky giữ thời tiết trong lúc sự kiện chạy.
const wheel = wheelCfg
  ? new Wheel(wheelCfg, {
      players: () => pond.humans(),
      startEvent(slot) {
        console.log(`[Vòng quay] ${slot.label}`);
        pond.startEvent(slot.effect ?? {});
        if (slot.effect?.weather && sky.hold(slot.effect.weather)) broadcastSky(true);
      },
      endEvent() {
        pond.endEvent();
        if (sky.release()) broadcastSky(true);
      },
      eventOver: () => Boolean(pond.event?.over),
      emit(msg) {
        broadcast(msg);
        wheelVoice(msg);
      },
    })
  : null;
if (wheel) setInterval(() => wheel.tick(), 200);

const fmtKg = (kg) => kg.toLocaleString('vi-VN', { maximumFractionDigits: 1 });

setInterval(() => {
  const done = pond.tick();
  // Giọng đọc chúc mừng và nhật ký chỉ dành cho người xem thật, không dành cho bot.
  if (!done || pond.isBot(done.p.id)) return;
  const { p, kg, wins, best, tier } = done;
  if (tier === 'rare') console.log(`[Cá hiếm] ${p.name} ${wins ? `câu được ${best.fish} ${fmtKg(best.kg)} kg!` : 'để xổng cá hiếm'}`);
  else if (wins) console.log(`[Giật cá] ${p.name}: ${wins} con, ${fmtKg(kg)} kg (con to nhất: ${best.fish} ${fmtKg(best.kg)} kg)`);
  else console.log(`[Giật cá] ${p.name}: xổng mất`);
  if (wins && VOICE.congrats) say(congratsTexts(done), true);
}, 100);

// ---------- Giọng đọc: ghép từ các mẩu có sẵn để đọc tức thì ----------
// Lời chúc mừng = "Bà con ơi" + tên + "vừa giật được cá lóc đồng" + "4 ký"; mọi mẩu đều đã tạo sẵn
// (tên người chơi tạo lúc họ xuống hồ), nên đọc ngay lúc cá lên, không phải chờ Vbee.
const VOICE = { join: true, congrats: true, ...config.voice };
const V = {
  hello: 'Bà con ơi',
  you: 'có bạn',
  sharkIntro: 'Trời đất ơi, cá chúa!',
  rareIntro: 'Ối giời, cá hiếm!',
  fish: 'vừa giật được {fish}',
  kg: 'nặng {kg} ký',
  many: 'vừa giật được {n} con cá',
  manyLots: 'vừa giật được cả một mẻ cá đầy xô',
  joined: 'đã ra bến thả câu',
  and: 'với',
  others: 'với nhiều bà con khác',
  wheelSoon: 'Vòng quay Thần Sông sắp bắt đầu, bà con ơi',
  wheelGold: 'Vòng quay vàng đấy bà con!',
  wheelSpin: 'đang quay',
  bossDown: 'đã kéo được cá hô chúa',
  bossFled: 'Cá hô chúa lặn mất rồi',
  sprintWin: 'thắng hội thi câu của làng',
  hut: 'Chỗ số {n}',
  ...config.voice?.text,
};
const HEAVY_TIERS = new Set(['shark', 'rare', 'boss']);
// Cá thường đọc tròn ký (dưới 1 ký thì bỏ phần cân nặng), cá chúa và cá hiếm tròn chục ký.
const kgWord = (kg, tier) => (HEAVY_TIERS.has(tier) ? String(Math.round(kg / 10) * 10) : kg < 1 ? '' : String(Math.round(kg)));

// Giọng đọc của vòng quay; tên người chơi đã có sẵn từ lúc họ xuống hồ.
function wheelVoice(msg) {
  if (!VOICE.wheel) return;
  if (msg.just === 'warn') say([V.wheelSoon]);
  if (msg.just === 'spin') {
    const texts = msg.spin.golden ? [V.wheelGold] : [];
    const name = msg.spin.spinner && spokenName(msg.spin.spinner.name);
    if (name && voice.ready(name)) texts.push(name, V.wheelSpin);
    if (texts.length) say(texts);
  }
  if (msg.just === 'start') {
    const line = wheelCfg.slots.find((s) => s.id === msg.event.id)?.voice;
    if (line) say([line], true);
  }
}

function eventVoice(msg) {
  if (!VOICE.wheel) return;
  if (msg.type === 'boss-end') say(msg.name ? [V.hello, spokenName(msg.name), V.bossDown] : [V.bossFled], true);
  if (msg.type === 'sprint-end' && msg.name) say([V.hello, spokenName(msg.name), V.sprintWin]);
}

function congratsTexts({ p, wins, best, tier }) {
  const name = spokenName(p.name);
  const texts = tier === 'shark' || tier === 'boss' ? [V.sharkIntro] : tier === 'rare' ? [V.rareIntro] : [];
  // Thỉnh thoảng loa đọc thêm số chỗ ngồi; không đọc mọi lần để câu ngắn, kẻo đông lượt giật thì giọng đọc bị dồn.
  if (Math.random() < (VOICE.hutChance ?? 0)) texts.push(V.hut.replace('{n}', p.seat + 1));
  texts.push(V.hello, voice.ready(name) ? name : V.you);
  if (wins > 1) texts.push(wins <= 10 ? V.many.replace('{n}', wins) : V.manyLots);
  else {
    texts.push(V.fish.replace('{fish}', best.fish.toLowerCase()));
    const k = kgWord(best.kg, tier);
    if (k) texts.push(V.kg.replace('{kg}', k));
  }
  return texts;
}

// Phát các mẩu đã sẵn sàng; first: đọc trước các câu đang chờ (lời chúc mừng).
function say(texts, first = false) {
  if (!voice.enabled || safeMode) return;
  const ids = texts.map((t) => voice.ready(t)).filter(Boolean);
  if (ids.length) broadcast({ type: 'say', ids, first });
}

// Tạo sẵn các mẩu dùng chung (chỉ lần đầu; lần sau đọc từ data/tts).
function warmVoice() {
  if (!voice.enabled) return;
  const texts = new Set([V.hello, V.you, V.sharkIntro, V.rareIntro, V.joined, V.and, V.others, V.manyLots]);
  for (const tier of Object.values(config.tiers)) for (const f of tier.fish) texts.add(V.fish.replace('{fish}', f.name.toLowerCase()));
  // Sự kiện nhân cân nặng thì cá nặng hơn mức thường, nên thư viện số ký phải đủ tới mức nhân cao nhất.
  const maxMul = Math.max(1, ...(wheelCfg?.slots ?? []).map((s) => s.effect?.kgMul ?? 1));
  const lightMax = Math.max(...TIERS.filter((t) => t !== 'shark').map((t) => config.tiers[t].maxKg));
  for (let k = 1; k <= Math.ceil(lightMax * maxMul); k++) texts.add(V.kg.replace('{kg}', k));
  for (let k = 50; k <= Math.ceil(config.tiers.shark.maxKg * maxMul); k += 10) texts.add(V.kg.replace('{kg}', k));
  for (let n = 2; n <= 10; n++) texts.add(V.many.replace('{n}', n));
  if (VOICE.hutChance > 0) for (let n = 1; n <= config.seats; n++) texts.add(V.hut.replace('{n}', n));
  if (VOICE.wheel && wheelCfg) {
    for (const t of [V.wheelSoon, V.wheelGold, V.wheelSpin, V.bossDown, V.bossFled, V.sprintWin]) texts.add(t);
    for (const s of wheelCfg.slots) if (s.voice) texts.add(s.voice);
  }
  const missing = [...texts].filter((t) => !voice.ready(t));
  if (!missing.length) return console.log(`[Vbee] Đã có sẵn ${texts.size} mẩu giọng đọc`);
  console.log(`[Vbee] Đang tạo ${missing.length} mẩu giọng đọc dùng chung, chỉ lần đầu (khoảng ${Math.ceil(missing.length / 3) * 5} giây)...`);
  Promise.all(missing.map((t) => voice.clip(t))).then((ids) => console.log(`[Vbee] Xong thư viện giọng đọc: ${ids.filter(Boolean).length}/${missing.length} mẩu`));
}

// Người xuống hồ được đọc tên theo nhóm (tối đa 3 tên một câu) để comment "câu" dồn dập không bị đọc chồng.
const joinQueue = [];
let nextJoinSpeech = 0;
let joinBusy = false;
function announceJoins() {
  const now = Date.now();
  if (joinBusy || now < nextJoinSpeech || !joinQueue.length) return;
  const names = joinQueue.splice(0, joinQueue.length > 6 ? joinQueue.length : 3);
  const shown = names.length > 3 ? names.slice(0, 2) : names;
  joinBusy = true;
  Promise.all(shown.map((n) => voice.clip(n, { urgent: true })))
    .then(() => {
      const texts = [];
      shown.forEach((n, i) => {
        if (i > 0 && i === shown.length - 1 && names.length <= 3) texts.push(V.and);
        texts.push(n);
      });
      if (names.length > 3) texts.push(V.others);
      texts.push(V.joined);
      say(texts);
    })
    .finally(() => {
      joinBusy = false;
      nextJoinSpeech = Date.now() + 1000 * (1 + Math.min(names.length, 3));
    });
}
setInterval(announceJoins, 500);

const handle = {
  comment(who, text) {
    const joined = pond.comment(who, text);
    if (joined && VOICE.join) joinQueue.push(spokenName(who.name));
  },
  like(who, count) {
    wheel?.addLikes(count);
    pond.like(who, count);
  },
  // Follow / share: câu free, mỗi người tối đa 1 lần mỗi freePullCooldownSeconds (gộp cả hai cách).
  free(who, kind) {
    const p = pond.free(who, kind);
    console.log(`[Câu free] ${who.name} ${kind === 'share' ? 'share' : 'follow'}: ${p ? 'được giật 1 lần' : 'chưa hết thời gian chờ hoặc hồ kín'}`);
  },
  gift(who, gift, count) {
    wheel?.addCoins(who, (gift.coins || 0) * count);
    const tier = pond.gift(who, gift, count);
    const slot = config.gear?.[tier];
    if (slot) {
      console.log(`[Trang bị] ${who.name}: ${slot.label} bằng quà "${gift.name}", tỉ lệ thành công nền ${Math.round(pond.rateFor(who.id, config.successRate) * 100)}%`);
      return broadcast({ type: 'gift', name: who.name, avatar: who.avatar, tier, count, gift: slot.label });
    }
    const prop = config.props?.[tier];
    if (prop) {
      console.log(`[Đạo cụ] ${who.name} x${count}: ${prop.label} bằng quà "${gift.name}"`);
      return broadcast({ type: 'gift', name: who.name, avatar: who.avatar, tier, count, gift: prop.label });
    }
    if (tier) broadcast({ type: 'gift', name: who.name, avatar: who.avatar, tier, count, gift: config.gifts.find((g) => g.tier === tier)?.label ?? gift.name });
  },
};

function safeImageUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function viewer(user) {
  const raw = String(user?.nickname || user?.displayId || user?.uniqueId || '').replace(/\s+/g, ' ').trim();
  const name = Array.from(raw).slice(0, 20).join('') || 'Ẩn danh';
  // Browsers cannot render HEIC, which TikTok sometimes lists first.
  const urls = user?.avatarThumb?.urlList ?? user?.avatarMedium?.urlList ?? user?.profilePicture?.url ?? [];
  const avatar = safeImageUrl(urls.find((url) => !/\.heic\b/i.test(url)) ?? urls[0] ?? '');
  return { id: String(user?.userId || user?.id || user?.displayId || user?.uniqueId || name), name, avatar };
}

const lastSeen = new Map();
function cooledDown(key, ms) {
  const now = Date.now();
  if (now - (lastSeen.get(key) ?? 0) < ms) return false;
  lastSeen.set(key, now);
  if (lastSeen.size > 20_000) lastSeen.delete(lastSeen.keys().next().value);
  return true;
}

// Combo gifts resend a running total; only the increase is new. msgId drops exact duplicates.
class GiftCounter {
  constructor() {
    this.streaks = new Map();
    this.seen = new Set();
  }

  count({ msgId, userId, giftId, groupId, repeatCount, repeatEnd, combo }) {
    if (msgId) {
      if (this.seen.has(msgId)) return 0;
      this.seen.add(msgId);
      if (this.seen.size > 5000) this.seen.delete(this.seen.values().next().value);
    }
    const repeat = Math.max(1, Number(repeatCount) || 1);
    if (!combo) return repeat;
    const key = `${userId}:${giftId}:${groupId}`;
    const previous = this.streaks.get(key) ?? 0;
    const count = repeat >= previous ? repeat - previous : repeat;
    if (repeatEnd) this.streaks.delete(key);
    else this.streaks.set(key, Math.max(previous, repeat));
    if (this.streaks.size > 2000) this.streaks.delete(this.streaks.keys().next().value);
    return count;
  }
}

// ---------- Vbee voice ----------
// Mẩu giọng đọc được lưu ở data/tts và phục vụ qua /tts/:id (xem src/voice.js).
const voice = createVoice({
  enabled: vbee.enabled,
  voice: vbee.voice,
  speed: vbee.speed,
  dir: path.join(root, 'data', 'tts'),
  synthesize,
  onError(err, text) {
    console.error(`[Vbee] Lỗi đọc "${text}": ${err.message}`);
    broadcast({ type: 'speak-error', message: err.message });
  },
});

async function vbeeJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body.error ?? body).slice(0, 300)}`);
  return body;
}

// Realtime (sync) mode is not in every Vbee package, so create a batch job and poll it; no public webhook needed.
async function synthesize(text) {
  const headers = { Authorization: `Bearer ${vbee.token}`, 'App-Id': vbee.appId };
  const job = await vbeeJson('https://api.vbee.vn/v1/tts', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceCode: vbee.voice, mode: 'async', outputFormat: 'mp3', speed: vbee.speed, webhookUrl: 'https://callback.invalid/vbee' }),
  });
  if (!job.requestId) throw new Error(`Vbee không trả requestId: ${JSON.stringify(job).slice(0, 300)}`);
  for (let attempt = 0; attempt < 66; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const result = await vbeeJson(`https://api.vbee.vn/v1/tts/requests/${encodeURIComponent(job.requestId)}`, { headers });
    if (result.status === 'FAILED') throw new Error(`Vbee báo FAILED: ${JSON.stringify(result).slice(0, 300)}`);
    if (result.status === 'COMPLETED' && result.audioLink) {
      const audio = await fetch(result.audioLink, { signal: AbortSignal.timeout(15_000) });
      if (!audio.ok) throw new Error(`Tải audio lỗi HTTP ${audio.status}`);
      return Buffer.from(await audio.arrayBuffer());
    }
  }
  throw new Error('Quá 20 giây Vbee chưa trả audio');
}

const spokenName = (name) => name.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim() || 'Một bạn';

const readings = () => [VOICE.join && 'người xuống hồ', VOICE.congrats && 'chúc mừng mỗi lần giật cá thành công'].filter(Boolean);

// ---------- TikTok warnings, Telegram ----------
// TikTok may push moderation notices into the room: violation warnings, punishments, presence checks.
// Exact names: look-alikes such as WebcastGiftDynamicRestrictionMessage (hidden gifts) or battle punishments are routine.
const MODERATION_TYPES = new Set(['WebcastPerceptionMessage', 'WebcastNoticeMessage', 'WebcastPartnershipPunishMessage', 'WebcastRoomVerifyMessage']);
const alerts = [];
const textOf = (t) => (typeof t === 'string' ? t : t?.defaultPattern || '');
// TikTok also pushes these messages with every field empty; those are not warnings.
const hasContent = (value) =>
  Array.isArray(value) ? value.some(hasContent) : value && typeof value === 'object' ? Object.values(value).some(hasContent) : Boolean(value) && value !== '0';

function reportModeration(type, data) {
  const punish = data.punishInfo ?? {};
  const dialog = data.dialog ?? data.perceptionDialog ?? {};
  const parts = [punish.showReason, punish.punishReason, dialog.title, dialog.subTitle, dialog.policyTip, data.noticeTitle, data.noticeContent, data.violationReason, data.content, data.tips, data.toast, data.floatText, data.common?.displayText];
  const text = parts.map(textOf).filter((part) => part && part !== '0').join(' · ').slice(0, 300) || type;
  console.warn(`[TikTok cảnh báo] ${type}: ${text}`);
  const raw = JSON.stringify(data, (key, value) => (typeof value === 'bigint' ? String(value) : value));
  appendFileSync(path.join(root, 'moderation.log'), `${new Date().toISOString()} ${type} ${raw}\n`);
  const alert = { at: Date.now(), text };
  alerts.push(alert);
  if (alerts.length > 10) alerts.shift();
  broadcast({ type: 'moderation', ...alert });
  setSafeMode(true, 'có cảnh báo TikTok');
  // The same warning repeated within 10 minutes is sent to Telegram once.
  if (cooledDown(`telegram:${text}`, 600_000)) {
    const time = new Date(alert.at).toLocaleTimeString('vi-VN');
    alertTelegram(`⚠️ TikTok cảnh báo phiên live @${username} lúc ${time}\n${text}\nĐã tự bật chế độ an toàn. Hãy kiểm tra hộp thư TikTok.`);
  }
}

// Read from .env on every send, so Telegram details can change without a restart.
function telegramConfig() {
  let file = {};
  try {
    file = parseEnv(readFileSync(path.join(root, '.env'), 'utf8'));
  } catch {
    // No .env file: use the process environment only.
  }
  const read = (key) => String(file[key] ?? process.env[key] ?? '').trim();
  return { token: read('TELEGRAM_BOT_TOKEN'), chatId: read('TELEGRAM_ADMIN_CHAT_ID') };
}

// Returns an error message, or '' once sent. The token is part of the URL, so the URL is never logged.
async function sendTelegram(text) {
  const { token, chatId } = telegramConfig();
  if (!token || !chatId) return 'Thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_ADMIN_CHAT_ID trong .env';
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return '';
    const body = await res.json().catch(() => ({}));
    return `Telegram báo lỗi ${res.status}: ${body.description ?? ''}`.trim();
  } catch (err) {
    return `Không gửi được Telegram: ${err.message}`;
  }
}

// Telegram can be unreachable from this network for minutes at a time.
async function alertTelegram(text) {
  for (let attempt = 1; attempt <= 30; attempt++) {
    const error = await sendTelegram(text);
    if (!error) {
      if (attempt > 1) console.log(`[Telegram] Đã gửi được cảnh báo ở lần thử thứ ${attempt}`);
      return;
    }
    if (attempt === 1) console.error(`[Telegram] ${error}. Sẽ thử lại mỗi phút trong 30 phút.`);
    await sleep(60_000);
  }
  console.error('[Telegram] Sau 30 phút vẫn không gửi được cảnh báo, bỏ qua.');
}

function sessionReport() {
  if (!session.roomId) return '💎 Chưa có phiên live nào từ lúc bật server.';
  const since = new Date(session.since).toLocaleTimeString('vi-VN');
  const ended = status.connected ? '' : ', đã kết thúc';
  return `💎 Phiên live @${username} (từ ${since}${ended}): ${session.diamonds.toLocaleString('vi-VN')} kim cương từ ${session.gifts.toLocaleString('vi-VN')} quà.`;
}

// Long polling needs no public URL. Only the admin chat gets answers, and commands older than 2 minutes are skipped.
async function pollTelegram(offset = 0) {
  const { token, chatId } = telegramConfig();
  if (!token || !chatId) return setTimeout(pollTelegram, 60_000, offset);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?timeout=50&offset=${offset}`, { signal: AbortSignal.timeout(60_000) });
    // 409: another program already receives this bot's messages; stop rather than fight over them.
    if (res.status === 409) return console.warn('[Telegram] Bot đang được chương trình khác nhận tin (có thể là game khác đang chạy), nên tắt lệnh /count ở game này.');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    for (const update of body.result ?? []) {
      offset = update.update_id + 1;
      const message = update.message;
      if (String(message?.chat?.id) !== chatId || Date.now() / 1000 - message.date > 120) continue;
      if (/^\/count(@\w+)?(\s|$)/.test(message.text ?? '')) await sendTelegram(sessionReport());
    }
  } catch (err) {
    console.error(`[Telegram] Lỗi nhận lệnh: ${err.message}`);
    return setTimeout(pollTelegram, 30_000, offset);
  }
  pollTelegram(offset);
}

// ---------- TikTok LIVE ----------
// Diamonds from real TikTok gifts in the current LIVE room (panel test gifts don't count); reconnects keep the count.
let session = { roomId: '', diamonds: 0, gifts: 0, since: 0 };
const giftCounter = new GiftCounter();

function connectTikTok() {
  const conn = new TikTokLiveConnection(username, { processInitialData: false });

  conn.on(ControlEvent.DECODED_DATA, (type, event) => {
    const data = event?.data ?? event ?? {};
    const { common, ...fields } = data;
    // Control messages (pause, end...) count only when they carry a punishment.
    const warning = type === 'WebcastControlMessage' ? [data.punishInfo, data.perceptionDialog] : MODERATION_TYPES.has(type) ? [fields, common?.displayText] : [];
    if (hasContent(warning)) reportModeration(type, data);
  });
  conn.on(WebcastEvent.CHAT, (e) => {
    const who = viewer(e.user);
    if (!cooledDown(`chat:${who.id}`, 1000)) return;
    handle.comment(who, String(e.comment ?? e.content ?? '').slice(0, 200));
  });
  conn.on(WebcastEvent.FOLLOW, (e) => handle.free(viewer(e.user), 'follow'));
  conn.on(WebcastEvent.SHARE, (e) => handle.free(viewer(e.user), 'share'));
  conn.on(WebcastEvent.LIKE, (e) => handle.like(viewer(e.user), Math.max(1, Number(e.likeCount ?? e.count) || 1)));
  conn.on(WebcastEvent.GIFT, (e) => {
    if (!e.gift && !e.giftDetails) return;
    const gift = e.giftDetails ?? e.gift;
    const count = giftCounter.count({
      msgId: e.common?.msgId ? String(e.common.msgId) : '',
      userId: e.user?.userId ?? e.user?.id,
      giftId: e.giftId,
      groupId: e.groupId,
      repeatCount: e.repeatCount,
      repeatEnd: Number(e.repeatEnd) === 1,
      combo: Number(gift.giftType ?? gift.type) === 1,
    });
    if (count <= 0) return;
    const who = viewer(e.user);
    const info = { name: String(gift.giftName ?? gift.name ?? '').slice(0, 40), coins: Number(gift.diamondCount) || 0 };
    console.log(`[Quà] ${who.name}: ${info.name} (${info.coins} xu) x${count}`);
    session.diamonds += info.coins * count;
    session.gifts += count;
    broadcast({ type: 'session', ...session });
    handle.gift(who, info, count);
  });
  conn.on(WebcastEvent.STREAM_END, ({ action }) => {
    console.log(`[Phiên live] Tổng: ${session.diamonds.toLocaleString('vi-VN')} kim cương từ ${session.gifts} quà`);
    // Action 4: TikTok suspended the LIVE (3 is the host ending it).
    if (action === 4) reportModeration('StreamSuspended', { tips: 'TikTok đã đình chỉ phiên live' });
    setStatus(false, action === 4 ? `TikTok đã đình chỉ phiên live của @${username}` : `@${username} đã kết thúc live`);
  });
  conn.on(ControlEvent.ERROR, (err) => console.error('[TikTok]', err?.message ?? err));
  conn.on(ControlEvent.DISCONNECTED, () => retry(10_000, 'Mất kết nối TikTok'));

  let timer;
  let busy = false;
  function retry(ms, reason) {
    setStatus(false, `${reason}, thử lại sau ${ms / 1000} giây`);
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  }
  async function run() {
    if (busy || conn.isConnected) return;
    busy = true;
    try {
      setStatus(false, `Đang chờ @${username} lên live...`);
      await conn.waitUntilLive(30);
      const state = await conn.connect();
      if (state.roomId !== session.roomId) {
        session = { roomId: state.roomId, diamonds: 0, gifts: 0, since: Date.now() };
        broadcast({ type: 'session', ...session });
      }
      setStatus(true, `Đã kết nối live @${username} (room ${state.roomId})`);
    } catch (err) {
      retry(30_000, `Lỗi: ${err?.message ?? err}`);
    } finally {
      busy = false;
    }
  }
  run();
}

// ---------- Web server ----------
const app = express();
app.disable('x-powered-by');
// Only answer requests addressed to this machine (blocks DNS rebinding).
app.use((req, res, next) => (['127.0.0.1', 'localhost'].includes(req.hostname) ? next() : res.status(403).end()));
app.use(express.static(path.join(root, 'public')));
app.use('/vendor/three', express.static(path.join(root, 'node_modules', 'three')));
app.use(express.json({ limit: '4kb' }));

app.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 2000\n\n');
  send(res, {
    type: 'snapshot',
    status,
    guide,
    alerts,
    safeMode,
    session,
    sky: sky.snapshot(),
    wheel: wheel?.view() ?? null,
    ...pond.snapshot(),
    tts: { enabled: vbee.enabled, voice: vbee.voice, readings: readings() },
  });
  clients.add(res);
  res.on('close', () => clients.delete(res));
});
setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 20_000);

app.get('/tts/:id', (req, res) => {
  const audio = voice.audio(req.params.id);
  if (!audio) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type('audio/mpeg').send(audio);
});

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || min));

// JSON-only endpoints: browsers cannot send application/json cross-site without a CORS preflight.
app.post('/api/simulate', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const { kind, name, count, gift, coins, avatar, text } = req.body ?? {};
  const nickname = typeof name === 'string' && name.trim() ? name : 'Khách thử';
  const who = viewer({ id: `sim:${nickname}`, nickname, avatarThumb: { urlList: [String(avatar ?? '').slice(0, 1000)] } });
  switch (kind) {
    case 'like':
      handle.like(who, clampInt(count, 1, 9999));
      break;
    case 'chat':
      if (cooledDown(`chat:${who.id}`, 300)) handle.comment(who, String(text ?? '').slice(0, 200));
      break;
    case 'follow':
    case 'share':
      handle.free(who, kind);
      break;
    case 'gift':
      handle.gift(who, { name: String(gift ?? 'Quà').slice(0, 40), coins: clampInt(coins, 1, 100_000) }, clampInt(count, 1, 999));
      break;
    default:
      return res.status(400).json({ error: 'kind không hợp lệ' });
  }
  res.status(204).end();
});

app.post('/api/reset', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  pond.reset();
  saveBoard();
  res.status(204).end();
});

app.post('/api/clear', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  pond.clearPond();
  res.status(204).end();
});

app.post('/api/sky', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const { weather, hour, freeze } = req.body ?? {};
  if (weather !== undefined && !sky.force(String(weather))) return res.status(400).json({ error: 'weather không hợp lệ' });
  if (typeof freeze === 'boolean') sky.freeze(freeze);
  if (hour !== undefined) sky.setHour(Number(hour));
  broadcastSky(weather !== undefined && weather !== 'auto');
  res.status(204).end();
});

// Chỉnh bộ đếm cá hiếm từ bảng điều khiển (ví dụ đặt 99 để lượt giật tới ra cá hiếm).
app.post('/api/rare', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  if (!config.rare) return res.status(400).json({ error: 'Chưa bật cá hiếm trong config.json' });
  pond.setHooked(clampInt(req.body?.hooked, 0, 1e9));
  saveRare();
  res.status(204).end();
});

// Vòng quay từ bảng điều khiển: quay ngay (có thể chỉ định ô hoặc vòng vàng), bật/tắt tự quay.
app.post('/api/wheel', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  if (!wheel) return res.status(400).json({ error: 'Chưa bật vòng quay trong config.json' });
  const { auto, slot, golden, spin } = req.body ?? {};
  if (typeof auto === 'boolean') wheel.setAuto(auto);
  if (spin === true && !wheel.spin({ slotId: typeof slot === 'string' ? slot : null, golden: typeof golden === 'boolean' ? golden : null })) {
    return res.status(409).json({ error: 'Vòng quay đang quay dở hoặc không có ô này' });
  }
  res.status(204).end();
});

app.post('/api/safe-mode', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  setSafeMode(req.body?.on === true, 'bật tay từ bảng điều khiển');
  res.status(204).end();
});

app.post('/api/telegram-test', async (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const error = await sendTelegram('✅ Game câu cá đã kết nối Telegram. Nếu TikTok cảnh báo phiên live, tin sẽ được gửi vào đây.');
  res.json({ message: error || 'Đã gửi tin thử, bạn kiểm tra Telegram nhé.' });
});

app.listen(port, host, (err) => {
  if (err) throw err;
  console.log(`Màn hình game:   http://${host}:${port}/`);
  console.log(`Bảng điều khiển: http://${host}:${port}/panel.html`);
  const { token, chatId } = telegramConfig();
  console.log(token && chatId ? 'Báo cảnh báo qua Telegram: bật · lệnh /count: bật' : 'Báo cảnh báo qua Telegram: tắt (thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_ADMIN_CHAT_ID trong .env)');
  pollTelegram();
  if (!vbee.enabled) console.log('Vbee: tắt (thiếu VBEE_TOKEN hoặc VBEE_APP_ID trong .env)');
  else {
    console.log(`Vbee đọc (giọng ${vbee.voice}): ${readings().join(', ') || 'không đọc gì'}`);
    warmVoice();
  }
  if (username) connectTikTok();
  else console.log('Chưa đặt kênh TikTok (npm start -- ten_kenh, hoặc tiktokUsername trong config.json). Đang ở chế độ thử.');
});

process.on('SIGINT', () => {
  saveBoard();
  saveRare();
  process.exit(0);
});
