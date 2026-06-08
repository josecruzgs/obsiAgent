// Lógica compartida de ingesta: digerir un texto con Claude, escribir el .md en
// el vault (en el ámbito dado) e indexarlo (embedding + enlaces + scope). La usan
// la importación desde OneDrive y los flujos de subida/pegado.
import { digestDocument } from "./claude";
import { listNoteTitles, slugify, writeNote, readNote } from "./vault";
import { indexNote } from "./indexer";
import { query } from "./db";
import { scopeSubdir, type Scope } from "./scope";
import type { NoteFrontmatter } from "./types";

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
  const digest = await digestDocument(text, ctx.titles, hint);

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
  if (note) await indexNote(note, ctx.scope);

  if (!ctx.titles.includes(digest.title)) ctx.titles.push(digest.title);
  return {
    id,
    title: digest.title,
    summary: digest.summary,
    tags: digest.tags,
    links: digest.suggestedLinks,
  };
}
