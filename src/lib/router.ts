// Enrutador / clasificador (Fase 4, #6). Clasifica notas por cliente/proyecto
// y les pone un tag `cliente/<slug>` (+ tags sugeridos), para organizarlas y
// que el status/buscador filtren mejor. Procesa notas SIN clasificar todavía.
// Dry-run por defecto; ?apply para escribir. Registra actividad como "enrutador".
import { query } from "./db";
import { readNote, writeNote, slugify } from "./vault";
import { indexNote } from "./indexer";
import { scopeSubdir, type Scope } from "./scope";
import { classifyNote } from "./claude";
import { discoverClients } from "./status";
import { recordStart, recordEnd } from "./agent/activity";

const W = "company_id = $1 and owner_user_id is not distinct from $2";

export interface RouterItem {
  id: string;
  cliente: string | null;
  tags: string[];
  aplicado: boolean;
}

export interface RouterResult {
  apply: boolean;
  clientes_conocidos: string[];
  procesadas: number;
  detalle: RouterItem[];
}

/** Clasifica las notas que aún no tienen un tag `cliente/...`. */
export async function routeUnclassified(
  scope: Scope,
  opts: { apply?: boolean; limit?: number } = {}
): Promise<RouterResult> {
  recordStart("enrutador");
  try {
    const apply = Boolean(opts.apply);
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const subdir = scopeSubdir(scope);
    const clients = await discoverClients(scope);

    // Notas sin tag de cliente y que no son notas de sistema/estado.
    const rows = await query<{ id: string }>(
      `select id from notes
        where ${W}
          and (external_id is null or external_id not like 'status:%')
          and not exists (
            select 1 from unnest(coalesce(tags, '{}')) tg where tg like 'cliente/%'
          )
        order by updated_at desc nulls last
        limit $3`,
      [scope.companyId, scope.userId, limit]
    );

    const detalle: RouterItem[] = [];
    for (const r of rows) {
      const note = await readNote(r.id, subdir);
      if (!note) continue;
      const { cliente, tags } = await classifyNote(note.body, clients);

      let aplicado = false;
      if (apply && (cliente || tags.length)) {
        const prev = note.frontmatter.tags ?? [];
        const nuevos = new Set<string>(prev);
        if (cliente) nuevos.add(`cliente/${slugify(cliente).toLowerCase()}`);
        for (const t of tags) nuevos.add(t);
        const written = await writeNote({
          id: r.id,
          subdir,
          frontmatter: { ...note.frontmatter, tags: [...nuevos] },
          body: note.body,
          // Si hay cliente, enlaza a su nota.
          links: cliente ? [cliente] : [],
        });
        await indexNote(written, scope).catch(() => {});
        aplicado = true;
      }
      detalle.push({ id: r.id, cliente, tags, aplicado });
    }

    return { apply, clientes_conocidos: clients, procesadas: detalle.length, detalle };
  } finally {
    recordEnd("enrutador", []);
  }
}
