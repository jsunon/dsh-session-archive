<div align="center">

[English](./README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · **Ελληνικά** · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

# dsh-session-archive

### Αρχείο συνεδριών — ταξινομεί κάθε αρχείο που παράγει μια συνεδρία DSH.

Ταξινομεί αυτόματα τα αρχεία που παράγει μια συνεδρία DSH με βάση τη **διάσταση του αποτελέσματος**, ώστε με μια ματιά να ξέρεις τι έχει σημασία, τι μπορεί να διαγραφεί και τι μπορεί να δημοσιευτεί με ασφάλεια.

Μία συνεδρία = ένας φάκελος. Μέσα του οι κατάλογοι δημιουργούνται κατά απαίτηση (παραδοτέα / πηγαίος κώδικας / εργαλεία / έξοδοι / αναφορές / σκουπίδια). **Κατάλογοι χωρίς περιεχόμενο δεν δημιουργούνται ποτέ**· στη ρίζα του φακέλου επιτρέπονται το πολύ 4 αρχεία.

- **Τέλος τα `code-104-1-2.json`** — τα τμήματα κώδικα παίρνουν ονόματα με νόημα (`cordis.patch.yml`, `buildName.js`)· ίδιο όνομα με διαφορετικό περιεχόμενο → `.vN`
- **Καμία διπλότυπη αντιγραφή** — το sha256 ελέγχεται πριν από την εγγραφή· πανομοιότυπο περιεχόμενο πηγαίνει στο `_trash/duplicates/`
- **Τίποτα δεν αναμιγνύεται** — παραδοτέα, πηγαίος κώδικας, επαναχρησιμοποιήσιμα σενάρια, υλικό αναφοράς και σκουπίδια μίας χρήσης μένουν ο καθένας στο δικό του τμήμα
- **Η λάθος διαγραφή είναι ασφαλής** — ολόκληρος ο φάκελος `_trash/` διαγράφεται χωρίς καμία επίπτωση· το `01-deliver/` είναι εξαγωγή μόνο για ανάγνωση και το μόνο που αξίζει `git push`

Σκοπός: ένα πρόσθετο υποδοχής DeepSeek Harness (DSH) που τρέχει μέσα στη διεργασία υποδοχής DSH Node.

## Εγκατάσταση

### Από το πακέτο του Release (συνιστάται)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### Απευθείας από το αποθετήριο (περιλαμβάνει δοκιμές και τεκμηρίωση)

```bash
pnpm add github:jsunon/dsh-session-archive
```

Επανεκκίνησε τον υποδοχέα DSH και επαλήθευσε:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

Αν το `dirs` έχει επτά κλειδιά (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`), ο νέος κώδικας είναι ενεργός.

### Τοπική ανάπτυξη

Κάνε κλώνο, στρέψε ένα προφίλ προς αυτό με `pnpm add <τοπική διαδρομή>` (ή μια ένωση από το `~/.dsh/local-plugins/`), επανεκκίνησε τον υποδοχέα και τρέξε τις έξι σουίτες δοκιμών με `node tests/*.test.mjs`.

## Πώς είναι η δομή

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← ένας φάκελος ανά συνεδρία
   ├─ README.md                             ← ευρετήριο: τύπος, τι διαγράφεται, έλεγχοι πριν τη δημοσίευση
   ├─ MANIFEST.json                         ← ίχνος ελέγχου: γιατί βρίσκεται εδώ κάθε αρχείο
   ├─ chat-log.md                           ← πλήρες αντίγραφο συνομιλίας
   ├─ session.json                          ← μεταδεδομένα (id συνεδρίας, διαστάσεις, πλήθη)
   ├─ 01-deliver/                           ← εξαγωγή μόνο για ανάγνωση· ο μόνος φάκελος για git push
   ├─ 02-source/{original,patch,snapshot}/  ← η μόνη εγγράψιμη πηγή αλήθειας· το original/ είναι .READONLY
   ├─ 03-tools/                             ← επαναχρησιμοποιήσιμα σενάρια
   ├─ 04-output/{long-lived,one-off}/       ← έξοδοι που δεν είναι κώδικας
   ├─ 05-reference/                         ← εξωτερικό υλικό και συμπεράσματα
   └─ _trash/                               ← ολική διαγραφή, μηδενική επίπτωση
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← κλειδιά ταυτοδυναμίας
      └─ .oplog.jsonl                       ← ημερολόγιο ενεργειών
```

**Τι διαγράφεται**: άνοιξε το `README.md` της συνεδρίας — έχει πίνακα «ασφαλής διαγραφή»· στο `MANIFEST.json` κάθε αρχείο φέρει σημαία `deletable`. **Μπορεί να δημοσιευτεί**: το ίδιο `README.md` έχει ενότητα «έλεγχοι πριν τη δημοσίευση»· οποιαδήποτε ανίχνευση μυστικών ή ιδιωτικών κλειδιών σημαίνεται ως `blocked`.

## Μετεγκατάσταση υπαρχουσών συνεδριών

Η πρώτη αρχειοθέτηση τακτοποιεί αυτόματα την παλιά δομή. Με μεγάλο ιστορικό, τρέξε χειροκίνητα — πρώτα σχέδιο, μετά δράση:

```bash
# 1) Δοκιμαστική εκτέλεση: υπολογίζει διαστάσεις και το σχέδιο δρομολόγησης, δεν αλλάζει τίποτα
node bin/plan.mjs "<workspace root>"
# 2) Δοκίμασε σε μία συνεδρία
node bin/migrate.mjs "<workspace root>" --apply --only "【όνομα μιας συνεδρίας】"
# 3) Μετά ολόκληρη η παρτίδα
node bin/migrate.mjs "<workspace root>" --apply
```

Πριν το `--apply` καταγράφει τη σχετική διαδρομή, το μέγεθος και το sha256 κάθε αρχείου στο `_trash/.backup-<timestamp>.json` για επαναφορά ακριβώς κατά byte· όλες οι ενέργειες πηγαίνουν στο `_trash/.oplog.jsonl`. Η μετεγκατάσταση **ενεργεί μόνο μέσα στους φακέλους συνεδριών και ποτέ στη ρίζα του χώρου εργασίας**.

## Ρυθμίσεις

Επεξεργάσου το `config` στο `cordis.patch.yml` ή χρησιμοποίησε τον πίνακα ρυθμίσεων (ό,τι γράφει ο πίνακας αποθηκεύεται στο `~/.dsh/storages/session-archive/config.json` και έχει προτεραιότητα).

Βασικές επιλογές:

| Κλειδί | Προεπιλογή | Σημασία |
| --- | --- | --- |
| `enabled` | `true` | γενικός διακόπτης |
| `structured` | `true` | δομή με καταλόγους· αν κλείσει επιστρέφει στην παλιά επίπεδη διάταξη |
| `writeManifest` | `true` | εγγραφή `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | σάρωση ασφαλείας πριν τη δημοσίευση |
| `dedupeByHash` | `true` | αφαίρεση διπλοτύπων με sha256 |
| `strictRoot` | `false` | μόνο τα 4 αρχεία ρίζας στη ρίζα της συνεδρίας |
| `containerName` | `(κενό)` | μη κενό = οι φάκελοι συνεδριών φωλιάζουν κάτω από αυτό |
| `dirs.*` | δες πιο κάτω | επτά ονόματα καταλόγων· κενό = το τμήμα δεν δημιουργείται |

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

Όλες οι επιλογές: [`docs/config.md`](docs/config.md).

## HTTP API

| Μέθοδος | Διαδρομή | Σκοπός |
| --- | --- | --- |
| GET | `/dsh-session-archive` | πίνακας ρυθμίσεων (κινεζικά / English / και τα δύο) |
| GET | `/dsh-session-archive/api/health` | υγεία + τρέχουσα ρύθμιση |
| GET | `/dsh-session-archive/api/state` | λίστα αρχειοθετημένων συνεδριών |
| GET | `/dsh-session-archive/api/plan` | **δοκιμαστική εκτέλεση**: διαστάσεις και σχέδιο, χωρίς εγγραφή |
| POST | `/dsh-session-archive/api/archive` | αρχειοθέτηση τώρα (προαιρετικά `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | κλείδωμα διαστάσεων (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | ανάγνωση/εγγραφή ρυθμίσεων |
| GET | `/dsh-session-archive/api/selftest` | αυτοέλεγχος (γράφει μία φορά σε προσωρινό κατάλογο) |

Λάθος ταξινόμηση; Μην πειράξεις τον κώδικα — κλείδωσέ την με `POST /api/override`.

## Απεγκατάσταση

Τέσσερα σημεία, με σειρά:

```bash
# 1) αφαίρεσε το αντίγραφο πηγών (παράλειψέ το αν εγκατέστησες από το αποθετήριο· απλώς βγάλ' το από το node_modules)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) αφαίρεσε την εγκατάσταση στο προφίλ
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) αφαίρεσε το ευρετήριο χρόνου εκτέλεσης (προαιρετικά· το ευρετήριο ιστορικού ξαναχτίζεται στην επόμενη αρχειοθέτηση)
rm -rf ~/.dsh/storages/session-archive
```

4. Έλεγξε το `~/.dsh/profiles/<profile-name>/package.json`: δεν πρέπει να έχει μείνει `dsh-session-archive` ούτε στο `dependencies` ούτε στο `dsh.profile.bundles`.

**Μην διαγράψεις** τους ήδη αρχειοθετημένους φακέλους συνεδριών (`01-deliver/` κ.λπ.) και **μην διαγράψεις** τα `_trash/.backup-*.json` — είναι τα αποδεικτικά επαναφοράς σου.

## Σημειώσεις σχεδίασης

Λογική ταξινόμησης, προτεραιότητα δρομολόγησης, κανόνες ονομασίας, σάρωση ασφαλείας, ίχνος ελέγχου, προστασία μόνο για ανάγνωση: [`docs/design.md`](docs/design.md).

## Άδεια

MIT
