// Bộ từ và câu đố chữ: hiện vài chữ cái làm gợi ý, mở thêm dần. Đáp án so không dấu,
// không phân biệt hoa thường và khoảng trắng, vì người xem hay gõ "ca chep" hoặc "CÁCHÉP".

// Bỏ dấu (cả chữ toàn khổ như "Ａ"), đ -> d, chữ thường, tách thành từng tiếng.
export function syllables(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export const fold = (text) => syllables(text).join('');

const tidy = (text) => String(text ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');

function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function validateBank(bank, { reserved = [] } = {}) {
  if (!bank || typeof bank !== 'object' || Array.isArray(bank)) return ['cần dạng { "Chủ đề": ["từ", ...] }'];
  const problems = [];
  const seen = new Map();
  const banned = new Set(reserved.map(fold));
  for (const [topic, words] of Object.entries(bank)) {
    if (!Array.isArray(words) || !words.length) {
      problems.push(`chủ đề "${topic}" cần ít nhất một từ`);
      continue;
    }
    for (const raw of words) {
      const text = tidy(raw);
      const letters = Array.from(text.replace(/ /g, '')).length;
      const where = `"${raw}" (${topic})`;
      if (!/^[\p{L} ]+$/u.test(text)) problems.push(`${where}: chỉ được có chữ cái và dấu cách`);
      else if (letters < 4 || letters > 14) problems.push(`${where}: cần từ 4 đến 14 chữ cái`);
      else if (text.split(' ').length > 4) problems.push(`${where}: tối đa 4 tiếng`);
      const key = fold(text);
      if (banned.has(key)) problems.push(`${where}: trùng từ khóa chọn phe`);
      if (seen.has(key)) problems.push(`${where} trùng với "${seen.get(key)}"`);
      else seen.set(key, text);
    }
  }
  return problems;
}

export const bankSize = (bank) => Object.values(bank).reduce((sum, words) => sum + words.length, 0);

// Rút từ không lặp cho tới khi hết bộ, hết thì xáo lại.
export function createDeck(bank, { rng = Math.random } = {}) {
  const all = Object.entries(bank).flatMap(([topic, words]) => words.map((text) => ({ topic, text: tidy(text) })));
  let deck = [];
  let last = null;
  return {
    size: all.length,
    next() {
      if (!deck.length) {
        deck = shuffled(all, rng);
        // Bộ mới không mở đầu bằng đúng từ vừa hỏi.
        if (deck.length > 1 && deck.at(-1) === last) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
      }
      last = deck.pop();
      return last;
    },
  };
}

// Mở chữ xen kẽ giữa các tiếng, để gợi ý đầu tiên không dồn hết vào một tiếng.
function revealOrder(chars, rng) {
  const groups = [];
  let group = [];
  chars.forEach((ch, i) => {
    if (ch !== ' ') group.push(i);
    else if (group.length) {
      groups.push(group);
      group = [];
    }
  });
  if (group.length) groups.push(group);
  const pools = shuffled(groups.map((g) => shuffled(g, rng)), rng);
  const order = [];
  while (pools.some((pool) => pool.length)) for (const pool of pools) if (pool.length) order.push(pool.pop());
  return order;
}

// Người xem hay bỏ chữ "con", "quả"... ("mèo" cho "con mèo"), miền Nam gọi "quả" là "trái".
const CLASSIFIERS = new Set(['con', 'cai', 'chiec', 'qua', 'trai', 'cay']);
function acceptedKeys(answer) {
  const words = syllables(answer);
  const keys = new Set([words.join('')]);
  const rest = words.slice(1).join('');
  if (CLASSIFIERS.has(words[0]) && rest.length >= 2) keys.add(rest);
  if (words[0] === 'qua') keys.add(`trai${rest}`);
  if (words[0] === 'trai') keys.add(`qua${rest}`);
  return keys;
}

const LEADS = [[], ['la'], ['dap', 'an'], ['dap', 'an', 'la']];
// Không nhận "đó", "đây": bỏ dấu thành "do", "day", dễ nhầm với "đỏ", "dây" của một từ dài hơn.
const TAILS = [[], ['a'], ['nha'], ['nhe'], ['ne'], ['ha'], ['roi']];
const startsWith = (words, part) => part.every((w, i) => words[i] === w);
const endsWith = (words, part) => part.every((w, i) => words[words.length - part.length + i] === w);

// Nhận cả "đáp án là cá chép", "cá chép nha"; không nhận câu dài có lẫn đáp án.
export function isAnswer(comment, keys) {
  const words = syllables(comment);
  if (!words.length || words.length > 10) return false;
  for (const lead of LEADS) {
    if (!startsWith(words, lead)) continue;
    for (const tail of TAILS) {
      if (lead.length + tail.length >= words.length || !endsWith(words, tail)) continue;
      if (keys.has(words.slice(lead.length, words.length - tail.length).join(''))) return true;
    }
  }
  return false;
}

export class Puzzle {
  constructor({ topic, text }, { rng = Math.random, start = 0.3, max = 0.7 } = {}) {
    this.topic = topic;
    this.answer = tidy(text);
    this.chars = Array.from(this.answer.toUpperCase());
    this.order = revealOrder(this.chars, rng);
    const letters = this.order.length;
    // Luôn chừa ít nhất một chữ chưa mở.
    this.shown = Math.min(letters - 1, Math.max(1, Math.ceil(letters * start)));
    this.limit = Math.min(letters - 1, Math.max(this.shown, Math.floor(letters * max)));
    this.keys = acceptedKeys(this.answer);
  }

  get display() {
    return this.chars.join('');
  }

  // '' là ô chưa mở, ' ' là chỗ cách giữa hai tiếng.
  tiles() {
    const open = new Set(this.order.slice(0, this.shown));
    return this.chars.map((ch, i) => (ch === ' ' ? ' ' : open.has(i) ? ch : ''));
  }

  hint() {
    if (this.shown >= this.limit) return null;
    const index = this.order[this.shown++];
    return { index, letter: this.chars[index] };
  }

  matches(comment) {
    return isAnswer(comment, this.keys);
  }
}

// "Sơn Tinh", "son tinh", "phe sơn tinh", "ST", "1", "11" (TikTok chặn comment trùng nên người xem gõ lặp).
const SIDE_FILLERS = new Set(['phe', 'team', 'doi', 'ben', 'theo', 'chon', 'vao', 've', 'cho', 'toi', 'minh', 'em', 'day', 'nha', 'nhe', 'ne', 'oi', 'a', 'di', 'luon', 'nao']);
export function sideMatcher(sides) {
  const keys = new Map();
  for (const [side, { keywords }] of Object.entries(sides)) for (const word of keywords) keys.set(fold(word), side);
  return (comment) => {
    const words = syllables(comment);
    if (!words.length || words.length > 6) return null;
    const text = words.filter((w) => !SIDE_FILLERS.has(w)).join('');
    if (!text) return null;
    if (keys.has(text)) return keys.get(text);
    for (const [key, side] of keys) if (text.length % key.length === 0 && text.length <= key.length * 5 && key.repeat(text.length / key.length) === text) return side;
    return null;
  };
}
