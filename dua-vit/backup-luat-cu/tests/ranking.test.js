import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRace, rankRace, winnerOf } from '../src/game/RankingManager.js';

const duck = (name, fields) => ({ name, isFinished: false, finishTime: null, position: 0, posReachedAt: 0, joinSeq: 0, ...fields });

test('finished ducks rank by finish time, ahead of everyone still swimming', () => {
  const ranked = rankRace([
    duck('far', { position: 9000, joinSeq: 1 }),
    duck('second', { isFinished: true, finishTime: 81.2, joinSeq: 2 }),
    duck('first', { isFinished: true, finishTime: 80.4, joinSeq: 3 }),
  ]);
  assert.deepEqual(ranked.map((d) => d.name), ['first', 'second', 'far']);
  assert.deepEqual(ranked.map((d) => d.rank), [1, 2, 3]);
});

test('unfinished ducks rank by distance, then by who reached it first, then join order', () => {
  const ranked = rankRace([
    duck('late', { position: 500, posReachedAt: 12, joinSeq: 1 }),
    duck('early', { position: 500, posReachedAt: 10, joinSeq: 2 }),
    duck('lead', { position: 800, joinSeq: 3 }),
    duck('tieB', { position: 100, posReachedAt: 5, joinSeq: 5 }),
    duck('tieA', { position: 100, posReachedAt: 5, joinSeq: 4 }),
  ]);
  assert.deepEqual(ranked.map((d) => d.name), ['lead', 'early', 'late', 'tieA', 'tieB']);
});

test('ranking is stable: same input, same order', () => {
  const ducks = Array.from({ length: 50 }, (_, i) => duck(`d${i}`, { position: (i * 37) % 11, joinSeq: i }));
  const a = rankRace(ducks).map((d) => d.name);
  const b = rankRace([...ducks].reverse()).map((d) => d.name);
  assert.deepEqual(a, b);
});

test('winner is the first finisher, else the farthest duck', () => {
  assert.equal(winnerOf([duck('a', { position: 10 }), duck('b', { position: 20 })]).name, 'b');
  assert.equal(winnerOf([duck('a', { position: 10 }), duck('b', { isFinished: true, finishTime: 99 })]).name, 'b');
  assert.equal(winnerOf([]), null);
  assert.ok(compareRace(duck('x', { position: 1 }), duck('y', { position: 1 })) === 0);
});
