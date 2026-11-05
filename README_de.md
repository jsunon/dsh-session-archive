<div align="center">

[English](./README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · **Deutsch** · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

# dsh-session-archive

### Session-Archiv — sortiert jede Datei, die eine DSH-Sitzung erzeugt, in die richtige Ablage.

Dateien, die eine DSH-Sitzung erzeugt, werden automatisch nach **Ergebnisdimension** einsortiert, damit du auf einen Blick siehst, was wichtig ist, was gelöscht werden kann und was sich gefahrlos veröffentlichen lässt.

Eine Sitzung = ein Ordner. Darin werden Verzeichnisse bei Bedarf angelegt (Ergebnisse / Quellcode / Werkzeuge / Ausgabe / Referenzen / Papierkorb). **Leere Verzeichnisse werden nie erzeugt**; im Wurzelverzeichnis der Sitzung dürfen höchstens 4 Dateien liegen.

- **Schluss mit `code-104-1-2.json`** — Codeblöcke bekommen sprechende Namen (`cordis.patch.yml`, `buildName.js`); gleicher Name und anderer Inhalt → `.vN`
- **Keine Duplikate** — vor dem Schreiben wird sha256 geprüft; identische Inhalte landen in `_trash/duplicates/`
- **Nichts vermischt** — Ergebnisse, Quellcode, wiederverwendbare Skripte, Referenzmaterial und Einweg-Kram liegen jeweils in eigenen Ablagen
- **Falsch löschen ist ungefährlich** — der komplette Ordner `_trash/` lässt sich ohne Folgen löschen; `01-deliver/` ist ein schreibgeschützter Export und das Einzige, was du `git push`en solltest

Zweck: ein DeepSeek-Harness-(DSH-)Host-Plugin, das im DSH-Node-Hostprozess läuft.

## Installation

### Aus dem Release-Tarball (empfohlen)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### Direkt aus dem Repository (inklusive Tests und Doku)

```bash
pnpm add github:jsunon/dsh-session-archive
```

DSH-Host neu starten und prüfen:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

Wenn `dirs` sieben Schlüssel enthält (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`), ist der neue Code aktiv.

### Lokale Entwicklung

Klonen, dann ein Profil mit `pnpm add <lokaler Pfad>` darauf zeigen lassen (oder eine Verknüpfung aus `~/.dsh/local-plugins/`), Host neu starten und die sechs Testsuites mit `node tests/*.test.mjs` ausführen.

## Wie die Ablage aussieht

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← ein Ordner pro Sitzung
   ├─ README.md                             ← Index: Typ, was gelöscht werden kann, Prüfungen vor Veröffentlichung
   ├─ MANIFEST.json                         ← Prüfpfad: warum jede Datei hier liegt
   ├─ chat-log.md                           ← vollständiges Protokoll
   ├─ session.json                          ← Metadaten (Sitzungs-ID, Dimensionen, Anzahlen)
   ├─ 01-deliver/                           ← schreibgeschützter Export; der einzige Ordner für git push
   ├─ 02-source/{original,patch,snapshot}/  ← die einzige beschreibbare Quelle der Wahrheit; original/ ist .READONLY
   ├─ 03-tools/                             ← wiederverwendbare Skripte
   ├─ 04-output/{long-lived,one-off}/       ← Ausgaben, die kein Code sind
   ├─ 05-reference/                         ← externe Materialien und Schlussfolgerungen
   └─ _trash/                               ← komplett löschbar, ohne Folgen
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← Idempotenzschlüssel
      └─ .oplog.jsonl                       ← Operationsprotokoll
```

**Was gelöscht werden kann**: Öffne die `README.md` der Sitzung — sie enthält eine Tabelle „gefahrlos löschbar“; in `MANIFEST.json` trägt jede Datei ein `deletable`-Flag. **Lässt es sich veröffentlichen**: dieselbe `README.md` hat einen Abschnitt „Prüfungen vor Veröffentlichung“; jeder Treffer auf Geheimnisse oder private Schlüssel wird als `blocked` markiert.

## Bestehende Sitzungen migrieren

Die erste Archivierung räumt das alte Layout automatisch auf. Bei viel Historie manuell ausführen — erst planen, dann handeln:

```bash
# 1) Probelauf: berechnet Dimensionen und den Routing-Plan, ändert nichts
node bin/plan.mjs "<workspace root>"
# 2) Erst eine Sitzung testen
node bin/migrate.mjs "<workspace root>" --apply --only "【ein Sitzungsname】"
# 3) Dann der gesamte Stapel
node bin/migrate.mjs "<workspace root>" --apply
```

Vor `--apply` werden relativer Pfad, Größe und sha256 jeder Datei in `_trash/.backup-<timestamp>.json` festgehalten, für bytegenaues Zurückrollen; alle Aktionen landen in `_trash/.oplog.jsonl`. Die Migration **arbeitet nur innerhalb der Sitzungsordner und fasst das Wurzelverzeichnis des Arbeitsbereichs nie an**.

## Konfiguration

Bearbeite `config` in `cordis.patch.yml` oder nutze das Einstellungsfenster (Schreibvorgänge dort landen in `~/.dsh/storages/session-archive/config.json` und haben Vorrang).

Wichtige Optionen:

| Schlüssel | Standard | Bedeutung |
| --- | --- | --- |
| `enabled` | `true` | Hauptschalter |
| `structured` | `true` | Ablage mit Unterordnern; aus = altes flaches Layout |
| `writeManifest` | `true` | `README.md` + `MANIFEST.json` schreiben |
| `safetyScan` | `true` | Sicherheitsprüfung vor Veröffentlichung |
| `dedupeByHash` | `true` | Deduplizierung per sha256 |
| `strictRoot` | `false` | nur die 4 Wurzeldateien im Sitzungsordner erlauben |
| `containerName` | `(leer)` | nicht leer = Sitzungsordner werden darunter verschachtelt |
| `dirs.*` | siehe unten | sieben Verzeichnisnamen; leer = Ablage wird nicht erzeugt |

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

Alle Optionen: [`docs/config.md`](docs/config.md).

## HTTP-API

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/dsh-session-archive` | Einstellungsfenster (Chinesisch / English / beides) |
| GET | `/dsh-session-archive/api/health` | Zustand + aktuelle Konfiguration |
| GET | `/dsh-session-archive/api/state` | Liste archivierter Sitzungen |
| GET | `/dsh-session-archive/api/plan` | **Probelauf**: Dimensionen und Plan, keine Schreibvorgänge |
| POST | `/dsh-session-archive/api/archive` | jetzt archivieren (optional `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | Dimensionen festlegen (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | Konfiguration lesen/schreiben |
| GET | `/dsh-session-archive/api/selftest` | Selbsttest (schreibt einmal in ein temporäres Verzeichnis) |

Falsche Klassifizierung? Nicht den Code patchen — mit `POST /api/override` festlegen.

## Deinstallation

Vier Stellen, der Reihe nach:

```bash
# 1) Quellcode-Kopie entfernen (bei Installation aus dem Repository überspringen, nur aus node_modules löschen)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) Installation im Profil entfernen
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) Laufzeitindex entfernen (optional; der Historienindex wird beim nächsten Archivieren neu aufgebaut)
rm -rf ~/.dsh/storages/session-archive
```

4. Prüfe `~/.dsh/profiles/<profile-name>/package.json`: weder in `dependencies` noch in `dsh.profile.bundles` darf `dsh-session-archive` übrig bleiben.

**Nicht löschen**: bereits archivierte Sitzungsordner (`01-deliver/` usw.) und `_trash/.backup-*.json` — das sind deine Rollback-Belege.

## Design-Notizen

Klassifizierungslogik, Routing-Prioritäten, Namensregeln, Sicherheitsprüfung, Prüfpfad, Schreibschutz: [`docs/design.md`](docs/design.md).

## Lizenz

MIT
