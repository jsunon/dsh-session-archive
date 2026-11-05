<div align="center">

[English](../README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · **العربية** · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

<div dir="rtl">

# dsh-session-archive

### أرشيف الجلسات — يفرز كل ملف تُنتجه جلسة DSH.

يفرز تلقائيًا الملفات التي تُنتجها جلسة DSH حسب **بُعد المخرجات**، لتعرف بنظرة واحدة ما يهم، وما يمكن حذفه، وما يمكن نشره بأمان.

جلسة واحدة = مجلد واحد. بداخله تُنشأ المجلدات عند الحاجة (المخرجات / الشيفرة / الأدوات / النواتج / المراجع / المهملات). **لا تُنشأ المجلدات الفارغة أبدًا**؛ ولا يُسمح في جذر المجلد بأكثر من 4 ملفات.

- **لا مزيد من `code-104-1-2.json`** — تحصل كتل الشيفرة على أسماء معبّرة (`cordis.patch.yml`، `buildName.js`)؛ نفس الاسم مع محتوى مختلف ← `.vN`
- **لا نسخ مكررة** — يُفحص sha256 قبل الكتابة؛ المحتوى المتطابق يُنقل إلى `_trash/duplicates/`
- **لا شيء مختلط** — المخرجات والشيفرة والسكربتات القابلة لإعادة الاستخدام والمراجع والمهملات تُحفظ كلٌّ في خانته
- **الحذف الخاطئ آمن** — يمكن حذف مجلد `_trash/` بالكامل دون أي أثر؛ و`01-deliver/` مجلد تصدير للقراءة فقط وهو الشيء الوحيد الذي يُستحسن `git push`

الهدف: إضافة مضيف DeepSeek Harness (DSH) تعمل داخل عملية مضيف DSH Node.

## التثبيت

### من ملف Release المضغوط (موصى به)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### مباشرة من المستودع (يشمل الاختبارات والتوثيق)

```bash
pnpm add github:jsunon/dsh-session-archive
```

أعد تشغيل مضيف DSH ثم تحقق:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

إذا كان `dirs` يحتوي على سبعة مفاتيح (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`)، فالشيفرة الجديدة فعّالة.

### التطوير المحلي

استنسخ المستودع، ثم وجّه ملف تعريف إليه بالأمر `pnpm add <المسار المحلي>` (أو وصلة من `~/.dsh/local-plugins/`)، وأعد تشغيل المضيف، ثم نفّذ مجموعات الاختبار الست بـ `node tests/*.test.mjs`.

## شكل البنية

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← مجلد واحد لكل جلسة
   ├─ README.md                             ← فهرس: النوع، ما يمكن حذفه، فحوصات ما قبل النشر
   ├─ MANIFEST.json                         ← مسار التدقيق: لماذا هذا الملف هنا
   ├─ chat-log.md                           ← النص الكامل للمحادثة
   ├─ session.json                          ← البيانات الوصفية (معرّف الجلسة، الأبعاد، الأعداد)
   ├─ 01-deliver/                           ← تصدير للقراءة فقط؛ المجلد الوحيد المناسب لـ git push
   ├─ 02-source/{original,patch,snapshot}/  ← المصدر الوحيد القابل للكتابة؛ original/ بعلامة .READONLY
   ├─ 03-tools/                             ← سكربتات قابلة لإعادة الاستخدام
   ├─ 04-output/{long-lived,one-off}/       ← نواتج ليست شيفرة
   ├─ 05-reference/                         ← مواد خارجية واستنتاجات
   └─ _trash/                               ← حذفه بالكامل دون أثر
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← مفاتيح الحياد التكراري
      └─ .oplog.jsonl                       ← سجل العمليات
```

**ما يمكن حذفه**: افتح `README.md` الخاص بالجلسة — فيه جدول «حذف آمن»؛ وفي `MANIFEST.json` يحمل كل ملف علامة `deletable`. **هل يمكن نشره**: وفيه أيضًا قسم «فحوصات ما قبل النشر»؛ وأي إصابة بأسرار أو مفاتيح خاصة تُوسم بـ `blocked`.

## ترحيل الجلسات الموجودة

الأرشفة الأولى ترتّب البنية القديمة تلقائيًا. مع وجود تاريخ كبير، نفّذها يدويًا — خطّط أولًا ثم ابدأ:

```bash
# 1) تشغيل تجريبي: يحسب الأبعاد وخطة التوجيه، ولا يغيّر شيئًا
node bin/plan.mjs "<workspace root>"
# 2) اختبار جلسة واحدة
node bin/migrate.mjs "<workspace root>" --apply --only "【اسم جلسة واحدة】"
# 3) ثم المجموعة كاملة
node bin/migrate.mjs "<workspace root>" --apply
```

قبل `--apply` يسجّل المسار النسبي وحجم وsha256 لكل ملف في `_trash/.backup-<timestamp>.json` ليتيح تراجعًا مطابقًا بالبايت؛ وتُسجّل كل العمليات في `_trash/.oplog.jsonl`. الترحيل **يعمل داخل مجلدات الجلسات فقط، ولا يمس جذر مساحة العمل أبدًا**.

## الإعداد

عدّل `config` في `cordis.patch.yml`، أو استخدم لوحة الإعدادات (ما تكتبه اللوحة يُحفظ في `~/.dsh/storages/session-archive/config.json` وله الأولوية).

أهم الخيارات:

| المفتاح | الافتراضي | المعنى |
| --- | --- | --- |
| `enabled` | `true` | المفتاح الرئيسي |
| `structured` | `true` | بنية بمجلدات؛ إيقافه يعيد الشكل المسطح القديم |
| `writeManifest` | `true` | كتابة `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | فحص الأمان قبل النشر |
| `dedupeByHash` | `true` | إزالة التكرار عبر sha256 |
| `strictRoot` | `false` | السماح بالملفات الأربعة الجذرية فقط في جذر الجلسة |
| `containerName` | `(فارغ)` | إن لم يكن فارغًا تُدمج مجلدات الجلسات تحته |
| `dirs.*` | انظر أدناه | سبعة أسماء مجلدات؛ فراغ = لا يُنشأ هذا التصنيف |

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

كل الخيارات: [`docs/config.md`](../config.md).

## واجهة HTTP

| الطريقة | المسار | الغرض |
| --- | --- | --- |
| GET | `/dsh-session-archive` | لوحة الإعدادات (صيني / English / الاثنان) |
| GET | `/dsh-session-archive/api/health` | الحالة + الإعداد الحالي |
| GET | `/dsh-session-archive/api/state` | قائمة الجلسات المؤرشفة |
| GET | `/dsh-session-archive/api/plan` | **تشغيل تجريبي**: الأبعاد والخطة، دون كتابة |
| POST | `/dsh-session-archive/api/archive` | أرشف الآن (اختياري `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | تثبيت الأبعاد (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | قراءة/كتابة الإعداد |
| GET | `/dsh-session-archive/api/selftest` | فحص ذاتي (يكتب مرة واحدة في مجلد مؤقت) |

التصنيف خاطئ؟ لا تعدّل الشيفرة — ثبّته بـ `POST /api/override`.

## إلغاء التثبيت

أربعة مواضع بالترتيب:

```bash
# 1) حذف نسخة الشيفرة (تخطَّها إن كنت ثبّت من المستودع؛ يكفي إزالتها من node_modules)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) إزالة التثبيت من ملف التعريف
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) حذف فهرس التشغيل (اختياري؛ يُعاد بناء فهرس التاريخ عند الأرشفة التالية)
rm -rf ~/.dsh/storages/session-archive
```

4. تحقّق من `~/.dsh/profiles/<profile-name>/package.json`: لا يبقى `dsh-session-archive` في `dependencies` ولا في `dsh.profile.bundles`.

**لا تحذف** مجلدات الجلسات المؤرشفة (`01-deliver/` وغيرها)، ولا تحذف `_trash/.backup-*.json` — فهي مستندات التراجع لديك.

## ملاحظات التصميم

منطق التصنيف، أولوية التوجيه، قواعد التسمية، فحص الأمان، مسار التدقيق، حماية القراءة فقط: [`docs/design.md`](../design.md).

## الترخيص

MIT

</div>
