// Retrieval-Augmented Generation: recupera notas (filtradas por el ámbito que el
// usuario puede ver: empresarial + su personal) y responde con Claude.
import { query, toVectorLiteral } from "./db";
import { embedQuery } from "./embeddings";
import { answerWithContext } from "./claude";
import { readNote } from "./vault";
import {
  readableNotesFilter,
  companyScope,
  personalScope,
  mocId,
  scopeSubdir,
} from "./scope";
import type { User } from "./tenancy";
import type { RagAnswer, RetrievedNote } from "./types";

interface RetrieveRow {
  id: string;
  title: string | null;
  summary: string | null;
  content: string | null;
  distance: number;
}

/** Recupera las K notas más similares que el usuario puede ver (coseno, pgvector). */
export async function retrieve(
  queryText: string,
  user: User,
  k = 5
): Promise<RetrievedNote[]> {
  const vec = await embedQuery(queryText);
  const f = readableNotesFilter(user, 2); // $1 = vector
  const rows = await query<RetrieveRow>(
    `select id, title, summary, content,
            embedding <=> $1 as distance
     from notes
     where embedding is not null and ${f.sql}
     order by embedding <=> $1
     limit $${2 + f.params.length}`,
    [toVectorLiteral(vec), ...f.params, k]
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    content: r.content,
    score: 1 - Number(r.distance),
  }));
}

/** Recupera contexto (top-K + índices empresarial y personal) y responde citando. */
export async function answer(
  queryText: string,
  user: User,
  k = 5
): Promise<RagAnswer> {
  const cScope = companyScope(user.company_id);
  const pScope = personalScope(user.company_id, user.id);
  const [notes, mocCompany, mocPersonal] = await Promise.all([
    retrieve(queryText, user, k),
    readNote(mocId(cScope), scopeSubdir(cScope)).catch(() => null),
    readNote(mocId(pScope), scopeSubdir(pScope)).catch(() => null),
  ]);

  const parts: string[] = [];
  if (mocCompany?.body) parts.push(`[Base EMPRESARIAL]\n${mocCompany.body}`);
  if (mocPersonal?.body) parts.push(`[Base PERSONAL]\n${mocPersonal.body}`);
  const overview = parts.join("\n\n") || undefined;

  const text = await answerWithContext(queryText, notes, overview);
  return {
    answer: text,
    sources: notes.map((n) => ({ id: n.id, title: n.title })),
  };
}
