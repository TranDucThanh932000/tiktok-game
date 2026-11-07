// Chuẩn hóa bình luận và kiểm duyệt chữ trước khi đưa lên màn hình hoặc cho MC đọc.

const SMALL_CAPS = { ᴀ: 'a', ʙ: 'b', ᴄ: 'c', ᴅ: 'd', ᴇ: 'e', ғ: 'f', ɢ: 'g', ʜ: 'h', ɪ: 'i', ᴊ: 'j', ᴋ: 'k', ʟ: 'l', ᴍ: 'm', ɴ: 'n', ᴏ: 'o', ᴘ: 'p', ǫ: 'q', ʀ: 'r', ꜱ: 's', ᴛ: 't', ᴜ: 'u', ᴠ: 'v', ᴡ: 'w', ʏ: 'y', ᴢ: 'z' };
const MAX_SYLLABLE = 7; // "nghiêng"; dài hơn là chữ dính liền hoặc tiếng nước ngoài
const NOT_LATIN = /(?!\p{Script=Latin})\p{L}/u;
const LINK = /(https?:|www\.|\.(com|net|vn|org|me|io)\b|@\w)/i;
const PHONE = /\d[\d\s.-]{6,}\d/;
// Câu lệnh người xem dùng để điều khiển MC thì không đọc.
const COMMAND = /\b(đọc|nói|hãy|bảo|mc|duy|linh|chửi|hát|kêu|gọi)\b/iu;

// So khớp toàn bộ câu sau khi chuẩn hóa Unicode, chữ hoa/thường và khoảng trắng.
export const normalize = (text) => String(text ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

function hasBannedWord(text, bannedWords) {
  const plain = normalize(text);
  return bannedWords.some((word) => new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').test(plain));
}

// Tên hiển thị trên màn hình: tên có liên hệ riêng hoặc từ xúc phạm không được đưa lên.
export function safeName(raw, bannedWords = []) {
  const name = Array.from(String(raw ?? '').replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ').trim()).slice(0, 20).join('').trim();
  if (!name || LINK.test(name) || PHONE.test(name) || hasBannedWord(name, bannedWords)) return 'Bạn mới';
  return name;
}

const titleIfAllCaps = (word) => {
  const letters = Array.from(word);
  return letters.length > 1 && word === word.toUpperCase() && word !== word.toLowerCase() ? letters[0] + letters.slice(1).join('').toLowerCase() : word;
};

// Chữ giọng đọc đọc được; '' nếu không còn gì đọc đúng, khi đó MC gọi "bạn" thay vì đọc sai tên.
export function spokenName(name) {
  const plain = Array.from(String(name).normalize('NFKC'), (ch) => SMALL_CAPS[ch] ?? ch).join('');
  return plain
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/\p{N}.*$/u, ''))
    .filter((word) => word && !NOT_LATIN.test(word) && Array.from(word).length <= MAX_SYLLABLE)
    .map(titleIfAllCaps)
    .join(' ');
}

// Ý chia sẻ ngắn của người chơi: chỉ nhận câu ngắn, sạch; còn lại coi như không có.
export function safeShare(raw, bannedWords = []) {
  const text = String(raw ?? '').replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ').trim();
  const words = text.split(' ').length;
  if (Array.from(text).length < 3 || Array.from(text).length > 40 || words < 2) return '';
  if (/\d/.test(text) || LINK.test(text) || COMMAND.test(text) || hasBannedWord(text, bannedWords)) return '';
  return text;
}

// Chữ gửi cho giọng đọc: bỏ ngoặc kép để không đọc thành tiếng lạ.
export const speakable = (text) => String(text).replace(/["“”‘’]/g, '').replace(/\s+/g, ' ').trim();
