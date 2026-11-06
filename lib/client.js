/**
 * 会话归档 · 浏览器半区（DSH Web UI 客户端 bundle）
 *
 * 形态：window.__ModuleLoader__.load({ id, factory(require) }) 的经典脚本，
 * React 来自浏览器模块表（require('react')），不自带 React、不自带 CDN。
 *
 * 注册三个 slot：
 *   sidebar.panellist      左侧栏图标按钮（点开进入主面板）
 *   main                   key = 'dsh-session-archive' 的整页设置面板
 *   plugins.bundle.config  key = 'dsh-session-archive' 的插件详情页配置卡
 *
 * 数据全部走宿主半区已注册的 HTTP 接口：
 *   GET  /dsh-session-archive/api/health
 *   GET  /dsh-session-archive/api/state
 *   GET  /dsh-session-archive/api/config    POST 同路径保存
 *   GET  /dsh-session-archive/api/plan
 *   POST /dsh-session-archive/api/archive
 *   POST /dsh-session-archive/api/restore
 *   POST /dsh-session-archive/api/selftest
 *
 * 注意：apply 里抛错会让整个 Web 启动失败（web boot: N entries did not activate），
 * 所以每一步都做容错，任何一个 slot 注册失败都不影响其它 slot。
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-archive',
  factory(require) {
    'use strict';

    var React = require('react');
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useCallback = React.useCallback;
    var useRef = React.useRef;

    var API = '/dsh-session-archive/api';
    var NS = 'dsh-session-archive';
    var PANEL_KEY = 'dsh-session-archive';

    /* ------------------------------------------------------------------ */
    /* 语言                                                                */
    /* ------------------------------------------------------------------ */

    var zh = {
      title: '会话归档',
      'tab.status': '状态',
      'tab.settings': '设置',
      'tab.plan': '试运行',
      'tab.sessions': '已归档会话',
      'tab.output': '原始输出',

      'status.ready': '已就绪',
      'status.loading': '未就绪',
      'status.enabled': '自动归档已开启',
      'status.disabled': '自动归档已关闭',
      'status.archived': '已归档',
      'status.updated': '已更新',
      'status.skipped': '已跳过',
      'status.errors': '错误',
      'status.lastError': '最近错误',
      'status.paths': '存储位置',
      'status.index': '索引',
      'status.config': '配置',

      'btn.refresh': '刷新',
      'btn.save': '保存设置',
      'btn.saved': '已保存',
      'btn.saving': '保存中…',
      'btn.archiveAll': '立即归档全部会话',
      'btn.restore': '把散文件移回工作区',
      'btn.selftest': '运行自检（临时目录）',
      'btn.plan': '试运行（只看分类，不写盘）',
      'btn.openPanel': '打开完整设置',

      'group.basic': '基础',
      'group.safety': '安全与整洁',
      'group.naming': '命名',
      'group.content': '内容',

      'sw.enabled': ['启用自动归档', '关闭后不再新建或更新会话文件夹'],
      'sw.showSidebarEntry': ['在侧边栏显示入口', '关掉后左侧栏不再出现「会话归档」，归档照常进行；恢复请到 插件 → 会话归档 → 配置'],
      'sw.structured': ['结构化分类', '按维度建桶；关闭后退回旧版平铺'],
      'sw.extractCode': ['代码块提取为独立文件', '关闭则代码只留在聊天日志里'],
      'sw.extractLongText': ['非代码长文本也单独存文件', ''],
      'sw.writeManifest': ['写 README.md + MANIFEST.json 审计链', ''],
      'sw.safetyScan': ['开源前安全扫描', '密钥 / 私钥 / 绝对路径 / 内网地址'],
      'sw.dedupeByHash': ['内容去重（sha256）', '相同内容不再产生 -2 副本'],
      'sw.strictRoot': ['严格根目录', '会话根只允许 4 个文件'],
      'sw.divertWorkspaceFiles': ['工作区散文件自动分流', '结构化模式已内置归位'],
      'sw.absorbWorkspaceRoot': ['收纳工作区根目录', '结构化模式下只生成待归位清单'],
      'sw.includeSubagents': ['也给子代理会话建文件夹', ''],

      'field.containerName': '容器文件夹名（留空 = 直接放工作区根）',
      'field.nameTemplate': '命名模板（{kind} {summary} {date} {time}）',
      'field.minChars': '名字最短字数',
      'field.maxChars': '名字最长字数',
      'field.blacklist': '黑名单关键词（逗号或换行分隔）',
      'field.compressAfter': '超过多少条后压缩旧记录（0=关闭）',
      'field.cleanupHistoryDays': '历史文件保留天数（0=永久）',

      'plan.empty': '还没有可试运行的会话。',
      'plan.session': '会话',
      'plan.active': '命中维度',
      'plan.buckets': '将要创建的桶',
      'plan.blocks': '代码块',
      'plan.locked': '手工锁定',
      'sessions.empty': '还没有已归档的会话。',
      'sessions.written': '文件数',
      'sessions.updatedAt': '更新时间',
      'sessions.dir': '目录',
      'err.request': '请求失败',
      'hint.tree': '每条会话在工作区根目录生成一个【类目-摘要】文件夹，内部按产出维度分桶，空桶不建。',
      'hint.standalone': '独立页面：',
    };

    var en = {
      title: 'Session Archive',
      'tab.status': 'Status',
      'tab.settings': 'Settings',
      'tab.plan': 'Dry run',
      'tab.sessions': 'Archived sessions',
      'tab.output': 'Raw output',

      'status.ready': 'Ready',
      'status.loading': 'Not ready',
      'status.enabled': 'Auto archive on',
      'status.disabled': 'Auto archive off',
      'status.archived': 'Archived',
      'status.updated': 'Updated',
      'status.skipped': 'Skipped',
      'status.errors': 'Errors',
      'status.lastError': 'Last error',
      'status.paths': 'Storage',
      'status.index': 'Index',
      'status.config': 'Config',

      'btn.refresh': 'Refresh',
      'btn.save': 'Save settings',
      'btn.saved': 'Saved',
      'btn.saving': 'Saving…',
      'btn.archiveAll': 'Archive all sessions now',
      'btn.restore': 'Move loose files back',
      'btn.selftest': 'Run self-test (temp dir)',
      'btn.plan': 'Dry run (classify only)',
      'btn.openPanel': 'Open full settings',

      'group.basic': 'Basics',
      'group.safety': 'Safety & tidiness',
      'group.naming': 'Naming',
      'group.content': 'Content',

      'sw.enabled': ['Enable auto archive', 'Off stops creating and updating session folders'],
      'sw.showSidebarEntry': ['Show an entry in the sidebar', 'Off hides it from the left sidebar; archiving keeps running. Restore it under Plugins → Session Archive → Config'],
      'sw.structured': ['Structured layout', 'One bucket per dimension; off falls back to the flat layout'],
      'sw.extractCode': ['Extract code blocks into files', 'Off keeps code only in the chat log'],
      'sw.extractLongText': ['Save long non-code text as files', ''],
      'sw.writeManifest': ['Write README.md + MANIFEST.json', ''],
      'sw.safetyScan': ['Pre-publish safety scan', 'Keys / private keys / absolute paths / internal hosts'],
      'sw.dedupeByHash': ['Content dedupe (sha256)', 'Identical content never becomes a -2 copy'],
      'sw.strictRoot': ['Strict root', 'The session root allows only 4 files'],
      'sw.divertWorkspaceFiles': ['Sort loose workspace files', 'Structured mode already routes them'],
      'sw.absorbWorkspaceRoot': ['Absorb workspace root', 'Structured mode only writes a to-sort list'],
      'sw.includeSubagents': ['Archive subagent sessions too', ''],

      'field.containerName': 'Container folder (empty = workspace root)',
      'field.nameTemplate': 'Name template ({kind} {summary} {date} {time})',
      'field.minChars': 'Minimum name length',
      'field.maxChars': 'Maximum name length',
      'field.blacklist': 'Blacklist keywords (comma or newline separated)',
      'field.compressAfter': 'Compress old entries after N messages (0 = off)',
      'field.cleanupHistoryDays': 'Keep history files for N days (0 = forever)',

      'plan.empty': 'No session to dry-run yet.',
      'plan.session': 'Session',
      'plan.active': 'Dimensions',
      'plan.buckets': 'Buckets to create',
      'plan.blocks': 'Code blocks',
      'plan.locked': 'Manually locked',
      'sessions.empty': 'No session archived yet.',
      'sessions.written': 'Files',
      'sessions.updatedAt': 'Updated',
      'sessions.dir': 'Folder',
      'err.request': 'Request failed',
      'hint.tree': 'Each session gets one 【kind-summary】 folder at the workspace root, bucketed by output dimension; empty buckets are never created.',
      'hint.standalone': 'Standalone page: ',
    };

    /** 模块级翻译函数：apply 里换成 locale.bind(NS) 的结果，切换语言时广播重绘。 */
    var translate = function (key) {
      return key;
    };
    var listeners = new Set();

    function t(key, params) {
      try {
        return translate(key, params);
      } catch (error) {
        return key;
      }
    }

    function useT() {
      var pair = useState(0);
      var force = pair[1];
      useEffect(function () {
        var fn = function () {
          force(function (value) {
            return value + 1;
          });
        };
        listeners.add(fn);
        return function () {
          listeners.delete(fn);
        };
      }, []);
      return t;
    }

    /* ------------------------------------------------------------------ */
    /* 侧边栏入口：可运行时挂载 / 卸载                                       */
    /* ------------------------------------------------------------------ */

    // 宿主可能给出部分服务，这里全部做成「拿不到就静默跳过」
    var slotHost = null;        // 承载 sidebar.panellist 的 slots 服务
    var sidebarEntry = null;    // 当前注册的句柄 { dispose }
    var sidebarVisible = true;  // 目标可见性（来自配置项 showSidebarEntry）

    var HIDE_STYLE_ID = 'dsa-hide-sidebar-entry';
    // 侧边栏那一行是宿主渲染的 <button>，里面只有我们的 glyph。
    // 注销 entry 走的是宿主的 effect 生命周期，时机不完全可控；
    // 这里再用一条只在关掉时存在的样式兜底，保证「关掉就一定看不见」。
    var HIDE_CSS = 'button:has([data-dsa-sidebar-entry]){display:none !important}';

    function sidebarOptions() {
      return {
        name: 'sidebar.panellist',
        id: PANEL_KEY,
        order: 35,
        label: function () {
          return t('title');
        },
      };
    }

    /** 侧边栏行里的 glyph：带一个标记属性，供上面的兜底样式精准命中。 */
    function SidebarGlyph(props) {
      return h(
        'span',
        { 'data-dsa-sidebar-entry': '' },
        h(Glyph, props && props.size ? { size: props.size } : null),
      );
    }

    /** 打开 / 关闭兜底样式（幂等）。 */
    function sidebarRowStyle(hidden) {
      if (typeof document === 'undefined' || !document || !document.head) return;
      var node = null;
      try {
        node = document.getElementById(HIDE_STYLE_ID);
      } catch (error) {
        node = null;
      }
      if (hidden) {
        if (node) return;
        try {
          node = document.createElement('style');
          node.id = HIDE_STYLE_ID;
          node.textContent = HIDE_CSS;
          document.head.appendChild(node);
        } catch (error) {
          warn('sidebar hide style failed', error);
        }
        return;
      }
      if (node && node.parentNode) {
        try {
          node.parentNode.removeChild(node);
        } catch (error) {
          warn('sidebar hide style remove failed', error);
        }
      }
    }

    function warn(label, error) {
      if (typeof console !== 'undefined' && console.warn) console.warn('[dsh-session-archive] ' + label, error);
    }

    // 同一个 id 同 priority 重复注册会被宿主抛错，所以必须先判空
    function registerSidebar() {
      if (!slotHost || sidebarEntry) return;
      try {
        var dispose = slotHost.register(sidebarOptions(), SidebarGlyph);
        sidebarEntry = { dispose: typeof dispose === 'function' ? dispose : null };
      } catch (error) {
        sidebarEntry = null;
        warn('sidebar.panellist register failed', error);
      }
    }

    function unregisterSidebar() {
      var entry = sidebarEntry;
      sidebarEntry = null;
      if (entry && entry.dispose) {
        try {
          entry.dispose();
        } catch (error) {
          warn('sidebar.panellist dispose failed', error);
        }
      }
    }

    /** 开关的即时生效入口：设置页 / 配置卡一点就调用。 */
    function applySidebarVisibility(visible) {
      sidebarVisible = visible !== false;
      // 注册始终保留：宿主的侧边栏行是 <button>，只有 glyph 在里面。
      // 只要 entry 还在，兜底样式就能稳定命中整行；
      // 一旦注销，行会退化成「空 glyph + 文字标签」，反而看得见。
      registerSidebar();
      sidebarRowStyle(!sidebarVisible);
      reportSidebarState(sidebarVisible ? 'on' : 'off');
    }

    /** 把持久化的配置同步到侧边栏（启动时、以及每次重新读取配置后调用）。 */
    function syncSidebarFromOptions(options) {
      if (!options || options.showSidebarEntry === undefined) return;
      applySidebarVisibility(options.showSidebarEntry !== false);
    }

    /** 把当前侧边栏状态回传给宿主进程，便于排查「点了没反应」。 */
    function reportSidebarState(tag) {
      var rows = -1;
      var hasStyle = false;
      var buttons = -1;
      try {
        if (typeof document !== 'undefined' && document) {
          rows = document.querySelectorAll('[data-dsa-sidebar-entry]').length;
          buttons = document.querySelectorAll('button').length;
          hasStyle = !!document.getElementById(HIDE_STYLE_ID);
        }
      } catch (error) {
        warn('sidebar state probe failed', error);
      }
      // 宿主环境里 fetch 对非法 URL 会同步抛错，这里整段兜住，绝不拖垮开关本身
      try {
        request('/debug', {
          method: 'POST',
          body: {
            tag: tag || '',
            registered: !!sidebarEntry,
            visible: sidebarVisible,
            hasStyle: hasStyle,
            glyphRows: rows,
            buttons: buttons,
          },
        }).catch(function (error) {
          warn('sidebar state report failed', error);
        });
      } catch (error) {
        warn('sidebar state report failed', error);
      }
    }

    /* ------------------------------------------------------------------ */
    /* 接口                                                                */
    /* ------------------------------------------------------------------ */

    function request(path, options) {
      var init = options || {};
      if (init.body !== undefined && typeof init.body !== 'string') {
        init = { method: init.method || 'POST', body: JSON.stringify(init.body) };
        init.headers = { 'content-type': 'application/json' };
      }
      return fetch(API + path, Object.assign({ credentials: 'same-origin' }, init)).then(function (response) {
        return response.text().then(function (text) {
          var parsed = null;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch (error) {
            parsed = { ok: false, error: String(text || '').slice(0, 400) };
          }
          if (!response.ok) {
            var message = (parsed && (parsed.error || parsed.message)) || ('HTTP ' + response.status);
            throw new Error(String(message));
          }
          return parsed;
        });
      });
    }

    /* ------------------------------------------------------------------ */
    /* 样式（全部继承宿主主题变量）                                          */
    /* ------------------------------------------------------------------ */

    var CSS = [
      '.dsa-page{display:flex;flex-direction:column;min-height:100%;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit}',
      '.dsa-head{display:flex;align-items:center;gap:12px;padding:20px 28px 12px}',
      '.dsa-head h1{font-size:17px;font-weight:600;margin:0}',
      '.dsa-head p{margin:2px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.dsa-glyph{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-brand);flex:none}',
      '.dsa-tabs{display:flex;gap:4px;padding:0 28px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}',
      '.dsa-tabs button{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;padding:9px 12px;border-radius:8px 8px 0 0;cursor:pointer;border-bottom:2px solid transparent}',
      '.dsa-tabs button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dsa-tabs button.on{color:var(--dsw-alias-label-brand);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.dsa-body{flex:1;overflow:auto;padding:18px 28px 40px}',
      '.dsa-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:16px 18px;margin:0 0 14px;max-width:920px}',
      '.dsa-card h2{font-size:13px;font-weight:600;margin:0 0 10px;color:var(--dsw-alias-label-secondary);letter-spacing:.02em}',
      '.dsa-row{display:flex;gap:14px;flex-wrap:wrap}',
      '.dsa-row>label{flex:1 1 240px}',
      '.dsa-sw{display:flex;gap:9px;align-items:flex-start;margin:10px 0;cursor:pointer}',
      '.dsa-sw input{margin:3px 0 0;flex:none;accent-color:var(--dsw-alias-brand-primary)}',
      '.dsa-sw span{display:block;font-size:13px;font-weight:500}',
      '.dsa-sw small{display:block;font-weight:400;color:var(--dsw-alias-label-tertiary);font-size:12px;margin-top:2px}',
      '.dsa-field{display:block;margin:12px 0}',
      '.dsa-field span{display:block;font-size:12px;color:var(--dsw-alias-label-secondary);margin-bottom:5px}',
      '.dsa-field input,.dsa-field textarea{width:100%;box-sizing:border-box;padding:7px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:13px}',
      '.dsa-field textarea{min-height:64px;resize:vertical;font-family:var(--dsw-font-mono)}',
      '.dsa-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}',
      '.dsa-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:inherit;font:inherit;font-size:13px;padding:7px 13px;border-radius:8px;cursor:pointer}',
      '.dsa-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsa-btn:disabled{opacity:.5;cursor:default}',
      '.dsa-btn.primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}',
      '.dsa-btn.primary:hover{filter:brightness(1.06)}',
      '.dsa-stat{display:flex;gap:18px;flex-wrap:wrap}',
      '.dsa-stat div{min-width:84px}',
      '.dsa-stat b{display:block;font-size:19px;font-weight:600;line-height:1.2}',
      '.dsa-stat span{font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.dsa-pill{display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:2px 9px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
      '.dsa-pill.ok{color:var(--dsw-alias-state-success-primary)}',
      '.dsa-pill.bad{color:var(--dsw-alias-state-error-primary)}',
      '.dsa-pill.warn{color:var(--dsw-alias-state-warn-primary)}',
      '.dsa-pre{margin:0;padding:12px 14px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-mono);font-size:11.5px;line-height:1.55;overflow:auto;max-height:420px;white-space:pre-wrap;word-break:break-all}',
      '.dsa-list{display:flex;flex-direction:column;gap:8px}',
      '.dsa-item{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-bg-base)}',
      '.dsa-item h3{margin:0 0 4px;font-size:13px;font-weight:600}',
      '.dsa-item p{margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary);word-break:break-all}',
      '.dsa-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}',
      '.dsa-chip{font-size:11px;padding:1px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
      '.dsa-chip.del{color:var(--dsw-alias-state-warn-primary)}',
      '.dsa-hint{font-size:12px;color:var(--dsw-alias-label-tertiary);margin:0 0 12px;line-height:1.6}',
      '.dsa-empty{font-size:13px;color:var(--dsw-alias-label-tertiary);padding:10px 0}',
      '.dsa-err{font-size:12px;color:var(--dsw-alias-state-error-primary);margin-top:8px}',
    ].join('');

    function Style() {
      return h('style', null, CSS);
    }

    /* ------------------------------------------------------------------ */
    /* 图标                                                                */
    /* ------------------------------------------------------------------ */

    function Glyph(props) {
      var size = (props && props.size) || 16;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('rect', { x: 3, y: 4, width: 18, height: 4, rx: 1.4 }),
        h('path', { d: 'M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8' }),
        h('path', { d: 'M10 12h4' }),
      );
    }

    /* ------------------------------------------------------------------ */
    /* 小组件                                                              */
    /* ------------------------------------------------------------------ */

    function Switch(props) {
      return h(
        'label',
        { className: 'dsa-sw' },
        h('input', {
          type: 'checkbox',
          checked: !!props.checked,
          onChange: function (event) {
            props.onChange(event.target.checked);
          },
        }),
        h('span', null, props.label, props.hint ? h('small', null, props.hint) : null),
      );
    }

    function Field(props) {
      var value = props.value === undefined || props.value === null ? '' : props.value;
      return h(
        'label',
        { className: 'dsa-field' },
        h('span', null, props.label),
        props.multiline
          ? h('textarea', {
              value: value,
              onChange: function (event) {
                props.onChange(event.target.value);
              },
            })
          : h('input', {
              type: props.numeric ? 'number' : 'text',
              value: value,
              onChange: function (event) {
                props.onChange(event.target.value);
              },
            }),
      );
    }

    var SWITCHES = [
      ['enabled', 'group.basic'],
      ['showSidebarEntry', 'group.basic'],
      ['structured', 'group.basic'],
      ['extractCode', 'group.basic'],
      ['extractLongText', 'group.basic'],
      ['writeManifest', 'group.basic'],
      ['safetyScan', 'group.safety'],
      ['dedupeByHash', 'group.safety'],
      ['strictRoot', 'group.safety'],
      ['divertWorkspaceFiles', 'group.safety'],
      ['absorbWorkspaceRoot', 'group.safety'],
      ['includeSubagents', 'group.safety'],
    ];

    function switchText(key) {
      var value = t('sw.' + key);
      if (Array.isArray(value)) return { label: value[0], hint: value[1] };
      return { label: key, hint: '' };
    }

    /* ------------------------------------------------------------------ */
    /* 设置表单（主面板与配置卡共用）                                        */
    /* ------------------------------------------------------------------ */

    function useSettings() {
      var pair = useState(null);
      var options = pair[0];
      var setOptions = pair[1];
      var errPair = useState('');
      var error = errPair[0];
      var setError = errPair[1];
      var busyPair = useState(false);
      var busy = busyPair[0];
      var setBusy = busyPair[1];

      var load = useCallback(function () {
        setBusy(true);
        return request('/config')
          .then(function (body) {
            setOptions((body && body.options) || {});
            setError('');
            syncSidebarFromOptions(body && body.options);
          })
          .catch(function (problem) {
            setError(String((problem && problem.message) || problem));
          })
          .then(function () {
            setBusy(false);
          });
      }, []);

      useEffect(function () {
        load();
      }, [load]);

      var patch = useCallback(function (key, value) {
        setOptions(function (current) {
          var next = Object.assign({}, current || {});
          next[key] = value;
          return next;
        });
        // 侧边栏开关即时生效，并且立刻落盘：
        // 主面板与插件详情页各有一份 useSettings，另一份重新读 /config 时
        // 会把「还没保存」的开关状态覆盖回去，所以这里必须马上持久化。
        if (key === 'showSidebarEntry') {
          applySidebarVisibility(value !== false);
          request('/config', { method: 'POST', body: { showSidebarEntry: value !== false } })
            .then(function (result) {
              if (result && result.options) syncSidebarFromOptions(result.options);
            })
            .catch(function (problem) {
              setError(String((problem && problem.message) || problem));
            });
        }
      }, []);

      var save = useCallback(function () {
        var body = {};
        for (var i = 0; i < SWITCHES.length; i += 1) body[SWITCHES[i][0]] = !!options[SWITCHES[i][0]];
        body.containerName = String(options.containerName || '');
        body.nameTemplate = String(options.nameTemplate || '');
        body.minChars = Number(options.minChars);
        body.maxChars = Number(options.maxChars);
        body.compressAfter = Number(options.compressAfter);
        body.cleanupHistoryDays = Number(options.cleanupHistoryDays);
        body.blacklist = String(options.blacklistText !== undefined ? options.blacklistText : (options.blacklist || []).join('，'))
          .split(/[,，\n]/)
          .map(function (item) {
            return item.trim();
          })
          .filter(Boolean);
        setBusy(true);
        return request('/config', { method: 'POST', body: body })
          .then(function (result) {
            setOptions((result && result.options) || options);
            syncSidebarFromOptions(result && result.options);
            setError('');
          })
          .catch(function (problem) {
            setError(String((problem && problem.message) || problem));
          })
          .then(function () {
            setBusy(false);
          });
      }, [options]);

      return {
        options: options,
        error: error,
        busy: busy,
        patch: patch,
        save: save,
        reload: load,
      };
    }

    function SettingsForm(props) {
      var state = props.state;
      var options = state.options;
      if (!options) {
        return h('div', { className: 'dsa-card' }, h('div', { className: 'dsa-empty' }, props.busyLabel || '…'));
      }
      var groups = ['group.basic', 'group.safety'];
      var children = [];
      for (var g = 0; g < groups.length; g += 1) {
        var rows = [];
        for (var i = 0; i < SWITCHES.length; i += 1) {
          if (SWITCHES[i][1] !== groups[g]) continue;
          var key = SWITCHES[i][0];
          var text = switchText(key);
          rows.push(
            h(Switch, {
              key: key,
              checked: options[key],
              label: text.label,
              hint: text.hint,
              onChange: function (name) {
                return function (value) {
                  state.patch(name, value);
                };
              }(key),
            }),
          );
        }
        children.push(h('div', { className: 'dsa-card', key: groups[g] }, h('h2', null, t(groups[g])), rows));
      }

      children.push(
        h(
          'div',
          { className: 'dsa-card', key: 'naming' },
          h('h2', null, t('group.naming')),
          h(Field, {
            label: t('field.nameTemplate'),
            value: options.nameTemplate,
            onChange: function (value) {
              state.patch('nameTemplate', value);
            },
          }),
          h(Field, {
            label: t('field.containerName'),
            value: options.containerName,
            onChange: function (value) {
              state.patch('containerName', value);
            },
          }),
          h(
            'div',
            { className: 'dsa-row' },
            h(Field, {
              label: t('field.minChars'),
              numeric: true,
              value: options.minChars,
              onChange: function (value) {
                state.patch('minChars', value);
              },
            }),
            h(Field, {
              label: t('field.maxChars'),
              numeric: true,
              value: options.maxChars,
              onChange: function (value) {
                state.patch('maxChars', value);
              },
            }),
          ),
        ),
      );

      children.push(
        h(
          'div',
          { className: 'dsa-card', key: 'content' },
          h('h2', null, t('group.content')),
          h(Field, {
            label: t('field.blacklist'),
            multiline: true,
            value: options.blacklistText !== undefined ? options.blacklistText : (options.blacklist || []).join('，'),
            onChange: function (value) {
              state.patch('blacklistText', value);
            },
          }),
          h(
            'div',
            { className: 'dsa-row' },
            h(Field, {
              label: t('field.compressAfter'),
              numeric: true,
              value: options.compressAfter,
              onChange: function (value) {
                state.patch('compressAfter', value);
              },
            }),
            h(Field, {
              label: t('field.cleanupHistoryDays'),
              numeric: true,
              value: options.cleanupHistoryDays,
              onChange: function (value) {
                state.patch('cleanupHistoryDays', value);
              },
            }),
          ),
        ),
      );

      children.push(
        h(
          'div',
          { className: 'dsa-actions', key: 'actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'dsa-btn primary',
              disabled: state.busy,
              onClick: state.save,
            },
            state.busy ? t('btn.saving') : t('btn.save'),
          ),
          h(
            'button',
            { type: 'button', className: 'dsa-btn', disabled: state.busy, onClick: state.reload },
            t('btn.refresh'),
          ),
        ),
      );

      if (state.error) children.push(h('div', { className: 'dsa-err', key: 'err' }, state.error));
      return h('div', null, children);
    }

    /* ------------------------------------------------------------------ */
    /* 主面板                                                              */
    /* ------------------------------------------------------------------ */

    var TABS = [
      ['status', 'tab.status'],
      ['settings', 'tab.settings'],
      ['plan', 'tab.plan'],
      ['sessions', 'tab.sessions'],
      ['output', 'tab.output'],
    ];

    function useJson(path, deps) {
      var dataPair = useState(null);
      var data = dataPair[0];
      var setData = dataPair[1];
      var errPair = useState('');
      var error = errPair[0];
      var setError = errPair[1];
      var busyPair = useState(false);
      var busy = busyPair[0];
      var setBusy = busyPair[1];

      var run = useCallback(function (method, body) {
        setBusy(true);
        return request(path, body === undefined && method === 'GET' ? undefined : { method: method || 'POST', body: body })
          .then(function (result) {
            setData(result);
            setError('');
            return result;
          })
          .catch(function (problem) {
            setError(String((problem && problem.message) || problem));
            return null;
          })
          .then(function (result) {
            setBusy(false);
            return result;
          });
      }, [path]);

      useEffect(function () {
        run('GET');
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, deps || []);

      return { data: data, error: error, busy: busy, run: run };
    }

    function StatusTab() {
      var health = useJson('/health', []);
      var logPair = useState('');
      var log = logPair[0];
      var setLog = logPair[1];
      var busyPair = useState(false);
      var busy = busyPair[0];
      var setBusy = busyPair[1];

      function act(path, label) {
        setBusy(true);
        request(path, { method: 'POST' })
          .then(function (result) {
            setLog(label + ' → ' + JSON.stringify(result).slice(0, 1200));
          })
          .catch(function (problem) {
            setLog(label + ' → ' + String((problem && problem.message) || problem));
          })
          .then(function () {
            setBusy(false);
            health.run('GET');
          });
      }

      var data = health.data || {};
      var stats = data.stats || {};
      var paths = data.paths || {};
      return h(
        'div',
        null,
        h(
          'div',
          { className: 'dsa-card' },
          h(
            'div',
            { className: 'dsa-actions', style: { marginTop: 0 } },
            h(
              'span',
              { className: 'dsa-pill ' + (data.ready ? 'ok' : 'warn') },
              data.ready ? t('status.ready') : t('status.loading'),
            ),
            h(
              'span',
              { className: 'dsa-pill ' + (data.enabled ? 'ok' : 'warn') },
              data.enabled ? t('status.enabled') : t('status.disabled'),
            ),
          ),
          h(
            'div',
            { className: 'dsa-stat', style: { marginTop: 14 } },
            h('div', null, h('b', null, String(stats.archived || 0)), h('span', null, t('status.archived'))),
            h('div', null, h('b', null, String(stats.updated || 0)), h('span', null, t('status.updated'))),
            h('div', null, h('b', null, String(stats.skipped || 0)), h('span', null, t('status.skipped'))),
            h('div', null, h('b', null, String(stats.errors || 0)), h('span', null, t('status.errors'))),
          ),
          stats.lastError ? h('div', { className: 'dsa-err' }, t('status.lastError') + '：' + stats.lastError) : null,
          h(
            'div',
            { className: 'dsa-actions' },
            h(
              'button',
              { type: 'button', className: 'dsa-btn', disabled: health.busy || busy, onClick: function () { health.run('GET'); } },
              t('btn.refresh'),
            ),
            h(
              'button',
              { type: 'button', className: 'dsa-btn primary', disabled: busy, onClick: function () { act('/archive', t('btn.archiveAll')); } },
              t('btn.archiveAll'),
            ),
            h(
              'button',
              { type: 'button', className: 'dsa-btn', disabled: busy, onClick: function () { act('/selftest', t('btn.selftest')); } },
              t('btn.selftest'),
            ),
            h(
              'button',
              { type: 'button', className: 'dsa-btn', disabled: busy, onClick: function () { act('/restore', t('btn.restore')); } },
              t('btn.restore'),
            ),
          ),
          health.error ? h('div', { className: 'dsa-err' }, health.error) : null,
          log ? h('pre', { className: 'dsa-pre', style: { marginTop: 12, maxHeight: 200 } }, log) : null,
        ),
        h(
          'div',
          { className: 'dsa-card' },
          h('h2', null, t('status.paths')),
          h(
            'div',
            { className: 'dsa-list' },
            h('div', { className: 'dsa-item' }, h('h3', null, t('status.index')), h('p', null, String(paths.index || '—'))),
            h('div', { className: 'dsa-item' }, h('h3', null, t('status.config')), h('p', null, String(paths.config || '—'))),
          ),
        ),
      );
    }

    function SettingsTab() {
      var state = useSettings();
      return h(
        'div',
        null,
        h('p', { className: 'dsa-hint' }, t('hint.tree')),
        h(SettingsForm, { state: state }),
      );
    }

    function PlanTab() {
      var plan = useJson('/plan', []);
      var body = plan.data || {};
      var rows = Array.isArray(body.rows) ? body.rows : [];
      return h(
        'div',
        null,
        h(
          'div',
          { className: 'dsa-actions', style: { marginTop: 0, marginBottom: 12 } },
          h('button', { type: 'button', className: 'dsa-btn', disabled: plan.busy, onClick: function () { plan.run('GET'); } }, t('btn.plan')),
        ),
        plan.error ? h('div', { className: 'dsa-err' }, plan.error) : null,
        rows.length === 0
          ? h('div', { className: 'dsa-card dsa-empty' }, t('plan.empty'))
          : h(
              'div',
              { className: 'dsa-list' },
              rows.map(function (row) {
                var buckets = Array.isArray(row.buckets) ? row.buckets : [];
                return h(
                  'div',
                  { className: 'dsa-item', key: row.sessionId },
                  h('h3', null, row.title || row.sessionId),
                  h('p', null, row.summary || row.error || ''),
                  h(
                    'div',
                    { className: 'dsa-chips' },
                    (row.active || []).map(function (name) {
                      return h('span', { className: 'dsa-chip', key: name }, name);
                    }),
                    row.locked ? h('span', { className: 'dsa-chip del' }, t('plan.locked')) : null,
                    h('span', { className: 'dsa-chip' }, t('plan.blocks') + ' ' + String(row.blocks || 0)),
                  ),
                  buckets.length
                    ? h(
                        'div',
                        { className: 'dsa-chips' },
                        buckets.map(function (bucket) {
                          return h(
                            'span',
                            { className: 'dsa-chip' + (bucket.deletable ? ' del' : ''), key: bucket.dir },
                            bucket.dir + (Array.isArray(bucket.subdirs) && bucket.subdirs.length ? '/' + bucket.subdirs.join(',') : ''),
                          );
                        }),
                      )
                    : null,
                );
              }),
            ),
      );
    }

    function SessionsTab() {
      var state = useJson('/state', []);
      var body = state.data || {};
      var rows = Array.isArray(body.sessions) ? body.sessions : [];
      return h(
        'div',
        null,
        h(
          'div',
          { className: 'dsa-actions', style: { marginTop: 0, marginBottom: 12 } },
          h('button', { type: 'button', className: 'dsa-btn', disabled: state.busy, onClick: function () { state.run('GET'); } }, t('btn.refresh')),
        ),
        state.error ? h('div', { className: 'dsa-err' }, state.error) : null,
        rows.length === 0
          ? h('div', { className: 'dsa-card dsa-empty' }, t('sessions.empty'))
          : h(
              'div',
              { className: 'dsa-list' },
              rows.map(function (row) {
                return h(
                  'div',
                  { className: 'dsa-item', key: row.sessionId },
                  h('h3', null, row.name || row.sessionId),
                  h('p', null, t('sessions.dir') + '：' + String(row.dir || '—')),
                  h(
                    'div',
                    { className: 'dsa-chips' },
                    h('span', { className: 'dsa-chip' }, t('sessions.written') + ' ' + String(row.written || 0)),
                    h(
                      'span',
                      { className: 'dsa-chip' },
                      t('sessions.updatedAt') + ' ' + (row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'),
                    ),
                  ),
                );
              }),
            ),
      );
    }

    function OutputTab() {
      var state = useJson('/health', []);
      var text = '';
      try {
        text = JSON.stringify(state.data || {}, null, 2);
      } catch (error) {
        text = String(state.data);
      }
      return h(
        'div',
        null,
        h(
          'div',
          { className: 'dsa-actions', style: { marginTop: 0, marginBottom: 12 } },
          h('button', { type: 'button', className: 'dsa-btn', disabled: state.busy, onClick: function () { state.run('GET'); } }, t('btn.refresh')),
        ),
        h('pre', { className: 'dsa-pre' }, text),
      );
    }

    function MainPage() {
      useT();
      var pair = useState('status');
      var tab = pair[0];
      var setTab = pair[1];
      var visitedPair = useState({ status: true });
      var visited = visitedPair[0];
      var setVisited = visitedPair[1];

      function select(id) {
        setTab(id);
        setVisited(function (current) {
          var next = Object.assign({}, current);
          next[id] = true;
          return next;
        });
      }

      var body = null;
      if (tab === 'status') body = h(StatusTab);
      else if (tab === 'settings') body = h(SettingsTab);
      else if (tab === 'plan') body = h(PlanTab);
      else if (tab === 'sessions') body = h(SessionsTab);
      else body = h(OutputTab);

      return h(
        'div',
        { className: 'dsa-page' },
        h(Style),
        h(
          'header',
          { className: 'dsa-head' },
          h('span', { className: 'dsa-glyph' }, h(Glyph, { size: 18 })),
          h(
            'div',
            null,
            h('h1', null, t('title')),
            h('p', null, t('hint.tree')),
          ),
        ),
        h(
          'nav',
          { className: 'dsa-tabs', role: 'tablist' },
          TABS.map(function (item) {
            return h(
              'button',
              {
                key: item[0],
                type: 'button',
                role: 'tab',
                'aria-selected': tab === item[0] ? 'true' : 'false',
                className: tab === item[0] ? 'on' : '',
                onClick: function () {
                  select(item[0]);
                },
              },
              t(item[1]),
            );
          }),
        ),
        h('div', { className: 'dsa-body' }, visited[tab] ? body : null),
      );
    }

    /* ------------------------------------------------------------------ */
    /* 插件详情页配置卡                                                     */
    /* ------------------------------------------------------------------ */

    function BundleConfigCard() {
      useT();
      var state = useSettings();
      return h(
        'div',
        { className: 'dsa-page', style: { background: 'transparent', minHeight: 0 } },
        h(Style),
        h('p', { className: 'dsa-hint' }, t('hint.tree')),
        h(SettingsForm, { state: state }),
      );
    }

    /* ------------------------------------------------------------------ */
    /* 注册                                                                */
    /* ------------------------------------------------------------------ */

    function safe(label, fn) {
      try {
        fn();
      } catch (error) {
        // 单个 slot 注册失败不能拖垮整页启动
        if (typeof console !== 'undefined' && console.warn) console.warn('[dsh-session-archive] ' + label + ' failed', error);
      }
    }

    // 宿主可能只给出部分服务（ctx.effect / ctx.locale / ctx.slots 任一缺失都不能抛）
    function effect(ctx, fn, label) {
      if (typeof ctx.effect === 'function') return ctx.effect(fn, label);
      try {
        return fn();
      } catch (error) {
        if (typeof console !== 'undefined' && console.warn) console.warn('[dsh-session-archive] ' + label + ' failed', error);
        return undefined;
      }
    }

    function apply(ctx) {
      ctx = ctx || {};

      // 重复 apply（热重载）时先清掉上一代句柄，避免同 id 重复注册
      unregisterSidebar();
      slotHost = null;
      sidebarVisible = true;
      sidebarRowStyle(false);

      // 语言字典：同一 ns 同一 locale 只能注册一次
      safe('locale', function () {
        if (!ctx.locale) return;
        if (typeof ctx.locale.register === 'function') {
          effect(ctx, function () {
            return ctx.locale.register(NS, { zh: zh, en: en });
          }, 'session-archive: locale');
        }
        if (typeof ctx.locale.bind === 'function') translate = ctx.locale.bind(NS);
        if (typeof ctx.locale.subscribe === 'function') {
          effect(ctx, function () {
            return ctx.locale.subscribe(function () {
              if (typeof ctx.locale.bind === 'function') translate = ctx.locale.bind(NS);
              listeners.forEach(function (fn) {
                fn();
              });
            });
          }, 'session-archive: locale subscription');
        }
      });

      if (!ctx.slots || typeof ctx.slots.inject !== 'function' || typeof ctx.slots.register !== 'function') return;

      // 侧边栏入口交给 inject 的作用域托管，但要能按开关随时注销 / 重注册
      safe('sidebar.panellist', function () {
        ctx.slots.inject('sidebar.panellist', function () {
          slotHost = ctx.slots;
          if (sidebarVisible) registerSidebar();
          return function () {
            // 作用域收起时只清句柄，别去 dispose 宿主已经收走的 entry
            sidebarEntry = null;
            slotHost = null;
          };
        });
      });

      // 启动时读一次配置，把持久化的开关状态补上（关着就别出现）
      safe('sidebar.panellist sync', function () {
        request('/config')
          .then(function (body) {
            syncSidebarFromOptions(body && body.options);
          })
          .catch(function () {
            // 读不到就保持默认可见
          });
      });

      safe('main', function () {
        ctx.slots.inject('main', function () {
          return ctx.slots.register({ name: 'main', key: PANEL_KEY }, MainPage);
        });
      });

      safe('plugins.bundle.config', function () {
        ctx.slots.inject('plugins.bundle.config', function () {
          return ctx.slots.register({ name: 'plugins.bundle.config', key: PANEL_KEY }, BundleConfigCard);
        });
      });
    }

    return {
      name: PANEL_KEY,
      inject: ['slots', 'locale'],
      apply: apply,
      // 单测入口：宿主只读 name / inject / apply，其余字段不影响加载
      __test: {
        applySidebarVisibility: applySidebarVisibility,
        syncSidebarFromOptions: syncSidebarFromOptions,
        isSidebarVisible: function () {
          return sidebarVisible;
        },
      },
    };
  },
});
