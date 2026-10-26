// 会话归档 · 配置与索引持久化、容错文件操作
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename, readdir, rm, stat, copyFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname, extname, basename } from 'node:path';

export const DEFAULTS = {
  enabled: true,
  // 空字符串 = 会话文件夹直接放在工作区根目录（不再多一层容器）
  containerName: '',
  nameTemplate: '【{kind}-{summary}】',
  minChars: 15,
  maxChars: 30,
  extractCode: true,
  extractLongText: false,
  blacklist: [],
  includeSubagents: false,
  settleMs: 1500,
  tickMs: 20000,
  refreshMs: 60000,
  compressAfter: 0,
  cleanupHistoryDays: 0,
  writeSessionJson: true,
  divertWorkspaceFiles: false,
  // 工作区根目录里的其它文件夹/文件，收进唯一的会话文件夹（只有一个会话时才动手）
  absorbWorkspaceRoot: true,
  // code/other 留空 = 不分子目录，代码与产出文件直接平铺在会话文件夹里
  dirs: { chat: '聊天记录.md', code: '', other: '' },
};

const CODE_EXT = new Set([
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'sh', 'ps1', 'bat', 'cmd', 'vbs', 'ahk',
  'java', 'kt', 'go', 'rs', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'rb', 'swift', 'dart',
  'lua', 'r', 'sql', 'html', 'css', 'scss', 'less', 'vue', 'svelte', 'asm', 'reg',
  'json', 'yml', 'yaml', 'toml', 'ini', 'env', 'xml', 'dockerfile', 'makefile', 'cmake',
]);

export function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh');
}

export function storeDir() {
  return join(dshHome(), 'storages', 'session-archive');
}

export const CONFIG_PATH = () => join(storeDir(), 'config.json');
export const INDEX_PATH = () => join(storeDir(), 'index.json');

let tmpCounter = 0;

export function readJsonSyncless(path, fallback) {
  return { path, fallback };
}

export async function readJson(path, fallback) {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  tmpCounter += 1;
  const tmp = `${path}.${process.pid}.${tmpCounter}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tmp, path);
}

export function normalizeConfig(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const out = { ...DEFAULTS, ...raw };
  out.dirs = { ...DEFAULTS.dirs, ...(raw.dirs && typeof raw.dirs === 'object' ? raw.dirs : {}) };
  out.enabled = out.enabled !== false;
  out.extractCode = out.extractCode !== false;
  out.extractLongText = out.extractLongText === true;
  out.includeSubagents = out.includeSubagents === true;
  out.divertWorkspaceFiles = out.divertWorkspaceFiles === true;
  out.absorbWorkspaceRoot = out.absorbWorkspaceRoot !== false;
  out.writeSessionJson = out.writeSessionJson !== false;
  // 允许为空：空 = 会话文件夹直接落在工作区根目录（少一层）
  out.containerName = String(out.containerName || '').replace(/[\\/:*?"<>|]/g, '').trim();
  out.nameTemplate = String(out.nameTemplate || DEFAULTS.nameTemplate);
  out.minChars = clampInt(out.minChars, 6, 40, DEFAULTS.minChars);
  out.maxChars = clampInt(out.maxChars, out.minChars, 80, DEFAULTS.maxChars);
  out.settleMs = clampInt(out.settleMs, 200, 60000, DEFAULTS.settleMs);
  out.tickMs = clampInt(out.tickMs, 5000, 600000, DEFAULTS.tickMs);
  out.refreshMs = clampInt(out.refreshMs, 5000, 600000, DEFAULTS.refreshMs);
  out.compressAfter = clampInt(out.compressAfter, 0, 100000, 0);
  out.cleanupHistoryDays = clampInt(out.cleanupHistoryDays, 0, 3650, 0);
  out.blacklist = Array.isArray(out.blacklist)
    ? out.blacklist.map((s) => String(s).trim()).filter(Boolean)
    : String(out.blacklist || '').split(/[,，\n]/).map((s) => s.trim()).filter(Boolean);
  for (const key of ['chat', 'code', 'other']) {
    const clean = String(out.dirs[key] ?? DEFAULTS.dirs[key]).replace(/[\\/:*?"<>|]/g, '').trim();
    out.dirs[key] = clean || (key === 'chat' ? DEFAULTS.dirs.chat : '');
  }
  return out;
}

/** 子目录名留空 = 直接放在会话文件夹里 */
export function bucketDir(dir, name) {
  const leaf = String(name || '').trim();
  return leaf ? join(dir, leaf) : dir;
}

export function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export async function loadConfig(base) {
  const persisted = await readJson(CONFIG_PATH(), {});
  return normalizeConfig({ ...(base || {}), ...persisted });
}

export async function saveConfigPatch(patch) {
  const persisted = await readJson(CONFIG_PATH(), {});
  const next = { ...persisted, ...(patch || {}) };
  await writeJsonAtomic(CONFIG_PATH(), next);
  return next;
}

export async function readIndex() {
  const raw = await readJson(INDEX_PATH(), { version: 1, sessions: {} });
  const sessions = raw && typeof raw.sessions === 'object' && raw.sessions ? raw.sessions : {};
  return { version: 1, sessions };
}

export async function writeIndex(index) {
  await writeJsonAtomic(INDEX_PATH(), index);
}

export async function ensureDir(path) {
  await mkdir(path, { recursive: true });
  return path;
}

export async function pathState(path) {
  try {
    const s = await stat(path);
    return { exists: true, isDir: s.isDirectory(), size: s.size, mtimeMs: s.mtimeMs };
  } catch {
    return { exists: false, isDir: false, size: 0, mtimeMs: 0 };
  }
}

export function bucketForFile(name) {
  const ext = extname(String(name || '')).replace(/^\./, '').toLowerCase();
  const base = basename(String(name || '')).toLowerCase();
  if (base === 'dockerfile' || base === 'makefile' || base === 'cmakelists.txt') return 'code';
  return CODE_EXT.has(ext) ? 'code' : 'other';
}

/** 移动（跨盘时复制后删除） */
export async function moveFile(from, to) {
  await mkdir(dirname(to), { recursive: true });
  try {
    await rename(from, to);
    return { moved: true, mode: 'rename' };
  } catch (error) {
    if (error && (error.code === 'EXDEV' || error.code === 'EPERM' || error.code === 'EACCES')) {
      await copyFile(from, to);
      await rm(from, { force: true });
      return { moved: true, mode: 'copy' };
    }
    throw error;
  }
}

export async function listFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries;
  } catch {
    return [];
  }
}

export { existsSync };
