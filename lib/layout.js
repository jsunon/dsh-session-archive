// 会话归档 · 布局层（维度 → 要建哪些桶）
//
// 原则：空桶一律不建。纯提问会话不该被塞 5 个空目录。
// 桶名与维度名解耦：两个维度可共用一个桶，一个维度可激活多个桶。

/** 桶定义：id → 目录名与内部结构 */
export const BUCKETS = {
  deliver: {
    dir: '01-成品',
    label: '成品（唯一可 git push）',
    subdirs: [],
    writable: false,        // 只读导出：真源在 src/snapshot
    deletable: false,
  },
  src: {
    dir: '02-源码',
    label: '源码（唯一可写真源）',
    subdirs: ['原始', '补丁', '快照'],
    writable: true,
    deletable: false,
  },
  tools: {
    dir: '03-工具',
    label: '可复用脚本',
    subdirs: [],            // ≥3 个文件才建 tests/ ops/
    writable: true,
    deletable: false,
  },
  output: {
    dir: '04-产物',
    label: '本会话生成的非代码产出',
    subdirs: ['长期', '一次性'],
    writable: true,
    deletable: false,
  },
  ref: {
    dir: '05-参考',
    label: '外部资料与结论',
    subdirs: [],
    writable: true,
    deletable: false,
  },
  trash: {
    dir: '_临时',
    label: '整个删掉零影响',
    subdirs: ['重复', '未归类', '失败尝试', '探测'],
    writable: true,
    deletable: true,
  },
};

/** 桶在目录里的固定顺序 */
export const BUCKET_ORDER = ['deliver', 'src', 'tools', 'output', 'ref', 'trash'];

/** 会话根目录允许出现的文件（多一个都算违规） */
export const ROOT_FILES = ['README.md', 'MANIFEST.json', '聊天记录.md', 'session.json'];

/** 工具桶细分子目录的阈值：≥3 个文件才分 tests/ ops/ */
export const TOOLS_SPLIT_MIN = 3;

/**
 * 由激活维度算出目录计划。
 * @param {string[]} active  激活维度 id 列表
 * @param {{alwaysTrash?:boolean}} options
 * @returns {{buckets:Array<{id,dir,label,subdirs,writable,deletable}>, empty:boolean}}
 */
export function planLayout(active = [], options = {}) {
  const ids = [];
  for (const id of active) {
    const dim = DIMENSION_BUCKETS[id];
    if (!dim) continue;
    for (const bucket of dim) {
      if (!ids.includes(bucket)) ids.push(bucket);
    }
  }
  // 可删桶永远建：它是兜底容器，没有它可疑文件无处可去
  if (options.alwaysTrash !== false && !ids.includes('trash')) ids.push('trash');

  ids.sort((a, b) => BUCKET_ORDER.indexOf(a) - BUCKET_ORDER.indexOf(b));

  const buckets = ids.map((id) => ({ id, ...BUCKETS[id] }));
  return { buckets, empty: buckets.filter((b) => b.id !== 'trash').length === 0 };
}

/** 维度 → 桶（与 dimensions.js 的 DIMENSIONS[].buckets 保持一致，此处是布局侧副本） */
const DIMENSION_BUCKETS = {
  DEV: ['deliver', 'src', 'tools'],
  FIX: ['src'],
  ASK: ['ref'],
  OPS: ['tools', 'output'],
  DATA: ['output', 'tools'],
  DOC: ['output', 'ref'],
};

/** 给 README 用的一句话说明 */
export function describeBucket(id) {
  const b = BUCKETS[id];
  if (!b) return '';
  return `\`${b.dir}/\` — ${b.label}`;
}

/** 目录名 → 桶 id（反向查，迁移/校验用） */
export function bucketIdOfDir(dirName) {
  for (const [id, b] of Object.entries(BUCKETS)) {
    if (b.dir === dirName) return id;
  }
  return '';
}
