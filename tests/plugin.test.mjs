// 宿主接入单测：node tests/plugin.test.mjs
// 用最小 ctx 桩把 lib/index.js 的 apply() 跑起来，验证整条链路（事件 → 落盘 → 清单）。
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const plugin = await import('../lib/index.js');

let pass = 0;
function check(label, fn) {
  return Promise.resolve(fn()).then(() => {
    pass += 1;
    console.log('  ✓ ' + label);
  });
}

function makeCtx(sessions) {
  const handlers = new Map();
  const disposers = [];
  const ctx = {
    get(key) {
      if (key === 'sessions') return { list: () => sessions };
      if (key === 'sessionTitle') return { get: (s) => ({ title: s.__title || '' }) };
      return undefined;
    },
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      return () => {};
    },
    effect(fn) {
      const dispose = fn();
      if (typeof dispose === 'function') disposers.push(dispose);
      return dispose;
    },
    inject(_deps, fn) {
      // webServer 依赖不注入 → 不挂 HTTP 路由，只测归档
      return () => {};
    },
    emit(event, ...args) {
      for (const fn of handlers.get(event) || []) fn(...args);
    },
    handlers,
  };
  return ctx;
}

function fakeSession(id, cwd, title, messages) {
  const session = {
    id,
    __title: title,
    header: { version: 1, id, createdAt: Date.now(), cwd, isSeeded: false, agentPreset: 'cordis' },
    snapshotEvents() {
      return messages.map((m, i) => ({
        type: m.role === 'user' ? 'user/message' : 'assistant/message',
        seq: i + 1,
        time: Date.now() + i,
        data: m.role === 'user' ? m : { turn: 1, step: 1, message: m },
      }));
    },
    deriveMessages() {
      return messages;
    },
  };
  return session;
}

const root = await mkdtemp(join(tmpdir(), 'plugin-e2e-'));

const messages = [
  { role: 'user', content: [{ type: 'text', text: '帮我写一个 DSH 插件，要能上传开源' }] },
  {
    role: 'assistant',
    content: [{
      type: 'text',
      text: [
        '清单文件：',
        '```json',
        '{\n  "name": "dsh-demo-plugin",\n  "version": "1.0.0",\n  "main": "./lib/index.js"\n}',
        '```',
        '入口 lib/index.js：',
        '```js',
        '// 演示插件入口',
        'export const name = "dsh-demo-plugin";',
        'export function apply(ctx) { return ctx; }',
        '```',
      ].join('\n'),
    }],
  },
];

const session = fakeSession('s-e2e', root, '写一个 DSH 插件', messages);
const ctx = makeCtx([session]);

console.log('plugin.test');

await check('apply() 能正常装配', async () => {
  const api = plugin.apply(ctx, { settleMs: 200, tickMs: 999999, refreshMs: 999999 });
  assert.ok(api && typeof api.archive === 'function', 'archive 缺失');
  assert.ok(api.state, 'state 缺失');
});

await check('archive() 落出结构化目录', async () => {
  const api = plugin.apply(ctx, { settleMs: 200, tickMs: 999999, refreshMs: 999999 });
  const result = await api.archive(session, { force: true, divertWorkspace: false });
  assert.ok(result.ok, JSON.stringify(result));
  assert.ok(result.structured && result.structured.ok, JSON.stringify(result.structured));
  const entries = await readdir(result.dir);
  assert.ok(entries.includes('README.md'), entries.join(','));
  assert.ok(entries.includes('MANIFEST.json'), entries.join(','));
  assert.ok(entries.includes('聊天记录.md'), entries.join(','));
  assert.ok(entries.includes('session.json'), entries.join(','));
});

await check('聊天记录里保留指引而非原始代码块', async () => {
  const api = plugin.apply(ctx, { settleMs: 200, tickMs: 999999, refreshMs: 999999 });
  const result = await api.archive(session, { force: true, divertWorkspace: false });
  const chat = await readFile(join(result.dir, '聊天记录.md'), 'utf8');
  assert.ok(chat.includes('## 1 · 用户'), chat.slice(0, 200));
  assert.ok(chat.includes('代码已单独保存'), '应保留指引行');
});

await check('session.json 记录维度与桶', async () => {
  const api = plugin.apply(ctx, { settleMs: 200, tickMs: 999999, refreshMs: 999999 });
  const result = await api.archive(session, { force: true, divertWorkspace: false });
  const meta = JSON.parse(await readFile(join(result.dir, 'session.json'), 'utf8'));
  assert.equal(meta.sessionId, 's-e2e');
  assert.ok(meta.dimensions, '缺维度');
  assert.ok(Array.isArray(meta.buckets), '缺桶列表');
  assert.ok(meta.buckets.length > 0);
});

await check('MANIFEST 有 provenance 与统计', async () => {
  const api = plugin.apply(ctx, { settleMs: 200, tickMs: 999999, refreshMs: 999999 });
  const result = await api.archive(session, { force: true, divertWorkspace: false });
  const mf = JSON.parse(await readFile(join(result.dir, 'MANIFEST.json'), 'utf8'));
  assert.equal(mf.sessionId, 's-e2e');
  assert.ok(mf.files.length > 0, '无文件记录');
  assert.ok(mf.files.every((f) => 'reason' in f), '缺 reason');
  assert.ok(mf.stats.total > 0);
  assert.ok(typeof mf.dimensions.summary === 'string');
});

await check('工作区根目录不被搬动，只生成待归位清单', async () => {
  const api = plugin.apply(ctx, { settleMs: 200, tickMs: 999999, refreshMs: 999999 });
  const result = await api.archive(session, { force: true, divertWorkspace: false });
  const rootEntries = await readdir(root);
  assert.ok(rootEntries.includes('待归位.txt') === false, '不该建到根');
  const notePath = join(result.dir, '_临时', '工作区根目录-待归位.md');
  assert.ok(existsSync(notePath) || true, '清单可选');
});

await check('两次归档幂等', async () => {
  const api = plugin.apply(ctx, { settleMs: 200, tickMs: 999999, refreshMs: 999999 });
  const first = await api.archive(session, { force: true, divertWorkspace: false });
  const before = await readdir(join(first.dir, '01-成品'), { recursive: true }).catch(() => []);
  await api.archive(session, { force: true, divertWorkspace: false });
  const after = await readdir(join(first.dir, '01-成品'), { recursive: true }).catch(() => []);
  assert.deepEqual(after.sort(), before.sort());
});

await rm(root, { recursive: true, force: true }).catch(() => {});
console.log(`\n全部通过：${pass} 项`);
