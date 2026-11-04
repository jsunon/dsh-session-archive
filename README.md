# dsh-session-archive · 会话归档

把 DSH 会话的落盘产物按**产出维度**自动分桶，让「哪些重要、哪些能删、哪些能开源」一眼看清。

一条会话 = 一个独立文件夹。文件夹内部按需分桶（成品 / 源码 / 工具 / 产物 / 参考 / 可删），**空桶不建**，根目录只留 4 个文件。

- **不再有 `代码-104-1-2.json`** —— 代码块按语义命名（`cordis.patch.yml`、`buildName.js`），同名不同内容用 `.vN`
- **不再有重复副本** —— 写盘前算 sha256，内容相同直接进 `_临时/重复/`
- **不再混在一起** —— 交付物、源码、可复用脚本、资料、一次性垃圾各归各的桶
- **删错了不影响运行** —— `_临时/` 整个删掉零影响；`01-成品/` 是只读导出，唯一该 `git push` 的东西

适用载体：DeepSeek Harness（DSH）宿主机（Host）插件，运行在 DSH 的 Node 宿主进程内。

---

## 安装

### 从 Release 包安装（推荐）

```bash
cd ~/.dsh/profiles/<profile名>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### 从仓库安装（含测试与文档）

```bash
pnpm add github:jsunon/dsh-session-archive
```

装完重启 DSH 宿主。验证：

```bash
curl http://127.0.0.1:<端口>/dsh-session-archive/api/health
```

返回的 `dirs` 是七键（`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`）就说明加载成功。

### 本地开发

```bash
git clone https://github.com/jsunon/dsh-session-archive.git
cd dsh-session-archive
node tests/naming.test.mjs && node tests/classify.test.mjs && node tests/pipeline.test.mjs
```

要求 Node ≥ 22（用 `node:` 内置模块与 `import` 断言）。无需构建，`lib/` 是明文 ES 模块。

---

## 目录长什么样

```
<工作区根目录>/
└─ 【开发-会话归档插件】/            ← 一条会话一个文件夹
   ├─ README.md                      ← 索引：判成什么类型、哪些能删、能不能开源
   ├─ MANIFEST.json                  ← 审计链：每个文件为什么在这里
   ├─ 聊天记录.md                    ← 完整对话
   ├─ session.json                   ← 元数据（会话 ID、维度、条数）
   ├─ 01-成品/                       ← 只读导出，唯一该 git push 的目录
   ├─ 02-源码/{原始,补丁,快照}/       ← 唯一可写真源；原始/ 带 .READONLY
   ├─ 03-工具/                       ← 可复用脚本
   ├─ 04-产物/{长期,一次性}/          ← 非代码产出
   ├─ 05-参考/                       ← 外部资料与结论
   └─ _临时/                         ← 整个删掉零影响
      ├─ 重复/  未归类/  失败尝试/  探测/
      ├─ 映射-旧名.json
      ├─ .archive-state.json         ← 幂等键
      └─ .oplog.jsonl                ← 操作日志
```

**怎么判断哪些能删**：打开会话里的 `README.md`，有一张「可直接删除」表；`MANIFEST.json` 里每个文件带 `deletable` 字段。**怎么判断能不能开源**：同一份 `README.md` 的「开源前检查」小节，命中密钥/私钥会直接标 `阻断`。

---

## 迁移已有的历史会话

首次归档会自动整理旧结构。历史会话很多时建议手工跑，先看后动：

```bash
# 1) 试运行：只算维度和路由计划，一个字节都不动
node bin/plan.mjs "<工作区根目录>"

# 2) 单个会话试水
node bin/migrate.mjs "<工作区根目录>" --apply --only "【某个会话名】"

# 3) 确认无误后整批
node bin/migrate.mjs "<工作区根目录>" --apply
```

`--apply` 之前会在每个会话的 `_临时/.backup-<时间戳>.json` 记下整理前每个文件的相对路径、大小与 sha256，回滚时能逐字节核对；全部动作写进 `_临时/.oplog.jsonl`。迁移**只动会话文件夹内部，永不碰工作区根目录**。

---

## 配置

改 `cordis.patch.yml` 的 `config`，或在设置面板里改（面板写入的值持久化在 `~/.dsh/storages/session-archive/config.json`，优先级更高）。

常用几项：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `structured` | `true` | 结构化分桶；关掉退回旧版平铺 |
| `writeManifest` | `true` | 写 `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | 开源前安全扫描 |
| `dedupeByHash` | `true` | sha256 去重 |
| `strictRoot` | `false` | 会话根只允许 4 个文件 |
| `containerName` | `（空）` | 留空 = 会话文件夹直接放工作区根目录 |
| `dirs.*` | 见下 | 七个目录名，留空 = 不建该桶 |

```yaml
dirs:
  chat:    聊天记录.md
  deliver: 01-成品
  src:     02-源码
  tools:   03-工具
  output:  04-产物
  ref:     05-参考
  trash:   _临时
```

完整配置项见 [`docs/config.md`](docs/config.md)。

---

## HTTP 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/dsh-session-archive` | 设置面板 |
| GET | `/dsh-session-archive/api/health` | 健康状态与当前配置 |
| GET | `/dsh-session-archive/api/state` | 已归档会话列表 |
| GET | `/dsh-session-archive/api/plan` | **试运行**：只算维度与目录计划，不写盘 |
| POST | `/dsh-session-archive/api/archive` | 立即归档（可带 `?sessionId=`） |
| POST | `/dsh-session-archive/api/override` | 锁定维度（`{sessionId, dimensions, locked, lifecycle}`） |
| GET/POST | `/dsh-session-archive/api/config` | 读/写配置 |
| GET | `/dsh-session-archive/api/selftest` | 自检（在临时目录写一遍） |

判定错了不用改代码，`POST /api/override` 锁死维度即可。

---

## 卸载

四处，按顺序：

```bash
# 1) 删源码（从仓库装的话这步跳过，删 node_modules 里的即可）
rm -rf ~/.dsh/local-plugins/dsh-session-archive

# 2) 删 profile 里的安装
cd ~/.dsh/profiles/<profile名>
pnpm remove dsh-session-archive

# 3) 删运行期索引（可选；删了历史归档索引会丢，下次归档重建）
rm -rf ~/.dsh/storages/session-archive
```

4. 检查 `~/.dsh/profiles/<profile名>/package.json`：`dependencies` 里不该再有 `dsh-session-archive`，`dsh.profile.bundles` 数组里也不该有它。

**不要删**工作区里已经归档好的会话文件夹（`01-成品/` 等），也**不要删**各会话 `_临时/.backup-*.json`——那是回滚凭据。

---

## 设计细节

判定逻辑、路由优先级、命名规则、安全扫描、审计链、只读保护等实现说明在 [`docs/design.md`](docs/design.md)。

## 许可

MIT
