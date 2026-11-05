<div align="center">

[English](./README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · **Français** · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

# dsh-session-archive

### Archive de sessions — classe chaque fichier produit par une session DSH.

Classe automatiquement les fichiers produits par une session DSH par **dimension de sortie**, pour voir d'un coup d'œil ce qui compte, ce qui peut être supprimé et ce qui peut être publié sans risque.

Une session = un dossier. À l'intérieur, les répertoires sont créés à la demande (livrables / code source / outils / sorties / références / corbeille). **Aucun répertoire vide n'est jamais créé** ; seuls 4 fichiers peuvent rester à la racine du dossier.

- **Fini les `code-104-1-2.json`** — les blocs de code reçoivent des noms parlants (`cordis.patch.yml`, `buildName.js`) ; même nom et contenu différent → `.vN`
- **Aucune copie en double** — le sha256 est vérifié avant écriture ; un contenu identique part dans `_trash/duplicates/`
- **Rien de mélangé** — livrables, sources, scripts réutilisables, documentation de référence et déchets jetables vivent chacun dans leur rangement
- **Se tromper de suppression est sans danger** — le dossier `_trash/` entier se supprime sans impact ; `01-deliver/` est un export en lecture seule et la seule chose à `git push`

Objet : un plugin hôte DeepSeek Harness (DSH) exécuté dans le processus hôte DSH Node.

## Installation

### Depuis l'archive du Release (recommandé)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### Depuis le dépôt (tests et documentation inclus)

```bash
pnpm add github:jsunon/dsh-session-archive
```

Redémarrez l'hôte DSH, puis vérifiez :

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

Si `dirs` contient sept clés (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`), le nouveau code est actif.

### Développement local

Clonez, faites pointer un profil dessus avec `pnpm add <chemin local>` (ou une jonction depuis `~/.dsh/local-plugins/`), redémarrez l'hôte et lancez les six suites de tests avec `node tests/*.test.mjs`.

## À quoi ressemble l'arborescence

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← un dossier par session
   ├─ README.md                             ← index : type, ce qui peut être supprimé, vérifications avant publication
   ├─ MANIFEST.json                         ← piste d'audit : pourquoi chaque fichier est ici
   ├─ chat-log.md                           ← transcription complète
   ├─ session.json                          ← métadonnées (id de session, dimensions, compteurs)
   ├─ 01-deliver/                           ← export en lecture seule ; le seul dossier à git push
   ├─ 02-source/{original,patch,snapshot}/  ← la seule source de vérité inscriptible ; original/ est .READONLY
   ├─ 03-tools/                             ← scripts réutilisables
   ├─ 04-output/{long-lived,one-off}/       ← sorties qui ne sont pas du code
   ├─ 05-reference/                         ← matériel externe et conclusions
   └─ _trash/                               ← suppression intégrale, aucun impact
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← clés d'idempotence
      └─ .oplog.jsonl                       ← journal des opérations
```

**Ce qui peut être supprimé** : ouvrez le `README.md` de la session — il contient un tableau « suppression sans risque » ; dans `MANIFEST.json`, chaque fichier porte un indicateur `deletable`. **Publication possible ?** : ce même `README.md` comporte une section « vérifications avant publication » ; toute détection de secret ou de clé privée est marquée `blocked`.

## Migrer les sessions existantes

Le premier archivage range automatiquement l'ancienne structure. Avec beaucoup d'historique, lancez-le à la main — d'abord planifier, ensuite agir :

```bash
# 1) Simulation : calcule les dimensions et le plan de routage, ne touche à rien
node bin/plan.mjs "<workspace root>"
# 2) Essayez sur une session
node bin/migrate.mjs "<workspace root>" --apply --only "【nom d'une session】"
# 3) Puis tout le lot
node bin/migrate.mjs "<workspace root>" --apply
```

Avant `--apply`, il enregistre le chemin relatif, la taille et le sha256 de chaque fichier dans `_trash/.backup-<timestamp>.json` pour un retour arrière octet par octet ; toutes les actions vont dans `_trash/.oplog.jsonl`. La migration **ne touche qu'à l'intérieur des dossiers de session, jamais à la racine de l'espace de travail**.

## Configuration

Modifiez `config` dans `cordis.patch.yml`, ou utilisez le panneau de réglages (ce qu'il écrit est persisté dans `~/.dsh/storages/session-archive/config.json`, qui a priorité).

Options principales :

| Clé | Par défaut | Signification |
| --- | --- | --- |
| `enabled` | `true` | interrupteur principal |
| `structured` | `true` | arborescence classée ; désactivé = ancien format à plat |
| `writeManifest` | `true` | écrire `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | analyse de sécurité avant publication |
| `dedupeByHash` | `true` | déduplication par sha256 |
| `strictRoot` | `false` | n'autoriser que les 4 fichiers racine à la racine de session |
| `containerName` | `(vide)` | non vide = les dossiers de session sont imbriqués dessous |
| `dirs.*` | voir ci-dessous | sept noms de répertoire ; vide = rangement non créé |

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

Toutes les options : [`docs/config.md`](docs/config.md).

## API HTTP

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| GET | `/dsh-session-archive` | panneau de réglages (chinois / English / les deux) |
| GET | `/dsh-session-archive/api/health` | état + configuration actuelle |
| GET | `/dsh-session-archive/api/state` | liste des sessions archivées |
| GET | `/dsh-session-archive/api/plan` | **simulation** : dimensions et plan, aucune écriture |
| POST | `/dsh-session-archive/api/archive` | archiver maintenant (optionnel `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | figer les dimensions (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | lire/écrire la configuration |
| GET | `/dsh-session-archive/api/selftest` | auto-test (écrit une fois dans un dossier temporaire) |

Classement erroné ? Ne patchez pas le code — figez-le avec `POST /api/override`.

## Désinstallation

Quatre endroits, dans l'ordre :

```bash
# 1) supprimer la copie des sources (à sauter si installé depuis le dépôt ; retirez-le seulement de node_modules)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) supprimer l'installation du profil
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) supprimer l'index d'exécution (facultatif ; l'index d'historique est reconstruit au prochain archivage)
rm -rf ~/.dsh/storages/session-archive
```

4. Vérifiez `~/.dsh/profiles/<profile-name>/package.json` : plus aucun `dsh-session-archive` dans `dependencies` ni dans `dsh.profile.bundles`.

**Ne supprimez pas** les dossiers de session déjà archivés (`01-deliver/` etc.), et **ne supprimez pas** `_trash/.backup-*.json` — ce sont vos preuves de retour arrière.

## Notes de conception

Logique de classement, priorité de routage, règles de nommage, analyse de sécurité, piste d'audit, protection en lecture seule : [`docs/design.md`](docs/design.md).

## Licence

MIT
