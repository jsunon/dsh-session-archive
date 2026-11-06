# 配置项

配置来源：`cordis.patch.yml` 的 `config`（初始值）＋ 设置面板写入的覆盖值（持久化在 `~/.dsh/storages/session-archive/config.json`，优先级更高）。

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `showSidebarEntry` | `true` | 左侧栏是否显示「会话归档」入口；关掉只是隐藏入口，归档照常进行 |
| `structured` | `true` | 结构化分类；关闭退回旧版平铺 |
| `writeManifest` | `true` | 写 README.md + MANIFEST.json |
| `safetyScan` | `true` | 开源前安全扫描 |
| `dedupeByHash` | `true` | sha256 去重 |
| `strictRoot` | `false` | 会话根只允许 4 个文件 |
| `containerName` | `（空）` | 留空 = 会话文件夹直接放工作区根目录 |
| `nameTemplate` | `【{kind}-{summary}】` | 命名模板，支持 `{kind}` `{summary}` `{date}` `{time}` |
| `minChars` / `maxChars` | `15` / `30` | 名称长度（字） |
| `extractCode` | `true` | 提取代码块为独立文件 |
| `extractLongText` | `false` | 非代码长文本也单独存 |
| `blacklist` | `[]` | 命中则不新建文件夹 |
| `includeSubagents` | `false` | 是否给子代理会话建档 |
| `settleMs` / `tickMs` / `refreshMs` | `1500` / `20000` / `60000` | 排程节奏（毫秒） |
| `compressAfter` | `0` | 超过 N 条后转历史文件；0=关闭 |
| `cleanupHistoryDays` | `0` | 历史文件保留天数；0=永久 |
| `dirs.*` | 见下 | 七个固定目录名（留空 = 不建该桶） |

`dirs` 默认值：

```yaml
chat:    聊天记录.md
deliver: 01-成品
src:     02-源码
tools:   03-工具
output:  04-产物
ref:     05-参考
trash:   _临时
```

