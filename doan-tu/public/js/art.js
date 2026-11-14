// Hình chibi từ ảnh (public/chibi, cắt từ art-src bằng tay một lần): mỗi ảnh là một lưới khung đều nhau,
// chân nhân vật nằm sát đáy khung, đầu ở giữa khung. Hiện một khung bằng background-position.

// Học sinh: 6 bạn (hàng) × 8 khung (cột).
export const KID = { FW: 147, FH: 216, COLS: 8, ROWS: 6 };
// Khung: đi xuống 0–1, đi sang trái 2–3 (sang phải thì lật), đi lên 4–5, ngồi quay lưng 6, quay lại cười giơ tay 7.
export const KF = { down: [0, 1], left: [2, 3], up: [4, 5], sit: 6, wave: 7 };

// Cô giáo: 12 khung trên lưới 6 × 2.
export const TEACHER = { FW: 303, FH: 394, COLS: 6, ROWS: 2 };
export const TF = { walk: [0, 1], idle: 2, blink: 3, talk: [4, 5], point: 6, pointTalk: 7, clap: 8, thumbs: 9, cheer: 10, surprised: 11 };

// Mỗi người chơi một bạn cố định theo look; nửa số người lật ngang cho lớp đỡ giống nhau.
export function kidLook(look = 0) {
  return { variant: look % KID.ROWS, flip: Math.floor(look / KID.ROWS) % 2 === 1 };
}

export function kidFrame(node, variant, frame, flip = false) {
  node.style.backgroundPosition = `${(frame / (KID.COLS - 1)) * 100}% ${(variant / (KID.ROWS - 1)) * 100}%`;
  node.style.scale = flip ? '-1 1' : '';
}

export function teacherFrame(node, frame, flip = false) {
  const col = frame % TEACHER.COLS;
  const row = Math.floor(frame / TEACHER.COLS);
  node.style.backgroundPosition = `${(col / (TEACHER.COLS - 1)) * 100}% ${(row / (TEACHER.ROWS - 1)) * 100}%`;
  node.style.scale = flip ? '-1 1' : '';
}
