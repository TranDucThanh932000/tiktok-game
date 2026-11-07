// Bộ câu hỏi lấy từ questions.json (cùng dạng với Lớp Học): đáp án đúng luôn đứng đầu mảng o,
// lúc hỏi mới xáo thứ tự A B C D. Hết bộ mới xáo lại, để không gặp lại một câu quá sớm.

function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function validateBank(bank) {
  if (!Array.isArray(bank) || !bank.length) return ['cần ít nhất một câu hỏi'];
  const problems = [];
  bank.forEach((row, i) => {
    const where = `câu ${i + 1} ("${row?.q}")`;
    if (!row?.s || !row?.q) problems.push(`${where}: thiếu môn (s) hoặc nội dung (q)`);
    if (!Array.isArray(row?.o) || row.o.length !== 4) problems.push(`${where}: cần đúng 4 đáp án (o)`);
    else if (new Set(row.o.map(String)).size !== 4) problems.push(`${where}: có đáp án trùng nhau`);
  });
  return problems;
}

export function createQuestions(bank, { rng = Math.random } = {}) {
  let deck = [];
  const ahead = [];
  const draw = () => {
    if (!deck.length) deck = shuffled(bank, rng);
    const row = deck.pop();
    const answers = row.o.map(String);
    const options = shuffled(answers, rng);
    return { subject: row.s, text: row.q, options, correct: options.indexOf(answers[0]), explain: row.e || '' };
  };
  return {
    next: () => ahead.shift() ?? draw(),
    // Xem trước các câu sắp hỏi (thứ tự A B C D đã xáo sẵn), để MC chuẩn bị giọng đọc từ trước.
    peek(count = 1) {
      while (ahead.length < count) ahead.push(draw());
      return ahead.slice(0, count);
    },
  };
}
