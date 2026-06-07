// Sincroniza las transcripciones de las reuniones de Teams hacia el ámbito de
// la conexión (empresarial -> base empresarial; personal -> base personal).
//
// Estrategia: las reuniones organizadas por terceros (otros tenants) NO se
// alcanzan con getAllTranscripts (es por-organizador y no cruza tenants), pero
// su grabación cae en el OneDrive de quien graba. Cada .mp4 lleva la
// transcripción embebida como "alternate content stream"; se lista la carpeta
// de grabaciones, se baja el transcript embebido (API REST de SharePoint, en
// streaming) y se ingiere. Idempotente por external_id ("teams:rec:<itemId>").
import {
  getConnection,
  scopeOfConnection,
  upsertConnection,
  type OneDriveConnection,
} from "./connections";
import {
  tokenForScope,
  listRecordings,
  hasAlternateContentStreams,
  getRecordingTranscript,
  type RecordingItem,
} from "./onedrive";
import { parseStreamTranscript } from "./extract";
import { runMeetingAgent } from "./agents/meetingAgent";
import { query } from "./db";
import { type Scope } from "./scope";
import { loadIngestContext, ingestText } from "./ingest";
import { rebuildMoc } from "./moc";

export interface TeamsSyncResult {
  encontrados: number;
  procesados: number;
  fallidos: number;
  detalle: {
    procesados: { id: string; titulo: string }[];
    errores: { transcript: string; error: string }[];
  };
}

// Carpetas donde Teams deja las grabaciones (nombre localizado del tenant).
const RECORDINGS_FOLDERS = ["Grabaciones", "Recordings"];

const extId = (driveItemId: string) => `teams:rec:${driveItemId}`;

const EMPTY: TeamsSyncResult = {
  encontrados: 0,
  procesados: 0,
  fallidos: 0,
  detalle: { procesados: [], errores: [] },
};

/** ¿La conexión puede traer Teams? (cuenta de trabajo: tenant + user id). */
export function teamsEligible(conn: OneDriveConnection | null): boolean {
  return Boolean(conn?.refresh_token && conn?.tenant_id && conn?.ms_user_id);
}

/** Deriva un título legible del nombre del archivo de grabación. */
function tituloDeGrabacion(name: string): string {
  let base = name.replace(/\.[^.]+$/, ""); // sin extensión
  // Quitar el timestamp "-YYYYMMDD_HHMMSS" y todo lo que le siga (sufijo de Teams).
  base = base.replace(/[-_]\d{8}[_-]\d{6}.*$/, "").trim();
  return base || "Reunión de Teams";
}

/** Lista todas las grabaciones del OneDrive de la conexión (probando carpetas). */
async function listAllRecordings(graphToken: string): Promise<RecordingItem[]> {
  const vistos = new Set<string>();
  const out: RecordingItem[] = [];
  for (const folder of RECORDINGS_FOLDERS) {
    const items = await listRecordings(graphToken, folder);
    for (const it of items) {
      if (!vistos.has(it.id)) {
        vistos.add(it.id);
        out.push(it);
      }
    }
  }
  return out;
}

export interface TeamsSyncOptions {
  /** Trae las N grabaciones más recientes ignorando el corte "solo nuevas"
   *  (para validar o rescatar reuniones concretas del backlog). */
  backfill?: number;
}

/** Sincroniza una conexión concreta hacia su ámbito. */
export async function runTeamsSyncForConnection(
  conn: OneDriveConnection,
  opts: TeamsSyncOptions = {}
): Promise<TeamsSyncResult> {
  if (!conn.refresh_token) {
    throw new Error("OneDrive no está conectado en esta conexión.");
  }

  const scope = scopeOfConnection(conn);

  // Token delegado de Graph (para listar) — sin redirect_uri.
  const graphToken = (
    await tokenForScope(conn.refresh_token, "https://graph.microsoft.com/.default")
  ).access_token;

  const recordings = await listAllRecordings(graphToken);
  if (recordings.length === 0) return EMPTY;

  // Tokens de SharePoint por host (normalmente uno solo).
  const spTokens = new Map<string, string>();
  const spTokenFor = async (host: string): Promise<string> => {
    const cached = spTokens.get(host);
    if (cached) return cached;
    const t = (await tokenForScope(conn.refresh_token!, `https://${host}/.default`))
      .access_token;
    spTokens.set(host, t);
    return t;
  };

  // Corte "solo nuevas": en la primera sincronización se fija la marca a AHORA
  // para no traer el backlog viejo. A partir de ahí solo entran grabaciones
  // creadas después de esa marca.
  let since = conn.teams_since ? new Date(conn.teams_since) : null;
  if (!since) {
    since = new Date();
    await upsertConnection(scope, { teams_since: since.toISOString() });
  }

  // Idempotencia: ids ya ingeridos.
  const seen = new Set(
    (
      await query<{ external_id: string }>(
        `select external_id from notes where external_id is not null`
      )
    ).map((r) => r.external_id)
  );
  const noVistas = recordings.filter((r) => !seen.has(extId(r.id)));
  const nuevos =
    opts.backfill && opts.backfill > 0
      ? // Backfill: las N más recientes sin importar el corte.
        [...noVistas]
          .sort((a, b) => (b.createdDateTime ?? "").localeCompare(a.createdDateTime ?? ""))
          .slice(0, opts.backfill)
      : // Normal: solo las creadas después del corte.
        noVistas.filter(
          (r) => r.createdDateTime && new Date(r.createdDateTime) > since!
        );
  if (nuevos.length === 0) return { ...EMPTY, encontrados: recordings.length };

  const ctx = await loadIngestContext(scope);
  const procesados: TeamsSyncResult["detalle"]["procesados"] = [];
  const errores: TeamsSyncResult["detalle"]["errores"] = [];

  for (const rec of nuevos) {
    try {
      const spToken = await spTokenFor(rec.host);

      // Chequeo barato: ¿hay transcripción embebida? Si no, saltar SIN marcar
      // visto (puede aparecer luego), pero sin descargar el video.
      const tieneAlt = await hasAlternateContentStreams(
        spToken,
        rec.siteUrl,
        rec.serverRelativeUrl
      );
      if (!tieneAlt) continue;

      const rawJson = await getRecordingTranscript(spToken, rec.siteUrl, rec.serverRelativeUrl);
      const text = rawJson ? parseStreamTranscript(rawJson) : "";
      if (!text) continue; // sin transcript usable (raro); se reintenta luego

      const fecha = rec.createdDateTime ? rec.createdDateTime.slice(0, 10) : "";
      const titulo = tituloDeGrabacion(rec.name);

      // Lo que se ingiere es un RESUMEN generado por un AGENTE (busca el
      // cliente/proyecto y enlaza), no la transcripción cruda.
      const resumen = await runMeetingAgent(text, fecha, titulo, scope);
      const encabezado = [
        fecha ? `**Fecha:** ${fecha}` : "",
        `**Origen:** Reunión de Teams — ${rec.name}`,
      ]
        .filter(Boolean)
        .join("\n");
      const body = `${encabezado}\n\n${resumen}`;

      const hint = fecha ? `${titulo} (${fecha})` : titulo;
      const r = await ingestText(body, hint, ctx, {
        source: "teams",
        tipo: "reunion",
        ...(rec.createdDateTime ? { created: rec.createdDateTime } : {}),
      });

      // Idempotencia: asociar el id de la grabación a la nota creada.
      await query(`update notes set external_id = $1 where id = $2`, [
        extId(rec.id),
        r.id,
      ]).catch((e) => console.error("[teams] external_id:", e));
      procesados.push({ id: r.id, titulo: r.title });
    } catch (err) {
      errores.push({
        transcript: rec.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await rebuildMoc(scope).catch((e) => console.error("[teams] rebuildMoc:", e));

  return {
    encontrados: recordings.length,
    procesados: procesados.length,
    fallidos: errores.length,
    detalle: { procesados, errores },
  };
}

/** Sincroniza el Teams de un ámbito (para la UI). */
export async function runTeamsSyncForScope(
  scope: Scope,
  opts: TeamsSyncOptions = {}
): Promise<TeamsSyncResult> {
  const conn = await getConnection(scope);
  if (!conn?.refresh_token) {
    throw new Error("OneDrive no está conectado en este ámbito.");
  }
  return runTeamsSyncForConnection(conn, opts);
}
