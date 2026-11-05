<div align="center">

[English](../README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · **فارسی** · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

<div dir="rtl">

# dsh-session-archive

### بایگانی نشست — هر فایلی که یک نشست DSH تولید می‌کند را دسته‌بندی می‌کند.

فایل‌های تولیدشده توسط یک نشست DSH را به‌طور خودکار بر اساس **بُعد خروجی** دسته‌بندی می‌کند تا با یک نگاه بدانید چه چیزی مهم است، چه چیزی را می‌توان حذف کرد و چه چیزی را می‌توان بی‌خطر منتشر کرد.

یک نشست = یک پوشه. درون آن، پوشه‌ها در صورت نیاز ساخته می‌شوند (خروجی‌ها / کد / ابزارها / تولیدات / مراجع / آشغال). **پوشه‌های خالی هرگز ساخته نمی‌شوند**؛ در ریشهٔ پوشهٔ نشست حداکثر ۴ فایل می‌تواند باشد.

- **دیگر خبری از `code-104-1-2.json` نیست** — بلوک‌های کد نام معنادار می‌گیرند (`cordis.patch.yml`، `buildName.js`)؛ نام یکسان با محتوای متفاوت → `.vN`
- **بدون نسخهٔ تکراری** — پیش از نوشتن، sha256 بررسی می‌شود؛ محتوای یکسان به `_trash/duplicates/` می‌رود
- **هیچ چیز قاطی نمی‌شود** — خروجی‌ها، کد، اسکریپت‌های قابل استفادهٔ مجدد، مواد مرجع و آشغال یک‌بارمصرف هر کدام در دستهٔ خود می‌مانند
- **حذف اشتباه بی‌خطر است** — کل پوشهٔ `_trash/` را می‌توان بدون هیچ اثری حذف کرد؛ `01-deliver/` یک خروجی فقط‌خواندنی است و تنها چیزی که باید `git push` کنید

هدف: یک افزونهٔ میزبان DeepSeek Harness (DSH) که درون فرایند میزبان DSH Node اجرا می‌شود.

## نصب

### از بستهٔ فشردهٔ Release (توصیه‌شده)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### مستقیماً از مخزن (شامل آزمون‌ها و مستندات)

```bash
pnpm add github:jsunon/dsh-session-archive
```

میزبان DSH را دوباره راه‌اندازی کنید، سپس بررسی کنید:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

اگر `dirs` هفت کلید داشته باشد (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`)، کد جدید فعال است.

### توسعهٔ محلی

مخزن را کلون کنید، سپس یک پروفایل را با `pnpm add <مسیر محلی>` (یا یک اتصال از `~/.dsh/local-plugins/`) به آن اشاره دهید، میزبان را دوباره راه‌اندازی کنید و شش مجموعه آزمون را با `node tests/*.test.mjs` اجرا کنید.

## ساختار چگونه است

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← یک پوشه برای هر نشست
   ├─ README.md                             ← فهرست: نوع، چه چیزی حذف‌شدنی است، بررسی‌های پیش از انتشار
   ├─ MANIFEST.json                         ← رد حسابرسی: چرا این فایل اینجاست
   ├─ chat-log.md                           ← رونوشت کامل
   ├─ session.json                          ← فراداده (شناسهٔ نشست، ابعاد، شمارش‌ها)
   ├─ 01-deliver/                           ← خروجی فقط‌خواندنی؛ تنها پوشه برای git push
   ├─ 02-source/{original,patch,snapshot}/  ← تنها منبع حقیقت قابل‌نوشتن؛ original/ با .READONLY
   ├─ 03-tools/                             ← اسکریپت‌های قابل استفادهٔ مجدد
   ├─ 04-output/{long-lived,one-off}/       ← تولیدات غیرکدی
   ├─ 05-reference/                         ← مواد بیرونی و نتیجه‌گیری‌ها
   └─ _trash/                               ← کامل حذف کنید، بدون اثر
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← کلیدهای خودتوانی
      └─ .oplog.jsonl                       ← گزارش عملیات
```

**چه چیزی حذف‌شدنی است**: `README.md` نشست را باز کنید — جدول «حذف بی‌خطر» را دارد؛ در `MANIFEST.json` هر فایل نشانهٔ `deletable` دارد. **قابل انتشار است؟**: همان `README.md` بخش «بررسی‌های پیش از انتشار» را دارد؛ هر برخورد با رمز یا کلید خصوصی با `blocked` علامت می‌خورد.

## مهاجرت نشست‌های موجود

نخستین بایگانی‌سازی، چیدمان قدیمی را خودکار مرتب می‌کند. با تاریخچهٔ زیاد، آن را دستی اجرا کنید — اول برنامه، بعد عمل:

```bash
# 1) اجرای آزمایشی: ابعاد و برنامهٔ مسیریابی را محاسبه می‌کند و چیزی را تغییر نمی‌دهد
node bin/plan.mjs "<workspace root>"
# 2) با یک نشست آزمایش کنید
node bin/migrate.mjs "<workspace root>" --apply --only "【نام یک نشست】"
# 3) سپس کل دسته
node bin/migrate.mjs "<workspace root>" --apply
```

پیش از `--apply` مسیر نسبی، اندازه و sha256 هر فایل را در `_trash/.backup-<timestamp>.json` ثبت می‌کند تا بازگشت بایت‌به‌بایت ممکن باشد؛ همهٔ اقدام‌ها در `_trash/.oplog.jsonl` نوشته می‌شوند. مهاجرت **فقط درون پوشه‌های نشست عمل می‌کند و هرگز به ریشهٔ فضای کاری دست نمی‌زند**.

## پیکربندی

`config` را در `cordis.patch.yml` ویرایش کنید، یا از پنل تنظیمات استفاده کنید (نوشته‌های پنل در `~/.dsh/storages/session-archive/config.json` ذخیره می‌شود که اولویت دارد).

گزینه‌های کلیدی:

| کلید | پیش‌فرض | معنا |
| --- | --- | --- |
| `enabled` | `true` | کلید اصلی |
| `structured` | `true` | چیدمان دسته‌بندی‌شده؛ خاموش = بازگشت به چیدمان تخت قدیمی |
| `writeManifest` | `true` | نوشتن `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | پیمایش امنیتی پیش از انتشار |
| `dedupeByHash` | `true` | حذف تکراری با sha256 |
| `strictRoot` | `false` | تنها ۴ فایل ریشه در ریشهٔ نشست مجاز باشد |
| `containerName` | `(خالی)` | غیرخالی = پوشه‌های نشست زیر آن تودرتو می‌شوند |
| `dirs.*` | زیر را ببینید | هفت نام پوشه؛ خالی = آن دسته ساخته نمی‌شود |

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

همهٔ گزینه‌ها: [`docs/config.md`](../config.md).

## رابط HTTP

| متد | مسیر | کاربرد |
| --- | --- | --- |
| GET | `/dsh-session-archive` | پنل تنظیمات (چینی / English / هر دو) |
| GET | `/dsh-session-archive/api/health` | سلامت + پیکربندی فعلی |
| GET | `/dsh-session-archive/api/state` | فهرست نشست‌های بایگانی‌شده |
| GET | `/dsh-session-archive/api/plan` | **اجرای آزمایشی**: ابعاد و برنامه، بدون نوشتن |
| POST | `/dsh-session-archive/api/archive` | همین حالا بایگانی کن (اختیاری `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | قفل کردن ابعاد (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | خواندن/نوشتن پیکربندی |
| GET | `/dsh-session-archive/api/selftest` | خودآزمایی (یک بار در پوشهٔ موقت می‌نویسد) |

دسته‌بندی نادرست است؟ کد را تغییر ندهید — با `POST /api/override` قفلش کنید.

## حذف نصب

چهار جا، به ترتیب:

```bash
# 1) حذف نسخهٔ کد (اگر از مخزن نصب کرده‌اید رد کنید؛ فقط از node_modules بردارید)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) حذف نصب در پروفایل
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) حذف نمایهٔ زمان اجرا (اختیاری؛ نمایهٔ تاریخچه در بایگانی بعدی بازسازی می‌شود)
rm -rf ~/.dsh/storages/session-archive
```

4. `~/.dsh/profiles/<profile-name>/package.json` را بررسی کنید: نه در `dependencies` و نه در `dsh.profile.bundles` نباید `dsh-session-archive` باقی مانده باشد.

پوشه‌های نشست بایگانی‌شده (`01-deliver/` و غیره) را **حذف نکنید**، و `_trash/.backup-*.json` را هم **حذف نکنید** — آن‌ها مدرک بازگردانی شما هستند.

## یادداشت‌های طراحی

منطق دسته‌بندی، اولویت مسیریابی، قواعد نام‌گذاری، پیمایش امنیتی، رد حسابرسی، حفاظت فقط‌خواندنی: [`docs/design.md`](../design.md).

## مجوز

MIT

</div>
