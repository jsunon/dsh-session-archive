<div align="center">

[English](../README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · **Português (Brasil)** · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

# dsh-session-archive

### Arquivo de sessões — organiza cada arquivo que uma sessão DSH produz.

Classifica automaticamente os arquivos gerados por uma sessão DSH pela **dimensão de saída**, para você ver num relance o que importa, o que pode ser apagado e o que pode ser publicado sem risco.

Uma sessão = uma pasta. Dentro dela, os diretórios são criados sob demanda (entregáveis / código / ferramentas / saídas / referências / lixo). **Diretórios vazios nunca são criados**; na raiz da pasta só podem ficar 4 arquivos.

- **Chega de `code-104-1-2.json`** — os blocos de código ganham nomes com sentido (`cordis.patch.yml`, `buildName.js`); mesmo nome e conteúdo diferente → `.vN`
- **Sem cópias duplicadas** — o sha256 é verificado antes de gravar; conteúdo idêntico vai para `_trash/duplicates/`
- **Nada misturado** — entregáveis, código, scripts reutilizáveis, material de referência e lixo de uso único ficam cada um na sua pasta
- **Apagar errado é seguro** — a pasta `_trash/` inteira pode ser apagada sem impacto; `01-deliver/` é uma exportação somente leitura e a única coisa que você deve `git push`

Objetivo: um plugin host do DeepSeek Harness (DSH) rodando dentro do processo host do DSH Node.

## Instalação

### Pelo tarball do Release (recomendado)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### Direto do repositório (inclui testes e documentação)

```bash
pnpm add github:jsunon/dsh-session-archive
```

Reinicie o host DSH e verifique:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

Se `dirs` tiver sete chaves (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`), o novo código está ativo.

### Desenvolvimento local

Clone, aponte um perfil para ele com `pnpm add <caminho local>` (ou uma junção em `~/.dsh/local-plugins/`), reinicie o host e rode as seis suítes de teste com `node tests/*.test.mjs`.

## Como é a estrutura

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← uma pasta por sessão
   ├─ README.md                             ← índice: tipo, o que pode ser apagado, checagens antes de publicar
   ├─ MANIFEST.json                         ← trilha de auditoria: por que cada arquivo está aqui
   ├─ chat-log.md                           ← transcrição completa
   ├─ session.json                          ← metadados (id da sessão, dimensões, contagens)
   ├─ 01-deliver/                           ← exportação somente leitura; a única pasta para git push
   ├─ 02-source/{original,patch,snapshot}/  ← a única fonte de verdade gravável; original/ é .READONLY
   ├─ 03-tools/                             ← scripts reutilizáveis
   ├─ 04-output/{long-lived,one-off}/       ← saídas que não são código
   ├─ 05-reference/                         ← material externo e conclusões
   └─ _trash/                               ← apague inteira, sem impacto
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← chaves de idempotência
      └─ .oplog.jsonl                       ← log de operações
```

**O que pode ser apagado**: abra o `README.md` da sessão — ele traz uma tabela de "pode apagar sem risco"; no `MANIFEST.json` cada arquivo tem a flag `deletable`. **Dá para publicar?**: o mesmo `README.md` tem uma seção de "checagens antes de publicar"; qualquer ocorrência de segredo ou chave privada é marcada como `blocked`.

## Migrar sessões existentes

O primeiro arquivamento reorganiza automaticamente o layout antigo. Com muito histórico, rode manualmente — primeiro planeje, depois execute:

```bash
# 1) Simulação: calcula dimensões e o plano de roteamento, não altera nada
node bin/plan.mjs "<workspace root>"
# 2) Teste com uma sessão
node bin/migrate.mjs "<workspace root>" --apply --only "【nome de uma sessão】"
# 3) Depois o lote inteiro
node bin/migrate.mjs "<workspace root>" --apply
```

Antes do `--apply` ele grava o caminho relativo, o tamanho e o sha256 de cada arquivo em `_trash/.backup-<timestamp>.json` para rollback byte a byte; todas as ações vão para `_trash/.oplog.jsonl`. A migração **só mexe dentro das pastas de sessão e nunca toca na raiz do workspace**.

## Configuração

Edite `config` em `cordis.patch.yml` ou use o painel de configurações (o que o painel grava persiste em `~/.dsh/storages/session-archive/config.json`, que tem prioridade).

Opções principais:

| Chave | Padrão | Significado |
| --- | --- | --- |
| `enabled` | `true` | chave geral |
| `structured` | `true` | layout com subpastas; desligado volta ao formato plano antigo |
| `writeManifest` | `true` | gravar `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | varredura de segurança antes de publicar |
| `dedupeByHash` | `true` | deduplicação por sha256 |
| `strictRoot` | `false` | permitir apenas os 4 arquivos raiz na raiz da sessão |
| `containerName` | `(vazio)` | se não vazio, as pastas de sessão ficam aninhadas abaixo |
| `dirs.*` | ver abaixo | sete nomes de diretório; vazio = pasta não é criada |

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

Todas as opções: [`docs/config.md`](../config.md).

## API HTTP

| Método | Caminho | Finalidade |
| --- | --- | --- |
| GET | `/dsh-session-archive` | painel de configurações (chinês / English / ambos) |
| GET | `/dsh-session-archive/api/health` | saúde + configuração atual |
| GET | `/dsh-session-archive/api/state` | lista de sessões arquivadas |
| GET | `/dsh-session-archive/api/plan` | **simulação**: dimensões e plano, sem gravação |
| POST | `/dsh-session-archive/api/archive` | arquivar agora (opcional `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | fixar dimensões (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | ler/gravar configuração |
| GET | `/dsh-session-archive/api/selftest` | autoteste (grava uma vez num diretório temporário) |

Classificação errada? Não altere o código — fixe com `POST /api/override`.

## Desinstalação

Quatro lugares, em ordem:

```bash
# 1) remover a cópia do código-fonte (pule se instalou pelo repositório; basta tirar de node_modules)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) remover a instalação no perfil
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) remover o índice de execução (opcional; o índice de histórico é reconstruído no próximo arquivamento)
rm -rf ~/.dsh/storages/session-archive
```

4. Confira `~/.dsh/profiles/<profile-name>/package.json`: não deve sobrar `dsh-session-archive` em `dependencies` nem em `dsh.profile.bundles`.

**Não apague** as pastas de sessão já arquivadas (`01-deliver/` etc.) e **não apague** `_trash/.backup-*.json` — são suas garantias de rollback.

## Notas de design

Lógica de classificação, prioridade de roteamento, regras de nomes, varredura de segurança, trilha de auditoria, proteção somente leitura: [`docs/design.md`](../design.md).

## Licença

MIT
