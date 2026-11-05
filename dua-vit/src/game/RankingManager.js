// Race order is fully deterministic:
//   1. finished ducks first, earliest finish time first;
//   2. then farthest position;
//   3. equal position: whoever reached it first (posReachedAt);
//   4. still equal: whoever joined first.
// Only the distance swum decides the race order.
export function compareRace(a, b) {
  if (a.isFinished !== b.isFinished) return a.isFinished ? -1 : 1;
  if (a.isFinished) return a.finishTime - b.finishTime || a.joinSeq - b.joinSeq;
  return b.position - a.position || a.posReachedAt - b.posReachedAt || a.joinSeq - b.joinSeq;
}

export function rankRace(players) {
  const sorted = [...players].sort(compareRace);
  sorted.forEach((p, i) => (p.rank = i + 1));
  return sorted;
}

export const winnerOf = (players) => (players.length ? [...players].sort(compareRace)[0] : null);

// Top n by a numeric score, ties broken by join order (stable, never random).
export function topBy(items, score, n) {
  return [...items]
    .filter((item) => score(item) > 0)
    .sort((a, b) => score(b) - score(a) || (a.joinSeq ?? 0) - (b.joinSeq ?? 0))
    .slice(0, n);
}
