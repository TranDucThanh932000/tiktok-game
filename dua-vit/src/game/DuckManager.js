// One duck per viewer per round, keyed by the stable TikTok user id (never by the display name, which can change).
export function createPlayer({ userId, username, nickname, avatar, source }, { seq, lane, position, now }) {
  return {
    id: seq,
    userId,
    username,
    nickname: nickname || username,
    avatar: avatar || null,
    source,
    color: (seq * 137.508) % 360,
    lane,
    joinSeq: seq,
    joinedAt: now,

    position,
    baseSpeed: 0,
    speedMult: 1,
    posReachedAt: now,

    energy: 0,
    maxEnergy: 100,
    lastEnergyAt: -Infinity,
    likeRemainder: 0,
    earned: { like: 0, comment: 0, share: 0, pickup: 0 },
    turboUntil: 0,
    turboReadyAt: 0,
    turboTier: 0,

    contributionScore: 0,
    totalLikes: 0,
    totalComments: 0,
    totalShares: 0,
    totalGifts: 0,
    diamonds: 0,

    activeBuffs: [],
    cooldowns: {},
    lastCommentAt: -Infinity,
    combo: { count: 0, lastAt: -Infinity },
    shared: false,
    graceUntil: 0,
    lastActiveAt: now,

    isFinished: false,
    finishTime: null,
    rank: null,
  };
}

export class DuckManager {
  constructor() {
    this.players = new Map();
    this.seq = 0;
  }

  get size() {
    return this.players.size;
  }

  get(userId) {
    return this.players.get(userId);
  }

  list() {
    return [...this.players.values()];
  }

  // The least crowded lane, lowest index first, so ducks spread evenly over the river.
  pickLane(lanes) {
    const counts = new Array(lanes).fill(0);
    for (const p of this.players.values()) counts[p.lane]++;
    const fewest = Math.min(...counts);
    const free = counts.map((c, i) => (c === fewest ? i : -1)).filter((i) => i >= 0);
    return free[this.seq % free.length];
  }

  create(event, { lanes, position, now }) {
    const player = createPlayer(event, { seq: ++this.seq, lane: this.pickLane(lanes), position, now });
    this.players.set(event.userId, player);
    return player;
  }

  clear() {
    this.players.clear();
  }
}
