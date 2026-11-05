import { RIVER } from './layout.js';

// Decides what the camera looks at during a race, and eases the zoom and the pan towards it. It holds no drawing and
// no server state: every game window directs its own camera from the same events.
//   gift    someone just sent a gift: cut to their duck. A burst of gifts queues up, biggest first, and each shot is
//           cut short as soon as another one is waiting, so nobody who paid waits long.
//   leader  every so often, when nothing else is on: a few seconds on whoever is ahead.
const DEFAULTS = {
  enabled: true,
  zoom: 2.2,
  leaderEverySeconds: 18,
  sprintEverySeconds: 10,
  leaderSeconds: 5,
  giftSeconds: { small: 2.5, medium: 3, large: 4, special: 5, skin: 3.5 },
  minGiftSeconds: 1.6,
  finishHoldSeconds: 1.5,
  maxQueue: 5,
};
const TIER_RANK = { small: 1, medium: 2, skin: 2, large: 3, special: 4 };
const tierRank = (tier) => TIER_RANK[tier] ?? 0;

const CENTER_X = RIVER.x + RIVER.w / 2;
const CENTER_Y = RIVER.y + RIVER.h / 2;

export class CameraDirector {
  constructor(rules) {
    this.configure(rules);
    this.focus = null;
    this.last = null;
    this.queue = [];
    this.sinceLeader = 0;
    this.started = null;
    this.k = 0;
    this.kick = 0;
    this.zoomGoal = this.rules.zoom;
    this.x = CENTER_X;
    this.y = CENTER_Y;
  }

  configure(rules) {
    this.rules = { ...DEFAULTS, ...rules, giftSeconds: { ...DEFAULTS.giftSeconds, ...rules?.giftSeconds } };
  }

  giftSeconds(tier) {
    return this.rules.giftSeconds[tier] ?? this.rules.giftSeconds.small;
  }

  onGift({ id, tier, meters, count, name, skinLabel }) {
    if (!this.rules.enabled) return;
    const merge = (into) => {
      into.count = into.name === name ? into.count + count : count;
      into.name = name;
      into.meters += meters;
      into.skinLabel = skinLabel ?? into.skinLabel;
      if (tierRank(tier) > tierRank(into.tier)) into.tier = tier;
    };
    // More of the same from the duck on screen (a combo) stays on it and hits again.
    if (this.focus?.kind === 'gift' && this.focus.id === id) {
      merge(this.focus);
      this.focus.left = Math.max(this.focus.left, this.giftSeconds(tier));
      this.focus.elapsed = Math.min(this.focus.elapsed, 0.8);
      this.kick = 1;
      return;
    }
    const queued = this.queue.find((g) => g.id === id);
    if (queued) merge(queued);
    else this.queue.push({ id, kind: 'gift', tier, meters, count, name, skinLabel });
    this.queue.sort((a, b) => tierRank(b.tier) - tierRank(a.tier));
    this.queue.length = Math.min(this.queue.length, this.rules.maxQueue);
  }

  begin(shot, seconds) {
    this.focus = { ...shot, left: seconds, elapsed: 0, finishing: false };
    this.last = this.focus;
    this.started = this.focus;
    this.kick = shot.kind === 'gift' ? 1 : 0;
    this.zoomGoal = this.rules.zoom * (shot.tier === 'special' ? 1.15 : 1);
  }

  // The shot that began since the last call, once: the caller fires its bursts and sounds.
  takeStarted() {
    const shot = this.started;
    this.started = null;
    return shot;
  }

  // target(id) returns { x, y, finished } for a duck on the river, or null.
  direct(dt, { sprint, leaderId, target }) {
    const r = this.rules;
    const f = this.focus;
    if (f) {
      const duck = target(f.id);
      if (!duck) {
        this.focus = null;
      } else {
        if (duck.finished && !f.finishing) {
          f.finishing = true;
          f.left = Math.min(f.left, r.finishHoldSeconds);
        }
        if (f.kind === 'leader' && !f.finishing && leaderId != null) f.id = leaderId;
        f.left -= dt;
        f.elapsed += dt;
        const giftWaiting = this.queue.length > 0;
        if (f.left <= 0 || (giftWaiting && (f.kind === 'leader' || f.elapsed >= r.minGiftSeconds))) this.focus = null;
      }
    }
    while (!this.focus && this.queue.length) {
      const gift = this.queue.shift();
      const duck = target(gift.id);
      if (duck && !duck.finished) this.begin(gift, this.giftSeconds(gift.tier));
    }
    if (this.focus) return;
    this.sinceLeader += dt;
    if (this.sinceLeader < (sprint ? r.sprintEverySeconds : r.leaderEverySeconds)) return;
    const leader = leaderId != null ? target(leaderId) : null;
    if (!leader || leader.finished) return;
    this.sinceLeader = 0;
    this.begin({ id: leaderId, kind: 'leader' }, r.leaderSeconds);
  }

  update(dt, { racing, sprint = false, leaderId = null, target }) {
    if (racing && this.rules.enabled) {
      this.direct(dt, { sprint, leaderId, target });
    } else {
      this.focus = null;
      this.queue = [];
      this.sinceLeader = 0;
    }
    const duck = this.focus ? target(this.focus.id) : null;
    this.k += ((duck ? 1 : 0) - this.k) * Math.min(1, dt * (duck ? 5 : 3.5));
    this.kick = Math.max(0, this.kick - dt * 2);
    // The duck sits a little behind the centre, so the shot looks at the water ahead of it.
    const goalX = duck ? duck.x + (RIVER.w / this.zoomGoal) * 0.12 : CENTER_X;
    const goalY = duck ? duck.y - 20 : CENTER_Y;
    const follow = Math.min(1, dt * 7);
    this.x += (goalX - this.x) * follow;
    this.y += (goalY - this.y) * follow;
  }

  // Where the river is seen from. Kept inside the river, so the bare background never shows at the edges.
  view() {
    const zoom = 1 + (this.zoomGoal - 1) * this.k + this.kick * 0.18 * this.k;
    const halfW = RIVER.w / 2 / zoom;
    const halfH = RIVER.h / 2 / zoom;
    return {
      zoom,
      x: Math.min(RIVER.x + RIVER.w - halfW, Math.max(RIVER.x + halfW, this.x)),
      y: Math.min(RIVER.y + RIVER.h - halfH, Math.max(RIVER.y + halfH, this.y)),
    };
  }
}
