<div align="center">

[English](./README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · **日本語** · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

# dsh-session-archive

### セッションアーカイブ —— DSH セッションが生み出すすべてのファイルを仕分けします。

DSH セッションが生成したファイルを**出力の次元**ごとに自動分類し、どれが重要で、どれを削除でき、どれを安全にオープンソース化できるかを一目で分かるようにします。

1 セッション = 1 フォルダ。フォルダ内には必要に応じて分類ディレクトリ（成果物 / ソース / ツール / 出力 / 参考資料 / ゴミ）が作られます。**空のディレクトリは決して作られません**。フォルダ直下に置けるファイルは最大 4 個までです。

- **`code-104-1-2.json` とはもうお別れ** —— コードブロックには意味のある名前が付きます（`cordis.patch.yml`、`buildName.js`）。同名で内容が異なる場合は `.vN`
- **重複コピーを作らない** —— 書き込み前に sha256 を照合し、内容が同一なら `_trash/duplicates/` に集約
- **混ざらない** —— 成果物、ソース、再利用可能なスクリプト、参考資料、使い捨てのゴミはそれぞれ独立した分類に入る
- **誤削除しても安全** —— `_trash/` フォルダ全体を削除しても影響ゼロ。`01-deliver/` は読み取り専用のエクスポート先で、`git push` すべき唯一のディレクトリです

位置づけ：DSH Node ホストプロセス内で動作する DeepSeek Harness (DSH) ホストプラグイン。

## インストール

### Release の tarball から（推奨）

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### リポジトリから（テストとドキュメントを含む）

```bash
pnpm add github:jsunon/dsh-session-archive
```

DSH ホストを再起動して確認します：

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

返ってきた `dirs` に 7 つのキー（`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`）があれば、新しいコードが有効です。

### ローカル開発

クローンしたあと、`pnpm add <ローカルパス>`（または `~/.dsh/local-plugins/` からのジャンクション）で profile をそのパスに向け、ホストを再起動し、`node tests/*.test.mjs` で 6 つのテストスイートを実行します。

## ディレクトリ構成

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← 1 セッション = 1 フォルダ
   ├─ README.md                             ← 索引：タイプ、削除可能なもの、オープンソース検査
   ├─ MANIFEST.json                         ← 監査トレイル：各ファイルがここにある理由
   ├─ chat-log.md                           ← 完全なトランスクリプト
   ├─ session.json                          ← メタデータ（セッション id、次元、件数）
   ├─ 01-deliver/                           ← 読み取り専用のエクスポート。git push すべき唯一のフォルダ
   ├─ 02-source/{original,patch,snapshot}/  ← 唯一の書き込み可能な正である情報源。original/ は .READONLY
   ├─ 03-tools/                             ← 再利用可能なスクリプト
   ├─ 04-output/{long-lived,one-off}/       ← コード以外の出力
   ├─ 05-reference/                         ← 外部資料と結論
   └─ _trash/                               ← 丸ごと削除しても影響ゼロ
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← 冪等キー
      └─ .oplog.jsonl                       ← 操作ログ
```

**削除できるもの**：セッションの `README.md` を開くと「安全に削除できる」表があります。`MANIFEST.json` の各ファイルには `deletable` フラグが付いています。**オープンソースにできるか**：同じ `README.md` に「オープンソース検査」の節があり、シークレットや秘密鍵が検出された場合は `blocked` とマークされます。

## 既存セッションの移行

初回のアーカイブ時に旧レイアウトを自動で整理します。履歴が多い場合は手動で実行してください —— まず計画、次に実行です：

```bash
# 1) ドライラン：次元とルーティング計画だけを計算し、何も変更しません
node bin/plan.mjs "<workspace root>"
# 2) 1 セッションで試す
node bin/migrate.mjs "<workspace root>" --apply --only "【あるセッション名】"
# 3) その後まとめて実行
node bin/migrate.mjs "<workspace root>" --apply
```

`--apply` の前に、各ファイルの相対パス・サイズ・sha256 を `_trash/.backup-<timestamp>.json` に記録するので、バイト単位でロールバックできます。すべての操作は `_trash/.oplog.jsonl` に記録されます。移行は**セッションフォルダ内だけを対象とし、ワークスペースのルートには決して触れません**。

## 設定

`cordis.patch.yml` の `config` を編集するか、設定パネルを使います（パネルでの書き込みは `~/.dsh/storages/session-archive/config.json` に永続化され、こちらが優先されます）。

主なオプション：

| キー | 既定値 | 意味 |
| --- | --- | --- |
| `enabled` | `true` | マスタースイッチ |
| `structured` | `true` | 分類ディレクトリ構成。オフにすると従来のフラット構成に戻る |
| `writeManifest` | `true` | `README.md` + `MANIFEST.json` を書き出す |
| `safetyScan` | `true` | オープンソース安全性スキャン |
| `dedupeByHash` | `true` | sha256 による重複排除 |
| `strictRoot` | `false` | セッション直下を 4 つのルートファイルのみに制限 |
| `containerName` | `(空)` | 空でなければ、セッションフォルダをその下にまとめる |
| `dirs.*` | 下記参照 | 7 つのディレクトリ名。空にするとその分類は作成されない |

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

すべてのオプション：[`docs/config.md`](docs/config.md)。

## HTTP API

| メソッド | パス | 用途 |
| --- | --- | --- |
| GET | `/dsh-session-archive` | 設定パネル（中国語 / English / 両方） |
| GET | `/dsh-session-archive/api/health` | ヘルスチェック + 現在の設定 |
| GET | `/dsh-session-archive/api/state` | アーカイブ済みセッション一覧 |
| GET | `/dsh-session-archive/api/plan` | **ドライラン**：次元と計画。書き込みなし |
| POST | `/dsh-session-archive/api/archive` | 今すぐアーカイブ（任意で `?sessionId=`） |
| POST | `/dsh-session-archive/api/override` | 次元を固定（`{sessionId, dimensions, locked, lifecycle}`） |
| GET/POST | `/dsh-session-archive/api/config` | 設定の読み書き |
| GET | `/dsh-session-archive/api/selftest` | セルフテスト（一時ディレクトリに一度だけ書き込む） |

分類が違う？コードを書き換えるのではなく、`POST /api/override` で固定してください。

## アンインストール

4 か所を順番に：

```bash
# 1) ソースのコピーを削除（リポジトリから入れた場合はスキップ。node_modules から消すだけでよい）
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) profile 内のインストールを削除
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) ランタイム索引を削除（任意。次回アーカイブ時に履歴索引は再構築される）
rm -rf ~/.dsh/storages/session-archive
```

4. `~/.dsh/profiles/<profile-name>/package.json` を確認し、`dependencies` と `dsh.profile.bundles` のどちらにも `dsh-session-archive` が残っていないことを確かめます。

アーカイブ済みのセッションフォルダ（`01-deliver/` など）は**削除しないでください**。`_trash/.backup-*.json` も**削除しないでください** —— ロールバックの鍵です。

## 設計メモ

分類ロジック、ルーティング優先度、命名規則、安全性スキャン、監査トレイル、読み取り専用保護：[`docs/design.md`](docs/design.md)。

## ライセンス

MIT
