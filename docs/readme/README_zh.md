<div align="center">

[English](../README.md) · **简体中文** · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

# dsh-session-archive

### 会话归档 —— 把 DSH 会话产生的每一个文件分门别类放好。

自动按照**产出维度**对 DSH 会话生成的文件进行分类，让你一眼分清哪些是重要成果、哪些可以直接删除、哪些可以安全开源。

一个会话对应一个文件夹。文件夹内按需自动创建分类目录（成品 / 源码 / 工具 / 输出 / 参考 / 垃圾），**空目录永远不会被创建**；文件夹根目录最多只允许放 4 个文件。

- **不再有 `code-104-1-2.json`** —— 代码块使用语义化文件名（`cordis.patch.yml`、`buildName.js`）；同名但内容不同 → `.vN`
- **不产生重复副本** —— 写入前校验 sha256，内容相同的一律归入 `_trash/duplicates/`
- **内容互不混杂** —— 成品、源码、可复用脚本、参考资料、一次性垃圾文件各自待在独立分类里
- **删错也没关系** —— 整个 `_trash/` 文件夹可以直接删掉，零影响；`01-deliver/` 是只读导出目录，也是唯一建议你 `git push` 的目录

定位：一个运行在 DSH Node 宿主进程内的 DeepSeek Harness (DSH) 宿主插件。

## 安装

### 从 Release 压缩包安装（推荐）

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### 直接从仓库安装（含测试与文档）

```bash
pnpm add github:jsunon/dsh-session-archive
```

重启 DSH 宿主，然后验证：

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

如果返回的 `dirs` 有七个键（`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`），说明新代码已经生效。

### 本地开发

先克隆仓库，用 `pnpm add <本地路径>` 把 profile 指向它（也可以用 `~/.dsh/local-plugins/` 下的软链接），重启宿主，再用 `node tests/*.test.mjs` 跑完六套测试。

## 目录结构长什么样

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← 每个会话一个文件夹
   ├─ README.md                             ← 索引：类型、哪些可删、开源检查结果
   ├─ MANIFEST.json                         ← 审计轨迹：每个文件为什么在这里
   ├─ chat-log.md                           ← 完整会话记录
   ├─ session.json                          ← 元数据（会话 id、维度、数量）
   ├─ 01-deliver/                           ← 只读导出；唯一需要 git push 的目录
   ├─ 02-source/{original,patch,snapshot}/  ← 唯一的可写事实来源；original/ 为 .READONLY
   ├─ 03-tools/                             ← 可复用脚本
   ├─ 04-output/{long-lived,one-off}/       ← 非代码类产出
   ├─ 05-reference/                         ← 外部资料与结论
   └─ _trash/                               ← 整块删除，零影响
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← 幂等键
      └─ .oplog.jsonl                       ← 操作日志
```

**哪些可以删**：打开会话目录里的 `README.md`，里面有一张"可安全删除"表格；`MANIFEST.json` 里每个文件都带 `deletable` 标记。**能不能开源**：同一份 `README.md` 里有"开源检查"章节；只要命中密钥 / 私钥一律标记为 `blocked`。

## 迁移已有会话

第一次归档时会自动整理旧目录结构。历史记录很多时，建议手动执行 —— 先计划，后动手：

```bash
# 1) 试运行：只计算维度和路由计划，不改任何文件
node bin/plan.mjs "<workspace root>"
# 2) 先拿一个会话试
node bin/migrate.mjs "<workspace root>" --apply --only "【某个会话名】"
# 3) 再全量执行
node bin/migrate.mjs "<workspace root>" --apply
```

在执行 `--apply` 之前，它会把每个文件的相对路径、大小、sha256 记录到 `_trash/.backup-<timestamp>.json`，可以做到逐字节回滚；所有动作都会写入 `_trash/.oplog.jsonl`。迁移**只动会话文件夹内部，永远不碰工作区根目录**。

## 配置

编辑 `cordis.patch.yml` 里的 `config`，或者用设置面板（面板写入会持久化到 `~/.dsh/storages/session-archive/config.json`，优先级更高）。

主要选项：

| 键 | 默认值 | 含义 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `structured` | `true` | 分类目录结构；关闭则退回旧的扁平结构 |
| `writeManifest` | `true` | 是否写 `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | 开源安全检查 |
| `dedupeByHash` | `true` | 按 sha256 去重 |
| `strictRoot` | `false` | 是否只允许 4 个根文件留在会话根目录 |
| `containerName` | `(空)` | 非空则会话文件夹统一嵌套在其下 |
| `dirs.*` | 见下文 | 七个目录名；留空 = 不创建该分类 |

```yaml
dirs:
  chat:    chat-log.md
  deliver: 01-deliver
  src:     02-source
  tools:   03-tools
  output:  04-output
  ref:     05-reference
  trash:   _trash
```

完整选项：[`docs/config.md`](../config.md)。

## HTTP API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/dsh-session-archive` | 设置面板（中文 / English / 双语） |
| GET | `/dsh-session-archive/api/health` | 健康检查 + 当前配置 |
| GET | `/dsh-session-archive/api/state` | 已归档会话列表 |
| GET | `/dsh-session-archive/api/plan` | **试运行**：维度与计划，不写入 |
| POST | `/dsh-session-archive/api/archive` | 立即归档（可选 `?sessionId=`） |
| POST | `/dsh-session-archive/api/override` | 锁定维度（`{sessionId, dimensions, locked, lifecycle}`） |
| GET/POST | `/dsh-session-archive/api/config` | 读取 / 写入配置 |
| GET | `/dsh-session-archive/api/selftest` | 自检（在临时目录里写一次） |

分类不对？别改代码 —— 用 `POST /api/override` 锁定即可。

## 卸载

四个地方，按顺序来：

```bash
# 1) 删除源码副本（从仓库安装的可跳过，只清 node_modules 即可）
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) 删除 profile 内的安装
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) 删除运行时索引（可选；下次归档会自动重建历史索引）
rm -rf ~/.dsh/storages/session-archive
```

4. 检查 `~/.dsh/profiles/<profile-name>/package.json`：`dependencies` 和 `dsh.profile.bundles` 里都不再有 `dsh-session-archive`。

**不要删**已经归档好的会话文件夹（`01-deliver/` 等），也**不要删** `_trash/.backup-*.json` —— 那是你的回滚凭证。

## 设计说明

分类逻辑、路由优先级、命名规则、安全检查、审计轨迹、只读保护：[`docs/design.md`](../design.md)。

## 许可证

MIT
