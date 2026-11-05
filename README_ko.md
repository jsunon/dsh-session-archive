<div align="center">

[English](./README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · **한국어** · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · [Español](./README_es.md) · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

# dsh-session-archive

### 세션 아카이브 — DSH 세션이 만들어 내는 모든 파일을 분류합니다.

DSH 세션이 생성한 파일을 **산출 차원** 기준으로 자동 분류하여, 무엇이 중요한 결과물이고, 무엇을 삭제할 수 있으며, 무엇을 안전하게 공개(오픈소스)할 수 있는지 한눈에 알 수 있습니다.

세션 하나 = 폴더 하나. 폴더 안에는 필요할 때 분류 디렉터리(산출물 / 소스 / 도구 / 출력 / 참고자료 / 휴지통)가 생성됩니다. **빈 디렉터리는 절대 만들지 않습니다.** 폴더 바로 아래에는 최대 4개의 파일만 둘 수 있습니다.

- **이제 `code-104-1-2.json`은 없습니다** — 코드 블록에는 의미 있는 이름이 붙습니다(`cordis.patch.yml`, `buildName.js`). 이름이 같고 내용이 다르면 → `.vN`
- **중복 사본을 만들지 않습니다** — 쓰기 전에 sha256을 검사하여, 내용이 같으면 `_trash/duplicates/`로 보냅니다
- **섞이지 않습니다** — 산출물, 소스, 재사용 가능한 스크립트, 참고자료, 일회성 임시 파일이 각자의 분류에 들어갑니다
- **잘못 삭제해도 안전합니다** — `_trash/` 폴더 전체를 지워도 영향이 없습니다. `01-deliver/`는 읽기 전용 내보내기 폴더이며, `git push` 해야 하는 유일한 폴더입니다

용도: DSH Node 호스트 프로세스 안에서 동작하는 DeepSeek Harness (DSH) 호스트 플러그인입니다.

## 설치

### Release tarball에서 설치(권장)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### 저장소에서 직접 설치(테스트와 문서 포함)

```bash
pnpm add github:jsunon/dsh-session-archive
```

DSH 호스트를 재시작한 뒤 확인합니다:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

응답의 `dirs`에 일곱 개의 키(`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`)가 있으면 새 코드가 적용된 것입니다.

### 로컬 개발

저장소를 클론한 뒤 `pnpm add <로컬 경로>`(또는 `~/.dsh/local-plugins/`에서 만든 정션)로 profile이 해당 경로를 가리키게 하고, 호스트를 재시작한 다음 `node tests/*.test.mjs`로 여섯 개의 테스트 스위트를 실행합니다.

## 디렉터리 구조

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← 세션당 폴더 하나
   ├─ README.md                             ← 인덱스: 유형, 삭제 가능 항목, 공개 검사 결과
   ├─ MANIFEST.json                         ← 감사 추적: 각 파일이 여기 있는 이유
   ├─ chat-log.md                           ← 전체 대화 기록
   ├─ session.json                          ← 메타데이터(세션 id, 차원, 개수)
   ├─ 01-deliver/                           ← 읽기 전용 내보내기. git push 할 유일한 폴더
   ├─ 02-source/{original,patch,snapshot}/  ← 쓰기가 가능한 유일한 사실 원본. original/ 은 .READONLY
   ├─ 03-tools/                             ← 재사용 가능한 스크립트
   ├─ 04-output/{long-lived,one-off}/       ← 코드가 아닌 산출물
   ├─ 05-reference/                         ← 외부 자료와 결론
   └─ _trash/                               ← 통째로 삭제해도 영향 없음
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← 멱등 키
      └─ .oplog.jsonl                       ← 작업 로그
```

**무엇을 삭제할 수 있나**: 세션의 `README.md`를 열면 "안전하게 삭제 가능" 표가 있습니다. `MANIFEST.json`에는 모든 파일에 `deletable` 플래그가 붙습니다. **공개(오픈소스) 가능 여부**: 같은 `README.md`에 "공개 검사" 절이 있으며, 비밀 정보나 개인 키가 발견되면 `blocked`로 표시됩니다.

## 기존 세션 마이그레이션

첫 아카이브 시 이전 구조를 자동으로 정리합니다. 이력이 많다면 수동으로 실행하세요 — 먼저 계획, 그다음 실행입니다:

```bash
# 1) 예행 실행: 차원과 라우팅 계획만 계산하고 아무것도 변경하지 않음
node bin/plan.mjs "<workspace root>"
# 2) 세션 하나로 먼저 시험
node bin/migrate.mjs "<workspace root>" --apply --only "【세션 이름 하나】"
# 3) 그다음 전체 실행
node bin/migrate.mjs "<workspace root>" --apply
```

`--apply` 전에 모든 파일의 상대 경로, 크기, sha256을 `_trash/.backup-<timestamp>.json`에 기록하여 바이트 단위로 되돌릴 수 있습니다. 모든 작업은 `_trash/.oplog.jsonl`에 남습니다. 마이그레이션은 **세션 폴더 내부만 건드리며, 워크스페이스 루트는 절대 손대지 않습니다**.

## 설정

`cordis.patch.yml`의 `config`를 수정하거나 설정 패널을 사용합니다(패널에서 저장한 값은 `~/.dsh/storages/session-archive/config.json`에 유지되며 우선 적용됩니다).

주요 옵션:

| 키 | 기본값 | 의미 |
| --- | --- | --- |
| `enabled` | `true` | 전체 스위치 |
| `structured` | `true` | 분류 디렉터리 구조. 끄면 이전의 평면 구조로 돌아감 |
| `writeManifest` | `true` | `README.md` + `MANIFEST.json` 작성 |
| `safetyScan` | `true` | 공개 안전성 검사 |
| `dedupeByHash` | `true` | sha256 중복 제거 |
| `strictRoot` | `false` | 세션 바로 아래에 4개의 루트 파일만 허용 |
| `containerName` | `(빈 값)` | 값이 있으면 세션 폴더를 그 아래로 묶음 |
| `dirs.*` | 아래 참조 | 일곱 개 디렉터리 이름. 빈 값이면 해당 분류를 만들지 않음 |

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

전체 옵션: [`docs/config.md`](docs/config.md).

## HTTP API

| 메서드 | 경로 | 용도 |
| --- | --- | --- |
| GET | `/dsh-session-archive` | 설정 패널(중국어 / English / 둘 다) |
| GET | `/dsh-session-archive/api/health` | 상태 확인 + 현재 설정 |
| GET | `/dsh-session-archive/api/state` | 아카이브된 세션 목록 |
| GET | `/dsh-session-archive/api/plan` | **예행 실행**: 차원과 계획, 쓰기 없음 |
| POST | `/dsh-session-archive/api/archive` | 즉시 아카이브(선택 `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | 차원 고정(`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | 설정 읽기/쓰기 |
| GET | `/dsh-session-archive/api/selftest` | 자기 진단(임시 디렉터리에 한 번 기록) |

분류가 잘못되었나요? 코드를 고치지 말고 `POST /api/override`로 고정하세요.

## 삭제(언인스톨)

네 군데를 순서대로:

```bash
# 1) 소스 사본 삭제(저장소에서 설치했다면 생략하고 node_modules에서만 제거)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) profile 내 설치 삭제
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) 런타임 인덱스 삭제(선택. 다음 아카이브 시 이력 인덱스가 재생성됨)
rm -rf ~/.dsh/storages/session-archive
```

4. `~/.dsh/profiles/<profile-name>/package.json`을 확인하여 `dependencies`와 `dsh.profile.bundles` 어디에도 `dsh-session-archive`가 남아 있지 않은지 봅니다.

이미 아카이브된 세션 폴더(`01-deliver/` 등)는 **삭제하지 마세요**. `_trash/.backup-*.json`도 **삭제하지 마세요** — 되돌리기에 필요한 증거입니다.

## 설계 노트

분류 로직, 라우팅 우선순위, 명명 규칙, 안전성 검사, 감사 추적, 읽기 전용 보호: [`docs/design.md`](docs/design.md).

## 라이선스

MIT
