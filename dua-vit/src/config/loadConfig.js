import path from 'node:path';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const root = path.join(import.meta.dirname, '..', '..');
export const paths = {
  config: path.join(root, 'config'),
  data: path.join(root, 'data'),
  public: path.join(root, 'public'),
};

export function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw new Error(`${path.basename(file)}: ${err.message}`);
  }
}

// Atomic write so a crash mid-save never leaves half a JSON file.
export function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, file);
}

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function deepMerge(base, over) {
  if (!isObject(base) || !isObject(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [key, value] of Object.entries(over)) out[key] = deepMerge(base[key], value);
  return out;
}

export const getPath = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

export function setPath(obj, dotted, value) {
  const keys = dotted.split('.');
  let o = obj;
  for (const key of keys.slice(0, -1)) o = isObject(o[key]) ? o[key] : (o[key] = {});
  o[keys.at(-1)] = value;
}

// Settings the admin panel may change at runtime: [path, kind, min, max].
export const EDITABLE = [
  ['game.phases.registration', 'number', 5, 600],
  ['game.phases.race', 'number', 10, 1800],
  ['game.phases.sprint', 'number', 5, 600],
  ['game.phases.finish', 'number', 5, 120],
  ['game.autoNextRound', 'boolean'],
  ['game.maxDucks', 'integer', 2, 1000],
  ['game.sound', 'boolean'],
  ['game.notifications', 'boolean'],
  ['game.maxNotifications', 'integer', 1, 8],
  ['balance.baseSpeed', 'number', 10, 1000],
  ['balance.maxPersonalBonus', 'number', 0, 1],
  ['balance.maxCommunityBonus', 'number', 0, 0.5],
  ['balance.maxTotalBonus', 'number', 0, 1.5],
  ['balance.energy.likesPerEnergy', 'integer', 1, 1000],
  ['balance.energy.comment.amount', 'number', 0, 100],
  ['balance.energy.comment.cooldownSeconds', 'number', 0, 120],
  ['balance.energy.share.amount', 'number', 0, 100],
  ['balance.energy.freeCaps.like', 'number', 0, 100],
  ['balance.energy.freeCaps.comment', 'number', 0, 100],
  ['balance.energy.freeCaps.share', 'number', 0, 100],
  ['balance.energy.chargeDelaySeconds', 'number', 0, 10],
  ['balance.skills.RAINBOW_BOOST.cooldownSeconds', 'number', 0, 600],
  ['balance.community.enabled', 'boolean'],
  ['balance.community.wind.enabled', 'boolean'],
  ['balance.community.tsunami.enabled', 'boolean'],
  ['balance.community.cheer.enabled', 'boolean'],
  ['balance.community.giftStorm.enabled', 'boolean'],
  ['balance.community.giftStorm.gifts', 'integer', 1, 10000],
  ['balance.community.tsunami.likes', 'integer', 100, 1000000],
  ['balance.community.cheer.comments', 'integer', 5, 10000],
  ['balance.obstacles.enabled', 'boolean'],
];

export function checkSetting(key, value) {
  const spec = EDITABLE.find(([k]) => k === key);
  if (!spec) return `Không được sửa "${key}"`;
  const [, kind, min, max] = spec;
  if (kind === 'boolean') return typeof value === 'boolean' ? '' : `${key} phải là true/false`;
  if (typeof value !== 'number' || !Number.isFinite(value)) return `${key} phải là số`;
  if (kind === 'integer' && !Number.isInteger(value)) return `${key} phải là số nguyên`;
  if (value < min || value > max) return `${key} phải trong khoảng ${min}–${max}`;
  return '';
}

const inRange = (n, min, max) => typeof n === 'number' && n >= min && n <= max;

export function validate(config) {
  const { game, balance, gifts } = config;
  const problems = [];
  const need = (ok, text) => ok || problems.push(text);
  for (const [phase, seconds] of Object.entries(game.phases ?? {})) need(inRange(seconds, 5, 1800), `game.phases.${phase} phải từ 5 đến 1800 giây`);
  need(Number.isInteger(game.lanes) && game.lanes >= 3 && game.lanes <= 16, 'game.lanes là số nguyên từ 3 đến 16');
  need(Array.isArray(game.commentKeywords) && game.commentKeywords.length > 0, 'game.commentKeywords là danh sách từ khóa');
  need(inRange(balance.baseSpeed, 10, 1000), 'balance.baseSpeed từ 10 đến 1000');
  need(Array.isArray(balance.energy?.turboTiers) && balance.energy.turboTiers.length > 0, 'balance.energy.turboTiers không được trống');
  for (const [name, tier] of Object.entries(gifts.tiers ?? {})) {
    need(inRange(tier.energy, 0, 100), `gifts.tiers.${name}.energy từ 0 đến 100`);
    need(!tier.skill || balance.skills[tier.skill], `gifts.tiers.${name}.skill "${tier.skill}" không có trong balance.skills`);
  }
  for (const [id, tier] of Object.entries(gifts.byId ?? {})) need(gifts.tiers[tier], `gifts.byId.${id} trỏ tới nhóm "${tier}" không tồn tại`);
  for (const rule of gifts.byDiamonds ?? []) need(gifts.tiers[rule.tier] && inRange(rule.min, 0, 1e7), `gifts.byDiamonds: nhóm "${rule.tier}" không tồn tại`);
  for (const [name, type] of Object.entries(balance.obstacles?.types ?? {})) {
    need(['obstacle', 'zone', 'pickup'].includes(type.kind), `obstacles.types.${name}.kind phải là obstacle, zone hoặc pickup`);
    need(!type.skill || balance.skills[type.skill], `obstacles.types.${name}.skill "${type.skill}" không có trong balance.skills`);
  }
  if (problems.length) throw new Error(`Cấu hình lỗi: ${problems.join('; ')}`);
  return config;
}

const settingsFile = () => path.join(paths.data, 'settings.json');

export function loadConfig() {
  const base = {
    game: readJson(path.join(paths.config, 'game.json')),
    balance: readJson(path.join(paths.config, 'balance.json')),
    gifts: readJson(path.join(paths.config, 'gifts.json')),
  };
  const overrides = readJson(settingsFile(), {});
  return { config: validate(deepMerge(base, overrides)), overrides };
}

export const saveOverrides = (overrides) => writeJson(settingsFile(), overrides);
