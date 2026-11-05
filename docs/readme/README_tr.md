<div align="center">

[English](../README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · **Türkçe** · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

# dsh-session-archive

### Oturum arşivi — bir DSH oturumunun ürettiği her dosyayı yerli yerine koyar.

Bir DSH oturumunun ürettiği dosyaları **çıktı boyutuna** göre otomatik olarak sınıflandırır; böylece neyin önemli olduğunu, neyin sililebileceğini ve neyin güvenle açık kaynağa aktarılabileceğini bir bakışta görürsün.

Bir oturum = bir klasör. İçinde dizinler ihtiyaç halinde oluşturulur (çıktılar / kaynak / araçlar / ürünler / referanslar / çöp). **Boş dizinler asla oluşturulmaz**; klasör kökünde en fazla 4 dosya durabilir.

- **Artık `code-104-1-2.json` yok** — kod blokları anlamlı adlar alır (`cordis.patch.yml`, `buildName.js`); aynı ad ve farklı içerik → `.vN`
- **Kopya çoğaltma yok** — yazmadan önce sha256 kontrol edilir; aynı içerik `_trash/duplicates/` altına gider
- **Hiçbir şey karışmaz** — çıktılar, kaynak, yeniden kullanılabilir betikler, referans malzemesi ve tek kullanımlık çöp kendi bölmelerinde durur
- **Yanlış silmek güvenli** — `_trash/` klasörünün tamamı hiçbir etki bırakmadan silinebilir; `01-deliver/` salt okunur bir dışa aktarımdır ve `git push` yapman gereken tek klasördür

Amaç: DSH Node ana süreci içinde çalışan bir DeepSeek Harness (DSH) ana makine eklentisi.

## Kurulum

### Release tarball'ından (önerilir)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### Doğrudan depodan (testler ve belgeler dahil)

```bash
pnpm add github:jsunon/dsh-session-archive
```

DSH ana makinesini yeniden başlat, sonra doğrula:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

Yanıttaki `dirs` yedi anahtar içeriyorsa (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`), yeni kod devrede.

### Yerel geliştirme

Klonla, bir profili `pnpm add <yerel yol>` ile ona yönlendir (veya `~/.dsh/local-plugins/` altından bir bağlantı), ana makineyi yeniden başlat ve altı test takımını `node tests/*.test.mjs` ile çalıştır.

## Dizin yapısı nasıl görünür

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← oturum başına bir klasör
   ├─ README.md                             ← dizin: tür, sililebilecekler, yayın öncesi kontroller
   ├─ MANIFEST.json                         ← denetim izi: her dosya neden burada
   ├─ chat-log.md                           ← tam döküm
   ├─ session.json                          ← üst veri (oturum kimliği, boyutlar, sayımlar)
   ├─ 01-deliver/                           ← salt okunur dışa aktarım; git push yapılacak tek klasör
   ├─ 02-source/{original,patch,snapshot}/  ← yazılabilir tek doğruluk kaynağı; original/ .READONLY
   ├─ 03-tools/                             ← yeniden kullanılabilir betikler
   ├─ 04-output/{long-lived,one-off}/       ← kod dışı ürünler
   ├─ 05-reference/                         ← dış malzeme ve sonuçlar
   └─ _trash/                               ← tamamen sil, etkisi sıfır
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← idempotans anahtarları
      └─ .oplog.jsonl                       ← işlem günlüğü
```

**Neler silinebilir**: oturumun `README.md` dosyasını aç — içinde "güvenle sililebilir" tablosu var; `MANIFEST.json` içinde her dosyada `deletable` bayrağı bulunur. **Açık kaynağa aktarılabilir mi**: aynı `README.md` içinde "yayın öncesi kontroller" bölümü var; gizli anahtar veya özel anahtar bulunursa `blocked` olarak işaretlenir.

## Var olan oturumları taşıma

İlk arşivleme eski düzeni otomatik toparlar. Geçmiş çoksa elle çalıştır — önce plan, sonra eylem:

```bash
# 1) Deneme: boyutları ve yönlendirme planını hesaplar, hiçbir şeye dokunmaz
node bin/plan.mjs "<workspace root>"
# 2) Tek oturumla dene
node bin/migrate.mjs "<workspace root>" --apply --only "【bir oturum adı】"
# 3) Sonra tüm toplu işlem
node bin/migrate.mjs "<workspace root>" --apply
```

`--apply` öncesinde her dosyanın göreli yolunu, boyutunu ve sha256'sını `_trash/.backup-<timestamp>.json` içine kaydeder; bayt düzeyinde geri alma mümkündür. Tüm işlemler `_trash/.oplog.jsonl` dosyasına yazılır. Taşıma **yalnızca oturum klasörleri içinde çalışır, çalışma alanı köküne asla dokunmaz**.

## Yapılandırma

`cordis.patch.yml` içindeki `config` bölümünü düzenle veya ayarlar panelini kullan (panelin yazdıkları `~/.dsh/storages/session-archive/config.json` içine kalıcı olarak yazılır ve önceliklidir).

Temel seçenekler:

| Anahtar | Varsayılan | Anlamı |
| --- | --- | --- |
| `enabled` | `true` | ana anahtar |
| `structured` | `true` | bölmeli düzen; kapatılırsa eski düz düzene döner |
| `writeManifest` | `true` | `README.md` + `MANIFEST.json` yaz |
| `safetyScan` | `true` | yayın öncesi güvenlik taraması |
| `dedupeByHash` | `true` | sha256 ile tekilleştirme |
| `strictRoot` | `false` | oturum kökünde yalnızca 4 kök dosyaya izin ver |
| `containerName` | `(boş)` | boş değilse oturum klasörleri bunun altında iç içe geçer |
| `dirs.*` | aşağıya bak | yedi dizin adı; boş = o bölme oluşturulmaz |

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

Tüm seçenekler: [`docs/config.md`](../config.md).

## HTTP API

| Yöntem | Yol | Amaç |
| --- | --- | --- |
| GET | `/dsh-session-archive` | ayarlar paneli (Çince / English / ikisi) |
| GET | `/dsh-session-archive/api/health` | sağlık + geçerli yapılandırma |
| GET | `/dsh-session-archive/api/state` | arşivlenmiş oturum listesi |
| GET | `/dsh-session-archive/api/plan` | **deneme**: boyutlar ve plan, yazma yok |
| POST | `/dsh-session-archive/api/archive` | şimdi arşivle (isteğe bağlı `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | boyutları kilitle (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | yapılandırmayı oku/yaz |
| GET | `/dsh-session-archive/api/selftest` | kendi kendine test (geçici bir dizine bir kez yazar) |

Sınıflandırma yanlış mı? Kodu değiştirme — `POST /api/override` ile kilitle.

## Kaldırma

Dört yer, sırayla:

```bash
# 1) kaynak kopyasını sil (depodan kurduysan atla; node_modules içinden çıkarman yeterli)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) profildeki kurulumu kaldır
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) çalışma zamanı dizinini sil (isteğe bağlı; geçmiş dizini bir sonraki arşivlemede yeniden kurulur)
rm -rf ~/.dsh/storages/session-archive
```

4. `~/.dsh/profiles/<profile-name>/package.json` dosyasını kontrol et: `dependencies` ve `dsh.profile.bundles` içinde `dsh-session-archive` kalmamalı.

Arşivlenmiş oturum klasörlerini (`01-deliver/` vb.) **silmeyin**; `_trash/.backup-*.json` dosyalarını da **silmeyin** — bunlar geri alma kanıtların.

## Tasarım notları

Sınıflandırma mantığı, yönlendirme önceliği, adlandırma kuralları, güvenlik taraması, denetim izi, salt okunur koruma: [`docs/design.md`](../design.md).

## Lisans

MIT
