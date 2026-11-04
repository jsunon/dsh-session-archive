// 迁移 CLI：把已有会话文件夹就地整理成结构化目录
//
//   node bin/migrate.mjs "<工作区>" --dry-run     只打印计划
//   node bin/migrate.mjs "<工作区>" --apply       真正搬动
//   node bin/migrate.mjs "<工作区>" --apply --only "【会话名】"
//
// 安全约定：
//   · 只动会话文件夹内部，永不碰工作区根目录
//   · 每个文件搬动前先算 sha256，重复的进 _临时/重复
//   · 全部动作写进 _临时/.oplog.jsonl，可回查
//   · --apply 前自动生成 _临时/.backup-<时间>.json 记录原路径
import { readdir, readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import { archiveStructured, analyze } from '../lib/pipeline.js';
import { normalizeConfig } from '../lib/store.js';
import { BUCKETS, planLayout } from '../lib/layout.js';
import { beforeTextMap } from './chat-blocks.mjs';
import { sha256 } from '../lib/hash.js';

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith('--')) || process.cwd();
const apply = args.includes('--apply');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : '';

const ROOT_FILES = new Set(['README.md', 'MANIFEST.json', '聊天记录.md', 'session.json']);
const SKIP_DIRS = new Set(['_临时', 'node_modules', '.git']);

async function walk(dir, base = '') {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      out.push(...(await walk(full, rel)));
    } else if (e.isFile()) {
      const info = await stat(full).catch(() => null);
      const content = info && info.size < 300000 ? await readFile(full, 'utf8').catch(() => '') : '';
      out.push({ rel, name: e.name, dir: base, size: info ? info.size : 0, content });
    }
  }
  return out;
}

/** 从聊天记录粗提消息，喂给维度打分 */
async function messagesOf(dir) {
  const text = await readFile(join(dir, '聊天记录.md'), 'utf8').catch(() => '');
  if (!text) return [];
  return text
    .split(/^## /m)
    .slice(1)
    .map((p) => ({ role: /^\d+\s*·\s*用户/.test(p) ? 'user' : 'assistant', content: [{ type: 'text', text: p }] }));
}

const cfg = normalizeConfig({
  structured: true,
  writeManifest: true,
  safetyScan: true,
  dedupeByHash: true,
});

const targets = (await readdir(root, { withFileTypes: true }))
  .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
  .map((e) => e.name)
  .filter((n) => !only || n === only);

console.log(`工作区：${root}`);
console.log(`模式：${apply ? 'APPLY（真搬）' : 'DRY-RUN（只看）'}\n`);

let touched = 0;
for (const name of targets) {
  const dir = join(root, name);
  const files = await walk(dir);
  const loose = files.filter((f) => !ROOT_FILES.has(f.rel));
  if (!loose.length) continue;

  const messages = await messagesOf(dir);
  const beforeMap = await beforeTextMap(dir);
  const blocks = loose
    .filter((f) => /^代码-\d+-\d+/.test(f.name))
    .map((f) => {
      const m = f.name.match(/^代码-(\d+)-(\d+)/);
      const seq = m ? Number(m[1]) : 0;
      const blockNo = m ? Number(m[2]) : 0;
      return {
        name: f.name,
        content: f.content,
        code: f.content,
        ext: extname(f.name).slice(1),
        seq,
        blockNo,
        // 迁移历史会话时，代码块的原始上下文只剩聊天记录里那份；
        // 没有它，122 个文件全叫 `片段-104-03.js`，语义命名等于没做。
        beforeText: beforeMap.get(`${seq}-${blockNo}`) || '',
      };
    });

  const verdict = analyze(messages, blocks, { title: name });
  const active = verdict.active.length ? verdict.active : ['ASK'];
  const plan = planLayout(active);

  console.log(`【${name}】`);
  console.log(`  维度：${active.join(' + ')}`);
  console.log(`  依据：${verdict.summary}`);
  console.log(`  待整理：${loose.length} 个文件　候选桶：${plan.buckets.map((b) => b.id).join(', ')}（按需创建，没文件就不建）`);

  if (!apply) {
    console.log('  （dry-run，未改动）\n');
    continue;
  }

  // 备份清单：记录整理前的相对路径 + sha256，出问题可照着搬回去并校验字节一致
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = join(dir, '_临时', `.backup-${stamp}.json`);
  await mkdir(dirname(backup), { recursive: true });
  const snapshot = [];
  for (const f of loose) {
    snapshot.push({ rel: f.rel, size: f.size, sha256: sha256(f.content) });
  }
  await writeFile(
    backup,
    `${JSON.stringify({ at: stamp, files: snapshot }, null, 2)}\n`,
    'utf8',
  );

  try {
    const result = await archiveStructured({
      dir,
      cfg,
      messages,
      blocks,
      title: name,
      sessionId: name,
      workspace: root,
      createdAt: Date.now(),
      override: null,
    });
    console.log(`  结果：${result.ok ? '成功' : '失败'}　落盘 ${result.files ? result.files.length : 0} 个`);
    if (result.buckets) console.log(`  桶：${result.buckets.join(', ')}`);
    if (result.safety) console.log(`  安全扫描：${result.safety.verdict}`);
  } catch (error) {
    console.log(`  失败：${(error && error.message) || error}`);
  }
  console.log('');
  touched += 1;
}

if (apply) console.log(`已整理 ${touched} 个会话文件夹。回滚依据：各会话 _临时/.backup-*.json`);
