// 会话归档 · 开源前安全扫描
// 目标：上传开源之前，先把「密钥 / 私钥 / 绝对路径 / 内网地址 / 个人目录」拦下来。
// 命中即阻断导出，不阻断归档（归档照常，只是不给发布）。
//
// 设计取舍：宁可多报，不可漏报。误报的代价是你看一眼，漏报的代价是事故。

export const RULES = [
  {
    id: 'openai-key',
    label: '疑似 API Key',
    severity: 'block',
    re: /\b(sk-[A-Za-z0-9_-]{16,}|sk-proj-[A-Za-z0-9_-]{16,})\b/g,
  },
  {
    id: 'github-token',
    label: '疑似 GitHub Token',
    severity: 'block',
    re: /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  },
  {
    id: 'aws-key',
    label: '疑似 AWS AccessKey',
    severity: 'block',
    re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    id: 'slack-token',
    label: '疑似 Slack Token',
    severity: 'block',
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    id: 'bearer',
    label: '疑似 Bearer Token',
    severity: 'warn',
    re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g,
  },
  {
    id: 'private-key',
    label: '私钥文件内容',
    severity: 'block',
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    id: 'password-assign',
    label: '疑似硬编码口令',
    severity: 'warn',
    re: /(?:password|passwd|pwd|secret|token|apikey|api_key)\s*[:=]\s*['"][^'"\n]{6,}['"]/gi,
  },
  {
    id: 'win-abs-path',
    label: 'Windows 绝对路径',
    severity: 'warn',
    re: /\b[A-Za-z]:\\\\?[^\s'"]{2,}/g,
  },
  {
    id: 'posix-home',
    label: 'POSIX 家目录路径',
    severity: 'warn',
    re: /(?:\/home\/|\/Users\/)[A-Za-z0-9._-]+/g,
  },
  {
    id: 'private-ip',
    label: '内网地址',
    severity: 'warn',
    re: /\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/g,
  },
  {
    id: 'loopback',
    label: '本机回环地址',
    severity: 'info',
    re: /\b(?:127\.0\.0\.1|localhost)(?::\d{2,5})?\b/g,
  },
  {
    id: 'dsh-home',
    label: '本机 DSH 目录',
    severity: 'warn',
    re: /(?:~\/\.dsh|\.dsh[\\/]|deepseek harness)/gi,
  },
];

/** 单个文件扫描：返回 findings[] */
export function scanText(text, meta = {}) {
  const src = String(text ?? '');
  const findings = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m;
    let hits = 0;
    while ((m = rule.re.exec(src)) !== null) {
      hits += 1;
      if (hits > 20) break;
      const at = m.index;
      const line = src.slice(0, at).split('\n').length;
      findings.push({
        rule: rule.id,
        label: rule.label,
        severity: rule.severity,
        line,
        sample: redact(m[0]),
        file: meta.path || '',
      });
    }
  }
  return findings;
}

/** 打码：保留前 4 后 4，中间用 * 填 */
export function redact(value) {
  const s = String(value ?? '');
  if (s.length <= 12) return s.slice(0, 2) + '***';
  return `${s.slice(0, 4)}***${s.slice(-4)}`;
}

/** 汇总：有 block 级命中就不能发布 */
export function summarize(findings) {
  const blocking = findings.filter((f) => f.severity === 'block');
  const warning = findings.filter((f) => f.severity === 'warn');
  const info = findings.filter((f) => f.severity === 'info');
  return {
    ok: blocking.length === 0,
    blocking,
    warning,
    info,
    total: findings.length,
    verdict: blocking.length
      ? `阻断：${blocking.length} 处高危（密钥/私钥）`
      : warning.length
        ? `可发布，但有 ${warning.length} 处需人工确认（路径/内网地址）`
        : '通过',
  };
}
