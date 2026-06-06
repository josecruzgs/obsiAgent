// Lógica compartida de ingesta: digerir un texto con Claude, escribir el .md en
// el vault e indexarlo (embedding + enlaces). La usan tanto la importación desde
// OneDrive como cualquier otro flujo que ya tenga el texto extraído.
import { digestDocument } from "./claude";
import {
  listNoteTitles,
  listNoteIds,
  slugify,
  writeNote,
  readNote,
} from "./vault";
import { indexNote } from "./indexer";
import type { NoteFrontmatter } from "./types";

export interface IngestContext {
  titles: string[]; // títulos existentes (para sugerir enlaces y enlazar a recién creados)
  takenIds: Set<string>; // ids ya usados (para evitar colisiones de nombre)
}

/** Carga el contexto (títulos + ids) una vez antes de procesar un lote. */
export async function loadIngestContext(): Promise<IngestContext> {
  const titles = await listNoteTitles();
  const takenIds = new Set(await listNoteIds());
  return { titles, takenIds };
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
 * Digiere un texto ya extraído y lo guarda como nota (vault + DB).
 * Muta `ctx` para que un lote pueda enlazar a notas creadas en la misma corrida.
 */
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

  const note = await readNote(id);
  if (note) await indexNote(note);

  ctx.titles.push(digest.title);
  return {
    id,
    title: digest.title,
    summary: digest.summary,
    tags: digest.tags,
    links: digest.suggestedLinks,
  };
}
