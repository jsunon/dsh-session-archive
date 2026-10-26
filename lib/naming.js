// 会话归档 · 命名规则（纯函数，可单测）
// 规则来源：用户规格【会话文件夹命名规则（强制）】
// 1) 提炼核心总结；2) 前缀分类【开发/文案/方案/调试】；3) 15~30 字、去非法字符；
// 4) 失败兜底 会话_YYYYMMDD_HHmm

export const ILLEGAL = /[\\/:*?"<>|\x00-\x1f]/g;
export const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const RULES = [
  ['调试', /(调试|排错|报错|错误|异常|崩溃|修复|不生效|失败|日志|定位|排查|bug|fix|error|crash)/i],
  ['开发', /(插件|脚本|代码|开发|工具|函数|接口|api|重构|编译|打包|sdk|扩展|命令行|cli|hook|组件|服务|爬虫|正则)/i],
  ['文案', /(文案|标题|广告|营销|推广|种草|小红书|短视频|朋友圈|海报|话术|口播|推文|软文|邮件)/i],
  ['方案', /(方案|计划|策略|规划|流程|制度|立项|预算|提案|复盘|大纲|需求|调研|评估|对比|分析|测评|选型|指南|教程)/i],
];

// 前缀词 -> 分类（少量常见同义词，避免命名偏题）
const HINTS = [
  ['调试', ['调试', '排错', '报错']],
  ['开发', ['插件', '脚本', '代码', '工具']],
  ['文案', ['文案', '标题', '推广']],
  ['方案', ['方案', '计划', '复盘']],
];

const CUT_PREFIX = /^(帮我|帮忙|请|麻烦|你(?:帮|给)我|我想|我要|需要|做一个|做个|写一个|写个|来一个|给我)+/;

/** 去掉附件占位、URL、序号、markdown 噪点 */
export function scrubNoise(input) {
  let s = String(input || '');
  s = s.replace(/（(?:图片|文件)[^）]*）/g, ' ');
  s = s.replace(/\((?:image|file)[^)]*\)/gi, ' ');
  s = s.replace(/https?:\/\/\S+/gi, ' ');
  s = s.replace(/\b[\w.-]+\.(?:png|jpg|jpeg|gif|webp|zip|rar|7z)\b/gi, ' ');
  s = s.replace(/^\s*(?:\d+\s*[、.．)）]\s*)+/, ' ');
  s = s.replace(/[<>{}[\]|\\^~]/g, ' ');
  return s;
}

/** 首条用户消息里可用于命名的片段（第一句 + 去噪） */
export function namingSource(firstUserText) {
  const base = scrubNoise(firstUserText).replace(/\s+/g, ' ').trim();
  const sentence = base.split(/[。.!！?？\n]/)[0] || '';
  const candidate = cleanSegment(sentence.replace(CUT_PREFIX, ''));
  const meaningful = /[\u4e00-\u9fa5]{2,}/.test(candidate) || /[A-Za-z]{3,}/.test(candidate);
  return meaningful ? candidate : '';
}

/** 统计命中的关键词个数，返回 {kind, score} */
export function classify(text) {
  const src = String(text || '');
  let best = { kind: '会话', score: 0 };
  for (const [kind, re] of RULES) {
    const m = src.match(new RegExp(re.source, 'gi'));
    const score = m ? m.length : 0;
    if (score > best.score) best = { kind, score };
  }
  return best;
}

/** 去掉 markdown 噪点、非法字符、首尾标点 */
export function cleanSegment(input) {
  let s = String(input || '');
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(/[`*_>#]+/g, ' ');
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(ILLEGAL, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^[·\-–—:：;；,，.。!！?？、]+/, '');
  s = s.replace(/[·\-–—:：;；,，.。!！?？、]+$/, '');
  return s.trim();
}

export function safeDirName(input, maxChars = 30) {
  let s = cleanSegment(input);
  s = s.replace(new RegExp(`[.]{2,}`, 'g'), '.');
  s = s.replace(/\s+/g, ' ');
  if (!s) return '';
  if (RESERVED.test(s)) s = `${s}_`;
  const chars = Array.from(s);
  if (chars.length > maxChars) s = cleanSegment(chars.slice(0, maxChars).join(''));
  return s;
}

export function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}`;
}

export function fallbackName(date = new Date()) {
  return `会话_${stamp(date)}`;
}

/**
 * 生成会话文件夹名。
 * @param {object} input
 * @param {string} input.title  会话标题（LLM 摘要，优先）
 * @param {string} input.firstUserText 首条用户消息（标题缺失时提炼）
 * @param {string} input.template 命名模板，支持 {kind} {summary} {date} {time}
 * @param {number} input.minChars
 * @param {number} input.maxChars
 * @param {string} input.routeHint 路由/工具名等补充线索（可选）
 * @param {Date}   input.now
 */
export function buildName(input) {
  const now = input.now || new Date();
  const maxChars = Math.max(10, Number(input.maxChars) || 30);
  const minChars = Math.min(maxChars, Math.max(6, Number(input.minChars) || 15));
  const template = String(input.template || '【{kind}-{summary}】');
  const hintText = `${input.title || ''} ${input.routeHint || ''}`;
  const source = namingSource(input.firstUserText || '');
  const probe = `${hintText} ${source}`;

  let summary = cleanSegment(input.title || '');
  summary = summary.replace(CUT_PREFIX, '');
  // 标题本身带「【开发-xxx】」时先剥掉类目前缀
  summary = summary.replace(/^【[^】]{1,8}】/, '');
  if (!summary) summary = source;
  summary = safeDirName(summary, maxChars);
  if (!summary) return fallbackName(now);

  const best = classify(probe);
  const kind = best.kind === '会话' ? guessKindFromHints(probe) : best.kind;

  // 摘要本身以类目词开头（如"开发一个…"）时去掉，避免【开发-开发一个…】
  if (kind !== '会话' && summary.startsWith(kind)) {
    summary = cleanSegment(summary.slice(kind.length).replace(/^(一个|个|的|：|:)/, ''));
  }

  let out = template
    .replace('{kind}', kind)
    .replace('{summary}', summary)
    .replace('{date}', stamp(now).slice(0, 8))
    .replace('{time}', stamp(now).slice(9));

  out = safeDirName(out, maxChars);

  // 长度不足 15：仅当摘要过短（<6 字）时才用「干净且有信息量」的首句补足，避免拼出噪点
  if (Array.from(out).length < minChars && Array.from(summary).length < 6 && source) {
    const room = minChars - Array.from(out).length;
    const piece = Array.from(source).slice(0, room + 4).join('');
    const meaningful = /[\u4e00-\u9fa5]{3,}|[A-Za-z]{4,}/.test(piece);
    if (meaningful && !out.includes(piece.slice(0, 3))) {
      out = safeDirName(out.replace(/】$/, `·${piece}】`), maxChars);
    }
  }
  // 仍然过短（标题极简且无首句）：补时间戳，保证同一工作区内可区分
  if (Array.from(out).length < 9) {
    out = safeDirName(out.replace(/】$/, `·${stamp(now)}】`), maxChars);
  }
  if (Array.from(out).length > maxChars) out = safeDirName(out, maxChars);
  out = closeBrackets(out, maxChars);
  if (!out) return fallbackName(now);
  return out;
}

/** 截断后补回结尾的 】，避免出现半截括号名 */
export function closeBrackets(value, maxChars = 30) {
  const s = String(value || '');
  if (!s.startsWith('【') || s.endsWith('】')) return s;
  const chars = Array.from(s);
  let body = cleanSegment(chars.slice(0, Math.max(1, maxChars - 1)).join(''));
  body = body.replace(/[·\-–—:：;；,，.。!！?？、]+$/, '');
  return `${body}】`;
}

function guessKindFromHints(text) {
  for (const [kind, words] of HINTS) {
    if (words.some((w) => text.includes(w))) return kind;
  }
  return '会话';
}

/** 名字撞车时追加序号，但绝不共用同一文件夹 */
export function uniqueName(base, taken) {
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = safeDirName(`${base}-${i}`, 40);
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
