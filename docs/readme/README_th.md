<div align="center">

[English](../README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · **ไทย** · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

# dsh-session-archive

### คลังเซสชัน — จัดหมวดหมู่ทุกไฟล์ที่เซสชัน DSH สร้างขึ้น

จัดหมวดหมู่ไฟล์ที่เซสชัน DSH สร้างขึ้นโดยอัตโนมัติตาม**มิติของผลลัพธ์** เพื่อให้คุณเห็นได้ในพริบตาว่าอะไรสำคัญ อะไรลบได้ และอะไรปลอดภัยพอที่จะเปิดเผยเป็นโอเพนซอร์ส

หนึ่งเซสชัน = หนึ่งโฟลเดอร์ ภายในโฟลเดอร์จะสร้างไดเรกทอรีตามความจำเป็น (ผลงาน / ซอร์สโค้ด / เครื่องมือ / เอาต์พุต / เอกสารอ้างอิง / ขยะ) **ไดเรกทอรีว่างจะไม่ถูกสร้างเด็ดขาด** และที่รากของโฟลเดอร์เซสชันวางไฟล์ได้ไม่เกิน 4 ไฟล์

- **ไม่ต้องมี `code-104-1-2.json` อีกแล้ว** — บล็อกโค้ดได้ชื่อที่มีความหมาย (`cordis.patch.yml`, `buildName.js`); ชื่อเดียวกันแต่เนื้อหาต่างกัน → `.vN`
- **ไม่มีการคัดลอกซ้ำ** — ตรวจสอบ sha256 ก่อนเขียน เนื้อหาเหมือนกันจะถูกย้ายไปที่ `_trash/duplicates/`
- **ไม่ปนกัน** — ผลงาน ซอร์สโค้ด สคริปต์ที่ใช้ซ้ำได้ เอกสารอ้างอิง และขยะใช้ครั้งเดียว ต่างอยู่ในหมวดของตัวเอง
- **ลบผิดก็ปลอดภัย** — ลบโฟลเดอร์ `_trash/` ทั้งโฟลเดอร์ได้โดยไม่มีผลกระทบ; `01-deliver/` เป็นไดเรกทอรีส่งออกแบบอ่านอย่างเดียว และเป็นสิ่งเดียวที่คุณควร `git push`

จุดประสงค์: เป็นปลั๊กอินโฮสต์ของ DeepSeek Harness (DSH) ที่ทำงานภายในโปรเซสโฮสต์ DSH Node

## การติดตั้ง

### จาก tarball ของ Release (แนะนำ)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### จากรีโพซิทอรีโดยตรง (มีทั้งเทสต์และเอกสาร)

```bash
pnpm add github:jsunon/dsh-session-archive
```

รีสตาร์ตโฮสต์ DSH แล้วตรวจสอบ:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

ถ้า `dirs` มีเจ็ดคีย์ (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`) แสดงว่าโค้ดใหม่ทำงานแล้ว

### การพัฒนาภายในเครื่อง

โคลนรีโพซิทอรี แล้วชี้ profile ไปที่มันด้วย `pnpm add <พาธภายในเครื่อง>` (หรือ junction จาก `~/.dsh/local-plugins/`) รีสตาร์ตโฮสต์ แล้วรันชุดเทสต์ทั้งหกด้วย `node tests/*.test.mjs`

## โครงสร้างไดเรกทอรี

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← หนึ่งโฟลเดอร์ต่อหนึ่งเซสชัน
   ├─ README.md                             ← ดัชนี: ประเภท อะไรลบได้ ผลตรวจก่อนเปิดเผย
   ├─ MANIFEST.json                         ← ร่องรอยการตรวจสอบ: ทำไมไฟล์นี้อยู่ที่นี่
   ├─ chat-log.md                           ← บันทึกบทสนทนาฉบับเต็ม
   ├─ session.json                          ← เมตาดาตา (id เซสชัน มิติ จำนวน)
   ├─ 01-deliver/                           ← ส่งออกแบบอ่านอย่างเดียว; โฟลเดอร์เดียวที่ควร git push
   ├─ 02-source/{original,patch,snapshot}/  ← แหล่งข้อมูลจริงเดียวที่เขียนได้; original/ เป็น .READONLY
   ├─ 03-tools/                             ← สคริปต์ที่ใช้ซ้ำได้
   ├─ 04-output/{long-lived,one-off}/       ← เอาต์พุตที่ไม่ใช่โค้ด
   ├─ 05-reference/                         ← เอกสารภายนอกและข้อสรุป
   └─ _trash/                               ← ลบทั้งโฟลเดอร์ได้ ไม่มีผลกระทบ
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← คีย์ idempotency
      └─ .oplog.jsonl                       ← บันทึกการดำเนินการ
```

**อะไรลบได้**：เปิด `README.md` ของเซสชัน จะมีตาราง "ลบได้อย่างปลอดภัย"; ใน `MANIFEST.json` ทุกไฟล์มีแฟล็ก `deletable` **เปิดเผยได้ไหม**：`README.md` เดียวกันมีหัวข้อ "การตรวจสอบก่อนเปิดเผย"; ถ้าตรวจพบความลับหรือคีย์ส่วนตัวจะถูกทำเครื่องหมายเป็น `blocked`

## การย้ายเซสชันที่มีอยู่

การเก็บเข้าคลังครั้งแรกจะจัดโครงสร้างเดิมให้อัตโนมัติ ถ้าประวัติเยอะ แนะนำให้รันเอง — วางแผนก่อน ลงมือทีหลัง:

```bash
# 1) ทดลอง: คำนวณมิติและแผนการจัดเส้นทาง ไม่แตะไฟล์ใด
node bin/plan.mjs "<workspace root>"
# 2) ลองกับหนึ่งเซสชัน
node bin/migrate.mjs "<workspace root>" --apply --only "【ชื่อเซสชันหนึ่งอัน】"
# 3) แล้วจึงรันทั้งหมด
node bin/migrate.mjs "<workspace root>" --apply
```

ก่อน `--apply` มันจะบันทึกพาธสัมพัทธ์ ขนาด และ sha256 ของทุกไฟล์ลงใน `_trash/.backup-<timestamp>.json` เพื่อให้ย้อนกลับได้แม่นถึงระดับไบต์; ทุกการกระทำจะถูกบันทึกไว้ที่ `_trash/.oplog.jsonl` การย้าย**แตะเฉพาะภายในโฟลเดอร์เซสชันเท่านั้น ไม่แตะรากของเวิร์กสเปซเด็ดขาด**

## การตั้งค่า

แก้ `config` ใน `cordis.patch.yml` หรือใช้แผงตั้งค่า (ค่าที่บันทึกจากแผงจะเก็บถาวรที่ `~/.dsh/storages/session-archive/config.json` และมีลำดับความสำคัญสูงกว่า)

ตัวเลือกหลัก:

| คีย์ | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `enabled` | `true` | สวิตช์หลัก |
| `structured` | `true` | โครงสร้างแบบมีไดเรกทอรี; ปิดจะกลับไปใช้แบบแบนเดิม |
| `writeManifest` | `true` | เขียน `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | สแกนความปลอดภัยก่อนเปิดเผย |
| `dedupeByHash` | `true` | กำจัดข้อมูลซ้ำด้วย sha256 |
| `strictRoot` | `false` | อนุญาตเฉพาะ 4 ไฟล์รากที่รากของเซสชัน |
| `containerName` | `(ว่าง)` | ถ้าไม่ว่าง โฟลเดอร์เซสชันจะซ้อนอยู่ภายใต้ |
| `dirs.*` | ดูด้านล่าง | ชื่อไดเรกทอรีเจ็ดตัว; ว่าง = ไม่สร้างหมวดนั้น |

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

ตัวเลือกทั้งหมด: [`docs/config.md`](../config.md)

## HTTP API

| เมธอด | พาธ | วัตถุประสงค์ |
| --- | --- | --- |
| GET | `/dsh-session-archive` | แผงตั้งค่า (จีน / English / ทั้งสอง) |
| GET | `/dsh-session-archive/api/health` | สถานะ + การตั้งค่าปัจจุบัน |
| GET | `/dsh-session-archive/api/state` | รายการเซสชันที่เก็บเข้าคลังแล้ว |
| GET | `/dsh-session-archive/api/plan` | **ทดลอง**: มิติและแผน ไม่เขียนใด ๆ |
| POST | `/dsh-session-archive/api/archive` | เก็บเข้าคลังทันที (ไม่บังคับ `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | ล็อกมิติ (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | อ่าน/เขียนการตั้งค่า |
| GET | `/dsh-session-archive/api/selftest` | ทดสอบตัวเอง (เขียนหนึ่งครั้งลงไดเรกทอรีชั่วคราว) |

จัดหมวดหมู่ผิด? อย่าแก้โค้ด — ล็อกด้วย `POST /api/override`

## การถอนการติดตั้ง

สี่จุด ตามลำดับ:

```bash
# 1) ลบสำเนาซอร์สโค้ด (ข้ามได้ถ้าติดตั้งจากรีโพซิทอรี; แค่ลบออกจาก node_modules)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) ลบการติดตั้งใน profile
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) ลบดัชนีรันไทม์ (ไม่บังคับ; ดัชนีประวัติจะถูกสร้างใหม่ตอนเก็บเข้าคลังครั้งถัดไป)
rm -rf ~/.dsh/storages/session-archive
```

4. ตรวจ `~/.dsh/profiles/<profile-name>/package.json`: ต้องไม่มี `dsh-session-archive` เหลืออยู่ใน `dependencies` และ `dsh.profile.bundles`

**อย่าลบ**โฟลเดอร์เซสชันที่เก็บเข้าคลังแล้ว (`01-deliver/` ฯลฯ) และ**อย่าลบ** `_trash/.backup-*.json` — นั่นคือหลักฐานสำหรับการย้อนกลับของคุณ

## บันทึกการออกแบบ

ตรรกะการจัดหมวดหมู่ ลำดับความสำคัญของการจัดเส้นทาง กฎการตั้งชื่อ การสแกนความปลอดภัย ร่องรอยการตรวจสอบ การป้องกันแบบอ่านอย่างเดียว: [`docs/design.md`](../design.md)

## สัญญาอนุญาต

MIT
