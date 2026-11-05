<div align="center">

[English](../README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · **Українська** · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

# dsh-session-archive

### Архів сесій — розкладає по теках кожен файл, який створює сесія DSH.

Автоматично розподіляє файли, створені сесією DSH, за **виміром результату**, щоб з першого погляду було видно, що важливе, що можна видалити і що безпечно відкрити публічно.

Одна сесія = одна тека. Усередині за потреби створюються каталоги (результати / джерела / інструменти / вивід / довідкові матеріали / сміття). **Порожні каталоги ніколи не створюються**; у корені теки сесії може бути щонайбільше 4 файли.

- **Більше жодних `code-104-1-2.json`** — блоки коду отримують змістовні назви (`cordis.patch.yml`, `buildName.js`); однакова назва й різний вміст → `.vN`
- **Жодних дублікатів** — перед записом перевіряється sha256; ідентичний вміст потрапляє до `_trash/duplicates/`
- **Нічого не змішується** — результати, джерела, скрипти для повторного використання, довідкові матеріали й одноразове сміття лежать у своїх каталогах
- **Видалити не те — безпечно** — теку `_trash/` можна видалити повністю без наслідків; `01-deliver/` — експорт лише для читання і єдине, що варто `git push`

Призначення: хост-плагін DeepSeek Harness (DSH), що працює всередині процесу вузла DSH.

## Встановлення

### З архіву Release (рекомендовано)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### Безпосередньо з репозиторію (разом із тестами та документацією)

```bash
pnpm add github:jsunon/dsh-session-archive
```

Перезапустіть хост DSH і перевірте:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

Якщо у відповіді `dirs` має сім ключів (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`), новий код працює.

### Локальна розробка

Клонуйте репозиторій, спрямуйте профіль на нього через `pnpm add <локальний шлях>` (або з'єднання з `~/.dsh/local-plugins/`), перезапустіть хост і запустіть шість наборів тестів: `node tests/*.test.mjs`.

## Як виглядає структура

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← одна тека на сесію
   ├─ README.md                             ← індекс: тип, що можна видалити, перевірки перед публікацією
   ├─ MANIFEST.json                         ← журнал аудиту: чому файл лежить тут
   ├─ chat-log.md                           ← повний стенограма
   ├─ session.json                          ← метадані (id сесії, виміри, кількості)
   ├─ 01-deliver/                           ← експорт лише для читання; єдина тека для git push
   ├─ 02-source/{original,patch,snapshot}/  ← єдине записуване джерело істини; original/ має .READONLY
   ├─ 03-tools/                             ← скрипти для повторного використання
   ├─ 04-output/{long-lived,one-off}/       ← результати, що не є кодом
   ├─ 05-reference/                         ← зовнішні матеріали та висновки
   └─ _trash/                               ← видаляється повністю, без наслідків
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← ключі ідемпотентності
      └─ .oplog.jsonl                       ← журнал операцій
```

**Що можна видалити**: відкрийте `README.md` сесії — там є таблиця «можна безпечно видалити»; у `MANIFEST.json` кожен файл має прапорець `deletable`. **Чи можна відкрити публічно**: у тому ж `README.md` є розділ «перевірки перед публікацією»; будь-яке виявлення секретів чи приватних ключів позначається як `blocked`.

## Перенесення наявних сесій

Перше архівування автоматично приводить до ладу стару структуру. Якщо історії багато, запускайте вручну — спершу план, потім дії:

```bash
# 1) Пробний запуск: рахує виміри й план маршрутизації, нічого не змінює
node bin/plan.mjs "<workspace root>"
# 2) Пробуємо на одній сесії
node bin/migrate.mjs "<workspace root>" --apply --only "【назва однієї сесії】"
# 3) Потім увесь пакет
node bin/migrate.mjs "<workspace root>" --apply
```

Перед `--apply` записує відносний шлях, розмір і sha256 кожного файлу до `_trash/.backup-<timestamp>.json` для побайтового відкату; усі дії потрапляють до `_trash/.oplog.jsonl`. Перенесення **торкається лише вмісту тек сесій і ніколи не зачіпає корінь робочої області**.

## Налаштування

Змініть `config` у `cordis.patch.yml` або скористайтеся панеллю налаштувань (записи панелі зберігаються в `~/.dsh/storages/session-archive/config.json` і мають приоритет).

Основні параметри:

| Ключ | За замовчуванням | Значення |
| --- | --- | --- |
| `enabled` | `true` | головний перемикач |
| `structured` | `true` | структура з каталогами; вимкнено = стара плоска схема |
| `writeManifest` | `true` | записувати `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | перевірка безпеки перед публікацією |
| `dedupeByHash` | `true` | дедублікація за sha256 |
| `strictRoot` | `false` | дозволяти в корені сесії лише 4 файли |
| `containerName` | `(порожньо)` | непорожнє значення — теки сесій вкладаються в нього |
| `dirs.*` | див. нижче | сім назв каталогів; порожньо = каталог не створюється |

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

Усі параметри: [`docs/config.md`](../config.md).

## HTTP API

| Метод | Шлях | Призначення |
| --- | --- | --- |
| GET | `/dsh-session-archive` | панель налаштувань (китайська / English / обидві) |
| GET | `/dsh-session-archive/api/health` | стан і поточна конфігурація |
| GET | `/dsh-session-archive/api/state` | список архівованих сесій |
| GET | `/dsh-session-archive/api/plan` | **пробний запуск**: виміри й план, без запису |
| POST | `/dsh-session-archive/api/archive` | архівувати зараз (необов'язково `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | зафіксувати виміри (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | читання / запис конфігурації |
| GET | `/dsh-session-archive/api/selftest` | самодіагностика (один раз пише в тимчасовий каталог) |

Класифікація хибна? Не правте код — зафіксуйте її через `POST /api/override`.

## Видалення

Чотири місця по порядку:

```bash
# 1) видалити копію джерел (пропустіть, якщо встановлювали з репозиторію; достатньо прибрати з node_modules)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) видалити встановлення в профілі
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) видалити індекс часу виконання (необов'язково; індекс історії відновиться під час наступного архівування)
rm -rf ~/.dsh/storages/session-archive
```

4. Перевірте `~/.dsh/profiles/<profile-name>/package.json`: у `dependencies` і `dsh.profile.bundles` не повинно залишитися `dsh-session-archive`.

**Не видаляйте** вже архівовані теки сесій (`01-deliver/` тощо) і **не видаляйте** `_trash/.backup-*.json` — це ваші дані для відкату.

## Нотатки про дизайн

Логіка класифікації, пріоритет маршрутизації, правила найменування, перевірка безпеки, журнал аудиту, захист від запису: [`docs/design.md`](../design.md).

## Ліцензія

MIT
