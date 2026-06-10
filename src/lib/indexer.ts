// Sincroniza una nota del vault hacia la DB (metadatos + embedding + enlaces).
// La fuente de verdad es el .md; esto mantiene el índice consultable al día.
import { query, toVectorLiteral } from "./db";
import { embedDocument } from "./embeddings";
import { parseWikilinks } from "./vault";
import type { VaultNote } from "./types";
import type { Scope } from "./scope";

/**
 * Upsert de una nota en la DB (embedding + enlaces + ámbito).
 * `precomputedEmbedding` permite reutilizar un embedding ya calculado (p. ej. el
 * que la ingesta usa para elegir candidatos de enlace) y evitar un segundo
 * llamado a Voyage por documento.
 */
export async function indexNote(
  note: VaultNote,
  scope: Scope,
  precomputedEmbedding?: number[]
): Promise<void> {
  const title = note.frontmatter.title ?? note.id;
  const summary = note.frontmatter.summary ?? null;
  const tags = Array.isArray(note.frontmatter.tags)
    ? note.frontmatter.tags
    : [];

  const textForEmbedding = `${title}\n\n${summary ?? ""}\n\n${note.body}`;
  const embedding = precomputedEmbedding ?? (await embedDocument(textForEmbedding));

  await query(
    `insert into notes (id, path, title, summary, tags, content, embedding, company_id, owner_user_id, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     on conflict (id) do update set
       path = excluded.path,
       title = excluded.title,
       summary = excluded.summary,
       tags = excluded.tags,
       content = excluded.content,
       embedding = excluded.embedding,
       company_id = excluded.company_id,
       owner_user_id = excluded.owner_user_id,
       updated_at = now()`,
    [
      note.id,
      note.path,
      title,
      summary,
      tags,
      note.body,
      toVectorLiteral(embedding),
      scope.companyId,
      scope.userId,
    ]
  );

  // Reemplaza los enlaces de esta nota.
  const targets = parseWikilinks(note.body);
  await query(`delete from links where source = $1`, [note.id]);
  for (const target of targets) {
    await query(
      `insert into links (source, target) values ($1, $2)
       on conflict do nothing`,
      [note.id, target]
    );
  }
}
