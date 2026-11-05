<div align="center">

**English** · [简体中文](./docs/readme/README_zh.md) · [繁體中文](./docs/readme/README_zh-TW.md) · [日本語](./docs/readme/README_ja.md) · [한국어](./docs/readme/README_ko.md) · [Türkçe](./docs/readme/README_tr.md) · [Русский](./docs/readme/README_ru.md) · [Tiếng Việt](./docs/readme/README_vi.md) · [ไทย](./docs/readme/README_th.md) · [Deutsch](./docs/readme/README_de.md) · [Español](./docs/readme/README_es.md) · [Français](./docs/readme/README_fr.md) · [Українська](./docs/readme/README_uk.md) · [Polski](./docs/readme/README_pl.md) · [Português (Brasil)](./docs/readme/README_pt-BR.md) · [العربية](./docs/readme/README_ar.md) · [فارسی](./docs/readme/README_fa.md) · [Bahasa Indonesia](./docs/readme/README_id.md) · [Italiano](./docs/readme/README_it.md) · [Ελληνικά](./docs/readme/README_el.md) · [മലയാളം](./docs/readme/README_ml.md) · [Roman Urdu](./docs/readme/README_ur-Latn.md) · [Română](./docs/readme/README_ro.md)

</div>

# dsh-session-archive

### Session Archive — bucket every file a DSH session produces.

Automatically bucket the files a DSH session produces by **output dimension**, so you can tell at a glance what matters, what can be deleted, and what is safe to open-source.

One session = one folder. Inside, buckets are created on demand (deliverables / source / tools / output / reference / trash). **Empty buckets are never created**; only 4 files may sit at the folder root.

- **No more `code-104-1-2.json`** — code blocks get semantic names (`cordis.patch.yml`, `buildName.js`); same name + different content → `.vN`
- **No duplicate copies** — sha256 is checked before writing; identical content lands in `_trash/duplicates/`
- **Nothing mixed together** — deliverables, source, reusable scripts, reference material, one-off junk all live in their own buckets
- **Delete wrong things safely** — the entire `_trash/` folder can be deleted with zero impact; `01-deliver/` is a read-only export and the only thing you should `git push`

Target: a DeepSeek Harness (DSH) Host plugin running inside the DSH Node host process.

## Installation

### From the Release tarball (recommended)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### From the repository (includes tests and docs)

```bash
pnpm add github:jsunon/dsh-session-archive
```

Restart the DSH host, then verify:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

If `dirs` has seven keys (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`), the new code is live.

### Local development

Clone, then point a profile at it with `pnpm add <local path>` (or a junction from `~/.dsh/local-plugins/`), restart the host, and run the seven test suites with `node tests/*.test.mjs`.

## In-app panel (browser half)

`package.json` declares `dsh.client` and exports `./client`, so the host also loads `lib/client.js` into the web app. You do not have to open a separate page:

| Where | What you get |
| --- | --- |
| Left sidebar, under **Plugins** | **Session Archive** entry (order 35) |
| That panel | Status / Settings / Plan / Sessions / Output tabs — archive now, self-test, move loose files back, dry-run plan, live switch flips |
| Plugins → installed → Session Archive | the same settings form as a config card |

Everything the panel shows comes from the HTTP API below, so the standalone page (`GET /dsh-session-archive`) still works and shows the same state. The client bundle only pulls `react` from the browser module table and registers three slots (`sidebar.panellist`, `main`, `plugins.bundle.config`); every registration is guarded so a broken slot can never block app boot.

## What the layout looks like

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← one folder per session
   ├─ README.md                             ← index: type, what can be deleted, open-source checks
   ├─ MANIFEST.json                         ← audit trail: why each file is here
   ├─ chat-log.md                           ← full transcript
   ├─ session.json                          ← metadata (session id, dimensions, counts)
   ├─ 01-deliver/                           ← read-only export; the only folder to git push
   ├─ 02-source/{original,patch,snapshot}/  ← the only writable source of truth; original/ is .READONLY
   ├─ 03-tools/                             ← reusable scripts
   ├─ 04-output/{long-lived,one-off}/       ← non-code output
   ├─ 05-reference/                         ← external material and conclusions
   └─ _trash/                               ← delete entirely, zero impact
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← idempotency keys
      └─ .oplog.jsonl                       ← operation log
```

**What can be deleted**: open the session's `README.md` — it has a "safe to delete" table; `MANIFEST.json` carries a `deletable` flag on every file. **Can it be open-sourced**: the same `README.md` has an "open-source checks" section; any hit on secrets/private keys is marked `blocked`.

## Migrating existing sessions

First archive auto-tidies the old layout. With lots of history, run it manually — plan first, act second:

```bash
# 1) Dry run: computes dimensions and the routing plan, touches nothing
node bin/plan.mjs "<workspace root>"
# 2) Try one session
node bin/migrate.mjs "<workspace root>" --apply --only "【one session name】"
# 3) Then the whole batch
node bin/migrate.mjs "<workspace root>" --apply
```

Before `--apply` it records every file's relative path, size and sha256 into `_trash/.backup-<timestamp>.json` for byte-exact rollback; all actions go to `_trash/.oplog.jsonl`. Migration **only touches inside session folders, never the workspace root**.

## Configuration

Edit `config` in `cordis.patch.yml`, or use the settings panel (panel writes persist to `~/.dsh/storages/session-archive/config.json`, which takes priority).

Key options:

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | master switch |
| `structured` | `true` | bucketed layout; off falls back to legacy flat |
| `writeManifest` | `true` | write `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | open-source safety scan |
| `dedupeByHash` | `true` | sha256 dedupe |
| `strictRoot` | `false` | only the 4 root files allowed at session root |
| `containerName` | `(empty)` | non-empty = session folders nest under it |
| `dirs.*` | see below | seven directory names; empty = bucket not created |

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

Full options: [`docs/config.md`](docs/config.md).

## HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/dsh-session-archive` | settings panel (Chinese / English / both) |
| GET | `/dsh-session-archive/api/health` | health + current config |
| GET | `/dsh-session-archive/api/state` | archived session list |
| GET | `/dsh-session-archive/api/plan` | **dry run**: dimensions and plan, no writes |
| POST | `/dsh-session-archive/api/archive` | archive now (optional `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | lock dimensions (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | read/write config |
| GET | `/dsh-session-archive/api/selftest` | self-test (writes once into a temp dir) |

Wrong classification? Don't patch code — lock it with `POST /api/override`.

## Uninstall

Four places, in order:

```bash
# 1) remove the source copy (skip if installed from the repo; just remove from node_modules)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) remove the profile install
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) remove the runtime index (optional; history index is rebuilt on next archive)
rm -rf ~/.dsh/storages/session-archive
```

4. Check `~/.dsh/profiles/<profile-name>/package.json`: no `dsh-session-archive` left in `dependencies` or `dsh.profile.bundles`.

**Do not delete** already-archived session folders (`01-deliver/` etc.), and **do not delete** `_trash/.backup-*.json` — those are your rollback credentials.

## Design notes

Classification logic, routing priority, naming rules, safety scan, audit trail, read-only protection: [`docs/design.md`](docs/design.md).

## License

MIT
