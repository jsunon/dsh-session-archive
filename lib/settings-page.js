/**
 * 设置面板（中英双语）。
 *
 * 三种显示模式：中文 / English / 中英对照。语言选择存在 localStorage，
 * 刷新后保持。默认跟随浏览器语言（zh* → 中文，其余 → English）。
 *
 * 为什么单独成文件：index.js 已经 1277 行，把一整个 HTML 页面塞在里面
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

/** 单个开关的 label HTML：中英对照模式下把英文挂在小字里。 */
function labelHtml(pair, lang) {
  const [zhMain, zhSub] = STRINGS.zh[pair];
  const [enMain, enSub] = STRINGS.en[pair];
  const sub = (text) => (text ? `<small>${text}</small>` : '');
  if (lang === 'zh') return zhMain + sub(zhSub);
  if (lang === 'en') return enMain + sub(enSub);
  const main = zhMain === enMain ? zhMain : `${zhMain}<small class="alt">${enMain}</small>`;
  const subBoth =
    zhSub || enSub
      ? `<small>${zhSub || ''}${zhSub && enSub ? ' · ' : ''}<span style="color:#94a3b8">${enSub || ''}</span></small>`
      : '';
  return main + subBoth;
}

export function settingsPage(options, state, apiBase) {
  const opt = JSON.stringify(options, null, 2);
  const plain = (key, lang) => {
    const zh = STRINGS.zh[key];
    const en = STRINGS.en[key];
    if (lang === 'zh') return zh;
    if (lang === 'en') return en;
    return zh === en ? zh : `${zh} · ${en}`;
  };

  // 预渲染一份中文骨架；JS 在浏览器里按 localStorage 立即重绘。
  const sw = (id, key) =>
    `<div class="switch"><input type="checkbox" id="${id}"><label for="${id}" style="margin:0" data-sw="${key}">${labelHtml(key, 'zh')}</label></div>`;

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${plain('title', 'both')}</title>
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
 small.alt{display:block;font-weight:400;color:#94a3b8;font-size:12px;margin-top:2px}
 .langbar{display:flex;gap:6px;justify-content:flex-end;margin:0 0 10px}
 .langbar button{padding:5px 12px;font-size:12px;border-radius:8px}
 .langbar button.on{background:#1c1f23;border-color:#1c1f23;color:#fff}
 h1 small.alt{font-size:13px;font-weight:400}
 h2 small.alt{font-size:12px;display:inline;margin-left:6px}
</style></head><body><main>
<div class="langbar">
  <button data-lang="zh">中文</button>
  <button data-lang="en">English</button>
  <button data-lang="both">中英对照 · Both</button>
</div>

<h1 data-t="title">${plain('title', 'zh')}</h1>
<p class="hint" data-t="hint">${plain('hint', 'zh')}</p>

<div class="tree" id="tree">${plain('tree', 'zh')}</div>

<h2 data-t="hBasic">${plain('hBasic', 'zh')}</h2>
${sw('enabled', 'enabled')}
${sw('structured', 'structured')}
${sw('extractCode', 'extractCode')}
${sw('extractLongText', 'extractLongText')}
${sw('writeManifest', 'writeManifest')}

<h2 data-t="hSafety">${plain('hSafety', 'zh')}</h2>
${sw('safetyScan', 'safetyScan')}
${sw('dedupeByHash', 'dedupeByHash')}
${sw('strictRoot', 'strictRoot')}
${sw('divertWorkspaceFiles', 'divertWorkspaceFiles')}
${sw('absorbWorkspaceRoot', 'absorbWorkspaceRoot')}

<h2 data-t="hNaming">${plain('hNaming', 'zh')}</h2>
<label for="template" data-t="nameTemplate">${plain('nameTemplate', 'zh')}</label>
<input type="text" id="template" placeholder="【{kind}-{summary}】">
<div class="row">
  <div><label for="minChars" data-t="minChars">${plain('minChars', 'zh')}</label><input type="number" id="minChars" min="6" max="40"></div>
  <div><label for="maxChars" data-t="maxChars">${plain('maxChars', 'zh')}</label><input type="number" id="maxChars" min="10" max="80"></div>
</div>

<h2 data-t="hContent">${plain('hContent', 'zh')}</h2>
<label for="blacklist" data-t="blacklist">${plain('blacklist', 'zh')}</label>
<textarea id="blacklist"></textarea>
<div class="row">
  <div><label for="compressAfter" data-t="compressAfter">${plain('compressAfter', 'zh')}</label><input type="number" id="compressAfter" min="0"></div>
  <div><label for="cleanupHistoryDays" data-t="cleanupHistoryDays">${plain('cleanupHistoryDays', 'zh')}</label><input type="number" id="cleanupHistoryDays" min="0"></div>
</div>

<div class="actions">
  <button class="primary" id="save" data-t="save">${plain('save', 'zh')}</button>
  <button id="planBtn" data-t="plan">${plain('plan', 'zh')}</button>
  <button id="archiveAll" data-t="archiveAll">${plain('archiveAll', 'zh')}</button>
  <button id="stateBtn" data-t="state">${plain('state', 'zh')}</button>
  <button id="testBtn" data-t="selftest">${plain('selftest', 'zh')}</button>
</div>

<label style="margin-top:24px" data-t="out">${plain('out', 'zh')}</label>
<pre id="out">${opt.replace(/</g, '&lt;')}</pre>
</main>
<script>
const API = ${JSON.stringify(apiBase)};
const BOOLS = ["enabled","structured","extractCode","extractLongText","writeManifest","safetyScan","dedupeByHash","strictRoot","divertWorkspaceFiles","absorbWorkspaceRoot"];
const STR = ${JSON.stringify(STRINGS)};

const out = document.getElementById("out");
function show(v){ out.textContent = typeof v === "string" ? v : JSON.stringify(v, null, 2); }

/* 默认语言：浏览器中文 → zh，其余 → en */
function initialLang(){
  const saved = localStorage.getItem("dsh-session-archive-lang");
  if (saved === "zh" || saved === "en" || saved === "both") return saved;
  return /^zh/i.test(navigator.language || "") ? "zh" : "en";
}
let LANG = initialLang();

/* 从 STR 取一对 [主文, 小字]；中英对照时英文进 small.alt */
function label(pairKey, lang){
  const z = STR.zh[pairKey], e = STR.en[pairKey];
  const zMain = z[0], zSub = z[1], eMain = e[0], eSub = e[1];
  const sub = (t) => (t ? "<small>" + t + "</small>" : "");
  if (lang === "zh") return zMain + sub(zSub);
  if (lang === "en") return eMain + sub(eSub);
  const main = zMain === eMain ? zMain : zMain + '<small class="alt">' + eMain + "</small>";
  const subBoth = (zSub || eSub)
    ? "<small>" + (zSub || "") + (zSub && eSub ? " · " : "") + '<span style="color:#94a3b8">' + (eSub || "") + "</span></small>"
    : "";
  return main + subBoth;
}

/* 纯文本字段（标题、小节名、按钮）：中英对照时用 "中文 · English" */
function plain(key, lang){
  const z = STR.zh[key], e = STR.en[key];
  if (lang === "zh") return z;
  if (lang === "en") return e;
  return z === e ? z : z + '<small class="alt" style="display:inline;margin-left:6px">' + e + "</small>";
}

function applyLang(){
  document.documentElement.lang = LANG === "en" ? "en" : "zh-CN";
  document.querySelectorAll("[data-t]").forEach(function(el){
    el.innerHTML = plain(el.getAttribute("data-t"), LANG);
  });
  document.querySelectorAll("[data-sw]").forEach(function(el){
    el.innerHTML = label(el.getAttribute("data-sw"), LANG);
  });
  const tree = document.getElementById("tree");
  tree.textContent = LANG === "en" ? STR.en.tree
    : (LANG === "both" ? STR.zh.tree + "\\n\\n" + STR.en.tree : STR.zh.tree);
  document.querySelectorAll(".langbar button").forEach(function(b){
    b.classList.toggle("on", b.getAttribute("data-lang") === LANG);
  });
  localStorage.setItem("dsh-session-archive-lang", LANG);
}
document.querySelectorAll(".langbar button").forEach(function(b){
  b.onclick = function(){ LANG = b.getAttribute("data-lang"); applyLang(); };
});

async function load(){
  const r = await fetch(API + "/config"); const j = await r.json(); const o = j.options;
  for (const k of BOOLS) { const el = document.getElementById(k); if (el) el.checked = !!o[k]; }
  document.getElementById("template").value = o.nameTemplate;
  document.getElementById("minChars").value = o.minChars;
  document.getElementById("maxChars").value = o.maxChars;
  document.getElementById("blacklist").value = (o.blacklist || []).join("，");
  document.getElementById("compressAfter").value = o.compressAfter;
  document.getElementById("cleanupHistoryDays").value = o.cleanupHistoryDays;
  show(o);
}
document.getElementById("save").onclick = async () => {
  const body = {};
  for (const k of BOOLS) { const el = document.getElementById(k); if (el) body[k] = el.checked; }
  body.nameTemplate = document.getElementById("template").value;
  body.minChars = Number(document.getElementById("minChars").value);
  body.maxChars = Number(document.getElementById("maxChars").value);
  body.blacklist = document.getElementById("blacklist").value.split(/[,，\\n]/).map(s=>s.trim()).filter(Boolean);
  body.compressAfter = Number(document.getElementById("compressAfter").value);
  body.cleanupHistoryDays = Number(document.getElementById("cleanupHistoryDays").value);
  const r = await fetch(API + "/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  show(await r.json());
};
document.getElementById("planBtn").onclick = async () => { show(await (await fetch(API + "/plan")).json()); };
document.getElementById("archiveAll").onclick = async () => { show(await (await fetch(API + "/archive", { method: "POST" })).json()); };
document.getElementById("stateBtn").onclick = async () => { show(await (await fetch(API + "/state")).json()); };
document.getElementById("testBtn").onclick = async () => { show(await (await fetch(API + "/selftest", { method: "POST" })).json()); };
applyLang();
load();
</script>
</body></html>`;
}
