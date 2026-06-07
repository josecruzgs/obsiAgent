// Trae las transcripciones de reuniones de Teams (Microsoft Graph) usando el token
// de la conexión EMPRESARIAL (cuenta M365) y las ingiere como notas empresariales.
// Idempotente por external_id ("teams:<transcriptId>"): no reingiere lo ya hecho.
import { getConnection } from "./connections";
import {
  getAppToken,
  resolveUserId,
  getAllTranscripts,
  getTranscriptContent,
} from "./onedrive";
import { parseVtt } from "./extract";
import { query } from "./db";
import { getBootstrapCompany } from "./tenancy";
import { companyScope } from "./scope";
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

export async function runTeamsSync(): Promise<TeamsSyncResult> {
  const company = await getBootstrapCompany();
  const scope = companyScope(company.id);

  // El organizador es la cuenta M365 con la que se conectó la base empresarial.
  const conn = await getConnection(scope);
  if (!conn?.account) {
    throw new Error(
      "Conecta la base empresarial con la cuenta M365 (de ahí sale el organizador)."
    );
  }

  // App-only: token de aplicación + GUID del organizador.
  const appToken = await getAppToken();
  const userId = await resolveUserId(appToken, conn.account);
  const transcripts = await getAllTranscripts(appToken, userId);

  // external_ids ya ingeridos -> para no duplicar.
  const seen = new Set(
    (
      await query<{ external_id: string }>(
        `select external_id from notes where external_id is not null`
      )
    ).map((r) => r.external_id)
  );
  const nuevos = transcripts.filter((t) => !seen.has(extId(t.id)));

  const procesados: TeamsSyncResult["detalle"]["procesados"] = [];
  const errores: TeamsSyncResult["detalle"]["errores"] = [];

  if (nuevos.length === 0) {
    return {
      encontrados: transcripts.length,
      procesados: 0,
      fallidos: 0,
      detalle: { procesados, errores },
    };
  }

  const ctx = await loadIngestContext(scope);

  for (const t of nuevos) {
    try {
      const vtt = await getTranscriptContent(appToken, userId, t.meetingId, t.id);
      const text = parseVtt(vtt);
      if (!text) throw new Error("Transcripción vacía tras procesarla");

      const meta: string[] = [];
      if (t.createdDateTime) meta.push(`Fecha: ${t.createdDateTime}`);
      if (t.organizer) meta.push(`Organizador: ${t.organizer}`);
      const body = meta.length ? `${meta.join("\n")}\n\n---\n\n${text}` : text;

      const fecha = t.createdDateTime ? t.createdDateTime.slice(0, 10) : "";
      const hint = `Reunión de Teams ${fecha}`.trim();
      const r = await ingestText(body, hint, ctx, {
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
