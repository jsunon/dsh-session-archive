/**
 * 设置面板（中文 / English 二选一）。
 *
 * 设计要点：
 * - 语言是**互斥**的：点「中文」整页就是中文，点「English」整页就是英文，
 *   不存在中英混排（曾经有过「中英对照」模式，实际用起来很吵，已移除）。
 * - 切换是**就地重绘**：不刷新、不跳页、不回到顶部，滚动位置原样保留。
 * - 选择记在 localStorage["dsh-session-archive-lang"]，下次打开还是这个语言。
 * - 默认跟随浏览器语言：navigator.language 以 zh 开头 → 中文，其余 → English。
 *
 * 为什么单独成文件：index.js 已经 1200 多行，把一整个 HTML 页面塞在里面
 * 会让真正需要读的落盘逻辑淹没在模板字符串里。
 */

const STRINGS = {
  zh: {
    title: '会话归档 · 设置',
    hint: '每条会话在<strong>工作区根目录</strong>生成 <code>【类目-摘要】/</code>，内部按产出维度分桶。<strong>空桶不建</strong>：纯提问会话只有 <code>05-参考/</code> 与 <code>_临时/</code>。以下改动立即生效并持久化。',
    tree: [
      '【类目-摘要】/',
      '├── README.md          ← 会话类型、产物清单、哪些能删',
      '├── MANIFEST.json      ← 每个文件为什么在这里',
      '├── 聊天记录.md',
      '├── session.json',
      '├── 01-成品/           ← 只读导出，唯一可 git push',
      '├── 02-源码/           ← 唯一可写真源（原始 / 补丁 / 快照）',
      '├── 03-工具/           ← 可复用脚本',
      '├── 04-产物/           ← 非代码产出（长期 / 一次性）',
      '├── 05-参考/           ← 外部资料与结论',
      '└── _临时/             ← 整个删掉零影响（重复 / 未归类 / 失败尝试 / 探测）',
    ].join('\n'),
    hBasic: '基础',
    hSafety: '安全与整洁',
    hNaming: '命名',
    hContent: '内容',
    enabled: ['启用自动归档', ''],
    structured: ['结构化分类（按维度建桶）', '关闭后退回旧版平铺，所有文件扔在会话根'],
    extractCode: ['把代码块提取为独立文件', '关闭则代码只留在聊天日志里'],
    extractLongText: ['把非代码长文本也单独存成文件', ''],
    writeManifest: ['写 README.md + MANIFEST.json 审计链', ''],
    safetyScan: ['开源前安全扫描', '密钥 / 私钥 / 绝对路径 / 内网地址；命中高危则标红不可发布'],
    dedupeByHash: ['内容去重（sha256）', '相同内容不再产生 -2 副本，第二份进 _临时/重复/'],
    strictRoot: ['严格根目录', '会话根只允许 4 个文件，其余强制归桶'],
    divertWorkspaceFiles: ['工作区散文件自动分流', '结构化模式已内置归位，通常无需开启'],
    absorbWorkspaceRoot: ['收纳工作区根目录', '结构化模式此项失效：永不动工作区根，只生成待归位清单'],
    nameTemplate: '命名模板（支持 {kind} {summary} {date} {time}）',
    minChars: '名字最短字数',
    maxChars: '名字最长字数',
    blacklist: '黑名单关键词（逗号或换行分隔，命中则不新建文件夹）',
    compressAfter: '自动压缩：超过多少条后把旧记录转入历史文件（0=关闭）',
    cleanupHistoryDays: '自动清理：历史文件保留天数（0=永久保留）',
    save: '保存设置',
    plan: '试运行（只看分类，不写盘）',
    archiveAll: '立即归档全部会话',
    state: '查看已归档会话',
    selftest: '运行自检（临时目录）',
    out: '状态输出',
  },
  en: {
    title: 'Session Archive · Settings',
    hint: 'Each session gets one folder <code>【kind-summary】/</code> at the <strong>workspace root</strong>, bucketed by output dimension. <strong>Empty buckets are never created</strong>: a pure Q&amp;A session only has <code>05-reference/</code> and <code>_trash/</code>. Changes apply immediately and persist.',
    tree: [
      '【kind-summary】/',
      '├── README.md          ← session type, artifact list, what can be deleted',
      '├── MANIFEST.json      ← why each file is here',
      '├── 聊天记录.md         ← chat transcript',
      '├── session.json',
      '├── 01-deliver/        ← read-only export, the only bucket to git push',
      '├── 02-source/         ← the only writable source of truth (original / patch / snapshot)',
      '├── 03-tools/          ← reusable scripts',
      '├── 04-output/         ← non-code output (long-lived / one-off)',
      '├── 05-reference/      ← external material and conclusions',
      '└── _trash/            ← delete entirely, zero impact (dupes / unsorted / failed / probes)',
    ].join('\n'),
    hBasic: 'Basics',
    hSafety: 'Safety & tidiness',
    hNaming: 'Naming',
    hContent: 'Content',
    enabled: ['Enable session archive', ''],
    structured: ['Structured layout (one bucket per dimension)', 'Off falls back to the legacy flat layout: every file sits in the session root'],
    extractCode: ['Extract code blocks into separate source files', 'Off keeps code only inside the chat log'],
    extractLongText: ['Save long non-code text blocks as output files', ''],
    writeManifest: ['Write README.md + MANIFEST.json audit trail', ''],
    safetyScan: ['Pre-publish safety scan', 'Keys / private keys / absolute paths / internal addresses; a high-severity hit blocks publishing'],
    dedupeByHash: ['Content dedupe (sha256)', 'Identical content never becomes a -2 copy; the second one goes to _trash/dupes/'],
    strictRoot: ['Strict root', 'The session root allows only 4 files; everything else is forced into a bucket'],
    divertWorkspaceFiles: ['Sort loose workspace files automatically', 'Structured mode already routes them; usually unnecessary'],
    absorbWorkspaceRoot: ['Absorb workspace root', 'Inactive in structured mode: the workspace root is never touched, only a to-sort list is written'],
    nameTemplate: 'Name template (supports {kind} {summary} {date} {time})',
    minChars: 'Minimum name length',
    maxChars: 'Maximum name length',
    blacklist: 'Blacklist keywords (comma or newline separated; a match skips folder creation)',
    compressAfter: 'Auto-compress: move older entries to a history file after N messages (0 = off)',
    cleanupHistoryDays: 'Auto-cleanup: keep history files for N days (0 = forever)',
    save: 'Save settings',
    plan: 'Dry run (classify only, write nothing)',
    archiveAll: 'Archive all sessions now',
    state: 'View archived sessions',
    selftest: 'Run self-test (temp dir)',
    out: 'Status output',
  },
};

/** 单个开关的 label HTML（服务端预渲染用；浏览器端会按语言重绘）。 */
function labelHtml(pair, lang) {
  const [main, sub] = STRINGS[lang][pair];
  return sub ? `${main}<small>${sub}</small>` : main;
}

const plainHtml = (key, lang) => STRINGS[lang][key];

export function settingsPage(options, state, apiBase) {
  const opt = JSON.stringify(options, null, 2);

  const sw = (id, key) =>
    `<div class="switch"><input type="checkbox" id="${id}"><label for="${id}" style="margin:0" data-sw="${key}">${labelHtml(key, 'zh')}</label></div>`;

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${plainHtml('title', 'zh')}</title>
<style>
 body{font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif;margin:0;background:#f6f7f9;color:#1c1f23}
 main{max-width:880px;margin:32px auto;padding:24px 28px;background:#fff;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.06)}
 h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:26px 0 6px;padding-top:14px;border-top:1px solid #eceef2}
 p.hint{color:#6b7280;margin:0 0 18px}
 label{display:block;font-weight:600;margin:18px 0 6px}
 input[type=text],input[type=number],textarea{width:100%;padding:9px 11px;border:1px solid #d6dae1;border-radius:9px;font:inherit;box-sizing:border-box}
 textarea{min-height:76px;resize:vertical}
 .row{display:flex;gap:16px;flex-wrap:wrap}.row>div{flex:1 1 220px}
 .switch{display:flex;align-items:flex-start;gap:8px;font-weight:600;margin:12px 0}
 .switch small{font-weight:400;color:#6b7280;display:block}
 .actions{display:flex;gap:10px;margin-top:22px;flex-wrap:wrap}
 button{padding:10px 16px;border-radius:10px;border:1px solid #d6dae1;background:#fff;font:inherit;cursor:pointer}
 button.primary{background:#2563eb;border-color:#2563eb;color:#fff}
 pre{margin:0;background:#0f172a;color:#e5e7eb;padding:14px;border-radius:10px;overflow:auto;font-size:12px;max-height:340px}
 code{background:#eef2ff;padding:1px 5px;border-radius:5px;font-size:12px}
 .tree{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre;overflow:auto}
 small{color:#6b7280}
 .langbar{display:flex;gap:6px;justify-content:flex-end;margin:0 0 14px}
 .langbar button{padding:6px 14px;font-size:13px;border-radius:8px;min-width:88px}
 .langbar button.on{background:#1c1f23;border-color:#1c1f23;color:#fff}
</style></head><body><main>
<div class="langbar">
  <button type="button" data-lang="zh">中文</button>
  <button type="button" data-lang="en">English</button>
</div>

<h1 data-t="title">${plainHtml('title', 'zh')}</h1>
<p class="hint" data-t="hint">${plainHtml('hint', 'zh')}</p>

<div class="tree" id="tree">${plainHtml('tree', 'zh')}</div>

<h2 data-t="hBasic">${plainHtml('hBasic', 'zh')}</h2>
${sw('enabled', 'enabled')}
${sw('structured', 'structured')}
${sw('extractCode', 'extractCode')}
${sw('extractLongText', 'extractLongText')}
${sw('writeManifest', 'writeManifest')}

<h2 data-t="hSafety">${plainHtml('hSafety', 'zh')}</h2>
${sw('safetyScan', 'safetyScan')}
${sw('dedupeByHash', 'dedupeByHash')}
${sw('strictRoot', 'strictRoot')}
${sw('divertWorkspaceFiles', 'divertWorkspaceFiles')}
${sw('absorbWorkspaceRoot', 'absorbWorkspaceRoot')}

<h2 data-t="hNaming">${plainHtml('hNaming', 'zh')}</h2>
<label for="template" data-t="nameTemplate">${plainHtml('nameTemplate', 'zh')}</label>
<input type="text" id="template" placeholder="【{kind}-{summary}】">
<div class="row">
  <div><label for="minChars" data-t="minChars">${plainHtml('minChars', 'zh')}</label><input type="number" id="minChars" min="6" max="40"></div>
  <div><label for="maxChars" data-t="maxChars">${plainHtml('maxChars', 'zh')}</label><input type="number" id="maxChars" min="10" max="80"></div>
</div>

<h2 data-t="hContent">${plainHtml('hContent', 'zh')}</h2>
<label for="blacklist" data-t="blacklist">${plainHtml('blacklist', 'zh')}</label>
<textarea id="blacklist"></textarea>
<div class="row">
  <div><label for="compressAfter" data-t="compressAfter">${plainHtml('compressAfter', 'zh')}</label><input type="number" id="compressAfter" min="0"></div>
  <div><label for="cleanupHistoryDays" data-t="cleanupHistoryDays">${plainHtml('cleanupHistoryDays', 'zh')}</label><input type="number" id="cleanupHistoryDays" min="0"></div>
</div>

<div class="actions">
  <button type="button" class="primary" id="save" data-t="save">${plainHtml('save', 'zh')}</button>
  <button type="button" id="planBtn" data-t="plan">${plainHtml('plan', 'zh')}</button>
  <button type="button" id="archiveAll" data-t="archiveAll">${plainHtml('archiveAll', 'zh')}</button>
  <button type="button" id="stateBtn" data-t="state">${plainHtml('state', 'zh')}</button>
  <button type="button" id="testBtn" data-t="selftest">${plainHtml('selftest', 'zh')}</button>
</div>

<label style="margin-top:24px" data-t="out">${plainHtml('out', 'zh')}</label>
<pre id="out">${opt.replace(/</g, '&lt;')}</pre>
</main>
<script>
(function(){
"use strict";
var API = ${JSON.stringify(apiBase)};
var BOOLS = ["enabled","structured","extractCode","extractLongText","writeManifest","safetyScan","dedupeByHash","strictRoot","divertWorkspaceFiles","absorbWorkspaceRoot"];
var STR = ${JSON.stringify(STRINGS)};
var KEY = "dsh-session-archive-lang";

var out = document.getElementById("out");
function show(v){ out.textContent = typeof v === "string" ? v : JSON.stringify(v, null, 2); }

function pickLang(){
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { saved = null; }
  if (saved === "zh" || saved === "en") return saved;
  return /^zh/i.test(navigator.language || "") ? "zh" : "en";
}
var LANG = pickLang();

/* 把整页文字换成目标语言：就地重绘，保持滚动位置，不刷新。 */
function applyLang(lang){
  LANG = lang === "en" ? "en" : "zh";
  var y = window.pageYOffset || document.documentElement.scrollTop || 0;

  var S = STR[LANG];
  document.documentElement.lang = LANG === "en" ? "en" : "zh-CN";
  document.title = S.title;

  var nodes = document.querySelectorAll("[data-t]");
  for (var i = 0; i < nodes.length; i++) {
    var k = nodes[i].getAttribute("data-t");
    if (typeof S[k] === "string") nodes[i].innerHTML = S[k];
  }

  var sws = document.querySelectorAll("[data-sw]");
  for (var j = 0; j < sws.length; j++) {
    var p = STR[LANG][sws[j].getAttribute("data-sw")];
    if (p) sws[j].innerHTML = p[1] ? p[0] + "<small>" + p[1] + "</small>" : p[0];
  }

  document.getElementById("tree").textContent = S.tree;

  var btns = document.querySelectorAll(".langbar button");
  for (var b = 0; b < btns.length; b++) {
    if (btns[b].getAttribute("data-lang") === LANG) btns[b].className = "on";
    else btns[b].className = "";
  }

  try { localStorage.setItem(KEY, LANG); } catch (e) {}

  /* 重绘会改变页面高度，浏览器可能把滚动位置挪走；强制回原位。 */
  void document.body.offsetHeight;
  window.scrollTo(0, y);
}

var bar = document.querySelectorAll(".langbar button");
for (var n = 0; n < bar.length; n++) {
  bar[n].addEventListener("click", function(ev){
    ev.preventDefault();
    applyLang(this.getAttribute("data-lang"));
  });
}

async function load(){
  var r = await fetch(API + "/config"); var j = await r.json(); var o = j.options;
  for (var i = 0; i < BOOLS.length; i++) { var el = document.getElementById(BOOLS[i]); if (el) el.checked = !!o[BOOLS[i]]; }
  document.getElementById("template").value = o.nameTemplate;
  document.getElementById("minChars").value = o.minChars;
  document.getElementById("maxChars").value = o.maxChars;
  document.getElementById("blacklist").value = (o.blacklist || []).join("，");
  document.getElementById("compressAfter").value = o.compressAfter;
  document.getElementById("cleanupHistoryDays").value = o.cleanupHistoryDays;
  show(o);
}
document.getElementById("save").onclick = async function(){
  var body = {};
  for (var i = 0; i < BOOLS.length; i++) { var el = document.getElementById(BOOLS[i]); if (el) body[BOOLS[i]] = el.checked; }
  body.nameTemplate = document.getElementById("template").value;
  body.minChars = Number(document.getElementById("minChars").value);
  body.maxChars = Number(document.getElementById("maxChars").value);
  body.blacklist = document.getElementById("blacklist").value.split(/[,，\\n]/).map(function(s){return s.trim();}).filter(Boolean);
  body.compressAfter = Number(document.getElementById("compressAfter").value);
  body.cleanupHistoryDays = Number(document.getElementById("cleanupHistoryDays").value);
  var r = await fetch(API + "/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  show(await r.json());
};
document.getElementById("planBtn").onclick = async function(){ show(await (await fetch(API + "/plan")).json()); };
document.getElementById("archiveAll").onclick = async function(){ show(await (await fetch(API + "/archive", { method: "POST" })).json()); };
document.getElementById("stateBtn").onclick = async function(){ show(await (await fetch(API + "/state")).json()); };
document.getElementById("testBtn").onclick = async function(){ show(await (await fetch(API + "/selftest", { method: "POST" })).json()); };

applyLang(LANG);
load();
})();
</script>
</body></html>`;
}
