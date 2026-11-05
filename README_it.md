<div align="center">

[English](./README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · **Italiano** · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

# dsh-session-archive

### Archivio delle sessioni — sistema ogni file prodotto da una sessione DSH.

Classifica automaticamente i file generati da una sessione DSH in base alla **dimensione dell'output**, così vedi a colpo d'occhio cosa conta, cosa si può eliminare e cosa si può pubblicare senza rischi.

Una sessione = una cartella. Al suo interno le directory vengono create su richiesta (risultati / codice / strumenti / output / riferimenti / spazzatura). **Le directory vuote non vengono mai create**; nella radice della cartella possono restare al massimo 4 file.

- **Basta `code-104-1-2.json`** — i blocchi di codice ricevono nomi parlanti (`cordis.patch.yml`, `buildName.js`); stesso nome e contenuto diverso → `.vN`
- **Nessuna copia duplicata** — prima di scrivere si verifica lo sha256; i contenuti identici finiscono in `_trash/duplicates/`
- **Niente mescolato** — risultati, codice, script riutilizzabili, materiale di riferimento e scarti usa-e-getta stanno ognuno nella propria cartella
- **Eliminare per sbaglio non è un problema** — l'intera cartella `_trash/` può essere eliminata senza alcun impatto; `01-deliver/` è un export di sola lettura ed è l'unica cosa che dovresti `git push`

Scopo: un plugin host DeepSeek Harness (DSH) eseguito nel processo host di DSH Node.

## Installazione

### Dal tarball del Release (consigliato)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### Dal repository (include test e documentazione)

```bash
pnpm add github:jsunon/dsh-session-archive
```

Riavvia l'host DSH e verifica:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

Se `dirs` ha sette chiavi (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`), il nuovo codice è attivo.

### Sviluppo locale

Clona, punta un profilo ad esso con `pnpm add <percorso locale>` (oppure una giunzione da `~/.dsh/local-plugins/`), riavvia l'host e esegui le sei suite di test con `node tests/*.test.mjs`.

## Com'è fatta la struttura

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← una cartella per sessione
   ├─ README.md                             ← indice: tipo, cosa si può eliminare, controlli prima della pubblicazione
   ├─ MANIFEST.json                         ← traccia di audit: perché ogni file è qui
   ├─ chat-log.md                           ← trascrizione completa
   ├─ session.json                          ← metadati (id sessione, dimensioni, conteggi)
   ├─ 01-deliver/                           ← export di sola lettura; l'unica cartella da git push
   ├─ 02-source/{original,patch,snapshot}/  ← l'unica fonte di verità scrivibile; original/ è .READONLY
   ├─ 03-tools/                             ← script riutilizzabili
   ├─ 04-output/{long-lived,one-off}/       ← output che non è codice
   ├─ 05-reference/                         ← materiale esterno e conclusioni
   └─ _trash/                               ← eliminabile del tutto, impatto zero
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← chiavi di idempotenza
      └─ .oplog.jsonl                       ← log delle operazioni
```

**Cosa si può eliminare**: apri il `README.md` della sessione — contiene una tabella "eliminabile senza rischi"; in `MANIFEST.json` ogni file porta il flag `deletable`. **Si può pubblicare?**: lo stesso `README.md` ha una sezione "controlli prima della pubblicazione"; qualsiasi rilevamento di segreti o chiavi private viene marcato `blocked`.

## Migrare le sessioni esistenti

Il primo archiviazione sistema automaticamente il vecchio layout. Con molta cronologia, eseguilo a mano — prima pianifica, poi agisci:

```bash
# 1) Simulazione: calcola dimensioni e piano di instradamento, non tocca nulla
node bin/plan.mjs "<workspace root>"
# 2) Prova su una sessione
node bin/migrate.mjs "<workspace root>" --apply --only "【nome di una sessione】"
# 3) Poi tutto il lotto
node bin/migrate.mjs "<workspace root>" --apply
```

Prima di `--apply` registra percorso relativo, dimensione e sha256 di ogni file in `_trash/.backup-<timestamp>.json` per un rollback byte per byte; tutte le azioni finiscono in `_trash/.oplog.jsonl`. La migrazione **agisce solo dentro le cartelle di sessione e non tocca mai la radice del workspace**.

## Configurazione

Modifica `config` in `cordis.patch.yml` oppure usa il pannello impostazioni (ciò che scrive il pannello persiste in `~/.dsh/storages/session-archive/config.json`, che ha priorità).

Opzioni principali:

| Chiave | Predefinito | Significato |
| --- | --- | --- |
| `enabled` | `true` | interruttore generale |
| `structured` | `true` | struttura a cartelle; disattivato torna al vecchio formato piatto |
| `writeManifest` | `true` | scrive `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | scansione di sicurezza prima della pubblicazione |
| `dedupeByHash` | `true` | deduplica via sha256 |
| `strictRoot` | `false` | consente solo i 4 file radice nella radice della sessione |
| `containerName` | `(vuoto)` | se non vuoto, le cartelle di sessione si annidano sotto |
| `dirs.*` | vedi sotto | sette nomi di directory; vuoto = la cartella non viene creata |

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

Tutte le opzioni: [`docs/config.md`](docs/config.md).

## API HTTP

| Metodo | Percorso | Scopo |
| --- | --- | --- |
| GET | `/dsh-session-archive` | pannello impostazioni (cinese / English / entrambi) |
| GET | `/dsh-session-archive/api/health` | stato + configurazione corrente |
| GET | `/dsh-session-archive/api/state` | elenco sessioni archiviate |
| GET | `/dsh-session-archive/api/plan` | **simulazione**: dimensioni e piano, nessuna scrittura |
| POST | `/dsh-session-archive/api/archive` | archivia ora (opzionale `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | blocca le dimensioni (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | leggi/scrivi configurazione |
| GET | `/dsh-session-archive/api/selftest` | autotest (scrive una volta in una cartella temporanea) |

Classificazione sbagliata? Non modificare il codice — bloccala con `POST /api/override`.

## Disinstallazione

Quattro punti, in ordine:

```bash
# 1) rimuovi la copia dei sorgenti (salta se hai installato dal repository; basta toglierlo da node_modules)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) rimuovi l'installazione nel profilo
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) rimuovi l'indice di runtime (facoltativo; l'indice della cronologia viene ricostruito alla prossima archiviazione)
rm -rf ~/.dsh/storages/session-archive
```

4. Controlla `~/.dsh/profiles/<profile-name>/package.json`: non deve restare `dsh-session-archive` né in `dependencies` né in `dsh.profile.bundles`.

**Non eliminare** le cartelle di sessione già archiviate (`01-deliver/` ecc.) e **non eliminare** `_trash/.backup-*.json` — sono le tue garanzie di rollback.

## Note di progettazione

Logica di classificazione, priorità di instradamento, regole di denominazione, scansione di sicurezza, traccia di audit, protezione in sola lettura: [`docs/design.md`](docs/design.md).

## Licenza

MIT
