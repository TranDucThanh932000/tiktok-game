import path from 'node:path';
import { readJson, writeJson } from '../config/loadConfig.js';

// Round results and the all-time wins table, kept in data/results.json so they survive a restart.
// TEST MODE rounds are stored too but flagged, and their wins go to a separate table.
export class ResultStore {
  constructor(dir, { persist = true } = {}) {
    this.file = path.join(dir, 'results.json');
    this.persist = persist;
    const saved = persist ? readJson(this.file, {}) : {};
    this.wins = saved.wins ?? {};
    this.testWins = saved.testWins ?? {};
    this.rounds = saved.rounds ?? [];
  }

  record(result) {
    this.rounds.push(result);
    if (this.rounds.length > 100) this.rounds.splice(0, this.rounds.length - 100);
    const winner = result.top[0];
    if (winner) {
      const table = winner.source === 'mock' ? this.testWins : this.wins;
      const entry = table[winner.userId] ?? { name: winner.name, count: 0 };
      entry.name = winner.name;
      entry.count++;
      entry.lastAt = result.at;
      table[winner.userId] = entry;
    }
    this.save();
  }

  winsTable(includeTest) {
    const rows = Object.entries(this.wins).map(([userId, w]) => ({ userId, ...w }));
    if (includeTest) rows.push(...Object.entries(this.testWins).map(([userId, w]) => ({ userId, ...w, test: true })));
    return rows.sort((a, b) => b.count - a.count || (a.lastAt ?? 0) - (b.lastAt ?? 0));
  }

  clear() {
    this.wins = {};
    this.testWins = {};
    this.rounds = [];
    this.save();
  }

  save() {
    if (!this.persist) return;
    try {
      writeJson(this.file, { wins: this.wins, testWins: this.testWins, rounds: this.rounds });
    } catch (err) {
      console.error(`[Kết quả] Không lưu được: ${err.message}`);
    }
  }
}
