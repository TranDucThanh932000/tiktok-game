import { EventDeduplicator } from '../events/EventDeduplicator.js';
import { EventQueue } from '../events/EventQueue.js';
import { addBuff, expireBuffs, hasBuff, personalBonus, speedMultiplier } from './BuffManager.js';
import * as Energy from './EnergyManager.js';
import { activateSkill, resolveGiftTier } from './SkillManager.js';
import { CommunityManager } from './CommunityManager.js';
import { ObstacleManager } from './ObstacleManager.js';
import { rankRace, topBy } from './RankingManager.js';
import { DuckManager } from './DuckManager.js';
import { RoundManager } from './RoundManager.js';

// Bits of the per-duck flags sent to the renderer each frame.
export const FLAGS = {
  ENERGY_TURBO: 1, TURBO: 2, SUPER_TURBO: 4, RAINBOW_BOOST: 8, WINGS: 16, SHIELD: 32, SLOW: 64,
  FINISHED: 128, COMBO_TURBO: 256, ROCKET: 512, BOOST_ZONE: 1024, RAINBOW_PICKUP: 8,
};

const EVENTS_PER_TICK = 800;
const DISPLAY_METERS = 500;

// "Vịt ơi!!" -> "vit oi", "gooooo" -> "go": comments match with or without diacritics and stretched letters.
export const normalizeText = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/([a-z])\1{2,}/g, '$1')
    .trim();

const round1 = (n) => Math.round(n * 10) / 10;

const COMMUNITY_TEXT = {
  wind: 'CỘNG ĐỒNG ĐÃ GỌI GIÓ THUẬN!',
  tsunami: 'CỘNG ĐỒNG ĐÃ KÍCH HOẠT SÓNG THẦN!',
  cheer: 'ĐẠI HỘI CỔ VŨ BÙNG NỔ!',
  giftStorm: 'CƠN BÃO GIFT ĐỔ BỘ DÒNG SÔNG!',
};

const blankTotals = () => ({ likes: 0, comments: 0, commentsAll: 0, shares: 0, gifts: 0, diamonds: 0 });

export class GameEngine {
  constructor({ config, results, now = Date.now }) {
    this.config = config;
    this.results = results;
    this.wall = now;
    this.time = 0;
    this.paused = false;
    this.dedup = new EventDeduplicator({ now });
    this.queue = new EventQueue();
    this.ducks = new DuckManager();
    this.round = new RoundManager();
    this.community = new CommunityManager();
    this.obstacles = new ObstacleManager();
    this.fx = [];
    this.totals = blankTotals();
    this.stats = { processed: 0, live: 0, mock: 0, late: 0, rejected: 0, perSecond: 0 };
    this.rate = { second: 0, count: 0 };
    this.recent = [];
    this.communityScores = new Map();
    this.seenGifts = new Map();
    this.trackLength = this.computeTrackLength();
    this.finishedCount = 0;
    this.throttle = new Map();
  }

  // ---------- configuration ----------
  get game() {
    return this.config.game;
  }

  get balance() {
    return this.config.balance;
  }

  setConfig(config) {
    this.config = config;
    this.keywordCache = null;
  }

  computeTrackLength() {
    const { phases, trackFactor = 1.08 } = this.config.game;
    return this.config.balance.baseSpeed * (phases.race + phases.sprint) * trackFactor;
  }

  keywordPattern() {
    if (!this.keywordCache || this.keywordCache.source !== this.game.commentKeywords) {
      const words = this.game.commentKeywords.map(normalizeText).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      this.keywordCache = { source: this.game.commentKeywords, re: new RegExp(`(?:^| )(?:${words.join('|')})(?: |$)`) };
    }
    return this.keywordCache.re;
  }

  isValidComment(message) {
    if (!message || Array.from(message).length > this.game.commentMaxLength) return false;
    return this.keywordPattern().test(normalizeText(message));
  }

  // ---------- input ----------
  // Every event source calls this. Returns why an event was refused, or '' when it was queued.
  ingest(event) {
    if (!event || !['like', 'comment', 'share', 'gift'].includes(event.type)) return this.reject('bad');
    if (event.source === 'mock' && !this.game.testMode) return this.reject('test-off');
    if (!this.dedup.accept(event.eventId)) return 'duplicate';
    if (!this.queue.push(event)) return this.reject('queue-full');
    return '';
  }

  reject(reason) {
    this.stats.rejected++;
    return reason;
  }

  // ---------- main loop ----------
  tick(dtSeconds) {
    const dt = Math.min(Math.max(dtSeconds, 0), 0.25);
    for (const event of this.queue.drain(EVENTS_PER_TICK)) {
      try {
        this.process(event);
      } catch (err) {
        console.error(`[Game] Lỗi xử lý ${event.type}: ${err.stack ?? err}`);
      }
    }
    const second = Math.floor(this.wall() / 1000);
    if (second !== this.rate.second) {
      this.stats.perSecond = this.rate.count;
      this.rate = { second, count: 0 };
    }
    if (this.paused || this.round.phase === 'idle') return;
    this.time += dt;
    this.step(dt);
  }

  step(dt) {
    const now = this.time;
    const { phase } = this.round;
    const left = this.round.remaining(now);
    if (phase === 'registration' && left <= 0) {
      if (this.ducks.size) this.startRace();
      else this.round.enter('waiting', now);
    } else if (phase === 'race' && left <= 0) {
      this.startSprint();
    } else if (phase === 'sprint' && left <= 0) {
      return this.finishRace('time');
    } else if (phase === 'finish' && left <= 0) {
      if (this.game.autoNextRound) this.newRound();
      else this.round.enter('idle', now);
      return;
    }
    // Outside the race the windows keep counting (and pruning) but nothing fires.
    const rules = this.balance.community;
    for (const happening of this.community.update(now, this.round.racing ? rules : { ...rules, enabled: false })) this.onCommunity(happening);
    if (!this.round.racing) return;

    const racing = this.ducks.list().filter((p) => !p.isFinished);
    this.obstacles.update(now, racing, { phase: this.round.phase, trackLength: this.trackLength, lanes: this.game.lanes, rules: this.balance.obstacles });
    this.moveDucks(dt, now);
    if (this.ducks.size && this.finishedCount >= this.ducks.size) this.finishRace('all');
  }

  moveDucks(dt, now) {
    const b = this.balance;
    const L = this.trackLength;
    const sprint = this.round.phase === 'sprint';
    const dump = sprint && this.round.remaining(now) <= b.energy.sprintDump.secondsLeft;
    const community = this.community.bonus(b);
    const half = L * 0.006;
    for (const p of this.ducks.players.values()) {
      expireBuffs(p, now);
      if (p.isFinished) continue;
      const tier = Energy.takeTurbo(p, now, b.energy, { sprint, dump });
      if (tier) this.onEnergyTurbo(p, tier, now);
      const { boost, slow } = personalBonus(p, b);
      p.speedMult = speedMultiplier({ boost, slow, community, current: this.currentFor(p.lane, now, sprint) }, b);
      const speed = b.baseSpeed * p.speedMult;
      const prev = p.position;
      p.position += speed * dt;
      p.posReachedAt = now;
      for (const object of this.obstacles.crossed(p, prev, p.position, now, half)) this.applyObject(p, object, now);
      if (p.position >= L) {
        p.isFinished = true;
        p.finishTime = now - (p.position - L) / speed;
        p.position = L;
        const place = ++this.finishedCount;
        this.emit({ k: 'finish', id: p.id, place });
        if (place <= 3) this.note(`${p.nickname} về đích thứ ${place}!`, 'finish', p);
      }
    }
  }

  // A gentle zero-mean current that differs per lane: it keeps the pack moving visibly without deciding the race.
  currentFor(lane, now, sprint) {
    const c = this.balance.currents;
    const amplitude = sprint ? c.sprintAmplitude : c.amplitude;
    return amplitude * Math.sin((2 * Math.PI * now) / c.periodSeconds + lane * 1.7);
  }

  // ---------- events ----------
  process(event) {
    this.stats.processed++;
    this.stats[event.source] = (this.stats[event.source] ?? 0) + 1;
    this.rate.count++;
    const t = this.totals;
    if (event.type === 'like') t.likes += event.count;
    if (event.type === 'share') t.shares++;
    if (event.type === 'comment') t.commentsAll++;
    if (event.type === 'gift') {
      const count = Math.min(event.repeatCount, this.config.gifts.maxRepeatPerEvent ?? 99);
      t.gifts += count;
      t.diamonds += event.diamonds * count;
    }
    // Gifts always count: a combo can legitimately span minutes. Anything else that is too old, or was sent before
    // this round opened (a delayed delivery from the last round), only counts towards the totals above.
    const age = event.receivedAt - event.timestamp;
    const stale = event.type !== 'gift' && (age > this.game.maxEventAgeSeconds * 1000 || event.timestamp < this.round.wallStartedAt - 2000);
    if (stale) {
      this.stats.late++;
      return this.logEvent(event, 'đến trễ, chỉ cộng vào tổng');
    }
    if (this.round.phase === 'idle') return this.logEvent(event, 'game đang dừng');
    this[event.type](event);
  }

  like(e) {
    this.community.addLikes(e.count, this.time);
    if (!e.userId) return this.logEvent(e, `+${e.count} like cộng đồng`);
    this.addCommunityPoints(e, this.balance.communityPoints.perLike * e.count);
    const p = this.join(e);
    if (!p) return this.logEvent(e, 'không có vịt');
    p.totalLikes += e.count;
    p.contributionScore += this.balance.contribution.perLike * e.count;
    const added = Energy.addLikes(p, e.count, this.time, this.balance.energy);
    if (added > 0) this.emit({ k: 'energy', id: p.id, via: 'like', amount: round1(added) });
    this.logEvent(e, added > 0 ? `+${round1(added)} năng lượng` : p.earned.like >= this.balance.energy.freeCaps.like ? 'đã chạm giới hạn like' : 'tích lũy');
  }

  comment(e) {
    if (!this.isValidComment(e.message)) return this.logEvent(e, 'không có từ khóa');
    if (!e.userId) return this.logEvent(e, 'không rõ người gửi');
    const p = this.join(e);
    if (!p) return this.logEvent(e, 'không có vịt');
    const r = Energy.addComment(p, this.time, this.balance.energy);
    if (!r.accepted) return this.logEvent(e, 'trong cooldown');
    this.totals.comments++;
    p.totalComments++;
    p.contributionScore += this.balance.contribution.comment;
    this.community.addComment(e.userId, this.time);
    this.addCommunityPoints(e, this.balance.communityPoints.comment);
    this.emit({ k: 'energy', id: p.id, via: 'comment', amount: round1(r.added) });
    if (r.combo >= 2) this.emit({ k: 'combo', id: p.id, count: r.combo, multiplier: r.multiplier });
    if (r.comboTurbo) {
      const s = this.useSkill(p, 'COMBO_TURBO');
      if (s.ok) this.note(`${p.nickname} đạt COMBO x${r.combo} – TURBO COMBO!`, 'combo', p, e);
    }
    this.logEvent(e, `+${round1(r.added)} năng lượng${r.combo >= 2 ? `, combo x${r.combo}` : ''}`);
  }

  share(e) {
    if (!e.userId) return this.logEvent(e, 'không rõ người share, chỉ cộng tổng');
    this.community.addShare(e.userId, this.time);
    this.addCommunityPoints(e, this.balance.communityPoints.share);
    const p = this.join(e);
    if (!p) return this.logEvent(e, 'không có vịt');
    p.totalShares++;
    const r = Energy.addShare(p, this.time, this.balance.energy);
    if (!r.accepted) return this.logEvent(e, 'đã nhận thưởng share vòng này');
    p.contributionScore += this.balance.contribution.share;
    this.emit({ k: 'energy', id: p.id, via: 'share', amount: round1(r.added) });
    this.useSkill(p, 'WINGS');
    this.note(`${p.nickname} đã share – mọc CÁNH THIÊN THẦN!`, 'share', p, e);
    this.logEvent(e, `+${round1(r.added)} năng lượng, cánh thiên thần`);
  }

  gift(e) {
    const gifts = this.config.gifts;
    const count = Math.min(e.repeatCount, gifts.maxRepeatPerEvent ?? 99);
    const tierName = resolveGiftTier(e, gifts);
    const tier = gifts.tiers[tierName];
    this.trackGift(e, tierName, count);
    this.community.addGifts(count, this.time);
    const label = e.giftName || 'quà';
    if (!e.userId) {
      this.note(`Một bạn đã tặng ${label} x${count}!`, 'gift', null, e);
      return this.logEvent(e, 'không rõ người tặng, cộng cơn bão gift');
    }
    this.addCommunityPoints(e, this.balance.communityPoints.gift * count);
    const p = this.join(e);
    if (!p) {
      this.note(`Cảm ơn ${e.nickname} đã tặng ${label} x${count}!`, 'gift', null, e);
      return this.logEvent(e, 'không có vịt (ngoài giờ đua hoặc đã đầy)');
    }
    p.totalGifts += count;
    p.diamonds += e.diamonds * count;
    p.contributionScore += this.balance.contribution.perDiamond * Math.max(1, e.diamonds) * count;
    const added = Energy.addGift(p, tier.energy * count, this.time, this.balance.energy);
    if (added > 0) this.emit({ k: 'energy', id: p.id, via: 'gift', amount: round1(added) });
    const skill = this.balance.skills[tier.skill];
    const s = tier.skill ? this.useSkill(p, tier.skill) : { ok: false };
    const what = s.ok ? ` – ${s.queued ? 'chờ xuất phát để dùng' : 'kích hoạt'} ${skill.label}!` : s.reason === 'cooldown' ? ` – +${round1(added)} năng lượng (${skill.label} đang hồi chiêu)` : '';
    this.note(`${p.nickname} tặng ${label} x${count}${what}`, 'gift', p, e);
    this.logEvent(e, `nhóm ${tierName}, +${round1(added)} năng lượng${s.ok ? `, ${tier.skill}` : s.reason === 'cooldown' ? ', kỹ năng hồi chiêu' : ''}`);
  }

  // Before the start, skills wait at the start line and fire when the race begins.
  useSkill(p, skillId) {
    if (!this.round.racing) {
      p.pendingSkills ??= new Set();
      p.pendingSkills.add(skillId);
      return { ok: true, queued: true };
    }
    const r = activateSkill(p, skillId, this.time, this.balance);
    if (r.ok) this.emit({ k: 'skill', id: p.id, skill: skillId });
    return r;
  }

  onEnergyTurbo(p, tier, now) {
    addBuff(p, { id: 'ENERGY_TURBO', bonus: tier.bonus, seconds: tier.seconds }, now);
    const level = tier.dump ? 1 : this.balance.energy.turboTiers.filter((t) => t.energy <= tier.energy).length;
    p.turboTier = level;
    this.emit({ k: 'skill', id: p.id, skill: 'ENERGY_TURBO', tier: level });
    if (level >= 3) this.note(`${p.nickname} vừa kích hoạt TURBO +${Math.round(tier.bonus * 100)}%!`, 'skill', p);
  }

  applyObject(p, o, now) {
    const type = this.balance.obstacles.types[o.type];
    if (o.kind === 'obstacle') {
      if (hasBuff(p, 'WINGS')) return this.emit({ k: 'hit', id: p.id, type: o.type, result: 'fly', obj: o.id });
      const shield = p.activeBuffs.find((b) => b.id === 'SHIELD' && b.charges > 0);
      if (shield) {
        shield.charges = 0;
        return this.emit({ k: 'hit', id: p.id, type: o.type, result: 'shield', obj: o.id });
      }
      if (p.graceUntil > now) return;
      addBuff(p, { id: 'SLOW', kind: 'slow', slow: type.slow, seconds: type.seconds }, now);
      p.graceUntil = now + this.balance.obstacles.hitGraceSeconds;
      return this.emit({ k: 'hit', id: p.id, type: o.type, result: 'hit', obj: o.id });
    }
    if (type.skill) activateSkill(p, type.skill, now, this.balance);
    if (type.energy) Energy.addPickup(p, type.energy, now, this.balance.energy);
    if (type.points) p.contributionScore += type.points;
    this.emit({ k: 'pickup', id: p.id, type: o.type, obj: o.id });
  }

  onCommunity(happening) {
    if (happening.kind === 'milestone') {
      this.emit({ k: 'milestone', n: happening.n });
      return this.note(`Cộng đồng đạt ${happening.likes.toLocaleString('vi-VN')} like – sóng thần đang tới gần!`, 'community');
    }
    const { id, rule } = happening;
    if (id === 'tsunami') {
      const push = rule.push * this.trackLength;
      for (const p of this.ducks.players.values()) if (!p.isFinished) p.position = Math.min(this.trackLength - 1, p.position + push);
    }
    this.emit({ k: 'community', id, seconds: rule.seconds, bonus: rule.bonus });
    this.note(COMMUNITY_TEXT[id], 'community');
  }

  // ---------- players ----------
  join(e) {
    const existing = this.ducks.get(e.userId);
    if (existing) {
      existing.lastActiveAt = this.time;
      if (e.avatar && existing.avatar !== e.avatar) existing.avatar = e.avatar;
      return existing;
    }
    if (!this.round.joinable) return null;
    if (this.ducks.size >= this.game.maxDucks) {
      if (this.cooled('full', 10)) this.note(`Dòng sông đã đủ ${this.game.maxDucks} vịt, hẹn vòng sau nhé!`, 'system');
      return null;
    }
    let position = 0;
    if (this.round.racing && this.game.lateJoin === 'pack-tail') {
      const racing = this.ducks.list().filter((p) => !p.isFinished);
      const tail = racing.length ? Math.min(...racing.map((p) => p.position)) : 0;
      position = Math.max(0, Math.min(tail, this.trackLength * 0.5) - this.trackLength * 0.02);
    }
    const p = this.ducks.create(e, { lanes: this.game.lanes, position, now: this.time });
    p.baseSpeed = this.balance.baseSpeed;
    p.maxEnergy = this.balance.energy.max;
    this.emit({ k: 'join', duck: this.rosterEntry(p) });
    this.note(`${p.nickname} đã thả một chú vịt!`, 'join', p, e);
    if (this.round.phase === 'waiting') this.openRegistration();
    return p;
  }

  addCommunityPoints(e, points) {
    if (!e.userId || points <= 0) return;
    const entry = this.communityScores.get(e.userId) ?? { name: e.nickname, points: 0, test: e.source === 'mock' };
    entry.name = e.nickname || entry.name;
    entry.points += points;
    this.communityScores.set(e.userId, entry);
  }

  trackGift(e, tier, count) {
    const key = e.giftId || e.giftName;
    const entry = this.seenGifts.get(key) ?? { giftId: e.giftId, name: e.giftName, diamonds: e.diamonds, count: 0, source: e.source };
    entry.count += count;
    entry.tier = tier;
    entry.lastAt = this.wall();
    this.seenGifts.set(key, entry);
  }

  rosterEntry(p) {
    return { id: p.id, name: p.nickname, user: p.username, avatar: p.avatar, color: Math.round(p.color), lane: p.lane, test: p.source === 'mock' };
  }

  // ---------- round control ----------
  openRegistration() {
    this.round.enter('registration', this.time, this.game.phases.registration);
    this.emit({ k: 'phase', phase: 'registration' });
  }

  startRace() {
    const now = this.time;
    this.trackLength = this.computeTrackLength();
    this.obstacles.reset(this.round.n * 7919 + this.ducks.size);
    this.round.enter('race', now, this.game.phases.race);
    this.raceStartedAt = now;
    for (const p of this.ducks.players.values()) {
      p.baseSpeed = this.balance.baseSpeed;
      for (const skillId of p.pendingSkills ?? []) if (activateSkill(p, skillId, now, this.balance).ok) this.emit({ k: 'skill', id: p.id, skill: skillId });
      p.pendingSkills = null;
    }
    this.emit({ k: 'phase', phase: 'race' });
    this.note(`Vòng ${this.round.n} bắt đầu! ${this.ducks.size} chú vịt xuất phát!`, 'system');
  }

  startSprint() {
    this.round.enter('sprint', this.time, this.game.phases.sprint);
    this.emit({ k: 'phase', phase: 'sprint' });
    this.note('NƯỚC RÚT! Dùng hết năng lượng nào!', 'system');
  }

  finishRace(how) {
    const ranked = rankRace(this.ducks.list());
    this.round.enter('finish', this.time, this.game.phases.finish);
    const top = ranked.slice(0, 10).map((p) => ({
      rank: p.rank, id: p.id, userId: p.userId, name: p.nickname, avatar: p.avatar, source: p.source,
      finished: p.isFinished, time: p.isFinished ? round1(p.finishTime - this.raceStartedAt) : null,
      left: Math.round(((this.trackLength - p.position) / this.trackLength) * DISPLAY_METERS),
      score: Math.round(p.contributionScore),
    }));
    const result = { round: this.round.n, at: this.wall(), how, players: ranked.length, test: ranked.some((p) => p.source === 'mock'), top };
    this.results.record(result);
    const winner = top[0];
    const wins = winner ? (winner.source === 'mock' ? this.results.testWins : this.results.wins)[winner.userId]?.count : 0;
    this.emit({ k: 'phase', phase: 'finish' });
    this.emit({ k: 'win', result, wins });
    if (winner) this.note(`🏆 ${winner.name} vô địch vòng ${this.round.n}!`, 'win');
    this.lastResult = result;
  }

  newRound() {
    this.ducks.clear();
    this.finishedCount = 0;
    this.obstacles.reset(1);
    this.community.reset();
    this.round.begin(this.time, this.wall());
    this.trackLength = this.computeTrackLength();
    this.lastResult = null;
    this.emit({ k: 'roster', roster: [] });
    this.emit({ k: 'phase', phase: 'waiting' });
  }

  start() {
    this.paused = false;
    if (this.round.phase === 'idle') this.newRound();
  }

  stop() {
    this.paused = false;
    this.ducks.clear();
    this.finishedCount = 0;
    this.obstacles.reset(1);
    this.community.reset();
    this.round.enter('idle', this.time);
    this.emit({ k: 'roster', roster: [] });
    this.emit({ k: 'phase', phase: 'idle' });
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  reset() {
    this.stop();
    this.results.clear();
    this.totals = blankTotals();
    this.communityScores.clear();
    this.queue.clear();
    this.newRound();
  }

  // Leaving TEST MODE: test ducks, queued test events and test community points disappear from the LIVE game.
  purgeMock() {
    for (const [userId, p] of this.ducks.players) if (p.source === 'mock') this.ducks.players.delete(userId);
    this.finishedCount = this.ducks.list().filter((p) => p.isFinished).length;
    const keep = this.queue.drain().filter((e) => e.source !== 'mock');
    for (const e of keep) this.queue.push(e);
    for (const [userId, c] of this.communityScores) if (c.test) this.communityScores.delete(userId);
    this.emit({ k: 'roster', roster: this.roster() });
    if (!this.ducks.size && this.round.phase === 'registration') this.round.enter('waiting', this.time);
  }

  // Jumps to the next phase now.
  skip() {
    const { phase } = this.round;
    if (phase === 'waiting' || phase === 'registration') {
      if (!this.ducks.size) return 'Chưa có vịt nào tham gia.';
      this.startRace();
      return 'Đã bắt đầu đua.';
    }
    if (phase === 'race') {
      this.startSprint();
      return 'Chuyển sang nước rút.';
    }
    if (phase === 'sprint') {
      this.finishRace('skip');
      return 'Đã kết thúc vòng đua.';
    }
    if (phase === 'finish') {
      this.newRound();
      return 'Đã mở vòng mới.';
    }
    return 'Game đang dừng, bấm Start Game.';
  }

  // ---------- output ----------
  emit(fx) {
    this.fx.push(fx);
  }

  takeFx() {
    const out = this.fx;
    this.fx = [];
    return out;
  }

  note(text, kind, player = null, event = null) {
    if (!this.game.notifications && kind !== 'win') return;
    this.emit({ k: 'note', text, kind, id: player?.id ?? null, avatar: player?.avatar ?? event?.avatar ?? null, test: (player?.source ?? event?.source) === 'mock' });
  }

  cooled(key, seconds) {
    const at = this.throttle.get(key) ?? -Infinity;
    if (this.time - at < seconds) return false;
    this.throttle.set(key, this.time);
    return true;
  }

  logEvent(e, result) {
    this.recent.push({ at: e.receivedAt, src: e.source, type: e.type, user: e.nickname || '(cộng đồng)', detail: e.type === 'like' ? `${e.count} like` : e.type === 'comment' ? e.message.slice(0, 60) : e.type === 'gift' ? `${e.giftName || e.giftId} x${e.repeatCount}${e.streaking ? ' (combo)' : ''}` : '', result });
    if (this.recent.length > 120) this.recent.splice(0, this.recent.length - 120);
  }

  flagsOf(p) {
    let flags = p.isFinished ? FLAGS.FINISHED : 0;
    for (const b of p.activeBuffs) flags |= FLAGS[b.id] ?? 0;
    return flags;
  }

  frame() {
    const now = this.time;
    const ducks = [];
    for (const p of this.ducks.players.values()) {
      const comboLive = now - p.combo.lastAt <= this.balance.energy.comment.comboWindowSeconds ? p.combo.count : 0;
      ducks.push([p.id, round1(p.position), Math.round(p.speedMult * 1000), Math.round(p.energy), this.flagsOf(p), comboLive, p.turboUntil > now ? p.turboTier : 0]);
    }
    return {
      phase: this.round.phase,
      round: this.round.n,
      left: round1(this.round.remaining(now)),
      paused: this.paused,
      time: Math.round(this.time * 100) / 100,
      track: Math.round(this.trackLength),
      base: this.balance.baseSpeed,
      players: this.ducks.size,
      testMode: this.game.testMode,
      community: {
        bonus: Math.round(this.community.bonus(this.balance) * 1000) / 10,
        active: this.community.active.map((e) => ({ id: e.id, left: round1(e.endsAt - now) })),
        progress: this.community.progress(now, this.balance.community).map((p) => ({ ...p, cooldown: Math.ceil(p.cooldown), active: round1(p.active) })),
      },
      totals: this.totals,
      ducks,
    };
  }

  obstaclesView() {
    this.obstacles.changed = false;
    return this.obstacles.view();
  }

  rankings() {
    const list = this.ducks.list();
    const ranked = rankRace(list);
    const L = this.trackLength;
    const card = (p) => ({ id: p.id, name: p.nickname, avatar: p.avatar, color: Math.round(p.color), test: p.source === 'mock' });
    const includeTest = this.game.testMode;
    return {
      race: ranked.slice(0, 10).map((p) => ({ ...card(p), rank: p.rank, left: Math.round(((L - p.position) / L) * DISPLAY_METERS), score: Math.round(p.contributionScore), done: p.isFinished })),
      speed: topBy(list.filter((p) => !p.isFinished && this.round.racing), (p) => p.speedMult, 5).map((p) => ({ ...card(p), value: Math.round(this.balance.baseSpeed * p.speedMult) })),
      contrib: topBy(list, (p) => p.contributionScore, 5).map((p) => ({ ...card(p), value: Math.round(p.contributionScore) })),
      wins: this.results.winsTable(includeTest).slice(0, 5).map((w) => ({ name: w.name, value: w.count, test: Boolean(w.test) })),
      community: [...this.communityScores.values()]
        .filter((c) => includeTest || !c.test)
        .sort((a, b) => b.points - a.points)
        .slice(0, 5)
        .map((c) => ({ name: c.name, value: Math.round(c.points), test: c.test })),
    };
  }

  roster() {
    return this.ducks.list().map((p) => this.rosterEntry(p));
  }

  adminState() {
    const ranked = rankRace(this.ducks.list());
    const now = this.time;
    return {
      round: { n: this.round.n, phase: this.round.phase, left: round1(this.round.remaining(now)), paused: this.paused, track: Math.round(this.trackLength) },
      players: ranked.slice(0, 300).map((p) => ({
        rank: p.rank, id: p.id, name: p.nickname, user: p.username, src: p.source,
        progress: Math.round((p.position / this.trackLength) * 1000) / 10, speed: Math.round(this.balance.baseSpeed * p.speedMult),
        energy: Math.round(p.energy), score: Math.round(p.contributionScore),
        likes: p.totalLikes, comments: p.totalComments, shares: p.totalShares, gifts: p.totalGifts,
        earned: Object.fromEntries(Object.entries(p.earned).map(([k, v]) => [k, round1(v)])),
        buffs: p.activeBuffs.map((b) => `${b.id} ${round1(b.endsAt - now)}s`),
        cooldowns: Object.entries(p.cooldowns).filter(([, at]) => at > now).map(([id, at]) => `${id} ${Math.ceil(at - now)}s`),
        finished: p.isFinished,
      })),
      recent: this.recent.slice(-80).reverse(),
      stats: { ...this.stats, duplicates: this.dedup.duplicates, queue: this.queue.size, merged: this.queue.stats.merged, dropped: this.queue.stats.dropped },
      totals: this.totals,
      gifts: [...this.seenGifts.values()].sort((a, b) => b.lastAt - a.lastAt).slice(0, 40),
      results: this.results.rounds.slice(-10).reverse(),
      wins: this.results.winsTable(true).slice(0, 20),
    };
  }
}
