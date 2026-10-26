# dsh-session-archive · 会话归档

接管会话落盘：**一条会话 = 一个独立文件夹**，文件夹内部再分「聊天记录 / 源码 / 其他产出」三类，永不混放、永不共用。

适用载体：DeepSeek Harness（DSH）**宿主机（Host）插件**，运行在 DSH 的 Node 宿主进程内，通过 `ctx.on('session/created' | 'session/event')` 接收会话事件，直接写文件系统。

---

## 1. 目录结构（强制）

```
<工作区根目录>/
├─ 【开发-批量重命名脚本】/           ← 每条会话一个，直接放在工作区根目录（没有多余容器层）
│  ├─ 聊天记录.md                     ← 完整对话，按时间顺序，持续追加
│  ├─ 代码-2-1.py                     ← 从回答里抽出的代码 / 脚本 / 配置（平铺，不再分子目录）
│  ├─ 插件源码/                       ← 工作区根目录原有的同批目录/文件被收纳到这里（整目录搬，不拆散）
│  └─ session.json                    ← 元数据（会话 ID、目录、条数、时间）
├─ 【文案-夏季防晒种草】/
│  └─ 聊天记录.md
└─ 【调试-插件启动崩溃】/
```

**收纳 = 原样搬，不改名、不造桶**：工作区根目录的东西进会话文件夹时保持原名（`cookie.json` 还叫 `cookie.json`，`lib/` 还是 `lib/`），插件自己只额外产出 `聊天记录.md`、`代码-N-M.后缀`、`session.json`；旧版本遗留的 `源码文件/`、`其他产出文件/`、`插件源码/`、`整理/` 等分类桶会在归档时自动拆开、内容按原名搬回会话文件夹根。

## 2. 命名规则

| 环节 | 规则 |
| --- | --- |
| 分类前缀 | 命中「插件/脚本/代码/开发/工具/函数/接口/CLI…」→ `【开发-…】`；命中「文案/标题/广告/营销/推广/种草/海报…」→ `【文案-…】`；命中「方案/计划/策略/复盘/需求…」→ `【方案-…】`；命中「调试/排错/报错/异常/崩溃/修复…」→ `【调试-…】`（多类命中取命中最多的，平手按 调试>开发>文案>方案） |
| 摘要 | 优先用会话标题（LLM 摘要）；无标题时取首条用户消息的第一句，剥离「帮我/请/做一个」等口语前缀 |
| 长度 | 15~30 字；不足 15 字追加首条消息的关键词，仍不足则追加 `·YYYYMMDD_HHmm`；超过 30 字硬截断并去掉尾部标点 |
| 非法字符 | `\ / : * ? " < > \|`、控制字符、Windows 保留名（CON/PRN/AUX/NUL/COM1-9/LPT1-9）自动处理 |
| 兜底 | 无法提炼时 `会话_YYYYMMDD_HHmm`，例如 `会话_20261026_1523` |
| 撞名 | 同工作区同名自动追加 `-2`、`-3`，**不共用文件夹** |
| 收纳 | 工作区根目录里其它文件夹/文件（`插件源码/`、旧版插件目录、散落脚本…）自动 rename 进该会话文件夹；被宿主 `node_modules` junction 引用的插件目录不搬（要搬需同时重连链接） |
| 改名 | 会话后续生成的标题更贴切时，旧文件夹整体改名（内容不变；目标已存在则保留原名） |

## 3. 触发规则

| 触发 | 行为 |
| --- | --- |
| 新建会话（`session/created`） | 等待 `settleMs` 后在工作区根目录创建 `【类目-摘要】/{聊天记录.md, session.json}`（平铺，无子目录） |
| 会话产出消息（`session/event`：`user/message`、`turn/end`） | 把新增消息按顺序追加进 `聊天记录.md`；代码块抽成同目录下的 `代码-N-M.后缀` |
| 标题生成/更新（`session/title`） | 重新排程，必要时把文件夹改成更准确的摘要名 |
| 会话结束（`session/disposed`） | 落盘收尾，取消该会话的待跑定时器 |
| 兜底扫描（每 `tickMs`） | 补写漏掉的增量、处理标题晚到、分流散落文件、清理历史文件 |
| 散落文件 | 不再分流：落在会话文件夹里的文件就留在原地（整目录搬入也不拆散）。工作区根目录只在 `divertWorkspaceFiles=true` 且文件是本会话开始后产生时才搬进会话文件夹 |

代码块提取：`extractCode=true` 时，助手消息里的 ```` ```lang ```` 围栏会被写成同目录的 `代码-<条号>-<块号>.<后缀>`，聊天记录中保留一行指引；`extractCode=false` 时代码原样留在聊天日志里。

## 4. 配置项

配置来源：`cordis.patch.yml` 的 `config`（初始值）＋ 设置面板写入的覆盖值（持久化在 `~/.dsh/storages/session-archive/config.json`，优先级更高，面板改完立即生效）。

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `containerName` | `（空）` | 留空 = 会话文件夹直接放工作区根目录；填名字则多一层容器 |
| `nameTemplate` | `【{kind}-{summary}】` | 命名模板，支持 `{kind}` `{summary}` `{date}` `{time}` |
| `minChars` / `maxChars` | `15` / `30` | 名称长度（字） |
| `extractCode` | `true` | 代码是否单独存文件 |
| `extractLongText` | `false` | 非代码长文本是否单独存成 `文本-N-M.后缀`（与聊天记录同目录） |
| `blacklist` | `[]` | 黑名单关键词，标题或首条消息命中则不建文件夹 |
| `includeSubagents` | `false` | 是否给子代理会话也建文件夹 |
| `settleMs` | `1500` | 会话创建后等待多久落盘（毫秒） |
| `tickMs` | `20000` | 兜底扫描间隔（毫秒） |
| `refreshMs` | `60000` | 同一会话重排程最小间隔（毫秒） |
| `compressAfter` | `0` | 聊天记录超过 N 条后，旧内容转入 `聊天记录-历史-<时间>.md`；`0` 关闭 |
| `cleanupHistoryDays` | `0` | 历史文件保留天数，超期删除；`0` 永久保留 |
| `writeSessionJson` | `true` | 是否写 `session.json` |
| `absorbWorkspaceRoot` | `true` | 把工作区根目录的其它文件夹/文件收进会话文件夹（仅当该工作区只有一个会话） |
| `divertWorkspaceFiles` | `false` | 是否连带把**工作区根目录**的散文件也分流（默认关闭，避免搬走你自己的文件和脚本；会话文件夹根目录始终自动归位） |
| `dirs.chat/code/other` | `聊天记录.md` / ``（空）`` / ``（空）`` | 产物名；`code`/`other` 留空 = 直接平铺在会话文件夹里，填了才建子目录 |

设置面板：`http://127.0.0.1:<web端口>/dsh-session-archive`（同源页面，含保存、立即归档全部、查看状态、自检四个按钮）。也可直接调 JSON 接口：`GET/POST /dsh-session-archive/api/config`。

## 5. 接口

| 路由 | 方法 | 作用 |
| --- | --- | --- |
| `/dsh-session-archive` | GET | 设置面板 |
| `/dsh-session-archive/api/health` | GET | 健康检查 + 当前配置 + 计数 |
| `/dsh-session-archive/api/state` | GET | 已归档会话清单（会话 ID、文件夹、工作区、条数） |
| `/dsh-session-archive/api/archive` | POST | 立即归档全部；`?sessionId=` 只归档一条 |
| `/dsh-session-archive/api/config` | GET/POST | 读/写配置（POST 体为 JSON patch） |
| `/dsh-session-archive/api/restore` | POST | 把会话文件夹里的产物搬回工作区根目录（卸载前兜底） |
| `/dsh-session-archive/api/selftest` | GET/POST | 用合成会话在临时目录跑一遍归档，返回目录树 |

## 6. 安装

```powershell
# 1) 打包安装（在本机 DSH 里执行，profile=desktop）
plugin_manager install_bundle target="<本插件目录>"
# 2) 重启 DSH 或热载后验证
curl http://127.0.0.1:<web端口>/dsh-session-archive/api/health
```

安装后 `~/.dsh/profiles/desktop/cordis.patch.yml` 里会新增一条 `- id: dsh-session-archive` 的 insert 记录。

## 7. 局限（诚实说明）

1. **不能"拦截"会话创建**：宿主只提供 `session/created` **事件**，没有 pre-create 钩子。所以是"会话一创建就立刻归档"，而不是"阻止旧存储方式"。DSH 自身仍会在 `~/.dsh/sessions/` 写它自己的会话日志（那是宿主内部存储，插件不接管也不删除）；本插件负责的是**工作区里的可读归档**。
2. **标题是异步生成的**：新建会话时通常还没有标题，先用首条消息命名，标题落定后再改名（一次重命名，不丢内容）。
3. **代码提取基于围栏代码块**：直接写在正文里的行内代码不会单独成文件；工具写入磁盘的源文件由"散文件分流"负责，不重复提取。
4. **散文件分流只处理文件，不移动目录**（避免把 git 仓库、node_modules 拆散）。
5. **名称长度按字符数**（中文按字、英文按字符），15~30 字对英文长标题会偏紧，可在面板调 `maxChars`。
6. **无浏览器侧边栏面板**：设置面板是宿主同源网页；如果后续要嵌进 Web UI 侧栏，需要额外的客户端半区（`dsh.client`）。

## 8. 测试

```powershell
node tests/naming.test.mjs          # 命名规则单测（12 项）
curl http://127.0.0.1:<web端口>/dsh-session-archive/api/selftest
```

`selftest` 会用一个合成会话（用户要求"写一个批量重命名的 Python 脚本"，助手回复里带 fenced 代码）在系统临时目录跑完整归档，返回：

```
【开发-批量重命名的 Python 脚本，把图片按拍摄日期】/
  ├─ 聊天记录.md
  ├─ session.json
  └─ 代码-2-1.py
```

真实会话验证：新建一个"写脚本"的会话 → 应出现 `【开发-…】/`（工作区根目录下），代码抽成同目录 `代码-N-M.py`；新建一个"写文案"的会话 → 应出现 `【文案-…】/`，聊天记录直接落在这个文件夹里。
