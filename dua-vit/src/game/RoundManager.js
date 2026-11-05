// Round phases on the game clock (seconds, frozen while paused):
//   idle          game stopped by the streamer, nobody can join
//   waiting       registration open, countdown starts with the first duck
//   registration  ducks gather at the start line
//   race          main race
//   sprint        final stretch: more obstacles, stronger currents, top 3 shown
//   finish        results, fireworks, then a new round
export const RACING = new Set(['race', 'sprint']);
export const JOINABLE = new Set(['waiting', 'registration', 'race', 'sprint']);

export class RoundManager {
  constructor() {
    this.n = 0;
    this.phase = 'idle';
    this.startedAt = 0;
    this.endsAt = 0;
    this.wallStartedAt = 0;
  }

  enter(phase, now, seconds = 0) {
    this.phase = phase;
    this.startedAt = now;
    this.endsAt = seconds > 0 ? now + seconds : 0;
  }

  begin(now, wall) {
    this.n++;
    this.wallStartedAt = wall;
    this.enter('waiting', now);
  }

  remaining(now) {
    return this.endsAt ? Math.max(0, this.endsAt - now) : 0;
  }

  get racing() {
    return RACING.has(this.phase);
  }

  get joinable() {
    return JOINABLE.has(this.phase);
  }
}
