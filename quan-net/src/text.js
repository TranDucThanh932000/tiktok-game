// Đọc lệnh trong comment. Gõ có dấu hay không dấu, hoa hay thường, thêm dấu câu, emoji hay "nha", "đi" ở cuối đều được.

export function fold(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const TRAILING = new Set(['nha', 'nhe', 'nhen', 'nghen', 'di', 'nao', 'a', 'ah', 'oi', 'voi', 'luon', 'thoi', 'ne', 'ad', 'shop', 'ha', 'he', 'dum', 'giup', 'ik', 'em', 'anh', 'chi', 'co', 'cai']);
const LEADING = new Set(['cho', 'em', 'anh', 'chi', 'tui', 'toi', 'minh', 'con', 'xin', 'ad', 'co', 'oi']);

// Bảng lệnh: cụm từ đã bỏ dấu -> { kind, code? }.
export function buildCommands(config) {
  const table = new Map();
  const add = (phrases, command) => {
    for (const phrase of phrases) {
      const key = fold(phrase);
      if (key && !table.has(key)) table.set(key, command);
    }
  };
  const words = config.commands;
  add(words.join, { kind: 'join' });
  add(words.leave, { kind: 'leave' });
  add(words.check, { kind: 'check' });
  add(words.buzz, { kind: 'buzz' });
  add(words.rage, { kind: 'rage' });
  add(words.hide, { kind: 'hide' });
  for (const game of config.games) add([game.code, ...(game.aliases ?? [])], { kind: 'game', code: game.code });
  return table;
}

// Lệnh nằm trọn trong comment (không bắt chữ lẫn trong câu dài), "ngoi 7" là xin ngồi máy 7.
export function parseCommand(table, text) {
  let words = fold(text).split(' ').filter(Boolean);
  if (!words.length || words.length > 6) return null;
  let seat = null;
  if (words.length > 1 && /^\d{1,2}$/.test(words.at(-1))) {
    seat = Number(words.at(-1));
    words = words.slice(0, -1);
  }
  const look = () => {
    const hit = table.get(words.join(' '));
    if (!hit) return null;
    if (seat === null) return hit;
    return hit.kind === 'join' ? { ...hit, seat } : null;
  };
  let hit = look();
  while (!hit && words.length > 1 && TRAILING.has(words.at(-1))) {
    words = words.slice(0, -1);
    hit = look();
  }
  while (!hit && words.length > 1 && LEADING.has(words[0])) {
    words = words.slice(1);
    hit = look();
  }
  // "ngoiii", "veee": kéo dài chữ cuối.
  if (!hit && words.length === 1 && /(.)\1+$/.test(words[0])) {
    words = [words[0].replace(/(.)\1+$/, '$1')];
    hit = look();
  }
  return hit;
}

// Kiểu nhân vật cố định theo tài khoản.
export function lookOf(id) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return (h >>> 0) % 997;
}
