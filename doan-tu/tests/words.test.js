import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Puzzle, bankSize, createDeck, validateBank } from '../src/words.js';

const bank = JSON.parse(readFileSync(new URL('../words.json', import.meta.url), 'utf8'));

// Số ngẫu nhiên có hạt giống, để bài test lần nào cũng như nhau.
export function seeded(seed) {
  let x = seed + 1;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

test('bộ từ có đúng 1000 từ hợp lệ, từ nào cũng có gợi ý, không trùng khi bỏ dấu', () => {
  assert.equal(bankSize(bank), 1000);
  assert.deepEqual(validateBank(bank), []);
});

test('báo lỗi từ trùng khi bỏ dấu, thiếu gợi ý, gợi ý lộ đáp án, ký tự lạ', () => {
  const problems = validateBank({
    Thử: [
      ['con dê', 'Có râu, kêu be be'],
      ['con dế', 'Kêu re re trong đêm'],
      ['con mèo', 'Bắt chuột, kêu meo meo'],
      ['cá-chép', 'Vượt vũ môn hóa rồng'],
      ['cá voi', ''],
      'con gà',
    ],
  });
  const text = problems.join('\n');
  assert.equal(problems.length, 5, text);
  assert.match(text, /"con dế".*trùng với "con dê"/);
  assert.match(text, /"con mèo".*gợi ý có chứa đáp án/);
  assert.match(text, /"cá-chép".*chữ cái/);
  assert.match(text, /"cá voi".*gợi ý cần/);
  assert.match(text, /"con gà".*\["từ", "gợi ý"\]/);
});

test('nhận đáp án có dấu hay không dấu, viết hoa, viết liền, kèm chữ đệm', () => {
  const puzzle = new Puzzle({ topic: 'Con vật', text: 'cá chép', hint: 'Vượt vũ môn' });
  for (const text of ['cá chép', 'Cá Chép', 'ca chep', 'CACHEP', 'cá chép!!', 'cá chép nha', 'đáp án là cá chép', 'là cá chép', 'Ｃá chép'])
    assert.ok(puzzle.matches(text), text);
  for (const text of ['cá', 'chép', 'cá chép đỏ', 'cá rô', 'tôi nghĩ là cá chép', 'cá chép cá rô cá mè', ''])
    assert.ok(!puzzle.matches(text), text);
});

test('bỏ chữ "con", "quả" vẫn được tính, gọi "trái" thay "quả" cũng được', () => {
  const cat = new Puzzle({ topic: 'Con vật', text: 'con mèo', hint: 'Bắt chuột' });
  for (const text of ['con mèo', 'mèo', 'meo nha']) assert.ok(cat.matches(text), text);
  const mango = new Puzzle({ topic: 'Trái cây', text: 'quả xoài', hint: 'Vàng thơm' });
  for (const text of ['quả xoài', 'xoài', 'trái xoài', 'trai xoai']) assert.ok(mango.matches(text), text);
});

test('ô chữ bắt đầu đóng hết, mở dần tới một nửa và luôn chừa chữ chưa mở', () => {
  const puzzle = new Puzzle({ topic: 'Món ăn', text: 'bánh chưng', hint: 'Lang Liêu' }, { start: 0, max: 0.5, rng: seeded(3) });
  const open = () => puzzle.tiles().filter((ch) => ch && ch !== ' ').length;
  assert.equal(puzzle.display, 'BÁNH CHƯNG');
  assert.equal(puzzle.letters, 9);
  assert.deepEqual(puzzle.tiles(), ['', '', '', '', ' ', '', '', '', '', '']);
  let opened = 0;
  while (puzzle.openLetter()) opened++;
  assert.equal(opened, 4, '50% của 9 chữ, làm tròn xuống');
  assert.equal(open(), 4);
  puzzle.tiles().forEach((ch, i) => {
    if (ch) assert.equal(ch, puzzle.chars[i], 'chữ mở ra là chữ thật, giữ nguyên dấu');
  });
  const short = new Puzzle({ topic: 'Thử', text: 'gió', hint: 'Thổi vù vù' }, { start: 0.9, max: 1 });
  assert.equal(short.tiles().filter(Boolean).length, 2, 'từ 3 chữ mở nhiều nhất 2');
});

test('rút hết bộ từ mới lặp lại, mỗi từ kèm chủ đề và gợi ý', () => {
  const deck = createDeck({ A: [['một', 'số một'], ['hai', 'số hai']], B: [['ba', 'số ba']] }, { rng: seeded(1) });
  const first = [deck.next(), deck.next(), deck.next()];
  assert.deepEqual(new Set(first.map((w) => w.text)), new Set(['một', 'hai', 'ba']));
  assert.ok(first.every((w) => w.hint.startsWith('số ') && (w.topic === 'A' || w.topic === 'B')));
  assert.notEqual(deck.next().text, first[2].text, 'bộ mới không mở đầu bằng từ vừa hỏi');
});
