// Sincroniza una nota del vault hacia la DB (metadatos + embedding + enlaces).
// La fuente de verdad es el .md; esto mantiene el índice consultable al día.
import { query, toVectorLiteral } from "./db";
import { embedDocument } from "./embeddings";
import { parseWikilinks } from "./vault";
import type { VaultNote } from "./types";

/** Upsert de una nota en la DB, recalculando embedding y enlaces. */
export async function indexNote(note: VaultNote): Promise<void> {
  const title = note.frontmatter.title ?? note.id;
  const summary = note.frontmatter.summary ?? null;
  const tags = Array.isArray(note.frontmatter.tags)
    ? note.frontmatter.tags
    : [];

  const textForEmbedding = `${title}\n\n${summary ?? ""}\n\n${note.body}`;
  const embedding = await embedDocument(textForEmbedding);

  await query(
    `insert into notes (id, path, title, summary, tags, content, embedding, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, now())
     on conflict (id) do update set
       path = excluded.path,
       title = excluded.title,
       summary = excluded.summary,
       tags = excluded.tags,
       content = excluded.content,
       embedding = excluded.embedding,
       updated_at = now()`,
    [
      note.id,
      note.path,
      title,
      summary,
      tags,
      note.body,
      toVectorLiteral(embedding),
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
