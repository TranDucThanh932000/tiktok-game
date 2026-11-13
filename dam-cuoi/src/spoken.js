// Đổi chữ trên bảng và tên hiển thị thành chữ mà giọng đọc tiếng Việt đọc đúng. Chữ trên màn hình vẫn giữ nguyên.

const SMALL_CAPS = { ᴀ: 'a', ʙ: 'b', ᴄ: 'c', ᴅ: 'd', ᴇ: 'e', ғ: 'f', ɢ: 'g', ʜ: 'h', ɪ: 'i', ᴊ: 'j', ᴋ: 'k', ʟ: 'l', ᴍ: 'm', ɴ: 'n', ᴏ: 'o', ᴘ: 'p', ǫ: 'q', ʀ: 'r', ꜱ: 's', ᴛ: 't', ᴜ: 'u', ᴠ: 'v', ᴡ: 'w', ʏ: 'y', ᴢ: 'z' };
// Âm tiết tiếng Việt dài nhất có 7 chữ cái ("nghiêng"); dài hơn là chữ dính liền hoặc tiếng nước ngoài.
const MAX_SYLLABLE = 7;
const NOT_LATIN = /(?!\p{Script=Latin})\p{L}/u;

const titleIfAllCaps = (word) => {
  const letters = Array.from(word);
  return letters.length > 1 && word === word.toUpperCase() && word !== word.toLowerCase()
    ? letters[0] + letters.slice(1).join('').toLowerCase()
    : word;
};

// Trả về '' nếu không còn gì đọc được; khi đó cô giáo bỏ qua, không đọc sai tên.
export function readableName(name) {
  // NFKC đưa chữ hoa mỹ (𝓣𝓱𝓪𝓷𝓱, ＬＡＮ) về chữ thường dùng và ghép dấu tiếng Việt lại cho đúng.
  const plain = Array.from(String(name).normalize('NFKC'), (ch) => SMALL_CAPS[ch] ?? ch).join('');
  return plain
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    // Bỏ từ chữ số đầu tiên tới hết từ: Hùng 1995 -> Hùng, 2k5 -> bỏ, dominhquan7 -> dominhquan.
    .map((word) => word.replace(/\p{N}.*$/u, ''))
    .filter((word) => word && !NOT_LATIN.test(word) && Array.from(word).length <= MAX_SYLLABLE)
    .map(titleIfAllCaps)
    .join(' ');
}
