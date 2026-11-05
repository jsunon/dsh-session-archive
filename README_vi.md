<div align="center">

[English](./README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · **Tiếng Việt** · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

# dsh-session-archive

### Lưu trữ phiên làm việc — phân loại mọi tệp mà một phiên DSH tạo ra.

Tự động phân loại các tệp do phiên DSH tạo ra theo **chiều của kết quả đầu ra**, để bạn nhìn một lần là biết cái nào quan trọng, cái nào xoá được và cái nào có thể công khai an toàn.

Một phiên = một thư mục. Bên trong, các thư mục con được tạo khi cần (kết quả / mã nguồn / công cụ / đầu ra / tham chiếu / rác). **Thư mục rỗng không bao giờ được tạo**; thư mục gốc của phiên chỉ được chứa tối đa 4 tệp.

- **Không còn `code-104-1-2.json`** — các khối mã có tên có nghĩa (`cordis.patch.yml`, `buildName.js`); trùng tên mà khác nội dung → `.vN`
- **Không tạo bản sao trùng lặp** — kiểm tra sha256 trước khi ghi; nội dung giống hệt được đưa vào `_trash/duplicates/`
- **Không trộn lẫn** — kết quả, mã nguồn, script tái sử dụng, tài liệu tham chiếu và rác dùng một lần nằm riêng từng thư mục
- **Xoá nhầm vẫn an toàn** — có thể xoá toàn bộ thư mục `_trash/` mà không ảnh hưởng gì; `01-deliver/` là thư mục xuất chỉ đọc và là thứ duy nhất bạn nên `git push`

Mục đích: một plugin máy chủ DeepSeek Harness (DSH) chạy trong tiến trình máy chủ DSH Node.

## Cài đặt

### Từ tarball của Release (khuyến nghị)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### Trực tiếp từ kho lưu trữ (bao gồm kiểm thử và tài liệu)

```bash
pnpm add github:jsunon/dsh-session-archive
```

Khởi động lại máy chủ DSH rồi kiểm tra:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

Nếu `dirs` có bảy khoá (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`), mã mới đã có hiệu lực.

### Phát triển cục bộ

Clone kho lưu trữ, trỏ một profile vào đó bằng `pnpm add <đường dẫn cục bộ>` (hoặc một liên kết từ `~/.dsh/local-plugins/`), khởi động lại máy chủ và chạy sáu bộ kiểm thử bằng `node tests/*.test.mjs`.

## Cấu trúc thư mục trông như thế nào

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← mỗi phiên một thư mục
   ├─ README.md                             ← mục lục: loại, những gì xoá được, kiểm tra trước khi công khai
   ├─ MANIFEST.json                         ← dấu vết kiểm toán: vì sao tệp này ở đây
   ├─ chat-log.md                           ← bản ghi đầy đủ
   ├─ session.json                          ← siêu dữ liệu (id phiên, chiều, số lượng)
   ├─ 01-deliver/                           ← xuất chỉ đọc; thư mục duy nhất nên git push
   ├─ 02-source/{original,patch,snapshot}/  ← nguồn sự thật duy nhất có thể ghi; original/ là .READONLY
   ├─ 03-tools/                             ← script tái sử dụng
   ├─ 04-output/{long-lived,one-off}/       ← đầu ra không phải mã
   ├─ 05-reference/                         ← tài liệu bên ngoài và kết luận
   └─ _trash/                               ← xoá toàn bộ, không ảnh hưởng
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← khoá bất biến (idempotency)
      └─ .oplog.jsonl                       ← nhật ký thao tác
```

**Những gì xoá được**: mở `README.md` của phiên — có bảng "xoá an toàn"; trong `MANIFEST.json` mỗi tệp đều mang cờ `deletable`. **Có thể công khai không**: cùng tệp `README.md` có mục "kiểm tra trước khi công khai"; nếu phát hiện khoá bí mật hoặc khoá riêng tư thì bị đánh dấu `blocked`.

## Di trú các phiên đã có

Lần lưu trữ đầu tiên tự động dọn lại cấu trúc cũ. Nếu lịch sử nhiều, hãy chạy thủ công — lên kế hoạch trước, thao tác sau:

```bash
# 1) Chạy thử: chỉ tính chiều và kế hoạch định tuyến, không đụng vào gì
node bin/plan.mjs "<workspace root>"
# 2) Thử với một phiên
node bin/migrate.mjs "<workspace root>" --apply --only "【tên một phiên】"
# 3) Sau đó chạy toàn bộ
node bin/migrate.mjs "<workspace root>" --apply
```

Trước `--apply` nó ghi đường dẫn tương đối, kích thước và sha256 của từng tệp vào `_trash/.backup-<timestamp>.json` để có thể khôi phục chính xác từng byte; mọi thao tác đều vào `_trash/.oplog.jsonl`. Việc di trú **chỉ tác động bên trong các thư mục phiên, không bao giờ chạm vào thư mục gốc của workspace**.

## Cấu hình

Sửa `config` trong `cordis.patch.yml`, hoặc dùng bảng cài đặt (giá trị bảng cài đặt ghi vào `~/.dsh/storages/session-archive/config.json` và được ưu tiên).

Các tuỳ chọn chính:

| Khoá | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `enabled` | `true` | công tắc tổng |
| `structured` | `true` | cấu trúc có thư mục phân loại; tắt thì quay về kiểu phẳng cũ |
| `writeManifest` | `true` | ghi `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | quét an toàn trước khi công khai |
| `dedupeByHash` | `true` | khử trùng lặp theo sha256 |
| `strictRoot` | `false` | chỉ cho phép 4 tệp gốc ở thư mục gốc phiên |
| `containerName` | `(rỗng)` | khác rỗng = thư mục phiên lồng dưới nó |
| `dirs.*` | xem bên dưới | bảy tên thư mục; rỗng = không tạo thư mục đó |

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

Toàn bộ tuỳ chọn: [`docs/config.md`](docs/config.md).

## HTTP API

| Phương thức | Đường dẫn | Mục đích |
| --- | --- | --- |
| GET | `/dsh-session-archive` | bảng cài đặt (tiếng Trung / English / cả hai) |
| GET | `/dsh-session-archive/api/health` | tình trạng + cấu hình hiện tại |
| GET | `/dsh-session-archive/api/state` | danh sách phiên đã lưu trữ |
| GET | `/dsh-session-archive/api/plan` | **chạy thử**: chiều và kế hoạch, không ghi |
| POST | `/dsh-session-archive/api/archive` | lưu trữ ngay (tuỳ chọn `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | khoá chiều (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | đọc/ghi cấu hình |
| GET | `/dsh-session-archive/api/selftest` | tự kiểm tra (ghi một lần vào thư mục tạm) |

Phân loại sai? Đừng sửa mã — hãy khoá bằng `POST /api/override`.

## Gỡ cài đặt

Bốn nơi, theo thứ tự:

```bash
# 1) xoá bản sao mã nguồn (bỏ qua nếu cài từ kho lưu trữ; chỉ cần xoá khỏi node_modules)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) xoá bản cài trong profile
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) xoá chỉ mục runtime (tuỳ chọn; chỉ mục lịch sử sẽ được dựng lại ở lần lưu trữ kế tiếp)
rm -rf ~/.dsh/storages/session-archive
```

4. Kiểm tra `~/.dsh/profiles/<profile-name>/package.json`: không còn `dsh-session-archive` trong `dependencies` lẫn `dsh.profile.bundles`.

**Đừng xoá** các thư mục phiên đã lưu trữ (`01-deliver/` v.v.) và **đừng xoá** `_trash/.backup-*.json` — đó là bằng chứng để khôi phục của bạn.

## Ghi chú thiết kế

Logic phân loại, ưu tiên định tuyến, quy tắc đặt tên, quét an toàn, dấu vết kiểm toán, bảo vệ chỉ đọc: [`docs/design.md`](docs/design.md).

## Giấy phép

MIT
