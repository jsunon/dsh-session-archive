// 命名规则单测：node tests/naming.test.mjs
import assert from 'node:assert/strict';
import { buildName, classify, cleanSegment, fallbackName, safeDirName, uniqueName } from '../lib/naming.js';

const now = new Date(2026, 9, 26, 15, 23, 0);
let pass = 0;
function check(label, fn) {
  fn();
  pass += 1;
  console.log('  ✓ ' + label);
}

console.log('naming.test');
check('开发类：写脚本会话带上【开发-…】', () => {
  const n = buildName({ title: '批量重命名图片的 Python 脚本', firstUserText: '帮我写一个脚本', now });
  assert.ok(n.startsWith('【开发-'), n);
  assert.ok(Array.from(n).length >= 15 && Array.from(n).length <= 30, n + ' len=' + Array.from(n).length);
});

check('文案类', () => {
  const n = buildName({ title: '小红书种草文案：夏季防晒喷雾', firstUserText: '写几条文案', now });
  assert.ok(n.startsWith('【文案-'), n);
  assert.ok(Array.from(n).length <= 30, n);
});

check('方案类', () => {
  const n = buildName({ title: '门店私域运营方案复盘', firstUserText: '做个方案', now });
  assert.ok(n.startsWith('【方案-'), n);
});

check('调试类', () => {
  const n = buildName({ title: '插件报错排查：启动时崩溃', firstUserText: '帮我看看报错', now });
  assert.ok(n.startsWith('【调试-'), n);
});

check('非法字符被清理', () => {
  const n = buildName({ title: '导出报表/命名:规则*测试?"<>|', firstUserText: 'x', now });
  assert.ok(!/[\\/:*?"<>|]/.test(n), n);
});

check('超长标题被截到 30 字以内', () => {
  const long = '开发一个自动整理发票并按照月份与供应商归类的命令行工具并且附带图形界面与安装脚本';
  const n = buildName({ title: long, firstUserText: long, now });
  assert.ok(Array.from(n).length <= 30, n + ' len=' + Array.from(n).length);
});

check('缺标题时用首条用户消息提炼', () => {
  const n = buildName({ title: '', firstUserText: '帮我做一个 Excel 自动汇总脚本', now });
  assert.ok(n.includes('Excel') || n.includes('脚本'), n);
});

check('完全无内容时兜底 会话_日期时间', () => {
  const n = buildName({ title: '', firstUserText: '', now });
  assert.equal(n, '会话_20261026_1523');
  assert.equal(fallbackName(now), '会话_20261026_1523');
});

check('保留名/尾点处理', () => {
  assert.equal(safeDirName('CON'), 'CON_');
  assert.ok(!safeDirName('标题...').endsWith('.'));
});

check('同类不同会话不共用名字', () => {
  const taken = new Set(['【开发-写脚本】']);
  const n = uniqueName('【开发-写脚本】', taken);
  assert.notEqual(n, '【开发-写脚本】');
});

check('分类器优先级', () => {
  assert.equal(classify('调试这个插件报错').kind, '调试');
  assert.equal(classify('写一个抓取数据的脚本').kind, '开发');
});

check('cleanSegment 去 markdown 噪点', () => {
  assert.equal(cleanSegment('**加粗** `代码`'), '加粗 代码');
});

console.log(`\n通过 ${pass} 项`);
