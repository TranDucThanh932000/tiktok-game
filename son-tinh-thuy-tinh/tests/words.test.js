import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Puzzle, bankSize, createDeck, sideMatcher, validateBank } from '../src/words.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const bank = JSON.parse(readFileSync(new URL('../words.json', import.meta.url), 'utf8'));
const reserved = Object.values(config.sides).flatMap((side) => side.keywords);

// Số ngẫu nhiên có hạt giống, để bài test lần nào cũng như nhau.
function seeded(seed) {
  let x = seed + 1;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

test('bộ từ có đúng 1000 từ hợp lệ, không có hai từ trùng nhau khi bỏ dấu', () => {
  assert.equal(bankSize(bank), 1000);
  assert.deepEqual(validateBank(bank, { reserved }), []);
});

test('báo lỗi từ trùng khi bỏ dấu, từ quá ngắn, có ký tự lạ, trùng từ khóa chọn phe', () => {
  const problems = validateBank({ Thử: ['con dê', 'con dế', 'mèo', 'cá-chép', 'sơn tinh'] }, { reserved });
  assert.equal(problems.length, 4);
  assert.match(problems.join('\n'), /"con dế".*trùng với "con dê"/);
  assert.match(problems.join('\n'), /"sơn tinh".*từ khóa chọn phe/);
});

test('nhận đáp án có dấu hay không dấu, viết hoa, viết liền, kèm chữ đệm', () => {
  const puzzle = new Puzzle({ topic: 'Con vật', text: 'cá chép' });
  for (const text of ['cá chép', 'Cá Chép', 'ca chep', 'CACHEP', 'cá chép!!', 'cá chép nha', 'đáp án là cá chép', 'là cá chép', 'Ｃá chép'])
    assert.ok(puzzle.matches(text), text);
  for (const text of ['cá', 'chép', 'cá chép đỏ', 'cá rô', 'tôi nghĩ là cá chép', 'cá chép cá rô cá mè', ''])
    assert.ok(!puzzle.matches(text), text);
});

test('bỏ chữ "con", "quả" vẫn được tính, gọi "trái" thay "quả" cũng được', () => {
  const cat = new Puzzle({ topic: 'Con vật', text: 'con mèo' });
  for (const text of ['con mèo', 'mèo', 'meo nha']) assert.ok(cat.matches(text), text);
  const mango = new Puzzle({ topic: 'Trái cây', text: 'quả xoài' });
  for (const text of ['quả xoài', 'xoài', 'trái xoài', 'trai xoai']) assert.ok(mango.matches(text), text);
});

test('gợi ý mở vài chữ, mở thêm dần nhưng luôn chừa chữ chưa mở', () => {
  const puzzle = new Puzzle({ topic: 'Món ăn', text: 'bánh chưng' }, { start: 0.3, max: 0.7 });
  const open = () => puzzle.tiles().filter((ch) => ch && ch !== ' ').length;
  assert.equal(puzzle.display, 'BÁNH CHƯNG');
  assert.equal(puzzle.tiles().length, 10);
  assert.equal(puzzle.tiles()[4], ' ');
  assert.equal(open(), 3, '30% của 9 chữ, làm tròn lên');
  let hints = 0;
  while (puzzle.hint()) hints++;
  assert.equal(hints, 3);
  assert.equal(open(), 6, '70% của 9 chữ, làm tròn xuống');
  puzzle.tiles().forEach((ch, i) => {
    if (ch) assert.equal(ch, puzzle.chars[i], 'chữ mở ra là chữ thật, giữ nguyên dấu');
  });
});

test('gợi ý đầu tiên rải đều các tiếng, không dồn vào một tiếng', () => {
  for (let seed = 0; seed < 50; seed++) {
    const puzzle = new Puzzle({ topic: 'Món ăn', text: 'bún đậu mắm tôm' }, { rng: seeded(seed), start: 0.3 });
    const perWord = puzzle.tiles().join('').split(' ').map((part) => part.length);
    assert.deepEqual(perWord, [1, 1, 1, 1], `seed ${seed}`);
  }
});

test('chọn phe bằng tên, viết tắt, số, kèm chữ đệm; không nhầm comment khác', () => {
  const sideOf = sideMatcher(config.sides);
  for (const text of ['Sơn Tinh', 'son tinh', 'SONTINH', 'ST', 'st', '1', '11', 'phe sơn tinh', 'team son tinh', 'vào phe Sơn Tinh nha', 'sơn tinh ơi'])
    assert.equal(sideOf(text), 'son', text);
  for (const text of ['Thủy Tinh', 'Thuỷ Tinh', 'thuy tinh', 'TT', '2', '22', 'theo thủy tinh', 'phe 2']) assert.equal(sideOf(text), 'thuy', text);
  for (const text of ['sơn', 'tinh', '12', '3', 'sơn tinh thủy tinh', 'hello', 'cá chép', 'phe', '']) assert.equal(sideOf(text), null, text);
});

test('rút từ không lặp cho tới khi hết bộ', () => {
  const deck = createDeck({ A: ['con mèo', 'con chó'], B: ['hoa sen'] });
  const first = new Set([deck.next().text, deck.next().text, deck.next().text]);
  assert.equal(first.size, 3);
  assert.equal(deck.size, 3);
});
