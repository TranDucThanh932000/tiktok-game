// Tải nhân vật người thật Microsoft Rocketbox (giấy phép MIT) và động tác quay từ người thật, rồi nén cho game.
//   node scripts/build-avatars.mjs
// File gốc (TGA 2048px, FBX động tác) để ở D:\tiktok-cache\rocketbox, chỉ tải một lần.
// Kết quả trong public/avatars/<tên>/ (FBX nhân vật + ảnh JPG/PNG nhỏ) và public/anims/<động tác>.json.
// Cần ffmpeg trong PATH để đổi ảnh TGA.
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

globalThis.self ??= globalThis;
THREE.TextureLoader.prototype.load = () => new THREE.Texture();

const root = path.resolve(import.meta.dirname, '..');
const CACHE = process.env.ROCKETBOX_CACHE || 'D:/tiktok-cache/rocketbox';
const RAW = 'https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets';
const API = 'https://api.github.com/repos/microsoft/Microsoft-Rocketbox/contents/Assets';

// role: groom / bride / guest. recolor: đổi màu áo (theo khoảng màu) sang trắng cho cô dâu, làm lúc tải ảnh trong trình duyệt.
export const AVATARS = [
  { name: 'Business_Male_01', dir: 'Professions', gender: 'm', role: 'groom' },
  { name: 'Business_Male_02', dir: 'Professions', gender: 'm', role: 'groom' },
  { name: 'Business_Male_03', dir: 'Professions', gender: 'm', role: 'mc' },
  { name: 'Business_Male_05', dir: 'Professions', gender: 'm', role: 'groom' },
  { name: 'Female_Adult_02', dir: 'Adults', gender: 'f', role: 'bride' },
  { name: 'Female_Adult_03', dir: 'Adults', gender: 'f', role: 'bride', recolor: { hue: [255, 335], minSat: 0.18 } },
  { name: 'Female_Adult_01', dir: 'Adults', gender: 'f', role: 'guest' },
  { name: 'Female_Adult_07', dir: 'Adults', gender: 'f', role: 'guest' },
  { name: 'Female_Adult_11', dir: 'Adults', gender: 'f', role: 'guest' },
  { name: 'Business_Female_02', dir: 'Professions', gender: 'f', role: 'guest' },
  { name: 'Business_Male_04', dir: 'Professions', gender: 'm', role: 'guest' },
  { name: 'Business_Male_06', dir: 'Professions', gender: 'm', role: 'guest' },
  { name: 'Business_Male_07', dir: 'Professions', gender: 'm', role: 'guest' },
  { name: 'Female_Adult_05', dir: 'Adults', gender: 'f', role: 'guest' },
  { name: 'Business_Female_01', dir: 'Professions', gender: 'f', role: 'mc' },
];

// Động tác: <tên trong game>: [tên file, thư mục]. Mỗi động tác có bản nam (m_) và nữ (f_).
const CLIPS = {
  idle: ['idle_neutral_01', 'static'],
  idle2: ['idle_neutral_02', 'static'],
  walk: ['walk_neutral_01', 'xy'],
  cheer: ['cheer_01', 'static'],
  clap: ['claphands_01', 'static'],
  wave: ['wave_01', 'static'],
  drink: ['drink_drinking', 'static'],
  laugh: ['gestic_laugh_loud', 'static'],
  // Động tác nói của hai MC.
  talk1: ['gestic_talk_neutral_01', 'static'],
  talk2: ['gestic_talk_relaxed_01', 'static'],
  talk3: ['gestic_talk_excited_01', 'static'],
  moderate: ['moderate_01', 'static'],
  presentL: ['gestic_presentation_left_01', 'static'],
  presentR: ['gestic_presentation_right_01', 'static'],
  // Khách ngồi bàn tiệc: giữ độ cao thật của hông (ngồi thấp hơn đứng).
  sit: ['sit_table_idle_neutral_01', 'static', { absolute: true }],
  sit2: ['sit_table_idle_look_around', 'static', { absolute: true }],
  sit3: ['sit_table_breathe_01', 'static', { absolute: true }],
};
// Động tác nữ không có cheer_02... dùng chung tên; nếu thiếu bản nữ thì lấy bản nam.

async function download(url, file) {
  if (existsSync(file) && statSync(file).size > 1000) return;
  mkdirSync(path.dirname(file), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tải lỗi ${res.status}: ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg lỗi: ${args.join(' ')}`);
}

// Danh sách ảnh lấy từ cây thư mục của kho (git clone không tải nội dung, chỉ lấy tên file), vì API GitHub
// giới hạn số lần gọi. Thiếu thì tự clone vào thư mục cache.
let allTextures = null;
function textureNames(avatar) {
  if (!allTextures) {
    const list = path.join(CACHE, 'all-textures.txt');
    if (!existsSync(list)) {
      const repo = path.join(CACHE, 'repo');
      if (!existsSync(repo)) spawnSync('git', ['clone', '-q', '--filter=blob:none', '--no-checkout', '--depth', '1', 'https://github.com/microsoft/Microsoft-Rocketbox.git', repo], { stdio: 'inherit' });
      const r = spawnSync('git', ['-C', repo, 'ls-tree', '-r', 'HEAD', '--name-only'], { encoding: 'utf8', maxBuffer: 64 << 20 });
      writeFileSync(list, r.stdout.split(/\r?\n/).filter((l) => l.includes('/Textures/')).join('\n'));
    }
    allTextures = readFileSync(list, 'utf8').split(/\r?\n/);
  }
  const prefix = `Assets/Avatars/${avatar.dir}/${avatar.name}/Textures/`;
  return allTextures.filter((l) => l.startsWith(prefix)).map((l) => l.slice(prefix.length));
}

async function buildAvatar(avatar) {
  const src = path.join(CACHE, avatar.name);
  const out = path.join(root, 'public', 'avatars', avatar.name);
  mkdirSync(out, { recursive: true });
  await download(`${RAW}/Avatars/${avatar.dir}/${avatar.name}/Export/${avatar.name}.fbx`, path.join(src, `${avatar.name}.fbx`));
  copyFileSync(path.join(src, `${avatar.name}.fbx`), path.join(out, 'model.fbx'));
  const names = textureNames(avatar);
  const pick = (part) => names.find((n) => n.endsWith(`_${part}.tga`));
  const jobs = { body: pick('body_color'), head: pick('head_color'), opacity: pick('opacity_color') };
  for (const [key, file] of Object.entries(jobs)) {
    if (!file && key === 'opacity') continue; // nhân vật tóc ngắn không có lớp tóc trong suốt
    if (!file) throw new Error(`${avatar.name} thiếu ảnh ${key}`);
    const tga = path.join(src, 'Textures', file);
    await download(`${RAW}/Avatars/${avatar.dir}/${avatar.name}/Textures/${file}`, tga);
    if (key === 'opacity') ffmpeg(['-i', tga, '-vf', 'scale=512:512', '-pix_fmt', 'rgba', path.join(out, 'opacity.png')]);
    else ffmpeg(['-i', tga, '-vf', 'scale=1024:1024', '-q:v', '4', path.join(out, `${key}.jpg`)]);
  }
  console.log(`[Nhân vật] ${avatar.name} xong`);
}

// Rút gọn động tác: bỏ xương mặt, bỏ scale, bỏ vị trí (trừ Bip01: chỉ giữ độ nhấp nhô theo chiều cao, đã trừ
// độ cao ban đầu, để đi tại chỗ và hợp với mọi chiều cao nhân vật).
const FACE = /Eye|Mouth|Lip|Jaw|Tongue|Masseter|Caninus|Cheek|Eyebrow|Nose|Upperlip|Footsteps|MotionExtraction/;
const MAX_SECONDS = 14; // động tác dài hơn thì cắt bớt cho file nhẹ
async function buildClip(key, [file, folder, opts = {}], gender) {
  const name = `${gender}_${file}`;
  const fbx = path.join(CACHE, 'anims', `${name}.fbx`);
  try {
    await download(`${RAW}/Animations/all_animations_max_motextr_${folder}/${name}.max.fbx`, fbx);
  } catch (err) {
    console.log(`[Động tác] Không có ${name}: ${err.message}`);
    return false;
  }
  const buf = readFileSync(fbx);
  const obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const clip = obj.animations[0];
  const tracks = [];
  // Động tác dài (đứng chờ, vỗ tay...) giữ 10 khung/giây, động tác ngắn (đi, vẫy) 15 khung/giây: đủ mượt, file nhỏ.
  const step = clip.duration > 4 ? 3 : 2;
  const keep = (time) => time <= MAX_SECONDS + 1e-6;
  const thin = (arr, size) => {
    const out = [];
    const n = arr.length / size;
    for (let i = 0; i < n; i++) if (i % step === 0 || i === n - 1) out.push(...arr.slice(i * size, i * size + size));
    return out;
  };
  for (const t0 of clip.tracks) {
    const size = t0.getValueSize();
    const n = Array.from(t0.times).filter(keep).length;
    const t = { name: t0.name, times: thin(Array.from(t0.times).slice(0, n), 1), values: thin(Array.from(t0.values).slice(0, n * size), size) };
    const [bone, prop] = t.name.split('.');
    if (FACE.test(bone) || prop === 'scale') continue;
    if (prop === 'position') {
      if (bone !== 'Bip01') continue;
      const y0 = opts.absolute ? 0 : t.values[1];
      const values = [];
      for (let i = 0; i < t.values.length; i += 3) values.push(0, +(t.values[i + 1] - y0).toFixed(2), 0);
      tracks.push({ name: t.name, type: 'vector', times: t.times.map((v) => +v.toFixed(3)), values });
      continue;
    }
    tracks.push({ name: t.name, type: 'quaternion', times: t.times.map((v) => +v.toFixed(3)), values: t.values.map((v) => +v.toFixed(4)) });
  }
  // Tốc độ đi thật của động tác (cm/giây) để chỉnh nhịp bước theo tốc độ trong game, chân không bị trượt.
  const rootPos = clip.tracks.find((t) => t.name === 'Bip01.position');
  const dist = rootPos ? Math.hypot(rootPos.values.at(-3) - rootPos.values[0], rootPos.values.at(-1) - rootPos.values[2]) : 0;
  const out = path.join(root, 'public', 'anims', `${gender}_${key}.json`);
  mkdirSync(path.dirname(out), { recursive: true });
  const duration = Math.min(clip.duration, MAX_SECONDS);
  writeFileSync(out, JSON.stringify({ name: `${gender}_${key}`, duration: +duration.toFixed(3), speed: +(dist / clip.duration / 100).toFixed(3), absolute: !!opts.absolute, tracks }));
  console.log(`[Động tác] ${gender}_${key} ← ${name} (${clip.duration.toFixed(1)} giây, ${tracks.length} xương)`);
  return true;
}

const only = process.argv[2];
for (const avatar of AVATARS) if (!only || avatar.name === only) await buildAvatar(avatar);
const clipsDone = {};
for (const gender of ['m', 'f']) for (const [key, spec] of Object.entries(CLIPS)) if (await buildClip(key, spec, gender)) (clipsDone[gender] ??= []).push(key);
writeFileSync(
  path.join(root, 'public', 'avatars', 'avatars.json'),
  JSON.stringify({
    avatars: AVATARS.map(({ name, gender, role, recolor }) => ({ name, gender, role, recolor, hair: existsSync(path.join(root, 'public', 'avatars', name, 'opacity.png')) })),
    clips: clipsDone,
  }, null, 1),
);
console.log('Xong. Danh sách: public/avatars/avatars.json');
