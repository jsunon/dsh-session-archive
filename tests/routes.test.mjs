// 离线验证：mock 宿主，看插件注册了哪些 HTTP 路由、配置键是否齐全
//
// 这个测试存在的理由：宿主是否加载了新代码，光看 /api/health 返回 200 是看不出来的
// （曾经它 200 但返回的仍是旧配置）。这里不启动宿主，直接调 apply()，
// 断言「新代码会注册哪些路由」——不重启也能确认新版会不会生效。
import { readFileSync } from 'node:fs';
import * as fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apply } from '../lib/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const libDir = join(here, '..', 'lib');

let pass = 0;
let fail = 0;
const check = (name, fn) => {
  try {
    fn();
    pass += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    fail += 1;
    console.log(`  ✗ ${name}`);
    console.log(`      ${(error && error.message) || error}`);
  }
};

const routes = [];
const mockCtx = {
  on() { return () => {}; },
  inject(_deps, fn) {
    const host = {
      webServer: {
        register({ kind, path, handler }) {
          routes.push({ kind, path, handler });
          return () => {};
        },
      },
    };
    try { fn(host); } catch (e) { console.log('inject 抛错:', e.message); }
    return () => {};
  },
  logger: { info() {}, warn() {}, error() {}, debug() {} },
  effect() { return () => {}; },
  setInterval() { return () => {}; },
  setTimeout() { return () => {}; },
};

apply(mockCtx, {});

const paths = routes.map((r) => r.path);
console.log(`注册路由 ${routes.length} 条：`);
for (const r of routes) console.log('  ' + r.path);

for (const need of ['/api/health', '/api/state', '/api/plan', '/api/override']) {
  check(`注册了 ${need}`, () => {
    if (!paths.some((p) => p.endsWith(need))) throw new Error('未注册，路径表：' + paths.join(', '));
  });
}

check('每条路由都带 handler', () => {
  const bad = routes.filter((r) => typeof r.handler !== 'function').map((r) => r.path);
  if (bad.length) throw new Error('缺 handler：' + bad.join(', '));
});

// 回归：曾经 lib/index.js 调了 planLayout() 却没 import，导致 /api/plan 每行都报
// 「planLayout is not defined」，而路由本身注册成功——只看路由表是抓不到的。
// 这里做一次轻量静态检查：凡是源码里用到的 ./layout.js 导出，必须真的在 import 列表里。
check('pipeline.js 导出了 resolveActive（plan 路由要用它读覆盖锁）', () => {
  const src = readFileSync(join(libDir, 'pipeline.js'), 'utf8');
  if (src.indexOf('resolveActive') < 0 || src.indexOf('export {') < 0) throw new Error('resolveActive 未导出');
});

check('plan 路由把 override 传给 resolveActive（否则锁定维度在试运行里不生效）', () => {
  const src = readFileSync(join(libDir, 'index.js'), 'utf8');
  if (src.split('resolveActive(analysis,').length < 2) throw new Error('plan 路由没接 override');
  if (!/entry.override/.test(src)) throw new Error('plan 路由没读 entry.override');
});

check('lib/index.js 用到的 layout.js 导出都已 import', () => {
  const layoutSrc = readFileSync(join(libDir, 'layout.js'), 'utf8');
  const exported = [...layoutSrc.matchAll(/export\s+(?:const|function|async function|let)\s+([A-Za-z_$][\w$]*)/g)]
    .map((m) => m[1]);
  const source = readFileSync(join(libDir, 'index.js'), 'utf8');
  const m = source.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/layout\.js'/);
  if (!m) throw new Error("找不到 import ... from './layout.js'");
  const imported = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
  const used = exported.filter((name) => source.includes(name + '(') || source.includes(name + '.') || source.includes(name + '{'));
  const missing = used.filter((name) => !imported.includes(name));
  if (missing.length) throw new Error('用了但没 import：' + missing.join(', '));
  if (!used.length) throw new Error('没检出任何 layout.js 导出被使用，检查规则可能失效');
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
if (fail) process.exitCode = 1;
check('settings-page 模块已接线', () => {
  const idx = fs.readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8');
  if (!idx.includes("import { settingsPage } from './settings-page.js'")) throw new Error('index.js 必须导入 settingsPage');
  if (idx.split('settingsPage(cfg(), state, API)').length < 2) throw new Error('设置页路由必须传 API 前缀');
  const sp = fs.readFileSync(new URL('../lib/settings-page.js', import.meta.url), 'utf8');
  if (!sp.includes('export function settingsPage')) throw new Error('settings-page.js 必须导出 settingsPage');
  if (!sp.includes('Session Archive · Settings')) throw new Error('英文字符串表必须存在');
  if (!sp.includes('会话归档 · 设置')) throw new Error('中文字符串表必须存在');
});
