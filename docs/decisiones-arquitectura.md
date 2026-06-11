# obsiAgent — Decisiones de arquitectura y rumbo

Documento vivo. Captura **por qué** obsiAgent está hecho así y **hacia dónde**
debería evolucionar. Complementa a [RECREAR-SISTEMA.md](RECREAR-SISTEMA.md) (el
cómo) explicando el porqué.

---

## 1. Principio rector: el vault `.md` es la fuente de verdad

Las notas Markdown del vault son el dato real; Postgres (pgvector) es solo un
**índice desechable** (metadatos + embeddings + grafo) que se reconstruye con
`reindex`. Consecuencias buenas:

- **Portabilidad / sin lock-in**: el conocimiento son archivos `.md` que se
  pueden abrir en el **Obsidian de escritorio** real (sincronizando la carpeta).
- **Escape hatch**: si la plataforma desaparece, el valor (las notas) persiste.
- La DB nunca es autoridad: si se corrompe, se regenera del vault.

Esta es la decisión más importante y hay que **protegerla**: cualquier feature
nuevo debe seguir escribiendo al vault como fuente de verdad.

---

## 2. Por qué esto y no "Obsidian de escritorio en un VPS"

Se consideró montar el Obsidian de escritorio en un VPS con escritorio remoto.
Se descartó porque obsiAgent **no es Obsidian** — es una **plataforma de
conocimiento con IA, multi-tenant y omnicanal** que *usa el formato de vault*.

| | Obsidian en VPS (remoto) | obsiAgent (web) |
|---|---|---|
| Usuarios | 1 a la vez, GUI laggy | Multi-usuario / multi-empresa |
| Ingesta | Manual, copiar/pegar | Automática (OneDrive/SharePoint/Teams/WhatsApp) |
| Acceso | Escritorio remoto | Web + WhatsApp + voz |
| Edición | Obsidian completo (mejor) | Editor web básico (peor) |
| Mantenimiento | Casi nulo | Código propio (la factura real) |

**Lo sacrificado**: la UX de edición madura, los plugins y las apps móviles de
Obsidian. **Mitigación**: como el vault es la fuente de verdad, el Obsidian real
sigue disponible para edición rica cuando se quiera. No es "o uno o el otro".

**Cuándo el escritorio remoto habría ganado**: si la meta fuera un **solo
usuario** tomando notas personales → Obsidian + un plugin (Copilot for
Obsidian / Smart Connections) daría el 80% del valor con casi cero código.

---

## 3. Modelo actual: RAG sobre notas-hoja

Hoy el pipeline (`src/lib/ingest.ts` → `digestDocument`):
1. Digiere cada documento en **UNA nota-hoja** (título/resumen/tags + sugiere
   enlaces a notas existentes).
2. La indexa (embedding Voyage + grafo de enlaces).
3. Las consultas hacen **RAG** sobre esas notas.

Es el modelo "retrieve-at-query-time": **cada fuente es una hoja**; el
conocimiento **no se acumula en páginas de síntesis**. Funciona, pero el LLM
re-descubre la síntesis en cada consulta.

---

## 4. El rumbo: de "RAG sobre hojas" a "wiki que compone"

Referencia: patrón *LLM Wiki* (A. Karpathy). La diferencia clave: cuando entra
una fuente nueva, el LLM no solo la archiva — **la integra en páginas
persistentes** (entidades, conceptos): actualiza resúmenes, marca
contradicciones, refuerza la síntesis. El conocimiento se **compila una vez y se
mantiene vivo**, no se re-deriva por consulta.

**Lo que YA tenemos que encaja con el patrón:**
- **`status.ts` (agente Status por cliente)**: mantiene **una nota viva por
  cliente, idempotente (`external_id status:<slug>`), reconstruida en cada
  corrida**. *Esto ya es una página de entidad que compone* — pero solo para
  "estado de cliente". El rumbo es **generalizar este patrón**.
- **`moc.ts` (`rebuildMoc`)**: ya es nuestro `index.md` (catálogo navegable).
- **`curator.ts`**: ya hace parte del *lint* (near-dupes + enriquecer enlaces).
- **`router.ts`**: ya clasifica notas por cliente (`tag cliente/<slug>`) → base
  para detectar a qué entidades pertenece una fuente.

**Lo que NO transfiere del patrón (no copiar de más):**
- El flujo "humano en el loop, una fuente a la vez, guiando el énfasis" es de un
  setup **personal con Claude Code + Obsidian al lado**. obsiAgent es
  **automatizado, multi-tenant, omnicanal**. Lo que transfiere es el **modelo de
  datos que compone**, no el workflow interactivo.
- "A escala media sáltate los embeddings, basta el index" → ya invertimos en
  pgvector; no se deshace. `rebuildMoc` cumple el rol de index *además* del RAG.

---

## 5. Roadmap priorizado (valor / esfuerzo)

| # | Mejora | Estado base | Valor |
|---|---|---|---|
| 1 | **Páginas de entidad/concepto vivas** (generalizar Status) | `status.ts` ya lo hace para clientes | ★★★ (el salto) |
| 2 | **`log.md`** cronológico append-only | No existe | ★★ rápido |
| 3 | **Guardar respuestas buenas como nota** | Respuestas se pierden en el chat | ★★ rápido |
| 4 | **Lint / health-check** del vault | `curator.ts` hace una parte | ★★ |
| 5 | **Contradicciones explícitas** | No existe | ★★ (parte de 1 y 4) |

---

## 6. Plan concreto — #1: páginas de entidad vivas

**Objetivo:** al ingerir una fuente, además de la nota-hoja, **crear o actualizar
páginas de entidad** (cliente, proyecto, persona, tema) que acumulan síntesis a
lo largo del tiempo, con enlaces a las fuentes que las respaldan.

### Modelo de datos
- Una **nota de entidad** por entidad, idempotente por
  `external_id = entity:<tipo>:<slug>` (mismo patrón que `status:<slug>`).
  Tipos iniciales: `cliente`, `proyecto`, `persona`, `tema`.
- Frontmatter: `tipo: entidad`, `entidad_tipo`, `fuentes: [ids]`, `updated`.
- Cuerpo: secciones estables (Resumen · Hechos clave · Cronología ·
  Contradicciones · Fuentes). El agente reescribe el cuerpo manteniendo las
  secciones.
- Respeta el **scope** (empresarial/personal) como el resto.

### Flujo de ingesta (extiende `ingestText` / un agente post-ingesta)
1. Digerir la fuente → nota-hoja (como hoy).
2. **Detectar entidades** de la fuente (reusar `router.ts`/`classifyNote` +
   heurística de títulos existentes). Limitar a top-N entidades para acotar costo.
3. Para cada entidad: cargar su página viva (si existe), pasar al agente
   `página actual + extracto de la fuente nueva` y pedir **el cuerpo
   actualizado** (integrar, no append ciego), marcando contradicciones.
4. Reescribir la página de entidad + reindexar. Añadir la fuente a `fuentes`.

### Idempotencia, costo y concurrencia
- **Idempotencia**: `external_id entity:<tipo>:<slug>` → siempre actualiza la
  misma nota (no duplica nodos). Igual que Status.
- **Costo**: cada fuente ahora puede tocar varias páginas → más llamadas a
  Claude. Mitigar: (a) limitar entidades por fuente, (b) usar Haiku para la
  fusión, (c) hacerlo en un **agente aparte por lotes** (no en el camino crítico
  de la subida), p. ej. un endpoint `/api/entities/rebuild` con cron — como ya se
  hace con Status/Curador/Router.
- **Concurrencia**: si dos ingestas tocan la misma entidad a la vez, hay riesgo
  de pisar la página. Empezar **batch/secuencial** (como el sync de OneDrive) y,
  si hace falta, un lock por `external_id`.

### Cómo encaja con lo existente
- Reusa: `runAgent` (runtime), `buildReadTools(scope)`, `loadIngestContext`,
  `ingestText`/`writeNote` con `existingId`, el patrón idempotente de `status.ts`.
- El **enrutador** ya produce la señal de "a qué cliente pertenece" → es el
  detector de entidad-cliente; se amplía a otros tipos.
- `rebuildMoc` lista las páginas de entidad junto al resto.

### Pasos de implementación (incrementales)
1. Empezar por **un solo tipo**: `proyecto` o `tema` (Status ya cubre `cliente`).
2. Agente `entityAgent` (fusión página+fuente → cuerpo actualizado, en Haiku).
3. `lib/entities.ts` (idempotencia `entity:<tipo>:<slug>`, scope, secciones).
4. Endpoint `/api/entities/rebuild` + `sync-entities.sh` + cron (fuera del
   camino crítico de subida).
5. Medir costo real con el estimador antes de subir el volumen.

### Quick wins paralelos
- **#2 `log.md`**: nota de sistema append-only `## [fecha] ingest|query|lint | …`
  (prefijo consistente → parseable con `grep`). Escribir en cada ingesta/agente.
- **#3 Guardar respuesta**: botón en buscador/WhatsApp "guardar como nota" →
  `ingestText` del texto de la respuesta (las exploraciones también componen).

---

## 7. Qué proteger al evolucionar
- El vault como **fuente de verdad** (todo escribe ahí).
- **Idempotencia por `external_id`** para no duplicar nodos.
- **Acotar costo**: trabajo pesado en agentes por lotes/cron, no en el camino de
  subida; Haiku donde la calidad lo permita.
- No deshacer pgvector ni el patrón multi-tenant por seguir el documento al pie
  de la letra: tomar el **modelo que compone**, no el workflow personal.
