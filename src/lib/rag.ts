// Retrieval-Augmented Generation: recupera notas por similitud y responde con Claude.
import { query, toVectorLiteral } from "./db";
import { embedQuery } from "./embeddings";
import { answerWithContext } from "./claude";
import { readNote, MOC_ID } from "./vault";
import type { RagAnswer, RetrievedNote } from "./types";

interface RetrieveRow {
  id: string;
  title: string | null;
  summary: string | null;
  content: string | null;
  distance: number;
}

/** Recupera las K notas más similares a la consulta (coseno, pgvector). */
export async function retrieve(
  queryText: string,
  k = 5
): Promise<RetrievedNote[]> {
  const vec = await embedQuery(queryText);
  const rows = await query<RetrieveRow>(
    `select id, title, summary, content,
            embedding <=> $1 as distance
     from notes
     where embedding is not null
     order by embedding <=> $1
     limit $2`,
    [toVectorLiteral(vec), k]
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    content: r.content,
    score: 1 - Number(r.distance),
  }));
}

/** Recupera contexto (top-K + índice general) y genera una respuesta citada. */
export async function answer(queryText: string, k = 5): Promise<RagAnswer> {
  const [notes, moc] = await Promise.all([
    retrieve(queryText, k),
    readNote(MOC_ID).catch(() => null), // índice general (panorama del vault)
  ]);
  const text = await answerWithContext(queryText, notes, moc?.body);
  return {
    answer: text,
    sources: notes.map((n) => ({ id: n.id, title: n.title })),
  };
}
