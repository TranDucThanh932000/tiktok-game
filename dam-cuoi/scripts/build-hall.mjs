// Tải ảnh chiếu sáng HDRI và texture vật liệu thật cho sảnh cưới từ Poly Haven (giấy phép CC0, dùng tự do).
//   node scripts/build-hall.mjs
// Kết quả trong public/hall/. Chỉ cần chạy lại khi muốn đổi vật liệu.
import path from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'public', 'hall');
const UA = { 'User-Agent': 'dam-cuoi-build' };

// <tên file trong game>: [mã trên Poly Haven, loại ảnh, độ phân giải]
const TEXTURES = {
  marble: 'marble_01',
  satin: 'crepe_satin',
  velvet: 'velour_velvet',
};
const MAPS = { color: 'Diffuse', normal: 'nor_gl', rough: 'Rough' };
const HDRI = ['ballroom', '1k'];

async function save(url, file) {
  if (existsSync(file)) return;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`Tải lỗi ${res.status}: ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`  ${path.basename(file)}`);
}

mkdirSync(out, { recursive: true });
for (const [name, id] of Object.entries(TEXTURES)) {
  const files = await fetch(`https://api.polyhaven.com/files/${id}`, { headers: UA }).then((r) => r.json());
  console.log(`[Texture] ${name} ← ${id}`);
  for (const [kind, key] of Object.entries(MAPS)) {
    const url = files[key]?.['1k']?.jpg?.url ?? files[key]?.['1k']?.png?.url;
    if (!url) {
      console.log(`  (không có ${key})`);
      continue;
    }
    await save(url, path.join(out, `${name}_${kind}.jpg`));
  }
}
const [hdri, size] = HDRI;
const files = await fetch(`https://api.polyhaven.com/files/${hdri}`, { headers: UA }).then((r) => r.json());
console.log(`[HDRI] ${hdri}`);
await save(files.hdri[size].hdr.url, path.join(out, 'env.hdr'));
writeFileSync(path.join(out, 'NGUON.txt'), `Ảnh từ Poly Haven (polyhaven.com), giấy phép CC0.\nTexture: ${Object.values(TEXTURES).join(', ')}\nHDRI: ${hdri} (${size})\n`);
console.log('Xong: public/hall/');
