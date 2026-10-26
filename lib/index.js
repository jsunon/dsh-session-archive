// 会话归档（dsh-session-archive）
// 接管会话落盘：每条会话一个独立文件夹，聊天记录、代码、产出文件平铺在里面
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { readFile, writeFile, rename, rm, stat, readdir, symlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname, relative, resolve, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildName, fallbackName, safeDirName, uniqueName } from './naming.js';
import { headerBlock, renderEntries, textOfMessage, formatTime } from './render.js';
import {
  DEFAULTS, bucketForFile, ensureDir, listFiles, loadConfig, moveFile, normalizeConfig,
  pathState, readIndex, saveConfigPatch, writeIndex, writeJsonAtomic, bucketDir, INDEX_PATH, CONFIG_PATH,
} from './store.js';

export const name = 'dsh-session-archive';
export const inject = [];

/** 本插件的真实目录（宿主 profile 里的 node_modules/<name> 是它的 junction） */
const PLUGIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

const ROUTE = '/dsh-session-archive';
const API = `${ROUTE}/api`;

export function apply(ctx, rawConfig) {
  const state = {
    config: normalizeConfig(rawConfig || DEFAULTS),
    index: null,
    inFlight: new Map(),
    timers: new Map(),
    lastRoot: new Map(),
    ready: false,
    stats: { archived: 0, updated: 0, skipped: 0, errors: 0, lastError: '' },
  };

  const cfg = () => state.config;

  /* ---------------- 基础工具 ---------------- */

  function sessionCwd(session) {
    const header = (session && session.header) || {};
    if (header.cwd) return header.cwd;
    try {
      const registry = ctx.get('workspaceRegistry');
      const list = registry && typeof registry.list === 'function' ? registry.list() : [];
      for (const workspace of list || []) {
        if (Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(session.id)) return workspace.path;
      }
    } catch {
      /* ignore */
    }
    return '';
  }

  function sessionTitle(session) {
    try {
      const svc = ctx.get('sessionTitle');
      const t = svc && typeof svc.get === 'function' ? svc.get(session) : undefined;
      if (t && typeof t.title === 'string' && t.title.trim()) return t.title.trim();
    } catch {
      /* ignore */
    }
    // 兜底：直接读 session/title 事件
    try {
      const events = session.snapshotEvents();
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const ev = events[i];
        if (ev && ev.type === 'session/title' && ev.data && ev.data.title) return String(ev.data.title);
      }
    } catch {
      /* ignore */
    }
    return '';
  }

  /** 宿主注入的系统块不算聊天内容（运行上下文、时间戳注入等） */
  const INJECTED_PREFIXES = [
    'Current runtime context',
    'Time sampled while preparing',
    'Elapsed since the preceding',
    '<system-reminder>',
    'The approval policy changed',
  ];

  function isInjected(text) {
    const head = String(text || '').trimStart();
    return INJECTED_PREFIXES.some((prefix) => head.startsWith(prefix));
  }

  function collectMessages(session) {
    let messages = [];
    try {
      messages = session.deriveMessages() || [];
    } catch {
      messages = [];
    }
    const times = messageTimes(session);
    const out = [];
    for (let i = 0; i < messages.length; i += 1) {
      const message = messages[i];
      const role = message && message.role === 'user' ? '用户' : message && message.role === 'assistant' ? '助手' : '';
      if (!role) continue;
      const text = textOfMessage(message);
      if (!text) continue;
      if (role === '用户' && isInjected(text)) continue;
      out.push({ role, text, time: times[i] || 0 });
    }
    return out;
  }

  function messageTimes(session) {
    const times = [];
    try {
      for (const ev of session.snapshotEvents() || []) {
        if (ev && (ev.type === 'user/message' || ev.type === 'assistant/message')) times.push(ev.time || 0);
      }
    } catch {
      /* ignore */
    }
    return times;
  }

  function skipReason(session, messages, title) {
    const header = (session && session.header) || {};
    if (header.origin === 'subagent' && !cfg().includeSubagents) return 'subagent';
    if (header.isSeeded) return 'seeded';
    const probe = `${title} ${messages.slice(0, 2).map((m) => m.text).join(' ')}`;
    for (const word of cfg().blacklist) {
      if (word && probe.includes(word)) return `blacklist:${word}`;
    }
    return '';
  }

  /* ---------------- 归档核心 ---------------- */

  async function archive(session, options = {}) {
    const id = session && session.id;
    if (!id) return { ok: false, reason: 'no-session' };
    if (!cfg().enabled && !options.force) return { ok: false, reason: 'disabled' };

    const running = state.inFlight.get(id);
    if (running) {
      // 同会话串行：等上一轮结束再跑本轮
      try {
        await running.catch(() => {});
      } catch {
        /* ignore */
      }
    }
    const task = doArchive(session, options).catch((error) => {
      state.stats.errors += 1;
      state.stats.lastError = String((error && error.message) || error);
      return { ok: false, reason: 'error', error: String((error && error.message) || error) };
    });
    state.inFlight.set(id, task);
    try {
      return await task;
    } finally {
      if (state.inFlight.get(id) === task) state.inFlight.delete(id);
    }
  }

  async function doArchive(session, options) {
    const id = session.id;
    const root = sessionCwd(session);
    if (!root) return { ok: false, reason: 'no-cwd' };

    const messages = collectMessages(session);
    const title = sessionTitle(session);
    const blocked = skipReason(session, messages, title);
    if (blocked && !options.force) {
      state.stats.skipped += 1;
      return { ok: false, reason: blocked };
    }
    if (!messages.length && !title) return { ok: false, reason: 'empty' };

    // 容器名留空 = 会话文件夹直接放在工作区根目录
    const containerName = String(cfg().containerName || '').trim();
    const container = containerName ? join(root, containerName) : root;
    await migrateLegacyContainer(root, containerName);
    const index = await ensureIndex();
    // 旧容器里的会话文件夹刚被提到根目录：同步索引里的路径，避免当成新会话重写
    const legacyPrefix = `${join(root, '会话归档')}${sep}`;
    for (const entry of Object.values(index.sessions)) {
      const oldDir = String(entry.dir || '');
      if (!oldDir.startsWith(legacyPrefix)) continue;
      const nextDir = join(root, basename(oldDir));
      if (existsSync(nextDir)) entry.dir = nextDir;
    }
    const previous = index.sessions[id];
    const taken = new Set(
      Object.entries(index.sessions)
        .filter(([otherId]) => otherId !== id)
        .map(([, entry]) => String(entry.name || '')),
    );

    let dirName = buildName({
      title,
      firstUserText: messages[0] ? messages[0].text : '',
      template: cfg().nameTemplate,
      minChars: cfg().minChars,
      maxChars: cfg().maxChars,
      routeHint: (session.header && session.header.agentPreset) || '',
    });
    if (!dirName) dirName = fallbackName();
    dirName = uniqueName(dirName, taken);

    let dir = join(container, dirName);
    let renamed = false;

    if (previous && previous.dir && previous.dir !== dir && existsSync(previous.dir)) {
      // 名称随会话进展变化：把旧文件夹改名（内含我们的三个产物）
      const targetFree = !existsSync(dir);
      if (targetFree) {
        try {
          await rename(previous.dir, dir);
          renamed = true;
          // 文件夹里可能躺着被宿主 junction 引用的插件目录（例如本插件自己），
          // 改名后要把链接重新指过去，否则插件就“搬断”了
          await repointJunctions(previous.dir, dir);
        } catch {
          dir = previous.dir;
          dirName = previous.name || basename(previous.dir);
        }
      } else {
        dir = previous.dir;
        dirName = previous.name || basename(previous.dir);
      }
    } else if (previous && previous.dir && !existsSync(previous.dir)) {
      // 用户手工移动过：尊重现状，不重建旧路径
      const known = previous.dir;
      if (existsSync(known)) dir = known;
    }

    const dirs = cfg().dirs;
    const codeDir = bucketDir(dir, dirs.code);
    const otherDir = bucketDir(dir, dirs.other);
    const chatFile = join(dir, dirs.chat);

    await ensureDir(dir);
    if (codeDir !== dir) await ensureDir(codeDir);
    if (otherDir !== dir) await ensureDir(otherDir);
    // 旧版把文件分在「源码文件/」「其他产出文件/」：拍平回会话文件夹根
    await flattenBuckets(dir, basename(dir));

    /* ---- 聊天记录增量写入 ---- */
    const written = Number(previous && previous.written) || 0;
    let startIndex = written;
    let appendText = '';
    const metaNow = {
      name: dirName,
      sessionId: id,
      cwd: root,
      dir,
      createdAt: (session.header && session.header.createdAt) || Date.now(),
      updatedAt: Date.now(),
      total: messages.length,
    };
    const ensureHeader = async () => {
      const exists = await pathState(chatFile);
      if (!exists.exists) {
        await writeFile(chatFile, headerBlock(metaNow), 'utf8');
        startIndex = 0;
      } else {
        await syncHeader(chatFile, metaNow);
      }
    };
    if (messages.length < written) {
      // 会话被压缩/回滚，重写全文
      await rm(chatFile, { force: true });
      startIndex = 0;
    }
    await ensureHeader();

    const pending = messages.slice(startIndex);
    if (pending.length) {
      const rendered = renderEntries(pending, { config: cfg(), dirs, startIndex });
      for (const file of rendered.codeFiles) {
        const bucket = file.dir === 'code' ? codeDir : otherDir;
        const target = await uniqueFile(join(bucket, file.name));
        await writeFile(target, file.content, 'utf8');
      }
      appendText = rendered.markdown;
      await writeFile(chatFile, `${appendText}\n`, { encoding: 'utf8', flag: 'a' });
      state.stats.updated += 1;
    } else {
      state.stats.archived += 1;
    }

    /* ---- 会话元数据 ---- */
    if (cfg().writeSessionJson) {
      const meta = {
        sessionId: id,
        name: dirName,
        workspace: root,
        dir,
        createdAt: (session.header && session.header.createdAt) || 0,
        updatedAt: Date.now(),
        agentPreset: (session.header && session.header.agentPreset) || '',
        title,
        messages: messages.length,
        structure: { chat: dirs.chat, code: dirs.code ? `${dirs.code}/` : '(平铺在会话文件夹)', other: dirs.other ? `${dirs.other}/` : '(平铺在会话文件夹)' },
      };
      await writeJsonAtomic(join(dir, 'session.json'), meta);
    }

    /* ---- 文件分流：会话目录根部 + 工作区根部的散文件 ---- */
    let diverted = 0;
    if (cfg().divertWorkspaceFiles) {
      diverted += await divertLoose(dir, { codeDir, otherDir, dirs });
      if (options.divertWorkspace !== false) {
        // 只收「本次会话开始之后」产生的工作区散文件，避免把用户原有文件搬走
        const since = ((session.header && session.header.createdAt) || Date.now()) - 120000;
        diverted += await divertLoose(root, { codeDir, otherDir, dirs, since });
        state.lastRoot.set(root, id);
      }
    }

    /* ---- 收纳工作区根目录的其它文件夹/文件 ---- */
    const absorbed = await absorbRoot(root, dir, id);

    /* ---- 自动压缩 ---- */
    if (cfg().compressAfter > 0 && messages.length > cfg().compressAfter) {
      await compressHistory(dir, dirs);
    }

    // 自检用的合成会话不进正式索引
    if (!String(id).startsWith('selftest-')) {
      index.sessions[id] = {
        sessionId: id,
        name: dirName,
        dir,
        workspace: root,
        written: messages.length,
        createdAt: (session.header && session.header.createdAt) || Date.now(),
        updatedAt: Date.now(),
        title,
        renamed,
      };
      await writeIndex(index);
    }

    return {
      ok: true,
      sessionId: id,
      dir,
      name: dirName,
      appended: pending.length,
      diverted,
      absorbed,
      renamed,
    };
  }

  /** 改名后同步聊天记录头（标题/目录变化时整段替换，正文原样保留） */
  async function syncHeader(chatFile, meta) {
    let raw = '';
    try {
      raw = await readFile(chatFile, 'utf8');
    } catch {
      return;
    }
    const head = headerBlock(meta);
    if (raw.startsWith(head)) return;
    const marker = '\n---\n';
    const idx = raw.indexOf(marker);
    const body = idx >= 0 ? raw.slice(idx + marker.length) : raw;
    await writeFile(chatFile, `${head}${body.replace(/^\n+/, '')}`, 'utf8');
  }

  /** 旧布局（<工作区>/会话归档/<会话>/）升级：把会话文件夹提到工作区根目录 */
  async function migrateLegacyContainer(root, containerName) {
    const legacy = join(root, '会话归档');
    if (containerName === '会话归档') return 0;
    if (!existsSync(legacy)) return 0;
    let moved = 0;
    let entries = [];
    try {
      entries = await readdir(legacy, { withFileTypes: true });
    } catch {
      return 0;
    }
    for (const entry of entries) {
      const from = join(legacy, entry.name);
      const to = join(root, entry.name);
      if (existsSync(to)) continue;
      try {
        await rename(from, to);
        moved += 1;
      } catch {
        /* 下次再试 */
      }
    }
    try {
      const rest = await readdir(legacy);
      if (!rest.length) await rm(legacy, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return moved;
  }

  /** 宿主通过 profiles 下 node_modules 的 junction 引用着的目录，绝不搬动 */
  function protectedTargets() {
    const out = new Set();
    const profiles = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'profiles');
    let names = [];
    try {
      names = readdirSync(profiles);
    } catch {
      return out;
    }
    for (const profile of names) {
      const nm = join(profiles, profile, 'node_modules');
      let entries = [];
      try {
        entries = readdirSync(nm, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isSymbolicLink()) continue;
        try {
          out.add(resolve(realpathSync(join(nm, entry.name))));
        } catch {
          /* ignore */
        }
      }
    }
    return out;
  }

  /** 工作区根目录里的其它文件夹/文件，收进会话文件夹（仅当该工作区只有一个会话时） */
  async function absorbRoot(root, sessionDir, id) {
    if (!cfg().absorbWorkspaceRoot) return 0;
    const index = await ensureIndex();
    const own = Object.entries(index.sessions).filter(([, e]) => resolve(String(e.workspace || '')) === resolve(root));
    if (own.length !== 1 || own[0][0] !== id) return 0;
    const keep = new Set(own.map(([, e]) => basename(String(e.dir || ''))));
    keep.add(basename(sessionDir));
    keep.add(basename(PLUGIN_DIR));
    const protectedSet = protectedTargets();
    let entries = [];
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      return 0;
    }
    let moved = 0;
    for (const entry of entries) {
      const name = entry.name;
      if (keep.has(name)) continue;
      if (name.startsWith('.')) continue;
      if (name === 'node_modules') continue;
      const from = join(root, name);
      if (resolve(from) === resolve(sessionDir)) continue;
      try {
        if (protectedSet.has(resolve(realpathSync(from)))) continue;
      } catch {
        /* ignore */
      }
      const to = join(sessionDir, name);
      if (existsSync(to)) continue;
      try {
        await rename(from, to);
        moved += 1;
      } catch {
        /* 占用中则下轮再试 */
      }
    }
    return moved;
  }

  /**
   * 自愈：宿主 profile 的 node_modules/<本插件名> 是 junction，
   * 一旦它指向的旧路径没了（会话文件夹被改名/被收纳），宿主就报「包不可用」。
   * 这里把指向本插件名的 junction 重新指回当前真实目录。
   */
  async function ensureOwnLinks() {
    const profiles = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'profiles');
    let names = [];
    try {
      names = readdirSync(profiles);
    } catch {
      return 0;
    }
    const want = resolve(PLUGIN_DIR);
    let fixed = 0;
    for (const profile of names) {
      const linkPath = join(profiles, profile, 'node_modules', name);
      let isLink = false;
      try {
        isLink = readdirSync(join(profiles, profile, 'node_modules'), { withFileTypes: true })
          .some((entry) => entry.name === name && entry.isSymbolicLink());
      } catch {
        continue;
      }
      if (!isLink) continue;
      let target = '';
      try {
        target = resolve(realpathSync(linkPath));
      } catch {
        target = '';
      }
      if (target === want) continue;
      try {
        await rm(linkPath, { force: true });
        await symlink(want, linkPath, 'junction');
        fixed += 1;
      } catch {
        /* 修不好就保持原样 */
      }
    }
    if (fixed) {
      try {
        process.stderr.write(`[dsh-session-archive] 已把 ${fixed} 个 profile 链接重新指回 ${want}\n`);
      } catch {
        /* ignore */
      }
    }
    return fixed;
  }

  /** 会话文件夹改名后，把宿主 node_modules 里指向它内部的 junction 重新指向新路径 */
  async function repointJunctions(oldDir, newDir) {
    const from = resolve(oldDir) + sep;
    const profiles = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'profiles');
    let names = [];
    try {
      names = readdirSync(profiles);
    } catch {
      return 0;
    }
    let fixed = 0;
    for (const profile of names) {
      const nm = join(profiles, profile, 'node_modules');
      let entries = [];
      try {
        entries = readdirSync(nm, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isSymbolicLink()) continue;
        const linkPath = join(nm, entry.name);
        let target = '';
        try {
          target = resolve(realpathSync(linkPath));
        } catch {
          continue;
        }
        if (!`${target}${sep}`.startsWith(from)) continue;
        const next = join(resolve(newDir), relative(resolve(oldDir), target));
        try {
          await rm(linkPath, { force: true });
          await symlink(next, linkPath, 'junction');
          fixed += 1;
        } catch {
          /* 修不好就保持原样，交给人工 */
        }
      }
    }
    return fixed;
  }

  /** 旧版「分类桶」目录名：里面的东西要按原样搬回，桶本身不该存在 */
  const LEGACY_BUCKETS = ['源码文件', '其他产出文件', '插件源码（如有）', '插件源码', '其他分类', '其他文件（删除也没有事）', '整理'];

  /** 把旧版分类桶（源码文件/、插件源码/、整理/…）里的内容按原名搬回会话文件夹根，并删掉空桶 */
  async function flattenBuckets(dir, dirName) {
    const buckets = [cfg().dirs.code, cfg().dirs.other, ...LEGACY_BUCKETS]
      .map((s) => String(s || '').trim())
      .filter((s, i, arr) => s && arr.indexOf(s) === i && s !== dirName);
    for (const bucket of buckets) {
      const sub = join(dir, bucket);
      if (!existsSync(sub)) continue;
      let entries = [];
      try {
        entries = await readdir(sub, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const from = join(sub, entry.name);
        let to = join(dir, entry.name);
        if (existsSync(to)) to = await uniqueFile(to);
        try {
          await rename(from, to);
        } catch {
          /* 占用中：下次再搬 */
        }
      }
      try {
        const rest = await readdir(sub);
        if (!rest.length) await rm(sub, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  async function uniqueFile(path) {
    const info = await pathState(path);
    if (!info.exists) return path;
    const dot = path.lastIndexOf('.');
    const base = dot > path.lastIndexOf(sep) ? path.slice(0, dot) : path;
    const ext = dot > path.lastIndexOf(sep) ? path.slice(dot) : '';
    for (let i = 2; i < 1000; i += 1) {
      const candidate = `${base}-${i}${ext}`;
      const s = await pathState(candidate);
      if (!s.exists) return candidate;
    }
    return `${base}-${Date.now()}${ext}`;
  }

  const NEVER_MOVE = new Set(['会话归档', '.git', '.gitignore', '.dsh']);

  async function divertLoose(dir, options) {
    const dirs = options.dirs;
    const entries = await listFiles(dir);
    let count = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fileName = entry.name;
      if (fileName === dirs.chat || fileName === 'session.json') continue;
      if (/\.(tmp|bak)$/i.test(fileName)) continue;
      const src = join(dir, fileName);
      if (options.since) {
        const info = await pathState(src);
        if (info.exists && info.mtimeMs < options.since) continue;
      }
      const bucket = bucketForFile(fileName) === 'code' ? options.codeDir : options.otherDir;
      // 平铺模式下目标就是原目录，无需搬动
      if (resolve(bucket) === resolve(dir)) continue;
      const target = await uniqueFile(join(bucket, fileName));
      try {
        await moveFile(src, target);
        count += 1;
      } catch {
        /* 占用中则下轮再试 */
      }
    }
    return count;
  }

  async function compressHistory(dir, dirs) {
    const chat = join(dir, dirs.chat);
    const info = await pathState(chat);
    if (!info.exists) return;
    const archived = join(dir, `聊天记录-历史-${formatTime(Date.now()).replace(/[: ]/g, '-')}.md`);
    try {
      await rename(chat, archived);
    } catch {
      return;
    }
    await writeFile(chat, [
      `# 聊天记录（续）`,
      '',
      `> 较早内容已归档到 \`${basename(archived)}\`，本文件只保留最近的对话。`,
      '',
    ].join('\n'), 'utf8');
  }

  async function cleanupHistory(days) {
    if (!days) return 0;
    const index = await ensureIndex();
    let removed = 0;
    const cutoff = Date.now() - days * 86400000;
    for (const entry of Object.values(index.sessions)) {
      const entries = await listFiles(entry.dir);
      for (const file of entries) {
        if (!file.isFile()) continue;
        if (!/^聊天记录-历史-.*\.md$/.test(file.name)) continue;
        const full = join(entry.dir, file.name);
        const info = await pathState(full);
        if (info.exists && info.mtimeMs < cutoff) {
          await rm(full, { force: true });
          removed += 1;
        }
      }
    }
    return removed;
  }

  async function ensureIndex() {
    if (state.index) return state.index;
    state.index = await readIndex();
    return state.index;
  }

  function allSessions() {
    try {
      const svc = ctx.get('sessions');
      if (svc && typeof svc.list === 'function') return svc.list() || [];
    } catch {
      /* ignore */
    }
    return [];
  }

  async function archiveAll(options = {}) {
    const results = [];
    for (const session of allSessions()) {
      results.push(await archive(session, options));
    }
    return results;
  }

  /* ---------------- 事件接入 ---------------- */

  function schedule(session, delay) {
    const id = session && session.id;
    if (!id) return;
    const existing = state.timers.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      state.timers.delete(id);
      void archive(session);
    }, Math.max(200, delay));
    if (typeof timer.unref === 'function') timer.unref();
    state.timers.set(id, timer);
  }

  ctx.effect(() => {
    const offCreated = ctx.on('session/created', (session) => {
      schedule(session, cfg().settleMs);
    });
    const offEvent = ctx.on('session/event', (session, event) => {
      if (!event) return;
      if (event.type === 'user/message' || event.type === 'session/title' || event.type === 'turn/end' || event.type === 'compaction/summary') {
        const delay = event.type === 'session/title' ? Math.max(1200, cfg().refreshMs / 4) : cfg().settleMs;
        schedule(session, delay);
      }
    }, { global: true });
    const offDisposed = ctx.on('session/disposed', (payload) => {
      const id = typeof payload === 'string' ? payload : (payload && payload.session && payload.session.id) || '';
      const timer = id && state.timers.get(id);
      if (timer) {
        clearTimeout(timer);
        state.timers.delete(id);
      }
    });
    return () => {
      offCreated && offCreated();
      offEvent && offEvent();
      offDisposed && offDisposed();
      for (const timer of state.timers.values()) clearTimeout(timer);
      state.timers.clear();
    };
  }, 'dsh-session-archive/session-hooks');

  ctx.effect(() => {
    const startup = setTimeout(() => {
      void (async () => {
        await ensureOwnLinks();
        await loadConfig(cfg());
        state.config = normalizeConfig(await loadConfig(cfg()));
        state.ready = true;
        await archiveAll({});
      })().catch(() => {});
    }, Math.max(500, cfg().settleMs));
    if (typeof startup.unref === 'function') startup.unref();

    const tick = setInterval(() => {
      void ensureOwnLinks().catch(() => {});
      void archiveAll({}).catch(() => {});
    }, cfg().tickMs);
    if (typeof tick.unref === 'function') tick.unref();

    return () => {
      clearTimeout(startup);
      clearInterval(tick);
    };
  }, 'dsh-session-archive/sweeper');

  /* ---------------- HTTP 接口 + 设置面板 ---------------- */

  const mounted = ctx.inject(['webServer'], (host) => {
    const server = host.webServer || host;
    const routes = [];
    const add = (path, handler) => {
      const dispose = server.register({ kind: 'exact', path, handler });
      routes.push(dispose);
    };

    const json = (res, code, body) => {
      res.statusCode = code;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body, null, 2));
    };

    add(`${API}/health`, async (req, res) => {
      json(res, 200, {
        ok: true,
        plugin: name,
        enabled: cfg().enabled,
        options: cfg(),
        ready: state.ready,
        stats: state.stats,
        paths: { index: INDEX_PATH(), config: CONFIG_PATH() },
      });
    });

    add(`${API}/state`, async (req, res) => {
      const index = await ensureIndex();
      const rows = Object.values(index.sessions).map((entry) => ({
        sessionId: entry.sessionId,
        name: entry.name,
        dir: entry.dir,
        workspace: entry.workspace,
        written: entry.written,
        updatedAt: entry.updatedAt,
      }));
      json(res, 200, { ok: true, sessions: rows, stats: state.stats });
    });

    add(`${API}/archive`, async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const sessionId = url.searchParams.get('sessionId');
      const results = sessionId
        ? [await archive(allSessions().find((s) => s.id === sessionId) || { id: sessionId }, { force: true })]
        : await archiveAll({ force: true });
      json(res, 200, { ok: true, results });
    });

    add(`${API}/config`, async (req, res) => {
      if (req.method === 'POST') {
        const body = await readBody(req);
        let patch = {};
        try {
          patch = JSON.parse(body || '{}');
        } catch {
          json(res, 400, { ok: false, error: 'invalid JSON' });
          return;
        }
        const saved = await saveConfigPatch(patch);
        state.config = normalizeConfig({ ...cfg(), ...saved });
        json(res, 200, { ok: true, options: cfg() });
        return;
      }
      json(res, 200, { ok: true, options: cfg() });
    });

    add(`${API}/restore`, async (req, res) => {
      const index = await ensureIndex();
      let moved = 0;
      for (const entry of Object.values(index.sessions)) {
        for (const sub of [cfg().dirs.code, cfg().dirs.other, '源码文件', '其他产出文件']) {
          if (!String(sub || '').trim()) continue;
          const bucket = join(entry.dir, sub);
          const files = await listFiles(bucket);
          for (const file of files) {
            if (!file.isFile()) continue;
            const target = await uniqueFile(join(entry.workspace, file.name));
            try {
              await moveFile(join(bucket, file.name), target);
              moved += 1;
            } catch {
              /* ignore */
            }
          }
        }
      }
      json(res, 200, { ok: true, moved });
    });

    add(`${API}/selftest`, async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const target = url.searchParams.get('dir');
      const result = await selfTest(target);
      json(res, 200, result);
    });

    add(ROUTE, async (req, res) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(settingsPage(cfg(), state));
    });
    add(`${ROUTE}/`, async (req, res) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(settingsPage(cfg(), state));
    });

    return () => {
      for (const dispose of routes) {
        try {
          dispose && dispose();
        } catch {
          /* ignore */
        }
      }
    };
  });

  /* ---------------- 自检（不碰真实工作区时写入临时目录） ---------------- */

  async function selfTest(target) {
    const root = target || join(process.env.TEMP || '/tmp', `session-archive-selftest-${Date.now()}`);
    await ensureDir(root);
    const fake = makeFakeSession(root);
    const result = await archive(fake, { force: true, divertWorkspace: false });
    const tree = await treeOf(root);
    return { ok: true, root, result, tree };
  }

  function makeFakeSession(root) {
    const id = `selftest-${Date.now()}`;
    const messages = [
      { role: 'user', content: [{ type: 'text', text: '帮我写一个批量重命名的 Python 脚本，把图片按拍摄日期排序' }] },
      {
        role: 'assistant',
        content: [{
          type: 'text',
          text: '下面脚本按 EXIF 日期重命名：\n\n```python\nimport os\nprint("hi")\n```\n\n运行前先备份。',
        }],
      },
    ];
    return {
      id,
      header: { version: 1, id, createdAt: Date.now(), cwd: root, isSeeded: false, agentPreset: 'cordis' },
      snapshotEvents() {
        return messages.map((m, i) => ({
          type: m.role === 'user' ? 'user/message' : 'assistant/message',
          seq: i + 1,
          time: Date.now(),
          data: m.role === 'user' ? m : { turn: 1, step: 1, message: m },
        }));
      },
      deriveMessages() {
        return messages;
      },
    };
  }

  async function treeOf(root, depth = 0) {
    const entries = await listFiles(root);
    const out = [];
    for (const entry of entries) {
      const full = join(root, entry.name);
      out.push(`${'  '.repeat(depth)}${entry.name}${entry.isDirectory() ? '/' : ''}`);
      if (entry.isDirectory() && depth < 3) out.push(...await treeOf(full, depth + 1));
    }
    return out;
  }

  return { archive, archiveAll, state, mounted };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function settingsPage(options, state) {
  const opt = JSON.stringify(options, null, 2);
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>会话归档 · 设置</title>
<style>
 body{font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif;margin:0;background:#f6f7f9;color:#1c1f23}
 main{max-width:820px;margin:32px auto;padding:24px 28px;background:#fff;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.06)}
 h1{font-size:20px;margin:0 0 4px} p.hint{color:#6b7280;margin:0 0 20px}
 label{display:block;font-weight:600;margin:18px 0 6px}
 input[type=text],input[type=number],textarea{width:100%;padding:9px 11px;border:1px solid #d6dae1;border-radius:9px;font:inherit;box-sizing:border-box}
 textarea{min-height:76px;resize:vertical}
 .row{display:flex;gap:16px;flex-wrap:wrap}.row>div{flex:1 1 220px}
 .switch{display:flex;align-items:center;gap:8px;font-weight:600;margin:14px 0}
 .actions{display:flex;gap:10px;margin-top:22px;flex-wrap:wrap}
 button{padding:10px 16px;border-radius:10px;border:1px solid #d6dae1;background:#fff;font:inherit;cursor:pointer}
 button.primary{background:#2563eb;border-color:#2563eb;color:#fff}
 pre{margin:0;background:#0f172a;color:#e5e7eb;padding:14px;border-radius:10px;overflow:auto;font-size:12px;max-height:240px}
 small{color:#6b7280}
</style></head><body><main>
<h1>会话归档 · 设置</h1>
<p class="hint">每条会话在<strong>工作区根目录</strong>直接生成 <code>【类目-摘要】/</code>，内含 <code>聊天记录.md</code>、<code>session.json</code> 和抽出的 <code>代码-N-M.后缀</code>，不再分子目录。以下改动立即生效并持久化。</p>

<div class="switch"><input type="checkbox" id="enabled"><label for="enabled" style="margin:0">启用自动归档</label></div>
<div class="switch"><input type="checkbox" id="extractCode"><label for="extractCode" style="margin:0">自动把代码块提取为独立源码文件（关闭则代码留在聊天日志里）</label></div>
<div class="switch"><input type="checkbox" id="extractLongText"><label for="extractLongText" style="margin:0">把非代码长文本（md/txt）也单独存成文件（与聊天记录同目录）</label></div>
<div class="switch"><input type="checkbox" id="absorbWorkspaceRoot"><label for="absorbWorkspaceRoot" style="margin:0">把工作区根目录的其它文件夹/文件收进唯一的会话文件夹（被宿主引用的插件目录不搬）</label></div>
<div class="switch"><input type="checkbox" id="divertWorkspaceFiles"><label for="divertWorkspaceFiles" style="margin:0">自动把工作区根目录散文件分流归类</label></div>

<label for="template">命名模板（支持 {kind} {summary} {date} {time}）</label>
<input type="text" id="template" placeholder="【{kind}-{summary}】">

<div class="row">
  <div><label for="minChars">名字最短字数</label><input type="number" id="minChars" min="6" max="40"></div>
  <div><label for="maxChars">名字最长字数</label><input type="number" id="maxChars" min="10" max="80"></div>
</div>

<label for="blacklist">黑名单关键词（逗号或换行分隔，命中则不新建文件夹）</label>
<textarea id="blacklist" placeholder="测试，临时，随手记"></textarea>

<div class="row">
  <div><label for="compressAfter">自动压缩：会话超过多少条后把旧记录转入历史文件（0=关闭）</label><input type="number" id="compressAfter" min="0"></div>
  <div><label for="cleanupHistoryDays">自动清理：历史文件保留天数（0=永久保留）</label><input type="number" id="cleanupHistoryDays" min="0"></div>
</div>

<div class="actions">
  <button class="primary" id="save">保存设置</button>
  <button id="archiveAll">立即归档全部会话</button>
  <button id="stateBtn">查看已归档会话</button>
  <button id="testBtn">运行自检（临时目录）</button>
</div>

<label style="margin-top:24px">状态输出</label>
<pre id="out">${opt.replace(/</g, '&lt;')}</pre>
</main>
<script>
const API = ${JSON.stringify(API)};
const fields = ["enabled","extractCode","extractLongText","absorbWorkspaceRoot","divertWorkspaceFiles","template","minChars","maxChars","blacklist","compressAfter","cleanupHistoryDays"];
const out = document.getElementById("out");
function show(v){ out.textContent = typeof v === "string" ? v : JSON.stringify(v, null, 2); }
async function load(){
  const r = await fetch(API + "/config"); const j = await r.json(); const o = j.options;
  document.getElementById("enabled").checked = !!o.enabled;
  document.getElementById("extractCode").checked = !!o.extractCode;
  document.getElementById("extractLongText").checked = !!o.extractLongText;
  document.getElementById("absorbWorkspaceRoot").checked = !!o.absorbWorkspaceRoot;
  document.getElementById("divertWorkspaceFiles").checked = !!o.divertWorkspaceFiles;
  document.getElementById("template").value = o.nameTemplate;
  document.getElementById("minChars").value = o.minChars;
  document.getElementById("maxChars").value = o.maxChars;
  document.getElementById("blacklist").value = (o.blacklist || []).join("，");
  document.getElementById("compressAfter").value = o.compressAfter;
  document.getElementById("cleanupHistoryDays").value = o.cleanupHistoryDays;
  show(o);
}
document.getElementById("save").onclick = async () => {
  const body = {
    enabled: document.getElementById("enabled").checked,
    extractCode: document.getElementById("extractCode").checked,
    extractLongText: document.getElementById("extractLongText").checked,
    absorbWorkspaceRoot: document.getElementById("absorbWorkspaceRoot").checked,
    divertWorkspaceFiles: document.getElementById("divertWorkspaceFiles").checked,
    nameTemplate: document.getElementById("template").value,
    minChars: Number(document.getElementById("minChars").value),
    maxChars: Number(document.getElementById("maxChars").value),
    blacklist: document.getElementById("blacklist").value.split(/[,，\\n]/).map(s=>s.trim()).filter(Boolean),
    compressAfter: Number(document.getElementById("compressAfter").value),
    cleanupHistoryDays: Number(document.getElementById("cleanupHistoryDays").value),
  };
  const r = await fetch(API + "/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  show(await r.json());
};
document.getElementById("archiveAll").onclick = async () => { show(await (await fetch(API + "/archive", { method: "POST" })).json()); };
document.getElementById("stateBtn").onclick = async () => { show(await (await fetch(API + "/state")).json()); };
document.getElementById("testBtn").onclick = async () => { show(await (await fetch(API + "/selftest", { method: "POST" })).json()); };
load();
</script>
</body></html>`;
}

export default { name, inject, apply };
