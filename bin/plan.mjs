// 试运行：扫描现有会话文件夹，只算维度与路由计划，不动磁盘
// 用法：node bin/plan.mjs "<工作区根目录>"
import { readdir, stat, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { routeFile } from '../lib/router.js';
import { BUCKETS, planLayout } from '../lib/layout.js';
import { analyze } from '../lib/pipeline.js';
import { sha256 } from '../lib/hash.js';

const root = process.argv[2] || process.cwd();
const ROOT_FILES = new Set(['README.md', 'MANIFEST.json', '聊天记录.md', 'session.json']);
const LEGACY_BUCKETS = new Set(['源码文件', '其他产出文件', '插件源码（如有）', '插件源码', '其他分类', '整理']);

async function walk(dir, base = '') {
  const out = [];
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '_临时' || e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
      out.push(...(await walk(full, rel)));
    } else if (e.isFile()) {
      const info = await stat(full).catch(() => null);
      const content = info && info.size < 300000 ? await readFile(full, 'utf8').catch(() => '') : '';
      out.push({ rel, name: e.name, size: info ? info.size : 0, content });
    }
  }
  return out;
}

/** 从聊天记录里粗提消息，只为让维度打分有输入 */
async function messagesOf(dir) {
  const text = await readFile(join(dir, '聊天记录.md'), 'utf8').catch(() => '');
  if (!text) return [];
  const parts = text.split(/^## /m).slice(1);
  return parts.map((p) => {
    const isUser = /^\d+\s*·\s*用户/.test(p);
    return { role: isUser ? 'user' : 'assistant', content: [{ type: 'text', text: p }] };
  });
}

const dirs = (await readdir(root, { withFileTypes: true }))
  .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
  .map((e) => e.name);

const totals = { sessions: 0, files: 0, buckets: {}, dup: 0 };

for (const name of dirs) {
  const dir = join(root, name);
  const files = await walk(dir);
  const loose = files.filter((f) => !f.rel.includes('/') && !ROOT_FILES.has(f.rel));
  if (!loose.length) continue;

  totals.sessions += 1;
  totals.files += loose.length;

  const messages = await messagesOf(dir);
  const blocks = loose
    .filter((f) => /^代码-\d+-\d+/.test(f.name))
    .map((f) => ({ name: f.name, code: f.content, lang: extname(f.name).slice(1) }));
  const verdict = analyze(messages, blocks, { title: name });
  const active = verdict.active.length ? verdict.active : ['ASK'];
  const plan = planLayout(active);
  const bucketIds = plan.buckets.map((b) => b.id);

  console.log(`\n【${name}】`);
  console.log(`  维度：${active.join(' + ')}`);
  console.log(`  依据：${verdict.summary}`);
  console.log(`  候选桶：${bucketIds.join(', ')}（按需创建，没文件就不建）`);

  const hashes = new Map();
  const rows = [];
  // 与 pipeline 一致：维度只给候选桶，路由给出 high 置信度的非可删桶时按需实体化。
  const materialized = new Set(bucketIds);
  const created = [];
  // 与 migrateLegacy 同一套代表件排序：旧代码碎片优先、无 -N 后缀优先、名字短的优先。
  // 否则字母序会让 `代码-104-1-2.json` 抢在 `代码-104-1.json` 前面当代表，正好判反。
  const ordered = [...loose].sort((a, b) => {
    const aLegacy = /^代码-\d+-\d+/.test(a.name) ? 1 : 0;
    const bLegacy = /^代码-\d+-\d+/.test(b.name) ? 1 : 0;
    if (aLegacy !== bLegacy) return bLegacy - aLegacy;
    const aDup = /-\d+\.[A-Za-z0-9]+$/.test(a.name) && !aLegacy ? 1 : 0;
    const bDup = /-\d+\.[A-Za-z0-9]+$/.test(b.name) && !bLegacy ? 1 : 0;
    if (aDup !== bDup) return aDup - bDup;
    return a.name.length - b.name.length;
  });
  for (const f of ordered) {
    const isLegacy = /^代码-\d+-\d+/.test(f.name);
    const dupSuffix = /-\d+\.[A-Za-z0-9]+$/.test(f.name) && !isLegacy;
    let decision;
    if (dupSuffix && !isLegacy) {
      decision = { bucket: 'trash', subdir: '重复', reason: '旧版 -N 副本' };
      totals.dup += 1;
    } else {
      decision = routeFile(
        { name: f.name, content: f.content },
        { active, existingHashes: hashes },
      );
    }
    // 目标桶不在候选里、但路由给了 high 置信度 → 会按需建桶
    if (
      decision.bucket !== 'trash' &&
      decision.bucket !== 'deliver' &&
      !materialized.has(decision.bucket) &&
      decision.confidence === 'high' &&
      BUCKETS[decision.bucket]
    ) {
      materialized.add(decision.bucket);
      created.push(BUCKETS[decision.bucket].dir);
    }
    let key = `${BUCKETS[decision.bucket] ? BUCKETS[decision.bucket].dir : decision.bucket}${decision.subdir ? '/' + decision.subdir : ''}`;
    if (decision.bucket !== 'trash' && decision.confidence === 'low' && !materialized.has(decision.bucket)) {
      key = '_临时/未归类';
    }
    totals.buckets[key] = (totals.buckets[key] || 0) + 1;
    rows.push(`    ${f.rel.padEnd(34)} → ${key.padEnd(14)} ${decision.reason}`);
  }
  for (const r of rows.slice(0, 8)) console.log(r);
  if (rows.length > 8) console.log(`    … 另有 ${rows.length - 8} 个`);
  if (created.length) console.log(`  按需新建桶：${created.join(', ')}`);
}

console.log('\n=== 汇总 ===');
console.log(`会话：${totals.sessions}　待归位文件：${totals.files}　其中 -N 副本：${totals.dup}`);
for (const [k, v] of Object.entries(totals.buckets).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(20)} ${v}`);
}
