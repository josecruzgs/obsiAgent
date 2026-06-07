// Curador del grafo (Fase 4, #4). Mejora la calidad del conocimiento:
//  - detecta NEAR-DUPLICADOS semánticos (notas casi iguales por embedding),
//  - enriquece ENLACES: conecta cada nota con sus vecinas muy similares.
// Determinista (sin LLM): rápido y barato. Dry-run por defecto; ?apply para
// escribir los enlaces. Registra actividad como "curador".
import { query } from "./db";
import { readNote, writeNote } from "./vault";
import { indexNote } from "./indexer";
import { scopeSubdir, type Scope } from "./scope";
import { recordStart, recordEnd } from "./agent/activity";

// Distancia coseno (0 = idéntico). Umbrales conservadores.
const DUP_MAX_DIST = 0.05; // casi idénticas → candidatas a duplicado
const LINK_MAX_DIST = 0.2; // suficientemente relacionadas → enlazar

interface PairRow {
  a_id: string;
  a_title: string | null;
  b_id: string;
  b_title: string | null;
  dist: number;
}

export interface CuratorResult {
  apply: boolean;
  near_duplicados: { a: string; b: string; similitud: number }[];
  enlaces_sugeridos: number;
  enlaces_aplicados: number;
}

const W = "company_id = $1 and owner_user_id is not distinct from $2";

/** Pares de notas casi idénticas (posibles duplicados a revisar). */
async function nearDuplicates(scope: Scope, limit = 40): Promise<PairRow[]> {
  return query<PairRow>(
    `select a.id as a_id, a.title as a_title, b.id as b_id, b.title as b_title,
            (a.embedding <=> b.embedding) as dist
       from notes a
       join notes b
         on a.id < b.id
        and b.company_id = $1 and b.owner_user_id is not distinct from $2
        and b.embedding is not null
      where a.${W} and a.embedding is not null
        and (a.embedding <=> b.embedding) < $3
      order by dist asc
      limit $4`,
    [scope.companyId, scope.userId, DUP_MAX_DIST, limit]
  );
}

/** Para una nota, sus vecinas más cercanas (excluye sí misma y duplicados exactos). */
async function neighbors(
  scope: Scope,
  id: string,
  k = 4
): Promise<{ id: string; title: string | null; dist: number }[]> {
  return query<{ id: string; title: string | null; dist: number }>(
    `select n.id, n.title, (n.embedding <=> (select embedding from notes where id = $3)) as dist
       from notes n
      where n.${W} and n.embedding is not null and n.id <> $3
      order by dist asc
      limit $4`,
    [scope.companyId, scope.userId, id, k]
  ).then((rows) => rows.filter((r) => r.dist > DUP_MAX_DIST && r.dist < LINK_MAX_DIST));
}

export async function curateGraph(
  scope: Scope,
  opts: { apply?: boolean; maxNotes?: number } = {}
): Promise<CuratorResult> {
  recordStart("curador");
  try {
    const apply = Boolean(opts.apply);
    const subdir = scopeSubdir(scope);

    const dups = await nearDuplicates(scope);
    const near_duplicados = dups.map((p) => ({
      a: p.a_title ?? p.a_id,
      b: p.b_title ?? p.b_id,
      similitud: Number((1 - p.dist).toFixed(3)),
    }));

    // Enriquecer enlaces: por cada nota, asegurar [[vecina]] si falta.
    const notes = await query<{ id: string; title: string | null }>(
      `select id, title from notes where ${W} and embedding is not null
       order by updated_at desc nulls last limit $3`,
      [scope.companyId, scope.userId, opts.maxNotes ?? 150]
    );

    let sugeridos = 0;
    let aplicados = 0;
    for (const n of notes) {
      const vecinas = await neighbors(scope, n.id);
      const titulos = vecinas.map((v) => v.title).filter((t): t is string => Boolean(t));
      if (titulos.length === 0) continue;
      sugeridos += titulos.length;
      if (!apply) continue;

      const note = await readNote(n.id, subdir);
      if (!note) continue;
      // writeNote dedupe wikilinks: solo agrega los que falten.
      const written = await writeNote({
        id: n.id,
        subdir,
        frontmatter: note.frontmatter,
        body: note.body,
        links: titulos,
      });
      // Cuenta cuántos enlaces nuevos quedaron (aprox: los que no estaban).
      aplicados += titulos.filter((t) => !note.body.includes(`[[${t}]]`)).length;
      await indexNote(written, scope).catch(() => {});
    }

    return {
      apply,
      near_duplicados,
      enlaces_sugeridos: sugeridos,
      enlaces_aplicados: aplicados,
    };
  } finally {
    recordEnd("curador", []);
  }
}
