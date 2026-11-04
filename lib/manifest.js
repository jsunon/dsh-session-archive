// 会话归档 · 清单层（README.md + MANIFEST.json）
//
// 价值不在「自动分类准确」，而在「分类可审计」：
// 每个文件为什么在这里，一条 reason 说得清。判定错了能改，改完锁定，不会再被冲掉。

import { BUCKETS, BUCKET_ORDER, ROOT_FILES } from './layout.js';
import { confidenceOf, describe } from './dimensions.js';
import { formatTime } from './render.js';

export const MANIFEST_VERSION = 1;

/** 构建 MANIFEST 对象 */
export function buildManifest(input = {}) {
  const now = Date.now();
  const files = (input.files || []).map((f) => ({
    path: f.path,
    kind: f.kind || 'file',
    bucket: f.bucket || '',
    dimension: f.dimension || '',
    confidence: f.confidence || 'low',
    sha256: f.sha256 || '',
    size: f.size || 0,
    source: f.source || null,
    reason: f.reason || '',
    deletable: f.deletable === true,
    readonly: f.readonly === true,
    at: now,
  }));

  return {
    version: MANIFEST_VERSION,
    sessionId: input.sessionId || '',
    name: input.name || '',
    workspace: input.workspace || '',
    dir: input.dir || '',
    createdAt: input.createdAt || 0,
    updatedAt: now,
    lifecycle: input.lifecycle || 'active',
    dimensions: {
      scores: input.scores || {},
      active: input.active || [],
      summary: describe(input.scores || {}, input.active || []),
    },
    layout: (input.buckets || []).map((b) => ({
      id: b.id,
      dir: b.dir,
      label: b.label,
      subdirs: b.subdirs || [],
      writable: b.writable !== false,
      deletable: b.deletable === true,
    })),
    files,
    stats: {
      total: files.length,
      deletable: files.filter((f) => f.deletable).length,
      readonly: files.filter((f) => f.readonly).length,
      byBucket: countByBucket(files),
    },
    safety: input.safety || null,
    override: input.override || null,
  };
}

function countByBucket(files) {
  const out = {};
  for (const f of files) {
    if (!f.bucket) continue;
    out[f.bucket] = (out[f.bucket] || 0) + 1;
  }
  return out;
}

/** 渲染人读的 README.md */
export function renderReadme(manifest = {}) {
  const lines = [];
  const dims = manifest.dimensions || {};
  const scores = dims.scores || {};
  const active = dims.active || [];

  lines.push(`# ${manifest.name || '会话归档'}`);
  lines.push('');
  lines.push(`- 会话 ID：\`${manifest.sessionId || '—'}\``);
  lines.push(`- 工作区：\`${manifest.workspace || '—'}\``);
  lines.push(`- 状态：${lifecycleLabel(manifest.lifecycle)}`);
  lines.push(`- 更新：${formatTime(manifest.updatedAt) || '—'}`);
  lines.push('');

  lines.push('## 会话类型判定');
  lines.push('');
  if (active.length) {
    lines.push('| 维度 | 得分 | 置信度 | 依据 |');
    lines.push('|---|---|---|---|');
    for (const id of active) {
      const reasons = (manifest.reasons && manifest.reasons[id]) || [];
      const uniq = [...new Set(reasons)].slice(0, 3).join('；');
      lines.push(`| ${dimLabel(id)} | ${scores[id] ?? 0} | ${confidenceLabel(confidenceOf(scores[id] ?? 0))} | ${uniq || '—'} |`);
    }
  } else {
    lines.push('> 未识别出明确维度，文件统一进 `_临时/未归类/`，等人工确认。');
  }
  lines.push('');

  lines.push('## 产物清单');
  lines.push('');
  if ((manifest.layout || []).length) {
    lines.push('| 路径 | 类型 | 说明 | 可删 |');
    lines.push('|---|---|---|---|');
    for (const b of manifest.layout) {
      const count = (manifest.stats && manifest.stats.byBucket && manifest.stats.byBucket[b.id]) || 0;
      lines.push(`| \`${b.dir}/\` | ${b.label} | ${count} 个文件 | ${b.deletable ? '✅ 可删' : '❌ 不可删'} |`);
    }
  } else {
    lines.push('> 本会话未产生任何产物目录。');
  }
  lines.push('');

  const lowConf = (manifest.files || []).filter((f) => f.confidence === 'low');
  if (lowConf.length) {
    lines.push('## 待人工确认');
    lines.push('');
    for (const f of lowConf) {
      lines.push(`- \`${f.path}\` — ${f.reason || '置信度低'}`);
    }
    lines.push('');
  }

  const trashFiles = (manifest.files || []).filter((f) => f.deletable);
  if (trashFiles.length) {
    lines.push('## 可直接删除');
    lines.push('');
    lines.push(`共 ${trashFiles.length} 个，删掉零影响：`);
    lines.push('');
    for (const f of trashFiles.slice(0, 30)) {
      lines.push(`- \`${f.path}\``);
    }
    if (trashFiles.length > 30) lines.push(`- …另有 ${trashFiles.length - 30} 个`);
    lines.push('');
  }

  if (manifest.safety) {
    const s = manifest.safety;
    lines.push('## 开源前检查');
    lines.push('');
    lines.push(`结论：**${s.verdict || '未扫描'}**`);
    lines.push('');
    const rows = [...(s.blocking || []), ...(s.warning || [])].slice(0, 20);
    if (rows.length) {
      lines.push('| 文件 | 行 | 类型 | 样例 |');
      lines.push('|---|---|---|---|');
      for (const f of rows) {
        lines.push(`| ${cell(f.file)} | ${f.line} | ${f.label} | ${cell(f.sample)} |`);
      }
      lines.push('');
    }
    if ((s.blocking || []).length) {
      lines.push('> ⛔ 存在高危项，`01-成品/` 暂不可发布。');
      lines.push('');
    }
  }

  lines.push('## 目录约定');
  lines.push('');
  const present = new Set((manifest.layout || []).map((b) => b.id));
  for (const b of manifest.layout || []) {
    lines.push(`- \`${b.dir}/\` — ${b.label}`);
  }
  const unused = BUCKET_ORDER.filter((id) => !present.has(id) && BUCKETS[id]);
  if (unused.length) {
    lines.push('');
    lines.push(`> 本会话未用到、因此未创建的桶：${unused.map((id) => `\`${BUCKETS[id].dir}/\``).join('、')}。空桶不建，用到了才会出现。`);
  }
  lines.push('');
  lines.push(`> 会话根目录只允许这 4 个文件：${ROOT_FILES.map((f) => `\`${f}\``).join('、')}。`);
  lines.push('');
  lines.push(`> 本文件由 dsh-session-archive 自动生成于 ${formatTime(Date.now())}，手动修改会被覆盖。`);
  lines.push('');

  return lines.join('\n');
}

/** 表格单元格转义：反引号与竖线会把 markdown 表格撑破 */
function cell(value) {
  const text = String(value == null ? '' : value);
  return `\`${text.replace(/`/g, "'").replace(/\|/g, '\\|')}\``;
}

function dimLabel(id) {
  const map = { DEV: '开发', FIX: '修复', ASK: '咨询', OPS: '运维', DOC: '文案', DATA: '数据' };
  return map[id] || id;
}

function confidenceLabel(c) {
  return { high: '高', medium: '中 ⚠️', low: '低 ❓' }[c] || c;
}

function lifecycleLabel(s) {
  return { active: '进行中', archived: '已归档', published: '已发布（只读）' }[s] || s || '进行中';
}

/** 校验：根目录是否只允许那 4 个文件 */
export function validateRoot(entries = []) {
  const bad = [];
  for (const e of entries) {
    if (e.isDirectory && e.isDirectory()) continue;
    const name = typeof e === 'string' ? e : e.name;
    if (!ROOT_FILES.includes(name)) bad.push(name);
  }
  return { ok: bad.length === 0, extra: bad };
}
