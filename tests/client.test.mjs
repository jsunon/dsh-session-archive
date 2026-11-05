// 浏览器半区单测：node tests/client.test.mjs
// 在 Node 里桩出 window.__ModuleLoader__ 与最小 require 表，验证 lib/client.js
// 的模块形态、slot 注册、以及不越界 require（只能要浏览器模块表里的东西）。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const here = new URL('.', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('../package.json', here), 'utf8'));
const source = await readFile(new URL('../lib/client.js', here), 'utf8');

let pass = 0;
function check(label, fn) {
  return Promise.resolve(fn()).then(() => {
    pass += 1;
    console.log('  ✓ ' + label);
  });
}

// 浏览器模块表（PLATFORM_MODULES）里真实存在的同步键
const PLATFORM_KEYS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]);

const requested = [];

// 最小 React 桩：只要求组件能定义、能被调用，不渲染
const noop = () => null;
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'Fragment',
  useState: (init) => [typeof init === 'function' ? init() : init, noop],
  useEffect: noop,
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useRef: (v) => ({ current: v }),
  useReducer: (_r, init) => [init, noop],
  createContext: (v) => ({ Provider: noop, Consumer: noop, _currentValue: v }),
  useContext: (c) => c._currentValue,
  memo: (c) => c,
  forwardRef: (c) => c,
  Children: { map: (kids) => kids, toArray: (kids) => kids },
};

function fakeRequire(spec) {
  requested.push(spec);
  if (PLATFORM_KEYS.has(spec)) {
    if (spec === 'react') return reactStub;
    if (spec === 'react/jsx-runtime') return { jsx: reactStub.createElement, jsxs: reactStub.createElement, Fragment: 'Fragment' };
    if (spec === 'react-dom') return { createPortal: noop, flushSync: (fn) => fn() };
    if (spec === 'react-dom/client') return { createRoot: () => ({ render: noop, unmount: noop }) };
    return {};
  }
  throw new Error(`client-modules: require("${spec}") missed the module table`);
}
fakeRequire.resolve = () => '';
fakeRequire.asset = () => '';

let registration;
const g = globalThis;
g.window = g.window || {};
g.window.__ModuleLoader__ = {
  load(entry) {
    registration = entry;
    return entry;
  },
};

await import(new URL('../lib/client.js', here).href);

console.log('client.test');

await check('以 window.__ModuleLoader__.load 形态注册', () => {
  assert.ok(registration, '没有调用 __ModuleLoader__.load');
  assert.equal(registration.id, pkg.name);
  assert.equal(typeof registration.factory, 'function');
});

const mod = registration.factory(fakeRequire);

await check('导出 name / inject / apply', () => {
  assert.equal(mod.name, pkg.name);
  assert.deepEqual(mod.inject, ['slots', 'locale']);
  assert.equal(typeof mod.apply, 'function');
});

await check('只 require 浏览器模块表里的模块', () => {
  const bad = requested.filter((s) => !PLATFORM_KEYS.has(s));
  assert.deepEqual(bad, [], `越界 require：${bad.join(', ')}`);
});

await check('apply 注册 sidebar.panellist / main / plugins.bundle.config', () => {
  const registered = [];
  const ctx = {
    effect(fn) {
      return fn();
    },
    locale: {
      register() {},
      bind: () => (key) => key,
      subscribe: () => () => {},
    },
    slots: {
      inject(name, fn) {
        assert.ok(typeof name === 'string' && name.length > 0, 'inject 名字为空');
        fn();
      },
      register(options, component) {
        registered.push({ options, component });
        return () => {};
      },
    },
  };
  mod.apply(ctx);
  const names = registered.map((r) => r.options.name).sort();
  assert.deepEqual(names, ['main', 'plugins.bundle.config', 'sidebar.panellist']);
  for (const row of registered) {
    assert.equal(typeof row.component, 'function', `${row.options.name} 组件不是函数`);
  }
  const main = registered.find((r) => r.options.name === 'main');
  assert.equal(main.options.key, pkg.name, 'main 的 key 必须等于包名之外的稳定 panel id');
  const card = registered.find((r) => r.options.name === 'plugins.bundle.config');
  assert.equal(card.options.key, pkg.name, 'plugins.bundle.config 的 key 必须等于包名');
  const bar = registered.find((r) => r.options.name === 'sidebar.panellist');
  assert.equal(bar.options.id, pkg.name);
  assert.equal(typeof bar.options.label, 'function', 'label 应是函数以便随语言切换');
});

await check('apply 在 ctx 残缺时不抛错（不能拖垮整页启动）', () => {
  const broken = {};
  assert.doesNotThrow(() => mod.apply(broken));
});

await check('package.json 声明了 dsh.client 与 ./client 导出', () => {
  assert.equal(pkg.exports['./client'], './lib/client.js');
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.ok(Array.isArray(pkg.dsh.client.inject) && pkg.dsh.client.inject.length > 0);
  for (const dep of pkg.dsh.client.inject) {
    assert.ok(
      !['@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives'].includes(dep),
      `${dep} 是安装内置包，不该写进 inject`,
    );
  }
});

await check('bundle 里不出现 ES module 语法', () => {
  assert.ok(!/^\s*import\s/m.test(source), '不该有 import 语句');
  assert.ok(!/^\s*export\s/m.test(source), '不该有 export 语句');
  assert.ok(!source.includes('https://cdn'), '不该引 CDN');
});

console.log(`\n全部通过：${pass} 项`);
