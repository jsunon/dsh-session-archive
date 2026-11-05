<div align="center">

[English](./README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · **Русский** · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

# dsh-session-archive

### Архив сессий — раскладывает по папкам каждый файл, который создаёт сессия DSH.

Автоматически распределяет файлы, созданные сессией DSH, по **типу результата**, чтобы с первого взгляда было понятно, что важно, что можно удалить и что безопасно открыть публично.

Одна сессия = одна папка. Внутри по необходимости создаются каталоги (результаты / исходники / инструменты / вывод / справочные материалы / мусор). **Пустые каталоги никогда не создаются**: в корне папки сессии допускается не более 4 файлов.

- **Больше никаких `code-104-1-2.json`** — блоки кода получают смысловые имена (`cordis.patch.yml`, `buildName.js`); при совпадении имени и различии содержимого → `.vN`
- **Никаких дубликатов** — перед записью проверяется sha256; одинаковое содержимое отправляется в `_trash/duplicates/`
- **Ничего не смешивается** — результаты, исходники, переиспользуемые скрипты, справочные материалы и разовый мусор лежат в своих каталогах
- **Удалять не то — безопасно** — папку `_trash/` можно удалить целиком без последствий; `01-deliver/` — экспорт только для чтения и единственное, что стоит `git push`

Назначение: хост-плагин DeepSeek Harness (DSH), работающий внутри процесса узла DSH.

## Установка

### Из архива Release (рекомендуется)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### Напрямую из репозитория (включая тесты и документацию)

```bash
pnpm add github:jsunon/dsh-session-archive
```

Перезапустите хост DSH и проверьте:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

Если в ответе `dirs` содержит семь ключей (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`), новый код работает.

### Локальная разработка

Клонируйте репозиторий, направьте профиль на него через `pnpm add <локальный путь>` (или соединение из `~/.dsh/local-plugins/`), перезапустите хост и запустите шесть наборов тестов: `node tests/*.test.mjs`.

## Как выглядит структура

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← одна папка на сессию
   ├─ README.md                             ← индекс: тип, что можно удалить, проверки перед публикацией
   ├─ MANIFEST.json                         ← журнал аудита: почему файл лежит здесь
   ├─ chat-log.md                           ← полная стенограмма
   ├─ session.json                          ← метаданные (id сессии, измерения, счётчики)
   ├─ 01-deliver/                           ← экспорт только для чтения; единственная папка для git push
   ├─ 02-source/{original,patch,snapshot}/  ← единственный записываемый источник истины; original/ помечен .READONLY
   ├─ 03-tools/                             ← переиспользуемые скрипты
   ├─ 04-output/{long-lived,one-off}/       ← результаты, не являющиеся кодом
   ├─ 05-reference/                         ← внешние материалы и выводы
   └─ _trash/                               ← удаляется целиком, без последствий
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← ключи идемпотентности
      └─ .oplog.jsonl                       ← журнал операций
```

**Что можно удалить**: откройте `README.md` сессии — там есть таблица «можно безопасно удалить»; в `MANIFEST.json` у каждого файла есть флаг `deletable`. **Можно ли открыть публично**: в том же `README.md` есть раздел «проверки перед публикацией»; при обнаружении секретов или закрытых ключей ставится отметка `blocked`.

## Перенос существующих сессий

Первое архивирование автоматически приводит в порядок старую структуру. Если истории много, запускайте вручную — сначала план, потом действия:

```bash
# 1) Пробный запуск: считает измерения и план маршрутизации, ничего не меняет
node bin/plan.mjs "<workspace root>"
# 2) Пробуем на одной сессии
node bin/migrate.mjs "<workspace root>" --apply --only "【имя одной сессии】"
# 3) Затем весь пакет
node bin/migrate.mjs "<workspace root>" --apply
```

Перед `--apply` записывает относительный путь, размер и sha256 каждого файла в `_trash/.backup-<timestamp>.json` для побайтового отката; все действия попадают в `_trash/.oplog.jsonl`. Перенос **затрагивает только внутрипапочное содержимое сессий и никогда не касается корня рабочей области**.

## Настройка

Измените `config` в `cordis.patch.yml` либо используйте панель настроек (значения из панели сохраняются в `~/.dsh/storages/session-archive/config.json` и имеют приоритет).

Ключевые параметры:

| Ключ | По умолчанию | Значение |
| --- | --- | --- |
| `enabled` | `true` | общий переключатель |
| `structured` | `true` | структура с каталогами; при отключении — старая плоская схема |
| `writeManifest` | `true` | записывать `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | проверка безопасности перед публикацией |
| `dedupeByHash` | `true` | дедупликация по sha256 |
| `strictRoot` | `false` | допускать в корне сессии только 4 файла |
| `containerName` | `(пусто)` | непустое значение — папки сессий вкладываются в него |
| `dirs.*` | см. ниже | семь имён каталогов; пустое значение — каталог не создаётся |

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

Все параметры: [`docs/config.md`](docs/config.md).

## HTTP API

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/dsh-session-archive` | панель настроек (китайский / English / оба) |
| GET | `/dsh-session-archive/api/health` | состояние и текущая конфигурация |
| GET | `/dsh-session-archive/api/state` | список архивированных сессий |
| GET | `/dsh-session-archive/api/plan` | **пробный запуск**: измерения и план, без записи |
| POST | `/dsh-session-archive/api/archive` | архивировать сейчас (опционально `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | зафиксировать измерения (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | чтение / запись конфигурации |
| GET | `/dsh-session-archive/api/selftest` | самодиагностика (один раз пишет во временный каталог) |

Классификация неверна? Не правьте код — зафиксируйте её через `POST /api/override`.

## Удаление

Четыре места по порядку:

```bash
# 1) удалить копию исходников (при установке из репозитория пропустите, удалите только из node_modules)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) удалить установку в профиле
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) удалить индекс времени выполнения (необязательно; индекс истории пересоберётся при следующем архивировании)
rm -rf ~/.dsh/storages/session-archive
```

4. Откройте `~/.dsh/profiles/<profile-name>/package.json`: в `dependencies` и `dsh.profile.bundles` не должно остаться `dsh-session-archive`.

**Не удаляйте** уже архивированные папки сессий (`01-deliver/` и другие) и **не удаляйте** `_trash/.backup-*.json` — это ваши данные для отката.

## Заметки о дизайне

Логика классификации, приоритеты маршрутизации, правила именования, проверка безопасности, журнал аудита, защита от записи: [`docs/design.md`](docs/design.md).

## Лицензия

MIT
