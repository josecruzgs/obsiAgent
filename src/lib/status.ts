// Orquestador del status por cliente/proyecto (Fase 3, #2). Mantiene una nota
// de ESTADO viva por cliente, idempotente por external_id "status:<slug>"
// (se reconstruye en cada corrida, actualizando la existente).
import { query } from "./db";
import { readNote, deleteNote, slugify } from "./vault";
import { scopeSubdir, type Scope } from "./scope";
import { loadIngestContext, ingestText } from "./ingest";
import { runStatusAgent } from "./agents/statusAgent";
import { rebuildMoc } from "./moc";

const extIdFor = (cliente: string) => `status:${slugify(cliente).toLowerCase()}`;

export interface StatusItemResult {
  cliente: string;
  id?: string;
  titulo?: string;
  actualizada?: boolean;
  omitida?: boolean;
  error?: string;
}

/** Reconstruye (crea o actualiza) la nota de estado de un cliente/proyecto. */
export async function rebuildClientStatus(
  cliente: string,
  scope: Scope
): Promise<StatusItemResult> {
  const extId = extIdFor(cliente);
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

  const body = await runStatusAgent(cliente, prev, scope);
  if (!body || body.length < 20) return { cliente, omitida: true };

  // Borra la anterior y recrea (idempotente por external_id).
  if (existing) {
    await deleteNote(existing.id, subdir);
    await query(`delete from notes where id = $1`, [existing.id]);
  }

  const ctx = await loadIngestContext(scope);
  const r = await ingestText(body, `Estado — ${cliente}`, ctx, {
    source: "status",
    tipo: "estado",
  });
  await query(`update notes set external_id = $1 where id = $2`, [extId, r.id]).catch(
    (e) => console.error("[status] external_id:", e)
  );

  return { cliente, id: r.id, titulo: r.title, actualizada: Boolean(existing) };
}

/** Descubre clientes/proyectos por título (heurística): notas de cliente/proyecto,
 *  excluyendo reuniones de Teams y las propias notas de estado. */
export async function discoverClients(scope: Scope): Promise<string[]> {
  const rows = await query<{ title: string | null }>(
    `select title from notes
      where company_id = $1 and owner_user_id is not distinct from $2
        and (title ilike '%cliente%' or title ilike '%proyecto%')
        and (external_id is null or (external_id not like 'teams:rec:%'
                                 and external_id not like 'status:%'))
      order by title`,
    [scope.companyId, scope.userId]
  );
  const names = new Set<string>();
  for (const r of rows) if (r.title) names.add(r.title.trim());
  return [...names];
}

/** Reconstruye el status de una lista de clientes (o los descubiertos). */
export async function rebuildAllStatus(
  scope: Scope,
  clients?: string[]
): Promise<{ total: number; resultados: StatusItemResult[] }> {
  const list = clients && clients.length ? clients : await discoverClients(scope);
  const resultados: StatusItemResult[] = [];
  for (const c of list) {
    try {
      resultados.push(await rebuildClientStatus(c, scope));
    } catch (e) {
      resultados.push({ cliente: c, error: e instanceof Error ? e.message : String(e) });
    }
  }
  await rebuildMoc(scope).catch((e) => console.error("[status] rebuildMoc:", e));
  return { total: list.length, resultados };
}
