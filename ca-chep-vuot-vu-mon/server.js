import path from 'node:path';
import { appendFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseEnv } from 'node:util';
import express from 'express';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const config = JSON.parse(readFileSync(path.join(import.meta.dirname, 'config.json'), 'utf8'));
const username = (process.argv[2] ?? config.tiktokUsername ?? '').trim().replace(/^@/, '');
const port = Number(process.env.PORT) || config.port || 3001;
const host = '127.0.0.1';

// Every rise is a percentage of the waterfall: 100 takes a carp from the pond through Vũ Môn.
const RISE = { like: 0.4, comment: 2, follow: 3, share: 3, ...config.rise };
const DRIFT = { afterSeconds: 8, perSecond: 0.2, ...config.drift };
const ROUND_SECONDS = config.roundSeconds ?? 180;
const BREAK_SECONDS = config.breakSeconds ?? 12;
const JOIN_SECONDS = config.joinSeconds ?? 60;
const JOIN_WORDS = config.joinWords ?? ['chơi'];
const LEADER_EVERY = config.leaderEverySeconds ?? 10;
// Viewers entering the LIVE room get a carp swimming in the pond (bể cá); only commenting the join word puts it on the start line.
const ROOM_JOIN = config.roomJoin ?? true;
const WELCOME_EVERY = config.welcomeEverySeconds ?? 6;
const MAX_FISH = config.maxFish ?? 30;
const MAX_POND = config.maxPond ?? 40;
const GIVER_BONUS = config.giverBonus ?? 2;
const GIFT_CAP = config.giftCap ?? 95;
const EFFECTS = ['splash', 'wave', 'surge', 'rain', 'dragon'];
const tiers = [...config.giftTiers].sort((a, b) => b.minCoins - a.minCoins);

// "Chơi!" -> "choi", so comments match with or without diacritics.
const normalize = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const joinWords = Array.isArray(JOIN_WORDS) ? JOIN_WORDS.map(normalize).filter(Boolean) : [];
const joinPattern = new RegExp(`(?:^| )(?:${joinWords.join('|')})(?: |$)`);

const inRange = (n, min, max) => typeof n === 'number' && n >= min && n <= max;
const problems = [
  [Object.values(RISE).every((n) => inRange(n, 0, 100)), 'rise.* là số % từ 0 đến 100'],
  [inRange(DRIFT.afterSeconds, 0, 3600) && inRange(DRIFT.perSecond, 0, 100), 'drift.afterSeconds là số giây, drift.perSecond là số % mỗi giây'],
  [inRange(ROUND_SECONDS, 20, 3600) && inRange(BREAK_SECONDS, 3, 120), 'roundSeconds từ 20 đến 3600, breakSeconds từ 3 đến 120'],
  [inRange(JOIN_SECONDS, 10, 600) && joinWords.length > 0, 'joinSeconds từ 10 đến 600, joinWords là danh sách từ để tham gia, ví dụ ["chơi"]'],
  [
    inRange(LEADER_EVERY, 3, 600) && ['joinSpeech', 'welcomeSpeech', 'leaderSpeech', 'winnerSpeech'].every((key) => config[key] === undefined || typeof config[key] === 'string'),
    'leaderEverySeconds từ 3 đến 600; joinSpeech, welcomeSpeech, leaderSpeech, winnerSpeech là câu đọc ({name} là tên), để "" nếu muốn tắt',
  ],
  [typeof ROOM_JOIN === 'boolean' && inRange(WELCOME_EVERY, 1, 600), 'roomJoin là true/false, welcomeEverySeconds từ 1 đến 600'],
  [Number.isInteger(MAX_FISH) && MAX_FISH >= 5 && MAX_FISH <= 60, 'maxFish là số nguyên từ 5 đến 60'],
  [Number.isInteger(MAX_POND) && MAX_POND >= 0 && MAX_POND <= 100, 'maxPond (số cá tối đa trong bể) là số nguyên từ 0 đến 100'],
  [inRange(GIVER_BONUS, 1, 10) && inRange(GIFT_CAP, 0, 100), 'giverBonus từ 1 đến 10, giftCap từ 0 đến 100'],
  [tiers.length > 0 && tiers.every((t) => EFFECTS.includes(t.effect) && inRange(t.rise, 0, 100) && inRange(t.minCoins, 1, 1e6)), `giftTiers cần minCoins, rise (%) và effect là ${EFFECTS.join(', ')}`],
].filter(([ok]) => !ok);
if (problems.length) throw new Error(`config.json: ${problems.map(([, text]) => text).join('; ')}`);

const guide = {
  rise: RISE,
  giverBonus: GIVER_BONUS,
  giftCap: GIFT_CAP,
  roundSeconds: ROUND_SECONDS,
  joinSeconds: JOIN_SECONDS,
  joinWord: JOIN_WORDS[0],
  roomJoin: ROOM_JOIN,
  tiers: tiers.map(({ minCoins, effect, rise, icon }) => ({ minCoins, effect, rise, icon })),
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

// ---------- The race ----------
// Viewers entering the LIVE room (roomJoin) get a carp swimming in the pond (bể cá). Commenting a join word moves
// that carp onto the start line of the falls (school). A round opens with registration (join), then the race runs,
// the winner turns into a dragon (break), and the racers drop back into the pond for the next registration.
// Latecomers during a race start at the bottom; during the break they wait for the next registration.
// Phases: idle (waiting for the first "chơi") -> join -> racing -> break -> join ...
// A racer's progress p runs from 0 (start line) to 1 (through Vũ Môn).
const school = new Map();
const pond = new Map();
let fishSeq = 0;
let round = { n: 0, phase: 'idle', endsAt: 0 };
const dragons = new Map();
let moved = false;

const tag = ({ key, name, avatar }) => ({ key, name, avatar });
const roster = () => [...school.values()].map(tag);
const pondRoster = () => [...pond.values()].map(tag);
const sendRoster = () => broadcast({ type: 'roster', fish: roster(), pond: pondRoster() });
const positions = () => [...school.values()].map((fish) => [fish.key, Math.round(fish.p * 1000)]);
const board = () =>
  [...dragons.values()]
    .sort((a, b) => b.count - a.count || b.at - a.at)
    .slice(0, 5)
    .map(({ name, count }) => ({ name, count }));
const pct = (fraction) => Math.round(fraction * 1000) / 10;

function setRound(next) {
  round = next;
  broadcast({ type: 'round', ...round });
}

// Puts a viewer's carp in the pond, keeping its key so the page moves the same carp. A full pond lets go of
// the carp whose viewer has been quiet the longest. Returns false when nothing changed.
function toPond(who, key = ++fishSeq, active = Date.now()) {
  if (school.has(who.id)) return false;
  const swimmer = pond.get(who.id);
  if (swimmer) {
    swimmer.active = Math.max(swimmer.active, active);
    return false;
  }
  if (MAX_POND === 0) return false;
  if (pond.size >= MAX_POND) {
    let drop = null;
    for (const other of pond.values()) if (!drop || other.active < drop.active) drop = other;
    pond.delete(drop.id);
  }
  pond.set(who.id, { key, id: who.id, name: who.name, avatar: who.avatar, active });
  return true;
}

// Racers leave the falls and swim back into the pond; they comment the join word again to race the next round.
function clearFalls() {
  const racers = [...school.values()];
  school.clear();
  if (ROOM_JOIN) for (const fish of racers) toPond(fish, fish.key, fish.active);
  sendRoster();
  broadcast({ type: 'race', pos: [] });
}

// Viewers who commented the join word during the break, put on the start line when the next registration opens.
const waiting = new Map();

function openRegistration() {
  clearFalls();
  setRound({ n: round.n, phase: 'join', endsAt: Date.now() + JOIN_SECONDS * 1000 });
  const arrivals = [...waiting.values()];
  waiting.clear();
  for (const who of arrivals) addFish(who);
  if (arrivals.length) sendRoster();
}

// "A", "A và B", "A, B và C", "A, B và 5 bạn khác".
function listNames(names) {
  if (names.length === 1) return names[0];
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} và ${names.at(-1)}`;
  return `${names.slice(0, 2).join(', ')} và ${names.length - 2} bạn khác`;
}

// Joins are read three names at a time with a pause sized to the sentence, so a burst of "chơi" never piles up.
// Once registration is over, whoever is still waiting is read in one closing sentence.
// Room entries come far more often, so they are read together ("A, B và 5 bạn khác") at most every welcomeEverySeconds.
const joinQueue = [];
const welcomeQueue = [];
let nextJoinSpeech = 0;
let nextWelcomeSpeech = 0;
function announceJoins(now) {
  if (now < nextJoinSpeech) return;
  if (joinQueue.length) {
    const names = joinQueue.splice(0, round.phase === 'join' ? 3 : joinQueue.length);
    speakText(config.joinSpeech.replaceAll('{name}', listNames(names)));
    nextJoinSpeech = now + 1000 * (1 + Math.min(names.length, 3));
  } else if (welcomeQueue.length && now >= nextWelcomeSpeech) {
    const names = welcomeQueue.splice(0);
    speakText(config.welcomeSpeech.replaceAll('{name}', listNames(names)));
    nextJoinSpeech = now + 1000 * (1 + Math.min(names.length, 3));
    nextWelcomeSpeech = now + WELCOME_EVERY * 1000;
  }
}

// Moves the viewer's carp from the pond to the start line (or drops a new one in if they have none).
function addFish(who) {
  if (school.size >= MAX_FISH) return false;
  const swimmer = pond.get(who.id);
  pond.delete(who.id);
  school.set(who.id, { key: swimmer?.key ?? ++fishSeq, id: who.id, name: who.name, avatar: who.avatar, p: 0, active: Date.now() });
  return true;
}

// A join-word comment. The first one while idle opens registration.
function register(who) {
  if (school.has(who.id)) return;
  if (round.phase === 'break') {
    if (waiting.has(who.id) || waiting.size >= MAX_FISH) return;
    waiting.set(who.id, who);
  } else {
    if (round.phase === 'idle') openRegistration();
    // A "chơi" that found no space on the falls is not read as joined.
    if (!addFish(who)) return;
    sendRoster();
  }
  if (config.joinSpeech) {
    joinQueue.push(spokenName(who.name));
    announceJoins(Date.now());
  }
}

// Raises a carp by `percent` while a round runs; returns how far it actually rose (fraction).
function lift(fish, percent, cap = 100) {
  const top = cap / 100;
  if (round.phase !== 'racing' || percent <= 0 || fish.p >= top) return 0;
  const before = fish.p;
  fish.p = Math.min(top, fish.p + percent / 100);
  moved = true;
  return fish.p - before;
}

// Only racers move up the falls; a carp in the pond just reacts, and everyone still gets thanked for follows and shares.
function boost(who, via, percent, extra = {}) {
  const fish = school.get(who.id);
  if (!fish) {
    const swimmer = pond.get(who.id);
    if (swimmer) swimmer.active = Date.now();
    const avatar = via === 'like' ? {} : { avatar: who.avatar };
    if (swimmer || via === 'follow' || via === 'share') broadcast({ type: 'action', via, key: swimmer?.key ?? null, user: who.name, ...avatar, gain: 0, ...extra });
    return;
  }
  fish.active = Date.now();
  const gain = lift(fish, percent);
  // Likes are frequent and the page already has the avatar from the roster.
  const avatar = via === 'like' ? {} : { avatar: fish.avatar };
  broadcast({ type: 'action', via, key: fish.key, user: fish.name, ...avatar, gain: pct(gain), p: Math.round(fish.p * 1000), ...extra });
  if (fish.p >= 1) finishRound(fish, 'gate');
}

function finishRound(fish, how) {
  // The winner keeps p = 1 through the break, so its likes then must not win again.
  if (round.phase !== 'racing') return;
  fish.p = 1;
  const entry = dragons.get(fish.id) ?? { count: 0 };
  Object.assign(entry, { name: fish.name, count: entry.count + 1, at: Date.now() });
  dragons.set(fish.id, entry);
  console.log(`[Vòng ${round.n}] ${fish.name} hóa rồng (${how === 'gate' ? 'vượt Vũ Môn' : 'hết giờ, đang dẫn đầu'}), lần thứ ${entry.count}`);
  broadcast({ type: 'race', pos: positions() });
  broadcast({ type: 'win', key: fish.key, user: fish.name, avatar: fish.avatar, count: entry.count, round: round.n, how });
  setRound({ n: round.n, phase: 'break', endsAt: Date.now() + BREAK_SECONDS * 1000 });
  broadcast({ type: 'board', top: board() });
  if (config.winnerSpeech) speakText(config.winnerSpeech.replaceAll('{name}', spokenName(fish.name)));
}

function leading() {
  let leader = null;
  for (const fish of school.values()) if (fish.p > 0 && (!leader || fish.p > leader.p)) leader = fish;
  return leader;
}

// Time is up: the highest carp makes the final leap. Nobody swam: send the racers back to the pond and wait for viewers instead of looping empty rounds.
function timeUp() {
  const leader = leading();
  if (leader) return finishRound(leader, 'time');
  clearFalls();
  setRound({ n: round.n, phase: 'idle', endsAt: 0 });
}

let nextLeaderSpeech = 0;
function startRace() {
  nextLeaderSpeech = Date.now() + LEADER_EVERY * 1000;
  setRound({ n: round.n + 1, phase: 'racing', endsAt: Date.now() + ROUND_SECONDS * 1000 });
}

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  announceJoins(now);
  if (round.phase === 'join' && now >= round.endsAt) {
    if (school.size) startRace();
    else setRound({ n: round.n, phase: 'idle', endsAt: 0 });
  } else if (round.phase === 'racing') {
    // Against the current: a carp nobody has pushed for a while slowly slides back.
    for (const fish of school.values()) {
      if (fish.p > 0 && now - fish.active > DRIFT.afterSeconds * 1000) {
        fish.p = Math.max(0, fish.p - (DRIFT.perSecond / 100) * dt);
        moved = true;
      }
    }
    if (config.leaderSpeech && now >= nextLeaderSpeech) {
      nextLeaderSpeech = now + LEADER_EVERY * 1000;
      const leader = leading();
      if (leader) speakText(config.leaderSpeech.replaceAll('{name}', spokenName(leader.name)));
    }
    if (now >= round.endsAt) timeUp();
  } else if (round.phase === 'break' && now >= round.endsAt) {
    openRegistration();
  }
  if (moved) {
    moved = false;
    broadcast({ type: 'race', pos: positions() });
  }
}, 200);

const handle = {
  like: (who, count) => boost(who, 'like', RISE.like * count, { count }),
  comment(who, text) {
    if (!school.has(who.id) && joinPattern.test(normalize(text))) return register(who);
    // Only one comment per 5 s pushes a carp up (or splashes a pond carp).
    if ((school.has(who.id) || pond.has(who.id)) && cooledDown(`chat:${who.id}`, 5000)) boost(who, 'comment', RISE.comment);
  },
  follow: (who) => boost(who, 'follow', RISE.follow),
  share: (who) => boost(who, 'share', RISE.share),
  join(who) {
    broadcast({ type: 'join', user: who.name, avatar: who.avatar });
    if (ROOM_JOIN && toPond(who)) sendRoster();
    if (config.welcomeSpeech) {
      welcomeQueue.push(spokenName(who.name));
      announceJoins(Date.now());
    }
  },
  gift(who, gift, count) {
    const tier = tiers.find((t) => gift.coins >= t.minCoins) ?? tiers.at(-1);
    const fish = school.get(who.id);
    if (fish) fish.active = Date.now();
    const swimmer = fish ? null : pond.get(who.id);
    if (swimmer) swimmer.active = Date.now();
    const rise = tier.rise * count;
    // Nước dâng: the whole school rises and the giver's carp (if racing) rides highest. Gifts stop short of the gate (giftCap).
    const gain = fish ? lift(fish, rise * GIVER_BONUS, GIFT_CAP) : 0;
    let lifted = 0;
    for (const other of school.values()) if (other !== fish && lift(other, rise, GIFT_CAP) > 0) lifted++;
    const detail = config.giftLabels?.[gift.name] ?? gift.name;
    broadcast({ type: 'action', via: 'gift', key: (fish ?? swimmer)?.key ?? null, user: who.name, avatar: who.avatar, count, effect: tier.effect, detail, gain: pct(gain), all: lifted ? Math.round(rise * 10) / 10 : 0, p: fish ? Math.round(fish.p * 1000) : 0 });
    if (fish && fish.p >= 1) finishRound(fish, 'gate');
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
  const raw = String(user?.nickname || user?.displayId || '').replace(/\s+/g, ' ').trim();
  const name = Array.from(raw).slice(0, 20).join('') || 'Ẩn danh';
  // Browsers cannot render HEIC, which TikTok sometimes lists first.
  const urls = user?.avatarThumb?.urlList ?? user?.avatarMedium?.urlList ?? [];
  const avatar = safeImageUrl(urls.find((url) => !/\.heic\b/i.test(url)) ?? urls[0] ?? '');
  return { id: String(user?.id || user?.displayId || name), name, avatar };
}

const lastSeen = new Map();
function cooledDown(key, ms) {
  const now = Date.now();
  if (now - (lastSeen.get(key) ?? 0) < ms) return false;
  lastSeen.set(key, now);
  return true;
}

// ---------- Vbee voice ----------
// Clips are kept in memory and served from /tts/:id, keyed by a hash so repeated sentences cost nothing.
const clips = new Map();
let speechQueue = Promise.resolve();
let speechPending = 0;

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
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
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

// What the voice reads, for the panel and the startup log.
const readings = () =>
  [config.welcomeSpeech && 'người vào phòng', config.joinSpeech && 'người tham gia', config.leaderSpeech && `người dẫn đầu mỗi ${LEADER_EVERY} giây`, config.winnerSpeech && 'người hóa rồng'].filter(Boolean);

function speakText(sentence) {
  if (!vbee.enabled || safeMode) return;
  const text = sentence.slice(0, 500);
  const id = createHash('sha1').update(`${vbee.voice}|${vbee.speed}|${text}`).digest('hex').slice(0, 16);
  if (clips.has(id)) return broadcast({ type: 'speak', id });
  // Sequential requests keep reading order and stay under Vbee's concurrency limit; skip when backed up.
  if (speechPending >= 3) return console.warn(`[Vbee] Đang chờ đọc quá nhiều, bỏ qua: ${text}`);
  speechPending++;
  speechQueue = speechQueue
    .then(async () => {
      if (!clips.has(id)) {
        clips.set(id, await synthesize(text));
        console.log(`[Vbee] Đã tạo giọng đọc: ${text}`);
      }
      if (clips.size > 50) clips.delete(clips.keys().next().value);
      broadcast({ type: 'speak', id });
    })
    .catch((err) => {
      console.error(`[Vbee] Lỗi đọc "${text}": ${err.message}`);
      broadcast({ type: 'speak-error', message: err.message });
    })
    .finally(() => speechPending--);
}

// ---------- TikTok warnings, Telegram ----------
// TikTok may push moderation notices into the room: violation warnings, punishments, presence checks.
// A viewer connection may not receive all of them, so alerts are a hint; TikTok's inbox stays authoritative.
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
  appendFileSync(path.join(import.meta.dirname, 'moderation.log'), `${new Date().toISOString()} ${type} ${raw}\n`);
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
    file = parseEnv(readFileSync(path.join(import.meta.dirname, '.env'), 'utf8'));
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
    if (res.status === 409) return console.warn('[Telegram] Bot đang được chương trình khác nhận tin (có thể là game Chùa Online đang chạy), nên tắt lệnh /count ở game này.');
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

function connectTikTok() {
  const conn = new TikTokLiveConnection(username, { processInitialData: false });
  const streaks = new Map();

  conn.on(ControlEvent.DECODED_DATA, (type, event) => {
    const data = event?.data ?? event ?? {};
    const { common, ...fields } = data;
    // Control messages (pause, end...) count only when they carry a punishment.
    const warning = type === 'WebcastControlMessage' ? [data.punishInfo, data.perceptionDialog] : MODERATION_TYPES.has(type) ? [fields, common?.displayText] : [];
    if (hasContent(warning)) reportModeration(type, data);
  });
  conn.on(WebcastEvent.LIKE, (e) => handle.like(viewer(e.user), Math.max(1, Number(e.count) || 1)));
  conn.on(WebcastEvent.CHAT, (e) => handle.comment(viewer(e.user), e.content));
  conn.on(WebcastEvent.FOLLOW, (e) => {
    const who = viewer(e.user);
    if (cooledDown(`follow:${who.id}`, 600_000)) handle.follow(who);
  });
  conn.on(WebcastEvent.SHARE, (e) => {
    const who = viewer(e.user);
    if (cooledDown(`share:${who.id}`, 60_000)) handle.share(who);
  });
  conn.on(WebcastEvent.MEMBER, (e) => {
    // action 1 = joined the room, 3 = subscribed.
    if (Number(e.action) > 1) return;
    const who = viewer(e.user);
    if (cooledDown(`join:${who.id}`, 300_000)) handle.join(who);
  });
  conn.on(WebcastEvent.GIFT, (e) => {
    if (!e.gift) return;
    const repeat = Math.max(1, Number(e.repeatCount) || 1);
    let count = repeat;
    if (e.gift.type === 1) {
      // Combo gifts resend a running total; only the increase is new.
      const key = `${e.user?.id}:${e.giftId}:${e.groupId}`;
      const previous = streaks.get(key) ?? 0;
      count = repeat >= previous ? repeat - previous : repeat;
      if (e.repeatEnd === 1) streaks.delete(key);
      else streaks.set(key, repeat);
    }
    if (count <= 0) return;
    const who = viewer(e.user);
    const gift = { name: String(e.gift.name ?? ''), coins: Number(e.gift.diamondCount) || 0 };
    console.log(`[Quà] ${who.name}: ${gift.name} (${gift.coins} xu) x${count}`);
    session.diamonds += gift.coins * count;
    session.gifts += count;
    broadcast({ type: 'session', ...session });
    handle.gift(who, gift, count);
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
app.use(express.static(path.join(import.meta.dirname, 'public')));
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
    round,
    fish: roster(),
    pond: pondRoster(),
    pos: positions(),
    top: board(),
    tts: { enabled: vbee.enabled, voice: vbee.voice, readings: readings() },
  });
  clients.add(res);
  res.on('close', () => clients.delete(res));
});
setInterval(() => clients.forEach((res) => res.write(': ping\n\n')), 20_000);

app.get('/tts/:id', (req, res) => {
  const audio = clips.get(req.params.id);
  if (!audio) return res.status(404).end();
  res.type('audio/mpeg').send(audio);
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
      handle.like(who, clampInt(count, 1, 999));
      break;
    case 'chat':
      handle.comment(who, String(text ?? '').slice(0, 200));
      break;
    case 'follow':
      handle.follow(who);
      break;
    case 'share':
      handle.share(who);
      break;
    case 'join':
      handle.join(who);
      break;
    case 'gift':
      handle.gift(who, { name: String(gift ?? 'Quà').slice(0, 40), coins: clampInt(coins, 1, 100_000) }, clampInt(count, 1, 999));
      break;
    default:
      return res.status(400).json({ error: 'kind không hợp lệ' });
  }
  res.status(204).end();
});

// Skips ahead: registration -> race starts now; race -> the leader wins now.
app.post('/api/round/next', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  if (round.phase === 'join') {
    if (!school.size) return res.json({ message: `Chưa có ai comment “${JOIN_WORDS[0]}” lên vạch xuất phát.` });
    startRace();
    return res.json({ message: 'Đã bắt đầu đua.' });
  }
  if (round.phase !== 'racing') return res.json({ message: 'Đang chờ người chơi hoặc đang nghỉ giữa vòng.' });
  timeUp();
  res.json({ message: round.phase === 'break' ? 'Đã kết thúc vòng, cá dẫn đầu hóa rồng.' : 'Chưa cá nào bơi lên, vòng đã dừng.' });
});

app.post('/api/reset', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  dragons.clear();
  waiting.clear();
  clearFalls();
  broadcast({ type: 'board', top: [] });
  setRound({ n: 0, phase: 'idle', endsAt: 0 });
  res.status(204).end();
});

app.post('/api/safe-mode', (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  setSafeMode(req.body?.on === true, 'bật tay từ bảng điều khiển');
  res.status(204).end();
});

app.post('/api/telegram-test', async (req, res) => {
  if (!req.is('application/json')) return res.status(415).end();
  const error = await sendTelegram('✅ Cá chép vượt Vũ Môn đã kết nối Telegram. Nếu TikTok cảnh báo phiên live, tin sẽ được gửi vào đây.');
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
  else console.log(`Vbee đọc (giọng ${vbee.voice}): ${readings().join(', ') || 'không đọc gì'} (welcomeSpeech, joinSpeech, leaderSpeech, winnerSpeech trong config.json)`);
  if (username) connectTikTok();
  else console.log('Chưa đặt kênh TikTok (npm start -- ten_kenh, hoặc tiktokUsername trong config.json). Đang ở chế độ thử.');
});
