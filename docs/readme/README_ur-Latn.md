<div align="center">

[English](../README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · **Roman Urdu** · [Română](./README_ro.md)

</div>

# dsh-session-archive

### Session Archive — har ek file ko sahi jagah rakhta hai jo ek DSH session banata hai.

DSH session ki banayi hui files ko **output dimension** ke hisaab se khud-ba-khud darja-bandi karta hai, taake ek nazar mein pata chale kaunsi cheez ahem hai, kya delete ho sakti hai aur kya aman se public ki ja sakti hai.

Ek session = ek folder. Andar directories zaroorat ke mutabiq banti hain (deliverables / source / tools / output / reference / trash). **Khali directories kabhi nahi banti**; folder root mein sirf 4 files rakhi ja sakti hain.

- **Ab `code-104-1-2.json` nahi** — code blocks ko maani-khaiz naam milte hain (`cordis.patch.yml`, `buildName.js`); wahi naam aur mukhtalif content → `.vN`
- **Koi duplicate copy nahi** — likhne se pehle sha256 check hota hai; bilkul wahi content `_trash/duplicates/` mein chala jata hai
- **Kuch bhi mila-jula nahi** — deliverables, source, dobara istemal hone wale scripts, reference material aur ek-baar ka kachra apni-apni jagah rehte hain
- **Ghalat delete bhi mehfooz** — poora `_trash/` folder baghair kisi asar ke delete ho sakta hai; `01-deliver/` sirf-parhne wala export hai aur wohi ek cheez jise aap `git push` karein

Maqsad: DSH Node host process ke andar chalne wala DeepSeek Harness (DSH) host plugin.

## Installation

### Release tarball se (tajweez kiya jata hai)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### Seedha repository se (tests aur docs ke saath)

```bash
pnpm add github:jsunon/dsh-session-archive
```

DSH host ko restart karein, phir tasdeeq karein:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

Agar `dirs` mein saat keys hain (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`), to naya code chalu hai.

### Local development

Clone karein, phir `pnpm add <local path>` se ek profile ko us par point karein (ya `~/.dsh/local-plugins/` se junction banayein), host restart karein aur chhe test suites `node tests/*.test.mjs` se chalayein.

## Structure kaisa dikhta hai

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← har session ke liye ek folder
   ├─ README.md                             ← fehrist: qism, kya delete ho sakta hai, public karne se pehle ke checks
   ├─ MANIFEST.json                         ← audit trail: har file yahan kyun hai
   ├─ chat-log.md                           ← mukammal transcript
   ├─ session.json                          ← metadata (session id, dimensions, ginti)
   ├─ 01-deliver/                           ← sirf-parhne wala export; git push ke liye wohi ek folder
   ├─ 02-source/{original,patch,snapshot}/  ← likhne ke qabil wahid sach ka manba; original/ .READONLY hai
   ├─ 03-tools/                             ← dobara istemal hone wale scripts
   ├─ 04-output/{long-lived,one-off}/       ← aise outputs jo code nahi
   ├─ 05-reference/                         ← bahar ka material aur nateeje
   └─ _trash/                               ← poora delete karein, koi asar nahi
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← idempotency keys
      └─ .oplog.jsonl                       ← operations ka log
```

**Kya delete ho sakta hai**: session ka `README.md` kholein — usmein "aman se delete" ki table hai; `MANIFEST.json` mein har file par `deletable` flag hai. **Public ho sakta hai ya nahi**: usi `README.md` mein "public karne se pehle ke checks" ka hissa hai; secrets ya private keys milne par `blocked` likha jata hai.

## Mojooda sessions ki migration

Pehli archiving purane layout ko khud theek kar deti hai. Zyada history ho to ise haath se chalayein — pehle plan, phir amal:

```bash
# 1) Dry run: dimensions aur routing plan ginta hai, kuch nahi badalta
node bin/plan.mjs "<workspace root>"
# 2) Ek session par test karein
node bin/migrate.mjs "<workspace root>" --apply --only "【ek session ka naam】"
# 3) Phir poori batch
node bin/migrate.mjs "<workspace root>" --apply
```

`--apply` se pehle har file ka relative path, size aur sha256 `_trash/.backup-<timestamp>.json` mein likhta hai taake byte ke hisaab se wapas laaya ja sake; tamam kaam `_trash/.oplog.jsonl` mein jata hai. Migration **sirf session folders ke andar kaam karta hai, workspace root ko kabhi nahi chhoota**.

## Configuration

`cordis.patch.yml` mein `config` edit karein, ya settings panel istemal karein (panel jo likhta hai woh `~/.dsh/storages/session-archive/config.json` mein mehfooz hota hai aur usi ki tarjeeh hoti hai).

Ahem options:

| Key | Default | Matlab |
| --- | --- | --- |
| `enabled` | `true` | master switch |
| `structured` | `true` | buckets wala layout; band karne par purana flat layout |
| `writeManifest` | `true` | `README.md` + `MANIFEST.json` likhna |
| `safetyScan` | `true` | public karne se pehle safety scan |
| `dedupeByHash` | `true` | sha256 se dedupe |
| `strictRoot` | `false` | session root par sirf 4 root files ki ijazat |
| `containerName` | `(khali)` | khali na ho to session folders isi ke neeche nest honge |
| `dirs.*` | neeche dekhein | saat directory naam; khali = woh bucket nahi banega |

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

Tamam options: [`docs/config.md`](../config.md).

## HTTP API

| Method | Path | Maqsad |
| --- | --- | --- |
| GET | `/dsh-session-archive` | settings panel (Chinese / English / dono) |
| GET | `/dsh-session-archive/api/health` | health + mojooda config |
| GET | `/dsh-session-archive/api/state` | archive shuda sessions ki fehrist |
| GET | `/dsh-session-archive/api/plan` | **dry run**: dimensions aur plan, koi writing nahi |
| POST | `/dsh-session-archive/api/archive` | abhi archive karein (optional `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | dimensions lock karein (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | config parhna/likhna |
| GET | `/dsh-session-archive/api/selftest` | khud-test (ek baar temporary directory mein likhta hai) |

Darja-bandi ghalat hai? Code na badlein — `POST /api/override` se lock kar dein.

## Uninstall

Chaar jagah, tarteeb se:

```bash
# 1) source copy hatayein (repository se install kiya ho to chhorein; node_modules se hata lena kaafi hai)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) profile ki installation hatayein
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) runtime index hatayein (optional; history index agli archiving par dobara ban jata hai)
rm -rf ~/.dsh/storages/session-archive
```

4. `~/.dsh/profiles/<profile-name>/package.json` check karein: `dependencies` aur `dsh.profile.bundles` mein `dsh-session-archive` baqi na ho.

Pehle se archive shuda session folders (`01-deliver/` waghaira) **delete na karein**, aur `_trash/.backup-*.json` bhi **delete na karein** — yeh aapke rollback ke saboot hain.

## Design notes

Darja-bandi ki logic, routing ki tarjeeh, naam rakhne ke qawaid, safety scan, audit trail, sirf-parhne ka tahaffuz: [`docs/design.md`](../design.md).

## License

MIT
