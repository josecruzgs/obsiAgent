// Sincroniza las transcripciones de Teams de UNA conexión hacia su ámbito:
//  - conexión empresarial -> base empresarial
//  - conexión personal     -> base personal del usuario
// Usa app-only por-tenant (tenant_id + ms_user_id capturados al conectar).
// Idempotente por external_id ("teams:<transcriptId>").
import {
  getConnection,
  scopeOfConnection,
  type OneDriveConnection,
} from "./connections";
import {
  getAppToken,
  getAllTranscripts,
  getTranscriptContent,
} from "./onedrive";
import { parseVtt } from "./extract";
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

const extId = (transcriptId: string) => `teams:${transcriptId}`;

const EMPTY: TeamsSyncResult = {
  encontrados: 0,
  procesados: 0,
  fallidos: 0,
  detalle: { procesados: [], errores: [] },
};

/** ¿La conexión puede traer Teams? (cuenta de trabajo con tenant + user id). */
export function teamsEligible(conn: OneDriveConnection | null): boolean {
  return Boolean(conn?.refresh_token && conn?.tenant_id && conn?.ms_user_id);
}

/** Sincroniza una conexión concreta hacia su ámbito. */
export async function runTeamsSyncForConnection(
  conn: OneDriveConnection
): Promise<TeamsSyncResult> {
  if (!conn.tenant_id || !conn.ms_user_id) {
    throw new Error(
      "Esta conexión no es de una cuenta de trabajo (Teams no disponible). Reconéctala con tu cuenta M365."
    );
  }

  const scope = scopeOfConnection(conn);
  const appToken = await getAppToken(conn.tenant_id);
  const transcripts = await getAllTranscripts(appToken, conn.ms_user_id);

  const seen = new Set(
    (
      await query<{ external_id: string }>(
        `select external_id from notes where external_id is not null`
      )
    ).map((r) => r.external_id)
  );
  const nuevos = transcripts.filter((t) => !seen.has(extId(t.id)));
  if (nuevos.length === 0) {
    return { ...EMPTY, encontrados: transcripts.length };
  }

  const ctx = await loadIngestContext(scope);
  const procesados: TeamsSyncResult["detalle"]["procesados"] = [];
  const errores: TeamsSyncResult["detalle"]["errores"] = [];

  for (const t of nuevos) {
    try {
      const vtt = await getTranscriptContent(appToken, conn.ms_user_id, t.meetingId, t.id);
      const text = parseVtt(vtt);
      if (!text) throw new Error("Transcripción vacía tras procesarla");

      const meta: string[] = [];
      if (t.createdDateTime) meta.push(`Fecha: ${t.createdDateTime}`);
      if (t.organizer) meta.push(`Organizador: ${t.organizer}`);
      const body = meta.length ? `${meta.join("\n")}\n\n---\n\n${text}` : text;

      const fecha = t.createdDateTime ? t.createdDateTime.slice(0, 10) : "";
      const r = await ingestText(body, `Reunión de Teams ${fecha}`.trim(), ctx, {
        source: "teams",
        tipo: "transcripcion",
      });

      await query(`update notes set external_id = $1 where id = $2`, [
        extId(t.id),
        r.id,
      ]).catch((e) => console.error("[teams] external_id:", e));

      procesados.push({ id: r.id, titulo: r.title });
    } catch (err) {
      errores.push({
        transcript: t.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await rebuildMoc(scope).catch((e) => console.error("[teams] rebuildMoc:", e));

  return {
    encontrados: transcripts.length,
    procesados: procesados.length,
    fallidos: errores.length,
    detalle: { procesados, errores },
  };
}

/** Sincroniza el Teams de un ámbito (para la UI). */
export async function runTeamsSyncForScope(scope: Scope): Promise<TeamsSyncResult> {
  const conn = await getConnection(scope);
  if (!conn?.refresh_token) {
    throw new Error("OneDrive no está conectado en este ámbito.");
  }
  return runTeamsSyncForConnection(conn);
}
