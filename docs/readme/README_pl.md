<div align="center">

[English](../README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · **Polski** · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

# dsh-session-archive

### Archiwum sesji — porządkuje każdy plik wytworzony przez sesję DSH.

Automatycznie klasyfikuje pliki wytworzone przez sesję DSH według **wymiaru wyniku**, żebyś od razu widział, co jest ważne, co można usunąć i co można bezpiecznie upublicznić.

Jedna sesja = jeden folder. W środku katalogi tworzone są w razie potrzeby (wyniki / źródła / narzędzia / produkty / materiały / śmieci). **Puste katalogi nigdy nie powstają**; w katalogu głównym sesji może leżeć maksymalnie 4 pliki.

- **Koniec z `code-104-1-2.json`** — bloki kodu dostają nazwy znaczące (`cordis.patch.yml`, `buildName.js`); ta sama nazwa i inna treść → `.vN`
- **Żadnych duplikatów** — przed zapisem sprawdzany jest sha256; identyczna treść trafia do `_trash/duplicates/`
- **Nic się nie miesza** — wyniki, źródła, skrypty wielokrotnego użytku, materiały referencyjne i jednorazowe śmieci leżą w swoich katalogach
- **Usunięcie nie tego jest bezpieczne** — cały katalog `_trash/` można skasować bez żadnych skutków; `01-deliver/` to eksport tylko do odczytu i jedyne, co warto `git push`

Przeznaczenie: wtyczka hosta DeepSeek Harness (DSH) działająca w procesie hosta DSH Node.

## Instalacja

### Z archiwum Release (zalecane)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### Bezpośrednio z repozytorium (zawiera testy i dokumentację)

```bash
pnpm add github:jsunon/dsh-session-archive
```

Uruchom ponownie host DSH i sprawdź:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

Jeśli `dirs` zawiera siedem kluczy (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`), nowy kod działa.

### Praca lokalna

Sklonuj repozytorium, wskaż profil na nie przez `pnpm add <ścieżka lokalna>` (lub dowiązanie z `~/.dsh/local-plugins/`), uruchom ponownie hosta i wykonaj sześć zestawów testów przez `node tests/*.test.mjs`.

## Jak wygląda struktura

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← jeden folder na sesję
   ├─ README.md                             ← indeks: typ, co można usunąć, sprawdzenia przed publikacją
   ├─ MANIFEST.json                         ← ścieżka audytu: dlaczego dany plik tu jest
   ├─ chat-log.md                           ← pełny transkrypt
   ├─ session.json                          ← metadane (id sesji, wymiary, liczby)
   ├─ 01-deliver/                           ← eksport tylko do odczytu; jedyny folder do git push
   ├─ 02-source/{original,patch,snapshot}/  ← jedyne zapisywalne źródło prawdy; original/ ma .READONLY
   ├─ 03-tools/                             ← skrypty wielokrotnego użytku
   ├─ 04-output/{long-lived,one-off}/       ← wyniki niebędące kodem
   ├─ 05-reference/                         ← materiały zewnętrzne i wnioski
   └─ _trash/                               ← usunięcie całkowite, bez skutków
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← klucze idempotencji
      └─ .oplog.jsonl                       ← dziennik operacji
```

**Co można usunąć**: otwórz `README.md` sesji — zawiera tabelę „bezpieczne do usunięcia"; w `MANIFEST.json` każdy plik ma flagę `deletable`. **Czy można upublicznić**: ten sam `README.md` ma sekcję „sprawdzenia przed publikacją"; każdy wykryty sekret lub klucz prywatny jest oznaczany jako `blocked`.

## Migracja istniejących sesji

Pierwsze archiwizowanie automatycznie porządkuje stary układ. Przy dużej historii uruchamiaj ręcznie — najpierw plan, potem działanie:

```bash
# 1) Próba: liczy wymiary i plan trasowania, niczego nie zmienia
node bin/plan.mjs "<workspace root>"
# 2) Wypróbuj na jednej sesji
node bin/migrate.mjs "<workspace root>" --apply --only "【nazwa jednej sesji】"
# 3) Potem cała partia
node bin/migrate.mjs "<workspace root>" --apply
```

Przed `--apply` zapisuje względną ścieżkę, rozmiar i sha256 każdego pliku do `_trash/.backup-<timestamp>.json`, co pozwala wycofać zmiany bajt w bajt; wszystkie działania trafiają do `_trash/.oplog.jsonl`. Migracja **działa wyłącznie wewnątrz folderów sesji i nigdy nie dotyka katalogu głównego obszaru roboczego**.

## Konfiguracja

Edytuj `config` w `cordis.patch.yml` lub użyj panelu ustawień (to, co zapisze panel, trafia do `~/.dsh/storages/session-archive/config.json` i ma priorytet).

Najważniejsze opcje:

| Klucz | Domyślnie | Znaczenie |
| --- | --- | --- |
| `enabled` | `true` | wyłącznik główny |
| `structured` | `true` | układ katalogów; wyłączony = dawny płaski układ |
| `writeManifest` | `true` | zapis `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | skan bezpieczeństwa przed publikacją |
| `dedupeByHash` | `true` | deduplikacja po sha256 |
| `strictRoot` | `false` | dopuść w katalogu głównym sesji tylko 4 pliki |
| `containerName` | `(puste)` | niepuste = foldery sesji zagnieżdżone pod nim |
| `dirs.*` | patrz niżej | siedem nazw katalogów; puste = katalog nie powstaje |

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

Pełna lista opcji: [`docs/config.md`](../config.md).

## API HTTP

| Metoda | Ścieżka | Cel |
| --- | --- | --- |
| GET | `/dsh-session-archive` | panel ustawień (chiński / English / oba) |
| GET | `/dsh-session-archive/api/health` | stan + aktualna konfiguracja |
| GET | `/dsh-session-archive/api/state` | lista zarchiwizowanych sesji |
| GET | `/dsh-session-archive/api/plan` | **próba**: wymiary i plan, bez zapisu |
| POST | `/dsh-session-archive/api/archive` | archiwizuj teraz (opcjonalnie `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | zablokuj wymiary (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | odczyt/zapis konfiguracji |
| GET | `/dsh-session-archive/api/selftest` | autotest (raz zapisuje do katalogu tymczasowego) |

Zła klasyfikacja? Nie poprawiaj kodu — zablokuj ją przez `POST /api/override`.

## Odinstalowanie

Cztery miejsca, po kolei:

```bash
# 1) usuń kopię źródeł (pomiń, jeśli instalowałeś z repozytorium; wystarczy usunąć z node_modules)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) usuń instalację w profilu
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) usuń indeks runtime (opcjonalnie; indeks historii odtworzy się przy kolejnym archiwizowaniu)
rm -rf ~/.dsh/storages/session-archive
```

4. Sprawdź `~/.dsh/profiles/<profile-name>/package.json`: `dsh-session-archive` nie powinien pozostać ani w `dependencies`, ani w `dsh.profile.bundles`.

**Nie usuwaj** już zarchiwizowanych folderów sesji (`01-deliver/` itd.) i **nie usuwaj** `_trash/.backup-*.json` — to twoje dowody do wycofania zmian.

## Notatki projektowe

Logika klasyfikacji, priorytet trasowania, reguły nazewnictwa, skan bezpieczeństwa, ścieżka audytu, ochrona tylko do odczytu: [`docs/design.md`](../design.md).

## Licencja

MIT
