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

// 浏览器里 fetch 是相对 URL 也能用的；Node 的 fetch 会因相对路径抛错。
// 这里给一个最小桩，顺带记录调用，验证开关会回报状态但不依赖网络。
const fetchCalls = [];
g.fetch = (url, init) => {
  fetchCalls.push({ url, init });
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve('{"ok":true}'),
  });
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

// 侧边栏开关：关掉要能注销 entry，打开要能重新注册且不重复
function sidebarHarness() {
  const live = new Map(); // entryKey -> options（list 槽看 id，keyed 槽看 key）
  const log = [];
  const keyOf = (options) => options.name + '::' + (options.id !== undefined ? options.id : options.key);
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
        fn();
      },
      register(options) {
        const slotKey = keyOf(options);
        if (live.has(slotKey)) {
          throw new Error(`slot "${options.name}" already has an entry with id "${options.id}"`);
        }
        live.set(slotKey, options);
        log.push('register:' + slotKey);
        return () => {
          live.delete(slotKey);
          log.push('dispose:' + slotKey);
        };
      },
    },
  };
  return { ctx, live, log };
}

await check('侧边栏开关：entry 常驻，不重复注册也不中途注销', () => {
  const { ctx, live, log } = sidebarHarness();
  const barKey = 'sidebar.panellist::' + pkg.name;
  mod.apply(ctx);
  assert.ok(live.has(barKey), 'apply 后应注册侧边栏入口');

  // 组件内部通过 useSettings().patch 触发；这里直接驱动模块级开关函数
  const toggle = mod.__test && mod.__test.applySidebarVisibility;
  assert.equal(typeof toggle, 'function', 'bundle 应暴露 __test.applySidebarVisibility 供测试驱动');

  toggle(false);
  assert.ok(live.has(barKey), '关掉后 entry 仍要保留（靠样式隐藏整行）');

  toggle(false);
  assert.ok(live.has(barKey), '重复关闭不应抛错');

  toggle(true);
  assert.ok(live.has(barKey), '重新打开仍是同一个 entry');

  toggle(true);
  assert.equal(
    log.filter((item) => item === 'register:' + barKey).length,
    1,
    '全程只注册一次，重复开关不应重复注册',
  );

  // 持久化关闭要能扛住重启：sync 之后 entry 依然在，可见性标记为 false
  mod.__test.syncSidebarFromOptions({ showSidebarEntry: false });
  assert.ok(live.has(barKey), 'syncSidebarFromOptions(false) 也要保留 entry');
  assert.equal(mod.__test.isSidebarVisible(), false, '关闭态应记录为不可见');
  mod.__test.syncSidebarFromOptions({ showSidebarEntry: true });
  assert.equal(mod.__test.isSidebarVisible(), true, '打开态应记录为可见');
});

await check('SWITCHES 里包含 showSidebarEntry（配置卡能渲染它）', () => {
  assert.ok(source.includes("['showSidebarEntry', 'group.basic']"), 'SWITCHES 缺少 showSidebarEntry');
  assert.ok(source.includes("'sw.showSidebarEntry'"), '缺少 showSidebarEntry 的语言文案');
});

await check('关掉侧边栏时还有一条样式兜底（不依赖 dispose 时机）', () => {
  assert.ok(source.includes('data-dsa-sidebar-entry'), 'glyph 缺少标记属性');
  assert.ok(source.includes('button:has([data-dsa-sidebar-entry])'), '缺少隐藏侧边栏行的兜底样式');
  assert.ok(source.includes("var HIDE_STYLE_ID = 'dsa-hide-sidebar-entry'"), '缺少样式节点 id');
  const fn = source.slice(source.indexOf('function applySidebarVisibility'));
  const body = fn.slice(0, fn.indexOf('function syncSidebarFromOptions'));
  // entry 必须一直保留：行是宿主的 <button>，只有 glyph 在里面；
  // 一旦注销，行会退化成「空 glyph + 文字」，兜底样式就命不中了。
  assert.ok(body.includes('registerSidebar()'), '开关路径应始终确保 entry 已注册');
  assert.ok(!body.includes('unregisterSidebar()'), '开关路径不该注销 entry（会让兜底样式失效）');
  assert.ok(body.includes('sidebarRowStyle(!sidebarVisible)'), '兜底样式应跟随可见性取反');
});

await check('侧边栏开关一点就落盘（避免另一份设置表单把状态读回来）', () => {
  const patchBody = source.slice(source.indexOf('var patch = useCallback'));
  const body = patchBody.slice(0, patchBody.indexOf('var save = useCallback'));
  assert.ok(body.includes("key === 'showSidebarEntry'"), 'patch 里没有处理 showSidebarEntry');
  assert.ok(body.includes('applySidebarVisibility'), 'patch 没有即时应用可见性');
  assert.ok(
    body.includes("request('/config', { method: 'POST', body: { showSidebarEntry: value !== false } })"),
    'patch 没有把 showSidebarEntry 立刻写回服务端',
  );
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
