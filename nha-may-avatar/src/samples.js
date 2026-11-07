// Sample accounts for an empty room: fictional names and original drawings, never real people.
// Large flat shapes on purpose, so a drawing still reads when rebuilt from 36 x 36 balls.
import { readdirSync } from 'node:fs';

const FIRST_NAMES = ['Mina', 'Leo', 'Bao', 'Linh', 'Nova', 'Kai', 'Thu', 'Remy', 'Vy', 'Nam', 'Luna', 'Toby', 'An', 'Sora', 'Mai', 'Finn', 'Ha', 'Zoe', 'Duy', 'Ivy', 'Khoa', 'Ruby', 'Son', 'Ella', 'Tam', 'Max', 'Yen', 'Nora', 'Quan', 'Lily', 'Hieu', 'Maya', 'Tung', 'Rin', 'Phuc', 'Ada', 'Long', 'Noa', 'Minh', 'Aria', 'Dat', 'Sky', 'Trang', 'Owen', 'Ngoc', 'Hana', 'Vinh', 'Emi', 'Tuan', 'Coco', 'Giang', 'Milo', 'Thao', 'Jun', 'Hoa', 'Theo', 'Nhi', 'Pia', 'Khanh', 'Bo'];
const SECOND_NAMES = ['Sky', 'Kiwi', 'Moon', 'Lemon', 'Star', 'Peach', 'Cloud', 'Mint', 'Berry', 'Sun', 'Tofu', 'Mochi', 'Bean', 'Rain', 'Honey', 'Coco', 'Leaf', 'Sugar', 'Boba', 'Pixel', 'Latte', 'Melon', 'Dream', 'Maple', 'Olive', 'Nori', 'Plum', 'Breeze', 'Sunny', 'Pudding'];

const BACKGROUNDS = [['#8ecae6', '#5aa7d6'], ['#ffb4a2', '#f28482'], ['#b5e48c', '#76c893'], ['#ffd166', '#f8961e'], ['#cdb4db', '#9d79bc'], ['#90dbf4', '#48bfe3'], ['#fcd5ce', '#f4a6b7'], ['#a0c4ff', '#6c8cf5'], ['#ffc6ff', '#d17ad8'], ['#caffbf', '#8bd17c'], ['#fdffb6', '#f2d94e'], ['#ff9f9f', '#e5636f'], ['#9bf6ff', '#4cc9c0'], ['#2b2d42', '#4a4e69']];
const SKINS = [['#fbd9bf', '#eeb898'], ['#f6c9a8', '#e6a988'], ['#e8b48f', '#d0916c'], ['#d69b76', '#b87a57'], ['#a9714b', '#8d5a39'], ['#7c4f33', '#623c26']];
const HAIR = ['#2b1b2e', '#1f2a44', '#4a2a22', '#7a4a2a', '#b5703a', '#e0a94a', '#8c3b5e', '#3f6d8e', '#c24d6d', '#55407a', '#ededed'];
const CLOTHES = ['#ef476f', '#118ab2', '#06d6a0', '#ffd166', '#8338ec', '#ff7f51', '#ffffff', '#2a9d8f', '#e63946', '#3a86ff', '#f4a261', '#343a40'];
const HAIR_STYLES = ['short', 'side', 'bob', 'long', 'bun', 'curly', 'pony', 'spiky', 'beanie', 'cap'];
const EYES = ['round', 'happy', 'wink', 'lashes'];
const MOUTHS = ['smile', 'open', 'grin', 'small'];
const EXTRAS = ['none', 'none', 'glasses', 'shades', 'bow', 'earrings', 'freckles', 'headphones', 'flower'];
const ANIMALS = {
  cat: [['#f4a261', '#fff1e0'], ['#6c757d', '#e9ecef'], ['#ffffff', '#ffd9e0'], ['#343a40', '#ced4da']],
  dog: [['#c68642', '#fbe7c6'], ['#f5deb3', '#fff8e7'], ['#5c4033', '#d7b899']],
  bear: [['#8d5a39', '#e2c4a0'], ['#c9a27e', '#f5e6d3'], ['#ffffff', '#f1e9dc']],
  rabbit: [['#ffffff', '#ffc2d1'], ['#d9c2a7', '#fff0e0'], ['#b8b8c8', '#ffd9e6']],
  fox: [['#f3722c', '#ffffff'], ['#e9c46a', '#ffffff']],
  panda: [['#ffffff', '#2b2d42']],
  pig: [['#ffb3c6', '#ff8fab'], ['#ffd6e0', '#ffb3c6']],
  penguin: [['#22303f', '#ffffff'], ['#3a4f6b', '#ffffff']],
  frog: [['#7bc950', '#eaf7cf'], ['#40c9a2', '#e6fff6']],
  chick: [['#ffd93d', '#fff3b0'], ['#ffb703', '#ffe7a3']],
};

const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">';

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const chooser = random => list => list[Math.floor(random() * list.length)];

function backdrop(bg, random) {
  const dots = Array.from({ length: 3 }, () => `<circle cx="${Math.round(random() * 320)}" cy="${Math.round(random() * 170)}" r="${10 + Math.round(random() * 22)}"/>`).join('');
  return `<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs><rect width="320" height="320" fill="url(#bg)"/><g fill="#ffffff" opacity=".22">${dots}</g>`;
}

const backHair = (style, color) => ({
  bob: `<path d="M62 150C58 50 112 26 160 26s102 24 98 124l6 92c-30 16-64 8-70-14H126c-6 22-40 30-70 14z" fill="${color}"/>`,
  long: `<path d="M62 300C34 180 56 28 160 26c104 2 126 154 98 274z" fill="${color}"/>`,
  pony: `<path d="M226 80c60 16 74 104 40 162-10-44-30-92-58-122z" fill="${color}"/>`,
  bun: `<circle cx="160" cy="28" r="34" fill="${color}"/>`,
  curly: Array.from({ length: 11 }, (_, i) => {
    const angle = Math.PI * (1 + i / 10);
    return `<circle cx="${Math.round(160 + Math.cos(angle) * 88)}" cy="${Math.round(128 + Math.sin(angle) * 92)}" r="30" fill="${color}"/>`;
  }).join(''),
})[style] ?? '';

const frontHair = (style, color, accent) => ({
  short: `<path d="M84 142C72 62 120 36 160 36s88 26 76 106c-8-30-30-48-76-48s-68 18-76 48z" fill="${color}"/>`,
  side: `<path d="M84 146C70 60 120 34 164 36c50 2 84 40 72 110-6-30-16-44-30-54-30 22-76 26-112 22-4 10-8 20-10 32z" fill="${color}"/>`,
  bob: `<path d="M86 138C80 66 120 44 160 44s80 22 74 94c-14-26-40-38-74-40-34 2-60 14-74 40z" fill="${color}"/>`,
  long: `<path d="M86 142C82 66 122 44 160 44s78 22 74 98c-6-24-22-44-44-54-26 18-68 24-104 54z" fill="${color}"/>`,
  bun: `<path d="M86 136C80 66 120 42 160 42s80 24 74 94c-14-24-40-36-74-38-34 2-60 14-74 38z" fill="${color}"/>`,
  curly: `<path d="M86 132C84 74 122 56 160 56s76 18 74 76c-16-20-42-30-74-32-32 2-58 12-74 32z" fill="${color}"/>`,
  pony: `<path d="M84 140C74 64 120 38 160 38s86 26 76 102c-12-28-38-42-76-44-38 2-64 16-76 44z" fill="${color}"/>`,
  spiky: `<path d="M84 142 74 84l28 16 8-52 26 34 24-52 24 52 26-34 8 52 28-16-10 58c-12-26-38-44-76-46-38 2-64 20-76 46z" fill="${color}"/>`,
  beanie: `<path d="M78 132C74 58 118 28 160 28s86 30 82 104z" fill="${accent}"/><rect x="72" y="112" width="176" height="30" rx="14" fill="#ffffff" opacity=".85"/><circle cx="160" cy="24" r="18" fill="#ffffff" opacity=".85"/>`,
  cap: `<path d="M84 128C80 66 122 40 162 40s78 26 74 88z" fill="${accent}"/><path d="M84 122h152c34 2 44 12 48 24-40-8-132-10-200-6z" fill="${accent}"/><path d="M84 122h152c34 2 44 12 48 24-40-8-132-10-200-6z" fill="#000000" opacity=".15"/>`,
})[style] ?? '';

function eyes(type, skinShade) {
  const dot = (x) => `<ellipse cx="${x}" cy="158" rx="9" ry="12" fill="#2b1b2e"/><circle cx="${x + 3}" cy="153" r="3.5" fill="#ffffff"/>`;
  const arc = (x) => `<path d="M${x - 12} 162q12-16 24 0" fill="none" stroke="#2b1b2e" stroke-width="6" stroke-linecap="round"/>`;
  if (type === 'happy') return arc(126) + arc(194);
  if (type === 'wink') return dot(126) + arc(194);
  if (type === 'lashes') return `${dot(126)}${dot(194)}<path d="M112 148l-8-6m110 6 8-6" stroke="#2b1b2e" stroke-width="5" stroke-linecap="round" fill="none"/>`;
  return dot(126) + dot(194) + `<path d="M112 136q14-8 28 0m40 0q14-8 28 0" fill="none" stroke="${skinShade}" stroke-width="6" stroke-linecap="round"/>`;
}

const mouth = (type) => ({
  smile: '<path d="M136 196q24 24 48 0" fill="none" stroke="#a23b4b" stroke-width="7" stroke-linecap="round"/>',
  open: '<path d="M138 192q22 6 44 0q-2 32-22 32t-22-32z" fill="#a23b4b"/><path d="M146 208q14 12 28 0q-4 16-14 16t-14-16z" fill="#ff8fa3"/>',
  grin: '<path d="M132 192q28 10 56 0q-6 28-28 28t-28-28z" fill="#ffffff" stroke="#a23b4b" stroke-width="5"/>',
  small: '<path d="M148 200q12 10 24 0" fill="none" stroke="#a23b4b" stroke-width="6" stroke-linecap="round"/>',
})[type];

const extra = (type, accent) => ({
  glasses: '<g fill="#ffffff33" stroke="#2b1b2e" stroke-width="6"><circle cx="126" cy="158" r="24"/><circle cx="194" cy="158" r="24"/></g><path d="M150 156h20" stroke="#2b1b2e" stroke-width="6"/>',
  shades: '<g fill="#2b1b2e"><rect x="98" y="142" width="54" height="36" rx="14"/><rect x="168" y="142" width="54" height="36" rx="14"/></g><path d="M150 154h20" stroke="#2b1b2e" stroke-width="6"/><path d="M108 150l14 0" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity=".7"/>',
  bow: `<path d="M216 68l-30-20v40zM216 68l30-20v40z" fill="${accent}"/><circle cx="216" cy="68" r="9" fill="#ffffff"/>`,
  earrings: `<circle cx="78" cy="196" r="10" fill="${accent}"/><circle cx="242" cy="196" r="10" fill="${accent}"/>`,
  freckles: '<g fill="#a2543f" opacity=".6"><circle cx="110" cy="182" r="3"/><circle cx="122" cy="188" r="3"/><circle cx="98" cy="188" r="3"/><circle cx="210" cy="182" r="3"/><circle cx="198" cy="188" r="3"/><circle cx="222" cy="188" r="3"/></g>',
  headphones: `<path d="M72 152C70 44 250 44 248 152" fill="none" stroke="#2b1b2e" stroke-width="12"/><rect x="56" y="134" width="30" height="56" rx="13" fill="${accent}"/><rect x="234" y="134" width="30" height="56" rx="13" fill="${accent}"/>`,
  flower: `<g fill="${accent}"><circle cx="94" cy="84" r="13"/><circle cx="116" cy="84" r="13"/><circle cx="94" cy="106" r="13"/><circle cx="116" cy="106" r="13"/></g><circle cx="105" cy="95" r="10" fill="#ffd166"/>`,
})[type] ?? '';

function person(traits, random) {
  const { bg, skin, hair, clothes, accent, style, eye, smile, add } = traits;
  return SVG_OPEN + backdrop(bg, random) + backHair(style, hair)
    + `<path d="M44 320c4-70 50-104 116-104s112 34 116 104z" fill="${clothes}"/>`
    + `<path d="M136 196h48v42c-10 18-38 18-48 0z" fill="${skin[1]}"/>`
    + `<ellipse cx="82" cy="164" rx="13" ry="21" fill="${skin[1]}"/><ellipse cx="238" cy="164" rx="13" ry="21" fill="${skin[1]}"/>`
    + `<ellipse cx="160" cy="150" rx="78" ry="86" fill="${skin[0]}"/>`
    + `<ellipse cx="108" cy="186" rx="15" ry="9" fill="#ff8fa3" opacity=".45"/><ellipse cx="212" cy="186" rx="15" ry="9" fill="#ff8fa3" opacity=".45"/>`
    + frontHair(style, hair, accent) + eyes(eye, skin[1]) + mouth(smile) + extra(add, accent) + '</svg>';
}

const PET_EARS = {
  cat: (a, b) => `<path d="M72 120 80 30l76 56z" fill="${a}"/><path d="M248 120l-8-90-76 56z" fill="${a}"/><path d="M90 92l4-40 34 26z" fill="${b}"/><path d="M230 92l-4-40-34 26z" fill="${b}"/>`,
  dog: (a) => `<path d="M72 92C30 96 26 190 62 214c20-30 26-80 34-110z" fill="${a}" opacity=".9"/><path d="M248 92c42 4 46 98 10 122-20-30-26-80-34-110z" fill="${a}" opacity=".9"/>`,
  bear: (a, b) => `<circle cx="84" cy="74" r="40" fill="${a}"/><circle cx="236" cy="74" r="40" fill="${a}"/><circle cx="84" cy="74" r="20" fill="${b}"/><circle cx="236" cy="74" r="20" fill="${b}"/>`,
  rabbit: (a, b) => `<ellipse cx="112" cy="58" rx="28" ry="72" fill="${a}"/><ellipse cx="208" cy="58" rx="28" ry="72" fill="${a}"/><ellipse cx="112" cy="62" rx="13" ry="52" fill="${b}"/><ellipse cx="208" cy="62" rx="13" ry="52" fill="${b}"/>`,
  fox: (a) => `<path d="M64 130 62 26l92 62z" fill="${a}"/><path d="M256 130l2-104-92 62z" fill="${a}"/><path d="M62 26l14 34 26-12z" fill="#2b1b2e"/><path d="M258 26l-14 34-26-12z" fill="#2b1b2e"/>`,
  panda: (a, b) => `<circle cx="84" cy="76" r="38" fill="${b}"/><circle cx="236" cy="76" r="38" fill="${b}"/>`,
  pig: (a) => `<path d="M76 110 68 44l66 34z" fill="${a}"/><path d="M244 110l8-66-66 34z" fill="${a}"/>`,
  penguin: () => '',
  frog: (a, b) => `<circle cx="100" cy="72" r="38" fill="${a}"/><circle cx="220" cy="72" r="38" fill="${a}"/><circle cx="100" cy="66" r="24" fill="${b}"/><circle cx="220" cy="66" r="24" fill="${b}"/>`,
  chick: (a) => `<path d="M160 50c-18-32-2-44 2-44s18 16-2 44z" fill="${a}"/>`,
};

function pet(species, colors, traits, random) {
  const [main, soft] = colors;
  const eyeY = species === 'frog' ? 66 : 158;
  const eyeL = species === 'frog' ? 100 : 118;
  const eyeR = species === 'frog' ? 220 : 202;
  const patch = species === 'panda' ? `<ellipse cx="116" cy="158" rx="26" ry="32" fill="${soft}" transform="rotate(14 116 158)"/><ellipse cx="204" cy="158" rx="26" ry="32" fill="${soft}" transform="rotate(-14 204 158)"/>` : '';
  const hood = species === 'penguin' ? `<ellipse cx="124" cy="164" rx="42" ry="50" fill="${soft}"/><ellipse cx="196" cy="164" rx="42" ry="50" fill="${soft}"/><ellipse cx="160" cy="214" rx="66" ry="36" fill="${soft}"/>` : '';
  const face = species === 'fox'
    ? `<path d="M64 170c30 6 66 30 96 70 30-40 66-64 96-70-4 70-44 110-96 110S68 240 64 170z" fill="${soft}"/>`
    : species === 'dog' || species === 'bear' ? `<ellipse cx="160" cy="214" rx="56" ry="44" fill="${soft}"/>` : '';
  const white = species === 'panda' ? '#ffffff' : '#2b1b2e';
  const shine = species === 'panda' ? '#2b1b2e' : '#ffffff';
  const look = `<circle cx="${eyeL}" cy="${eyeY}" r="13" fill="${white}"/><circle cx="${eyeR}" cy="${eyeY}" r="13" fill="${white}"/><circle cx="${eyeL + 4}" cy="${eyeY - 4}" r="4" fill="${shine}"/><circle cx="${eyeR + 4}" cy="${eyeY - 4}" r="4" fill="${shine}"/>`;
  const nose = {
    pig: `<ellipse cx="160" cy="204" rx="44" ry="32" fill="${soft}"/><ellipse cx="144" cy="204" rx="8" ry="12" fill="#a23b5b"/><ellipse cx="176" cy="204" rx="8" ry="12" fill="#a23b5b"/>`,
    penguin: '<path d="M136 192h48l-24 30z" fill="#ffb703"/>',
    chick: '<path d="M136 190h48l-24 30z" fill="#fb8500"/>',
    frog: '<path d="M96 194q64 52 128 0" fill="none" stroke="#2b1b2e" stroke-width="7" stroke-linecap="round"/>',
  }[species] ?? `<ellipse cx="160" cy="196" rx="14" ry="10" fill="#2b1b2e"/><path d="M160 206v12m0 0q-14 12-26 2m26-2q14 12 26 2" fill="none" stroke="#2b1b2e" stroke-width="5" stroke-linecap="round"/>`;
  const whiskers = species === 'cat' ? '<g stroke="#2b1b2e" stroke-width="4" stroke-linecap="round" opacity=".7"><path d="M92 196l-38-8m38 22-38 6"/><path d="M228 196l38-8m-38 22 38 6"/></g>' : '';
  return SVG_OPEN + backdrop(traits.bg, random) + `<path d="M56 320c6-60 44-90 104-90s98 30 104 90z" fill="${main}"/>`
    + (PET_EARS[species]?.(main, soft) ?? '')
    + `<ellipse cx="160" cy="164" rx="100" ry="96" fill="${main}"/>` + face + hood + patch + look + nose + whiskers
    + `<ellipse cx="96" cy="196" rx="15" ry="9" fill="#ff8fa3" opacity=".4"/><ellipse cx="224" cy="196" rx="15" ry="9" fill="#ff8fa3" opacity=".4"/></svg>`;
}

// Traits for one numbered account; the same number always draws the same picture.
function traitsFor(index) {
  const random = seeded(Math.imul(index + 1, 2654435761));
  const choose = chooser(random);
  const isPet = random() < 0.32;
  const base = { bg: choose(BACKGROUNDS) };
  if (isPet) {
    const species = choose(Object.keys(ANIMALS));
    return { ...base, kind: 'pet', species, colors: choose(ANIMALS[species]) };
  }
  return { ...base, kind: 'person', skin: choose(SKINS), hair: choose(HAIR), clothes: choose(CLOTHES), accent: choose(CLOTHES), style: choose(HAIR_STYLES), eye: choose(EYES), smile: choose(MOUTHS), add: choose(EXTRAS) };
}

export function sampleAvatar(index) {
  const traits = traitsFor(index);
  const random = seeded(Math.imul(index + 7, 40503));
  return traits.kind === 'pet' ? pet(traits.species, traits.colors, traits, random) : person(traits, random);
}

// Numbered accounts whose pictures all differ, each with its own fictional name.
export function buildAccounts(count = 1000) {
  const names = FIRST_NAMES.flatMap(first => SECOND_NAMES.map(second => `${first} ${second}`));
  const random = seeded(20261107);
  for (let i = names.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  const seen = new Set();
  const accounts = [];
  for (let index = 0; accounts.length < count && index < count * 40; index += 1) {
    const key = JSON.stringify(traitsFor(index));
    if (seen.has(key)) continue;
    seen.add(key);
    accounts.push({ userId: `sample:${index}`, nickname: names[accounts.length % names.length], avatar: `/sample-avatar/${index}.svg` });
  }
  return accounts;
}

const PHOTO_FILE = /\.(png|jpe?g|webp|svg)$/i;

// Pictures dropped into public/samples join the pool, named from the same fictional list.
export function listPhotoAccounts(folder, offset = 0) {
  let files = [];
  try { files = readdirSync(folder).filter(file => PHOTO_FILE.test(file)).sort(); }
  catch { return []; }
  return files.map((file, position) => ({
    userId: `sample:file:${file}`,
    nickname: `${FIRST_NAMES[(position + offset) % FIRST_NAMES.length]} ${SECOND_NAMES[(position * 7 + offset) % SECOND_NAMES.length]}`,
    avatar: `/samples/${encodeURIComponent(file)}`,
  }));
}

// Draws every account once before any comes back, and never repeats one that was just on screen.
export class SampleDeck {
  constructor({ accounts = buildAccounts(), photos = () => [], random = Math.random, recent = 30 } = {}) {
    this.accounts = accounts;
    this.photos = photos;
    this.random = random;
    this.recent = recent;
    this.pile = [];
    this.last = [];
    this.size = accounts.length + photos().length;
  }

  refill() {
    const pool = [...this.accounts, ...this.photos()];
    this.size = pool.length;
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // The pile is drawn from the end: keep just-shown accounts away from the next few draws.
    const fresh = new Set(this.last);
    pool.sort((a, b) => Number(fresh.has(b.userId)) - Number(fresh.has(a.userId)));
    this.pile = pool;
  }

  next() {
    if (!this.pile.length) this.refill();
    const account = this.pile.pop();
    if (!account) return null;
    this.last.push(account.userId);
    if (this.last.length > this.recent) this.last.shift();
    return account;
  }
}
