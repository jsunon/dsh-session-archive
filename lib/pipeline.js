// 会话归档 · 结构化落盘流水线
//
// 信号 → 维度 → 布局 → 路由 → 写盘 → 清单
// 每一步都能单独跑、单独测；这一层只负责把它们串起来并处理幂等。

import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir, rm, rename, stat } from 'node:fs/promises';
import { join, dirname, basename, extname } from 'node:path';

import { sha256, normalizeForHash } from './hash.js';
import { extractSignals, scoreDimensions, describe, confidenceOf, THRESHOLD } from './dimensions.js';
import { planLayout, BUCKETS, ROOT_FILES } from './layout.js';
import { routeFile, semanticStem, versionedName, extOf, MANIFEST_NAMES } from './router.js';
import { buildManifest, renderReadme, MANIFEST_VERSION } from './manifest.js';
import { scanText, summarize } from './safety.js';

export const STATE_FILE = '.archive-state.json';
export const OPLOG_FILE = '.oplog.jsonl';

/** 会话目录 → 状态文件路径（放在 _临时 里，不污染根目录） */
function statePath(dir, cfg) {
  const trash = (cfg.dirs && cfg.dirs.trash) || '_临时';
  return join(dir, trash, STATE_FILE);
}

async function readJsonSafe(path, fallback) {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
  return path;
}

async function appendOp(dir, cfg, op) {
  const trash = (cfg.dirs && cfg.dirs.trash) || '_临时';
  const file = join(dir, trash, OPLOG_FILE);
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify({ ...op, ts: Date.now() })}\n`, { encoding: 'utf8', flag: 'a' });
  } catch {
    /* 日志写不进去不影响主流程 */
  }
}

/* ---------------- 判定 ---------------- */

/**
 * 由消息与代码块算出维度。
 * @param {Array} messages
 * @param {Array} blocks   renderEntries 产出的 codeFiles
 * @param {{title?:string, toolCalls?:Array}} extra
 */
export function analyze(messages = [], blocks = [], extra = {}) {
  const signals = extractSignals(messages, blocks, extra);
  const { scores, reasons, active } = scoreDimensions(signals);
  return {
    scores,
    reasons,
    active,
    summary: describe(scores, active),
    signals,
  };
}

/** 有手动覆盖锁就用锁定的维度 */
function resolveActive(analysis, override) {
  if (override && override.locked && Array.isArray(override.dimensions) && override.dimensions.length) {
    return { active: override.dimensions.slice(), locked: true };
  }
  return { active: analysis.active, locked: false };
}

/* ---------------- 交付单元识别 ---------------- */

const SLUG_RE = /[^A-Za-z0-9._-]+/g;

function slugOf(text, fallback = 'deliver') {
  const s = String(text || '')
    .replace(/^@[^/]+\//, '')
    .replace(SLUG_RE, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s || fallback;
}

/** 从代码块里找 package.json，解析出包名与文件树线索 */
function detectDeliverUnit(blocks = []) {
  for (const block of blocks) {
    const text = String(block.content || block.code || '');
    if (!/"name"\s*:/.test(text)) continue;
    if (!/"version"\s*:/.test(text) && !/"main"\s*:/.test(text) && !/"exports"\s*:/.test(text)) continue;
    let name = '';
    try {
      const parsed = JSON.parse(text);
      name = String(parsed.name || '');
    } catch {
      const m = text.match(/"name"\s*:\s*"([^"]+)"/);
      name = m ? m[1] : '';
    }
    if (name) return { name: slugOf(name), from: block };
  }
  return null;
}

/** 代码块里是否点名了相对路径（lib/x.js、src/y.ts） */
function pathInBlock(block) {
  const head = String(block.beforeText || '') + '\n' + String(block.content || block.code || '').split('\n').slice(0, 6).join('\n');
  const m = head.match(/(?:^|[\s`'"(])((?:lib|src|app|packages|components|dist|docs|locale|test|tests)\/[A-Za-z0-9_./-]+\.[a-z]{2,5})/);
  return m ? m[1] : '';
}

/* ---------------- 落盘 ---------------- */

/**
 * 结构化归档主流程。
 * @param {object} input
 * @param {string} input.dir        会话目录
 * @param {object} input.cfg        normalizeConfig 后的配置
 * @param {Array}  input.messages   消息流
 * @param {Array}  input.blocks     renderEntries 产出的 codeFiles（含 seq/blockNo/beforeText/ext）
 * @param {string} input.title
 * @param {string} input.sessionId
 * @param {string} input.workspace
 * @param {number} input.createdAt
 * @param {object} input.override   手动覆盖锁
 */
export async function archiveStructured(input) {
  const { dir, cfg, messages = [], blocks = [], title = '', sessionId = '', workspace = '', createdAt = 0, override = null } = input;
  if (!cfg.structured) {
    return { ok: false, reason: 'structured-disabled', files: [] };
  }

  await ensureDir(dir);
  const trashDir = join(dir, cfg.dirs.trash || '_临时');
  await ensureDir(trashDir);

  const analysis = analyze(messages, blocks, { title });
  const { active, locked } = resolveActive(analysis, override);

  /* ---- 布局：只登记路径，不建目录（空桶不建） ---- */
  const plan = planLayout(active);
  const bucketPaths = {};
  for (const bucket of plan.buckets) {
    const leaf = String((cfg.dirs && cfg.dirs[bucket.id]) || '').trim();
    if (!leaf) continue;
    bucketPaths[bucket.id] = join(dir, leaf);
  }
  await ensureDir(trashDir);

  /* ---- 既有文件哈希表（用于去重） ---- */
  const existingHashes = new Map();
  for (const [id, full] of Object.entries(bucketPaths)) {
    if (id === 'trash') continue;
    await collectHashes(full, existingHashes, dir);
  }

  /* ---- 状态（幂等键） ---- */
  const sp = statePath(dir, cfg);
  const state = await readJsonSafe(sp, { version: 1, blocks: {} });
  if (!state.blocks) state.blocks = {};

  /* ---- 交付单元 ---- */
  const unit = detectDeliverUnit(blocks);
  const deliverRoot = unit && bucketPaths.deliver ? join(bucketPaths.deliver, unit.name) : '';

  /* ---- 逐块路由落盘 ---- */
  const written = [];
  const usedNames = new Map();  // targetPath → version
  const writtenHashes = new Map();  // hash → 本轮新落盘的相对路径

  for (const block of blocks) {
    const key = `${block.seq || 0}-${block.blockNo || 0}`;
    const hash = sha256(block.content);
    const prev = state.blocks[key];
    if (prev && prev.sha256 === hash && existsSync(join(dir, prev.path))) {
      written.push({ ...prev, skipped: true });
      continue;
    }

    const stem = semanticStem({ code: block.content }, { seq: block.seq, blockNo: block.blockNo, beforeText: block.beforeText });
    const ext = block.ext || extOf(block.name) || 'txt';
    let fileName = `${stem}.${ext}`;

    const pathRef = pathInBlock(block);
    const isDeliverPart = Boolean(deliverRoot) && (MANIFEST_NAMES.has(basename(pathRef || '').toLowerCase()) || Boolean(pathRef) || block === unit.from);

    const decision = routeFile(
      {
        name: fileName,
        content: block.content,
        isDeliverPart,
        deliverDir: isDeliverPart ? (pathRef ? dirname(pathRef) : '') : '',
        srcRole: '',
      },
      { active, existingHashes, seq: block.seq, blockNo: block.blockNo, beforeText: block.beforeText },
    );

    // 维度只给候选桶；当路由对某个文件给出 high 置信度的非可删桶时，按需把它实体化。
    // 例：纯排错会话里出现一个含函数定义的脚本，它确实可复用，不该因为「FIX 维度没规划
    // 工具桶」就被丢进 _临时/未归类 —— 那会让用户误删有用脚本。
    if (
      decision.bucket !== 'trash' &&
      decision.bucket !== 'deliver' &&
      !bucketPaths[decision.bucket] &&
      decision.confidence === 'high'
    ) {
      const leaf = String((cfg.dirs && cfg.dirs[decision.bucket]) || '').trim();
      if (leaf) bucketPaths[decision.bucket] = join(dir, leaf);
    }

    // 目标桶没被实体化 → 落到 _临时/未归类（而不是 _临时 根），否则「不知道放哪」和
    // 「明确判定可删」的重复件混在同一层，用户看不出区别。
    const missingBucket = decision.bucket !== 'trash' && !bucketPaths[decision.bucket];
    let baseDir = deliverRoot && decision.bucket === 'deliver' ? deliverRoot : bucketPaths[decision.bucket] || bucketPaths.trash;
    if (decision.subdir && !missingBucket) baseDir = join(baseDir, decision.subdir);
    if (missingBucket) baseDir = join(trashDir, '未归类');
    if (decision.bucket === 'deliver' && decision.subdir) baseDir = join(deliverRoot, decision.subdir);
    await ensureDir(baseDir);

    let target = join(baseDir, fileName);
    // 同名不同内容 → vN，绝不用 -2
    let version = usedNames.get(target) || 0;
    while (existsSync(target)) {
      const existing = await readFile(target, 'utf8').catch(() => null);
      if (existing !== null && normalizeForHash(existing) === normalizeForHash(block.content)) break;
      version += 1;
      target = join(baseDir, versionedName(fileName, version + 1));
      if (version > 50) break;
    }
    usedNames.set(join(baseDir, fileName), version);

    try {
      await writeFile(target, block.content, 'utf8');
    } catch (error) {
      continue;
    }

    const rel = target.slice(dir.length + 1).split('\\').join('/');
    state.blocks[key] = { sha256: hash, path: rel, name: basename(target), bucket: decision.bucket, at: Date.now() };
    existingHashes.set(hash, rel);
    writtenHashes.set(hash, rel);
    written.push({
      path: rel,
      bucket: decision.bucket,
      dimension: active[0] || '',
      confidence: decision.confidence,
      sha256: hash,
      size: Buffer.byteLength(block.content, 'utf8'),
      source: { msgRef: `seq-${block.seq}`, blockNo: block.blockNo },
      reason: decision.reason,
      deletable: decision.deletable,
      readonly: false,
    });
    await appendOp(dir, cfg, { op: 'write', to: rel, key, hash });
  }

  await writeFile(sp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  /* ---- 旧布局迁移：代码-N-M / 源码文件/ / -2 副本 ---- */
  const migrated = await migrateLegacy(dir, cfg, bucketPaths, existingHashes, active, writtenHashes);

  /* ---- 只读标记：02-源码/原始（仅当真放了文件） ---- */
  if (bucketPaths.src) {
    const rawDir = join(bucketPaths.src, '原始');
    const rawFiles = existsSync(rawDir)
      ? (await readdir(rawDir).catch(() => [])).filter((n) => !n.startsWith('.'))
      : [];
    if (rawFiles.length > 0) {
      const marker = join(rawDir, '.READONLY');
      if (!existsSync(marker)) {
        await writeFile(marker, '本目录为上游原始文件，永不修改。\n修改请到 02-源码/补丁/ 或 02-源码/快照/。\n', 'utf8');
      }
    }
  }

  /* ---- 交付单元导出标记 + 安全扫描 ---- */
  let safety = null;
  if (cfg.safetyScan) {
    // 扫整个会话（跳过 _临时 与 02-源码/原始）：工具脚本也可能被一起带走
    const findings = [];
    await scanTree(dir, findings, cfg);
    safety = summarize(findings);
    if (deliverRoot) {
      await writeFile(join(deliverRoot, '.EXPORT.json'), `${JSON.stringify({
        version: 1,
        source: '02-源码/快照',
        exportedAt: Date.now(),
        safety: safety.verdict,
        blocking: (safety.blocking || []).length,
      }, null, 2)}\n`, 'utf8');
    }
  }

  /* ---- 清单 ---- */
  const allFiles = await listAll(dir, cfg);
  // 只列真实存在且非空的桶：空桶不建，也不写进 README
  const liveBuckets = plan.buckets.filter((b) => {
    const p = bucketPaths[b.id];
    return p && existsSync(p) && allFiles.some((f) => f.bucket === b.id);
  });
  if (cfg.writeManifest) {
    const manifest = buildManifest({
      sessionId,
      name: basename(dir),
      workspace,
      dir,
      createdAt,
      lifecycle: (override && override.lifecycle) || 'active',
      scores: analysis.scores,
      active,
      buckets: liveBuckets,
      files: allFiles.map((f) => ({
        path: f.rel,
        bucket: f.bucket,
        confidence: 'high',
        sha256: f.sha256,
        size: f.size,
        deletable: f.bucket === 'trash',
        readonly: f.bucket === 'src' && f.rel.includes('/原始/'),
      })),
      safety,
      override,
    });
    manifest.reasons = analysis.reasons;
    await writeFile(join(dir, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await writeFile(join(dir, 'README.md'), renderReadme(manifest), 'utf8');
  }

  return {
    ok: true,
    active,
    locked,
    scores: analysis.scores,
    summary: analysis.summary,
    buckets: liveBuckets.map((b) => b.dir),
    files: written,
    migrated,
    safety,
  };
}

/* ---------------- 辅助 ---------------- */

async function collectHashes(root, map, sessionDir) {
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      await collectHashes(full, map, sessionDir);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name === '.READONLY' || entry.name === '.EXPORT.json') continue;
    try {
      const text = await readFile(full, 'utf8');
      map.set(sha256(text), full.slice(sessionDir.length + 1).split('\\').join('/'));
    } catch {
      /* 二进制读不了就跳过 */
    }
  }
}

/**
 * 把旧版平铺产物重新归类。
 * - 旧分类桶（源码文件/、其他产出文件/…）→ 按内容重新路由，桶本身删除
 * - 根目录 代码-N-M.ext → 有重复则进 _临时/重复，否则 _临时/未归类（保留原名以便追溯）
 * - 根目录 -2 副本 → _临时/重复
 * - 同时写 _临时/映射-旧名.json
 */
async function migrateLegacy(dir, cfg, bucketPaths, existingHashes, active = [], writtenHashes = new Map()) {
  const legacyBuckets = ['源码文件', '其他产出文件', '插件源码（如有）', '插件源码', '其他分类', '整理'];
  const trashDir = bucketPaths.trash || join(dir, cfg.dirs.trash || '_临时');
  const mapping = {};
  let moved = 0;

  /** 目标桶不存在时一律落 _临时/未归类 —— 不对称保守：可疑的往可删那边倒 */
  const resolveTarget = (decision) => {
    let id = decision.bucket;
    let sub = decision.subdir || '';
    if (id === 'deliver' && !bucketPaths.deliver) { id = 'tools'; sub = ''; }
    // 与主循环一致：路由给出 high 置信度的非可删桶时按需实体化，别把有用脚本埋进未归类
    if (!bucketPaths[id] && id !== 'trash' && decision.confidence === 'high') {
      const leaf = String((cfg.dirs && cfg.dirs[id]) || '').trim();
      if (leaf) bucketPaths[id] = join(dir, leaf);
    }
    if (!bucketPaths[id] && id !== 'trash') { id = 'trash'; sub = '未归类'; }
    const baseDir = id === 'trash' ? trashDir : bucketPaths[id];
    return { id, sub, dir: sub ? join(baseDir, sub) : baseDir };
  };

  const place = async (from, name, sub) => {
    const targetDir = join(trashDir, sub);
    await ensureDir(targetDir);
    const target = join(targetDir, name);
    if (existsSync(target)) return false;
    try {
      await rename(from, target);
    } catch {
      return false;
    }
    mapping[name] = `${cfg.dirs.trash || '_临时'}/${sub}/${name}`;
    await appendOp(dir, cfg, { op: 'migrate', from: name, to: mapping[name] });
    return true;
  };

  // 1) 旧分类桶：把里面的文件重新路由
  for (const name of legacyBuckets) {
    const sub = join(dir, name);
    if (!existsSync(sub)) continue;
    const files = await readdir(sub).catch(() => []);
    for (const f of files) {
      const from = join(sub, f);
      const content = await readFile(from, 'utf8').catch(() => null);
      if (content === null) continue;
      const h = sha256(content);
      // 本段已按语义名重新落盘过 → 旧桶里的同名内容只是冗余。核验后删除，核验不过退回重复桶。
      if (writtenHashes.has(h)) {
        const kept = writtenHashes.get(h);
        const keptPath = join(dir, kept);
        const keptText = existsSync(keptPath) ? await readFile(keptPath, 'utf8').catch(() => null) : null;
        if (keptText !== null && sha256(keptText) === h) {
          await rm(from, { force: true }).catch(() => {});
          mapping[`${name}/${f}`] = `${kept}（内容已由本段重新落盘，旧副本经 hash 核验后删除）`;
          moved += 1;
          await appendOp(dir, cfg, { op: 'drop-redundant', from: `${name}/${f}`, kept, verified: true });
        } else {
          await ensureDir(join(trashDir, '重复'));
          const dupTarget = join(trashDir, '重复', f);
          if (!existsSync(dupTarget)) await rename(from, dupTarget).catch(() => {});
          mapping[`${name}/${f}`] = `${kept}（核验未通过，旧副本留在 ${cfg.dirs.trash || '_临时'}/重复/${f}）`;
          moved += 1;
        }
        continue;
      }
      const decision = routeFile({ name: f, content }, { active, existingHashes });
      const t = resolveTarget(decision);
      await ensureDir(t.dir);
      const target = join(t.dir, f);
      if (existsSync(target)) continue;
      try {
        await rename(from, target);
        mapping[`${name}/${f}`] = `${cfg.dirs[t.id] || cfg.dirs.trash}${t.sub ? `/${t.sub}` : ''}/${f}`;
        moved += 1;
        await appendOp(dir, cfg, { op: 'migrate', from: `${name}/${f}`, to: mapping[`${name}/${f}`] });
      } catch {
        /* ignore */
      }
    }
    await rm(sub, { recursive: true, force: true }).catch(() => {});
  }

  // 2) 根目录残留碎片：先按内容分组，每组留一个代表，其余判重复
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (ROOT_FILES.includes(name)) continue;
    if (name.startsWith('.')) continue;
    if (!/\.(js|mjs|cjs|ts|py|sh|ps1|bat|json|yml|yaml|toml|sql|md|txt|png|jpg|svg)$/i.test(name)) continue;
    const isLegacyCode = /^代码-\d+-\d+/.test(name);
    const isDupSuffix = /-\d+\.[A-Za-z0-9]+$/.test(name) && !isLegacyCode;
    if (!isLegacyCode && !isDupSuffix) continue;
    const content = await readFile(join(dir, name), 'utf8').catch(() => null);
    if (content === null) continue;
    candidates.push({ name, content, isLegacyCode, isDupSuffix, hash: sha256(content) });
  }

  // 代表优先：无 -2 后缀的代码碎片 > 有后缀的副本
  candidates.sort((a, b) => {
    if (a.isLegacyCode !== b.isLegacyCode) return a.isLegacyCode ? -1 : 1;
    const aDup = a.isDupSuffix ? 1 : 0;
    const bDup = b.isDupSuffix ? 1 : 0;
    if (aDup !== bDup) return aDup - bDup;
    return a.name.length - b.name.length;
  });

  const seen = new Set();
  for (const c of candidates) {
    const full = join(dir, c.name);

    // 本段刚由代码块写入过同样内容 → 旧碎片是冗余副本。
    // 删之前先核验「新文件确实在磁盘上且 hash 一致」，核验不过就退回 _临时/重复 保底。
    if (writtenHashes.has(c.hash)) {
      const kept = writtenHashes.get(c.hash);
      const keptPath = join(dir, kept);
      const keptText = existsSync(keptPath) ? await readFile(keptPath, 'utf8').catch(() => null) : null;
      if (keptText !== null && sha256(keptText) === c.hash) {
        await rm(full, { force: true }).catch(() => {});
        mapping[c.name] = `${kept}（内容已由本段重新落盘，旧碎片经 hash 核验后删除）`;
        moved += 1;
        await appendOp(dir, cfg, { op: 'drop-redundant', from: c.name, kept, verified: true });
      } else if (await place(full, c.name, '重复')) {
        moved += 1;
      }
      continue;
    }

    // 已有文件里有同样内容，或本批已处理过同样内容 → 重复
    // 注意：这里只判「别人已经占了这个 hash」，不能先把 c 自己登记进 existingHashes，
    // 否则下面的 routeFile 第 1 级会读到自己的 hash，把每个旧碎片都当成重复件。
    if (existingHashes.has(c.hash) || seen.has(c.hash)) {
      if (await place(full, c.name, '重复')) moved += 1;
      continue;
    }
    seen.add(c.hash);

    // 纯 -2 副本且内容唯一：也归重复（它本身就是「同一份东西的另一份」）
    if (c.isDupSuffix && !c.isLegacyCode) {
      if (await place(full, c.name, '重复')) moved += 1;
      continue;
    }

    // 代码-N-M 碎片：重新语义命名后按规则落桶
    const seqM = c.name.match(/^代码-(\d+)-(\d+)/);
    const seq = seqM ? Number(seqM[1]) : 0;
    const blockNo = seqM ? Number(seqM[2]) : 0;
    const stem = semanticStem({ code: c.content }, { seq, blockNo });
    const ext = extOf(c.name) || 'txt';
    const newName = `${stem}.${ext}`;
    const decision = routeFile({ name: newName, content: c.content }, { active, existingHashes });
    const t = resolveTarget(decision);
    await ensureDir(t.dir);
    let target = join(t.dir, newName);
    if (existsSync(target)) target = join(t.dir, versionedName(newName, 2));
    if (existsSync(target)) continue;
    try {
      await rename(full, target);
      mapping[c.name] = `${cfg.dirs[t.id] || cfg.dirs.trash}${t.sub ? `/${t.sub}` : ''}/${basename(target)}`;
      moved += 1;
      await appendOp(dir, cfg, { op: 'migrate', from: c.name, to: mapping[c.name] });
    } catch {
      /* ignore */
    }
  }

  // 3) 旧名映射表
  if (Object.keys(mapping).length) {
    const mapFile = join(trashDir, '映射-旧名.json');
    let prev = {};
    try {
      prev = JSON.parse(await readFile(mapFile, 'utf8'));
    } catch {
      prev = {};
    }
    await writeFile(mapFile, `${JSON.stringify({ ...prev, ...mapping }, null, 2)}\n`, 'utf8');
  }

  return moved;
}

async function scanTree(root, findings, cfg = {}, topRoot = root) {
  // 只跳过「上游原件」与「重复副本」：未归类/探测里恰恰最容易藏着硬编码密钥，
  // 漏扫它们等于把风险留在用户看不见的地方。
  const skip = new Set([
    '原始',
    '重复',
    'node_modules',
    '.git',
  ]);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    if (entry.name.startsWith('.') && entry.name !== '.env') continue;
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      await scanTree(full, findings, cfg, topRoot);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name === '.EXPORT.json') continue;
    const isRootMeta = root === topRoot && ROOT_FILES.includes(entry.name);
    if (!/\.(js|mjs|cjs|ts|json|yml|yaml|sh|py|md|txt|env|toml|ini|xml|ps1|bat|go|rs|java|php|rb)$/i.test(entry.name)) continue;
    const text = await readFile(full, 'utf8').catch(() => null);
    if (text === null) continue;
    const rel = full.slice(topRoot.length + 1).split('\\').join('/');
    const hits = scanText(text, { path: rel });
    // 根目录元数据（session.json / 聊天记录.md）天生带本机绝对路径，路径类告警在这里全是噪声；
    // 但密钥类（block）必须照报 —— 聊天记录里贴过 token 的情况真实存在。
    findings.push(...(isRootMeta ? hits.filter((h) => h.severity === 'block') : hits));
  }
}

async function listAll(dir, cfg) {
  const out = [];
  const bucketLeaf = new Set(Object.values(cfg.dirs || {}).filter(Boolean));
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!bucketLeaf.has(entry.name)) continue;
    const bucketId = Object.entries(BUCKETS).find(([, b]) => b.dir === entry.name);
    const id = bucketId ? bucketId[0] : '';
    await walk(join(dir, entry.name), entry.name, id, out, dir);
  }
  return out;
}

async function walk(root, prefix, bucket, out, sessionDir) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = join(root, entry.name);
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await walk(full, rel, bucket, out, sessionDir);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name === '.READONLY' || entry.name === '.EXPORT.json' || entry.name.startsWith('.')) continue;
    const info = await stat(full).catch(() => null);
    const text = await readFile(full, 'utf8').catch(() => '');
    out.push({ rel, bucket, sha256: text ? sha256(text) : '', size: info ? info.size : 0 });
  }
}

export { THRESHOLD, confidenceOf, resolveActive };
