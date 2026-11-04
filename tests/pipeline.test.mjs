// 端到端单测：node tests/pipeline.test.mjs
// 在临时目录里真跑一遍落盘，验证「按维度建桶 + 语义命名 + 去重 + 审计链」。
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

import { archiveStructured, analyze } from '../lib/pipeline.js';
import { normalizeConfig } from '../lib/store.js';
import { renderEntries } from '../lib/render.js';

let pass = 0;
function check(label, fn) {
  return Promise.resolve(fn()).then(() => {
    pass += 1;
    console.log('  ✓ ' + label);
  });
}

const cfg = normalizeConfig({});

function msgsOf(list) {
  return list.map((m, i) => ({ role: m.role, text: m.text, time: Date.now() + i }));
}

function renderAll(messages) {
  return renderEntries(messages, { config: cfg, dirs: cfg.dirs, startIndex: 0 });
}

async function tree(dir, depth = 0, out = []) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    out.push(`${'  '.repeat(depth)}${e.name}${e.isDirectory() ? '/' : ''}`);
    if (e.isDirectory() && depth < 4) await tree(join(dir, e.name), depth + 1, out);
  }
  return out;
}

console.log('pipeline.test');

/* ---- 场景一：插件开发 ---- */
const devMessages = msgsOf([
  { role: '用户', text: '帮我写一个 DSH 插件，要有 package.json 和 lib/index.js，最后能上传开源' },
  {
    role: '助手',
    text: [
      '先给清单文件：',
      '```json',
      '{\n  "name": "dsh-demo-plugin",\n  "version": "1.0.0",\n  "main": "./lib/index.js"\n}',
      '```',
      '主文件 lib/index.js：',
      '```js',
      '// 演示插件入口',
      'export const name = "dsh-demo-plugin";',
      'export function apply(ctx) { return ctx; }',
      '```',
      '再补一个工具函数：',
      '```js',
      'export function buildName(input) {\n  return String(input).trim();\n}',
      '```',
      '一次性探测一下端口：',
      '```sh',
      'curl -s http://127.0.0.1:8080/health',
      '```',
    ].join('\n'),
  },
]);

const dir1 = await mkdtemp(join(tmpdir(), 'arch-dev-'));

await check('插件开发：维度识别为 DEV', async () => {
  const rendered = renderAll(devMessages);
  const analysis = analyze(devMessages, rendered.codeFiles, { title: '写一个 DSH 插件' });
  assert.ok(analysis.active.includes('DEV'), JSON.stringify(analysis.scores));
});

await check('插件开发：建出 01/02/03 桶', async () => {
  const rendered = renderAll(devMessages);
  const r = await archiveStructured({
    dir: dir1, cfg, messages: devMessages, blocks: rendered.codeFiles,
    title: '写一个 DSH 插件', sessionId: 's-dev', workspace: dir1, createdAt: Date.now(),
  });
  assert.ok(r.ok, JSON.stringify(r));
  const t = await tree(dir1);
  assert.ok(t.some((l) => l.includes('01-成品')), t.join('\n'));
  assert.ok(t.some((l) => l.includes('03-工具')), t.join('\n'));
});

await check('插件开发：生成 README.md + MANIFEST.json', async () => {
  const t = await tree(dir1);
  assert.ok(t.some((l) => l.trim() === 'README.md'), t.join('\n'));
  assert.ok(t.some((l) => l.trim() === 'MANIFEST.json'), t.join('\n'));
  const md = await readFile(join(dir1, 'README.md'), 'utf8');
  assert.ok(md.includes('会话类型判定'), md.slice(0, 300));
  const mf = JSON.parse(await readFile(join(dir1, 'MANIFEST.json'), 'utf8'));
  assert.equal(mf.sessionId, 's-dev');
  assert.ok(mf.dimensions.active.includes('DEV'));
});

await check('插件开发：语义命名，无 代码-N-M 碎片', async () => {
  const t = await tree(dir1);
  assert.ok(!t.some((l) => /代码-\d+-\d+/.test(l)), t.join('\n'));
});

await check('插件开发：探测命令进 _临时', async () => {
  const t = await tree(dir1);
  assert.ok(t.some((l) => l.includes('_临时')), t.join('\n'));
});

await check('插件开发：无 -2 后缀副本', async () => {
  const t = await tree(dir1);
  // 兜底名 `片段-002-04.sh` 里的 `-04` 是块序号，不是重复副本；排除它再看
  const dup = t.filter((l) => {
    const name = l.trim();
    if (/^片段-/.test(name) || name.startsWith('片段-')) return false;
    return /-\d+\.[a-z]+$/.test(name) && !/v\d/.test(name);
  });
  assert.equal(dup.length, 0, dup.join('\n') || t.join('\n'));
});

await check('幂等：再跑一遍不产生新文件', async () => {
  const before = (await tree(dir1)).length;
  const rendered = renderAll(devMessages);
  await archiveStructured({
    dir: dir1, cfg, messages: devMessages, blocks: rendered.codeFiles,
    title: '写一个 DSH 插件', sessionId: 's-dev', workspace: dir1, createdAt: Date.now(),
  });
  const after = (await tree(dir1)).length;
  assert.equal(after, before, `before=${before} after=${after}`);
});

/* ---- 场景二：纯提问 ---- */
const askMessages = msgsOf([
  { role: '用户', text: 'Cloudflare 的邮件路由是什么？和 MX 记录有什么区别？' },
  { role: '助手', text: '邮件路由是把收件地址映射到目的地的规则，和 MX 记录不是一回事。'.repeat(12) },
]);

const dir2 = await mkdtemp(join(tmpdir(), 'arch-ask-'));

await check('纯提问：不建任何成品桶，根目录只留白名单文件', async () => {
  const rendered = renderAll(askMessages);
  const r = await archiveStructured({
    dir: dir2, cfg, messages: askMessages, blocks: rendered.codeFiles,
    title: 'Cloudflare 邮件路由是什么', sessionId: 's-ask', workspace: dir2, createdAt: Date.now(),
  });
  assert.ok(r.ok);
  const t = await tree(dir2);
  // 空桶不建：纯问答没有任何产物，就不该出现成品/源码/工具/产物目录
  for (const bucket of ['01-成品', '02-源码', '03-工具', '04-产物']) {
    assert.ok(!t.some((l) => l.includes(bucket)), `不该建 ${bucket}：\n` + t.join('\n'));
  }
  // 根目录只允许白名单 + _临时
  const rootEntries = await readdir(dir2);
  const allowed = ['README.md', 'MANIFEST.json', '聊天记录.md', 'session.json', '_临时'];
  const stray = rootEntries.filter((n) => !allowed.includes(n));
  assert.deepEqual(stray, [], '根目录出现白名单外的条目：' + stray.join(','));
});

/* ---- 场景三：重复内容 ---- */
const dir3 = await mkdtemp(join(tmpdir(), 'arch-dup-'));

await check('重复代码块：第二份进 _临时/重复', async () => {
  const messages = msgsOf([
    { role: '用户', text: '写个脚本' },
    {
      role: '助手',
      text: [
        '```js', 'export function same() { return 42; }', '```',
        '再来一遍：',
        '```js', 'export function same() { return 42; }', '```',
      ].join('\n'),
    },
  ]);
  const rendered = renderAll(messages);
  await archiveStructured({
    dir: dir3, cfg, messages, blocks: rendered.codeFiles,
    title: '写个脚本', sessionId: 's-dup', workspace: dir3, createdAt: Date.now(),
  });
  const t = await tree(dir3);
  assert.ok(t.some((l) => l.includes('重复')), t.join('\n'));
});

/* ---- 场景四：旧碎片迁移 ---- */
const dir4 = await mkdtemp(join(tmpdir(), 'arch-legacy-'));

await check('旧 代码-N-M 碎片被迁走', async () => {
  await writeFile(join(dir4, '代码-104-1.json'), '{"name":"legacy-demo","version":"1.0.0"}', 'utf8');
  await writeFile(join(dir4, '代码-104-1-2.json'), '{"name":"legacy-demo","version":"1.0.0"}', 'utf8');
  await mkdir(join(dir4, '源码文件'), { recursive: true });
  await writeFile(join(dir4, '源码文件', 'legacy-helper.js'), 'export function legacyTool() { return 1; }', 'utf8');
  const messages = msgsOf([{ role: '用户', text: '整理一下' }, { role: '助手', text: '好。' }]);
  const rendered = renderAll(messages);
  await archiveStructured({
    dir: dir4, cfg, messages, blocks: rendered.codeFiles,
    title: '整理一下', sessionId: 's-legacy', workspace: dir4, createdAt: Date.now(),
  });
  // 根目录必须干净：只剩 4 个允许的文件 + 桶目录
  const rootEntries = await readdir(dir4);
  assert.ok(!rootEntries.some((n) => n.startsWith('代码-')), '根目录残留碎片：' + rootEntries.join(','));
  assert.ok(!rootEntries.includes('源码文件'), '旧桶没删：' + rootEntries.join(','));
  const t = await tree(dir4);
  // 唯一内容必须落进真桶，不能被自己的 hash 判成重复。
  // 回归：migrateLegacy 曾把候选件自己的 hash 提前塞进 existingHashes，
  // 于是 routeFile 第 1 级读到「与自己相同」，把每个旧碎片都扔进 _临时/重复——好文件当垃圾。
  assert.ok(!t.some((l) => l.includes('重复') && l.includes('legacy-helper')), t.join('\n'));
  assert.ok(t.some((l) => l.includes('legacy-helper.js')), 'legacy-helper.js 没落盘：' + t.join('\n'));
  assert.ok(t.some((l) => l.includes('package.json')), 'package.json 没落盘：' + t.join('\n'));
  // 内容真重复的 -2 副本才进 _临时/重复
  assert.ok(t.some((l) => l.includes('重复')), t.join('\n'));
  // 旧名映射表存在
  assert.ok(t.some((l) => l.includes('映射-旧名.json')), t.join('\n'));
});

/* ---- 场景五：安全扫描阻断 ---- */
const dir5 = await mkdtemp(join(tmpdir(), 'arch-safety-'));

await check('交付单元含密钥 → safety 不通过', async () => {
  const messages = msgsOf([
    { role: '用户', text: '做个插件，打包上传开源' },
    {
      role: '助手',
      text: [
        '```json', '{"name":"leaky","version":"1.0.0","main":"./lib/index.js"}', '```',
        '```js', 'const key = "sk-FIXTURE-NOT-A-REAL-KEY-0000";', '```',
      ].join('\n'),
    },
  ]);
  const rendered = renderAll(messages);
  const r = await archiveStructured({
    dir: dir5, cfg, messages, blocks: rendered.codeFiles,
    title: '做个插件', sessionId: 's-leak', workspace: dir5, createdAt: Date.now(),
  });
  assert.ok(r.safety, '应有扫描结果');
  assert.ok(!r.safety.ok, JSON.stringify(r.safety));
});

/* ---- 场景六：覆盖锁 ---- */
const dir6 = await mkdtemp(join(tmpdir(), 'arch-lock-'));

await check('覆盖锁优先于自动判定', async () => {
  const messages = msgsOf([
    { role: '用户', text: 'Cloudflare 邮件路由是什么？' },
    { role: '助手', text: '解释一下。'.repeat(50) },
  ]);
  const rendered = renderAll(messages);
  const r = await archiveStructured({
    dir: dir6, cfg, messages, blocks: rendered.codeFiles,
    title: '问个问题', sessionId: 's-lock', workspace: dir6, createdAt: Date.now(),
    override: { locked: true, dimensions: ['DEV'], lifecycle: 'archived' },
  });
  assert.equal(r.locked, true);
  assert.deepEqual(r.active, ['DEV']);
  // 覆盖锁赢过自动判定：自动会判 ASK（纯提问），锁成 DEV 后就不再出现 05-参考。
  // 注意此时没有任何产物文件，按「空桶不建」原则 01-成品 也不会被创建。
  const t = await tree(dir6);
  assert.ok(!t.some((l) => l.includes('05-参考')), '覆盖锁没生效，仍建了参考桶：\n' + t.join('\n'));
});

for (const d of [dir1, dir2, dir3, dir4, dir5, dir6]) {
  await rm(d, { recursive: true, force: true }).catch(() => {});
}

console.log(`\n全部通过：${pass} 项`);
