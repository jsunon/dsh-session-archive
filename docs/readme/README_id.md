<div align="center">

[English](../README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · **Bahasa Indonesia** · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

# dsh-session-archive

### Arsip sesi — merapikan setiap berkas yang dihasilkan sesi DSH.

Secara otomatis mengelompokkan berkas yang dihasilkan sesi DSH berdasarkan **dimensi keluaran**, sehingga Anda bisa langsung melihat mana yang penting, mana yang boleh dihapus, dan mana yang aman untuk dipublikasikan.

Satu sesi = satu folder. Di dalamnya, direktori dibuat sesuai kebutuhan (hasil / sumber / alat / keluaran / referensi / sampah). **Direktori kosong tidak pernah dibuat**; di akar folder sesi hanya boleh ada 4 berkas.

- **Tidak ada lagi `code-104-1-2.json`** — blok kode mendapat nama yang bermakna (`cordis.patch.yml`, `buildName.js`); nama sama dengan isi berbeda → `.vN`
- **Tanpa salinan duplikat** — sha256 diperiksa sebelum menulis; isi yang identik masuk ke `_trash/duplicates/`
- **Tidak ada yang tercampur** — hasil, sumber, skrip yang dapat dipakai ulang, materi referensi, dan sampah sekali pakai masing-masing berada di kelompoknya
- **Salah menghapus tetap aman** — seluruh folder `_trash/` bisa dihapus tanpa dampak apa pun; `01-deliver/` adalah ekspor hanya-baca dan satu-satunya yang sebaiknya Anda `git push`

Tujuan: plugin host DeepSeek Harness (DSH) yang berjalan di dalam proses host DSH Node.

## Pemasangan

### Dari tarball Release (disarankan)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### Langsung dari repositori (termasuk tes dan dokumentasi)

```bash
pnpm add github:jsunon/dsh-session-archive
```

Mulai ulang host DSH, lalu verifikasi:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

Jika `dirs` memiliki tujuh kunci (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`), kode baru sudah aktif.

### Pengembangan lokal

Klon repositori, arahkan sebuah profil ke sana dengan `pnpm add <jalur lokal>` (atau junction dari `~/.dsh/local-plugins/`), mulai ulang host, lalu jalankan enam rangkaian tes dengan `node tests/*.test.mjs`.

## Seperti apa struktur foldernya

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← satu folder per sesi
   ├─ README.md                             ← indeks: tipe, apa yang boleh dihapus, pemeriksaan sebelum publikasi
   ├─ MANIFEST.json                         ← jejak audit: mengapa berkas ini ada di sini
   ├─ chat-log.md                           ← transkrip lengkap
   ├─ session.json                          ← metadata (id sesi, dimensi, jumlah)
   ├─ 01-deliver/                           ← ekspor hanya-baca; satu-satunya folder untuk git push
   ├─ 02-source/{original,patch,snapshot}/  ← satu-satunya sumber kebenaran yang bisa ditulis; original/ bersifat .READONLY
   ├─ 03-tools/                             ← skrip yang dapat dipakai ulang
   ├─ 04-output/{long-lived,one-off}/       ← keluaran non-kode
   ├─ 05-reference/                         ← materi eksternal dan kesimpulan
   └─ _trash/                               ← hapus seluruhnya, tanpa dampak
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← kunci idempotensi
      └─ .oplog.jsonl                       ← log operasi
```

**Apa yang boleh dihapus**: buka `README.md` sesi — di sana ada tabel "aman untuk dihapus"; di `MANIFEST.json` setiap berkas membawa tanda `deletable`. **Bisa dipublikasikan atau tidak**: `README.md` yang sama punya bagian "pemeriksaan sebelum publikasi"; setiap temuan rahasia atau kunci privat ditandai `blocked`.

## Migrasi sesi yang sudah ada

Pengarsipan pertama otomatis merapikan tata letak lama. Jika riwayatnya banyak, jalankan manual — rencanakan dulu, baru bertindak:

```bash
# 1) Uji coba: menghitung dimensi dan rencana perutean, tidak mengubah apa pun
node bin/plan.mjs "<workspace root>"
# 2) Coba satu sesi
node bin/migrate.mjs "<workspace root>" --apply --only "【nama satu sesi】"
# 3) Lalu seluruh batch
node bin/migrate.mjs "<workspace root>" --apply
```

Sebelum `--apply`, ia mencatat jalur relatif, ukuran, dan sha256 setiap berkas ke `_trash/.backup-<timestamp>.json` agar bisa dikembalikan persis byte demi byte; semua tindakan masuk ke `_trash/.oplog.jsonl`. Migrasi **hanya menyentuh bagian dalam folder sesi dan tidak pernah menyentuh akar ruang kerja**.

## Konfigurasi

Sunting `config` di `cordis.patch.yml`, atau gunakan panel pengaturan (nilai yang ditulis panel disimpan di `~/.dsh/storages/session-archive/config.json` dan lebih diprioritaskan).

Opsi utama:

| Kunci | Bawaan | Arti |
| --- | --- | --- |
| `enabled` | `true` | saklar utama |
| `structured` | `true` | tata letak berkelompok; jika dimatikan kembali ke tata letak datar lama |
| `writeManifest` | `true` | menulis `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | pemindaian keamanan sebelum publikasi |
| `dedupeByHash` | `true` | deduplikasi sha256 |
| `strictRoot` | `false` | hanya mengizinkan 4 berkas akar di akar sesi |
| `containerName` | `(kosong)` | tidak kosong = folder sesi bersarang di bawahnya |
| `dirs.*` | lihat di bawah | tujuh nama direktori; kosong = kelompok tidak dibuat |

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

Semua opsi: [`docs/config.md`](../config.md).

## HTTP API

| Metode | Jalur | Tujuan |
| --- | --- | --- |
| GET | `/dsh-session-archive` | panel pengaturan (Mandarin / English / keduanya) |
| GET | `/dsh-session-archive/api/health` | status + konfigurasi saat ini |
| GET | `/dsh-session-archive/api/state` | daftar sesi yang sudah diarsipkan |
| GET | `/dsh-session-archive/api/plan` | **uji coba**: dimensi dan rencana, tanpa penulisan |
| POST | `/dsh-session-archive/api/archive` | arsipkan sekarang (opsional `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | kunci dimensi (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | baca/tulis konfigurasi |
| GET | `/dsh-session-archive/api/selftest` | uji mandiri (menulis sekali ke direktori sementara) |

Klasifikasi salah? Jangan ubah kode — kunci dengan `POST /api/override`.

## Penghapusan

Empat tempat, berurutan:

```bash
# 1) hapus salinan sumber (lewati jika memasang dari repositori; cukup keluarkan dari node_modules)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) hapus pemasangan di profil
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) hapus indeks runtime (opsional; indeks riwayat dibangun ulang pada pengarsipan berikutnya)
rm -rf ~/.dsh/storages/session-archive
```

4. Periksa `~/.dsh/profiles/<profile-name>/package.json`: tidak boleh ada `dsh-session-archive` tersisa di `dependencies` maupun `dsh.profile.bundles`.

**Jangan hapus** folder sesi yang sudah diarsipkan (`01-deliver/` dan sebagainya), dan **jangan hapus** `_trash/.backup-*.json` — itu bukti pemulihan Anda.

## Catatan desain

Logika klasifikasi, prioritas perutean, aturan penamaan, pemindaian keamanan, jejak audit, perlindungan hanya-baca: [`docs/design.md`](../design.md).

## Lisensi

MIT
