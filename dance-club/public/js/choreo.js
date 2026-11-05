// ChoreographyPlayer: từ mốc thời gian server gửi (performingAt/finaleAt/returningAt)
// và dữ liệu choreography trong config, xác định phase + move hiện tại và phát event:
// PerformanceStarted, IntroCompleted, HighlightStarted, FreezeStarted, FinaleStarted, PerformanceCompleted.

const PHASE_EVENT = {
  main: 'IntroCompleted',
  highlight: 'HighlightStarted',
  freeze: 'FreezeStarted',
  finale: 'FinaleStarted',
};

export class ChoreographyPlayer {
  constructor(session, choreo, bpm) {
    this.session = session;
    this.choreo = choreo;
    this.bpm = bpm;
    this.fired = new Set();
    this.timeline = this.buildTimeline();
  }

  buildTimeline() {
    const s = this.session;
    const body = this.choreo.phases.filter((p) => p.phase !== 'finale');
    const finale = this.choreo.phases.filter((p) => p.phase === 'finale');
    const bodyShare = body.reduce((a, p) => a + p.share, 0) || 1;
    const finaleShare = finale.reduce((a, p) => a + p.share, 0) || 1;
    const out = [];
    let t = s.performingAt;
    for (const p of body) {
      const len = ((s.finaleAt - s.performingAt) * p.share) / bodyShare;
      out.push({ ...p, start: t, end: t + len });
      t += len;
    }
    t = s.finaleAt;
    for (const p of finale) {
      const len = ((s.returningAt - s.finaleAt) * p.share) / finaleShare;
      out.push({ ...p, start: t, end: t + len });
      t += len;
    }
    return out;
  }

  phaseAt(now) {
    if (now < this.session.performingAt) return null;
    return this.timeline.find((p) => now < p.end) ?? null;
  }

  // Move hiện tại: phase "main" xoay vòng mỗi `every` beat, các phase khác chia đều thời gian cho các move.
  moveAt(now, phase) {
    if (!phase) return null;
    const moves = phase.moves;
    if (moves.length === 1) return { id: moves[0], key: `${phase.phase}:0`, start: phase.start };
    if (phase.phase === 'main' || phase.every) {
      const every = phase.every ?? 4;
      const beatMs = 60000 / this.bpm;
      const i = Math.floor((now - phase.start) / (beatMs * every));
      return { id: moves[i % moves.length], key: `${phase.phase}:${i}`, start: phase.start + i * beatMs * every };
    }
    const len = (phase.end - phase.start) / moves.length;
    const i = Math.min(moves.length - 1, Math.floor((now - phase.start) / len));
    return { id: moves[i], key: `${phase.phase}:${i}`, start: phase.start + i * len };
  }

  // Trả về các event mới phát sinh kể từ lần gọi trước.
  events(now) {
    const out = [];
    const fire = (name, at) => {
      if (now >= at && !this.fired.has(name)) {
        this.fired.add(name);
        out.push(name);
      }
    };
    fire('PerformanceStarted', this.session.performingAt);
    for (const p of this.timeline) if (PHASE_EVENT[p.phase]) fire(PHASE_EVENT[p.phase], p.start);
    fire('PerformanceCompleted', this.session.returningAt);
    return out;
  }
}
