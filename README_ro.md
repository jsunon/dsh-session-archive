<div align="center">

[English](./README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · **Română**

</div>

# dsh-session-archive

### Arhiva sesiunilor — sortează fiecare fișier produs de o sesiune DSH.

Sortează automat fișierele produse de o sesiune DSH după **dimensiunea rezultatului**, ca să vezi dintr-o privire ce contează, ce poate fi șters și ce poate fi publicat în siguranță.

O sesiune = un folder. În interior, folderele sunt create la cerere (rezultate / surse / instrumente / ieșiri / referințe / gunoi). **Folderele goale nu sunt niciodată create**; în rădăcina folderului pot sta cel mult 4 fișiere.

- **Gata cu `code-104-1-2.json`** — blocurile de cod primesc nume cu sens (`cordis.patch.yml`, `buildName.js`); același nume cu conținut diferit → `.vN`
- **Fără copii duplicate** — sha256 este verificat înainte de scriere; conținutul identic ajunge în `_trash/duplicates/`
- **Nimic amestecat** — rezultate, surse, scripturi reutilizabile, material de referință și gunoi de unică folosință stau fiecare în categoria lui
- **Ștergerea greșită e sigură** — întregul folder `_trash/` poate fi șters fără niciun impact; `01-deliver/` este o exportare read-only și singurul lucru pe care ar trebui să-l `git push`

Scop: un plugin de host DeepSeek Harness (DSH) care rulează în procesul host DSH Node.

## Instalare

### Din arhiva Release (recomandat)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### Direct din depozit (include teste și documentație)

```bash
pnpm add github:jsunon/dsh-session-archive
```

Repornește hostul DSH, apoi verifică:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

Dacă `dirs` are șapte chei (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`), codul nou este activ.

### Dezvoltare locală

Clonează depozitul, direcționează un profil către el cu `pnpm add <cale locală>` (sau o legătură din `~/.dsh/local-plugins/`), repornește hostul și rulează cele șase suite de teste cu `node tests/*.test.mjs`.

## Cum arată structura

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← un folder pe sesiune
   ├─ README.md                             ← index: tip, ce poate fi șters, verificări înainte de publicare
   ├─ MANIFEST.json                         ← pistă de audit: de ce este aici fiecare fișier
   ├─ chat-log.md                           ← transcriere completă
   ├─ session.json                          ← metadate (id sesiune, dimensiuni, numărători)
   ├─ 01-deliver/                           ← exportare read-only; singurul folder pentru git push
   ├─ 02-source/{original,patch,snapshot}/  ← singura sursă de adevăr scriibilă; original/ este .READONLY
   ├─ 03-tools/                             ← scripturi reutilizabile
   ├─ 04-output/{long-lived,one-off}/       ← rezultate care nu sunt cod
   ├─ 05-reference/                         ← material extern și concluzii
   └─ _trash/                               ← șterge integral, impact zero
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← chei de idempotență
      └─ .oplog.jsonl                       ← jurnal de operații
```

**Ce poate fi șters**: deschide `README.md` al sesiunii — are un tabel „ștergere sigură"; în `MANIFEST.json` fiecare fișier are marcajul `deletable`. **Poate fi publicat**: același `README.md` are o secțiune „verificări înainte de publicare"; orice detectare de secrete sau chei private este marcată `blocked`.

## Migrarea sesiunilor existente

Prima arhivare ordonează automat structura veche. Cu mult istoric, rulează manual — mai întâi plan, apoi acțiune:

```bash
# 1) Rulare de probă: calculează dimensiunile și planul de rutare, nu atinge nimic
node bin/plan.mjs "<workspace root>"
# 2) Încearcă pe o sesiune
node bin/migrate.mjs "<workspace root>" --apply --only "【numele unei sesiuni】"
# 3) Apoi tot lotul
node bin/migrate.mjs "<workspace root>" --apply
```

Înainte de `--apply` înregistrează calea relativă, dimensiunea și sha256 ale fiecărui fișier în `_trash/.backup-<timestamp>.json` pentru revenire exactă la nivel de byte; toate acțiunile ajung în `_trash/.oplog.jsonl`. Migrarea **acționează doar în interiorul folderelor de sesiune și nu atinge niciodată rădăcina spațiului de lucru**.

## Configurare

Editează `config` din `cordis.patch.yml` sau folosește panoul de setări (ce scrie panoul persistă în `~/.dsh/storages/session-archive/config.json`, care are prioritate).

Opțiuni principale:

| Cheie | Implicit | Semnificație |
| --- | --- | --- |
| `enabled` | `true` | comutator principal |
| `structured` | `true` | structură pe categorii; dezactivat revine la formatul plat vechi |
| `writeManifest` | `true` | scrie `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | scanare de siguranță înainte de publicare |
| `dedupeByHash` | `true` | deduplicare prin sha256 |
| `strictRoot` | `false` | permite doar cele 4 fișiere rădăcină în rădăcina sesiunii |
| `containerName` | `(gol)` | dacă nu e gol, folderele de sesiune sunt imbricate sub el |
| `dirs.*` | vezi mai jos | șapte nume de foldere; gol = categoria nu este creată |

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

Toate opțiunile: [`docs/config.md`](docs/config.md).

## API HTTP

| Metodă | Cale | Scop |
| --- | --- | --- |
| GET | `/dsh-session-archive` | panou de setări (chinezesc / English / ambele) |
| GET | `/dsh-session-archive/api/health` | stare + configurație curentă |
| GET | `/dsh-session-archive/api/state` | lista sesiunilor arhivate |
| GET | `/dsh-session-archive/api/plan` | **rulare de probă**: dimensiuni și plan, fără scriere |
| POST | `/dsh-session-archive/api/archive` | arhivează acum (opțional `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | blochează dimensiunile (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | citește/scrie configurația |
| GET | `/dsh-session-archive/api/selftest` | autotest (scrie o dată într-un folder temporar) |

Clasificare greșită? Nu modifica codul — blocheaz-o cu `POST /api/override`.

## Dezinstalare

Patru locuri, în ordine:

```bash
# 1) elimină copia surselor (sari peste dacă ai instalat din depozit; doar scoate-l din node_modules)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) elimină instalarea din profil
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) elimină indexul de runtime (opțional; indexul istoricului se reconstruiește la următoarea arhivare)
rm -rf ~/.dsh/storages/session-archive
```

4. Verifică `~/.dsh/profiles/<profile-name>/package.json`: nu trebuie să rămână `dsh-session-archive` nici în `dependencies`, nici în `dsh.profile.bundles`.

**Nu șterge** folderele de sesiune deja arhivate (`01-deliver/` etc.) și **nu șterge** `_trash/.backup-*.json` — sunt dovezile tale pentru revenire.

## Note de proiectare

Logica de clasificare, prioritatea de rutare, regulile de numire, scanarea de siguranță, pista de audit, protecția read-only: [`docs/design.md`](docs/design.md).

## Licență

MIT
