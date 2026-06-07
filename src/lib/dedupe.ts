// Limpieza de notas duplicadas (mismo título, sin external_id) creadas por el
// bucle del pipeline rclone+bulk-import. Conserva la MÁS ANTIGUA de cada título
// y borra el resto (archivo .md + fila en DB). A la sobreviviente le pone
// external_id "file:<archivo>" (del frontmatter `source`) para que los syncs
// futuros la dedupliquen. Lo usan el script (scripts/dedupe-notes.ts) y el
// endpoint temporal /api/admin/dedupe.
import path from "node:path";
import { query } from "./db";
import { readNote, deleteNote } from "./vault";
import { companyScope, personalScope, scopeSubdir } from "./scope";

interface Row {
  id: string;
  title: string | null;
  created_at: string;
  company_id: string | null;
  owner_user_id: string | null;
}

export interface DedupeResult {
  apply: boolean;
  total_sin_extid: number;
  unicas: number;
  grupos_con_duplicados: number;
  a_borrar: number;
  borradas: number;
  selladas: number;
  ejemplos: { title: string | null; copias: number; conserva: string }[];
}

export async function dedupeNullExternalIdNotes(apply: boolean): Promise<DedupeResult> {
  const rows = await query<Row>(
    `select id, title, created_at, company_id, owner_user_id
       from notes
      where external_id is null
      order by owner_user_id nulls first, title, created_at asc`
  );

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.owner_user_id ?? "-"}::${r.title ?? r.id}`;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }

  const subdirOf = (r: Row): string =>
    scopeSubdir(
      r.owner_user_id
        ? personalScope(r.company_id!, r.owner_user_id)
        : companyScope(r.company_id!)
    );

  const survivors: Row[] = [];
  const dups: Row[] = [];
  const ejemplos: DedupeResult["ejemplos"] = [];
  let gruposConDup = 0;

  for (const [, items] of groups) {
    survivors.push(items[0]); // la más antigua
    if (items.length > 1) {
      gruposConDup++;
      dups.push(...items.slice(1));
      if (ejemplos.length < 20) {
        ejemplos.push({ title: items[0].title, copias: items.length, conserva: items[0].id });
      }
    }
  }

  const base: DedupeResult = {
    apply,
    total_sin_extid: rows.length,
    unicas: groups.size,
    grupos_con_duplicados: gruposConDup,
    a_borrar: dups.length,
    borradas: 0,
    selladas: 0,
    ejemplos,
  };

  if (!apply) return base;

  // Borrar duplicados (.md + fila; links se borran por cascade).
  let borradas = 0;
  for (const dup of dups) {
    await deleteNote(dup.id, subdirOf(dup));
    await query(`delete from notes where id = $1`, [dup.id]);
    borradas++;
  }

  // Sellar sobrevivientes con external_id (file:<archivo>) según su `source`.
  let selladas = 0;
  for (const s of survivors) {
    const note = await readNote(s.id, subdirOf(s));
    const source = note?.frontmatter?.source;
    if (typeof source === "string" && source) {
      await query(`update notes set external_id = $1 where id = $2`, [
        `file:${path.basename(source)}`,
        s.id,
      ]).catch(() => {});
      selladas++;
    }
  }

  return { ...base, borradas, selladas };
}
