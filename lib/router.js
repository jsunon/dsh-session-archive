// 会话归档 · 路由层（单个文件 → 目标桶 + 语义文件名）
//
// 七级优先级，顺序即「轻重」判据：
//   1 重复(sha256)  → _临时/重复
//   2 交付单元      → 01-成品
//   3 原始/补丁/快照 → 02-源码
//   4 可复用脚本    → 03-工具
//   5 非代码产出    → 04-产物
//   6 外部资料      → 05-参考
//   7 都不满足      → _临时/未归类
//
// 越靠前越重要，越靠后越可疑。误判成「可删」翻一下找回来；误判成「成品」可能把 token 传上 GitHub。

import { safeDirName, cleanSegment } from './naming.js';
import { sha256 } from './hash.js';

const CODE_EXT = new Set([
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'sh', 'ps1', 'bat', 'cmd', 'vbs', 'ahk',
  'java', 'kt', 'go', 'rs', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'rb', 'swift', 'dart',
  'lua', 'r', 'sql', 'html', 'css', 'scss', 'less', 'vue', 'svelte', 'asm', 'reg',
  'json', 'yml', 'yaml', 'toml', 'ini', 'env', 'xml',
]);

const DATA_EXT = new Set(['csv', 'xlsx', 'xls', 'sql', 'jsonl', 'parquet']);
const DOC_EXT = new Set(['md', 'markdown', 'docx', 'pptx', 'pdf', 'txt']);
const ASSET_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'mp4', 'mp3', 'zip', 'rar', '7z']);
/** 配置文件扩展名：内容本身即是可复用资产 */
const CONFIG_EXT = new Set(['yml', 'yaml', 'toml', 'ini', 'env', 'conf', 'cfg', 'xml', 'json']);
const MANIFEST_NAMES = new Set(['package.json', 'cordis.patch.yml', 'manifest.json', 'pyproject.toml', 'cargo.toml', 'go.mod', 'setup.py']);

/** 临时/探测类文件名前缀：直接进 _临时/探测 */
const TEMP_NAME = /^(tmp|temp|test|tests|bak|old|untitled|新建|临时|草稿|scratch|probe)[-_.\s]/i;
/** 一次性探测命令特征 */
const PROBE_CMD = /^\s*(?:sudo\s+)?(?:curl|wget|ping|nc|ncat|telnet|dig|nslookup|tracert|traceroute|netstat|ss|telnet)\s/;
const FUNC_DEF = /(?:function\s+\w+|=>\s*\{|def\s+\w+|class\s+\w+|export\s+(?:default\s+)?(?:function|class|const)|func\s+\w+\s*\()/;

export function extOf(name) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function isCodeFile(name) {
  const base = String(name || '').toLowerCase();
  if (base === 'dockerfile' || base === 'makefile' || base === 'cmakelists.txt') return true;
  return CODE_EXT.has(extOf(name));
}

/** 文件名主干清洗：全角标点、空格、连续连字符都归一，避免 `每天早-9-点，把…` 这种名字 */
export function tidyStem(input, maxChars = 24) {
  let s = String(input || '');
  s = s.replace(/[，,、；;：:。.！!？?（）()【】\[\]「」《》"'"'`·—–…]/g, '-');
  s = s.replace(/[\s\u3000]+/g, '-');
  s = s.replace(/-{2,}/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  const chars = Array.from(s);
  if (chars.length > maxChars) {
    let cut = chars.slice(0, maxChars).join('');
    // 拉丁词截断在词边界，别切出 `innodb buffer po`
    const tail = s.slice(cut.length).match(/^[A-Za-z0-9]/);
    if (tail) cut = cut.replace(/[A-Za-z0-9]+$/, '').replace(/-+$/, '');
    s = cut;
  }
  return s.replace(/-+$/, '');
}

/**
 * 「这句话像对话，不像名字」的判据。
 * 用于拦掉 `每天早 9 点，把磁盘和内存情况发到 Telegram` 这类整句被当文件名的情况：
 * 兜底名 `片段-074-01` 至少诚实，句子名只会让人以为那是个有意义的标识。
 */
const CHATTY = /[我你他她它们这那请把要被就让给对是从到还也很太真只就都吗吧呢啊呀哦嘛用个讲说做写拿搞点次条份？?！!，,。、；;：:]/;

export function isChattyLine(text) {
  const s = String(text || '');
  return CHATTY.test(s);
}

/**
 * 一句话能不能当名字：短、不是对话口气、不超过两段。
 * 两段以内是标签（`会话归档-命名规则`），三段以上基本是把半句话拆成了连字符。
 */
export function labelOk(stem, maxLen = 20) {
  const s = String(stem || '');
  if (!s) return false;
  const len = Array.from(s).length;
  if (len < 2 || len > maxLen) return false;
  if (isChattyLine(s)) return false;
  return s.split('-').filter(Boolean).length <= 2;
}

/** 从文本里捞出一个真实文件名（含扩展名），用于「注释里写了路径」的场景 */
const NAME_TOKEN = /^([A-Za-z0-9_.\-]+)\.(js|mjs|cjs|ts|tsx|json|yml|yaml|sh|py|ps1|bat|conf|cfg|toml|ini|env|xml|md|html|css|sql|go|rs|php|java)$/i;

export function pickFileName(text) {
  // 先按路径分隔符与空白切词，再从右往左找第一个「像文件名」的词。
  // 这样 `# C:\a\b\cordis.patch.yml 追加` → `cordis.patch`，不用跟反斜杠转义搏斗。
  const tokens = String(text || '').split(/[\\/\s,，、;；:：()（）「」【】"'`]+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const m = tokens[i].match(NAME_TOKEN);
    if (!m) continue;
    const stem = m[1].replace(/^[.\-]+/, '');
    if (stem.length >= 2) return stem;
  }
  return '';
}

/** 从代码块内容推断语义文件名（不含扩展名） */
export function semanticStem(block = {}, context = {}) {
  const code = String(block.code || '');
  const lines = code.split('\n');

  // 1) 首行注释；注释里若写了文件名（含路径），直接用它 —— `# C:\...\cordis.patch.yml 追加`
  //    应该叫 cordis.patch，而不是把整条路径压成 `C-Users-example-dsh`。
  for (let i = 0; i < Math.min(3, lines.length); i += 1) {
    const line = lines[i].trim();
    const m = line.match(/^(?:\/\/|#|--|\/\*|\*|<!--)\s*(.+?)(?:\*\/|-->)?$/);
    if (!m || !m[1]) continue;
    const named = pickFileName(m[1]);
    // 已经是一个合法文件名主干，别再被 tidyStem 把点换成连字符
    if (named) return Array.from(named).length > 24 ? Array.from(named).slice(0, 24).join('') : named;
    // 注释是「说明句」而不是「名字」时不要 —— `# 每天早 9 点，把磁盘和内存情况发到 Telegram`
    if (isChattyLine(m[1])) continue;
    const stem = tidyStem(cleanSegment(m[1]), 20);
    if (labelOk(stem, 20)) return stem;
  }

  // 2) 首个函数/类/导出名
  const fn = code.match(/(?:export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)|(?:async\s+)?function\s+(\w+)|(?:export\s+)?class\s+(\w+)|(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(|def\s+(\w+)|func\s+(\w+))/);
  if (fn) {
    const name = fn.slice(1).find(Boolean);
    if (name && name.length >= 2) return tidyStem(name, 24);
  }

  // 2.5) 内容自证身份：清单类文件按内容认，不靠正文猜。
  //      `{"name": "...", "version": "..."}` 就是 package.json；`- id: / disabled:` 就是补丁清单。
  const trimmed = code.trim();
  if (/^\{[\s\S]*"name"\s*:/.test(trimmed) && /"(version|main|exports|dependencies)"\s*:/.test(trimmed)) {
    return 'package';
  }
  if (/^-\s+id\s*:/m.test(trimmed) && /disabled\s*:/.test(trimmed)) {
    return 'cordis.patch';
  }
  if (/^#!/.test(trimmed) && /\b(bash|sh|node|python)\b/.test(trimmed.split('\n')[0])) {
    // shebang 只说明解释器，不说明用途；继续往下走，别在这里编名字
  }

  // 3) 代码块前一段正文：只接受「像文件名的东西」，否则宁可兜底。
  //    对话正文里的整句（`把这个 16 位码发我 我立刻配好`）当文件名比 `片段-074-01` 更糟 ——
  //    兜底名至少诚实，句子名只会让人以为那是个有意义的标识。
  const before = String(context.beforeText || '').trim();
  if (before) {
    const lines = before.split('\n').map((l) => l.trim()).filter(Boolean).slice(-3);
    // 3a) 正文里写了路径/文件名（含反引号或纯文本都认）
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const named = pickFileName(lines[i]);
      if (named && named.length >= 2) return Array.from(named).length > 24 ? Array.from(named).slice(0, 24).join('') : named;
    }
    // 3b) 末行是个「干净的短标签」才拿来当名字。
    //     正文是散文时，末行往往是半句话（`Funnel 之后：`、`**4. relay concurrency gate（2 处）**`、
    //     `代码已单独保存：`代码-174-1.js``），拿去当文件名只会造出一堆 `4-relay.js` 这种鬼东西。
    //     判据：不含冒号、不含强调/反引号，且短。markdown 标题去掉井号与编号后同样适用。
    const rawLast = lines[lines.length - 1] || '';
    const last = rawLast
      .replace(/^#{1,6}\s*/, '')
      .replace(/^(?:\d+[.、)]|[一二三四五六七八九十]+、)\s*/, '')
      .replace(/^[>*\-\s]+/, '')
      .trim();
    if (!/[:：]/.test(last) && !/\*\*|`/.test(last)) {
      const cleaned = tidyStem(cleanSegment(last), 16);
      if (labelOk(cleaned, 12)) return cleaned;
    }
  }

  // 4) 兜底：按序号
  const seq = String(context.seq || 0).padStart(3, '0');
  const no = String(context.blockNo || 0).padStart(2, '0');
  return `片段-${seq}-${no}`;
}

/**
 * 单文件路由。
 * @param {object} file  { name, content, kindHint?, fromExternal?, isDeliverPart?, srcRole? }
 * @param {object} ctx   { active:[], buckets:[], existingHashes:Map, seq, blockNo, beforeText }
 * @returns {{bucket,subdir,name,confidence,reason,deletable}}
 */
export function routeFile(file = {}, ctx = {}) {
  const name = String(file.name || '未命名');
  const content = String(file.content || '');
  const ext = extOf(name);
  const base = name.split('/').pop();
  const active = ctx.active || [];

  // 1) 重复文件
  const hashes = ctx.existingHashes;
  if (hashes && typeof hashes.get === 'function') {
    const h = sha256(content);
    if (hashes.has(h)) {
      return {
        bucket: 'trash',
        subdir: '重复',
        name,
        confidence: 'high',
        reason: `sha256 与 ${hashes.get(h)} 相同`,
        deletable: true,
      };
    }
    hashes.set(h, name);
  }

  // 2) 交付单元
  if (file.isDeliverPart) {
    return {
      bucket: 'deliver',
      subdir: file.deliverDir || '',
      name,
      confidence: 'high',
      reason: '属于交付单元（含清单文件或同模块成组）',
      deletable: false,
    };
  }

  // 3) 原始 / 补丁 / 快照
  if (file.srcRole) {
    return {
      bucket: 'src',
      subdir: file.srcRole,
      name,
      confidence: 'high',
      reason: `源码角色：${file.srcRole}`,
      deletable: false,
    };
  }

  // 临时文件名 → 探测
  if (TEMP_NAME.test(base)) {
    return { bucket: 'trash', subdir: '探测', name, confidence: 'medium', reason: '文件名含临时/测试前缀', deletable: true };
  }

  // 4) 可复用脚本
  const isCode = isCodeFile(name);
  const hasFunc = FUNC_DEF.test(content);
  const isProbe = PROBE_CMD.test(content.split('\n').find((l) => l.trim()) || '') && !hasFunc && content.split('\n').length <= 15;
  // 只要不是纯咨询会话，含函数/类定义的代码块就是可复用脚本 —— 排错会话里贴出来的脚本
  // 一样能拿去用，不该因为「FIX 维度没规划工具桶」就被当成垃圾。
  const pureAsk = active.length === 1 && active[0] === 'ASK';
  if (isCode && hasFunc && !pureAsk) {
    return { bucket: 'tools', subdir: '', name, confidence: 'high', reason: '含函数/类定义，可复用', deletable: false };
  }
  if (isCode && !hasFunc && isProbe) {
    return { bucket: 'trash', subdir: '探测', name, confidence: 'medium', reason: '≤15 行一次性探测命令', deletable: true };
  }
  // 配置文件本身即是可复用资产（nginx.conf / docker-compose.yml / cordis.patch.yml）。
  // 判据只看「是不是配置类扩展名 + 有实质内容」，不看维度 —— 排错会话里改的配置一样要留。
  if (!pureAsk && CONFIG_EXT.has(ext) && content.trim().split('\n').length >= 3) {
    return { bucket: 'tools', subdir: '', name, confidence: 'high', reason: `配置文件 .${ext}，可复用`, deletable: false };
  }

  // 5) 非代码产出
  if (ASSET_EXT.has(ext) || DATA_EXT.has(ext)) {
    const sub = file.once ? '一次性' : '长期';
    return { bucket: 'output', subdir: sub, name, confidence: 'medium', reason: `产出文件 .${ext}`, deletable: false };
  }
  if (DOC_EXT.has(ext) && !isCode) {
    const sub = file.once ? '一次性' : '长期';
    return { bucket: 'output', subdir: sub, name, confidence: 'medium', reason: `文档产出 .${ext}`, deletable: false };
  }

  // 6) 外部资料
  if (file.fromExternal) {
    return { bucket: 'ref', subdir: '', name, confidence: 'medium', reason: '外部获取的资料', deletable: false };
  }

  // 6.5) 纯咨询会话里的代码块 → 参考
  if (active.length === 1 && active[0] === 'ASK') {
    return { bucket: 'ref', subdir: '', name, confidence: 'medium', reason: '咨询会话中的示例代码', deletable: false };
  }

  // 7) 兜底
  if (isCode) {
    return { bucket: 'tools', subdir: '', name, confidence: 'low', reason: '代码块，但未识别出交付/复用特征', deletable: false };
  }
  return { bucket: 'trash', subdir: '未归类', name, confidence: 'low', reason: '无匹配规则', deletable: true };
}

/** 版本号命名：同名不同内容 → v2 / v3，绝不用 -2（那是重复的标志） */
export function versionedName(name, version) {
  if (!version || version <= 1) return name;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name}.v${version}`;
  return `${name.slice(0, dot)}.v${version}${name.slice(dot)}`;
}

export { MANIFEST_NAMES, CODE_EXT, DATA_EXT, DOC_EXT, ASSET_EXT, CONFIG_EXT };
