// Sincroniza UNA conexión de OneDrive hacia su ámbito: lista la carpeta, descarga
// cada archivo, lo digiere (extrae texto -> Claude -> .md -> indexa en el scope) y
// mueve el original a procesados/ o fallidos/ dentro de OneDrive.
import {
  listFolderFiles,
  downloadFile,
  ensureFolder,
  moveItem,
} from "./onedrive";
import {
  getAccessToken,
  upsertConnection,
  scopeOfConnection,
  type OneDriveConnection,
} from "./connections";
import { extractTextFromBuffer } from "./extract";
import { loadIngestContext, ingestText } from "./ingest";
import { rebuildMoc } from "./moc";
import { query } from "./db";

// Misma clave de idempotencia que bulk-import (dedup por nombre de archivo).
const fileExtId = (name: string) => `file:${name}`;

export interface SyncResult {
  encontrados: number;
  procesados: number;
  fallidos: number;
  detalle: {
    procesados: { archivo: string; id: string; titulo: string }[];
    errores: { archivo: string; error: string }[];
  };
}

export async function runSync(conn: OneDriveConnection): Promise<SyncResult> {
  const scope = scopeOfConnection(conn);
  const token = await getAccessToken(scope);
  const files = await listFolderFiles(token, conn.folder);

  const empty: SyncResult = {
    encontrados: 0,
    procesados: 0,
    fallidos: 0,
    detalle: { procesados: [], errores: [] },
  };

  if (files.length === 0) {
    await upsertConnection(scope, {
      last_sync: { at: new Date().toISOString(), ok: 0, failed: 0 },
    });
    return empty;
  }

  const procDir = await ensureFolder(token, conn.folder, "procesados");
  const failDir = await ensureFolder(token, conn.folder, "fallidos");

  const seen = new Set(
    (
      await query<{ external_id: string }>(
        `select external_id from notes where external_id is not null`
      )
    ).map((r) => r.external_id)
  );

  const ctx = await loadIngestContext(scope);
  const procesados: SyncResult["detalle"]["procesados"] = [];
  const errores: SyncResult["detalle"]["errores"] = [];

  for (const f of files) {
    try {
      const extId = fileExtId(f.name);
      if (seen.has(extId)) {
        // Ya ingerido: solo apartar el original, sin re-procesar.
        await moveItem(token, f.id, procDir).catch(() => {});
        continue;
      }

      const buf = await downloadFile(token, f.id);
      const text = await extractTextFromBuffer(f.name, buf);
      if (!text) throw new Error("Texto vacío tras la extracción");

      const hint = f.name.replace(/\.[^.]+$/, "");
      const r = await ingestText(text, hint, ctx, {
        source: `onedrive:${conn.folder}/${f.name}`,
      });
      await query(`update notes set external_id = $1 where id = $2`, [extId, r.id]).catch(
        (e) => console.error("[onedrive] external_id:", e)
      );
      seen.add(extId);
      await moveItem(token, f.id, procDir);
      procesados.push({ archivo: f.name, id: r.id, titulo: r.title });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      errores.push({ archivo: f.name, error });
      await moveItem(token, f.id, failDir).catch(() => {});
    }
  }

  await rebuildMoc(scope).catch((e) => console.error("[onedrive] rebuildMoc:", e));

  await upsertConnection(scope, {
    last_sync: {
      at: new Date().toISOString(),
      ok: procesados.length,
      failed: errores.length,
    },
  });

  return {
    encontrados: files.length,
    procesados: procesados.length,
    fallidos: errores.length,
    detalle: { procesados, errores },
  };
}
