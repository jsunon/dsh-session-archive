// 从 聊天记录.md 复原每个代码块的「前文」
//
// 迁移历史会话时，代码块早就被抽成 `代码-N-M.ext`，原始上下文只剩聊天记录里那份。
// 把「第 N 段消息的第 M 个代码块」前面的那段正文捞回来，语义命名才有依据，
// 否则 122 个文件全叫 `片段-104-03.js`，等于没命名。
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 把一段 markdown 按 ``` 围栏切成 [{kind:'text'|'code', text, code, lang}] */
function splitFences(text) {
  const parts = [];
  const lines = String(text || '').split('\n');
  let buf = [];
  let inFence = false;
  let fence = '';
  let lang = '';
  for (const line of lines) {
    const m = line.match(/^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/);
    if (!inFence && m) {
      if (buf.length) parts.push({ kind: 'text', text: buf.join('\n') });
      buf = [];
      inFence = true;
      fence = m[1];
      lang = m[2] || '';
      continue;
    }
    if (inFence && m && m[1].startsWith(fence[0]) && m[1].length >= fence.length && !m[2]) {
      parts.push({ kind: 'code', code: buf.join('\n'), lang });
      buf = [];
      inFence = false;
      continue;
    }
    buf.push(line);
  }
  if (buf.length) parts.push({ kind: inFence ? 'code' : 'text', text: buf.join('\n'), code: buf.join('\n'), lang });
  return parts;
}

/**
 * @returns {Map<string, string>} `"seq-blockNo"` → 该代码块前最后一段正文
 */
export async function beforeTextMap(dir) {
  const text = await readFile(join(dir, '聊天记录.md'), 'utf8').catch(() => '');
  const map = new Map();
  if (!text) return map;

  // 只把「## <数字> · <角色>」当成消息边界。助手正文里自带 `## 一、现状诊断` 这类标题，
  // 按 /^## /m 切会把一条消息切成十几段，围栏被割裂、前文全丢 —— 那正是命名退化成
  // `片段-006-04` 的根因。用前瞻断言只切真正的消息头。
  const sections = text.split(/^(?=## \d+\s*·)/m).slice(1);
  for (const section of sections) {
    const head = section.match(/^##\s+(\d+)\s*·/);
    if (!head) continue;
    const seq = Number(head[1]);
    const body = section.slice(section.indexOf('\n') + 1);
    let blockNo = 0;
    let pending = '';
    for (const part of splitFences(body)) {
      if (part.kind === 'text') {
        const t = String(part.text || '').trim();
        if (t && !t.startsWith('> 代码已单独保存')) pending = t;
        continue;
      }
      blockNo += 1;
      if (pending) map.set(`${seq}-${blockNo}`, pending);
    }
  }
  return map;
}
