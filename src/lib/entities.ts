// Orquestador de PÁGINAS DE ENTIDAD/TEMA (patrón "wiki que compone" de Karpathy).
// Mantiene una página viva por entidad, idempotente por external_id
// "entity:<tipo>:<slug>" (se reconstruye en cada corrida, actualizando la misma
// nota). Espeja el patrón de lib/status.ts, pero produce SÍNTESIS de conocimiento
// (no estado/tareas). El tipo inicial soportado para AUTO-descubrimiento es
// "tema" (a partir de los tags que ya genera la digestión); cualquier tipo
// funciona pasando una lista explícita de nombres.
//
// Costo: cada entidad = 1 corrida del agente (Haiku) + 1 digestión (Haiku) +
// 1 embedding. El parámetro `limit` acota cuántas entidades por corrida para
// mantener el gasto predecible. Pensado para correr en LOTE/cron, no en el
// camino crítico de la subida.
import { query } from "./db";
import { readNote, deleteNote, slugify } from "./vault";
import { scopeSubdir, type Scope } from "./scope";
import { loadIngestContext, ingestText } from "./ingest";
import { runEntityAgent } from "./agents/entityAgent";
import { appendLog } from "./log";
import { rebuildMoc } from "./moc";

const extIdFor = (tipo: string, name: string) =>
  `entity:${tipo}:${slugify(name).toLowerCase()}`;

export interface EntityItemResult {
  nombre: string;
  id?: string;
  titulo?: string;
  actualizada?: boolean;
  omitida?: boolean;
  error?: string;
}

/** Reconstruye (crea o actualiza) la página viva de una entidad/tema. */
export async function rebuildEntity(
  tipo: string,
  name: string,
  scope: Scope
): Promise<EntityItemResult> {
  const extId = extIdFor(tipo, name);
  const subdir = scopeSubdir(scope);

  const existing = (
    await query<{ id: string }>(
      `select id from notes
        where external_id = $1 and company_id = $2 and owner_user_id is not distinct from $3`,
      [extId, scope.companyId, scope.userId]
    )
  )[0];

  let prev: string | null = null;
  if (existing) {
    const note = await readNote(existing.id, subdir);
    prev = note?.body ?? null;
  }

  const body = await runEntityAgent(name, tipo, prev, scope);
  if (!body || body.length < 20) return { nombre: name, omitida: true };

  // Borra la anterior y recrea (idempotente por external_id), igual que status.
  if (existing) {
    await deleteNote(existing.id, subdir);
    await query(`delete from notes where id = $1`, [existing.id]);
  }

  const tipoCap = `${tipo[0].toUpperCase()}${tipo.slice(1)}`;
  const ctx = await loadIngestContext(scope);
  const r = await ingestText(body, `${tipoCap} — ${name}`, ctx, {
    source: "entity",
    tipo,
  });
  await query(`update notes set external_id = $1 where id = $2`, [extId, r.id]).catch(
    (e) => console.error("[entities] external_id:", e)
  );

  return { nombre: name, id: r.id, titulo: r.title, actualizada: Boolean(existing) };
}

/** Descubre TEMAS a partir de los tags más frecuentes de las notas reales
 *  (excluye tags de cliente y las propias notas de sistema/estado/entidad). */
export async function discoverTemas(scope: Scope, limit = 5): Promise<string[]> {
  const rows = await query<{ tag: string }>(
    `select tag, count(*) as n
       from notes, unnest(coalesce(tags, '{}')) as tag
      where company_id = $1 and owner_user_id is not distinct from $2
        and (external_id is null or (external_id not like 'status:%'
                                 and external_id not like 'entity:%'
                                 and external_id not like 'teams:rec:%'))
        and tag not like 'cliente/%'
      group by tag
      having count(*) >= 2
      order by n desc
      limit $3`,
    [scope.companyId, scope.userId, limit]
  );
  return rows.map((r) => r.tag);
}

/** Reconstruye un lote de páginas de entidad de un tipo. Si no se pasan nombres
 *  y el tipo es "tema", se descubren los temas más frecuentes (hasta `limit`). */
export async function rebuildEntities(
  tipo: string,
  scope: Scope,
  opts: { names?: string[]; limit?: number } = {}
): Promise<{ tipo: string; total: number; resultados: EntityItemResult[] }> {
  const limit = opts.limit ?? 5;
  let list = opts.names && opts.names.length ? opts.names : [];
  if (list.length === 0 && tipo === "tema") list = await discoverTemas(scope, limit);
  list = list.slice(0, limit);

  const resultados: EntityItemResult[] = [];
  for (const name of list) {
    try {
      resultados.push(await rebuildEntity(tipo, name, scope));
    } catch (e) {
      resultados.push({
        nombre: name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await rebuildMoc(scope).catch((e) => console.error("[entities] rebuildMoc:", e));
  // Bitácora (patrón log.md): registra la pasada de mantenimiento. Costo cero.
  await appendLog(
    scope,
    "lint",
    `entidades ${tipo}: ${resultados.filter((r) => !r.error && !r.omitida).length}/${list.length} actualizadas`
  );

  return { tipo, total: list.length, resultados };
}
