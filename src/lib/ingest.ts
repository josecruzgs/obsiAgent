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

/** Digiere un texto ya extraído y lo guarda como nota (vault + DB) en el ámbito de ctx. */
export async function ingestText(
  text: string,
  hint: string | undefined,
  ctx: IngestContext,
  extraFrontmatter: Partial<NoteFrontmatter> = {}
): Promise<IngestResult> {
  const digest = await digestDocument(text, ctx.titles, hint);
  const id = uniqueId(slugify(digest.title), ctx.takenIds);

  await writeNote({
    id,
    subdir: ctx.subdir,
    frontmatter: {
      title: digest.title,
      summary: digest.summary,
      tags: digest.tags,
      created: new Date().toISOString(),
      ...extraFrontmatter,
    },
    body: text,
    links: digest.suggestedLinks,
  });

  const note = await readNote(id, ctx.subdir);
  if (note) await indexNote(note, ctx.scope);

  ctx.titles.push(digest.title);
  return {
    id,
    title: digest.title,
    summary: digest.summary,
    tags: digest.tags,
    links: digest.suggestedLinks,
  };
}
