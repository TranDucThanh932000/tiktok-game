// Rocks, logs, whirlpools, rapids and seaweed slow a duck briefly; boost zones and pickups help it.
// Fairness rules: objects spawn ahead of a randomly chosen duck (so every duck meets about as many), they arm only
// after armSeconds (nothing appears on top of a duck), each object hits a duck at most once, and after a hit the
// duck gets hitGraceSeconds of immunity. A slow never stops a duck: speed keeps a floor (minSpeedMultiplier).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ObstacleManager {
  constructor() {
    this.reset(1);
  }

  reset(seed) {
    this.rng = mulberry32(seed);
    this.items = [];
    this.seq = 0;
    this.nextSpawnAt = 0;
    this.changed = true;
  }

  pickType(types, sprint) {
    const entries = Object.entries(types).filter(([, t]) => sprint || !t.sprintOnly);
    const total = entries.reduce((sum, [, t]) => sum + t.weight, 0);
    let roll = this.rng() * total;
    for (const [name, type] of entries) {
      roll -= type.weight;
      if (roll <= 0) return name;
    }
    return entries.at(-1)[0];
  }

  // ducks: players still racing. Spawns at most one object per call.
  update(now, ducks, { phase, trackLength, lanes, rules }) {
    const before = this.items.length;
    const minPos = ducks.reduce((m, d) => Math.min(m, d.position), Infinity);
    this.items = this.items.filter((o) => now - o.spawnedAt < rules.lifetimeSeconds && !o.consumed && o.pos > minPos - trackLength * 0.02);
    if (this.items.length !== before) this.changed = true;
    const racing = phase === 'race' || phase === 'sprint';
    if (!rules.enabled || !racing || !ducks.length || now < this.nextSpawnAt || this.items.length >= rules.maxActive) return;
    this.nextSpawnAt = now + rules.spawnEverySeconds[phase] * (0.7 + this.rng() * 0.6);
    const target = ducks[Math.floor(this.rng() * ducks.length)];
    const pos = target.position + trackLength * (rules.aheadMin + this.rng() * (rules.aheadMax - rules.aheadMin));
    if (pos > trackLength * (1 - rules.noSpawnNearFinish)) return;
    const lane = Math.floor(this.rng() * lanes);
    if (this.items.some((o) => o.lane === lane && Math.abs(o.pos - pos) < trackLength * 0.03)) return;
    const type = this.pickType(rules.types, phase === 'sprint');
    this.items.push({ id: ++this.seq, type, kind: rules.types[type].kind, lane, pos, spawnedAt: now, armedAt: now + rules.armSeconds, hits: new Set(), consumed: false });
    this.changed = true;
  }

  // Objects this duck crossed between prev and next on its lane.
  crossed(duck, prev, next, now, halfWidth) {
    const out = [];
    for (const o of this.items) {
      if (o.consumed || o.lane !== duck.lane || now < o.armedAt || o.hits.has(duck.id)) continue;
      if (prev < o.pos + halfWidth && next >= o.pos - halfWidth) {
        o.hits.add(duck.id);
        if (o.kind === 'pickup') {
          o.consumed = true;
          this.changed = true;
        }
        out.push(o);
      }
    }
    return out;
  }

  view() {
    return this.items.filter((o) => !o.consumed).map((o) => ({ id: o.id, type: o.type, lane: o.lane, pos: Math.round(o.pos), armed: o.armedAt }));
  }
}
