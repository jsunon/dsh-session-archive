// bin/chat-blocks.mjs 单测：从 聊天记录.md 复原代码块前文
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeTextMap } from '../bin/chat-blocks.mjs';

let pass = 0;
const fails = [];
async function check(name, fn) {
  try {
    await fn();
    pass += 1;
    console.log('  ✓ ' + name);
  } catch (err) {
    fails.push({ name, err });
    console.log('  ✗ ' + name);
    console.log('    ' + (err && err.message));
  }
}

const chat = [
  '# 【测试】前文提取',
  '',
  '- 会话 ID：s-test',
  '',
  '---',
  '## 1 · 用户 · 2026-11-02 10:00:00',
  '',
  '帮我写个启动脚本',
  '',
  '## 2 · 助手 · 2026-11-02 10:01:00',
  '',
  '先说结论：脚本放这里就够了。',
  '',
  '```bash',
  'echo hi',
  '```',
  '',
  '接着补一个配置文件：',
  '',
  '```yaml',
  'a: 1',
  '```',
  '',
  '## 3 · 助手 · 2026-11-02 10:02:00',
  '',
  '> 代码已单独保存（见 `02-源码/` 或 `03-工具/`）',
  '',
  '```js',
  'export const x = 1;',
  '```',
  '',
  '## 4 · 用户 · 2026-11-02 10:03:00',
  '',
  '没有围栏的一段话',
  '',
].join('\n');

const dir = await mkdtemp(join(tmpdir(), 'chatblocks-'));
await writeFile(join(dir, '聊天记录.md'), chat, 'utf8');
const map = await beforeTextMap(dir);

await check('按 seq-blockNo 索引到前文', () => {
  assert.equal(map.get('2-1'), '先说结论：脚本放这里就够了。');
});

await check('同一段第二个代码块取最近一段正文', () => {
  assert.equal(map.get('2-2'), '接着补一个配置文件：');
});

await check('占位行不算前文，返回 undefined', () => {
  assert.equal(map.has('3-1'), false);
});

await check('无围栏段落不产生条目', () => {
  assert.equal(map.has('4-1'), false);
});

await check('用户段落无代码块不产生条目', () => {
  assert.equal(map.has('1-1'), false);
});

await check('文件不存在返回空 Map', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'chatblocks-empty-'));
  const m = await beforeTextMap(empty);
  assert.equal(m.size, 0);
});

console.log('');
if (fails.length) {
  console.log(`失败 ${fails.length} 项：`);
  for (const f of fails) console.log(' - ' + f.name + ': ' + (f.err && f.err.stack));
  process.exitCode = 1;
} else {
  console.log(`全部通过：${pass} 项`);
}
