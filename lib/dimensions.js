// 会话归档 · 维度判定（信号 → 维度得分）
//
// 核心模型：会话不是「开发/提问/修复」三选一，而是若干产出维度的叠加。
//   信号层 L1 结构 / L2 语义 / L3 上下文  →  维度层打分  →  布局层取并集
//
// 加权原则：L1 ×3（磁盘/命令真实发生）、L2 ×2（关键词）、L3 ×1（标题措辞）。
// 理由：措辞会骗人，磁盘不会。

export const LEVEL_WEIGHT = { L1: 3, L2: 2, L3: 1 };

/** 六个内置维度；新维度用 JSON 追加即可，无需改代码 */
export const DIMENSIONS = [
  {
    id: 'DEV',
    label: '开发',
    buckets: ['deliver', 'src', 'tools'],
    l1: [
      { kind: 'manifest_file', weight: 40 },   // package.json / cordis.patch.yml / manifest.json 全文
      { kind: 'module_cluster', weight: 20 },  // ≥3 个同模块代码块
      { kind: 'path_ref', weight: 15 },        // 出现 lib/ src/ 之类相对路径引用
    ],
    l2: [
      { kind: 'kw', values: ['插件', '组件', '实现', '封装', '重构', 'sdk', '模块', '接口', '库'], weight: 8 },
    ],
  },
  {
    id: 'FIX',
    label: '修复',
    buckets: ['src'],
    l1: [
      { kind: 'file_rewrite', weight: 25 },    // 同一文件被改 ≥2 次
      { kind: 'patch_file', weight: 20 },      // .patch / .diff
      { kind: 'fail_then_fix', weight: 20 },   // 非零退出后紧跟修正
    ],
    l2: [
      { kind: 'kw', values: ['报错', '不生效', '失败', '排查', '定位', '修复', '崩溃', '异常', '错误', 'bug', 'error'], weight: 8 },
    ],
  },
  {
    id: 'ASK',
    label: '咨询',
    buckets: ['ref'],
    l1: [
      { kind: 'no_write_no_exec', weight: 30 },// 零写盘 + 零命令 + 有结论性长文本
    ],
    l2: [
      { kind: 'kw', values: ['是什么', '为什么', '怎么', '区别', '原理', '对比', '如何', '能不能', '吗？', '吗?'], weight: 7 },
    ],
  },
  {
    id: 'OPS',
    label: '运维',
    buckets: ['tools', 'output'],
    l1: [
      { kind: 'remote_exec', weight: 25 },     // ssh / systemctl / docker / nginx / crontab 被执行
      { kind: 'shell_cmd', weight: 12 },
    ],
    l2: [
      { kind: 'kw', values: ['部署', '启动', '重载', '服务器', '端口', '日志', '证书', '域名', '防火墙'], weight: 8 },
    ],
  },
  {
    id: 'DOC',
    label: '文案',
    buckets: ['output', 'ref'],
    l1: [
      { kind: 'doc_file', weight: 25 },         // .md / .docx / .pptx 产出（非代码说明）
    ],
    l2: [
      { kind: 'kw', values: ['文案', '标题', '报告', '大纲', '方案', '复盘', '摘要', '总结', '撰写'], weight: 8 },
    ],
  },
  {
    id: 'DATA',
    label: '数据',
    buckets: ['output', 'tools'],
    l1: [
      { kind: 'data_file', weight: 25 },        // .csv / .xlsx / .sql
    ],
    l2: [
      { kind: 'kw', values: ['统计', '清洗', '导出', '报表', '分析', '指标', '查询'], weight: 8 },
    ],
  },
];

export const THRESHOLD = { high: 75, medium: 55 };

/** 各维度并列时的破平顺序（只保证结果确定，不制造偏好） */
export const TIE_BREAK = ['DEV', 'FIX', 'OPS', 'DATA', 'DOC', 'ASK'];

/** 归档自己生成的文件，出现在正文里不算「反复改写」 */
const ROOT_FILES = ['聊天记录.md', 'session.json', 'README.md', 'MANIFEST.json'];

const MANIFEST_FILES = ['package.json', 'cordis.patch.yml', 'manifest.json', 'pyproject.toml', 'cargo.toml', 'go.mod', 'setup.py'];
const REMOTE_CMDS = /\b(ssh|scp|systemctl|service|docker|docker-compose|nginx|crontab|kubectl|pm2)\b/;
const SHELL_HINT = /^\s*(?:\$ |# |> )?(sudo |apt |yum |brew |npm |pnpm |yarn |pip |node |python |bash |sh |curl |wget |git )/m;
const DOC_EXT = /\.(md|markdown|docx|pptx|pdf|txt)$/i;
const DATA_EXT = /\.(csv|xlsx|xls|sql|jsonl|parquet)$/i;

/**
 * 取消息正文。宿主侧给的是 { text }，外部脚本可能给 { content:[{type:'text',text}] }，
 * 两种都认，否则信号抽取会静默拿到空字符串。
 */
export function textOf(message = {}) {
  if (typeof message.text === 'string' && message.text) return message.text;
  const parts = Array.isArray(message.content) ? message.content : [];
  const buf = [];
  for (const part of parts) {
    if (part && part.type === 'text' && typeof part.text === 'string') buf.push(part.text);
  }
  return buf.join('\n');
}

/**
 * 从消息流抽取结构化信号。
 * @param {Array<{role:string,text:string,time:number}>} messages
 * @param {Array<{seq:number,blockNo:number,lang:string,code:string}>} blocks
 * @param {{title?:string, toolCalls?:Array}} extra
 */
export function extractSignals(messages = [], blocks = [], extra = {}) {
  const signals = [];
  const push = (level, kind, value, weight, msgRef) => {
    signals.push({ level, kind, value, weight, msgRef: msgRef || '' });
  };

  const fullText = messages.map((m) => textOf(m)).join('\n');
  const codeText = blocks.map((b) => b.code).join('\n');
  const allText = `${fullText}\n${codeText}`;

  /* ---- L1 结构信号 ---- */

  // 1) 清单文件：文本点名，或代码块本身就是一份清单（JSON 带 name+version）
  for (const file of MANIFEST_FILES) {
    const re = new RegExp(`(^|[/\\\\\\s"'\`])${file.replace('.', '\\.')}("|'|\\s|$)`, 'i');
    if (re.test(allText)) {
      push('L1', 'manifest_file', file, 30, '');
      break;
    }
  }
  if (!signals.some((s) => s.kind === 'manifest_file')) {
    for (const b of blocks) {
      const text = String(b.code || '');
      if (!/"name"\s*:/.test(text)) continue;
      if (!/"version"\s*:/.test(text) && !/"main"\s*:/.test(text) && !/"exports"\s*:/.test(text)) continue;
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      if (parsed && typeof parsed === 'object' && parsed.name) {
        push('L1', 'manifest_file', 'package.json(块内)', 30, '');
        break;
      }
    }
  }

  // 2) 同模块代码块 ≥3 个（语言相同）
  const langCount = new Map();
  for (const b of blocks) {
    const lang = String(b.lang || '').toLowerCase();
    if (!lang) continue;
    langCount.set(lang, (langCount.get(lang) || 0) + 1);
  }
  for (const [lang, count] of langCount) {
    if (count >= 3) push('L1', 'module_cluster', `${lang}×${count}`, 20, '');
  }

  // 3) 相对路径引用（lib/xxx.js、./src/yyy.ts）
  const pathRefs = allText.match(/(?:^|[\s`'"(])(?:\.\/)?(?:lib|src|app|packages|components)\/[A-Za-z0-9_./-]+\.[a-z]{2,5}/g) || [];
  if (pathRefs.length) push('L1', 'path_ref', `${pathRefs.length} 处`, 15, '');

  // 4) 同一文件名被反复改写（归档自己产出的文件名不算）
  const nameHits = new Map();
  for (const m of allText.matchAll(/([A-Za-z0-9_.-]+\.(?:js|mjs|ts|py|sh|yml|yaml|json|md|go|rs|java))/g)) {
    const n = m[1].toLowerCase();
    if (ROOT_FILES.some((f) => f.toLowerCase() === n)) continue;
    nameHits.set(n, (nameHits.get(n) || 0) + 1);
  }
  for (const [n, c] of nameHits) {
    if (c >= 3) push('L1', 'file_rewrite', n, 25, '');
  }

  // 5) 补丁文件
  if (/```(?:diff|patch)/i.test(fullText) || /^\+\+\+ |^--- a\//m.test(codeText)) {
    push('L1', 'patch_file', 'diff/patch 块', 20, '');
  }

  // 6) 远程/运维命令
  if (REMOTE_CMDS.test(codeText) || REMOTE_CMDS.test(fullText)) {
    push('L1', 'remote_exec', '远程运维命令', 25, '');
  }
  if (SHELL_HINT.test(codeText)) push('L1', 'shell_cmd', 'shell 命令', 12, '');

  // 7) 产出文件类型（归档自己的文件名不算产出）
  const textForExt = ROOT_FILES.reduce((acc, f) => acc.split(f).join(' '), allText);
  const docHits = (textForExt.match(DOC_EXT) || []).length;
  const dataHits = (textForExt.match(DATA_EXT) || []).length;
  if (docHits >= 2) push('L1', 'doc_file', `${docHits} 处`, 25, '');
  if (dataHits >= 2) push('L1', 'data_file', `${dataHits} 处`, 25, '');

  // 8) 零写盘零执行 = 纯咨询
  const wrote = blocks.length > 0;
  const executed = (extra.toolCalls || []).length > 0 || REMOTE_CMDS.test(allText) || SHELL_HINT.test(codeText);
  const longText = fullText.replace(/\s/g, '').length > 300;
  if (!wrote && !executed && longText) push('L1', 'no_write_no_exec', '零写盘零执行', 30, '');

  /* ---- L2 语义信号 ---- */
  for (const dim of DIMENSIONS) {
    for (const rule of dim.l2) {
      if (rule.kind !== 'kw') continue;
      let hits = 0;
      for (const word of rule.values) {
        const re = new RegExp(escapeRe(word), 'gi');
        const found = fullText.match(re);
        if (found) hits += found.length;
      }
      if (hits > 0) push('L2', 'kw', `${dim.id}:${hits}`, rule.weight, dim.id);
    }
  }

  /* ---- L3 上下文信号 ---- */
  const title = String(extra.title || '');
  if (title) push('L3', 'title', title, 10, '');

  return signals;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 信号 → 维度得分。
 * @returns {{scores:Object<string,number>, reasons:Object<string,string[]>, active:string[]}}
 */
export function scoreDimensions(signals = [], options = {}) {
  const threshold = options.threshold || THRESHOLD;
  const scores = {};
  const reasons = {};
  for (const dim of DIMENSIONS) {
    scores[dim.id] = 0;
    reasons[dim.id] = [];
  }

  for (const sig of signals) {
    if (sig.level === 'L2' && sig.kind === 'kw') {
      // L2 关键词已按维度标记（value = "DEV:3"）
      const [dimId, count] = String(sig.value).split(':');
      const dim = DIMENSIONS.find((d) => d.id === dimId);
      if (!dim) continue;
      const hits = Math.max(1, Number(count) || 1);
      const delta = Math.min(sig.weight * LEVEL_WEIGHT.L2 * Math.min(hits, 3), 45);
      scores[dim.id] += delta;
      reasons[dim.id].push(`L2 关键词命中 ${hits} 次`);
      continue;
    }

    if (sig.level === 'L3' && sig.kind === 'title') {
      for (const dim of DIMENSIONS) {
        const hit = dim.l2.some((r) => r.kind === 'kw' && r.values.some((w) => String(sig.value).includes(w)));
        if (!hit) continue;
        scores[dim.id] += sig.weight * LEVEL_WEIGHT.L3;
        reasons[dim.id].push('L3 标题命中');
      }
      continue;
    }

    for (const dim of DIMENSIONS) {
      const rule = (dim.l1 || []).find((r) => r.kind === sig.kind);
      if (!rule) continue;
      scores[dim.id] += rule.weight;
      reasons[dim.id].push(`L1 ${sig.kind}${sig.value ? `(${sig.value})` : ''}`);
    }
  }

  for (const id of Object.keys(scores)) {
    scores[id] = Math.min(100, Math.round(scores[id]));
  }

  const active = Object.keys(scores)
    .filter((id) => scores[id] >= threshold.medium)
    .sort((a, b) => {
      if (scores[b] !== scores[a]) return scores[b] - scores[a];
      return TIE_BREAK.indexOf(a) - TIE_BREAK.indexOf(b);
    });

  return { scores, reasons, active };
}

/** 置信度分档 */
export function confidenceOf(score) {
  if (score >= THRESHOLD.high) return 'high';
  if (score >= THRESHOLD.medium) return 'medium';
  return 'low';
}

/** 维度 → 要建的桶（去重保序） */
export function bucketsFor(active = []) {
  const out = [];
  for (const id of active) {
    const dim = DIMENSIONS.find((d) => d.id === id);
    if (!dim) continue;
    for (const bucket of dim.buckets) {
      if (!out.includes(bucket)) out.push(bucket);
    }
  }
  return out;
}

/** 人读的一句话结论 */
export function describe(scores = {}, active = []) {
  if (!active.length) return '未识别出明确维度（文件进 _临时/未归类/）';
  return active
    .map((id) => {
      const dim = DIMENSIONS.find((d) => d.id === id);
      return `${dim ? dim.label : id}:${scores[id]}(${confidenceOf(scores[id])})`;
    })
    .join(' · ');
}
