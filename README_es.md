<div align="center">

[English](./README.md) · [简体中文](./README_zh.md) · [繁體中文](./README_zh-TW.md) · [日本語](./README_ja.md) · [한국어](./README_ko.md) · [Türkçe](./README_tr.md) · [Русский](./README_ru.md) · [Tiếng Việt](./README_vi.md) · [ไทย](./README_th.md) · [Deutsch](./README_de.md) · **Español** · [Français](./README_fr.md) · [Українська](./README_uk.md) · [Polski](./README_pl.md) · [Português (Brasil)](./README_pt-BR.md) · [العربية](./README_ar.md) · [فارسی](./README_fa.md) · [Bahasa Indonesia](./README_id.md) · [Italiano](./README_it.md) · [Ελληνικά](./README_el.md) · [മലയാളം](./README_ml.md) · [Roman Urdu](./README_ur-Latn.md) · [Română](./README_ro.md)

</div>

# dsh-session-archive

### Archivo de sesiones — clasifica cada archivo que genera una sesión DSH.

Clasifica automáticamente los archivos que genera una sesión DSH según la **dimensión del resultado**, para que veas de un vistazo qué importa, qué se puede borrar y qué se puede publicar sin riesgo.

Una sesión = una carpeta. Dentro, los directorios se crean a demanda (entregables / código / herramientas / salida / referencias / basura). **Los directorios vacíos nunca se crean**; en la raíz de la carpeta solo pueden quedar 4 archivos.

- **Se acabó el `code-104-1-2.json`** — los bloques de código reciben nombres con sentido (`cordis.patch.yml`, `buildName.js`); mismo nombre y contenido distinto → `.vN`
- **Sin copias duplicadas** — se comprueba el sha256 antes de escribir; el contenido idéntico acaba en `_trash/duplicates/`
- **Nada mezclado** — entregables, código, scripts reutilizables, material de referencia y basura de un solo uso viven cada uno en su carpeta
- **Borrar lo incorrecto es seguro** — la carpeta `_trash/` completa se puede eliminar sin ningún impacto; `01-deliver/` es una exportación de solo lectura y lo único que deberías `git push`

Objetivo: un plugin host de DeepSeek Harness (DSH) que se ejecuta dentro del proceso host de DSH Node.

## Instalación

### Desde el tarball del Release (recomendado)

```bash
cd ~/.dsh/profiles/<profile-name>
pnpm add https://github.com/jsunon/dsh-session-archive/releases/latest/download/dsh-session-archive.tgz
```

### Desde el repositorio (incluye pruebas y documentación)

```bash
pnpm add github:jsunon/dsh-session-archive
```

Reinicia el host DSH y verifica:

```bash
curl http://127.0.0.1:<port>/dsh-session-archive/api/health
```

Si `dirs` tiene siete claves (`chat` / `deliver` / `src` / `tools` / `output` / `ref` / `trash`), el nuevo código ya está activo.

### Desarrollo local

Clona el repositorio, apunta un perfil hacia él con `pnpm add <ruta local>` (o un enlace desde `~/.dsh/local-plugins/`), reinicia el host y ejecuta las seis suites de pruebas con `node tests/*.test.mjs`.

## Cómo se ve la estructura

```
<workspace root>/
└─ 【dev-session-archive-plugin】/          ← una carpeta por sesión
   ├─ README.md                             ← índice: tipo, qué se puede borrar, comprobaciones antes de publicar
   ├─ MANIFEST.json                         ← auditoría: por qué cada archivo está aquí
   ├─ chat-log.md                           ← transcripción completa
   ├─ session.json                          ← metadatos (id de sesión, dimensiones, recuentos)
   ├─ 01-deliver/                           ← exportación de solo lectura; la única carpeta para git push
   ├─ 02-source/{original,patch,snapshot}/  ← la única fuente de verdad escribible; original/ es .READONLY
   ├─ 03-tools/                             ← scripts reutilizables
   ├─ 04-output/{long-lived,one-off}/       ← resultados que no son código
   ├─ 05-reference/                         ← material externo y conclusiones
   └─ _trash/                               ← se elimina entera, sin impacto
      ├─ duplicates/  unsorted/  failed/  probes/
      ├─ rename-map.json
      ├─ .archive-state.json                ← claves de idempotencia
      └─ .oplog.jsonl                       ← registro de operaciones
```

**Qué se puede borrar**: abre el `README.md` de la sesión — tiene una tabla de "se puede borrar sin riesgo"; en `MANIFEST.json` cada archivo lleva una marca `deletable`. **¿Se puede publicar?**: ese mismo `README.md` incluye una sección de "comprobaciones antes de publicar"; cualquier coincidencia de secretos o claves privadas se marca como `blocked`.

## Migrar sesiones existentes

El primer archivado ordena automáticamente la estructura antigua. Si hay mucho historial, ejecútalo a mano — primero planificar, después actuar:

```bash
# 1) Simulación: calcula dimensiones y el plan de enrutamiento, no toca nada
node bin/plan.mjs "<workspace root>"
# 2) Prueba con una sesión
node bin/migrate.mjs "<workspace root>" --apply --only "【nombre de una sesión】"
# 3) Luego todo el lote
node bin/migrate.mjs "<workspace root>" --apply
```

Antes de `--apply` registra la ruta relativa, el tamaño y el sha256 de cada archivo en `_trash/.backup-<timestamp>.json` para poder revertir byte a byte; todas las acciones se registran en `_trash/.oplog.jsonl`. La migración **solo actúa dentro de las carpetas de sesión y nunca toca la raíz del espacio de trabajo**.

## Configuración

Edita `config` en `cordis.patch.yml` o usa el panel de ajustes (lo que guarda el panel persiste en `~/.dsh/storages/session-archive/config.json`, que tiene prioridad).

Opciones principales:

| Clave | Predeterminado | Significado |
| --- | --- | --- |
| `enabled` | `true` | interruptor maestro |
| `structured` | `true` | estructura con subcarpetas; desactivado vuelve al formato plano antiguo |
| `writeManifest` | `true` | escribir `README.md` + `MANIFEST.json` |
| `safetyScan` | `true` | escaneo de seguridad antes de publicar |
| `dedupeByHash` | `true` | deduplicación por sha256 |
| `strictRoot` | `false` | permitir solo los 4 archivos raíz en la raíz de la sesión |
| `containerName` | `(vacío)` | si no está vacío, las carpetas de sesión se anidan debajo |
| `dirs.*` | ver abajo | siete nombres de directorio; vacío = no se crea esa categoría |

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

Todas las opciones: [`docs/config.md`](docs/config.md).

## API HTTP

| Método | Ruta | Propósito |
| --- | --- | --- |
| GET | `/dsh-session-archive` | panel de ajustes (chino / English / ambos) |
| GET | `/dsh-session-archive/api/health` | estado + configuración actual |
| GET | `/dsh-session-archive/api/state` | lista de sesiones archivadas |
| GET | `/dsh-session-archive/api/plan` | **simulación**: dimensiones y plan, sin escrituras |
| POST | `/dsh-session-archive/api/archive` | archivar ahora (opcional `?sessionId=`) |
| POST | `/dsh-session-archive/api/override` | fijar dimensiones (`{sessionId, dimensions, locked, lifecycle}`) |
| GET/POST | `/dsh-session-archive/api/config` | leer/escribir configuración |
| GET | `/dsh-session-archive/api/selftest` | autodiagnóstico (escribe una vez en un directorio temporal) |

¿Clasificación incorrecta? No parchees el código — fíjala con `POST /api/override`.

## Desinstalación

Cuatro lugares, en orden:

```bash
# 1) eliminar la copia del código fuente (omite si lo instalaste desde el repositorio; basta quitarlo de node_modules)
rm -rf ~/.dsh/local-plugins/dsh-session-archive
# 2) eliminar la instalación del perfil
cd ~/.dsh/profiles/<profile-name>
pnpm remove dsh-session-archive
# 3) eliminar el índice de ejecución (opcional; el índice del historial se reconstruye en el siguiente archivado)
rm -rf ~/.dsh/storages/session-archive
```

4. Revisa `~/.dsh/profiles/<profile-name>/package.json`: no debe quedar `dsh-session-archive` ni en `dependencies` ni en `dsh.profile.bundles`.

**No borres** las carpetas de sesión ya archivadas (`01-deliver/` etc.) y **no borres** `_trash/.backup-*.json` — son tus credenciales de reversión.

## Notas de diseño

Lógica de clasificación, prioridad de enrutamiento, reglas de nombres, escaneo de seguridad, auditoría, protección de solo lectura: [`docs/design.md`](docs/design.md).

## Licencia

MIT
