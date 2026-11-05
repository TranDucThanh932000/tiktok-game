// AvatarGenerator: từ userId tạo AvatarData ổn định (cùng người → cùng ngoại hình),
// rồi "resolve" ra kích thước cơ thể + màu sắc để dựng mô hình 3D.
// Outfit chọn theo preset phong cách để phối đồ luôn hợp mắt.

export function hashString(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, list) => list[Math.floor(r() * list.length)];

export const BODIES = {
  slim: { shoulderX: 0.165, torsoR: 0.13, hipR: 0.125, armR: 0.044, legR: 0.06, height: 0.98, headR: 0.19 },
  regular: { shoulderX: 0.18, torsoR: 0.145, hipR: 0.135, armR: 0.05, legR: 0.068, height: 1.0, headR: 0.19 },
  broad: { shoulderX: 0.205, torsoR: 0.165, hipR: 0.145, armR: 0.058, legR: 0.075, height: 1.04, headR: 0.185 },
  petite: { shoulderX: 0.16, torsoR: 0.13, hipR: 0.135, armR: 0.043, legR: 0.062, height: 0.92, headR: 0.2 },
  tall: { shoulderX: 0.18, torsoR: 0.14, hipR: 0.13, armR: 0.048, legR: 0.065, height: 1.08, headR: 0.18 },
};

export const SKINS = ['#ffe0cc', '#f7c9a6', '#eab38c', '#d69c70', '#bb7f55', '#91603f', '#6c442b'];

export const HAIR_COLORS = {
  black: '#1f1b24',
  brown: '#4a2f22',
  chestnut: '#7b4a2a',
  blonde: '#e9c46a',
  platinum: '#f1ead8',
  pink: '#ff7eb6',
  blue: '#4aa8ff',
  purple: '#9b6bff',
  red: '#d1453b',
  mint: '#6fe3c1',
  silver: '#c9cfdc',
};
const NATURAL_HAIR = ['black', 'black', 'brown', 'brown', 'chestnut', 'blonde'];
const BOLD_HAIR = ['pink', 'blue', 'purple', 'red', 'mint', 'silver', 'platinum'];

export const HAIRS = ['short', 'spiky', 'long', 'bun', 'ponytail', 'afro', 'mohawk', 'buzz', 'twinbuns', 'bob', 'curly'];
export const FACES = ['dots', 'tall', 'happy', 'sleepy', 'wink', 'big'];

// [top, top2, bottom, shoes, accent]
export const OUTFIT_PRESETS = {
  street: {
    tops: ['hoodie', 'tshirt', 'jacket'],
    bottoms: ['cargo', 'pants', 'shorts'],
    shoes: ['sneaker', 'hightop'],
    accessories: ['none', 'cap', 'chain', 'headphones', 'beanie'],
    boldHair: 0.2,
    palettes: [
      ['#2b2d42', '#ef233c', '#8d99ae', '#f8f9fa', '#ef233c'],
      ['#606c38', '#fefae0', '#283618', '#dda15e', '#dda15e'],
      ['#3d5a80', '#e0fbfc', '#293241', '#ee6c4d', '#98c1d9'],
      ['#f4a261', '#264653', '#2a9d8f', '#e9c46a', '#e76f51'],
      ['#e9edc9', '#344e41', '#3a5a40', '#ffffff', '#a3b18a'],
    ],
  },
  raver: {
    tops: ['tank', 'crop', 'tshirt'],
    bottoms: ['shorts', 'pants', 'skirt'],
    shoes: ['boot', 'sneaker'],
    accessories: ['ledglasses', 'glowsticks', 'headband', 'glowsticks'],
    boldHair: 0.75,
    glowTrim: true,
    palettes: [
      ['#ff00a8', '#00f0ff', '#1a1a2e', '#ffffff', '#39ff14'],
      ['#39ff14', '#ff00a8', '#151515', '#222222', '#00f0ff'],
      ['#fffb00', '#7b2ff7', '#1b1b1b', '#7b2ff7', '#ff3cac'],
      ['#00f0ff', '#ff6b00', '#2d00f7', '#ffffff', '#fffb00'],
    ],
  },
  kpop: {
    tops: ['jacket', 'crop', 'longsleeve'],
    bottoms: ['wide', 'skirt', 'pants'],
    shoes: ['boot', 'sneaker'],
    accessories: ['sunglasses', 'chain', 'none', 'headphones'],
    boldHair: 0.5,
    palettes: [
      ['#f5f5f5', '#111111', '#111111', '#111111', '#c9a227'],
      ['#ffc8dd', '#cdb4db', '#ffffff', '#ffffff', '#bde0fe'],
      ['#a2d2ff', '#ffffff', '#1d3557', '#f1faee', '#e63946'],
      ['#141414', '#e5383b', '#141414', '#e5383b', '#f5f3f4'],
    ],
  },
  retro: {
    tops: ['windbreaker', 'tshirt', 'longsleeve'],
    bottoms: ['track', 'shorts'],
    shoes: ['hightop', 'sneaker'],
    accessories: ['headband', 'sunglasses', 'none'],
    boldHair: 0.3,
    glowTrim: true,
    palettes: [
      ['#00a6fb', '#ff595e', '#1d3557', '#ffffff', '#ffca3a'],
      ['#8338ec', '#ffbe0b', '#3a0ca3', '#ffffff', '#fb5607'],
      ['#06d6a0', '#ef476f', '#073b4c', '#ffffff', '#ffd166'],
    ],
  },
  techno: {
    tops: ['longsleeve', 'jacket', 'tank'],
    bottoms: ['pants', 'skirt', 'cargo'],
    shoes: ['boot'],
    accessories: ['chain', 'sunglasses', 'ledglasses', 'none'],
    boldHair: 0.45,
    glowTrim: true,
    palettes: [
      ['#16161a', '#7f5af0', '#0f0e17', '#2cb67d', '#7f5af0'],
      ['#1b1b1e', '#e63946', '#141414', '#e63946', '#ffffff'],
      ['#222222', '#00ffd5', '#111111', '#333333', '#00ffd5'],
    ],
  },
  sporty: {
    tops: ['jersey', 'tank', 'tshirt'],
    bottoms: ['shorts', 'track'],
    shoes: ['sneaker', 'hightop'],
    accessories: ['cap', 'headband', 'none'],
    boldHair: 0.15,
    palettes: [
      ['#ffffff', '#0077b6', '#0077b6', '#ffffff', '#ffd60a'],
      ['#e63946', '#ffffff', '#1d3557', '#ffffff', '#f1faee'],
      ['#2a9d8f', '#ffffff', '#264653', '#e9c46a', '#e9c46a'],
      ['#ffd60a', '#000000', '#000000', '#ffffff', '#000000'],
    ],
  },
  party: {
    tops: ['crop', 'tank', 'longsleeve'],
    bottoms: ['skirt', 'pants', 'wide'],
    shoes: ['boot'],
    accessories: ['sunglasses', 'chain', 'none'],
    boldHair: 0.4,
    sparkle: true,
    palettes: [
      ['#ffd6ff', '#e7c6ff', '#c8b6ff', '#ffffff', '#ffd700'],
      ['#ffd700', '#141414', '#141414', '#ffd700', '#ffffff'],
      ['#c0c0c0', '#ff4d6d', '#1b1b1b', '#c0c0c0', '#ff4d6d'],
    ],
  },
};

const BODY_IDS = Object.keys(BODIES);
const PRESET_IDS = Object.keys(OUTFIT_PRESETS);

// AvatarData theo đúng schema trong brief.
export function generateAvatar(userId, username) {
  const seed = hashString(userId);
  const r = rng(seed);
  const presetId = pick(r, PRESET_IDS);
  const preset = OUTFIT_PRESETS[presetId];
  const hairColor = r() < preset.boldHair ? pick(r, BOLD_HAIR) : pick(r, NATURAL_HAIR);
  return {
    UserId: userId,
    Username: username,
    Seed: seed,
    BodyId: pick(r, BODY_IDS),
    SkinId: String(Math.floor(r() * SKINS.length)),
    FaceId: pick(r, FACES),
    HairId: pick(r, HAIRS),
    HairColorId: hairColor,
    OutfitPresetId: presetId,
    PaletteId: String(Math.floor(r() * preset.palettes.length)),
    TopId: pick(r, preset.tops),
    BottomId: pick(r, preset.bottoms),
    ShoesId: pick(r, preset.shoes),
    AccessoryId: pick(r, preset.accessories),
    Blush: r() < 0.45,
    BackwardsCap: r() < 0.5,
  };
}

export function resolveAvatar(data) {
  const preset = OUTFIT_PRESETS[data.OutfitPresetId];
  const [top, top2, bottom, shoes, accent] = preset.palettes[Number(data.PaletteId) % preset.palettes.length];
  return {
    data,
    body: BODIES[data.BodyId],
    skin: SKINS[Number(data.SkinId) % SKINS.length],
    hair: data.HairId,
    hairColor: HAIR_COLORS[data.HairColorId],
    face: data.FaceId,
    top: data.TopId,
    bottom: data.BottomId,
    shoes: data.ShoesId,
    accessory: data.AccessoryId,
    colors: { top, top2, bottom, shoes, accent },
    glowTrim: Boolean(preset.glowTrim),
    sparkle: Boolean(preset.sparkle),
    blush: data.Blush,
    backwardsCap: data.BackwardsCap,
    mic: Boolean(data.Mic),
  };
}

// MC: áo khoác đen đỏ, kính đen, cầm micro.
export function mcAvatar() {
  return {
    UserId: 'mc', Username: 'MC', Seed: 2, BodyId: 'regular', SkinId: '2', FaceId: 'big', HairId: 'spiky', HairColorId: 'black',
    OutfitPresetId: 'kpop', PaletteId: '3', TopId: 'jacket', BottomId: 'pants', ShoesId: 'sneaker', AccessoryId: 'sunglasses',
    Blush: false, BackwardsCap: false, Mic: true,
  };
}

// Hai vũ công sân khấu.
export function stageDancerAvatars() {
  return [
    {
      UserId: 'dancer-1', Username: 'Vũ công', Seed: 3, BodyId: 'slim', SkinId: '1', FaceId: 'happy', HairId: 'long', HairColorId: 'platinum',
      OutfitPresetId: 'party', PaletteId: '1', TopId: 'crop', BottomId: 'skirt', ShoesId: 'boot', AccessoryId: 'none', Blush: true, BackwardsCap: false,
    },
    {
      UserId: 'dancer-2', Username: 'Vũ công', Seed: 4, BodyId: 'slim', SkinId: '3', FaceId: 'big', HairId: 'ponytail', HairColorId: 'pink',
      OutfitPresetId: 'party', PaletteId: '0', TopId: 'crop', BottomId: 'shorts', ShoesId: 'boot', AccessoryId: 'none', Blush: true, BackwardsCap: false,
    },
  ];
}

// DJ cố định: tai nghe, áo khoác tối, phụ kiện phát sáng.
export function djAvatar() {
  return {
    UserId: 'dj',
    Username: 'DJ',
    Seed: 1,
    BodyId: 'broad',
    SkinId: '3',
    FaceId: 'happy',
    HairId: 'short',
    HairColorId: 'black',
    OutfitPresetId: 'techno',
    PaletteId: '2',
    TopId: 'jacket',
    BottomId: 'pants',
    ShoesId: 'boot',
    AccessoryId: 'headphones',
    Blush: false,
    BackwardsCap: false,
  };
}
