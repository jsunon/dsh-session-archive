<div align="center">

[English](../README.md) · [简体中文](./README_zh.md) · **繁體中文** · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

# dsh-session-archive

### 會話歸檔 —— 把 DSH 工作階段產生的每一個檔案分門別類放好。

依照**產出維度**自動分類 DSH 工作階段產生的檔案，讓你一眼看出哪些是重要成果、哪些可以直接刪除、哪些可以安全開源。

一個工作階段對應一個資料夾。資料夾內會視需求自動建立分類子目錄（成品 / 原始碼 / 工具 / 輸出 / 參考 / 垃圾），**空目錄永遠不會被建立**；根目錄最多只允許放 4 個檔案。

- **不再有 `code-104-1-2.json`** —— 程式碼區塊採用語義化檔名（`cordis.patch.yml`、`buildName.js`）；同名但內容不同 → `.vN`
- **不會產生重複副本** —— 寫入前比對 sha256，內容相同者一律歸入 `_trash/duplicates/`
- **內容互不混淆** —— 成品、原始碼、可重複使用的腳本、參考資料、一次性垃圾檔各自獨立分類
- **刪錯也沒關係** —— 整個 `_trash/` 資料夾可直接刪除，零影響；`01-deliver/` 是唯讀匯出目錄，也是唯一建議 `git push` 的目錄

定位：執行於 DSH Node 主程序內的 DeepSeek Harness (DSH) 宿主外掛。

## 安裝

### 從 Release 壓縮檔安裝（建議）

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### 直接從儲存庫安裝（含測試與文件）

```bash
pnpm add github:jsunon/dsh-session-archive
```

重新啟動 DSH 宿主，然後驗證：

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

如果回傳的 `dirs` 有七個鍵（`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`），代表新程式碼已生效。

### 本機開發

先複製儲存庫，用 `pnpm add <本機路徑>` 把 profile 指向它（也可用 `~/.dsh/local-plugins/` 下的連結），重新啟動宿主，再以 `node tests/*.test.mjs` 執行六套測試。

## 目錄結構長什麼樣子

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← 每個工作階段一個資料夾
   ├─ README.md                             ← 索引：類型、哪些可刪、開源檢查結果
   ├─ MANIFEST.json                         ← 稽核軌跡：每個檔案為何在這裡
   ├─ chat-log.md                           ← 完整對話紀錄
   ├─ session.json                          ← 中繼資料（工作階段 id、維度、數量）
   ├─ 01-deliver/                           ← 唯讀匯出；唯一需要 git push 的目錄
   ├─ 02-source/{original,patch,snapshot}/  ← 唯一可寫的真相來源；original/ 為 .READONLY
   ├─ 03-tools/                             ← 可重複使用的腳本
   ├─ 04-output/{long-lived,one-off}/       ← 非程式碼類產出
   ├─ 05-reference/                         ← 外部素材與結論
   └─ _trash/                               ← 整塊刪除，零影響
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← 幂等鍵
      └─ .oplog.jsonl                       ← 操作日誌
```

**哪些可以刪**：開啟工作階段目錄內的 `README.md`，裡面有一張「可安全刪除」表格；`MANIFEST.json` 中每個檔案都帶 `deletable` 標記。**能不能開源**：同一份 `README.md` 有「開源檢查」章節；只要命中金鑰 / 私鑰一律標記為 `blocked`。

## 遷移既有工作階段

第一次歸檔時會自動整理舊目錄結構。歷史紀錄很多時，建議手動執行 —— 先規劃，再動手：

```bash
# 1) 試跑：只計算維度與路由計畫，不改任何檔案
node bin/plan.mjs "<workspace root>"
# 2) 先拿一個工作階段試
node bin/migrate.mjs "<workspace root>" --apply --only "【某個工作階段名稱】"
# 3) 再全量執行
node bin/migrate.mjs "<workspace root>" --apply
```

執行 `--apply` 之前，會把每個檔案的相對路徑、大小、sha256 記錄到 `_trash/.backup-<timestamp>.json`，可做到位元組級回滾；所有動作都會寫入 `_trash/.oplog.jsonl`。遷移**只動工作階段資料夾內部，永遠不碰工作區根目錄**。

## 設定

編輯 `cordis.patch.yml` 中的 `config`，或使用設定面板（面板寫入會持久化到 `~/.dsh/storages/session-archive/config.json`，優先級更高）。

主要選項：

| 鍵 | 預設值 | 說明 |
| --- | --- | --- |
| `enabled` | `true` | 總開關 |
| `structured` | `true` | 分類目錄結構；關閉則回到舊的扁平結構 |
| `writeManifest` | `true` | 是否寫入 `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | 開源安全掃描 |
| `dedupeByHash` | `true` | 依 sha256 去重 |
| `strictRoot` | `false` | 是否只允許 4 個根檔案留在工作階段根目錄 |
| `containerName` | `(空)` | 非空時工作階段資料夾統一嵌套其下 |
| `dirs.*` | 見下文 | 七個目錄名稱；留空 = 不建立該分類 |

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

完整選項：[`docs/config.md`](../config.md)。

## HTTP API

| 方法 | 路徑 | 用途 |
| --- | --- | --- |
| GET | `/dsh-session-archive` | 設定面板（中文 / English / 雙語） |
| GET | `/dsh-session-archive/api/health` | 健康檢查 + 目前設定 |
| GET | `/dsh-session-archive/api/state` | 已歸檔工作階段清單 |
| GET | `/dsh-session-archive/api/plan` | **試跑**：維度與計畫，不寫入 |
| POST | `/dsh-session-archive/api/archive` | 立即歸檔（可選 `?sessionId=`） |
| POST | `/dsh-session-archive/api/override` | 鎖定維度（`{sessionId, dimensions, locked, lifecycle}`） |
| GET/POST | `/dsh-session-archive/api/config` | 讀取 / 寫入設定 |
| GET | `/dsh-session-archive/api/selftest` | 自我測試（在臨時目錄寫入一次） |

分類不對？別改程式碼 —— 用 `POST /api/override` 鎖定就好。

## 解除安裝

四個地方，依序處理：

```bash
# 1) 移除原始碼副本（從儲存庫安裝者可略過，只清 node_modules 即可）
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) 移除 profile 內的安裝
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) 移除執行階段索引（可選；下次歸檔會自動重建歷史索引）
rm -rf ~/.dsh/storages/session-archive
```

4. 檢查 `~/.dsh/profiles/<profile-name>/package.json`：`dependencies` 與 `dsh.profile.bundles` 裡都不再有 `dsh-session-archive`。

**不要刪**已歸檔完成的工作階段資料夾（`01-deliver/` 等），也**不要刪** `_trash/.backup-*.json` —— 那是你的回滾憑證。

## 設計說明

分類邏輯、路由優先級、命名規則、安全掃描、稽核軌跡、唯讀保護：[`docs/design.md`](../design.md)。

## 授權條款

MIT
