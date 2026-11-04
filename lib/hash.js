// 会话归档 · 内容哈希（幂等与去重的基础）
// 作用：同一段代码无论被写几次，hash 相同 → 不再产生 `-2` 副本。
import { createHash } from 'node:crypto';

/** 归一化后再算 hash：统一换行、去掉行尾空白，避免「内容一样但字节不同」 */
export function normalizeForHash(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/, '');
}

export function sha256(text) {
  return createHash('sha256').update(normalizeForHash(text), 'utf8').digest('hex');
}

export function shortHash(text, length = 12) {
  return sha256(text).slice(0, Math.max(6, Math.min(64, Number(length) || 12)));
}

/** 幂等键：同一会话、同一消息序号、同一块序号、同一内容 → 同一个键 */
export function idempotencyKey({ sessionId, seq, blockNo, content }) {
  return sha256(`${sessionId || ''}|${seq || 0}|${blockNo || 0}|${sha256(content)}`);
}
