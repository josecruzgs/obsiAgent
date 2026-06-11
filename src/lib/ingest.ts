// Lógica compartida de ingesta: digerir un texto con Claude, escribir el .md en
// el vault (en el ámbito dado) e indexarlo (embedding + enlaces + scope). La usan
// la importación desde OneDrive y los flujos de subida/pegado.
import { createHash } from "node:crypto";
import { digestDocument } from "./claude";
import { listNoteTitles, slugify, writeNote, readNote } from "./vault";
import { indexNote } from "./indexer";
import { embedDocument } from "./embeddings";
import { appendLog } from "./log";
import { query, toVectorLiteral } from "./db";
import { scopeSubdir, type Scope } from "./scope";
import type { DigestResult, NoteFrontmatter } from "./types";

// Vault pequeño (≤ este número de notas en el ámbito): mandamos la lista COMPLETA
// de títulos a la digestión, como bloque cacheable y estable entre ingestas.
const FULL_LIST_MAX = 150;
// Vault grande: en vez de todos los títulos, solo los K vecinos más cercanos del
// documento (recuperados por embedding). Menos tokens y mejores sugerencias.
const LINK_CANDIDATE_LIMIT = 30;
// Notas muy cortas: no vale la pena gastar una llamada a Claude para resumirlas;
// derivamos los metadatos por heurística (título del hint/primera línea, resumen
// del propio texto). Sin sugerencias de enlace en este caso.
const HEURISTIC_MAX_CHARS = 280;
// Dedup global por contenido (notas sin id forzado): solo para texto no trivial,
// para no colapsar muchas notas cortas que casualmente compartan texto.
const MIN_DEDUP_CHARS = 200;

/** Hash estable del contenido, para saltar re-ingestas idénticas. */
function contentHash(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

/** Metadatos por heurística para notas muy cortas (sin llamar a Claude). */
function heuristicDigest(text: string, hint?: string): DigestResult {
  const firstLine =
    text.split(/\r?\n/).find((l) => l.trim() !== "")?.trim() ?? "";
  const title =
    (hint?.trim() || firstLine.replace(/^#+\s*/, "")).slice(0, 120) || "Nota";
  const summary = text.replace(/\s+/g, " ").trim().slice(0, 280);
  return { title, summary, tags: [], suggestedLinks: [] };
}

/** Títulos de las K notas del ámbito más cercanas al embedding dado. */
async function nearestTitles(
  embedding: number[],
  scope: Scope,
  limit: number
): Promise<string[]> {
  const rows = await query<{ title: string }>(
    `select title from notes
       where company_id = $2 and owner_user_id is not distinct from $3
         and embedding is not null and title is not null
       order by embedding <=> $1
       limit $4`,
    [toVectorLiteral(embedding), scope.companyId, scope.userId, limit]
  );
  return rows.map((r) => r.title);
}

export interface IngestContext {
  scope: Scope;
  subdir: string;
  titles: string[]; // títulos del MISMO ámbito (para enlazar dentro del ámbito)
  takenIds: Set<string>; // ids GLOBALES (la columna id es PK global) -> evita colisiones
}

/** Carga el contexto (títulos del ámbito + ids globales) antes de un lote. */
export async function loadIngestContext(scope: Scope): Promise<IngestContext> {
  const subdir = scopeSubdir(scope);
  const titles = await listNoteTitles(subdir);
  const rows = await query<{ id: string }>(`select id from notes`);
  const takenIds = new Set(rows.map((r) => r.id));
  return { scope, subdir, titles, takenIds };
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base || "nota";
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  taken.add(id);
  return id;
}

export interface IngestResult {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  links: string[];
}

/**
 * Digiere un texto ya extraído y lo guarda como nota (vault + DB) en el ámbito de
 * ctx. Si `existingId` se indica, ACTUALIZA esa nota en su lugar (mismo nodo,
 * mismos enlaces entrantes) en vez de crear una nueva: re-digiere, reescribe el
 * .md, re-embebe y reconstruye sus enlaces. Conserva la fecha `created`.
 */
export async function ingestText(
  text: string,
  hint: string | undefined,
  ctx: IngestContext,
  extraFrontmatter: Partial<NoteFrontmatter> = {},
  existingId?: string
): Promise<IngestResult> {
  const hash = contentHash(text);

  // (Ahorro #2) Re-ingesta sin cambios de contenido. Salta TODO: nada de Claude,
  // embedding ni reescritura. Es el caso más común al re-sincronizar una fuente.
  if (existingId) {
    const [row] = await query<{
      content_hash: string | null;
      title: string | null;
      summary: string | null;
      tags: string[] | null;
    }>(`select content_hash, title, summary, tags from notes where id = $1`, [
      existingId,
    ]);
    if (row?.content_hash && row.content_hash === hash) {
      return {
        id: existingId,
        title: row.title ?? existingId,
        summary: row.summary ?? "",
        tags: row.tags ?? [],
        links: [],
      };
    }
  } else if (text.trim().length >= MIN_DEDUP_CHARS) {
    // (Ahorro #2) Contenido idéntico ya ingerido en el mismo ámbito (p. ej. el
    // mismo archivo subido de nuevo): reutiliza esa nota en vez de duplicarla.
    const [dup] = await query<{
      id: string;
      title: string | null;
      summary: string | null;
      tags: string[] | null;
    }>(
      `select id, title, summary, tags from notes
         where content_hash = $1 and company_id = $2
           and owner_user_id is not distinct from $3
         limit 1`,
      [hash, ctx.scope.companyId, ctx.scope.userId]
    );
    if (dup) {
      return {
        id: dup.id,
        title: dup.title ?? dup.id,
        summary: dup.summary ?? "",
        tags: dup.tags ?? [],
        links: [],
      };
    }
  }

  // Embedding una sola vez: sirve para elegir candidatos de enlace (#3) y se
  // reutiliza al indexar, evitando un segundo embedding por documento.
  const embedding = await embedDocument(text);

  // (Ahorro #6) Notas muy cortas -> metadatos por heurística (sin Claude).
  // (Ahorro #3/#4) El resto -> Claude, con lista completa cacheable si el vault
  // es pequeño, o solo los vecinos más cercanos si es grande.
  let digest: DigestResult;
  if (text.trim().length <= HEURISTIC_MAX_CHARS) {
    digest = heuristicDigest(text, hint);
  } else if (ctx.titles.length <= FULL_LIST_MAX) {
    digest = await digestDocument(text, ctx.titles, hint, { cacheTitles: true });
  } else {
    const candidates = await nearestTitles(embedding, ctx.scope, LINK_CANDIDATE_LIMIT);
    digest = await digestDocument(text, candidates, hint, { cacheTitles: false });
  }

  // Actualización en su lugar: reusa el id existente (preserva el nodo y sus
  // enlaces entrantes). Nueva: genera un id único a partir del título.
  const id = existingId ?? uniqueId(slugify(digest.title), ctx.takenIds);
  const prev = existingId ? await readNote(existingId, ctx.subdir) : null;
  const created =
    (prev?.frontmatter.created as string | undefined) ?? new Date().toISOString();

  await writeNote({
    id,
    subdir: ctx.subdir,
    frontmatter: {
      title: digest.title,
      summary: digest.summary,
      tags: digest.tags,
      created,
      ...(existingId ? { updated: new Date().toISOString() } : {}),
      ...extraFrontmatter,
    },
    body: text,
    links: digest.suggestedLinks,
  });

  const note = await readNote(id, ctx.subdir);
  if (note) await indexNote(note, ctx.scope, embedding);

  // (Ahorro #2) Sella el hash del contenido para saltar futuras ingestas idénticas.
  await query(`update notes set content_hash = $1 where id = $2`, [hash, id]).catch(
    (e) => console.error("[ingest] content_hash:", e)
  );

  // Bitácora (patrón log.md): registra la ingesta real. Best-effort (no rompe si
  // falla). Los saltos por hash/dedup retornan antes y NO se registran.
  await appendLog(ctx.scope, existingId ? "update" : "ingest", `${digest.title} — ${id}`);

  return {
    id,
    title: digest.title,
    summary: digest.summary,
    tags: digest.tags,
    links: digest.suggestedLinks,
  };
}
