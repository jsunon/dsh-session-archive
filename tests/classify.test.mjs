// 分类流水线单测：node tests/classify.test.mjs
// 覆盖：信号抽取 / 维度打分 / 布局计划 / 文件路由 / 语义命名 / 安全扫描 / 哈希幂等
import assert from 'node:assert/strict';

import { sha256, idempotencyKey, normalizeForHash } from '../lib/hash.js';
import { extractSignals, scoreDimensions, confidenceOf, bucketsFor, describe, DIMENSIONS } from '../lib/dimensions.js';
import { planLayout, BUCKETS, ROOT_FILES } from '../lib/layout.js';
import { routeFile, semanticStem, versionedName, extOf, isCodeFile } from '../lib/router.js';
import { scanText, summarize, redact } from '../lib/safety.js';
import { buildManifest, renderReadme, validateRoot } from '../lib/manifest.js';

let pass = 0;
function check(label, fn) {
  fn();
  pass += 1;
  console.log('  ✓ ' + label);
}

/* ---------------- hash ---------------- */

console.log('classify.test · hash');
check('换行差异不影响哈希', () => {
  assert.equal(sha256('a\r\nb'), sha256('a\nb'));
});
check('行尾空白不影响哈希', () => {
  assert.equal(sha256('a  \nb\t\n'), sha256('a\nb'));
});
check('内容不同则哈希不同', () => {
  assert.notEqual(sha256('let a=1'), sha256('let a=2'));
});
check('幂等键同参同值', () => {
  const k1 = idempotencyKey({ sessionId: 's1', seq: 3, blockNo: 1, content: 'x' });
  const k2 = idempotencyKey({ sessionId: 's1', seq: 3, blockNo: 1, content: 'x' });
  assert.equal(k1, k2);
  const k3 = idempotencyKey({ sessionId: 's1', seq: 4, blockNo: 1, content: 'x' });
  assert.notEqual(k1, k3);
});
check('normalizeForHash 去尾部空行', () => {
  assert.equal(normalizeForHash('a\n\n\n'), 'a');
});

/* ---------------- 维度 ---------------- */

console.log('classify.test · dimensions');

function blocks(list) {
  return list.map((b, i) => ({
    seq: i + 1,
    blockNo: 1,
    lang: b.lang || 'js',
    ext: b.ext || 'js',
    content: b.code,
    beforeText: b.before || '',
  }));
}

check('插件开发会话 → DEV 高分', () => {
  const msgs = [
    { role: '用户', text: '帮我写一个 DSH 插件，要有 package.json 和 lib/index.js' },
    { role: '助手', text: '这是插件实现，主文件 lib/index.js，配置见 package.json。' },
  ];
  const bl = blocks([
    { code: '{"name":"demo-plugin","version":"1.0.0","main":"./lib/index.js"}', ext: 'json', before: 'package.json 内容：' },
    { code: 'export function apply(ctx){ return 1; }\nexport const name="demo";', before: 'lib/index.js：' },
    { code: 'export function helper(){ return 2; }', before: '再补一个组件：' },
    { code: 'export function third(){ return 3; }', before: '模块封装：' },
  ]);
  const { scores, active } = scoreDimensions(extractSignals(msgs, bl, { title: '写一个插件' }));
  assert.ok(scores.DEV >= 40, 'DEV=' + scores.DEV);
  assert.ok(active.includes('DEV'), JSON.stringify(scores));
});

check('纯提问会话 → ASK 命中且不产交付', () => {
  const msgs = [
    { role: '用户', text: 'Cloudflare 邮件路由是什么？和 MX 记录有什么区别？' },
    { role: '助手', text: '邮件路由是把收件地址映射到目的地的规则。'.repeat(20) },
  ];
  const { scores, active } = scoreDimensions(extractSignals(msgs, [], { title: 'Cloudflare邮件路由是什么' }));
  assert.ok(active.includes('ASK'), JSON.stringify(scores));
  assert.ok(scores.DEV < 40, 'DEV 不该高：' + scores.DEV);
});

check('修复会话 → FIX 命中', () => {
  const msgs = [
    { role: '用户', text: '签到不显示了，报错 TypeError: undefined' },
    { role: '助手', text: '定位到 lib/sign.js 里 sign() 返回值没判空，修复如下。' },
  ];
  const bl = blocks([
    { code: 'function sign(){ return null }', before: 'lib/sign.js 原代码' },
    { code: 'function sign(){ return {} }', before: '修复后 lib/sign.js' },
  ]);
  const { scores, active } = scoreDimensions(extractSignals(msgs, bl, { title: '签到未显示问题排查' }));
  assert.ok(active.includes('FIX'), JSON.stringify(scores));
});

check('混合会话同时激活多维度', () => {
  const msgs = [
    { role: '用户', text: '帮我写插件，顺便修一下之前的报错' },
    { role: '助手', text: '先修复 lib/a.js 的崩溃，再封装组件。' },
  ];
  const bl = blocks([
    { code: '{"name":"mix","version":"1.0.0"}', ext: 'json', before: 'package.json' },
    { code: 'export function a(){}', before: 'lib/a.js' },
    { code: 'export function b(){}', before: 'lib/b.js' },
    { code: 'export function c(){}', before: 'lib/c.js' },
  ]);
  const { active } = scoreDimensions(extractSignals(msgs, bl, { title: '开发并修复' }));
  assert.ok(active.length >= 2, '应激活多维：' + active.join(','));
});

check('置信度分档', () => {
  assert.equal(confidenceOf(80), 'high');
  assert.equal(confidenceOf(60), 'medium');
  assert.equal(confidenceOf(50), 'low');
  assert.equal(confidenceOf(10), 'low');
});

check('bucketsFor 去重保序', () => {
  const b = bucketsFor(['DEV', 'FIX']);
  assert.deepEqual(b, ['deliver', 'src', 'tools']);
});

check('describe 不抛错', () => {
  assert.ok(typeof describe({ DEV: 80 }, ['DEV']) === 'string');
  assert.ok(describe({}, []).includes('未识别'));
});

/* ---------------- 布局 ---------------- */

console.log('classify.test · layout');
check('纯提问只建 05-参考 + _临时', () => {
  const plan = planLayout(['ASK']);
  const dirs = plan.buckets.map((b) => b.dir);
  assert.ok(dirs.includes('05-参考'), dirs.join(','));
  assert.ok(!dirs.includes('01-成品'), '不该建成品：' + dirs.join(','));
  assert.ok(dirs.includes('_临时'));
});
check('开发会话建 01/02/03', () => {
  const dirs = planLayout(['DEV']).buckets.map((b) => b.dir);
  assert.ok(dirs.includes('01-成品') && dirs.includes('02-源码') && dirs.includes('03-工具'), dirs.join(','));
});
check('无维度时只有 _临时', () => {
  const plan = planLayout([]);
  assert.equal(plan.buckets.length, 1);
  assert.equal(plan.buckets[0].id, 'trash');
  assert.equal(plan.empty, true);
});
check('桶顺序固定', () => {
  const dirs = planLayout(['DEV', 'ASK']).buckets.map((b) => b.dir);
  assert.equal(dirs[0], '01-成品');
});
check('根目录只允许 4 个文件', () => {
  assert.equal(ROOT_FILES.length, 4);
  assert.ok(validateRoot(['README.md', 'MANIFEST.json', '聊天记录.md', 'session.json']).ok);
  assert.ok(!validateRoot(['README.md', '乱放.js']).ok);
});

/* ---------------- 路由 ---------------- */

console.log('classify.test · router');
check('重复内容 → _临时/重复', () => {
  const hashes = new Map();
  const a = routeFile({ name: 'a.js', content: 'let x=1' }, { active: ['DEV'], existingHashes: hashes });
  const b = routeFile({ name: 'b.js', content: 'let x=1' }, { active: ['DEV'], existingHashes: hashes });
  assert.equal(a.bucket, 'tools');
  assert.equal(b.bucket, 'trash');
  assert.equal(b.subdir, '重复');
  assert.equal(b.deletable, true);
});
check('交付单元 → 01-成品', () => {
  const d = routeFile({ name: 'index.js', content: 'x', isDeliverPart: true }, { active: ['DEV'] });
  assert.equal(d.bucket, 'deliver');
  assert.equal(d.deletable, false);
});
check('含函数定义的脚本 → 03-工具', () => {
  const d = routeFile({ name: 'build.js', content: 'export function build(){ return 1 }' }, { active: ['DEV'] });
  assert.equal(d.bucket, 'tools');
});
check('一次性探测命令 → _临时/探测', () => {
  const d = routeFile({ name: 'probe.sh', content: 'curl -s http://127.0.0.1:8080/health\nnc -zv 10.0.0.1 22\n' }, { active: ['OPS'] });
  assert.equal(d.bucket, 'trash');
  assert.equal(d.subdir, '探测');
});
check('临时前缀文件名 → _临时/探测', () => {
  const d = routeFile({ name: 'tmp-test.js', content: 'console.log(1)' }, { active: ['DEV'] });
  assert.equal(d.bucket, 'trash');
});
check('图片 → 04-产物', () => {
  const d = routeFile({ name: 'pair-qr.png', content: 'x' }, { active: ['DEV'] });
  assert.equal(d.bucket, 'output');
  assert.equal(d.subdir, '长期');
});
check('咨询会话的示例代码 → 05-参考', () => {
  const d = routeFile({ name: 'sample.js', content: 'console.log("hi")' }, { active: ['ASK'] });
  assert.equal(d.bucket, 'ref');
});
check('排错会话里的脚本也算可复用 → 03-工具（不看维度）', () => {
  const d = routeFile({ name: 'fix.js', content: 'export function patch(){ return 1 }' }, { active: ['FIX'] });
  assert.equal(d.bucket, 'tools');
  assert.equal(d.confidence, 'high');
});
check('配置文件 → 03-工具（≥3 行）', () => {
  const d = routeFile({ name: 'nginx.conf', content: 'server {\n  listen 80;\n  root /var/www;\n}' }, { active: ['FIX'] });
  assert.equal(d.bucket, 'tools');
  assert.equal(d.confidence, 'high');
});
check('咨询会话不因配置扩展名抢进工具桶', () => {
  const d = routeFile({ name: 'demo.yml', content: 'a: 1\nb: 2\nc: 3' }, { active: ['ASK'] });
  assert.equal(d.bucket, 'ref');
});

/* ---------------- 语义命名 ---------------- */

console.log('classify.test · naming');
check('首行注释取名', () => {
  const s = semanticStem({ code: '// 会话归档 · 命名规则\nexport const x = 1' }, {});
  assert.ok(s.includes('会话归档'), s);
});
check('注释里写了路径 → 用真文件名，不压成 C-Users-…', () => {
  const B = String.fromCharCode(92);
  const code = `# C:${B}Users${B}example${B}.dsh${B}cordis.patch.yml 追加\n- id: x`;
  assert.equal(semanticStem({ code }, {}), 'cordis.patch');
});
check('注释是整句说明 → 不拿来当文件名，宁可兜底', () => {
  const s = semanticStem({ code: '# 每天早 9 点，把磁盘和内存情况发到 Telegram\n0 9 * * * df -h' }, { seq: 74, blockNo: 1 });
  assert.equal(s, '片段-074-01', s);
});
check('正文是对话整句 → 不拿来当文件名', () => {
  const s = semanticStem({ code: 'echo hi' }, { beforeText: '每天早 9 点，把磁盘和内存情况发到 Telegram', seq: 9, blockNo: 3 });
  assert.equal(s, '片段-009-03', s);
});
check('正文是短标签 → 当名字用', () => {
  assert.equal(semanticStem({ code: 'echo hi' }, { beforeText: '重启前先记录当前状态' }), '重启前先记录当前状态');
});
check('正文里提到文件名 → 优先用那个文件名', () => {
  assert.equal(semanticStem({ code: 'echo hi' }, { beforeText: '把下面的内容写进 cordis.patch.yml' }), 'cordis.patch');
});
check('注释里的 POSIX 路径 → 取末段主干', () => {
  assert.equal(semanticStem({ code: '# /etc/nginx/nginx.conf\nserver {}' }, {}), 'nginx');
});
check('函数名取名', () => {
  const s = semanticStem({ code: 'export function buildName(input) {\n  return 1;\n}' }, {});
  assert.equal(s, 'buildName');
});
check('兜底序号取名', () => {
  const s = semanticStem({ code: 'const a = 1' }, { seq: 7, blockNo: 2 });
  assert.equal(s, '片段-007-02');
});
check('版本号不用 -2', () => {
  assert.equal(versionedName('a.js', 2), 'a.v2.js');
  assert.equal(versionedName('a.js', 1), 'a.js');
  assert.equal(versionedName('Dockerfile', 3), 'Dockerfile.v3');
});
check('扩展名与代码判定', () => {
  assert.equal(extOf('a/b.JS'), 'js');
  assert.ok(isCodeFile('lib/index.mjs'));
  assert.ok(isCodeFile('Dockerfile'));
  assert.ok(!isCodeFile('photo.png'));
});

/* ---------------- 安全扫描 ---------------- */

console.log('classify.test · safety');
check('OpenAI key 命中 block', () => {
  const f = scanText('const k = "sk-FIXTURE-NOT-A-REAL-KEY-0000";');
  const s = summarize(f);
  assert.ok(!s.ok, '应阻断');
  assert.ok(s.blocking.some((x) => x.rule === 'openai-key'));
});
check('私钥命中 block', () => {
  const s = summarize(scanText('-----BEGIN RSA PRIVATE KEY-----\nFIXTURE-NOT-A-REAL-KEY\n-----END RSA PRIVATE KEY-----'));
  assert.ok(!s.ok);
});
check('GitHub token 命中 block', () => {
  const s = summarize(scanText('ghp_FIXTURENOTAREALKEY000000000000'));
  assert.ok(!s.ok);
});
check('Windows 路径只 warn', () => {
  const s = summarize(scanText('path = "D:\\\\deepseek harness\\\\work"'));
  assert.ok(s.ok, '不该阻断');
  assert.ok(s.warning.length > 0);
});
check('内网 IP 只 warn', () => {
  const s = summarize(scanText('host=192.168.1.10'));
  assert.ok(s.ok);
  assert.ok(s.warning.some((x) => x.rule === 'private-ip'));
});
check('干净文本通过', () => {
  const s = summarize(scanText('export function hello() { return "world"; }'));
  assert.ok(s.ok);
  assert.equal(s.total, 0);
});
check('打码保留首尾', () => {
  const r = redact('sk-FIXTURE-NOT-A-KEY');
  assert.ok(r.startsWith('sk-F'));
  assert.ok(r.includes('***'));
  assert.ok(!r.includes('TURE-NOT'));
});

/* ---------------- 清单 ---------------- */

console.log('classify.test · manifest');
check('MANIFEST 结构完整', () => {
  const m = buildManifest({
    sessionId: 's1',
    name: '【开发-demo】',
    workspace: 'W',
    dir: 'D',
    scores: { DEV: 80 },
    active: ['DEV'],
    buckets: planLayout(['DEV']).buckets,
    files: [{ path: '01-成品/demo/a.js', bucket: 'deliver', sha256: 'x', size: 10 }],
  });
  assert.equal(m.version, 1);
  assert.equal(m.dimensions.active[0], 'DEV');
  assert.equal(m.stats.total, 1);
  assert.ok(m.layout.length >= 3);
});
check('README 含判定表与可删清单', () => {
  const m = buildManifest({
    sessionId: 's1', name: '【开发-demo】', scores: { DEV: 80 }, active: ['DEV'],
    buckets: planLayout(['DEV']).buckets,
    files: [
      { path: '03-工具/a.js', bucket: 'tools', confidence: 'high' },
      { path: '_临时/重复/b.js', bucket: 'trash', confidence: 'high', deletable: true },
    ],
  });
  m.reasons = { DEV: ['L1 manifest_file(package.json)'] };
  const md = renderReadme(m);
  assert.ok(md.includes('会话类型判定'), '缺判定表');
  assert.ok(md.includes('开发'), '缺维度名');
  assert.ok(md.includes('可直接删除'), '缺可删清单');
  assert.ok(md.includes('_临时/'), '缺目录约定');
});
check('README 未识别维度时给提示', () => {
  const m = buildManifest({ sessionId: 's', name: 'n', scores: {}, active: [], buckets: planLayout([]).buckets, files: [] });
  const md = renderReadme(m);
  assert.ok(md.includes('未识别'), md.slice(0, 400));
});

/* ---------------- 维度表自检 ---------------- */

console.log('classify.test · 维度表');
check('每个维度的桶都在 BUCKETS 里', () => {
  for (const dim of DIMENSIONS) {
    for (const b of dim.buckets) {
      assert.ok(BUCKETS[b], `${dim.id} 指向未知桶 ${b}`);
    }
  }
});
check('维度 id 唯一', () => {
  const ids = DIMENSIONS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
});

console.log(`\n全部通过：${pass} 项`);
