// 会话归档 · 聊天记录渲染 + 代码块提取（纯函数，可单测）

const EXT_BY_LANG = {
  js: 'js', javascript: 'js', mjs: 'mjs', cjs: 'cjs', jsx: 'jsx',
  ts: 'ts', typescript: 'ts', tsx: 'tsx',
  py: 'py', python: 'py',
  sh: 'sh', bash: 'sh', zsh: 'sh', shell: 'sh', powershell: 'ps1', ps1: 'ps1', pwsh: 'ps1',
  json: 'json', jsonc: 'jsonc', yml: 'yml', yaml: 'yml', toml: 'toml', ini: 'ini',
  md: 'md', markdown: 'md', txt: 'txt', text: 'txt', log: 'log', csv: 'csv',
  html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less', vue: 'vue', svelte: 'svelte',
  java: 'java', kt: 'kt', kotlin: 'kt', go: 'go', rs: 'rs', rust: 'rs',
  c: 'c', h: 'h', cpp: 'cpp', 'c++': 'cpp', hpp: 'hpp', cs: 'cs', csharp: 'cs',
  php: 'php', rb: 'rb', ruby: 'rb', swift: 'swift', dart: 'dart', lua: 'lua', r: 'r',
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  dockerfile: 'Dockerfile', docker: 'Dockerfile', makefile: 'Makefile', cmake: 'cmake',
  vbs: 'vbs', bat: 'bat', cmd: 'bat', ahk: 'ahk', reg: 'reg', asm: 'asm', s: 'asm',
  xml: 'xml', svg: 'svg', diff: 'diff', patch: 'patch', env: 'env',
};

const CODE_EXT = new Set([
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'sh', 'ps1', 'bat', 'cmd', 'vbs', 'ahk',
  'java', 'kt', 'go', 'rs', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'rb', 'swift', 'dart',
  'lua', 'r', 'sql', 'html', 'css', 'scss', 'less', 'vue', 'svelte', 'asm', 'reg',
  'json', 'yml', 'yaml', 'toml', 'ini', 'env', 'xml', 'Dockerfile', 'Makefile', 'cmake',
]);

export function extForLang(lang) {
  const key = String(lang || '').trim().toLowerCase();
  if (!key) return 'txt';
  if (EXT_BY_LANG[key]) return EXT_BY_LANG[key];
  const direct = key.replace(/[^a-z0-9+#]/g, '');
  return direct || 'txt';
}

export function isCodeLang(lang) {
  return CODE_EXT.has(extForLang(lang));
}

/** 把文本切成 普通段落 / 代码块 片段 */
export function splitFences(text) {
  const src = String(text || '');
  const out = [];
  const re = /```([^\n`]*)\n([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) out.push({ kind: 'text', text: src.slice(last, m.index) });
    out.push({ kind: 'code', lang: (m[1] || '').trim().split(/\s+/)[0] || '', code: m[2] });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ kind: 'text', text: src.slice(last) });
  return out.filter((p) => (p.kind === 'code' ? true : p.text.trim() !== ''));
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function formatTime(ms) {
  if (!ms) return '';
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function textOfMessage(message) {
  const parts = Array.isArray(message && message.content) ? message.content : [];
  const buf = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    if (part.type === 'text' && typeof part.text === 'string') buf.push(part.text);
    else if (part.type === 'image') buf.push(`（图片：${part.name || part.filename || '附件'}）`);
    else if (part.type === 'file') buf.push(`（文件：${part.name || part.filename || '附件'}）`);
  }
  return buf.join('\n').trim();
}

export function headerBlock(state) {
  const lines = [
    `# ${state.name}`,
    '',
    `- 会话 ID：${state.sessionId}`,
    `- 工作区：${state.cwd || '—'}`,
    `- 归档目录：${state.dir}`,
    `- 创建时间：${formatTime(state.createdAt) || '—'}`,
    `- 最近更新：${formatTime(state.updatedAt) || '—'}`,
    `- 总条数：${state.total || 0}`,
    '',
    '> 结构：本文件 = 聊天记录；同一文件夹里的 `代码-N-M.后缀` = 从回答里抽出的代码/脚本/配置；其余文件 = 文档、图片、表格等产出。',
    '',
    '---',
    '',
  ];
  return lines.join('\n');
}

/**
 * 渲染条目
 * @returns {{markdown:string, codeFiles:Array<{name:string,dir:'code'|'other',content:string}>}}
 */
export function renderEntries(entries, options) {
  const cfg = options.config || {};
  const dirs = options.dirs;
  const startIndex = Number(options.startIndex) || 0;
  const codeFiles = [];
  const chunks = [];
  let seq = startIndex;

  for (const entry of entries) {
    seq += 1;
    const when = formatTime(entry.time);
    const head = `## ${seq} · ${entry.role}${when ? ` · ${when}` : ''}`;
    const bodyParts = [];
    let blockNo = 0;
    for (const part of splitFences(entry.text)) {
      if (part.kind === 'text') {
        bodyParts.push(part.text.trim());
        continue;
      }
      blockNo += 1;
      const ext = extForLang(part.lang);
      const code = isCodeLang(part.lang);
      if (cfg.extractCode && code) {
        const fileName = `代码-${seq}-${blockNo}.${ext}`;
        codeFiles.push({ name: fileName, dir: 'code', content: part.code.replace(/\s+$/, '') + '\n' });
        bodyParts.push(`> 代码已单独保存：\`${dirs.code ? `${dirs.code}/` : ''}${fileName}\``);
      } else if (cfg.extractLongText && !code) {
        const fileName = `文本-${seq}-${blockNo}.${ext}`;
        codeFiles.push({ name: fileName, dir: 'other', content: part.code });
        bodyParts.push(`> 文本已单独保存：\`${dirs.other ? `${dirs.other}/` : ''}${fileName}\``);
      } else {
        bodyParts.push(['```' + (part.lang || ''), part.code.replace(/\s+$/, ''), '```'].join('\n'));
      }
    }
    chunks.push([head, '', bodyParts.join('\n\n').trim(), ''].join('\n'));
  }

  return { markdown: chunks.join('\n'), codeFiles, nextIndex: seq };
}
